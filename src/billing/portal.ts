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
