import { resolve } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * WCAG 2.2 AA on the core path, proved in a real browser. Spec 0003.
 *
 * jsdom computes no layout, no colour and no forced colours, so everything here
 * is something the component tests cannot see: axe with real styles applied,
 * focus moving through a real tab order, boxes with real sizes, and the page at
 * 320px, at 200% text, with reduced motion and in forced colours.
 *
 * axe finds only part of what WCAG covers. A clean run here does not replace the
 * keyboard and screen reader pass at `/check verify`.
 */

const FIXTURE = resolve("tests/fixtures/two-pages.pdf");

// A 10 MB WebAssembly payload has to arrive and compile first.
const ENGINE_TIMEOUT = 60_000;

/** AC-18: the rule tags this product commits to. */
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

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

async function openDocument(page: Page): Promise<void> {
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("page-count")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

async function failToOpen(page: Page): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name: "not-really.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is not a PDF"),
  });
  await expect(page.getByTestId("error")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/** The three states the tool page can be in today (AC-18). */
const TOOL_STATES: readonly (readonly [string, (page: Page) => Promise<void>])[] = [
  ["idle", async () => {}],
  ["failed", failToOpen],
  ["opened", openDocument],
];

/** Nothing scrolls sideways, which is what WCAG 1.4.10 asks at 320px. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** A box whose content spills past it, which is what clipping looks like. */
async function expectContained(box: Locator): Promise<void> {
  const size = await box.evaluate((element) => ({
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(size.scrollWidth).toBeLessThanOrEqual(size.clientWidth);
  expect(size.scrollHeight).toBeLessThanOrEqual(size.clientHeight);
}

interface TargetBox {
  readonly name: string;
  readonly tag: string;
  readonly width: number;
  readonly height: number;
}

/** Every element a visitor can reach or press, with the box it occupies. */
async function targetBoxes(page: Page): Promise<TargetBox[]> {
  return page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, summary, [tabindex]",
      ),
    ]
      .filter((element) => element.tagName !== "MAIN")
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          name:
            element.dataset.testid ??
            element.getAttribute("href") ??
            element.textContent?.trim() ??
            element.tagName,
          tag: element.tagName.toLowerCase(),
          width: rect.width,
          height: rect.height,
        };
      }),
  );
}

/**
 * AC-7. At least 24 by 24 for every target, and 40px tall for every button.
 *
 * Some elements are visually hidden on purpose and so have no box to measure:
 * the skip link until it is focused, and on the tool page the file input, which
 * is not a tab stop at all. Anything else hidden that way is a control nobody
 * can see.
 */
async function expectTargetSizes(
  page: Page,
  hiddenOnPurpose: readonly string[] = ["#main", "file-input"],
): Promise<void> {
  const boxes = await targetBoxes(page);
  const hidden = boxes.filter((box) => box.width <= 1 || box.height <= 1);
  const shown = boxes.filter((box) => box.width > 1 && box.height > 1);

  expect(hidden.map((box) => box.name).sort()).toEqual([...hiddenOnPurpose].sort());

  for (const box of shown) {
    expect(box.width, `${box.name} is narrower than 24px`).toBeGreaterThanOrEqual(24);
    expect(box.height, `${box.name} is shorter than 24px`).toBeGreaterThanOrEqual(24);
    if (box.tag === "button") {
      expect(box.height, `${box.name} is shorter than 40px`).toBeGreaterThanOrEqual(40);
    }
  }
}

/** AC-6: the ring itself, as the browser drew it. */
async function expectFocusRing(target: Locator): Promise<void> {
  const ring = await target.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      style: style.outlineStyle,
      width: style.outlineWidth,
      offset: style.outlineOffset,
    };
  });
  expect(ring.style).not.toBe("none");
  expect(ring.width).toBe("2px");
  expect(ring.offset).toBe("2px");
}

test.describe("axe on the tool page (AC-18)", () => {
  for (const [state, reach] of TOOL_STATES) {
    test(`reports nothing in the ${state} state`, async ({ page }) => {
      await page.goto("/tool");
      await reach(page);

      await expectNoAxeViolations(page);
    });
  }
});

