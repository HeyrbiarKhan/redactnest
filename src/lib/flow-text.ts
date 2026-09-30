/**
 * Every word the redact flow shows for a step, a failure or a result. Spec
 * 0007, *Phase copy*, *Failure copy* and *Result card copy*.
 *
 * Typed as records over `EngineErrorKind`, `ProgressPhase` and `SanitizedKind`,
 * so a kind added to the protocol without its words fails `pnpm typecheck`
 * (AC-16). A failure's words are chosen by its kind alone (a run refusal's also
 * by whether anything is ticked) and read caps only from the job's frozen
 * entitlement (spec 0002, INV-5), so no line can carry a page, an item, a count
 * from the document or the file name (INV-3).
 */

import { countedKinds, lookedFor } from "@/lib/detectors";
import type {
  EngineErrorKind,
  EntitlementSnapshot,
  ProgressPhase,
  ResultCounts,
  SanitizedKind,
} from "@/worker/protocol";

/** `a and b`, `a, b and c`: British style, with no comma before the last part. */
const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });

/* Failures. */

/** What a failure callout says: its heading, what happened, and what to do. */
export interface FailureText {
  readonly title: string;
  readonly body: string;
  readonly next: string;
}

/**
 * The file size cap in whole megabytes, never "0 MB" (spec 0007, *Value
 * sourcing*).
 */
function megabytes(bytes: number): string {
  return `${Math.max(1, Math.round(bytes / 1_048_576))} MB`;
}

/**
 * The next step for the two refusals no tick causes and no setting changes.
 * Said at an open as well as after a run, so it speaks of the file, never of
 * ticks: at an open there is no list to have ticked. A new copy is suggested,
 * never promised.
 */
const NEW_COPY =
  "Printing it to a new PDF from your PDF app, then opening that copy here, may help.";

/**
 * Each kind's words (AC-16, AC-17). A function of the job's own caps, because
 * the page cap that applies is the one frozen into this session, not the paid
 * ceiling: telling somebody they exceeded a limit that was never theirs is the
 * confusion spec 0002 closed.
 */
export const FAILURE_TEXT: Readonly<
  Record<EngineErrorKind, (entitlement: EntitlementSnapshot) => FailureText>
