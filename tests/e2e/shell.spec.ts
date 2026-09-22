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

    await expect(
      page.getByRole("main").getByRole("link", { name: /redact a pdf/i }),
    ).toBeVisible();
  });

  /** A real link, reachable and operable without a mouse. */
  test("a keyboard reaches it and Enter follows it", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("main")
      .getByRole("link", { name: /redact a pdf/i })
      .focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/tool$/);
    await expect(page.getByRole("heading", { name: /redact a pdf/i })).toBeVisible();
  });
});

/**
 * Spec 0003, AC-21 and INV-10. A content security policy belongs to the
 * document it arrived with, so the tool page only keeps its own policy if the
 * browser loaded that document at `/tool`. A client side navigation would pass
 * every header test and still open the file under the policy of `/`.
 */
test.describe("every way into the tool is a real page load", () => {
  const BUTTONS = [
    ["the header's", "banner"],
    ["the page's", "main"],
  ] as const;

  for (const [which, landmark] of BUTTONS) {
    test(`${which} Redact a PDF button loads /tool as a document`, async ({ page }) => {
      await page.goto("/");

      const documentLoads: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "document") {
          documentLoads.push(new URL(request.url()).pathname);
        }
      });

      await page
        .getByRole(landmark)
        .getByRole("link", { name: /redact a pdf/i })
        .click();
      await expect(page).toHaveURL(/\/tool$/);

      expect(documentLoads).toContain("/tool");
      // The document this page is running in was loaded at `/tool`, which a
      // client side navigation never changes.
      const loadedAt = await page.evaluate(
        () => performance.getEntriesByType("navigation")[0]?.name ?? "",
      );
      expect(new URL(loadedAt).pathname).toBe("/tool");
    });
  }

  test("the landing page never prefetches the tool", async ({ page }) => {
    const toolRequests: string[] = [];
    page.on("request", (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith("/tool")) toolRequests.push(pathname);
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // `next/link` prefetches on sight and again on hover, so both are given
    // their chance before the count is read.
    for (const landmark of ["banner", "main"] as const) {
      await page
        .getByRole(landmark)
        .getByRole("link", { name: /redact a pdf/i })
        .hover();
    }
    await page.waitForLoadState("networkidle");

    expect(toolRequests).toEqual([]);
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
