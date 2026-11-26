import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";

/**
 * The page preview in a real browser (spec 0026 child 0002, AC-37 to AC-39,
 * AC-45, AC-47 and AC-53). In the `chromium` project: it times nothing.
 *
 * An init script wraps the four places a picture passes, so the test can
 * count every one: each `draw` posted to the worker (with whether a run was
 * working at the time), each picture a `page-drawn` reply carries as the
 * page's listener hears it, each picture handed to a canvas, and each one
 * closed. With those, "every picture received was shown in a canvas or
 * closed" is a set comparison, and "no canvas with a picture is left" reads
 * the last thing each canvas was given.
 */

// A 10 MB engine download and a 50 page open with detection.
test.describe.configure({ timeout: 180_000 });

const ENGINE_TIMEOUT = 90_000;
const PAGES = 50;

/** `config.previewMaxPixels`'s default, the e2e build's value. */
const MAX_PIXELS = 8_388_608;

const SHORT = resolve("tests/fixtures/read-mixed.pdf");

/**
 * Fifty US Letter pages, each a heading and two lines with an address on
 * them, so every page has a row, a badge and a box.
 */
function fiftyPages(): Buffer {
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 3 + index * 2;
  const content = (page: number) =>
    `BT /F1 18 Tf 72 720 Td (Statement ${page}) Tj ET\n` +
    `BT /F1 12 Tf 72 690 Td (Write to person${page}@example.com about it.) Tj ET\n` +
    `BT /F1 12 Tf 72 670 Td (Copy to office${page}@example.org as well.) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
    ...pageNumbers.flatMap((index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> ` +
        `/Contents ${pageObject(index) + 1} 0 R >>`,
      stream("", content(index + 1)),
    ]),
  ];
  return Buffer.from(writePdf({ objects, trailer: "/Root 1 0 R" }).bytes);
}

interface Watch {
  readonly draws: { purpose: string; page: number; running: boolean }[];
  readonly pictures: ImageBitmap[];
  readonly shown: Set<ImageBitmap>;
  readonly closed: Set<ImageBitmap>;
  readonly canvases: Map<HTMLCanvasElement, { w: number; h: number } | null>;
  running: boolean;
}

declare global {
  interface Window {
    __preview?: Watch;
  }
}

/** Runs before the page's own code, so every picture passes through it. */
function watchPictures(): void {
  const watch: Watch = {
    draws: [],
    pictures: [],
    shown: new Set(),
    closed: new Set(),
    canvases: new Map(),
    running: false,
  };
  window.__preview = watch;

  const post = Worker.prototype.postMessage;
  Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
    const message = args[0] as { kind?: string; purpose?: string; page?: number };
    if (message?.kind === "redact") watch.running = true;
    if (message?.kind === "draw") {
      watch.draws.push({
        purpose: String(message.purpose),
        page: Number(message.page),
        running: watch.running,
      });
    }
    return post.apply(this, args as Parameters<Worker["postMessage"]>);
  } as Worker["postMessage"];

  const listen = Worker.prototype.addEventListener;
  Worker.prototype.addEventListener = function (
    this: Worker,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type !== "message" || typeof listener !== "function") {
      return listen.call(this, type, listener, options);
    }
    const heard = function (this: Worker, event: Event) {
      const data = (event as MessageEvent).data as {
        kind?: string;
        picture?: ImageBitmap;
      };
      if (data?.kind === "page-drawn" && data.picture) watch.pictures.push(data.picture);
      if (data?.kind === "redacted" || data?.kind === "error") watch.running = false;
      return listener.call(this, event);
    };
    return listen.call(this, type, heard, options);
  } as Worker["addEventListener"];

  const transfer = ImageBitmapRenderingContext.prototype.transferFromImageBitmap;
  ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function (
    this: ImageBitmapRenderingContext,
    bitmap: ImageBitmap | null,
  ) {
    const canvas = this.canvas as HTMLCanvasElement;
    if (bitmap) {
      watch.shown.add(bitmap);
      watch.canvases.set(canvas, { w: bitmap.width, h: bitmap.height });
    } else {
      watch.canvases.set(canvas, null);
    }
    return transfer.call(this, bitmap);
  };

  const close = ImageBitmap.prototype.close;
  ImageBitmap.prototype.close = function (this: ImageBitmap) {
    watch.closed.add(this);
    return close.call(this);
  };
}

async function routePaid(page: Page): Promise<void> {
  await page.route("**/api/entitlement", (route) =>
    route.fulfill({
      json: {
        tier: "paid",
        pageCap: PAGES,
        maxFileBytes: 26_214_400,
        account: "signed-in",
      },
    }),
  );
}

