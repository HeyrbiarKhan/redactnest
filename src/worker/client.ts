/**
 * The main thread's only way to reach the engine.
 *
 * Spec 0001 invariant: "The file is handed over by transferring its
 * `ArrayBuffer`, which neuters the main thread's copy rather than duplicating
 * it, so the main thread never holds document content."
 *
 * Every call here transfers rather than copies. After `inspect()` the buffer you
 * passed in has a `byteLength` of 0 on this side, by design. That is the
 * guarantee working, not a bug.
 */

import { config } from "@/config";
import {
  EngineError,
  isEngineErrorKind,
  type DocumentSummary,
  type ProgressPhase,
  type RequestMessage,
  type ResponseMessage,
} from "./protocol";

interface PendingJob {
  resolve: (summary: DocumentSummary) => void;
  reject: (error: EngineError) => void;
  onProgress?: (phase: ProgressPhase) => void;
}

let worker: Worker | null = null;
const pending = new Map<string, PendingJob>();

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
  worker = new Worker(new URL("./engine.worker.ts", import.meta.url), {
    type: "module",
    name: "redactnest-engine",
  });

  worker.addEventListener("message", (event: MessageEvent<ResponseMessage>) => {
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;

    switch (message.kind) {
      case "progress":
        job.onProgress?.(message.phase);
        break;
      case "result":
        pending.delete(message.id);
        job.resolve(message.summary);
        break;
      case "error":
        pending.delete(message.id);
        job.reject(
          new EngineError(
            isEngineErrorKind(message.errorKind) ? message.errorKind : "unsupported",
          ),
        );
        break;
    }
  });

  // The worker itself failing to start (a blocked script, a missing chunk) is
  // reported to every job in flight as the one kind that describes it.
  worker.addEventListener("error", (event) => {
    event.preventDefault();
    failAll("engine-unavailable");
  });

  return worker;
}

function failAll(errorKind: "engine-unavailable"): void {
  for (const [id, job] of pending) {
    pending.delete(id);
    job.reject(new EngineError(errorKind));
  }
}

/**
 * Hand a document to the worker and get back counts only.
 *
 * `bytes` is transferred, so treat it as gone once this is called.
 */
export function inspect(
  bytes: ArrayBuffer,
  options: { onProgress?: (phase: ProgressPhase) => void; signal?: AbortSignal } = {},
): Promise<DocumentSummary> {
  const id = crypto.randomUUID();
  const engine = getWorker();

  return new Promise<DocumentSummary>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress: options.onProgress });

    options.signal?.addEventListener(
      "abort",
      () => {
        pending.delete(id);
        const cancel: RequestMessage = { id, kind: "cancel" };
        engine.postMessage(cancel);
        reject(new EngineError("unsupported"));
      },
      { once: true },
    );

    const request: RequestMessage = {
      id,
      kind: "open",
      bytes,
      // Caps come from the typed config module. Never a literal here.
      maxBytes: config.maxFileBytes,
      maxPages: config.maxPages,
    };

    // The second argument is the transfer list. This is the line that keeps
    // document content off the main thread.
    engine.postMessage(request, [bytes]);
  });
}

/** Drop the worker and everything it holds. */
export function releaseEngine(): void {
  failAll("engine-unavailable");
  worker?.terminate();
  worker = null;
}