> = Object.freeze({
  "engine-unavailable": () => ({
    title: "The PDF engine didn't load",
    body: "RedactNest downloads its PDF engine once, and that didn't work.",
    next: "Check your connection, then try again.",
  }),
  encrypted: () => ({
    title: "This PDF is encrypted",
    body: "Its text is locked, so RedactNest can't read it.",
    next: "Open it in your PDF app, save a copy without the encryption, then open that copy here.",
  }),
  // The page never asks for a password (AC-17).
  "password-required": () => ({
    title: "This PDF needs a password",
    body: "RedactNest doesn't take passwords.",
    next: "Open it in your PDF app with its password, save a copy without one, then open that copy here.",
  }),
  corrupt: () => ({
    title: "This PDF can't be read",
    body: "It may be damaged, or only partly downloaded.",
    next: "If you have another copy, try that one.",
  }),
  // Spec 0004's refusal of what it cannot handle safely, and spec 0006's trim
  // proof failing away from the page edge (AC-17).
  unsupported: () => ({
    title: "RedactNest stopped to be safe",
    body: "This file holds something RedactNest can't handle safely, so it stopped rather than guess, and made no file. Two common causes: lines of text written in a way RedactNest can't rewrite, and content near a page's edge it couldn't prove it removed.",
    next: NEW_COPY,
  }),
  "too-large": ({ maxFileBytes }) => ({
    title: "This file is too big",
    body: `RedactNest takes files up to ${megabytes(maxFileBytes)}.`,
    next: "Save a smaller copy, or split it, and open that.",
  }),
  // Names the cap and suggests splitting (AC-17). Feature 10 adds the sign in
  // path for the free tier.
  "too-many-pages": ({ tier, pageCap }) => ({
    title: `This PDF has more than ${pageCap} pages`,
    body:
      tier === "free"
        ? `The free limit is ${pageCap} pages.`
        : `RedactNest handles up to ${pageCap} pages.`,
    next: `Split it into parts of ${pageCap} pages or fewer in your PDF app, and redact each one.`,
  }),
  "file-unreadable": () => ({
    title: "The file couldn't be read",
    body: "It may have been moved, renamed or deleted since you chose it.",
    next: "Choose it again.",
  }),
  "not-pdf": () => ({
    title: "This isn't a PDF",
    body: "RedactNest works on PDF files only, and this file's contents aren't a PDF, whatever its name says.",
    next: "If it's a document or an image, save or export it as a PDF first.",
  }),
  "hidden-layers": () => ({
    title: "This PDF has layers RedactNest can't redact yet",
    body: "Some of its content sits on layers a viewer can switch on and off, and RedactNest can't be sure it removes text from those.",
    next: "Save a flattened copy from your PDF app, then open that copy here.",
  }),
  // Suggests text recognition without promising it works (AC-17, AC-18).
  "no-readable-text": () => ({
    title: "RedactNest can't read any text in this PDF",
    body: "It looks like a scan, or its text is in a form RedactNest can't read, so nothing could be found and no file was made.",
    next: "Running it through text recognition (OCR) may give RedactNest text to work with.",
  }),
  "edge-text": () => ({
    title: "Text at a page's edge can't be removed cleanly",
    body: "Some text crosses the edge of a page, and RedactNest can't prove it removes it cleanly, so it made no file.",
    next: NEW_COPY,
  }),
  // The four a tick can cause. Each names the likely cause, because a
  // refusal cannot say which item it was (spec 0007, *Follow-up*).
  "redaction-overreach": () => ({
    title: "Removing what you ticked would remove more",
    body: "Something drawn across a ticked item would be cut too: most often a stamp such as CONFIDENTIAL or DRAFT, or a picture under the item. RedactNest stopped and made no file.",
    next: "Untick items that sit under a stamp or on a picture, then redact again. RedactNest can't say which item it was, so unticking one group at a time can find it.",
  }),
  "replacement-text": () => ({
    title: "A ticked item can't be removed safely",
    body: "It sits inside hidden replacement text (the words copy and paste gives instead of what's drawn), which can't be removed safely. RedactNest made no file.",
    next: "RedactNest can't say which item it was. Untick one group at a time to find it, then redact again.",
  }),
  "slanted-text": () => ({
    title: "A ticked item is set at too steep an angle",
    body: "RedactNest removes text only when it runs close to level, so it made no file.",
    next: "Untick items on crooked or rotated lines, then redact again. If this is a scan, straightening it before text recognition (OCRmyPDF's --deskew option, for one) usually avoids this.",
  }),
  // True whether or not a ticked item survived: the check can fail on lines
  // the file writes in a way RedactNest can't rewrite (AC-17).
  "redaction-incomplete": () => ({
    title: "RedactNest couldn't vouch for the clean file",
    body: "Its final check of the new file didn't match what it expected, so it made no file rather than hand you one it can't vouch for. Likely causes: an accent drawn as its own mark at the end of a ticked name, a small footnote marker straight after a ticked item, or lines this file writes in a way RedactNest can't rewrite (then every run on it stops here).",
    next: "Untick items ending in an accent or followed by a footnote marker, then redact again.",
  }),
});

/** A failure's words, from its kind and the job's frozen caps alone (INV-3). */
export function failureText(
  kind: EngineErrorKind,
  entitlement: EntitlementSnapshot,
): FailureText {
  return FAILURE_TEXT[kind](entitlement);
}

/**
 * The kinds a tick can cause (AC-14). A refusal of one of these says what to
 * untick and offers no button of its own; every other refusal also offers
 * Choose another PDF, because changing a tick won't help.
 */
const TICK_CAUSED: readonly EngineErrorKind[] = Object.freeze([
  "redaction-overreach",
  "replacement-text",
  "slanted-text",
  "redaction-incomplete",
]);

export function isTickCaused(kind: EngineErrorKind): boolean {
  return TICK_CAUSED.includes(kind);
}

/** Said before a run refusal's next step when a tick could not have caused it. */
export const TICKS_WONT_HELP = "Changing what's ticked won't help with this file.";

/**
 * A run refusal's words (AC-14): its kind's own, and for a kind no tick can
 * cause, a first line saying changing the ticks won't help. Only while
 * something is ticked, so the line never advises on a choice nobody made; an
 * open failure reads `failureText`, which never mentions ticks. Whether any
 * tick is set is all it reads, never how many (INV-3).
 */
export function runRefusalText(
  kind: EngineErrorKind,
  entitlement: EntitlementSnapshot,
  tickedCount: number,
): FailureText {
  const text = failureText(kind, entitlement);
  return tickedCount > 0 && !isTickCaused(kind)
    ? { ...text, next: `${TICKS_WONT_HELP} ${text.next}` }
    : text;
}

/** The line above a run refusal's title (AC-14). */
export const RUN_REFUSAL_LEAD = "Your last run was stopped";

/**
 * A lost worker's own words (spec 0002, AC-11). Never read from
 * `FAILURE_TEXT`, even though `lost` sets `failure` to `engine-unavailable`:
 * the engine did load, and the file can be opened again (AC-16).
 */
