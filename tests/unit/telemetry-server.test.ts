import { afterEach, describe, expect, it, vi } from "vitest";

import type { TelemetrySinks } from "@/config/telemetry";
import {
  CRASH_ROUTES,
  CRASH_SOURCES,
  type ErrorReport,
  isBrowserEvent,
  PAGE_KINDS,
  reportKey,
  type ServerCrash,
  type UsageEvent,
} from "@/telemetry/events";
import {
  forward,
  optsOut,
  type ReportMemory,
  reportCrash,
  reportServer,
  sentryRequest,
  TELEMETRY_USER_AGENT,
  type TelemetrySeams,
  UMAMI_MAX_PROPERTIES,
  UMAMI_SEND_URL,
  umamiData,
  umamiRequest,
} from "@/telemetry/server";
import {
  BLOCKED_REASONS,
  DETECTOR_KINDS,
  SANITIZED_KINDS,
  type BlockedReason,
  type DetectorKind,
} from "@/worker/protocol";

/**
 * Forwarding, spec 0016 AC-6, AC-8, AC-20, AC-21 and AC-27. Through the
 * seams, so every request a sink would receive is read whole: what it holds,
 * what it does not, and that a sink failing or hanging changes nothing for
 * anyone.
 */

const SINKS: TelemetrySinks = Object.freeze({
  umamiWebsiteId: "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b",
  sentry: Object.freeze({
    dsn: "https://abc123@o1.ingest.de.sentry.io/42",
    envelopeUrl: "https://o1.ingest.de.sentry.io/api/42/envelope/",
  }),
  release: "0123456789abcdef0123456789abcdef01234567",
});

const NOW = new Date("2026-10-30T12:00:00.000Z");
const EVENT_ID = "0123456789abcdef0123456789abcdef";

interface Sent {
  readonly url: string;
  readonly init: RequestInit;
}

/** Seams that record every send and run scheduled work at once. */
function recordingSeams(overrides: Partial<TelemetrySeams> = {}) {
  const sent: Sent[] = [];
  const scheduled: (() => Promise<void>)[] = [];
  const seams: TelemetrySeams = {
    sinks: SINKS,
    fetch: (url, init) => {
      sent.push({ url, init });
      return Promise.resolve(new Response(null, { status: 200 }));
    },
    schedule: (work) => {
      scheduled.push(work);
    },
    now: () => NOW,
    eventId: () => EVENT_ID,
    ...overrides,
  };
  return { seams, sent, scheduled };
}

