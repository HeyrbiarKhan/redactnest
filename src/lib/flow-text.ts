/**
 * Every word the redact flow shows for a step, a failure, a result or the
 * plan. Spec 0007, *Phase copy*, *Failure copy* and *Result card copy*, and
 * spec 0012, AC-5 and AC-6.
 *
 * Typed as records over `EngineErrorKind`, `ProgressPhase`, `SanitizedKind` and
 * `EntitlementAccount`, so a kind added to the protocol without its words fails
 * `pnpm typecheck` (AC-16). A failure's words are chosen by its kind alone (a
 * run refusal's also by whether anything is ticked) and read caps only from the
 * job's frozen entitlement (spec 0002, INV-5) and from `config` (spec 0007,
 * INV-3, as spec 0012 amends it for the paid figure), so no line can carry a
 * page, an item, a count from the document or the file name (INV-3).
 */

import { config } from "@/config";
import { countText } from "@/lib/count-text";
import { countedKinds, lookedFor, TERM_GROUP_NOUN } from "@/lib/detectors";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { PRICING_PATH, SIGN_IN_PATH } from "@/lib/routes";
import { NOT_SEARCHED_REASONS, type NotSearchedReason } from "@/lib/session";
import { TERM_MIN_CHARS, termLength, type TermRefusal } from "@/lib/term-text";
import type {
  EngineErrorKind,
  EntitlementAccount,
  EntitlementSnapshot,
  ProgressPhase,
  ResultCounts,
  SanitizedKind,
} from "@/worker/protocol";

/** `a and b`, `a, b and c`: British style, with no comma before the last part. */
const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });

/* Failures. */

/**
 * A link the plan line or the cap callout offers. It always opens a new tab,
 * so the tool keeps the visitor's file while they sign in or pay, and says so
 * to assistive technology (`NEW_TAB`). Spec 0012, AC-5 and AC-6.
 */
export interface PlanLink {
  readonly label: string;
  readonly href: typeof PRICING_PATH | typeof SIGN_IN_PATH;
}

/**
 * The free cap's way forward (spec 0012, AC-6): the account's new tab link, if
 * one helps, and the button that checks the plan and opens the same file again.
 */
export interface PlanActions {
  readonly link: PlanLink | null;
  readonly recheck: string;
}