test.describe("the keyboard walk on the tool page (AC-6, AC-14)", () => {
  test("starts at the skip link, then the wordmark, then the file picker", async ({
    page,
  }) => {
    await page.goto("/tool");

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    // Hidden until now, and shown the moment a keyboard reaches it.
    const shown = await skip.boundingBox();
    expect(shown?.height ?? 0).toBeGreaterThanOrEqual(24);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "RedactNest" })).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("choose-file")).toBeFocused();
    await expectFocusRing(page.getByTestId("choose-file"));
  });

  test("the skip link moves focus to main, so the next Tab is the file picker", async ({
    page,
  }) => {
    await page.goto("/tool");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("choose-file")).toBeFocused();
  });

  test("Start over is reached and ringed like every other control", async ({ page }) => {
    await page.goto("/tool");
    await openDocument(page);

    await page.getByTestId("choose-file").focus();
    await page.keyboard.press("Tab");

    await expect(page.getByTestId("start-over")).toBeFocused();
    await expectFocusRing(page.getByTestId("start-over"));
  });
});

test.describe("target sizes on the tool page (AC-7)", () => {
  for (const [state, reach] of TOOL_STATES) {
    test(`are large enough in the ${state} state`, async ({ page }) => {
      await page.goto("/tool");
      await reach(page);

      await expectTargetSizes(page);
    });
  }

  // An `lg` button with an icon, the other half of what the home page proves
  // for links. Exact, because a minimum let 50px through.
  test("the Choose a PDF button is exactly 48px tall", async ({ page }) => {
    await page.goto("/tool");

    const box = await page.getByTestId("choose-file").boundingBox();
    expect(box?.height).toBe(48);
  });
});

test.describe("reflow and zoom on the tool page (AC-15)", () => {
  test("needs no sideways scroll at 320 CSS pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/tool");
    await expectNoHorizontalScroll(page);

    await openDocument(page);
    await expectNoHorizontalScroll(page);
  });

  /**
   * WCAG 1.4.4 at an ordinary desktop width. Doubling the text at 320px as well
   * is roughly 800% zoom, which WCAG does not ask for: at that size a 48px
   * button's rem padding alone leaves no room for its label.
   */
  test("clips nothing with the root font size doubled", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    await expectNoHorizontalScroll(page);
    await expectContained(page.getByTestId("drop-area"));

    await openDocument(page);
    await expectNoHorizontalScroll(page);
    await expectContained(page.getByRole("region", { name: "Document opened" }));
  });
});

test.describe("reduced motion (AC-16)", () => {
  /**
   * The entitlement request is held, so "Checking your plan" and its spinner
   * stay on screen for the four second wait budget rather than flashing past.
   */
  async function showSpinner(page: Page): Promise<Locator> {
    await page.route("/api/entitlement", () => new Promise(() => {}));
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(FIXTURE);

    const spinner = page.getByTestId("spinner");
    await expect(spinner).toBeVisible();
    return spinner;
  }

  const animationName = (spinner: Locator) =>
    spinner.evaluate((element) => getComputedStyle(element).animationName);

  test("stops the spinner when the visitor asks for less motion", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const spinner = await showSpinner(page);

    expect(await animationName(spinner)).toBe("none");
  });

  /** The control, so the case above cannot pass on a spinner that never turned. */
  test("turns it otherwise", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const spinner = await showSpinner(page);

    expect(await animationName(spinner)).not.toBe("none");
  });

  test("removes colour transitions", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/tool");

    for (const target of [
      page.getByTestId("choose-file"),
      page.getByTestId("drop-area"),
    ]) {
      const property = await target.evaluate(
        (element) => getComputedStyle(element).transitionProperty,
      );
      expect(property).toBe("none");
    }
  });
});

test.describe("forced colours (AC-17, AC-18)", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
  });

  for (const [state, reach] of TOOL_STATES) {
    test(`axe reports nothing in the ${state} state`, async ({ page }) => {
      await page.goto("/tool");
      await reach(page);

      await expectNoAxeViolations(page);
    });
  }

  test("keeps the focus ring, the drop zone edge and the callout edge", async ({
    page,
  }) => {
    await page.goto("/tool");

    await page.getByTestId("choose-file").focus();
    await expectFocusRing(page.getByTestId("choose-file"));

    const edge = await page.getByTestId("drop-area").evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.borderTopStyle, width: style.borderTopWidth };
    });
    expect(edge).toEqual({ style: "dashed", width: "2px" });

    await failToOpen(page);
    const callout = await page.getByTestId("error").evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.borderTopStyle, width: style.borderTopWidth };
    });
    expect(callout).toEqual({ style: "solid", width: "1px" });
  });

  /**
   * A filled button relies on its fill, which forced colours removes. Its
   * transparent border is what the system paints instead, so the edge must be
   * there to be painted.
   */
  test("keeps an edge on the primary button once its fill is gone", async ({ page }) => {
    await page.goto("/tool");

    const edge = await page.getByTestId("choose-file").evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.borderTopStyle, width: style.borderTopWidth };
    });
    expect(edge).toEqual({ style: "solid", width: "1px" });
  });
});

