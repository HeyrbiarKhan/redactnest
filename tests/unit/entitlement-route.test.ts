import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ENTITLEMENT_ACCOUNTS, type EntitlementSnapshot } from "@/worker/protocol";

/**
 * The route reads Clerk's cookie through `next/headers`, which needs a request
 * scope a unit test does not have. The jar here is what the route sees.
 */
const cookieJar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => {
        const value = cookieJar.get(name);
        return value === undefined ? undefined : { name, value };
      },
    }),
}));

/**
 * `GET /api/entitlement`, the only request the tool route makes.
 *
 * Spec 0002, AC-9 and AC-3. The browser side of this is covered by
 * `entitlement.test.ts` (it fails closed on anything that is not a clean
 * answer). Nothing covered the answer itself, so a deploy that returned the
 * paid ceiling, or that let a shared cache hand one visitor's tier to another,
 * would have shipped with the suite green.
 *
 * The route reads no input but Clerk's sign in cookie, which is the point: it
 * accepts no document data and returns none. Spec 0012 added the cookie read
 * and `account`; the decision table itself is `billing-entitlement.test.ts`.
 * With no billing values set, as here, billing is off and everybody gets the
 * free tier with `account: "none"` (AC-2 rule 1).
 */

const CONFIG_KEYS = [
  "NEXT_PUBLIC_FREE_PAGE_CAP",
  "NEXT_PUBLIC_MAX_PAGES",
  "NEXT_PUBLIC_MAX_FILE_BYTES",
  "NEXT_PUBLIC_MATCH_CONTEXT_CHARS",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SOURCE_URL",
  "NEXT_PUBLIC_VERCEL_GIT_PROVIDER",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  "VERCEL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "POLAR_ACCESS_TOKEN",
  "POLAR_ENVIRONMENT",
  "POLAR_PRO_PRODUCT_ID",
  "POLAR_PRO_BENEFIT_ID",
] as const;

const originalEnv = { ...process.env };

/**
 * The route reads `config` at module load, so the environment has to be in
 * place before the import rather than swapped underneath it.
 */
async function loadRoute(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const key of CONFIG_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  return import("@/app/api/entitlement/route");
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
  cookieJar.clear();
});

describe("what the endpoint answers", () => {
  /** covers: AC-9 */
  it("gives everybody the free tier with billing off, whatever cookie is sent", async () => {
    cookieJar.set("__session", "eyJhbGciOiJSUzI1NiJ9.e30.c2ln");
    cookieJar.set("__client_uat", "1791033000");
    const { GET } = await loadRoute();

    const body: unknown = await (await GET()).json();

    expect(body).toMatchObject({ tier: "free", account: "none" });
  });

  it("answers JSON", async () => {
    const { GET } = await loadRoute();

    const response = await GET();

    expect(response.headers.get("Content-Type")).toMatch(/application\/json/);
  });

  it("answers at all, rather than leaving the tool route waiting", async () => {
    const { GET } = await loadRoute();

    expect((await GET()).ok).toBe(true);
  });
});

/**
 * Spec 0001: every cap comes from the typed config module, never a literal. The
 * free cap and the paid ceiling are different numbers, and sending the second
 * one from here is exactly what left the free cap unenforced before spec 0002.
 */
describe("where the caps come from", () => {
  /** covers: AC-9 */
  it("sends the free page cap, never the paid ceiling", async () => {
    const { GET } = await loadRoute({
      NEXT_PUBLIC_FREE_PAGE_CAP: "3",
      NEXT_PUBLIC_MAX_PAGES: "50",
    });

    const body: unknown = await (await GET()).json();

    expect(body).toMatchObject({ pageCap: 3 });
  });

  it("takes both caps from the config module rather than a literal", async () => {
    const { GET } = await loadRoute({
      NEXT_PUBLIC_FREE_PAGE_CAP: "7",
      NEXT_PUBLIC_MAX_PAGES: "9",
      NEXT_PUBLIC_MAX_FILE_BYTES: "4242",
    });

    const body: unknown = await (await GET()).json();

    expect(body).toEqual({
      tier: "free",
      pageCap: 7,
      maxFileBytes: 4242,
      account: "none",
    });
  });

  /** The default the spec fixes, when nothing is configured. */
  it("falls back to the spec's own defaults when nothing is set", async () => {
    const { GET } = await loadRoute();

    const body: unknown = await (await GET()).json();

    expect(body).toEqual({
      tier: "free",
      pageCap: 3,
      maxFileBytes: 26_214_400,
      account: "none",
    });
  });
});

/**
 * A shared cache in front of the application handing one visitor's tier to
 * another would be a real bug rather than a slow page, which is why the header
 * is set even though this version of Next.js does not cache route handlers.
 */
