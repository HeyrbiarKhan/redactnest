import { describe, expect, it } from "vitest";

import { accountEmail, avatarInitial } from "@/lib/account-email";

/**
 * The visitor's own address and the avatar's letter, spec 0026 child 0001,
 * AC-21 and AC-22. The shape's failures are walked through both callers
 * (`billing-entitlement.test.ts` for the token's claim, `entitlement.test.ts`
 * for the route's answer); this file pins the rule itself: the length edge,
 * which neither caller reaches, and the letter, which no test computed.
 */

describe("accountEmail (AC-21)", () => {
  it("keeps an address with one @ as it is, case and all", () => {
    expect(accountEmail("Ada.Lovelace@Example.com")).toBe("Ada.Lovelace@Example.com");
  });

  it("keeps an address of exactly 320 characters and drops one of 321", () => {
    const at320 = `${"a".repeat(64)}@${"b".repeat(255)}`;
    expect(at320).toHaveLength(320);
    expect(accountEmail(at320)).toBe(at320);
    expect(accountEmail(`a${at320}`)).toBeNull();
  });

  it.each([
    ["no @", "ada.example.com"],
    ["two @", "a@b@example.com"],
    ["an empty string", ""],
    ["a number", 7],
    ["null", null],
    ["an array holding an address", ["ada@example.com"]],
  ])("is null for %s", (_name, value) => {
    expect(accountEmail(value)).toBeNull();
  });
});

describe("avatarInitial (AC-22)", () => {
  it("is the address's first letter, uppercased", () => {
    expect(avatarInitial("walk@redactnest.com")).toBe("W");
    expect(avatarInitial("Walk@redactnest.com")).toBe("W");
  });

  it("keeps a digit or a symbol as it is", () => {
    expect(avatarInitial("7up@example.com")).toBe("7");
    expect(avatarInitial("_ops@example.com")).toBe("_");
  });

  it("takes a whole letter with its accent, as a person sees it, not half of it", () => {
    // "e" followed by a combining acute accent: two code points, one letter.
    expect(avatarInitial("e\u0301lise@example.com")).toBe("E\u0301");
    expect(avatarInitial("\u00e9lise@example.com")).toBe("\u00c9");
  });

  it("takes a whole emoji, never a lone surrogate", () => {
    expect(avatarInitial("\u{1F600}x@example.com")).toBe("\u{1F600}");
    expect(avatarInitial("\u{1F44B}\u{1F3FD}@example.com")).toBe("\u{1F44B}\u{1F3FD}");
  });

  it("uppercases in British English, so a dotted i stays plain I", () => {
    expect(avatarInitial("ivy@example.com")).toBe("I");
  });

  it("is null with no address, so the avatar shows the person icon", () => {
    expect(avatarInitial(null)).toBeNull();
    expect(avatarInitial("")).toBeNull();
  });
});
