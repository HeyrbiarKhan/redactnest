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

interface Rect {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Where an element sits in the window. A turning spinner's box is its rotated
 * one, up to 1.41 times its size, but its centre stays put, so read a
 * spinner's place here and its size with `cssSize`.
 */
async function rectOf(locator: Locator): Promise<Rect> {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
}

function middle(rect: Rect): { readonly x: number; readonly y: number } {
  return { x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 };
}

/** An element's laid out size, which a rotation leaves alone. */
async function cssSize(locator: Locator): Promise<{ width: string; height: string }> {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.width, height: style.height };
  });
}

/** Within a pixel, since centring can land on a half pixel. */
function expectNear(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
}

interface TargetBox {
  readonly name: string;
  readonly tag: string;
  readonly width: number;
  readonly height: number;
  /** A link drawn inline inside a sentence, with other words on its line. */
  readonly inSentence: boolean;
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
        const own = element.textContent?.trim() ?? "";
        const around = element.parentElement?.textContent?.trim() ?? "";
        return {
          name:
            element.dataset.testid ??
            element.getAttribute("href") ??
            element.textContent?.trim() ??
            element.tagName,
          tag: element.tagName.toLowerCase(),
          width: rect.width,
          height: rect.height,
          inSentence:
            element.tagName === "A" &&
            getComputedStyle(element).display === "inline" &&
            around.length > own.length,
        };
      }),
  );
}

/**
 * AC-7. At least 24 by 24 for every target, and 40px tall for every button.
 *
 * Some elements are visually hidden on purpose and so have no box to measure:
 * the skip link until it is focused, on the tool page the file input, which
 * is not a tab stop at all, and at these desktop widths the header's Menu
 * button, which shows only below `sm`, where the links fold into its menu
 * (feature 28), with the account slot's own Sign in for that menu, since from
 * `sm` the slot's row shows it (spec 0026 child 0001, AC-27). Anything else
 * hidden that way is a control nobody can see.
 *
 * `sentences` applies WCAG 2.5.8's inline exception, which spec 0003 AC-7
 * cites and axe's own `target-size` rule applies: a link drawn inline inside
 * a sentence is sized by the text's line, so it is passed over here. It is for
 * pages of prose (the legal pages, `/security`, the guides' answers); the
 * tool's and the home page's own checks leave it off, so every control there
 * still measures 24 by 24.
 */
