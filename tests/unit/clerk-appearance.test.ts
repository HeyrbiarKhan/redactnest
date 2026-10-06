import { describe, expect, it } from "vitest";

import { CLERK_APPEARANCE } from "@/app/(account)/clerk-appearance";

/**
 * Clerk's text links: the footer's "Sign up" or "Sign in", and the code step's
 * "Didn't receive a code? Resend". Spec 0012, AC-8, and spec 0003: every link
 * underlined (INV-8), all teal text `accent-strong` (its contrast contract,
 * which holds that token on `surface` and on `subtle`, Clerk's footer band).
 *
 * Clerk's own style is unlayered and sets `text-decoration: none`, so it beats
 * any utility class in Tailwind's layers, however specific. A class name here
 * is therefore no override at all; only a style object, which Clerk joins to
 * its own style, wins. Clerk's components load from Clerk's host and never
 * render in a test, so this holds the shape, and the computed result (each
 * link underlined in `#176465`, axe clean) was checked in a browser.
 */

const LINKS = {
  footerActionLink: CLERK_APPEARANCE.elements.footerActionLink,
  formResendCodeLink: CLERK_APPEARANCE.elements.formResendCodeLink,
} as const;

describe.each(Object.entries(LINKS))("CLERK_APPEARANCE %s", (_, link) => {
  it("is a style object, never a class name", () => {
    expect(typeof link).toBe("object");
  });

  it("is underlined at rest and on hover", () => {
    expect(link.textDecorationLine).toBe("underline");
    expect(link["&:hover"].textDecorationLine).toBe("underline");
  });

  it("is accent-strong at rest, on hover and while pressed", () => {
    // Clerk shades the primary colour lighter on hover and darker while
    // pressed, so each state names the token again.
    for (const color of [link.color, link["&:hover"].color, link["&:active"].color]) {
      expect(color).toBe("var(--color-accent-strong)");
    }
  });
});

/** Spec 0013, AC-23: Clerk draws no logo, so no logo is ever requested. */
describe("CLERK_APPEARANCE options", () => {
  it("places no logo in Clerk's card", () => {
    expect(CLERK_APPEARANCE.options.logoPlacement).toBe("none");
  });

  it("hides nothing with a style, because the option is honoured", () => {
    expect(Object.keys(CLERK_APPEARANCE.elements)).not.toContain("logoBox");
  });
});
