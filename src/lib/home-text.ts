/**
 * Every word in the home page's main content, in one place. Spec 0013, AC-10
 * to AC-13 and AC-30, laid out as spec 0026 AC-8 has the page.
 *
 * Nothing here names a detector, a cap, a customer, a team or a capability
 * RedactNest does not have today (INV-1). The detectors come from `lookedFor`
 * and `DETECTOR_LABELS`, so the page names exactly the ones that exist; the
 * stripped kinds from `HOME_STRIPPED` over `SANITIZED_TEXT`; the plan names
 * from `src/lib/plans.ts`. The caps and whether billing is on arrive as
 * arguments, because the page reads them from `config` and this module never
 * does.
 *
 * Each thing is said once (AC-30, INV-11, as spec 0026 AC-8 places them):
 * the document's privacy is "in your browser" and "never uploaded" in the
 * hero's eyebrow chip only, "removed, not covered" is the black box section's
 * eyebrow only, and "checked before you download" is the third step card's
 * only. `tests/unit/home-text.test.ts` holds that. Lines that repeat an idea
 * already on the page wait for the owner's read before merge (INV-11).
 *
 * The social card and the Polar image carry the eyebrow and the headline:
 * `scripts/make-brand.mjs` reads both from the built home page
 * (`home-eyebrow` and the `h1`), so the pictures say what the page says, and
 * `opengraph-image.alt.txt` holds `socialAlt` word for word
 * (`tests/unit/brand-files.test.ts`).
 */

import { Code, Monitor, Shield, Trash2, type LucideIcon } from "lucide-react";

import { DETECTOR_LABELS, lookedFor } from "@/lib/detectors";
import { SANITIZED_TEXT } from "@/lib/flow-text";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import {
  ENGINE_PREFIX,
  ENTITLEMENT_PATH,
  ICON_PATHS,
  NEXT_FILES_PREFIX,
  TELEMETRY_PATH,
  TOOL_PATH,
} from "@/lib/routes";
import type { CoverPanel } from "@/ui/cover-figure";
import { DETECTOR_KINDS, SANITIZED_KINDS, type SanitizedKind } from "@/worker/protocol";

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One item of the trust strip under the hero: a line icon and its words. */
export interface HomeTrustItem {
  readonly icon: LucideIcon;
  readonly text: string;
}

/** One How it works card: its title and its line, under a small drawing. */
export interface HomeStep {
  readonly title: string;
  readonly body: string;
}

/** One line of the Looks for card: the detector's own icon and group name. */
export interface HomeFind {
  readonly icon: LucideIcon;
  readonly label: string;
}

/**
 * Which kinds the home page may say RedactNest strips (AC-11). A record over
 * every kind, so a kind added to `SANITIZED_KINDS` fails `pnpm typecheck` here
 * until someone decides whether the page claims it.
 *
 * False for six on purpose: comments and form fields are flattened, so what
 * showed stays (spec 0004, AC-22); a file with hidden layers is refused, never
 * stripped; losing accessibility tags is a cost, not a benefit; and XMP
 * metadata and picture details stay in a picture RedactNest leaves as stored
 * (one written inside a page's drawing instructions, one under more than one
 * kind of compression, or any other it does not safely take apart), so
 * "whenever a file carries them" would hold for neither (spec 0025, AC-11, as
 * it amends spec 0019's AC-12).
 */
export const HOME_STRIPPED: Readonly<Record<SanitizedKind, boolean>> = Object.freeze({
  "document-info": true,
  "xmp-metadata": false,
  annotations: false,
  "form-fields": false,
  attachments: true,
  bookmarks: true,
  "hidden-layers": false,
  javascript: true,
  "incremental-versions": true,
  "page-thumbnails": true,
  "accessibility-tags": false,
  "picture-details": false,
});

/**
 * The Looks for card's list (AC-11): one item per detector, in `DETECTOR_KINDS`
 * order, with the checklist's own icon and group name, so the card names
 * exactly the detectors that exist and grows with feature 12.
 */
export function findsItems(): readonly HomeFind[] {
  return Object.freeze(
    DETECTOR_KINDS.map((kind) =>
      Object.freeze({
        icon: DETECTOR_LABELS[kind].icon,
        label: DETECTOR_LABELS[kind].label,
      }),
    ),
  );
}

/**
 * The Strips card's list (AC-11): the kinds the page claims, in
 * `SANITIZED_KINDS` order, in the result card's own words, each with its first
 * letter capitalised ("Document info", "XMP metadata", "Attachments", …).
 */