async function expectTargetSizes(
  page: Page,
  hiddenOnPurpose: readonly string[] = ["#main", "file-input", "Menu", "/sign-in"],
  { sentences = false }: { readonly sentences?: boolean } = {},
): Promise<void> {
  const boxes = await targetBoxes(page);
  const hidden = boxes.filter((box) => box.width <= 1 || box.height <= 1);
  const shown = boxes.filter(
    (box) => box.width > 1 && box.height > 1 && !(sentences && box.inSentence),
  );

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
 * Spec 0026 child 0001, AC-30: with a document open, the file bar's buttons
 * sit in the header, and the account slot's Sign in follows them before
 * `main`, for a visitor who is signed out on a billing on build.
 */
async function tabPastTheHeaderSignIn(page: Page): Promise<void> {
  await page.keyboard.press("Tab");
  const signIn = page
    .getByRole("banner")
    .getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).toBeFocused();
  await expectFocusRing(signIn);
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
/**
 * A browser that cannot show a transferred picture, so `/tool` never shows
 * the page preview (spec 0026 child 0002, AC-37) and keeps AC-12's column at
 * every width. For the checks that hold that column and its walk; the
 * preview's own frame, walk and axe pass are `preview.spec.ts` and the
 * "page preview, drawn" tests below.
 */
async function withoutPreview(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, "createImageBitmap", {
      value: undefined,
      configurable: true,
    });
  });
}

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

    // Spec 0026, AC-5: Security and Pricing in the header's nav, then Sign
    // in, because the test build has billing on and nobody is signed in. On
    // /tool no item names the tool, How it works is left out (child 0001,
    // AC-30), and there is no Try it free button.
    const header = page.getByRole("banner");
    for (const name of ["Security", "Pricing", "Sign in"]) {
      await page.keyboard.press("Tab");
      await expect(header.getByRole("link", { name })).toBeFocused();
    }

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

  // Spec 0007, AC-5, as spec 0026 AC-12 amends it: the file bar's two buttons
  // first, now in the header (child 0001, AC-30), then the header's Sign in,
  // then B (the plan card, then the action panel's Untick all and main
  // action), then the found items' group summary and each row.
  test("Start over, Redact and the checklist are reached and ringed like every other control", async ({
    page,
  }) => {
    await page.goto("/tool");
    await openDocument(page);

    await page.getByTestId("choose-file").focus();

    await page.keyboard.press("Tab");
    await expect(page.getByTestId("start-over")).toBeFocused();
    await expectFocusRing(page.getByTestId("start-over"));
    await tabPastTheHeaderSignIn(page);

    await tabPastThePlanCard(page);
    // Spec 0026, AC-12: Untick all beside the count, then Redact.
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("untick-all")).toBeFocused();
    await expectFocusRing(page.getByTestId("untick-all"));
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("redact")).toBeFocused();
    await expectFocusRing(page.getByTestId("redact"));

    // Spec 0017, AC-1 and AC-2: the custom terms panel sits in the found
    // items before the groups. This job is Free, so the panel is locked and
    // its one stop is the link to Pricing; the field and Add are disabled.
    await page.keyboard.press("Tab");
    const getPro = page
      .getByTestId("terms-locked")
      .getByRole("link", { name: "Get Pro (opens in a new tab)" });
    await expect(getPro).toBeFocused();
    await expectFocusRing(getPro);

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
   * Spec 0006, AC-27. The walk over a flagged document is the walk over any
   * other but one stop: the warning's "What to do", which shows the advice
   * (the owner's call, 2026-11-26), ringed like every other control.
   */
  test("walks a flagged document the same way, through What to do to Redact", async ({
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
    await tabPastTheHeaderSignIn(page);
    await page.keyboard.press("Tab");
    const whatToDo = page
      .getByTestId("page-warnings")
      .getByRole("button", { name: "What to do" });
    await expect(whatToDo).toBeFocused();
    await expectFocusRing(whatToDo);
    await tabPastThePlanCard(page);
    // Spec 0026, AC-12: Untick all beside the count, then Redact.
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("untick-all")).toBeFocused();
    await expectFocusRing(page.getByTestId("untick-all"));
    await page.keyboard.press("Tab");
    await expect(page.getByTestId("redact")).toBeFocused();
    await expectFocusRing(page.getByTestId("redact"));
    // The locked custom terms panel's link to Pricing (spec 0017, AC-2).
    await page.keyboard.press("Tab");
    await expect(
      page
        .getByTestId("terms-locked")
        .getByRole("link", { name: "Get Pro (opens in a new tab)" }),
    ).toBeFocused();
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

  // Spec 0007, AC-22: every step state, walked control by control, in AC-12's
  // column. With the preview a focused row picks its page, which moves the
  // rail's one tab stop as AC-41 has it, so that walk is its own test.
  for (const [state, reach] of TOOL_STATES) {
    test(`reaches every control in order in the ${state} state`, async ({ page }) => {
      await withoutPreview(page);
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

      // With a document on the page the header holds the file bar in the
      // nav's place, so no menu and no menu Sign in (child 0001, AC-30).
      const open = (await page.getByRole("banner").getByTestId("file-bar").count()) > 0;
      await expectTargetSizes(page, open ? ["#main", "file-input"] : undefined);
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
 * Spec 0013, AC-14 and AC-15, and spec 0026, AC-12. The areas as a wide
 * window draws them: A beside B while nothing is open, one centred column
 * with a document on the page, and the action panel floating at the window's
 * foot only there.
 */
test.describe("the tool page's layout (spec 0013)", () => {
  const box = (page: Page, testId: string) =>
    page.getByTestId(testId).evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
  const position = (page: Page, testId: string) =>
    page.getByTestId(testId).evaluate((element) => getComputedStyle(element).position);
  const rowGap = (page: Page) =>
    page
      .getByTestId("tool-grid")
      .evaluate((element) => parseFloat(getComputedStyle(element).rowGap));
  // An area stretches to fill its grid row, so where its row really ends shows
  // only in where its last block ends.
  const contentBottom = (page: Page, testId: string) =>
    page
      .getByTestId(testId)
      .evaluate((element) => element.lastElementChild?.getBoundingClientRect().bottom);

  /**
   * The idle rail's column and the lock line's drawn content (the lock and the
   * words), which `justify-center` moves while the line's own box keeps the
   * column's width.
   */
  const idleRail = (page: Page) =>
    page.getByTestId("area-rail").evaluate((rail) => {
      const rect = (element: Element) => {
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      };
      // The lock line lives in B's head (spec 0026, AC-12).
      const head = rail.querySelector(':scope > [data-testid="area-rail-head"]');
      const lock = head?.querySelector(':scope > [data-testid="lock-line"]') ?? null;
      if (lock === null) throw new Error("the rail is not idle");
      const drawn = [...lock.children].map(rect);
      return {
        rail: rect(rail),
        lock: rect(lock),
        lockContent: {
          left: Math.min(...drawn.map((part) => part.left)),
          right: Math.max(...drawn.map((part) => part.right)),
          top: Math.min(...drawn.map((part) => part.top)),
          bottom: Math.max(...drawn.map((part) => part.bottom)),
        },
      };
    });

  /** How far the lock line's lock sits from the line's own start edge. */
  const lockIndent = (lockLine: Locator) =>
    lockLine.evaluate(
      (line) =>
        (line.firstElementChild as Element).getBoundingClientRect().left -
        line.getBoundingClientRect().left,
    );

  /**
   * The empty state (`ToolStates.dc.html`, the owner's call, 2026-11-26): the
   * drop zone alone, first in the page, in one column no wider than 44rem and
   * centred, with the rail under it holding the plan card and the lock line,
   * and no steps.
   */
  test("stacks the drop zone over the rail in one centred column while nothing is open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await planAnswered(page);

    const zone = await box(page, "area-document");
    const rail = await box(page, "area-rail");
    expect(zone.bottom).toBeLessThanOrEqual(rail.top);
    expectNear(zone.left, rail.left);
    expectNear(zone.right, rail.right);
    expect(zone.right - zone.left).toBeLessThanOrEqual(704);
    const grid = await box(page, "tool-grid");
    expectNear(middle(zone).x, middle(grid).x);

    const railArea = page.getByTestId("area-rail");
    await expect(railArea.getByTestId("plan-card")).toBeVisible();
    await expect(railArea.getByRole("list")).toHaveCount(0);
    await expect(railArea.getByTestId("lock-line")).toHaveText(
      "Your file never leaves your browser.",
    );
  });

  /**
   * The empty state's lock line is centred under the drop zone's column at
   * every width, the areas stacked or not (the owner's call, 2026-11-26).
   * The widths are those verify walked, each well clear of the grid's switch.
   */
  for (const [label, width, doubled] of [
    ["at 390 pixels", 390, false],
    ["at 800 pixels", 800, false],
    ["at 1280 pixels", 1280, false],
    ["at 1280 pixels with 200% text", 1280, true],
  ] as const) {
    test(`centres the idle lock line under the drop zone, ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/tool");
      if (doubled) {
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      }
      await planAnswered(page);

      expect((await box(page, "area-document")).bottom).toBeLessThanOrEqual(
        (await box(page, "area-rail")).top,
      );
      const { rail, lockContent } = await idleRail(page);
      expectNear(middle(lockContent).x, middle(rail).x);
    });
  }

  /**
   * AC-15 and AC-16: only the idle rail centres. With a document open where
   * the areas stack, the lock line at the rail's foot (while it opens) sits at
   * the start, as before feature 28.
   */
  for (const width of [390, 800]) {
    test(`leaves the rail's lock line at the start while a document opens, at ${width} pixels`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/tool");
      await planAnswered(page);
      await openingHeld(page);

      const line = page.getByTestId("lock-line");
      await expect(line).toHaveCount(1);
      await expect(page.getByTestId("area-rail").getByTestId("lock-line")).toBeVisible();
      expect(await lockIndent(line)).toBeLessThanOrEqual(1);
    });
  }

  /**
   * AC-15 and AC-16: the action panel's lock line keeps its own rule, as
   * before feature 28. It follows Redact: centred under the full width button
   * on a phone, at the start under the button's own width between `sm` and
   * the grid's `lg`. The idle rail's centring never reaches it.
   */
  test("leaves the action panel's lock line under Redact where the areas stack", async ({
    page,
  }) => {
    const lockLine = page.getByTestId("action-panel").getByTestId("lock-line");
    const drawn = () =>
      lockLine.evaluate((line) => {
        const parts = [...line.children].map((part) => part.getBoundingClientRect());
        return {
          left: Math.min(...parts.map((part) => part.left)),
          right: Math.max(...parts.map((part) => part.right)),
          top: Math.min(...parts.map((part) => part.top)),
          bottom: Math.max(...parts.map((part) => part.bottom)),
        };
      });
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/tool");
    await planAnswered(page);
    await openDocument(page);

    // The lock line's own box is the panel's width inside its padding.
    let redact = await rectOf(page.getByTestId("redact"));
    let row = await rectOf(lockLine);
    expectNear(redact.left, row.left);
    expectNear(redact.right, row.right);
    expectNear(middle(await drawn()).x, middle(redact).x);

    await page.setViewportSize({ width: 800, height: 800 });

    redact = await rectOf(page.getByTestId("redact"));
    row = await rectOf(lockLine);
    expect(redact.right).toBeLessThan(row.right - 1);
    expectNear(redact.left, row.left);
    expect(await lockIndent(lockLine)).toBeLessThanOrEqual(1);
  });

  /**
   * Spec 0026, AC-12, *One column*: from `lg` while reviewing, each block that
   * holds something (L, B's head, C) stacks top to bottom in that order,
   * centred and no wider than 44rem, with the plan card below the document
   * card and above the Found items card. In the page, B still comes before C.
   * A is empty and hidden: the file bar is in the header (child 0001, AC-30).
   */
  test("stacks the document card, B's head and the list in one centred column", async ({
    page,
  }) => {
    // AC-12's column holds wherever the preview does not show (child 0002).
    await withoutPreview(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await planAnswered(page);
    await reviewBothGroups(page);

    const grid = await box(page, "tool-grid");
    await expect(page.getByTestId("area-document")).toBeHidden();
    await expect(page.getByRole("banner").getByTestId("file-bar")).toBeVisible();
    const blocks = [
      await box(page, "area-live"),
      await box(page, "area-rail-head"),
      await box(page, "area-found"),
    ];
    const rem = await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize),
    );
    for (const block of blocks) {
      expect(block.right - block.left).toBeLessThanOrEqual(44 * rem + 0.5);
      expectNear(middle(block).x, middle(grid).x);
      expectNear(block.left, blocks[0]?.left ?? 0);
    }
    for (let at = 1; at < blocks.length; at += 1) {
      expect(blocks[at]?.top ?? 0).toBeGreaterThanOrEqual(blocks[at - 1]?.bottom ?? 0);
    }

    const [documentCard, plan, list] = [
      await rectOf(page.getByRole("region", { name: "Document opened" })),
      await rectOf(page.getByTestId("plan-card")),
      await rectOf(page.getByTestId("checklist")),
    ];
    expect(plan.top).toBeGreaterThanOrEqual(documentCard.bottom);
    expect(list.top).toBeGreaterThanOrEqual(plan.bottom);

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

  /** AC-12, *The plan card*: at `complete` the result card sits above the list. */
  test("puts the result card above the list at complete, never sticky", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await completeARun(page);

    expect(await position(page, "result")).toBe("static");
    const [result, list] = [await box(page, "result"), await box(page, "area-found")];
    expect(result.bottom).toBeLessThanOrEqual(list.top);
  });

  /**
   * AC-12: while a document opens, L heads the column, sized to what it
   * holds, and B's head (the plan card and the lock line) follows it. The
   * file bar is in the header (child 0001, AC-30), so A is hidden.
   */
  test("draws the phase line at the column's head while a document opens, with no stretch", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await planAnswered(page);
    await openingHeld(page);

    const live = page.getByTestId("area-live");
    await expect(page.getByTestId("area-document")).toBeHidden();
    const [bar, area, line, head] = [
      await rectOf(page.getByRole("banner").getByTestId("file-bar")),
      await rectOf(live),
      await rectOf(live.getByTestId("progress-card")),
      await box(page, "area-rail-head"),
    ];
    expect(area.top).toBeGreaterThanOrEqual(bar.bottom);
    expectNear(area.left, head.left);
    // L is sized to the progress card it holds (child 0003).
    expectNear(area.bottom - area.top, line.bottom - line.top);
    expect(head.top).toBeGreaterThanOrEqual(area.bottom);
  });

  /**
   * Child 0003, AC-31 and AC-33: while a document opens, the progress card
   * heads the column above B's head, the full column's width, with the open's
   * four steps, and the polite region's own copy of the line hidden from the
   * eye. At 1280 and at 900. The file bar is in the header (child 0001,
   * AC-30), above it all.
   */
  for (const width of [1280, 900] as const) {
    test(`shows the open's steps in a card at the column's head while a document opens at ${width} pixels`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/tool");
      await planAnswered(page);
      await openingHeld(page);

      const live = page.getByTestId("area-live");
      const card = live.getByTestId("progress-card");
      await expect(card).toHaveAttribute("aria-live", "off");
      await expect(card).toContainText("Opening…");
      await expect(card.getByRole("listitem")).toHaveCount(4);
      await expect(card.getByRole("listitem").first()).toContainText(
        "Loading the PDF engine, in progress",
      );
      const [area, panel, fileBar, head] = [
        await rectOf(live),
        await rectOf(card),
        await rectOf(page.getByRole("banner").getByTestId("file-bar")),
        await rectOf(page.getByTestId("area-rail-head")),
      ];
      expectNear(panel.left, head.left);
      expectNear(panel.right, head.right);
      expect(fileBar.bottom).toBeLessThanOrEqual(area.top);
      expect(area.bottom).toBeLessThanOrEqual(head.top);
      // The line is still in the polite region, for a screen reader only.
      const line = await rectOf(live.getByTestId("progress"));
      expect(line.bottom - line.top).toBeLessThanOrEqual(1);
    });
  }

  /**
   * Spec 0013, AC-15, in the empty state's one column (the owner's call,
   * 2026-11-26). While a chosen file waits for the plan, the page is still
   * idle, so the full drop zone stays first and "Checking your plan" sits
   * between it and the rail, one grid gap from each. The entitlement request
   * is held, so the line stays up for the wait budget rather than flashing
   * past.
   */
  test("puts the plan check between the drop zone and the rail while a chosen file waits", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.route("/api/entitlement", () => new Promise(() => {}));
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(FIXTURE);
    await expect(page.getByTestId("area-live").getByTestId("progress")).toHaveText(
      "Checking your plan…",
    );

    const [document, live, rail] = [
      await box(page, "area-document"),
      await box(page, "area-live"),
      await box(page, "area-rail"),
    ];
    await expect(page.getByTestId("drop-area")).toBeVisible();
    const gap = await rowGap(page);
    expect(live.left).toBe(document.left);
    expect(live.right).toBe(document.right);
    expect(live.left).toBe(rail.left);
    expect(live.top - document.bottom).toBe(gap);
    expect(rail.top - ((await contentBottom(page, "area-live")) ?? 0)).toBe(gap);
  });

  /**
   * AC-12, *Sticky foot*: over a long list at 1280 by 720, the action panel
   * floats at the window's foot with Redact in view; scrolled to the list's
   * end it rests under the last row, covering none.
   */
  test("floats the action panel at the window's foot over a long list, and rests it under the last row", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/tool");
    await reviewManyRows(page);

    const panel = page.getByTestId("action-panel");
    const list = await box(page, "area-found");
    expect(list.bottom - list.top).toBeGreaterThan(720);

    // The list's middle in the middle of the window.
    await page.evaluate(
      (y) => window.scrollTo(0, y),
      list.top + (list.bottom - list.top) / 2 - 360,
    );
    expect(await position(page, "action-panel")).toBe("sticky");
    expect(await panel.evaluate((element) => getComputedStyle(element).bottom)).toBe(
      "0px",
    );
    expectNear((await rectOf(panel)).bottom, 720);
    await expect(page.getByTestId("redact")).toBeInViewport();

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastRow = await rectOf(page.getByTestId("checklist").locator("label").last());
    expect((await rectOf(panel)).top).toBeGreaterThanOrEqual(lastRow.bottom);
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

  /**
   * AC-12: sticky only from `lg` in a window at least 36rem tall, so a short
   * window, a narrower one and 200% text each get a static panel, and nothing
   * on the page is sticky.
   */
  for (const [label, width, height, doubled] of [
    ["at 1280 by 500 pixels", 1280, 500, false],
    ["at 900 pixels", 900, 800, false],
    ["at 1280 pixels with 200% text", 1280, 800, true],
  ] as const) {
    test(`keeps the action panel static and nothing sticky ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await page.goto("/tool");
      if (doubled) {
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      }
      await openDocument(page);

      expect(await position(page, "action-panel")).toBe("static");
      const sticky = await page.evaluate(
        () =>
          [...document.querySelectorAll("body *")].filter(
            (element) => getComputedStyle(element).position === "sticky",
          ).length,
      );
      expect(sticky).toBe(0);
    });
  }

  /**
   * AC-12, *The panel's room*: in the tallest form this test can hold (a
   * paid answer, the count line with Untick all, the waits line wrapped, the
   * `lg` button and the lock line), the panel fits in `--tool-panel-room`, so
   * C's padding and the scroll margins always clear it. A custom term search
   * runs in the worker and cannot be held from here, so the waits line is
   * added as the page would draw it, in `makeWaitsLine`'s searching words,
   * its one fixed sentence.
   */
  test("fits the action panel's tallest form in its room", async ({ page }) => {
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
    await reviewManyRows(page);

    const panel = page.getByTestId("action-panel");
    await expect(panel.getByTestId("untick-all")).toBeVisible();
    await panel.evaluate((element) => {
      const waits = document.createElement("p");
      waits.className = "text-small text-ink";
      waits.textContent = "Your custom terms are still being searched, so the run waits.";
      element.insertBefore(waits, element.querySelector('[data-testid="redact"]'));
    });
    const [height, room] = await panel.evaluate((element) => {
      const grid = element.closest('[data-testid="tool-grid"]') as HTMLElement;
      const probe = document.createElement("div");
      probe.style.height = getComputedStyle(grid).getPropertyValue("--tool-panel-room");
      grid.append(probe);
      const measured = probe.getBoundingClientRect().height;
      probe.remove();
      return [element.getBoundingClientRect().height, measured];
    });
    expect(room).toBeGreaterThan(0);
    expect(height).toBeLessThanOrEqual(room);
  });

  /**
   * AC-12, *Focus never hidden when it moves* (WCAG 2.2, 2.4.11): at 1280 by
   * 720 with a long list, Tab from the file bar, across the plan card, through more than two
   * windows of rows, and each focused control in the column stays clear
   * above the floating panel.
   */
  test("never lets the floating panel cover a control focus moves to", async ({
    page,
  }) => {
    test.setTimeout(ENGINE_TIMEOUT + 120_000);
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
    await expect(
      page.getByRole("checkbox", { name: "staff.0000@example.com", exact: true }),
    ).toBeVisible({ timeout: ENGINE_TIMEOUT + 60_000 });
    expect(await position(page, "action-panel")).toBe("sticky");

    // From the file bar, so the walk crosses the plan card and the panel first.
    await page.getByTestId("start-over").focus();
    let travelled = 0;
    let start: number | null = null;
    for (let step = 0; step < 80; step += 1) {
      await page.keyboard.press("Tab");
      const seen = await page.evaluate(
        () =>
          new Promise<{ inPanel: boolean; bottom: number; panelTop: number; y: number }>(
            (done) =>
              // Two frames: the browser's own focus scroll, then the fallback.
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  const active = document.activeElement as HTMLElement;
                  const panel = document.querySelector(
                    '[data-testid="action-panel"]',
                  ) as HTMLElement;
                  done({
                    inPanel: panel.contains(active),
                    bottom: active.getBoundingClientRect().bottom,
                    panelTop: panel.getBoundingClientRect().top,
                    y: window.scrollY,
                  });
                }),
              ),
          ),
      );
      if (!seen.inPanel) {
        expect(seen.bottom).toBeLessThanOrEqual(seen.panelTop);
        start ??= seen.y;
        travelled = seen.y - start;
      }
    }
    // More than two windows' worth of rows walked.
    expect(travelled).toBeGreaterThan(2 * 720);
  });

  /**
   * AC-14, below `lg`, and at 200% text in a wide window: one column in page
   * order, so a phone reads the file bar (in the header, child 0001, AC-30),
   * then B, then the list.
   */
  for (const [label, width, doubled] of [
    ["at 900 pixels", 900, false],
    ["at 200% text", 1280, true],
  ] as const) {
    test(`stacks the file bar, the rail and the list in one column ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/tool");
      if (doubled) {
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      }
      await reviewBothGroups(page);

      await expect(page.getByTestId("area-document")).toBeHidden();
      const [document, live, rail, list] = [
        await rectOf(page.getByRole("banner").getByTestId("file-bar")),
        await box(page, "area-live"),
        await box(page, "area-rail"),
        await box(page, "area-found"),
      ];
      expect(rail.left).toBe(live.left);
      expect(list.left).toBe(live.left);
      expect(document.bottom).toBeLessThanOrEqual(live.top);
      expect(live.top).toBeLessThan(rail.top);
      expect(rail.top).toBeLessThan(list.top);
    });

    /**
     * AC-14, with feature 26's phase line: while a file opens in one column,
     * the file bar, the phase line, then the rail with the plan card and the
     * lock line, in page order.
     */
    test(`stacks the file bar, the phase line and the rail in one column while a document opens ${label}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/tool");
      if (doubled) {
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      }
      await planAnswered(page);
      await openingHeld(page);

      await expect(page.getByTestId("area-document")).toBeHidden();
      const [document, live, rail] = [
        await rectOf(page.getByRole("banner").getByTestId("file-bar")),
        await box(page, "area-live"),
        await box(page, "area-rail"),
      ];
      await expect(page.getByTestId("area-live").getByTestId("progress")).toBeVisible();
      expect(rail.left).toBe(live.left);
      expect(document.bottom).toBeLessThanOrEqual(live.top);
      expect(live.top).toBeLessThan(rail.top);
      const railArea = page.getByTestId("area-rail");
      await expect(railArea.getByTestId("plan-card")).toBeVisible();
      await expect(railArea.getByTestId("lock-line")).toBeVisible();
    });
  }
});

test.describe("reflow and zoom on the tool page (AC-15)", () => {
  test("needs no sideways scroll at 320 CSS pixels", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/tool");
    await expectNoHorizontalScroll(page);

    await openDocument(page);
    await expectNoHorizontalScroll(page);
  });

  // Spec 0007, AC-21 and AC-22: every step state reflows at 320px. Spec 0026,
  // AC-16: and passes axe there, as it does at desktop width and in forced
  // colours.
  for (const [state, reach] of TOOL_STATES) {
    test(`needs no sideways scroll at 320 CSS pixels in the ${state} state, and axe reports nothing`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await page.goto("/tool");
      await reach(page);

      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
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

  // Spec 0013, AC-17 and AC-26: every step state at 200% text has nothing
  // sticky and nothing scrolling sideways. That the areas stack in one column
  // is measured in "the tool page's layout" above.
  for (const [state, reach] of TOOL_STATES) {
    test(`has nothing sticky and no sideways scroll at 200% text in the ${state} state`, async ({
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

    // Shown on open, with nothing that hides it (spec 0026, AC-12, task 18:
    // the owner's call, 2026-11-26, keeping spec 0005 AC-14 and spec 0013
    // AC-19).
    await expect(page.getByTestId("coverage")).toBeVisible();
    await expect(page.getByTestId("coverage-toggle")).toHaveCount(0);
    await expect(page.getByTestId("coverage")).toHaveText(
      /RedactNest looked for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers\. Anything else, such as names and addresses, stays in the file\./,
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
    expect(colours.tint.trim()).toBe("#ccfbf1");
    expect(colours.expected.background).not.toBe("rgb(204, 251, 241)");
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
  /**
   * Inter everywhere (spec 0003, INV-6), except the places the owner's port
   * of `Main.dc.html` sets in the monospace stack (2026-11-25): the black
   * box section's two copies of the page's text, then the network band's
   * table. Each carries `data-mono`, and the list of them is exact, so a
   * new monospace place fails here until it is named.
   */
  const MONO_PLACES: Readonly<Record<string, readonly string[]>> = {
    "/": ["home-black-box", "home-black-box", "home-network"],
    "/tool": [],
  };

  for (const path of ["/", "/tool"]) {
    test(`renders every piece of text on ${path} in Inter, but the named monospace places`, async ({
      page,
    }) => {
      await page.goto(path);

      const families = await page.evaluate(() => {
        const inter = new Set<string>();
        const mono = new Set<string>();
        for (const element of document.querySelectorAll("body *")) {
          const first = getComputedStyle(element).fontFamily.split(",")[0]?.trim() ?? "";
          (element.closest("[data-mono]") ? mono : inter).add(first);
        }
        const places = [...document.querySelectorAll("[data-mono]")].map((element) =>
          element.closest("[data-testid^='home-']")?.getAttribute("data-testid"),
        );
        return { inter: [...inter], mono: [...mono], places };
      });
      // `next/font` names the self hosted face after the family it wraps.
      expect(families.inter.every((family) => family.includes("Inter"))).toBe(true);
      expect(families.mono.every((family) => family === "ui-monospace")).toBe(true);
      expect(families.places).toEqual(MONO_PLACES[path]);
    });
  }

  /**
   * The home page too, its drawings included: they are hidden from assistive
   * technology but seen, and the brief sets the mockup's 9 to 13 pixel words
   * at 14 (the owner's port of `Main.dc.html`, 2026-11-25).
   */
  test("renders nothing smaller than 14px on the home page, drawings included", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const smallest = await page.evaluate(() =>
      Math.min(
        ...[...document.querySelectorAll("body *")]
          .filter((element) => element.textContent?.trim())
          .filter((element) => !element.closest(".sr-only"))
          .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)),
      ),
    );
    expect(smallest).toBeGreaterThanOrEqual(14);
  });

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

    /**
     * Every page's header scrolls away, but the home page's from `lg`, which
     * the owner's port of `Main.dc.html` keeps at the window's top (spec
     * 0003, AC-14, as it amends it); the home page's own test walks the
     * focus clear of it.
     */
    test(`${path} keeps the header static, so it scrolls away${path === "/" ? ", below lg" : ""}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1000, height: 800 });
      await page.goto(path);

      const position = () =>
        page
          .getByRole("banner")
          .evaluate((element) => getComputedStyle(element).position);
      expect(await position()).toBe("static");
      await page.setViewportSize({ width: 1280, height: 800 });
      expect(await position()).toBe(path === "/" ? "sticky" : "static");
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
      "Runs in your browser. Never uploaded.",
    );
    const main = page.getByRole("main");
    await expect(main).toContainText(
      "RedactNest looks for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers in your PDF and lets you tick what to remove.",
    );
    // Spec 0013, AC-30, as the port of `Main.dc.html` amends it: the tool's
    // own lock line shows only inside the drawn window, as the tool draws it.
    const lock = "Your file never leaves your browser.";
    expect((await main.textContent())?.split(lock)).toHaveLength(2);
    await expect(page.getByTestId("home-window")).toContainText(lock);
    // The build's own caps, with billing on (`playwright.config.ts`).
    await expect(page.getByTestId("home-caps")).toHaveText(
      "Free up to 3 pages a document. Pro goes up to 50.",
    );
    // Each place names the way in its own way (AC-30).
    for (const [region, name] of [
      [page.getByRole("banner"), "Try it free"],
      [main, "Remove text from a PDF"],
    ] as const) {
      for (const link of await region.getByRole("link", { name }).all())
        await expect(link).toHaveAttribute("href", "/tool");
    }
    await expect(main.getByRole("link", { name: "See how it works" })).toHaveAttribute(
      "href",
      "#how-it-works",
    );
    // Spec 0026, AC-8: the sections in order, the pricing cards with billing on.
    await expect(main.getByRole("heading", { level: 2 })).toHaveText([
      "Three steps to a redacted PDF",
      "A black box is not redaction",
      "What RedactNest looks for and strips",
      "Watch your network tab while you redact",
      "Free to start, Pro for longer files",
      "Questions",
      "Redact your next PDF",
    ]);
    await expect(main.getByRole("heading", { level: 3 })).toHaveText([
      "Open a PDF",
      "Tick what to remove",
      "Download your new file",
      "Looks for",
      "Strips",
      "Free",
      "Pro",
    ]);
  });

  /**
   * The home page's sticky header (spec 0003, AC-14, as the port of
   * `Main.dc.html` amends it; WCAG 2.4.11, technique C43). From `lg` the bar
   * stays at the window's top, and no focus stop below it ever lands under
   * it, walking forward and back, nor does the How it works heading after
   * its in page link. Below `lg` it scrolls away as every other header does.
   */
  test("keeps the header at the top from lg, and never over what has focus", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const header = page.getByRole("banner");

    await page.mouse.wheel(0, 2400);
    await expect
      .poll(() => header.evaluate((el) => el.getBoundingClientRect().top))
      .toBe(0);
    const bar = await header.evaluate((el) => el.getBoundingClientRect().bottom);

    /**
     * Each focus stop below the bar, in page order: everything a Tab reaches
     * outside the header, the skip link aside (it floats above the bar).
     * Before each Shift+Tab the page is scrolled so the stop it moves to sits
     * under the bar, the one case where a browser that thinks the stop is in
     * view would not scroll at all. Without the scroll padding, measured on
     * this page, five stops stayed under the bar.
     */
    const STOPS = 'a[href], button:not([disabled]), summary, [tabindex="0"]';
    const count = await page.evaluate(
      (selector) =>
        [...document.querySelectorAll(selector)].filter(
          (el) =>
            !el.closest("header") &&
            el.getAttribute("href") !== "#main" &&
            el.getClientRects().length > 0,
        ).length,
      STOPS,
    );
    expect(count).toBeGreaterThan(15);
    for (let index = 1; index < count; index += 1) {
      await page.evaluate(
        ([selector, at]) => {
          const stops = [...document.querySelectorAll<HTMLElement>(selector)].filter(
            (el) =>
              !el.closest("header") &&
              el.getAttribute("href") !== "#main" &&
              el.getClientRects().length > 0,
          );
          const [target, next] = [stops[at - 1], stops[at]];
          if (!target || !next) throw new Error(`no stop ${at}`);
          window.scrollBy(0, target.getBoundingClientRect().top - 10);
          next.focus({ preventScroll: true });
        },
        [STOPS, index] as const,
      );
      await page.keyboard.press("Shift+Tab");
      const top = await page.evaluate(
        () => document.activeElement?.getBoundingClientRect().top ?? 0,
      );
      // The ring is drawn 4 pixels outside the box, and stays clear too.
      expect(top - 4, `stop ${index}`).toBeGreaterThanOrEqual(bar);
    }

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("main").getByRole("link", { name: "See how it works" }).click();
    const heading = page.getByRole("heading", { level: 2 }).first();
    await expect
      .poll(() => heading.evaluate((el) => el.getBoundingClientRect().top))
      .toBeGreaterThanOrEqual(bar);

    await page.setViewportSize({ width: 1000, height: 900 });
    await page.evaluate(() => window.scrollTo(0, 1200));
    await expect
      .poll(() => header.evaluate((el) => el.getBoundingClientRect().bottom))
      .toBeLessThan(0);
  });

  /**
   * Spec 0013, AC-11, as the owner's port of `Main.dc.html` amends it
   * (2026-11-25): two white cards on the page's canvas, each its title and
   * subtitle, its items as chips in place of the tiles, then its note. Side
   * by side and equal height from `md`, Looks for first when stacked. Spec
   * 0019, AC-12, gives the heading, the first card's title and the notes.
   */
  test("shows what it looks for and strips as two cards of chips, side by side from md", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const band = page.getByTestId("home-band");
    const finds = page.getByTestId("home-finds");
    const strips = page.getByTestId("home-strips");
    // With billing on (`playwright.config.ts`), Pro's own terms close the list.
    await expect(finds.getByRole("listitem")).toHaveText([
      "Email addresses",
      "Phone numbers",
      "Dates",
      "Card numbers",
      "Bank account numbers (IBAN)",
      "US Social Security numbers",
      "UK National Insurance numbers",
      "+ Your own terms with Pro",
    ]);
    await expect(finds).toContainText("Sensitive details we can detect in your files.");
    await expect(finds).toContainText(
      "No selectable text wholly inside a page's visible area is removed unless you tick it.",
    );
    await expect(strips).toContainText("Whenever a file carries them");
    // Spec 0019, AC-12: no XMP metadata while a picture can carry it.
    await expect(strips.getByRole("listitem")).toHaveText([
      "Document info",
      "Attachments",
      "Bookmarks",
      "JavaScript",
      "Earlier versions",
      "Page thumbnails",
    ]);
    await expect(strips).toContainText(
      "Comments and form fields are flattened into the page: what showed stays, and the comments and fields themselves are removed, with a note's hidden text and any attached file.",
    );
    // Each item a pill of words, no icon; nothing in the band acts.
    for (const card of [finds, strips]) {
      for (const item of await card.getByRole("listitem").all()) {
        await expect(item.locator("svg")).toHaveCount(0);
        // `rounded-full`, a radius far past the pill's own height.
        const radius = await item.evaluate((element) =>
          Number.parseFloat(getComputedStyle(element).borderTopLeftRadius),
        );
        expect(radius).toBeGreaterThan(1000);
      }
    }
    await expect(band.locator("a, button, [tabindex]")).toHaveCount(0);

    // No full width strip: the section shows the canvas, and a `border` edge
    // tells the white cards from it.
    const background = (locator: typeof band) =>
      locator.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(await background(band)).toBe("rgba(0, 0, 0, 0)");
    expect(
      await finds.evaluate((element) => getComputedStyle(element).borderTopColor),
    ).toBe("rgb(228, 228, 231)");
    const [findsBox, stripsBox] = [await rectOf(finds), await rectOf(strips)];
    expectNear(findsBox.top, stripsBox.top);
    expectNear(findsBox.bottom, stripsBox.bottom);
    expect(findsBox.right).toBeLessThan(stripsBox.left);
  });

  /** At 200% text the chips wrap inside their cards, none past its edge. */
  test("keeps every chip inside its card at 200% text", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

    for (const id of ["home-finds", "home-strips"]) {
      const card = await rectOf(page.getByTestId(id));
      for (const item of await page.getByTestId(id).getByRole("listitem").all()) {
        const chip = await rectOf(item);
        expect(chip.left).toBeGreaterThanOrEqual(card.left);
        expect(chip.right).toBeLessThanOrEqual(card.right);
      }
    }
  });

  test("stacks the two cards below md, Looks for first", async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await page.goto("/");

    const finds = await page.getByTestId("home-finds").boundingBox();
    const strips = await page.getByTestId("home-strips").boundingBox();
    expect((finds?.y ?? 0) + (finds?.height ?? 0)).toBeLessThanOrEqual(strips?.y ?? 0);
  });

  /**
   * AC-11 and AC-33: a Finds row is not a control, so it keeps the browser's
   * default arrow and does not change under the pointer.
   */
  test("leaves a Finds row the default arrow, unchanged under the pointer", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    const row = page.getByTestId("home-finds").getByRole("listitem").first();
    const look = () =>
      row.evaluate((element) => {
        const style = getComputedStyle(element);
        return { cursor: style.cursor, fill: style.backgroundColor };
      });

    const atRest = await look();
    await row.hover();

    expect(["auto", "default"]).toContain(atRest.cursor);
    expect(await look()).toEqual(atRest);
  });

  /**
   * Spec 0013, AC-12, as the owner's port of `Main.dc.html` amends it: the
   * product window drawn in HTML, one picture named by its alt text, loading
   * no image, with the card hanging off its lower left corner from `lg`.
   */
  test("draws the product window in HTML, on the right from lg, its card on its corner", async ({
    page,
  }) => {
    const images: string[] = [];
    page.on("request", (request) => {
      if (request.resourceType() === "image") images.push(request.url());
    });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");

    const shot = page.getByRole("img", {
      name: "RedactNest reviewing a sample employment agreement: email addresses and phone numbers found and ticked, with a Redact button beside them.",
    });
    await expect(shot).toHaveAttribute("data-testid", "home-window");
    expect(await page.getByRole("main").locator("img").count()).toBe(0);
    expect(images.filter((url) => url.includes("product-review"))).toEqual([]);

    // From `lg`, text on the left and the window on the right.
    const text = await rectOf(page.getByRole("heading", { level: 1 }));
    const picture = await rectOf(shot);
    expect(text.right).toBeLessThanOrEqual(picture.left);
    // The card, 36 pixels out from the window's left edge and 28 below it.
    const card = await rectOf(page.getByTestId("home-shot-card"));
    expectNear(card.left, picture.left - 36);
    expectNear(card.bottom, picture.bottom + 28);
  });

  /**
   * Spec 0026, AC-8: How it works, three cards one under another below `md`
   * and side by side from it, in the tool's order.
   */
  for (const [width, beside] of [
    [390, false],
    [1280, true],
  ] as const) {
    test(`sets the three How it works cards ${beside ? "side by side" : "one under another"} at ${width} pixels`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");

      const cards = page.getByTestId("home-steps").getByRole("listitem");
      await expect(cards.getByRole("heading", { level: 3 })).toHaveText([
        "Open a PDF",
        "Tick what to remove",
        "Download your new file",
      ]);
      const boxes = [];
      for (const card of await cards.all()) boxes.push(await rectOf(card));
      for (const [index, box] of boxes.entries()) {
        if (index === 0) continue;
        const before = boxes[index - 1] as (typeof boxes)[number];
        if (beside) {
          expectNear(box.top, before.top);
          expect(box.left).toBeGreaterThanOrEqual(before.right);
        } else {
          expectNear(box.left, before.left);
          expect(box.top).toBeGreaterThanOrEqual(before.bottom);
        }
      }
    });
  }

  test("puts the text before the shot below lg", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto("/");

    const caps = await page.getByTestId("home-caps").boundingBox();
    const picture = await page
      .getByRole("img", { name: /reviewing a sample/ })
      .boundingBox();
    expect((caps?.y ?? 0) + (caps?.height ?? 0)).toBeLessThanOrEqual(picture?.y ?? 0);
  });

  // Spec 0026, AC-3: `title` below `sm`, 3.25rem from there, and the home
  // page's own 3.75rem from `lg` (`text-hero`, `Main.dc.html`).
  test("steps the headline up from 30px to 52px at sm and 60px at lg", async ({
    page,
  }) => {
    const size = () =>
      page
        .getByRole("heading", { level: 1 })
        .evaluate((element) => getComputedStyle(element).fontSize);

    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    expect(await size()).toBe("30px");

    await page.setViewportSize({ width: 800, height: 800 });
    expect(await size()).toBe("52px");

    await page.setViewportSize({ width: 1280, height: 800 });
    expect(await size()).toBe("60px");
  });

  test("walks from the skip link to the wordmark, the header's links and both buttons", async ({
    page,
  }) => {
    await page.goto("/");

    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to main content" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "RedactNest" })).toBeFocused();
    // Spec 0026, AC-5: the nav, then Sign in, before the header's button.
    for (const name of ["How it works", "Security", "Pricing", "Sign in"]) {
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("banner").getByRole("link", { name, exact: true }),
      ).toBeFocused();
    }
    await page.keyboard.press("Tab");
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Try it free" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    const main = page
      .getByRole("main")
      .getByRole("link", { name: "Remove text from a PDF" })
      .first();
    await expect(main).toBeFocused();
    await expectFocusRing(main);
    // Spec 0026, AC-8: See how it works beside it.
    await page.keyboard.press("Tab");
    const how = page.getByRole("main").getByRole("link", { name: "See how it works" });
    await expect(how).toBeFocused();
    await expectFocusRing(how);
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
      page
        .getByRole("main")
        .getByRole("link", { name: "Remove text from a PDF" })
        .first(),
    ).toBeFocused();
  });

  // The hero's are `xl`, the mockup's 50 pixels (`Main.dc.html`).
  test("its button links are button sized: 40px in the header, 50px below", async ({
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
      .first()
      .boundingBox();
    // Exact, not a floor: a minimum once passed while padding pushed a button past its size.
    expect(header?.height).toBe(40);
    expect(main?.height).toBe(50);

    // The menu's copy of Try it free shows only on a row under 20.5rem.
    await expectTargetSizes(page, ["#main", "Menu", "/sign-in", "/tool"]);
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
      header.getByRole("link", { name: "How it works" }),
      header.getByRole("link", { name: "Pricing" }),
      header.getByRole("link", { name: "Sign in" }),
      header.getByRole("link", { name: "Try it free" }),
      main.getByRole("link", { name: "Remove text from a PDF" }).first(),
      main.getByRole("link", { name: "See how it works" }),
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

  /** Spec 0007, AC-10: the rows are held while a run works, and Cancel is the way out. */
  test("is not allowed on the held rows while a run works, and the pointer on Cancel", async ({
    page,
  }) => {
    await page.goto("/tool");
    await redactingHeld(page);

    const box = page.getByRole("checkbox", { name: "contact@example.com" });
    await expect(box).toBeDisabled();
    expect(await cursorOf(box)).toBe("not-allowed");
    expect(await cursorOf(box.locator("xpath=ancestor::label[1]"))).toBe("not-allowed");
    expect(await cursorOf(page.getByTestId("cancel"))).toBe("pointer");
  });

  /**
   * AC-33 and AC-34. The busy and disabled controls that matter live on
   * `/account`, which no browser test signs in to reach, so the shapes they
   * take are added to a public page and read through the real compiled rule:
   * a busy button (`aria-disabled`, never `disabled`), a disabled one, a link
   * marked disabled, a disabled checkbox, and a text field, which keeps the
   * text cursor as Clerk's fields do.
   */
  test("is not allowed on whatever is busy or disabled, and the text cursor stays in a field", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("main").evaluate((main) => {
      main.insertAdjacentHTML(
        "beforeend",
        [
          '<button type="button" data-probe="busy" aria-disabled="true">Signing you out</button>',
          '<button type="button" data-probe="disabled" disabled>Cancel</button>',
          '<a href="/" data-probe="link" aria-disabled="true">Home</a>',
          '<label data-probe="row"><input type="checkbox" disabled> A blocked row</label>',
          '<input type="text" data-probe="field" aria-label="Email address">',
          '<button type="button" data-probe="enabled">Sign out</button>',
        ].join(""),
      );
    });
    const probe = (name: string) => page.locator(`[data-probe="${name}"]`);

    for (const name of ["busy", "disabled", "link", "row"]) {
      expect(await cursorOf(probe(name)), name).toBe("not-allowed");
    }
    expect(await cursorOf(probe("row").locator("input"))).toBe("not-allowed");
    expect(await cursorOf(probe("field"))).toBe("text");
    expect(await cursorOf(probe("enabled"))).toBe("pointer");
  });
});

