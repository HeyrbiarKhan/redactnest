/**
 * Which plan applies on this page, asked of our own server and kept as the
 * page's answer. Spec 0012, AC-3 and AC-4, on spec 0002's frozen snapshot.
 *
 * The page asks once as it loads, so the plan line can say what applies before
 * anyone chooses a file. It asks again when the tab comes back and the answer
 * is not Pro (an upgrade made in another tab shows here, and a paying visitor
 * is never polled), at an open when the answer is more than 5 minutes old (a
 * cancel or a lapse shows within one open), and whenever a button asks fresh.
 * One ask at a time: a trigger during one joins it.
 *
 * Every ask has the 4 s budget. Past it the page's answer becomes free with
 * `unknown`, and an answer that lands later still replaces the page's answer,
 * so the helper and the plan line catch up. It never reaches a job's
 * snapshot, which froze at open (spec 0002, INV-5).
 *
 * Failing closed is the whole point. Every path out of here that is not a clean
 * answer from our own origin is the free tier, said out loud as `unknown`
 * (INV-2). One exception, and it is bounded: a Pro answer confirmed on this
 * page in the last 30 minutes survives a failed refresh for age, so a Polar
 * blip at an open does not cap someone confirmed Pro minutes ago.
 */

import { config } from "@/config";
import { ENTITLEMENT_ACCOUNTS, type EntitlementSnapshot } from "@/worker/protocol";

/** Same origin, and the only request the tool route makes (spec 0002, AC-3). */
const ENTITLEMENT_URL = "/api/entitlement";

/**
 * How long anything waits for an ask to land.
 *
 * Long enough that a slow connection is not punished with the free cap, short
 * enough that nobody watches a spinner wondering if the page is broken. Not a
 * page or size cap, so it is not one of the values spec 0001 requires to come
 * from the config module; it is named here for the one place that uses it.
 */
const WAIT_BUDGET_MS = 4_000;

/**
 * How old the page's answer may be before an open asks again, so a cancel or a
 * lapse shows within one open after Polar revokes the benefit. A rule about
 * freshness, not a cap on the visitor (spec 0012, *Value sourcing*).
 */
const REFRESH_AFTER_MS = 300_000;

/**
 * How long a confirmed Pro answer survives a failed refresh for age. Bounded,
 * and only for that refresh, so a failure never becomes Pro for anyone not
 * confirmed Pro on this page (spec 0012, AC-4).
 */
const KEEP_PAID_MS = 1_800_000;

/**
 * What every failure on this side falls back to: a request that fails, an
 * answer we cannot read, or one that comes too late. Always `unknown`, never
 * `none`, so the page says the plan could not be checked rather than quietly
 * treating a paying visitor as anonymous (spec 0012, AC-3, INV-2).
 */
export const FREE_ENTITLEMENT: EntitlementSnapshot = Object.freeze({
  tier: "free",
  pageCap: config.freePageCap,
  maxFileBytes: config.maxFileBytes,
  account: "unknown",
});

/**
 * Why an ask was made. Only `age` may keep a recent Pro answer: the tab coming
 * back never asks a Pro page, and a button that asks fresh wants the truth.
 */
type AskReason = "load" | "visible" | "age" | "fresh";

interface Ask {
  readonly reason: AskReason;
  /** The page's answer once this ask lands or its budget runs out, whichever comes first. */
  readonly settled: Promise<EntitlementSnapshot>;
  readonly hasSettled: () => boolean;
}

/*
 * Module level and deliberate: one answer per page, shared by every caller and
 * every subscriber. Every way into `/tool` is a document load (spec 0003,
 * INV-10), so each visit starts with none.
 */
let answer: EntitlementSnapshot | null = null;
/** When the page's answer was last set, for the age rule. */
let answeredAt = 0;
/** When the page last heard Pro from the server, for the keep rule. */
let paidAt = Number.NEGATIVE_INFINITY;
/** The one ask out, from its request until that request settles, past the budget included. */
let inFlight: Ask | null = null;
const listeners = new Set<() => void>();

/**
 * The page's answer, for the drop zone's helper and the plan line, or `null`
 * until the first ask lands or runs out of budget ("Checking your plan").
 */
export function readEntitlement(): EntitlementSnapshot | null {
  return answer;
}

