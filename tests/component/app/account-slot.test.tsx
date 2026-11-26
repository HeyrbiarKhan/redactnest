/**
 * The header's account slot and its menu. Spec 0026, child 0001, AC-19 to
 * AC-25.
 *
 * The real store (`@/lib/entitlement`) with `fetch` stubbed, and Clerk's
 * `__client_uat` cookie written into jsdom's `document.cookie`, so the slot
 * reads the cookie and asks exactly as it does in a browser. Each test loads
 * the modules afresh, because the store keeps one answer per page.
 *
 * The browser suite holds what jsdom cannot: the request count on a real
 * page, the layout shift, the small screen menu, and the pointer.
 */

import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ACCOUNT_PATH,
  BILLING_PATH,
  ENTITLEMENT_PATH,
  PRICING_PATH,
  SIGN_IN_PATH,
  SIGN_OUT_PATH,
  TOOL_PATH,
} from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return { ...actual, config: { ...actual.config, billingEnabled: true } };
});

vi.mock("next/link", () => ({
  default: () => {
    throw new Error("next/link prefetches. The header's links must be plain.");
  },
}));

const SIGNED_IN = "__client_uat=1791033000";
const ADDRESS = "ada@example.com";
const FREE = { tier: "free", pageCap: 3, maxFileBytes: 26_214_400 };
const PAID = { tier: "paid", pageCap: 50, maxFileBytes: 26_214_400 };

function setCookie(cookie: string) {
  document.cookie = cookie;
}

function clearCookies() {
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  }
}

/** A fetch whose one reply the test hands out when it chooses. */
function heldFetch() {
  let settle: ((response: Response) => void) | undefined;
  let fail: ((reason: Error) => void) | undefined;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve, reject) => {
        settle = resolve;
        fail = reject;
      }),
  );
  return {
    fetcher,
    answer: async (body: unknown, ok = true) => {
      await act(async () => {
        settle?.({ ok, json: () => Promise.resolve(body) } as Response);
      });
    },
    fail: async () => {
      await act(async () => {
        fail?.(new Error("offline"));
      });
    },
  };
}

/** The header, its store and its slot, fresh for each test. */
async function loadHeader() {
  vi.resetModules();
  const [{ PageHeader }, store] = await Promise.all([
    import("@/app/site-nav"),
    import("@/lib/entitlement"),
  ]);
  return { PageHeader, store };
}

/** Radix opens on `pointerdown`, which jsdom does not deliver, so the keyboard. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = await screen.findByRole("button", { name: "Your account" });
  trigger.focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menu");
}

/**
 * The menu's file loads with `import()` the first time a sign in is
 * confirmed. Its first transform (Radix with it) can take longer than a
 * `findBy` waits when the whole suite runs at once, so it is loaded once
 * here; each test still loads its own fresh copy of the modules.
 */
beforeAll(async () => {
  await import("@/app/account-menu");
}, 30_000);

beforeEach(() => {
  clearCookies();
});

afterEach(() => {
  clearCookies();
  vi.unstubAllGlobals();
});

describe("signed out (AC-19)", () => {
  it("shows Sign in and Try it free at once, and asks nothing", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { PageHeader } = await loadHeader();

    render(<PageHeader />);
    const banner = screen.getByRole("banner");

    expect(within(banner).getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      SIGN_IN_PATH,
    );
    expect(within(banner).getByRole("link", { name: "Try it free" })).toHaveAttribute(
      "href",
      TOOL_PATH,
    );
    expect(screen.queryByRole("button", { name: "Your account" })).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reads 0 as signed out, as Clerk writes it after sign out", async () => {
    setCookie("__client_uat=0");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { PageHeader } = await loadHeader();

    render(<PageHeader />);

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("writes no cookie of its own", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { PageHeader } = await loadHeader();
    const before = document.cookie;

    render(<PageHeader />);

    expect(document.cookie).toBe(before);
  });
});

