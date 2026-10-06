import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { SOURCE_URL } from "./build-env";

/**
 * The routes around the tool: the landing page and the layout every page shares,
 * and since spec 0013 the brand on every page: the header, the footer, the head
 * tags and the 404.
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
      page.getByRole("main").getByRole("link", { name: "Remove text from a PDF" }),
    ).toBeVisible();
  });

  /** A real link, reachable and operable without a mouse. */
  test("a keyboard reaches it and Enter follows it", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("main")
      .getByRole("link", { name: "Remove text from a PDF" })
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
    ["the header's", "banner", "Try it free"],
    ["the hero's", "main", "Remove text from a PDF"],
  ] as const;

  for (const [which, landmark, name] of BUTTONS) {
    test(`${which} ${name} button loads /tool as a document`, async ({ page }) => {
      await page.goto("/");

      const documentLoads: string[] = [];
      page.on("request", (request) => {
        if (request.resourceType() === "document") {
          documentLoads.push(new URL(request.url()).pathname);
        }
      });

      await page.getByRole(landmark).getByRole("link", { name }).click();
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
    for (const [landmark, name] of [
      ["banner", "Try it free"],
      ["main", "Remove text from a PDF"],
    ] as const) {
      await page.getByRole(landmark).getByRole("link", { name }).hover();
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

/**
 * Spec 0013, AC-7 and AC-30. The header every page shows: the lockup home, the
 * Site nav with Pricing, Account, then the "Try it free" button everywhere but
 * `/tool`. No item names the tool, so on `/tool` nothing is current.
 */
test.describe("the header", () => {
  const CURRENT = [
    ["/tool", null],
    ["/pricing", "Pricing"],
    ["/", null],
    ["/privacy", null],
    ["/terms", null],
  ] as const;

  for (const [path, current] of CURRENT) {
    test(`marks ${current ?? "nothing"} as the current page on ${path}`, async ({
      page,
    }) => {
      await page.goto(path);
      const header = page.getByRole("banner");

      const marked = header.locator('[aria-current="page"]');
      if (current === null) {
        await expect(marked).toHaveCount(0);
      } else {
        await expect(marked).toHaveText([current]);
        // Semibold, and the 2 pixel accent bar beneath.
        expect(await marked.evaluate((link) => getComputedStyle(link).fontWeight)).toBe(
          "600",
        );
        const bar = await marked.evaluate((link) => {
          const after = getComputedStyle(link, "::after");
          return { width: after.borderBottomWidth, style: after.borderBottomStyle };
        });
        expect(bar).toEqual({ width: "2px", style: "solid" });
      }
      // One way home per page: the footer's lockup is not a link.
      await expect(
        page.getByRole("link", { name: "RedactNest", exact: true }),
      ).toHaveCount(1);
    });
  }

  test("offers Try it free on every page but the tool", async ({ page }) => {
    await page.goto("/pricing");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Try it free" }),
    ).toHaveAttribute("href", "/tool");

    await page.goto("/tool");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Try it free" }),
    ).toHaveCount(0);
  });

  test("gives every nav item a target at least 40 pixels tall", async ({ page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");

    for (const name of ["Pricing", "Account"]) {
      const box = await header.getByRole("link", { name, exact: true }).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(40);
    }
  });

  /** AC-30: the button is the way in, so no header link is named for the tool. */
  for (const path of ["/", "/tool", "/pricing"]) {
    test(`names no Redact item on ${path}`, async ({ page }) => {
      await page.goto(path);
      const header = page.getByRole("banner");

      for (const name of ["Redact", "Redact a PDF"]) {
        await expect(header.getByRole("link", { name, exact: true })).toHaveCount(0);
      }
    });
  }

  /**
   * Below `sm` the lockup sits alone on the first row and everything else
   * wraps beneath it in page order, so focus never moves back up the screen.
   */
  test("wraps below the lockup in page order at 320 pixels, with no sideways scroll", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");
    const header = page.getByRole("banner");

    const tops: number[] = [];
    for (const name of ["RedactNest", "Pricing", "Account", "Try it free"]) {
      const box = await header.getByRole("link", { name, exact: true }).boundingBox();
      tops.push(box?.y ?? Number.NaN);
    }
    const [lockup = Number.NaN, ...rest] = tops;
    for (const top of rest) expect(top).toBeGreaterThan(lockup);
    expect(rest).toEqual([...rest].sort((a, b) => a - b));

    const scroll = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    }));
    expect(scroll.width).toBeLessThanOrEqual(scroll.viewport);
  });
});

/** Spec 0013, AC-8. The footer's brand column and link groups. */
test.describe("the footer", () => {
  for (const path of ["/", "/tool"]) {
    test(`shows the brand line and both groups on ${path}`, async ({ page }) => {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");

      await expect(footer).toContainText("RedactNest");
      await expect(footer).toContainText("PDF redaction in your browser.");
      await expect(
        footer.getByRole("navigation", { name: "Product" }).getByRole("link"),
      ).toHaveText(["Redact a PDF", "Pricing"]);
      await expect(
        footer.getByRole("navigation", { name: "Legal" }).getByRole("link"),
      ).toHaveText(["Privacy policy", "Terms of service"]);
      // The lockup here is not a link, and the notice is still the one paragraph.
      await expect(footer.getByRole("link", { name: "RedactNest" })).toHaveCount(0);
      await expect(footer.locator("p")).toHaveCount(1);
    });
  }
});

