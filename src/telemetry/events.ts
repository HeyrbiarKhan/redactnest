/**
 * Every event RedactNest may count or report, as closed lists. Spec 0016,
 * AC-1 to AC-3 and AC-10, INV-1.
 *
 * The point is what is missing, as it is for `LoggablePayload` (spec 0002,
 * INV-4): no field takes a free string or a raw number. Each holds a kind from
 * a list here or in `src/worker/protocol.ts`, or a `Bucket`, so there is
 * nowhere for a file name, a word of a document or an exact count to go.
 * `tests/unit/loggable.test.ts` holds the type gate over `TelemetryEvent`.
 *
 * The reporter builds events from these types and `/api/telemetry` checks them
 * against `EVENT_FIELDS`, which names the same lists, so what a page sends and
 * what the route accepts cannot drift apart (AC-3). Plain data and pure
 * functions: the browser, the route and the server hooks all share it, and
 * nothing here sends anything.
 */

import {
  ACCOUNT_PATH,
  BILLING_PATH,
  HOME_PATH,
  PRICING_PATH,
  PRIVACY_PATH,
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  TERMS_PATH,
  TOOL_PATH,
  WELCOME_PATH,
} from "@/lib/routes";
import {
  BLOCKED_REASONS,
  DETECTOR_KINDS,
  ENGINE_ERROR_KINDS,
  ENTITLEMENT_ACCOUNTS,
  PAGE_FINDINGS,
  SANITIZED_KINDS,
  type BlockedReason,
  type DetectorKind,
  type EngineErrorKind,
  type EntitlementAccount,
  type EntitlementSnapshot,
  type PageFinding,
  type SanitizedKind,
} from "@/worker/protocol";

/**
 * A count, as a rough range (AC-2). Only these ever leave a page or the
 * server, never the number itself (INV-1), so two documents that differ by
 * one item send the same thing.
 */
export const BUCKETS = Object.freeze(["0", "1", "2-5", "6-20", "21-50", "51+"] as const);

export type Bucket = (typeof BUCKETS)[number];

/** What a by kind map may hold: a kind with nothing in it is left out, never `"0"`. */
const COUNTED_BUCKETS: readonly Bucket[] = Object.freeze(
  BUCKETS.filter((range) => range !== "0"),
);

/**
 * The largest body `/api/telemetry` reads (AC-7). A rule about the event
 * format rather than a cap on the visitor, so it lives here beside the lists
 * it measures, as the engine's file format constants live in `src/engine`.
 * The largest event the catalog can build is well under a kilobyte.
 */
export const MAX_EVENT_BYTES = 2048;

/** The range a count falls in. AC-2. */
export function bucket(count: number): Bucket {
  // `!(count > 0)` rather than `count <= 0`, so `NaN` reads as nothing too.
  if (!(count > 0)) return "0";
  if (count <= 1) return "1";
  if (count <= 5) return "2-5";
  if (count <= 20) return "6-20";
  if (count <= 50) return "21-50";
  return "51+";
}

export type ByKind<Kind extends string> = Readonly<Partial<Record<Kind, Bucket>>>;

/**
 * Counts by kind as ranges, in the list's order. A kind whose count is 0 or
 * absent is left out, so `"0"` appears only where a field is a single count
 * (AC-2), and a key the list does not name never comes through.
 */
export function bucketsByKind<Kind extends string>(
  kinds: readonly Kind[],
  counts: Readonly<Partial<Record<Kind, number>>>,
): ByKind<Kind> {
  const ranges: Partial<Record<Kind, Bucket>> = {};
  for (const kind of kinds) {
    const count = counts[kind] ?? 0;
    if (count > 0) ranges[kind] = bucket(count);
  }
  return Object.freeze(ranges);
}

/**
 * Which page an event came from. Any path under `/account` the list does not
 * name, such as Subscribe's failure page, is `account`, and a path no kind
 * names is `not-found`.
 */
export const PAGE_KINDS = Object.freeze([
  "home",
  "tool",
  "pricing",
  "privacy",
  "terms",
  "sign-in",
  "sign-up",
  "account",
  "billing",
  "welcome",
  "not-found",
] as const);

export type PageKind = (typeof PAGE_KINDS)[number];

/**
 * Each kind's own path, the only address Umami ever receives (AC-21). A page
 * view names the kind's path, never the one in the address bar, so a Clerk
 * step such as `/sign-in/factor-one` arrives as `/sign-in`.
 */