async function openFifty(page: Page): Promise<void> {
  await page.getByTestId("file-input").setInputFiles({
    name: "statements.pdf",
    mimeType: "application/pdf",
    buffer: fiftyPages(),
  });
  await expect(page.getByTestId("page-count")).toHaveText(/50 pages/, {
    timeout: ENGINE_TIMEOUT,
  });
  await expect(page.getByTestId("checklist")).toBeVisible({ timeout: ENGINE_TIMEOUT });
}

/** The page's picture is in: no draw in flight and the canvas showing. */
async function pageDrawn(page: Page): Promise<void> {
  await expect(page.getByTestId("preview-page")).not.toHaveAttribute(
    "aria-busy",
    "true",
    {
      timeout: 20_000,
    },
  );
  await expect(page.getByTestId("preview-canvas")).not.toHaveClass(/invisible/, {
    timeout: 20_000,
  });
}

/** Every picture the page heard of went into a canvas or was closed. */
async function everyPictureAccounted(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const watch = window.__preview;
          if (!watch) return -1;
          return watch.pictures.filter(
            (picture) => !watch.shown.has(picture) && !watch.closed.has(picture),
          ).length;
        }),
      { timeout: 20_000 },
    )
    .toBe(0);
}

/** Canvases whose last picture was never let go. */
function canvasesHolding(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...(window.__preview?.canvases.values() ?? [])].filter((value) => value !== null)
        .length,
  );
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(watchPictures);
});

test("holds one page picture and small thumbnails, and lets every picture go (AC-45, AC-47, AC-53)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await routePaid(page);
  await page.goto("/tool");
  await openFifty(page);
  await pageDrawn(page);

  const zoomIn = page.getByRole("button", { name: "Zoom in" });
  for (let press = 0; press < 3; press += 1) await zoomIn.click();
  await expect(page.getByTestId("preview-zoom-level")).toHaveText("200%");

  const rail = page.getByRole("navigation", { name: "Pages" });
  for (let shown = 2; shown <= 10; shown += 1) {
    await rail.getByRole("button", { name: new RegExp(`^Page ${shown},`) }).click();
  }
  await expect(page.getByTestId("preview-page-of")).toHaveText("Page 10 of 50");
  await pageDrawn(page);

  // The rail end to end, so every thumbnail is asked for.
  await page.getByTestId("preview-rail").evaluate(async (element) => {
    for (let top = 0; top <= element.scrollHeight; top += element.clientHeight / 2) {
      element.scrollTop = top;
      await new Promise((settle) => setTimeout(settle, 120));
    }
  });
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            window.__preview?.draws.filter((d) => d.purpose === "thumbnail").length ?? 0,
        ),
      {
        timeout: 60_000,
      },
    )
    .toBe(PAGES);
  await everyPictureAccounted(page);

  const held = await page.evaluate((maxPixels) => {
    const watch = window.__preview;
    const area = document.querySelector('[data-testid="preview-area"]');
    const rail = document.querySelector('[data-testid="preview-rail"]');
    const pageCanvases = [...(watch?.canvases.entries() ?? [])].filter(
      ([canvas, value]) => value !== null && area?.contains(canvas),
    );
    const thumbs = [...(watch?.canvases.entries() ?? [])].filter(
      ([canvas, value]) => value !== null && rail?.contains(canvas),
    );
    const ratio = window.devicePixelRatio;
    return {
      pages: pageCanvases.length,
      pageWithin: pageCanvases.every(
        ([, value]) => value !== null && value.w * value.h <= maxPixels,
      ),
      thumbs: thumbs.length,
      thumbsWithin: thumbs.every(
        ([, value]) => value !== null && value.w * value.h <= 84 * 112 * ratio * ratio,
      ),
    };
  }, MAX_PIXELS);
  expect(held).toEqual({ pages: 1, pageWithin: true, thumbs: PAGES, thumbsWithin: true });

  // Start over: P goes, and no canvas keeps a picture.
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("start-over").click();
  await expect(page.getByTestId("area-preview")).toHaveCount(0);
  await everyPictureAccounted(page);
  expect(await canvasesHolding(page)).toBe(0);

  // A second document, chosen while the first is reviewed: the same again.
  await openFifty(page);
  await pageDrawn(page);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByTestId("file-input").setInputFiles(SHORT);
  await expect(page.getByTestId("area-preview")).toHaveCount(0);
  expect(await canvasesHolding(page)).toBe(0);
  await everyPictureAccounted(page);
});

