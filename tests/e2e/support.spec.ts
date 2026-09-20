import { expect, test } from "@playwright/test";

/**
 * Spec 0001 SD-8: a browser that cannot run RedactNest is told so plainly,
 * instead of being handed a drop area that fails after the file is chosen.
 *
 * `verify.md` records this as a manual step, on the grounds that the gap has to
 * be created in the browser itself. That is true, and a browser is exactly what
 * this is. An init script runs before any page script, so the page really does
 * start up in a browser missing the capability, rather than being told to
 * pretend. The manual step stays worth doing with a real policy; this catches a
 * regression without anyone remembering to.
 */

test.describe("a browser that cannot do the work", () => {
  test("says so instead of showing a drop area when WebAssembly is absent", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "WebAssembly", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto("/tool");

    await expect(page.getByTestId("unsupported")).toBeVisible();
    await expect(page.getByTestId("drop-area")).toHaveCount(0);
  });

  /**
   * The case that actually happens. A workplace policy usually leaves the global
   * in place and refuses at compile time, so a page that only checked for the
   * global would show a working drop area and fail on the first real document.
   */
  test("says so when WebAssembly is present but compiling is refused", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "WebAssembly", {
        configurable: true,
        value: {
          Module: function BlockedModule() {
            throw new Error("WebAssembly is disallowed by policy");
          },
        },
      });
    });

    await page.goto("/tool");

    await expect(page.getByTestId("unsupported")).toBeVisible();
    await expect(page.getByTestId("drop-area")).toHaveCount(0);
  });

  test("says so when Web Workers are unavailable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "Worker", { configurable: true, value: undefined });
    });

    await page.goto("/tool");

    await expect(page.getByTestId("unsupported")).toBeVisible();
    await expect(page.getByTestId("unsupported")).toContainText(/worker/i);
  });

  test("explains the reason rather than only refusing", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "WebAssembly", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto("/tool");

    const explanation = page.getByTestId("unsupported");
    await expect(explanation).toContainText(/WebAssembly/i);
    await expect(explanation).toContainText(/your own machine/i);
  });

  /** A visitor using a screen reader has to hear this, not just see it. */
  test("announces the explanation and heads it with a heading", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, "WebAssembly", {
        configurable: true,
        value: undefined,
      });
    });

    await page.goto("/tool");

    // Filtered rather than bare: Next.js adds its own route announcer with
    // `role="alert"`, so an unfiltered query matches two elements.
    await expect(
      page.getByRole("alert").filter({ hasText: /cannot run in this browser/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /cannot run in this browser/i }),
    ).toBeVisible();
  });
});

/**
 * The control. Without it, every test above would still pass on a page that
 * always shows the explanation, which would be a worse bug than the one they
 * guard against.
 */
test("a capable browser gets the drop area and no explanation", async ({ page }) => {
  await page.goto("/tool");

  await expect(page.getByTestId("drop-area")).toBeVisible();
  await expect(page.getByTestId("unsupported")).toHaveCount(0);
});
