/**
 * The one place every cap and every public URL is read and validated.
 *
 * Spec 0001 invariant: "Every cap comes from the typed config module. No page or
 * size limit is written as a literal anywhere else in the codebase."
 *
 * This module validates at module load, not on first use. It is imported by the
 * root layout, so a missing or malformed value fails `next build` rather than
 * becoming `undefined` at runtime and quietly removing a cap.
 *
 * Each `process.env.NEXT_PUBLIC_*` below is written out literally on purpose.
 * Next.js inlines these into the client bundle by static text substitution, so a
 * computed lookup like `process.env[name]` would come back undefined in the
 * browser even when the variable is set.
 *
 * `VERCEL` and `VERCEL_ENV` are the two names here without the prefix, so they
 * are never inlined: the build and the server see them, and the browser's copy
 * of this module reads them as absent. They are read literally all the same,
 * beside the rest.
 */

import { checkLegalFacts, LEGAL } from "@/lib/legal";

import { ConfigError } from "./error";

export { ConfigError };

const RAW = {
  NEXT_PUBLIC_FREE_PAGE_CAP: process.env.NEXT_PUBLIC_FREE_PAGE_CAP,
  NEXT_PUBLIC_MAX_PAGES: process.env.NEXT_PUBLIC_MAX_PAGES,
  NEXT_PUBLIC_MAX_FILE_BYTES: process.env.NEXT_PUBLIC_MAX_FILE_BYTES,
  NEXT_PUBLIC_MATCH_CONTEXT_CHARS: process.env.NEXT_PUBLIC_MATCH_CONTEXT_CHARS,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SOURCE_URL: process.env.NEXT_PUBLIC_SOURCE_URL,
  // Vercel's system variables, set on every Vercel build once "Automatically
  // expose System Environment Variables" is on (spec 0009, AC-4).
  NEXT_PUBLIC_VERCEL_GIT_PROVIDER: process.env.NEXT_PUBLIC_VERCEL_GIT_PROVIDER,
  NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER: process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER,
  NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG: process.env.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG,
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
  VERCEL: process.env.VERCEL,
  // Which kind of Vercel deploy this is (spec 0011, AC-16 and AC-17). The
  // browser never sees it, so the production rules below run only at build and
  // on the server, while the address shape check also runs in the browser.
  VERCEL_ENV: process.env.VERCEL_ENV,
} as const;

type RawName = keyof typeof RAW;

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Strict integer parse. Rejects anything `Number` would quietly accept but a cap
 * must not be: empty strings, floats, hex, exponents, whitespace, `NaN`,
 * `Infinity`. A present but malformed value fails exactly as a missing one does.
 */
function readInt(name: RawName, fallback: number, min: number, max: number): number {
  const raw = RAW[name];

  if (raw === undefined || raw === "") return fallback;

  if (!/^\d+$/.test(raw.trim())) {
    throw new ConfigError(
      `${name} must be a whole number written in digits only, got ${JSON.stringify(raw)}.`,
    );
  }

  const value = Number(raw.trim());

  if (!Number.isSafeInteger(value)) {
    throw new ConfigError(`${name} is not a safe integer, got ${JSON.stringify(raw)}.`);
  }
  if (value < min || value > max) {
    throw new ConfigError(`${name} must be between ${min} and ${max}, got ${value}.`);
  }

  return value;
}

/** A value that is set and not blank, trimmed, else `undefined`. */
const present = (value: string | undefined): string | undefined =>
  value?.trim() || undefined;

/** An absolute http or https address, and https only in production. */
function parseUrl(name: RawName, raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ConfigError(`${name} must be an absolute URL, got ${JSON.stringify(raw)}.`);
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new ConfigError(`${name} must be http or https, got ${parsed.protocol}.`);
  }
  if (IS_PRODUCTION && parsed.protocol !== "https:") {
    throw new ConfigError(`${name} must be https in production, got ${parsed.protocol}.`);
  }
  return parsed;
}

/** Normalised without a trailing slash so callers can join paths safely. */
const normalise = (url: URL): string =>
  url.origin + url.pathname.replace(/\/$/, "") + url.search;

