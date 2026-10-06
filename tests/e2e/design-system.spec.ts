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

// Most tests here open a document, which can take the whole of ENGINE_TIMEOUT
// when every worker is compiling the engine at once, and then run axe over the
// review, so each test gets room for both. Alone, one takes about two seconds.
test.describe.configure({ timeout: ENGINE_TIMEOUT + 30_000 });

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

/**
 * Spec 0004's thin path: a finished run, with its outcome card and the
 * Download button on screen.
 */
async function completeARun(page: Page): Promise<void> {
  await openDocument(page);
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/** Spec 0005's review state with both groups: an email and a phone number. */
async function reviewBothGroups(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/metadata.pdf"));
  await expect(page.locator("summary", { hasText: "Phone numbers" })).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
}

/** Rows in several scripts, one of them drawn right to left, over four pages. */
async function reviewManyRows(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/detect-email.pdf"));
  await expect(page.getByTestId("checklist")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/** Rows the engine would refuse, each disabled with its reason (spec 0005, AC-8). */
async function reviewBlockedRows(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/detect-blocked.pdf"));
  await expect(page.getByRole("checkbox", { name: "slanted@example.com" })).toBeDisabled({
    timeout: ENGINE_TIMEOUT,
  });
}

/** The review state with nothing found: the empty state under the coverage note. */
async function reviewNothingFound(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/kerning.pdf"));
  await expect(page.getByText("Nothing found to remove")).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
}

/**
 * Spec 0006, AC-27. A typed page, a scan and a blank page: the warning callout
 * in the opened document card, with its advice line.
 */
async function reviewFlagged(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/read-mixed.pdf"));
  await expect(page.getByTestId("page-warnings")).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
}

/** The same, run to completion: the warning again, above Download. */
async function completeFlagged(page: Page): Promise<void> {
  await reviewFlagged(page);
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download-warning")).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
}

/**
 * Spec 0006, AC-21 and AC-25. A crooked OCR scan: the note callout, with the
 * machine read line and the crooked scan line, and a blocked row.
 */
async function reviewNotes(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/read-crooked.pdf"));
  await expect(page.getByTestId("page-notes")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/**
 * Spec 0008, AC-8. A scan whose text layer is one short line: the OCR advice
 * followed, so the notes and no warning.
 */
async function reviewShortOcr(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/read-short-ocr.pdf"));
  await expect(page.getByTestId("page-notes")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/**
 * Spec 0006, AC-24 and AC-27. Fake redactions: rows under a box, each with its
 * line, beside the covered text warning.
 */
async function reviewConcealed(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/read-concealed.pdf"));
  await expect(page.getByText("Hidden under a box on the page.").first()).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
}

/** Spec 0006, AC-26. A document with nothing readable, refused at open. */
async function refuseUnreadable(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/read-scans.pdf"));
  await expect(page.getByTestId("error")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/**
 * Spec 0007, AC-22. A file chosen with the engine's download held, so the file
 * bar and the phase line stay on screen: the `opening` step.
 */
async function openingHeld(page: Page): Promise<void> {
  await page.route("**/engine/**", () => new Promise(() => {}));
  await page.getByTestId("file-input").setInputFiles(FIXTURE);
  await expect(page.getByTestId("file-bar")).toBeVisible();
  await expect(page.getByTestId("progress")).toHaveText("Loading the PDF engine…", {
    timeout: ENGINE_TIMEOUT,
  });
}

/**
 * Spec 0007, AC-22. A run under way, held there: the page's own requests to
 * the worker go through, except `redact`, which is kept back, so the run
 * never ends and Cancel stays in the action panel.
 */
async function redactingHeld(page: Page): Promise<void> {
  await openDocument(page);
  await page.evaluate(() => {
    const post = Worker.prototype.postMessage as (
      this: Worker,
      ...args: unknown[]
    ) => void;
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if ((args[0] as { kind?: string } | null)?.kind === "redact") return;
      post.apply(this, args);
    } as Worker["postMessage"];
  });
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("cancel")).toBeFocused();
}

/** Spec 0007, AC-14. A run refused for a stamp across a ticked address. */
async function refuseARun(page: Page): Promise<void> {
  await page
    .getByTestId("file-input")
    .setInputFiles(resolve("tests/fixtures/detect-stamped.pdf"));
  await page.getByTestId("redact").click({ timeout: ENGINE_TIMEOUT });
  await expect(page.getByTestId("run-refusal")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/** Spec 0007, AC-12. A run with nothing ticked: a cleaned copy. */
async function completeNothingRemoved(page: Page): Promise<void> {
  await openDocument(page);
  await page.getByRole("checkbox", { name: "contact@example.com" }).click();
  await page.getByTestId("redact").click();
  await expect(page.getByRole("heading", { name: "Nothing was removed" })).toBeVisible({
    timeout: ENGINE_TIMEOUT,
  });
}

/** Spec 0007, AC-13. The file handed over, with the two ways on. */
async function downloaded(page: Page): Promise<void> {
  await completeARun(page);
  const downloading = page.waitForEvent("download");
  await page.getByTestId("download").click();
  await downloading;
  await expect(page.getByTestId("downloaded")).toBeVisible();
}

/**
 * Idle, once the page's plan answer is in. The plan line's links arrive with
 * it, so a walk listed before then would miss them and then meet them.
 */
async function planAnswered(page: Page): Promise<void> {
  await expect(page.getByTestId("plan-line").getByRole("link")).toHaveCount(2);
}

/**
 * The states the tool page can settle in (AC-18; spec 0005, AC-13; spec 0007,
 * AC-22).
 */
const TOOL_STATES: readonly (readonly [string, (page: Page) => Promise<void>])[] = [
  ["idle", planAnswered],
  ["failed", failToOpen],
  ["opening", openingHeld],
  ["opened", openDocument],
  ["redacting", redactingHeld],
  ["a run refusal", refuseARun],
  ["complete, nothing removed", completeNothingRemoved],
  ["downloaded", downloaded],
  ["reviewing, with both groups", reviewBothGroups],
  ["reviewing, with many rows", reviewManyRows],
  ["reviewing, with blocked rows", reviewBlockedRows],
  ["reviewing, with nothing found", reviewNothingFound],
  ["complete", completeARun],
  // Spec 0006, AC-27.
  ["reviewing, with pages that cannot be read", reviewFlagged],
  ["complete, partly redacted", completeFlagged],
  ["reviewing, with notes", reviewNotes],
  ["reviewing, with concealed rows", reviewConcealed],
  ["refused, with nothing readable", refuseUnreadable],
];

/** Nothing scrolls sideways, which is what WCAG 1.4.10 asks at 320px. */
async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

/** A list's CSS columns as the browser computes them (spec 0013, AC-11). */
async function columnsOf(
  list: Locator,
): Promise<{ count: string; gap: string; rule: string }> {
  return list.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      count: style.columnCount,
      gap: style.columnGap,
      rule: style.columnRuleStyle,
    };
  });
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

/**
 * AC-6: the ring is its own colour the moment focus lands, never faded in from
 * the text colour, which on a filled button is white against a white page.
 * Focus lands by script and the colour is read in the same task, so not one
 * frame of a transition runs first to hide it. `:focus-visible` is checked too,
 * or a control that drew no ring at all would pass.
 */
async function expectRingAtOnce(target: Locator): Promise<void> {
  const ring = await target.evaluate(async (element) => {
    element.focus();
    const landed = getComputedStyle(element).outlineColor;
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
    return {
      ringed: element.matches(":focus-visible"),
      landed,
      settled: getComputedStyle(element).outlineColor,
    };
  });
  expect(ring.ringed).toBe(true);
  expect(ring.landed).toBe(ring.settled);
}

/**
 * Spec 0013, AC-16: the plan card sits in the rail between the file bar and
 * the action panel, so an anonymous visitor's two links come next.
 */
async function tabPastThePlanCard(page: Page): Promise<void> {
  const plan = page.getByTestId("plan-line");
  for (const name of ["Sign in", "see what Pro adds"]) {
    await page.keyboard.press("Tab");
    await expect(
      plan.getByRole("link", { name: `${name} (opens in a new tab)` }),
    ).toBeFocused();
  }
}

/**
 * Spec 0007, AC-22. Tab from the top of `main` reaches every control in the
 * page's reading order, each with its ring. The controls are listed from the
 * page itself (everything focusable, enabled and drawn), so a control added in
 * the wrong place or left unreachable fails here without the list being kept
 * by hand.
 */
async function expectKeyboardWalk(page: Page): Promise<void> {
  const stops = await page.locator("main").evaluate((main) => {
    const reachable = [
      ...main.querySelectorAll<HTMLElement>(
        "a[href], button, input, summary, [tabindex]",
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !(element as HTMLButtonElement).disabled &&
        element.getClientRects().length > 0,
    );
    reachable.forEach((element, index) => {
      element.dataset.walk = String(index);
    });
    return reachable.length;
  });
  expect(stops).toBeGreaterThan(0);

  await page.locator("main").focus();
  for (let index = 0; index < stops; index += 1) {
    await page.keyboard.press("Tab");
    const stop = page.locator(`[data-walk="${index}"]`);
    await expect(stop).toBeFocused();
    await expectFocusRing(stop);
  }
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

/**
 * Spec 0008, AC-8 and AC-9, in the real engine in the real worker. The notes
 * state's layout is `reviewNotes`'s; this proves a short OCR scan reaches it
 * with no warning, and the note's words.
 */
test.describe("a short OCR scan (spec 0008)", () => {
  test("opens with the all clear line and the machine read note, and no warning", async ({
    page,
  }) => {
    await page.goto("/tool");
    await reviewShortOcr(page);

    await expect(page.getByTestId("all-clear")).toHaveText(
      "RedactNest can read the text on every page.",
    );
    await expect(page.getByTestId("page-notes")).toContainText(
      "Page 1 is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the picture.",
    );
    await expect(page.getByTestId("page-warnings")).toHaveCount(0);
    await expect(page.getByTestId("page-advice")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "jo@example.com" })).toBeEnabled();
  });
});

test.describe("the keyboard walk on the tool page (AC-6, AC-14)", () => {
  /** Spec 0013, AC-20: the idle walk, in the order the page is read. */
  test("starts at the skip link, then the lockup, the header's links, the file picker, the terms notice, then the plan card", async ({
    page,
  }) => {
    await page.goto("/tool");
    const plan = page.getByTestId("plan-line");
    await expect(plan.getByRole("link")).toHaveCount(2);

    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    // Hidden until now, and shown the moment a keyboard reaches it.
    const shown = await skip.boundingBox();
    expect(shown?.height ?? 0).toBeGreaterThanOrEqual(24);

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "RedactNest" })).toBeFocused();

    // Spec 0013, AC-7 and AC-20: Pricing and Account sit in the header on
    // every page, /tool included, because the test build has billing on. No
    // item names the tool, and /tool shows no Try it free button.
    const header = page.getByRole("banner");
    await page.keyboard.press("Tab");
    await expect(header.getByRole("link", { name: "Pricing" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(header.getByRole("link", { name: "Account" })).toBeFocused();

    // Spec 0013, AC-15 and AC-20: the drop zone's button, the terms notice's
    // two links under it, then the plan card in the rail beside it.
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("choose-file")).toBeFocused();
    await expectFocusRing(page.getByTestId("choose-file"));

    const notice = page.getByTestId("terms-notice");
    for (const name of ["Terms of service", "Privacy policy"]) {
      await page.keyboard.press("Tab");
      await expect(notice.getByRole("link", { name })).toBeFocused();
    }

    for (const name of ["Sign in", "see what Pro adds"]) {
      await page.keyboard.press("Tab");
      const link = plan.getByRole("link", { name: `${name} (opens in a new tab)` });
      await expect(link).toBeFocused();
      await expectFocusRing(link);
    }
  });

  test("the skip link moves focus to main, so the next Tab is the file picker, and the plan card follows", async ({
    page,
  }) => {
    await page.goto("/tool");
    await expect(page.getByTestId("plan-line").getByRole("link")).toHaveCount(2);

    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("choose-file")).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("link", { name: "Sign in (opens in a new tab)" }),
    ).toBeFocused();
  });

  // Spec 0007, AC-5, as spec 0013 AC-16 amends it: the file bar's two buttons
  // first, then the rail (the plan card, then the action panel's main action),
  // then the found items' group summary and each row.
  test("Start over, Redact and the checklist are reached and ringed like every other control", async ({
    page,
  }) => {
    await page.goto("/tool");
    await openDocument(page);

    await page.getByTestId("choose-file").focus();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("start-over")).toBeFocused();
    await expectFocusRing(page.getByTestId("start-over"));

    await tabPastThePlanCard(page);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("redact")).toBeFocused();
    await expectFocusRing(page.getByTestId("redact"));

    await page.keyboard.press("Tab");
    const summary = page.locator("summary", { hasText: "Email addresses" });
    await expect(summary).toBeFocused();
    await expectFocusRing(summary);

    await page.keyboard.press("Tab");
    const box = page.getByRole("checkbox", { name: "contact@example.com" });
    await expect(box).toBeFocused();
    await expectFocusRing(box);
  });

  /**
   * Spec 0006, AC-27. The warnings add no tab stop: the walk over a flagged
   * document is the walk over any other, and the warning is read in the card.
   */
  test("walks a flagged document the same way, past the warning to Redact", async ({
    page,
  }) => {
    await page.goto("/tool");
    await reviewFlagged(page);
    await expect(page.getByTestId("page-warnings")).toContainText(
      "Page 2 is a scanned image.",
    );

    await page.getByTestId("choose-file").focus();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("start-over")).toBeFocused();
    await tabPastThePlanCard(page);
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("redact")).toBeFocused();
    await expectFocusRing(page.getByTestId("redact"));
    await page.keyboard.press("Tab");
    await expect(page.locator("summary", { hasText: "Email addresses" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("checkbox", { name: "jane.doe@example.com" }),
    ).toBeFocused();
  });

  test("draws the ring at full colour the moment focus lands", async ({ page }) => {
    await page.goto("/tool");
    await openDocument(page);

    await expectRingAtOnce(page.getByTestId("choose-file"));
    await expectRingAtOnce(page.getByTestId("start-over"));
  });

  // Spec 0007, AC-22: every step state, walked control by control.
  for (const [state, reach] of TOOL_STATES) {
    test(`reaches every control in order in the ${state} state`, async ({ page }) => {
      await page.goto("/tool");
      await reach(page);

      await expectKeyboardWalk(page);
    });
  }

  /**
   * Spec 0007, AC-8 and AC-22. A row the browser skipped drawing, because it
   * sat far below the fold (`content-visibility: auto`), is still reached by
   * Tab, scrolled into view and ringed.
   */
  test("reaches a row far below the fold, and brings it into view with its ring", async ({
    page,
  }) => {
    test.setTimeout(ENGINE_TIMEOUT + 90_000);
    await page.route("**/api/entitlement", (route) =>
      route.fulfill({
        json: {
          tier: "paid",
          pageCap: 50,
          maxFileBytes: 26_214_400,
          account: "signed-in",
        },
      }),
    );
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/tool");
    await page
      .getByTestId("file-input")
      .setInputFiles(resolve("tests/fixtures/detect-dense.pdf"));

    const first = page.getByRole("checkbox", {
      name: "staff.0000@example.com",
      exact: true,
    });
    await expect(first).toBeVisible({ timeout: ENGINE_TIMEOUT + 60_000 });
    const far = page.getByRole("checkbox", {
      name: "staff.0030@example.com",
      exact: true,
    });
    await expect(far).not.toBeInViewport();

    await first.focus();
    for (let step = 0; step < 30; step += 1) await page.keyboard.press("Tab");

    await expect(far).toBeFocused();
    await expect(far).toBeInViewport();
    await expectFocusRing(far);
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

/**
 * Spec 0013, AC-14 to AC-17. The three areas as a wide window draws them, and
 * the action panel sticky beside the list only there.
 */
test.describe("the tool page's layout (spec 0013)", () => {
  const box = (page: Page, testId: string) =>
    page.getByTestId(testId).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top };
    });
  const position = (page: Page, testId: string) =>
    page.getByTestId(testId).evaluate((element) => getComputedStyle(element).position);

  test("sets the drop zone left of the rail while nothing is open, and first in the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await planAnswered(page);

    const zone = await box(page, "area-document");
    const rail = await box(page, "area-rail");
    expect(zone.right).toBeLessThanOrEqual(rail.left);
    expect(zone.top).toBe(rail.top);

    const railArea = page.getByTestId("area-rail");
    await expect(railArea.getByTestId("plan-card")).toBeVisible();
    await expect(railArea.getByRole("list")).toHaveText(
      /Open a PDF.*Tick what to remove.*Download your new file/,
    );
    await expect(railArea.getByTestId("lock-line")).toHaveText(
      "Your file never leaves your browser.",
    );
  });

  /**
   * Spec 0013, AC-15. The idle steps' line: 2 pixels of `border-strong`,
   * centred under the circles, 0.25rem clear of each, none after the last;
   * at least 16 pixels long, so it reads as a join rather than a tick (the
   * pseudo element's computed `height`, which Chromium resolves to the drawn
   * length); a border, so forced colours keep it; on the step's own box, so it
   * grows when the words wrap at 200% text.
   */
  test("joins the idle steps with a line between each pair of circles", async ({
    page,
  }) => {
    const lines = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('[data-testid="area-rail"] ol > li')].map((li) => {
          const after = getComputedStyle(li, "::after");
          const step = li.getBoundingClientRect();
          const circle = (li.firstElementChild as Element).getBoundingClientRect();
          const width = parseFloat(after.borderLeftWidth);
          return {
            drawn: after.content !== "none" && after.borderLeftStyle === "solid",
            width: after.borderLeftWidth,
            colour: after.borderLeftColor,
            length: parseFloat(after.height),
            height: step.height,
            top: step.top + parseFloat(after.top),
            bottom: step.bottom - parseFloat(after.bottom),
            centre: step.left + parseFloat(after.left) + width / 2,
            circle: {
              top: circle.top,
              bottom: circle.bottom,
              centre: circle.left + circle.width / 2,
            },
            rem: parseFloat(getComputedStyle(document.documentElement).fontSize),
          };
        }),
      );
    const expectJoined = async () => {
      const steps = await lines();
      expect(steps.map((step) => step.drawn)).toEqual([true, true, false]);
      for (const [index, step] of steps.slice(0, -1).entries()) {
        const next = steps[index + 1];
        expect(step.width).toBe("2px");
        expect(step.length).toBeGreaterThanOrEqual(16);
        expect(step.top - step.circle.bottom).toBeCloseTo(step.rem * 0.25, 0);
        expect((next?.circle.top ?? 0) - step.bottom).toBeCloseTo(step.rem * 0.25, 0);
        expect(Math.abs(step.centre - step.circle.centre)).toBeLessThanOrEqual(0.5);
      }
      return steps;
    };

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await planAnswered(page);
    const [first] = await expectJoined();
    // `border-strong`, #7D848B.
    expect(first?.colour).toBe("rgb(125, 132, 139)");

    await page.emulateMedia({ forcedColors: "active" });
    await expectJoined();
    await page.emulateMedia({ forcedColors: "none" });

    // At 200% text on a phone a step's words wrap, so its box outgrows its
    // circle, and the line still runs from that circle to the next.
    await page.setViewportSize({ width: 320, height: 640 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const wrapped = await expectJoined();
    expect(
      wrapped.some(
        (step) =>
          step.drawn && step.height > step.circle.bottom - step.circle.top + step.rem,
      ),
    ).toBe(true);
  });

  test("draws the found items left of the rail, while the rail comes first in the page", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await reviewBothGroups(page);

    const list = await box(page, "area-found");
    const rail = await box(page, "area-rail");
    expect(list.right).toBeLessThanOrEqual(rail.left);
    const railFirst = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="area-rail"]');
      const list = document.querySelector('[data-testid="area-found"]');
      return Boolean(
        rail &&
        list &&
        rail.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
    expect(railFirst).toBe(true);
  });

  test("keeps the action panel sticky at 1280 pixels, and static at 900 and at 200% text", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await openDocument(page);
    expect(await position(page, "action-panel")).toBe("sticky");
    expect(
      await page
        .getByTestId("action-panel")
        .evaluate((element) => getComputedStyle(element).top),
    ).toBe("24px");

    await page.setViewportSize({ width: 900, height: 800 });
    expect(await position(page, "action-panel")).toBe("static");

    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    expect(await position(page, "action-panel")).toBe("static");
  });

  test("keeps Redact in view beside a long list as the page scrolls", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/tool");
    await reviewManyRows(page);

    await page.getByTestId("area-found").evaluate((element) => {
      element.scrollIntoView({ block: "end" });
    });
    await expect(page.getByTestId("redact")).toBeInViewport();
  });

  test("never makes the result card sticky", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await completeARun(page);

    expect(await position(page, "result")).toBe("static");
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

  // Spec 0007, AC-21 and AC-22: every step state reflows at 320px.
  for (const [state, reach] of TOOL_STATES) {
    test(`needs no sideways scroll at 320 CSS pixels in the ${state} state`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto("/tool");
      await reach(page);

      await expectNoHorizontalScroll(page);
    });
  }

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
    await expectContained(page.getByTestId("coverage"));
    for (const row of await page.getByTestId("checklist").locator("label").all()) {
      await expectContained(row);
    }
  });

  // Spec 0013, AC-17 and AC-26: every step state at 200% text is one column,
  // with nothing sticky and nothing scrolling sideways.
  for (const [state, reach] of TOOL_STATES) {
    test(`is one column with nothing sticky at 200% text in the ${state} state`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/tool");
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await reach(page);

      await expectNoHorizontalScroll(page);
      const sticky = await page.evaluate(
        () =>
          [...document.querySelectorAll("main *")].filter(
            (element) => getComputedStyle(element).position === "sticky",
          ).length,
      );
      expect(sticky).toBe(0);
    });
  }
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

  /** Spec 0006, AC-27. The notes keep their edge once colour is gone, too. */
  test("keeps the edge of the page notes", async ({ page }) => {
    await page.goto("/tool");
    await reviewNotes(page);

    const edge = await page.getByTestId("page-notes").evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.borderTopStyle, width: style.borderTopWidth };
    });
    expect(edge).toEqual({ style: "solid", width: "1px" });
  });

  /** Spec 0006, AC-27. The page warnings keep their edge once colour is gone. */
  test("keeps the edge of the page warnings, at open and at download", async ({
    page,
  }) => {
    await page.goto("/tool");
    await completeFlagged(page);

    for (const id of ["page-warnings", "download-warning"]) {
      const edge = await page.getByTestId(id).evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.borderTopStyle, width: style.borderTopWidth };
      });
      expect(edge, id).toEqual({ style: "solid", width: "1px" });
    }
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