export function strippedItems(): readonly string[] {
  return Object.freeze(
    SANITIZED_KINDS.filter((kind) => HOME_STRIPPED[kind]).map((kind) =>
      capitalised(SANITIZED_TEXT[kind]),
    ),
  );
}

/**
 * The line under the hero's buttons (AC-10): both plans with billing on, the
 * one cap with it off.
 */
export function capLine(billingEnabled: boolean, free: number, paid: number): string {
  return billingEnabled
    ? `${FREE_PLAN.name} up to ${free} pages a document. ${PRO_PLAN.name} goes up to ${paid}.`
    : `Up to ${free} pages a document.`;
}

/**
 * One row of the network band (spec 0026, AC-9): what `/tool` fetches, what
 * it is, and the paths on our own origin it stands for, shown on the page.
 * `tests/e2e/network-list.spec.ts` reads these paths from the page and fails
 * when a full run makes a request no row covers, or a row is never seen. The
 * last row, the visitor's file, has no path: no request carries it.
 */
export interface NetworkRow {
  readonly label: string;
  readonly what: string;
  readonly paths: readonly string[];
}

export const NETWORK_ROWS: readonly NetworkRow[] = Object.freeze([
  Object.freeze({
    label: "The tool page",
    what: "The page itself, and its updates as you move through it",
    paths: Object.freeze([TOOL_PATH]),
  }),
  Object.freeze({
    label: "The page's files",
    what: "Its scripts, styles, font and icons",
    paths: Object.freeze([NEXT_FILES_PREFIX, ...ICON_PATHS]),
  }),
  Object.freeze({
    label: "The PDF engine",
    what: "MuPDF, compiled to WebAssembly, which reads and rewrites your PDF in the tab",
    paths: Object.freeze([ENGINE_PREFIX]),
  }),
  /**
   * The plan check: a `GET` with no body, answered with the plan alone
   * (spec 0012, AC-1; privacy claim C5).
   */
  Object.freeze({
    label: "The plan check",
    what: "Whether you are on Pro, asked with no document data",
    paths: Object.freeze([ENTITLEMENT_PATH]),
  }),
  /**
   * The counts: closed kinds and ranges only, never a free string (spec 0016,
   * INV-4; privacy claim C14), and the test checks no fixture text is in one.
   */
  Object.freeze({
    label: "Counts",
    what: "Which steps happened and how long they took, as kinds and ranges",
    paths: Object.freeze([TELEMETRY_PATH]),
  }),
  /**
   * Row M1: no endpoint of ours takes document data, and `/tool`'s
   * `connect-src 'self'` lets the page reach nothing else (spec 0011, INV-1
   * and INV-2; privacy claim C1), which the test holds request by request.
   * Owner's read: it says the eyebrow chip's "never uploaded" another way.
   */
  Object.freeze({
    label: "Your PDF",
    what: "Not among them: no request carries it",
    paths: Object.freeze([]),
  }),
]);

/** The black box comparison's drawing: one made up page, the same in both panels. */
const COVER_LINES = Object.freeze([
  Object.freeze({ text: "Offer of employment" }),
  Object.freeze({ text: "Contact:", boxed: true as const }),
  Object.freeze({ text: "Role: Office manager" }),
]);

/**
 * The `id` of the band's heading, which the band's section is labelled by and
 * the security page links to, so its list of what RedactNest looks for and
 * strips is said here once and pointed at there (spec 0018, AC-6). It stays
 * when the heading's words change, so the security page's links still land.
 */
export const HOME_BAND_ID = "home-band";

