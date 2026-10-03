/**
 * Whether a user holds Pro, asked of Polar live. Spec 0012, AC-2 rules 6 and
 * 7, INV-5 and INV-6.
 *
 * Polar is the only source of Pro: no store, no webhook, no copy to drift
 * (INV-5). Pro means holding the RedactNest Pro benefit, never "any active
 * subscription", because the Polar organisation will sell other products
 * (INV-6). The only thing sent is the Clerk user id, as Polar's external
 * customer id, and the only things read back are the benefit list, the
 * product of each active subscription, and the dates of the one to Pro
 * (claim C13 in the privacy policy).
 *
 * Polar's answer is narrowed from `unknown`, as every boundary is: a shape we
 * cannot read means we cannot say, which is `null` here and the free limit,
 * said out loud, at the route (INV-2).
 */

import "server-only";

/** One call to Polar's customer state, by external id. The one seam. */
export type CustomerStateLookup = (externalId: string) => Promise<unknown>;

export interface PlanDeps {
  readonly getStateExternal: CustomerStateLookup;
  readonly proBenefitId: string;
  readonly proProductId: string;
}

/** The subscription to the Pro product, as the account page shows it. */
export interface Renewal {
  /** `current_period_end`, as Polar wrote it. */
  readonly endsAt: string;
  /** False once it is set to end (`cancel_at_period_end`). */
  readonly renews: boolean;
}

export interface Plan {
  /** Holds the RedactNest Pro benefit (INV-6). */
  readonly pro: boolean;
  /** A Polar customer exists for this user, so Manage billing can open. */
  readonly hasCustomer: boolean;
  /** The subscription to the Pro product, if the customer state lists one. */
  readonly renewal: Renewal | null;
  /**
   * An active subscription to another EdiventStudio product. Subscribe can
   * tie a customer who already bought one (AC-25), and the organisation
   * allows one subscription per customer across its products (AC-14).
   */
  readonly otherProduct: boolean;
}

/** The part of `PlanDeps` that reading a customer state needs. */
export type PlanIds = Pick<PlanDeps, "proBenefitId" | "proProductId">;

const NO_CUSTOMER: Plan = Object.freeze({
  pro: false,
  hasCustomer: false,
  renewal: null,
  otherProduct: false,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Polar's SDK reports an HTTP failure with its status; a fake may do the same. */
export const statusOf = (error: unknown): number | null =>
  isRecord(error) && typeof error.statusCode === "number" ? error.statusCode : null;

/**
 * A customer state already in hand, narrowed to what this product reads, or
 * `null` when any part of that is not the shape Polar documents. Subscribe
 * reads the state `linkCustomer` returns through this, so it makes no second
 * lookup (spec 0012, slice 1b).
 */
export function planFromState(state: unknown, deps: PlanIds): Plan | null {
  if (!isRecord(state)) return null;
  const grants = state.granted_benefits;
  const subscriptions = state.active_subscriptions;
  if (!Array.isArray(grants) || !Array.isArray(subscriptions)) return null;

  const benefitIds: string[] = [];
  for (const grant of grants) {
    if (!isRecord(grant) || typeof grant.benefit_id !== "string") return null;
    benefitIds.push(grant.benefit_id);
  }

  let renewal: Renewal | null = null;
  let otherProduct = false;
  for (const subscription of subscriptions) {
    if (!isRecord(subscription) || typeof subscription.product_id !== "string")
      return null;
    if (subscription.product_id !== deps.proProductId) {
      otherProduct = true;
      continue;
    }
    if (renewal !== null) continue;
    const { current_period_end: endsAt, cancel_at_period_end: cancels } = subscription;
    if (typeof endsAt !== "string" || typeof cancels !== "boolean") return null;
    renewal = Object.freeze({ endsAt, renews: !cancels });
  }

  return Object.freeze({
    pro: benefitIds.includes(deps.proBenefitId),
    hasCustomer: true,
    renewal,
    otherProduct,
  });
}

/**
 * AC-2 rules 6 and 7. A plan, or `null` when Polar could not say: any status
 * but a 404 (no customer yet, which is a plain free answer), a thrown error,
 * a timeout, or an answer this cannot read. Never throws.
 */
export async function readPlan(userId: string, deps: PlanDeps): Promise<Plan | null> {
  let state: unknown;
  try {
    state = await deps.getStateExternal(userId);
  } catch (error) {
    return statusOf(error) === 404 ? NO_CUSTOMER : null;
  }
  return planFromState(state, deps);
}
