/**
 * Every word on the search pages, in one place. Spec 0024, *Feature design*,
 * INV-2: one typed, frozen record per page over a closed set, like
 * `PAGE_FINDINGS`, so a page added to `SEARCH_PAGES` without its words fails
 * `pnpm typecheck`.
 *
 * A search page claims only what the *Claim register* lists (INV-1). Each
 * sentence that says what RedactNest does with a document carries a comment
 * naming its register row and that row's source; a sentence about PDFs in
 * general (row G1) is a "can" sentence. Engine detail (hidden data, the page
 * warnings, refusals, exact conditions) lives on `/security`, linked, never
 * here. `tests/component/app/search-pages.test.tsx` holds the banned phrases
 * and the idea counts (AC-5, AC-6).
 *
 * Each idea is said once in a page's content (AC-6, the home page's rule,
 * spec 0013 INV-11): upload in any form once, "in your browser" at most once,
 * removed then marked once, each in the element the *Page frames* table names
 * for it. The lead carries none of the three.
 *
 * The social card and its alt file carry each page's eyebrow and headline:
 * `scripts/make-brand.mjs` reads both from the built page
 * (`search-eyebrow` and the `h1`), so the picture says what the page says,
 * and `opengraph-image.alt.txt` holds `socialAlt` word for word
 * (`tests/unit/brand-files.test.ts`, AC-16, INV-4).
 */

import {
  ClipboardCopy,
  Eraser,
  Laptop,
  ListChecks,
  Search,
  ShieldCheck,
} from "lucide-react";

import { lookedFor } from "@/lib/detectors";
import { BLACK_BOX_PATH, REDACT_PDF_PATH, REMOVE_TEXT_PATH } from "@/lib/routes";
import type { PageKind } from "@/telemetry/events";
import type { CoverFigureProps, CoverPanel } from "@/ui/cover-figure";
import type { FeatureItem } from "@/ui/feature-list";

/**
 * The search pages, a closed set whose order is the footer's and the
 * sitemap's. Each word names a page in its record, its route and its count
 * (INV-5), so the list is held to `PageKind`: a search page with no telemetry
 * kind fails `pnpm typecheck` here (AC-12).
 */
export const SEARCH_PAGES = Object.freeze([
  "redact-pdf",
  "remove-text",
  "black-box",
] as const satisfies readonly PageKind[]);

export type SearchPageKind = (typeof SEARCH_PAGES)[number];

/**
 * One part of a page's answer section, in order: a paragraph, an ordered list
 * of checks, or the place where `removeTextTermsLine` stands, which the
 * template fills only with billing on (AC-8).
 */
export type AnswerPart =
  | Readonly<{ kind: "paragraph"; text: string }>
  | Readonly<{ kind: "checks"; items: readonly string[] }>
  | Readonly<{ kind: "terms" }>;

export interface SearchPageText {
  /** From `src/lib/routes.ts`. */
  readonly path: string;
  /** The page's title, before the root template adds " · RedactNest". */
  readonly title: string;
  readonly description: string;
  readonly eyebrow: string;
  /** The page's one `h1`. */
  readonly headline: string;
  /** Its link in the footer's Guides group and in the other pages' More guides. */
  readonly navLabel: string;
  /** Both buttons into the tool. */
  readonly primary: string;
  readonly lead: string;
  /** The trio, each title an `h2`. */
  readonly features: readonly FeatureItem[];
  /** The answer section's `h2`. */
  readonly answerTitle: string;
  readonly answer: readonly AnswerPart[];
  /** The drawing after the answer's parts, before the look over line: `black-box` only. */
  readonly figure: CoverFigureProps | null;
  /** The social card's alt text, `RedactNest. <eyebrow>. <headline>.` */
  readonly socialAlt: string;
}

const paragraph = (text: string): AnswerPart =>
  Object.freeze({ kind: "paragraph", text });

