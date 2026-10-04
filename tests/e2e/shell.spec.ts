import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { SOURCE_URL } from "./build-env";

/**
 * The routes around the tool: the landing page and the layout every page shares.
 *
 * Deliberately thin. Feature 15 builds the real landing page, so nothing here
 * asserts wording it will replace. What is asserted is what the scaffold
 * genuinely decided: there is a route to the tool that a keyboard reaches. And
 * the licence notice spec 0009 settled, word for word, on every page.
 */

/** One address and one number, both found and ticked by default. */
const TEXT_PAGE = resolve("tests/fixtures/text-page.pdf");
const PHONE = "020 7946 0958";

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

  /**
   * INV-11, in a real browser. The links above are real page loads, but a stray
   * `router.push` is not, and it lands the tool in a document loaded at `/`. The
   * guard answers with one reload, which is a load at `/tool` and so passes.
   * A second reload would mean the guard can loop, which is the one thing it
   * must never do.
   */
  test("a router.push into the tool reloads it exactly once, then stops", async ({
    page,
  }) => {
    await page.goto("/");

    const documentLoads: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "document") {
        documentLoads.push(new URL(request.url()).pathname);
      }
    });

    // A client side navigation fires no `load`, so this resolves on the reload.
    const reloaded = page.waitForEvent("load");
    await page.evaluate((path) => {
      // Next sets its App Router here "for debugging purposes", in production
      // too. It is the instance `useRouter()` returns, so this is a real push.
      const next: unknown = Reflect.get(window, "next");
      const router: unknown =
        typeof next === "object" && next !== null ? Reflect.get(next, "router") : null;
      const push: unknown =
        typeof router === "object" && router !== null
          ? Reflect.get(router, "push")
          : null;
      if (typeof push !== "function") throw new Error("window.next.router.push is gone");
      Reflect.apply(push, router, [path]);
    }, "/tool");
    await reloaded;

    await expect(page).toHaveURL(/\/tool$/);
    await expect(page.getByTestId("choose-file")).toBeVisible();

    // A loop would reload on every hydration and never let the network settle,
    // so the count is read only once it has.
    await page.waitForLoadState("networkidle");
    expect(documentLoads).toEqual(["/tool"]);

    // `reload` rather than `navigate`: the guard asked for this load, which also
    // proves the push really was client side and not Next falling back to a
    // hard navigation that would have passed this test for the wrong reason.
    const navigation = await page.evaluate(() => {
      const [entry] = performance.getEntriesByType("navigation");
      return entry instanceof PerformanceNavigationTiming
        ? { path: new URL(entry.name).pathname, type: entry.type }
        : null;
    });
    expect(navigation).toEqual({ path: "/tool", type: "reload" });
  });

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

/**
 * Spec 0012, AC-9 and INV-10. Every page's header links to Pricing and Account
 * as plain links, so nothing prefetches Pricing, an account page or the page
 * that starts a checkout. `next/link` prefetches on sight and again on hover,
 * so both get their chance before the count is read, as for the tool above.
 */
test.describe("the header's Pricing and Account links", () => {
  for (const path of ["/", "/tool", "/pricing", "/privacy", "/terms"]) {
    test(`are plain links on ${path} that prefetch nothing`, async ({ page }) => {
      const prefetched: string[] = [];
      page.on("request", (request) => {
        const { pathname } = new URL(request.url());
        if (pathname === path) return;
        if (/^\/(pricing|account|sign-in|sign-up)(\/|$)/.test(pathname)) {
          prefetched.push(pathname);
        }
      });

      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const header = page.getByRole("banner");
      for (const [name, href] of [
        ["Pricing", "/pricing"],
        ["Account", "/account"],
      ] as const) {
        const link = header.getByRole("link", { name, exact: true });
        await expect(link).toHaveAttribute("href", href);
        await link.hover();
      }
      await page.waitForLoadState("networkidle");

      expect(prefetched).toEqual([]);
    });
  }
});

/**
 * Spec 0009, AC-1 and AC-2. AGPL section 5(d)'s notice and section 13's source
 * offer, on the page doing the work as on every other.
 */
test.describe("the licence notice", () => {
  const NOTICE = [
    "© 2026 Heyrbiar Khan",
    "Licensed under the GNU AGPL 3.0 or later, which lets you share and change it",
    "No warranty",
    "Source code for this version",
    "Licence",
    "Third party notices",
  ].join(" · ");

  for (const path of ["/", "/tool"]) {
    /**
     * INV-1 in the shape the layout uses it. The address comes from the config
     * module, so building with one nothing else would produce is what makes a
     * hardcoded repository link fail here.
     */
    test(`reads in full on ${path}, with its three links`, async ({ page }) => {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");

      await expect(footer.locator("p")).toHaveText(NOTICE);
      await expect(
        footer.getByRole("link", { name: "Source code for this version" }),
      ).toHaveAttribute("href", SOURCE_URL);
      await expect(
        footer.getByRole("link", { name: "Licence", exact: true }),
      ).toHaveAttribute("href", "/licence.txt");
      await expect(
        footer.getByRole("link", { name: "Third party notices" }),
      ).toHaveAttribute("href", "/third-party-notices.txt");
    });
  }

  /**
   * AC-2. A footer link is a plain link in the same tab, so it is a real page
   * load, and spec 0007's leave warning still guards ticked work on `/tool`.
   */
  test("following a link from ticked work brings the leave warning", async ({ page }) => {
    await openWithChangedTick(page);

    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Licence", exact: true })
      .click();

    await expect.poll(() => asked).toEqual(["beforeunload"]);
    await expect(page).toHaveURL(/\/tool$/);
    await expect(page.getByRole("checkbox", { name: PHONE })).not.toBeChecked();
  });
});

/** Open a document on `/tool` and change a tick, which is work worth a warning. */
async function openWithChangedTick(page: Page): Promise<void> {
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(TEXT_PAGE);
  // A 10 MB WebAssembly payload has to arrive and compile first.
  await expect(page.getByRole("checkbox", { name: PHONE })).toBeChecked({
    timeout: 60_000,
  });
  await page.getByRole("checkbox", { name: PHONE }).click();
}

test.describe("the document title", () => {
  test("names the tool and the product", async ({ page }) => {
    await page.goto("/tool");

    await expect(page).toHaveTitle(/Redact a PDF.*RedactNest/);
  });
});