/** Every kind present, the largest event the catalog can build. */
const allDetectors = Object.fromEntries(
  DETECTOR_KINDS.map((kind) => [kind, "51+"]),
) as Record<DetectorKind, "51+">;
const allReasons = Object.fromEntries(
  BLOCKED_REASONS.map((kind) => [kind, "1"]),
) as Record<BlockedReason, "1">;
const WORST_CASE: UsageEvent = {
  name: "redaction-completed",
  removed: allDetectors,
  unticked: allDetectors,
  blockedByKind: allDetectors,
  blockedByReason: allReasons,
  stripped: SANITIZED_KINDS,
  tier: "paid",
  account: "signed-in",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("the Umami request", () => {
  it("sends a page view for the page's own path, and nothing else", () => {
    const { url, init } = umamiRequest(
      { name: "page-view", page: "account" },
      SINKS.umamiWebsiteId,
    );
    expect(url).toBe(UMAMI_SEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      "User-Agent": TELEMETRY_USER_AGENT,
    });
    expect(JSON.parse(init.body)).toEqual({
      type: "event",
      payload: { website: SINKS.umamiWebsiteId, hostname: "localhost", url: "/account" },
    });
  });

  it("sends not-found as /404", () => {
    const { init } = umamiRequest(
      { name: "page-view", page: "not-found" },
      SINKS.umamiWebsiteId,
    );
    expect(JSON.parse(init.body)).toMatchObject({ payload: { url: "/404" } });
  });

  it("flattens an event's fields into properties, under the page that sent it", () => {
    const { init } = umamiRequest(
      {
        name: "document-opened",
        pages: "2-5",
        found: { email: "2-5", phone: "1" },
        blocked: {},
        pagesWith: { "covered-text": "1" },
        tier: "free",
        account: "none",
      },
      SINKS.umamiWebsiteId,
    );
    expect(JSON.parse(init.body)).toEqual({
      type: "event",
      payload: {
        website: SINKS.umamiWebsiteId,
        hostname: "localhost",
        url: "/tool",
        name: "document-opened",
        data: {
          pages: "2-5",
          found_email: "2-5",
          found_phone: "1",
          "pagesWith_covered-text": "1",
          tier: "free",
          account: "none",
        },
      },
    });
  });

  it("turns each stripped kind into one true property", () => {
    expect(
      umamiData({
        name: "redaction-completed",
        removed: {},
        unticked: {},
        blockedByKind: {},
        blockedByReason: {},
        stripped: ["document-info", "annotations"],
        tier: "free",
        account: "none",
      }),
    ).toEqual({
      "stripped_document-info": true,
      stripped_annotations: true,
      tier: "free",
      account: "none",
    });
  });

  it("names the sending page for each event outside the tool", () => {
    const urlOf = (event: UsageEvent) =>
      (JSON.parse(umamiRequest(event, "id").init.body) as { payload: { url: string } })
        .payload.url;
    expect(urlOf({ name: "subscribe-started" })).toBe("/account/subscribe");
    expect(urlOf({ name: "subscription-confirmed" })).toBe("/account/welcome");
    expect(urlOf({ name: "cap-reached", cap: "pages", account: "none" })).toBe("/tool");
  });

  it("adds no data at all to an event with no fields", () => {
    const { init } = umamiRequest({ name: "subscribe-started" }, SINKS.umamiWebsiteId);
    expect(JSON.parse(init.body)).toEqual({
      type: "event",
      payload: {
        website: SINKS.umamiWebsiteId,
        hostname: "localhost",
        url: "/account/subscribe",
        name: "subscribe-started",
      },
    });
  });

  it("fits the worst case event under Umami's property limit, so nothing is split", () => {
    const data = umamiData(WORST_CASE);
    expect(Object.keys(data)).toHaveLength(38);
    expect(Object.keys(data).length).toBeLessThanOrEqual(UMAMI_MAX_PROPERTIES);
  });
});

describe("the Sentry envelope", () => {
  const lines = (body: string) =>
    body.split("\n").map((line) => JSON.parse(line) as unknown);

  it("holds one event with exactly AC-20's fields", () => {
    const { url, init } = sentryRequest(
      { name: "server-crash", route: "entitlement", routeType: "route" },
      SINKS,
      NOW,
      EVENT_ID,
    );
    expect(url).toBe(SINKS.sentry.envelopeUrl);
    expect(init.headers).toEqual({
      "Content-Type": "application/x-sentry-envelope",
      "User-Agent": TELEMETRY_USER_AGENT,
    });

    const [header, item, report, ...rest] = lines(init.body);
    expect(rest).toEqual([]);
    expect(header).toEqual({
      event_id: EVENT_ID,
      sent_at: "2026-10-30T12:00:00.000Z",
      dsn: SINKS.sentry.dsn,
    });
    expect(item).toEqual({ type: "event" });
    expect(report).toEqual({
      event_id: EVENT_ID,
      timestamp: NOW.getTime() / 1000,
      level: "error",
      platform: "node",
      message: { formatted: "server-crash" },
      tags: { route: "entitlement", routeType: "route" },
      fingerprint: ["server-crash", "entitlement"],
      environment: "production",
      release: SINKS.release,
    });
  });

  it.each([
    [
      { name: "browser-crash", page: "tool", kind: "rejection" },
      ["browser-crash", "tool"],
    ],
    [
      { name: "billing-failed", action: "welcome", outcome: "still-waiting" },
      ["billing-failed", "welcome"],
    ],
    [{ name: "plan-check-failed" }, ["plan-check-failed"]],
    [{ name: "engine-unavailable" }, ["engine-unavailable"]],
  ] as const)("fingerprints %j by its name and where", (event, fingerprint) => {
    const report = lines(sentryRequest(event, SINKS, NOW, EVENT_ID).init.body)[2] as {
      fingerprint: unknown;
      tags: unknown;
    };
    expect(report.fingerprint).toEqual(fingerprint);
  });
});

