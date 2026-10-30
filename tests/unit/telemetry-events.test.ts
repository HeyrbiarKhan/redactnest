import { describe, expect, it } from "vitest";

import {
  BROWSER_EVENTS,
  bucket,
  bucketsByKind,
  ERROR_EVENTS,
  EVENT_FIELDS,
  isBrowserEvent,
  isUsageEvent,
  PAGE_KINDS,
  PAGE_PATHS,
  pageKindFor,
  parseTelemetryEvent,
  USAGE_EVENTS,
  type TelemetryEvent,
} from "@/telemetry/events";
import { DETECTOR_KINDS, PAGE_FINDINGS } from "@/worker/protocol";

/**
 * The telemetry catalog. Spec 0016, AC-1 to AC-3 and AC-10.
 *
 * The type gate is `loggable.test.ts`; this proves the runtime half: the
 * ranges, the page kinds, and a parser that rebuilds an event from the lists
 * or refuses it, since that parser is all that stands between a forged body
 * and Umami or Sentry.
 */

/** One full event of each kind, every field filled, to bend in the refusals below. */
const OPENED: TelemetryEvent = {
  name: "document-opened",
  pages: "2-5",
  found: { email: "2-5", phone: "1" },
  blocked: { "replacement-text": "1" },
  pagesWith: { scanned: "1" },
  tier: "free",
  account: "none",
};

const COMPLETED: TelemetryEvent = {
  name: "redaction-completed",
  removed: { email: "2-5" },
  unticked: { phone: "1" },
  blockedByKind: {},
  blockedByReason: {},
  stripped: ["document-info", "annotations"],
  tier: "paid",
  account: "signed-in",
};

describe("bucket", () => {
  it.each([
    [0, "0"],
    [1, "1"],
    [2, "2-5"],
    [5, "2-5"],
    [6, "6-20"],
    [20, "6-20"],
    [21, "21-50"],
    [50, "21-50"],
    [51, "51+"],
    [10_000, "51+"],
  ])("puts %i in %s", (count, range) => {
    expect(bucket(count)).toBe(range);
  });

  it("reads a negative count or NaN as nothing", () => {
    expect(bucket(-1)).toBe("0");
    expect(bucket(Number.NaN)).toBe("0");
  });
});

describe("bucketsByKind", () => {
  it("leaves out every kind whose count is 0 or absent, in the list's order", () => {
    const ranges = bucketsByKind(DETECTOR_KINDS, { phone: 7, email: 1, date: 0 });
    expect(ranges).toEqual({ email: "1", phone: "6-20" });
    expect(Object.keys(ranges)).toEqual(["email", "phone"]);
    expect(Object.values(ranges)).not.toContain("0");
  });

  it("drops a key the list does not name", () => {
    const counts: Partial<Record<string, number>> = { email: 2, surname: 4 };
    expect(bucketsByKind(DETECTOR_KINDS, counts)).toEqual({ email: "2-5" });
  });

  it("is frozen", () => {
    expect(Object.isFrozen(bucketsByKind(PAGE_FINDINGS, { blank: 3 }))).toBe(true);
  });
});

describe("pageKindFor", () => {
  it.each([
    ["/", "home"],
    ["/tool", "tool"],
    ["/pricing", "pricing"],
    ["/privacy", "privacy"],
    ["/terms", "terms"],
    ["/sign-in", "sign-in"],
    ["/sign-in/factor-one", "sign-in"],
    ["/sign-up", "sign-up"],
    ["/sign-up/verify-email-address", "sign-up"],
    ["/account", "account"],
    ["/account/subscribe", "account"],
    ["/account/billing", "billing"],
    ["/account/welcome", "welcome"],
    ["/account/billing/extra", "account"],
    ["/nowhere", "not-found"],
    ["/tool/extra", "not-found"],
    ["/Tool", "not-found"],
    ["/sign-inside", "not-found"],
  ])("reads %s as %s", (pathname, kind) => {
    expect(pageKindFor(pathname)).toBe(kind);
  });

  it("names a path for every kind, so a page view never carries the address bar's", () => {
    for (const kind of PAGE_KINDS) {
      expect(PAGE_PATHS[kind]).toMatch(/^\/[a-z0-9/-]*$/);
    }
  });
});