/**
 * Spec 0024, AC-14 (feature 29), and spec 0013's AC-26 as it amends it: 320
 * pixels and 200% text at once, which together are roughly 800% zoom. WCAG
 * does not ask for that, but a visitor who needs both meets it, and on `/` the
 * headline's longest word and the band cards' tiles were wider than the window.
 * `REFLOW_PAGES` holds `/` and each search page, and since spec 0026's
 * accessibility sweep (AC-16, its Follow-up) `/pricing` and the three pages of
 * prose, where a host name too long for a line now breaks.
 *
 * It runs at 305 pixels too, which is 320 less a 15 pixel classic scrollbar.
 * Headless Chromium draws no scrollbar, so at 320 it never sees the window a
 * person's desktop browser leaves; at 305 the page's percentages, gutters and
 * rows see what they would there. Spec 0024, *The lockup at narrow widths*.
 */
test.describe("320 pixels with 200% text (spec 0024, AC-14)", () => {
  const REFLOW_PAGES = [
    "/",
    "/redact-pdf",
    "/remove-text-from-pdf",
    "/black-box-redaction",
    "/pricing",
    "/privacy",
    "/terms",
    "/security",
  ] as const;

  /**
   * Every box and every run of text in the page ends inside the window, and
   * no box in `main` holds content wider than itself, so what was too wide
   * wraps or shrinks rather than spilling past its card or being clipped.
   * Text runs are read as well as boxes, because a word wider than its box
   * spills without moving the box.
   *
   * At 305 pixels alone, the text loop passes over the skip link's words. The
   * link is `sr-only` until it takes focus, a 1 pixel clipped box that scrolls
   * nothing, but a range over its text reports the words unclipped, 309 pixels
   * at 200% text, past a 305 window. The scroll check and the box loop are the
   * same at both widths, and at 320 the text loop keeps the skip link's words.
   * Spec 0024, *The lockup at narrow widths*.
   *
   * The text loop passes over every other visually hidden word for the same
   * reason: the header's Menu button sits at the row's right edge, and its
   * `sr-only` name reads 4 pixels past the window at 200% text, though it
   * draws and scrolls nothing (`ROW_UNLESS_NARROW` put the button there).
   */
  async function expectNothingPastTheWindow(page: Page, width: 320 | 305): Promise<void> {
    await expectNoHorizontalScroll(page);
    // Passed in, because the callback runs in the browser and sees no test variable.
    const spills = await page.evaluate((passOverSkipLink) => {
      const limit = document.documentElement.clientWidth;
      const found: string[] = [];
      for (const element of document.querySelectorAll("body *")) {
        const box = element.getBoundingClientRect();
        if (box.width > 0 && box.right > limit + 0.5) {
          found.push(`box past the window: ${element.tagName}`);
        }
      }
      for (const element of document.querySelectorAll("main *")) {
        // A visually hidden word (a callout's tone, spec 0003, INV-8) is a 1
        // pixel clipped box that scrolls nothing and shows nothing.
        if (element.closest(".sr-only") !== null) continue;
        // An inline box reports no width of its own to compare.
        if (element.clientWidth > 0 && element.scrollWidth > element.clientWidth + 1) {
          found.push(`content wider than its box: ${element.tagName}`);
        }
      }
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const skipLink = node.parentElement?.closest('a[href="#main"]');
        if (skipLink && passOverSkipLink) continue;
        if (!skipLink && node.parentElement?.closest(".sr-only")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const box = range.getBoundingClientRect();
        if (box.width > 0 && box.right > limit + 0.5) {
          found.push(`text past the window: ${node.textContent?.trim().slice(0, 30)}`);
        }
      }
      return found;
    }, width === 305);
    expect(spills).toEqual([]);
  }

  // 305 is 320 less a classic scrollbar. Spec 0024, *The lockup at narrow widths*.
  for (const width of [320, 305] as const) {
    for (const path of REFLOW_PAGES) {
      test(`${path} at ${width} pixels: needs no sideways scroll, with the menu shut and open`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 640 });
        await page.goto(path);
        await page.addStyleTag({ content: "html { font-size: 200% !important; }" });

        await expectNothingPastTheWindow(page, width);

        const header = page.getByRole("banner");
        await header.getByRole("button", { name: "Menu", exact: true }).click();
        await expect(header.getByRole("link", { name: "Try it free" })).toBeVisible();
        await expectNothingPastTheWindow(page, width);
      });
    }
  }

  /**
   * The fix leaves wider screens as they were: `/`'s hero, trio and band at
   * 1280 pixels, recorded from the build before it as x, y and width. Within
   * a pixel, so a rounding difference between machines is not a change.
   *
   * No height is recorded, because a box's height follows its wrapped text and
   * Linux draws Inter a few pixels wider than Windows, where these were read:
   * on CI the band's Looks for chips wrapped one more row (44 pixels, 36 and a
   * gap of 8) with nothing moved (CI run 45842120945). The hero's height and
   * the trio's are still held, by the y of the box below each.
   */
  test("/: keeps the hero, the trio and the band where they were at 1280 pixels", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");

    for (const [box, recorded] of [
      // Recorded again for the owner's port of `Main.dc.html` (2026-11-25):
      // the hero, the How it works cards and the band.
      [page.getByTestId("home-hero"), [82, 153, 1116]],
      [page.getByTestId("home-steps").getByRole("list"), [82, 1131.8, 1116]],
      [page.getByTestId("home-band"), [82, 2213.1, 1116]],
    ] as const) {
      const measured = await box.boundingBox();
      if (measured === null) throw new Error("a recorded box is not drawn");
      const [x, y, width] = recorded;
      for (const [value, was] of [
        [measured.x, x],
        [measured.y, y],
        [measured.width, width],
      ] as const) {
        expect(Math.abs(value - was)).toBeLessThanOrEqual(1);
      }
    }
  });
});

