import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { BILLING_NAMES, type BillingEnv, readBillingConfig } from "@/config/billing";

/**
 * The billing gate, spec 0012 AC-23 and INV-7. Every case the spec's
 * *Critical test scenarios* list for the config gate, over the pure check,
 * plus the module load that turns its problems into one `ConfigError`.
 */

const { publicKey: PUBLIC_PEM, privateKey: PRIVATE_PEM } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

/** A publishable key as Clerk writes one: the host and a `$`, base64 encoded. */
const publishableKey = (kind: "test" | "live", host: string): string =>
  `pk_${kind}_${Buffer.from(`${host}$`).toString("base64")}`;

const DEV_HOST = "fluent-cat-12.clerk.accounts.dev";
const SECRET_TEST = "sk_test_secretvalue0000000000";
const SECRET_LIVE = "sk_live_secretvalue0000000000";
const POLAR_TOKEN = "polar_oat_secretvalue000000";

const TEST_SET: BillingEnv = Object.freeze({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey("test", DEV_HOST),
  CLERK_SECRET_KEY: SECRET_TEST,
  CLERK_JWT_KEY: PUBLIC_PEM,
  POLAR_ACCESS_TOKEN: POLAR_TOKEN,
  POLAR_ENVIRONMENT: "sandbox",
  POLAR_PRO_PRODUCT_ID: "11111111-1111-4111-8111-111111111111",
  POLAR_PRO_BENEFIT_ID: "22222222-2222-4222-8222-222222222222",
});

const LIVE_SET: BillingEnv = Object.freeze({
  ...TEST_SET,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey("live", "clerk.redactnest.com"),
  CLERK_SECRET_KEY: SECRET_LIVE,
  POLAR_ENVIRONMENT: "production",
});

const VERCEL_PRODUCTION = { VERCEL: "1", VERCEL_ENV: "production" } as const;
const VERCEL_PREVIEW = { VERCEL: "1", VERCEL_ENV: "preview" } as const;

/** No message may repeat a secret, whatever went wrong. */
function expectNoSecrets(problems: readonly string[]): void {
  for (const problem of problems) {
    for (const secret of [
      SECRET_TEST,
      SECRET_LIVE,
      POLAR_TOKEN,
      PUBLIC_PEM,
      PRIVATE_PEM,
    ]) {
      expect(problem).not.toContain(secret);
    }
  }
}

describe("all or nothing", () => {
  it("is off, with no problem, when none of the seven is set", () => {
    const result = readBillingConfig({});
    expect(result.billing).toBeNull();
    expect(result.problems).toEqual([]);
  });

  it("treats blank values as unset", () => {
    const blank = Object.fromEntries(BILLING_NAMES.map((name) => [name, "  "]));
    expect(readBillingConfig(blank)).toEqual({ billing: null, problems: [] });
  });

  it("refuses a partial set in one problem naming every missing value", () => {
    const partial: BillingEnv = {
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: TEST_SET.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      POLAR_ENVIRONMENT: "sandbox",
    };
    const result = readBillingConfig(partial);
    expect(result.billing).toBeNull();
    expect(result.problems).toHaveLength(1);
    for (const name of [
      "CLERK_SECRET_KEY",
      "CLERK_JWT_KEY",
      "POLAR_ACCESS_TOKEN",
      "POLAR_PRO_PRODUCT_ID",
      "POLAR_PRO_BENEFIT_ID",
    ]) {
      expect(result.problems[0]).toContain(name);
    }
    expect(result.problems[0]).not.toContain("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY");
  });

  it("accepts a complete and consistent set off Vercel", () => {
    const { billing, problems } = readBillingConfig(TEST_SET);
    expect(problems).toEqual([]);
    expect(billing).toMatchObject({
      frontendApi: DEV_HOST,
      live: false,
      polarEnvironment: "sandbox",
      proProductId: TEST_SET.POLAR_PRO_PRODUCT_ID,
      proBenefitId: TEST_SET.POLAR_PRO_BENEFIT_ID,
    });
    expect(Object.isFrozen(billing)).toBe(true);
  });

  it("accepts a live set off Vercel too, where nothing says production", () => {
    expect(readBillingConfig(LIVE_SET).problems).toEqual([]);
  });
});

