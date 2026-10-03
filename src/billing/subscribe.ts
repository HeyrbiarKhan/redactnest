/**
 * What Subscribe does for the person in front of it. Spec 0012, AC-14 and
 * INV-3.
 *
 * The identity Polar receives comes from the verified Clerk session only:
 * the external customer id is the session's user id and the email is that
 * user's primary address, both handed in by the page from `auth()` and
 * `currentUser()`. Nothing the browser sends (no query, no body, no header)
 * reaches here, so nobody can start a checkout that grants Pro to someone
 * else's account. With no session, Polar is never called.
 *
 * The order matters: a failed plan check starts no checkout, because a Pro
 * customer sent through a second checkout would be charged twice.
 */

import "server-only";

import { type CustomerStateLookup, readPlan } from "./plan";

/** The fields of Polar's checkout create this sends, in Polar's own spelling. */
export interface CheckoutRequest {
  readonly products: readonly string[];
  readonly external_customer_id: string;
  readonly customer_email?: string;
  readonly success_url: string;
  readonly return_url: string;
}

export interface SubscribeDeps {
  readonly getStateExternal: CustomerStateLookup;
  readonly createCheckout: (body: CheckoutRequest) => Promise<unknown>;
  /** The session user's primary email, asked of Clerk only once it is needed. */
  readonly getEmail: () => Promise<string | null>;
  readonly proBenefitId: string;
  readonly proProductId: string;
  /** Where Polar sends the buyer after paying, and back from checkout. */
  readonly successUrl: string;
  readonly returnUrl: string;
}

export type SubscribeOutcome =
  /** No session: sign in, then come back here. */
  | { readonly kind: "sign-in" }
  /** Already holds Pro: the account page says so. */
  | { readonly kind: "already-pro" }
  /** Paid, and Polar has not granted the benefit yet: the welcome page waits. */
  | { readonly kind: "settling" }
  /** The plan could not be checked, so no checkout was started. */
  | { readonly kind: "plan-unknown" }
  /** Polar would not start a checkout. */
  | { readonly kind: "checkout-failed" }
  | { readonly kind: "checkout"; readonly url: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Polar's checkout address, which must be https, or `null`. */
function checkoutUrl(checkout: unknown): string | null {
  if (!isRecord(checkout) || typeof checkout.url !== "string") return null;
  try {
    return new URL(checkout.url).protocol === "https:" ? checkout.url : null;
  } catch {
    return null;
  }
}

export async function subscribe(
  userId: string | null,
  deps: SubscribeDeps,
): Promise<SubscribeOutcome> {
  if (userId === null) return { kind: "sign-in" };

  const plan = await readPlan(userId, deps);
  if (plan === null) return { kind: "plan-unknown" };
  if (plan.pro) return { kind: "already-pro" };
  // An active subscription to the Pro product without the benefit is a
  // payment Polar has taken and not yet acted on.
  if (plan.renewal !== null) return { kind: "settling" };

  let email: string | null;
  try {
    email = await deps.getEmail();
  } catch {
    email = null;
  }

  let checkout: unknown;
  try {
    checkout = await deps.createCheckout({
      products: [deps.proProductId],
      external_customer_id: userId,
      ...(email === null ? {} : { customer_email: email }),
      success_url: deps.successUrl,
      return_url: deps.returnUrl,
    });
  } catch {
    return { kind: "checkout-failed" };
  }

  const url = checkoutUrl(checkout);
  return url === null ? { kind: "checkout-failed" } : { kind: "checkout", url };
}