const checks = (items: readonly string[]): AnswerPart =>
  Object.freeze({ kind: "checks", items: Object.freeze([...items]) });

const TERMS: AnswerPart = Object.freeze({ kind: "terms" });

/**
 * `/remove-text-from-pdf`'s one line about custom terms, rendered only with
 * billing on (AC-8). Row M6, the register's own wording: spec 0017, AC-1 (a
 * Pro visitor adds their own words, which RedactNest looks for beside the
 * detectors) and spec 0012, INV-8 (Pro promises only what it does today).
 * "Looks for", never "finds" (spec 0018, AC-5). It is the one sentence
 * besides the cap line that names a plan; the caller passes `PRO_PLAN.name`.
 */
export function removeTextTermsLine(planName: string): string {
  return `With ${planName} you can add your own words, such as names, and RedactNest looks for them too.`;
}

/** The alt text `scripts/make-brand.mjs` writes beside each card (AC-16). */
const socialAltFor = (eyebrow: string, headline: string) =>
  `RedactNest. ${eyebrow}. ${headline}.`;

/** The "More guides" heading over the links to the other search pages (AC-3). */
export const MORE_GUIDES_TITLE = "More guides";

/** The "How it works" heading over the tool's own steps (AC-3). */
export const HOW_IT_WORKS_TITLE = "How it works";

/**
 * The sentence that ends every answer section (AC-7), and its link's words.
 * Row L1 ("look over the whole document"), spec 0018, AC-5 and AC-7, which
 * put that advice under the detection limits, so the link lands there:
 * `/security#what-it-can-miss`. "Listed", never "found": a value can be
 * missed (spec 0018, AC-5).
 */
export const LOOK_OVER_LINE =
  "Look over the whole document before you share the new file, not only what RedactNest listed and you ticked, and read";
export const LOOK_OVER_LINK_TEXT = "What it can miss";

const REDACT_PDF_EYEBROW = "Redact a PDF";
/** Carries the page's one upload (AC-6). */
const REDACT_PDF_HEADLINE = "Redact a PDF without uploading it";

const REMOVE_TEXT_EYEBROW = "Remove text from a PDF";
const REMOVE_TEXT_HEADLINE = "Take text out of a PDF, not just cover it";

const BLACK_BOX_EYEBROW = "Black box redaction";
const BLACK_BOX_HEADLINE = "A black box over text isn't redaction";

/**
 * `/black-box-redaction`'s drawing: one made up page, the same in both
 * panels, told apart only by what a copy of its text gives (spec 0018, AC-8).
 * Its own words, not `/security`'s.
 */
const BLACK_BOX_LINES = Object.freeze([
  Object.freeze({ text: "Patient referral" }),
  Object.freeze({ text: "Name:", boxed: true as const }),
  Object.freeze({ text: "Clinic: Outpatients" }),
]);

const BLACK_BOX_PANELS: readonly CoverPanel[] = Object.freeze([
  /** Row G1: a box laid over text, which a copy gives back (spec 0006). */
  Object.freeze({
    title: "A box drawn over the text",
    lines: BLACK_BOX_LINES,
    readsLabel: "A copy of the page's text gives",
    reads: "Name: Sam Taylor",
  }),
  /**
   * Row M2, and the page's one removed then marked (AC-6): spec 0004, AC-13
   * and INV-2, the self check's text part.
   */
  Object.freeze({
    title: "Removed, then marked",
    lines: BLACK_BOX_LINES,
    readsLabel: "A copy of the page's text gives",
    reads: "Name:",
  }),
]);