describe("signed in (AC-19, AC-20, AC-22, AC-24)", () => {
  it("asks our own server once, shows the waiting circle, then the avatar", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader } = await loadHeader();

    render(<PageHeader />);

    const pending = screen.getByTestId("account-pending");
    expect(pending.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(pending).toHaveTextContent("");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(held.fetcher).toHaveBeenCalledTimes(1);
    expect(held.fetcher).toHaveBeenCalledWith(
      ENTITLEMENT_PATH,
      expect.objectContaining({ credentials: "same-origin" }),
    );

    await held.answer({ ...FREE, account: "signed-in", email: ADDRESS });

    const trigger = await screen.findByRole("button", { name: "Your account" });
    expect(trigger).toHaveTextContent("A");
    expect(within(trigger).getByText("A").closest("[aria-hidden]")).not.toBeNull();
    expect(screen.queryByTestId("account-pending")).toBeNull();
    expect(held.fetcher).toHaveBeenCalledTimes(1);
  });

  it("puts Open the tool in Try it free's place, and drops Sign in (AC-24)", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader } = await loadHeader();
    render(<PageHeader />);

    await held.answer({ ...FREE, account: "signed-in", email: ADDRESS });
    await screen.findByRole("button", { name: "Your account" });

    const open = screen.getByRole("link", { name: "Open the tool" });
    expect(open.tagName).toBe("A");
    expect(open).toHaveAttribute("href", TOOL_PATH);
    expect(screen.queryByRole("link", { name: "Try it free" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("shows the avatar for an unknown answer from our server, a genuine sign in", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader } = await loadHeader();
    render(<PageHeader />);

    await held.answer({ ...FREE, account: "unknown", email: ADDRESS });

    expect(await screen.findByRole("button", { name: "Your account" })).toBeVisible();
  });

  it("shows the person icon when the answer holds no address", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader } = await loadHeader();
    render(<PageHeader />);

    await held.answer({ ...FREE, account: "signed-in", email: null });

    const trigger = await screen.findByRole("button", { name: "Your account" });
    expect(trigger.querySelector("svg")).not.toBeNull();
    expect(trigger).toHaveTextContent("");
  });

  it.each([
    ["é", "émile@example.com", "É"],
    ["a joined emoji", "👩🏽‍💻x@example.com", "👩🏽‍💻"],
  ])(
    "takes the address's first grapheme, uppercased: %s",
    async (_label, email, letter) => {
      setCookie(SIGNED_IN);
      const held = heldFetch();
      vi.stubGlobal("fetch", held.fetcher);
      const { PageHeader } = await loadHeader();
      render(<PageHeader />);

      await held.answer({ ...FREE, account: "signed-in", email });

      expect(
        await screen.findByRole("button", { name: "Your account" }),
      ).toHaveTextContent(letter);
    },
  );
});

describe("answers that confirm nobody (AC-20)", () => {
  it.each([
    ["sign-in-needed", { ...FREE, account: "sign-in-needed", email: null }],
    ["none, for a forged cookie", { ...FREE, account: "none", email: null }],
    ["an unreadable answer", { tier: "paid", email: ADDRESS }],
  ])("shows the signed out shape for %s", async (_label, body) => {
    setCookie("__client_uat=9999999999");
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader } = await loadHeader();
    render(<PageHeader />);

    await held.answer(body);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Try it free" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Your account" })).toBeNull();
    expect(held.fetcher).toHaveBeenCalledTimes(1);
  });

  it("shows the signed out shape when the request fails", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader } = await loadHeader();
    render(<PageHeader />);

    await held.fail();

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("shows the signed out shape for an error status", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader } = await loadHeader();
    render(<PageHeader />);

    await held.answer({ ...FREE, account: "signed-in", email: ADDRESS }, false);

    expect(await screen.findByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("never shows the avatar on the store's own fallback, when the budget runs out", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      setCookie(SIGNED_IN);
      const held = heldFetch();
      vi.stubGlobal("fetch", held.fetcher);
      const { PageHeader } = await loadHeader();
      render(<PageHeader />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4_000);
      });

      expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Your account" })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("on /tool (AC-19, AC-22, AC-30)", () => {
  it("asks nothing itself, and shows the answer the tool's own ask brings", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader, store } = await loadHeader();

    render(<PageHeader current="tool" />);

    expect(screen.getByTestId("account-pending")).toBeInTheDocument();
    expect(held.fetcher).not.toHaveBeenCalled();

    // What `tool-client` does as the page loads.
    act(() => store.askAtLoad());
    expect(held.fetcher).toHaveBeenCalledTimes(1);
    await held.answer({ ...PAID, account: "signed-in", email: ADDRESS });

    expect(await screen.findByRole("button", { name: "Your account" })).toBeVisible();
    expect(held.fetcher).toHaveBeenCalledTimes(1);
  });

  it("shows the Pro chip before the avatar for a Pro answer, and no button", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader, store } = await loadHeader();
    render(<PageHeader current="tool" />);
    act(() => store.askAtLoad());
    await held.answer({ ...PAID, account: "signed-in", email: ADDRESS });

    const trigger = await screen.findByRole("button", { name: "Your account" });
    const chip = screen.getByTestId("pro-chip");
    expect(chip).toHaveTextContent("Pro");
    expect(chip.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.queryByRole("link", { name: "Open the tool" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Try it free" })).toBeNull();
  });

  it("shows no chip on Free", async () => {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader, store } = await loadHeader();
    render(<PageHeader current="tool" />);
    act(() => store.askAtLoad());
    await held.answer({ ...FREE, account: "signed-in", email: ADDRESS });

    await screen.findByRole("button", { name: "Your account" });
    expect(screen.queryByTestId("pro-chip")).toBeNull();
  });

  it("shows Sign in alone, signed out, and no Try it free", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { PageHeader } = await loadHeader();
    render(<PageHeader current="tool" />);

    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Try it free" })).toBeNull();
  });
});

