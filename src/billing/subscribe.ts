/**
 * What Subscribe does for the person in front of it. Spec 0012, AC-14, AC-25
 * and INV-3.
 *
 * The identity Polar receives comes from the verified Clerk session only:
 * the external customer id is the session's user id and the email is that
 * user's verified primary address, both handed in by the page from `auth()`
 * and `currentUser()`. Nothing the browser sends (no query, no body, no
 * header) reaches here, so nobody can start a checkout that grants Pro to
 * someone else's account. With no session, Polar is never called.
 *
 * The order matters. The customer is tied to the account first (AC-25), so
 * the payment lands where the plan check looks. Then its state decides: a
 * failed check starts no checkout, because a Pro customer sent through a
 * second checkout would be charged twice, and that includes a customer who
 * paid before tying existed and holds Pro the moment it is tied.
 */

import "server-only";

import { type LinkDeps, linkCustomer } from "./customer";
import { planFromState } from "./plan";

/** The fields of Polar's checkout create this sends, in Polar's own spelling. */
export interface CheckoutRequest {
  readonly products: readonly string[];
  /**
   * The customer `linkCustomer` settled, which already carries the account's
   * external id and email. No `external_customer_id` and no `customer_email`:
   * Polar matched by email over them, which is the fault this binding fixes.
   */
  readonly customer_id: string;
  readonly success_url: string;
  readonly return_url: string;
}

export interface SubscribeDeps extends LinkDeps {
  readonly createCheckout: (body: CheckoutRequest) => Promise<unknown>;
  /**
   * The session user's primary email when Clerk reports it verified, else
   * `null`. Asked of Clerk only once it is needed (AC-25 step 2).
   */
  readonly getVerifiedEmail: () => Promise<string | null>;
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
  /** The email belongs to a Polar customer tied to another account (AC-25). */
  | { readonly kind: "customer-conflict" }
  /** The customer subscribes to another EdiventStudio product (AC-14). */
  | { readonly kind: "other-product" }
  /** Polar would not start a checkout, or would not tie or create the customer. */
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

  const link = await linkCustomer(userId, deps.getVerifiedEmail, deps);
  switch (link.kind) {
    case "lookup-failed":
      return { kind: "plan-unknown" };
    case "conflict":
      return { kind: "customer-conflict" };
    case "no-email":
    case "write-failed":
      return { kind: "checkout-failed" };
    case "linked":
      break;
  }

  const plan = planFromState(link.state, deps);
  if (plan === null) return { kind: "plan-unknown" };
  if (plan.pro) return { kind: "already-pro" };
  // An active subscription to the Pro product without the benefit is a
  // payment Polar has taken and not yet acted on.
  if (plan.renewal !== null) return { kind: "settling" };
  // The organisation allows one subscription per customer across all its
  // products, so this checkout could only fail.
  if (plan.otherProduct) return { kind: "other-product" };

  let checkout: unknown;
  try {
    checkout = await deps.createCheckout({
      products: [deps.proProductId],
      customer_id: link.customerId,
      success_url: deps.successUrl,
      return_url: deps.returnUrl,
    });
  } catch {
    return { kind: "checkout-failed" };
  }

  const url = checkoutUrl(checkout);
  return url === null ? { kind: "checkout-failed" } : { kind: "checkout", url };
}
