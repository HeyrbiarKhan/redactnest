/**
 * The engine worker. The only place a document's bytes ever exist.
 *
 * Instantiated as a module worker by `src/worker/client.ts`. Nothing on the main
 * thread imports the engine; everything goes through the protocol in
 * `./protocol.ts`.
 *
 * Spec 0002 turned this from a per call handler into a session registry. A
 * document is opened once and held open for the session's life, so ticking a box
 * and running again costs no reparse, and the geometry needed to redact stays in
 * a private map on this side of the boundary (INV-2).
 *
 * Two rules this file must never break:
 *
 *  - It does not throw across the boundary. Every path posts either a `result`,
 *    a `redacted` or an `error`, and an `error` carries a kind and nothing else.
 *  - It never produces a file that looks redacted and is not. Handing back an
 *    unchanged document under a `-redacted.pdf` name would be exactly the
 *    failure the product exists to prevent.
 */

import {
  EngineFailure,
  openDocument,
  redactDocument,
  RunCancelled,
  type OpenDocument,
  type RedactionTarget,
  type TargetMap,
} from "@/engine";
import type {
  EngineLimits,
  ErrorMessage,
  ProgressMessage,
  ProgressPhase,
  RedactedMessage,
  RequestMessage,
  ResponseMessage,
  ResultMessage,
} from "./protocol";

/**
 * A structural view of the worker global.
 *
 * Declared here rather than pulled in from TypeScript's `webworker` lib, because
 * that lib cannot coexist with `dom` in one tsconfig and the rest of the app
 * needs `dom`. This names only what this file actually calls.
 */
interface WorkerScope {
  postMessage(message: ResponseMessage, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RequestMessage>) => void,
  ): void;
  addEventListener(
    type: "unhandledrejection",
    listener: (event: { preventDefault(): void }) => void,
  ): void;
}

const scope = self as unknown as WorkerScope;

/**
 * One redaction job, alive between `open` and the worker being terminated.
 *
 * Spec 0002 (AC-1) gives a tab at most one of these. The registry is keyed
 * anyway, so a reply can be matched to the session that asked for it and a
 * stale one is dropped rather than guessed at.
 */
interface EngineSession {
  /**
   * Transferred in at open. Never leaves (INV-1). The clean original every
   * redaction run opens its own working copy from, and which no run changes
   * (spec 0004, AC-11).
   */
  readonly bytes: ArrayBuffer;
  /** The review copy, prepared once at open. Never redacted (spec 0004, INV-1). */
  readonly doc: OpenDocument;
  /** Page, quads and extraction offsets. Never crosses the boundary (INV-2). */
  readonly targets: TargetMap;
  /** From the entitlement snapshot frozen at open (INV-5). */
  readonly limits: EngineLimits;
  /** Characters of context each match carries, from `config.matchContextChars`. */
  readonly contextChars: number;
  /**
   * The tail of this session's run queue (spec 0004, AC-18). A run starts only
   * once the one before it has settled, so a session never holds two working
   * copies at once (INV-7). A run that fails or is cancelled settles its link
   * rather than breaking the chain.
   *
   * Mutable, with `activeRunId`, because a queue is state that moves. These two
   * are the session's only mutable fields.
   */
  runs: Promise<void>;
  /** The run in flight, so a replacement can cancel it (AC-23). */
  activeRunId: string | null;
}

const sessions = new Map<string, EngineSession>();

/** Operation ids the main thread has asked to abort. */
const cancelled = new Set<string>();

function postProgress(id: string, jobId: string, phase: ProgressPhase): void {
  const message: ProgressMessage = { id, jobId, kind: "progress", phase };
  scope.postMessage(message);
}

function postError(
  id: string,
  jobId: string,
  errorKind: ErrorMessage["errorKind"],
): void {
  const message: ErrorMessage = { id, jobId, kind: "error", errorKind };
  scope.postMessage(message);
}

/**
 * End a session and hand its memory back.
 *
 * This is one of the two endings spec 0002 allows (INV-6), and it is the one a
 * replacement takes: opening a second document inside a healthy worker ends the
 * first one here rather than throwing away an engine that is loaded and working.
 *
 * The other ending is a release, which terminates the worker from outside and
 * never reaches this function. It gets to the same place by a stronger route,
 * since it works even when the worker is wedged and would never read a message.
 * That is the difference AC-5a and AC-5b split apart: both leave nothing
 * reachable, and only termination hands the memory back at once.
 */
function endSession(jobId: string): void {
  const session = sessions.get(jobId);
  if (!session) return;

  // Spec 0004, AC-23. A run in flight for this session is told to stop before
  // anything is closed. It notices within a page, destroys its working copy and
  // settles, and `handleOpen` waits for that before it parses anything new. A
  // run still waiting in the queue finds its session gone and never starts.
  if (session.activeRunId !== null) cancelled.add(session.activeRunId);

  sessions.delete(jobId);
  session.targets.clear();
  session.doc.close();
}