/**
 * The review vocabulary's checks, which waited for the checklist primitives to
 * be placed on a page (spec 0003, AC-9 and AC-10). Spec 0005, AC-13 and AC-18
 * placed them.
 */
test.describe("the checklist on the tool page (spec 0005, AC-13)", () => {
  test("Enter and Space on a group summary close and open it", async ({ page }) => {
    await page.goto("/tool");
    await reviewManyRows(page);
    const summary = page.locator("summary", { hasText: "Email addresses" });
    const group = page.locator("details", { has: summary });
    const firstRow = page.getByRole("checkbox", { name: "jane.doe@example.com" }).first();

    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(group).not.toHaveAttribute("open");
    await expect(firstRow).toBeHidden();

    await page.keyboard.press("Space");
    await expect(group).toHaveAttribute("open");
    await expect(firstRow).toBeVisible();
  });

  test("a screen reader reads a row as the match, then its page and its context", async ({
    page,
  }) => {
    await page.goto("/tool");
    await reviewManyRows(page);

    const row = page.getByRole("checkbox", { name: "sales@example.org" });
    await expect(row).toHaveAccessibleName("sales@example.org");
    // The page first, then the context line with the match inside it.
    await expect(row).toHaveAccessibleDescription(
      /^Page 1 ….*again, or to sales@example\.org\. Link: mailto:.*…$/,
    );
  });

  test("a compact count badge reads with its noun, never as a bare number", async ({
    page,
  }) => {
    await page.goto("/tool");
    await reviewBothGroups(page);

    await expect(page.locator("summary", { hasText: "Email addresses" })).toHaveText(
      "Email addresses1 email address",
    );
    await expect(page.locator("summary", { hasText: "Phone numbers" })).toHaveText(
      "Phone numbers1 phone number",
    );
  });

  test("a long unbroken address wraps inside its row at 320 CSS pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/tool");
    await reviewManyRows(page);

    await expectNoHorizontalScroll(page);
    for (const row of await page.getByTestId("checklist").locator("label").all()) {
      await expectContained(row);
    }
  });

  test("the coverage note sits above the checklist, outside the live region", async ({
    page,
  }) => {
    await page.goto("/tool");
    await openDocument(page);

    await expect(page.getByTestId("coverage")).toHaveText(
      /RedactNest looked for email addresses and phone numbers\. Anything else, such as names and addresses, stays in the file\./,
    );
    await expect(page.locator('[aria-live="polite"] [data-testid="review"]')).toHaveCount(
      0,
    );
  });

  test("the checkbox falls back to the native control in forced colours", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/tool");
    await openDocument(page);

    const box = page.getByRole("checkbox", { name: "contact@example.com" });
    const appearance = await box.evaluate(
      (element) => getComputedStyle(element).appearance,
    );
    expect(appearance).toBe("auto");
  });

  /**
   * Spec 0003, AC-17. The mark's own tint and ink are utilities, which beat any
   * rule in `@layer base`, so a forced colours rule for `mark` placed there lost
   * and `forced-color-adjust: none` kept the tint. The expected pair is read from
   * a probe painted with the system colours, because the emulated palette is the
   * browser's to choose, not ours.
   */
  test("the highlighted match takes the system highlight in forced colours", async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: "active" });
    await page.goto("/tool");
    await openDocument(page);

    const mark = page.getByTestId("checklist").locator("mark").first();
    const colours = await mark.evaluate((element) => {
      const probe = document.createElement("span");
      probe.style.forcedColorAdjust = "none";
      probe.style.backgroundColor = "Highlight";
      probe.style.color = "HighlightText";
      document.body.append(probe);
      const system = getComputedStyle(probe);
      const expected = { background: system.backgroundColor, text: system.color };
      probe.remove();

      const style = getComputedStyle(element);
      return {
        expected,
        actual: { background: style.backgroundColor, text: style.color },
        tint: getComputedStyle(document.documentElement).getPropertyValue(
          "--color-accent-soft",
        ),
      };
    });

    // The control: the system highlight is not the tint, so a mark that kept
    // `accent-soft` cannot pass by the two happening to match.
    expect(colours.tint.trim()).toBe("#d5eeea");
    expect(colours.expected.background).not.toBe("rgb(213, 238, 234)");
    expect(colours.actual).toEqual(colours.expected);
  });

  test("a blocked row is listed with its reason, and cannot be ticked", async ({
    page,
  }) => {
    await page.goto("/tool");
    await reviewBlockedRows(page);

    const blocked = page.getByRole("checkbox", { name: "slanted@example.com" });
    await expect(blocked).toBeDisabled();
    await expect(blocked).not.toBeChecked();
    await expect(blocked).toHaveAccessibleDescription(
      /set at too steep an angle to remove safely, so it will stay in the file\.$/,
    );

    // Forced, because Playwright itself refuses to click a disabled control's
    // label. The browser gets the click, and the box must still not change.
    await page
      .getByText("set at too steep an angle", { exact: false })
      .click({ force: true });
    await expect(blocked).not.toBeChecked();

    const plain = page.getByRole("checkbox", { name: "plain@example.com" });
    await expect(plain).toBeEnabled();
    await expect(plain).toBeChecked();
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

test.describe("the home page (AC-13, AC-15, AC-17, AC-18; spec 0013, AC-10 to AC-13)", () => {
  test("says what the spec says, with a button to the tool in the header and below", async ({
    page,
  }) => {
    await page.goto("/");

    await expect(page).toHaveTitle("RedactNest");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Redaction that actually removes the text",
    );
    await expect(page.getByTestId("home-eyebrow")).toHaveText(
      "PDF redaction in your browser",
    );
    const main = page.getByRole("main");
    await expect(main).toContainText(
      "RedactNest finds email addresses and phone numbers in your PDF, lets you tick what to remove, and takes that text out of the file itself.",
    );
    // Spec 0013, AC-30: said once. "in your browser" is the eyebrow's alone.
    await expect(main).not.toContainText("Your file never leaves your browser.");
    // The build's own caps, with billing on (`playwright.config.ts`).
    await expect(page.getByTestId("home-caps")).toHaveText(
      "Free up to 3 pages a document. Pro goes up to 50.",
    );
    // Each place names the way in its own way (AC-30).
    for (const [region, name] of [
      [page.getByRole("banner"), "Try it free"],
      [main, "Remove text from a PDF"],
    ] as const) {
      await expect(region.getByRole("link", { name })).toHaveAttribute("href", "/tool");
    }
    await expect(main.getByRole("link", { name: "See pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    await expect(main.getByRole("heading", { level: 2 })).toHaveText([
      "Stays on your device",
      "Removed, not covered",
      "Checked before you download",
      "What RedactNest finds and strips",
    ]);
    await expect(main.getByRole("heading", { level: 3 })).toHaveText(["Finds", "Strips"]);
  });

  /**
   * Spec 0013, AC-11. Two white cards on the page's canvas, after your mockup
   * (`docs/design/references/05-finds-and-strips.png`): each a tile beside its
   * heading and subtitle, a list, then a rule and its closing line. Side by
   * side and equal height from `md`, Finds first when stacked.
   */
  test("shows what it finds and strips as two cards, side by side from md", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const band = page.getByTestId("home-band");
    const finds = page.getByTestId("home-finds");
    const strips = page.getByTestId("home-strips");
    await expect(finds.getByRole("listitem")).toHaveText([
      "Email addresses",
      "Phone numbers",
    ]);
    await expect(finds).toContainText("Sensitive details we can detect in your files.");
    await expect(finds).toContainText("Nothing is removed until you tick it.");
    await expect(strips).toContainText("Whenever a file carries them:");
    await expect(strips.getByRole("listitem")).toHaveText([
      "Document info",
      "XMP metadata",
      "Attachments",
      "Bookmarks",
      "JavaScript",
      "Earlier versions",
      "Page thumbnails",
    ]);
    await expect(strips).toContainText(
      "Comments and form fields are flattened into the page: what showed stays, and nothing hidden behind them does.",
    );
    // Every item carries its icon on a tile hidden from assistive technology,
    // and nothing in the band acts: no chevron, link, button or tab stop.
    for (const card of [finds, strips]) {
      for (const item of await card.getByRole("listitem").all()) {
        await expect(item.locator('[aria-hidden="true"] svg')).toHaveCount(1);
        await expect(item.locator("svg")).toHaveCount(1);
      }
    }
    await expect(band.locator("a, button, [tabindex]")).toHaveCount(0);

    // No full width strip: the section shows the canvas, the cards are white.
    const background = (locator: typeof band) =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await background(band)).toBe("rgba(0, 0, 0, 0)");
    expect(await background(finds)).not.toBe(await background(page.locator("body")));
    const [bandBox, findsBox, stripsBox] = [
      await band.boundingBox(),
      await finds.boundingBox(),
      await strips.boundingBox(),
    ];
    expect(bandBox?.width ?? 0).toBeLessThan(1280);

    expect(findsBox?.y).toBe(stripsBox?.y);
    expect(findsBox?.height).toBe(stripsBox?.height);
    expect((findsBox?.x ?? 0) + (findsBox?.width ?? 0)).toBeLessThan(stripsBox?.x ?? 0);

    // One list in two ruled columns, read down the first, then the second:
    // Document info to Bookmarks, then JavaScript to Page thumbnails.
    const list = strips.getByRole("list");
    expect(await columnsOf(list)).toEqual({ count: "2", gap: "64px", rule: "solid" });
    const items = strips.getByRole("listitem");
    const [first, fourth, fifth] = [
      await items.nth(0).boundingBox(),
      await items.nth(3).boundingBox(),
      await items.nth(4).boundingBox(),
    ];
    expect(fifth?.y).toBe(first?.y);
    expect((fourth?.x ?? 0) + (fourth?.width ?? 0)).toBeLessThan(fifth?.x ?? 0);
  });

  /** The card's width decides the columns: still two beside Finds at 1024, with a narrower gap. */
  test("keeps the Strips columns at 1024 pixels, and one column on a phone", async ({
    page,
  }) => {
    const list = page.getByTestId("home-strips").getByRole("list");

    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto("/");
    expect(await columnsOf(list)).toEqual({ count: "2", gap: "48px", rule: "solid" });
    // No item wraps in the narrower columns.
    for (const item of await list.getByRole("listitem").all()) {
      expect((await item.boundingBox())?.height).toBe(32);
    }

    await page.setViewportSize({ width: 320, height: 640 });
    expect((await columnsOf(list)).count).toBe("auto");
    await expectNoHorizontalScroll(page);
  });

  test("stacks the two cards below md, Finds first", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto("/");

    const finds = await page.getByTestId("home-finds").boundingBox();
    const strips = await page.getByTestId("home-strips").boundingBox();
    expect((finds?.y ?? 0) + (finds?.height ?? 0)).toBeLessThanOrEqual(strips?.y ?? 0);
  });

  /**
   * Spec 0013, AC-12. The real capture, through `next/image` from our own
   * origin, sized before it loads so nothing shifts, and loaded first.
   */
  test("shows the product shot from our own origin, sized and loaded first", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    const shot = page.getByRole("img", {
      name: "RedactNest reviewing a sample employment agreement: email addresses and phone numbers found and ticked, with a Redact button beside them.",
    });
    await expect(shot).toHaveAttribute("width", "2560");
    await expect(shot).toHaveAttribute("height", "1600");
    await expect(shot).toHaveAttribute("loading", "eager");
    await expect(shot).toHaveAttribute("fetchpriority", "high");
    await expect(shot).toHaveAttribute(
      "sizes",
      "(min-width: 64rem) 40rem, calc(100vw - 2rem)",
    );
    const loaded = await shot.evaluate((image: HTMLImageElement) => ({
      origin: new URL(image.currentSrc).origin,
      complete: image.complete && image.naturalWidth > 0,
    }));
    expect(loaded).toEqual({ origin: new URL(page.url()).origin, complete: true });

    // From `lg`, text on the left and the shot on the right.
    const text = await page.getByRole("heading", { level: 1 }).boundingBox();
    const picture = await shot.boundingBox();
    expect((text?.x ?? 0) + (text?.width ?? 0)).toBeLessThanOrEqual(picture?.x ?? 0);
  });

  test("puts the text before the shot below lg", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");

    const caps = await page.getByTestId("home-caps").boundingBox();
    const picture = await page
      .getByRole("img", { name: /reviewing a sample/ })
      .boundingBox();
    expect((caps?.y ?? 0) + (caps?.height ?? 0)).toBeLessThanOrEqual(picture?.y ?? 0);
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

  test("walks from the skip link to the wordmark, the header's links and both buttons", async ({
    page,
  }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "RedactNest" })).toBeFocused();
    // Spec 0013, AC-7: Pricing and Account, before the header's button.
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Pricing" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Account" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Try it free" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    const main = page
      .getByRole("main")
      .getByRole("link", { name: "Remove text from a PDF" });
    await expect(main).toBeFocused();
    await expectFocusRing(main);
    // Spec 0013, AC-10: See pricing beside it, with billing on.
    await page.keyboard.press("Tab");
    const pricing = page.getByRole("main").getByRole("link", { name: "See pricing" });
    await expect(pricing).toBeFocused();
    await expectFocusRing(pricing);
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
      page.getByRole("main").getByRole("link", { name: "Remove text from a PDF" }),
    ).toBeFocused();
  });

  test("its button links are button sized: 40px in the header, 48px below", async ({
    page,
  }) => {
    await page.goto("/");

    const header = await page
      .getByRole("banner")
      .getByRole("link", { name: "Try it free" })
      .boundingBox();
    const main = await page
      .getByRole("main")
      .getByRole("link", { name: "Remove text from a PDF" })
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

/**
 * Spec 0013, AC-26. Every page the refresh touched, in a real browser: axe at
 * desktop, at 320 pixels and in forced colours, reflow at 320 pixels, nothing
 * clipped at 200% text, and the mark still drawn in forced colours because it
 * paints with `currentColor`.
 */
/**
 * Spec 0013, AC-33. One rule in `globals.css` sets every cursor: the pointer on
 * whatever can be clicked, `not-allowed` on whatever is disabled, and no
 * component sets its own. Read as the browser computes it.
 */
test.describe("the cursor (spec 0013, AC-33)", () => {
  const cursorOf = (target: Locator) =>
    target.evaluate((element) => getComputedStyle(element).cursor);

  /** Every link, enabled button and summary on the page, and its cursor. */
  const clickable = (page: Page) =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          "a[href], button:enabled, summary, label:has(input[type=checkbox]:enabled)",
        ),
      ]
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          what: `${element.tagName.toLowerCase()} ${(element.textContent ?? "").trim().slice(0, 40)}`,
          cursor: getComputedStyle(element).cursor,
        })),
    );

  test("is the pointer on every link and button of the home page", async ({ page }) => {
    await page.goto("/");
    const header = page.getByRole("banner");
    const main = page.getByRole("main");

    for (const target of [
      header.getByRole("link", { name: "RedactNest" }),
      header.getByRole("link", { name: "Pricing" }),
      header.getByRole("link", { name: "Account" }),
      header.getByRole("link", { name: "Try it free" }),
      main.getByRole("link", { name: "Remove text from a PDF" }),
      main.getByRole("link", { name: "See pricing" }),
      page.getByRole("contentinfo").getByRole("link", { name: "Privacy policy" }),
    ]) {
      expect(await cursorOf(target)).toBe("pointer");
    }
    // Nothing that can be clicked shows the arrow.
    for (const { what, cursor } of await clickable(page)) {
      expect(cursor, what).toBe("pointer");
    }
  });

  test("is the pointer on the tool's controls while reviewing", async ({ page }) => {
    await page.goto("/tool");
    expect(await cursorOf(page.getByTestId("choose-file"))).toBe("pointer");

    await reviewManyRows(page);
    const checklist = page.getByTestId("checklist");
    for (const target of [
      checklist.locator("li:not([data-testid]) label").first(),
      page.getByTestId("select-all-email").locator("label"),
      checklist.locator("summary").first(),
      page.getByRole("checkbox").first(),
      page.getByTestId("redact"),
    ]) {
      expect(await cursorOf(target)).toBe("pointer");
    }
    for (const { what, cursor } of await clickable(page)) {
      expect(cursor, what).toBe("pointer");
    }
  });

  test("is not allowed on a blocked row and its checkbox", async ({ page }) => {
    await page.goto("/tool");
    await reviewBlockedRows(page);

    const box = page.getByRole("checkbox", { name: "slanted@example.com" });
    const row = box.locator("xpath=ancestor::label[1]");
    expect(await cursorOf(box)).toBe("not-allowed");
    expect(await cursorOf(row)).toBe("not-allowed");
  });
});

