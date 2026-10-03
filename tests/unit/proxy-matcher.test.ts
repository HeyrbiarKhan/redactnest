import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { config } from "@/proxy";

/**
 * Clerk's proxy runs on the account group and nowhere else. Spec 0012, AC-9
 * and INV-1.
 *
 * Asked through Next.js's own matcher, so a pattern that reads one way to a
 * person and another to the router fails here. `/tool` and `/api/entitlement`
 * matter most: the proxy on either would run Clerk's handshake beside a
 * document, or set a cookie on the plan check.
 */

const matches = (url: string): boolean =>
  unstable_doesMiddlewareMatch({ config, url: `http://localhost:3000${url}` });

describe("the matcher", () => {
  it("is exactly the account group's paths", () => {
    expect(config.matcher).toEqual([
      "/sign-in",
      "/sign-in/(.*)",
      "/sign-up",
      "/sign-up/(.*)",
      "/account",
      "/account/(.*)",
    ]);
  });

  it.each([
    "/sign-in",
    "/sign-in/factor-one",
    "/sign-in/sso-callback",
    "/sign-up",
    "/sign-up/verify-email-address",
    "/account",
    "/account/subscribe",
    "/account/billing",
    "/account/welcome",
    "/account?notice=already-pro",
  ])("covers %s", (url) => {
    expect(matches(url)).toBe(true);
  });

  it.each([
    "/tool",
    "/tool?from=home",
    "/api/entitlement",
    "/",
    "/pricing",
    "/privacy",
    "/terms",
    "/accounts",
    "/sign-inx",
    "/api/account",
    "/engine/mupdf.js",
    "/licence.txt",
  ])("never covers %s", (url) => {
    expect(matches(url)).toBe(false);
  });
});

describe("with billing off", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  /** AC-23: no keys, no Clerk, so its keyless mode can never start. */
  it("does nothing at all", async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    vi.resetModules();
    const { default: proxy } = await import("@/proxy");

    const result = proxy(
      new Request("http://localhost:3000/account") as unknown as NextRequest,
      {} as NextFetchEvent,
    );

    expect(result).toBeUndefined();
  });
});
