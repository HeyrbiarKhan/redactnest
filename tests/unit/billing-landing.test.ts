import { describe, expect, it } from "vitest";

import { landingAfterSignIn } from "@/app/(account)/landing";

/**
 * Where Clerk lands after signing in or up. Spec 0012, AC-8: Subscribe when
 * Subscribe sent the visitor, Account otherwise, and never anywhere else.
 */
describe("landing after sign in", () => {
  it("goes on to Subscribe when Subscribe sent the visitor", () => {
    expect(landingAfterSignIn("/account/subscribe")).toBe("/account/subscribe");
  });

  it.each([
    ["nothing", undefined],
    ["the tool", "/tool"],
    ["the home page", "/"],
    ["another account page", "/account/billing"],
    ["Subscribe as an absolute address", "http://localhost:3000/account/subscribe"],
    ["Subscribe with a query", "/account/subscribe?x=1"],
    ["another site", "https://evil.example/account/subscribe"],
    ["a repeated parameter", ["/account/subscribe", "/tool"]],
  ])("goes to Account for %s", (_name, value) => {
    expect(landingAfterSignIn(value)).toBe("/account");
  });
});
