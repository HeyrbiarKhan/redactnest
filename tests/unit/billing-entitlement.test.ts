import { createPrivateKey, generateKeyPairSync, sign } from "node:crypto";

import { verifyToken } from "@clerk/backend";
import {
  TokenVerificationError,
  TokenVerificationErrorReason,
} from "@clerk/backend/errors";
import { getCookieSuffix } from "@clerk/shared/keys";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BillingSeams,
  type EntitlementCaps,
  resolveEntitlement,
} from "@/billing/entitlement";
import { SESSION_TRUST_MS } from "@/billing/session";

/**
 * The plan check's decision table, spec 0012 AC-1 and AC-2, INV-4, INV-6 and
 * INV-11, with fakes for the one seam and tokens signed here with a locally
 * generated key pair.
 *
 * Every refusal is asserted twice over: the answer, and that nothing left the
 * process. The fake Polar records each call, and `fetch` fails the test if
 * anything (a JWKS lookup, a Clerk session call) ever reaches for the network.
 */

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);

const keyPair = () =>
  generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
const INSTANCE = keyPair();
const STRANGER = keyPair();

const HOST = "fluent-cat-12.clerk.accounts.dev";
const PUBLISHABLE_KEY = `pk_test_${Buffer.from(`${HOST}$`).toString("base64")}`;
const ISSUER = `https://${HOST}`;
const SITE = "https://redactnest.test";
const USER = "user_2RfWKJREkjKbHZy0Wqa5qrHeAnb";
const OTHER_USER = "user_otherotherotherotherother";
const PRO_BENEFIT = "benefit-pro";
const PRO_PRODUCT = "product-pro";

const CAPS: EntitlementCaps = Object.freeze({
  freePageCap: 3,
  maxPages: 50,
  maxFileBytes: 4242,
});

const base64url = (value: string | Buffer): string =>
  Buffer.from(value).toString("base64url");

/** An RS256 token exactly as written, every claim under the test's control. */
function token(
  claims: Record<string, unknown>,
  privateKey: string = INSTANCE.privateKey,
): string {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "ins_test" }));
  const payload = base64url(JSON.stringify(claims));
  const signature = sign(
    "sha256",
    Buffer.from(`${header}.${payload}`),
    createPrivateKey(privateKey),
  );
  return `${header}.${payload}.${base64url(signature)}`;
}

/** Claims Clerk would write for a token issued `ageMs` ago, 60 seconds long. */
function claims(
  ageMs: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const iat = Math.floor((NOW - ageMs) / 1000);
  return {
    iss: ISSUER,
    azp: SITE,
    sub: USER,
    sid: "sess_test",
    iat,
    nbf: iat - 10,
    exp: iat + 60,
    ...overrides,
  };
}

const FRESH = 10_000;
const EXPIRED = 2 * DAY;

/** Polar's customer state, as much of it as the route reads. */
function state(benefitIds: readonly string[], subscriptions: readonly unknown[] = []) {
  return {
    id: "customer-1",
    external_id: USER,
    granted_benefits: benefitIds.map((benefit_id, index) => ({
      id: `grant-${index}`,
      benefit_id,
      benefit_type: "feature_flag",
    })),
    active_subscriptions: subscriptions,
    active_meters: [],
  };
}

/** A failure as Polar's SDK throws one: an error carrying its HTTP status. */
const polarError = (statusCode: number) =>
  Object.assign(new Error(`Polar API returned an error: ${statusCode}`), { statusCode });

interface FakePolar {
  readonly calls: string[];
  readonly lookup: BillingSeams["getStateExternal"];
}

function fakePolar(respond: (externalId: string) => Promise<unknown>): FakePolar {
  const calls: string[] = [];
  return {
    calls,
    lookup: (externalId) => {
      calls.push(externalId);
      return respond(externalId);
    },
  };
}

const PRO_STATE = () => Promise.resolve(state([PRO_BENEFIT]));

function seams(polar: FakePolar): BillingSeams {
  return {
    publishableKey: PUBLISHABLE_KEY,
    jwtKey: INSTANCE.publicKey,
    issuer: ISSUER,
    authorizedParty: SITE,
    now: () => Date.now(),
    proBenefitId: PRO_BENEFIT,
    proProductId: PRO_PRODUCT,
    getStateExternal: polar.lookup,
  };
}

let suffix = "";

/** A cookie jar from a plain record. */
const jar =
  (cookies: Record<string, string>) =>
  (name: string): string | undefined =>
    cookies[name];