/**
 * Spec 0024, AC-17, *The footer at 200% text*. From `md` the footer is two
 * columns, the brand and the link groups. The Guides group widened the groups'
 * line, and with the brand column free to shrink to nothing, "RedactNest" lay
 * under the groups at 200% text. Its floor is now its own content, so the
 * groups wrap under each other instead.
 *
 * Every check compares a box with a box, never a pixel figure, because Linux
 * draws text about 3 pixels wider than Windows (CI run 45146529620), so both
 * sides move together. The footer is the root layout's, the same on every
 * page, so `/` stands for all of them. Nothing reads the page's `scrollWidth`:
 * `/` at 1024 pixels with 200% text is wider than the window from its main
 * content (the spec's Follow-up), not from the footer.
 */
test.describe("the footer from md (spec 0024, AC-17)", () => {
  for (const width of [1280, 1024, 768] as const) {
    for (const large of [true, false] as const) {
      const title = large
        ? `keeps the brand clear of the link groups at ${width} pixels with 200% text`
        : `keeps the brand and the link groups in one row at ${width} pixels with default text`;
      test(title, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/");
        if (large) {
          await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
        }
        // Measure the words in Inter, never in the fallback face.
        await page.evaluate(async () => {
          await document.fonts.ready;
        });

        const footer = await page.getByRole("contentinfo").evaluate((element) => {
          /**
           * The right edge of every line of text inside an element: each text
           * node's client rects, line by line, so a word that wraps is read on
           * the line it ends on, never as one bounding box.
           */
          function textEdge(root: Element): number {
            let edge = Number.NEGATIVE_INFINITY;
            const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if (!node.textContent?.trim()) continue;
              const range = document.createRange();
              range.selectNodeContents(node);
              for (const rect of range.getClientRects()) {
                if (rect.width > 0) edge = Math.max(edge, rect.right);
              }
            }
            return edge;
          }

          // The `PageContainer` grid: the brand column, then the groups' column.
          const grid = element.querySelector(":scope > div");
          const brand = grid?.children[0];
          const groupsColumn = grid?.children[1];
          if (!brand || !groupsColumn) throw new Error("the footer's grid has changed");
          const brandBox = brand.getBoundingClientRect();
          return {
            window: document.documentElement.clientWidth,
            brand: { top: brandBox.top, bottom: brandBox.bottom, right: brandBox.right },
            brandText: textEdge(brand),
            groupsLeft: groupsColumn.getBoundingClientRect().left,
            groups: [...groupsColumn.querySelectorAll("nav")].map((nav) => {
              const box = nav.getBoundingClientRect();
              return { top: box.top, bottom: box.bottom, left: box.left };
            }),
            text: textEdge(element),
          };
        });

        // Product, Guides and Legal, so no check below passes on an empty list.
        expect(footer.groups).toHaveLength(3);

        // The check that fails on the bug: the brand column's words end inside
        // it. One pixel covers subpixel edges only.
        expect(footer.brandText).toBeLessThanOrEqual(footer.brand.right + 1);

        if (large) {
          // A sanity check on the layout: a group that shares rows with the
          // brand column starts right of it. Two grid cells never overlap, so
          // this alone cannot fail on the bug.
          for (const group of footer.groups) {
            if (group.top < footer.brand.bottom && group.bottom > footer.brand.top) {
              expect(group.left).toBeGreaterThanOrEqual(footer.brand.right);
            }
          }
          // The footer's words end inside the window, with the suite's allowance.
          expect(footer.text).toBeLessThanOrEqual(footer.window + 0.5);
        } else {
          // Default text, as before: the brand and the groups side by side in
          // one row, and the three groups on one line.
          expect(footer.groupsLeft).toBeGreaterThanOrEqual(footer.brand.right);
          for (const group of footer.groups) {
            expect(Math.abs(group.top - footer.brand.top)).toBeLessThanOrEqual(1);
          }
        }
      });
    }
  }
});

