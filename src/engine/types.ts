import type {
  DetectorKind,
  DocumentSummary,
  MatchId,
  SanitizedKind,
} from "@/worker/protocol";

/**
 * One quad, as MuPDF gives them: four corners, upper left first, then upper
 * right, lower left, lower right.
 *
 * Spec 0002, INV-2: this type never reaches `@/worker/protocol`, because
 * anything declared there can cross to the main thread. Geometry stays here and
 * in the worker's private target map. Feature 14 will need quads on the main
 * thread and must widen INV-2 with its own decision rather than by moving this
 * type.
 */
export type Quad = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Everything needed to remove one match, and nothing the main thread may see.
 *
 * Held in the worker's session, keyed by `MatchId`. A ticked id is resolved
 * against this map at redaction time, so a stale or tampered quad from the page
 * cannot cause a wrong removal.
 */
export interface RedactionTarget {
  /** Zero based, as the engine counts. Converted for display in the worker. */
  readonly page: number;
  /**
   * In the page space `page.search()` uses, on the prepared page (spec 0004,
   * AC-22). The exact pass removes and boxes exactly these.
   */
  readonly quads: readonly Quad[];
  /** Offsets into the page's extracted text, for matches broken across runs. */
  readonly start: number;
  readonly end: number;
  /**
   * What the detector found, so the worker can count `removedByType` without
   * the main thread naming anything (spec 0004).
   */
  readonly kind: DetectorKind;
}

/**
 * The worker's private map from a ticked id to the geometry that removes it.
 *
 * Mutable because feature 6 fills it as it detects. It is the one structure in
 * the codebase that must never be serialised into a message.
 */
export type TargetMap = Map<MatchId, RedactionTarget>;

/**
 * A document held open for the life of a session.
 *
 * Spec 0002 keeps the document open across steps rather than reopening it per
 * call, so ticking a box and running again costs no reparse. That makes closing
 * it an explicit act: `close()` is the only thing that hands MuPDF's native
 * memory back, and the worker calls it when the session ends.
 *
 * This is the review copy (spec 0004, INV-1): prepared once at open, read by
 * detection, and never redacted. A run works on a copy of its own.
 */
export interface OpenDocument {
  readonly summary: DocumentSummary;
  /**
   * Release the native memory MuPDF holds.
   *
   * Safe to call more than once. This is the tidy ending, taken when a second
   * document replaces this session. Terminating the worker is the other one
   * (spec 0002, INV-6): it reclaims the same memory without calling this, and
   * does so even when the worker is wedged.
   */
  close(): void;
}

/**
 * What a run hands the worker. The worker adds the page counts from the open
 * summary to make the `RedactionOutcome`.
 */
export interface RedactionResult {
  /**
   * A fresh `ArrayBuffer` the engine copied out of MuPDF's heap, and the exact
   * bytes the self check passed. Transferred by the worker as it is.
   */
  readonly output: ArrayBuffer;
  /** Counted only once the self check has passed (AC-15). */
  readonly removedByType: Readonly<Partial<Record<DetectorKind, number>>>;
  /** The kinds the source actually carried, in `SANITIZED_KINDS` order. */
  readonly sanitized: readonly SanitizedKind[];
}

/** How a run talks back to the worker while it works. */
export interface RunHooks {
  readonly onPhase?: (phase: "redacting" | "writing" | "verifying") => void;
  /**
   * Checked at every point a run yields (spec 0004, AC-17). True means stop:
   * the run throws `RunCancelled` and hands nothing back.
   */
  readonly isCancelled?: () => boolean;
}