async function check(cookies: Record<string, string>, polar = fakePolar(PRO_STATE)) {
  const answer = await resolveEntitlement(jar(cookies), {
    caps: CAPS,
    billing: seams(polar),
  });
  return { answer, polar };
}

const network = vi.fn(() => {
  throw new Error("No network call is allowed in the plan check's token path.");
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  vi.stubGlobal("fetch", network);
  suffix = await getCookieSuffix(PUBLISHABLE_KEY);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  network.mockClear();
});

describe("rule 1: billing off", () => {
  it("answers free, none, and asks nobody", async () => {
    const answer = await resolveEntitlement(jar({ __session: token(claims(FRESH)) }), {
      caps: CAPS,
      billing: null,
    });
    expect(answer).toEqual({
      tier: "free",
      pageCap: 3,
      maxFileBytes: 4242,
      account: "none",
    });
  });
});

describe("rule 2: no token", () => {
  it("answers free, none, with no cookies at all", async () => {
    const { answer, polar } = await check({});
    expect(answer).toMatchObject({ tier: "free", account: "none" });
    expect(polar.calls).toEqual([]);
  });

  it("says sign in again when __client_uat holds a positive number", async () => {
    for (const name of ["__client_uat", `__client_uat_${suffix}`]) {
      const { answer, polar } = await check({ [name]: "1791033000" });
      expect(answer).toMatchObject({ tier: "free", account: "sign-in-needed" });
      expect(polar.calls).toEqual([]);
    }
  });

  it("answers none when __client_uat is zero, as it is after signing out", async () => {
    const { answer } = await check({ __client_uat: "0" });
    expect(answer).toMatchObject({ tier: "free", account: "none" });
  });

  it("answers none when __client_uat is not a number", async () => {
    for (const value of ["", "abc", "-5", "1.5"]) {
      const { answer } = await check({ __client_uat: value });
      expect(answer.account).toBe("none");
    }
  });

  it("reads the suffixed __client_uat before the plain one", async () => {
    const { answer } = await check({
      [`__client_uat_${suffix}`]: "0",
      __client_uat: "1791033000",
    });
    expect(answer.account).toBe("none");
  });
});

describe("rules 3 to 6: a genuine token reaches Polar with its sub, and nothing else", () => {
  it("takes a fresh token's sub", async () => {
    const { answer, polar } = await check({ __session: token(claims(FRESH)) });
    expect(answer).toEqual({
      tier: "paid",
      pageCap: 50,
      maxFileBytes: 4242,
      account: "signed-in",
    });
    expect(polar.calls).toEqual([USER]);
  });

  it("takes an expired token's sub when it was issued 6 days ago", async () => {
    const { answer, polar } = await check({ __session: token(claims(6 * DAY)) });
    expect(answer).toMatchObject({ tier: "paid", account: "signed-in" });
    expect(polar.calls).toEqual([USER]);
  });

  it("still trusts a token issued right at the edge of the window", async () => {
    const { polar } = await check({ __session: token(claims(SESSION_TRUST_MS)) });
    expect(polar.calls).toEqual([USER]);
  });

  it("reads the suffixed session cookie before the plain one", async () => {
    const { polar } = await check({
      [`__session_${suffix}`]: token(claims(FRESH)),
      __session: token(claims(FRESH, { sub: OTHER_USER })),
    });
    expect(polar.calls).toEqual([USER]);
  });

  it("falls back to the plain session cookie when no suffixed one is set", async () => {
    const { polar } = await check({
      __session: token(claims(FRESH, { sub: OTHER_USER })),
    });
    expect(polar.calls).toEqual([OTHER_USER]);
  });
});

/**
 * INV-11. Each failing token, fresh and expired where the case applies, with
 * `__client_uat` both positive and absent: free, sign in again, and no call.
 */