test.describe("every page (spec 0013, AC-26; spec 0024, AC-13; spec 0026, AC-16)", () => {
  // Spec 0026, AC-16 adds `/security` to spec 0013 AC-26's list. `/sign-out`
  // needs a real Clerk session, which this build's fake keys cannot give, so
  // it is walked on `pnpm dev` (verify.md, task 14).
  const PAGES = [
    "/",
    "/redact-pdf",
    "/remove-text-from-pdf",
    "/black-box-redaction",
    "/pricing",
    "/privacy",
    "/terms",
    "/security",
    "/no-such-page",
  ] as const;

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

/**
 * Spec 0026, AC-16. Tab from the top of the page reaches every control the
 * page draws, header and footer included, in page order, each with the ring
 * a keyboard sees (`:focus-visible`). The controls are listed from the page
 * itself (everything focusable, enabled and drawn), so a control added out
 * of reach, or reached out of order, fails here without a list kept by hand.
 *
 * The walk starts from a mark put first in the body and focused, so it begins
 * at the top wherever focus was (a run puts it on Cancel), and stops once
 * focus leaves the page or comes round.
 */
async function expectWholePageWalk(page: Page): Promise<void> {
  const stops = await page.evaluate(() => {
    const reachable = [
      ...document.querySelectorAll<HTMLElement>(
        "a[href], button, input, select, textarea, summary, [tabindex]",
      ),
    ].filter(
      (element) =>
        element.tabIndex >= 0 &&
        !(element as HTMLButtonElement).disabled &&
        element.getClientRects().length > 0,
    );
    reachable.forEach((element, index) => {
      element.dataset.sweep = String(index);
    });
    const start = document.createElement("span");
    start.tabIndex = -1;
    start.dataset.sweepStart = "";
    document.body.prepend(start);
    start.focus();
    return reachable.length;
  });
  expect(stops).toBeGreaterThan(0);

  const reached: number[] = [];
  for (let step = 0; step <= stops; step += 1) {
    await page.keyboard.press("Tab");
    const index = await page.evaluate(() => {
      const active = document.activeElement;
      return active instanceof HTMLElement && active.dataset.sweep !== undefined
        ? Number(active.dataset.sweep)
        : null;
    });
    if (index === null || reached.includes(index)) break;
    reached.push(index);
    const stop = page.locator(`[data-sweep="${index}"]`);
    expect(await stop.evaluate((element) => element.matches(":focus-visible"))).toBe(
      true,
    );
    await expectFocusRing(stop);
  }
  await page.evaluate(() => document.querySelector("[data-sweep-start]")?.remove());

  expect(reached).toEqual([...Array(stops).keys()]);
}

/**
 * Spec 0026, AC-16: every control on every page keeps a visible ring as the
 * keyboard reaches it, and every target is at least 24 by 24 pixels, at
 * desktop width and at 320 with the header's menu open. The search pages'
 * walk is their own (below), and `/tool`'s other states are walked in "the
 * keyboard walk on the tool page" and "target sizes on the tool page".
 */
test.describe("every control on every page (spec 0026, AC-16)", () => {
  const WALKED = [
    "/",
    "/pricing",
    "/privacy",
    "/terms",
    "/security",
    "/no-such-page",
    "/tool",
  ] as const;
  const MEASURED = [
    ...WALKED,
    "/redact-pdf",
    "/remove-text-from-pdf",
    "/black-box-redaction",
  ] as const;

  /**
   * The server draws the account slot empty and the page fills it once its
   * script runs (child 0001, AC-25), so the controls are listed only after
   * that, or the slot's Sign in would be met unlisted.
   */
  async function ready(page: Page, path: string): Promise<void> {
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }),
    ).toBeVisible();
    if (path === "/tool") await planAnswered(page);
  }

  for (const path of WALKED) {
    test(`${path}: Tab reaches every control in page order, each with its ring`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await ready(page, path);

      await expectWholePageWalk(page);
    });
  }

  for (const path of MEASURED) {
    test(`${path}: every target is at least 24 by 24 pixels, at 1280 and at 320 with the menu open`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);
      await ready(page, path);
      // From `sm` the account slot's row holds Sign in, so the menu's own
      // Sign in has no box, and the Menu button shows only below `sm`
      // (child 0001, AC-27). The tool page's file input is never a stop.
      // A link inside a sentence takes WCAG 2.5.8's inline exception.
      // Try it free has two copies off `/tool`, the row's and the menu's, and
      // one is always hidden: the menu's from a 20.5rem row, the row's below
      // it (`ROW_UNLESS_NARROW`). Both are a plain `a` to `/tool`.
      const tool = path === "/tool" ? ["file-input"] : ["/tool"];
      await expectTargetSizes(page, ["#main", "Menu", "/sign-in", ...tool], {
        sentences: true,
      });

      // Below `sm` the menu takes Sign in, and at 320 Try it free too.
      await page.setViewportSize({ width: 320, height: 640 });
      await page
        .getByRole("banner")
        .getByRole("button", { name: "Menu", exact: true })
        .click();
      await expect(
        page.getByRole("banner").getByRole("link", { name: "Sign in", exact: true }),
      ).toBeVisible();
      await expectTargetSizes(page, ["#main", "/sign-in", ...tool], { sentences: true });
    });
  }
});

