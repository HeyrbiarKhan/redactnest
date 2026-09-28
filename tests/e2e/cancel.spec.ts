import { randomBytes } from "node:crypto";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";

/**
 * Spec 0004, AC-17 and AC-19. A redaction run stopped in a real browser, and
 * spec 0002, AC-10: stopped with a changed tick, which the cancel keeps. And
 * spec 0005, AC-11: detection stopped the same way, by a second document.
 *
 * The run has to last long enough to be caught, so the document is made heavy
 * on purpose: fifty pages, each with its own large uncompressed image, which
 * the rebuild copies and the write compresses. It is generated here rather than
 * committed, because 23 MB of noise says nothing a reviewer needs to read.
 *
 * Fifty pages is over the free cap, so the entitlement is fulfilled with a paid
 * snapshot through Playwright's own routing. The page is not told anything it
 * would not be told by a real paid answer, so the test needs no product seam.
 */

// A 10 MB WebAssembly payload has to arrive and compile first, and then a
// 23 MB document has to open.
const ENGINE_TIMEOUT = 90_000;

const PAGES = 50;
const IMAGE_WIDTH = 400;
const IMAGE_HEIGHT = 384;

/**
 * The heavy fixture: one large image and two lines of text on every page. The
 * first line is `Heavy page N` unless the caller wants something a detector
 * finds.
 *
 * The second line is there for spec 0006. A page that is a large picture with
 * fewer than forty readable characters on it reads as a stamped scan, and a
 * document of nothing else is refused at open (AC-2, AC-10). The typed
 * sentence makes each page one RedactNest can read, so the run this test
 * needs still happens; the pictures are still named as bare.
 */