describe("INV-11: a token that is not genuine is refused locally", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly make: (ageMs: number) => string;
    readonly ages: readonly number[];
  }> = [
    {
      name: "a bad signature",
      make: (age) => token(claims(age), STRANGER.privateKey),
      ages: [FRESH, EXPIRED],
    },
    {
      name: "a wrong iss",
      make: (age) => token(claims(age, { iss: "https://evil.clerk.accounts.dev" })),
      ages: [FRESH, EXPIRED],
    },
    {
      name: "a missing azp",
      make: (age) => token(claims(age, { azp: undefined })),
      ages: [FRESH, EXPIRED],
    },
    {
      name: "a wrong azp",
      make: (age) => token(claims(age, { azp: "https://evil.example" })),
      ages: [FRESH, EXPIRED],
    },
    {
      name: "an nbf in the future",
      make: (age) => token(claims(age, { nbf: Math.floor(NOW / 1000) + 3600 })),
      ages: [FRESH, EXPIRED],
    },
    {
      name: "an iat in the future",
      make: (age) => token(claims(age, { iat: Math.floor(NOW / 1000) + 3600 })),
      ages: [FRESH, EXPIRED],
    },
    { name: "an iat 8 days ago", make: (age) => token(claims(age)), ages: [8 * DAY] },
    {
      name: "a missing sub",
      make: (age) => token(claims(age, { sub: undefined })),
      ages: [FRESH, EXPIRED],
    },
    {
      name: "no iat at all",
      make: (age) => token(claims(age, { iat: undefined })),
      ages: [FRESH, EXPIRED],
    },
  ];

  for (const { name, make, ages } of cases) {
    for (const age of ages) {
      for (const uat of [true, false]) {
        const label = `${name}, ${age === FRESH ? "fresh" : `issued ${age / DAY} days ago`}, __client_uat ${uat ? "positive" : "absent"}`;
        it(label, async () => {
          const cookies: Record<string, string> = { __session: make(age) };
          if (uat) cookies.__client_uat = "1791033000";
          const { answer, polar } = await check(cookies);
          expect(answer).toMatchObject({ tier: "free", account: "sign-in-needed" });
          expect(polar.calls).toEqual([]);
          expect(network).not.toHaveBeenCalled();
        });
      }
    }
  }

  it("refuses a token that is not a JWT at all", async () => {
    for (const value of ["abc", "a.b.c", "eyJhbGciOiJub25lIn0.e30."]) {
      const { answer, polar } = await check({ __session: value });
      expect(answer).toMatchObject({ tier: "free", account: "sign-in-needed" });
      expect(polar.calls).toEqual([]);
    }
  });

  it("refuses an unsigned token", async () => {
    const header = base64url(JSON.stringify({ alg: "none", typ: "JWT" }));
    const payload = base64url(JSON.stringify(claims(FRESH)));
    const { answer, polar } = await check({ __session: `${header}.${payload}.` });
    expect(answer.account).toBe("sign-in-needed");
    expect(polar.calls).toEqual([]);
  });
});

/**
 * Pinned: the expiry relaxation is only safe because Clerk checks the
 * signature first. If `@clerk/backend` ever reorders that, these fail.
 */
describe("expired means genuine (the order verifyToken checks in)", () => {
  const options = () => ({ jwtKey: INSTANCE.publicKey, authorizedParties: [SITE] });

  async function reason(value: string): Promise<string | null> {
    try {
      await verifyToken(value, options());
      return null;
    } catch (error) {
      return error instanceof TokenVerificationError
        ? error.reason
        : "not a TokenVerificationError";
    }
  }

  it("reports an expired token with a bad signature as invalid, not expired", async () => {
    expect(await reason(token(claims(EXPIRED), STRANGER.privateKey))).toBe(
      TokenVerificationErrorReason.TokenInvalidSignature,
    );
  });

  it("reports an expired token from another site as the wrong party, not expired", async () => {
    expect(await reason(token(claims(EXPIRED, { azp: "https://evil.example" })))).toBe(
      TokenVerificationErrorReason.TokenInvalidAuthorizedParties,
    );
  });

  it("reports a genuine expired token as expired", async () => {
    expect(await reason(token(claims(EXPIRED)))).toBe(
      TokenVerificationErrorReason.TokenExpired,
    );
  });

  it("accepts a genuine fresh token", async () => {
    expect(await reason(token(claims(FRESH)))).toBeNull();
  });
});

