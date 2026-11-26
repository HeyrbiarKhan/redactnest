import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";

/**
 * The signed in header (spec 0026, child 0001, AC-19 to AC-30), in a real
 * browser: what a page asks, what the header shows, and that nothing moves.
 *
 * A browser that signed in carries Clerk's `__client_uat` cookie with the
 * time in seconds. The test writes one into the context and answers
 * `/api/entitlement` itself, so no Clerk instance is needed; the sandbox walk
 * (AC-29) does the same against Clerk's development instance.
 */

const TEXT_PAGE = resolve("tests/fixtures/text-page.pdf");
const PHONE = "020 7946 0958";
const ADDRESS = "ada@example.com";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const FREE = { tier: "free", pageCap: 3, maxFileBytes: 26_214_400 };
const PAID = { tier: "paid", pageCap: 50, maxFileBytes: 26_214_400 };

type Answer = Record<string, unknown>;

/** Clerk's sign in time cookie, as a browser that signed in holds it. */
async function signInCookie(page: Page, value = "1791033000"): Promise<void> {
  await page
    .context()
    .addCookies([{ name: "__client_uat", value, domain: "localhost", path: "/" }]);
}

/** Answers the plan check, and counts every ask. */
async function answerPlan(page: Page, answer: Answer): Promise<Request[]> {
  const asks: Request[] = [];
  await page.route("**/api/entitlement", async (route) => {
    asks.push(route.request());
    await route.fulfill({ json: answer });
  });
  return asks;
}

/** Every request a page makes to the plan check, stubbed or not. */
function planRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/entitlement") seen.push(request.url());
  });
  return seen;
}

/**
 * The layout shifts whose moved nodes sit in the header, read from the
 * browser's own `layout-shift` entries, buffered from the page's start.
 */
async function headerShift(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let total = 0;
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries() as unknown as {
            value: number;
            hadRecentInput: boolean;
            sources?: { node?: Node | null }[];
          }[]) {
            if (entry.hadRecentInput) continue;
            const inHeader = (entry.sources ?? []).some(
              ({ node }) =>
                node instanceof Node &&
                (node instanceof Element ? node : node.parentElement)?.closest(
                  "header",
                ) !== null,
            );
            if (inHeader) total += entry.value;
          }
        }).observe({ type: "layout-shift", buffered: true });
        setTimeout(() => resolve(total), 500);
      }),
  );
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(violations).toEqual([]);
}

/**
 * The ring a keyboard sees, as the browser drew it: the global
 * `:focus-visible` outline, which a menu item draws flush to its edge
 * (`outline-offset-0`, so it stays inside the menu's padding).
 */
async function expectFocusRing(target: Locator, offset = "2px"): Promise<void> {
  const ring = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      ringed: element.matches(":focus-visible"),
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
    };
  });
  expect(ring).toEqual({ ringed: true, style: "solid", width: "2px", offset });
}

/**
 * At least 24 by 24 pixels, and a menu item 40 tall (WCAG 2.5.8; spec 0026, AC-16).
 * Each side is rounded to 0.01 pixel first: a menu placed at a fractional
 * offset can report 39.99998 for a 40 pixel item (CI, 2026-11-26), and that
 * is layout rounding, not a smaller target. The minimums themselves stay.
 */
async function expectTarget(target: Locator, height = 24): Promise<void> {
  const box = await target.boundingBox();
  const round = (side: number) => Math.round(side * 100) / 100;
  expect(round(box?.width ?? 0)).toBeGreaterThanOrEqual(24);
  expect(round(box?.height ?? 0)).toBeGreaterThanOrEqual(height);
}

