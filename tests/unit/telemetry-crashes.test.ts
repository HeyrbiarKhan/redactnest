import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EntitlementAccount, EntitlementSnapshot } from "@/worker/protocol";

/**
 * The server's failure reports: `onRequestError` (spec 0016, AC-15) and the
 * plan check falling back (AC-16). `reportCrash` and `reportServer` are the
 * boundaries; `telemetry-server.test.ts` covers them from there on.
 */

const mocks = vi.hoisted(() => ({
  reportCrash: vi.fn(() => Promise.resolve()),
  reportServer: vi.fn(),
  account: "none" as EntitlementAccount,
}));

vi.mock("@/telemetry/server", () => ({
  reportCrash: mocks.reportCrash,
  reportServer: mocks.reportServer,
}));

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ get: () => undefined }),
  headers: () => Promise.resolve(new Headers({ "sec-gpc": "1" })),
}));

vi.mock("@/billing/clients", () => ({ entitlementSeams: () => ({}) }));
vi.mock("@/billing/entitlement", () => ({
  resolveEntitlement: (): Promise<EntitlementSnapshot> =>
    Promise.resolve({
      tier: mocks.account === "signed-in" ? "paid" : "free",
      pageCap: 3,
      maxFileBytes: 1,
      account: mocks.account,
    }),
}));

const { crashReport, normaliseRoutePath, onRequestError, routeKindFor } =
  await import("@/instrumentation");
const { GET } = await import("@/app/api/entitlement/route");

beforeEach(() => {
  mocks.reportCrash.mockClear();
  mocks.reportServer.mockClear();
});

describe("routeKindFor", () => {
  // The strings Next.js 16 reports, as `ROUTE_KINDS`'s comment records them:
  // first the plain path a failed render, action or route handler reports,
  // then the definition a failed stale revalidation reports.
  it.each([
    ["/", "render", "home"],
    ["/tool", "render", "tool"],
    ["/pricing", "render", "pricing"],
    ["/privacy", "render", "privacy"],
    ["/terms", "render", "terms"],
    ["/_not-found", "render", "not-found"],
    ["/account", "render", "account"],
    ["/account", "action", "account"],
    ["/account/subscribe", "render", "subscribe"],
    ["/account/billing", "render", "billing"],
    ["/account/welcome", "render", "welcome"],
    ["/sign-in/[[...sign-in]]", "render", "sign-in"],
    ["/sign-up/[[...sign-up]]", "render", "sign-up"],
    ["/api/entitlement", "route", "entitlement"],
    ["/api/telemetry", "route", "telemetry"],
    ["/proxy", "proxy", "proxy"],
    ["/account", "proxy", "proxy"],
    ["/_global-error", "render", "other"],
    ["/favicon.ico", "route", "other"],
    ["/page", "render", "home"],
    ["/tool/page", "render", "tool"],
    ["/pricing/page", "render", "pricing"],
    ["/privacy/page", "render", "privacy"],
    ["/terms/page", "render", "terms"],
    ["/_not-found/page", "render", "not-found"],
    ["/api/entitlement/route", "route", "entitlement"],
    ["/api/telemetry/route", "route", "telemetry"],
    ["/(account)/account/page", "render", "account"],
    ["/(account)/account/page", "action", "account"],
    ["/(account)/account/subscribe/page", "render", "subscribe"],
    ["/(account)/account/billing/page", "render", "billing"],
    ["/(account)/account/welcome/page", "render", "welcome"],
    ["/(account)/sign-in/[[...sign-in]]/page", "render", "sign-in"],
    ["/(account)/sign-up/[[...sign-up]]/page", "render", "sign-up"],
    ["/(account)/account/page", "proxy", "proxy"],
    ["/_global-error/page", "render", "other"],
    ["/favicon.ico/route", "route", "other"],
    ["/constructor", "route", "other"],
    ["", "render", "home"],
  ])("reads %s (%s) as %s", (routePath, routeType, kind) => {
    expect(routeKindFor(routePath, routeType)).toBe(kind);
  });

  it("drops route groups and the leaf file", () => {
    expect(normaliseRoutePath("/(account)/account/subscribe/page")).toBe(
      "/account/subscribe",
    );
    expect(normaliseRoutePath("/api/entitlement/route")).toBe("/api/entitlement");
    expect(normaliseRoutePath("/page")).toBe("/");
  });
});

describe("onRequestError", () => {
  it("reports server-crash with the route's kind and type, and nothing of the error or request", async () => {
    const error = Object.assign(
      new Error("No customer for jane.doe@example.com in passport.pdf"),
      {
        digest: "1234567890",
      },
    );
    await onRequestError(
      error,
      {
        path: "/account/subscribe?email=jane.doe@example.com",
        method: "GET",
        headers: { cookie: "__session=secret", "user-agent": "VisitorBrowser/1.0" },
      },
      {
        routerKind: "App Router",
        routePath: "/(account)/account/subscribe/page",
        routeType: "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
    );
    expect(mocks.reportCrash).toHaveBeenCalledTimes(1);
    expect(mocks.reportCrash).toHaveBeenCalledWith({
      name: "server-crash",
      route: "subscribe",
      routeType: "render",
    });
    const sent = JSON.stringify(mocks.reportCrash.mock.calls);
    for (const leak of ["jane", "passport", "secret", "Visitor", "1234567890", "email"]) {
      expect(sent).not.toContain(leak);
    }
  });

  it("never throws, even if reporting does", async () => {
    mocks.reportCrash.mockImplementationOnce(() => Promise.reject(new Error("down")));
    await expect(
      onRequestError(
        new Error("x"),
        { path: "/", method: "GET", headers: {} },
        {
          routerKind: "App Router",
          routePath: "/api/telemetry",
          routeType: "route",
          renderSource: "server-rendering",
          revalidateReason: undefined,
        },
      ),
    ).resolves.toBeUndefined();
  });

  it("reports a route type Next.js adds later as other, with its route", async () => {
    // Next.js 16.3.5 types only today's four, so a later one is typed wide here.
    const laterType: string = "cache";
    await onRequestError(
      new Error("x"),
      { path: "/tool", method: "GET", headers: {} },
      {
        routerKind: "App Router",
        routePath: "/tool/page",
        routeType: laterType as "render",
        renderSource: "server-rendering",
        revalidateReason: undefined,
      },
    );
    expect(mocks.reportCrash).toHaveBeenCalledWith({
      name: "server-crash",
      route: "tool",
      routeType: "other",
    });
  });

  it.each(["render", "route", "action"])("keeps a %s as itself", (routeType) => {
    expect(crashReport({ routePath: "/tool/page", routeType }).routeType).toBe(routeType);
  });
});

describe("the plan check falling back", () => {
  // `reportServer` is mocked here; its collapse to one an hour (AC-16, AC-27)
  // is held in `telemetry-server.test.ts`.
  it("hands plan-check-failed to reportServer each time it answers unknown, whatever the opt out", async () => {
    mocks.account = "unknown";
    const response = await GET();
    expect(((await response.json()) as EntitlementSnapshot).account).toBe("unknown");
    await GET();
    expect(mocks.reportServer).toHaveBeenCalledTimes(2);
    expect(mocks.reportServer.mock.calls[0]?.[0]).toEqual({ name: "plan-check-failed" });
  });

  it.each<EntitlementAccount>(["none", "signed-in", "sign-in-needed"])(
    "reports nothing when it answers %s",
    async (account) => {
      mocks.account = account;
      await GET();
      expect(mocks.reportServer).not.toHaveBeenCalled();
    },
  );
});