describe("what may cache it", () => {
  /** covers: AC-9 */
  it("forbids a shared cache from keeping it", async () => {
    const { GET } = await loadRoute();

    expect((await GET()).headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("marks it private, so no proxy may hold one visitor's answer for another", async () => {
    const { GET } = await loadRoute();

    const cacheControl = (await GET()).headers.get("Cache-Control") ?? "";

    expect(cacheControl).toContain("private");
    expect(cacheControl).toContain("no-store");
  });
});

/**
 * AC-3. The endpoint accepts no document data and returns none. There is no
 * request body, no query it reads, and nothing about the document in the answer.
 */
describe("what it refuses to know", () => {
  /** covers: AC-3 */
  it("takes no request, so there is nothing about a document it could read", async () => {
    const { GET } = await loadRoute();

    expect(GET).toHaveLength(0);
  });

  /** covers: AC-3 */
  it("answers the same thing however the request was made", async () => {
    const { GET } = await loadRoute();

    const first: unknown = await (await GET()).json();
    const second: unknown = await (await GET()).json();

    expect(first).toEqual(second);
  });

  /**
   * The whole payload, asserted as a whole. If somebody later attaches a
   * request id, a file name or anything else to help with debugging, this
   * fails, and that is the point.
   */
  it("carries four fields and nothing else", async () => {
    const { GET } = await loadRoute();

    const body = (await (await GET()).json()) as Record<string, unknown>;

    expect(Object.keys(body).sort()).toEqual([
      "account",
      "maxFileBytes",
      "pageCap",
      "tier",
    ]);
  });

  it("sets no cookie, so nothing about this visitor is written down", async () => {
    const { GET } = await loadRoute();

    expect((await GET()).headers.get("Set-Cookie")).toBeNull();
  });
});

/**
 * The two sides have to agree. The browser narrows this body from `unknown` and
 * falls back to the free tier on any shape it does not recognise, so a route
 * that drifted would cap everybody silently rather than failing loudly.
 */
describe("agreeing with the browser that reads it", () => {
  /** covers: AC-9 */
  it("answers a shape the client accepts rather than falling back", async () => {
    const { GET } = await loadRoute({
      NEXT_PUBLIC_FREE_PAGE_CAP: "5",
      NEXT_PUBLIC_MAX_PAGES: "50",
      NEXT_PUBLIC_MAX_FILE_BYTES: "1234",
    });
    const answer = await GET();

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(answer)),
    );
    const { getEntitlement } = await import("@/lib/entitlement");

    // The fallback is `pageCap: 5` too, so the distinguishing field is the size
    // cap: only a body that was really read produces 1234.
    await expect(getEntitlement()).resolves.toEqual({
      tier: "free",
      pageCap: 5,
      maxFileBytes: 1234,
      account: "none",
    });

    vi.unstubAllGlobals();
  });
});

/**
 * Spec 0012, AC-1: whatever the decision, the route passes it through whole,
 * keeps its headers, and never sets a cookie (INV-5, AC-19).
 */
describe("every account kind", () => {
  afterEach(() => {
    vi.doUnmock("@/billing/entitlement");
  });

  const answers: readonly EntitlementSnapshot[] = [
    ...ENTITLEMENT_ACCOUNTS.map((account) => ({
      tier: "free" as const,
      pageCap: 3,
      maxFileBytes: 26_214_400,
      account,
    })),
    { tier: "paid", pageCap: 50, maxFileBytes: 26_214_400, account: "signed-in" },
  ];

  for (const answer of answers) {
    it(`answers ${answer.tier} ${answer.account} whole, private, with no cookie`, async () => {
      vi.resetModules();
      vi.doMock("@/billing/entitlement", () => ({
        resolveEntitlement: () => Promise.resolve(answer),
      }));
      const { GET } = await import("@/app/api/entitlement/route");

      const response = await GET();

      expect(await response.json()).toEqual(answer);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("Set-Cookie")).toBeNull();
    });
  }

  it("hands the decision Clerk's cookies and nothing else", async () => {
    cookieJar.set("__session_abc", "token-value");
    const seen: Array<string | undefined> = [];
    vi.resetModules();
    vi.doMock("@/billing/entitlement", () => ({
      resolveEntitlement: (cookie: (name: string) => string | undefined) => {
        seen.push(cookie("__session_abc"), cookie("__client_uat"));
        return Promise.resolve(answers[0]);
      },
    }));
    const { GET } = await import("@/app/api/entitlement/route");

    await GET();

    expect(seen).toEqual(["token-value", undefined]);
  });
});
