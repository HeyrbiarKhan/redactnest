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
  /**
   * The same price as a number and an ISO 4217 code, for the home page's
   * structured data (the marketing brief of 2026-11-28, item 3), so nothing
   * parses "$19". `tests/unit/plans.test.ts` holds it to `price`.
   */
  amount: 19,
  currency: "USD",
});

/**
 * The badge on Pro's pricing card (spec 0026, AC-10). A mark beside Pro's
 * name, which the heading already says, so nothing rests on it.
 */
export const PLAN_BADGE = "Most useful";

/**
 * One of Pricing's questions (the marketing brief of 2026-11-28, item 6).
 * `terms`, when set, closes the answer with a sentence that links to the
 * Terms of service: its words before and after the link's label, which is
 * `LEGAL.termsLabel`.
 */
export interface PricingQuestion {
  readonly question: string;
  readonly answer: string;
  readonly terms?: { readonly before: string; readonly after: string };
}

/**
 * Pricing's questions, below the billing notes. Cancelling and refunds say
 * what the terms' Pro subscriptions section says. The caps arrive from
 * `config` as arguments, never written here (spec 0012, INV-8 and INV-9).
 * The over the cap answer never suggests splitting a file: the free cap's own
 * message leaves that out on purpose, and the terms say not to get around
 * the limits. "Makes no file": a document over the cap is refused when it
 * opens, before any run.
 */
export function pricingQuestions(free: number, paid: number): readonly PricingQuestion[] {
  return Object.freeze([
    Object.freeze({
      question: "Can I cancel any time?",
      answer: `Yes. Cancel in Manage billing, on your Account page. ${PRO_PLAN.name} then lasts to the end of the month you've paid for.`,
    }),
    Object.freeze({
      question: "Do you give refunds?",
      answer:
        "We don't refund part months. Your legal rights stay, including any right to withdraw from the purchase.",
      terms: Object.freeze({ before: "The ", after: " have the details." }),
    }),
    Object.freeze({
      question: `What if my PDF has more than ${free} pages on ${FREE_PLAN.name}?`,
      answer: `RedactNest tells you when you open it, and makes no file. ${PRO_PLAN.name} handles up to ${paid} pages per document.`,
    }),
    Object.freeze({
      question: `Do I need an account for ${FREE_PLAN.name}?`,
      answer: `No. You need an account only for ${PRO_PLAN.name}.`,
    }),
  ]);
}

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
