import { describe, expect, it } from "vitest";

import {
  CLERK_APPEARANCE,
  CODE_BOX_AT_REST,
  FIELD_AT_REST,
} from "@/app/(account)/clerk-appearance";

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

/**
 * Spec 0013, AC-31: every text field and code box has an edge a visitor can
 * find it by, `border-strong` (about 3.8:1 on `surface`) where Clerk's own is
 * about 1.3:1. A real border, so forced colours keeps it, and only at rest and
 * on hover, so Clerk's focus ring and its error edge still show. Clerk's card
 * loads from Clerk's host, so the computed result is checked in the sandbox.
 */
const FIELDS = [
  // A real input: focused when `:focus` matches.
  [
    "formFieldInput",
    CLERK_APPEARANCE.elements.formFieldInput,
    FIELD_AT_REST,
    '&:not(:focus):not([aria-invalid="true"])',
  ],
  // A div over one hidden input: Clerk marks the box being filled instead.
  [
    "otpCodeFieldInput",
    CLERK_APPEARANCE.elements.otpCodeFieldInput,
    CODE_BOX_AT_REST,
    '&:not([data-focus-within="true"]):not([aria-invalid="true"])',
  ],
] as const;

describe.each(FIELDS)("CLERK_APPEARANCE %s", (_, field, scope, expected) => {
  it("is a style object holding one rule, scoped away from focus and the invalid state", () => {
    expect(typeof field).toBe("object");
    expect(scope).toBe(expected);
    expect(Object.keys(field)).toEqual([scope]);
  });

  it("draws a 1 pixel border-strong border, and no shadow to double it", () => {
    expect(Object.values(field)).toEqual([
      {
        borderWidth: "1px",
        borderStyle: "solid",
        borderColor: "var(--color-border-strong)",
        boxShadow: "none",
      },
    ]);
  });

  it("names no colour but border-strong", () => {
    const colours = JSON.stringify(field).match(
      /var\(--color-[a-z-]+\)|#[0-9a-f]{3,8}|rgb/gi,
    );
    expect(colours).toEqual(["var(--color-border-strong)"]);
  });
});

describe("CLERK_APPEARANCE variables", () => {
  it("keeps the card's own dividers quiet, on border", () => {
    expect(CLERK_APPEARANCE.variables.colorBorder).toBe("var(--color-border)");
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
