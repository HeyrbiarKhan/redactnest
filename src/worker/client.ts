/**
 * The main thread's only way to reach the engine.
 *
 * Spec 0001 invariant: "The file is handed over by transferring its
 * `ArrayBuffer`, which neuters the main thread's copy rather than duplicating
 * it, so the main thread never holds document content."
 *
 * Spec 0002 shaped this around a session rather than a single call. One tab
 * holds at most one, the document stays open inside the worker across steps, and
 * the session ends by terminating the worker. Terminating is strictly stronger
 * than anything the worker could be asked to do, and it still works when the
 * worker is wedged and would never read a message. That is what makes the
 * release guarantee checkable rather than hopeful (INV-6).
 *
 * The two words are never interchangeable here (INV-8):
 *
 *  - `cancel` aborts one operation. The session stays open, the document stays
 *    parsed, and the visitor lands back where they were.
 *  - `release` ends the session and frees everything.
 *
 * Replacing a session is neither. A second document ends the first one in place,
 * inside the worker that is already loaded, because the engine is a multi
 * megabyte download and the warm one is the whole point of `warmEngine`. The
 * three release triggers stay what spec 0002 named them: start over, leaving the
 * page, and a worker that died.
 */

import { config } from "@/config";
import {
  EngineError,
  isEngineErrorKind,
  OperationCancelled,
  type DocumentSummary,
  type EngineLimits,
  type MatchId,
  type ProgressPhase,
  type RedactedMessage,
  type RedactionOutcome,
  type RequestMessage,
  type ResponseMessage,
  type ResultMessage,
  type ReviewMatch,
} from "./protocol";

/** What a finished redaction hands back. The output is transferred, not copied. */
export interface RedactedOutput {
  readonly output: ArrayBuffer;
  readonly outcome: RedactionOutcome;
}

/**
 * A document held open in the worker.
 *
 * Everything the main thread may know about it: counts, flags, and the review
 * rows. No bytes, no geometry (INV-2).
 */
export interface OpenedSession {
  readonly jobId: string;
  readonly summary: DocumentSummary;
  readonly matches: readonly ReviewMatch[];
  /** Remove the ticked matches. Ids only; the worker owns the geometry. */
  redact(
    matchIds: readonly MatchId[],
    options?: { onProgress?: (phase: ProgressPhase) => void },
  ): Promise<RedactedOutput>;
  /** Abort whatever is in flight. The session survives. */
  cancel(): void;
  /** End the session. Terminates the worker and frees everything. */
  release(): void;
}

interface PendingOperation {
  readonly jobId: string;
  readonly resolve: (message: ResultMessage | RedactedMessage) => void;
  readonly reject: (error: Error) => void;
  readonly onProgress?: (phase: ProgressPhase) => void;
}

/**
 * Module level and deliberately so: one worker per tab is the whole point, and
 * a second one would be a second place document bytes could live.
 */
let worker: Worker | null = null;
const pending = new Map<string, PendingOperation>();
const lostListeners = new Set<() => void>();

/**
 * Start the worker, which begins fetching the engine.
 *
 * Call this on first interaction with the drop area rather than on page load:
 * the engine is a multi megabyte download, and starting it on intent usually
 * finishes it before a file has been chosen.
 *
 * Safe to call repeatedly. Only the first call does anything.
 */
export function warmEngine(): void {
  void getWorker();
}

function getWorker(): Worker {
  if (worker) return worker;

  // This exact form is what bundlers recognise as a worker entry point. Do not
  // hoist the `new URL(...)` into a variable: the analysis is syntactic, and it
  // stops working the moment the URL is not written out here.
  const instance = new Worker(new URL("./engine.worker.ts", import.meta.url), {
    type: "module",
    name: "redactnest-engine",
  });
  worker = instance;

  /**
   * Is this still the worker we are talking to?
   *
   * `terminate()` stops the worker, but the events it already queued were
   * queued on this thread's event loop and still arrive. Without this check a
   * worker released a moment ago can announce its own death over a session
   * running happily on its replacement, which shows somebody "the PDF engine
   * stopped unexpectedly" about a worker nobody is using any more.
   */
  const isCurrent = () => worker === instance;

  instance.addEventListener("message", (event: MessageEvent<ResponseMessage>) => {
    if (!isCurrent()) return;

    const message = event.data;
    const operation = pending.get(message.id);
    if (!operation) return;

    // A reply belonging to a session that has since been replaced. Dropped
    // rather than delivered to whoever holds that operation id now.
    if (operation.jobId !== message.jobId) return;

    switch (message.kind) {
      case "progress":
        operation.onProgress?.(message.phase);
        break;
      case "result":
      case "redacted":
        pending.delete(message.id);
        operation.resolve(message);
        break;
      case "error":
        pending.delete(message.id);
        operation.reject(
          new EngineError(
            isEngineErrorKind(message.errorKind) ? message.errorKind : "unsupported",
          ),
        );
        break;
    }
  });

  // The worker itself failing to start or dying mid job (a blocked script, a
  // missing chunk, an out of memory kill). Spec 0002, AC-11: this is the one
  // recoverable failure, because the page still holds the `File` handle and can
  // read it again without asking for the file a second time.
  instance.addEventListener("error", (event) => {
    // Prevented whether or not this worker is still ours. The browser's default
    // handling prints the error, and what a dying engine says about a document
    // is exactly what must never reach a console or a reporter.
    event.preventDefault();
    if (!isCurrent()) return;

    failAll(new EngineError("engine-unavailable"));
    announceLost();
  });

  return instance;
}

