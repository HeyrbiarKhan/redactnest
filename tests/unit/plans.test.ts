import { describe, expect, it } from "vitest";

import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";

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
    expect(Object.keys(PRO_PLAN)).toEqual(["name", "priceLine"]);
  });
});

describe("FREE_PLAN", () => {
  it("is called Free", () => {
    expect(FREE_PLAN.name).toBe("Free");
  });

  /** covers: INV-8 */
  it("holds a name only, with no price and no cap", () => {
    expect(Object.keys(FREE_PLAN)).toEqual(["name"]);
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
