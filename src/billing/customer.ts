/**
 * The Polar customer a checkout is bound to, found, tied or created before any
 * money moves. Spec 0012, AC-25 and INV-3.
 *
 * The plan check finds Pro by external id (the Clerk user id), so a payment
 * must land on the customer that carries it. The first sandbox walk showed it
 * need not: Polar put an order on an older customer with the same email and
 * dropped the checkout's external id, and the buyer stayed on the free plan.
 * So Subscribe settles the customer first, here, and binds the checkout to it
 * by `customer_id`, which nothing in Polar's form can move.
 *
 * Everything comes from the verified session: the user id from `auth()`, and
 * the email only when Clerk reports it verified. Clerk's emailed code is the
 * proof the person owns that email, the same proof Polar's own portal asks
 * for, so tying an untied customer by it hands nobody a record they could not
 * already open. A customer tied to another id is never changed, and Polar
 * never lets an external id change once set.
 *
 * Tying happens only here, called only by Subscribe: never on the plan check,
 * `/tool`, Account or Welcome. From the email search it reads only each
 * match's `id`, `email`, `external_id` and `deleted_at` (claim C13).
 */

import "server-only";

import { type CustomerStateLookup, statusOf } from "./plan";

export interface LinkDeps {
  /** Step 1: the customer state by external id. */
  readonly getStateExternal: CustomerStateLookup;
  /** Step 3: `customers.list({ email })`, with the email already lowercased. */
  readonly findCustomersByEmail: (email: string) => Promise<unknown>;
  /** `customers.update(id, { external_id })`, which Polar allows once. */
  readonly setExternalId: (customerId: string, externalId: string) => Promise<unknown>;
  /** `customers.create({ email, external_id })`. */
  readonly createCustomer: (body: {
    readonly email: string;
    readonly external_id: string;
  }) => Promise<unknown>;
}

export type LinkOutcome =
  /** The account's customer, carrying its external id, and its state. */
  | { readonly kind: "linked"; readonly customerId: string; readonly state: unknown }
  /** The email belongs to a customer tied to another id, or to several. */
  | { readonly kind: "conflict" }
  /** Clerk has no verified primary email for this user. */
  | { readonly kind: "no-email" }
  /** Polar could not say who the customer is: no checkout, AC-14's plan line. */
  | { readonly kind: "lookup-failed" }
  /** Polar refused or failed a write: no checkout, AC-14's checkout line. */
  | { readonly kind: "write-failed" };

/** The four fields read from each match of the email search (claim C13). */
interface Match {
  readonly id: string;
  readonly email: string;
  readonly externalId: string | null;
  readonly deleted: boolean;
}

/**
 * The state of a customer created a moment ago. It holds no subscription and
 * no benefit, because nothing has been bought, so reading it back from Polar
 * would be a call that can only say this.
 */
const NEW_CUSTOMER_STATE = Object.freeze({
  granted_benefits: Object.freeze([]),
  active_subscriptions: Object.freeze([]),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

type StateRead =
  | { readonly kind: "found"; readonly customerId: string; readonly state: unknown }
  | { readonly kind: "missing" }
  | { readonly kind: "failed" };

/** Step 1, read as `readPlan` reads it: a 404 is "no customer", not a failure. */
async function readState(userId: string, deps: LinkDeps): Promise<StateRead> {
  let state: unknown;
  try {
    state = await deps.getStateExternal(userId);
  } catch (error) {
    return statusOf(error) === 404 ? { kind: "missing" } : { kind: "failed" };
  }
  if (!isRecord(state) || typeof state.id !== "string") return { kind: "failed" };
  return { kind: "found", customerId: state.id, state };
}

/** A state read after tying, where a missing customer is as bad as a failure. */
async function linkedState(userId: string, deps: LinkDeps): Promise<LinkOutcome> {
  const read = await readState(userId, deps);
  return read.kind === "found" ? { ...read, kind: "linked" } : { kind: "lookup-failed" };
}

/** The email search's matches, or `null` when its answer cannot be read. */
function readMatches(list: unknown): Match[] | null {
  if (!isRecord(list) || !Array.isArray(list.items)) return null;
  const matches: Match[] = [];
  for (const item of list.items) {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.email !== "string")
      return null;
    const { external_id: externalId, deleted_at: deletedAt } = item;
    if (externalId !== undefined && externalId !== null && typeof externalId !== "string")
      return null;
    if (deletedAt !== undefined && deletedAt !== null && typeof deletedAt !== "string")
      return null;
    matches.push({
      id: item.id,
      email: item.email,
      // An empty id is no id: Polar would still let it be set (AC-25, untied).
      externalId: externalId || null,
      deleted: typeof deletedAt === "string",
    });
  }
  return matches;
}

/**
 * AC-25. Never throws: every failure is an outcome, so Subscribe can say
 * which line applies and start no checkout.
 */
export async function linkCustomer(
  userId: string,
  getVerifiedEmail: () => Promise<string | null>,
  deps: LinkDeps,
): Promise<LinkOutcome> {
  // Step 1: already tied, which is every Subscribe after the first.
  const first = await readState(userId, deps);
  if (first.kind === "found") return { ...first, kind: "linked" };
  if (first.kind === "failed") return { kind: "lookup-failed" };

  // Step 2: the email Clerk has verified, and no other.
  let verified: string | null;
  try {
    verified = await getVerifiedEmail();
  } catch {
    verified = null;
  }
  if (verified === null || verified.trim() === "") return { kind: "no-email" };
  const email = verified.trim().toLowerCase();

  // Step 3, at most twice: a create that meets a race lists once more.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let list: unknown;
    try {
      list = await deps.findCustomersByEmail(email);
    } catch {
      return { kind: "lookup-failed" };
    }
    const matches = readMatches(list);
    if (matches === null) return { kind: "lookup-failed" };

    // Polar keeps one customer per email, but a soft deleted one may still be
    // listed, and the filter's own handling of case is not ours to trust.
    const live = matches.filter(
      (match) => !match.deleted && match.email.toLowerCase() === email,
    );

    if (live.length > 1) return { kind: "conflict" };

    if (live.length === 1) {
      const [match] = live;
      // A race with step 1: another tab tied it to this same account.
      if (match.externalId === userId) return linkedState(userId, deps);
      if (match.externalId !== null) return { kind: "conflict" };
      try {
        await deps.setExternalId(match.id, userId);
      } catch {
        return { kind: "write-failed" };
      }
      // Read again: the customer may already hold Pro, or a payment still
      // settling, and Subscribe must see that before it starts a checkout.
      return linkedState(userId, deps);
    }

    let created: unknown;
    try {
      created = await deps.createCustomer({ email, external_id: userId });
    } catch (error) {
      // Another tab won the race, or Polar matched an email the list missed.
      if (statusOf(error) === 422) continue;
      return { kind: "write-failed" };
    }
    if (!isRecord(created) || typeof created.id !== "string")
      return { kind: "write-failed" };
    return { kind: "linked", customerId: created.id, state: NEW_CUSTOMER_STATE };
  }

  return { kind: "write-failed" };
}