test.describe("the fonts the page uses (AC-4)", () => {
  for (const path of ["/", "/tool"]) {
    test(`renders every piece of text on ${path} in Inter`, async ({ page }) => {
      await page.goto(path);

      const families = await page.evaluate(() => [
        ...new Set(
          [...document.querySelectorAll("body *")].map((element) =>
            getComputedStyle(element).fontFamily.split(",")[0]?.trim(),
          ),
        ),
      ]);
      // `next/font` names the self hosted face after the family it wraps.
      expect(families.every((family) => family?.includes("Inter"))).toBe(true);
    });
  }

  test("renders nothing smaller than 14px", async ({ page }) => {
    await page.goto("/tool");
    await openDocument(page);

    const smallest = await page.evaluate(() =>
      Math.min(
        ...[...document.querySelectorAll("body *")]
          .filter((element) => element.textContent?.trim())
          .filter((element) => !element.closest(".sr-only, [aria-hidden='true']"))
          .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      ),
    );
    expect(smallest).toBeGreaterThanOrEqual(14);
  });
});

/** Both pages share one skeleton (AC-14). */
test.describe("the page skeleton (AC-14)", () => {
  for (const path of ["/", "/tool"]) {
    test(`${path} has one h1 and the header, main and footer landmarks`, async ({
      page,
    }) => {
      await page.goto(path);

      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(page.getByRole("banner")).toHaveCount(1);
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("contentinfo")).toHaveCount(1);
      await expect(page.locator("main")).toHaveAttribute("id", "main");
      await expect(page.locator("main")).toHaveAttribute("tabindex", "-1");
    });

    test(`${path} keeps the header static, so it scrolls away`, async ({ page }) => {
      await page.goto(path);

      const position = await page
        .getByRole("banner")
        .evaluate((element) => getComputedStyle(element).position);
      expect(position).toBe("static");
    });
  }
});

test.describe("the home page (AC-13, AC-15, AC-17, AC-18)", () => {
  test("says what the spec says, with a button to the tool in the header and below", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("RedactNest");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Truly redact a PDF.",
    );
    await expect(page.getByRole("main")).toContainText(
      "The text is removed from the file itself rather than covered with a black box, and your document never leaves your machine.",
    );
    for (const region of [page.getByRole("banner"), page.getByRole("main")]) {
      await expect(region.getByRole("link", { name: "Redact a PDF" })).toHaveAttribute(
        "href",
        "/tool",
      );
    }
  });

  test("steps the display headline up from 40px to 56px at md", async ({ page }) => {
    const size = () =>
      page
        .getByRole("heading", { level: 1 })
        .evaluate((element) => getComputedStyle(element).fontSize);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    expect(await size()).toBe("40px");

    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await size()).toBe("56px");
  });

  test("walks from the skip link to the wordmark and both buttons", async ({ page }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "RedactNest" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Redact a PDF" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    const main = page.getByRole("main").getByRole("link", { name: "Redact a PDF" });
    await expect(main).toBeFocused();
    await expectFocusRing(main);
  });

  test("the skip link lands on main, so the next Tab is the main button", async ({
    page,
  }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("main").getByRole("link", { name: "Redact a PDF" }),
    ).toBeFocused();
  });

  test("its button links are button sized: 40px in the header, 48px below", async ({
    page,
  }) => {
    await page.goto("/");

    const header = await page
      .getByRole("banner")
      .getByRole("link", { name: "Redact a PDF" })
      .boundingBox();
    const main = await page
      .getByRole("main")
      .getByRole("link", { name: "Redact a PDF" })
      .boundingBox();
    // Exact, not a floor: a minimum passed while `lg` padding pushed it to 50px.
    expect(header?.height).toBe(40);
    expect(main?.height).toBe(48);

    await expectTargetSizes(page, ["#main"]);
  });

  test("axe reports nothing", async ({ page }) => {
    await page.goto("/");

    await expectNoAxeViolations(page);
  });

  test("axe reports nothing in forced colours", async ({ page }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/");

    await expectNoAxeViolations(page);
  });

  test("needs no sideways scroll at 320 CSS pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/");

    await expectNoHorizontalScroll(page);
  });

  test("clips nothing with the root font size doubled", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    await expectNoHorizontalScroll(page);
    await expectContained(page.getByRole("main"));
  });
});