describe("the event lists", () => {
  it("split the thirteen events into usage and errors, with nothing left over", () => {
    const names = Object.keys(EVENT_FIELDS);
    expect(names).toHaveLength(13);
    expect([...USAGE_EVENTS, ...ERROR_EVENTS].sort()).toEqual([...names].sort());
  });

  it("keep subscribe-started, server-crash and plan-check-failed server only", () => {
    expect(BROWSER_EVENTS).not.toContain("subscribe-started");
    expect(BROWSER_EVENTS).not.toContain("server-crash");
    expect(BROWSER_EVENTS).not.toContain("plan-check-failed");
  });

  it("let a page send billing-failed only for the welcome page's wait", () => {
    expect(
      isBrowserEvent({
        name: "billing-failed",
        action: "welcome",
        outcome: "still-waiting",
      }),
    ).toBe(true);
    expect(
      isBrowserEvent({
        name: "billing-failed",
        action: "subscribe",
        outcome: "plan-unknown",
      }),
    ).toBe(false);
    expect(
      isBrowserEvent({
        name: "billing-failed",
        action: "welcome",
        outcome: "portal-failed",
      }),
    ).toBe(false);
  });

  it("tell a count from a failure report", () => {
    expect(isUsageEvent({ name: "page-view", page: "home" })).toBe(true);
    expect(isUsageEvent({ name: "engine-unavailable" })).toBe(false);
  });
});

describe("parseTelemetryEvent", () => {
  it("accepts a well formed event and hands back a rebuilt, frozen copy", () => {
    const sent = JSON.parse(JSON.stringify(OPENED)) as unknown;
    const parsed = parseTelemetryEvent(sent);
    expect(parsed).toEqual(OPENED);
    expect(parsed).not.toBe(sent);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it("accepts every event with no fields, and empty maps", () => {
    for (const name of [
      "subscribe-started",
      "subscription-confirmed",
      "plan-check-failed",
      "engine-unavailable",
    ]) {
      expect(parseTelemetryEvent({ name })).toEqual({ name });
    }
    expect(parseTelemetryEvent(COMPLETED)).toEqual(COMPLETED);
  });

  it("puts a by kind map and a set back in the lists' order", () => {
    const parsed = parseTelemetryEvent({
      ...COMPLETED,
      removed: { phone: "1", email: "2-5" },
      stripped: ["annotations", "document-info"],
    });
    expect(parsed).not.toBeNull();
    const completed = parsed as Extract<TelemetryEvent, { name: "redaction-completed" }>;
    expect(Object.keys(completed.removed)).toEqual(["email", "phone"]);
    expect(completed.stripped).toEqual(["document-info", "annotations"]);
  });

  it.each([
    ["not an object", "page-view"],
    ["null", null],
    ["an array", [{ name: "page-view", page: "home" }]],
    ["an unknown name", { name: "file-opened" }],
    ["a name that is not a string", { name: 1 }],
    ["an inherited name", { name: "toString" }],
    ["an extra key", { name: "page-view", page: "home", file: "x.pdf" }],
    ["a missing key", { name: "page-view" }],
    ["a free string", { name: "page-view", page: "/tool?file=passport.pdf" }],
    ["a value outside its list", { ...OPENED, tier: "gold" }],
    ["a raw number", { ...OPENED, pages: 3 }],
    ["a raw number in a map", { ...OPENED, found: { email: 3 } }],
    ["an object where a kind belongs", { name: "page-view", page: { kind: "home" } }],
    ["an unknown kind in a map", { ...OPENED, found: { surname: "1" } }],
    ["a zero in a map", { ...OPENED, found: { email: "0" } }],
    ["an array where a map belongs", { ...OPENED, found: ["email"] }],
    ["an unknown stripped kind", { ...COMPLETED, stripped: ["cookies"] }],
    [
      "a repeated stripped kind",
      { ...COMPLETED, stripped: ["annotations", "annotations"] },
    ],
    ["a map where the set belongs", { ...COMPLETED, stripped: { annotations: true } }],
    ["a prototype key", JSON.parse('{"name":"page-view","page":"home","__proto__":{}}')],
    [
      "a class instance",
      Object.assign(new (class Event {})(), { name: "plan-check-failed" }),
    ],
  ])("refuses %s", (_label, value) => {
    expect(parseTelemetryEvent(value)).toBeNull();
  });
});
