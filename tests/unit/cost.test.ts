import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  inspectPages,
  openDocumentWith,
  prepareDocument,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  trimToVisibleArea,
} from "@/engine";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { scanPages } from "../../scripts/lib/reading-fixtures.mjs";
import { documentImages, LIMITS, mupdf } from "../support/mupdf";

/**
 * What reading and trimming every page costs, and how soon it stops. Spec
 * 0006, AC-29 and INV-11.
 *
 * The 50 page documents are built here rather than committed, as the browser
 * suite builds its own. The text heavy one is fifty pages of sixty dense
 * lines, every glyph inside a clip, so every glyph is looked up; on it,
 * inspection plus the trim may add at most 2 seconds of CPU time to the open.
 * The scan is fifty pages at 300 pixels per inch, cropped half an inch on
 * every side; on it, a run must leave every page image exactly as the source
 * stored it, which proves the trim decoded and rewrote nothing. Its memory
 * was measured once, by hand, and is recorded in spec 0006's `rationale.md`.
 *
 * Spec 0008, AC-12 adds the machine read run's worst cases to the same budget:
 * fifty dense OCR scan pages, each with a photo pasted where no text is, so
 * the run is searched on every page, over every character; and fifty pages of
 * typed text, each with a photo carrying a sparse layer of its own, so every
 * test the 2026-09-30 review added runs on every page.
 */

const PAGES = 50;

