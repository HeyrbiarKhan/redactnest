/**
 * The billing configuration, all or nothing. Spec 0012, AC-23 and INV-7.
 *
 * Seven values switch accounts and the paid plan on. Set all of them, or none:
 * with none, billing is off, which is a real mode rather than an error, so a
 * self hosted copy of the AGPL source builds with no keys and offers no Pro it
 * cannot sell. A partial set fails the build, naming every value it lacks.
 *
 * A complete set must also agree with itself, because each mismatch below is
 * a deploy that looks fine and then charges nobody, or charges real cards from
 * a test sign in: test keys go with the Polar sandbox and live keys with
 * production, the publishable key must name a Clerk host the content security
 * policy already allows, and the token key must be a public key. A Vercel
 * production deploy runs only on live keys at our own Clerk domain, and every
 * other Vercel build (a preview, or `vercel dev`) runs with billing off, so
 * any one of the seven there stops it (INV-7). The token check accepts one
 * site address (`azp`, INV-11), and a preview's address is never that one.
 *
 * Imported by the root layout, so every build and every server start runs
 * these checks, as `src/config/index.ts` does for the caps. Every problem goes
 * into one `ConfigError`, so a deploy with two of them is fixed in one pass.
 * No message ever repeats a key or a token, only its name.
 *
 * Server only. The browser learns whether billing is on from
 * `config.billingEnabled` in `src/config/index.ts`, never from here.
 */

import "server-only";

import { createPublicKey } from "node:crypto";

import { parsePublishableKey } from "@clerk/shared/keys";

import { ConfigError } from "./error";
import { CLERK_ORIGINS, CLERK_PRODUCTION_ORIGIN, originCoversHost } from "./privacy";

/** The seven values, in the order the spec lists them. */
export const BILLING_NAMES = [
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "POLAR_ACCESS_TOKEN",
  "POLAR_ENVIRONMENT",
  "POLAR_PRO_PRODUCT_ID",
  "POLAR_PRO_BENEFIT_ID",
] as const;

export type BillingName = (typeof BILLING_NAMES)[number];

/** What the checks read: the seven values, and which Vercel deploy this is. */
export type BillingEnv = Readonly<
  Partial<Record<BillingName | "VERCEL" | "VERCEL_ENV", string>>
>;

export type PolarEnvironment = "sandbox" | "production";

export interface BillingConfig {
  readonly publishableKey: string;
  /** Server only. Consumed in `src/billing/clients.ts` and nowhere else. */
  readonly secretKey: string;
  /** The instance's public key, as PEM with real newlines. */
  readonly jwtKey: string;
  /** The Frontend API host the publishable key names. */
  readonly frontendApi: string;
  /** Live keys and Polar production, rather than test keys and the sandbox. */
  readonly live: boolean;
  /** Server only. Consumed in `src/billing/clients.ts` and nowhere else. */
  readonly polarAccessToken: string;
  readonly polarEnvironment: PolarEnvironment;
  /** The RedactNest Pro product, for checkout and the renewal date. */
  readonly proProductId: string;
  /** The RedactNest Pro feature flag benefit, the marker of Pro (INV-6). */
  readonly proBenefitId: string;
}

/** A host as a publishable key should name one: lowercase labels, no port, no path. */
const HOST_SHAPE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

const PEM_PUBLIC_KEY = /^-----BEGIN PUBLIC KEY-----\n[\s\S]+\n-----END PUBLIC KEY-----$/;

/** A value that is set and not blank, trimmed, else `undefined`. */
const present = (value: string | undefined): string | undefined =>
  value?.trim() || undefined;

/** `test`, `live`, or neither, from a Clerk key's prefix. */
function keyKind(value: string, prefix: "pk" | "sk"): "test" | "live" | null {
  if (value.startsWith(`${prefix}_test_`)) return "test";
  if (value.startsWith(`${prefix}_live_`)) return "live";
  return null;
}

/**
 * Hosting platforms store a multi line value with its newlines written as
 * `\n`, so those become real newlines before the key is read.
 */
const normaliseJwtKey = (value: string): string =>
  value.replace(/\\n/g, "\n").replace(/\r\n/g, "\n").trim();