describe("a complete set must agree with itself", () => {
  it("refuses test and live Clerk keys mixed", () => {
    const { billing, problems } = readBillingConfig({
      ...TEST_SET,
      CLERK_SECRET_KEY: SECRET_LIVE,
    });
    expect(billing).toBeNull();
    expect(problems.join("\n")).toMatch(/The Clerk keys disagree/);
    expectNoSecrets(problems);
  });

  it("refuses live keys with the Polar sandbox", () => {
    const { problems } = readBillingConfig({ ...LIVE_SET, POLAR_ENVIRONMENT: "sandbox" });
    expect(problems).toContain(
      "Live Clerk keys need POLAR_ENVIRONMENT=production, not sandbox.",
    );
  });

  it("refuses test keys with Polar production", () => {
    const { problems } = readBillingConfig({
      ...TEST_SET,
      POLAR_ENVIRONMENT: "production",
    });
    expect(problems).toContain(
      "Test Clerk keys need POLAR_ENVIRONMENT=sandbox, not production.",
    );
  });

  it("refuses a Polar environment it does not know", () => {
    const { problems } = readBillingConfig({ ...TEST_SET, POLAR_ENVIRONMENT: "staging" });
    expect(problems.join("\n")).toMatch(
      /POLAR_ENVIRONMENT must be sandbox or production/,
    );
  });

  it("refuses keys without Clerk's prefixes", () => {
    const { problems } = readBillingConfig({
      ...TEST_SET,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "not-a-key",
      CLERK_SECRET_KEY: "also-not",
    });
    expect(problems).toEqual(
      expect.arrayContaining([
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_.",
        "CLERK_SECRET_KEY must start with sk_test_ or sk_live_.",
      ]),
    );
  });

  it("refuses a publishable key that does not parse", () => {
    const { problems } = readBillingConfig({
      ...TEST_SET,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_%%%",
    });
    expect(problems.join("\n")).toMatch(/does not parse/);
  });

  it("refuses a publishable key whose host no Clerk origin covers", () => {
    const { problems } = readBillingConfig({
      ...TEST_SET,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey("test", "clerk.example.com"),
    });
    expect(problems.join("\n")).toMatch(
      /"clerk\.example\.com", which none of the Clerk origins/,
    );
  });

  it("refuses the bare development parent, which the wildcard does not cover", () => {
    const { problems } = readBillingConfig({
      ...TEST_SET,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey("test", "clerk.accounts.dev"),
    });
    expect(problems.join("\n")).toMatch(/none of the Clerk origins/);
  });

  it("accepts a JWT key whose newlines arrive as \\n escapes", () => {
    const escaped = PUBLIC_PEM.trim().replace(/\n/g, "\\n");
    const { billing, problems } = readBillingConfig({
      ...TEST_SET,
      CLERK_JWT_KEY: escaped,
    });
    expect(problems).toEqual([]);
    expect(billing?.jwtKey).toBe(PUBLIC_PEM.trim());
  });

  it("refuses a JWT key that is not a PEM public key, a private key included", () => {
    for (const jwtKey of ["not a key", PRIVATE_PEM]) {
      const { problems } = readBillingConfig({ ...TEST_SET, CLERK_JWT_KEY: jwtKey });
      expect(problems.join("\n")).toMatch(
        /CLERK_JWT_KEY must be the instance's PEM public key/,
      );
      expectNoSecrets(problems);
    }
  });

  it("refuses a PEM public key whose body is not a key", () => {
    const broken = "-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----";
    const { problems } = readBillingConfig({ ...TEST_SET, CLERK_JWT_KEY: broken });
    expect(problems.join("\n")).toMatch(/CLERK_JWT_KEY/);
  });
});

describe("Vercel (INV-7)", () => {
  it("refuses a production deploy with billing off", () => {
    const { problems } = readBillingConfig(VERCEL_PRODUCTION);
    expect(problems.join("\n")).toMatch(/A Vercel production deploy needs billing on/);
  });

  it("refuses a production deploy on test keys", () => {
    const { problems } = readBillingConfig({ ...TEST_SET, ...VERCEL_PRODUCTION });
    expect(problems).toContain(
      "A Vercel production deploy needs live Clerk keys, not test keys.",
    );
  });

  it("refuses a production deploy whose live key names another host", () => {
    const { problems } = readBillingConfig({
      ...LIVE_SET,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: publishableKey(
        "live",
        "clever-dog-3.clerk.accounts.dev",
      ),
      ...VERCEL_PRODUCTION,
    });
    expect(problems.join("\n")).toMatch(
      /needs the publishable key of the clerk\.redactnest\.com instance/,
    );
  });

  it("accepts a production deploy on live keys at clerk.redactnest.com", () => {
    const { billing, problems } = readBillingConfig({
      ...LIVE_SET,
      ...VERCEL_PRODUCTION,
    });
    expect(problems).toEqual([]);
    expect(billing?.live).toBe(true);
  });

  it("refuses live keys on a preview", () => {
    const { problems } = readBillingConfig({ ...LIVE_SET, ...VERCEL_PREVIEW });
    expect(problems.join("\n")).toMatch(
      /Only a Vercel production deploy may hold live Clerk keys/,
    );
  });

  it("accepts test keys on a preview, and billing off there", () => {
    expect(readBillingConfig({ ...TEST_SET, ...VERCEL_PREVIEW }).problems).toEqual([]);
    expect(readBillingConfig(VERCEL_PREVIEW).problems).toEqual([]);
  });
});

describe("at module load", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  function setEnv(env: BillingEnv): void {
    for (const name of [...BILLING_NAMES, "VERCEL", "VERCEL_ENV"])
      delete process.env[name];
    Object.assign(process.env, env);
    vi.resetModules();
  }

  it("is null, and billingEnabled false, with nothing set", async () => {
    setEnv({});
    expect((await import("@/config/billing")).billing).toBeNull();
    expect((await import("@/config")).config.billingEnabled).toBe(false);
  });

  it("loads a complete set, and billingEnabled is true", async () => {
    setEnv(TEST_SET);
    expect((await import("@/config/billing")).billing?.frontendApi).toBe(DEV_HOST);
    expect((await import("@/config")).config.billingEnabled).toBe(true);
  });

  it("throws one ConfigError listing every problem, and no secret", async () => {
    setEnv({ ...LIVE_SET, POLAR_ENVIRONMENT: "sandbox", ...VERCEL_PREVIEW });
    const error = await import("@/config/billing").then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect((error as Error).name).toBe("ConfigError");
    expect(message).toMatch(/The billing configuration stopped this build/);
    expect(message).toMatch(/Live Clerk keys need POLAR_ENVIRONMENT=production/);
    expect(message).toMatch(/Only a Vercel production deploy may hold live Clerk keys/);
    expectNoSecrets([message]);
  });
});
