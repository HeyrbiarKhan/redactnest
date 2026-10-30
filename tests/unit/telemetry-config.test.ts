import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseSentryDsn,
  readTelemetryConfig,
  TELEMETRY_NAMES,
  type TelemetryEnv,
} from "@/config/telemetry";

/**
 * The telemetry gate, spec 0016 AC-5 and AC-9. Every case the spec's
 * *Critical test scenarios* list for the gate, over the pure check, plus the
 * module load that turns its problems into one `ConfigError`, and the public
 * flag the browser reads.
 */

const WEBSITE_ID = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const DSN =
  "https://0123456789abcdef0123456789abcdef@o4500000000000000.ingest.de.sentry.io/4500000000000001";
const SHA = "0123456789abcdef0123456789abcdef01234567";

const BOTH: TelemetryEnv = Object.freeze({
  UMAMI_WEBSITE_ID: WEBSITE_ID,
  SENTRY_DSN: DSN,
});
const VERCEL_PRODUCTION: TelemetryEnv = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "production",
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: SHA,
});
const VERCEL_PREVIEW: TelemetryEnv = Object.freeze({
  VERCEL: "1",
  VERCEL_ENV: "preview",
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: SHA,
});

/** Neither value, nor any part of one, may appear in a message (AC-9). */
function expectNoValues(problems: readonly string[]): void {
  for (const problem of problems) {
    expect(problem).not.toContain(WEBSITE_ID);
    expect(problem).not.toContain("0123456789abcdef0123456789abcdef");
    expect(problem).not.toContain("o4500000000000000");
  }
}

describe("parseSentryDsn", () => {
  it("works out the envelope address from the DSN", () => {
    expect(parseSentryDsn(DSN)).toEqual({
      dsn: DSN,
      envelopeUrl:
        "https://o4500000000000000.ingest.de.sentry.io/api/4500000000000001/envelope/",
    });
  });

  it.each([
    ["not a URL", "sentry"],
    ["http", DSN.replace("https:", "http:")],
    ["no key", "https://o1.ingest.sentry.io/1"],
    ["a secret key as well", "https://abc:def@o1.ingest.sentry.io/1"],
    ["a host that is not Sentry's", "https://abc@o1.ingest.sentry.io.example.com/1"],
    ["a look alike host", "https://abc@evilsentry.io/1"],
    ["no project", "https://abc@o1.ingest.sentry.io/"],
    ["a project that is not a number", "https://abc@o1.ingest.sentry.io/my-project"],
    ["a path after the project", "https://abc@o1.ingest.sentry.io/1/extra"],
    ["a port", "https://abc@o1.ingest.sentry.io:8443/1"],
    ["a query", "https://abc@o1.ingest.sentry.io/1?x=1"],
  ])("refuses %s", (_label, dsn) => {
    expect(parseSentryDsn(dsn)).toBeNull();
  });
});

