/**
 * How a custom term's text is read. Spec 0017, *Matching rules*.
 *
 * The one home of `prepareTerm`, `foldTerm` and `termRefusal`, so the page's
 * list, the worker's gate and the matcher in `src/detect/terms.ts` judge a
 * term by the same rules, and a term the page accepts is never one the worker
 * refuses (AC-27).
 *
 * IMPORTS NOTHING. Lint holds it (`redactnest/term-text`): it is the one
 * module `src/detect` may take from `@/lib` (INV-5), so anything it imported
 * would cross the detector wall with it, into the worker's chunk.
 *
 * A term is the visitor's own words. Nothing here keeps, logs or sends one
 * (INV-1): every function is pure, text in and text or a kind out.
 */

/**
 * The fewest code points a term may hold. A rule about matching, not a cap on
 * the visitor: a one character whole word floods the list, so it lives here
 * rather than in `config` (spec 0017, *Matching rules*).
 */
export const TERM_MIN_CHARS = 2;

/**
 * Why a term was not added, in the order they are judged. Spec 0017, AC-4.
 * Their words live in `TERM_REFUSAL_TEXT` in `src/lib/flow-text.ts`.
 */
export const TERM_REFUSALS = Object.freeze([
  "too-short",
  "too-long",
  "no-letter-or-digit",
  "duplicate",
  "list-full",
] as const);

export type TermRefusal = (typeof TERM_REFUSALS)[number];

/** The two caps a refusal reads, from `config` on the page and `limits` in the worker. */
export interface TermCaps {
  readonly maxTerms: number;
  readonly maxTermChars: number;
}

// Each pattern below matches exactly one code point, anchored at both ends
// with no quantifier, so none can backtrack (spec 0005, INV-7).

const WHITESPACE = /^\s$/u;
const MARK = /^\p{M}$/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Hyphen and dash styles: `-`, U+2010 to U+2015 and U+2212 minus. The same
 * set as the detectors' `HYPHEN` in `src/detect/text.ts`, written out because
 * this module imports nothing; `tests/unit/term-text.test.ts` holds the two
 * equal (AC-7).
 */
const HYPHEN = /^[-\u2010-\u2015\u2212]$/u;

/** Apostrophe styles that fold to one (AC-7): `'`, `‘`, `’` and `ʼ`. */
const APOSTROPHES: ReadonlySet<string> = new Set(["'", "\u2018", "\u2019", "\u02bc"]);

/**
 * Invisible format characters that read as nothing (AC-7): soft hyphen, zero
 * width non joiner and joiner, word joiner and byte order mark.
 */
const INVISIBLE: ReadonlySet<string> = new Set([
  "\u00ad",
  "\u200c",
  "\u200d",
  "\u2060",
  "\ufeff",
]);

/** A zero width space reads as a space (AC-7). */
const ZERO_WIDTH_SPACE = "\u200b";

/**
 * A term as it is judged and kept: trimmed, with each inner run of whitespace
 * collapsed to one space (AC-3). The worker refuses a term this would change,
 * so only prepared text ever reaches it (AC-27).
 */
export function prepareTerm(text: string): string {
  return text.trim().replace(/\s+/gu, " ");
}

/** Is this code point a combining mark? */
export function isMark(point: string): boolean {
  return MARK.test(point);
}

/** Is this code point an invisible format character that reads as nothing? */
export function isInvisible(point: string): boolean {
  return INVISIBLE.has(point);
}

/** Does this code point read as whitespace once folded? */
export function readsAsSpace(point: string): boolean {
  return point === ZERO_WIDTH_SPACE || WHITESPACE.test(point);
}

/**
 * One code point, folded. Spec 0017, AC-7, applied alike to the term and to
 * the page, so they meet in the middle.
 *
 * Compatibility decomposed (NFKD, which reads the page as detection already
 * does, NFKC, and then takes each mark apart from its letter), every
 * combining mark removed, then case folded, upper then lower, so `ß` reads as
 * `ss` and `Straße` matches `STRASSE`. Decomposed and stripped once more,
 * since a case change can give a letter its mark back (`İ` lowers to `i` and
 * a dot). Then apostrophes fold to `'`, hyphens and dashes to `-`, whitespace
 * and a zero width space to one space, and the invisible format characters to
 * nothing. Gives 0 or more code points: `é` gives `e`, `ß` gives `ss`, a
 * combining mark gives nothing.
 */
export function foldPoint(point: string): string {
  if (INVISIBLE.has(point)) return "";
  if (readsAsSpace(point)) return " ";
  if (APOSTROPHES.has(point)) return "'";
  if (HYPHEN.test(point)) return "-";

  const cased = withoutMarks(point.normalize("NFKD")).toUpperCase().toLowerCase();
  let folded = "";
  for (const each of withoutMarks(cased.normalize("NFKD"))) {
    if (INVISIBLE.has(each)) continue;
    if (readsAsSpace(each)) folded += " ";
    else if (APOSTROPHES.has(each)) folded += "'";
    else if (HYPHEN.test(each)) folded += "-";
    else folded += each;
  }
  return folded;
}

/**
 * The marks a letter carries, taken from a cluster: the letter and the
 * combining marks that follow it on the page or in the term. Decomposed, so
 * the marks come in canonical order however they were written. Spec 0017,
 * AC-32: outside Latin, Greek and Cyrillic a match whose marks differ is
 * listed unticked with the `marks` note.
 */
export function clusterMarks(cluster: string): string {
  let marks = "";
  for (const each of cluster.normalize("NFKD")) {
    if (MARK.test(each)) marks += each;
  }
  return marks;
}

function withoutMarks(text: string): string {
  let kept = "";
  for (const each of text) {
    if (!MARK.test(each)) kept += each;
  }
  return kept;
}

/**
 * A whole term, folded, for telling two terms apart (AC-4): each code point
 * through `foldPoint`, each run of whitespace collapsed to one space, and
 * trimmed. Two terms with the same fold find exactly the same places, so the
 * second is refused as `duplicate`.
 */
export function foldTerm(text: string): string {
  let folded = "";
  for (const point of text) folded += foldPoint(point);
  return folded.replace(/ +/gu, " ").trim();
}

/** A term's length in code points, never UTF-16 units. */
export function termLength(text: string): number {
  return [...text].length;
}

/**
 * Why this prepared term may not be added, or `null` when it may. Spec 0017,
 * AC-4, judged in `TERM_REFUSALS` order, so the first that applies is the one
 * given.
 *
 * `listedFolds` is `foldTerm` of every term already listed: the tab's list on
 * the page, or the request's own earlier terms in the worker. Its size is how
 * many are listed, so a term past `caps.maxTerms` is `list-full`.
 */
export function termRefusal(
  prepared: string,
  listedFolds: ReadonlySet<string>,
  caps: TermCaps,
): TermRefusal | null {
  const length = termLength(prepared);
  if (length < TERM_MIN_CHARS) return "too-short";
  if (length > caps.maxTermChars) return "too-long";
  if (!LETTER_OR_DIGIT.test(prepared)) return "no-letter-or-digit";
  if (listedFolds.has(foldTerm(prepared))) return "duplicate";
  if (listedFolds.size >= caps.maxTerms) return "list-full";
  return null;
}