/** For `useSyncExternalStore`: told whenever the page's answer changes. */
export function subscribeEntitlement(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * AC-4: ask once as the page loads. Safe to call again: a second call joins
 * the ask already out, and one made after the answer does nothing.
 */
export function askAtLoad(): void {
  if (answer === null && inFlight === null) startAsk("load");
}

/**
 * AC-4: the tab is visible again. Asks unless the page already holds Pro, so
 * an upgrade in another tab reaches this one without polling anybody.
 */
export function askWhenVisible(): void {
  if (answer?.tier === "paid") return;
  if (inFlight === null) startAsk("visible");
}

/**
 * AC-5's Try again: ask fresh now, or join the ask already out. Settles with
 * the page's answer, so the plan line knows when its button has done its work.
 */
export function askAgain(): Promise<EntitlementSnapshot> {
  return getEntitlement({ fresh: true });
}

/**
 * The snapshot to freeze into a job at an open, waiting only within the ask's
 * budget. Asks again when the page's answer is more than 5 minutes old, and
 * always when `fresh` (AC-6's "Check my plan and open it again"). An ask
 * already out is joined either way, so a file chosen just after the tab came
 * back opens under the answer that return asked for.
 *
 * `onWaiting` fires only when there is a real wait, so the interface can report
 * the `checking-entitlement` phase without flashing it at everybody whose
 * answer is already in.
 */
export function getEntitlement(
  options: { onWaiting?: () => void; fresh?: boolean } = {},
): Promise<EntitlementSnapshot> {
  const ask =
    inFlight ??
    (options.fresh === true ? startAsk("fresh") : isStale() ? startAsk("age") : null);
  if (ask === null) return Promise.resolve(answer ?? FREE_ENTITLEMENT);

  // A microtask, so an ask that settles at once is seen to have settled before
  // we decide whether anybody is actually waiting.
  return Promise.resolve().then(() => {
    // Its budget has run out while its request is still out, or it landed: the
    // page's answer already says what applies.
    if (ask.hasSettled()) return answer ?? FREE_ENTITLEMENT;
    options.onWaiting?.();
    return ask.settled;
  });
}

function isStale(): boolean {
  return answer === null || Date.now() - answeredAt > REFRESH_AFTER_MS;
}

/**
 * Send the one request and race it against the budget. The request is never
 * cut off at the budget: whatever it brings later still becomes the page's
 * answer, and the ask stays out until then, so the triggers that come in the
 * meantime join it rather than stacking requests behind a slow server.
 */
function startAsk(reason: AskReason): Ask {
  let settledYet = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const budget = new Promise<EntitlementSnapshot>((resolve) => {
    timer = setTimeout(() => {
      take(FREE_ENTITLEMENT, reason);
      settledYet = true;
      resolve(answer ?? FREE_ENTITLEMENT);
    }, WAIT_BUDGET_MS);
  });

  const landed = request().then((next) => {
    clearTimeout(timer);
    if (inFlight === ask) inFlight = null;
    take(next, reason);
    settledYet = true;
    return answer ?? FREE_ENTITLEMENT;
  });

  const ask: Ask = Object.freeze({
    reason,
    settled: Promise.race([landed, budget]),
    hasSettled: () => settledYet,
  });
  inFlight = ask;
  return ask;
}

/**
 * Make an ask's outcome the page's answer, by AC-4's rules. Subscribers hear
 * of it only when something they show could change.
 */
function take(next: EntitlementSnapshot, reason: AskReason): void {
  const now = Date.now();
  const keepsPaid =
    reason === "age" &&
    next.account === "unknown" &&
    answer?.tier === "paid" &&
    now - paidAt <= KEEP_PAID_MS;
  // Kept, not confirmed: the time stays, so the next open asks again, and
  // the 30 minutes still run from the last Pro the server actually said.
  if (keepsPaid) return;

  answeredAt = now;
  if (next.tier === "paid") paidAt = now;
  if (answer !== null && sameAnswer(answer, next)) return;
  answer = next;
  for (const listener of listeners) listener();
}

function sameAnswer(a: EntitlementSnapshot, b: EntitlementSnapshot): boolean {
  return (
    a.tier === b.tier &&
    a.pageCap === b.pageCap &&
    a.maxFileBytes === b.maxFileBytes &&
    a.account === b.account
  );
}

/** The request itself. Never rejects: every failure is `FREE_ENTITLEMENT`. */
function request(): Promise<EntitlementSnapshot> {
  return fetch(ENTITLEMENT_URL, {
    // Same origin only. Clerk's sign in cookie has to travel, and nothing here
    // may ever be sent anywhere else.
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => readSnapshot(body))
    .catch(() => FREE_ENTITLEMENT);
}

/**
 * Narrow an unknown body into a snapshot, or fall back to free.
 *
 * Every boundary is narrowed from `unknown`, and this one is a boundary even
 * though it is our own endpoint: a deploy where the two sides disagree should
 * cap somebody, never uncap them.
 */
export function readSnapshot(body: unknown): EntitlementSnapshot {
  if (typeof body !== "object" || body === null) return FREE_ENTITLEMENT;

  const { tier, pageCap, maxFileBytes, account } = body as Record<string, unknown>;

  if (tier !== "free" && tier !== "paid") return FREE_ENTITLEMENT;
  if (!isPositiveInteger(pageCap) || !isPositiveInteger(maxFileBytes)) {
    return FREE_ENTITLEMENT;
  }
  // Spec 0012, AC-3: an account outside the closed set, or a tier and account
  // that disagree (paid with anything but a confirmed sign in), is a deploy
  // where the two sides drifted, and it caps rather than uncaps.
  const known = ENTITLEMENT_ACCOUNTS.find((kind) => kind === account);
  if (known === undefined) return FREE_ENTITLEMENT;
  if (tier === "paid" && known !== "signed-in") return FREE_ENTITLEMENT;

  return Object.freeze({ tier, pageCap, maxFileBytes, account: known });
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
