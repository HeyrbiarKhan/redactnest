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
      page
        .getByRole("main")
        .getByRole("link", { name: "Remove text from a PDF" })
        .first(),
    ).toBeVisible();
  });

  /** A real link, reachable and operable without a mouse. */
  test("a keyboard reaches it and Enter follows it", async ({ page }) => {
    await page.goto("/");

    await page
      .getByRole("main")
      .getByRole("link", { name: "Remove text from a PDF" })
      .first()
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

      // The hero's, the first of the main content's two (spec 0026, AC-8).
      await page.getByRole(landmark).getByRole("link", { name }).first().click();
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

  /** Spec 0013, AC-9: the 404's own Try it free, as every other way in. */
  test("the 404's Try it free button loads /tool as a document", async ({ page }) => {
    await page.goto("/no-such-page");

    await page.getByRole("main").getByRole("link", { name: "Try it free" }).click();
    await expect(page).toHaveURL(/\/tool$/);

    const loadedAt = await page.evaluate(
      () => performance.getEntriesByType("navigation")[0]?.name ?? "",
    );
    expect(new URL(loadedAt).pathname).toBe("/tool");
  });

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
      for (const link of await page.getByRole(landmark).getByRole("link", { name }).all())
        await link.hover();
    }
    await page.waitForLoadState("networkidle");

    expect(toolRequests).toEqual([]);
  });
});

/**
 * Spec 0012, AC-9 and INV-10. Every page's header links to Pricing and, for a
 * visitor not signed in, Sign in (spec 0026, AC-5) as plain links, so nothing prefetches Pricing, an account page or the page
 * that starts a checkout. `next/link` prefetches on sight and again on hover,
 * so both get their chance before the count is read, as for the tool above.
 */
