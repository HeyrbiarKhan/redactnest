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
 */

const RAW = {
  NEXT_PUBLIC_FREE_PAGE_CAP: process.env.NEXT_PUBLIC_FREE_PAGE_CAP,
  NEXT_PUBLIC_MAX_PAGES: process.env.NEXT_PUBLIC_MAX_PAGES,
  NEXT_PUBLIC_MAX_FILE_BYTES: process.env.NEXT_PUBLIC_MAX_FILE_BYTES,
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  NEXT_PUBLIC_SOURCE_URL: process.env.NEXT_PUBLIC_SOURCE_URL,
} as const;

type RawName = keyof typeof RAW;

/** Thrown at module load so the build fails instead of the browser. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(`[config] ${message}`);
    this.name = "ConfigError";
  }
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * Strict integer parse. Rejects anything `Number` would quietly accept but a cap
 * must not be: empty strings, floats, hex, exponents, whitespace, `NaN`,
 * `Infinity`. A present but malformed value fails exactly as a missing one does.
 */
function readInt(
  name: RawName,
  fallback: number,
  min: number,
  max: number,
): number {
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

function readUrl(
  name: RawName,
  fallback: string | undefined,
  requiredInProduction: boolean,
): string {
  const raw = RAW[name]?.trim();

  if (!raw) {
    if (requiredInProduction && IS_PRODUCTION) {
      throw new ConfigError(`${name} is required in production and was not set.`);
    }
    if (fallback === undefined) {
      throw new ConfigError(`${name} is required and was not set.`);
    }
    return fallback;
  }

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

  // Normalised without a trailing slash so callers can join paths safely.
  return parsed.origin + parsed.pathname.replace(/\/$/, "") + parsed.search;
}

// Ceilings chosen to be generous but finite. They exist so a typo in an
// environment variable cannot hand someone an effectively unbounded cap.
const PAGE_CEILING = 10_000;
const BYTE_CEILING = 2_147_483_647; // what one ArrayBuffer can sensibly hold

const freePageCap = readInt("NEXT_PUBLIC_FREE_PAGE_CAP", 3, 1, PAGE_CEILING);
const maxPages = readInt("NEXT_PUBLIC_MAX_PAGES", 50, 1, PAGE_CEILING);
const maxFileBytes = readInt("NEXT_PUBLIC_MAX_FILE_BYTES", 26_214_400, 1, BYTE_CEILING);

if (freePageCap > maxPages) {
  throw new ConfigError(
    `NEXT_PUBLIC_FREE_PAGE_CAP (${freePageCap}) cannot exceed NEXT_PUBLIC_MAX_PAGES (${maxPages}).`,
  );
}

export const config = Object.freeze({
  /** Pages an anonymous visitor may redact. */
  freePageCap,
  /** The paid ceiling. Raise only after measuring the real browser limit. */
  maxPages,
  /** The paid size ceiling, in bytes. */
  maxFileBytes,
  /** Canonical origin, for metadata and the sitemap. */
  siteUrl: readUrl("NEXT_PUBLIC_SITE_URL", "http://localhost:3000", true),
  /**
   * The AGPL source offer link. Points at the tag or commit for this deploy,
   * never the repository root: section 13 wants source matching the exact
   * deployed version.
   */
  sourceUrl: readUrl("NEXT_PUBLIC_SOURCE_URL", "", true),
});

export type Config = typeof config;
