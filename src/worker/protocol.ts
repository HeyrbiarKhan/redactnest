/**
 * The worker boundary contract, fixed by spec 0001.
 *
 * Features 3 and 5 extend this envelope; they do not redesign it.
 *
 * Two rules carry the product's privacy claim and are enforced by the types here:
 *
 *  1. The worker never throws across the boundary. Every failure comes back as an
 *     `error` message carrying one of a closed set of kinds.
 *  2. An error payload carries a kind and nothing derived from the document. No
 *     file name, no stack trace, no extracted text. That is what makes feature
 *     11's scrubbing requirement achievable rather than aspirational.
 */

/** The closed set of failures the worker may report. */
export const ENGINE_ERROR_KINDS = [
  "engine-unavailable",
  "encrypted",
  "password-required",
  "corrupt",
  "unsupported",
  "too-large",
  "too-many-pages",
] as const;

export type EngineErrorKind = (typeof ENGINE_ERROR_KINDS)[number];

export function isEngineErrorKind(value: unknown): value is EngineErrorKind {
  return (
    typeof value === "string" &&
    (ENGINE_ERROR_KINDS as readonly string[]).includes(value)
  );
}

/** Phases a job reports as it advances. Feature 8 decides how they are shown. */
export type ProgressPhase = "loading-engine" | "opening" | "inspecting";

/**
 * What opening a document tells the main thread.
 *
 * Counts and flags only. No text, no file name, no bytes: the document itself
 * never leaves the worker.
 */
export interface DocumentSummary {
  pageCount: number;
  /**
   * Per page: does this page carry a text layer? Feature 7 turns this into the
   * scanned page warnings; the scaffold only has to produce it honestly.
   */
  pagesWithText: readonly boolean[];
}

/* Main thread to worker. */

export interface OpenRequest {
  id: string;
  kind: "open";
  /** Transferred, never copied, so the main thread's view is neutered. */
  bytes: ArrayBuffer;
  /** Both caps come from the typed config module, never a literal. */
  maxBytes: number;
  maxPages: number;
}

export interface CancelRequest {
  id: string;
  kind: "cancel";
}

export type RequestMessage = OpenRequest | CancelRequest;

/* Worker to main thread. */

export interface ResultMessage {
  id: string;
  kind: "result";
  summary: DocumentSummary;
}

export interface ProgressMessage {
  id: string;
  kind: "progress";
  phase: ProgressPhase;
}

export interface ErrorMessage {
  id: string;
  kind: "error";
  /** The whole payload. Deliberately nothing else. */
  errorKind: EngineErrorKind;
}

export type ResponseMessage = ResultMessage | ProgressMessage | ErrorMessage;

/**
 * Raised on the main thread when the worker reports a failure.
 *
 * Carries the kind only, so nothing document derived can reach a log or an error
 * reporter through it. Feature 8 owns what the user is told for each kind.
 */
export class EngineError extends Error {
  readonly errorKind: EngineErrorKind;

  constructor(errorKind: EngineErrorKind) {
    super(errorKind);
    this.name = "EngineError";
    this.errorKind = errorKind;
  }
}
