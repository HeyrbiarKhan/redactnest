import type { DetectorKind } from "@/worker/protocol";

/**
 * One text block, as a detector reads it. Spec 0005, *Detectors*.
 *
 * The engine builds it from the page's characters, each NFKC normalised on its
 * own, with the block's lines joined by one synthetic space. Offsets anywhere in
 * this folder count code points, never UTF-16 units (INV-12), so a letter above
 * U+FFFF is one position like any other.
 */
export interface DetectInput {
  readonly text: string;
  /**
   * The code point index of each synthetic join space, where one line of the
   * block meets the next. The email rejoin reads these (AC-4).
   */
  readonly joins: readonly number[];
}

/** One find. `start` and `end` are code point offsets into `text`, end exclusive. */
export interface Span {
  readonly kind: DetectorKind;
  readonly start: number;
  readonly end: number;
  /** The detector's own recommendation, spec 0005, AC-10. */
  readonly tickedByDefault: boolean;
}

/**
 * A detector: pure, and linear in the length of its input (INV-7). Bad input
 * finds nothing; nothing here throws on a document's text.
 */
export type Detector = (input: DetectInput) => readonly Span[];
