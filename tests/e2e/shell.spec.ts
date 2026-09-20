import { expect, test } from "@playwright/test";

/**
 * The routes around the tool: the landing page and the layout every page shares.
 *
 * Deliberately thin. Feature 15 builds the real landing page and feature 18 owns
 * the full AGPL obligation, so nothing here asserts wording that those features
 * will replace. What is asserted is what the scaffold genuinely decided: there
 * is a route to the tool that a keyboard reaches, and the source offer link
 * reads its address from the typed config module rather than a literal.
 */

/** Set by `playwright.config.ts`, so the link has a known address to resolve to. */
const SOURCE_URL = "https://example.invalid/redactnest/tree/test";

test.describe("getting to the tool", () => {
  test("the landing page offers a route to it", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /redact a pdf/i })).toBeVisible();
  });

  /** A real link, reachable and operable without a mouse. */
  test("a keyboard reaches it and Enter follows it", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("link", { name: /redact a pdf/i }).focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/tool$/);
    await expect(page.getByRole("heading", { name: /redact a pdf/i })).toBeVisible();
  });
});

test.describe("the AGPL source offer", () => {
  /**
   * INV-7 in the shape the layout uses it. The address comes from the config
   * module, so setting it to something nothing else would produce is what makes
   * a hardcoded repository link fail here.
   */
  test("links to the address configured for this deploy", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: /source code/i })).toHaveAttribute(
      "href",
      SOURCE_URL,
    );
  });

  /** Section 13 wants the offer reachable from the page doing the work. */
  test("is present on the tool route too", async ({ page }) => {
    await page.goto("/tool");

    await expect(page.getByRole("link", { name: /source code/i })).toBeVisible();
  });
});

test.describe("the document title", () => {
  test("names the tool and the product", async ({ page }) => {
    await page.goto("/tool");

    await expect(page).toHaveTitle(/Redact a PDF.*RedactNest/);
  });
});