describe("rules 6 and 7: what Polar says", () => {
  const cookies = () => ({ __session: token(claims(FRESH)) });

  it("is paid for a customer holding the Pro benefit", async () => {
    const { answer } = await check(cookies(), fakePolar(PRO_STATE));
    expect(answer).toMatchObject({ tier: "paid", pageCap: 50, account: "signed-in" });
  });

  it("is free and signed in for a customer without it", async () => {
    const { answer } = await check(
      cookies(),
      fakePolar(() => Promise.resolve(state([]))),
    );
    expect(answer).toMatchObject({ tier: "free", pageCap: 3, account: "signed-in" });
  });

  it("is free and signed in when Polar has no such customer (404)", async () => {
    const { answer } = await check(
      cookies(),
      fakePolar(() => Promise.reject(polarError(404))),
    );
    expect(answer).toMatchObject({ tier: "free", account: "signed-in" });
  });

  it("ignores a benefit from another product (INV-6)", async () => {
    const { answer } = await check(
      cookies(),
      fakePolar(() => Promise.resolve(state(["benefit-other-product"]))),
    );
    expect(answer).toMatchObject({ tier: "free", account: "signed-in" });
  });

  it("is not paid for a Pro subscription whose benefit is not granted yet (INV-6)", async () => {
    const subscription = {
      id: "sub-1",
      product_id: PRO_PRODUCT,
      status: "active",
      current_period_end: "2026-11-03T12:00:00Z",
      cancel_at_period_end: false,
    };
    const { answer } = await check(
      cookies(),
      fakePolar(() => Promise.resolve(state([], [subscription]))),
    );
    expect(answer).toMatchObject({ tier: "free", account: "signed-in" });
  });

  it.each([401, 403, 422, 429, 500, 503])(
    "is unknown when Polar answers %i",
    async (status) => {
      const { answer } = await check(
        cookies(),
        fakePolar(() => Promise.reject(polarError(status))),
      );
      expect(answer).toMatchObject({ tier: "free", pageCap: 3, account: "unknown" });
    },
  );

  it("is unknown when the call throws, as a timeout or a dropped connection does", async () => {
    const { answer } = await check(
      cookies(),
      fakePolar(() => Promise.reject(new Error("This operation was aborted"))),
    );
    expect(answer.account).toBe("unknown");
  });

  it.each([
    ["nothing", null],
    ["a string", "ok"],
    ["no benefit list", { active_subscriptions: [] }],
    [
      "a benefit list that is not a list",
      { granted_benefits: "pro", active_subscriptions: [] },
    ],
    ["a grant with no benefit id", { granted_benefits: [{}], active_subscriptions: [] }],
    [
      "a Pro subscription with no period end",
      {
        granted_benefits: [],
        active_subscriptions: [{ product_id: PRO_PRODUCT, cancel_at_period_end: false }],
      },
    ],
  ])("is unknown when Polar answers %s", async (_name, body) => {
    const { answer } = await check(
      cookies(),
      fakePolar(() => Promise.resolve(body)),
    );
    expect(answer).toMatchObject({ tier: "free", account: "unknown" });
  });

  it("sends Polar the user id and nothing else (claim C5)", async () => {
    const { polar } = await check(cookies());
    expect(polar.calls).toEqual([USER]);
  });

  it("only ever pays a signed in answer (INV-2)", async () => {
    const answers = await Promise.all(
      (
        [{}, { __client_uat: "5" }, cookies(), { __session: "abc" }] as Record<
          string,
          string
        >[]
      ).map((jarCookies) => check(jarCookies).then(({ answer }) => answer)),
    );
    for (const answer of answers) {
      if (answer.tier === "paid") expect(answer.account).toBe("signed-in");
    }
  });
});

describe("the timeout on the one outbound call", () => {
  afterEach(() => {
    vi.doUnmock("@polar-sh/sdk/2026-10");
    vi.resetModules();
  });

  it("binds Polar's customer state to OUTBOUND_TIMEOUT_MS, in seconds", async () => {
    const requests: unknown[] = [];
    vi.resetModules();
    vi.doMock("@polar-sh/sdk/2026-10", () => ({
      createPolar: () => ({
        customers: {
          getStateExternal: (externalId: string, requestOptions: unknown) => {
            requests.push({ externalId, requestOptions });
            return Promise.resolve(state([]));
          },
        },
      }),
    }));
    const originalEnv = { ...process.env };
    Object.assign(process.env, {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      CLERK_SECRET_KEY: "sk_test_x",
      CLERK_JWT_KEY: INSTANCE.publicKey,
      POLAR_ACCESS_TOKEN: "polar_oat_x",
      POLAR_ENVIRONMENT: "sandbox",
      POLAR_PRO_PRODUCT_ID: PRO_PRODUCT,
      POLAR_PRO_BENEFIT_ID: PRO_BENEFIT,
    });
    try {
      const { entitlementSeams, OUTBOUND_TIMEOUT_MS } = await import("@/billing/clients");
      expect(OUTBOUND_TIMEOUT_MS).toBe(1_500);
      await entitlementSeams()?.getStateExternal(USER);
      expect(requests).toEqual([{ externalId: USER, requestOptions: { timeout: 1.5 } }]);
    } finally {
      process.env = originalEnv;
    }
  });
});