describe("forward", () => {
  it("sends nothing when this build forwards nothing", async () => {
    const { seams, sent } = recordingSeams({ sinks: null });
    await forward({ name: "plan-check-failed" }, seams);
    expect(sent).toEqual([]);
  });

  it("sends a count to Umami and a report to Sentry", async () => {
    const { seams, sent } = recordingSeams();
    await forward({ name: "page-view", page: "home" }, seams);
    await forward({ name: "engine-unavailable" }, seams);
    expect(sent.map(({ url }) => url)).toEqual([
      UMAMI_SEND_URL,
      SINKS.sentry.envelopeUrl,
    ]);
  });

  it("carries no credentials, cookie or header beyond its own two", async () => {
    const { seams, sent } = recordingSeams();
    await forward({ name: "page-view", page: "tool" }, seams);
    const { init } = sent[0] as Sent;
    expect(Object.keys(init.headers as Record<string, string>).sort()).toEqual([
      "Content-Type",
      "User-Agent",
    ]);
    expect(init.credentials).toBeUndefined();
    expect(init.referrer).toBeUndefined();
  });

  it("shrugs off a sink that answers 500", async () => {
    const { seams } = recordingSeams({
      fetch: () => Promise.resolve(new Response("down", { status: 500 })),
    });
    await expect(forward({ name: "plan-check-failed" }, seams)).resolves.toBeUndefined();
  });

  it("shrugs off a network failure, and tries once", async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    const { seams } = recordingSeams({ fetch });
    await expect(forward({ name: "plan-check-failed" }, seams)).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("gives up on a sink that hangs past 3 seconds, and aborts it", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | null | undefined;
    const { seams } = recordingSeams({
      fetch: (_url, init) => {
        signal = init.signal;
        return new Promise<Response>(() => {});
      },
    });

    let done = false;
    const sending = forward({ name: "page-view", page: "home" }, seams).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(2_999);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await sending;
    expect(done).toBe(true);
    expect(signal?.aborted).toBe(true);
  });
});

/*
 * The collapse and the page budget (AC-27, AC-29, INV-10). Every case that
 * sends an error report hands it a memory of its own, so the module's default
 * one, which the hook, the proxy and request code share in a real server, is
 * never touched here.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const freshMemory = (): ReportMemory => ({ sent: new Map(), pageDays: new Map() });

/** Recording seams on a clock the test moves, and a fresh memory. */
function reportSeams(overrides: Partial<TelemetrySeams> = {}) {
  const clock = { at: NOW.getTime() };
  const recording = recordingSeams({ now: () => new Date(clock.at), ...overrides });
  return { ...recording, clock, memory: freshMemory() };
}

/** Every report shape a page can send, 24 of them (AC-28). */
const PAGE_REPORTS: readonly ErrorReport[] = Object.freeze([
  ...PAGE_KINDS.flatMap((page) =>
    CRASH_SOURCES.map((kind): ErrorReport => ({ name: "browser-crash", page, kind })),
  ),
  { name: "engine-unavailable" },
  { name: "billing-failed", action: "welcome", outcome: "still-waiting" },
]);

/** Eight reports only request code sends, never a page (AC-29). */
const SERVER_REPORTS: readonly ErrorReport[] = Object.freeze([
  { name: "billing-failed", action: "subscribe", outcome: "plan-unknown" },
  { name: "billing-failed", action: "subscribe", outcome: "customer-conflict" },
  { name: "billing-failed", action: "subscribe", outcome: "other-product" },
  { name: "billing-failed", action: "subscribe", outcome: "checkout-failed" },
  { name: "billing-failed", action: "portal", outcome: "portal-failed" },
  { name: "billing-failed", action: "delete", outcome: "billing-failed" },
  { name: "billing-failed", action: "delete", outcome: "sign-in-kept" },
  { name: "plan-check-failed" },
]);

