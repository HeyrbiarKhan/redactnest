/**
 * Welcome, where Polar's checkout sends the buyer after paying. Spec 0012,
 * AC-16.
 *
 * `fetch`, the clock and the tab's visibility are the boundaries. Each case
 * reads what the buyer meets: "Confirming your payment" while it asks every
 * 2 s, Pro once the same answer the tool gets says paid, and after 15 asks
 * with no Pro, the still being confirmed line with Check again. A hidden tab
 * stops asking. Testing Library's async helpers never return under fake
 * timers, so time moves by `act` and the DOM is read with `getBy`.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WelcomePoll } from "@/app/(account)/account/welcome/welcome-poll";
import { SIGN_IN_PATH, TOOL_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({
  visibility: "visible" as DocumentVisibilityState,
  userId: "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa" as string | null,
  billingOn: true,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: mocks.userId }),
}));
vi.mock("@/config/billing", () => ({
  get billing() {
    return mocks.billingOn ? { publishableKey: "pk_test_x" } : null;
  },
}));

/** What `redirect` throws, so a case can see where the page sent the visitor. */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));

const POLL_MS = 2_000;
const ASKS_PER_ROUND = 15;

const PRO = { tier: "paid", pageCap: 50, maxFileBytes: 4242, account: "signed-in" };
const FREE = { tier: "free", pageCap: 3, maxFileBytes: 4242, account: "signed-in" };

const CONFIRMING = "Confirming your payment";
const ON_PRO = "You’re on Pro. Go back to the tab with your document, or open the tool.";
const STILL_WAITING =
  "Your payment is still being confirmed. This can take a few minutes.";

/** A response as `fetch` gives one, with only what the page reads. */
const reply = (body: unknown, ok = true) =>
  Promise.resolve({ ok, json: () => Promise.resolve(body) });

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<unknown>>();

/** Let the clock run, and every ask it starts settle. */
async function elapse(ms = 0): Promise<void> {
  await act(() => vi.advanceTimersByTimeAsync(ms));
}

/** Render, and let the first ask, made at once, settle. */
async function open(): Promise<ReturnType<typeof render>> {
  const view = render(<WelcomePoll />);
  await elapse();
  return view;
}

