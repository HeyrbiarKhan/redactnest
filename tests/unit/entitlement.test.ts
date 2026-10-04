import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The tier a job runs under, and the page's answer the plan line shows. Spec
 * 0002, AC-9, spec 0001's rule that failure here is closed and never open, and
 * spec 0012, AC-3 and AC-4.
 *
 * Every path out of this module that is not a clean answer from our own origin
 * has to produce the free tier. A network error, a shape we do not recognise, a
 * tier nobody has heard of, a fetch that never lands: all of them cap somebody
 * rather than uncapping them, and say why (`unknown`). Getting this backwards
 * would hand the paid caps to anybody with a flaky connection. The one bounded
 * exception, a recent Pro answer kept through a failed refresh for age, is
 * pinned below on a fake clock.
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

/**
 * A fetch whose replies the test hands out in order, so it decides when each
 * ask lands relative to the clock.
 */
function heldFetch() {
  const waiting: ((outcome: Promise<Response>) => void)[] = [];
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        waiting.push((outcome) => resolve(outcome));
      }),
  );
  const next = () => {
    const settle = waiting.shift();
    if (settle === undefined) throw new Error("no request is waiting");
    return settle;
  };
  return {
    fetcher,
    answer(body: unknown) {
      next()(
        Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response),
      );
    },
    fail() {
      next()(Promise.reject(new Error("offline")));
    },
  };
}

// The free caps are config's defaults (3 pages, 25 MB).
const FREE_UNKNOWN = {
  tier: "free",
  pageCap: 3,
  maxFileBytes: 26_214_400,
  account: "unknown",
};
const PAID = { tier: "paid", pageCap: 50, maxFileBytes: 999, account: "signed-in" };
const FREE_SIGNED_IN = {
  tier: "free",
  pageCap: 3,
  maxFileBytes: 999,
  account: "signed-in",
};
const SIGN_IN_NEEDED = {
  tier: "free",
  pageCap: 3,
  maxFileBytes: 999,
  account: "sign-in-needed",
};
/** Rule 7 on the server: Polar could not say. */
const SERVER_UNKNOWN = {
  tier: "free",
  pageCap: 3,
  maxFileBytes: 999,
  account: "unknown",
};

const MINUTE = 60_000;

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
    const fetcher = reply({
      tier: "free",
      pageCap: 3,
      maxFileBytes: 100,
      account: "none",
    });
    vi.stubGlobal("fetch", fetcher);
    const { getEntitlement } = await loadEntitlement();

    await getEntitlement();

    expect(fetcher).toHaveBeenCalledWith(
      "/api/entitlement",
      expect.objectContaining({ credentials: "same-origin" }),
    );
  });

  /** React runs a mount effect twice in development; the page still asks once. */
  it("asks once at load however often the load ask is made", async () => {
    const fetcher = reply(FREE_SIGNED_IN);
    vi.stubGlobal("fetch", fetcher);
    const { askAtLoad, getEntitlement } = await loadEntitlement();

    askAtLoad();
    askAtLoad();
    await getEntitlement();
    askAtLoad();

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns what the endpoint said when it makes sense", async () => {
    vi.stubGlobal("fetch", reply(PAID));
    const { getEntitlement } = await loadEntitlement();

    await expect(getEntitlement()).resolves.toEqual(PAID);
  });

  it("freezes what it hands back, so a job's terms cannot be edited", async () => {
    vi.stubGlobal("fetch", reply(PAID));
    const { getEntitlement } = await loadEntitlement();

    expect(Object.isFrozen(await getEntitlement())).toBe(true);
  });

  /** The load ask has landed, so nobody should be told they are waiting. */
  it("says nothing about waiting when the answer is already in", async () => {
    vi.stubGlobal("fetch", reply(FREE_SIGNED_IN));
    const { askAtLoad, getEntitlement } = await loadEntitlement();
    const onWaiting = vi.fn();

    askAtLoad();
    await getEntitlement();
    await getEntitlement({ onWaiting });

    expect(onWaiting).not.toHaveBeenCalled();
  });
});

