import type {
  BlockedReason,
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
   * AC-22), one per line the match covers. The engine derives the removal band,
   * the line box and the padded area from each (`geometry.ts`); none of the
   * passes uses these quads as they stand.
   */
  readonly quads: readonly Quad[];
  /**
   * Code point offsets into the ordinary mode page text detection built, end
   * exclusive (spec 0005). Not read by the engine yet; kept for feature 13.
   */
  readonly start: number;
  readonly end: number;
  /**
   * What the detector found, so the worker can count `removedByType` without
   * the main thread naming anything (spec 0004).
   */
  readonly kind: DetectorKind;
  /**
   * The match exactly as detection extracted it, so the engine can prove the
   * quads really surround it before removing anything (spec 0004, AC-27). A
   * target whose quads hold other text is refused rather than redacted.
   * Document text: worker private like the rest of the target, never logged.
   */
  readonly text: string;
}

/**
 * The worker's private map from a ticked id to the geometry that removes it.
 *
 * Mutable because feature 6 fills it as it detects. It is the one structure in
 * the codebase that must never be serialised into a message.
 */
export type TargetMap = Map<MatchId, RedactionTarget>;

/**
 * One match the find step found, before the worker gives it an id. Spec 0005.
 *
 * An engine type, never a protocol one (INV-4): the worker strips it to a
 * `ReviewMatch`, keeping the target in its private map. A union, so a blocked
 * match cannot carry a target (INV-2): the worker's existing check, an id with
 * no target is `unsupported`, then refuses it with no new code path.
 */
export type FoundMatch = {
  /** Zero based, as the engine counts. */
  readonly page: number;
  readonly kind: DetectorKind;
  /** The NFKC page text of the match, a line join as one space (AC-5). */
  readonly text: string;
  /** Up to `contextChars` code points either side, whitespace collapsed (AC-5). */
  readonly before: string;
  readonly after: string;
  /** The detector's rule (AC-10), and false whenever blocked. */
  readonly tickedByDefault: boolean;
} & (
  | { readonly blocked: null; readonly target: RedactionTarget }
  | { readonly blocked: BlockedReason; readonly target: null }
);

/** How detection is asked to run. */
export interface FindOptions {
  /**
   * Code points of context either side of a match, from the `open` request,
   * which takes `config.matchContextChars` (spec 0002, INV-9).
   */
  readonly contextChars: number;
  /**
   * Checked after every read of every page (spec 0005, AC-11). True means
   * stop: detection throws `RunCancelled` and hands nothing back.
   */
  readonly isCancelled?: () => boolean;
}

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
   * Find every match on every page with a text layer, by page, then in reading
   * order (spec 0005, AC-3). Reads this review copy one page at a time and
   * yields after each read. Throws `EngineFailure("unsupported")` when a page
   * that reported a text layer cannot be read (AC-12), and `RunCancelled` when
   * `isCancelled` says so.
   */
  findMatches(options: FindOptions): Promise<readonly FoundMatch[]>;
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
