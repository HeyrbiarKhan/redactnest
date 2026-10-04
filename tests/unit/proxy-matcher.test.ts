import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { type NextFetchEvent, NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PORTAL_TOKEN_PARAM, withoutPortalToken } from "@/billing/portal";
import { config } from "@/proxy";

/**
 * Clerk's proxy runs on the account group and nowhere else. Spec 0012, AC-9
 * and INV-1.
 *
 * Asked through Next.js's own matcher, so a pattern that reads one way to a
 * person and another to the router fails here. `/tool` and `/api/entitlement`
 * matter most: the proxy on either would run Clerk's handshake beside a
 * document, or set a cookie on the plan check.
 *
 * Then Polar's portal token (AC-26): the proxy drops it with a 307 before
 * Clerk runs, so Clerk's handshake only ever carries the clean address.
 * Clerk's middleware is a spy here, so the order is asserted, not assumed.
 */

const clerk = vi.hoisted(() => ({
  spy: vi.fn<(request: NextRequest, event: NextFetchEvent) => string>(() => "clerk ran"),
}));

vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => clerk.spy }));

const event = {} as NextFetchEvent;

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
      event,
    );

    expect(result).toBeUndefined();
  });

  /** AC-26 and AC-23: the token strip is part of billing, so it is off too. */
  it("does nothing even for a request carrying the portal token", async () => {
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    vi.resetModules();
    const { default: proxy } = await import("@/proxy");

    const result = proxy(
      new NextRequest("http://localhost:3000/account/welcome?customer_session_token=x"),
      event,
    );

    expect(result).toBeUndefined();
    expect(clerk.spy).not.toHaveBeenCalled();
  });
});

describe("withoutPortalToken (AC-26)", () => {
  const BASE = "http://localhost:3000/account/welcome";
  const clean = (url: string): string | null =>
    withoutPortalToken(new URL(url))?.href ?? null;

  it("drops Polar's own name for the token", () => {
    expect(PORTAL_TOKEN_PARAM).toBe("customer_session_token");
  });

  it.each([
    ["one value", "?customer_session_token=x&keep=1", "?keep=1"],
    [
      "several values",
      "?customer_session_token=x&keep=1&customer_session_token=y",
      "?keep=1",
    ],
    ["an empty value", "?keep=1&customer_session_token=", "?keep=1"],
    ["a bare name with no =", "?customer_session_token&keep=1", "?keep=1"],
    ["the encoded spelling", "?customer%5Fsession%5Ftoken=x&keep=1", "?keep=1"],
    ["the only parameter, leaving no query", "?customer_session_token=x", ""],
  ])("drops %s", (_name, query, rest) => {
    expect(clean(`${BASE}${query}`)).toBe(`${BASE}${rest}`);
  });

  it("keeps every other parameter in its order, a differently cased name included", () => {
    expect(
      clean(
        `${BASE}?keep=1&customer_session_token=x&Customer_Session_Token=y&_rsc=abc&__clerk_db_jwt=dvb_1`,
      ),
    ).toBe(`${BASE}?keep=1&Customer_Session_Token=y&_rsc=abc&__clerk_db_jwt=dvb_1`);
  });

  it.each([
    ["no query", BASE],
    ["other parameters only", `${BASE}?keep=1&_rsc=abc`],
    ["only a differently cased name", `${BASE}?Customer_Session_Token=y`],
  ])("returns null for %s", (_name, url) => {
    expect(clean(url)).toBeNull();
  });

  it("leaves the origin and path alone, and the address it was given", () => {
    const given = new URL(
      "http://127.0.0.1:3100/sign-in/factor-one?customer_session_token=x",
    );
    const result = withoutPortalToken(given);

    expect(result?.origin).toBe("http://127.0.0.1:3100");
    expect(result?.pathname).toBe("/sign-in/factor-one");
    expect(given.search).toBe("?customer_session_token=x");
  });
});

describe("the proxy with billing on (AC-26)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY =
      "pk_test_cmVkYWN0bmVzdC1lMmUtMDAuY2xlcmsuYWNjb3VudHMuZGV2JA==";
    process.env.NEXT_PUBLIC_SITE_URL = "https://redactnest.com";
    vi.resetModules();
    clerk.spy.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  async function send(
    url: string,
    init?: ConstructorParameters<typeof NextRequest>[1],
  ): Promise<unknown> {
    const { default: proxy } = await import("@/proxy");
    return proxy(new NextRequest(url, init), event);
  }

  it("answers the portal token with a 307 to the clean address, and never runs Clerk", async () => {
    const response = await send(
      "http://localhost:3000/account/welcome?customer_session_token=x&keep=1",
    );

    expect(response).toBeInstanceOf(Response);
    expect((response as Response).status).toBe(307);
    expect((response as Response).headers.get("location")).toBe(
      "http://localhost:3000/account/welcome?keep=1",
    );
    expect(clerk.spy).not.toHaveBeenCalled();
  });

  it.each([
    "http://localhost:3000/sign-in?customer_session_token=x",
    "http://localhost:3000/sign-up/verify-email-address?customer_session_token=",
    "http://localhost:3000/account?customer_session_token",
    "http://localhost:3000/account/billing?customer%5Fsession%5Ftoken=x",
  ])("strips it on every page in the matcher: %s", async (url) => {
    const response = (await send(url)) as Response;

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).not.toContain("session");
    expect(clerk.spy).not.toHaveBeenCalled();
  });

  it.each(["POST", "PUT", "DELETE"])(
    "strips it for a %s, as a 307 that keeps the method",
    async (method) => {
      const response = (await send(
        "http://localhost:3000/account?customer_session_token=x",
        { method, body: method === "DELETE" ? undefined : "a=1" },
      )) as Response;

      expect(response.status).toBe(307);
      expect(clerk.spy).not.toHaveBeenCalled();
    },
  );

  it("stays on the request's own origin, never the site's address", async () => {
    const response = (await send(
      "https://redactnest-git-x.vercel.app/account/welcome?customer_session_token=x",
    )) as Response;

    expect(response.headers.get("location")).toBe(
      "https://redactnest-git-x.vercel.app/account/welcome",
    );
  });

  it("hands a request without the token straight to Clerk", async () => {
    const result = await send("http://localhost:3000/account/welcome?keep=1");

    expect(result).toBe("clerk ran");
    expect(clerk.spy).toHaveBeenCalledTimes(1);
    const [request, passed] = clerk.spy.mock.calls[0]!;
    expect(request.nextUrl.search).toBe("?keep=1");
    expect(passed).toBe(event);
  });
});
