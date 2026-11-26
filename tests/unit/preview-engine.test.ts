import { beforeAll, describe, expect, it } from "vitest";

import {
  CANVAS_SIDE_MAX,
  drawPageWith,
  drawScale,
  EngineFailure,
  openDocumentWith,
  quadRects,
  silenceEngineLog,
  type DrawnPage,
  type MuPdf,
} from "@/engine";

import { bytes, segment } from "../../scripts/lib/jpeg-writer.mjs";
import { scanPages, TRIM_ROTATED } from "../../scripts/lib/reading-fixtures.mjs";
import { fixture } from "../support/bytes";

/**
 * The page preview's renderer. Spec 0026 child 0002, AC-49 and AC-50.
 *
 * `drawPageWith` draws one page of the review copy as straight RGBA within the
 * caps it is given, and empties MuPDF's store after every draw, so a heap
 * that never shrinks stays flat over a whole scan. `quadRects` turns each
 * target's quads into display boxes, as fractions of the drawn page, that sit
 * on the target's glyphs on a cropped, offset or turned page.
 *
 * This file loads a MuPDF of its own with its heap exposed, as
 * `device.test.ts` does, so the heap can be measured.
 */

const heap = {} as { HEAPU8?: Uint8Array };
(globalThis as { $libmupdf_wasm_Module?: unknown }).$libmupdf_wasm_Module = heap;
const mupdf: MuPdf = await import("mupdf");

const LIMITS = Object.freeze({ maxBytes: 26_214_400, maxPages: 50 });

beforeAll(() => {
  silenceEngineLog(mupdf);
});

/** Run `read` on a fixture opened as the worker opens the review copy. */
async function withReview<T>(
  name: string,
  read: (doc: Awaited<ReturnType<typeof openDocumentWith>>) => Promise<T>,
): Promise<T> {
  const doc = await openDocumentWith(mupdf, fixture(name), LIMITS);
  try {
    return await read(doc);
  } finally {
    doc.close();
  }
}

/** The pixel at `[x, y]`, as `[r, g, b, a]`. */
function pixelAt(drawn: DrawnPage, x: number, y: number): readonly number[] {
  const at = (y * drawn.width + x) * 4;
  return Array.from(drawn.pixels.subarray(at, at + 4));
}

/** How many pixels inside the box (fractions of the page) are ink. */
function inkInside(
  drawn: DrawnPage,
  rect: { x: number; y: number; width: number; height: number },
): number {
  const x0 = Math.floor(rect.x * drawn.width);
  const y0 = Math.floor(rect.y * drawn.height);
  const x1 = Math.ceil((rect.x + rect.width) * drawn.width);
  const y1 = Math.ceil((rect.y + rect.height) * drawn.height);
  let ink = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const [r, g, b] = pixelAt(drawn, x, y);
      if (r + g + b < 3 * 128) ink += 1;
    }
  }
  return ink;
}

describe("drawScale", () => {
  it("puts the wanted width across the frame when both caps allow it", () => {
    expect(drawScale(612, 792, { width: 1224, maxPixels: 8_388_608 })).toBe(2);
  });

  it("holds the picture within maxPixels, with MuPDF's rounding", () => {
    const scale = drawScale(612, 792, { width: 10_000, maxPixels: 1_048_576 });
    expect((scale * 612 + 2) * (scale * 792 + 2)).toBeLessThanOrEqual(1_048_576);
    expect((scale * 612 + 2) * (scale * 792 + 2)).toBeGreaterThan(1_040_000);
  });

  it("holds each side within CANVAS_SIDE_MAX", () => {
    const scale = drawScale(14_400, 200, { width: 100_000, maxPixels: 16_777_216 });
    expect(scale * 14_400 + 2).toBeLessThanOrEqual(CANVAS_SIDE_MAX);
  });

  it("gives no usable scale when the cap holds no picture", () => {
    expect(drawScale(612, 792, { width: 1224, maxPixels: 1 }) > 0).toBe(false);
  });
});

