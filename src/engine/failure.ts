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
