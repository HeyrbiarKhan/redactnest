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
  "NEXT_PUBLIC_MATCH_CONTEXT_CHARS",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SOURCE_URL",
  "NEXT_PUBLIC_VERCEL_GIT_PROVIDER",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER",
  "NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG",
  "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
  "VERCEL",
] as const;

/** A full commit, so a production build accepts a link to its tree. */
const SHA = "0123456789abcdef0123456789abcdef01234567";
const TREE_URL = `https://github.com/o/redactnest/tree/${SHA}`;

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
    expect(config.matchContextChars).toBe(40);
    expect(config.siteUrl).toBe("http://localhost:3000");
  });

  it("reads values that are set", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_FREE_PAGE_CAP: "5",
      NEXT_PUBLIC_MAX_PAGES: "120",
      NEXT_PUBLIC_MAX_FILE_BYTES: "1048576",
      NEXT_PUBLIC_MATCH_CONTEXT_CHARS: "80",
    });
    expect(config.freePageCap).toBe(5);
    expect(config.maxPages).toBe(120);
    expect(config.maxFileBytes).toBe(1_048_576);
    expect(config.matchContextChars).toBe(80);
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

  /**
   * Spec 0002, AC-15 and INV-9. The context window is document text crossing to
   * the main thread, so its ceiling is a privacy limit rather than a display
   * one, and a malformed value has to fail the build like any other cap.
   */
  it.each([
    ["not a number", "wide"],
    ["a float", "40.5"],
    ["a negative", "-1"],
    ["past the ceiling", "201"],
  ])("rejects a match context window that is %s", async (_label, value) => {
    await expect(loadConfig({ NEXT_PUBLIC_MATCH_CONTEXT_CHARS: value })).rejects.toThrow(
      /NEXT_PUBLIC_MATCH_CONTEXT_CHARS/,
    );
  });

  /** Zero is a real answer here: show the match and no surrounding text. */
  it("allows a match context window of zero", async () => {
    const config = await loadConfig({ NEXT_PUBLIC_MATCH_CONTEXT_CHARS: "0" });
    expect(config.matchContextChars).toBe(0);
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
    await expect(loadConfig({ NEXT_PUBLIC_SOURCE_URL: TREE_URL })).rejects.toThrow(
      /NEXT_PUBLIC_SITE_URL is required in production/,
    );
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
        NEXT_PUBLIC_SOURCE_URL: TREE_URL,
      }),
    ).rejects.toThrow(/must be https in production/);
  });

  it("accepts a complete production configuration", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_SITE_URL: "https://redactnest.com/",
      NEXT_PUBLIC_SOURCE_URL: `${TREE_URL}/`,
    });
    expect(config.siteUrl).toBe("https://redactnest.com");
    expect(config.sourceUrl).toBe(TREE_URL);
  });
});

/**
 * The AGPL source offer link. Spec 0009, AC-3 to AC-6, INV-1 and INV-2.
 *
 * A Vercel build derives it from the commit being built; anywhere else it is
 * set by hand. A production build refuses anything but one commit's tree.
 */