describe("drawPageWith", () => {
  it("draws the page at the width asked, opaque, white where the page is empty", async () => {
    await withReview("detect-email.pdf", async (doc) => {
      const drawn = doc.drawPage(0, { width: 612, maxPixels: 8_388_608 });
      expect(drawn.width).toBe(612);
      expect(drawn.height).toBe(792);
      expect(drawn.pixels.length).toBe(drawn.width * drawn.height * 4);
      expect(drawn.frame).toEqual([0, 0, 612, 792]);
      for (let at = 3; at < drawn.pixels.length; at += 4) {
        if (drawn.pixels[at] !== 255)
          throw new Error(`alpha ${drawn.pixels[at]} at ${at}`);
      }
      expect(pixelAt(drawn, 2, 2)).toEqual([255, 255, 255, 255]);
    });
  });

  it("holds the cap and the canvas side on a page far larger than a sheet", () => {
    const pdf = new mupdf.PDFDocument();
    try {
      const page = pdf.addPage([0, 0, 14_400, 200], 0, pdf.newDictionary(), "");
      pdf.insertPage(-1, page);
      const wide = drawPageWith(mupdf, pdf, 0, { width: 100_000, maxPixels: 16_777_216 });
      expect(wide.width).toBeLessThanOrEqual(CANVAS_SIDE_MAX);
      expect(wide.height).toBeLessThanOrEqual(CANVAS_SIDE_MAX);
      expect(wide.width).toBeGreaterThan(CANVAS_SIDE_MAX - 4);

      const capped = drawPageWith(mupdf, pdf, 0, {
        width: 100_000,
        maxPixels: 1_048_576,
      });
      expect(capped.width * capped.height).toBeLessThanOrEqual(1_048_576);
    } finally {
      pdf.destroy();
    }
  });

  it("is an EngineFailure, never a MuPDF error, when the page cannot be drawn", async () => {
    await withReview("detect-email.pdf", async (doc) => {
      expect(() => doc.drawPage(5, { width: 612, maxPixels: 8_388_608 })).toThrow(
        EngineFailure,
      );
      expect(() => doc.drawPage(0, { width: 612, maxPixels: 1 })).toThrow(EngineFailure);
    });
  });

  it("refuses to draw once the review copy is closed", async () => {
    const doc = await openDocumentWith(mupdf, fixture("detect-email.pdf"), LIMITS);
    doc.close();
    expect(() => doc.drawPage(0, { width: 612, maxPixels: 8_388_608 })).toThrow(
      EngineFailure,
    );
  });

  /**
   * The measurement behind `emptyStore` (rationale.md, *Amended for the page
   * preview*): without it, drawing a 50 page 300 dpi scan page by page grew
   * the heap by about 100 MB. Each page has its own JPEG here, since a shared
   * picture would hide the growth.
   */
  it("leaves the heap within one picture of where it began over a 50 page scan", () => {
    const { jpeg, columns, rows } = greyScanJpeg();
    const jpegs = Array.from({ length: 50 }, (_, page) =>
      bytes(
        jpeg.subarray(0, 2),
        segment(0xe1, bytes(`scan page ${page}`)),
        jpeg.subarray(2),
      ),
    );
    const source = scanPages({ jpegs, columns, rows, pages: 50, cropped: false });
    const doc = mupdf.Document.openDocument(source.slice().buffer, "application/pdf");
    try {
      const pdf = doc.asPDF();
      if (!pdf) throw new Error("expected a PDF document");
      const options = { width: 1224, maxPixels: 8_388_608 };
      const first = drawPageWith(mupdf, pdf, 0, options);
      const before = heap.HEAPU8?.length ?? 0;
      for (let index = 0; index < 50; index += 1)
        drawPageWith(mupdf, pdf, index, options);
      const after = heap.HEAPU8?.length ?? 0;
      const onePicture = columns * rows + first.width * first.height * 4;
      expect(after - before).toBeLessThanOrEqual(onePicture);
    } finally {
      doc.destroy();
    }
  }, 120_000);
});

