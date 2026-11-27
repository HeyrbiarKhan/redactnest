import { describe, expect, it } from "vitest";

import { FREE_PLAN, pricingQuestions, PRO_PLAN, SIGN_IN_PANEL } from "@/lib/plans";

import {
  CLAIM_BANNED_PHRASES,
  MARKETING_BANNED_PHRASES,
  phrasePattern,
} from "../support/claim-phrases";

/**
 * The two plans' names and Pro's price line. Spec 0012, AC-13, AC-15 and
 * INV-8.
 *
 * Pricing, the plan line and the account page all read these, and the price
 * is checked by hand against Polar's "RedactNest Pro" product ($19 monthly) at
 * each go live (Go live step 2). So the words are pinned here on purpose: a
 * change to the price a visitor reads has to be deliberate, made in the same
 * change as Polar's product, never a slip in a refactor.
 */

describe("PRO_PLAN", () => {
  /** covers: AC-13, AC-15 */
  it("reads $19 a month, the price of Polar's product", () => {
    expect(PRO_PLAN.priceLine).toBe("$19 a month");
  });

  it("is called Pro", () => {
    expect(PRO_PLAN.name).toBe("Pro");
  });

  /** covers: INV-8. A cap here could drift from `config`, the one source. */
  it("holds a name and a price, and no cap", () => {
    expect(Object.keys(PRO_PLAN)).toEqual([
      "name",
      "priceLine",
      "price",
      "per",
      "amount",
      "currency",
    ]);
  });

  /**
   * The marketing brief of 2026-11-28, item 3: the home page's structured
   * data prices Pro from a number and a currency, never by parsing "$19", so
   * the number and the figure a visitor reads are one change.
   */
  it("gives the same price as a number in US dollars", () => {
    expect(PRO_PLAN.amount).toBe(19);
    expect(PRO_PLAN.currency).toBe("USD");
    expect(PRO_PLAN.price).toBe(`$${PRO_PLAN.amount}`);
  });

  /**
   * The home page's large figure and the words beside it (the owner's port
   * of `Main.dc.html`, 2026-11-25) say the price line's price, so a change to
   * one is a change to both.
   */
  it("shows the home page the price line's own figure, per month", () => {
    expect(PRO_PLAN.price).toBe("$19");
    expect(PRO_PLAN.priceLine.startsWith(`${PRO_PLAN.price} `)).toBe(true);
    expect(PRO_PLAN.priceLine).toMatch(/a month$/);
    expect(PRO_PLAN.per).toBe("/ month");
  });
});

describe("FREE_PLAN", () => {
  it("is called Free", () => {
    expect(FREE_PLAN.name).toBe("Free");
  });

  /** covers: INV-8. Its price is the home page's large figure, and no cap. */
  it("holds a name and its price, $0, and no cap", () => {
    expect(Object.keys(FREE_PLAN)).toEqual(["name", "price"]);
    expect(FREE_PLAN.price).toBe("$0");
  });
});

describe("both plans", () => {
  it("are frozen, so no page can rename a plan or reprice Pro for the rest", () => {
    expect(Object.isFrozen(PRO_PLAN)).toBe(true);
    expect(Object.isFrozen(FREE_PLAN)).toBe(true);
    expect(() => {
      (PRO_PLAN as { priceLine: string }).priceLine = "$0 a month";
    }).toThrow(TypeError);
  });
});

/**
 * The marketing brief of 2026-11-28, item 6: Pricing's questions. Cancelling
 * and refunds in the terms' own words, the caps from the arguments, nothing
 * that suggests splitting a file, and both banned phrase lists held, as on a
 * page that describes RedactNest (spec 0018, AC-5; spec 0024, AC-5).
 */
describe("pricingQuestions", () => {
  it("asks and answers the brief's four questions, word for word", () => {
    expect(pricingQuestions(3, 50)).toEqual([
      {
        question: "Can I cancel any time?",
        answer:
          "Yes. Cancel in Manage billing, on your Account page. Pro then lasts to the end of the month you've paid for.",
      },
      {
        question: "Do you give refunds?",
        answer:
          "We don't refund part months. Your legal rights stay, including any right to withdraw from the purchase.",
        terms: { before: "The ", after: " have the details." },
      },
      {
        question: "What if my PDF has more than 3 pages on Free?",
        answer:
          "RedactNest tells you when you open it, and makes no file. Pro handles up to 50 pages per document.",
      },
      {
        question: "Do I need an account for Free?",
        answer: "No. You need an account only for Pro.",
      },
    ]);
    expect(Object.isFrozen(pricingQuestions(3, 50))).toBe(true);
  });

  it("takes both caps from its arguments, never a literal", () => {
    const words = JSON.stringify(pricingQuestions(7, 90));
    expect(words).toContain("more than 7 pages on Free");
    expect(words).toContain("up to 90 pages per document");
    expect(words).not.toMatch(/\b(3|50)\b/);
  });

  it("never suggests splitting a file", () => {
    expect(JSON.stringify(pricingQuestions(3, 50))).not.toMatch(
      /split|smaller|separate|break up/i,
    );
  });

  it("holds neither banned phrase list", () => {
    const words = pricingQuestions(3, 50)
      .flatMap(({ question, answer, terms }) => [
        question,
        answer,
        ...(terms === undefined ? [] : [terms.before, terms.after]),
      ])
      .join("\n");
    const phrases = [...CLAIM_BANNED_PHRASES, ...MARKETING_BANNED_PHRASES];
    expect(phrases.filter((phrase) => phrasePattern(phrase).test(words))).toEqual([]);
  });
});

/** Spec 0013, AC-23: the panel beside Clerk's card. */
describe("SIGN_IN_PANEL", () => {
  it("says what signing in is for, with the cap it is given", () => {
    expect(SIGN_IN_PANEL.title).toBe("Sign in to use Pro");
    expect(SIGN_IN_PANEL.line(50)).toBe(
      "Pro opens documents up to 50 pages. Your account needs only your email address, and your documents never touch it: they stay in your browser.",
    );
    expect(SIGN_IN_PANEL.line(80)).toContain("up to 80 pages");
    expect(SIGN_IN_PANEL.pricing).toBe("See pricing");
  });
});