function isPublicKeyPem(pem: string): boolean {
  // The header check comes first because `createPublicKey` also accepts a
  // private key and derives its public half, and a private key pasted here
  // is a mistake the build should name, not quietly repair.
  if (!PEM_PUBLIC_KEY.test(pem)) return false;
  try {
    createPublicKey(pem);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every problem with a billing configuration, and the configuration itself
 * when there are none. Pure, so the test can feed it every case in the spec's
 * *Critical test scenarios*; the module load below runs it on the real values.
 */
export function readBillingConfig(env: BillingEnv): {
  readonly billing: BillingConfig | null;
  readonly problems: readonly string[];
} {
  const values = Object.fromEntries(
    BILLING_NAMES.map((name) => [name, present(env[name])]),
  ) as Record<BillingName, string | undefined>;
  const missing = BILLING_NAMES.filter((name) => values[name] === undefined);

  const onVercel = present(env.VERCEL) === "1";
  const vercelProduction = onVercel && present(env.VERCEL_ENV) === "production";

  if (missing.length === BILLING_NAMES.length) {
    return {
      billing: null,
      problems: vercelProduction
        ? [
            "A Vercel production deploy needs billing on: set all seven billing values, with live Clerk keys and POLAR_ENVIRONMENT=production.",
          ]
        : [],
    };
  }
  if (onVercel && !vercelProduction) {
    const set = BILLING_NAMES.filter((name) => values[name] !== undefined);
    return {
      billing: null,
      problems: [
        `Every Vercel build but production runs with billing off, so it may hold none of the seven billing values. Remove them from this environment: ${set.join(", ")}.`,
      ],
    };
  }
  if (missing.length > 0) {
    return {
      billing: null,
      problems: [
        `Billing is all or nothing: set all seven billing values, or none. Missing: ${missing.join(", ")}.`,
      ],
    };
  }

  // Every value is present from here on.
  const publishableKey = values.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY as string;
  const secretKey = values.CLERK_SECRET_KEY as string;
  const jwtKey = normaliseJwtKey(values.CLERK_JWT_KEY as string);
  const polarEnvironment = values.POLAR_ENVIRONMENT as string;

  const publishableKind = keyKind(publishableKey, "pk");
  const secretKind = keyKind(secretKey, "sk");
  const parsed = publishableKind ? parsePublishableKey(publishableKey) : null;
  const host = parsed?.frontendApi ?? "";
  const live = publishableKind === "live";

  const problems = [
    publishableKind === null
      ? "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_test_ or pk_live_."
      : null,
    secretKind === null ? "CLERK_SECRET_KEY must start with sk_test_ or sk_live_." : null,
    publishableKind && secretKind && publishableKind !== secretKind
      ? `The Clerk keys disagree: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is a ${publishableKind} key and CLERK_SECRET_KEY a ${secretKind} key. Use both test keys or both live keys.`
      : null,
    polarEnvironment !== "sandbox" && polarEnvironment !== "production"
      ? `POLAR_ENVIRONMENT must be sandbox or production, got ${JSON.stringify(polarEnvironment)}.`
      : null,
    publishableKind === "live" && polarEnvironment === "sandbox"
      ? "Live Clerk keys need POLAR_ENVIRONMENT=production, not sandbox."
      : null,
    publishableKind === "test" && polarEnvironment === "production"
      ? "Test Clerk keys need POLAR_ENVIRONMENT=sandbox, not production."
      : null,
    publishableKind && parsed === null
      ? "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY does not parse as a Clerk publishable key."
      : null,
    parsed &&
    (!HOST_SHAPE.test(host) ||
      !CLERK_ORIGINS.some((origin) => originCoversHost(origin, host)))
      ? `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY names the host ${JSON.stringify(host)}, which none of the Clerk origins in src/config/privacy.ts covers (${CLERK_ORIGINS.join(", ")}).`
      : null,
    isPublicKeyPem(jwtKey)
      ? null
      : "CLERK_JWT_KEY must be the instance's PEM public key (-----BEGIN PUBLIC KEY----- ... -----END PUBLIC KEY-----).",
    vercelProduction && publishableKind === "test"
      ? "A Vercel production deploy needs live Clerk keys, not test keys."
      : null,
    vercelProduction && parsed && `https://${host}` !== CLERK_PRODUCTION_ORIGIN
      ? `A Vercel production deploy needs the publishable key of the ${CLERK_PRODUCTION_ORIGIN.replace("https://", "")} instance, not ${JSON.stringify(host)}.`
      : null,
  ].filter((problem) => problem !== null);

  if (problems.length > 0) return { billing: null, problems };

  return {
    billing: Object.freeze({
      publishableKey,
      secretKey,
      jwtKey,
      frontendApi: host,
      live,
      polarAccessToken: values.POLAR_ACCESS_TOKEN as string,
      polarEnvironment: polarEnvironment as PolarEnvironment,
      proProductId: values.POLAR_PRO_PRODUCT_ID as string,
      proBenefitId: values.POLAR_PRO_BENEFIT_ID as string,
    }),
    problems: [],
  };
}

// Each name written out literally, as `src/config/index.ts` does, so nothing
// here depends on how a bundler treats a computed lookup.
const loaded = readBillingConfig({
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  CLERK_JWT_KEY: process.env.CLERK_JWT_KEY,
  POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN,
  POLAR_ENVIRONMENT: process.env.POLAR_ENVIRONMENT,
  POLAR_PRO_PRODUCT_ID: process.env.POLAR_PRO_PRODUCT_ID,
  POLAR_PRO_BENEFIT_ID: process.env.POLAR_PRO_BENEFIT_ID,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

if (loaded.problems.length > 0) {
  throw new ConfigError(
    `The billing configuration stopped this build:\n${loaded.problems.map((problem) => `- ${problem}`).join("\n")}`,
  );
}

/** The billing configuration, or `null` when billing is off on this build. */
export const billing: BillingConfig | null = loaded.billing;
