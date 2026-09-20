/**
 * The engine worker. The only place a document's bytes ever exist.
 *
 * Instantiated as a module worker by `src/worker/client.ts`. Nothing on the main
 * thread imports the engine; everything goes through the protocol in
 * `./protocol.ts`.
 *
 * The one rule this file must never break: it does not throw across the
 * boundary. Every path out of `handleOpen` posts either a `result` or an
 * `error`, and an `error` carries a kind and nothing else.
 */

import { EngineFailure, inspectDocument } from "@/engine";
import type {
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
  postMessage(message: ResponseMessage): void;
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

/** Jobs the main thread has asked to cancel, by message id. */
const cancelled = new Set<string>();

function postProgress(id: string, phase: ProgressPhase): void {
  const message: ProgressMessage = { id, kind: "progress", phase };
  scope.postMessage(message);
}

function postError(id: string, errorKind: ErrorMessage["errorKind"]): void {
  const message: ErrorMessage = { id, kind: "error", errorKind };
  scope.postMessage(message);
}

async function handleOpen(request: Extract<RequestMessage, { kind: "open" }>) {
  const { id, bytes, maxBytes, maxPages } = request;

  try {
    const summary = await inspectDocument(
      bytes,
      { maxBytes, maxPages },
      (phase) => {
        if (!cancelled.has(id)) postProgress(id, phase);
      },
    );

    // A cancelled job reports nothing at all. The document is already gone.
    if (cancelled.has(id)) return;

    const message: ResultMessage = { id, kind: "result", summary };
    scope.postMessage(message);
  } catch (error) {
    if (cancelled.has(id)) return;

    // Anything that is not already a described failure becomes `unsupported`.
    // Whatever the original error said about the document stops here: it is
    // never logged, never rethrown, and never posted.
    postError(id, error instanceof EngineFailure ? error.errorKind : "unsupported");
  } finally {
    cancelled.delete(id);
  }
}

scope.addEventListener("message", (event: MessageEvent<RequestMessage>) => {
  const request = event.data;

  switch (request.kind) {
    case "open":
      void handleOpen(request);
      break;
    case "cancel":
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
