import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { inspectInNode } from "./node-inspect";

/**
 * Custom terms in a real browser, with the real engine. Spec 0017, AC-1,
 * AC-3, AC-5, AC-14, AC-16, AC-19, AC-21 and AC-22.
 *
 * `/api/entitlement` is fulfilled through Playwright's own routing, as Pro or
 * as Free, so the job freezes the plan each case needs. `terms.pdf` is seven
 * pages, over the free cap, so the Free case opens a page of its own.
 */

const TERMS_PDF = resolve("tests/fixtures/terms.pdf");
const TEXT_PAGE = resolve("tests/fixtures/text-page.pdf");

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;
test.describe.configure({ timeout: ENGINE_TIMEOUT * 3 });

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Axe reads each colour as it is drawn. When a search lands, Make and the
 * field turn back on and their fill fades for 150 ms (spec 0013's controls),
 * and the steps before a check take less than that, so axe would read a
 * colour between two tokens and pass or fail by timing. Each check waits until
 * no transition runs, so it reads the page at rest. The fade itself stays: it
 * is the visitor's, and reduced motion already turns it off.
 */
async function atRest(page: Page): Promise<void> {
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          !(animation instanceof CSSTransition) || animation.playState === "finished",
      ),
  );
}

async function expectNoAxeViolations(page: Page): Promise<void> {
  await atRest(page);
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    violations,
    violations.map((violation) => `${violation.id}: ${violation.help}`).join("\n"),
  ).toEqual([]);
}

async function answerPlan(page: Page, tier: "paid" | "free"): Promise<void> {
  await page.route("**/api/entitlement", (route) =>
    route.fulfill({
      json:
        tier === "paid"
          ? { tier, pageCap: 50, maxFileBytes: 26_214_400, account: "signed-in" }
          : { tier, pageCap: 3, maxFileBytes: 26_214_400, account: "signed-in" },
    }),
  );
}

async function open(page: Page, file: string): Promise<void> {
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(file);
  await expect(page.getByTestId("checklist")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/** Type a term into the field and press Enter, then wait for its search to land. */
async function addTerm(page: Page, term: string): Promise<void> {
  const field = page.getByRole("textbox", { name: "Add a name, number or phrase" });
  await field.fill(term);
  await field.press("Enter");
  await expect(field).toHaveValue("");
  await expect(page.getByTestId("terms-add")).not.toHaveAttribute(
    "aria-disabled",
    "true",
    {
      timeout: ENGINE_TIMEOUT,
    },
  );
}

test("a Pro visitor adds a term, sees every place it appears, and the run removes the ticked ones", async ({
  page,
}) => {
  await answerPlan(page, "paid");
  await open(page, TERMS_PDF);

  const panel = page.getByTestId("terms-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("terms-status")).toBeAttached();
  await expectNoAxeViolations(page);

  await addTerm(page, "Acme Ltd");

  // AC-19: the polite line says how many were found, and the chip too.
  await expect(page.getByTestId("terms-status")).toContainText(
    "Found 6 matches for “Acme Ltd”.",
  );
  await expect(page.getByTestId("term-chip")).toContainText("6 matches");

  // AC-14: the term's group comes first, headed by the term, with its rows.
  const group = page.locator("details").filter({ hasText: "Acme Ltd" }).first();
  await expect(group.locator("summary")).toContainText("Acme Ltd");
  await expect(group.getByRole("checkbox", { name: "Acme Ltd" })).toHaveCount(4);
  await expect(
    group.getByRole("checkbox", { name: "Acme", exact: true }),
  ).not.toBeChecked();
  await expect(
    group.getByRole("checkbox", { name: "Ltd", exact: true }),
  ).not.toBeChecked();
  await expect(group).toContainText("split across a page break");

  // AC-16: the coverage note names the custom terms by count.
  await expect(page.getByTestId("coverage")).toContainText(
    // terms.pdf has a page with a warning, so the note speaks for the rest.
    "National Insurance numbers and your custom term on the pages it could read. Anything else stays in the file.",
  );
  await expectNoAxeViolations(page);

  // AC-21 and AC-22: the run removes the ticked rows, and the card names the term.
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
  await expect(page.getByTestId("outcome")).toContainText("4 matches for “Acme Ltd”");
  await expect(page.getByTestId("outcome")).toContainText(
    "2 matches for “Acme Ltd” you left unticked",
  );
  await expectNoAxeViolations(page);

  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  const text = inspectInNode(await (await downloading).path()).text;
  expect(text).not.toContain("Acme Ltd signed the lease");
  expect(text).toContain("signed the lease on time.");
  expect(text).toContain("The rent was paid to Acme");
});

test("removing a term takes its rows away, and focus moves to the field", async ({
  page,
}) => {
  await answerPlan(page, "paid");
  await open(page, TERMS_PDF);
  await addTerm(page, "Smithson");

  await expect(page.getByTestId("term-chip")).toContainText("matches");
  await page.getByRole("button", { name: "Remove Smithson" }).click();

  await expect(page.getByTestId("term-chip")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "SMITHSON" })).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Add a name, number or phrase" }),
  ).toBeFocused();
});

test("a term that is not found says so on its chip and in its place", async ({
  page,
}) => {
  await answerPlan(page, "paid");
  await open(page, TEXT_PAGE);
  await addTerm(page, "Zephyrine Quill");

  await expect(page.getByTestId("term-chip")).toContainText("Not found in this document");
  await expect(page.getByTestId("term-not-found")).toBeVisible();
  await expectNoAxeViolations(page);
});

test("a refused term stays in the field and the line says why", async ({ page }) => {
  await answerPlan(page, "paid");
  await open(page, TEXT_PAGE);

  const field = page.getByRole("textbox", { name: "Add a name, number or phrase" });
  await field.fill("a");
  await field.press("Enter");
  await expect(field).toHaveValue("a");
  await expect(page.getByTestId("terms-status")).toContainText(
    "“a” not added because it is too short (at least 2 characters).",
  );
});

test("on the Free plan the panel is locked and points to Pro", async ({ page }) => {
  await answerPlan(page, "free");
  await open(page, TEXT_PAGE);

  await expect(page.getByTestId("terms-locked")).toContainText(
    "Custom terms come with Pro",
  );
  await expect(
    page.getByRole("textbox", { name: "Add a name, number or phrase" }),
  ).toBeDisabled();
  await expect(page.getByTestId("terms-add")).toBeDisabled();
  await expectNoAxeViolations(page);
});
