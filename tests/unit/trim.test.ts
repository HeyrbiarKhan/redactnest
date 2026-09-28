import type { Matrix, PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  EngineFailure,
  openDocumentWith,
  PIPELINE,
  prepareDocument,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  trimToVisibleArea,
  type Pipeline,
  type TrimOutcome,
} from "@/engine";

import { TRIM_TEXT } from "../../scripts/lib/reading-fixtures.mjs";
import { document, line } from "../../scripts/lib/redaction-fixtures.mjs";
import { fixture } from "../support/bytes";
import { inspect, LIMITS, mupdf, pageText } from "../support/mupdf";
import { findTargets } from "../support/targets";

/**
 * Removing what lies outside each page's visible area. Spec 0006, slice 4:
 * AC-14 to AC-18, INV-3 and INV-4.
 *
 * Outputs are read back with MuPDF directly, through `tests/support`, never
 * with the engine's own readers, so a test never just proves the engine
 * agrees with itself.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

const UNTOUCHED: TrimOutcome = Object.freeze({
  removed: false,
  picturesKept: false,
  pixelMode: false,
});

/** Every character of a page, unclipped, with its origin. */
function characters(
  bytes: ArrayBuffer | Uint8Array,
  index: number,
): { code: string; origin: readonly [number, number] }[] {
  return inspect(toBuffer(bytes), (doc) => {
    const page = doc.loadPage(index);
    try {
      const stext = page.toStructuredText("clip=no");
      try {
        const found: { code: string; origin: readonly [number, number] }[] = [];
        stext.walk({
          onChar(code, origin) {
            if (code.trim() !== "") found.push({ code, origin: [origin[0], origin[1]] });
          },
        });
        return found;
      } finally {
        stext.destroy();
      }
    } finally {
      page.destroy();
    }
  });
}

function toBuffer(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  return bytes instanceof Uint8Array ? (bytes.slice().buffer as ArrayBuffer) : bytes;
}

/** The unclipped text of one page. */
function unclipped(bytes: ArrayBuffer, index = 0): string {
  return inspect(bytes, (doc) => pageText(doc, index, "clip=no"));
}