test.describe("the header's Pricing and Sign in links", () => {
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
        ["Sign in", "/sign-in"],
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
    ["/no-such-page", null],
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

    for (const name of ["How it works", "Security", "Pricing", "Sign in"]) {
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
   * Below `sm`, with billing on and signed out, the lockup and the menu button
   * share one row, and the nav and Sign in wait in the menu; the button opens
   * it beneath the header, the links stacked in page order, so focus never
   * moves back up the screen (feature 28, as spec 0026 child 0001 AC-27
   * amends AC-7). On a row narrower than 20.5rem (a 360 pixel window) Try it
   * free waits there too, last, because beside the lockup and the button it
   * left 5 pixels at 320 on Windows and wrapped the button on Linux, whose
   * Inter is wider (`ROW_UNLESS_NARROW`). The row is held by boxes against
   * boxes, so a font's width can only fail it by really wrapping it.
   */
  // 305 is 320 less a classic scrollbar (spec 0024, *The lockup at narrow widths*).
  for (const width of [320, 305]) {
    test(`folds the links into a menu at ${width} pixels, with no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 640 });
      await page.goto("/");
      const header = page.getByRole("banner");
      const links = ["How it works", "Security", "Pricing", "Sign in", "Try it free"].map(
        (name) => header.getByRole("link", { name, exact: true }),
      );

      const row = [];
      for (const control of [
        header.getByRole("link", { name: "RedactNest", exact: true }),
        header.getByRole("button", { name: "Menu", exact: true }),
      ]) {
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
      row.reduce((before, box) => {
        expect(box.x).toBeGreaterThanOrEqual(before.x + before.width);
        return box;
      });
      for (const link of links) await expect(link).toBeHidden();

      await header.getByRole("button", { name: "Menu", exact: true }).click();
      const bar = await header.boundingBox();
      const tops: number[] = [];
      for (const link of links) {
        await expect(link).toBeVisible();
        tops.push((await link.boundingBox())?.y ?? Number.NaN);
      }
      for (const top of tops) {
        expect(top).toBeGreaterThanOrEqual((bar?.y ?? 0) + (bar?.height ?? 0));
      }
      tops.reduce((above, top) => {
        expect(top).toBeGreaterThan(above);
        return top;
      });

      const scroll = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        viewport: document.documentElement.clientWidth,
      }));
      expect(scroll.width).toBeLessThanOrEqual(scroll.viewport);
    });
  }

  /** From `sm`, the lockup, the nav, Sign in and the button on one row, the button last. */
  for (const width of [640, 1280]) {
    test(`sits on one row with the button at the right at ${width} pixels`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/");
      const header = page.getByRole("banner");

      const boxes = [];
      for (const name of [
        "RedactNest",
        "How it works",
        "Security",
        "Pricing",
        "Sign in",
        "Try it free",
      ]) {
        const box = await header.getByRole("link", { name, exact: true }).boundingBox();
        if (box === null) throw new Error(`${name} has no box`);
        boxes.push(box);
      }
      const middles = boxes.map(({ y, height }) => y + height / 2);
      for (const middle of middles) expect(Math.abs(middle - middles[0])).toBeLessThan(2);
      const lefts = boxes.map(({ x }) => x);
      expect(lefts).toEqual([...lefts].sort((a, b) => a - b));
      // Feature 28: from `sm` the links are in the row, so no Menu button.
      await expect(
        header.getByRole("button", { name: "Menu", exact: true }),
      ).toBeHidden();
    });
  }

  /**
   * Feature 28, amending AC-7: the open menu marks the current page as the
   * row does, and on `/tool`, which offers no Try it free and no How it works
   * (spec 0026, child 0001, AC-30), holds Security, Pricing and Sign in only.
   */
  test("marks the current page in the open menu, and holds no Try it free on the tool", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    const header = page.getByRole("banner");
    const menu = header.locator("[popover]");

    await page.goto("/pricing");
    await header.getByRole("button", { name: "Menu", exact: true }).click();
    const current = menu.locator('[aria-current="page"]');
    await expect(current).toHaveText(["Pricing"]);
    await expect(current).toBeVisible();
    const bar = await current.evaluate((link) => {
      const after = getComputedStyle(link, "::after");
      return { width: after.borderBottomWidth, style: after.borderBottomStyle };
    });
    expect(bar).toEqual({ width: "2px", style: "solid" });

    await page.goto("/tool");
    await header.getByRole("button", { name: "Menu", exact: true }).click();
    await expect(menu.getByRole("link")).toHaveText(["Security", "Pricing", "Sign in"]);
    for (const link of await menu.getByRole("link").all())
      await expect(link).toBeVisible();
    await expect(menu.locator('[aria-current="page"]')).toHaveCount(0);
  });

  /**
   * Feature 28, amending AC-7: a menu still open when the window widens past
   * `sm` (a phone turned sideways) keeps its button and shows its links in one
   * row beneath the header until it is closed; then the button goes and the
   * links sit in the header's own row. Try it free never joins the menu on a
   * row this wide (20.5rem or more, `ROW_UNLESS_NARROW`): it stays in the
   * header's row throughout (spec 0026, child 0001, AC-27), and
   * so does Sign in from `sm`, where the account slot's row shows it and its
   * menu part is hidden.
   */
  test("keeps a menu left open as the window widens, its links in one row, until it is closed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const header = page.getByRole("banner");
    const button = header.getByRole("button", { name: "Menu", exact: true });
    const lockup = header.getByRole("link", { name: "RedactNest", exact: true });
    const action = header.getByRole("link", { name: "Try it free", exact: true });
    const signIn = header.getByRole("link", { name: "Sign in", exact: true });
    const links = ["How it works", "Security", "Pricing"].map((name) =>
      header.getByRole("link", { name, exact: true }),
    );
    const middles = async (of = links) => {
      const found: number[] = [];
      for (const link of of) {
        const box = await link.boundingBox();
        if (box === null) throw new Error("a link has no box");
        found.push(box.y + box.height / 2);
      }
      return found;
    };

    await button.click();
    await page.setViewportSize({ width: 844, height: 390 });

    await expect(button).toBeVisible();
    const bar = await header.boundingBox();
    const open = await middles();
    for (const middle of open) {
      expect(Math.abs(middle - (open[0] ?? 0))).toBeLessThan(2);
      expect(middle).toBeGreaterThan((bar?.y ?? 0) + (bar?.height ?? 0));
    }
    const atOpen = await lockup.boundingBox();
    for (const middle of await middles([signIn, action])) {
      expect(
        Math.abs(middle - ((atOpen?.y ?? 0) + (atOpen?.height ?? 0) / 2)),
      ).toBeLessThan(2);
    }

    await button.click();

    await expect(button).toBeHidden();
    const home = await lockup.boundingBox();
    const closed = await middles([...links, signIn, action]);
    for (const middle of closed) {
      expect(Math.abs(middle - ((home?.y ?? 0) + (home?.height ?? 0) / 2))).toBeLessThan(
        2,
      );
    }
  });

  /**
   * The current item in semibold `ink` over its `accent` bar, the others in
   * `ink-muted`, underlined under the pointer only, read as the browser paints
   * them against the tokens in `globals.css`.
   */
  test("paints the current item ink over an accent bar, and underlines only the others on hover", async ({
    page,
  }) => {
    await page.goto("/pricing");
    const header = page.getByRole("banner");
    const current = header.getByRole("link", { name: "Pricing", exact: true });
    const other = header.getByRole("link", { name: "Security", exact: true });
    const token = (role: string) =>
      page.evaluate((name) => {
        const probe = document.createElement("span");
        probe.style.color = `var(--color-${name})`;
        document.body.append(probe);
        const colour = getComputedStyle(probe).color;
        probe.remove();
        return colour;
      }, role);
    const look = (link: typeof current) =>
      link.evaluate((element) => ({
        colour: getComputedStyle(element).color,
        underline: getComputedStyle(element).textDecorationLine,
        bar: getComputedStyle(element, "::after").borderBottomColor,
      }));

    const [ink, muted, accent] = [
      await token("ink"),
      await token("ink-muted"),
      await token("accent"),
    ];
    expect(await look(current)).toMatchObject({
      colour: ink,
      underline: "none",
      bar: accent,
    });
    expect(await look(other)).toMatchObject({ colour: muted, underline: "none" });

    await other.hover();
    expect((await look(other)).underline).toBe("underline");
    await current.hover();
    expect((await look(current)).underline).toBe("none");
  });
});

/**
 * Spec 0013, AC-8. The footer's brand column and link groups, with the
 * security page in the Product group (spec 0018, AC-2) and the search pages'
 * Guides group between Product and Legal (spec 0024, AC-9).
 */
test.describe("the footer", () => {
  for (const path of [
    "/",
    "/tool",
    "/security",
    "/redact-pdf",
    "/remove-text-from-pdf",
    "/black-box-redaction",
  ]) {
    test(`shows the brand line and its three groups on ${path}`, async ({ page }) => {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");

      await expect(footer).toContainText("RedactNest");
      await expect(footer).toContainText("PDF redaction in your browser.");
      await expect(
        footer.getByRole("navigation", { name: "Product" }).getByRole("link"),
      ).toHaveText(["Redact a PDF", "Security", "Pricing"]);
      await expect(
        footer.getByRole("navigation", { name: "Product" }).getByRole("link", {
          name: "Security",
        }),
      ).toHaveAttribute("href", "/security");
      const guides = footer.getByRole("navigation", { name: "Guides" });
      await expect(guides.getByRole("link")).toHaveText([
        "Redacting a PDF",
        "Removing text from a PDF",
        "Black box redaction",
      ]);
      expect(
        await guides
          .getByRole("link")
          .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
      ).toEqual(["/redact-pdf", "/remove-text-from-pdf", "/black-box-redaction"]);
      for (const link of await guides.getByRole("link").all()) {
        expect((await link.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(24);
      }
      await expect(
        footer.getByRole("navigation", { name: "Legal" }).getByRole("link"),
      ).toHaveText(["Privacy policy", "Terms of service"]);
      // Product, then Guides, then Legal.
      expect(
        await footer
          .getByRole("navigation")
          .evaluateAll((navs) => navs.map((nav) => nav.getAttribute("aria-label"))),
      ).toEqual(["Product", "Guides", "Legal"]);
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
        "RedactNest. Runs in your browser. Never uploaded. Redaction that actually removes the text.",
      );
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);

      expect(await page.evaluate(() => Reflect.get(window, "__violations"))).toEqual([]);
    });
  }
});

/**
 * Spec 0024, AC-2 and AC-11: the head on `/` and on each search page, with
 * absolute addresses on the build's site (`https://redactnest.test`). A
 * search page carries its own title, description, canonical, Open Graph and
 * card; `/` the site line, a canonical to the root and the site's own card.
 * Nothing asks not to be indexed, and there is no manifest.
 */
test.describe("the head on / and the search pages", () => {
  const SITE = "https://redactnest.test";
  const SITE_LINE =
    "Redact PDFs in your browser, with nothing uploaded. The selectable text you tick is taken out of the page, then marked, and every new file is checked before you download it.";
  const SEARCH_HEADS = [
    {
      path: "/redact-pdf",
      title: "Redact a PDF online, free and without uploading",
      description:
        "Redact a PDF in your browser. RedactNest looks for details such as email addresses and phone numbers, and the selectable text you tick is taken out of the page.",
      alt: "RedactNest. Redact a PDF. Redact a PDF without uploading it.",
      primary: "Redact a PDF now",
    },
    {
      path: "/remove-text-from-pdf",
      title: "Remove text from a PDF, not just cover it",
      description:
        "Take text out of a PDF instead of only covering it: tick what to remove, and RedactNest takes the selectable text out of the page, then marks where it was.",
      alt: "RedactNest. Remove text from a PDF. Take text out of a PDF, not just cover it.",
      primary: "Remove text from a PDF",
    },
    {
      path: "/black-box-redaction",
      title: "Why a black box over text isn't redaction",
      description:
        "A box drawn over text can leave the words in the PDF, where copy and paste or search can still reach them. How to check a file, and what real redaction does.",
      alt: "RedactNest. Black box redaction. A black box over text isn't redaction.",
      primary: "Redact a PDF properly",
    },
  ] as const;

  const meta = (page: Page, selector: string) =>
    page.locator(selector).first().getAttribute("content");

  test("/ carries the site line, a canonical to the root and the WebSite block", async ({
    page,
  }) => {
    await page.goto("/");

    expect(await meta(page, 'meta[name="description"]')).toBe(SITE_LINE);
    // Next.js writes the root with no trailing slash; it is the same address.
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    expect(new URL(canonical ?? "").href).toBe(`${SITE}/`);
    await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
    const blocks = page.locator('script[type="application/ld+json"]');
    await expect(blocks).toHaveCount(1);
    expect(JSON.parse((await blocks.textContent()) ?? "")).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "RedactNest",
      url: SITE,
    });
  });

  for (const head of SEARCH_HEADS) {
    test(`${head.path} carries its own head and card`, async ({ page }) => {
      const response = await page.goto(head.path);
      expect(response?.status()).toBe(200);

      const address = `${SITE}${head.path}`;
      await expect(page).toHaveTitle(`${head.title} · RedactNest`);
      expect(await meta(page, 'meta[name="description"]')).toBe(head.description);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        "href",
        address,
      );
      for (const [selector, value] of [
        ['meta[property="og:title"]', head.title],
        ['meta[name="twitter:title"]', head.title],
        ['meta[property="og:description"]', head.description],
        ['meta[name="twitter:description"]', head.description],
        ['meta[property="og:url"]', address],
        ['meta[property="og:type"]', "website"],
        ['meta[property="og:site_name"]', "RedactNest"],
        ['meta[property="og:image:alt"]', head.alt],
        ['meta[name="twitter:card"]', "summary_large_image"],
      ] as const) {
        expect(await meta(page, selector), selector).toBe(value);
      }
      const image = await meta(page, 'meta[property="og:image"]');
      expect(image).toMatch(
        new RegExp(`^${address.replaceAll(".", "\\.")}/opengraph-image\\.png(\\?|$)`),
      );
      expect(await meta(page, 'meta[name="twitter:image"]')).toBe(image);
      const card = await page.request.get(
        new URL(image ?? "").pathname + new URL(image ?? "").search,
      );
      expect(card.status()).toBe(200);
      expect(card.headers()["content-type"]).toContain("image/png");
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
      await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);
      // AC-1: no script element of the page's own, the data block included.
      await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(0);
    });

    /** AC-4 and spec 0003, INV-10: both buttons are real page loads into /tool. */
    test(`${head.path}'s two buttons load /tool as a document, and nothing prefetches it`, async ({
      page,
    }) => {
      const toolRequests: string[] = [];
      page.on("request", (request) => {
        const { pathname } = new URL(request.url());
        if (pathname.startsWith("/tool") && request.resourceType() !== "document") {
          toolRequests.push(pathname);
        }
      });
      await page.goto(head.path);
      await page.waitForLoadState("networkidle");
      const buttons = page.getByTestId("search-page").getByRole("link", {
        name: head.primary,
        exact: true,
      });
      await expect(buttons).toHaveCount(2);
      for (const button of await buttons.all()) await button.hover();
      await page.waitForLoadState("networkidle");
      expect(toolRequests).toEqual([]);

      for (const index of [0, 1]) {
        await page.goto(head.path);
        await buttons.nth(index).click();
        await expect(page).toHaveURL(/\/tool$/);
        const loadedAt = await page.evaluate(
          () => performance.getEntriesByType("navigation")[0]?.name ?? "",
        );
        expect(new URL(loadedAt).pathname).toBe("/tool");
      }
    });

    /** AC-7: the look over link lands on the security page's What it can miss. */
    test(`${head.path}'s look over link lands on a heading that exists`, async ({
      page,
    }) => {
      await page.goto(head.path);
      await page
        .getByTestId("search-page")
        .getByRole("link", { name: "What it can miss" })
        .click();

      await expect(page).toHaveURL(/\/security#what-it-can-miss$/);
      await expect(page.locator("main h2#what-it-can-miss")).toHaveText(
        "What it can miss",
      );
    });
  }
});

/**
 * Spec 0024, AC-10: the sitemap and the robots file, as served. Every address
 * absolute on the build's site, Pricing listed because the build has billing
 * on, nothing under the account pages or `/api`, and no date.
 */
test.describe("the sitemap and the robots file", () => {
  test("/sitemap.xml lists every public page and nothing else", async ({ request }) => {
    const response = await request.get("/sitemap.xml");
    expect(response.status()).toBe(200);
    const xml = await response.text();

    const addresses = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, at]) => at);
    expect(addresses).toEqual(
      [
        "/",
        "/redact-pdf",
        "/remove-text-from-pdf",
        "/black-box-redaction",
        "/tool",
        "/security",
        "/privacy",
        "/terms",
        "/pricing",
      ].map((path) => `https://redactnest.test${path}`),
    );
    expect(xml).not.toMatch(/<lastmod>|<changefreq>|<priority>/);
  });

  test("/robots.txt allows everything but /api/ and /sign-out, and names the sitemap", async ({
    request,
  }) => {
    const response = await request.get("/robots.txt");
    expect(response.status()).toBe(200);
    const text = await response.text();

    expect(text).toMatch(/User-Agent: \*/i);
    expect(text).toMatch(/^Allow: \/$/m);
    expect(text).toMatch(/^Disallow: \/api\/$/m);
    // Spec 0026 child 0001, AC-26: an action, not a page.
    expect(text).toMatch(/^Disallow: \/sign-out$/m);
    expect(text).toContain("Sitemap: https://redactnest.test/sitemap.xml");
    expect(text).not.toMatch(/account|sign-in|sign-up/);
  });

  /**
   * The marketing brief of 2026-11-28, item 2: `/llms.txt` as served, UTF-8
   * plain text on the build's site, with Pro and Pricing because the build
   * has billing on, and the source of the commit built. Its words are
   * `tests/unit/llms-text.test.ts`'s.
   */
  test("/llms.txt is UTF-8 plain text built for this site", async ({ request }) => {
    const response = await request.get("/llms.txt");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("text/plain; charset=utf-8");
    const text = await response.text();

    expect(text.startsWith("# RedactNest\n\n> PDF redaction in your browser.")).toBe(
      true,
    );
    expect(text).toContain("https://redactnest.test/security#what-it-can-miss");
    expect(text).toContain("- [Pricing](https://redactnest.test/pricing)");
    expect(text).toContain(
      `- [Source code](${SOURCE_URL}): the source of the version running`,
    );
  });
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