function densePdf(): Uint8Array {
  const rows = 60;
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 3 + index * 2;
  const content = (page: number) =>
    Array.from({ length: rows }, (_, row) => {
      const n = page * rows + row;
      const four = String(n % 1000).padStart(4, "0");
      return (
        `BT /F1 9 Tf 36 ${780 - row * 12} Td ` +
        `(Row ${n}: person${n}@example.com or 020 7946 ${four} about account ${n}) Tj ET`
      );
    }).join("\n");

  return writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
      ...pageNumbers.flatMap((index) => [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >> ` +
          `/Contents ${pageObject(index) + 1} 0 R >>`,
        stream("", `q 0 0 612 792 re W n\n${content(index)}\nQ\n`),
      ]),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * Spec 0008, AC-12. Fifty scan pages, each with fifty two dense lines of
 * invisible text over it from y 770 down to y 158, and a photo pasted below
 * them (300 by 100 pt at y 20, 6.2% of the page). The scan passes the
 * coverage test; the photo fails it with no character over it, and the page
 * draws thousands of invisible glyphs, so its run search reads every
 * character on the page and finds none: each page is `bare-picture`.
 */
function ocrWithPhotoPdf(): Uint8Array {
  const rows = 52;
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 4 + index * 2;
  const content = (page: number) =>
    Array.from({ length: rows }, (_, row) => {
      const n = page * rows + row;
      return (
        `BT 3 Tr /F1 9 Tf 36 ${770 - row * 12} Td ` +
        `(Row ${n}: words recognised from the scan about account ${n} and its holder) Tj ET`
      );
    }).join("\n");

  return writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
      // One grey picture, drawn as the scan and again as the photo.
      stream(
        "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8",
        new Uint8Array(4).fill(200),
      ),
      ...pageNumbers.flatMap((index) => [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> ` +
          `/XObject << /Scan 3 0 R >> >> /Contents ${pageObject(index) + 1} 0 R >>`,
        stream(
          "",
          "q 612 0 0 792 0 0 cm /Scan Do Q\nq 300 0 0 100 156 20 cm /Scan Do Q\n" +
            `${content(index)}\n`,
        ),
      ]),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * Spec 0008, AC-12, the case that reaches every test the review added. Fifty
 * pages, each with thirty lines of typed text over the top half (about 2,000
 * visible Helvetica glyphs) and a photo of about a fifth of the page in the
 * bottom half (360 by 270 pt), with one invisible line of two letter words
 * across it at 9 pt. The line covers under `TEXT_OVER_PICTURE_MAX` of the
 * photo, so the photo is searched: each character over it is asked its step,
 * its line whether it is a drawn copy against every drawn glyph origin on the
 * page, and the pictures are grouped. No word is three letters long, so no
 * run forms, and each page is `bare-picture`.
 */
function typedWithPhotoPdf(): Uint8Array {
  const rows = 30;
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 4 + index * 2;
  const content = (page: number) =>
    Array.from({ length: rows }, (_, row) => {
      const n = page * rows + row;
      return (
        `BT 0 Tr /F1 9 Tf 36 ${780 - row * 12} Td ` +
        `(Row ${n}: typed words about account ${n} and the person who holds it) Tj ET`
      );
    }).join("\n");

  return writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
      stream(
        "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8",
        new Uint8Array(4).fill(200),
      ),
      ...pageNumbers.flatMap((index) => [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> ` +
          `/XObject << /Photo 3 0 R >> >> /Contents ${pageObject(index) + 1} 0 R >>`,
        stream(
          "",
          `${content(index)}\nq 360 0 0 270 126 40 cm /Photo Do Q\n` +
            "BT 3 Tr /F1 9 Tf 140 170 Td " +
            "(No 12 at 45 an if so up to me we go by it on as or is) Tj ET\n",
        ),
      ]),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * One US Letter page scanned at 300 pixels per inch, as a JPEG MuPDF made
 * itself: pale grey paper with dark bands where lines of type would be. One is
 * shared by every page here, which keeps the test quick; the heap measurement
 * gives each page its own, since a shared image hides growth page by page.
 */
function scanJpeg(): { jpeg: Uint8Array; columns: number; rows: number } {
  const columns = 2550;
  const rows = 3300;
  const pixmap = new mupdf.Pixmap(
    mupdf.ColorSpace.DeviceGray,
    [0, 0, columns, rows],
    false,
  );
  try {
    pixmap.clear(235);
    const pixels = pixmap.getPixels();
    const stride = pixmap.getStride();
    for (let row = 150; row < rows - 150; row += 50) {
      for (let line = row; line < row + 14; line += 1) {
        pixels.fill(40, line * stride + 150, line * stride + columns - 150);
      }
    }
    return { jpeg: pixmap.asJPEG(75), columns, rows };
  } finally {
    pixmap.destroy();
  }
}

function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function withPrepared<T>(
  source: Uint8Array,
  work: (pdf: PDFDocument) => Promise<T>,
): Promise<T> {
  const doc = mupdf.Document.openDocument(source, "application/pdf");
  const pdf = doc.asPDF() as PDFDocument;
  prepareDocument(mupdf, pdf);
  return work(pdf).finally(() => doc.destroy());
}

/**
 * Inspection plus the trim on a prepared document, in milliseconds of CPU:
 * once to warm the engine, so its first use is not what is counted, then the
 * least of three passes, since CPU time inflates when other test files share
 * the machine's cores, and the budget is the work, not the contention.
 */
async function leastCpu(pdf: PDFDocument): Promise<{ least: number; passes: number[] }> {
  await inspectPages(mupdf, pdf);

  const passes: number[] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    const start = process.cpuUsage();
    await inspectPages(mupdf, pdf);
    await trimToVisibleArea(mupdf, pdf);
    const used = process.cpuUsage(start);
    passes.push((used.user + used.system) / 1000);
  }
  return { least: Math.min(...passes), passes };
}

beforeAll(() => {
  silenceEngineLog(mupdf);
});

describe("the cost of reading every page", () => {
  it("adds at most 2 seconds of CPU to the open of a 50 page text heavy document", async () => {
    await withPrepared(densePdf(), async (pdf) => {
      const { least, passes } = await leastCpu(pdf);
      expect(least, `CPU per pass: ${passes.map(Math.round).join(", ")} ms`).toBeLessThan(
        2000,
      );
    });
  }, 120_000);

  it("adds at most 2 seconds with the machine read run searched on every page of 50", async () => {
    await withPrepared(ocrWithPhotoPdf(), async (pdf) => {
      // The case is what it says: every page read, every photo searched and
      // still bare, every page machine read.
      const inspections = await inspectPages(mupdf, pdf);
      expect(inspections).toHaveLength(PAGES);
      for (const { findings } of inspections)
        expect(findings).toEqual(["bare-picture", "machine-read-text"]);

      const { least, passes } = await leastCpu(pdf);
      expect(least, `CPU per pass: ${passes.map(Math.round).join(", ")} ms`).toBeLessThan(
        2000,
      );
    });
  }, 120_000);

  it("adds at most 2 seconds with each line over a photo asked whether it is a drawn copy, on every page of 50", async () => {
    await withPrepared(typedWithPhotoPdf(), async (pdf) => {
      // The case is what it says: every photo searched and still bare, beside
      // a page of typed text, so the drawn glyph origins are built each time.
      const inspections = await inspectPages(mupdf, pdf);
      expect(inspections).toHaveLength(PAGES);
      for (const { findings } of inspections)
        expect(findings).toEqual(["bare-picture", "machine-read-text"]);

      const { least, passes } = await leastCpu(pdf);
      expect(least, `CPU per pass: ${passes.map(Math.round).join(", ")} ms`).toBeLessThan(
        2000,
      );
    });
  }, 120_000);

  it("leaves every page image of a cropped 300 ppi scan as the source stored it", async () => {
    const { jpeg, columns, rows } = scanJpeg();
    const source = toBuffer(
      scanPages({ jpegs: [jpeg], columns, rows, pages: PAGES, cropped: true }),
    );

    const doc = await openDocumentWith(mupdf, source, LIMITS);
    try {
      // Each page trimmed for its header, and named for its scan.
      for (const page of doc.summary.pages) {
        expect(page.findings).toEqual(
          expect.arrayContaining(["off-page-picture", "off-page-content"]),
        );
      }
    } finally {
      doc.close();
    }

    const { output, trim } = await redactDocumentWith(mupdf, source, []);
    expect(trim).toEqual(
      Array.from({ length: PAGES }, () => ({ removed: true, pictureOutside: true })),
    );

    const before = documentImages(source);
    expect(before).toHaveLength(PAGES);
    for (const page of before)
      expect(page).toEqual([expect.objectContaining({ filter: "DCTDecode" })]);
    expect(documentImages(output)).toEqual(before);
  }, 120_000);

  it("notices a cancel within one page of the 50", async () => {
    await withPrepared(densePdf(), async (pdf) => {
      let pages = 0;
      await expect(
        inspectPages(mupdf, pdf, () => (pages += 1) >= 1),
      ).rejects.toBeInstanceOf(RunCancelled);
      expect(pages).toBe(1);

      pages = 0;
      await expect(
        trimToVisibleArea(mupdf, pdf, () => (pages += 1) >= 1),
      ).rejects.toBeInstanceOf(RunCancelled);
      expect(pages).toBe(1);
    });
  }, 60_000);
});