/**
 * Child 0003, AC-31, and spec 0026, AC-16: the progress steps walked by
 * keyboard and read as a screen reader reads them. Each step is named by its
 * words and its state in words, the bar is hidden, and nothing in the card is
 * a stop, so Tab passes it by and the run keeps focus on Cancel.
 */
test.describe("the progress steps (child 0003, AC-31; spec 0026, AC-16)", () => {
  const STOPS = "a[href], button, input, select, textarea, summary, [tabindex]";

  /**
   * A run held at its first step: once `holdRun` is set, every message from
   * the worker is dropped but the `redacting` phase, so the card shows that
   * step as current and the run never ends. Installed before the page's own
   * script, so the client's listener is wrapped as it is added.
   */
  async function holdRunAtFirstStep(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const add = Worker.prototype.addEventListener as (
        this: Worker,
        ...args: unknown[]
      ) => void;
      Worker.prototype.addEventListener = function (this: Worker, ...args: unknown[]) {
        const [type, listener] = args;
        if (type === "message" && typeof listener === "function") {
          args[1] = (event: MessageEvent<{ kind?: string; phase?: string } | null>) => {
            const held = (window as { holdRun?: boolean }).holdRun === true;
            const first =
              event.data?.kind === "progress" && event.data.phase === "redacting";
            if (held && !first) return;
            (listener as (event: MessageEvent) => void)(event);
          };
        }
        add.apply(this, args);
      } as Worker["addEventListener"];
    });
  }

  // Playwright's snapshot joins the label and its hidden state words with a
  // space; a screen reader reads them as one line, the comma a pause.
  test("names each of the open's steps with its state, and Tab never stops in them", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await planAnswered(page);
    await openingHeld(page);

    const card = page.getByTestId("progress-card");
    await expect(card).toMatchAriaSnapshot(`
      - paragraph: Opening…
      - paragraph: Loading the PDF engine
      - list:
        - listitem: /^Loading the PDF engine ?, in progress$/
        - listitem: /^Opening your document ?, not started$/
        - listitem: /^Reading each page ?, not started$/
        - listitem: /^Looking for .+ ?, not started$/
    `);
    await expect(card.locator(STOPS)).toHaveCount(0);
    await expectWholePageWalk(page);
  });

  test("names each of the run's steps with its state, and keeps focus and its ring on Cancel", async ({
    page,
  }) => {
    await holdRunAtFirstStep(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await openDocument(page);
    await page.evaluate(() => {
      (window as { holdRun?: boolean }).holdRun = true;
    });
    // Pressed by keyboard, so the ring Cancel takes is the one a keyboard sees.
    await page.getByTestId("redact").focus();
    await page.keyboard.press("Enter");

    const card = page.getByTestId("progress-card");
    await expect(card).toMatchAriaSnapshot(`
      - paragraph: Redacting…
      - paragraph: Removing what you ticked
      - list:
        - listitem: /^Removing what you ticked ?, in progress$/
        - listitem: /^Writing your new file ?, not started$/
        - listitem: /^Checking every page ?, not started$/
    `);
    await expect(card.locator(STOPS)).toHaveCount(0);

    const cancel = page.getByTestId("cancel");
    await expect(cancel).toBeFocused();
    await expect(cancel).toHaveAccessibleName("Cancel");
    expect(await cancel.evaluate((element) => element.matches(":focus-visible"))).toBe(
      true,
    );
    await expectFocusRing(cancel);
    await expectWholePageWalk(page);
  });
});

