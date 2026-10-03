import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * Spec 0012, AC-5 to AC-7, in a real browser: the helper and the plan line for
 * each answer, the free cap's callout for each account, and "Check my plan and
 * open it again" opening the same file under a fresh answer with no file
 * chooser.
 *
 * `/api/entitlement` is fulfilled through Playwright's own routing, as
 * `cancel.spec.ts` does, so every account can be shown without Clerk or
 * Polar: the page is told nothing a real answer would not tell it. The build
 * has billing on (`tests/e2e/build-env.ts`), so the plan line is there to see.
 */

// A 10 MB WebAssembly payload has to arrive and compile before a page count
// can refuse a file, and every worker may be compiling it at once.
const ENGINE_TIMEOUT = 60_000;
test.describe.configure({ timeout: ENGINE_TIMEOUT + 30_000 });

/** Twelve small pages: over the free cap, well under Pro's. */
const OVER_FREE_CAP = resolve("tests/fixtures/read-pages.pdf");

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

type Account = "none" | "signed-in" | "sign-in-needed" | "unknown";

interface Answer {
  readonly tier: "free" | "paid";
  readonly pageCap: number;
  readonly maxFileBytes: number;
  readonly account: Account;
}

const free = (account: Account): Answer => ({
  tier: "free",
  pageCap: 3,
  maxFileBytes: 26_214_400,
  account,
});

const PRO: Answer = {
  tier: "paid",
  pageCap: 50,
  maxFileBytes: 26_214_400,
  account: "signed-in",
};

/**
 * Answer every ask with whatever `current()` says at the time, and count the
 * asks, so a test can change the answer as Polar would after a payment.
 */
async function answerWith(page: Page, current: () => Answer): Promise<() => number> {
  let asks = 0;
  await page.route("**/api/entitlement", (route) => {
    asks += 1;
    return route.fulfill({ json: current() });
  });
  return () => asks;
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    violations,
    violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n"),
  ).toEqual([]);
}

/** A plan link: its name says it opens a new tab, and it does. */
async function expectNewTabLink(
  scope: Locator,
  label: string,
  href: string,
): Promise<void> {
  const link = scope.getByRole("link", { name: `${label} (opens in a new tab)` });
  await expect(link).toHaveAttribute("href", href);
  await expect(link).toHaveAttribute("target", "_blank");
}

/** The tab came back, as it does after paying in another one. */
async function tabComesBack(page: Page): Promise<void> {
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
}

test.describe("the helper and the plan line (AC-5)", () => {
  test("says it is checking until the first answer arrives", async ({ page }) => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/entitlement", async (route) => {
      await held;
      await route.fulfill({ json: free("none") });
    });

    await page.goto("/tool");
    await expect(page.getByTestId("drop-area")).toContainText("Checking your plan");
    await expect(page.getByTestId("plan-line")).toBeEmpty();

    release();
    await expect(page.getByTestId("drop-area")).toContainText("Up to 3 pages on Free");
  });

  const LINES: readonly (readonly [
    string,
    Answer,
    string,
    string,
    readonly (readonly [string, string])[],
  ])[] = [
    [
      "anonymous",
      free("none"),
      "Up to 3 pages on Free",
      "Sign in (opens in a new tab), or see what Pro adds (opens in a new tab).",
      [
        ["Sign in", "/sign-in"],
        ["see what Pro adds", "/pricing"],
      ],
    ],
    [
      "signed in on Free",
      free("signed-in"),
      "Up to 3 pages on Free",
      "Get Pro (opens in a new tab) for up to 50 pages a document.",
      [["Get Pro", "/pricing"]],
    ],
    ["signed in with Pro", PRO, "Up to 50 pages on Pro", "Signed in with Pro.", []],
    [
      "signed in, but the sign in has expired",
      free("sign-in-needed"),
      "Up to 3 pages on Free",
      "Your sign in has expired, so the free limit applies. Sign in again (opens in a new tab) to use Pro.",
      [["Sign in again", "/sign-in"]],
    ],
    [
      "unchecked",
      free("unknown"),
      "Up to 3 pages on Free",
      "We couldn't check your plan, so the free limit applies for now.",
      [],
    ],
  ];

  for (const [label, answer, helper, words, links] of LINES) {
    test(`shows the next step above the drop zone when ${label}`, async ({ page }) => {
      await answerWith(page, () => answer);
      await page.goto("/tool");

      const line = page.getByTestId("plan-line");
      await expect(line).toHaveText(words);
      await expect(line).toHaveAttribute("role", "status");
      await expect(page.getByTestId("drop-area")).toContainText(helper);
      for (const [name, href] of links) await expectNewTabLink(line, name, href);
      await expect(line.getByRole("link")).toHaveCount(links.length);
      await expect(page.getByTestId("plan-try-again")).toHaveCount(
        answer.account === "unknown" ? 1 : 0,
      );
      await expectNoAxeViolations(page);
    });
  }

  test("asks fresh on Try again, and moves focus to the line that replaces it", async ({
    page,
  }) => {
    let current = free("unknown");
    const asks = await answerWith(page, () => current);
    await page.goto("/tool");
    await expect(page.getByTestId("plan-try-again")).toBeVisible();

    current = PRO;
    await page.getByTestId("plan-try-again").click();

    await expect(page.getByTestId("plan-line")).toHaveText("Signed in with Pro.");
    await expect(page.getByTestId("plan-line")).toBeFocused();
    await expect(page.getByTestId("drop-area")).toContainText("Up to 50 pages on Pro");
    expect(asks()).toBe(2);
  });
});

