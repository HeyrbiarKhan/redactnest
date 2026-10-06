/**
 * Every word in the home page's main content, in one place. Spec 0013, AC-10
 * to AC-13.
 *
 * Nothing here names a detector, a cap, a customer, a team or a capability
 * RedactNest does not have today (INV-1). The detectors come from `lookedFor`,
 * so the page names exactly the ones that exist; the stripped kinds from
 * `HOME_STRIPPED` over `SANITIZED_TEXT`; the plan names from `src/lib/plans.ts`.
 * The caps and whether billing is on arrive as arguments, because the page
 * reads them from `config` and this module never does.
 *
 * The social card and the Polar image carry the eyebrow and the headline:
 * `scripts/make-brand.mjs` reads both from the built home page
 * (`home-eyebrow` and the `h1`), so the pictures say what the page says, and
 * `opengraph-image.alt.txt` holds `socialAlt` word for word
 * (`tests/unit/brand-files.test.ts`).
 */

import { Eraser, Laptop, ShieldCheck, type LucideIcon } from "lucide-react";

import { lookedFor } from "@/lib/detectors";
import { SANITIZED_TEXT } from "@/lib/flow-text";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { SANITIZED_KINDS, type SanitizedKind } from "@/worker/protocol";

/** `a, b and c`: British, like every list the redact flow shows. */
const LIST = new Intl.ListFormat("en-GB", { type: "conjunction" });

const capitalised = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export interface HomeFeature {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
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
 * The kinds the page claims, in `SANITIZED_KINDS` order, in the result card's
 * own words, as one list with its first letter capitalised: "Document info,
 * XMP metadata, attachments, …".
 */
export function strippedList(): string {
  return capitalised(
    LIST.format(
      SANITIZED_KINDS.filter((kind) => HOME_STRIPPED[kind]).map(
        (kind) => SANITIZED_TEXT[kind],
      ),
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

const detectors = lookedFor("conjunction");

export const HOME_TEXT = Object.freeze({
  /** A true one, above the headline (AC-10). */
  eyebrow: "PDF redaction in your browser",
  headline: "Redaction that actually removes the text",
  lead: `RedactNest finds ${detectors} in your PDF, lets you tick what to remove, and takes that text out of the file itself. Your file never leaves your browser.`,
  redact: "Redact a PDF",
  pricing: "See pricing",

  /** The trio under the hero (AC-10), each a line icon, a title and a line. */
  features: Object.freeze<readonly HomeFeature[]>([
    Object.freeze({
      icon: Laptop,
      title: "Stays on your device",
      body: "Opened and redacted in your browser. Never uploaded, and nothing is stored.",
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

  /** The band in place of "Trusted by" (AC-11). */
  band: Object.freeze({
    title: "What RedactNest finds and strips",
    findsTitle: "Finds",
    finds: `${capitalised(detectors)}. Nothing is removed until you tick it.`,
    stripsTitle: "Strips",
    strips: `${strippedList()}, whenever a file carries them. Comments and form fields are flattened into the page: what showed stays, and nothing hidden behind them does.`,
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
