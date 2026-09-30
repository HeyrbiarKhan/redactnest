import type { PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  EngineFailure,
  EXTRACTION_OPTIONS,
  inspectPages,
  MACHINE_READ_RUN,
  openDocumentWith,
  POSITION_TOLERANCE,
  prepareDocument,
  redactDocumentWith,
  readsAsNothing,
  RunCancelled,
  silenceEngineLog,
  STAMP_MAX_CHARS,
  walkCharacters,
  walkDrawing,
  WRITE_OPTIONS,
  type Drawing,
  type PageInspection,
  type Rect,
} from "@/engine";

import { isPartly, showsCrookedLine } from "@/lib/page-findings";
import { outputFormFor, outputNameFor } from "@/lib/session";
import { countPagesByFinding } from "@/worker/protocol";

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
  /** The index of the `read-pictures.pdf` page `READ_PICTURES` names. */
  function picture(name: string): number {
    const index = READ_PICTURES.findIndex((page) => page.name === name);
    if (index < 0) throw new Error(`no page named ${name}`);
    return index;
  }

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