/**
 * Spec 0024, AC-13: every control on a search page keeps the ring as the
 * keyboard reaches it, in page order, from the skip link to the footer's
 * last link. Tab moves focus as a visitor's would, so `:focus-visible`
 * applies, and the walk stops once focus leaves the page or comes round.
 */
test.describe("the search pages' focus rings (spec 0024, AC-13)", () => {
  /** Each page's two buttons into the tool, by their words (spec 0024, *Page frames*). */
  const PRIMARY = {
    "/redact-pdf": "Redact a PDF now",
    "/remove-text-from-pdf": "Remove text from a PDF",
    "/black-box-redaction": "Redact a PDF properly",
  } as const;

  for (const [path, primary] of Object.entries(PRIMARY)) {
    test(`${path}: every control keeps a visible ring`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path);

      const seen: string[] = [];
      for (let step = 0; step < 60; step += 1) {
        await page.keyboard.press("Tab");
        const focused = page.locator(":focus");
        if ((await focused.count()) === 0) break;
        // Each control is marked as it is reached, so two with the same name
        // (the page's two buttons) are both walked, and coming round stops it.
        const name = await focused.evaluate((element) => {
          if (element.hasAttribute("data-walked")) return null;
          element.setAttribute("data-walked", "");
          return `${element.tagName} ${element.getAttribute("href") ?? ""} ${element.textContent?.trim() ?? ""}`;
        });
        if (name === null) break;
        seen.push(name);
        await expectFocusRing(focused);
      }
      // The skip link, the header, both buttons into the tool, the look over
      // link and the footer's links, at the least.
      expect(seen.length).toBeGreaterThan(8);
      expect(seen.filter((name) => name === `A /tool ${primary}`)).toHaveLength(2);
      expect(seen.some((name) => name.includes("/security#what-it-can-miss"))).toBe(true);
    });
  }
});