function readUrl(
  name: RawName,
  fallback: string | undefined,
  requiredInProduction: boolean,
): string {
  const raw = present(RAW[name]);

  if (raw === undefined) {
    if (requiredInProduction && IS_PRODUCTION) {
      throw new ConfigError(`${name} is required in production and was not set.`);
    }
    if (fallback === undefined) {
      throw new ConfigError(`${name} is required and was not set.`);
    }
    return fallback;
  }

  return normalise(parseUrl(name, raw));
}

/** A full commit, as git and Vercel write it. */
const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** What GitHub allows in an owner or repository name. */
const GIT_NAME = /^[A-Za-z0-9._-]+$/;

/** One commit's tree, never a repository root or a branch (spec 0009, AC-6). */
const COMMIT_TREE = /\/tree\/[0-9a-f]{40}$/;

/**
 * The AGPL source offer link. Spec 0009, AC-4 to AC-6.
 *
 * On Vercel it is derived from the commit being built, and nothing set by hand
 * can replace it (INV-2). Off Vercel it is `NEXT_PUBLIC_SOURCE_URL`. Either way
 * a production build refuses any link that is not one full commit's tree, so a
 * repository root or a branch can never ship (INV-1). The rules run in AC-5's
 * order, and each error names the variable it is about.
 *
 * The `VERCEL` rule can only fire where `VERCEL` is visible, at build and on
 * the server. The browser never sees it, so there that rule is skipped, by
 * design: the browser gets the same inlined Git values and derives the same
 * link the build did.
 */
function readSourceUrl(): string {
  const sha = present(RAW.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA);
  const handSet = present(RAW.NEXT_PUBLIC_SOURCE_URL);

  let name: RawName = "NEXT_PUBLIC_SOURCE_URL";
  let raw = handSet;

  if (sha !== undefined) {
    const owner = present(RAW.NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER);
    const slug = present(RAW.NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG);
    const provider = present(RAW.NEXT_PUBLIC_VERCEL_GIT_PROVIDER);

    if (handSet !== undefined) {
      throw new ConfigError(
        "NEXT_PUBLIC_SOURCE_URL must not be set on Vercel. The source link is derived " +
          "from the commit being built, so remove it from every Vercel environment.",
      );
    }
    if (owner === undefined) {
      throw new ConfigError(
        "NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER is missing while NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is set.",
      );
    }
    if (slug === undefined) {
      throw new ConfigError(
        "NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG is missing while NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is set.",
      );
    }
    if (provider !== "github") {
      throw new ConfigError(
        `NEXT_PUBLIC_VERCEL_GIT_PROVIDER must be github, got ${JSON.stringify(provider ?? "")}.`,
      );
    }
    if (!COMMIT_SHA.test(sha)) {
      throw new ConfigError(
        `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA must be a full commit, 40 lowercase hex characters, got ${JSON.stringify(sha)}.`,
      );
    }
    for (const [key, value] of [
      ["NEXT_PUBLIC_VERCEL_GIT_REPO_OWNER", owner],
      ["NEXT_PUBLIC_VERCEL_GIT_REPO_SLUG", slug],
    ] as const) {
      if (!GIT_NAME.test(value)) {
        throw new ConfigError(
          `${key} may hold only letters, digits, ".", "_" and "-", got ${JSON.stringify(value)}.`,
        );
      }
    }

    name = "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA";
    raw = `https://github.com/${owner}/${slug}/tree/${sha}`;
  } else if (present(RAW.VERCEL) === "1") {
    throw new ConfigError(
      "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is missing on Vercel (VERCEL is 1). Turn on " +
        '"Automatically expose System Environment Variables" and deploy from Git.',
    );
  }

  if (raw === undefined) {
    if (IS_PRODUCTION) {
      throw new ConfigError(
        "NEXT_PUBLIC_SOURCE_URL is required in production and was not set.",
      );
    }
    // AC-3: a development build with no commit to link to.
    return "";
  }

  const url = parseUrl(name, raw);
  const link = normalise(url);

  if (
    IS_PRODUCTION &&
    (url.search !== "" || url.hash !== "" || !COMMIT_TREE.test(link))
  ) {
    throw new ConfigError(
      `${name} must link to one commit's tree in production: https, no query, no hash, ` +
        `ending in /tree/ and 40 lowercase hex characters. Got ${JSON.stringify(raw)}.`,
    );
  }
  return link;
}

