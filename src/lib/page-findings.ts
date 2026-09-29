/**
 * What the page readings mean for the visitor, in words. Spec 0006, *Page
 * findings*, *Page lists* and *Copy*.
 *
 * Pure helpers over the summary, so the file name, the warnings at open, the
 * warning repeated at download and the coverage note's qualifier all come from
 * one predicate over one value and can never contradict each other (INV-5).
 * Typed as records over `PageFinding`, so a finding added to the protocol
 * without its words fails `pnpm typecheck`. Feature 8 owns the final wording;
 * this is the plain first draft the spec wrote.
 */

import {
  PAGE_FINDINGS,
  type Concealment,
  type DocumentSummary,
  type PageFinding,
  type ReviewMatch,
} from "@/worker/protocol";

/**
 * How loudly a finding speaks. A warning names the file partly redacted and
 * sits in the warning callout; a note sits in the untitled note callout and
 * changes nothing; `blank` says nothing at all.
 */
export type FindingTone = "warning" | "note" | "quiet";

export const FINDING_TONE: Readonly<Record<PageFinding, FindingTone>> = Object.freeze({
  "covered-text": "warning",
  "hidden-text": "warning",
  scanned: "warning",
  "drawn-only": "warning",
  "unreadable-text": "warning",
  "bare-picture": "warning",
  "off-page-picture": "warning",
  "machine-read-text": "note",
  "off-page-content": "note",
  blank: "quiet",
});

/** The warning findings, in display order. */
export const WARNING_FINDINGS: readonly PageFinding[] = Object.freeze(
  PAGE_FINDINGS.filter((finding) => FINDING_TONE[finding] === "warning"),
);

/** The note findings, in display order. */
export const NOTE_FINDINGS: readonly PageFinding[] = Object.freeze(
  PAGE_FINDINGS.filter((finding) => FINDING_TONE[finding] === "note"),
);

/**
 * The warnings after which the advice line is shown: the ones text
 * recognition can fix (AC-20).
 */
const ADVISED: readonly PageFinding[] = Object.freeze([
  "scanned",
  "drawn-only",
  "unreadable-text",
  "bare-picture",
]);

/**
 * Does any page carry a warning? The one predicate behind the partly redacted
 * name, the download warning and the coverage note's qualifier (AC-23, INV-5).
 * `blank`, `machine-read-text` and `off-page-content` never make it true.
 */
export function isPartly(summary: DocumentSummary): boolean {
  return summary.pages.some((page) =>
    page.findings.some((finding) => FINDING_TONE[finding] === "warning"),
  );
}

/** The one based numbers of the pages carrying `finding`, ascending. */
export function pagesWith(
  summary: DocumentSummary,
  finding: PageFinding,
): readonly number[] {
  return summary.pages.flatMap((page, index) =>
    page.findings.includes(finding) ? [index + 1] : [],
  );
}

/**
 * Page numbers as words. Spec 0006, *Page lists*.
 *
 * Ascending, each once; three or more in a row become a range, two in a row
 * stay a pair; the parts joined as a list. "Page 2", "Pages 2 and 5",
 * "Pages 3 to 9", "Pages 1, 3 to 9 and 12". British list style, with no comma
 * before the last part, as the spec's examples read. Plain text, so a screen
 * reader reads it as it stands (AC-27).
 */
export function pageList(pages: readonly number[], { lower = false } = {}): string {
  const sorted = [...new Set(pages)].sort((a, b) => a - b);
  const parts: string[] = [];

  for (let start = 0; start < sorted.length;) {
    let end = start;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end += 1;
    if (end - start >= 2) {
      parts.push(`${sorted[start]} to ${sorted[end]}`);
    } else {
      for (let at = start; at <= end; at += 1) parts.push(String(sorted[at]));
    }
    start = end + 1;
  }

  const word = sorted.length === 1 ? "Page" : "Pages";
  const list = `${word} ${LIST.format(parts)}`;
  return lower ? list.charAt(0).toLowerCase() + list.slice(1) : list;
}

const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** A line with a form for one page and a form for several. */
interface Worded {
  readonly one: (pages: string) => string;
  readonly many: (pages: string) => string;
}

/**
 * Each finding's line at open. Spec 0006, *Copy*. `blank` has none: it is
 * never shown.
 */
