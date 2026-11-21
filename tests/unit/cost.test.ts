import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  inspectPages,
  openDocumentWith,
  PIPELINE,
  prepareDocument,
  pruneToRoles,
  readDrawing,
  redactDocumentWith,
  RunCancelled,
  scanContent,
  silenceEngineLog,
  stripToAllowlist,
  structureIsClean,
  trimToVisibleArea,
  walkRoles,
  type DrawingUnit,
  type Pipeline,
} from "@/engine";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { scanPages } from "../../scripts/lib/reading-fixtures.mjs";
import { IDENTITY_UNICODE } from "../../scripts/lib/redaction-fixtures.mjs";
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
 *
 * Spec 0010, AC-11 adds its slowest path: every line of fifty pages judged
 * against the drawn and invisible glyph origins, and a scan and a photo under
 * a dense layer with no word both searched to the end. The three cases above
 * still pass, though their scans now take the run search too.
 *
 * Spec 0019, AC-11 adds the typed allowlist's work: the open's role walk, the
 * scan for descriptions, the rebuild's prune and the check's structure part
 * together add at most 200 ms of CPU on the text heavy document, and at most
 * 15% to a run's CPU on one page drawing 10,000 form XObjects. The open's
 * budgets above count the walk and the scan too, since the open does both.
 * The second write (AC-15) runs on neither document, and a test of its own
 * says so, so both budgets stand as written: the path that writes twice has
 * no budget, since those files were refused before it.
 *
 * Spec 0021, AC-6 adds the scan's worst stream: about 1 MB of false inline
 * image ends, each resuming on bytes that read on to the stream's end and
 * fail there. Before the cap each retry read the rest again, so the work grew
 * with the square of the length (10 KB took 393 ms, so 1 MB about an hour);
 * with at most `INLINE_END_RETRIES` retries it answers `"unsure"` in at most
 * 2 seconds.
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
 * Thirty lines of typed text over the top half of a page, from y 780 down to
 * y 432: about 2,000 visible Helvetica glyphs.
 */
function typedText(page: number): string {
  const rows = 30;
  return Array.from({ length: rows }, (_, row) => {
    const n = page * rows + row;
    return (
      `BT 0 Tr /F1 9 Tf 36 ${780 - row * 12} Td ` +
      `(Row ${n}: typed words about account ${n} and the person who holds it) Tj ET`
    );
  }).join("\n");
}

/** Two letter words and numbers, so no run of three forms. */
const NO_WORD = "No 12 at 45 an if so up to me we go by it on as or is";

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
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 4 + index * 2;

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
          `${typedText(index)}\nq 360 0 0 270 126 40 cm /Photo Do Q\n` +
            `BT 3 Tr /F1 9 Tf 140 170 Td (${NO_WORD}) Tj ET\n`,
        ),
      ]),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * Spec 0010, AC-11, the slowest path. Fifty pages, each with the typed text of
 * the case above over the top half; a scan over the bottom half under a dense
 * hidden layer that forms no run (37 lines of two letter words in Tesseract's
 * glyphless font at 9 pt, about 2,000 glyphs); and a 300 by 300 pt photo over
 * the layer. Every line of the page is judged against the drawn and invisible
 * glyph origins, both pictures fail the area test, since hidden lines count
 * for nothing, and both are searched to the end. Each page is `bare-picture`.
 */
