import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TELEMETRY_PATH } from "@/lib/routes";
import type { TelemetryEvent } from "@/telemetry/events";

/**
 * `report`, the browser's one way to send an event. Spec 0016, AC-4 to AC-6
 * and AC-28. `fetch` and `navigator` are the boundaries; `config` is read at
 * module load, so each case loads the module under the environment it needs,
 * and with it a fresh page load's memory of what it sent.
 */

const COUNT: TelemetryEvent = { name: "page-view", page: "tool" };
const FAILURE: TelemetryEvent = { name: "engine-unavailable" };

const originalEnv = { ...process.env };

async function loadReport(env: Record<string, string>) {
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_VERCEL_ENV;
  delete process.env.NEXT_PUBLIC_TELEMETRY_E2E;
  Object.assign(process.env, env);
  return (await import("@/telemetry/client")).report;
}

const fetchSpy = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));

beforeEach(() => {
  fetchSpy.mockClear();
  vi.stubGlobal("fetch", fetchSpy);
  vi.stubGlobal("navigator", {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("report", () => {
  it("sends one POST to our own route, with no cookie and nothing cached", async () => {
    const report = await loadReport({ NEXT_PUBLIC_TELEMETRY_E2E: "1" });
    expect(report(COUNT)).toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(TELEMETRY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(COUNT),
      keepalive: true,
      credentials: "omit",
      cache: "no-store",
    });
  });

  it("sends on a Vercel production build", async () => {
    const report = await loadReport({ NEXT_PUBLIC_VERCEL_ENV: "production" });
    report(COUNT);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it.each<Record<string, string>>([{}, { NEXT_PUBLIC_VERCEL_ENV: "preview" }])(
    "sends nothing at all on a build that does not report (%j)",
    async (env) => {
      const report = await loadReport(env);
      report(COUNT);
      report(FAILURE);
      expect(fetchSpy).not.toHaveBeenCalled();
    },
  );

  it.each([{ globalPrivacyControl: true }, { doNotTrack: "1" }])(
    "sends no count from a browser that opted out (%j), but still reports a failure",
    async (signals) => {
      vi.stubGlobal("navigator", signals);
      const report = await loadReport({ NEXT_PUBLIC_TELEMETRY_E2E: "1" });
      report(COUNT);
      report({ name: "subscription-confirmed" });
      expect(fetchSpy).not.toHaveBeenCalled();
      report(FAILURE);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it.each([{ globalPrivacyControl: false }, { doNotTrack: "0" }, { doNotTrack: null }])(
    "counts a browser whose signals are off (%j)",
    async (signals) => {
      vi.stubGlobal("navigator", signals);
      const report = await loadReport({ NEXT_PUBLIC_TELEMETRY_E2E: "1" });
      report(COUNT);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    },
  );

  it("never throws, whether fetch throws or rejects, and never tries again", async () => {
    const report = await loadReport({ NEXT_PUBLIC_TELEMETRY_E2E: "1" });
    fetchSpy.mockImplementationOnce(() => {
      throw new TypeError("no fetch here");
    });
    expect(() => report(COUNT)).not.toThrow();

    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    fetchSpy.mockImplementationOnce(() => Promise.reject(new TypeError("offline")));
    expect(() => report(COUNT)).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

/**
 * The flood, in the browser (AC-18, AC-19, AC-28). Each case hands `report`
 * a `Set` of its own, so what one case sent never mutes another.
 */
describe("report's once per page load cap", () => {
  const ON = { NEXT_PUBLIC_TELEMETRY_E2E: "1" };
  const sentBodies = () =>
    fetchSpy.mock.calls.map((call) => (call as unknown as [string, RequestInit])[1].body);

  it("sends one browser-crash 100 times as one request, and another shape as one more", async () => {
    const report = await loadReport(ON);
    const sent = new Set<string>();
    for (let time = 0; time < 100; time += 1) {
      report({ name: "browser-crash", page: "tool", kind: "error" }, sent);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    report({ name: "browser-crash", page: "home", kind: "error" }, sent);
    report({ name: "browser-crash", page: "tool", kind: "rejection" }, sent);
    report({ name: "browser-crash", page: "home", kind: "error" }, sent);
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it("sends engine-unavailable and the welcome page's still-waiting once each", async () => {
    const report = await loadReport(ON);
    const sent = new Set<string>();
    for (let time = 0; time < 5; time += 1) {
      report(FAILURE, sent);
      report(
        { name: "billing-failed", action: "welcome", outcome: "still-waiting" },
        sent,
      );
    }
    expect(sentBodies()).toEqual([
      JSON.stringify(FAILURE),
      JSON.stringify({
        name: "billing-failed",
        action: "welcome",
        outcome: "still-waiting",
      }),
    ]);
  });

  it("never caps a count: 100 page views make 100 requests, and none is remembered", async () => {
    const report = await loadReport(ON);
    const sent = new Set<string>();
    for (let time = 0; time < 100; time += 1) report(COUNT, sent);
    expect(fetchSpy).toHaveBeenCalledTimes(100);
    expect(sent.size).toBe(0);
  });

  it("remembers nothing a build that does not report stopped, so one that does still sends", async () => {
    const sent = new Set<string>();
    const off = await loadReport({});
    off(FAILURE, sent);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(sent.size).toBe(0);

    const on = await loadReport(ON);
    on(FAILURE, sent);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("remembers nothing when fetch is missing, so the next try still sends", async () => {
    const report = await loadReport(ON);
    const sent = new Set<string>();
    fetchSpy.mockImplementationOnce(() => {
      throw new TypeError("no fetch here");
    });
    report(FAILURE, sent);
    expect(sent.size).toBe(0);
    report(FAILURE, sent);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("holds a failure to once per page load with no Set handed in", async () => {
    const report = await loadReport(ON);
    report(FAILURE);
    report(FAILURE);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const nextLoad = await loadReport(ON);
    nextLoad(FAILURE);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