test.describe("signed out (AC-19, AC-25)", () => {
  test("/ asks nothing, shows Sign in and Try it free, and nothing in the header moves", async ({
    page,
  }) => {
    const asks = planRequests(page);
    await page.goto("/");
    const header = page.getByRole("banner");

    await expect(
      header.getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
    await expect(
      header.getByRole("link", { name: "Try it free", exact: true }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(asks).toEqual([]);
    expect(await headerShift(page)).toBe(0);
  });

  test("a cookie of 0, as Clerk leaves after sign out, asks nothing", async ({
    page,
  }) => {
    await signInCookie(page, "0");
    const asks = planRequests(page);
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(asks).toEqual([]);
  });
});

test.describe("signed in on / (AC-19, AC-22, AC-23, AC-24, AC-25)", () => {
  test("asks once, shows the letter and Open the tool, and nothing in the header moves", async ({
    page,
  }) => {
    await signInCookie(page);
    const asks = await answerPlan(page, {
      ...FREE,
      account: "signed-in",
      email: ADDRESS,
    });
    await page.goto("/");
    const header = page.getByRole("banner");

    const avatar = header.getByRole("button", { name: "Your account", exact: true });
    await expect(avatar).toHaveText("A");
    await expect(
      header.getByRole("link", { name: "Open the tool", exact: true }),
    ).toHaveAttribute("href", "/tool");
    await expect(header.getByRole("link", { name: "Sign in", exact: true })).toHaveCount(
      0,
    );
    await expect(
      header.getByRole("link", { name: "Try it free", exact: true }),
    ).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(asks).toHaveLength(1);
    expect(new URL(asks[0]?.url() ?? "").origin).toBe(new URL(page.url()).origin);
    expect(await headerShift(page)).toBe(0);
  });

  test("opens the menu by keyboard, reads who and which plan, and passes axe", async ({
    page,
  }) => {
    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    await page.goto("/");

    const avatar = page.getByRole("button", { name: "Your account", exact: true });
    await avatar.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expect(menu.getByText(ADDRESS)).toBeVisible();
    await expect(menu.getByText("Free · 3 pages a document")).toBeVisible();
    await expect(menu.getByRole("menuitem")).toHaveText([
      "Account",
      "Upgrade to Pro",
      "Redact a PDF",
      "Sign out",
    ]);
    // Radix moves focus into the menu; the arrow keys walk it.
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Upgrade to Pro" })).toBeFocused();
    await expectNoAxeViolations(page);

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(avatar).toBeFocused();
  });

  test("shows the signed out shape for a forged cookie, after one ask", async ({
    page,
  }) => {
    await signInCookie(page, "9999999999");
    const asks = await answerPlan(page, { ...FREE, account: "none", email: null });
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Your account" })).toHaveCount(0);
    expect(asks).toHaveLength(1);
  });

  test("loads the menu's code only once a sign in is confirmed", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(request.url());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const anonymous = new Set(scripts);

    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    scripts.length = 0;
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();
    await page.waitForLoadState("networkidle");

    // Signed in, the page loads at least one script an anonymous visit never did.
    expect(scripts.filter((url) => !anonymous.has(url)).length).toBeGreaterThan(0);
  });
});

/**
 * AC-23, and spec 0026, AC-16: the account menu walked by keyboard, each item
 * read by the name a screen reader hears and ringed as focus lands on it,
 * then axe with the menu open at 320 pixels and in forced colours.
 */
test.describe("the account menu by keyboard (AC-23; spec 0026, AC-16)", () => {
  test("walks every item with the arrow keys, Home, End and typeahead, each named and ringed", async ({
    page,
  }) => {
    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    await page.goto("/");

    // Reached by Tab, as a keyboard reaches it: Sign in is gone, so Open the
    // tool comes just before the avatar. The menu's code arrives by `import()`
    // once the sign in is confirmed, so the avatar is waited for first.
    const avatar = page.getByRole("button", { name: "Your account", exact: true });
    await expect(avatar).toBeVisible();
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Open the tool", exact: true })
      .focus();
    await page.keyboard.press("Tab");
    await expect(avatar).toBeFocused();
    await expectFocusRing(avatar);
    await expectTarget(avatar, 40);
    await expect(avatar).toHaveAttribute("aria-haspopup", "menu");
    await expect(avatar).toHaveAttribute("aria-expanded", "false");

    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Your account" });
    await expect(menu).toBeVisible();
    await expect(avatar).toHaveAttribute("aria-expanded", "true");
    // What a screen reader hears: who and which plan, then the four items
    // by name, the separator between them and Sign out. The letter is hidden.
    await expect(menu).toMatchAriaSnapshot(`
      - menu "Your account":
        - paragraph: ${ADDRESS}
        - paragraph: Free · 3 pages a document
        - separator
        - menuitem "Account"
        - menuitem "Upgrade to Pro"
        - menuitem "Redact a PDF"
        - separator
        - menuitem "Sign out"
    `);

    const names = ["Account", "Upgrade to Pro", "Redact a PDF", "Sign out"];
    for (const [index, name] of names.entries()) {
      if (index > 0) await page.keyboard.press("ArrowDown");
      const item = menu.getByRole("menuitem", { name, exact: true });
      await expect(item).toBeFocused();
      await expectFocusRing(item, "0px");
      await expectTarget(item, 40);
    }
    // The ends hold: Down at the last item stays there.
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
    await page.keyboard.press("Home");
    await expect(menu.getByRole("menuitem", { name: "Account" })).toBeFocused();
    await page.keyboard.press("End");
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("menuitem", { name: "Redact a PDF" })).toBeFocused();
    await page.keyboard.press("u");
    await expect(menu.getByRole("menuitem", { name: "Upgrade to Pro" })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(avatar).toBeFocused();
    await expectFocusRing(avatar);
    await expect(avatar).toHaveAttribute("aria-expanded", "false");

    // Space opens it too, on the first item.
    await page.keyboard.press(" ");
    await expect(menu.getByRole("menuitem", { name: "Account" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(avatar).toBeFocused();
  });

  test("names the new tab items on /tool as a screen reader reads them", async ({
    page,
  }) => {
    await signInCookie(page);
    await answerPlan(page, { ...PAID, account: "signed-in", email: ADDRESS });
    await page.goto("/tool");

    await page.getByRole("button", { name: "Your account" }).focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu", { name: "Your account" });
    await expect(menu).toMatchAriaSnapshot(`
      - menu "Your account":
        - paragraph: ${ADDRESS}
        - paragraph: Pro · 50 pages a document
        - separator
        - menuitem "Account (opens in a new tab)"
        - menuitem "Billing (opens in a new tab)"
        - separator
        - menuitem "Sign out"
    `);
    for (const name of [
      "Account (opens in a new tab)",
      "Billing (opens in a new tab)",
      "Sign out",
    ]) {
      await expect(menu.getByRole("menuitem", { name, exact: true })).toBeFocused();
      await expectFocusRing(menu.getByRole("menuitem", { name, exact: true }), "0px");
      await page.keyboard.press("ArrowDown");
    }
  });

  for (const [what, width, forced] of [
    ["at 320 pixels", 320, false],
    ["in forced colours", 1280, true],
  ] as const) {
    test(`passes axe with the menu open ${what}, every item inside the window`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 640 });
      if (forced) await page.emulateMedia({ forcedColors: "active" });
      await signInCookie(page);
      await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
      await page.goto("/");

      await page.getByRole("button", { name: "Your account" }).focus();
      await page.keyboard.press("Enter");
      const menu = page.getByRole("menu", { name: "Your account" });
      await expect(menu.getByRole("menuitem", { name: "Account" })).toBeFocused();
      await expectNoAxeViolations(page);

      const box = await menu.boundingBox();
      expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
      expect((box?.x ?? 0) + (box?.width ?? Infinity)).toBeLessThanOrEqual(width);
      const scroll = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(scroll.width).toBeLessThanOrEqual(scroll.viewport);
      // The menu keeps an edge of its own in forced colours, where its shadow goes.
      if (forced) {
        const edge = await menu.evaluate(
          (element) => getComputedStyle(element).borderTopStyle,
        );
        expect(edge).toBe("solid");
      }
    });
  }
});

test.describe("on /tool (AC-19, AC-22, AC-23, AC-30)", () => {
  test("makes the one ask it always made, and shows the Pro chip and the avatar", async ({
    page,
  }) => {
    await signInCookie(page);
    const asks = await answerPlan(page, {
      ...PAID,
      account: "signed-in",
      email: ADDRESS,
    });
    await page.goto("/tool");
    const header = page.getByRole("banner");

    await expect(header.getByRole("button", { name: "Your account" })).toBeVisible();
    await expect(header.getByTestId("pro-chip")).toHaveText("Pro");
    await expect(header.getByRole("link", { name: "Open the tool" })).toHaveCount(0);
    await page.waitForLoadState("networkidle");
    expect(asks).toHaveLength(1);
  });

  test("makes the same one ask signed out", async ({ page }) => {
    const asks = await answerPlan(page, { ...FREE, account: "none", email: null });
    await page.goto("/tool");

    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(asks).toHaveLength(1);
  });

  test("opens account items in a new tab, leaves out Redact a PDF, and keeps the page announced", async ({
    page,
  }) => {
    await signInCookie(page);
    await answerPlan(page, { ...PAID, account: "signed-in", email: ADDRESS });
    await page.goto("/tool");

    await page.getByRole("button", { name: "Your account" }).focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText([
      /^Account/,
      /^Billing/,
      "Sign out",
    ]);
    for (const name of [/^Account/, /^Billing/]) {
      await expect(menu.getByRole("menuitem", { name })).toHaveAttribute(
        "target",
        "_blank",
      );
    }
    await expect(menu.getByRole("menuitem", { name: "Sign out" })).not.toHaveAttribute(
      "target",
    );
    // Not modal: nothing outside the menu is hidden from assistive technology,
    // so /tool's polite regions keep announcing while it is open.
    await expect(page.locator("main")).not.toHaveAttribute("aria-hidden");
    await expect(page.getByTestId("area-live")).not.toHaveAttribute("aria-hidden");
    await expect(page.getByRole("banner")).not.toHaveAttribute("aria-hidden");
    await expectNoAxeViolations(page);
  });

  test("moves the file bar into the header while a document is open", async ({
    page,
  }) => {
    await answerPlan(page, { ...FREE, account: "none", email: null });
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(TEXT_PAGE);
    await expect(page.getByRole("checkbox", { name: PHONE })).toBeChecked({
      timeout: 60_000,
    });
    const header = page.getByRole("banner");

    const bar = header.getByTestId("file-bar");
    await expect(bar).toContainText("text-page.pdf");
    await expect(bar.getByTestId("page-count")).toHaveText("2 pages");
    await expect(
      header.getByRole("button", { name: "Choose another PDF" }),
    ).toBeVisible();
    await expect(header.getByRole("button", { name: "Start over" })).toBeVisible();
    await expect(header.getByRole("navigation")).toHaveCount(0);
    await expect(page.getByTestId("area-document")).toBeHidden();
    // Never in the title.
    expect(await page.title()).not.toContain("text-page");

    await header.getByRole("button", { name: "Start over" }).click();
    await expect(header.getByRole("navigation", { name: "Site" })).toBeVisible();
    await expect(page.getByTestId("drop-area")).toBeVisible();
  });

  test("puts the file context on a second row under the lockup at 320 pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(TEXT_PAGE);
    await expect(page.getByRole("checkbox", { name: PHONE })).toBeVisible({
      timeout: 60_000,
    });
    const header = page.getByRole("banner");

    const lockup = await header.getByRole("link", { name: "RedactNest" }).boundingBox();
    const avatar = await header
      .getByRole("button", { name: "Your account" })
      .boundingBox();
    const bar = await header.getByTestId("file-bar").boundingBox();
    if (lockup === null || avatar === null || bar === null) throw new Error("no box");
    expect(
      Math.abs(avatar.y + avatar.height / 2 - (lockup.y + lockup.height / 2)),
    ).toBeLessThan(2);
    expect(bar.y).toBeGreaterThanOrEqual(lockup.y + lockup.height);
    const scroll = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll.width).toBeLessThanOrEqual(scroll.viewport);
  });
});