describe("the source link", () => {
  /** What every Vercel build has once its system variables are exposed. */
  const VERCEL_BUILD = {
    VERCEL: "1",
    NEXT_PUBLIC_VERCEL_GIT_PROVIDER: "github",
    NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER: "HeyrbiarKhan",
    NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG: "redactnest",
    NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: SHA,
  };
  const SITE = { NEXT_PUBLIC_SITE_URL: "https://redactnest.com" };

  /** covers: AC-3 */
  it("is empty in development when nothing names a commit", async () => {
    const config = await loadConfig({});
    expect(config.sourceUrl).toBe("");
  });

  describe("on Vercel", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    /** covers: AC-4 */
    it("is the tree of the commit being built", async () => {
      const config = await loadConfig({ ...SITE, ...VERCEL_BUILD });
      expect(config.sourceUrl).toBe(
        `https://github.com/HeyrbiarKhan/redactnest/tree/${SHA}`,
      );
    });

    /** covers: AC-4. A fork deployed on Vercel links to its own source. */
    it("names whichever repository Vercel built", async () => {
      const config = await loadConfig({
        ...SITE,
        ...VERCEL_BUILD,
        NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER: "someone-else",
        NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG: "my.fork_2",
      });
      expect(config.sourceUrl).toBe(
        `https://github.com/someone-else/my.fork_2/tree/${SHA}`,
      );
    });

    /** covers: AC-4. The browser never sees VERCEL, and derives the same link. */
    it("derives the same link where VERCEL is not visible", async () => {
      const config = await loadConfig({ ...SITE, ...VERCEL_BUILD, VERCEL: undefined });
      expect(config.sourceUrl).toBe(
        `https://github.com/HeyrbiarKhan/redactnest/tree/${SHA}`,
      );
    });

    /** covers: AC-5, in its order. Each error names the variable it is about. */
    it.each([
      [
        "a hand set link beside the commit",
        { NEXT_PUBLIC_SOURCE_URL: TREE_URL },
        /NEXT_PUBLIC_SOURCE_URL must not be set on Vercel/,
      ],
      [
        "a missing owner",
        { NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER: undefined },
        /NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER is missing/,
      ],
      [
        "a missing slug",
        { NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG: undefined },
        /NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG is missing/,
      ],
      [
        "a gitlab provider",
        { NEXT_PUBLIC_VERCEL_GIT_PROVIDER: "gitlab" },
        /NEXT_PUBLIC_VERCEL_GIT_PROVIDER must be github/,
      ],
      [
        "a missing provider",
        { NEXT_PUBLIC_VERCEL_GIT_PROVIDER: undefined },
        /NEXT_PUBLIC_VERCEL_GIT_PROVIDER must be github/,
      ],
      [
        "a short commit",
        { NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: SHA.slice(0, 7) },
        /NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA must be a full commit/,
      ],
      [
        "an uppercase commit",
        { NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase() },
        /NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA must be a full commit/,
      ],
      [
        "an owner holding a slash",
        { NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER: "evil/../x" },
        /NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER may hold only/,
      ],
      [
        "a slug holding a query",
        { NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG: "redactnest?x=1" },
        /NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG may hold only/,
      ],
    ])("refuses %s", async (_label, change, error) => {
      await expect(loadConfig({ ...SITE, ...VERCEL_BUILD, ...change })).rejects.toThrow(
        error,
      );
    });

    /** covers: AC-5. The rules run in order, so the hand set link is named first. */
    it("checks the hand set link before anything else", async () => {
      await expect(
        loadConfig({
          ...SITE,
          ...VERCEL_BUILD,
          NEXT_PUBLIC_SOURCE_URL: TREE_URL,
          NEXT_PUBLIC_VERCEL_GIT_PROVIDER: "gitlab",
          NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "short",
        }),
      ).rejects.toThrow(/NEXT_PUBLIC_SOURCE_URL must not be set on Vercel/);
    });

    /** covers: AC-5. The system variables are off, or the deploy was not from Git. */
    it("refuses a Vercel build with no commit", async () => {
      await expect(
        loadConfig({ ...SITE, VERCEL: "1", NEXT_PUBLIC_SOURCE_URL: TREE_URL }),
      ).rejects.toThrow(/NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is missing on Vercel/);
    });

    /** covers: AC-5. Empty and whitespace count as absent, for every variable. */
    it("treats a blank value as absent", async () => {
      await expect(
        loadConfig({ ...SITE, ...VERCEL_BUILD, NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "  " }),
      ).rejects.toThrow(/NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is missing on Vercel/);

      const config = await loadConfig({
        ...SITE,
        ...VERCEL_BUILD,
        NEXT_PUBLIC_SOURCE_URL: "",
      });
      expect(config.sourceUrl).toBe(
        `https://github.com/HeyrbiarKhan/redactnest/tree/${SHA}`,
      );
    });
  });

  describe("off Vercel, in production", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "production");
    });

    /** covers: AC-6 */
    it("accepts a hand set link to one commit's tree", async () => {
      const config = await loadConfig({
        ...SITE,
        NEXT_PUBLIC_SOURCE_URL: ` ${TREE_URL} `,
      });
      expect(config.sourceUrl).toBe(TREE_URL);
    });

    /** covers: AC-6, INV-1. A repository root or a branch can never ship. */
    it.each([
      ["a repository root", "https://github.com/o/redactnest"],
      ["a branch", "https://github.com/o/redactnest/tree/main"],
      ["a short commit", "https://github.com/o/redactnest/tree/0123456"],
      [
        "an uppercase commit",
        `https://github.com/o/redactnest/tree/${SHA.toUpperCase()}`,
      ],
      ["a query", `${TREE_URL}?tab=readme`],
      ["a hash", `${TREE_URL}#readme`],
      ["a path after the commit", `${TREE_URL}/src`],
    ])("refuses %s", async (_label, link) => {
      await expect(loadConfig({ ...SITE, NEXT_PUBLIC_SOURCE_URL: link })).rejects.toThrow(
        /NEXT_PUBLIC_SOURCE_URL must link to one commit's tree/,
      );
    });

    it("refuses plain http", async () => {
      await expect(
        loadConfig({
          ...SITE,
          NEXT_PUBLIC_SOURCE_URL: `http://github.com/o/redactnest/tree/${SHA}`,
        }),
      ).rejects.toThrow(/NEXT_PUBLIC_SOURCE_URL must be https in production/);
    });
  });

  /** covers: AC-6. Development builds skip the format check (spec 0001's rule). */
  it("takes any link in development", async () => {
    const config = await loadConfig({
      NEXT_PUBLIC_SOURCE_URL: "http://localhost/x/tree/main",
    });
    expect(config.sourceUrl).toBe("http://localhost/x/tree/main");
  });
});
