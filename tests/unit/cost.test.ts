import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  inspectPages,
  prepareDocument,
  RunCancelled,
  silenceEngineLog,
  trimToVisibleArea,
} from "@/engine";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { mupdf } from "../support/mupdf";

/**
 * What reading and trimming every page costs, and how soon it stops. Spec
 * 0006, AC-29.
 *
 * The 50 page text heavy document is built here rather than committed, as the
 * browser suite builds its own: fifty pages of sixty dense lines, every glyph
 * inside a clip, so every glyph is looked up. On it, inspection plus the trim
 * may add at most 2 seconds of CPU time to the open.
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

function withPrepared<T>(work: (pdf: PDFDocument) => Promise<T>): Promise<T> {
  const doc = mupdf.Document.openDocument(densePdf(), "application/pdf");
  const pdf = doc.asPDF() as PDFDocument;
  prepareDocument(mupdf, pdf);
  return work(pdf).finally(() => doc.destroy());
}

beforeAll(() => {
  silenceEngineLog(mupdf);
});

describe("the cost of reading every page", () => {
  it("adds at most 2 seconds of CPU to the open of a 50 page text heavy document", async () => {
    await withPrepared(async (pdf) => {
      // Once to warm the engine, so its first use is not what is counted.
      await inspectPages(mupdf, pdf);

      // The least of three passes: CPU time inflates when other test files
      // share the machine's cores, and the budget is the work, not the
      // contention.
      const passes: number[] = [];
      for (let pass = 0; pass < 3; pass += 1) {
        const start = process.cpuUsage();
        await inspectPages(mupdf, pdf);
        await trimToVisibleArea(mupdf, pdf);
        const used = process.cpuUsage(start);
        passes.push((used.user + used.system) / 1000);
      }

      const least = Math.min(...passes);
      expect(least, `CPU per pass: ${passes.map(Math.round).join(", ")} ms`).toBeLessThan(
        2000,
      );
    });
  }, 120_000);

  it("notices a cancel within one page of the 50", async () => {
    await withPrepared(async (pdf) => {
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