const FINDING_TEXT: Readonly<Record<Exclude<PageFinding, "blank">, Worded>> =
  Object.freeze({
    "covered-text": {
      one: (pages) =>
        `${pages} has text hidden under a box or shape drawn over it. It may look redacted, but the text is still in the file.`,
      many: (pages) =>
        `${pages} have text hidden under a box or shape drawn over it. It may look redacted, but the text is still in the file.`,
    },
    "hidden-text": {
      one: (pages) =>
        `${pages} has text you can't see, such as text the same colour as the page. It is still in the file.`,
      many: (pages) =>
        `${pages} have text you can't see, such as text the same colour as the page. It is still in the file.`,
    },
    scanned: {
      one: (pages) =>
        `${pages} is a scanned image. Text in the image can't be found or removed.`,
      many: (pages) =>
        `${pages} are scanned images. Text in the images can't be found or removed.`,
    },
    "drawn-only": {
      one: (pages) =>
        `${pages} has no text RedactNest can read. Anything on it, such as words in a picture or drawn as shapes, can't be found or removed.`,
      many: (pages) =>
        `${pages} have no text RedactNest can read. Anything on them, such as words in a picture or drawn as shapes, can't be found or removed.`,
    },
    "unreadable-text": {
      one: (pages) =>
        `${pages} has text in a font RedactNest can't read, so that text can't be found or removed.`,
      many: (pages) =>
        `${pages} have text in a font RedactNest can't read, so that text can't be found or removed.`,
    },
    "bare-picture": {
      one: (pages) =>
        `${pages} has a picture with no text over it. Words inside a picture can't be found or removed.`,
      many: (pages) =>
        `${pages} have pictures with no text over them. Words inside a picture can't be found or removed.`,
    },
    "off-page-picture": {
      one: (pages) =>
        `${pages} has a picture that reaches outside the visible page. RedactNest doesn't clear pictures, so the part outside is still in the file.`,
      many: (pages) =>
        `${pages} have pictures that reach outside the visible page. RedactNest doesn't clear pictures, so the part outside is still in the file.`,
    },
    "machine-read-text": {
      one: (pages) =>
        `${pages} is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right.`,
      many: (pages) =>
        `${pages} are scans with machine read text. RedactNest reads that text, so it can only find what the text recognition got right.`,
    },
    "off-page-content": {
      one: (pages) =>
        `${pages} has text or drawings outside its visible area. RedactNest removes them when you redact, since nobody can see them.`,
      many: (pages) =>
        `${pages} have text or drawings outside their visible area. RedactNest removes them when you redact, since nobody can see them.`,
    },
  });

/** One finding's line, naming the pages that carry it, or null when none do. */
export function findingLine(
  summary: DocumentSummary,
  finding: PageFinding,
): string | null {
  if (finding === "blank") return null;
  const pages = pagesWith(summary, finding);
  if (pages.length === 0) return null;
  const worded = FINDING_TEXT[finding];
  const list = pageList(pages);
  return pages.length === 1 ? worded.one(list) : worded.many(list);
}

/**
 * One line per warning present, in `PAGE_FINDINGS` order, each naming its
 * pages (AC-20). A page carrying two warnings is named in both lines.
 */
export function warningLines(summary: DocumentSummary): readonly string[] {
  return WARNING_FINDINGS.flatMap((finding) => {
    const line = findingLine(summary, finding);
    return line === null ? [] : [line];
  });
}

/** Is the advice line shown? When text recognition could help (AC-20). */
export function showsAdvice(summary: DocumentSummary): boolean {
  return ADVISED.some((finding) => pagesWith(summary, finding).length > 0);
}

/** The crooked scan line (AC-25). */
export const CROOKED_LINE =
  "Some items on scanned pages can't be removed because the scan is slightly crooked. Straightening the scan before text recognition (OCRmyPDF's --deskew option, for one) usually fixes this.";

/**
 * Is the crooked scan line shown? Spec 0006, AC-25: when some match is
 * blocked `slanted-text` on a page that is machine read, and never otherwise.
 * A slanted line on a born digital page is set at an angle on purpose, and
 * straightening a scan would not help it.
 */
export function showsCrookedLine(
  summary: DocumentSummary,
  matches: readonly Pick<ReviewMatch, "page" | "blocked">[],
): boolean {
  return matches.some(
    (match) =>
      match.blocked === "slanted-text" &&
      (summary.pages[match.page - 1]?.findings.includes("machine-read-text") ?? false),
  );
}

/**
 * The note lines at open. Spec 0006, AC-21: one per note finding present, in
 * `PAGE_FINDINGS` order, then the crooked scan line last. A note is never
 * among the warnings.
 */
export function noteLines(
  summary: DocumentSummary,
  matches: readonly Pick<ReviewMatch, "page" | "blocked">[],
): readonly string[] {
  const lines = NOTE_FINDINGS.flatMap((finding) => {
    const line = findingLine(summary, finding);
    return line === null ? [] : [line];
  });
  return showsCrookedLine(summary, matches) ? [...lines, CROOKED_LINE] : lines;
}

/** The all clear line, in place of any warning (AC-19). */
export const ALL_CLEAR = "RedactNest can read the text on every page.";

/** The warning callout's title at open (AC-20). */
export const OPEN_WARNING_TITLE = "Some pages can't be fully checked";

/** The advice after the warning lines (AC-20). */
export const ADVICE =
  "If you have the original, run it through text recognition (OCR) first, then open the result here.";

/** The download warning's title (AC-22). */
export const DOWNLOAD_WARNING_TITLE = "Not every page was checked";

/** The download warning's last line, saying why the name reads as it does (AC-22). */
export const PARTLY_REASON = "That is why the file's name ends in partly redacted.";

/**
 * A concealed row's line (AC-24), in its description after any blocked
 * reason. The match is still tickable; the line says why nobody saw it.
 */
export const CONCEALED_TEXT: Readonly<Record<Concealment, string>> = Object.freeze({
  covered: "Hidden under a box on the page.",
  hidden: "Not visible on the page.",
});

/**
 * The line at `complete` naming the pages the trim removed text or drawings
 * from (AC-22), in an untitled note before the download warning, or null when
 * it removed nothing.
 */
export function removedOffPageLine(summary: DocumentSummary): string | null {
  const pages = pagesWith(summary, "off-page-content");
  if (pages.length === 0) return null;
  return `Text and drawings outside the visible area of ${pageList(pages, { lower: true })} were removed.`;
}