function failAll(error: Error): void {
  for (const [id, operation] of pending) {
    pending.delete(id);
    operation.reject(error);
  }
}

/**
 * Retire whatever an earlier job still had in flight, without touching this one.
 *
 * AC-1: one tab holds at most one session, so a document arriving means every
 * older job is over. The worker is told to stop work on each abandoned
 * operation, and each is settled as cancelled rather than failed: somebody who
 * chose a different file walked away from the first one, they did not hit an
 * error.
 *
 * This is what a replacement costs instead of `releaseEngine()`. Terminating
 * would also clear these, and would throw away the loaded engine with them.
 */
function retireOtherJobs(jobId: string, engine: Worker): void {
  for (const [id, operation] of pending) {
    if (operation.jobId === jobId) continue;

    pending.delete(id);
    const message: RequestMessage = { id, jobId: operation.jobId, kind: "cancel" };
    engine.postMessage(message);
    operation.reject(new OperationCancelled());
  }
}

function announceLost(): void {
  for (const listener of [...lostListeners]) listener();
}

/**
 * Learn that the worker died, so a session can go to `lost` rather than to a
 * dead end.
 *
 * Returns the function that stops listening, which is the shape React's effect
 * cleanup wants.
 */
export function onEngineLost(listener: () => void): () => void {
  lostListeners.add(listener);
  return () => {
    lostListeners.delete(listener);
  };
}

/**
 * Hand a document to the worker and get a session back.
 *
 * `bytes` is transferred, so treat it as gone once this is called. After this
 * returns, the buffer you passed in reports a `byteLength` of 0 on this side.
 * That is the guarantee working, not a bug.
 *
 * `limits` comes from the entitlement snapshot frozen for this job, never from
 * `config.maxPages` directly: the free page cap is only enforced because the
 * snapshot's `pageCap` is what travels here (INV-5).
 */
export function openSession(options: {
  jobId: string;
  bytes: ArrayBuffer;
  limits: EngineLimits;
  onProgress?: (phase: ProgressPhase) => void;
}): Promise<OpenedSession> {
  const { jobId, bytes, limits, onProgress } = options;
  const engine = getWorker();

  // AC-1, and the reason a new document does not need a new worker. The session
  // this one replaces ends here on the main thread and, when the request lands,
  // inside the worker too. A late reply from it can no longer resolve anything.
  retireOtherJobs(jobId, engine);

  const id = crypto.randomUUID();

  // Tracks whatever this session has in flight, so `cancel()` knows what to
  // abort without the caller having to hold an id.
  let activeId: string | null = id;

  const settled = new Promise<ResultMessage | RedactedMessage>((resolve, reject) => {
    pending.set(id, { jobId, resolve, reject, onProgress });
  });

  const request: RequestMessage = {
    id,
    jobId,
    kind: "open",
    bytes,
    limits,
    // The context window comes from the typed config module (INV-9), like every
    // other cap. Never a literal here.
    contextChars: config.matchContextChars,
  };

  // The second argument is the transfer list. This is the line that keeps
  // document content off the main thread.
  engine.postMessage(request, [bytes]);

  function cancel(): void {
    if (activeId === null) return;

    const operation = pending.get(activeId);
    pending.delete(activeId);

    const message: RequestMessage = { id: activeId, jobId, kind: "cancel" };
    activeId = null;
    engine.postMessage(message);

    // Not an `EngineErrorKind`: cancelling is a choice, not a failure, and the
    // visitor should not be shown one.
    operation?.reject(new OperationCancelled());
  }

  return settled.then((message) => {
    activeId = null;

    if (message.kind !== "result") {
      // The worker answered an `open` with something that is not a `result`.
      // The contract has drifted; say so in the closed set rather than guessing.
      throw new EngineError("unsupported");
    }

    const session: OpenedSession = {
      jobId,
      summary: message.summary,
      matches: message.matches,

      redact(matchIds, redactOptions = {}) {
        const redactId = crypto.randomUUID();
        activeId = redactId;

        const done = new Promise<ResultMessage | RedactedMessage>((resolve, reject) => {
          pending.set(redactId, {
            jobId,
            resolve,
            reject,
            onProgress: redactOptions.onProgress,
          });
        });

        const redactRequest: RequestMessage = {
          id: redactId,
          jobId,
          kind: "redact",
          matchIds,
        };
        engine.postMessage(redactRequest);

        return done.then((reply) => {
          activeId = null;

          if (reply.kind !== "redacted") {
            throw new EngineError("unsupported");
          }
          return { output: reply.output, outcome: reply.outcome };
        });
      },

      cancel,
      release: releaseEngine,
    };

    return session;
  });
}

/**
 * End the session and hand everything back.
 *
 * Terminating is the only thing that actually returns the MuPDF WebAssembly
 * heap, so this is what stops memory creeping across several documents in one
 * sitting. Safe to call at any time, including when there is no worker and when
 * the worker is wedged.
 */
export function releaseEngine(): void {
  // Whatever was in flight was abandoned, not failed. A visitor who started
  // over should not be shown an error about the document they just dropped.
  failAll(new OperationCancelled());
  worker?.terminate();
  worker = null;
}
