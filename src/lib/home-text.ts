/**
 * Every word in the home page's main content, in one place. Spec 0013, AC-10
 * to AC-13 and AC-30.
 *
 * Nothing here names a detector, a cap, a customer, a team or a capability
 * RedactNest does not have today (INV-1). The detectors come from `lookedFor`
 * and `DETECTOR_LABELS`, so the page names exactly the ones that exist; the
 * stripped kinds from `HOME_STRIPPED` over `SANITIZED_TEXT`; the plan names
 * from `src/lib/plans.ts`. The caps and whether billing is on arrive as
 * arguments, because the page reads them from `config` and this module never
 * does.
 *
 * Each thing is said once (AC-30, INV-11): the document's privacy is "in your
 * browser" in the eyebrow and "never uploaded" in the first trio card, and
 * nowhere else in the main content. `tests/unit/home-text.test.ts` holds that.
 *
 * The social card and the Polar image carry the eyebrow and the headline:
 * `scripts/make-brand.mjs` reads both from the built home page
 * (`home-eyebrow` and the `h1`), so the pictures say what the page says, and
 * `opengraph-image.alt.txt` holds `socialAlt` word for word
 * (`tests/unit/brand-files.test.ts`).
 */

import { Eraser, Laptop, ShieldCheck, type LucideIcon } from "lucide-react";

import { DETECTOR_LABELS, lookedFor } from "@/lib/detectors";
import { SANITIZED_TEXT } from "@/lib/flow-text";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { DETECTOR_KINDS, SANITIZED_KINDS, type SanitizedKind } from "@/worker/protocol";

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface HomeFeature {
  readonly icon: LucideIcon;
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
 * False for five on purpose: comments and form fields are flattened, so what
 * showed stays (spec 0004, AC-22); a file with hidden layers is refused, never
 * stripped; losing accessibility tags is a cost, not a benefit; and XMP
 * written inside a picture's own data leaves with the picture's stored bytes
 * (spec 0006, AC-29), so "whenever a file carries them" would not hold for XMP
 * metadata until feature 32 strips it there too (spec 0019, AC-12).
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
 * The `id` of the band's heading, which the band's section is labelled by and
 * the security page links to, so its list of what RedactNest looks for and
 * strips is said here once and pointed at there (spec 0018, AC-6). It stays
 * when the heading's words change, so the security page's links still land.
 */
export const HOME_BAND_ID = "home-band";

export const HOME_TEXT = Object.freeze({
  /** A true one, above the headline (AC-10), and the page's one "in your browser". */
  eyebrow: "PDF redaction in your browser",
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
  pricing: "See pricing",

  /** The trio under the hero (AC-10), each a line icon, a title and a line. */
  features: Object.freeze<readonly HomeFeature[]>([
    Object.freeze({
      icon: Laptop,
      title: "Stays on your device",
      body: "Never uploaded to us or to anyone else, and nothing is stored.",
    }),
    /**
     * Each absolute sits behind a gate every file passes (spec 0019, AC-12).
     * Ticked text: the self check's text part, which reads what each page
     * draws, so "the page", never "the file" (spec 0004, AC-13 and INV-2).
     * Document info: no `/Info` and no trailer key outside `TRAILER_KEYS`.
     * Attachments: no embedded file stream or file specification anywhere,
     * reached or not (spec 0019, AC-5 and AC-8). It names those two kinds and
     * never hidden data as a whole, because descriptions written into a page
     * (spec 0019, AC-9) and a picture's own details (spec 0006, AC-29) can
     * stay. The Strips card lists the other kinds.
     */
    Object.freeze({
      icon: Eraser,
      title: "Removed, not covered",
      body: "Ticked text is taken out of the page, and document info and attachments are stripped.",
    }),
    Object.freeze({
      icon: ShieldCheck,
      title: "Checked before you download",
      body: "Every page of the new file is checked. If RedactNest can't vouch for it, you get no file.",
    }),
  ]),

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
       * and not its neighbours'. Spec 0019, AC-12, as built.
       */
      line: "No text wholly inside a page's visible area is removed unless you tick it.",
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

  /** The product shot's alt text (AC-12). */
  shotAlt:
    "RedactNest reviewing a sample employment agreement: email addresses and phone numbers found and ticked, with a Redact button beside them.",
  /**
   * The social card's alt text (AC-5), describing what the card shows: the
   * lockup, the eyebrow and the headline. It names no detector, so it stays
   * true when feature 12 adds detectors.
   */
  socialAlt:
    "RedactNest. PDF redaction in your browser. Redaction that actually removes the text.",
});