/**
 * Spec 0013, AC-23 and AC-26, feature 28: the *Sign in wait* scenario.
 *
 * Playwright's build points Clerk at a fake development instance, so Clerk's
 * form never draws here and only the placeholder can be held. Every request
 * to Clerk's development host is held unanswered, as verify's hang walk did,
 * rather than left to whatever that host answers today: the case needs no
 * network, and Clerk stays at `loading`, so our timer is what ends the wait.
 * `page.clock` runs it past 20 seconds instead of waiting them out. The form
 * replacing the placeholder, before and after the failure line, is walked by
 * hand in the sandbox.
 */
test.describe("the sign in wait (spec 0013, AC-23, AC-26)", () => {
  const STEPS = [
    {
      path: "/sign-in",
      loading: "Loading sign in…",
      failed: "Sign in did not load. Check your connection, then reload this page.",
    },
    {
      path: "/sign-up",
      loading: "Loading sign up…",
      failed: "Sign up did not load. Check your connection, then reload this page.",
    },
  ] as const;

  /**
   * Opens `path` with Clerk's host never answering, so Clerk never loads and
   * never says why. A fresh browser on a development instance is first sent
   * to Clerk's handshake, a redirect `page.route` cannot catch, so the context
   * carries a development browser cookie, as a second visit would, and the
   * page renders. With Clerk's script held the load event never comes, so the
   * page is read once its document has arrived.
   */
  async function waitingOn(page: Page, path: string): Promise<void> {
    await page
      .context()
      .addCookies([
        { name: "__clerk_db_jwt", value: "dvb_e2efake", domain: "localhost", path: "/" },
      ]);
    await page.route("https://*.clerk.accounts.dev/**", () => new Promise(() => {}));
    await page.goto(path, { waitUntil: "domcontentloaded" });
  }

  const placeholder = (page: Page) => page.getByTestId("clerk-wait");

  for (const { path, loading, failed } of STEPS) {
    /** Beside the panel from `md`, 400 pixels wide; under it below, full width. */
    for (const [width, beside] of [
      [1280, true],
      [800, true],
      [390, false],
    ] as const) {
      test(`${path}: holds Clerk's card's place ${beside ? "beside" : "under"} the panel at ${width} pixels, saying "${loading}"`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await waitingOn(page, path);

        const line = placeholder(page).getByRole("status");
        await expect(line).toHaveText(loading);
        const spinner = placeholder(page).getByTestId("spinner");
        await expect(spinner).toHaveAttribute("aria-hidden", "true");
        expect(await cssSize(spinner)).toEqual({ width: "40px", height: "40px" });

        const panel = page.getByTestId("sign-in-panel");
        const [card, panelBox, grid] = [
          await rectOf(placeholder(page)),
          await rectOf(panel),
          await rectOf(panel.locator("xpath=..")),
        ];
        // 25rem tall at the default text size.
        expect(card.bottom - card.top).toBeGreaterThanOrEqual(400);
        if (beside) {
          expect(card.right - card.left).toBe(400);
          expect(card.left).toBeGreaterThanOrEqual(panelBox.right);
        } else {
          expect(card.top).toBeGreaterThanOrEqual(panelBox.bottom);
          expect(card.left).toBe(grid.left);
          expect(card.right).toBe(grid.right);
          expect(card.right - card.left).toBeLessThanOrEqual(400);
        }
      });
    }

    test(`${path}: says it did not load once 20 seconds of ours pass, in the same status line, and axe reports nothing either side`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.clock.install();
      await waitingOn(page, path);
      const line = placeholder(page).getByRole("status");
      await expect(line).toHaveText(loading);
      await expectNoAxeViolations(page);
      const node = await line.elementHandle();

      // The timer starts when the page has hydrated, which a page load does
      // not wait for, so the clock moves on until the line changes.
      await expect(async () => {
        await page.clock.fastForward(20_000);
        await expect(line).toHaveText(failed, { timeout: 1_000 });
      }).toPass();

      expect(await node?.evaluate((element) => element.isConnected)).toBe(true);
      expect(await node?.evaluate((element) => element.textContent)).toBe(failed);
      await expect(placeholder(page).getByTestId("spinner")).toHaveCount(0);
      await expect(placeholder(page).getByRole("button")).toHaveCount(0);
      await expectNoAxeViolations(page);
    });

    test(`${path}: axe reports nothing at 320 pixels while it waits, with no sideways scroll`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 320, height: 640 });
      await waitingOn(page, path);
      await expect(placeholder(page).getByRole("status")).toHaveText(loading);

      await expectNoHorizontalScroll(page);
      await expectNoAxeViolations(page);
    });

    test(`${path}: clips nothing while it waits with the root font size doubled`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await waitingOn(page, path);
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
      await expect(placeholder(page).getByRole("status")).toHaveText(loading);

      await expectNoHorizontalScroll(page);
      await expectContained(page.getByRole("main"));
      await expectContained(placeholder(page));
    });
  }
});

/**
 * Spec 0026 child 0002, AC-39, AC-41 and AC-44: the page preview drawn at
 * 1280 pixels passes axe with the page's tags, in forced colours too, and the
 * keyboard reaches it after the list: the rail (one tab stop, arrows move
 * focus, Enter shows), Zoom out and Zoom in, then the page region, which the
 * keyboard can scroll. Each stop shows the ring.
 */
test.describe("the page preview, drawn (child 0002)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/tool");
    await page
      .getByTestId("file-input")
      .setInputFiles(resolve("tests/fixtures/read-mixed.pdf"));
    await expect(page.getByTestId("preview-canvas")).not.toHaveClass(/invisible/, {
      timeout: ENGINE_TIMEOUT,
    });
    await expect(page.locator('[data-testid="preview-thumb"] .bg-surface')).toHaveCount(
      3,
    );
  });

  test("passes axe, and again in forced colours", async ({ page }) => {
    await expectNoAxeViolations(page);
    await page.emulateMedia({ forcedColors: "active" });
    await expectNoAxeViolations(page);
    // The boxes keep their edge and lose their fill in forced colours: the
    // fill's alpha is 0, whatever colour the system gives it.
    const box = page.locator("[data-box]").first();
    const fill = await box.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(fill).toMatch(/^rgba\(\d+, \d+, \d+, 0\)$/);
    expect(await box.evaluate((element) => getComputedStyle(element).borderStyle)).toBe(
      "solid",
    );
    await page.emulateMedia({ forcedColors: "none" });
  });

  test("walks from the list into the rail, the zoom and the page region", async ({
    page,
  }) => {
    await page.locator('input[type="checkbox"][id^="match-"]').last().focus();

    await page.keyboard.press("Tab");
    const first = page.getByRole("button", { name: "Page 1, 1 found" });
    await expect(first).toBeFocused();
    await expectFocusRing(first);

    await page.keyboard.press("ArrowDown");
    const second = page.getByRole("button", { name: "Page 2 · scan" });
    await expect(second).toBeFocused();
    await expect(page.getByTestId("preview-page-of")).toHaveText("Page 1 of 3");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("preview-page-of")).toHaveText("Page 2 of 3");
    await expect(second).toHaveAttribute("aria-current", "page");
    await expect(second).toBeFocused();

    await page.keyboard.press("Tab");
    const zoomOut = page.getByRole("button", { name: "Zoom out" });
    await expect(zoomOut).toBeFocused();
    await expectFocusRing(zoomOut);
    await page.keyboard.press("Tab");
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    await expect(zoomIn).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("preview-zoom-level")).toHaveText("125%");
    await expect(zoomIn).toBeFocused();

    await page.keyboard.press("Tab");
    const region = page.getByRole("region", { name: "Page 2" });
    await expect(region).toBeFocused();
    await expectFocusRing(region);
    const before = await region.evaluate((element) => element.scrollTop);
    await page.keyboard.press("PageDown");
    await expect
      .poll(() => region.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(before);
  });
});
