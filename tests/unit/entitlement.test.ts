import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tier a job runs under. Spec 0002, AC-9, and spec 0001's rule that failure
 * here is closed and never open.
 *
 * Every path out of this module that is not a clean answer from our own origin
 * has to produce the free tier. A network error, a shape we do not recognise, a
 * tier nobody has heard of, a fetch that never lands: all of them cap somebody
 * rather than uncapping them. Getting this backwards would hand the paid caps to
 * anybody with a flaky connection.
 */

const originalEnv = { ...process.env };

async function loadEntitlement(env: Record<string, string> = {}) {
  vi.resetModules();
  delete process.env.NEXT_PUBLIC_FREE_PAGE_CAP;
  delete process.env.NEXT_PUBLIC_MAX_FILE_BYTES;
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  return import("@/lib/entitlement");
}

/** One reply from our own endpoint, as `fetch` would deliver it. */
function reply(body: unknown, ok = true) {
  return vi.fn(() =>
    Promise.resolve({ ok, json: () => Promise.resolve(body) } as Response),
  );
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  process.env = { ...originalEnv };
});

describe("asking for the entitlement", () => {
  it("asks our own origin and nothing else", async () => {
    const fetcher = reply({ tier: "free", pageCap: 3, maxFileBytes: 100 });
    vi.stubGlobal("fetch", fetcher);
    const { getEntitlement } = await loadEntitlement();

    await getEntitlement();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/entitlement",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  /**
   * Warming happens on pointer enter, focus and drag over, which fire freely.
   * One request per page is the whole point of prefetching on them.
   */
  it("asks once however often it is prefetched", async () => {
    const fetcher = reply({ tier: "free", pageCap: 3, maxFileBytes: 100 });
    vi.stubGlobal("fetch", fetcher);
    const { getEntitlement, prefetchEntitlement } = await loadEntitlement();

    prefetchEntitlement();
    prefetchEntitlement();
    prefetchEntitlement();
    await getEntitlement();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns what the endpoint said when it makes sense", async () => {
    vi.stubGlobal("fetch", reply({ tier: "paid", pageCap: 500, maxFileBytes: 999 }));
    const { getEntitlement } = await loadEntitlement();

    await expect(getEntitlement()).resolves.toEqual({
      tier: "paid",
      pageCap: 500,
      maxFileBytes: 999,
    });
  });

  it("freezes what it hands back, so a job's terms cannot be edited", async () => {
    vi.stubGlobal("fetch", reply({ tier: "paid", pageCap: 500, maxFileBytes: 999 }));
    const { getEntitlement } = await loadEntitlement();

    expect(Object.isFrozen(await getEntitlement())).toBe(true);
  });

  /** The prefetch has landed, so nobody should be told they are waiting. */
  it("says nothing about waiting when the answer is already in", async () => {
    vi.stubGlobal("fetch", reply({ tier: "free", pageCap: 3, maxFileBytes: 100 }));
    const { getEntitlement, prefetchEntitlement } = await loadEntitlement();
    const onWaiting = vi.fn();

    prefetchEntitlement();
    await getEntitlement();
    await getEntitlement({ onWaiting });

    expect(onWaiting).not.toHaveBeenCalled();
  });
});

describe("failing closed", () => {
  const FREE = { tier: "free", pageCap: 3, maxFileBytes: 26_214_400 };

  it.each([
    ["the network fails", () => vi.fn(() => Promise.reject(new Error("offline")))],
    ["the endpoint answers with an error status", () => reply({ tier: "paid" }, false)],
    ["the body is not an object", () => reply("paid")],
    ["the body is null", () => reply(null)],
    [
      "the tier is one nobody has heard of",
      () => reply({ tier: "enterprise", pageCap: 500, maxFileBytes: 999 }),
    ],
    ["a cap is missing", () => reply({ tier: "paid" })],
    [
      "a cap is not a number",
      () => reply({ tier: "paid", pageCap: "lots", maxFileBytes: 999 }),
    ],
    ["a cap is zero", () => reply({ tier: "paid", pageCap: 0, maxFileBytes: 999 })],
    ["a cap is negative", () => reply({ tier: "paid", pageCap: -1, maxFileBytes: 999 })],
    ["a cap is a float", () => reply({ tier: "paid", pageCap: 2.5, maxFileBytes: 999 })],
  ])("falls back to the free tier when %s", async (_label, fetcher) => {
    vi.stubGlobal("fetch", fetcher());
    const { getEntitlement } = await loadEntitlement();

    await expect(getEntitlement()).resolves.toEqual(FREE);
  });

  /** The free caps come from the config module like every other cap. */
  it("takes the free caps from config, never a literal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const { getEntitlement } = await loadEntitlement({
      NEXT_PUBLIC_FREE_PAGE_CAP: "7",
      NEXT_PUBLIC_MAX_FILE_BYTES: "4242",
    });

    await expect(getEntitlement()).resolves.toEqual({
      tier: "free",
      pageCap: 7,
      maxFileBytes: 4242,
    });
  });
});

describe("a fetch that has not landed when a file is chosen", () => {
  it("says it is waiting, then falls back to free when the budget runs out", async () => {
    // A fetch that never settles, which is what a dead connection looks like.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => {})),
    );
    const { getEntitlement } = await loadEntitlement();
    const onWaiting = vi.fn();

    vi.useFakeTimers();
    const pending = getEntitlement({ onWaiting });

    // Let the microtask that decides whether anybody is waiting run first.
    await vi.advanceTimersByTimeAsync(0);
    expect(onWaiting).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4_000);

    await expect(pending).resolves.toMatchObject({ tier: "free" });
  });
});