test.describe("a free cap (AC-6)", () => {
  const CAPS: readonly (readonly [Account, string, readonly [string, string] | null])[] =
    [
      ["none", "Sign in and get Pro, then open it again here.", ["Get Pro", "/pricing"]],
      ["signed-in", "Get Pro, then open it again here.", ["Get Pro", "/pricing"]],
      [
        "sign-in-needed",
        "Sign in again to use Pro, then open it again here.",
        ["Sign in again", "/sign-in"],
      ],
      ["unknown", "We couldn't check your plan. Check it, then open it again.", null],
    ];

  for (const [account, next, link] of CAPS) {
    test(`points a job with account ${account} to Pro, never to splitting`, async ({
      page,
    }) => {
      await answerWith(page, () => free(account));
      await page.goto("/tool");
      await page.getByTestId("file-input").setInputFiles(OVER_FREE_CAP);

      const error = page.getByTestId("error");
      await expect(
        error.getByRole("heading", { level: 2, name: "This PDF has more than 3 pages" }),
      ).toBeFocused({ timeout: ENGINE_TIMEOUT });
      await expect(error).toContainText(
        "The free plan handles up to 3 pages. Pro handles up to 50.",
      );
      await expect(error).toContainText(next);
      await expect(error).not.toContainText("Split");
      if (link === null) await expect(error.getByRole("link")).toHaveCount(0);
      else await expectNewTabLink(error, link[0], link[1]);
      await expect(
        error.getByRole("button", { name: "Check my plan and open it again" }),
      ).toBeVisible();
      await expectNoAxeViolations(page);
    });
  }
});

/**
 * AC-7, with Polar played by the routed answer: a free visitor at the cap
 * follows Get Pro to a new tab, pays there, and comes back. The plan line shows
 * Pro once the tab is visible again, while the callout still speaks for the
 * free job, and the button opens the same file past the free cap with no file
 * chooser.
 */
test("opens the same file past the free cap once Pro is bought in another tab (AC-7)", async ({
  page,
}) => {
  let current = free("none");
  const asks = await answerWith(page, () => current);
  const choosers: unknown[] = [];
  page.on("filechooser", (chooser) => choosers.push(chooser));

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(OVER_FREE_CAP);
  const error = page.getByTestId("error");
  await expect(error).toContainText("Sign in and get Pro, then open it again here.", {
    timeout: ENGINE_TIMEOUT,
  });

  // Get Pro opens Pricing in a new tab and leaves this one, and its file, alone.
  const [pricing] = await Promise.all([
    page.waitForEvent("popup"),
    error.getByRole("link", { name: "Get Pro (opens in a new tab)" }).click(),
  ]);
  await expect(pricing).toHaveURL(/\/pricing$/);
  await pricing.close();
  await expect(error).toBeVisible();

  // Paid there; this tab hears of it when it is visible again.
  current = PRO;
  await tabComesBack(page);
  await expect(page.getByTestId("plan-line")).toHaveText("Signed in with Pro.");
  await expect(error).toContainText("The free plan handles up to 3 pages.");
  const asksBefore = asks();

  await error.getByRole("button", { name: "Check my plan and open it again" }).click();

  await expect(page.getByTestId("page-count")).toHaveText("12 pages", {
    timeout: ENGINE_TIMEOUT,
  });
  await expect(page.getByTestId("error")).toHaveCount(0);
  expect(asks()).toBe(asksBefore + 1);
  expect(choosers).toEqual([]);
});

/**
 * AC-4: a paying visitor is never polled. An ask starts its request as the
 * event is handled, so counting `fetch` calls around the event in the page
 * proves none was made, with no wait for a request that might come later.
 */
test("never asks a Pro page again when the tab comes back", async ({ page }) => {
  await answerWith(page, () => PRO);
  await page.goto("/tool");
  await expect(page.getByTestId("plan-line")).toHaveText("Signed in with Pro.");

  const requests = await page.evaluate(() => {
    let calls = 0;
    const original = window.fetch;
    window.fetch = (...args) => {
      calls += 1;
      return original(...args);
    };
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.fetch = original;
    return calls;
  });

  expect(requests).toBe(0);
});
