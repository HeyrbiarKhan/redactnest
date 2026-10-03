/**
 * Who is asking, from Clerk's cookies alone. Spec 0012, AC-2 rules 2 to 5,
 * INV-4 and INV-11.
 *
 * The plan check reads the sign in itself rather than through Clerk's proxy,
 * because the proxy never runs on `/tool` or `/api/entitlement` (INV-1), and
 * it asks Clerk nothing: there is no network call anywhere in this module. A
 * forged or malformed cookie is refused right here, so anonymous and forged
 * traffic can never spend the shared Polar rate limit (INV-4).
 *
 * The one relaxation is expiry. Clerk's session token lives 60 seconds and is
 * refreshed by Clerk's script, which `/tool` never loads, so a visitor's token
 * is nearly always expired by the time they ask. `verifyJwt` in
 * `@clerk/backend` checks the signature and the authorized party before the
 * expiry, so an expiry verdict proves the token genuine, and the route trusts
 * a genuine token for up to `SESSION_TRUST_MS` after it was issued. Everything
 * else is checked in full on both paths, by `verifyToken` and then here on the
 * decoded payload, because `verifyToken` checks no issuer, lets a token with
 * no `azp` through, and on an expired token stops before `nbf` and `iat`.
 * `tests/unit/billing-entitlement.test.ts` pins that order, so a Clerk change
 * to it fails a test rather than quietly granting or refusing.
 */

import "server-only";

import { verifyToken } from "@clerk/backend";
import {
  TokenVerificationError,
  TokenVerificationErrorReason,
} from "@clerk/backend/errors";
import { decodeJwt } from "@clerk/backend/jwt";
import { getCookieSuffix, getSuffixedCookieName } from "@clerk/shared/keys";

/**
 * How long a genuine expired token still names its user: the session lifetime
 * Clerk's free plan fixes, 7 days. A rule about Clerk's sessions, not a cap on
 * the visitor, so it is a named constant here. A longer window needs a paid
 * Clerk plan first (spec 0012, Consequences).
 */
export const SESSION_TRUST_MS = 7 * 86_400_000;

/**
 * Clerk's own allowance for clocks that disagree, the default `verifyToken`
 * applies, so `nbf` and `iat` are judged here exactly as Clerk judges them.
 */
const CLOCK_SKEW_MS = 5_000;

/** Clerk's cookie names, before any suffix. */
const SESSION_COOKIE = "__session";
const CLIENT_UAT_COOKIE = "__client_uat";

export type SessionVerdict =
  | { readonly kind: "none" }
  | { readonly kind: "sign-in-needed" }
  | { readonly kind: "user"; readonly userId: string };

/** A cookie's value by name, or `undefined`. */
export type CookieJar = (name: string) => string | undefined;

export interface SessionDeps {
  readonly publishableKey: string;
  /** The instance's PEM public key: verification needs no network call. */
  readonly jwtKey: string;
  /** `https://` plus the Frontend API host the publishable key names. */
  readonly issuer: string;
  /** The origin of `config.siteUrl`, the only page a token may come from. */
  readonly authorizedParty: string;
  /** Milliseconds since the epoch. */
  readonly now: () => number;
}

const NONE: SessionVerdict = Object.freeze({ kind: "none" });
const SIGN_IN_NEEDED: SessionVerdict = Object.freeze({ kind: "sign-in-needed" });

/** A cookie's value, or `undefined` when it is absent or blank. */
const valueOf = (cookie: CookieJar, name: string): string | undefined =>
  cookie(name)?.trim() || undefined;

/**
 * The suffixed name first, then the plain one, as Clerk itself reads them:
 * Clerk suffixes its cookies with a hash of the publishable key so two
 * instances on one domain do not trample each other.
 */
function readClerkCookie(
  cookie: CookieJar,
  name: string,
  suffix: string,
): string | undefined {
  return valueOf(cookie, getSuffixedCookieName(name, suffix)) ?? valueOf(cookie, name);
}

/** `__client_uat` holds the last sign in time in seconds, and 0 once signed out. */
function signedInBefore(clientUat: string | undefined): boolean {
  if (clientUat === undefined || !/^\d+$/.test(clientUat)) return false;
  const seconds = Number(clientUat);
  return Number.isSafeInteger(seconds) && seconds > 0;
}

/**
 * The checks `verifyToken` leaves to us (INV-11), on the decoded payload: the
 * issuer, an authorized party that is present and ours, a subject, and an
 * `nbf` and `iat` that are not in the future. Returns the subject and the
 * issue time when every one holds.
 */
function checkClaims(
  token: string,
  deps: SessionDeps,
): { readonly userId: string; readonly issuedAtMs: number } | null {
  let payload: Record<string, unknown>;
  try {
    payload = decodeJwt(token).payload as unknown as Record<string, unknown>;
  } catch {
    return null;
  }
  const { iss, azp, sub, nbf, iat } = payload;
  const latest = deps.now() + CLOCK_SKEW_MS;

  if (iss !== deps.issuer) return null;
  if (typeof azp !== "string" || azp !== deps.authorizedParty) return null;
  if (typeof sub !== "string" || sub === "") return null;
  if (typeof iat !== "number" || !Number.isFinite(iat) || iat * 1000 > latest)
    return null;
  if (nbf !== undefined && (typeof nbf !== "number" || nbf * 1000 > latest)) return null;

  return { userId: sub, issuedAtMs: iat * 1000 };
}

/**
 * AC-2 rules 2 to 5: `none`, `sign-in-needed`, or the user a genuine token
 * names. Never throws, and never calls anything outside this process.
 */
export async function readSession(
  cookie: CookieJar,
  deps: SessionDeps,
): Promise<SessionVerdict> {
  const suffix = await getCookieSuffix(deps.publishableKey);
  const token = readClerkCookie(cookie, SESSION_COOKIE, suffix);

  // Rule 2: no token. A positive `__client_uat` means this browser signed in
  // and its token has gone, which is worth saying ("sign in again").
  if (token === undefined) {
    return signedInBefore(readClerkCookie(cookie, CLIENT_UAT_COOKIE, suffix))
      ? SIGN_IN_NEEDED
      : NONE;
  }

  // Rule 3: the signature, the authorized party and the rest, by Clerk.
  let expired: boolean;
  try {
    await verifyToken(token, {
      jwtKey: deps.jwtKey,
      authorizedParties: [deps.authorizedParty],
      clockSkewInMs: CLOCK_SKEW_MS,
    });
    expired = false;
  } catch (error) {
    // Only an expiry verdict proves the token genuine, because the signature
    // and the authorized party are checked before it. Anything else, a bad
    // signature included, is refused.
    if (
      !(error instanceof TokenVerificationError) ||
      error.reason !== TokenVerificationErrorReason.TokenExpired
    ) {
      return SIGN_IN_NEEDED;
    }
    expired = true;
  }

  // Rule 3, the part `verifyToken` does not do, on both paths.
  const claims = checkClaims(token, deps);
  if (claims === null) return SIGN_IN_NEEDED;

  // Rule 4: fresh. Rule 5: expired, but issued within the trust window.
  if (expired && deps.now() - claims.issuedAtMs > SESSION_TRUST_MS) return SIGN_IN_NEEDED;

  return Object.freeze({ kind: "user", userId: claims.userId });
}