/** What a failure callout says: its heading, what happened, and what to do. */
export interface FailureText {
  readonly title: string;
  readonly body: string;
  readonly next: string;
  /** Only on a free cap with billing on (spec 0012, AC-6). */
  readonly plan?: PlanActions;
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

const GET_PRO: PlanLink = Object.freeze({
  label: `Get ${PRO_PLAN.name}`,
  href: PRICING_PATH,
});

const SIGN_IN_AGAIN: PlanLink = Object.freeze({
  label: "Sign in again",
  href: SIGN_IN_PATH,
});

const SIGN_IN: PlanLink = Object.freeze({ label: "Sign in", href: SIGN_IN_PATH });

const SEE_PRO: PlanLink = Object.freeze({
  label: `see what ${PRO_PLAN.name} adds`,
  href: PRICING_PATH,
});

/**
 * A free cap's next step, by the account frozen into the job (spec 0012,
 * AC-6). Never the split advice: on the free plan the way past the cap is Pro,
 * and every step ends by opening the same file again here.
 */
const CAP_NEXT: Readonly<Record<EntitlementAccount, string>> = Object.freeze({
  none: `Sign in and get ${PRO_PLAN.name}, then open it again here.`,
  "signed-in": `Get ${PRO_PLAN.name}, then open it again here.`,
  "sign-in-needed": `Sign in again to use ${PRO_PLAN.name}, then open it again here.`,
  unknown: "We couldn't check your plan. Check it, then open it again.",
});

/**
 * The cap callout's new tab link, by account. Get Pro for an anonymous visitor
 * too, the path AC-7 walks: Pricing's Subscribe signs them in on the way to
 * checkout, and a Pro user who was merely signed out lands on "You're already
 * on Pro." None when the plan could not be checked, because a link to buy
 * would mislead someone who may already hold Pro; the button is the way.
 */
const CAP_LINK: Readonly<Record<EntitlementAccount, PlanLink | null>> = Object.freeze({
  none: GET_PRO,
  "signed-in": GET_PRO,
  "sign-in-needed": SIGN_IN_AGAIN,
  unknown: null,
});

const RECHECK = "Check my plan and open it again";

/** The split advice, for a cap no plan lifts. */
function splitAdvice(pageCap: number): string {
  return `Split it into parts of ${pageCap} pages or fewer in your PDF app, and redact each one.`;
}

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
  // Names the cap (AC-17). A free cap with billing on points to Pro by the
  // job's account, with the way to open the same file again (spec 0012,
  // AC-6); a paid cap, and a free one on a build with no Pro to sell, keep
  // the split advice.
  "too-many-pages": ({ tier, pageCap, account }) => {
    const title = `This PDF has more than ${pageCap} pages`;
    if (tier === "paid") {
      return {
        title,
        body: `RedactNest handles up to ${pageCap} pages.`,
        next: splitAdvice(pageCap),
      };
    }
    if (!config.billingEnabled) {
      return {
        title,
        body: `The free limit is ${pageCap} pages.`,
        next: splitAdvice(pageCap),
      };
    }
    return {
      title,
      body: `The free plan handles up to ${pageCap} pages. ${PRO_PLAN.name} handles up to ${config.maxPages}.`,
      next: CAP_NEXT[account],
      plan: Object.freeze({ link: CAP_LINK[account], recheck: RECHECK }),
    };
  },
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

/* The plan. */

/**
 * A plan line, in order: plain words and the links between them, and for an
 * answer that could not be checked, the button that asks again.
 */
export interface PlanLine {
  readonly parts: readonly (string | PlanLink)[];
  readonly tryAgain?: string;
}

/**
 * The plan line's words, by the page's answer (spec 0012, AC-5). Typed over
 * the account kinds, so a kind added without words fails `pnpm typecheck`.
 * Only `signed-in` reads the tier, because only a confirmed sign in may be
 * paid (INV-2). Each line is the account's next step.
 */
export const PLAN_TEXT: Readonly<
  Record<EntitlementAccount, (answer: EntitlementSnapshot) => PlanLine>
> = Object.freeze({
  none: () => ({
    parts: [SIGN_IN, ", or ", SEE_PRO, "."],
  }),
  "signed-in": ({ tier }) =>
    tier === "paid"
      ? { parts: [`Signed in with ${PRO_PLAN.name}.`] }
      : { parts: [GET_PRO, ` for up to ${config.maxPages} pages a document.`] },
  "sign-in-needed": () => ({
    parts: [
      "Your sign in has expired, so the free limit applies. ",
      SIGN_IN_AGAIN,
      ` to use ${PRO_PLAN.name}.`,
    ],
  }),
  unknown: () => ({
    parts: ["We couldn't check your plan, so the free limit applies for now."],
    tryAgain: "Try again",
  }),
});

/** Said to assistive technology after every plan link's label. */
export const NEW_TAB = "opens in a new tab";

/** The plan line's words for the page's answer. */
export function planLine(answer: EntitlementSnapshot): PlanLine {
  return PLAN_TEXT[answer.account](answer);
}

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

/**
 * The full drop zone's helper (spec 0012, AC-5): what checking says until the
 * page's first answer, then the cap that answer gives and the plan it is on.
 * A build with billing off has no plans to name and nothing to check, so it
 * names the free cap from the start, the only cap such a build answers with.
 */
export function dropZoneHelper(answer: EntitlementSnapshot | null): string {
  if (!config.billingEnabled)
    return `Up to ${answer?.pageCap ?? config.freePageCap} pages`;
  if (answer === null) return PHASE_TEXT["checking-entitlement"];
  const plan = answer.tier === "paid" ? PRO_PLAN : FREE_PLAN;
  return `Up to ${answer.pageCap} pages on ${plan.name}`;
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
  return `${countText(ticked)} of ${countText(tickable)} found ${tickable === 1 ? "item" : "items"} will be removed.`;
}

/**
 * The main action's label (AC-6). With nothing ticked the run removes nothing,
 * so the button says what it makes instead (INV-2).
 */
export function redactLabel(ticked: number): string {
  if (ticked === 0) return "Make a cleaned copy";
  return `Redact ${countText(ticked)} ${ticked === 1 ? "item" : "items"}`;
}

/* The rail and the found items column (spec 0013, AC-14 to AC-19). */

/**
 * The lock line, at the foot of the rail, and inside the action panel beneath
 * Redact while one shows (AC-14, AC-16).
 */
export const LOCK_LINE = "Your file never leaves your browser.";

/**
 * The rail's three steps while nothing is open (AC-15). None repeats a button's
 * name, and none promises a "cleaned copy", which is only the button's label
 * when nothing is ticked.
 */
export const IDLE_STEPS: readonly string[] = Object.freeze([
  "Open a PDF",
  "Tick what to remove",
  "Download your new file",
]);

/** The found items column's card, and its count of every row found (AC-19). */
export const FOUND_ITEMS_TITLE = "Found items";
export const FOUND_ITEMS_NOUN = Object.freeze({
  one: "found item",
  other: "found items",
});

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

/**
 * One custom term's counts on the result card (spec 0017, AC-22): its words
 * from the tab's list, how many of its rows the engine removed
 * (`removedByTerm`), and how many it left unticked or could not remove.
 */
export interface TermResult {
  readonly text: string;
  readonly removed: number;
  readonly unticked: number;
  readonly blocked: number;
}

/**
 * `3 matches for “Acme Ltd”`: a term's count, by `TERM_GROUP_NOUN`, the term
 * quoted so a short one (`to`) never reads as part of the sentence.
 */
function termCount(count: number, text: string): string {
  return `${countText(count)} ${count === 1 ? TERM_GROUP_NOUN.one : TERM_GROUP_NOUN.other} for ${quoted(text)}`;
}

/** Each term with a count, as words, in list order. */
function termCounts(
  terms: readonly TermResult[],
  count: (term: TermResult) => number,
): readonly string[] {
  return terms.flatMap((term) =>
    count(term) > 0 ? [termCount(count(term), term.text)] : [],
  );
}

/**
 * Removed: what the engine reported, by kind (AC-11, INV-4), then each term
 * by what the engine removed for it, in list order (spec 0017, AC-22).
 */
export function removedLine(
  counts: ResultCounts,
  terms: readonly TermResult[] = [],
): string {
  const parts = [
    ...countedKinds(counts.removedByType),
    ...termCounts(terms, ({ removed }) => removed),
  ];
  return parts.length === 0 ? "Nothing" : LIST.format(parts);
}

/**
 * Left in the file: up to two sentences, what was left unticked and what could
 * not be removed (AC-11), each term named beside the detector kinds (spec
 * 0017, AC-22). Each blocked row already says why, so the reasons are not
 * repeated here.
 */
export function leftLine(
  counts: ResultCounts,
  terms: readonly TermResult[] = [],
): string {
  const unticked = [
    ...countedKinds(counts.untickedByType),
    ...termCounts(terms, ({ unticked: count }) => count),
  ];
  const blocked = [
    ...countedKinds(counts.blockedByType),
    ...termCounts(terms, ({ blocked: count }) => count),
  ];
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

/* Custom terms (spec 0017). */

/**
 * A term as the visitor typed it, in curly quotes, wherever a sentence names
 * one, so a term like `to` never reads as part of the sentence. A chip, a
 * group's heading and a remove button's name show it bare.
 */
function quoted(text: string): string {
  return `“${text}”`;
}

/** `term` or `terms`, for a count. */
function termWord(count: number): string {
  return count === 1 ? "term" : "terms";
}

/** Why a term was not searched in this file (AC-17), for a sentence to carry. */
const NOT_SEARCHED_WHY: Readonly<Record<NotSearchedReason, string>> = Object.freeze({
  "free-plan": `this file opened on the ${FREE_PLAN.name} plan`,
  "search-failed": "the search could not finish",
});

/**
 * The words the custom terms panel, its chips, its groups and the action
 * panel show (AC-1 to AC-6, AC-14, AC-15, AC-17 to AC-20). A term's own text
 * is the visitor's words, never the document's, so a line may carry it
 * (spec 0007, INV-3 and INV-4, as spec 0017 amends them).
 */
export const TERMS_TEXT = Object.freeze({
  heading: "Custom terms",
  label: "Add a name, number or phrase",
  add: "Add",
  /** Add's busy words while a search runs (AC-19; spec 0013, AC-34). */
  adding: "Searching",
  removeAll: "Remove all terms",
  remove: (text: string) => `Remove ${text}`,
  searchingOne: (text: string) => `Searching for ${quoted(text)}…`,
  searchingMany: (count: number) => `Searching for ${countText(count)} terms…`,
  /** A chip's state while its search runs. */
  searching: "Searching",
  /** A chip's count once found, by AC-14's noun. */
  matches: (count: number) =>
    `${countText(count)} ${count === 1 ? TERM_GROUP_NOUN.one : TERM_GROUP_NOUN.other}`,
  notFound: "Not found in this document",
  notFoundPartly: "Not found on the pages RedactNest could read",
  notSearched: Object.freeze({
    "free-plan": `Not searched: ${NOT_SEARCHED_WHY["free-plan"]}`,
    "search-failed": `Not searched: ${NOT_SEARCHED_WHY["search-failed"]}`,
  }) satisfies Readonly<Record<NotSearchedReason, string>>,
  /** The button that sets a term aside for this job (AC-17). */
  setAside: "Set aside for this file",
  /**
   * A set aside term's chip: what being set aside means, in words of its own
   * rather than the button's (AC-17).
   */
  setAsideState: "Set aside: not searched in this file",
  /** A set aside term's place in the list, with its reason (AC-17). */
  setAsideGroup: Object.freeze({
    "free-plan": `Set aside: not searched in this file because it opened on the ${FREE_PLAN.name} plan`,
    "search-failed": `Set aside: not searched in this file because ${NOT_SEARCHED_WHY["search-failed"]}`,
  }) satisfies Readonly<Record<NotSearchedReason, string>>,
  tryAgain: "Try again",
  recheck: "Check my plan and open it again",
  /** Beside the full drop zone while the list holds terms (AC-6). */
  kept: (count: number) =>
    `${countText(count)} custom ${termWord(count)} ${count === 1 ? "is" : "are"} kept for this tab`,
});

/**
 * The polite line once a search lands (AC-19): how many matches each term
 * found, then the terms not found, heard once. Two sentences at most, so a
 * 50 term paste is not 50 sentences. The not found words lead their own
 * sentence and keep their case, so "RedactNest" stays a name.
 */
export function termsFoundLine(
  found: readonly { readonly text: string; readonly count: number }[],
  partly: boolean,
): string {
  const counted = found.filter(({ count }) => count > 0);
  const missing = found.filter(({ count }) => count === 0);
  const notFound = partly ? TERMS_TEXT.notFoundPartly : TERMS_TEXT.notFound;
  return [
    counted.length > 0
      ? `Found ${LIST.format(counted.map(({ text, count }) => termCount(count, text)))}.`
      : null,
    missing.length > 0
      ? `${notFound}: ${LIST.format(missing.map(({ text }) => quoted(text)))}.`
      : null,
  ]
    .filter((sentence) => sentence !== null)
    .join(" ");
}

/** The polite line while a search runs (AC-19). */
export function termsSearchingLine(texts: readonly string[]): string {
  return texts.length === 1
    ? TERMS_TEXT.searchingOne(texts[0])
    : TERMS_TEXT.searchingMany(texts.length);
}

/** The polite line when a review search fails (AC-20). */
export function termsFailedLine(texts: readonly string[]): string {
  const names = LIST.format(texts.map(quoted));
  const them = texts.length === 1 ? "it" : "them";
  return `${names} could not be searched. ${TERMS_TEXT.tryAgain}, set aside or remove ${them}.`;
}

/**
 * Why a term was not added (AC-4), a record over the refusal kinds, so a kind
 * added without its words fails `pnpm typecheck`: each reason as it reads
 * after "not added because", for one refused line and for several. The caps
 * come from `config` and the term rules, never a literal.
 */
export const TERM_REFUSAL_TEXT: Readonly<
  Record<TermRefusal, { readonly one: string; readonly other: string }>
> = Object.freeze({
  "too-short": Object.freeze({
    one: `it is too short (at least ${TERM_MIN_CHARS} characters)`,
    other: `they are too short (at least ${TERM_MIN_CHARS} characters)`,
  }),
  "too-long": Object.freeze({
    one: `it is too long (at most ${countText(config.maxTermChars)} characters)`,
    other: `they are too long (at most ${countText(config.maxTermChars)} characters)`,
  }),
  "no-letter-or-digit": Object.freeze({
    one: "it has no letter or number",
    other: "they have no letter or number",
  }),
  duplicate: Object.freeze({
    one: "it is already in your list",
    other: "they are already in your list",
  }),
  "list-full": Object.freeze({
    one: `your list is full at ${countText(config.maxCustomTerms)} terms`,
    other: `your list is full at ${countText(config.maxCustomTerms)} terms`,
  }),
});

/**
 * How many refused lines a paste names, and how much of each (AC-4). Rules
 * about the line, not caps on the visitor: past these the line would bury
 * the reasons, and each reason still says how many more it refused.
 */
const REFUSED_NAMED = 20;
const REFUSED_NAME_CHARS = 60;

/** A refused line, named in full up to 60 code points, a longer one cut, with its length. */
function refusedName(text: string): string {
  const points = Array.from(text);
  if (points.length <= REFUSED_NAME_CHARS) return quoted(text);
  const cut = `${points.slice(0, REFUSED_NAME_CHARS).join("")}…`;
  return `${quoted(cut)} (${countText(termLength(text))} characters)`;
}

/**
 * The panel's line for what was not added (AC-4, INV-11): one line per
 * reason, in `order`. A reason that refused one line names it, as a typed
 * term is named (`“a” not added because it is too short …`); one that refused
 * several counts them and names those among the first 20 refused lines, then
 * how many more it refused. No refused line passes unsaid.
 */
export function refusalLines(
  refused: readonly { readonly text: string; readonly reason: TermRefusal }[],
  order: readonly TermRefusal[],
): readonly string[] {
  const named = new Set(refused.slice(0, REFUSED_NAMED));
  return order.flatMap((reason) => {
    const these = refused.filter((each) => each.reason === reason);
    if (these.length === 0) return [];
    const why = TERM_REFUSAL_TEXT[reason];
    const names = these
      .filter((each) => named.has(each))
      .map(({ text }) => refusedName(text));
    if (these.length === 1 && names.length === 1) {
      return [`${names[0]} not added because ${why.one}.`];
    }
    const counted = `${countText(these.length)} not added because ${these.length === 1 ? why.one : why.other}`;
    if (names.length === 0) return [`${counted}.`];
    const more = these.length - names.length;
    const listed = [...names, ...(more > 0 ? [`${countText(more)} more`] : [])];
    return [`${counted}: ${LIST.format(listed)}.`];
  });
}

/** The locked panel's words and way forward, by the job's account (AC-2). */
export interface TermsLocked {
  readonly line: string;
  readonly link: PlanLink | null;
  readonly recheck: string | null;
}

const LOCKED_PRO_LINE = `Custom terms come with ${PRO_PLAN.name}: add names, numbers or phrases and every place they appear is found.`;
const LOCKED_UNCONFIRMED_LINE = `This file opened on the ${FREE_PLAN.name} plan because your plan could not be confirmed, so custom terms are off for it.`;

/**
 * The locked panel on a `free` job (AC-2), a record over the account kinds:
 * Pricing, in a new tab, for an anonymous visitor or a signed in Free one;
 * the unconfirmed line and Check my plan and open it again where the plan
 * could not be confirmed (spec 0012, AC-6).
 */
export const TERMS_LOCKED_TEXT: Readonly<Record<EntitlementAccount, TermsLocked>> =
  Object.freeze({
    none: Object.freeze({ line: LOCKED_PRO_LINE, link: GET_PRO, recheck: null }),
    "signed-in": Object.freeze({ line: LOCKED_PRO_LINE, link: GET_PRO, recheck: null }),
    "sign-in-needed": Object.freeze({
      line: LOCKED_UNCONFIRMED_LINE,
      link: null,
      recheck: RECHECK,
    }),
    unknown: Object.freeze({
      line: LOCKED_UNCONFIRMED_LINE,
      link: null,
      recheck: RECHECK,
    }),
  });

/**
 * The ways on for terms not searched, by reason (AC-17, AC-18): Try again
 * where the search failed; where the file opened on the Free plan, Check my
 * plan and open it again only where the job's account offers it (AC-2); Set
 * aside and Remove for both.
 */
const WAYS_ON: Readonly<
  Record<NotSearchedReason, (them: string, recheck: boolean) => string>
> = Object.freeze({
  "free-plan": (them, recheck) =>
    `Set aside or remove ${them} to go ahead${recheck ? ", or check your plan and open the file again" : ""}`,
  "search-failed": (them) =>
    `${TERMS_TEXT.tryAgain}, set aside or remove ${them} to go ahead`,
});

/**
 * Why Make a cleaned copy waits (AC-18), or null when it may run: still
 * searching, or which terms were not searched, why, and the ways on, one
 * pair of sentences per reason. `recheck` is whether the job's account
 * offers Check my plan and open it again.
 */
export function makeWaitsLine(
  searching: boolean,
  notSearched: readonly { readonly text: string; readonly reason: NotSearchedReason }[],
  recheck: boolean,
): string | null {
  if (searching) return "Your custom terms are still being searched, so the run waits.";
  if (notSearched.length === 0) return null;
  return NOT_SEARCHED_REASONS.flatMap((reason) => {
    const texts = notSearched.filter((each) => each.reason === reason);
    if (texts.length === 0) return [];
    const names = LIST.format(texts.map(({ text }) => quoted(text)));
    const one = texts.length === 1;
    return [
      `${names} ${one ? "was" : "were"} not searched because ${NOT_SEARCHED_WHY[reason]}. ${WAYS_ON[reason](one ? "it" : "them", recheck)}.`,
    ];
  }).join(" ");
}

/** The result card's term for the set aside line (AC-22). */
export const RESULT_SET_ASIDE = "Not searched";

/** The set aside terms, each with why it was not searched (AC-22). */
export function setAsideLine(
  setAside: readonly { readonly text: string; readonly reason: NotSearchedReason }[],
): string {
  return LIST.format(
    setAside.map(
      ({ text, reason }) =>
        `${quoted(text)}, set aside because ${NOT_SEARCHED_WHY[reason]}`,
    ),
  );
}