// Ceilings chosen to be generous but finite. They exist so a typo in an
// environment variable cannot hand someone an effectively unbounded cap.
const PAGE_CEILING = 10_000;
const BYTE_CEILING = 2_147_483_647; // what one ArrayBuffer can sensibly hold

/**
 * Spec 0002, INV-9. The upper bound is a privacy limit rather than a display
 * one: the context window is document text crossing to the main thread, so a
 * typo in an environment variable must not be able to widen it to a page.
 */
const CONTEXT_CHAR_CEILING = 200;

const freePageCap = readInt("NEXT_PUBLIC_FREE_PAGE_CAP", 3, 1, PAGE_CEILING);
const maxPages = readInt("NEXT_PUBLIC_MAX_PAGES", 50, 1, PAGE_CEILING);
const maxFileBytes = readInt("NEXT_PUBLIC_MAX_FILE_BYTES", 26_214_400, 1, BYTE_CEILING);
const matchContextChars = readInt(
  "NEXT_PUBLIC_MATCH_CONTEXT_CHARS",
  40,
  0,
  CONTEXT_CHAR_CEILING,
);

if (freePageCap > maxPages) {
  throw new ConfigError(
    `NEXT_PUBLIC_FREE_PAGE_CAP (${freePageCap}) cannot exceed NEXT_PUBLIC_MAX_PAGES (${maxPages}).`,
  );
}

/** What Vercel sets `VERCEL_ENV` to. A custom environment reports `preview`. */
const VERCEL_ENVIRONMENTS: readonly string[] = ["production", "preview", "development"];

/**
 * The launch gate. Spec 0011, AC-16 and AC-17, INV-5.
 *
 * A production deploy refuses the placeholder contact and a pending Article 27
 * decision, and every build refuses a malformed address or representative.
 * Fail closed: on Vercel a `VERCEL_ENV` that is missing or unknown cannot say
 * whether this is production, so it is a problem in itself, as a missing
 * commit is for the source link. Every problem goes into one error, so a
 * deploy with two of them is fixed in one pass rather than two.
 */
function checkLaunchFacts(): void {
  const vercelEnv = present(RAW.VERCEL_ENV);
  const problems = [
    present(RAW.VERCEL) === "1" &&
    (vercelEnv === undefined || !VERCEL_ENVIRONMENTS.includes(vercelEnv))
      ? `VERCEL_ENV must be production, preview or development on Vercel (VERCEL is 1), got ${JSON.stringify(vercelEnv ?? "")}. Turn on "Automatically expose System Environment Variables".`
      : null,
    ...checkLegalFacts(LEGAL, vercelEnv),
  ].filter((problem) => problem !== null);

  if (problems.length > 0) {
    throw new ConfigError(
      `The launch gate stopped this build:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
  }
}

export const config = Object.freeze({
  /** Pages an anonymous visitor may redact. */
  freePageCap,
  /** The paid ceiling. Raise only after measuring the real browser limit. */
  maxPages,
  /** The paid size ceiling, in bytes. */
  maxFileBytes,
  /**
   * Characters of surrounding text shown either side of a match in the review
   * checklist, so somebody can judge it without opening the document again.
   *
   * Spec 0002, INV-1 and INV-9: this text crosses the worker boundary, which is
   * a deliberate loosening of spec 0001. It is never stored and never sent, and
   * the window size is read here rather than written anywhere else.
   */
  matchContextChars,
  /** Canonical origin, for metadata and the sitemap. */
  siteUrl: readUrl("NEXT_PUBLIC_SITE_URL", "http://localhost:3000", true),
  /**
   * The AGPL source offer link: the tree of the exact commit this deploy was
   * built from, never the repository root, because section 13 wants the source
   * of the version that is running. Empty in a development build with no
   * commit to name. Spec 0009, AC-4 to AC-6.
   */
  sourceUrl: readSourceUrl(),
});

// Last, so a cap or a source link that is wrong is still reported the way it
// always was, and the launch gate speaks only once everything else is sound.
checkLaunchFacts();

export type Config = typeof config;