/**
 * Spec 0013, AC-3 to AC-5. The icons and the social card every page links,
 * all from our own origin, with neither content security policy changed: no
 * manifest, and no policy violation on any page.
 */
test.describe("the head tags", () => {
  for (const path of ["/", "/tool", "/pricing", "/privacy"]) {
    test(`link the icons and the social card on ${path}, with no policy violation`, async ({
      page,
    }) => {
      await page.addInitScript(() => {
        const seen: string[] = [];
        Reflect.set(window, "__violations", seen);
        document.addEventListener("securitypolicyviolation", (event) => {
          seen.push(`${event.violatedDirective} ${event.blockedURI}`);
        });
      });
      await page.goto(path);
      await page.waitForLoadState("networkidle");

      const icons = await page.evaluate(() =>
        [
          ...document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]'),
        ].map((link) => ({
          rel: link.getAttribute("rel"),
          path: new URL(link.getAttribute("href") ?? "", location.href).pathname,
          type: link.getAttribute("type"),
        })),
      );
      expect(icons).toEqual([
        { rel: "icon", path: "/favicon.ico", type: "image/x-icon" },
        { rel: "icon", path: "/icon.svg", type: "image/svg+xml" },
        { rel: "apple-touch-icon", path: "/apple-icon.png", type: "image/png" },
      ]);
      for (const { path: iconPath, type } of icons) {
        const response = await page.request.get(iconPath);
        expect(response.status()).toBe(200);
        expect(response.headers()["content-type"]).toContain(type ?? "");
      }

      const meta = (selector: string) =>
        page.locator(selector).first().getAttribute("content");
      for (const selector of [
        'meta[property="og:image"]',
        'meta[name="twitter:image"]',
      ]) {
        expect(await meta(selector)).toMatch(
          /^https:\/\/redactnest\.test\/opengraph-image\.png(\?|$)/,
        );
      }
      expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
      expect(await meta('meta[property="og:image:alt"]')).toBe(
        "RedactNest. PDF redaction in your browser. Redaction that actually removes the text.",
      );
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

      expect(await page.evaluate(() => Reflect.get(window, "__violations"))).toEqual([]);
    });
  }
});

/** Spec 0013, AC-9. Every address that is not a page. */
test.describe("the 404 page", () => {
  test("answers 404, unindexed, with a way into the tool and a way home", async ({
    page,
  }) => {
    const response = await page.goto("/no-such-page");

    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle("Page not found · RedactNest");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "This page doesn’t exist",
    );
    const main = page.getByRole("main");
    await expect(main).toContainText(
      "The address may be mistyped, or the page may have moved.",
    );
    await expect(main.getByRole("link", { name: "Try it free" })).toHaveAttribute(
      "href",
      "/tool",
    );
    await expect(main.getByRole("link", { name: "Go to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
    // The shell every page has.
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
  });
});

/** Spec 0013, AC-22. Pricing's two cards, under today's title and lead. */
test.describe("the pricing page", () => {
  test("keeps its title and lead, then sets Free and Pro side by side from md", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/pricing");

    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Pricing");
    await expect(page.getByRole("main")).toContainText(
      "Every plan redacts in your own browser, and your document never leaves your machine.",
    );
    const free = page.getByRole("region", { name: "Free" });
    const pro = page.getByRole("region", { name: "Pro" });
    await expect(free).toContainText("Up to 3 pages a document");
    await expect(pro).toContainText("$19 a month");
    await expect(pro).toContainText("Up to 50 pages a document");
    await expect(pro).toContainText("Everything in Free");
    const [freeBox, proBox] = [await free.boundingBox(), await pro.boundingBox()];
    expect(freeBox?.y).toBe(proBox?.y);
    expect((freeBox?.x ?? 0) + (freeBox?.width ?? 0)).toBeLessThan(proBox?.x ?? 0);
    expect(await pro.evaluate((card) => getComputedStyle(card).borderTopWidth)).toBe(
      "2px",
    );

    await expect(pro.getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      "/account/subscribe",
    );
  });

  test("stacks the cards below md", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto("/pricing");

    const free = await page.getByRole("region", { name: "Free" }).boundingBox();
    const pro = await page.getByRole("region", { name: "Pro" }).boundingBox();
    expect((free?.y ?? 0) + (free?.height ?? 0)).toBeLessThanOrEqual(pro?.y ?? 0);
  });

  /** INV-4: Free's way into the tool is a real page load. */
  test("loads /tool as a document from Free's card", async ({ page }) => {
    await page.goto("/pricing");

    await page
      .getByRole("region", { name: "Free" })
      .getByRole("link", { name: "Try it free" })
      .click();
    await expect(page).toHaveURL(/\/tool$/);
    const loadedAt = await page.evaluate(
      () => performance.getEntriesByType("navigation")[0]?.name ?? "",
    );
    expect(new URL(loadedAt).pathname).toBe("/tool");
  });
});