export const PAGE_PATHS: Readonly<Record<PageKind, string>> = Object.freeze({
  home: HOME_PATH,
  tool: TOOL_PATH,
  pricing: PRICING_PATH,
  privacy: PRIVACY_PATH,
  terms: TERMS_PATH,
  "sign-in": SIGN_IN_PATH,
  "sign-up": SIGN_UP_PATH,
  account: ACCOUNT_PATH,
  billing: BILLING_PATH,
  welcome: WELCOME_PATH,
  // No route of ours lives here; it is the name Umami shows for a missing page.
  "not-found": "/404",
});

/** The path itself, or a page beneath it, as Clerk's steps sit under sign in. */
const isUnder = (pathname: string, base: string): boolean =>
  pathname === base || pathname.startsWith(`${base}/`);

/**
 * The kind of page a pathname is (AC-10). Given the pathname alone, never the
 * query or the hash, so nothing a link carried can reach a count.
 */
export function pageKindFor(pathname: string): PageKind {
  switch (pathname) {
    case HOME_PATH:
      return "home";
    case TOOL_PATH:
      return "tool";
    case PRICING_PATH:
      return "pricing";
    case PRIVACY_PATH:
      return "privacy";
    case TERMS_PATH:
      return "terms";
    case BILLING_PATH:
      return "billing";
    case WELCOME_PATH:
      return "welcome";
  }
  if (isUnder(pathname, SIGN_IN_PATH)) return "sign-in";
  if (isUnder(pathname, SIGN_UP_PATH)) return "sign-up";
  if (isUnder(pathname, ACCOUNT_PATH)) return "account";
  return "not-found";
}

export type Tier = EntitlementSnapshot["tier"];

export const TIERS = Object.freeze(["free", "paid"] as const satisfies readonly Tier[]);

/** Where a refusal happened: opening the document, or a run over it. */
export const REFUSAL_STEPS = Object.freeze(["open", "redact"] as const);

/** Which free limit a visitor met: the page cap or the size cap. */
export const CAPS = Object.freeze(["pages", "size"] as const);

/** Which page a sign in finished on. */
export const SIGN_IN_VIAS = Object.freeze(["sign-in", "sign-up"] as const);

/**
 * The server routes a crash can be reported from (AC-15). `ROUTE_KINDS` in
 * `src/instrumentation.ts` maps Next.js's route paths onto these.
 */
export const CRASH_ROUTES = Object.freeze([
  "home",
  "tool",
  "pricing",
  "privacy",
  "terms",
  "not-found",
  "entitlement",
  "telemetry",
  "account",
  "subscribe",
  "billing",
  "welcome",
  "sign-in",
  "sign-up",
  "proxy",
  "other",
] as const);

export type RouteKind = (typeof CRASH_ROUTES)[number];

/** What Next.js was doing when a server request failed, as it reports it. */
export const ROUTE_TYPES = Object.freeze(["render", "route", "action", "proxy"] as const);

/** A browser crash: a thrown error, or a promise rejected with nobody listening. */
export const CRASH_SOURCES = Object.freeze(["error", "rejection"] as const);

/** What a billing failure was doing (AC-19). */
export const BILLING_ACTIONS = Object.freeze([
  "subscribe",
  "portal",
  "delete",
  "welcome",
] as const);

/**
 * How it failed: the outcome kinds of `src/billing`'s seams that end in
 * failure, and `still-waiting` from the welcome page. Kinds only, never the
 * outcome itself, so no email, id or message can come along (AC-19).
 */
export const BILLING_OUTCOMES = Object.freeze([
  "plan-unknown",
  "customer-conflict",
  "other-product",
  "checkout-failed",
  "portal-failed",
  "billing-failed",
  "sign-in-kept",
  "still-waiting",
] as const);

/*
 * The thirteen events, as *Data model sketch* lists them. Type aliases rather
 * than interfaces, so each reads as a plain record of its fields.
 */

export type PageView = Readonly<{ name: "page-view"; page: PageKind }>;

export type DocumentOpened = Readonly<{
  name: "document-opened";
  pages: Bucket;
  found: ByKind<DetectorKind>;
  blocked: ByKind<BlockedReason>;
  pagesWith: ByKind<PageFinding>;
  tier: Tier;
  account: EntitlementAccount;
}>;

export type RedactionCompleted = Readonly<{
  name: "redaction-completed";
  removed: ByKind<DetectorKind>;
  unticked: ByKind<DetectorKind>;
  blockedByKind: ByKind<DetectorKind>;
  blockedByReason: ByKind<BlockedReason>;
  /** No repeats, in `SANITIZED_KINDS` order. */
  stripped: readonly SanitizedKind[];
  tier: Tier;
  account: EntitlementAccount;
}>;

export type RunRefused = Readonly<{
  name: "run-refused";
  kind: EngineErrorKind;
  step: (typeof REFUSAL_STEPS)[number];
  tier: Tier;
  account: EntitlementAccount;
}>;