function heavyPdf(line = (page: number) => `Heavy page ${page}`): Buffer {
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 5 + index * 3;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /ProcSet [/PDF /Text /ImageC] >>",
    ...pageNumbers.flatMap((index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${pageObject(index) + 2} 0 R >> >> ` +
        `/Contents ${pageObject(index) + 1} 0 R >>`,
      stream(
        "",
        `q 612 0 0 700 0 92 cm /Im1 Do Q BT /F1 14 Tf 72 40 Td (${line(index + 1)}) Tj ET\n` +
          "BT /F1 10 Tf 72 20 Td (Every page of this heavy document carries a typed sentence.) Tj ET\n",
      ),
      stream(
        `/Type /XObject /Subtype /Image /Width ${IMAGE_WIDTH} /Height ${IMAGE_HEIGHT} ` +
          "/ColorSpace /DeviceRGB /BitsPerComponent 8",
        randomBytes(IMAGE_WIDTH * IMAGE_HEIGHT * 3),
      ),
    ]),
  ];

  return Buffer.from(writePdf({ objects, trailer: "/Root 1 0 R" }).bytes);
}

test("a run can be cancelled while it is under way, and the tool carries on", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.route("**/api/entitlement", (route) =>
    route.fulfill({
      json: { tier: "paid", pageCap: PAGES, maxFileBytes: 26_214_400 },
    }),
  );

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles({
    name: "heavy.pdf",
    mimeType: "application/pdf",
    buffer: heavyPdf(),
  });
  await expect(page.getByTestId("page-count")).toHaveText(/50 pages/, {
    timeout: ENGINE_TIMEOUT,
  });

  await page.getByTestId("redact").click();

  // The Cancel button exists only while the session is `redacting`. A run that
  // finished before this click removes it, and the click then fails the test,
  // rather than the test passing without having cancelled anything.
  await page.getByTestId("cancel").click({ timeout: 5_000 });

  // Back on the checklist with the document still open, and no file offered.
  await expect(page.getByTestId("redact")).toBeVisible();
  await expect(page.getByTestId("page-count")).toBeVisible();
  await expect(page.getByTestId("download")).toHaveCount(0);
  await expect(page.getByTestId("error")).toHaveCount(0);

  // The cancelled run posted nothing, so nothing turns up late.
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("outcome")).toHaveCount(0);
  await expect(page.getByTestId("download")).toHaveCount(0);

  // The worker is still healthy: a second run, queued behind the cancelled
  // one until it has let go of its working copy (AC-18), finishes normally.
  await page.getByTestId("redact").click();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: ENGINE_TIMEOUT });
});

/**
 * Spec 0002, AC-10. A cancel undoes the run, never the review that went into
 * it. So the heavy document again, for a run long enough to catch, with an
 * address on every page so there is a checklist and a tick to change.
 *
 * Not the dense document below, which has the matches but far too many of
 * them: its six thousand rows make each render of the checklist take seconds,
 * long enough to stall the very click that cancels.
 */
test("a cancelled run keeps the ticks that were changed before it", async ({ page }) => {
  test.setTimeout(180_000);

  await page.route("**/api/entitlement", (route) =>
    route.fulfill({
      json: { tier: "paid", pageCap: PAGES, maxFileBytes: 26_214_400 },
    }),
  );

  await page.goto("/tool");
  await page.getByTestId("file-input").setInputFiles({
    name: "heavy.pdf",
    mimeType: "application/pdf",
    buffer: heavyPdf((n) => `Page ${n}, write to person${n}@example.com`),
  });

  // One address per page, each naming exactly one row.
  const row = (n: number) =>
    page.getByRole("checkbox", { name: `person${n}@example.com`, exact: true });
  const changed = row(1);
  const kept = row(2);
  await expect(changed).toBeChecked({ timeout: ENGINE_TIMEOUT });
  await expect(kept).toBeChecked();

  await changed.click();
  await expect(changed).not.toBeChecked();

  await page.getByTestId("redact").click();
  // Present only while the session is `redacting`, as in the first test above.
  await page.getByTestId("cancel").click({ timeout: 5_000 });

  // Back on the checklist, with the document open and the review as it was.
  await expect(page.getByTestId("redact")).toBeVisible();
  await expect(page.getByTestId("page-count")).toHaveText(/50 pages/);
  await expect(page.getByTestId("download")).toHaveCount(0);
  await expect(changed).not.toBeChecked();
  await expect(kept).toBeChecked();
});

/**
 * Spec 0005's dense document: fifty pages of text, every line holding an
 * address and a phone number, so detection reads for long enough to be
 * interrupted. Built here for the same reason as the heavy one above.
 */
function densePdf(): Buffer {
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 3 + index * 2;
  const rows = 60;

  const content = (page: number) =>
    Array.from({ length: rows }, (_, row) => {
      const n = page * rows + row;
      const four = String(n % 1000).padStart(4, "0");
      return (
        `BT /F1 9 Tf 36 ${780 - row * 12} Td ` +
        `(Row ${n}: person${n}@example.com or 020 7946 ${four} about account ${n}) Tj ET`
      );
    }).join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
    ...pageNumbers.flatMap((index) => [
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
        `/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> ` +
        `/Contents ${pageObject(index) + 1} 0 R >>`,
      stream("", `${content(index)}\n`),
    ]),
  ];

  return Buffer.from(writePdf({ objects, trailer: "/Root 1 0 R" }).bytes);
}

declare global {
  interface Window {
    __redactnestPageCounts?: string[];
  }
}

/**
 * Spec 0005, AC-11. Detection is stopped within one read when a second
 * document replaces the one it is reading, and the first posts nothing.
 *
 * Every page count the page ever shows is recorded as it appears, so a first
 * document whose review slipped through before the replacement fails this test
 * rather than letting it pass without having cancelled anything.
 */
test("detection gives way to a second document chosen while it reads", async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.route("**/api/entitlement", (route) =>
    route.fulfill({
      json: { tier: "paid", pageCap: PAGES, maxFileBytes: 26_214_400 },
    }),
  );
  await page.addInitScript(() => {
    const seen: string[] = [];
    window.__redactnestPageCounts = seen;
    new MutationObserver(() => {
      const count = document.querySelector('[data-testid="page-count"]')?.textContent;
      if (count && seen.at(-1) !== count) seen.push(count);
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });

  await page.goto("/tool");
  const input = page.getByTestId("file-input");
  await input.setInputFiles({
    name: "dense.pdf",
    mimeType: "application/pdf",
    buffer: densePdf(),
  });
  await expect(page.getByTestId("progress")).toHaveText(/Looking for sensitive details/, {
    timeout: ENGINE_TIMEOUT,
  });

  // Nothing ticked has changed, so the replacement asks nothing.
  await input.setInputFiles(resolve("tests/fixtures/two-pages.pdf"));

  await expect(page.getByTestId("page-count")).toHaveText(/2 pages/, {
    timeout: ENGINE_TIMEOUT,
  });
  await expect(page.getByRole("checkbox", { name: "contact@example.com" })).toBeVisible();
  await expect(page.getByTestId("error")).toHaveCount(0);

  // The first document's review never arrives, now or late.
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("page-count")).toHaveText(/2 pages/);
  expect(await page.evaluate(() => window.__redactnestPageCounts)).toEqual([
    "This document has 2 pages.",
  ]);
});