async function handleOpen(request: Extract<RequestMessage, { kind: "open" }>) {
  const { id, jobId, bytes, limits, contextChars } = request;

  // AC-1, first half: a document arriving means the one before it is over, so
  // it goes now rather than once this one has parsed. Waiting would leave the
  // previous document open for as long as this one takes, and would leave it
  // open for good if this one turns out to be unopenable.
  const evicted = [...sessions.entries()]
    .filter(([existing]) => existing !== jobId)
    .map(([, session]) => session);
  for (const existing of sessions.keys()) {
    if (existing !== jobId) endSession(existing);
  }

  try {
    // Spec 0004, AC-23. Ending a session cancelled its run, and the run is
    // given the time it needs to notice, destroy its working copy and let go of
    // the old bytes before a second document is parsed beside it. Their queues
    // never reject, so this waits and cannot fail.
    await Promise.all(evicted.map((session) => session.runs));
    if (cancelled.has(id)) return;

    const doc = await openDocument(bytes, limits, (phase) => {
      if (!cancelled.has(id)) postProgress(id, jobId, phase);
    });

    // A cancelled job reports nothing at all, and keeps nothing either.
    if (cancelled.has(id)) {
      doc.close();
      return;
    }

    // AC-1, second half: evicted again on the way out, so two opens that
    // overlap cannot both end up in the registry whichever order they happen to
    // finish in. The eviction above cannot cover that, because a session
    // registered while this one was parsing arrived after it looked.
    for (const existing of sessions.keys()) endSession(existing);

    sessions.set(jobId, {
      bytes,
      doc,
      targets: new Map(),
      limits,
      contextChars,
      runs: Promise.resolve(),
      activeRunId: null,
    });

    const message: ResultMessage = {
      id,
      jobId,
      kind: "result",
      summary: doc.summary,
      // Feature 6 fills this from the detectors, with `contextChars` of context
      // either side of each match. Until then there is nothing to review.
      matches: [],
    };
    scope.postMessage(message);
  } catch (error) {
    if (cancelled.has(id)) return;

    // Anything that is not already a described failure becomes `unsupported`.
    // Whatever the original error said about the document stops here: it is
    // never logged, never rethrown, and never posted.
    postError(
      id,
      jobId,
      error instanceof EngineFailure ? error.errorKind : "unsupported",
    );
  } finally {
    cancelled.delete(id);
  }
}

function handleRedact(request: Extract<RequestMessage, { kind: "redact" }>): void {
  const { id, jobId, matchIds } = request;
  const session = sessions.get(jobId);

  // An unknown session, or an id this session never minted. Both mean the main
  // thread is naming something that does not exist, and both are `unsupported`.
  if (!session || matchIds.some((matchId) => !session.targets.has(matchId))) {
    postError(id, jobId, "unsupported");
    return;
  }

  // Spec 0004, INV-6. Targets come from this worker's own map and nowhere else;
  // the main thread sent ids. Each ticked id counts once, however many times it
  // was named.
  const targets = [...new Set(matchIds)].flatMap((matchId) => {
    const target = session.targets.get(matchId);
    return target ? [target] : [];
  });

  // AC-18. One run at a time: this one joins the end of the session's queue.
  // `runRedaction` settles on every path, so the chain never breaks.
  session.runs = session.runs.then(() => runRedaction(session, id, jobId, targets));
}

async function runRedaction(
  session: EngineSession,
  id: string,
  jobId: string,
  targets: readonly RedactionTarget[],
): Promise<void> {
  try {
    // Checked again as the run leaves the queue (AC-17): cancelled while it
    // waited, or its session ended by a replacement. Either way it never starts.
    if (cancelled.has(id) || sessions.get(jobId) !== session) return;

    session.activeRunId = id;

    // The clean original, never the review document (spec 0004, INV-1). An
    // empty tick set is allowed: it cleans the file and removes nothing.
    const result = await redactDocument(session.bytes, targets, {
      onPhase: (phase) => {
        if (!cancelled.has(id)) postProgress(id, jobId, phase);
      },
      // The engine looks at this after every page, so a cancel is noticed
      // within one page of work.
      isCancelled: () => cancelled.has(id),
    });

    // A cancel that landed while the write or the self check was running lets
    // that call finish and then throws its output away (AC-17).
    if (cancelled.has(id)) return;

    const { summary } = session.doc;
    const message: RedactedMessage = {
      id,
      jobId,
      kind: "redacted",
      output: result.output,
      outcome: {
        pageCount: summary.pageCount,
        removedByType: result.removedByType,
        pagesWithoutText: summary.pagesWithText.filter((hasText) => !hasText).length,
        sanitized: result.sanitized,
      },
    };

    // Transferred as the engine made it: the engine copied it out of MuPDF's
    // heap itself, so the bytes its self check read are the bytes that cross.
    // After this the worker holds no usable reference to it (INV-8).
    scope.postMessage(message, [result.output]);
  } catch (error) {
    // Stopping is not failing. A cancelled run posts nothing at all.
    if (cancelled.has(id) || error instanceof RunCancelled) return;

    // All or nothing (AC-14): one kind, and no output. Whatever the original
    // error said about the document stops here.
    postError(
      id,
      jobId,
      error instanceof EngineFailure ? error.errorKind : "unsupported",
    );
  } finally {
    if (session.activeRunId === id) session.activeRunId = null;
    cancelled.delete(id);
  }
}

scope.addEventListener("message", (event: MessageEvent<RequestMessage>) => {
  const request = event.data;

  switch (request.kind) {
    case "open":
      void handleOpen(request);
      break;
    case "redact":
      handleRedact(request);
      break;
    case "cancel":
      // INV-8: this aborts one operation. It never ends the session, so the
      // document stays open and the visitor lands back where they were.
      cancelled.add(request.id);
      break;
  }
});

/**
 * A failure that escapes the handlers entirely would otherwise surface as an
 * unhandled worker error carrying a stack trace. Swallow it here so nothing
 * document derived can reach an error reporter in feature 11.
 */
scope.addEventListener("unhandledrejection", (event) => {
  event.preventDefault();
});

export {};
