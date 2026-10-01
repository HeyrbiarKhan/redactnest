import type { PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  COPY_REACH_RATIO,
  EngineFailure,
  EXTRACTION_OPTIONS,
  inspectPages,
  MACHINE_READ_RUN,
  openDocumentWith,
  POSITION_TOLERANCE,
  prepareDocument,
  quadHeight,
  quadWidth,
  READING_GRID,
  redactDocumentWith,
  readsAsNothing,
  RunCancelled,
  silenceEngineLog,
  STAMP_MAX_CHARS,
  TEXT_OVER_PICTURE_MAX,
  walkCharacters,
  walkDrawing,
  WRITE_OPTIONS,
  type Character,
  type Drawing,
  type PageInspection,
  type Rect,
} from "@/engine";

import { isPartly, showsCrookedLine } from "@/lib/page-findings";
import { outputFormFor, outputNameFor } from "@/lib/session";
import { countPagesByFinding } from "@/worker/protocol";
// Not on the engine's index, since nothing past the wall needs it; a test of
// the walled module imports it where it lives.
import { withinReach } from "@/engine/inspect";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import {
  CONCEALED,
  CROOKED_EMAILS,
  EMPTY_CLIP_EMAIL,
  EMPTY_CLIPS,
  MIXED_EMAIL,
  READ_PAGES,
  READ_COVERED,
  READ_HIDDEN,
  READ_PICTURES,
  readShortOcr,
  SHORT_OCR_EMAIL,
  STAMP_EMAIL,
} from "../../scripts/lib/reading-fixtures.mjs";
import { fixture } from "../support/bytes";
import { documentText, LIMITS, mupdf, pageText } from "../support/mupdf";

/**
 * Reading every page before review, driven with the real MuPDF in Node. Spec
 * 0006, slices 1 to 3.
 *
 * Each rule is read off a fixture page written for it, with its near misses
 * beside it, through the engine's own inspection on a prepared copy, exactly
 * as the open reads the review copy.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

/** Open a fixture the way the review copy is opened, prepare it, and read it. */
function inspect(name: string): Promise<readonly PageInspection[]> {
  return inspectBytes(fixture(name));
}

/** The same, for a file built in the test. */
async function inspectBytes(
  bytes: ArrayBuffer | Uint8Array,
): Promise<readonly PageInspection[]> {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF document");
    prepareDocument(mupdf, pdf);
    return await inspectPages(mupdf, pdf);
  } finally {
    doc.destroy();
  }
}

/** Every match in a fixture, found as the worker finds them. */
async function find(name: string) {
  const doc = await openDocumentWith(mupdf, fixture(name), LIMITS);
  try {
    return await doc.findMatches({ contextChars: 40 });
  } finally {
    doc.close();
  }
}

/** One page of a file, read with `clip=no`, as the self check reads it. */
function unclippedText(bytes: ArrayBuffer, index: number): string {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF document");
    return pageText(pdf, index, "clip=no");
  } finally {
    doc.destroy();
  }
}

