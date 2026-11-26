import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { bytes, encodeJpeg, EOI, segment, SOI } from "../../scripts/lib/jpeg-writer.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";

/**
 * The page preview's time budgets (spec 0026 child 0002, AC-54), each the
 * slowest of three runs at 1280 by 800 on a screen of twice the density.
 *
 *  - On a 50 page dense document, the first page picture lands within
 *    1,000 ms of the Found items list appearing.
 *  - Picking a row on page 50 rings its box within 500 ms.
 *  - After the last press that reaches 200%, the fresh draw lands within
 *    750 ms (the 150 ms settle wait included).
 *  - On a 50 page 300 dpi grey scan built here, each page with its own JPEG,
 *    a page shown through the rail lands within 1,000 ms, and every
 *    thumbnail in the rail's first view within 3,000 ms of the list.
 *
 * They sit at three to ten times what the scratch measurement found
 * (rationale.md, *Amended for the page preview*), so they hold the design
 * without timing the machine. A stopwatch, so it runs in the `speed` project
 * (`SPEED_SPEC`), after every other test, on one worker, and records no
 * trace, whose recorder would add its own cost to every frame
 * (`terms-speed.spec.ts` does the same).
 */

test.use({ trace: "off", viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
test.describe.configure({ timeout: 600_000 });

const ENGINE_TIMEOUT = 120_000;
const RUNS = 3;
const PAGES = 50;

/** `detect-dense.pdf`: a 50 page staff directory, 2,200 rows. */
const DENSE = resolve("tests/fixtures/detect-dense.pdf");

const FIRST_PAGE_BUDGET_MS = 1_000;
const PICK_BUDGET_MS = 500;
const ZOOM_BUDGET_MS = 750;
const SCAN_PAGE_BUDGET_MS = 1_000;
const SCAN_THUMBS_BUDGET_MS = 3_000;

/**
 * Fifty US Letter scan pages at 300 pixels per inch (2,552 by 3,304, the
 * nearest multiples of 8), pale paper with dark bands of type, each page's
 * JPEG made unlike the others by a segment holding its number, so MuPDF
 * decodes every one afresh. A typed line under each picture keeps the page
 * readable, so the document opens rather than being refused.
 */
function scanDocument(): Buffer {
  const width = 2_552;
  const height = 3_304;
  const { tables, scans } = encodeJpeg({
    width,
    height,
    pixel: (x: number, y: number) =>
      y > 150 && y < height - 150 && x > 150 && x < width - 150 && y % 50 < 14 ? 40 : 235,
  });
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 4 + index * 3;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ...pageNumbers.flatMap((index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 3 0 R >> /XObject << /Scan ${pageObject(index) + 2} 0 R >> >> ` +
        `/Contents ${pageObject(index) + 1} 0 R >>`,
      stream(
        "",
        "q 612 0 0 700 0 92 cm /Scan Do Q\n" +
          `BT /F1 12 Tf 72 40 Td (Scanned statement ${index + 1}, filed by the records office.) Tj ET\n`,
      ),
      stream(
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
          "/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode",
        bytes(SOI, segment(0xfe, `scan page ${index + 1}`), ...tables, ...scans, EOI),
      ),
    ]),
  ];
  return Buffer.from(writePdf({ objects, trailer: "/Root 1 0 R" }).bytes);
}

interface Clock {
  listAt: number | null;
  pagePictures: number[];
  thumbPictures: number[];
}

declare global {
  interface Window {
    __clock?: Clock;
  }
}

/** Notes when the list first shows and when each picture lands, by canvas. */
function startClock(): void {
  const clock: Clock = { listAt: null, pagePictures: [], thumbPictures: [] };
  window.__clock = clock;
  new MutationObserver(() => {
    if (clock.listAt === null && document.querySelector('[data-testid="checklist"]')) {
      clock.listAt = performance.now();
    }
  }).observe(document, { childList: true, subtree: true });
  const transfer = ImageBitmapRenderingContext.prototype.transferFromImageBitmap;
  ImageBitmapRenderingContext.prototype.transferFromImageBitmap = function (
    this: ImageBitmapRenderingContext,
    bitmap: ImageBitmap | null,
  ) {
    if (bitmap) {
      const canvas = this.canvas as HTMLCanvasElement;
      const at = performance.now();
      if (canvas.dataset.testid === "preview-canvas") clock.pagePictures.push(at);
      else clock.thumbPictures.push(at);
    }
    return transfer.call(this, bitmap);
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

/** Wait until the page canvas has received `count` pictures, and say when the last landed. */
async function pagePictureAt(page: Page, count: number): Promise<number> {
  await expect
    .poll(() => page.evaluate(() => window.__clock?.pagePictures.length ?? 0), {
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(count);
  return page.evaluate((at) => window.__clock?.pagePictures[at - 1] ?? Number.NaN, count);
}

test("on a dense document: the first page, a pick on page 50, and a zoom to 200%", async ({
  page,
}) => {
  const firstPage: number[] = [];
  const picks: number[] = [];
  const zooms: number[] = [];
  await page.addInitScript(startClock);
  await routePaid(page);

  for (let run = 0; run < RUNS; run += 1) {
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles(DENSE);
    await expect(page.getByTestId("checklist")).toBeVisible({ timeout: ENGINE_TIMEOUT });

    const landed = await pagePictureAt(page, 1);
    const listAt = await page.evaluate(() => window.__clock?.listAt ?? Number.NaN);
    firstPage.push(landed - listAt);

    // A pick on page 50: from the checkbox taking focus to its box ringed.
    const checkbox = page
      .locator('li:has([id$="-page"]:text-is("Page 50")) input[type="checkbox"]')
      .first();
    await checkbox.evaluate((element) => element.scrollIntoView({ block: "center" }));
    picks.push(
      await checkbox.evaluate(
        (element) =>
          new Promise<number>((settle) => {
            const from = performance.now();
            (element as HTMLInputElement).focus();
            const look = () => {
              if (document.querySelector("[data-box][data-picked]")) {
                settle(performance.now() - from);
              } else {
                requestAnimationFrame(look);
              }
            };
            look();
          }),
      ),
    );

    // Three presses from 100% reach 200%; the fresh draw follows the last.
    const before = await page.evaluate(() => window.__clock?.pagePictures.length ?? 0);
    const zoomIn = page.getByRole("button", { name: "Zoom in" });
    await zoomIn.click();
    await zoomIn.click();
    const pressedAt = await zoomIn.evaluate((element) => {
      (element as HTMLButtonElement).click();
      return performance.now();
    });
    await expect(page.getByTestId("preview-zoom-level")).toHaveText("200%");
    zooms.push((await pagePictureAt(page, before + 1)) - pressedAt);
  }

  const slowest = (times: readonly number[]) => Math.max(...times);
  console.log(
    `preview speed, dense (ms): first page ${firstPage.map(Math.round)}, ` +
      `pick ${picks.map(Math.round)}, zoom ${zooms.map(Math.round)}`,
  );
  expect(slowest(firstPage)).toBeLessThanOrEqual(FIRST_PAGE_BUDGET_MS);
  expect(slowest(picks)).toBeLessThanOrEqual(PICK_BUDGET_MS);
  expect(slowest(zooms)).toBeLessThanOrEqual(ZOOM_BUDGET_MS);
});

test("on a 50 page scan: a page through the rail, and the first view of thumbnails", async ({
  page,
}) => {
  const scans = scanDocument();
  const pages: number[] = [];
  const thumbs: number[] = [];
  await page.addInitScript(startClock);
  await routePaid(page);

  for (let run = 0; run < RUNS; run += 1) {
    await page.goto("/tool");
    await page.getByTestId("file-input").setInputFiles({
      name: "scans.pdf",
      mimeType: "application/pdf",
      buffer: scans,
    });
    await expect(page.getByTestId("checklist")).toBeVisible({ timeout: ENGINE_TIMEOUT });
    await pagePictureAt(page, 1);

    // Every thumbnail whose button is in the rail's first view, drawn.
    const inView = await page.getByTestId("preview-rail").evaluate((rail) => {
      const box = rail.getBoundingClientRect();
      return [...rail.querySelectorAll('[data-testid="preview-thumb"]')].filter(
        (button) => {
          const own = button.getBoundingClientRect();
          return own.top < box.bottom && own.bottom > box.top;
        },
      ).length;
    });
    await expect
      .poll(() => page.evaluate(() => window.__clock?.thumbPictures.length ?? 0), {
        timeout: 60_000,
      })
      .toBeGreaterThanOrEqual(inView);
    thumbs.push(
      await page.evaluate(
        (count) =>
          (window.__clock?.thumbPictures.slice().sort((a, b) => a - b)[count - 1] ??
            Number.NaN) - (window.__clock?.listAt ?? Number.NaN),
        inView,
      ),
    );

    // A page through the rail, from the press to its picture.
    const before = await page.evaluate(() => window.__clock?.pagePictures.length ?? 0);
    const pressedAt = await page
      .getByRole("navigation", { name: "Pages" })
      .getByRole("button", { name: /^Page 3\b/ })
      .evaluate((element) => {
        (element as HTMLButtonElement).click();
        return performance.now();
      });
    pages.push((await pagePictureAt(page, before + 1)) - pressedAt);
  }

  console.log(
    `preview speed, scan (ms): page ${pages.map(Math.round)}, thumbnails ${thumbs.map(Math.round)}`,
  );
  expect(Math.max(...pages)).toBeLessThanOrEqual(SCAN_PAGE_BUDGET_MS);
  expect(Math.max(...thumbs)).toBeLessThanOrEqual(SCAN_THUMBS_BUDGET_MS);
});
