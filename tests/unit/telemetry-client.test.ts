import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TELEMETRY_PATH } from "@/lib/routes";
import type { TelemetryEvent } from "@/telemetry/events";

/**
 * `report`, the browser's one way to send an event. Spec 0016, AC-4 to AC-6.
 * `fetch` and `navigator` are the boundaries; `config` is read at module
 * load, so each case loads the module under the environment it needs.
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
