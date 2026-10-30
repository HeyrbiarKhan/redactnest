/**
 * Counts to Umami and failure reports to Sentry, server to server. Spec 0016,
 * AC-6, AC-8, AC-20 and AC-21, INV-2 to INV-4.
 *
 * No SDK for either service: a plain `fetch` from our own server, so no
 * outside script, cookie or origin reaches any page (INV-4). The outbound
 * request is built from the event alone, which the catalog already holds to
 * closed kinds and ranges, plus the few values *Value sourcing* names. It
 * never carries the visitor's IP address, `User-Agent`, cookie, referrer or
 * any other header of the request that brought the event in (INV-2).
 *
 * Telemetry never changes what a visitor sees or waits for (INV-3): every
 * send runs after the answer, gives up after 3 seconds, swallows every
 * failure and never retries, and nothing here throws into its caller.
 *
 * Server only. Lint lets only the importers *Security model* names reach it.
 */

import "server-only";

import { after } from "next/server";

import { config } from "@/config";
import { telemetrySinks, type TelemetrySinks } from "@/config/telemetry";
import {
  SIGN_IN_PATH,
  SIGN_UP_PATH,
  SUBSCRIBE_PATH,
  TOOL_PATH,
  WELCOME_PATH,
} from "@/lib/routes";

import {
  type ErrorReport,
  fieldsOf,
  isUsageEvent,
  PAGE_PATHS,
  type TelemetryEvent,
  type UsageEvent,
} from "./events";

/**
 * Umami Cloud's send endpoint, read from docs.umami.is/docs/api/sending-stats
 * on 30 October 2026. One host for both data regions; the older v2 docs name
 * `cloud.umami.is`, which the current ones replace. A rule about a service,
 * not a cap on the visitor.
 */
export const UMAMI_SEND_URL = "https://gateway.umami.is/api/send";

/**
 * The one `User-Agent` every outbound request carries, never the visitor's
 * (AC-8). Umami refuses a send without one, so this is the string its own
 * server side guide sends (docs.umami.is/docs/guides/send-server-side-events,
 * read 30 October 2026). If Go live step 7's visit never shows in Umami, its
 * bot filter refused this, and AC-21 says to swap in one fixed generic browser
 * string, the same on every event.
 */
export const TELEMETRY_USER_AGENT = "Mozilla/5.0 (Server)";

/**
 * Umami's limit on an event's properties: "Objects: Max of 50 properties",
 * docs.umami.is/docs/tracker-functions, read 30 October 2026. The largest
 * event, `redaction-completed` with every kind present, flattens to 38, so it
 * is sent whole and never split (AC-21).
 */
export const UMAMI_MAX_PROPERTIES = 50;

/** How long a sink gets before its answer stops mattering (AC-8). */
const SINK_TIMEOUT_MS = 3_000;

/** Our own host, the only one Umami is told about (AC-21). */
const SITE_HOSTNAME = new URL(config.siteUrl).hostname;

/**
 * What forwarding reaches outside itself, so a test can stand in for each:
 * where to send, the network, the scheduler, the clock and the report id.
 */
export interface TelemetrySeams {
  readonly sinks: TelemetrySinks | null;
  readonly fetch: (url: string, init: RequestInit) => Promise<Response>;
  /** Runs the send after the answer is out: `after()` in a request. */
  readonly schedule: (work: () => Promise<void>) => void;
  readonly now: () => Date;
  /** A fresh id for each Sentry report, linking nothing (*Data model sketch*). */
  readonly eventId: () => string;
}

export const TELEMETRY_SEAMS: TelemetrySeams = Object.freeze({
  sinks: telemetrySinks,
  fetch: (url: string, init: RequestInit) => fetch(url, init),
  schedule: (work: () => Promise<void>) => after(work),
  now: () => new Date(),
  eventId: () => crypto.randomUUID().replaceAll("-", ""),
});

