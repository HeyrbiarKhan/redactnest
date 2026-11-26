/**
 * The two plans' names and Pro's price line, in one place. Spec 0012, *Decided
 * while writing* and INV-8.
 *
 * Pricing, the plan line and the account page all read these, so the name and
 * the price a visitor sees cannot drift apart between pages. The price is
 * written here rather than fetched from Polar at build, because the build
 * would then need Polar's token and CI has none; it is checked by hand
 * against Polar's product at each go live (Go live step 2). Caps are never
 * written here: they come from `config` (INV-8).
 */

/**
 * `price` is the home page's large figure on each plan card, and `per` the
 * small words beside Pro's (`Main.dc.html`, the owner's port, 2026-11-25);
 * `priceLine` stays Pricing's own. Checked with the price at each go live.
 */
export const FREE_PLAN = Object.freeze({ name: "Free", price: "$0" });

export const PRO_PLAN = Object.freeze({
  name: "Pro",
  /** Polar's "RedactNest Pro" product, $19 monthly. */
  priceLine: "$19 a month",
  price: "$19",
  per: "/ month",
});

/**
 * The badge on Pro's pricing card (spec 0026, AC-10). A mark beside Pro's
 * name, which the heading already says, so nothing rests on it.
 */
export const PLAN_BADGE = "Most useful";

/**
 * The panel beside Clerk's card on sign in and sign up (spec 0013, AC-23).
 * Pro's cap arrives from `config` as an argument, never written here (INV-8).
 */
export const SIGN_IN_PANEL = Object.freeze({
  title: `Sign in to use ${PRO_PLAN.name}`,
  line: (paid: number) =>
    `${PRO_PLAN.name} opens documents up to ${paid} pages. Your account needs only your email address, and your documents never touch it: they stay in your browser.`,
  pricing: "See pricing",
});