function denseLayerWithPhotoPdf(): Uint8Array {
  const pageNumbers = Array.from({ length: PAGES }, (_, index) => index);
  const pageObject = (index: number) => 8 + index * 2;
  const hex = [...NO_WORD]
    .map((letter) => (letter.codePointAt(0) ?? 0).toString(16).padStart(4, "0"))
    .join("");
  const layer = Array.from(
    { length: 37 },
    (_, row) => `BT 3 Tr /Fg 9 Tf 60 ${380 - row * 10} Td <${hex}> Tj ET`,
  ).join("\n");

  return writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pageNumbers.map((index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${PAGES} >>`,
      // One grey picture, drawn as the scan and again as the photo.
      stream(
        "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8",
        new Uint8Array(4).fill(200),
      ),
      // The glyphless font, as `reading-fixtures.mjs` writes it.
      stream("", IDENTITY_UNICODE),
      "<< /Type /FontDescriptor /FontName /GlyphLessFont /FontBBox [0 0 500 1000] " +
        "/Ascent 1000 /Descent -1 /CapHeight 1000 /StemV 80 /ItalicAngle 0 /Flags 5 >>",
      "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDToGIDMap /Identity " +
        "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
        "/FontDescriptor 5 0 R /DW 500 >>",
      "<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H " +
        "/DescendantFonts [6 0 R] /ToUnicode 4 0 R >>",
      ...pageNumbers.flatMap((index) => [
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
          `/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /Fg 7 0 R >> ` +
          `/XObject << /Scan 3 0 R >> >> /Contents ${pageObject(index) + 1} 0 R >>`,
        stream(
          "",
          `${typedText(index)}\nq 612 0 0 396 0 0 cm /Scan Do Q\n${layer}\n` +
            "q 300 0 0 300 156 50 cm /Scan Do Q\n",
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
  await inspectPages(mupdf, pdf, undefined, walkRoles(pdf, "read", "pages").pages);

  const passes: number[] = [];
  for (let pass = 0; pass < 3; pass += 1) {
    const start = process.cpuUsage();
    // Spec 0019: the open walks the roles and scans each drawing as it reads.
    await inspectPages(mupdf, pdf, undefined, walkRoles(pdf, "read", "pages").pages);
    await trimToVisibleArea(mupdf, pdf);
    const used = process.cpuUsage(start);
    passes.push((used.user + used.system) / 1000);
  }
  return { least: Math.min(...passes), passes };
}

/** Milliseconds of CPU `work` takes. */
function cpuOf(work: () => void): number {
  const start = process.cpuUsage();
  work();
  const used = process.cpuUsage(start);
  return (used.user + used.system) / 1000;
}

/** The least of three passes, after one to warm the engine (as `leastCpu`). */
async function leastOf(
  pass: () => Promise<number>,
): Promise<{ least: number; passes: number[] }> {
  await pass();
  const passes = [await pass(), await pass(), await pass()];
  return { least: Math.min(...passes), passes };
}

/** Open `bytes` as a PDF document; the caller destroys it. */
function openPdf(bytes: Uint8Array | ArrayBuffer): PDFDocument {
  return mupdf.Document.openDocument(bytes, "application/pdf").asPDF() as PDFDocument;
}

/**
 * Spec 0019, AC-11: the typed allowlist's work on one document, in CPU
 * milliseconds per pass: the open's role walk over the prepared copy and the
 * scan of every drawing it names, the rebuild's prune over a copy grafted the
 * way the rebuild grafts it, and the check's structure part over a run's real
 * output. Every document is made before the clock starts.
 */
async function allowlistCpu(
  source: Uint8Array,
  output?: ArrayBuffer,
): Promise<{ least: number; passes: number[] }> {
  const checked =
    output ?? (await redactDocumentWith(mupdf, toBuffer(source), [])).output;

  return leastOf(async () => {
    const review = openPdf(source);
    prepareDocument(mupdf, review);
    const work = openPdf(source);
    prepareDocument(mupdf, work);
    const rebuilt = new mupdf.PDFDocument();
    const map = rebuilt.newGraftMap();
    for (let index = 0; index < work.countPages(); index += 1) {
      map.graftPage(index, work, index);
    }
    map.destroy();
    stripToAllowlist(rebuilt);
    const check = openPdf(checked);

    try {
      return cpuOf(() => {
        const roles = walkRoles(review, "read", "pages");
        for (const drawings of roles.pages) scanAll(drawings);
        pruneToRoles(rebuilt);
        structureIsClean(check, check.countPages());
      });
    } finally {
      review.destroy();
      work.destroy();
      rebuilt.destroy();
      check.destroy();
    }
  });
}

/** The scan over a page's drawings, as inspection runs it. */
function scanAll(drawings: readonly DrawingUnit[]): void {
  for (const drawing of drawings) {
    const properties = drawing.resources?.get("Properties") ?? null;
    readDrawing(
      drawing.streams,
      properties !== null && properties.isDictionary() ? properties : null,
      drawing.joined,
    );
  }
}

/** Main's pipeline, with the prune and the structure check swapped out. */
const MAIN: Pipeline = {
  ...PIPELINE,
  pruneToRoles: () => {},
  checkStructure: () => "clean",
};

/** A second write that must never run: its throw would fail the run with `redaction-incomplete`. */
const NO_REWRITE: Pipeline = {
  ...PIPELINE,
  rewrite: () => {
    throw new Error("the second write ran");
  },
};

/**
 * Spec 0019, AC-11. One page drawing 10,000 form XObjects, each with resources
 * of its own naming one shared font, and a figure in it.
 */
function tenThousandForms(): Uint8Array {
  const forms = 10_000;
  const first = 6;
  const names = Array.from(
    { length: forms },
    (_, index) => `/Fm${index} ${first + index} 0 R`,
  );
  const draws = Array.from(
    { length: forms },
    (_, index) =>
      `q 1 0 0 1 ${6 * (index % 100)} ${8 * Math.floor(index / 100)} cm /Fm${index} Do Q`,
  );
  return writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 812] " +
        `/Resources << /Font << /F1 5 0 R >> /XObject << ${names.join(" ")} >> >> /Contents 4 0 R >>`,
      stream(
        "",
        `BT /F1 9 Tf 36 806 Td (Ten thousand forms) Tj ET\n${draws.join("\n")}\n`,
      ),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      ...Array.from({ length: forms }, (_, index) =>
        stream(
          "/Type /XObject /Subtype /Form /BBox [0 0 6 8] /Resources << /Font << /F1 5 0 R >> >>",
          `BT /F1 3 Tf 0 2 Td (${index % 10}) Tj ET`,
        ),
      ),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
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

  it("adds at most 2 seconds with every line judged and a dense layer searched to the end, on every page of 50", async () => {
    await withPrepared(denseLayerWithPhotoPdf(), async (pdf) => {
      // The case is what it says: the scan and the photo both left bare by a
      // dense hidden layer with no word, every page machine read.
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

  it("adds at most 200 ms of CPU for the allowlist's work on a 50 page text heavy document", async () => {
    const { least, passes } = await allowlistCpu(densePdf());
    expect(least, `CPU per pass: ${passes.map(Math.round).join(", ")} ms`).toBeLessThan(
      200,
    );
  }, 120_000);

  it("adds at most 15% to a run's CPU for the allowlist's work on one page drawing 10,000 forms", async () => {
    const source = tenThousandForms();
    // About 20 seconds of CPU a run, so the real run that gives the check its
    // output is also the warm up before main's three timed runs.
    const { output } = await redactDocumentWith(mupdf, toBuffer(source), []);
    const runs: number[] = [];
    for (let pass = 0; pass < 3; pass += 1) {
      const start = process.cpuUsage();
      await redactDocumentWith(mupdf, toBuffer(source), [], {}, MAIN);
      const used = process.cpuUsage(start);
      runs.push((used.user + used.system) / 1000);
    }
    const run = { least: Math.min(...runs), passes: runs };
    const added = await allowlistCpu(source, output);

    expect(
      added.least,
      `allowlist CPU per pass: ${added.passes.map(Math.round).join(", ")} ms; ` +
        `run CPU per pass: ${run.passes.map(Math.round).join(", ")} ms`,
    ).toBeLessThan(0.15 * run.least);
  }, 600_000);

  /**
   * Spec 0019, AC-11 and AC-15. Measured on their outputs, a second write
   * costs 16 ms on the 50 page document and 12.4 s on the 10,000 form page,
   * 54% of its run, which is why it runs only on the check's verdict. Each run
   * here is untimed and takes the whole pipeline but a second write that
   * throws, so a file made proves neither budget pays for one.
   */
  it("writes neither budget document a second time", async () => {
    for (const source of [densePdf(), tenThousandForms()]) {
      const { output } = await redactDocumentWith(
        mupdf,
        toBuffer(source),
        [],
        {},
        NO_REWRITE,
      );
      expect(output.byteLength).toBeGreaterThan(0);
    }
  }, 300_000);

  /**
   * Spec 0021, AC-6. `BI ... ID `, then ` EI 1` 200,000 times, then ` (`:
   * every end resumes on numbers and `EI` operators that read on to the
   * unclosed string at the end and fail there. Timed in wall time, the least
   * of three passes after a warm up, as the other budgets take theirs.
   */
  it("answers unsure within 2 seconds on 1 MB of false inline image ends", async () => {
    const text = `BI /W 1 /H 1 /BPC 8 /CS /G ID ${" EI 1".repeat(200_000)} (`;
    const bytes = Uint8Array.from(text, (character) => character.charCodeAt(0));
    expect(bytes.length).toBeGreaterThan(1_000_000);

    const { least, passes } = await leastOf(async () => {
      const start = performance.now();
      expect(scanContent(bytes, null)).toBe("unsure");
      return performance.now() - start;
    });
    expect(least, `per pass: ${passes.map(Math.round).join(", ")} ms`).toBeLessThan(
      2_000,
    );
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