export const HOME_TEXT = Object.freeze({
  /**
   * The hero's eyebrow chip (spec 0026, AC-8): the page's one "in your
   * browser" and its one "never uploaded". Spec 0024's claim register, row
   * M1: privacy claim C1, held by `/tool`'s `connect-src 'self'` (spec 0011,
   * INV-1 and INV-2) and no endpoint of ours that takes document data.
   */
  eyebrow: "Runs in your browser. Never uploaded.",
  headline: "Redaction that actually removes the text",
  /**
   * "Looks for" says what RedactNest does and claims nothing about what it
   * finds, as the security page's What it looks for says it: "finds" with no
   * "can" would claim every value is found, while one can be missed (spec
   * 0018, AC-5). The headline and the "Removed, not covered" card carry
   * removal, so the lead does not say it again (AC-30, INV-11). Spec 0019,
   * AC-12.
   */
  lead: `RedactNest looks for ${lookedFor("conjunction")} in your PDF and lets you tick what to remove.`,
  /** The hero's way into the tool, named for what it does (AC-30). */
  primary: "Remove text from a PDF",
  /** The hero's second button, to the How it works section on this page. */
  howItWorks: "See how it works",
  /**
   * The small card beside the product window (spec 0026, AC-8, as the port
   * of `Main.dc.html` amends it): the mockup's title, then the self check
   * named by its result. Row M3: no file leaves unless the self check passed
   * on its bytes (spec 0004, INV-2). The title repeats the trust strip's
   * third item by the owner's read (2026-11-25), a place AC-30's test names.
   */
  shotCard: Object.freeze({
    title: "Checked before you download",
    line: "No pass, no file",
  }),

  /**
   * The hero's product window, drawn in HTML in place of the screenshot (the
   * owner's port of `Main.dc.html`, 2026-11-25): a made up agreement open in
   * the tool. Only the made up values live here. Every word the tool itself
   * shows (the group names, "Found items", the Redact button and the lock
   * line) is read from `detectors.ts` and `flow-text.ts`, as the screenshot
   * showed them, so the drawing never says what the tool does not. Hidden
   * from assistive technology, which hears `shotAlt` instead.
   */
  window: Object.freeze({
    file: "employment-agreement.pdf · 2 pages",
    title: "Employment Agreement",
    lines: Object.freeze({
      name: "Name: Alex Morgan",
      email: "Email:",
      phone: "Phone:",
      // The mockup's "Pay questions:" wraps at the 14 pixel floor; "Pay:" keeps
      // the line whole, as drawn.
      pay: "Pay:",
    }),
    /** The one found value still shown, as the tool highlights it. */
    found: "payroll@example.com",
    groups: Object.freeze([
      Object.freeze({ kind: "email", count: 4, ticked: true }),
      Object.freeze({ kind: "phone", count: 3, ticked: true }),
      Object.freeze({ kind: "date", count: 0, ticked: false }),
    ] as const),
  }),

  /**
   * The trust strip under the hero (the owner's port of `Main.dc.html`,
   * 2026-11-25): four short claims in a row. Each says again a claim the page
   * makes elsewhere, by the owner's read, in the places AC-30's test names.
   */
  trust: Object.freeze<readonly HomeTrustItem[]>([
    /**
     * Row M1: privacy claim C1, held by `/tool`'s `connect-src 'self'` (spec
     * 0011, INV-1 and INV-2) and no endpoint of ours that takes document
     * data. The security page's own words: "processed in your browser".
     */
    Object.freeze({ icon: Monitor, text: "Processed in your browser tab" }),
    /**
     * The page's one "removed, not covered", moved here from the black box
     * section's eyebrow. Row M2: the selectable text you tick is taken out of
     * the page before any box is drawn (spec 0004, AC-13 and INV-2; its
     * *Decision* bullet "Box pass"), which the black box section shows.
     */
    Object.freeze({ icon: Trash2, text: "Removed, not covered" }),
    /**
     * Row M3: no file leaves unless the self check passed on its bytes (spec
     * 0004, INV-2), so every new file is checked before it can be downloaded.
     */
    Object.freeze({ icon: Shield, text: "Every file checked before download" }),
    /**
     * The owner's line (2026-11-25). The AGPL is the licence every page's
     * footer states, with a link to the source of the exact commit built
     * (spec 0009, AC-1 and AC-4), which is what lets anyone check it.
     */
    Object.freeze({ icon: Code, text: "Open source (AGPL), so you can check it" }),
  ]),

  /**
   * How it works (spec 0026, AC-8): three cards, each a small drawing on
   * made up values, a number, a title and a line.
   */
  steps: Object.freeze({
    eyebrow: "How it works",
    title: "Three steps to a redacted PDF",
    /**
     * The owner's line (2026-11-25), under the heading. "No upload" is row
     * M1 (privacy claim C1: `/tool`'s `connect-src 'self'`, spec 0011, INV-1
     * and INV-2), and with it no queue: no server of ours does the work, the
     * tab does. "No account for small files": a document within the free cap
     * opens with no account (spec 0012, AC-1, the free answer for an
     * anonymous visitor). It repeats the eyebrow chip's "never uploaded" by
     * the owner's read, a place AC-30's test names.
     */
    lead: "No upload, no queue, no account for small files.",
    /**
     * The drawings' made up values, hidden from assistive technology. The
     * drop zone's own words are the tool's (`DROP_TEXT.title`).
     */
    drawing: Object.freeze({
      rows: Object.freeze([
        Object.freeze({ value: "jane.doe@example.com", page: "p.1", ticked: true }),
        Object.freeze({ value: "020 7946 0182", page: "p.1", ticked: true }),
        Object.freeze({ value: "12 March 2026", page: "p.2", ticked: false }),
      ]),
      badge: "PDF",
      file: "agreement-redacted.pdf",
      /** The new file's chip: its check passed and what went (row M3). */
      fileNote: "Checked · 7 removed",
    }),
    items: Object.freeze<readonly HomeStep[]>([
      Object.freeze({
        title: "Open a PDF",
        body: "Drop it on the page, or choose it from your files.",
      }),
      /**
       * "Each item found" is the checklist, which lists every match the
       * detectors and your terms return; "only a suggestion" is the seeded
       * tick, which any row that can be ticked can lose (spec 0007, AC-7).
       * It names no detector, so it claims nothing about what is found.
       */
      Object.freeze({
        title: "Tick what to remove",
        body: "Each item found is listed with the words around it. A tick at the start is only a suggestion.",
      }),
      /**
       * Row M3: the self check, which no file leaves without passing (spec
       * 0004, INV-2). "Every page" is its text part, which reads each page
       * of the new file (AC-13), in the old trio card's words. "Checked
       * before you download" is the trust strip's and the hero card's now.
       */
      Object.freeze({
        title: "Download your new file",
        body: "Every page of the new file is checked. If RedactNest can't vouch for it, you get no file.",
      }),
    ]),
  }),

  /**
   * The black box comparison (spec 0026, AC-8), drawn with `CoverFigure` on
   * a made up page. Its eyebrow is the mockup's "Why it matters", which
   * claims nothing; "removed, not covered" moved to the trust strip.
   */
  blackBox: Object.freeze({
    eyebrow: "Why it matters",
    title: "A black box is not redaction",
    /**
     * Row M2: "the selectable text you tick is taken out of the page, then
     * marked" is the self check's text part, which reads what each page
     * draws, so "selectable" and "the page", never "the file" (spec 0004,
     * AC-13 and INV-2; spec 0019, AC-12), with the box drawn after the
     * removal (spec 0004's *Decision* bullet "Box pass"). What a drawn box
     * leaves is a fact about other tools, which the security page shows.
     */
    body: "A box drawn over words hides them from your eyes, not from the file: copy the page's text and they come back. RedactNest takes the selectable text you tick out of the page first, then marks where it was.",
    link: "How the check works",
    caption:
      "Both pages look the same. Only the second leaves the address out of a copy of its text.",
    panels: Object.freeze<readonly CoverPanel[]>([
      Object.freeze({
        title: "A box drawn over the text",
        lines: COVER_LINES,
        readsLabel: "A copy of the text gives",
        reads: "Contact: jane.doe@example.com",
      }),
      Object.freeze({
        title: "RedactNest: removed, then marked",
        lines: COVER_LINES,
        readsLabel: "A copy of the text gives",
        reads: "Contact:",
      }),
    ]),
  }),

  /**
   * The pricing section's heading over `PricingCards` (spec 0026, AC-10),
   * shown only with billing on. The cards' own words come from `plans.ts`,
   * `legal.ts` and `config`.
   */
  pricing: Object.freeze({
    eyebrow: "Pricing",
    title: "Free to start, Pro for longer files",
  }),

  /**
   * The network band (spec 0026, AC-9), on `night`. "A strict content
   * security policy" is `/tool`'s (spec 0011, INV-1 and INV-2); "the code is
   * public" is the AGPL source link every page's footer carries (spec 0009,
   * AC-1). The link goes to the security page's own way to check.
   */
  network: Object.freeze({
    eyebrow: "Don't take our word for it",
    title: "Watch your network tab while you redact",
    body: "The tool page runs under a strict content security policy, and its code is public. Open the developer tools and see for yourself what the page asks for.",
    link: "How to check it yourself",
    listLabel: "What the tool page fetches",
  }),

  /** The closing band (spec 0026, AC-8), its button the hero's own. */
  closing: "Redact your next PDF",

  /**
   * The two cards in place of "Trusted by" (AC-11). The lists themselves come
   * from `findsItems()` and `strippedItems()`; these are the words around them:
   * each card's subtitle under its title, and the line that closes it.
   *
   * The heading and the first card's title say "looks for" for the lead's
   * reason: "finds" as a heading claims every value is found (spec 0019,
   * AC-12). The band's section is labelled by its heading, so its accessible
   * name follows; `HOME_BAND_ID` stays. "Strips" sits behind the Strips card's
   * list, each kind held by the self check's structure part.
   */
  band: Object.freeze({
    title: "What RedactNest looks for and strips",
    finds: Object.freeze({
      title: "Looks for",
      subtitle: "Sensitive details we can detect in your files.",
      /**
       * The self check's text part, which every file passes: for each page's
       * visible area, every character wholly inside it is still there unless
       * it lies in an item you ticked (spec 0004, AC-13 and INV-2; spec 0006,
       * AC-16 and AC-17). "Wholly inside a page's visible area" is that gate's
       * reach, and no more. "On the page" read wider: a character crossing
       * the visible edge is partly on the page you see, and the trim can take
       * it with nothing ticked (spec 0006, AC-16, measured on
       * `tests/fixtures/trim-text.pdf`, whose "Edge" goes), as can text
       * outside the visible area. "Nothing is removed until you tick it" also
       * reached hidden data, which is stripped with no tick (spec 0004,
       * AC-7). "Unless you tick it" holds where a term and a detector list one
       * place in two rows (spec 0017, AC-12): ticking either ticks that text.
       * The check skips spaces; the removal band stops short of each end of a
       * ticked item (`REMOVAL_INSET_RATIO`) so that it takes the item's glyphs
       * and not its neighbours'.
       *
       * "Selectable": the text part reads only text the page holds as text,
       * and a scan's words are a picture, blanked over the padded area, which
       * grows past the ticked item into the lines beside it (spec 0004's
       * *Decision* bullet "Padded area"). Measured 2026-11-15 on the fixture
       * script's Tesseract style scan (`ocrPage` in
       * `scripts/lib/redaction-fixtures.mjs`) with its lines 14.4 and 13 pt
       * apart: ticking "Quigley" blanked ink of the line above, the run passed
       * and every word of the text layer stayed; at 18 pt, `ocr-aligned.pdf`'s
       * spacing, none. The security page's blanking line says the scan case.
       * Spec 0019, AC-12, as built.
       */
      line: "No selectable text wholly inside a page's visible area is removed unless you tick it.",
    }),
    strips: Object.freeze({
      title: "Strips",
      subtitle: "Whenever a file carries them:",
      /**
       * "What showed stays" is the flattening every copy goes through (spec
       * 0004, AC-22). "Themselves are removed" sits behind the self check's
       * structure part: no page keeps `/Annots` (`PAGE_KEYS`), the catalog
       * keeps no `/AcroForm` (`CATALOG_KEYS`), and no object the walk from the
       * catalog does not reach is left (spec 0019, AC-5). "A note's hidden
       * text" goes with them, since no string stays outside `STRING_PLACES`
       * (AC-2), and "any attached file", since no embedded file is left
       * anywhere (AC-5). "Hidden", because what a note showed is flattened
       * into the page and stays. Spec 0019, AC-12.
       */
      note: "Comments and form fields are flattened into the page: what showed stays, and the comments and fields themselves are removed, with a note's hidden text and any attached file.",
    }),
  }),

  /**
   * The site line (spec 0024, AC-11): the root layout's description, which
   * every page without its own falls back to, and `/`'s. Held to spec 0024's
   * *Claim register*, as a search page is (AC-5): "in your browser, with
   * nothing uploaded" is row M1 (privacy claim C1; `/tool`'s `connect-src
   * 'self'`, spec 0011, INV-1 and INV-2); "the selectable text you tick is
   * taken out of the page, then marked" is row M2 (the self check's text
   * part, which reads what each page draws, so "selectable" and "the page",
   * never "the file": spec 0004, AC-13 and INV-2; spec 0019, AC-12; removed
   * first, then marked, spec 0004's Follow-up); "every new file is checked
   * before you download it" is row M3 (spec 0004, INV-2). It replaces the
   * line that said the text was "not covered with a black box", which a run
   * that marks where text was does not bear out.
   */
  siteLine:
    "Redact PDFs in your browser, with nothing uploaded. The selectable text you tick is taken out of the page, then marked, and every new file is checked before you download it.",

  /** The product shot's alt text (AC-12). */
  shotAlt:
    "RedactNest reviewing a sample employment agreement: email addresses and phone numbers found and ticked, with a Redact button beside them.",
  /**
   * The social card's alt text (AC-5), describing what the card shows: the
   * lockup, the eyebrow and the headline. It names no detector, so it stays
   * true when feature 12 adds detectors.
   */
  socialAlt:
    "RedactNest. Runs in your browser. Never uploaded. Redaction that actually removes the text.",
});