test.describe("sign out (AC-26)", () => {
  test("from /tool with ticked work, the leave warning comes first", async ({ page }) => {
    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(TEXT_PAGE);
    await expect(page.getByRole("checkbox", { name: PHONE })).toBeChecked({
      timeout: 60_000,
    });
    await page.getByRole("checkbox", { name: PHONE }).click();

    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page.getByRole("button", { name: "Your account" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("menuitem", { name: "Sign out" }).click();

    await expect.poll(() => asked).toEqual(["beforeunload"]);
    await expect(page).toHaveURL(/\/tool$/);
    await expect(page.getByRole("checkbox", { name: PHONE })).not.toBeChecked();
  });

  test("with nobody signed in, /sign-out goes straight home", async ({ page }) => {
    // A development instance first sends a fresh browser to Clerk's handshake;
    // the development browser cookie stands in for a second visit.
    await page
      .context()
      .addCookies([
        { name: "__clerk_db_jwt", value: "dvb_e2efake", domain: "localhost", path: "/" },
      ]);
    await page.route("https://*.clerk.accounts.dev/**", (route) => route.abort());

    await page.goto("/sign-out");

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("small screens (AC-27)", () => {
  test("signed in at 320 pixels: the lockup, the avatar and the menu button, Open the tool in the menu", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    await page.goto("/");
    const header = page.getByRole("banner");

    const row = [];
    for (const control of [
      header.getByRole("link", { name: "RedactNest", exact: true }),
      header.getByRole("button", { name: "Your account", exact: true }),
      header.getByRole("button", { name: "Menu", exact: true }),
    ]) {
      await expect(control).toBeVisible();
      const box = await control.boundingBox();
      if (box === null) throw new Error("the row has no box");
      row.push(box);
    }
    const [lockup] = row;
    for (const box of row) {
      expect(
        Math.abs(box.y + box.height / 2 - (lockup.y + lockup.height / 2)),
      ).toBeLessThan(2);
    }
    const open = header.getByRole("link", { name: "Open the tool", exact: true });
    await expect(open).toBeHidden();

    await header.getByRole("button", { name: "Menu", exact: true }).click();
    const menu = header.locator("[popover]");
    await expect(menu.getByRole("link")).toHaveText([
      "How it works",
      "Security",
      "Pricing",
      "Open the tool",
    ]);
    await expect(open).toBeVisible();
    await expect(menu.getByRole("link", { name: "Sign in" })).toHaveCount(0);

    const scroll = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll.width).toBeLessThanOrEqual(scroll.viewport);
  });

  test("signed in at 640 pixels: one row, Open the tool then the avatar at the right", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 640, height: 800 });
    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    await page.goto("/");
    const header = page.getByRole("banner");

    const boxes = [];
    for (const locator of [
      header.getByRole("link", { name: "RedactNest", exact: true }),
      header.getByRole("link", { name: "Pricing", exact: true }),
      header.getByRole("link", { name: "Open the tool", exact: true }),
      header.getByRole("button", { name: "Your account", exact: true }),
    ]) {
      await expect(locator).toBeVisible();
      const box = await locator.boundingBox();
      if (box === null) throw new Error("no box");
      boxes.push(box);
    }
    const middles = boxes.map(({ y, height }) => y + height / 2);
    for (const middle of middles) expect(Math.abs(middle - middles[0])).toBeLessThan(2);
    const lefts = boxes.map(({ x }) => x);
    expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
  });

  test("signed in at 320 pixels with 200% text: no sideways scroll", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await signInCookie(page);
    await answerPlan(page, { ...FREE, account: "signed-in", email: ADDRESS });
    await page.goto("/");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await expect(page.getByRole("button", { name: "Your account" })).toBeVisible();

    const scroll = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll.width).toBeLessThanOrEqual(scroll.viewport);
  });
});