describe("failing closed", () => {
  it.each([
    ["the network fails", () => vi.fn(() => Promise.reject(new Error("offline")))],
    ["the endpoint answers with an error status", () => reply(PAID, false)],
    ["the body is not an object", () => reply("paid")],
    ["the body is null", () => reply(null)],
    ["the tier is one nobody has heard of", () => reply({ ...PAID, tier: "enterprise" })],
    ["a cap is missing", () => reply({ tier: "paid", account: "signed-in" })],
    ["a cap is not a number", () => reply({ ...PAID, pageCap: "lots" })],
    ["a cap is zero", () => reply({ ...PAID, pageCap: 0 })],
    ["a cap is negative", () => reply({ ...PAID, pageCap: -1 })],
    ["a cap is a float", () => reply({ ...PAID, pageCap: 2.5 })],
    // Spec 0012, AC-3: the account is a closed set, and only a confirmed sign
    // in may be paid, so a drifted deploy caps rather than uncaps.
    [
      "the account is missing",
      () => reply({ tier: "free", pageCap: 3, maxFileBytes: 999 }),
    ],
    [
      "the account is one nobody has heard of",
      () => reply({ ...FREE_SIGNED_IN, account: "guest" }),
    ],
    [
      "paid comes with an account that is not signed in",
      () => reply({ ...PAID, account: "none" }),
    ],
    [
      "paid comes with the plan check unknown",
      () => reply({ ...PAID, account: "unknown" }),
    ],
  ])("falls back to the free tier, unknown, when %s", async (_label, fetcher) => {
    vi.stubGlobal("fetch", fetcher());
    const { getEntitlement, readEntitlement } = await loadEntitlement();

    await expect(getEntitlement()).resolves.toEqual(FREE_UNKNOWN);
    expect(readEntitlement()).toEqual(FREE_UNKNOWN);
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
      account: "unknown",
    });
  });
});