/** The tab hidden or shown, as the browser announces it. */
function setVisibility(state: DocumentVisibilityState): void {
  mocks.visibility = state;
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.visibility = "visible";
  mocks.userId = "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa";
  mocks.billingOn = true;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => mocks.visibility);
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => reply(FREE));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("confirming (AC-16)", () => {
  it("says Confirming your payment in a polite status region, and asks at once", async () => {
    await open();

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(CONFIRMING);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks the same /api/entitlement the tool asks, with its own cookies only", async () => {
    await open();

    expect(fetchMock).toHaveBeenCalledWith("/api/entitlement", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
  });

  it("asks again every 2 s, not sooner", async () => {
    await open();

    await elapse(POLL_MS - 1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await elapse(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each<[string, () => Promise<unknown>]>([
    ["free, signed in", () => reply(FREE)],
    ["unknown", () => reply({ ...FREE, account: "unknown" })],
    ["sign in needed", () => reply({ ...FREE, account: "sign-in-needed" })],
    ["paid without a confirmed sign in", () => reply({ ...PRO, account: "unknown" })],
    ["an answer it cannot read", () => reply({ tier: "gold" })],
    ["a failed status", () => reply(PRO, false)],
    ["a dropped connection", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("keeps asking through %s, which is not Pro", async (_name, answer) => {
    fetchMock.mockImplementation(answer);
    await open();

    await elapse(POLL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent(CONFIRMING);
  });
});

describe("Pro arrives (AC-16)", () => {
  it("says so and offers the tool as a real page load", async () => {
    fetchMock.mockImplementation(() => reply(PRO));
    await open();

    expect(screen.getByRole("status")).toHaveTextContent(ON_PRO);
    expect(screen.getByRole("link", { name: "Open the tool" })).toHaveAttribute(
      "href",
      TOOL_PATH,
    );
    expect(screen.queryByText(CONFIRMING)).not.toBeInTheDocument();
  });

  it("finds Pro on a later ask, then stops asking", async () => {
    fetchMock
      .mockImplementationOnce(() => reply(FREE))
      .mockImplementationOnce(() => reply({ ...FREE, account: "unknown" }))
      .mockImplementation(() => reply(PRO));
    await open();

    await elapse(2 * POLL_MS);
    expect(screen.getByRole("status")).toHaveTextContent(ON_PRO);

    await elapse(10 * POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("no Pro after a round (AC-16)", () => {
  it("asks 15 times, then says the payment is still being confirmed, and stops", async () => {
    await open();

    await elapse((ASKS_PER_ROUND - 2) * POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(ASKS_PER_ROUND - 1);
    expect(screen.getByRole("status")).toHaveTextContent(CONFIRMING);

    await elapse(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(ASKS_PER_ROUND);
    expect(screen.getByRole("status")).toHaveTextContent(STILL_WAITING);
    expect(screen.getByRole("button", { name: "Check again" })).toBeInTheDocument();

    await elapse(10 * POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(ASKS_PER_ROUND);
  });

  it("starts another 15 on Check again", async () => {
    await open();
    await elapse((ASKS_PER_ROUND - 1) * POLL_MS);

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await elapse();

    expect(fetchMock).toHaveBeenCalledTimes(ASKS_PER_ROUND + 1);
    expect(screen.getByRole("status")).toHaveTextContent(CONFIRMING);

    await elapse((ASKS_PER_ROUND - 1) * POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2 * ASKS_PER_ROUND);
    expect(screen.getByRole("status")).toHaveTextContent(STILL_WAITING);
  });

  it("can still find Pro in the round Check again starts", async () => {
    await open();
    await elapse((ASKS_PER_ROUND - 1) * POLL_MS);
    fetchMock.mockImplementation(() => reply(PRO));

    fireEvent.click(screen.getByRole("button", { name: "Check again" }));
    await elapse();

    expect(screen.getByRole("status")).toHaveTextContent(ON_PRO);
  });
});

describe("a hidden tab (AC-16)", () => {
  it("stops asking while hidden, and asks once as soon as it is seen again", async () => {
    await open();
    setVisibility("hidden");

    await elapse(10 * POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    setVisibility("visible");
    await elapse();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await elapse(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("starts no second chain of asks when shown while one is already waiting", async () => {
    await open();

    setVisibility("visible");
    await elapse();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await elapse(POLL_MS);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("leaving the page", () => {
  it("asks nothing more once it is gone", async () => {
    const { unmount } = await open();

    unmount();
    await elapse(10 * POLL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ignores an answer that lands after it is gone", async () => {
    let answer: (value: unknown) => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const { unmount } = render(<WelcomePoll />);

    unmount();
    answer({ ok: true, json: () => Promise.resolve(FREE) });
    await elapse(10 * POLL_MS);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("what it says, in every state (AC-16)", () => {
  /** Each state the buyer can meet, reached the way the buyer reaches it. */
  const STATES: ReadonlyArray<[string, () => Promise<void>]> = [
    ["confirming", () => open().then(() => undefined)],
    [
      "on Pro",
      async () => {
        fetchMock.mockImplementation(() => reply(PRO));
        await open();
      },
    ],
    [
      "still being confirmed",
      async () => {
        await open();
        await elapse((ASKS_PER_ROUND - 1) * POLL_MS);
      },
    ],
  ];

  it.each(STATES)("names no amount and no card while %s", async (_name, reach) => {
    await reach();

    expect(document.body).not.toHaveTextContent(/[$£€]|\d+\.\d{2}|card/i);
  });

  it.each(STATES)("passes axe while %s", async (_name, reach) => {
    await reach();
    // axe schedules its own work on timers, which the fake clock would hold.
    vi.useRealTimers();

    await expectNoAxeViolations(document.body);
  });
});

describe("the page around it", () => {
  async function openPage(): Promise<Redirected | ReactElement | null> {
    const { default: WelcomePage } = await import("@/app/(account)/account/welcome/page");
    try {
      return await WelcomePage();
    } catch (error) {
      if (error instanceof Redirected) return error;
      throw error;
    }
  }

  it("sends a signed out visitor to sign in", async () => {
    mocks.userId = null;

    expect(await openPage()).toEqual(new Redirected(SIGN_IN_PATH));
  });

  it("thanks a signed in buyer and starts confirming", async () => {
    const page = await openPage();
    render(page as ReactElement);
    await elapse();

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Thank you");
    expect(screen.getByRole("status")).toHaveTextContent(CONFIRMING);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders nothing with billing off, where the layout says accounts are not set up", async () => {
    mocks.billingOn = false;

    expect(await openPage()).toBeNull();
  });
});
