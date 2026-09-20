import { expect, test } from "@playwright/test";

/**
 * The tool route, from the point of view of someone using a keyboard and a
 * screen reader.
 *
 * Feature 4 builds the design system and owns WCAG 2.2 AA across the product.
 * These cover only what this slice actually shipped: the controls that choose a
 * file, and the region that reports what happened to it. A control that is in
 * the tab order is a control a visitor will land on, whatever feature owns its
 * eventual styling.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/tool");
});

test.describe("choosing a file", () => {
  test("the visible control announces what it does", async ({ page }) => {
    await expect(page.getByTestId("choose-file")).toHaveAccessibleName(/choose a pdf/i);
  });

  test("the visible control is reachable by keyboard", async ({ page }) => {
    await page.getByTestId("choose-file").focus();

    await expect(page.getByTestId("choose-file")).toBeFocused();
  });

  /**
   * The file input is visually hidden with `sr-only`, which keeps it in the tab
   * order and exposed to assistive technology on purpose. So a keyboard visitor
   * lands on it, and it needs a name to be usable when they do.
   *
   * Today that name is the browser's own default for a native file input
   * (Chromium announces it as `button "Choose File"`), not one this code chose.
   * The assertion is still worth keeping: feature 8 rebuilds this control, and a
   * custom element in its place would carry no default at all.
   */
  test("the file input a keyboard visitor lands on is announced", async ({ page }) => {
    const input = page.getByTestId("file-input");

    await input.focus();
    await expect(input, "an sr-only input stays in the tab order").toBeFocused();

    await expect(
      input,
      "a focusable control with no accessible name is announced as nothing",
    ).toHaveAccessibleName(/\S/);
  });
});

test.describe("reporting what happened", () => {
  test("the status area is a live region, so progress is announced", async ({ page }) => {
    await expect(page.locator("[aria-live='polite']")).toHaveCount(1);
  });

  test("a failure is announced as an alert, not only shown", async ({ page }) => {
    await page.getByTestId("file-input").setInputFiles({
      name: "not-really.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("this is not a PDF"),
    });

    const error = page.getByTestId("error");
    await expect(error).toBeVisible({ timeout: 60_000 });
    await expect(error).toHaveAttribute("role", "alert");
  });
});

test.describe("the page's own structure", () => {
  test("has exactly one first level heading", async ({ page }) => {
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("declares its language", async ({ page }) => {
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