export type CapReached = Readonly<{
  name: "cap-reached";
  cap: (typeof CAPS)[number];
  account: EntitlementAccount;
}>;

export type SignInCompleted = Readonly<{
  name: "sign-in-completed";
  via: (typeof SIGN_IN_VIAS)[number];
}>;

export type SubscribeStarted = Readonly<{ name: "subscribe-started" }>;

export type SubscriptionConfirmed = Readonly<{ name: "subscription-confirmed" }>;

export type ServerCrash = Readonly<{
  name: "server-crash";
  route: RouteKind;
  routeType: (typeof ROUTE_TYPES)[number];
}>;

export type PlanCheckFailed = Readonly<{ name: "plan-check-failed" }>;

export type BrowserCrash = Readonly<{
  name: "browser-crash";
  page: PageKind;
  kind: (typeof CRASH_SOURCES)[number];
}>;

export type EngineUnavailable = Readonly<{ name: "engine-unavailable" }>;

export type BillingFailed = Readonly<{
  name: "billing-failed";
  action: (typeof BILLING_ACTIONS)[number];
  outcome: (typeof BILLING_OUTCOMES)[number];
}>;

/** Counts, to Umami. Not sent under Global Privacy Control or Do Not Track. */
export type UsageEvent =
  | PageView
  | DocumentOpened
  | RedactionCompleted
  | RunRefused
  | CapReached
  | SignInCompleted
  | SubscribeStarted
  | SubscriptionConfirmed;

/** Failure reports, to Sentry. Always sent, because they say nothing about anyone. */
export type ErrorReport =
  ServerCrash | PlanCheckFailed | BrowserCrash | EngineUnavailable | BillingFailed;

export type TelemetryEvent = UsageEvent | ErrorReport;

export type EventName = TelemetryEvent["name"];

export const USAGE_EVENTS = Object.freeze([
  "page-view",
  "document-opened",
  "redaction-completed",
  "run-refused",
  "cap-reached",
  "sign-in-completed",
  "subscribe-started",
  "subscription-confirmed",
] as const satisfies readonly UsageEvent["name"][]);

export const ERROR_EVENTS = Object.freeze([
  "server-crash",
  "plan-check-failed",
  "browser-crash",
  "engine-unavailable",
  "billing-failed",
] as const satisfies readonly ErrorReport["name"][]);

/**
 * How a field is checked: one kind from a list, ranges by kind from a list,
 * or a set of kinds from a list with no repeats.
 */
export type Field =
  | { readonly one: readonly string[] }
  | { readonly byKind: readonly string[] }
  | { readonly set: readonly string[] };

/**
 * The check a field of type `T` must have, and from a list of `T`'s own
 * values, so a field cannot be checked against the wrong list.
 */
type FieldFor<T> = [T] extends [readonly (infer Item)[]]
  ? { readonly set: readonly Item[] }
  : [T] extends [string]
    ? { readonly one: readonly T[] }
    : [T] extends [ByKind<infer Kind>]
      ? { readonly byKind: readonly Kind[] }
      : never;

type FieldsFor<Event> = {
  readonly [Key in Exclude<keyof Event, "name">]-?: FieldFor<Event[Key]>;
};

const one = <Value extends string>(values: readonly Value[]) =>
  Object.freeze({ one: values });
const byKind = <Kind extends string>(kinds: readonly Kind[]) =>
  Object.freeze({ byKind: kinds });
const set = <Kind extends string>(kinds: readonly Kind[]) =>
  Object.freeze({ set: kinds });

const NONE = Object.freeze({});

/**
 * Every field of every event, and the list it is checked against. AC-3. The
 * type requires each event's fields exactly, so an event that gains a field
 * cannot be sent until its list is named here.
 */
