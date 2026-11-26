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
 *
 * The answer also carries the visitor's own email address, for the signed in
 * header (spec 0026, child 0001, AC-21). It sits beside the snapshot, never
 * inside it: the page reads the two apart (`readSnapshot` and
 * `readAccountEmail`), so the address never reaches a job or the worker.
 */

import "server-only";

import type { EntitlementSnapshot } from "@/worker/protocol";

import { type CustomerStateLookup, readPlan } from "./plan";
import {
  type CookieJar,
  readSession,
  type SessionDeps,
  type SessionVerdict,
} from "./session";

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

/**
 * What `/api/entitlement` answers: the plan, and the address the session token
 * names. `email` is the token's claim for a genuine token (accounts
 * `signed-in` and `unknown`), else `null` (AC-21).
 */
export type EntitlementAnswer = EntitlementSnapshot & {
  readonly email: string | null;
};

export interface EntitlementDeps {
  readonly caps: EntitlementCaps;
  /** `null` when billing is off on this build (rule 1). */
  readonly billing: BillingSeams | null;
}

function answer(
  caps: EntitlementCaps,
  tier: EntitlementSnapshot["tier"],
  account: EntitlementSnapshot["account"],
  email: string | null = null,
): EntitlementAnswer {
  return Object.freeze({
    tier,
    pageCap: tier === "paid" ? caps.maxPages : caps.freePageCap,
    maxFileBytes: caps.maxFileBytes,
    account,
    email,
  });
}

/** AC-2, rules 1 to 7, in order. */
export async function resolveEntitlement(
  cookie: CookieJar,
  deps: EntitlementDeps,
): Promise<EntitlementAnswer> {
  const { caps, billing } = deps;

  // Rule 1: billing off on this build.
  if (billing === null) return answer(caps, "free", "none");

  // Kept outside the `try`, so a check that fails after the token was proven
  // genuine still names its address, as AC-21 has it for `unknown`.
  let session: SessionVerdict | null = null;
  try {
    // Rules 2 to 5: the sign in, read locally.
    session = await readSession(cookie, billing);
    if (session.kind !== "user") return answer(caps, "free", session.kind);

    // Rules 6 and 7: Polar, for the user the token names.
    const plan = await readPlan(session.userId, billing);
    if (plan === null) return answer(caps, "free", "unknown", session.email);
    return answer(caps, plan.pro ? "paid" : "free", "signed-in", session.email);
  } catch {
    // Neither step throws by design. If one ever does, the check failed,
    // and the visitor hears that rather than a silent free answer (INV-2).
    return answer(
      caps,
      "free",
      "unknown",
      session?.kind === "user" ? session.email : null,
    );
  }
}
