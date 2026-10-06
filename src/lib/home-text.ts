/**
 * Every word in the home page's main content, in one place. Spec 0013, AC-10
 * to AC-13.
 *
 * Nothing here names a detector, a cap, a customer, a team or a capability
 * RedactNest does not have today (INV-1). The social card and the Polar image
 * carry the eyebrow and the headline: `scripts/make-brand.mjs` reads both from
 * the built home page (`home-eyebrow` and the `h1`), so the pictures say what
 * the page says, and `opengraph-image.alt.txt` holds `socialAlt` word for word
 * (`tests/unit/brand-files.test.ts`).
 */

export const HOME_TEXT = Object.freeze({
  /** A true one, above the headline (AC-10). */
  eyebrow: "PDF redaction in your browser",
  headline: "Redaction that actually removes the text",
  /**
   * The social card's alt text (AC-5), describing what the card shows: the
   * lockup, the eyebrow and the headline. It names no detector, so it stays
   * true when feature 12 adds detectors.
   */
  socialAlt:
    "RedactNest. PDF redaction in your browser. Redaction that actually removes the text.",
});
