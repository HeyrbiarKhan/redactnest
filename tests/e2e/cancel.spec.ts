import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";

/**
 * Spec 0004, AC-17 and AC-19. A redaction run stopped in a real browser.
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

/** The heavy fixture: one large image and a line of text on every page. */
function heavyPdf(): Buffer {
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
        `q 612 0 0 700 0 92 cm /Im1 Do Q BT /F1 14 Tf 72 40 Td (Heavy page ${index + 1}) Tj ET\n`,
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