test.describe("every page (spec 0013, AC-26)", () => {
  const PAGES = ["/", "/pricing", "/privacy", "/terms", "/no-such-page"] as const;

  /** AC-25: the On this page list stuck beside the text, mid scroll. */
  for (const path of ["/privacy", "/terms"]) {
    test(`${path}: axe reports nothing with On this page stuck beside the text`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await page
        .locator("main h2")
        .nth(3)
        .evaluate((heading) => {
          heading.scrollIntoView({ behavior: "instant", block: "start" });
        });

      await expectNoAxeViolations(page);
    });
  }

  for (const path of PAGES) {
    test(`${path}: axe reports nothing at desktop width`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);

      await expectNoAxeViolations(page);
    });

    test(`${path}: axe reports nothing at 320 pixels, with no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto(path);

      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });

    test(`${path}: axe reports nothing in forced colours, and the mark still shows`, async ({
      page,
    }) => {
      await page.emulateMedia({ forcedColors: "active" });
      await page.goto(path);

      await expectNoAxeViolations(page);
      const mark = await page
        .getByRole("banner")
        .locator("svg")
        .first()
        .evaluate((svg) => {
          const box = svg.getBoundingClientRect();
          return {
            fill: getComputedStyle(svg).fill,
            ground: getComputedStyle(document.querySelector("header") ?? svg)
              .backgroundColor,
            drawn: box.width > 0 && box.height > 0,
          };
        });
      expect(mark.drawn).toBe(true);
      expect(mark.fill).not.toBe(mark.ground);
    });

    test(`${path}: clips nothing with the root font size doubled`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

      await expectNoHorizontalScroll(page);
      await expectContained(page.getByRole("main"));
    });
  }
});
