/**
 * The worker boundary contract, fixed by spec 0001 and extended by spec 0002.
 *
 * Features 5 and 6 fill in what this envelope carries; they do not redesign it.
 *
 * Three rules carry the product's privacy claim and are enforced by the types
 * here:
 *
 *  1. The worker never throws across the boundary. Every failure comes back as
 *     an `error` message carrying one of a closed set of kinds.
 *  2. An error payload carries a kind and nothing derived from the document. No
 *     file name, no stack trace, no extracted text. That is what makes feature
 *     11's scrubbing requirement achievable rather than aspirational.
 *  3. Spec 0002, INV-2: coordinate quads, page geometry and extraction offsets
 *     never appear in this file. The main thread names a match by its opaque
 *     `MatchId` alone, so a stale or tampered quad cannot cause a wrong removal.
 *     Feature 14 needs geometry on the main thread and must widen INV-2
 *     deliberately, with its own decision, rather than by editing a type here.
 */

/**
 * The closed set of failures the worker may report.
 *
 * `file-unreadable` is the odd one out: it is raised on the main thread, when a
 * retained `File` can no longer be read because it was moved, deleted or had its
 * permission revoked between being chosen and being read. It never crosses the
 * boundary. It lives in this set anyway so feature 8 writes copy for one list
 * rather than two (spec 0002).
 *
 * Spec 0004 added the last three. `not-pdf` is judged from the bytes before the
 * engine is fetched (AC-1), `hidden-layers` refuses a document with layers a
 * viewer can switch (AC-3), and `redaction-incomplete` is the engine refusing to
 * hand back a file its own self check could not prove clean (AC-13).
 */
export const ENGINE_ERROR_KINDS = [
  "engine-unavailable",
  "encrypted",
  "password-required",
  "corrupt",
  "unsupported",
  "too-large",
  "too-many-pages",
  "file-unreadable",
  "not-pdf",
  "hidden-layers",
  "redaction-incomplete",
] as const;

export type EngineErrorKind = (typeof ENGINE_ERROR_KINDS)[number];

