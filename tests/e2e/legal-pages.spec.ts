import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { PRIVACY_SECTIONS, TERMS_SECTIONS } from "../../src/lib/policy-sections";

/**
 * The privacy policy and the terms of service, in a real browser. Spec 0011, AC-1
 * to AC-5, AC-18 and AC-19.
 *
 * The component tests render both pages without styles or layout. These prove
 * what only a browser can: the shell and the metadata as Next.js serves them,
 * the footer's Legal nav on every page with real target sizes, the line under
 * the drop zone on `/tool`, axe with styles applied, reflow at 320 pixels and
 * at 200% text, and the leave warning through the footer's links.
 */

const PAGES = [
  {
    path: "/privacy",
    title: "Privacy policy",
    sections: Object.values(PRIVACY_SECTIONS),
  },
  {
    path: "/terms",
    title: "Terms of service",
    sections: Object.values(TERMS_SECTIONS),
  },
] as const;

const EVERY_ROUTE = ["/", "/tool", "/privacy", "/terms"] as const;

/** Spec 0003, AC-18: the rule tags this product commits to. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** One address and one number, both found and ticked by default. */
const TEXT_PAGE = resolve("tests/fixtures/text-page.pdf");
const PHONE = "020 7946 0958";

const NOTICE =
  "By choosing a PDF you agree to the Terms of service. The Privacy policy explains what happens to your data.";

async function expectNoAxeViolations(page: Page): Promise<void> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();

  expect(
    violations,
    violations
      .map(
        (violation) =>
          `${violation.id}: ${violation.help}\n${violation.nodes
            .map((node) => `  ${node.target.join(" ")}`)
            .join("\n")}`,
      )
      .join("\n"),
  ).toEqual([]);
}

/** Nothing scrolls sideways, which is what WCAG 1.4.10 asks at 320px. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** At least 24 by 24 CSS pixels (WCAG 2.5.8). */
async function expectTarget(link: Locator): Promise<void> {
  const box = await link.boundingBox();
  expect(box?.width, "narrower than 24px").toBeGreaterThanOrEqual(24);
  expect(box?.height, "shorter than 24px").toBeGreaterThanOrEqual(24);
}

/** The ring from the global `:focus-visible` rule, as the browser drew it. */
async function expectFocusRing(target: Locator): Promise<void> {
  const ring = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      ringed: element.matches(":focus-visible"),
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
    };
  });
  expect(ring).toEqual({ ringed: true, style: "solid", width: "2px", offset: "2px" });
}

for (const { path, title, sections } of PAGES) {
  test.describe(`${path}`, () => {
    /** covers: AC-1, AC-3 */
    test("has the shell, one h1, and the outline's h2 sections in order", async ({
      page,
    }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(200);

      await expect(page).toHaveTitle(`${title} · RedactNest`);
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      await expect(page.locator("main")).toHaveAttribute("id", "main");
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.locator("main h2")).toHaveText([...sections]);

      // The way into the tool is a real page load (spec 0003, INV-10).
      const button = page.getByRole("banner").getByRole("link", { name: "Redact a PDF" });
      await expect(button).toHaveAttribute("href", "/tool");
    });

    /** covers: AC-3. Its own description, and nothing asking to stay unindexed. */
    test("is indexable, with its own description", async ({ page }) => {
      await page.goto(path);

      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        "content",
        /\S/,
      );
      await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
    });

    /** covers: AC-2 */
    test("dates Last updated and every change in a machine readable time", async ({
      page,
    }) => {
      await page.goto(path);

      const updated = page.getByTestId("last-updated");
      await expect(updated).toHaveText(/^Last updated \d{1,2} [A-Z][a-z]+ \d{4}$/);
      const newest = await updated.locator("time").getAttribute("datetime");
      expect(newest).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const entries = page.getByTestId("changes").getByRole("listitem");
      await expect(entries.first().locator("time")).toHaveAttribute(
        "datetime",
        newest ?? "",
      );
      for (const entry of await entries.all()) {
        await expect(entry).toHaveText(/^\d{1,2} [A-Z][a-z]+ \d{4}: \S/);
      }
    });

    /** covers: AC-18 */
    test("axe reports nothing", async ({ page }) => {
      await page.goto(path);

      await expectNoAxeViolations(page);
    });

    /** covers: AC-18. h1, then h2 and h3, never skipping a level. */
    test("never skips a heading level", async ({ page }) => {
      await page.goto(path);

      const levels = await page
        .locator("h1, h2, h3, h4, h5, h6")
        .evaluateAll((headings) =>
          headings.map((heading) => Number(heading.tagName.slice(1))),
        );
      expect(levels[0]).toBe(1);
      for (const [index, level] of levels.entries()) {
        if (index > 0) expect(level).toBeLessThanOrEqual(levels[index - 1] + 1);
      }
    });

    /** covers: AC-18. Underlined, and ringed when a keyboard lands on each one. */
    test("underlines every link in the text, and rings each as Tab reaches it", async ({
      page,
    }) => {
      await page.goto(path);

      const links = await page.locator("main a").all();
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(
          await link.evaluate((element) => getComputedStyle(element).textDecorationLine),
        ).toContain("underline");
      }

      // From the top of main, each Tab lands on the next link in the text,
      // so every link is proved reachable in reading order and ringed there,
      // the services list and the contact included.
      await page.locator("main").focus();
      for (const link of links) {
        await page.keyboard.press("Tab");
        await expect(link).toBeFocused();
        await expectFocusRing(link);
      }
    });

    /** covers: AC-18 */
    test("needs no sideways scroll at 320 CSS pixels", async ({ page }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);

      await expectNoHorizontalScroll(page);
    });

    /** covers: AC-18. WCAG 1.4.4 at an ordinary desktop width. */
    test("clips nothing with the root font size doubled", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

      await expectNoHorizontalScroll(page);
    });

    /**
     * covers: AC-19, INV-6. No cap as a number, and no word for the source
     * repository. The terms' 12 months and US$100 are not limits on the visitor.
     */
    test("states no cap as a number and never mentions the repository", async ({
      page,
    }) => {
      await page.goto(path);
      const text = (await page.getByRole("main").textContent()) ?? "";

      expect(text).not.toMatch(/repositor|github|commit/i);
      expect(text).not.toMatch(/\d[\d,.]*\s*(pages?|MB|megabytes?)\b/i);
      expect(text).not.toMatch(/\b(pages?|MB)\s*\d/i);
    });
  });
}