export const LOST_TEXT = Object.freeze({
  title: "The PDF engine stopped",
  body: "The PDF engine stopped unexpectedly. Your file is still on your machine, so you can try again without choosing it a second time.",
});

/* Phases. */

/**
 * The phase line's words (AC-4). No "…" in any of them: `StatusLine` adds
 * it. `detecting` names exactly what the coverage note does.
 */
export const PHASE_TEXT: Readonly<Record<ProgressPhase, string>> = Object.freeze({
  "checking-entitlement": "Checking your plan",
  "loading-engine": "Loading the PDF engine",
  opening: "Opening your document",
  inspecting: "Reading each page",
  detecting: `Looking for ${lookedFor("conjunction")}`,
  redacting: "Removing what you ticked",
  writing: "Writing your clean file",
  verifying: "Checking every page of your clean file",
});

/** A run with nothing ticked removes nothing, so its first phase says so. */
const STRIPPING = "Stripping hidden content";

export function phaseLine(phase: ProgressPhase, tickedCount: number): string {
  return phase === "redacting" && tickedCount === 0 ? STRIPPING : PHASE_TEXT[phase];
}

/* The action panel. */

/**
 * The count line above the main action (AC-6), or null when nothing was found
 * at all. `ticked` is how many are ticked, `tickable` how many are not blocked,
 * and `found` how many were found, blocked ones included.
 */
export function tickCountLine(
  ticked: number,
  tickable: number,
  found: number,
): string | null {
  if (found === 0) return null;
  if (tickable === 0) return "None of the found items can be removed.";
  if (ticked === 0) return "Nothing is ticked, so nothing will be removed.";
  return `${ticked} of ${tickable} found ${tickable === 1 ? "item" : "items"} will be removed.`;
}

/**
 * The main action's label (AC-6). With nothing ticked the run removes nothing,
 * so the button says what it makes instead (INV-2).
 */
export function redactLabel(ticked: number): string {
  if (ticked === 0) return "Make a cleaned copy";
  return `Redact ${ticked} ${ticked === 1 ? "item" : "items"}`;
}

/* The result card. */

/** A run that removed nothing is never titled as a redaction (AC-12, INV-2). */
export function resultTitle(counts: ResultCounts): string {
  return counts.removedTotal === 0
    ? "Nothing was removed"
    : "Your redacted file is ready";
}

export const RESULT_TERMS = Object.freeze({
  removed: "Removed",
  left: "Left in the file",
  stripped: "Also stripped",
});

/** Removed: what the engine reported, by kind (AC-11, INV-4). */
export function removedLine(counts: ResultCounts): string {
  const kinds = countedKinds(counts.removedByType);
  return kinds.length === 0 ? "Nothing" : LIST.format(kinds);
}

/**
 * Left in the file: up to two sentences, what was left unticked and what could
 * not be removed (AC-11). Each blocked row already says why, so the reasons
 * are not repeated here.
 */
export function leftLine(counts: ResultCounts): string {
  const unticked = countedKinds(counts.untickedByType);
  const blocked = countedKinds(counts.blockedByType);
  const sentences = [
    ...(unticked.length > 0 ? [`${LIST.format(unticked)} you left unticked.`] : []),
    ...(blocked.length > 0
      ? [`${LIST.format(blocked)} RedactNest couldn't remove.`]
      : []),
  ];
  return sentences.length === 0 ? "Nothing RedactNest found." : sentences.join(" ");
}

/**
 * What each stripped kind is called. `accessibility-tags` says it as a loss,
 * because a screen reader reads the clean file less well without them (spec
 * 0004, *Follow-up*).
 */
export const SANITIZED_TEXT: Readonly<Record<SanitizedKind, string>> = Object.freeze({
  "document-info": "document info",
  "xmp-metadata": "XMP metadata",
  annotations: "annotations",
  "form-fields": "form fields",
  attachments: "attachments",
  bookmarks: "bookmarks",
  "hidden-layers": "hidden layers",
  javascript: "JavaScript",
  "incremental-versions": "earlier versions",
  "page-thumbnails": "page thumbnails",
  "accessibility-tags":
    "accessibility tags (screen readers will read the clean file less well)",
});

/** Also stripped: the kinds in the order the run reported them (AC-11). */
export function strippedLine(sanitized: readonly SanitizedKind[]): string {
  if (sanitized.length === 0) return "Nothing else needed stripping.";
  const list = LIST.format(sanitized.map((kind) => SANITIZED_TEXT[kind]));
  return list.charAt(0).toUpperCase() + list.slice(1);
}

/** Once Download has handed the file over (AC-13). */
export const DOWNLOADED_LINE = "Your browser has the file.";
