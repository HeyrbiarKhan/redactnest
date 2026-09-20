/**
 * The tier and caps a job runs under, fetched once and frozen into the session.
 *
 * Spec 0002 closes a question spec 0001 left open: when does the tool route ask?
 * The answer is the same trigger that already warms the engine (pointer enter,
 * focus, drag over), so by the time a file has been chosen it has almost always
 * resolved and the common path pays nothing. If it has not, opening waits behind
 * the `checking-entitlement` phase, and that wait is bounded.
 *
 * Failing closed is the whole point. Every path out of here that is not a clean
 * answer from our own origin produces the free tier: a network error, a shape we
 * do not recognise, a tier we have never heard of, a fetch that takes too long.
 * Nothing about a slow or broken network may hand somebody the paid caps.
 */

import { config } from "@/config";
import type { EntitlementSnapshot } from "@/worker/protocol";

/** Same origin, and the only request the tool route makes (AC-3). */
const ENTITLEMENT_URL = "/api/entitlement";

/**
 * How long opening will wait for an entitlement that has not arrived.
 *
 * Long enough that a slow connection is not punished with the free cap, short
 * enough that nobody watches a spinner wondering if the page is broken. Not a
 * page or size cap, so it is not one of the values spec 0001 requires to come
 * from the config module; it is named here for the one place that uses it.
 */
const WAIT_BUDGET_MS = 4_000;

/**
 * What everybody gets until feature 10 can answer otherwise, and what every
 * failure falls back to.
 */
export const FREE_ENTITLEMENT: EntitlementSnapshot = Object.freeze({
  tier: "free",
  pageCap: config.freePageCap,
  maxFileBytes: config.maxFileBytes,
});

/**
 * Module level and deliberate: one answer per page, shared by every caller.
 *
 * Spec 0001 also asks for a refetch on window focus and before a job that would
 * exceed the free cap. Feature 10 adds that when there is a session that can
 * actually change; today there is nothing to refetch into.
 */
let inFlight: Promise<EntitlementSnapshot> | null = null;

/**
 * Start asking, and do not wait for the answer.
 *
 * Called on the engine warm trigger. Safe to call repeatedly: only the first
 * call makes a request, so hovering the drop area ten times still costs one.
 */
export function prefetchEntitlement(): void {
  void request();
}

/**
 * The snapshot to freeze into a job, waiting only as long as the budget allows.
 *
 * `onWaiting` fires only when there is a real wait, so the interface can report
 * the `checking-entitlement` phase without flashing it at everybody whose
 * prefetch already landed.
 */
export function getEntitlement(
  options: { onWaiting?: () => void } = {},
): Promise<EntitlementSnapshot> {
  const pending = request();
  let settled = false;
  void pending.then(() => {
    settled = true;
  });

  // A microtask, so a promise that is already resolved settles the flag before
  // we decide whether anybody is actually waiting.
  return Promise.resolve().then(() => {
    if (settled) return pending;

    options.onWaiting?.();

    return Promise.race([
      pending,
      new Promise<EntitlementSnapshot>((resolve) => {
        setTimeout(() => resolve(FREE_ENTITLEMENT), WAIT_BUDGET_MS);
      }),
    ]);
  });
}

function request(): Promise<EntitlementSnapshot> {
  inFlight ??= fetch(ENTITLEMENT_URL, {
    // Same origin only. The session cookie feature 10 will set has to travel,
    // and nothing here may ever be sent anywhere else.
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => readSnapshot(body))
    .catch(() => FREE_ENTITLEMENT);

  return inFlight;
}

/**
 * Narrow an unknown body into a snapshot, or fall back to free.
 *
 * Every boundary is narrowed from `unknown`, and this one is a boundary even
 * though it is our own endpoint: a deploy where the two sides disagree should
 * cap somebody, never uncap them.
 */
function readSnapshot(body: unknown): EntitlementSnapshot {
  if (typeof body !== "object" || body === null) return FREE_ENTITLEMENT;

  const { tier, pageCap, maxFileBytes } = body as Record<string, unknown>;

  if (tier !== "free" && tier !== "paid") return FREE_ENTITLEMENT;
  if (!isPositiveInteger(pageCap) || !isPositiveInteger(maxFileBytes)) {
    return FREE_ENTITLEMENT;
  }

  return Object.freeze({ tier, pageCap, maxFileBytes });
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Forget the cached answer.
 *
 * For tests, and for feature 10 when signing in or subscribing makes the current
 * answer wrong.
 */
export function forgetEntitlement(): void {
  inFlight = null;
}