describe("readTelemetryConfig", () => {
  it("forwards nothing, and has no problem, with neither value off Vercel", () => {
    expect(readTelemetryConfig({})).toEqual({ sinks: null, problems: [] });
  });

  it("forwards nothing off Vercel even with both values set", () => {
    expect(readTelemetryConfig(BOTH)).toEqual({ sinks: null, problems: [] });
  });

  it("forwards to both on a Vercel production build with both values", () => {
    const { sinks, problems } = readTelemetryConfig({ ...BOTH, ...VERCEL_PRODUCTION });
    expect(problems).toEqual([]);
    expect(sinks).toEqual({
      umamiWebsiteId: WEBSITE_ID,
      sentry: parseSentryDsn(DSN),
      release: SHA,
    });
  });

  it.each(TELEMETRY_NAMES)("fails a build that sets one value but not %s", (name) => {
    const { sinks, problems } = readTelemetryConfig({ ...BOTH, [name]: undefined });
    expect(sinks).toBeNull();
    expect(problems).toEqual([expect.stringContaining(`Missing: ${name}.`)]);
  });

  it("fails a Vercel production build with neither value", () => {
    const { problems } = readTelemetryConfig(VERCEL_PRODUCTION);
    expect(problems).toEqual([
      expect.stringMatching(/A Vercel production deploy needs telemetry on/),
    ]);
  });

  it("fails a preview that holds either value", () => {
    for (const name of TELEMETRY_NAMES) {
      const { sinks, problems } = readTelemetryConfig({
        ...VERCEL_PREVIEW,
        [name]: BOTH[name],
      });
      expect(sinks).toBeNull();
      expect(problems).toContainEqual(
        expect.stringMatching(
          new RegExp(
            `may hold neither telemetry value\\. Remove them from this environment: ${name}\\.`,
          ),
        ),
      );
      expectNoValues(problems);
    }
  });

  it("fails a preview that holds both, naming both", () => {
    const { problems } = readTelemetryConfig({ ...BOTH, ...VERCEL_PREVIEW });
    expect(problems).toEqual([
      expect.stringContaining(
        "Remove them from this environment: UMAMI_WEBSITE_ID, SENTRY_DSN.",
      ),
    ]);
  });

  it("fails any Vercel build with the e2e flag set", () => {
    for (const vercel of [VERCEL_PRODUCTION, VERCEL_PREVIEW]) {
      const { problems } = readTelemetryConfig({
        ...(vercel === VERCEL_PRODUCTION ? BOTH : {}),
        ...vercel,
        NEXT_PUBLIC_TELEMETRY_E2E: "1",
      });
      expect(problems).toEqual([
        expect.stringMatching(
          /NEXT_PUBLIC_TELEMETRY_E2E is for the Playwright build only/,
        ),
      ]);
    }
  });

  it("lets the e2e flag through off Vercel, where nothing is forwarded", () => {
    expect(readTelemetryConfig({ NEXT_PUBLIC_TELEMETRY_E2E: "1" })).toEqual({
      sinks: null,
      problems: [],
    });
  });

  it("fails a website id that is not a UUID, without repeating it", () => {
    const { problems } = readTelemetryConfig({
      ...BOTH,
      UMAMI_WEBSITE_ID: "my-site-123",
    });
    expect(problems).toEqual([expect.stringMatching(/UMAMI_WEBSITE_ID must be a UUID/)]);
    expect(problems[0]).not.toContain("my-site-123");
  });

  it("fails a DSN that is not Sentry's, without repeating it", () => {
    const { problems } = readTelemetryConfig({
      ...BOTH,
      SENTRY_DSN: "https://key@errors.example.com/1",
    });
    expect(problems).toEqual([expect.stringMatching(/SENTRY_DSN must be/)]);
    expect(problems[0]).not.toContain("errors.example.com");
  });

  it("puts every problem in one list, so one deploy fixes them all", () => {
    const { problems } = readTelemetryConfig({
      UMAMI_WEBSITE_ID: "not-a-uuid",
      ...VERCEL_PREVIEW,
      NEXT_PUBLIC_TELEMETRY_E2E: "1",
    });
    expect(problems).toHaveLength(4);
    expectNoValues(problems);
  });

  it("reads a blank value as no value", () => {
    expect(readTelemetryConfig({ UMAMI_WEBSITE_ID: "  ", SENTRY_DSN: "" })).toEqual({
      sinks: null,
      problems: [],
    });
  });
});

describe("at module load", () => {
  const originalEnv = { ...process.env };
  const NAMES = [
    ...TELEMETRY_NAMES,
    "VERCEL",
    "VERCEL_ENV",
    "NEXT_PUBLIC_VERCEL_ENV",
    "NEXT_PUBLIC_TELEMETRY_E2E",
  ];

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  function setEnv(env: Record<string, string>): void {
    for (const name of NAMES) delete process.env[name];
    Object.assign(process.env, env);
    vi.resetModules();
  }

  it("is null with nothing set", async () => {
    setEnv({});
    expect((await import("@/config/telemetry")).telemetrySinks).toBeNull();
  });

  it("throws one ConfigError listing every problem, and no value", async () => {
    setEnv({ UMAMI_WEBSITE_ID: "not-a-uuid" });
    const error = await import("@/config/telemetry").then(
      () => null,
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).name).toBe("ConfigError");
    const message = (error as Error).message;
    expect(message).toMatch(/The telemetry configuration stopped this build/);
    expect(message).toMatch(/Missing: SENTRY_DSN/);
    expect(message).toMatch(/UMAMI_WEBSITE_ID must be a UUID/);
    expect(message).not.toContain("not-a-uuid");
  });

  // AC-5: what the browser reads to decide whether to send at all.
  it.each([
    [{}, false],
    [{ NEXT_PUBLIC_VERCEL_ENV: "production" }, true],
    [{ NEXT_PUBLIC_VERCEL_ENV: "preview" }, false],
    [{ NEXT_PUBLIC_VERCEL_ENV: "development" }, false],
    [{ NEXT_PUBLIC_TELEMETRY_E2E: "1" }, true],
    [{ NEXT_PUBLIC_TELEMETRY_E2E: "true" }, false],
  ])("sets telemetryReporting from %j to %s", async (env, reporting) => {
    setEnv(env);
    expect((await import("@/config")).config.telemetryReporting).toBe(reporting);
  });
});
