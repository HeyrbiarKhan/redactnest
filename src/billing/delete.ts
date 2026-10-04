/**
 * Deleting the account of the person in front of it. Spec 0012, AC-11,
 * INV-3 and INV-5.
 *
 * The user id comes from the verified Clerk session, handed in by the server
 * action from `auth()`. Nothing the browser sends reaches here, so a request
 * can only ever delete its sender's own account, and with no session nothing
 * is called at all.
 *
 * The order matters. The customer state is read first, because Polar's delete
 * immediately cancels every active subscription the customer holds: it
 * refuses while Pro is set to renew (cancel in Manage billing first), and
 * while another EdiventStudio product's subscription is active, which AC-25's
 * tying can bring in and which a delete here would end too. Then Polar before
 * Clerk: if Polar fails, the sign in is still there to try again with, and if
 * Clerk fails after Polar, trying again finds no customer (a 404, counted as
 * done) and finishes.
 */

import "server-only";

import { type PlanDeps, readPlan, statusOf } from "./plan";

/** What Polar's customer delete by external id takes besides the id. */
export interface CustomerDeleteQuery {
  /** Polar also wipes the customer's personal details (GDPR erasure). */
  readonly anonymize: boolean;
}

export interface DeleteDeps extends PlanDeps {
  /** Polar's `customers.deleteExternal`. */
  readonly deleteCustomer: (
    externalId: string,
    query: CustomerDeleteQuery,
  ) => Promise<unknown>;
  /** Clerk's `users.deleteUser`. */
  readonly deleteUser: (userId: string) => Promise<unknown>;
}

export type DeleteOutcome =
  /** No session: sign in first. */
  | { readonly kind: "sign-in" }
  /** A subscription to Pro is set to renew: cancel it in Manage billing first. */
  | { readonly kind: "renewing" }
  /** Another EdiventStudio product's subscription, which the delete would end. */
  | { readonly kind: "other-product" }
  /** Polar could not say, or would not delete. Nothing was removed. */
  | { readonly kind: "billing-failed" }
  /** The billing details went and the sign in did not. Trying again finishes. */
  | { readonly kind: "sign-in-kept" }
  | { readonly kind: "deleted" };

/** Clerk's backend reports an HTTP failure as `status`, where Polar uses `statusCode`. */
const clerkStatusOf = (error: unknown): number | null =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  typeof error.status === "number"
    ? error.status
    : null;

export async function deleteAccount(
  userId: string | null,
  deps: DeleteDeps,
): Promise<DeleteOutcome> {
  if (userId === null) return { kind: "sign-in" };

  // A 404 is no customer yet, which nothing here refuses.
  const plan = await readPlan(userId, deps);
  if (plan === null) return { kind: "billing-failed" };
  if (plan.renewing) return { kind: "renewing" };
  if (plan.otherProduct) return { kind: "other-product" };

  // Asked even when the state found no customer: Subscribe in another tab may
  // have just made one, and a customer left holding this id would tie the
  // email to an account that no longer exists (AC-25's conflict line on the
  // next sign up).
  try {
    await deps.deleteCustomer(userId, { anonymize: true });
  } catch (error) {
    if (statusOf(error) !== 404) return { kind: "billing-failed" };
  }

  try {
    await deps.deleteUser(userId);
  } catch (error) {
    if (clerkStatusOf(error) !== 404) return { kind: "sign-in-kept" };
  }
  return { kind: "deleted" };
}
