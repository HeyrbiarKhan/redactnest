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
 *
 * The same store tells the header who is signed in (spec 0026, child 0001,
 * AC-19 and AC-20): `browserSignedIn` reads Clerk's sign in time cookie to
 * decide whether a page asks at all, and `readIdentity` says whether the
 * answer confirmed a sign in, with the address the session token names. The
 * address is kept beside the snapshot, never in it, so it never reaches a
 * job or the worker (AC-21).
 */

import { config } from "@/config";
import { accountEmail } from "@/lib/account-email";
import { ENTITLEMENT_PATH } from "@/lib/routes";
import { ENTITLEMENT_ACCOUNTS, type EntitlementSnapshot } from "@/worker/protocol";

/** Same origin, and the only request the tool route makes (spec 0002, AC-3). */
const ENTITLEMENT_URL = ENTITLEMENT_PATH;

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
 * Who the page's answer says is signed in, for the header (spec 0026, child
 * 0001, AC-20). `pending` until an ask settles; `confirmed` only when our own
 * server answered `signed-in`, or `unknown` for a genuine token whose plan
 * check failed; `unconfirmed` for every other outcome, the store's own
 * fallback included, which says `unknown` too but came from no server. The
 * header shows the avatar only for `confirmed`, so it never says signed in on
 * an answer it could not confirm.
 */
export interface AccountIdentity {
  readonly state: "pending" | "confirmed" | "unconfirmed";
  /** The session token's address, only ever with `confirmed`. */
  readonly email: string | null;
}

const PENDING: AccountIdentity = Object.freeze({ state: "pending", email: null });
const UNCONFIRMED: AccountIdentity = Object.freeze({ state: "unconfirmed", email: null });

/** What an ask brought back: the snapshot, and who it confirms. */
interface Landing {
  readonly snapshot: EntitlementSnapshot;
  readonly identity: AccountIdentity;
}

/** Every failure on this side: the free fallback, confirming nobody. */
const FALLBACK: Landing = Object.freeze({
  snapshot: FREE_ENTITLEMENT,
  identity: UNCONFIRMED,
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
/** Who the page's answer confirms, for the header; kept with `answer`. */
let identity: AccountIdentity = PENDING;
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

/**
 * Who is signed in, by the page's answer (spec 0026, child 0001, AC-20), for
 * the header's account slot. The same object until it changes, so it can be a
 * `useSyncExternalStore` snapshot; `subscribeEntitlement` tells of a change.
 */
export function readIdentity(): AccountIdentity {
  return identity;
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
      take(FALLBACK, reason);
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
function take(next: Landing, reason: AskReason): void {
  const now = Date.now();
  const keepsPaid =
    reason === "age" &&
    next.snapshot.account === "unknown" &&
    answer?.tier === "paid" &&
    now - paidAt <= KEEP_PAID_MS;
  // Kept, not confirmed: the time stays, so the next open asks again, and
  // the 30 minutes still run from the last Pro the server actually said. The
  // kept answer keeps its address too (spec 0026, child 0001, AC-20).
  if (keepsPaid) return;

  answeredAt = now;
  if (next.snapshot.tier === "paid") paidAt = now;
  if (answer !== null && sameAnswer({ snapshot: answer, identity }, next)) return;
  answer = next.snapshot;
  identity = next.identity;
  for (const listener of listeners) listener();
}

/**
 * Whether anything a subscriber shows could differ. Who is confirmed and
 * their address count too, so a changed address, or the fallback replacing a
 * server's `unknown`, reaches the header (spec 0026, child 0001, AC-20).
 */
function sameAnswer(a: Landing, b: Landing): boolean {
  return (
    a.snapshot.tier === b.snapshot.tier &&
    a.snapshot.pageCap === b.snapshot.pageCap &&
    a.snapshot.maxFileBytes === b.snapshot.maxFileBytes &&
    a.snapshot.account === b.snapshot.account &&
    a.identity.state === b.identity.state &&
    a.identity.email === b.identity.email
  );
}

/** The request itself. Never rejects: every failure is `FALLBACK`. */
function request(): Promise<Landing> {
  return fetch(ENTITLEMENT_URL, {
    // Same origin only. Clerk's sign in cookie has to travel, and nothing here
    // may ever be sent anywhere else.
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => readLanding(body))
    .catch(() => FALLBACK);
}

/**
 * One body read twice, apart: the snapshot a job may freeze, and who it
 * confirms. Only an answer our server really sent can confirm anybody, so a
 * body `readSnapshot` could not read (it hands back `FREE_ENTITLEMENT`
 * itself) confirms nobody, though it says `unknown` too (AC-20).
 */
function readLanding(body: unknown): Landing {
  const snapshot = readSnapshot(body);
  const confirmed =
    snapshot !== FREE_ENTITLEMENT &&
    (snapshot.account === "signed-in" || snapshot.account === "unknown");
  if (!confirmed) return Object.freeze({ snapshot, identity: UNCONFIRMED });
  return Object.freeze({
    snapshot,
    identity: Object.freeze({ state: "confirmed", email: readAccountEmail(body) }),
  });
}

/**
 * The visitor's own address from the answer's `email`, narrowed as the server
 * narrowed the claim, or `null` (spec 0026, child 0001, AC-21). Read beside
 * `readSnapshot`, never through it, so the snapshot keeps its four fields.
 */
export function readAccountEmail(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  return accountEmail((body as Record<string, unknown>).email);
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

/**
 * Clerk's sign in time cookie, `__client_uat`, and its suffixed form
 * `__client_uat_<suffix>`. The suffix is a hash of the publishable key, which
 * the page never derives, so any suffix is taken (spec 0026, child 0001,
 * AC-19).
 */
const CLIENT_UAT_NAME = /^__client_uat(_[A-Za-z0-9]+)?$/;

/**
 * Whether this browser signed in, from `document.cookie`: true when any
 * `__client_uat` cookie holds a whole number above 0 (Clerk writes the sign in
 * time in seconds, and 0 once signed out). Pure, so it is tested on strings.
 *
 * It decides only whether a page asks our server, never what the header
 * shows: a forged cookie costs one request, whose answer then shows the
 * signed out shape (AC-19, AC-20). The cookie is read, never written.
 */
export function browserSignedIn(cookieString: string): boolean {
  return cookieString.split(";").some((pair) => {
    const at = pair.indexOf("=");
    if (at === -1) return false;
    const name = pair.slice(0, at).trim();
    const value = pair.slice(at + 1).trim();
    if (!CLIENT_UAT_NAME.test(name) || !/^\d+$/.test(value)) return false;
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) && seconds > 0;
  });
}