/** Open a fixture, prepare it as both copies are, and trim it. */
async function trimmed(bytes: ArrayBuffer): Promise<{
  outcomes: readonly TrimOutcome[];
  after: ArrayBuffer;
}> {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF() as PDFDocument;
    prepareDocument(mupdf, pdf);
    const outcomes = await trimToVisibleArea(mupdf, pdf);
    const buffer = pdf.saveToBuffer("");
    try {
      return { outcomes, after: buffer.asUint8Array().slice().buffer as ArrayBuffer };
    } finally {
      buffer.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/**
 * The foundation the trim stands on (task 15), pinned on MuPDF.js 1.28.1. If
 * any of these fails after an upgrade, the trim cannot work as designed and
 * the decision goes back to `/architect` with the measurement.
 */
describe("the trim's foundation (pins)", () => {
  it("drops characters outside the crop box from the default read, and keeps them unclipped", () => {
    const bytes = fixture("trim-text.pdf");
    expect(inspect(bytes, (doc) => pageText(doc, 0))).not.toContain(TRIM_TEXT.belowCrop);
    expect(unclipped(bytes)).toContain(TRIM_TEXT.belowCrop);
    expect(unclipped(bytes)).toContain(TRIM_TEXT.belowMedia);
  });

  /**
   * One `W` per font, per edge, with its extracted quad ending 0 and 0.5 pt
   * inside that edge, in Helvetica, Courier, Times and embedded Carlito; text
   * below the crop box, below the media box and left of the page; and a word
   * straddling the right edge. Placed from each font's quad as MuPDF measures
   * it here, so the pin states exactly what it means.
   */
  it("removes everything outside the crop box and keeps a glyph whose quad ends on or inside every edge", async () => {
    const fonts = { Helvetica: "F1", Courier: "F2", Carlito: "F3", Times: "F4" } as const;
    const build = (content: string) =>
      document(
        ({ add }: { add: (body: string) => number }) => {
          const times = add(
            "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman /Encoding /WinAnsiEncoding >>",
          );
          return [
            { fonts: `/F4 ${times} 0 R`, keys: "/CropBox [0 100 500 700]", content },
          ];
        },
        { carlito: true },
      );

    // Each font's W quad, relative to its origin, in page space.
    const metrics = new Map<string, { up: number; down: number; width: number }>();
    const names = Object.keys(fonts);
    const measured = characters(
      build(
        names
          .map((name, at) =>
            line(fonts[name as keyof typeof fonts], 12, 100, 600 - at * 40, "W"),
          )
          .join(""),
      ),
      0,
    );
    expect(measured).toHaveLength(names.length);
    inspect(
      toBuffer(
        build(
          names
            .map((name, at) =>
              line(fonts[name as keyof typeof fonts], 12, 100, 600 - at * 40, "W"),
            )
            .join(""),
        ),
      ),
      (doc) => {
        const page = doc.loadPage(0);
        const stext = page.toStructuredText("clip=no");
        let at = 0;
        stext.walk({
          onChar(_code, origin, _font, _size, quad) {
            const ys = [quad[1], quad[3], quad[5], quad[7]];
            const xs = [quad[0], quad[2], quad[4], quad[6]];
            metrics.set(names[at], {
              up: origin[1] - Math.min(...ys),
              down: Math.max(...ys) - origin[1],
              width: Math.max(...xs) - origin[0],
            });
            at += 1;
          },
        });
        stext.destroy();
        page.destroy();
      },
    );

    // Page space runs from the crop's top left: visible [0, 0, 500, 600], and
    // PDF y is 700 less page y.
    const cases: { font: string; edge: string; inset: number }[] = [];
    let content = "";
    for (const [name, font] of Object.entries(fonts)) {
      const { up, down, width } = metrics.get(name)!;
      for (const inset of [0, 0.5]) {
        const x = 60 + cases.length * 3;
        cases.push({ font: name, edge: "top", inset });
        content += line(font, 12, x, 700 - (inset + up), "W");
        cases.push({ font: name, edge: "bottom", inset });
        content += line(font, 12, x + 3, 700 - (600 - inset - down), "W");
        cases.push({ font: name, edge: "right", inset });
        content += line(
          font,
          12,
          500 - inset - width,
          700 - (200 + cases.length * 3),
          "W",
        );
        cases.push({ font: name, edge: "left", inset });
        content += line(font, 12, inset, 700 - (200 + cases.length * 3), "W");
      }
    }
    content +=
      line("F1", 12, 100, 60, "Below the crop box") +
      line("F1", 12, 100, 10, "Below the media box") +
      line("F1", 12, -80, 400, "Left of the page") +
      line("F1", 12, 490, 450, "Straddle");

    const source = build(content);
    const before = characters(source, 0);
    const { outcomes, after } = await trimmed(toBuffer(source));
    const kept = characters(after, 0);
    const survives = ({
      code,
      origin,
    }: {
      code: string;
      origin: readonly [number, number];
    }) =>
      kept.some(
        (other) =>
          other.code === code &&
          Math.abs(other.origin[0] - origin[0]) <= 0.01 &&
          Math.abs(other.origin[1] - origin[1]) <= 0.01,
      );

    expect(outcomes).toEqual([{ removed: true, picturesKept: false, pixelMode: true }]);
    const ws = before.filter(({ code }) => code === "W");
    expect(ws).toHaveLength(cases.length);
    ws.forEach((glyph, at) => {
      expect(
        survives(glyph),
        `${cases[at].font} ${cases[at].edge} ${cases[at].inset}`,
      ).toBe(true);
    });

    const text = kept.map(({ code }) => code).join("");
    expect(text).not.toContain("Belowthecropbox");
    expect(text).not.toContain("Belowthemediabox");
    expect(text).not.toContain("Leftofthepage");
    // The word across the right edge: its glyphs past the edge go, whole.
    expect(text).not.toContain("Straddle");
  });
});

/**
 * MuPDF.js 1.28.1 runs a cropped page inside a clip to its crop box, opened
 * before anything is drawn. The drawing reader leaves that clip out of the
 * clip in force, or no picture on a cropped page could ever reach past the
 * crop (AC-14, AC-15). A page with no crop gets no such clip.
 */
describe("MuPDF's own crop clip (pin)", () => {
  function firstCalls(index: number): string[] {
    return inspect(fixture("trim-scan.pdf"), (doc) => {
      const page = doc.loadPage(index);
      const visible = page.getBounds();
      const calls: string[] = [];
      const device = new mupdf.Device({
        clipPath(path, _evenOdd, ctm) {
          const bounds = path.getBounds(null as never, ctm);
          calls.push(
            bounds.every((value, at) => Math.abs(value - visible[at]) < 0.01)
              ? "clip to the crop box"
              : "clip",
          );
          path.destroy();
        },
        fillImage(image) {
          calls.push("image");
          image.destroy();
        },
        popClip() {
          calls.push("pop");
        },
      });
      try {
        page.run(device, mupdf.Matrix.identity);
        device.close();
      } finally {
        device.destroy();
        page.destroy();
      }
      return calls;
    });
  }

  it("clips a cropped page to its crop box before its content, and an uncropped one not at all", () => {
    expect(firstCalls(0)).toEqual(["clip to the crop box", "image", "pop"]);
    expect(firstCalls(1)).toEqual(["image"]);
  });
});

/**
 * The trim reads line boxes rather than characters, which rests on a line's
 * box being the union of its characters' quads (pin).
 */
describe("a line's box (pin)", () => {
  it("is the union of its characters' quads on every page of these fixtures", () => {
    for (const name of [
      "trim-text.pdf",
      "text-page.pdf",
      "carlito.pdf",
      "angled-text.pdf",
      "ocr-aligned.pdf",
    ]) {
      inspect(fixture(name), (doc) => {
        for (let index = 0; index < doc.countPages(); index += 1) {
          const page = doc.loadPage(index);
          const stext = page.toStructuredText("clip=no");
          let box: number[] = [];
          let union = [Infinity, Infinity, -Infinity, -Infinity];
          stext.walk({
            beginLine(bbox) {
              box = [...bbox];
              union = [Infinity, Infinity, -Infinity, -Infinity];
            },
            onChar(_code, _origin, _font, _size, quad) {
              const xs = [quad[0], quad[2], quad[4], quad[6]];
              const ys = [quad[1], quad[3], quad[5], quad[7]];
              union = [
                Math.min(union[0], ...xs),
                Math.min(union[1], ...ys),
                Math.max(union[2], ...xs),
                Math.max(union[3], ...ys),
              ];
            },
            endLine() {
              box.forEach((value, at) => expect(value, name).toBeCloseTo(union[at], 6));
            },
          });
          stext.destroy();
          page.destroy();
        }
      });
    }
  });
});

/** AC-14, AC-16 and AC-17 on text: below the crop, below the media box, across the edge. */
describe("trimming text", () => {
  it("opens with the off page note, and never lists what lies outside", async () => {
    const doc = await openDocumentWith(mupdf, fixture("trim-text.pdf"), LIMITS);
    try {
      expect(doc.summary.pages).toEqual([{ findings: ["off-page-content"] }]);
      const found = await doc.findMatches({ contextChars: 40 });
      expect(found.map(({ text }) => text)).toEqual([TRIM_TEXT.visibleEmail]);
    } finally {
      doc.close();
    }
  });

  it("removes it with nothing ticked, keeps every glyph wholly inside at its place, and passes its self check", async () => {
    const source = fixture("trim-text.pdf");
    const { output, trim } = await redactDocumentWith(mupdf, source, []);

    const text = unclipped(output);
    expect(text).not.toContain(TRIM_TEXT.belowCrop);
    expect(text).not.toContain(TRIM_TEXT.belowMedia);
    expect(text).not.toContain(TRIM_TEXT.straddling);
    expect(trim).toEqual([{ removed: true, picturesKept: false, pixelMode: true }]);

    // Every character of the two lines inside the crop, at its place.
    const inside = characters(source, 0).filter(({ origin }) => origin[1] < 150);
    const kept = characters(output, 0);
    expect(inside.length).toBeGreaterThan(40);
    for (const { code, origin } of inside) {
      expect(
        kept.some(
          (other) =>
            other.code === code &&
            Math.abs(other.origin[0] - origin[0]) <= 0.01 &&
            Math.abs(other.origin[1] - origin[1]) <= 0.01,
        ),
      ).toBe(true);
    }
  });

  it("removes it in a run that ticks the address inside too", async () => {
    const source = fixture("trim-text.pdf");
    const targets = findTargets(source, 0, TRIM_TEXT.visibleEmail);
    const { output } = await redactDocumentWith(mupdf, source, targets);

    const text = unclipped(output);
    expect(text).not.toContain(TRIM_TEXT.visibleEmail);
    expect(text).not.toContain(TRIM_TEXT.belowCrop);
  });

  it("leaves a page with nothing outside untouched", async () => {
    const { outcomes } = await trimmed(fixture("text-page.pdf"));
    expect(outcomes).toEqual([UNTOUCHED, UNTOUCHED]);
  });
});

/**
 * The decoded pixels of the first image on a page, and where each lands: a
 * check written apart from the engine, from MuPDF's own structured text.
 */
function outsideInk(
  bytes: ArrayBuffer,
  index: number,
): { outside: number; inside: number } {
  return inspect(bytes, (doc) => {
    const page = doc.loadPage(index);
    const visible = page.getBounds();
    const stext = page.toStructuredText("preserve-images,clip=no");
    const counts = { outside: 0, inside: 0 };
    try {
      stext.walk({
        onImageBlock(_bbox, transform: Matrix, image) {
          const pixmap = image.toPixmap();
          try {
            const width = pixmap.getWidth();
            const height = pixmap.getHeight();
            const stride = pixmap.getStride();
            const step = pixmap.getNumberOfComponents();
            const pixels = pixmap.getPixels();
            const [a, b, c, d, e, f] = transform;
            for (let row = 0; row < height; row += 1) {
              for (let column = 0; column < width; column += 1) {
                const corners = [
                  [column / width, row / height],
                  [(column + 1) / width, (row + 1) / height],
                ].map(([u, v]) => [a * u + c * v + e, b * u + d * v + f]);
                const [x0, x1] = [corners[0][0], corners[1][0]].sort((p, q) => p - q);
                const [y0, y1] = [corners[0][1], corners[1][1]].sort((p, q) => p - q);
                const whollyOutside =
                  x1 <= visible[0] ||
                  x0 >= visible[2] ||
                  y1 <= visible[1] ||
                  y0 >= visible[3];
                const whollyInside =
                  x0 >= visible[0] &&
                  x1 <= visible[2] &&
                  y0 >= visible[1] &&
                  y1 <= visible[3];
                const inked = pixels[row * stride + column * step] < 250;
                if (inked && whollyOutside) counts.outside += 1;
                if (inked && whollyInside) counts.inside += 1;
              }
            }
          } finally {
            pixmap.destroy();
            image.destroy();
          }
        },
      });
    } finally {
      stext.destroy();
      page.destroy();
    }
    return counts;
  });
}

/** AC-15 and AC-17 on pictures: blanked within a pixel's reach, else kept and named. */
describe("trimming pictures", () => {
  it("blanks a cropped 150 ppi scan outside its crop, and a picture wholly off the page", async () => {
    const source = fixture("trim-scan.pdf");
    expect(outsideInk(source, 0).outside).toBeGreaterThan(0);
    expect(outsideInk(source, 1).outside).toBeGreaterThan(0);

    const doc = await openDocumentWith(mupdf, source, LIMITS);
    try {
      for (const page of doc.summary.pages)
        expect(page.findings).toContain("off-page-content");
      for (const page of doc.summary.pages)
        expect(page.findings).not.toContain("off-page-picture");
    } finally {
      doc.close();
    }

    const { output, trim } = await redactDocumentWith(mupdf, source, []);
    expect(trim).toEqual([
      { removed: true, picturesKept: false, pixelMode: true },
      { removed: true, picturesKept: false, pixelMode: true },
    ]);
    const scan = outsideInk(output, 0);
    expect(scan.outside).toBe(0);
    expect(scan.inside).toBeGreaterThan(0);
    expect(outsideInk(output, 1).outside).toBe(0);
  });

  it("keeps a stretched band and a turned picture across the edge, and names the pages", async () => {
    const source = fixture("trim-kept.pdf");
    const doc = await openDocumentWith(mupdf, source, LIMITS);
    try {
      for (const page of doc.summary.pages) {
        expect(page.findings).toContain("off-page-picture");
        expect(page.findings).not.toContain("off-page-content");
      }
    } finally {
      doc.close();
    }

    const { output, trim } = await redactDocumentWith(mupdf, source, []);
    expect(trim).toEqual([
      { removed: false, picturesKept: true, pixelMode: false },
      { removed: false, picturesKept: true, pixelMode: false },
    ]);
    expect(outsideInk(output, 0).outside).toBeGreaterThan(0);
    expect(outsideInk(output, 1).outside).toBeGreaterThan(0);
  });
});

/** AC-16: the proof, and its two ways of failing. */
describe("the trim's proof", () => {
  it("fails with edge-text when MuPDF moves the words inside after the glyphs it took", async () => {
    await expect(
      openDocumentWith(mupdf, fixture("trim-refused.pdf"), LIMITS),
    ).rejects.toEqual(new EngineFailure("edge-text"));
    await expect(
      redactDocumentWith(mupdf, fixture("trim-refused.pdf"), []),
    ).rejects.toEqual(new EngineFailure("edge-text"));
  });

  it("fails with unsupported when the words it moved are nowhere near the edge", async () => {
    await expect(
      openDocumentWith(mupdf, fixture("trim-quote.pdf"), LIMITS),
    ).rejects.toEqual(new EngineFailure("unsupported"));
    await expect(
      redactDocumentWith(mupdf, fixture("trim-quote.pdf"), []),
    ).rejects.toEqual(new EngineFailure("unsupported"));
  });

  it("fails with unsupported when a page cannot be loaded", async () => {
    const broken = {
      countPages: () => 1,
      loadPage() {
        throw new Error("page tree damaged");
      },
    } as unknown as PDFDocument;
    await expect(trimToVisibleArea(mupdf, broken)).rejects.toEqual(
      new EngineFailure("unsupported"),
    );
  });
});

/** AC-17: the self check sees a trim that did nothing, whatever is ticked. */
describe("the self check's outside rules", () => {
  const skipped: Pipeline = Object.freeze({
    ...PIPELINE,
    trim: async (_mupdf: unknown, pdf: PDFDocument) =>
      Array.from({ length: pdf.countPages() }, () => UNTOUCHED),
  });

  it.each([
    ["with nothing ticked", false],
    ["with a tick", true],
  ])(
    "refuses text left outside by a skipped trim, %s, as redaction-incomplete",
    async (_label, ticked) => {
      const source = fixture("trim-text.pdf");
      const targets = ticked ? findTargets(source, 0, TRIM_TEXT.visibleEmail) : [];
      await expect(
        redactDocumentWith(mupdf, source, targets, {}, skipped),
      ).rejects.toEqual(new EngineFailure("redaction-incomplete"));
    },
  );

  it.each([0, 1])(
    "refuses ink left outside on page %i of a page claimed as blanked in pixel mode",
    async (claimed) => {
      const pretends: Pipeline = Object.freeze({
        ...PIPELINE,
        trim: async (_mupdf: unknown, pdf: PDFDocument) =>
          Array.from({ length: pdf.countPages() }, (_, index) =>
            index === claimed
              ? { removed: true, picturesKept: false, pixelMode: true }
              : UNTOUCHED,
          ),
      });
      await expect(
        redactDocumentWith(mupdf, fixture("trim-scan.pdf"), [], {}, pretends),
      ).rejects.toEqual(new EngineFailure("redaction-incomplete"));
    },
  );
});

/** AC-29: a cancel is noticed within one page of the trim. */
describe("cancelling a trim", () => {
  it("asks after every page, and stops when told", async () => {
    const doc = mupdf.Document.openDocument(fixture("trim-scan.pdf"), "application/pdf");
    try {
      const pdf = doc.asPDF() as PDFDocument;
      const asked = vi.fn(() => false);
      await trimToVisibleArea(mupdf, pdf, asked);
      expect(asked).toHaveBeenCalledTimes(2);

      await expect(trimToVisibleArea(mupdf, pdf, () => true)).rejects.toBeInstanceOf(
        RunCancelled,
      );
    } finally {
      doc.destroy();
    }
  });
});

/** The page loaded afresh is the page trimmed: nothing is held past a page. */
describe("what the trim holds", () => {
  it("lets every page go, as it read or changed it", async () => {
    const doc = mupdf.Document.openDocument(fixture("trim-text.pdf"), "application/pdf");
    try {
      const pdf = doc.asPDF() as PDFDocument;
      const loadPage = vi.spyOn(pdf, "loadPage");
      await trimToVisibleArea(mupdf, pdf);
      const pages = loadPage.mock.results.map(({ value }) => value as PDFPage);
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) expect(page.pointer).toBe(0);
    } finally {
      doc.destroy();
    }
  });
});