/** One outbound request, as plain data a test can read whole. */
export interface Outbound {
  readonly url: string;
  readonly init: Readonly<{
    method: "POST";
    headers: Readonly<Record<string, string>>;
    body: string;
  }>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * An event's fields as Umami properties (AC-21): a single kind as itself, a
 * by kind map flattened (`found_email: "2-5"`), and a set as one `true` per
 * kind present (`stripped_annotations: true`). An empty map adds nothing.
 */
export function umamiData(event: UsageEvent): Readonly<Record<string, string | true>> {
  const values: Readonly<Record<string, unknown>> = event;
  const data: Record<string, string | true> = {};

  for (const [key, field] of Object.entries(fieldsOf(event.name))) {
    const value = values[key];
    if ("one" in field) {
      if (typeof value === "string") data[key] = value;
    } else if ("set" in field) {
      if (!Array.isArray(value)) continue;
      for (const kind of field.set)
        if (value.includes(kind)) data[`${key}_${kind}`] = true;
    } else if (isRecord(value)) {
      for (const kind of field.byKind) {
        const range = value[kind];
        if (typeof range === "string") data[`${key}_${kind}`] = range;
      }
    }
  }
  return Object.freeze(data);
}

/**
 * The page an event speaks for, as one of our own paths (*Value sourcing*):
 * the page's kind for a page view, and the page that sends it otherwise.
 */
function umamiUrl(event: UsageEvent): string {
  switch (event.name) {
    case "page-view":
      return PAGE_PATHS[event.page];
    case "document-opened":
    case "redaction-completed":
    case "run-refused":
    case "cap-reached":
      return TOOL_PATH;
    case "sign-in-completed":
      return event.via === "sign-in" ? SIGN_IN_PATH : SIGN_UP_PATH;
    case "subscribe-started":
      return SUBSCRIBE_PATH;
    case "subscription-confirmed":
      return WELCOME_PATH;
  }
}

/**
 * Umami's send body for a count (AC-21): a page view for `page-view`, an
 * event named as in the catalog otherwise. No referrer, language, screen or
 * title, and no `data` when there is nothing to say.
 */
export function umamiRequest(event: UsageEvent, websiteId: string): Outbound {
  const base = { website: websiteId, hostname: SITE_HOSTNAME, url: umamiUrl(event) };
  const data = event.name === "page-view" ? {} : umamiData(event);
  const payload =
    event.name === "page-view"
      ? base
      : {
          ...base,
          name: event.name,
          ...(Object.keys(data).length > 0 ? { data } : {}),
        };

  return Object.freeze({
    url: UMAMI_SEND_URL,
    init: Object.freeze({
      method: "POST",
      headers: Object.freeze({
        "Content-Type": "application/json",
        "User-Agent": TELEMETRY_USER_AGENT,
      }),
      body: JSON.stringify({ type: "event", payload }),
    }),
  });
}

/** A report's fields as Sentry tags: kinds only, every value one of our own strings. */
function sentryTags(event: ErrorReport): Readonly<Record<string, string>> {
  switch (event.name) {
    case "server-crash":
      return { route: event.route, routeType: event.routeType };
    case "browser-crash":
      return { page: event.page, kind: event.kind };
    case "billing-failed":
      return { action: event.action, outcome: event.outcome };
    case "plan-check-failed":
    case "engine-unavailable":
      return {};
  }
}

/** What groups a report into one Sentry issue besides its name: where it happened. */
function sentryWhere(event: ErrorReport): string | null {
  switch (event.name) {
    case "server-crash":
      return event.route;
    case "browser-crash":
      return event.page;
    case "billing-failed":
      return event.action;
    case "plan-check-failed":
    case "engine-unavailable":
      return null;
  }
}

/**
 * One Sentry envelope holding one event (AC-20): the name as its message, its
 * fields as tags, its name and where as the fingerprint. Nothing else: no
 * exception, stack trace, breadcrumbs, user, request, contexts, extra or
 * server name. The envelope header's `dsn` is the authentication, as
 * develop.sentry.dev's envelope docs describe (read 30 October 2026).
 */
export function sentryRequest(
  event: ErrorReport,
  sinks: TelemetrySinks,
  now: Date,
  eventId: string,
): Outbound {
  const where = sentryWhere(event);
  const report = {
    event_id: eventId,
    timestamp: now.getTime() / 1000,
    level: "error",
    platform: "node",
    message: { formatted: event.name },
    tags: sentryTags(event),
    fingerprint: where === null ? [event.name] : [event.name, where],
    environment: "production",
    release: sinks.release,
  };
  const body = [
    JSON.stringify({
      event_id: eventId,
      sent_at: now.toISOString(),
      dsn: sinks.sentry.dsn,
    }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(report),
  ].join("\n");

  return Object.freeze({
    url: sinks.sentry.envelopeUrl,
    init: Object.freeze({
      method: "POST",
      headers: Object.freeze({
        "Content-Type": "application/x-sentry-envelope",
        "User-Agent": TELEMETRY_USER_AGENT,
      }),
      body,
    }),
  });
}

/**
 * Send one event to its sink: a count to Umami, a report to Sentry (AC-8).
 * Resolves once the sink answers or 3 seconds pass, whichever is first, and
 * never rejects. Nothing when this build forwards nothing.
 *
 * `onRequestError` awaits this directly, as Next.js's docs ask, because it
 * has no answer to wait for. Request code goes through `reportServer` below.
 */
export async function forward(
  event: TelemetryEvent,
  seams: TelemetrySeams = TELEMETRY_SEAMS,
): Promise<void> {
  const { sinks } = seams;
  if (sinks === null) return;

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve();
    }, SINK_TIMEOUT_MS);
  });

  const send = async (): Promise<void> => {
    const outbound = isUsageEvent(event)
      ? umamiRequest(event, sinks.umamiWebsiteId)
      : sentryRequest(event, sinks, seams.now(), seams.eventId());
    const response = await seams.fetch(outbound.url, {
      ...outbound.init,
      signal: controller.signal,
    });
    // The answer is never read; let its connection go.
    await response.body?.cancel();
  };

  // Caught before the race, so a send that fails after the timeout has won
  // cannot surface later as an unhandled rejection.
  const sending = send().catch(() => undefined);
  await Promise.race([sending, timeout]);
  clearTimeout(timer);
}

/** The one thing read from a request: its headers, for the opt out signals. */
export interface HeaderReader {
  get(name: string): string | null;
}

/**
 * Whether the request asked not to be counted: Global Privacy Control's
 * `Sec-GPC: 1`, or Do Not Track's `DNT: 1` (AC-6).
 */
export const optsOut = (headers: HeaderReader): boolean =>
  headers.get("sec-gpc")?.trim() === "1" || headers.get("dnt")?.trim() === "1";

/**
 * Report an event from request code: `/api/telemetry`, the plan check and the
 * account pages. A count is dropped when the request opts out; a failure
 * report is always sent (INV-6). The send runs after the answer (AC-8), and
 * nothing here throws, even outside a request where there is no answer to
 * run after.
 */
export function reportServer(
  event: TelemetryEvent,
  requestHeaders: HeaderReader,
  seams: TelemetrySeams = TELEMETRY_SEAMS,
): void {
  if (seams.sinks === null) return;
  if (isUsageEvent(event) && optsOut(requestHeaders)) return;
  try {
    seams.schedule(() => forward(event, seams));
  } catch {
    // `after()` outside a request scope. Telemetry never breaks its caller.
  }
}
