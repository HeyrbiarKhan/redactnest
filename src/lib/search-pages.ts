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

import { Laptop, ListChecks, ShieldCheck } from "lucide-react";

import { lookedFor } from "@/lib/detectors";
import { REDACT_PDF_PATH } from "@/lib/routes";
import type { PageKind } from "@/telemetry/events";
import type { FeatureItem } from "@/ui/feature-list";

/**
 * The search pages, a closed set whose order is the footer's and the
 * sitemap's. Each word names a page in its record, its route and its count
 * (INV-5), so the list is held to `PageKind`: a search page with no telemetry
 * kind fails `pnpm typecheck` here (AC-12). `remove-text` and `black-box`
 * join in build task 10.
 */
export const SEARCH_PAGES = Object.freeze([
  "redact-pdf",
] as const satisfies readonly PageKind[]);

export type SearchPageKind = (typeof SEARCH_PAGES)[number];

/** One part of a page's answer section, in order. */
export type AnswerPart = Readonly<{ kind: "paragraph"; text: string }>;

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
  /** The social card's alt text, `RedactNest. <eyebrow>. <headline>.` */
  readonly socialAlt: string;
}

const paragraph = (text: string): AnswerPart =>
  Object.freeze({ kind: "paragraph", text });

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
      navLabel: "Redact without uploading",
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
          body: "Every item on the list is yours to tick or leave, so you decide what is removed.",
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
      socialAlt: socialAltFor(REDACT_PDF_EYEBROW, REDACT_PDF_HEADLINE),
    }),
  });

/**
 * The search pages other than `kind`, in `SEARCH_PAGES` order: the close's
 * More guides list (AC-3).
 */
export function otherSearchPages(kind: SearchPageKind): readonly SearchPageKind[] {
  return Object.freeze(SEARCH_PAGES.filter((other) => other !== kind));
}