export function isEngineErrorKind(value: unknown): value is EngineErrorKind {
  return (
    typeof value === "string" && (ENGINE_ERROR_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Phases a job reports as it advances. Feature 8 decides how they are shown.
 *
 * `checking-entitlement` covers the bounded wait when a file is chosen before
 * the prefetched entitlement has resolved. Feature 6 reports `detecting`. A
 * redaction run reports `redacting`, `writing` and then `verifying`, the last
 * being the engine reopening its own output to prove it clean (spec 0004,
 * AC-16).
 */
export type ProgressPhase =
  | "checking-entitlement"
  | "loading-engine"
  | "opening"
  | "inspecting"
  | "detecting"
  | "redacting"
  | "writing"
  | "verifying";

/**
 * The kinds of sensitive pattern a detector can find.
 *
 * Seeded with the two release 1 builds. Feature 6 owns the full set of seven and
 * adds the rest (dates, credit cards, IBAN, US Social Security numbers, UK
 * National Insurance numbers) against its own spec. A union only ever grows, so
 * adding a member breaks nothing that already reads one.
 */
export const DETECTOR_KINDS = ["email", "phone"] as const;

export type DetectorKind = (typeof DETECTOR_KINDS)[number];

/**
 * The things a redaction strips besides the targeted text.
 *
 * The list comes from feature 5's contract in the scope: no document info or XMP
 * metadata, no annotations, no form fields, no attachments, no bookmarks, no
 * hidden layers, no JavaScript, and no earlier versions left behind by
 * incremental saves. Spec 0004 added page thumbnails and accessibility tags, the
 * two further things the rebuild drops that a visitor would want to hear about.
 *
 * A run reports only the kinds its source actually carried, in this order
 * (spec 0004, AC-15). `hidden-layers` is never reported in release 1, because a
 * layered document is refused at open rather than cleaned.
 */
export const SANITIZED_KINDS = [
  "document-info",
  "xmp-metadata",
  "annotations",
  "form-fields",
  "attachments",
  "bookmarks",
  "hidden-layers",
  "javascript",
  "incremental-versions",
  "page-thumbnails",
  "accessibility-tags",
] as const;

export type SanitizedKind = (typeof SANITIZED_KINDS)[number];

declare const matchIdBrand: unique symbol;

/**
 * A match's name, minted in the worker and meaningless anywhere else.
 *
 * Branded so a plain string cannot be passed where one of these is wanted. The
 * main thread ticks and sends these ids back; it never learns where on the page
 * the match sits, which is INV-2 holding at the type level.
 */
export type MatchId = string & { readonly [matchIdBrand]: "MatchId" };

/**
 * Mint one.
 *
 * Only the worker calls this. The main thread receives ids and echoes them back,
 * so it never needs to make one.
 */
export function asMatchId(value: string): MatchId {
  return value as MatchId;
}

/**
 * One row of the review checklist.
 *
 * `text`, `before` and `after` are the only document derived strings that cross
 * the boundary, and spec 0002 (INV-1) loosens spec 0001 deliberately to allow
 * them: without surrounding context a match cannot be judged. They are never
 * stored and never sent anywhere, which is what the guarantee actually rests on.
 *
 * No quads, no offsets, no page geometry. INV-2.
 */
export interface ReviewMatch {
  readonly id: MatchId;
  readonly type: DetectorKind;
  /** One based, for display. Converted in the worker. */
  readonly page: number;
  readonly text: string;
  /** Up to `config.matchContextChars` of the text before the match. */
  readonly before: string;
  /** Up to `config.matchContextChars` of the text after the match. */
  readonly after: string;
  /** The detector's own recommendation. Seeds the tick set. */
  readonly tickedByDefault: boolean;
}

/**
 * What a visitor is allowed to do, frozen at the moment a job opens.
 *
 * INV-5: a job runs to completion on the snapshot it started with. The tier is
 * never revised mid job, so a subscription lapsing while someone works cannot
 * fail their document halfway through.
 */
export interface EntitlementSnapshot {
  readonly tier: "free" | "paid";
  readonly pageCap: number;
  readonly maxFileBytes: number;
}

/**
 * The caps handed to the worker at open, taken from the entitlement snapshot.
 *
 * `maxPages` is the snapshot's `pageCap`, never `config.maxPages`. Sending the
 * paid ceiling here is what left the free cap unenforced before spec 0002.
 */
export interface EngineLimits {
  readonly maxBytes: number;
  readonly maxPages: number;
}

/**
 * What opening a document tells the main thread.
 *
 * Counts and flags only. No text, no file name, no bytes: the document itself
 * never leaves the worker.
 */
export interface DocumentSummary {
  readonly pageCount: number;
  /**
   * Per page: does this page carry a text layer? Feature 7 turns this into the
   * scanned page warnings; the scaffold only has to produce it honestly.
   */
  readonly pagesWithText: readonly boolean[];
}

/**
 * What a completed redaction removed. Counts and enumerated kinds only.
 *
 * This and `DocumentSummary` are the shape feature 11 is allowed to log, which
 * is why neither carries a free string field. See `LoggablePayload`.
 */
export interface RedactionOutcome {
  readonly pageCount: number;
  readonly removedByType: Readonly<Partial<Record<DetectorKind, number>>>;
  readonly pagesWithoutText: number;
  readonly sanitized: readonly SanitizedKind[];
}

/**
 * Everything this feature may hand to a log, an analytics event or an error
 * report. INV-4.
 *
 * The point of this type is what is missing: no member carries a free `string`
 * field, so there is nowhere for a file name or a snippet to be put by accident.
 * The string literal unions in here are enumerated kinds, which is the whole
 * difference. `tests/unit/loggable.test.ts` holds a type level gate over this
 * union, so widening it with a free string fails `pnpm typecheck` rather than
 * quietly handing feature 11 something to leak.
 *
 * `ReviewMatch` is deliberately absent. It carries document text.
 */
export type LoggablePayload =
  | DocumentSummary
  | RedactionOutcome
  | EngineErrorKind
  | ProgressPhase
  | DetectorKind
  | SanitizedKind;

/* Main thread to worker. */

/**
 * Every message carries `jobId` beside `id`.
 *
 * `id` names one operation; `jobId` names the session it belongs to. Both are
 * needed: `cancel` aborts an operation and leaves the session open (INV-8), and
 * a reply belonging to a session that has since been replaced has to be
 * droppable without guessing.
 */
interface Envelope {
  readonly id: string;
  readonly jobId: string;
}

export interface OpenRequest extends Envelope {
  readonly kind: "open";
  /** Transferred, never copied, so the main thread's view is neutered. */
  readonly bytes: ArrayBuffer;
  /** From the entitlement snapshot, which comes from the typed config module. */
  readonly limits: EngineLimits;
  /** `config.matchContextChars`. Never a literal (INV-9). */
  readonly contextChars: number;
}

export interface RedactRequest extends Envelope {
  readonly kind: "redact";
  /** Ids only. The worker resolves each against its own private target map. */
  readonly matchIds: readonly MatchId[];
}

export interface CancelRequest extends Envelope {
  readonly kind: "cancel";
}

export type RequestMessage = OpenRequest | RedactRequest | CancelRequest;

/* Worker to main thread. */

/**
 * Opening finished.
 *
 * Keeps the name spec 0001 fixed. Redaction reports `redacted` instead, which is
 * slightly asymmetric and deliberately so: renaming a kind 0001 fixed is the
 * redesign 0001 asked us not to do, and a flat kind keeps TypeScript narrowing
 * on one field.
 */
export interface ResultMessage extends Envelope {
  readonly kind: "result";
  readonly summary: DocumentSummary;
  /** Empty until feature 6 fills it. */
  readonly matches: readonly ReviewMatch[];
}

export interface RedactedMessage extends Envelope {
  readonly kind: "redacted";
  /** Transferred. The main thread holds it only until the download is handed over. */
  readonly output: ArrayBuffer;
  readonly outcome: RedactionOutcome;
}

export interface ProgressMessage extends Envelope {
  readonly kind: "progress";
  readonly phase: ProgressPhase;
}

export interface ErrorMessage extends Envelope {
  readonly kind: "error";
  /** The whole payload. Deliberately nothing else. */
  readonly errorKind: EngineErrorKind;
}

export type ResponseMessage =
  ResultMessage | RedactedMessage | ProgressMessage | ErrorMessage;

/**
 * Raised on the main thread when a job fails.
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

/**
 * Raised when an operation was cancelled rather than when it failed.
 *
 * Not an `EngineErrorKind`, because cancelling is not a failure and the visitor
 * should not be shown one. INV-8: `cancel` aborts one operation and leaves the
 * session open; `release` ends the session. Neither word ever means the other.
 */
export class OperationCancelled extends Error {
  constructor() {
    super("cancelled");
    this.name = "OperationCancelled";
  }
}