export const SEARCH_PAGE_TEXT: Readonly<Record<SearchPageKind, SearchPageText>> =
  Object.freeze({
    "redact-pdf": Object.freeze({
      path: REDACT_PDF_PATH,
      title: "Redact a PDF online, free and without uploading",
      /**
       * The head: rows M1 ("in your browser"; privacy claim C1, `/tool`'s
       * `connect-src 'self'`), M4 ("looks for", spec 0005 and spec 0018,
       * AC-5) and M2 ("the selectable text you tick is taken out of the
       * page"; spec 0004, AC-13 and INV-2, spec 0019, AC-12). Pinned word for
       * word by *Page frames*.
       */
      description:
        "Redact a PDF in your browser. RedactNest looks for details such as email addresses and phone numbers, and the selectable text you tick is taken out of the page.",
      eyebrow: REDACT_PDF_EYEBROW,
      headline: REDACT_PDF_HEADLINE,
      navLabel: "Redacting a PDF",
      primary: "Redact a PDF now",
      /**
       * Row M4: what RedactNest looks for, with `lookedFor()`, so the page
       * names exactly the detectors that exist, and that it lists what it
       * finds for you to choose from (spec 0005; spec 0018, AC-5: "looks
       * for", never "finds" as an outcome). None of upload, "in your browser"
       * or removed then marked (AC-6).
       */
      lead: `RedactNest looks for ${lookedFor("conjunction")} in your PDF, and lists what it finds for you to choose from.`,
      features: Object.freeze<readonly FeatureItem[]>([
        Object.freeze({
          icon: Laptop,
          /** The page's one "in your browser" (AC-6). */
          title: "Stays in your browser",
          /**
           * Row M1 in substance: the document is opened and changed inside
           * the page's worker on the visitor's device (spec 0002, INV-1;
           * privacy claim C1). No upload word: the headline carries it.
           */
          body: "RedactNest opens and changes your PDF on your own device, inside this tab.",
        }),
        Object.freeze({
          icon: ListChecks,
          title: "You choose from a list",
          /**
           * Rows M4 and M5: every item listed is yours to tick or leave, so
           * a starting tick is a suggestion (spec 0018, AC-7, What it looks
           * for).
           */
          body: "You choose which listed items to remove. A tick at the start is only a suggestion.",
        }),
        Object.freeze({
          icon: ShieldCheck,
          title: "Checked before you download",
          /** Row M3, the register's own wording: the self check fails closed (spec 0004, INV-2). */
          body: "Every page of the new file is checked. If the check fails, you get no file.",
        }),
      ]),
      answerTitle: "What redacting a PDF should do",
      answer: Object.freeze([
        /**
         * Row G1, PDFs in general and never RedactNest: a box drawn over text
         * can leave the words in the file (spec 0006, covered text), always a
         * "can" sentence. The first sentence says what redaction is for, and
         * claims nothing about any tool.
         */
        paragraph(
          "Redacting a PDF should take the words out, not only hide them. A box drawn over text can leave the words in the file, where they can still be copied or found.",
        ),
        /**
         * Row M2, and the page's one removed then marked (AC-6), here since
         * this trio does not carry it: the self check's text part, which
         * reads what each page draws, so "selectable" and "the page", never
         * "the file" (spec 0004, AC-13 and INV-2; spec 0019, AC-12, as
         * built). Removed first, then marked (spec 0004's Follow-up).
         */
        paragraph(
          "In RedactNest, the selectable text you tick is taken out of the page, then marked where it was.",
        ),
        /**
         * Row L1: words that exist only as a picture are not read, because
         * text recognition is a step that does not exist (spec 0018, AC-5 and
         * AC-7), so they can stay.
         */
        paragraph(
          "Words that are only part of a picture, such as a scan with no selectable text, are not read, so they can stay in the new file.",
        ),
      ]),
      figure: null,
      socialAlt: socialAltFor(REDACT_PDF_EYEBROW, REDACT_PDF_HEADLINE),
    }),
    "remove-text": Object.freeze({
      path: REMOVE_TEXT_PATH,
      title: "Remove text from a PDF, not just cover it",
      /**
       * The head: rows M5 ("tick what to remove"; spec 0018, AC-7) and M2
       * ("the selectable text ... out of the page, then marks where it was";
       * spec 0004, AC-13 and INV-2, spec 0019, AC-12), after a G1 clause
       * about covering in general. Pinned word for word by *Page frames*.
       */
      description:
        "Take text out of a PDF instead of only covering it: tick what to remove, and RedactNest takes the selectable text out of the page, then marks where it was.",
      eyebrow: REMOVE_TEXT_EYEBROW,
      headline: REMOVE_TEXT_HEADLINE,
      navLabel: "Removing text from a PDF",
      primary: "Remove text from a PDF",
      /**
       * Row M4, as on `/redact-pdf`: what RedactNest looks for, with
       * `lookedFor()`, and that you choose from its list, so this page never
       * reads as removing any text you pick (*Page frames*; spec 0005; spec
       * 0018, AC-5). None of upload, "in your browser" or removed then marked
       * (AC-6).
       */
      lead: `RedactNest looks for ${lookedFor("conjunction")} in your PDF and lists what it finds. You choose which of those to take out.`,
      features: Object.freeze<readonly FeatureItem[]>([
        Object.freeze({
          icon: Eraser,
          /** The page's one removed then marked (AC-6). */
          title: "Removed, then marked",
          /**
           * Row M2: the selectable text you tick is taken out of the page,
           * and the box is drawn only after that (spec 0004, AC-13 and
           * INV-2, removes first and marks after; spec 0019, AC-12, as
           * built: "selectable", "the page"). No "then marked" here: the
           * title carries it.
           */
          body: "The selectable text you tick is taken out of the page first. Only after that is a black box drawn where it was.",
        }),
        Object.freeze({
          icon: Laptop,
          /** The page's one upload (AC-6). */
          title: "Nothing to upload",
          /**
           * Row M1, a rewording of "never uploaded to us or anyone else":
           * the document is opened and changed in the page's worker on the
           * visitor's device (spec 0002, INV-1; privacy claim C1; `/tool`'s
           * `connect-src 'self'`). No upload word: the title carries it.
           */
          body: "Your PDF is opened and changed on your own device, and no copy of it is sent to us or anyone else.",
        }),
        Object.freeze({
          icon: ShieldCheck,
          title: "Checked before you download",
          /** Row M3, the register's own wording: the self check fails closed (spec 0004, INV-2). */
          body: "Every page of the new file is checked. If the check fails, you get no file.",
        }),
      ]),
      answerTitle: "What removing text means",
      answer: Object.freeze([
        /**
         * Row G1, PDFs in general and never RedactNest: a page draws its
         * text with instructions, and a patch or a box laid over the words
         * can leave them (spec 0006, covered text), always a "can" sentence.
         */
        paragraph(
          "A PDF draws its text with instructions written into each page. A white patch or a black box laid over the words can leave those instructions in place, so the text can still be copied or found.",
        ),
        /**
         * Row M2's mechanism only, never "removed, then marked" again (AC-6,
         * the trio carries it): the ticked selectable text is taken out of
         * what the page draws, which the self check's text part reads (spec
         * 0004, AC-13 and INV-2; spec 0019, AC-12, as built: "the page",
         * never "the file").
         */
        paragraph(
          "RedactNest takes the selectable text you tick out of those instructions, so the page no longer draws it.",
        ),
        /** Row M6, billing on only (AC-8): `removeTextTermsLine`. */
        TERMS,
        /**
         * Row L1: words that exist only as a picture are not read, because
         * text recognition is a step that does not exist (spec 0018, AC-5 and
         * AC-7), so they can stay.
         */
        paragraph(
          "Words that exist only as a picture, such as in a scan with no selectable text, are not read, so they can stay in the new file.",
        ),
      ]),
      figure: null,
      socialAlt: socialAltFor(REMOVE_TEXT_EYEBROW, REMOVE_TEXT_HEADLINE),
    }),
    "black-box": Object.freeze({
      path: BLACK_BOX_PATH,
      title: "Why a black box over text isn't redaction",
      /**
       * The head: row G1 only, PDFs in general ("can leave the words",
       * "can still reach them"; spec 0006, covered text). Pinned word for
       * word by *Page frames*.
       */
      description:
        "A box drawn over text can leave the words in the PDF, where copy and paste or search can still reach them. How to check a file, and what real redaction does.",
      eyebrow: BLACK_BOX_EYEBROW,
      headline: BLACK_BOX_HEADLINE,
      navLabel: "Black box redaction",
      primary: "Redact a PDF properly",
      /**
       * Row G1, a "can" sentence about PDFs in general, then what the page
       * holds. It names neither risk (the trio carries each once, AC-6), and
       * none of upload, "in your browser" or removed then marked.
       */
      lead: "A PDF that looks redacted can still hold the words under its boxes. Here is how to check a file before you share it, and what real redaction does.",
      features: Object.freeze<readonly FeatureItem[]>([
        Object.freeze({
          icon: ClipboardCopy,
          /** The page's one copy and paste risk (AC-6), row G1. */
          title: "Copy and paste can reveal it",
          /**
           * Row G1, why: a box is a shape of its own on top of the page, so
           * the text under it can stay (spec 0006, covered text). Neither
           * risk again.
           */
          body: "A box is a separate shape drawn on top of the page. It changes what you see, and the text below it can stay as it was.",
        }),
        Object.freeze({
          icon: Search,
          /** The page's one search risk (AC-6), row G1. */
          title: "Search can find it",
          /**
           * Row G1, why: a viewer works with the text the file holds, not
           * the picture on screen, a "can" sentence about PDFs in general.
           */
          body: "A PDF viewer works with the text the file holds, not with what you see on screen, so a box on top can leave that text within reach.",
        }),
        Object.freeze({
          icon: Laptop,
          /** The page's one upload (AC-6). */
          title: "Nothing to upload",
          /**
           * Row M1, a rewording of "never uploaded to us or anyone else"
           * (spec 0002, INV-1; privacy claim C1; `/tool`'s
           * `connect-src 'self'`). No upload word: the title carries it.
           */
          body: "RedactNest opens and changes your PDF on your own device, and no copy of it is sent to us or anyone else.",
        }),
      ]),
      answerTitle: "How to check a redacted PDF",
      answer: Object.freeze([
        /**
         * Row G1: checks a reader can run on any file with any viewer, each
         * an "if" or a "can" about PDFs in general, naming no risk again
         * (AC-6) and nothing RedactNest does.
         */
        checks([
          "Select the text across a box, copy it, and paste it somewhere plain, such as a new note. If words appear, they are still in the file.",
          "Search the file for a word that should be gone, such as a name under a box. If the viewer stops on it, that word is still there.",
          "Open the file in a second PDF viewer. Viewers draw pages in their own way, and one can show what another hides.",
        ]),
      ]),
      /**
       * Rows G1 (the first panel) and M2 (the second panel and the caption),
       * as each panel's comment says. The caption tells the panels apart in
       * the drawing's own terms, what a copy of each gives, and claims
       * nothing about a file (spec 0018, AC-8, worded as `/security` words
       * its own; spec 0019, AC-12).
       */
      figure: Object.freeze({
        panels: BLACK_BOX_PANELS,
        caption:
          "The two pages look alike. Only on the second is the name left out of a copy of its text.",
      }),
      socialAlt: socialAltFor(BLACK_BOX_EYEBROW, BLACK_BOX_HEADLINE),
    }),
  });

/**
 * The search pages other than `kind`, in `SEARCH_PAGES` order: the close's
 * More guides list (AC-3).
 */
export function otherSearchPages(kind: SearchPageKind): readonly SearchPageKind[] {
  return Object.freeze(SEARCH_PAGES.filter((other) => other !== kind));
}
