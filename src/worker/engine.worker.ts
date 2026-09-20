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

import { EngineFailure, openDocument, type OpenDocument, type TargetMap } from "@/engine";
import type {
  EngineLimits,
  ErrorMessage,
  ProgressMessage,
  ProgressPhase,
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
  /** Transferred in at open. Never leaves (INV-1). */
  readonly bytes: ArrayBuffer;
  readonly doc: OpenDocument;
  /** Page, quads and extraction offsets. Never crosses the boundary (INV-2). */
  readonly targets: TargetMap;
  /** From the entitlement snapshot frozen at open (INV-5). */
  readonly limits: EngineLimits;
  /** Characters of context each match carries, from `config.matchContextChars`. */
  readonly contextChars: number;
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
 * Terminating the worker does this too, and does it even when the worker is
 * wedged, which is why spec 0002 (INV-6) makes termination the session's real
 * ending. This is the tidy path, for the case where one session is replaced by
 * another inside a worker that is still healthy.
 */
function endSession(jobId: string): void {
  const session = sessions.get(jobId);
  if (!session) return;

  sessions.delete(jobId);
  session.targets.clear();
  session.doc.close();
}

async function handleOpen(request: Extract<RequestMessage, { kind: "open" }>) {
  const { id, jobId, bytes, limits, contextChars } = request;

  try {
    const doc = await openDocument(bytes, limits, (phase) => {
      if (!cancelled.has(id)) postProgress(id, jobId, phase);
    });

    // A cancelled job reports nothing at all, and keeps nothing either.
    if (cancelled.has(id)) {
      doc.close();
      return;
    }

    // AC-1: one tab holds at most one session. Evicted here rather than when
    // the request arrived, so two opens that overlap cannot both end up in the
    // registry whichever order they happen to finish in.
    for (const existing of sessions.keys()) endSession(existing);

    sessions.set(jobId, {
      bytes,
      doc,
      targets: new Map(),
      limits,
      contextChars,
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

function handleRedact(request: Extract<RequestMessage, { kind: "redact" }>) {
  const { id, jobId, matchIds } = request;
  const session = sessions.get(jobId);

  // An unknown session, or an id this session never minted. Both mean the main
  // thread is naming something that does not exist, and both are `unsupported`.
  if (!session || matchIds.some((matchId) => !session.targets.has(matchId))) {
    postError(id, jobId, "unsupported");
    return;
  }

  // Feature 5 owns the removal and the write, and wires the `redacted` reply to
  // real output. Until it lands no detector has minted a target, so every
  // request resolves to nothing to remove. Reporting that beats handing back a
  // file that was never redacted: a document that looks clean and is not is the
  // one failure this product cannot have.
  postError(id, jobId, "unsupported");
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
