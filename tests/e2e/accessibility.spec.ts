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
   * Spec 0003, AC-8. One tab stop, the visible button. The native input used to
   * sit in the tab order right after it, announced by Chromium as a second,
   * unnamed "Choose File" control. It is now out of the order and hidden from
   * assistive technology, and still receives files from the button.
   */
  test("the hidden file input is not a tab stop", async ({ page }) => {
    const input = page.getByTestId("file-input");

    await expect(input).toHaveAttribute("tabindex", "-1");
    await expect(input).toHaveAttribute("aria-hidden", "true");

    await page.getByTestId("choose-file").focus();
    await page.keyboard.press("Tab");

    await expect(
      input,
      "Tab from the button must not land on the input",
    ).not.toBeFocused();
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