describe("the menu (AC-23)", () => {
  async function signedInMenu(body: Record<string, unknown>, current?: "tool") {
    setCookie(SIGNED_IN);
    const held = heldFetch();
    vi.stubGlobal("fetch", held.fetcher);
    const { PageHeader, store } = await loadHeader();
    const view = render(<PageHeader current={current} />);
    if (current === "tool") act(() => store.askAtLoad());
    await held.answer(body);
    const user = userEvent.setup();
    const menu = await openMenu(user);
    return { menu, user, view };
  }

  function itemsOf(menu: HTMLElement) {
    return within(menu)
      .getAllByRole("menuitem")
      .map((item) => [item.textContent, item.getAttribute("href")]);
  }

  it("holds who and which plan, then Account, Upgrade, Redact a PDF and Sign out on Free", async () => {
    const { menu } = await signedInMenu({
      ...FREE,
      account: "signed-in",
      email: ADDRESS,
    });

    expect(within(menu).getByTestId("menu-email")).toHaveTextContent(ADDRESS);
    expect(within(menu).getByTestId("menu-plan")).toHaveTextContent(
      "Free · 3 pages a document",
    );
    expect(itemsOf(menu)).toEqual([
      ["Account", ACCOUNT_PATH],
      ["Upgrade to Pro", PRICING_PATH],
      ["Redact a PDF", TOOL_PATH],
      ["Sign out", SIGN_OUT_PATH],
    ]);
    for (const item of within(menu).getAllByRole("menuitem")) {
      expect(item.tagName).toBe("A");
      expect(item).not.toHaveAttribute("target");
    }
  });

  it("offers Billing in Upgrade's place on Pro, with Pro's plan line", async () => {
    const { menu } = await signedInMenu({
      ...PAID,
      account: "signed-in",
      email: ADDRESS,
    });

    expect(within(menu).getByTestId("menu-plan")).toHaveTextContent(
      "Pro · 50 pages a document",
    );
    expect(itemsOf(menu)[1]).toEqual(["Billing", BILLING_PATH]);
  });

  it("says the plan is unknown for an unknown answer", async () => {
    const { menu } = await signedInMenu({ ...FREE, account: "unknown", email: ADDRESS });

    expect(within(menu).getByTestId("menu-plan")).toHaveTextContent(
      "Plan unknown right now",
    );
    expect(itemsOf(menu)[1]).toEqual(["Upgrade to Pro", PRICING_PATH]);
  });

  it("opens the account items in a new tab on /tool, and leaves out Redact a PDF", async () => {
    const { menu } = await signedInMenu(
      { ...PAID, account: "signed-in", email: ADDRESS },
      "tool",
    );

    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      ACCOUNT_PATH,
      BILLING_PATH,
      SIGN_OUT_PATH,
    ]);
    for (const item of items.slice(0, 2)) {
      expect(item).toHaveAttribute("target", "_blank");
      expect(item).toHaveTextContent("(opens in a new tab)");
    }
    // Sign out stays in the tab, where the leave warning guards ticked work.
    expect(items[2]).not.toHaveAttribute("target");
  });

  it("leaves the rest of the page announced while open (modal off)", async () => {
    const { view } = await signedInMenu({
      ...FREE,
      account: "signed-in",
      email: ADDRESS,
    });

    expect(view.container.closest("[aria-hidden='true']")).toBeNull();
    expect(screen.getByRole("banner")).not.toHaveAttribute("aria-hidden");
  });

  it("shuts on Escape and gives focus back to the avatar", async () => {
    const { user } = await signedInMenu({
      ...FREE,
      account: "signed-in",
      email: ADDRESS,
    });

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Your account" })).toHaveFocus();
  });

  it("passes axe while open", async () => {
    const { view } = await signedInMenu({
      ...FREE,
      account: "signed-in",
      email: ADDRESS,
    });

    await expectNoAxeViolations(view.baseElement);
  });
});

describe("before the page knows (AC-25)", () => {
  it("renders hidden on the server, with Sign in and Try it free for no scripts", async () => {
    const { PageHeader } = await loadHeader();

    const html = renderToString(<PageHeader />);

    expect(html).toContain('data-view="hidden"');
    expect(html).toMatch(/<noscript>[^]*Sign in[^]*Try it free[^]*<\/noscript>/);
    expect(html).not.toContain("Your account");
  });

  it("holds the slot's width from sm, so filling it moves nothing", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const { PageHeader } = await loadHeader();
    render(<PageHeader />);

    expect(screen.getByTestId("account-slot")).toHaveClass("sm:min-w-account-slot");
  });
});
