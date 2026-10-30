import { afterEach, describe, expect, it, vi } from "vitest";

import type { TelemetrySinks } from "@/config/telemetry";
import type { UsageEvent } from "@/telemetry/events";
import {
  forward,
  optsOut,
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
 * Forwarding, spec 0016 AC-6, AC-8, AC-20 and AC-21. Through the seams, so
 * every request a sink would receive is read whole: what it holds, what it
 * does not, and that a sink failing or hanging changes nothing for anyone.
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
    expect(urlOf({ name: "sign-in-completed", via: "sign-in" })).toBe("/sign-in");
    expect(urlOf({ name: "sign-in-completed", via: "sign-up" })).toBe("/sign-up");
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
      const { seams, scheduled } = recordingSeams();
      reportServer({ name: "subscribe-started" }, headers(optOut), seams);
      expect(scheduled).toEqual([]);
      reportServer(
        { name: "billing-failed", action: "subscribe", outcome: "checkout-failed" },
        headers(optOut),
        seams,
      );
      expect(scheduled).toHaveLength(1);
    },
  );

  it("schedules nothing when this build forwards nothing", () => {
    const { seams, scheduled } = recordingSeams({ sinks: null });
    reportServer({ name: "plan-check-failed" }, headers({}), seams);
    expect(scheduled).toEqual([]);
  });

  it("never throws into its caller, even outside a request", () => {
    const { seams } = recordingSeams({
      schedule: () => {
        throw new Error("after() called outside a request scope");
      },
    });
    expect(() =>
      reportServer({ name: "plan-check-failed" }, headers({}), seams),
    ).not.toThrow();
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
