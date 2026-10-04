/**
 * Where Manage billing sends the person in front of it. Spec 0012, AC-17 and
 * INV-3.
 *
 * One call to Polar: a customer session for the session's own user, by
 * external id, whose answer carries the portal's address. The user id comes
 * from the verified Clerk session, handed in by the page from `auth()`, and
 * nothing the browser sends reaches here, so nobody can open someone else's
 * billing. With no session, Polar is never called.
 *
 * Polar's portal does the managing (cancel, the card, invoices). This page
 * only opens it, so it writes nothing to Polar but the session itself
 * (INV-5).
 *
 * The portal's other door lives here too: the token Polar adds to the
 * welcome address after a payment, which the proxy drops (AC-26). Nothing it
 * needs reaches beyond `plan.ts`, which holds no SDK and no config, so the
 * proxy can import it without pulling either in.
 */

import "server-only";

import { statusOf } from "./plan";

/** The fields of Polar's customer session create this sends, in Polar's spelling. */
export interface PortalRequest {
  /** The session's user id, Polar's external customer id. */
  readonly external_customer_id: string;
  /** Polar's portal shows a way back here. */
  readonly return_url: string;
}

export interface PortalDeps {
  readonly createCustomerSession: (body: PortalRequest) => Promise<unknown>;
  /** Where the portal's back button goes: Account, on `config.siteUrl`. */
  readonly returnUrl: string;
}

export type PortalOutcome =
  /** No session: sign in first. */
  | { readonly kind: "sign-in" }
  /** Polar holds no customer for this user, so there is nothing to manage. */
  | { readonly kind: "no-customer" }
  /** Polar would not open the portal, or answered with something unreadable. */
  | { readonly kind: "portal-failed" }
  | { readonly kind: "portal"; readonly url: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Polar's portal address, which must be https, or `null`. */
function portalUrl(session: unknown): string | null {
  if (!isRecord(session) || typeof session.customer_portal_url !== "string") return null;
  try {
    return new URL(session.customer_portal_url).protocol === "https:"
      ? session.customer_portal_url
      : null;
  } catch {
    return null;
  }
}

export async function openPortal(
  userId: string | null,
  deps: PortalDeps,
): Promise<PortalOutcome> {
  if (userId === null) return { kind: "sign-in" };

  let session: unknown;
  try {
    session = await deps.createCustomerSession({
      external_customer_id: userId,
      return_url: deps.returnUrl,
    });
  } catch (error) {
    // A 404 or a 422 is Polar holding no such customer (AC-17): nothing to
    // manage yet, so Pricing is the useful place to land.
    const status = statusOf(error);
    return status === 404 || status === 422
      ? { kind: "no-customer" }
      : { kind: "portal-failed" };
  }

  const url = portalUrl(session);
  return url === null ? { kind: "portal-failed" } : { kind: "portal", url };
}

/**
 * The name Polar gives the portal token it adds to `success_url` after a
 * payment, as task 12's walk saw it. The token opens that customer's billing
 * portal, so it is a credential, not a parameter of ours. Spec 0012, AC-26.
 */
export const PORTAL_TOKEN_PARAM = "customer_session_token";

/**
 * `url` without Polar's portal token, or `null` when it carries none. Spec
 * 0012, AC-26.
 *
 * `searchParams` compares names once decoded, so an encoded spelling counts,
 * but exactly, so `Customer_Session_Token` is left alone. Every value goes,
 * an empty one included, and every other parameter keeps its place, as the
 * sign in pages' clean redirect keeps Clerk's. The origin and path are the
 * request's own, never `config.siteUrl`, so a preview or alias host is never
 * sent to production.
 */
export function withoutPortalToken(url: URL): URL | null {
  if (!url.searchParams.has(PORTAL_TOKEN_PARAM)) return null;
  const clean = new URL(url.href);
  clean.searchParams.delete(PORTAL_TOKEN_PARAM);
  return clean;
}
