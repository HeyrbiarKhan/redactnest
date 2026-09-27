import type { EngineErrorKind } from "@/worker/protocol";

/**
 * A failure the engine can describe in the protocol's terms.
 *
 * Deliberately carries the kind and nothing else. Anything MuPDF said about the
 * document (its message, its stack) stops here and never crosses the boundary.
 */
export class EngineFailure extends Error {
  readonly errorKind: EngineErrorKind;

  constructor(errorKind: EngineErrorKind) {
    super(errorKind);
    this.name = "EngineFailure";
    this.errorKind = errorKind;
  }
}

/**
 * A run stopped because somebody asked it to. Spec 0004, AC-17.
 *
 * Deliberately not an `EngineFailure`: cancelling is a choice, not a failure,
 * and the worker posts nothing at all for it. It never crosses the boundary, so
 * it carries no kind either, and its message is a fixed word rather than a
 * description of what was stopped.
 */
export class RunCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "RunCancelled";
  }
}

/**
 * A yield, then a look at whether the work should stop. Spec 0004, AC-17, and
 * spec 0005, AC-11: a run calls this after every page, and detection after
 * every read.
 *
 * A macrotask rather than a microtask, so a `cancel` message waiting in the
 * worker's queue is actually delivered before the check reads the flag.
 */
export async function checkpoint(isCancelled?: () => boolean): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  if (isCancelled?.()) throw new RunCancelled();
}