/** Run a callback on one page of a fixture, and let go of everything after. */
function onPage<T>(name: string, index: number, read: (page: PDFPage) => T): T {
  const doc = mupdf.Document.openDocument(fixture(name), "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF document");
    const page = pdf.loadPage(index) as PDFPage;
    try {
      return read(page);
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/** The index of the `read-pictures.pdf` page `READ_PICTURES` names. */
function picture(name: string): number {
  const index = READ_PICTURES.findIndex((page) => page.name === name);
  if (index < 0) throw new Error(`no page named ${name}`);
  return index;
}

/** AC-1, AC-2 and AC-3: each page gives exactly its findings, and no more. */
describe("the findings of each page", () => {
  it("reads every page of read-pages.pdf as the fixture says", async () => {
    const inspections = await inspect("read-pages.pdf");

    expect(inspections).toHaveLength(READ_PAGES.length);
    expect(
      inspections.map(({ findings, readable }, index) => ({
        name: READ_PAGES[index].name,
        findings,
        readable,
      })),
    ).toEqual(
      READ_PAGES.map(({ name, findings, readable }) => ({ name, findings, readable })),
    );
  });

  it("gives every page a list with no repeats, in PAGE_FINDINGS order", async () => {
    const { PAGE_FINDINGS } = await import("@/worker/protocol");
    for (const { findings } of await inspect("read-pages.pdf")) {
      expect(new Set(findings).size).toBe(findings.length);
      expect([...findings]).toEqual(
        PAGE_FINDINGS.filter((each) => findings.includes(each)),
      );
    }
  });

  it("carries closed findings, two flags and concealed glyphs, and only the findings reach the summary (INV-1)", async () => {
    for (const inspection of await inspect("read-pages.pdf")) {
      expect(Object.keys(inspection).sort()).toEqual([
        "concealed",
        "emptyClip",
        "findings",
        "readable",
      ]);
    }

    const doc = await openDocumentWith(mupdf, fixture("read-pages.pdf"), LIMITS);
    try {
      for (const reading of doc.summary.pages) {
        expect(Object.keys(reading)).toEqual(["findings"]);
      }
    } finally {
      doc.close();
    }
  });
});

/** AC-10: nothing readable is refused at open, and one readable page opens. */
describe("a document with nothing readable", () => {
  it.each([
    ["every page a scan", "read-scans.pdf"],
    ["every page blank", "read-blank.pdf"],
    ["every page a stamped scan", "read-stamped.pdf"],
    ["every page in an unmapped font", "read-unmapped.pdf"],
    ["every page in a private use font", "read-private.pdf"],
    ["a mix of those", "read-refused-mix.pdf"],
  ])("refuses %s with no-readable-text", async (_label, name) => {
    await expect(openDocumentWith(mupdf, fixture(name), LIMITS)).rejects.toEqual(
      new EngineFailure("no-readable-text"),
    );
  });

  it("decides it from the readings, before anything else happens", async () => {
    for (const name of ["read-scans.pdf", "read-blank.pdf", "read-stamped.pdf"]) {
      expect((await inspect(name)).every(readsAsNothing)).toBe(true);
    }
    expect((await inspect("read-mixed.pdf")).every(readsAsNothing)).toBe(false);
  });

  it("opens a document with one readable page, and names its scan", async () => {
    const doc = await openDocumentWith(mupdf, fixture("read-mixed.pdf"), LIMITS);
    try {
      expect(doc.summary).toEqual({
        pageCount: 3,
        pages: [{ findings: [] }, { findings: ["scanned"] }, { findings: ["blank"] }],
      });
      const found = await doc.findMatches({ contextChars: 40 });
      expect(found.map(({ page, text }) => ({ page, text }))).toEqual([
        { page: 0, text: MIXED_EMAIL },
      ]);
    } finally {
      doc.close();
    }
  });

  it("opens a stamped scan beside one typed page", async () => {
    const doc = await openDocumentWith(mupdf, fixture("read-pages.pdf"), LIMITS);
    try {
      expect(doc.summary.pages[2]).toEqual({ findings: ["scanned"] });
    } finally {
      doc.close();
    }
  });
});

/** AC-12: detection reads every page with a readable character, a scan's stamp included. */
describe("which pages detection reads", () => {
  it("finds an address in a scanned page's stamp, and reads no unreadable page", async () => {
    const doc = await openDocumentWith(mupdf, fixture("read-pages.pdf"), LIMITS);
    try {
      const found = await doc.findMatches({ contextChars: 40 });
      const stampPage = READ_PAGES.findIndex(({ name }) => name.includes("address"));
      expect(found.map(({ page, text }) => ({ page, text }))).toEqual([
        { page: stampPage, text: STAMP_EMAIL },
      ]);
    } finally {
      doc.close();
    }
  });
});

/** AC-11 and INV-2: an inspection that cannot finish fails the open. */
describe("a page that cannot be read", () => {
  it("fails with unsupported when a page cannot be loaded", async () => {
    const broken = {
      countPages: () => 2,
      loadPage() {
        throw new Error("page tree damaged");
      },
    } as unknown as PDFDocument;

    await expect(inspectPages(mupdf, broken)).rejects.toEqual(
      new EngineFailure("unsupported"),
    );
  });

  it("fails with unsupported when drawing a page throws, and lets the page go", async () => {
    const destroy = vi.fn();
    const page = {
      getBounds: () => [0, 0, 612, 792],
      toStructuredText: () => {
        throw new Error("content stream damaged");
      },
      run: () => {
        throw new Error("content stream damaged");
      },
      destroy,
    };
    const broken = {
      countPages: () => 1,
      loadPage: () => page,
    } as unknown as PDFDocument;

    await expect(inspectPages(mupdf, broken)).rejects.toEqual(
      new EngineFailure("unsupported"),
    );
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("carries nothing the page said in the failure", async () => {
    const broken = {
      countPages: () => 1,
      loadPage() {
        throw new Error("Patient Jane Doe");
      },
    } as unknown as PDFDocument;

    const failure = await inspectPages(mupdf, broken).catch((caught: unknown) => caught);
    expect(JSON.stringify(failure)).not.toContain("Jane");
    expect(String(failure)).not.toContain("Jane");
  });
});

/** AC-29: a cancel is noticed within one page, and the open keeps nothing. */
describe("cancelling while pages are read", () => {
  it("asks after every page, and stops when told", async () => {
    const doc = mupdf.Document.openDocument(fixture("read-pages.pdf"), "application/pdf");
    try {
      const pdf = doc.asPDF() as PDFDocument;
      const asked = vi.fn(() => false);
      await inspectPages(mupdf, pdf, asked);
      expect(asked).toHaveBeenCalledTimes(READ_PAGES.length);

      let pages = 0;
      await expect(
        inspectPages(mupdf, pdf, () => (pages += 1) === 2),
      ).rejects.toBeInstanceOf(RunCancelled);
      expect(pages).toBe(2);
    } finally {
      doc.destroy();
    }
  });

  it("stops an open with RunCancelled, before detection could run", async () => {
    await expect(
      openDocumentWith(mupdf, fixture("read-pages.pdf"), LIMITS, {
        isCancelled: () => true,
      }),
    ).rejects.toBeInstanceOf(RunCancelled);
  });

  it("reports inspecting before it reads a page", async () => {
    const phases: string[] = [];
    let readBeforeInspecting = false;
    const doc = await openDocumentWith(mupdf, fixture("read-mixed.pdf"), LIMITS, {
      onPhase: (phase) => phases.push(phase),
      isCancelled: () => {
        if (!phases.includes("inspecting")) readBeforeInspecting = true;
        return false;
      },
    });
    doc.close();

    expect(phases).toEqual(["opening", "inspecting"]);
    expect(readBeforeInspecting).toBe(false);
  });
});

/**
 * Pins on MuPDF.js 1.28.1 that the rules rest on. An upgrade that changes one
 * fails here rather than quietly changing a finding.
 */
describe("what MuPDF reports (pins)", () => {
  function drawingsOf(name: string, index: number): readonly Drawing[] {
    return onPage(name, index, (page) => {
      const seen: Drawing[] = [];
      walkDrawing(mupdf, page, (drawing) => seen.push(drawing));
      return seen;
    });
  }

  it("reports invisible text through ignoreText", () => {
    const text = drawingsOf("ocr-aligned.pdf", 0).filter((each) => each.kind === "text");
    expect(text.length).toBeGreaterThan(0);
    expect(text.every((each) => each.kind === "text" && each.mode === "ignore")).toBe(
      true,
    );
  });

  it("reports an image's placement through fillImage's transform, in page space", () => {
    // `ocr-aligned.pdf` draws its scan 300 by 140 pt with its lower left
    // corner at (72, 560) in PDF space, which is (72, 92) to (372, 232) in
    // the page space structured text uses.
    const [image] = drawingsOf("ocr-aligned.pdf", 0).filter(
      (each) => each.kind === "image",
    );
    expect(image).toMatchObject({
      kind: "image",
      stencil: false,
      width: 1200,
      height: 560,
    });
    if (image.kind !== "image") throw new Error("expected an image");
    const [a, b, c, d, e, f] = image.transform;
    // `+ 0` turns MuPDF's `-0` into `0`, which is the same placement.
    expect(
      [a, b, c, d, e, f].map((value) => Math.round(value * 1000) / 1000 + 0),
    ).toEqual([300, 0, 0, 140, 72, 92]);
  });

  it("reports a stencil scan through fillImageMask", () => {
    const [image] = drawingsOf("read-pages.pdf", 3).filter(
      (each) => each.kind === "image",
    );
    expect(image).toMatchObject({ kind: "image", stencil: true });
  });

  it("extracts a glyph with no character map as U+FFFD in the ordinary read", () => {
    const unmapped = READ_PAGES.findIndex(({ name }) => name.includes("unmapped font"));
    const codes = onPage("read-pages.pdf", unmapped, (page) => {
      const seen: number[] = [];
      walkCharacters(page, EXTRACTION_OPTIONS[0], ({ code }) => seen.push(code));
      return seen;
    });
    expect(codes.filter((code) => code !== 0x20).every((code) => code === 0xfffd)).toBe(
      true,
    );
    expect(codes.length).toBeGreaterThan(20);
  });

  it("gives a glyph's origin and em height in page space", () => {
    // Page 1 of read-pages.pdf: 14 pt Helvetica with its baseline at 720 in
    // PDF space, which is 72 in page space.
    const [first] = drawingsOf("read-pages.pdf", 0).filter(
      (each) => each.kind === "text",
    );
    if (first.kind !== "text") throw new Error("expected text");
    expect(first.glyphs[0].origin[0]).toBeCloseTo(72, 6);
    expect(first.glyphs[0].origin[1]).toBeCloseTo(72, 6);
    expect(first.glyphs[0].em).toBeCloseTo(14, 6);
  });
});

/**
 * Slice 2: AC-2, AC-4 and AC-5. Pictures with no text over them, the stamp
 * rule against a slide, and text recognition layers in either order.
 */
describe("pictures and machine read text", () => {
  it("reads every page of read-pictures.pdf as the fixture says", async () => {
    const inspections = await inspect("read-pictures.pdf");

    expect(
      inspections.map(({ findings }, index) => ({
        name: READ_PICTURES[index].name,
        findings,
      })),
    ).toEqual(READ_PICTURES.map(({ name, findings }) => ({ name, findings })));
  });

  it("reads the redaction matrix's OCR scan as machine read, and nothing more", async () => {
    for (const name of ["ocr-aligned.pdf", "ocr-misaligned.pdf", "ocr-bare.pdf"]) {
      expect(
        (await inspect(name)).map(({ findings }) => findings),
        name,
      ).toEqual([["machine-read-text"]]);
    }
  });

  it("opens a slide deck of full bleed photos, each slide a bare picture, not a scan", async () => {
    const doc = await openDocumentWith(mupdf, fixture("read-slides.pdf"), LIMITS);
    try {
      expect(doc.summary.pages).toEqual([
        { findings: ["bare-picture"] },
        { findings: ["bare-picture"] },
      ]);
    } finally {
      doc.close();
    }
  });

  it("never calls a machine read glyph covered or hidden, in either order", async () => {
    const inspections = await inspect("read-pictures.pdf");
    const ocrPages = READ_PICTURES.flatMap(({ findings }, index) =>
      findings.includes("machine-read-text") ? [index] : [],
    );
    for (const index of ocrPages) {
      expect(inspections[index].findings).not.toContain("covered-text");
      expect(inspections[index].findings).not.toContain("hidden-text");
    }
  });
});

/**
 * Spec 0008: sparse OCR scans. A picture holding a machine read run, three or
 * more letters or numbers in a row on one line, purely invisible, on a line no
 * drawn text runs beside, centred inside it and inside no picture of a
 * different footprint, is not bare. The table above reads each of
 * `read-pictures.pdf`'s new pages; these prove what it rests on, and that
 * following the OCR advice clears the warning. `read-stamped.pdf` and
 * `read-slides.pdf` keep their findings in the blocks above (AC-4, AC-5).
 */
describe("sparse OCR scans", () => {
  /**
   * AC-2's pin, which the clipped letter case rests on: the ordinary read
   * drops a glyph a clip hides wholly, and keeps one the clip only cuts, so
   * the clipped "Yes" reads as "Ye", a run of 2, though all three are drawn.
   */
  it("reads the clipped Yes as Ye, though the page draws all three glyphs (pin)", () => {
    const index = picture("a scan whose three letter word a clip cuts to two");
    const { drawn, read } = onPage("read-pictures.pdf", index, (page) => {
      let invisible = "";
      walkDrawing(mupdf, page, (drawing) => {
        if (drawing.kind !== "text" || drawing.mode !== "ignore") return;
        for (const { unicode } of drawing.glyphs)
          invisible += String.fromCodePoint(unicode);
      });
      let extracted = "";
      walkCharacters(page, EXTRACTION_OPTIONS[0], ({ code }) => {
        extracted += String.fromCodePoint(code);
      });
      return { drawn: invisible, read: extracted };
    });
    expect(drawn).toBe("Yes");
    expect(read).toBe("Ye");
  });

  /**
   * AC-14's pin, which the format character page rests on: the ordinary read
   * keeps each zero width space, zero width joiner and soft hyphen as one
   * character of its own, so they reach the run search and end each run there,
   * rather than being dropped or merged by extraction.
   */
  it("keeps each format character of the layer as one character (pin)", () => {
    const index = picture("a scan whose layer is runs of format characters");
    const codes = onPage("read-pictures.pdf", index, (page) => {
      const seen: number[] = [];
      walkCharacters(page, EXTRACTION_OPTIONS[0], ({ code }) => seen.push(code));
      return seen;
    });
    expect(codes.filter((code) => code !== 0x20)).toEqual([
      0x200b, 0x200b, 0x200b, 0x200d, 0x200d, 0x200d, 0xad, 0xad, 0xad,
    ]);
  });

  /**
   * AC-2's reverse pin: on every page a run clears, each character of each
   * run of `MACHINE_READ_RUN` characters that are not whitespace, on one line
   * of the ordinary read, meets an invisible glyph at its origin within
   * `POSITION_TOLERANCE`. Found with MuPDF's readers alone, nothing from the
   * rule, so the rule's "at its origin" is proved to hold on these layers.
   */
  it("finds an invisible glyph at the origin of every character in a run (pin)", () => {
    const cases: readonly (readonly [string, number])[] = [
      ...[
        "a sparse scan with one recognised sentence",
        "a sparse scan with a few recognised words",
        "a scan whose layer is one three letter word",
        "a sparse Tesseract layer, straight",
        "a sparse Tesseract layer, turned a degree",
        "a sparse Tesseract layer on a turned page",
        "a scan in two strips, its one word across the join",
        "a layered scan: a background and a stencil under one layer",
      ].map((name) => ["read-pictures.pdf", picture(name)] as const),
      ["read-short-ocr.pdf", 0],
    ];
    for (const [name, index] of cases) {
      const { invisible, runs } = onPage(name, index, (page) => {
        const origins: (readonly [number, number])[] = [];
        walkDrawing(mupdf, page, (drawing) => {
          if (drawing.kind !== "text" || drawing.mode !== "ignore") return;
          for (const { origin } of drawing.glyphs) origins.push(origin);
        });

        const found: (readonly [number, number])[][] = [];
        let run: (readonly [number, number])[] = [];
        let line = -1;
        const close = () => {
          if (run.length >= MACHINE_READ_RUN) found.push(run);
          run = [];
        };
        walkCharacters(page, EXTRACTION_OPTIONS[0], (character) => {
          if (character.line !== line) {
            close();
            line = character.line;
          }
          if (/\s/u.test(String.fromCodePoint(character.code))) close();
          else run.push(character.origin);
        });
        close();
        return { invisible: origins, runs: found };
      });
      const meets = ([x, y]: readonly [number, number]) =>
        invisible.some(
          ([ox, oy]) =>
            Math.abs(ox - x) <= POSITION_TOLERANCE &&
            Math.abs(oy - y) <= POSITION_TOLERANCE,
        );

      expect(runs.length, `${name} ${index}`).toBeGreaterThan(0);
      for (const origin of runs.flat()) {
        expect(
          meets(origin),
          `${name} ${index}: a character at ${origin} met no invisible glyph`,
        ).toBe(true);
      }
    }
  });

  /**
   * AC-5 and AC-8: following the advice clears the warning. The scan alone is
   * refused, as `read-scans.pdf` still is; with one short line of text
   * recognition over it, 20 readable characters, it opens with the machine
   * read note only, its address is listed, and a run that removes it is named
   * redacted, not partly redacted.
   */
  it("refuses the scan alone, and opens it once a short text layer lies over it", async () => {
    const alone = readShortOcr({ layer: false }).slice().buffer as ArrayBuffer;
    for (const bytes of [alone, fixture("read-scans.pdf")]) {
      await expect(openDocumentWith(mupdf, bytes, LIMITS)).rejects.toEqual(
        new EngineFailure("no-readable-text"),
      );
    }

    const doc = await openDocumentWith(mupdf, fixture("read-short-ocr.pdf"), LIMITS);
    try {
      expect(doc.summary).toEqual({
        pageCount: 1,
        pages: [{ findings: ["machine-read-text"] }],
      });
      expect(isPartly(doc.summary)).toBe(false);

      const found = await doc.findMatches({ contextChars: 40 });
      expect(found.map(({ page, text, blocked }) => ({ page, text, blocked }))).toEqual([
        { page: 0, text: SHORT_OCR_EMAIL, blocked: null },
      ]);
      const [{ target }] = found;
      if (!target) throw new Error("expected a tickable match");

      const { output, removedByType, sanitized } = await redactDocumentWith(
        mupdf,
        fixture("read-short-ocr.pdf"),
        [target],
      );
      expect(documentText(output)).not.toContain(SHORT_OCR_EMAIL);
      // The outcome as the worker makes it, and the name the visitor is offered.
      const form = outputFormFor(doc.summary, {
        pageCount: doc.summary.pageCount,
        removedByType,
        pagesByFinding: countPagesByFinding(doc.summary.pages),
        sanitized,
      });
      expect(outputNameFor("signed-letter.pdf", form)).toBe("signed-letter-redacted.pdf");
    } finally {
      doc.close();
    }
  });

  /** The sparse scans' one recognised sentence: 45 readable characters. */
  const SENTENCE = "Signed for and on behalf of the company by its director";

  /**
   * One page: a full page grey scan, then `layer` over it. `/F1` is
   * Helvetica. `/M` is a simple font whose glyph names map to no character
   * and which has no ToUnicode map, so MuPDF reads each of its glyphs as
   * U+FFFD, as it reads `read-unmapped.pdf`'s. `/Clear` sets the fill opacity
   * to zero. `/Logo` is a second image, drawn only where `layer` says so.
   * `keys` are more page keys, such as `/Rotate 90`. Built here, because each
   * is a line or two over one scan.
   */
  function scanUnder(layer: string, { keys = "" } = {}): Uint8Array {
    const names = Array.from({ length: 26 }, (_, at) => `/zz${65 + at}`).join(" ");
    return writePdf({
      objects: [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ${keys} ` +
          "/Resources << /Font << /F1 4 0 R /M 5 0 R >> /XObject << /Scan 7 0 R /Logo 9 0 R >> " +
          "/ExtGState << /Clear << /ca 0 >> >> >> /Contents 8 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Mystery /FirstChar 32 /LastChar 90 " +
          `/Widths [${Array(59).fill(600).join(" ")}] ` +
          `/Encoding << /Type /Encoding /Differences [65 ${names}] >> /FontDescriptor 6 0 R >>`,
        "<< /Type /FontDescriptor /FontName /Mystery /FontBBox [0 -200 1000 800] " +
          "/Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /ItalicAngle 0 /Flags 4 >>",
        stream(
          "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8",
          new Uint8Array(4).fill(200),
        ),
        stream("", `q 612 0 0 792 0 0 cm /Scan Do Q\n${layer}`),
        stream(
          "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8",
          new Uint8Array(4).fill(40),
        ),
      ],
      trailer: "/Root 1 0 R",
    }).bytes;
  }

  /**
   * One line in font `font` and render mode `mode`, at 12 pt from x 72, on the
   * sparse scans' baseline unless `y` says otherwise.
   */
  function textLine(font: string, mode: number, text: string, y = 120): string {
    return `BT ${mode} Tr /${font} 12 Tf 72 ${y} Td (${text}) Tj ET\n`;
  }

  /**
   * AC-2 and AC-15: a clipping glyph at a character's origin makes its line a
   * drawn copy, whatever was painted inside that clip. The same sentence is
   * drawn invisible (`3 Tr`) and then as a clip (`7 Tr`) at one place: with
   * the scan painted again inside the clip, which only `clipGlyphs` records,
   * and with nothing painted inside it, which `clipOnly` records too. Each
   * stays bare, where the invisible line alone clears the scan.
   */
  it.each([
    ["with the scan painted inside the clip", "612 0 0 792 0 0 cm /Scan Do "],
    ["with nothing painted inside the clip", ""],
  ])(
    "never counts a character drawn invisible and as a clip at one place, %s",
    async (_label, inside) => {
      const alone = await inspectBytes(scanUnder(textLine("F1", 3, SENTENCE)));
      expect(alone.map(({ findings }) => findings)).toEqual([["machine-read-text"]]);

      const [clipped] = await inspectBytes(
        scanUnder(
          textLine("F1", 3, SENTENCE) + `q ${textLine("F1", 7, SENTENCE)}${inside}Q\n`,
        ),
      );
      expect(clipped.findings).toContain("bare-picture");
      expect(clipped.findings).toContain("machine-read-text");
    },
  );

  /**
   * AC-2 and AC-15: however the copy at the invisible line's origin is drawn,
   * its line counts for nothing. Stroked, filled in white, filled at zero
   * opacity, and in `5 Tr` (stroked and added to the clip) and `6 Tr` (filled,
   * stroked and added to the clip), each clip inside `q … Q`. MuPDF sends the
   * clip part of both `5 Tr` and `6 Tr` through `clipText`, the reader's
   * `clip` branch, never `clip-stroke`, with the fill and the stroke as their
   * own calls (measured 2026-09-30). Each stays bare, where the invisible line
   * alone clears the scan.
   */
  it.each([
    ["stroked (1 Tr)", textLine("F1", 1, SENTENCE)],
    ["filled white", `q 1 g ${textLine("F1", 0, SENTENCE)}Q\n`],
    ["filled at zero opacity", `q /Clear gs ${textLine("F1", 0, SENTENCE)}Q\n`],
    ["in 5 Tr", `q ${textLine("F1", 5, SENTENCE)}Q\n`],
    ["in 6 Tr", `q ${textLine("F1", 6, SENTENCE)}Q\n`],
  ])("never counts a line with a copy drawn at its origin, %s", async (_label, copy) => {
    const alone = await inspectBytes(scanUnder(textLine("F1", 3, SENTENCE)));
    expect(alone.map(({ findings }) => findings)).toEqual([["machine-read-text"]]);

    const [copied] = await inspectBytes(scanUnder(textLine("F1", 3, SENTENCE) + copy));
    expect(copied.findings).toContain("bare-picture");
    expect(copied.findings).toContain("machine-read-text");
  });

  /**
   * AC-15: the next line is out of reach. The same words drawn visible one
   * line spacing (14.4 pt) above the invisible sentence leave it clearing the
   * scan: Helvetica's 12 pt quad is about 16.5 pt tall, so the reach is about
   * 8.2 pt. On a turned page the lines run up the page, so a reach measured in
   * plain x and y, from the reach before a character to the reach past its
   * end, would take in the neighbour's glyphs; measured along each line's own
   * direction, it does not.
   */
  it.each([
    ["upright", ""],
    ["on a turned page", "/Rotate 90"],
  ])(
    "leaves a line clearing the scan with visible text a line above it, %s",
    async (_label, keys) => {
      const layer = textLine("F1", 3, SENTENCE) + textLine("F1", 0, SENTENCE, 134.4);
      const inspections = await inspectBytes(scanUnder(layer, { keys }));
      expect(inspections.map(({ findings }) => findings)).toEqual([
        ["machine-read-text"],
      ]);
    },
  );

  /**
   * AC-15: a copy is caught along the line's own direction, not in plain x
   * and y. The two copies of `read-pictures.pdf` (an invisible sentence half a
   * point left of and below a visible one, and one drifting ahead of it with
   * 0.6 pt character spacing) drawn on each turned page and on lines tilted 1,
   * 3 and 10 degrees. Each stays bare, where the invisible line alone clears
   * the scan. Each copy puts a drawn glyph within reach of some character's
   * own origin, which no error in the direction maths moves out of range, so
   * these pin the copy being caught; the next line test above pins the reach
   * not running into a neighbour.
   */
  describe.each([
    ["on a page turned 90 degrees", "/Rotate 90", 0],
    ["on a page turned 180 degrees", "/Rotate 180", 0],
    ["on a page turned 270 degrees", "/Rotate 270", 0],
    ["on a line tilted 1 degree", "", 1],
    ["on a line tilted 3 degrees", "", 3],
    ["on a line tilted 10 degrees", "", 10],
  ])("a hidden copy %s", (_label, keys, degrees) => {
    const cos = Math.cos((degrees * Math.PI) / 180);
    const sin = Math.sin((degrees * Math.PI) / 180);
    const line = (mode: number, x: number, y: number, spacing = 0) =>
      `BT ${mode} Tr /F1 12 Tf ${spacing} Tc ` +
      `${cos} ${sin} ${-sin} ${cos} ${x} ${y} Tm (${SENTENCE}) Tj ET\n`;

    it.each([
      ["offset half a point", line(3, 71.5, 119.5)],
      ["drifting ahead", line(3, 72, 120, 0.6)],
    ])("is caught when %s", async (_label, copy) => {
      const alone = await inspectBytes(scanUnder(copy, { keys }));
      expect(alone.map(({ findings }) => findings)).toEqual([["machine-read-text"]]);

      const [copied] = await inspectBytes(scanUnder(line(0, 72, 120) + copy, { keys }));
      expect(copied.findings).toContain("bare-picture");
      expect(copied.findings).toContain("machine-read-text");
    });
  });

  /**
   * AC-1: each character in a run is readable (spec 0006, AC-3). A text layer
   * in a font with no character map reads as U+FFFD, so it never forms a run,
   * and the scan under it stays a scan. The same words in a mapped font make
   * a short OCR page, machine read and nothing more (AC-5).
   */
  it("never counts an invisible layer that reads as U+FFFD, and does count the same words mapped", async () => {
    const words = "SIGNED FOR THE COMPANY";

    const [mapped] = await inspectBytes(scanUnder(textLine("F1", 3, words)));
    expect(mapped.findings).toEqual(["machine-read-text"]);

    const [unmapped] = await inspectBytes(scanUnder(textLine("M", 3, words)));
    expect(unmapped.readable).toBe(false);
    expect(unmapped.findings).toContain("scanned");
    expect(unmapped.findings).toContain("machine-read-text");
  });

  /**
   * AC-16: "picture" is spec 0006's, so an image under `PICTURE_MIN_SHARE`
   * takes no character from the scan beneath. The whole sentence (x 72 to
   * about 370) lies over a logo 320 by 60 pt, about 4% of the page, and still
   * clears the scan. The near miss is the same image 160 pt tall, about 11%:
   * a picture of a different footprint, which takes every character, so the
   * scan is left bare.
   */
  it.each([
    ["a small logo, no picture, leaves the scan cleared", 60, ["machine-read-text"]],
    [
      "a picture the same width, taller, leaves the scan bare",
      160,
      ["bare-picture", "machine-read-text"],
    ],
  ])(
    "counts a line over an image on a scan by its size: %s",
    async (_label, height, findings) => {
      const logo = `q 320 0 0 ${height} 60 100 cm /Logo Do Q\n`;
      const [inspection] = await inspectBytes(
        scanUnder(logo + textLine("F1", 3, SENTENCE)),
      );
      expect(inspection.findings).toEqual(findings);
    },
  );

  /**
   * AC-14: the readable count is unchanged, so punctuation that ends every run
   * still counts toward the stamp cap. A layer of `STAMP_MAX_CHARS` marks with
   * no letter or number holds no run, so the scan is bare, but the page is too
   * full of readable characters to be a stamped scan. One mark fewer, and it
   * is `scanned`.
   */
  it("counts punctuation toward the stamp cap, though it never forms a run", async () => {
    const marks = (count: number) => "|.~,".repeat(count).slice(0, count);

    const [atCap] = await inspectBytes(
      scanUnder(textLine("F1", 3, marks(STAMP_MAX_CHARS))),
    );
    expect(atCap.readable).toBe(true);
    expect(atCap.findings).toEqual(["bare-picture", "machine-read-text"]);

    const [underCap] = await inspectBytes(
      scanUnder(textLine("F1", 3, marks(STAMP_MAX_CHARS - 1))),
    );
    expect(underCap.findings).toEqual(["scanned", "machine-read-text"]);
  });

  /** Three hidden lines of 13 bars at 60 pt: 39 readable characters and no word. */
  const LARGE_BARS = [600, 450, 300]
    .map((y) => `BT 3 Tr /F1 60 Tf 72 ${y} Td (${"|".repeat(13)}) Tj ET\n`)
    .join("");

  /**
   * Spec 0010, AC-8: a picture the area test cleared can now be bare, so a
   * page under the stamp cap can turn `scanned`, the stronger warning. Three
   * hidden lines of 13 bars at 60 pt, 39 readable characters and no word. The
   * share of the grid their boxes cover is measured here with MuPDF's reader
   * alone, so the case is what it says: over `TEXT_OVER_PICTURE_MAX`, which
   * cleared the scan before spec 0010.
   */
  it("names a scan under a few large hidden bars scanned, though their lines cover over 5% of it", async () => {
    const bytes = scanUnder(LARGE_BARS);

    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    const boxes = new Map<number, Rect>();
    let readable = 0;
    try {
      const page = doc.loadPage(0) as PDFPage;
      try {
        walkCharacters(page, EXTRACTION_OPTIONS[0], ({ code, line, quad }) => {
          if (code === 0x7c) readable += 1;
          const xs = [quad[0], quad[2], quad[4], quad[6]];
          const ys = [quad[1], quad[3], quad[5], quad[7]];
          const [x0, y0, x1, y1] = boxes.get(line) ?? [
            Infinity,
            Infinity,
            -Infinity,
            -Infinity,
          ];
          boxes.set(line, [
            Math.min(x0, ...xs),
            Math.min(y0, ...ys),
            Math.max(x1, ...xs),
            Math.max(y1, ...ys),
          ]);
        });
      } finally {
        page.destroy();
      }
    } finally {
      doc.destroy();
    }
    let covered = 0;
    for (let row = 0; row < READING_GRID; row += 1) {
      for (let column = 0; column < READING_GRID; column += 1) {
        const x = ((column + 0.5) * 612) / READING_GRID;
        const y = ((row + 0.5) * 792) / READING_GRID;
        if (
          [...boxes.values()].some(
            ([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1,
          )
        )
          covered += 1;
      }
    }
    expect(readable).toBe(STAMP_MAX_CHARS - 1);
    expect(covered / READING_GRID ** 2).toBeGreaterThan(TEXT_OVER_PICTURE_MAX);

    const [inspection] = await inspectBytes(bytes);
    expect(inspection.findings).toEqual(["scanned", "machine-read-text"]);
  });

  /**
   * Spec 0010, AC-8: so a document made only of such pages is refused
   * `no-readable-text`, where it opened before, since nothing on it can be
   * found.
   */
  it("refuses a document made only of a scan under a few large hidden bars", async () => {
    const bytes = scanUnder(LARGE_BARS).slice().buffer as ArrayBuffer;
    await expect(openDocumentWith(mupdf, bytes, LIMITS)).rejects.toEqual(
      new EngineFailure("no-readable-text"),
    );
  });

  /**
   * Spec 0010, AC-1: a drawn glyph is spec 0008's, filled, stroked or
   * clipping, so visible lines of words clear a scan by area however they are
   * drawn. 24 lines of "Payment received" over the scan, as on
   * `read-pictures.pdf` page 37, and none invisible, so no run can clear it:
   * only the area test does, and a line whose glyphs it did not count as drawn
   * would leave the scan bare.
   */
  it.each([
    ["filled (0 Tr)", (y: number) => textLine("F1", 0, "Payment received", y)],
    ["stroked (1 Tr)", (y: number) => textLine("F1", 1, "Payment received", y)],
    [
      "as a clip (7 Tr)",
      (y: number) => `q ${textLine("F1", 7, "Payment received", y)}Q\n`,
    ],
  ])("clears a scan under visible lines of words drawn %s", async (_label, draw) => {
    const lines = Array.from({ length: 24 }, (_, row) => draw(740 - row * 28)).join("");
    const [inspection] = await inspectBytes(scanUnder(lines));
    expect(inspection.findings).not.toContain("bare-picture");
  });
});

/**
 * Spec 0010: dense text layers over pictures. A picture's coverage counts only
 * visible lines of words, every readable character drawn where the text says,
 * and machine read text clears a picture only through a run. The table above
 * reads `read-pictures.pdf`'s pages 28 to 37; these pin what MuPDF does that
 * two of them rest on, found with its readers alone, nothing from the rule.
 */
describe("dense text layers over pictures", () => {
  /**
   * Each line of a page's ordinary read, as whether it holds a character that
   * is not whitespace or U+FFFD with no glyph of any kind (filled, stroked,
   * clipping or invisible) drawn at its origin within `POSITION_TOLERANCE`.
   */
  function unmatchedLines(index: number): readonly boolean[] {
    return onPage("read-pictures.pdf", index, (page) => {
      const glyphs: (readonly [number, number])[] = [];
      walkDrawing(mupdf, page, (drawing) => {
        if (drawing.kind !== "text") return;
        for (const { origin } of drawing.glyphs) glyphs.push(origin);
      });
      const lines: boolean[] = [];
      walkCharacters(page, EXTRACTION_OPTIONS[0], ({ code, line, origin: [x, y] }) => {
        lines[line] ??= false;
        if (code === 0xfffd || /\s/u.test(String.fromCodePoint(code))) return;
        const matched = glyphs.some(
          ([gx, gy]) =>
            Math.abs(gx - x) <= POSITION_TOLERANCE &&
            Math.abs(gy - y) <= POSITION_TOLERANCE,
        );
        if (!matched) lines[line] = true;
      });
      return lines;
    });
  }

  /**
   * AC-6's pin: replacement text wrapped around its own text object and
   * longer than its glyphs leaves its extra characters at no glyph's origin,
   * on every line, so no line of page 36 counts. Replacement text equal to its
   * glyphs matches every character, so every line of page 37 does.
   */
  it("reads longer replacement text at no glyph's origin, and equal replacement text at every glyph's (pin)", () => {
    const longer = unmatchedLines(
      picture("a scan behind lines whose replacement text adds a word"),
    );
    expect(longer).toHaveLength(24);
    expect(longer.every(Boolean)).toBe(true);

    const equal = unmatchedLines(
      picture("a scan behind lines whose replacement text matches its glyphs"),
    );
    expect(equal).toHaveLength(24);
    expect(equal.some(Boolean)).toBe(false);
  });

  /**
   * AC-7's pin: MuPDF reads each character of vertical writing as a line of
   * its own, so a dense vertical layer forms no run and its scan is named, a
   * recorded limit.
   */
  it("reads each character of a vertical layer as a line of its own (pin)", () => {
    const perLine = onPage(
      "read-pictures.pdf",
      picture("a scan with a dense layer in vertical writing"),
      (page) => {
        const counts: number[] = [];
        walkCharacters(page, EXTRACTION_OPTIONS[0], ({ line }) => {
          counts[line] = (counts[line] ?? 0) + 1;
        });
        return counts;
      },
    );
    expect(perLine.length).toBeGreaterThanOrEqual(260);
    expect(perLine.every((count) => count === 1)).toBe(true);
  });

  /**
   * The copy reach exactly as spec 0008 built it: `withinReach` on `main`
   * before spec 0010, its bounds built as arrays and spread. AC-11 wrote those
   * bounds out by hand, since a dense layer with no word asks this of every
   * character it holds, which must change no answer. This frozen copy is the
   * reference the engine is held to below. Never keep it in step with the
   * engine: its worth is that it does not move.
   */
  function reachBefore(
    character: Character,
    drawn: { readonly xs: Float64Array; readonly ys: Float64Array },
  ): boolean {
    const firstAtLeast = (sorted: Float64Array, value: number): number => {
      let low = 0;
      let high = sorted.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        if (sorted[middle] < value) low = middle + 1;
        else high = middle;
      }
      return low;
    };

    const height = quadHeight(character.quad);
    const width = quadWidth(character.quad);
    const [ox, oy] = character.origin;
    const [dx, dy] = character.direction;
    const length = Math.hypot(dx, dy);
    if (
      !Number.isFinite(height) ||
      !Number.isFinite(width) ||
      !Number.isFinite(ox) ||
      !Number.isFinite(oy) ||
      !(length > 0 && Number.isFinite(length))
    ) {
      return true;
    }

    const ux = dx / length;
    const uy = dy / length;
    const reach = Math.max(COPY_REACH_RATIO * height, POSITION_TOLERANCE);
    const before = -reach;
    const past = width + reach;

    const xs = [before, past].flatMap((along) =>
      [-reach, reach].map((across) => ox + along * ux - across * uy),
    );
    const ys = [before, past].flatMap((along) =>
      [-reach, reach].map((across) => oy + along * uy + across * ux),
    );
    const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
    const [y0, y1] = [Math.min(...ys), Math.max(...ys)];

    for (let at = firstAtLeast(drawn.xs, x0); at < drawn.xs.length; at += 1) {
      const x = drawn.xs[at];
      if (x > x1) break;
      const y = drawn.ys[at];
      if (y < y0 || y > y1) continue;
      const along = (x - ox) * ux + (y - oy) * uy;
      const across = (y - oy) * ux - (x - ox) * uy;
      if (along >= before && along <= past && Math.abs(across) <= reach) return true;
    }
    return false;
  }

  type At = readonly [number, number];

  /** The one word the hidden layer holds: 10 letters, so it forms a run. */
  const HIDDEN_WORD = "Recognised";

  /**
   * One page per entry, each a full page grey scan under `HIDDEN_WORD`, drawn
   * invisible in Helvetica at 12 pt from (300, 400), turned `degrees`. An
   * entry that names a point adds one visible "x" whose origin sits there, in
   * MuPDF's page space (y down). The "x" is turned a further quarter turn, so
   * MuPDF never reads it onto the hidden word's line.
   */
  function reachPdf(degrees: number, glyphs: readonly (At | null)[]): Uint8Array {
    const place = (turn: number, [x, y]: At) => {
      const angle = (turn * Math.PI) / 180;
      const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
      // Fixed point: a PDF number is never written with an exponent.
      return [cos, sin, -sin, cos, x, y].map((value) => value.toFixed(6)).join(" ");
    };
    const pageObject = (index: number) => 5 + index * 2;
    return writePdf({
      objects: [
        "<< /Type /Catalog /Pages 2 0 R >>",
        `<< /Type /Pages /Kids [${glyphs.map((_, index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${glyphs.length} >>`,
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        stream(
          "/Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceGray /BitsPerComponent 8",
          new Uint8Array(4).fill(200),
        ),
        ...glyphs.flatMap((glyph, index) => [
          `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
            `/Resources << /Font << /F1 3 0 R >> /XObject << /Scan 4 0 R >> >> ` +
            `/Contents ${pageObject(index) + 1} 0 R >>`,
          stream(
            "",
            "q 612 0 0 792 0 0 cm /Scan Do Q\n" +
              `BT 3 Tr /F1 12 Tf ${place(degrees, [300, 400])} Tm (${HIDDEN_WORD}) Tj ET\n` +
              (glyph === null
                ? ""
                : `BT 0 Tr /F1 12 Tf ${place(degrees + 90, [glyph[0], 792 - glyph[1]])} Tm (x) Tj ET\n`),
          ),
        ]),
      ],
      trailer: "/Root 1 0 R",
    }).bytes;
  }

  /**
   * Each page of `bytes`, opened and prepared as the open does it: its
   * findings, the hidden word's line, and the origins of the glyphs it fills,
   * read with MuPDF's readers alone.
   */
  async function readReach(bytes: Uint8Array) {
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    try {
      const pdf = doc.asPDF();
      if (!pdf) throw new Error("expected a PDF document");
      prepareDocument(mupdf, pdf);
      const inspections = await inspectPages(mupdf, pdf);
      return inspections.map(({ findings }, index) => {
        const page = pdf.loadPage(index) as PDFPage;
        try {
          const characters: Character[] = [];
          walkCharacters(page, EXTRACTION_OPTIONS[0], (character) => {
            characters.push(character);
          });
          const first = characters.find(
            ({ code }) => code === HIDDEN_WORD.codePointAt(0),
          );
          const hidden = characters.filter(({ line }) => line === first?.line);
          const filled: At[] = [];
          walkDrawing(mupdf, page, (drawing) => {
            if (drawing.kind === "text" && drawing.mode === "fill")
              for (const { origin } of drawing.glyphs) filled.push(origin);
          });
          return { findings, hidden, filled };
        } finally {
          page.destroy();
        }
      });
    } finally {
      doc.destroy();
    }
  }

  /** Glyph origins as the engine keeps them for the reach: sorted by x. */
  function drawnAt(origins: readonly At[]) {
    const sorted = [...origins].sort(([a], [b]) => a - b);
    return {
      xs: Float64Array.from(sorted, ([x]) => x),
      ys: Float64Array.from(sorted, ([, y]) => y),
    };
  }

  /** Whether the frozen reach finds a copy of the hidden line among `filled`. */
  function copiedBefore(hidden: readonly Character[], filled: readonly At[]): boolean {
    const drawn = drawnAt(filled);
    return hidden.some((character) => reachBefore(character, drawn));
  }

  /** How far a character's reach goes, as both versions measure it. */
  function reachOf({ quad }: Character): number {
    return Math.max(COPY_REACH_RATIO * quadHeight(quad), POSITION_TOLERANCE);
  }

  /**
   * Spec 0010, AC-11 rewrote `withinReach`'s bounds (spec 0008, AC-15) and
   * must give the same answers as before. The bounds only narrow which drawn
   * glyphs the exact test is asked about, so a rewrite that drew them too
   * tight would miss a copy near the reach's corners and edges. Each turn puts
   * a visible glyph a quarter point inside and outside each corner and each
   * edge of the hidden line's reach, found from that line's own reading, and
   * holds the engine's findings to the frozen reach's answer on each page:
   * a copy leaves the scan bare under 11 readable characters, so `scanned`,
   * and no copy lets the word's run clear it.
   */
  it.each([0, 3, 30, 90, 135, 200, 315])(
    "finds a copy of a hidden line turned %i degrees exactly where the reach before spec 0010 did",
    async (degrees) => {
      const [base] = await readReach(reachPdf(degrees, [null]));
      const { hidden } = base;
      expect(String.fromCodePoint(...hidden.map(({ code }) => code))).toBe(HIDDEN_WORD);

      // The reach's rectangle from the line's reading: along the line from the
      // reach before the first character to the reach past the last one's
      // end, and the reach across it either side.
      const first = hidden[0];
      const last = hidden[hidden.length - 1];
      const middle = hidden[hidden.length >> 1];
      const [dx, dy] = first.direction;
      const length = Math.hypot(dx, dy);
      const [ux, uy] = [dx / length, dy / length];
      const at = ([x, y]: At, along: number, across: number): At => [
        x + along * ux - across * uy,
        y + along * uy + across * ux,
      ];

      const NEAR = 0.25;
      const sweep: { readonly glyph: At | null; readonly inside: boolean }[] = [
        { glyph: null, inside: false },
        { glyph: first.origin, inside: true },
      ];
      for (const [side, origin, edge, sideReach] of [
        [-1, first.origin, -reachOf(first), reachOf(first)],
        [1, last.origin, quadWidth(last.quad) + reachOf(last), reachOf(last)],
      ] as const) {
        const step = (inside: boolean) => edge + side * (inside ? -NEAR : NEAR);
        for (const across of [-1, 1]) {
          for (const alongInside of [true, false]) {
            for (const acrossInside of [true, false]) {
              sweep.push({
                glyph: at(
                  origin,
                  step(alongInside),
                  across * (sideReach + (acrossInside ? -NEAR : NEAR)),
                ),
                inside: alongInside && acrossInside,
              });
            }
          }
        }
        for (const inside of [true, false])
          sweep.push({ glyph: at(origin, step(inside), 0), inside });
      }
      for (const across of [-1, 1]) {
        for (const inside of [true, false]) {
          sweep.push({
            glyph: at(
              middle.origin,
              quadWidth(middle.quad) / 2,
              across * (reachOf(middle) + (inside ? -NEAR : NEAR)),
            ),
            inside,
          });
        }
      }

      const pages = await readReach(
        reachPdf(
          degrees,
          sweep.map(({ glyph }) => glyph),
        ),
      );

      // The case is what it says: the word reads as one line of its own, each
      // glyph lands where it was put, and the frozen reach answers inside or
      // outside as the sweep meant.
      const copied = pages.map(({ hidden: line, filled }, index) => {
        const { glyph } = sweep[index];
        expect(String.fromCodePoint(...line.map(({ code }) => code))).toBe(HIDDEN_WORD);
        expect(filled).toHaveLength(glyph === null ? 0 : 1);
        if (glyph !== null) {
          expect(Math.abs(filled[0][0] - glyph[0])).toBeLessThan(0.01);
          expect(Math.abs(filled[0][1] - glyph[1])).toBeLessThan(0.01);
        }
        return copiedBefore(line, filled);
      });
      expect(copied).toEqual(sweep.map(({ inside }) => inside));

      expect(pages.map(({ findings }) => findings)).toEqual(
        copied.map((copy) =>
          copy ? ["scanned", "machine-read-text"] : ["machine-read-text"],
        ),
      );
    },
  );

  /**
   * A character for the reach alone, which reads only its origin, its direction
   * and its quad's height and width. The quad stands on the origin along the
   * direction, as a glyph's does.
   */
  function reachCharacter(
    origin: At,
    direction: At,
    width: number,
    height: number,
  ): Character {
    const length = Math.hypot(...direction);
    const [ux, uy] = [direction[0] / length, direction[1] / length];
    // Up the glyph, with y running down the page.
    const [upX, upY] = [uy * height, -ux * height];
    const [ox, oy] = origin;
    const [ex, ey] = [ox + ux * width, oy + uy * width];
    return {
      code: 0x52,
      origin,
      quad: [ox + upX, oy + upY, ex + upX, ey + upY, ox, oy, ex, ey],
      angle: Math.atan2(uy, ux),
      direction,
      block: 0,
      line: 0,
    };
  }

  /**
   * Where the frozen reach puts a point `along` a character's line and `across`
   * it from its origin: the same sums in the same order, so a corner lands
   * exactly on the bounds it builds.
   */
  function reachPoint(
    { origin: [ox, oy], direction: [dx, dy] }: Character,
    along: number,
    across: number,
  ): At {
    const length = Math.hypot(dx, dy);
    const [ux, uy] = [dx / length, dy / length];
    return [ox + along * ux - across * uy, oy + along * uy + across * ux];
  }

  /**
   * The points where a bound of a character's reach decides: its four corners,
   * then the middle of each of its four edges.
   */
  function reachTies(character: Character): readonly At[] {
    const reach = reachOf(character);
    const before = -reach;
    const past = quadWidth(character.quad) + reach;
    const middle = (before + past) / 2;
    const ties: readonly At[] = [
      [before, -reach],
      [before, reach],
      [past, -reach],
      [past, reach],
      [before, 0],
      [past, 0],
      [middle, -reach],
      [middle, reach],
    ];
    return ties.map(([along, across]) => reachPoint(character, along, across));
  }

  /**
   * The double next to `value`, one step up or down, so a glyph can sit a hair
   * either side of a bound with no rounding to hide which side it is on.
   */
  function nextDouble(value: number, up: boolean): number {
    if (value === 0) return up ? Number.MIN_VALUE : -Number.MIN_VALUE;
    const bits = new BigInt64Array(Float64Array.of(value).buffer);
    // A double's size grows with its bits read as an integer, whatever its sign.
    bits[0] += value > 0 === up ? BigInt(1) : BigInt(-1);
    return new Float64Array(bits.buffer)[0];
  }

  /** A point, and its eight neighbours one double away on either axis or both. */
  function withNeighbours([x, y]: At): readonly At[] {
    const near = (value: number) => [
      nextDouble(value, false),
      value,
      nextDouble(value, true),
    ];
    return near(x).flatMap((nx) => near(y).map((ny): At => [nx, ny]));
  }

  /** A seeded generator (mulberry32), so every run asks the same cases. */
  function seeded(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let mixed = Math.imul(state ^ (state >>> 15), state | 1);
      mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
      return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
    };
  }

  /** The four ways a line runs along an axis, each a unit vector with no rounding. */
  const AXES: readonly At[] = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];

  /**
   * Random characters across a page: one in four running along an axis, one in
   * eight too small for its reach to pass `POSITION_TOLERANCE`, and one in
   * eight with no width, as a space has.
   */
  function randomCharacters(random: () => number, count: number): readonly Character[] {
    const between = (low: number, high: number) => low + random() * (high - low);
    return Array.from({ length: count }, () => {
      const angle = between(0, 2 * Math.PI);
      const direction: At =
        random() < 0.25
          ? AXES[Math.floor(random() * AXES.length)]
          : [Math.cos(angle), Math.sin(angle)];
      const height = random() < 0.125 ? between(0.001, 0.02) : between(0.5, 40);
      const width = random() < 0.125 ? 0 : between(0.1, 30);
      return reachCharacter([between(0, 612), between(0, 792)], direction, width, height);
    });
  }

  /** Both versions' answers for one character and the glyphs drawn on its page. */
  function askBoth(character: Character, glyphs: readonly At[]) {
    const drawn = drawnAt(glyphs);
    return {
      character,
      glyphs,
      now: withinReach(character, drawn),
      before: reachBefore(character, drawn),
    };
  }

  /**
   * AC-11's promise asked of `withinReach` itself, where it is sharpest: a
   * glyph exactly on each corner and edge of a character's reach, and one
   * double either side of it on each axis. A bound moved by the smallest amount
   * parts from the old one only at a tie like these. Each glyph is asked about
   * alone, so no answer hides behind another's.
   */
  it("answers as the reach before spec 0010 did for a glyph on each corner and edge of it, and a double either side", () => {
    // Along an axis, with every value a whole number, each tie is computed with
    // no rounding, so it lies exactly on the reach.
    const exact = [...AXES, [2, 0] as const].map((direction) =>
      reachCharacter([300, 400], direction, 8, 12),
    );
    // Turned, or not whole: a tie may round to either side here, and the two
    // versions must round it alike.
    const rounded = [
      ...[3, 30, 90, 135, 200, 315].map((degrees) => {
        const angle = (degrees * Math.PI) / 180;
        return reachCharacter(
          [300.3, 400.7],
          [Math.cos(angle), Math.sin(angle)],
          7.3,
          11.9,
        );
      }),
      reachCharacter([300.3, 400.7], [3, 4], 7.3, 11.9),
      reachCharacter([300.3, 400.7], [0.6, 0.8], 0, 11.9),
      // So small its reach is `POSITION_TOLERANCE`.
      reachCharacter([300.3, 400.7], [1, 0], 7.3, 0.015),
      ...randomCharacters(seeded(1), 200),
    ];

    const answers = [...exact, ...rounded].flatMap((character) =>
      reachTies(character)
        .flatMap(withNeighbours)
        .map((glyph) => askBoth(character, [glyph])),
    );
    expect(answers.filter(({ now, before }) => now !== before)).toEqual([]);

    // The ties really are ties: on an exact character a glyph on a bound is
    // within reach and one a double past it is not, so four of the nine at
    // each corner answer yes, and six of the nine at each edge.
    expect(
      exact.map((character) =>
        reachTies(character).map(
          (tie) =>
            withNeighbours(tie).filter((glyph) => askBoth(character, [glyph]).before)
              .length,
        ),
      ),
    ).toEqual(exact.map(() => [4, 4, 4, 4, 6, 6, 6, 6]));
  });

  /**
   * A character whose height, width, origin or direction cannot be measured
   * answers yes, so its line is a drawn copy and fails safe (spec 0008, AC-15).
   * The only glyph is far away, so only that guard can answer yes.
   */
  it("answers yes, as the reach before spec 0010 did, for a character it cannot measure", () => {
    const far: readonly At[] = [[10, 10]];
    const sound = reachCharacter([300, 400], [1, 0], 8, 12);
    expect(askBoth(sound, far)).toMatchObject({ now: false, before: false });

    const unmeasured: readonly Character[] = [
      reachCharacter([300, 400], [1, 0], 8, Number.NaN),
      reachCharacter([300, 400], [1, 0], Number.POSITIVE_INFINITY, 12),
      { ...sound, origin: [Number.NaN, 400] },
      { ...sound, origin: [300, Number.NEGATIVE_INFINITY] },
      { ...sound, direction: [0, 0] },
      { ...sound, direction: [Number.NaN, 1] },
      { ...sound, direction: [Number.POSITIVE_INFINITY, 0] },
    ];
    expect(
      unmeasured.map((character) => {
        const { now, before } = askBoth(character, far);
        return [now, before];
      }),
    ).toEqual(unmeasured.map(() => [true, true]));
  });

  /**
   * AC-11's promise over random characters and random glyphs around each
   * one's reach, some sharing an x as a column of glyphs does. Each glyph is
   * asked about alone; then the glyphs outside the reach together, alone and
   * with each glyph inside it added in turn, so the walk along the sorted list,
   * where it starts and where it stops, is held too.
   */
  it("answers as the reach before spec 0010 did for random characters and glyph lists", () => {
    const random = seeded(2);
    const between = (low: number, high: number) => low + random() * (high - low);

    const answers = randomCharacters(random, 400).flatMap((character) => {
      const reach = reachOf(character);
      const past = quadWidth(character.quad) + reach;
      const scattered = Array.from({ length: 20 }, () =>
        reachPoint(
          character,
          between(-2 * reach, past + reach),
          between(-2 * reach, 2 * reach),
        ),
      );
      const column = scattered
        .slice(0, 4)
        .map(([x, y]): At => [x, y + between(-2 * reach, 2 * reach)]);
      const glyphs = [...scattered, ...column];

      const alone = glyphs.map((glyph) => askBoth(character, [glyph]));
      const outside = glyphs.filter((_, index) => !alone[index].before);
      const inside = glyphs.filter((_, index) => alone[index].before);
      return [
        ...alone,
        askBoth(character, outside),
        ...inside.map((glyph) => askBoth(character, [...outside, glyph])),
      ];
    });
    expect(answers.filter(({ now, before }) => now !== before)).toEqual([]);

    // Both answers are common, so the comparison is not empty.
    const yes = answers.filter(({ before }) => before).length;
    expect(yes).toBeGreaterThan(answers.length / 5);
    expect(answers.length - yes).toBeGreaterThan(answers.length / 5);
  });
});

/** Slice 2: AC-25. The crooked scan line, from the real engine's readings and blocks. */
describe("the crooked scan line", () => {
  it("shows for a slanted match on a machine read page, and not for one on a typed page", async () => {
    const doc = await openDocumentWith(mupdf, fixture("read-crooked.pdf"), LIMITS);
    try {
      expect(doc.summary.pages).toEqual([
        { findings: ["machine-read-text"] },
        { findings: [] },
      ]);
      const found = await doc.findMatches({ contextChars: 40 });
      expect(found.map(({ page, text, blocked }) => ({ page, text, blocked }))).toEqual([
        { page: 0, text: CROOKED_EMAILS.scanned, blocked: "slanted-text" },
        { page: 1, text: CROOKED_EMAILS.typed, blocked: "slanted-text" },
      ]);

      // The review rows the worker would send, pages one based.
      const rows = found.map(({ page, blocked }) => ({ page: page + 1, blocked }));
      expect(showsCrookedLine(doc.summary, rows)).toBe(true);
      expect(showsCrookedLine(doc.summary, rows.slice(1))).toBe(false);
    } finally {
      doc.close();
    }
  });
});

/**
 * Slice 3: AC-6, AC-7 and AC-13. Text a viewer never shows: under a cover
 * drawn after it, or drawn so a viewer does not show it, and the near misses
 * beside each rule.
 */
describe("text a viewer never shows", () => {
  it("reads every page of read-covered.pdf as the fixture says", async () => {
    const inspections = await inspect("read-covered.pdf");

    expect(
      inspections.map(({ findings }, index) => ({
        name: READ_COVERED[index].name,
        findings,
      })),
    ).toEqual(READ_COVERED.map(({ name, findings }) => ({ name, findings })));
  });

  it("reads every page of read-hidden.pdf as the fixture says", async () => {
    const inspections = await inspect("read-hidden.pdf");

    READ_HIDDEN.forEach(({ name, findings }, index) => {
      if (findings === null) {
        // Outside the visible area: the trim's business, never a warning.
        expect(inspections[index].findings, name).not.toContain("hidden-text");
      } else {
        expect({ name, findings: inspections[index].findings }).toEqual({
          name,
          findings,
        });
      }
    });
  });

  it("keeps the concealed glyphs' origins with the page, and no other detail", async () => {
    const [covered] = await inspect("read-covered.pdf");
    expect(covered.concealed.length).toBeGreaterThan(0);
    for (const glyph of covered.concealed) {
      expect(Object.keys(glyph).sort()).toEqual(["kind", "origin"]);
      expect(glyph.kind).toBe("covered");
    }
  });

  it("marks the matches under a box as covered, and the white one as hidden", async () => {
    const covered = await find("read-covered.pdf");
    expect(
      covered.map(({ page, text, concealed }) => ({ page, text, concealed })),
    ).toEqual([
      { page: 0, text: CONCEALED.coveredEmail, concealed: "covered" },
      { page: 1, text: CONCEALED.coveredPhone, concealed: "covered" },
    ]);

    const hidden = await find("read-hidden.pdf");
    expect(
      hidden.map(({ page, text, concealed }) => ({ page, text, concealed })),
    ).toEqual([{ page: 0, text: CONCEALED.hiddenEmail, concealed: "hidden" }]);
  });

  it("reads the browser sample as two covered pages and a hidden one, each value marked", async () => {
    expect((await inspect("read-concealed.pdf")).map(({ findings }) => findings)).toEqual(
      [["covered-text"], ["covered-text"], ["hidden-text"]],
    );
    expect(
      (await find("read-concealed.pdf")).map(({ page, text, concealed }) => ({
        page,
        text,
        concealed,
      })),
    ).toEqual([
      { page: 0, text: CONCEALED.coveredEmail, concealed: "covered" },
      { page: 1, text: CONCEALED.coveredPhone, concealed: "covered" },
      { page: 2, text: CONCEALED.hiddenEmail, concealed: "hidden" },
    ]);
  });

  it("leaves a match in plain sight unmarked", async () => {
    for (const match of await find("detect-email.pdf")) {
      expect(match.concealed).toBeNull();
    }
  });

  /**
   * AC-13: a concealed match is listed and tickable like any other. Ticked, it
   * is removed, and the run's self check passes on the output.
   */
  it("redacts a covered and a hidden match, and the run passes its self check", async () => {
    for (const [name, value] of [
      ["read-covered.pdf", CONCEALED.coveredEmail],
      ["read-hidden.pdf", CONCEALED.hiddenEmail],
    ] as const) {
      const found = await find(name);
      const match = found.find(({ text }) => text === value);
      if (!match?.target) throw new Error(`expected a tickable match for ${value}`);
      expect(match.blocked).toBeNull();

      const { output } = await redactDocumentWith(mupdf, fixture(name), [match.target]);
      expect(documentText(output)).not.toContain(value);
    }
  });

  /**
   * AC-9. A glyph from the drawing reader and a character from extraction meet
   * by origin: every glyph filled, stroked or invisible on these pages that is
   * not whitespace meets one within `POSITION_TOLERANCE`, bar those whose
   * origin lies outside the visible area or outside the bounds of the clip in
   * force. On the pages a clip hides an address on, those it bars meet none:
   * the ordinary read drops a glyph a clip hides wholly, which is why AC-7's
   * clipped away rule exists.
   */
  it("finds an extracted character at the origin of every glyph it can judge (pin)", () => {
    const cases: readonly (readonly [string, number, boolean])[] = [
      ["text-page.pdf", 0, false],
      ["carlito.pdf", 0, false],
      ["detect-email.pdf", 1, false],
      ["ocr-aligned.pdf", 0, false],
      ["read-covered.pdf", 0, false],
      ["read-hidden.pdf", 0, false],
      ["read-hidden.pdf", 1, false],
      ["read-hidden.pdf", 4, false],
      ["read-hidden.pdf", 11, true],
      ["read-hidden.pdf", 12, true],
      ["read-hidden.pdf", 13, true],
      ["read-hidden.pdf", 14, false],
      ["read-hidden.pdf", 15, false],
    ];
    for (const [name, index, clippedAway] of cases) {
      const { judged, barred, origins } = onPage(name, index, (page) => {
        const [vx0, vy0, vx1, vy1] = page.getBounds();
        const inside = ([x, y]: readonly [number, number], [x0, y0, x1, y1]: Rect) =>
          x >= x0 && x <= x1 && y >= y0 && y <= y1;
        const kept: [number, number][] = [];
        const dropped: [number, number][] = [];
        walkDrawing(mupdf, page, (drawing, state) => {
          if (drawing.kind !== "text" || drawing.mode === "clip") return;
          for (const { origin, unicode } of drawing.glyphs) {
            if (/\s/u.test(String.fromCodePoint(unicode))) continue;
            const seen =
              inside(origin, [vx0, vy0, vx1, vy1]) &&
              (state.clip === null || inside(origin, state.clip));
            (seen ? kept : dropped).push([...origin]);
          }
        });
        const extracted: [number, number][] = [];
        walkCharacters(page, EXTRACTION_OPTIONS[0], ({ origin }) =>
          extracted.push([...origin]),
        );
        return { judged: kept, barred: dropped, origins: extracted };
      });
      const meets = ([x, y]: readonly [number, number]) =>
        origins.some(
          ([ox, oy]) =>
            Math.abs(ox - x) <= POSITION_TOLERANCE &&
            Math.abs(oy - y) <= POSITION_TOLERANCE,
        );

      expect(judged.length, name).toBeGreaterThan(0);
      for (const origin of judged) {
        expect(
          meets(origin),
          `${name} ${index}: a glyph at ${origin} met no character`,
        ).toBe(true);
      }
      if (clippedAway) {
        expect(barred.length, `${name} ${index}`).toBeGreaterThan(0);
        for (const origin of barred) {
          expect(meets(origin), `${name} ${index}: a glyph at ${origin} was read`).toBe(
            false,
          );
        }
      }
    }
  });

  /**
   * AC-7's recorded limit: text a clip hides wholly is named, never listed,
   * and a run leaves it where it was, since detection reads what the page
   * shows and the engine never edits a content stream itself.
   */
  it("names an address a clip hides wholly, lists no row for it, and leaves it in the output", async () => {
    const found = await find("read-hidden.pdf");
    for (const value of [CONCEALED.clippedEmail, CONCEALED.boxedEmail]) {
      expect(found.map(({ text }) => text)).not.toContain(value);
    }

    const { output } = await redactDocumentWith(mupdf, fixture("read-hidden.pdf"), []);
    expect(unclippedText(output, 11)).toContain(CONCEALED.clippedEmail);
    expect(unclippedText(output, 12)).toContain(CONCEALED.boxedEmail);
  });

  /**
   * AC-9's other pin: a glyph whose character map gives it two code points is
   * reported as two walker calls at the same origin, the second with no
   * glyph of its own. Built here, because it is one line of one font.
   */
  it("reports a glyph mapped to two code points as two calls at one origin (pin)", () => {
    const toUnicode =
      "/CIDInit /ProcSet findresource begin 12 dict begin begincmap " +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def " +
      "/CMapName /Ligature def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange " +
      "1 beginbfchar <41> <00660069> endbfchar endcmap " +
      "CMapName currentdict /CMap defineresource pop end end";
    const bytes = writePdf({
      objects: [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
          "/Resources << /Font << /L 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>",
        stream("", "BT /L 12 Tf 72 700 Td (A) Tj ET\n"),
        stream("", toUnicode),
      ],
      trailer: "/Root 1 0 R",
    }).bytes;

    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    try {
      const page = doc.loadPage(0) as PDFPage;
      try {
        const glyphs: { origin: readonly [number, number]; unicode: number }[] = [];
        walkDrawing(mupdf, page, (drawing) => {
          if (drawing.kind === "text") glyphs.push(...drawing.glyphs);
        });
        expect(glyphs.map(({ unicode }) => String.fromCodePoint(unicode))).toEqual([
          "f",
          "i",
        ]);
        expect(glyphs[1].origin).toEqual(glyphs[0].origin);
      } finally {
        page.destroy();
      }
    } finally {
      doc.destroy();
    }
  });
});

/**
 * AC-11: text drawn under a clip that holds no area. MuPDF's `sanitize` write
 * drops it, so every run on such a file would fail its self check on text
 * nobody ticked; the open refuses it instead, after the `no-readable-text`
 * check.
 */
describe("text under a clip that holds no area", () => {
  const names = EMPTY_CLIPS.map((_clip, index) => `read-empty-clip-${index}.pdf`);

  /** Every clip path's bounds as MuPDF gives them, and the glyphs drawn under the last. */
  function clipsAndGlyphs(name: string): { clips: number[][]; glyphsUnder: number } {
    return onPage(name, 0, (page) => {
      const clips: number[][] = [];
      let depth = 0;
      let glyphsUnder = 0;
      const device = new mupdf.Device({
        clipPath(path, _evenOdd, ctm) {
          clips.push([...path.getBounds(null as never, ctm)]);
          depth += 1;
          path.destroy();
        },
        popClip() {
          depth -= 1;
        },
        fillText(text) {
          if (depth > 0) text.walk({ showGlyph: () => void (glyphsUnder += 1) });
          text.destroy();
        },
      });
      try {
        page.run(device, mupdf.Matrix.identity);
        device.close();
      } finally {
        device.destroy();
      }
      return { clips, glyphsUnder };
    });
  }

  /** The address, read unclipped, after the file is saved with `options`. */
  function survivesSave(name: string, options: string): boolean {
    const doc = mupdf.Document.openDocument(fixture(name), "application/pdf");
    try {
      const pdf = doc.asPDF();
      if (!pdf) throw new Error("expected a PDF document");
      const saved = pdf.saveToBuffer(options);
      try {
        const copy = saved.asUint8Array().slice().buffer as ArrayBuffer;
        return unclippedText(copy, 0).includes(EMPTY_CLIP_EMAIL);
      } finally {
        saved.destroy();
      }
    } finally {
      doc.destroy();
    }
  }

  /**
   * The four cases, pinned on MuPDF.js 1.28.1: the bounds MuPDF gives each
   * clip, the glyphs the drawing pass reports under it, and the address kept
   * by a plain save and dropped by the engine's write. The refusal covers
   * exactly the cases that are both reported and dropped, which is all four.
   */
  it("reports each glyph under the clip, and loses it only in the engine's write (pin)", () => {
    const [zeroArea, zeroWidth, apart, emptyPath] = names.map(clipsAndGlyphs);
    expect(zeroArea.clips).toEqual([[0, 792, 0, 792]]);
    expect(zeroWidth.clips).toEqual([[72, 72, 72, 102]]);
    expect(apart.clips).toEqual([
      [72, 72, 172, 102],
      [300, 72, 400, 102],
    ]);
    // MuPDF's empty rect: inverted, about 2^31 out.
    expect(emptyPath.clips).toHaveLength(1);
    const [[x0, y0, x1, y1]] = emptyPath.clips;
    expect(x0 > x1 && y0 > y1).toBe(true);
    expect(Math.min(Math.abs(x0), Math.abs(x1))).toBeGreaterThan(1e9);

    for (const [at, name] of names.entries()) {
      expect([zeroArea, zeroWidth, apart, emptyPath][at].glyphsUnder, name).toBe(
        `Write to ${EMPTY_CLIP_EMAIL}`.length,
      );
      expect(survivesSave(name, ""), name).toBe(true);
      expect(survivesSave(name, WRITE_OPTIONS), name).toBe(false);
    }
  });

  it("marks the page, and no page of the other fixtures", async () => {
    for (const name of names) {
      expect(
        (await inspect(name)).map(({ emptyClip }) => emptyClip),
        name,
      ).toEqual([true]);
    }
    for (const name of [
      "read-pages.pdf",
      "read-hidden.pdf",
      "read-covered.pdf",
      "trim-ocr.pdf",
    ]) {
      for (const page of await inspect(name)) expect(page.emptyClip, name).toBe(false);
    }
  });

  it("refuses each at open with unsupported", async () => {
    for (const name of names) {
      await expect(openDocumentWith(mupdf, fixture(name), LIMITS), name).rejects.toEqual(
        new EngineFailure("unsupported"),
      );
    }
  });

  it("refuses a scan with nothing readable as no-readable-text, not unsupported", async () => {
    const [page] = await inspect("read-empty-clip-scan.pdf");
    expect(page.emptyClip).toBe(true);
    await expect(
      openDocumentWith(mupdf, fixture("read-empty-clip-scan.pdf"), LIMITS),
    ).rejects.toEqual(new EngineFailure("no-readable-text"));
  });
});