/** Twelve server failures, one on each of the first twelve routes. */
const SERVER_CRASHES: readonly ServerCrash[] = Object.freeze(
  CRASH_ROUTES.slice(0, 12).map((route): ServerCrash => ({
    name: "server-crash",
    route,
    routeType: "render",
  })),
);

const NO_HEADERS = new Headers();

describe("the report shapes these cases use", () => {
  it("are every page report and twenty server reports, each with a key of its own", () => {
    expect(PAGE_REPORTS).toHaveLength(24);
    expect(PAGE_REPORTS.every(isBrowserEvent)).toBe(true);
    expect(SERVER_REPORTS.some(isBrowserEvent)).toBe(false);
    expect(SERVER_REPORTS.length + SERVER_CRASHES.length).toBe(20);
    const keys = [...PAGE_REPORTS, ...SERVER_REPORTS, ...SERVER_CRASHES].map(reportKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("reportCrash", () => {
  const CRASH: ServerCrash = {
    name: "server-crash",
    route: "subscribe",
    routeType: "render",
  };

  it("forwards the first failure from a place as a Sentry report", async () => {
    const { seams, sent, memory } = reportSeams();
    await reportCrash(CRASH, seams, memory);
    expect(sent.map(({ url }) => url)).toEqual([SINKS.sentry.envelopeUrl]);
  });

  it("forwards nothing for the same route and type inside the hour", async () => {
    const { seams, sent, clock, memory } = reportSeams();
    await reportCrash(CRASH, seams, memory);
    await reportCrash(CRASH, seams, memory);
    clock.at += HOUR_MS - 1;
    await reportCrash(CRASH, seams, memory);
    expect(sent).toHaveLength(1);
  });

  it("forwards a different route or a different type", async () => {
    const { seams, sent, memory } = reportSeams();
    await reportCrash(CRASH, seams, memory);
    await reportCrash({ ...CRASH, route: "billing" }, seams, memory);
    await reportCrash({ ...CRASH, routeType: "action" }, seams, memory);
    await reportCrash({ ...CRASH, routeType: "other" }, seams, memory);
    expect(sent).toHaveLength(4);
  });

  it("forwards the same one again at exactly one hour", async () => {
    const { seams, sent, clock, memory } = reportSeams();
    await reportCrash(CRASH, seams, memory);
    clock.at += HOUR_MS;
    await reportCrash(CRASH, seams, memory);
    expect(sent).toHaveLength(2);
  });

  it("forwards once for two started together, before either send answers", async () => {
    const answer = Promise.withResolvers<Response>();
    const fetch = vi.fn(() => answer.promise);
    const { seams, memory } = reportSeams({ fetch });

    const first = reportCrash(CRASH, seams, memory);
    const second = reportCrash(CRASH, seams, memory);
    await second;
    expect(fetch).toHaveBeenCalledTimes(1);

    answer.resolve(new Response(null, { status: 200 }));
    await first;
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("counts a send that fails, so the next failure that hour goes unreported", async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    const { seams, clock, memory } = reportSeams({ fetch });
    await expect(reportCrash(CRASH, seams, memory)).resolves.toBeUndefined();
    clock.at += HOUR_MS / 2;
    await reportCrash(CRASH, seams, memory);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("records nothing when this build forwards nothing", async () => {
    const { seams, sent, memory } = reportSeams({ sinks: null });
    await reportCrash(CRASH, seams, memory);
    expect(memory.sent.size).toBe(0);
    expect(memory.pageDays.size).toBe(0);
    expect(sent).toEqual([]);

    const live = reportSeams();
    await reportCrash(CRASH, live.seams, memory);
    expect(live.sent).toHaveLength(1);
  });

  it("still resolves when the clock throws, and sends nothing", async () => {
    const { seams, sent, memory } = reportSeams({
      now: () => {
        throw new Error("no clock");
      },
    });
    await expect(reportCrash(CRASH, seams, memory)).resolves.toBeUndefined();
    expect(sent).toEqual([]);
    expect(memory.sent.size).toBe(0);
  });
});

describe("reportServer", () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it("schedules the send after the answer, never sending in line", async () => {
    const { seams, sent, scheduled } = recordingSeams();
    reportServer({ name: "subscribe-started" }, headers({}), seams);
    expect(sent).toEqual([]);
    expect(scheduled).toHaveLength(1);
    await scheduled[0]?.();
    expect(sent).toHaveLength(1);
  });

  it("never reads the incoming request's other headers into the send", async () => {
    const { seams, sent, scheduled } = recordingSeams();
    reportServer(
      { name: "subscribe-started" },
      headers({
        cookie: "__session=secret",
        "user-agent": "VisitorBrowser/1.0",
        "x-forwarded-for": "203.0.113.9",
        referer: "https://redactnest.com/pricing",
      }),
      seams,
    );
    await scheduled[0]?.();
    const sentText = JSON.stringify(sent);
    for (const leak of ["secret", "VisitorBrowser", "203.0.113.9", "/pricing"]) {
      expect(sentText).not.toContain(leak);
    }
  });

  it.each<Record<string, string>>([{ "sec-gpc": "1" }, { dnt: "1" }])(
    "drops a count from a request carrying %j, but still reports a failure",
    (optOut) => {
      const { seams, scheduled, memory } = reportSeams();
      reportServer({ name: "subscribe-started" }, headers(optOut), seams, memory);
      expect(scheduled).toEqual([]);
      reportServer(
        { name: "billing-failed", action: "subscribe", outcome: "checkout-failed" },
        headers(optOut),
        seams,
        memory,
      );
      expect(scheduled).toHaveLength(1);
    },
  );

  it("schedules and records nothing when this build forwards nothing", () => {
    const { seams, scheduled, memory } = reportSeams({ sinks: null });
    reportServer({ name: "plan-check-failed" }, NO_HEADERS, seams, memory);
    reportServer({ name: "engine-unavailable" }, NO_HEADERS, seams, memory);
    expect(scheduled).toEqual([]);
    expect(memory.sent.size).toBe(0);
    expect(memory.pageDays.size).toBe(0);
  });

  it("never throws into its caller, even outside a request", () => {
    const { seams, memory } = reportSeams({
      schedule: () => {
        throw new Error("after() called outside a request scope");
      },
    });
    expect(() =>
      reportServer({ name: "plan-check-failed" }, NO_HEADERS, seams, memory),
    ).not.toThrow();
  });

  it("loses a report whose schedule throws for the hour, and takes nothing back", () => {
    const { seams, scheduled, clock, memory } = reportSeams();
    const failing = {
      ...seams,
      schedule: () => {
        throw new Error("after() called outside a request scope");
      },
    };
    reportServer({ name: "plan-check-failed" }, NO_HEADERS, failing, memory);
    clock.at += HOUR_MS - 1;
    reportServer({ name: "plan-check-failed" }, NO_HEADERS, seams, memory);
    expect(scheduled).toEqual([]);
    clock.at += 1;
    reportServer({ name: "plan-check-failed" }, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(1);
  });

  it("schedules nothing and throws nothing when the clock throws", () => {
    const { seams, scheduled, memory } = reportSeams({
      now: () => {
        throw new Error("no clock");
      },
    });
    expect(() =>
      reportServer({ name: "plan-check-failed" }, NO_HEADERS, seams, memory),
    ).not.toThrow();
    expect(() => reportServer(PAGE_REPORTS[0]!, NO_HEADERS, seams, memory)).not.toThrow();
    expect(scheduled).toEqual([]);
    expect(memory.sent.size).toBe(0);
  });
});

describe("reportServer's collapse (AC-16, AC-27)", () => {
  it("schedules one send for plan-check-failed 100 times inside the hour", () => {
    const { seams, scheduled, clock, memory } = reportSeams();
    for (let time = 0; time < 100; time += 1) {
      reportServer({ name: "plan-check-failed" }, NO_HEADERS, seams, memory);
      clock.at += 1_000;
    }
    expect(scheduled).toHaveLength(1);
  });

  it("keys billing-failed for subscribe and for portal apart", () => {
    const { seams, scheduled, memory } = reportSeams();
    for (const report of SERVER_REPORTS.slice(3, 5)) {
      reportServer(report, NO_HEADERS, seams, memory);
      reportServer(report, NO_HEADERS, seams, memory);
    }
    expect(scheduled).toHaveLength(2);
  });

  it("passes every count untouched, however many, and remembers none", () => {
    const { seams, scheduled, memory } = reportSeams();
    for (let time = 0; time < 100; time += 1) {
      reportServer({ name: "page-view", page: "tool" }, NO_HEADERS, seams, memory);
    }
    expect(scheduled).toHaveLength(100);
    expect(memory.sent.size).toBe(0);
    expect(memory.pageDays.size).toBe(0);
  });
});

describe("the flood, on the server (AC-27, AC-29, INV-10)", () => {
  it("schedules one send for the same browser-crash 100 times", () => {
    const { seams, scheduled, memory } = reportSeams();
    for (let time = 0; time < 100; time += 1) {
      reportServer(
        { name: "browser-crash", page: "tool", kind: "rejection" },
        NO_HEADERS,
        seams,
        memory,
      );
    }
    expect(scheduled).toHaveLength(1);
  });

  it("schedules 20 of the 24 page report shapes in one UTC day, and drops the rest", () => {
    const { seams, scheduled, memory } = reportSeams();
    for (const report of PAGE_REPORTS) reportServer(report, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(20);
  });

  it("still sends a server-crash and a plan-check-failed once the budget is spent", async () => {
    const { seams, sent, scheduled, memory } = reportSeams();
    for (const report of PAGE_REPORTS) reportServer(report, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(20);

    reportServer({ name: "plan-check-failed" }, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(21);
    await reportCrash(
      { name: "server-crash", route: "entitlement", routeType: "route" },
      seams,
      memory,
    );
    expect(sent).toHaveLength(1);
  });

  it("sends again on the next UTC day", () => {
    const { seams, scheduled, clock, memory } = reportSeams();
    for (const report of PAGE_REPORTS) reportServer(report, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(20);

    clock.at = (Math.floor(clock.at / DAY_MS) + 1) * DAY_MS;
    for (const report of PAGE_REPORTS) reportServer(report, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(40);
    expect([...memory.pageDays.keys()]).toEqual([Math.floor(clock.at / DAY_MS)]);
  });

  it("records nothing for a report the budget dropped, so it sends next day inside its hour", () => {
    const { seams, scheduled, clock, memory } = reportSeams();
    const nextDay = (Math.floor(clock.at / DAY_MS) + 1) * DAY_MS;
    clock.at = nextDay - 30 * 60 * 1000;
    for (const report of PAGE_REPORTS.slice(0, 20)) {
      reportServer(report, NO_HEADERS, seams, memory);
    }
    const dropped = PAGE_REPORTS[20]!;
    reportServer(dropped, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(20);
    expect(memory.sent.has(reportKey(dropped))).toBe(false);
    expect(memory.pageDays.get(Math.floor(clock.at / DAY_MS))).toBe(20);

    // Forty minutes on: the next UTC day, but inside the hour of the drop.
    clock.at = nextDay + 10 * 60 * 1000;
    reportServer(dropped, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(21);
  });

  it("spends none of the budget on 20 server reports, so 20 page reports still go", async () => {
    const { seams, sent, scheduled, memory } = reportSeams();
    for (const report of SERVER_REPORTS) reportServer(report, NO_HEADERS, seams, memory);
    for (const crash of SERVER_CRASHES) await reportCrash(crash, seams, memory);
    expect(scheduled).toHaveLength(SERVER_REPORTS.length);
    expect(sent).toHaveLength(SERVER_CRASHES.length);
    expect(memory.pageDays.size).toBe(0);

    for (const report of PAGE_REPORTS) reportServer(report, NO_HEADERS, seams, memory);
    expect(scheduled).toHaveLength(SERVER_REPORTS.length + 20);
  });
});

describe("optsOut", () => {
  it.each([
    [{ "sec-gpc": "1" }, true],
    [{ dnt: "1" }, true],
    [{ "sec-gpc": "0" }, false],
    [{ dnt: "0" }, false],
    [{}, false],
  ])("reads %j as %s", (entries, opted) => {
    expect(optsOut(new Headers(entries))).toBe(opted);
  });
});