describe("quadRects", () => {
  const quad = [100, 200, 200, 200, 100, 220, 200, 220] as const;

  /** Each rectangle's four values, to the float's own rounding. */
  function expectRects(
    actual: ReturnType<typeof quadRects>,
    expected: readonly { x: number; y: number; width: number; height: number }[],
  ): void {
    expect(actual.length).toBe(expected.length);
    actual.forEach((rect, index) => {
      for (const key of ["x", "y", "width", "height"] as const) {
        expect(rect[key]).toBeCloseTo(expected[index][key], 12);
      }
    });
  }

  it("maps a quad through an identity frame", () => {
    expectRects(quadRects([0, 0, 400, 400], [quad]), [
      { x: 0.25, y: 0.5, width: 0.25, height: 0.05 },
    ]);
  });

  it("takes the frame's origin away on an offset frame", () => {
    expectRects(quadRects([100, 200, 500, 600], [quad]), [
      { x: 0, y: 0, width: 0.25, height: 0.05 },
    ]);
  });

  it("takes a turned quad's upright bounds", () => {
    const turned = [210, 100, 210, 200, 190, 100, 190, 200] as const;
    expectRects(quadRects([0, 0, 400, 400], [turned]), [
      { x: 0.475, y: 0.25, width: 0.05, height: 0.25 },
    ]);
  });

  it("clamps to the page and drops anything not finite", () => {
    const outside = [-50, -50, 450, -50, -50, 450, 450, 450] as const;
    const broken = [Number.NaN, 0, 1, 0, 0, 1, 1, 1] as const;
    expect(quadRects([0, 0, 400, 400], [outside, broken])).toEqual([
      { x: 0, y: 0, width: 1, height: 1 },
    ]);
    expect(quadRects([0, 0, 0, 400], [quad])).toEqual([]);
    expect(quadRects([0, 0, Number.POSITIVE_INFINITY, 400], [quad])).toEqual([]);
  });
});

/**
 * Every box sits on its glyphs: the drawn picture holds ink inside each
 * target's rectangles, on a plain page, a crop away from the origin, a page
 * turned 90 degrees and `trim-rotated.pdf`'s three turned and cropped pages.
 */
describe("boxes on glyphs", () => {
  const cases: readonly (readonly [string, number])[] = [
    ["detect-email.pdf", 1],
    ["offset-cropbox.pdf", 1],
    ["rotated-page.pdf", 1],
    ["trim-rotated.pdf", TRIM_ROTATED.rotations.length],
  ];

  for (const [name, pages] of cases) {
    it(`holds ink inside every target's boxes on ${name}`, async () => {
      await withReview(name, async (doc) => {
        const found = await doc.findMatches({ contextChars: 40 });
        let checked = 0;
        for (let index = 0; index < pages; index += 1) {
          const drawn = doc.drawPage(index, { width: 1200, maxPixels: 8_388_608 });
          for (const match of found) {
            if (match.page !== index || match.target === null) continue;
            const rects = quadRects(drawn.frame, match.target.quads);
            expect(rects.length).toBe(match.target.quads.length);
            for (const rect of rects) {
              expect(rect.width * rect.height).toBeLessThan(0.05);
              expect(inkInside(drawn, rect)).toBeGreaterThan(0);
              checked += 1;
            }
          }
          if (!(name === "trim-rotated.pdf" && index === TRIM_ROTATED.shaded)) {
            expect(pixelAt(drawn, 1, 1)).toEqual([255, 255, 255, 255]);
          }
        }
        expect(checked).toBeGreaterThan(0);
      });
    });
  }
});

/** One US Letter page scanned at 300 pixels per inch, as `cost.test.ts` draws it. */
function greyScanJpeg(): { jpeg: Uint8Array; columns: number; rows: number } {
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