export const EVENT_FIELDS: {
  readonly [Name in EventName]: FieldsFor<Extract<TelemetryEvent, { name: Name }>>;
} = Object.freeze({
  "page-view": Object.freeze({ page: one(PAGE_KINDS) }),
  "document-opened": Object.freeze({
    pages: one(BUCKETS),
    found: byKind(DETECTOR_KINDS),
    blocked: byKind(BLOCKED_REASONS),
    pagesWith: byKind(PAGE_FINDINGS),
    tier: one(TIERS),
    account: one(ENTITLEMENT_ACCOUNTS),
  }),
  "redaction-completed": Object.freeze({
    removed: byKind(DETECTOR_KINDS),
    unticked: byKind(DETECTOR_KINDS),
    blockedByKind: byKind(DETECTOR_KINDS),
    blockedByReason: byKind(BLOCKED_REASONS),
    stripped: set(SANITIZED_KINDS),
    tier: one(TIERS),
    account: one(ENTITLEMENT_ACCOUNTS),
  }),
  "run-refused": Object.freeze({
    kind: one(ENGINE_ERROR_KINDS),
    step: one(REFUSAL_STEPS),
    tier: one(TIERS),
    account: one(ENTITLEMENT_ACCOUNTS),
  }),
  "cap-reached": Object.freeze({ cap: one(CAPS), account: one(ENTITLEMENT_ACCOUNTS) }),
  "sign-in-completed": Object.freeze({ via: one(SIGN_IN_VIAS) }),
  "subscribe-started": NONE,
  "subscription-confirmed": NONE,
  "server-crash": Object.freeze({
    route: one(CRASH_ROUTES),
    routeType: one(ROUTE_TYPES),
  }),
  "plan-check-failed": NONE,
  "browser-crash": Object.freeze({ page: one(PAGE_KINDS), kind: one(CRASH_SOURCES) }),
  "engine-unavailable": NONE,
  "billing-failed": Object.freeze({
    action: one(BILLING_ACTIONS),
    outcome: one(BILLING_OUTCOMES),
  }),
});

/** An event's fields, widened so a reader can walk them whatever the event. */
export const fieldsOf = (name: EventName): Readonly<Record<string, Field>> =>
  EVENT_FIELDS[name];

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

const isOneOf = <Value extends string>(
  values: readonly Value[],
  value: unknown,
): value is Value =>
  typeof value === "string" && (values as readonly string[]).includes(value);

/**
 * One field, rebuilt from its list, or `undefined` when it is not one the
 * field allows. Rebuilt rather than passed through, so what goes on is made of
 * our own strings alone, in our own order.
 */
function readField(field: Field, raw: unknown): unknown {
  if ("one" in field) return isOneOf(field.one, raw) ? raw : undefined;

  if ("byKind" in field) {
    if (!isRecord(raw)) return undefined;
    const kinds = Object.keys(raw);
    if (kinds.some((kind) => !field.byKind.includes(kind))) return undefined;
    if (kinds.some((kind) => !isOneOf(COUNTED_BUCKETS, raw[kind]))) return undefined;
    return Object.freeze(
      Object.fromEntries(
        field.byKind.filter((kind) => kind in raw).map((kind) => [kind, raw[kind]]),
      ),
    );
  }

  if (!Array.isArray(raw)) return undefined;
  if (!raw.every((kind) => isOneOf(field.set, kind))) return undefined;
  if (new Set(raw).size !== raw.length) return undefined;
  return Object.freeze(field.set.filter((kind) => raw.includes(kind)));
}

/**
 * An event, only if it is one the catalog allows, and `null` for anything
 * else (AC-3): an unknown name, a missing or extra key, a value outside its
 * list, a number, an object where a kind belongs, a `"0"` in a by kind map, or
 * a repeated kind in `stripped`. What it returns is rebuilt from the lists,
 * never the value it was given.
 */
export function parseTelemetryEvent(value: unknown): TelemetryEvent | null {
  if (!isRecord(value)) return null;
  const { name } = value;
  if (typeof name !== "string" || !Object.hasOwn(EVENT_FIELDS, name)) return null;

  const fields = fieldsOf(name as EventName);
  const keys = Object.keys(fields);
  // Every field is required and nothing else may come along.
  if (Object.keys(value).length !== keys.length + 1) return null;

  const event: Record<string, unknown> = { name };
  for (const key of keys) {
    if (!Object.hasOwn(value, key)) return null;
    const read = readField(fields[key], value[key]);
    if (read === undefined) return null;
    event[key] = read;
  }
  // Every key and value was just checked against the event's own lists, which
  // is what the type says, so the narrowing holds by construction.
  return Object.freeze(event) as unknown as TelemetryEvent;
}

export const isUsageEvent = (event: TelemetryEvent): event is UsageEvent =>
  (USAGE_EVENTS as readonly string[]).includes(event.name);

/**
 * The only events `/api/telemetry` forwards (AC-7). Everything else is sent by
 * server code alone, so a script posting to the route can skew a count but
 * never raise a server alert.
 */
export const BROWSER_EVENTS = Object.freeze([
  "page-view",
  "document-opened",
  "redaction-completed",
  "run-refused",
  "cap-reached",
  "sign-in-completed",
  "subscription-confirmed",
  "browser-crash",
  "engine-unavailable",
  "billing-failed",
] as const satisfies readonly EventName[]);

/** Whether a page may send this event. `billing-failed` only from the welcome page's wait. */
export function isBrowserEvent(event: TelemetryEvent): boolean {
  if (event.name === "billing-failed") {
    return event.action === "welcome" && event.outcome === "still-waiting";
  }
  return (BROWSER_EVENTS as readonly string[]).includes(event.name);
}
