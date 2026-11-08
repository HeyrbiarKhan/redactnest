/**
 * Where counts and failure reports go, both or neither. Spec 0016, AC-9 and
 * INV-8.
 *
 * Two values switch forwarding on: the Umami website id and the Sentry DSN.
 * Set both, or neither. Only a Vercel production build forwards anything, so
 * that is the one build that must have them, and every other Vercel build (a
 * preview, or `vercel dev`) must have neither. Off Vercel nothing is ever
 * forwarded, whatever is set, so a self hosted copy of the AGPL source sends
 * nothing to our Umami or Sentry projects.
 *
 * Imported by the root layout, so every build and every server start runs
 * these checks, as `src/config/billing.ts` does. Every problem goes into one
 * `ConfigError`, so a deploy with two of them is fixed in one pass, and no
 * message ever repeats a value, only its name.
 *
 * Server only, and the only place the two values are read (AC-24). They are
 * never `NEXT_PUBLIC_`, so nobody can post to our projects from a page; the
 * browser learns only whether to send, from `config.telemetryReporting`.
 */

import "server-only";

import { ConfigError } from "./error";

/** The two values, in the order the spec lists them. */
export const TELEMETRY_NAMES = ["UMAMI_WEBSITE_ID", "SENTRY_DSN"] as const;

type TelemetryName = (typeof TELEMETRY_NAMES)[number];

/** What the checks read: the two values, which Vercel deploy this is, and its commit. */
export type TelemetryEnv = Readonly<
  Partial<
    Record<
      | TelemetryName
      | "VERCEL"
      | "VERCEL_ENV"
      | "NEXT_PUBLIC_TELEMETRY_E2E"
      | "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA",
      string
    >
  >
>;

export interface SentrySink {
  /** The whole DSN, which the envelope's header carries as its authentication (AC-20). */
  readonly dsn: string;
  /** `https://<host>/api/<project>/envelope/`, worked out from the DSN. */
  readonly envelopeUrl: string;
}

export interface TelemetrySinks {
  readonly umamiWebsiteId: string;
  readonly sentry: SentrySink;
  /** The commit this build came from, Sentry's `release` (AC-20). */
  readonly release: string;
}

/** Umami's website id: a UUID, as its dashboard shows it. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A value that is set and not blank, trimmed, else `undefined`. */
const present = (value: string | undefined): string | undefined =>
  value?.trim() || undefined;

/**
 * A Sentry DSN, `https://<key>@<host>/<project>` on a host ending
 * `.sentry.io`, as the envelope address it names, or `null`. Sentry's own
 * hosts only, so a DSN pasted from somewhere else cannot point reports at a
 * stranger's server.
 */
export function parseSentryDsn(dsn: string): SentrySink | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const project = url.pathname.slice(1);
  const wellFormed =
    url.protocol === "https:" &&
    /^[0-9a-z]+$/i.test(url.username) &&
    url.password === "" &&
    url.port === "" &&
    url.search === "" &&
    url.hash === "" &&
    url.hostname.endsWith(".sentry.io") &&
    /^\d+$/.test(project);
  if (!wellFormed) return null;
  return Object.freeze({
    dsn,
    envelopeUrl: `https://${url.hostname}/api/${project}/envelope/`,
  });
}

/**
 * Every problem with the telemetry values, and where to forward when there
 * are none. Pure, so the test can feed it every case in the spec's *Critical
 * test scenarios*; the module load below runs it on the real values.
 */
export function readTelemetryConfig(env: TelemetryEnv): {
  readonly sinks: TelemetrySinks | null;
  readonly problems: readonly string[];
} {
  const websiteId = present(env.UMAMI_WEBSITE_ID);
  const dsn = present(env.SENTRY_DSN);
  const release = present(env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA);
  const set = TELEMETRY_NAMES.filter((name) => present(env[name]) !== undefined);
  const missing = TELEMETRY_NAMES.filter((name) => present(env[name]) === undefined);

  const onVercel = present(env.VERCEL) === "1";
  const vercelProduction = onVercel && present(env.VERCEL_ENV) === "production";
  const sentry = dsn === undefined ? null : parseSentryDsn(dsn);

  const problems = [
    set.length === 1
      ? `Telemetry is both or neither: set UMAMI_WEBSITE_ID and SENTRY_DSN together, or neither. Missing: ${missing.join(", ")}.`
      : null,
    vercelProduction && set.length === 0
      ? "A Vercel production deploy needs telemetry on: set UMAMI_WEBSITE_ID and SENTRY_DSN for Production."
      : null,
    onVercel && !vercelProduction && set.length > 0
      ? `Only a Vercel production build forwards counts and reports, so this one may hold neither telemetry value. Remove them from this environment: ${set.join(", ")}.`
      : null,
    onVercel && present(env.NEXT_PUBLIC_TELEMETRY_E2E) !== undefined
      ? "NEXT_PUBLIC_TELEMETRY_E2E is for the Playwright build only. Remove it from every Vercel environment."
      : null,
    websiteId !== undefined && !UUID.test(websiteId)
      ? "UMAMI_WEBSITE_ID must be a UUID, the website id Umami's dashboard shows."
      : null,
    dsn !== undefined && sentry === null
      ? "SENTRY_DSN must be https://<key>@<host>/<project> on a host ending .sentry.io, as Sentry's project settings show it."
      : null,
    vercelProduction && set.length > 0 && release === undefined
      ? "NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA is missing, and every Sentry report names the commit it came from."
      : null,
  ].filter((problem) => problem !== null);

  if (problems.length > 0) return { sinks: null, problems };
  // Off Vercel, and on any Vercel build but production, nothing is forwarded.
  if (
    !vercelProduction ||
    websiteId === undefined ||
    sentry === null ||
    release === undefined
  ) {
    return { sinks: null, problems: [] };
  }

  return {
    sinks: Object.freeze({ umamiWebsiteId: websiteId.toLowerCase(), sentry, release }),
    problems: [],
  };
}

// Each name written out literally, as `src/config/index.ts` does, so nothing
// here depends on how a bundler treats a computed lookup.
const loaded = readTelemetryConfig({
  UMAMI_WEBSITE_ID: process.env.UMAMI_WEBSITE_ID,
  SENTRY_DSN: process.env.SENTRY_DSN,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  NEXT_PUBLIC_TELEMETRY_E2E: process.env.NEXT_PUBLIC_TELEMETRY_E2E,
  NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
});

if (loaded.problems.length > 0) {
  throw new ConfigError(
    `The telemetry configuration stopped this build:\n${loaded.problems.map((problem) => `- ${problem}`).join("\n")}`,
  );
}

/** Where to forward counts and reports, or `null` when this build forwards nothing. */
export const telemetrySinks: TelemetrySinks | null = loaded.sinks;
