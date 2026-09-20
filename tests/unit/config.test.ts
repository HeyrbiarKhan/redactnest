import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The config module validates once, at module load. So each case here has to
 * start from a clean module registry with the environment already set, rather
 * than calling a function.
 *
 * These are the checks that stop a typo in an environment variable from
 * silently removing a cap.
 */

const CONFIG_KEYS = [
  "NEXT_PUBLIC_FREE_PAGE_CAP",
  "NEXT_PUBLIC_MAX_PAGES",
  "NEXT_PUBLIC_MAX_FILE_BYTES",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SOURCE_URL",
] as const;

const originalEnv = { ...process.env };

async function loadConfig(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const key of CONFIG_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return (await import("@/config")).config;
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development");
});

afterEach(() => {
  vi.unstubAllEnvs();
  process.env = { ...originalEnv };
});

describe("defaults", () => {
  it("uses the spec's defaults when nothing is set", async () => {
    const config = await loadConfig({});
    expect(config.freePageCap).toBe(3);
    expect(config.maxPages).toBe(50);
    expect(config.maxFileBytes).toBe(26_214_400);
    expect(config.siteUrl).toBe("http://localhost:3000");
  });

  it("reads values that are set", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_FREE_PAGE_CAP: "5",
      NEXT_PUBLIC_MAX_PAGES: "120",
      NEXT_PUBLIC_MAX_FILE_BYTES: "1048576",
    });
    expect(config.freePageCap).toBe(5);
    expect(config.maxPages).toBe(120);
    expect(config.maxFileBytes).toBe(1_048_576);
  });
});

describe("a malformed value fails as loudly as a missing one", () => {
  // Each of these would become NaN or a surprise under a loose Number() parse.
  it.each([
    ["not a number", "three"],
    ["a float", "3.5"],
    ["a negative", "-1"],
    ["hex", "0x10"],
    ["an exponent", "1e2"],
    ["padded with a plus", "+3"],
  ])("rejects %s", async (_label, value) => {
    await expect(loadConfig({ NEXT_PUBLIC_FREE_PAGE_CAP: value })).rejects.toThrow(
      /NEXT_PUBLIC_FREE_PAGE_CAP/,
    );
  });

  it("rejects a cap of zero", async () => {
    await expect(loadConfig({ NEXT_PUBLIC_FREE_PAGE_CAP: "0" })).rejects.toThrow(
      /between 1 and/,
    );
  });

  it("rejects a site url that is not a url", async () => {
    await expect(loadConfig({ NEXT_PUBLIC_SITE_URL: "redactnest.com" })).rejects.toThrow(
      /absolute URL/,
    );
  });
});

describe("the caps have to agree with each other", () => {
  it("refuses a free cap above the paid ceiling", async () => {
    await expect(
      loadConfig({ NEXT_PUBLIC_FREE_PAGE_CAP: "80", NEXT_PUBLIC_MAX_PAGES: "50" }),
    ).rejects.toThrow(/cannot exceed/);
  });

  it("allows a free cap equal to the paid ceiling", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_FREE_PAGE_CAP: "50",
      NEXT_PUBLIC_MAX_PAGES: "50",
    });
    expect(config.freePageCap).toBe(50);
  });
});

describe("production is stricter than development", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
  });

  it("requires the site url", async () => {
    await expect(
      loadConfig({ NEXT_PUBLIC_SOURCE_URL: "https://example.com/x" }),
    ).rejects.toThrow(/NEXT_PUBLIC_SITE_URL is required in production/);
  });

  it("requires the AGPL source offer url", async () => {
    await expect(
      loadConfig({ NEXT_PUBLIC_SITE_URL: "https://redactnest.com" }),
    ).rejects.toThrow(/NEXT_PUBLIC_SOURCE_URL is required in production/);
  });

  it("refuses a plain http site url", async () => {
    await expect(
      loadConfig({
        NEXT_PUBLIC_SITE_URL: "http://redactnest.com",
        NEXT_PUBLIC_SOURCE_URL: "https://example.com/x",
      }),
    ).rejects.toThrow(/must be https in production/);
  });

  it("accepts a complete production configuration", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_SITE_URL: "https://redactnest.com/",
      NEXT_PUBLIC_SOURCE_URL: "https://github.com/o/redactnest/tree/abc123",
    });
    expect(config.siteUrl).toBe("https://redactnest.com");
    expect(config.sourceUrl).toBe("https://github.com/o/redactnest/tree/abc123");
  });
});
