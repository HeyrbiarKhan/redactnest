/**
 * The tool's one question, which plan applies. Spec 0012, AC-1 and AC-2,
 * INV-2, INV-4 and INV-6.
 *
 * The whole decision table, in the spec's order, pure over a clock and one
 * seam (Polar's customer state), so every branch is unit tested with fakes.
 * Only rule 6 makes an outbound call, and only for a user a genuine token
 * names. Every answer that is not Pro says why (`account`), and only a
 * confirmed sign in may be paid (INV-2). Never throws: every failure is a
 * free answer with its reason.
 */

import "server-only";

import type { EntitlementSnapshot } from "@/worker/protocol";

import { type CustomerStateLookup, readPlan } from "./plan";
import { type CookieJar, readSession, type SessionDeps } from "./session";

export interface EntitlementCaps {
  readonly freePageCap: number;
  readonly maxPages: number;
  readonly maxFileBytes: number;
}

/** What the decision needs when billing is on. */
export interface BillingSeams extends SessionDeps {
  readonly proBenefitId: string;
  readonly proProductId: string;
  /** Polar's customer state, already bound to `OUTBOUND_TIMEOUT_MS`. */
  readonly getStateExternal: CustomerStateLookup;
}

export interface EntitlementDeps {
  readonly caps: EntitlementCaps;
  /** `null` when billing is off on this build (rule 1). */
  readonly billing: BillingSeams | null;
}

function answer(
  caps: EntitlementCaps,
  tier: EntitlementSnapshot["tier"],
  account: EntitlementSnapshot["account"],
): EntitlementSnapshot {
  return Object.freeze({
    tier,
    pageCap: tier === "paid" ? caps.maxPages : caps.freePageCap,
    maxFileBytes: caps.maxFileBytes,
    account,
  });
}

/** AC-2, rules 1 to 7, in order. */
export async function resolveEntitlement(
  cookie: CookieJar,
  deps: EntitlementDeps,
): Promise<EntitlementSnapshot> {
  const { caps, billing } = deps;

  // Rule 1: billing off on this build.
  if (billing === null) return answer(caps, "free", "none");

  try {
    // Rules 2 to 5: the sign in, read locally.
    const session = await readSession(cookie, billing);
    if (session.kind !== "user") return answer(caps, "free", session.kind);

    // Rules 6 and 7: Polar, for the user the token names.
    const plan = await readPlan(session.userId, billing);
    if (plan === null) return answer(caps, "free", "unknown");
    return answer(caps, plan.pro ? "paid" : "free", "signed-in");
  } catch {
    // Neither step throws by design. If one ever does, the check failed,
    // and the visitor hears that rather than a silent free answer (INV-2).
    return answer(caps, "free", "unknown");
  }
}