test.describe("the frame at 1280 by 800 (AC-38, AC-39)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  test("draws P at the window's height beside a 26.25rem column, with the panel at the foot", async ({
    page,
  }) => {
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(SHORT);
    await pageDrawn(page);

    const frame = await page.evaluate(() => {
      const box = (id: string) =>
        document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
      const grid = document.querySelector('[data-testid="tool-grid"]') as HTMLElement;
      const sticky = document.querySelector(
        '[data-testid="area-preview"] > div',
      ) as HTMLElement;
      const panel = document.querySelector('[data-testid="action-panel"]') as HTMLElement;
      const title = document.querySelector("h1")?.getBoundingClientRect();
      return {
        columns: getComputedStyle(grid).gridTemplateColumns,
        rootPx: parseFloat(getComputedStyle(document.documentElement).fontSize),
        previewLeft: box("area-preview")?.left,
        stickyHeight: sticky.getBoundingClientRect().height,
        panelPosition: getComputedStyle(panel).position,
        panelBottom: panel.getBoundingClientRect().bottom,
        titleSize: title ? [title.width, title.height] : null,
        titleText: document.querySelector("h1")?.textContent,
      };
    });
    const [, right] = frame.columns.split(" ");
    expect(parseFloat(right ?? "0")).toBeCloseTo(26.25 * frame.rootPx, 0);
    expect(frame.previewLeft).toBe(0);
    expect(frame.stickyHeight).toBe(800);
    expect(frame.panelPosition).toBe("sticky");
    // A short list: the panel rests at the window's foot.
    expect(Math.round(frame.panelBottom)).toBe(800);
    expect(frame.titleText).toBe("Redact a PDF");
    expect(frame.titleSize).toEqual([1, 1]);
  });

  test("keeps P at the window's height while a long list scrolls", async ({ page }) => {
    await routePaid(page);
    await page.goto("/tool");
    await openFifty(page);
    await pageDrawn(page);

    await page.mouse.wheel(0, 2_000);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const sticky = document.querySelector('[data-testid="area-preview"] > div');
          const box = sticky?.getBoundingClientRect();
          return box && window.scrollY > 0
            ? [Math.round(box.top), Math.round(box.height)]
            : null;
        }),
      )
      .toEqual([0, 800]);
  });

  test("reaches P after the list by Tab: the rail, the zoom, then the page", async ({
    page,
  }) => {
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(SHORT);
    await pageDrawn(page);

    await page.locator('input[type="checkbox"][id^="match-"]').last().focus();
    const stops: string[] = [];
    for (let press = 0; press < 4; press += 1) {
      await page.keyboard.press("Tab");
      stops.push(
        await page.evaluate(
          () =>
            document.activeElement?.getAttribute("aria-label") ??
            document.activeElement?.tagName ??
            "",
        ),
      );
    }
    expect(stops).toEqual(["Page 1, 1 found", "Zoom out", "Zoom in", "Page 1"]);
  });
});

test("gives the page at least 25rem at a 1024 pixel window (AC-38)", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles(SHORT);
  await pageDrawn(page);
  const width = await page
    .getByTestId("preview-page")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(width).toBeGreaterThanOrEqual(400);
});

for (const [label, width, height, largeText] of [
  ["at 900 pixels", 900, 800, false],
  ["at 1280 by 500", 1280, 500, false],
  ["at 1280 pixels with 200% text", 1280, 800, true],
] as const) {
  test(`shows no preview and sends no draw ${label} (AC-37)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/tool");
    if (largeText)
      await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    await page.getByTestId("file-input").setInputFiles(SHORT);
    await expect(page.getByTestId("checklist")).toBeVisible({ timeout: ENGINE_TIMEOUT });
    await page.waitForTimeout(500);

    await expect(page.getByTestId("area-preview")).toHaveCount(0);
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(await page.evaluate(() => window.__preview?.draws.length)).toBe(0);
  });
}

test("sends no draw while a run works, and lets go at complete (AC-45, AC-47)", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await routePaid(page);
  await page.goto("/tool");
  await openFifty(page);
  await pageDrawn(page);

  await page.getByTestId("redact").click();
  await expect(page.getByTestId("cancel")).toBeVisible();
  // While it works, a page through the rail and a zoom ask for nothing.
  await page
    .getByRole("navigation", { name: "Pages" })
    .getByRole("button", { name: /^Page 2,/ })
    .click();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByTestId("area-preview")).toHaveCount(1);

  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
  await expect(page.getByTestId("area-preview")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => window.__preview?.draws.filter((draw) => draw.running).length,
    ),
  ).toBe(0);
  await everyPictureAccounted(page);
  expect(await canvasesHolding(page)).toBe(0);
});
