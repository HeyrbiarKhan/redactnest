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

/** One line of the Finds card: the detector's own icon and group name. */
export interface HomeFind {
  readonly icon: LucideIcon;
  readonly label: string;
}

/**
 * Which kinds the home page may say RedactNest strips (AC-11). A record over
 * every kind, so a kind added to `SANITIZED_KINDS` fails `pnpm typecheck` here
 * until someone decides whether the page claims it.
 *
 * False for four on purpose: comments and form fields are flattened, so what
 * showed stays (spec 0004, AC-22); a file with hidden layers is refused, never
 * stripped; and losing accessibility tags is a cost, not a benefit.
 */
export const HOME_STRIPPED: Readonly<Record<SanitizedKind, boolean>> = Object.freeze({
  "document-info": true,
  "xmp-metadata": true,
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
 * The Finds card's list (AC-11): one item per detector, in `DETECTOR_KINDS`
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

export const HOME_TEXT = Object.freeze({
  /** A true one, above the headline (AC-10), and the page's one "in your browser". */
  eyebrow: "PDF redaction in your browser",
  headline: "Redaction that actually removes the text",
  lead: `RedactNest finds ${lookedFor("conjunction")} in your PDF, lets you tick what to remove, and takes that text out of the file itself.`,
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
    Object.freeze({
      icon: Eraser,
      title: "Removed, not covered",
      body: "Ticked text is taken out of the page, and hidden data such as metadata and attachments is stripped.",
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
   */
  band: Object.freeze({
    title: "What RedactNest finds and strips",
    finds: Object.freeze({
      title: "Finds",
      subtitle: "Sensitive details we can detect in your files.",
      line: "Nothing is removed until you tick it.",
    }),
    strips: Object.freeze({
      title: "Strips",
      subtitle: "Whenever a file carries them:",
      note: "Comments and form fields are flattened into the page: what showed stays, and nothing hidden behind them does.",
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