describe("the page's answer (spec 0012, AC-5 reads it)", () => {
  it("has none until the first ask lands, then holds it", async () => {
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { askAtLoad, readEntitlement } = await loadEntitlement();

    expect(readEntitlement()).toBeNull();
    askAtLoad();
    expect(readEntitlement()).toBeNull();

    held.answer(PAID);
    await vi.waitFor(() => expect(readEntitlement()).toEqual(PAID));
  });

  it("tells its subscribers when it changes, and only then", async () => {
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { askAtLoad, askAgain, getEntitlement, subscribeEntitlement } =
      await loadEntitlement();
    const listener = vi.fn();
    const unsubscribe = subscribeEntitlement(listener);

    askAtLoad();
    held.answer(FREE_SIGNED_IN);
    await getEntitlement();
    expect(listener).toHaveBeenCalledTimes(1);

    // The same answer again changes nothing anybody sees.
    askAgain();
    const same = getEntitlement();
    held.answer({ ...FREE_SIGNED_IN });
    await same;
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    askAgain();
    const changed = getEntitlement();
    held.answer(PAID);
    await changed;
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("one ask at a time (spec 0012, AC-4)", () => {
  it("lets every trigger during an ask join it", async () => {
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { askAtLoad, askAgain, askWhenVisible, getEntitlement } =
      await loadEntitlement();

    askAtLoad();
    askWhenVisible();
    askAgain();
    const open = getEntitlement();
    const button = getEntitlement({ fresh: true });
    held.answer(PAID);

    await expect(open).resolves.toEqual(PAID);
    await expect(button).resolves.toEqual(PAID);
    expect(held.fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("the budget on every ask (spec 0012, AC-4)", () => {
  it("makes the page's answer free, unknown, at 4 s, and lets a late answer replace it", async () => {
    vi.useFakeTimers();
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { askAtLoad, readEntitlement } = await loadEntitlement();

    askAtLoad();
    await vi.advanceTimersByTimeAsync(3_999);
    expect(readEntitlement()).toBeNull();
    await vi.advanceTimersByTimeAsync(1);
    expect(readEntitlement()).toEqual(FREE_UNKNOWN);

    held.answer(PAID);
    await vi.advanceTimersByTimeAsync(0);
    expect(readEntitlement()).toEqual(PAID);
  });

  /** Spec 0002, INV-5: a job runs to the end on the snapshot it opened with. */
  it("never changes a job's frozen snapshot with a late answer", async () => {
    vi.useFakeTimers();
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { getEntitlement, readEntitlement } = await loadEntitlement();
    const onWaiting = vi.fn();

    const job = getEntitlement({ onWaiting });
    await vi.advanceTimersByTimeAsync(0);
    expect(onWaiting).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(4_000);
    const frozen = await job;
    expect(frozen).toEqual(FREE_UNKNOWN);

    held.answer(PAID);
    await vi.advanceTimersByTimeAsync(0);
    expect(readEntitlement()).toEqual(PAID);
    expect(frozen).toEqual(FREE_UNKNOWN);
    expect(Object.isFrozen(frozen)).toBe(true);
  });

  /**
   * The ask past its budget is still out, so a trigger joins it rather than
   * stacking a second request behind a slow server, and waits for nothing:
   * the page's answer already says what applies until it lands.
   */
  it("lets a trigger after the budget join the ask still out, with no wait", async () => {
    vi.useFakeTimers();
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { askAtLoad, getEntitlement } = await loadEntitlement();
    const onWaiting = vi.fn();

    askAtLoad();
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(getEntitlement({ fresh: true, onWaiting })).resolves.toEqual(
      FREE_UNKNOWN,
    );
    expect(onWaiting).not.toHaveBeenCalled();
    expect(held.fetcher).toHaveBeenCalledTimes(1);

    // Once it lands, the next trigger asks afresh.
    held.answer(FREE_SIGNED_IN);
    await vi.advanceTimersByTimeAsync(0);
    const fresh = getEntitlement({ fresh: true });
    held.answer(PAID);
    await expect(fresh).resolves.toEqual(PAID);
    expect(held.fetcher).toHaveBeenCalledTimes(2);
  });
});

describe("asking again (spec 0012, AC-4)", () => {
  /** Load, answer, and leave the clock at the moment of the answer. */
  async function answered(first: unknown) {
    vi.useFakeTimers();
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const entitlement = await loadEntitlement();
    entitlement.askAtLoad();
    held.answer(first);
    await vi.advanceTimersByTimeAsync(0);
    expect(entitlement.readEntitlement()).toEqual(first);
    return { ...entitlement, held };
  }

  it("asks when the tab comes back and the answer is not Pro", async () => {
    const { askWhenVisible, getEntitlement, held } = await answered(FREE_SIGNED_IN);

    askWhenVisible();
    expect(held.fetcher).toHaveBeenCalledTimes(2);

    // An upgrade made in another tab: the next open runs on it.
    held.answer(PAID);
    await expect(getEntitlement()).resolves.toEqual(PAID);
  });

  it.each([
    ["anonymous", { tier: "free", pageCap: 3, maxFileBytes: 999, account: "none" }],
    ["unknown", SERVER_UNKNOWN],
    ["sign in needed", SIGN_IN_NEEDED],
  ])("asks when the tab comes back to a page that is %s", async (_label, first) => {
    const { askWhenVisible, held } = await answered(first);

    askWhenVisible();
    expect(held.fetcher).toHaveBeenCalledTimes(2);
  });

  it("never asks a Pro page again when the tab comes back", async () => {
    const { askWhenVisible, held } = await answered(PAID);

    await vi.advanceTimersByTimeAsync(60 * MINUTE);
    askWhenVisible();
    expect(held.fetcher).toHaveBeenCalledTimes(1);
  });

  it("opens on the answer it has for 5 minutes", async () => {
    const { getEntitlement, held } = await answered(FREE_SIGNED_IN);
    const onWaiting = vi.fn();

    await vi.advanceTimersByTimeAsync(5 * MINUTE);
    await expect(getEntitlement({ onWaiting })).resolves.toEqual(FREE_SIGNED_IN);
    expect(onWaiting).not.toHaveBeenCalled();
    expect(held.fetcher).toHaveBeenCalledTimes(1);
  });

  /** So a cancel or a lapse shows within one open after Polar revokes the benefit. */
  it("asks again at an open once the answer is more than 5 minutes old", async () => {
    const { getEntitlement, held } = await answered(PAID);

    await vi.advanceTimersByTimeAsync(5 * MINUTE + 1);
    const open = getEntitlement();
    expect(held.fetcher).toHaveBeenCalledTimes(2);
    held.answer(FREE_SIGNED_IN);

    await expect(open).resolves.toEqual(FREE_SIGNED_IN);
  });

  it("measures the age from the latest answer", async () => {
    const { askWhenVisible, getEntitlement, held } = await answered(FREE_SIGNED_IN);

    await vi.advanceTimersByTimeAsync(4 * MINUTE);
    askWhenVisible();
    held.answer(FREE_SIGNED_IN);
    await vi.advanceTimersByTimeAsync(0);

    await vi.advanceTimersByTimeAsync(4 * MINUTE);
    await getEntitlement();
    expect(held.fetcher).toHaveBeenCalledTimes(2);
  });

  it("asks fresh for the button whatever the answer's age", async () => {
    const { getEntitlement, held } = await answered(FREE_SIGNED_IN);

    const open = getEntitlement({ fresh: true });
    expect(held.fetcher).toHaveBeenCalledTimes(2);
    held.answer(PAID);

    await expect(open).resolves.toEqual(PAID);
  });

  it("asks fresh for Try again whatever the answer's age", async () => {
    const { askAgain, readEntitlement, held } = await answered(SERVER_UNKNOWN);

    askAgain();
    expect(held.fetcher).toHaveBeenCalledTimes(2);
    held.answer(PAID);

    await vi.advanceTimersByTimeAsync(0);
    expect(readEntitlement()).toEqual(PAID);
  });
});

describe("keeping a recent Pro answer (spec 0012, AC-4)", () => {
  async function paidThen(minutes: number) {
    vi.useFakeTimers();
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const entitlement = await loadEntitlement();
    entitlement.askAtLoad();
    held.answer(PAID);
    await vi.advanceTimersByTimeAsync(minutes * MINUTE);
    return { ...entitlement, held };
  }

  it.each([
    [
      "Polar could not say",
      (held: ReturnType<typeof heldFetch>) => held.answer(SERVER_UNKNOWN),
    ],
    ["the request fails", (held: ReturnType<typeof heldFetch>) => held.fail()],
    [
      "the answer cannot be read",
      (held: ReturnType<typeof heldFetch>) => held.answer({ tier: "paid" }),
    ],
  ])(
    "keeps Pro when a refresh for age fails because %s, within 30 minutes",
    async (_label, failRefresh) => {
      const { getEntitlement, readEntitlement, held } = await paidThen(10);

      const open = getEntitlement();
      failRefresh(held);

      await expect(open).resolves.toEqual(PAID);
      expect(readEntitlement()).toEqual(PAID);
    },
  );

  it("keeps Pro when a refresh for age runs out of budget, within 30 minutes", async () => {
    const { getEntitlement, readEntitlement } = await paidThen(10);

    const open = getEntitlement();
    await vi.advanceTimersByTimeAsync(4_000);

    await expect(open).resolves.toEqual(PAID);
    expect(readEntitlement()).toEqual(PAID);
  });

  it("keeps Pro at exactly 30 minutes, and not a moment after", async () => {
    const atLimit = await paidThen(30);
    const kept = atLimit.getEntitlement();
    atLimit.held.answer(SERVER_UNKNOWN);
    await expect(kept).resolves.toEqual(PAID);

    const pastLimit = await paidThen(30);
    await vi.advanceTimersByTimeAsync(1);
    const lost = pastLimit.getEntitlement();
    pastLimit.held.answer(SERVER_UNKNOWN);
    await expect(lost).resolves.toEqual(SERVER_UNKNOWN);
    expect(pastLimit.readEntitlement()).toEqual(SERVER_UNKNOWN);
  });

  /** Kept is not confirmed: the next open asks again, and the 30 minutes do not restart. */
  it("asks again at the next open, with the 30 minutes still running from the last Pro", async () => {
    const { getEntitlement, held } = await paidThen(20);

    const first = getEntitlement();
    held.answer(SERVER_UNKNOWN);
    await expect(first).resolves.toEqual(PAID);

    // Straight after: the kept answer is still old, so this open asks too.
    const second = getEntitlement();
    expect(held.fetcher).toHaveBeenCalledTimes(3);
    held.answer(SERVER_UNKNOWN);
    await expect(second).resolves.toEqual(PAID);

    // 31 minutes after the server last said Pro, a failure is a failure.
    await vi.advanceTimersByTimeAsync(11 * MINUTE);
    const third = getEntitlement();
    held.answer(SERVER_UNKNOWN);
    await expect(third).resolves.toEqual(SERVER_UNKNOWN);
  });

  it("restarts the 30 minutes at each Pro the server confirms", async () => {
    const { getEntitlement, held } = await paidThen(20);

    const confirmed = getEntitlement();
    held.answer(PAID);
    await confirmed;

    await vi.advanceTimersByTimeAsync(20 * MINUTE);
    const kept = getEntitlement();
    held.answer(SERVER_UNKNOWN);
    await expect(kept).resolves.toEqual(PAID);
  });

  /** Only a failure is bridged: a real answer that is not Pro always wins. */
  it.each([
    ["free, signed in (a cancel or a lapse)", FREE_SIGNED_IN],
    ["sign in needed", SIGN_IN_NEEDED],
  ])("lets a refresh for age answering %s replace Pro", async (_label, next) => {
    const { getEntitlement, readEntitlement, held } = await paidThen(10);

    const open = getEntitlement();
    held.answer(next);

    await expect(open).resolves.toEqual(next);
    expect(readEntitlement()).toEqual(next);
  });

  it("gives free, unknown, when a fresh ask fails, however recent the Pro", async () => {
    const { getEntitlement, readEntitlement, held } = await paidThen(1);

    const open = getEntitlement({ fresh: true });
    held.answer(SERVER_UNKNOWN);

    await expect(open).resolves.toEqual(SERVER_UNKNOWN);
    expect(readEntitlement()).toEqual(SERVER_UNKNOWN);
  });
});