/** AC-4. The footer's Legal nav, on every page, before the licence notice. */
test.describe("the footer's Legal nav", () => {
  for (const path of EVERY_ROUTE) {
    test(`is on ${path}, before the licence notice, with two plain links`, async ({
      page,
    }) => {
      await page.goto(path);
      const footer = page.getByRole("contentinfo");
      const nav = footer.getByRole("navigation", { name: "Legal" });

      const links = nav.getByRole("link");
      await expect(links).toHaveText(["Privacy policy", "Terms of service"]);
      await expect(links.nth(0)).toHaveAttribute("href", "/privacy");
      await expect(links.nth(1)).toHaveAttribute("href", "/terms");
      for (const link of await links.all()) {
        await expect(link).not.toHaveAttribute("target", /.*/);
        await expectTarget(link);
      }

      // The licence notice is still the footer's one paragraph, after the nav.
      await expect(footer.locator("p")).toHaveCount(1);
      const navFirst = await nav.evaluate((element) => {
        const notice = element.closest("footer")?.querySelector("p");
        return Boolean(
          notice &&
          element.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING,
        );
      });
      expect(navFirst).toBe(true);
    });

    test(`wraps on ${path} at 320 CSS pixels with no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);

      await expectNoHorizontalScroll(page);
      for (const link of await page.getByRole("contentinfo").getByRole("link").all()) {
        await expectTarget(link);
      }
    });
  }

  /** covers: AC-4. Following a footer link is a real page load, so it lands. */
  test("each link opens its page in the same tab", async ({ page }) => {
    for (const { title } of PAGES) {
      await page.goto("/");
      await page.getByRole("contentinfo").getByRole("link", { name: title }).click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    }
  });

  /**
   * covers: AC-4. A plain link in the same tab is a real page load, so spec
   * 0007's leave warning still guards ticked work on `/tool`.
   */
  test("following the Privacy policy link from ticked work brings the leave warning", async ({
    page,
  }) => {
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(TEXT_PAGE);
    // A 10 MB WebAssembly payload has to arrive and compile first.
    await expect(page.getByRole("checkbox", { name: PHONE })).toBeChecked({
      timeout: 60_000,
    });
    await page.getByRole("checkbox", { name: PHONE }).click();

    const asked: string[] = [];
    page.on("dialog", async (dialog) => {
      asked.push(dialog.type());
      await dialog.dismiss();
    });
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Privacy policy" })
      .click();

    await expect.poll(() => asked).toEqual(["beforeunload"]);
    await expect(page).toHaveURL(/\/tool$/);
    await expect(page.getByRole("checkbox", { name: PHONE })).not.toBeChecked();
  });

  /** covers: AC-4 */
  for (const path of ["/", "/tool"] as const) {
    test(`axe reports nothing on ${path} with the nav in place`, async ({ page }) => {
      await page.goto(path);

      await expectNoAxeViolations(page);
    });
  }
});

/** AC-5. The line under the drop zone on `/tool`. */
test.describe("the terms notice on /tool", () => {
  test("reads in full under the drop zone, outside the live region, with two links", async ({
    page,
  }) => {
    await page.goto("/tool");
    const notice = page.getByTestId("terms-notice");

    await expect(notice).toHaveText(NOTICE);
    await expect(notice.getByRole("link")).toHaveText([
      "Terms of service",
      "Privacy policy",
    ]);
    await expect(notice.getByRole("link", { name: "Terms of service" })).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(notice.getByRole("link", { name: "Privacy policy" })).toHaveAttribute(
      "href",
      "/privacy",
    );
    for (const link of await notice.getByRole("link").all()) {
      await expect(link).not.toHaveAttribute("target", /.*/);
      await expectTarget(link);
    }

    const placed = await notice.evaluate((element) => ({
      afterZone:
        element.previousElementSibling?.getAttribute("data-testid") === "drop-area",
      inLiveRegion: element.closest("[aria-live]") !== null,
    }));
    expect(placed).toEqual({ afterZone: true, inLiveRegion: false });
  });

  /** covers: AC-5. Small text in the muted colour. */
  test("is small and muted", async ({ page }) => {
    await page.goto("/tool");

    const style = await page.getByTestId("terms-notice").evaluate((element) => ({
      size: getComputedStyle(element).fontSize,
      colour: getComputedStyle(element).color,
    }));
    expect(style.size).toBe("14px");
    // `ink-muted`, #56616b.
    expect(style.colour).toBe("rgb(86, 97, 107)");
  });

  test("goes once the file bar replaces the drop zone", async ({ page }) => {
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(TEXT_PAGE);

    await expect(page.getByTestId("file-bar")).toBeVisible();
    await expect(page.getByTestId("terms-notice")).toHaveCount(0);
  });
});
