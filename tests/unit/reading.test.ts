import type { PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  EngineFailure,
  EXTRACTION_OPTIONS,
  inspectPages,
  openDocumentWith,
  POSITION_TOLERANCE,
  prepareDocument,
  redactDocumentWith,
  readsAsNothing,
  RunCancelled,
  silenceEngineLog,
  walkCharacters,
  walkDrawing,
  type Drawing,
  type PageInspection,
} from "@/engine";

import { showsCrookedLine } from "@/lib/page-findings";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import {
  CONCEALED,
  CROOKED_EMAILS,
  MIXED_EMAIL,
  READ_PAGES,
  READ_COVERED,
  READ_HIDDEN,
  READ_PICTURES,
  STAMP_EMAIL,
} from "../../scripts/lib/reading-fixtures.mjs";
import { fixture } from "../support/bytes";
import { documentText, LIMITS, mupdf } from "../support/mupdf";

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
async function inspect(name: string): Promise<readonly PageInspection[]> {
  const doc = mupdf.Document.openDocument(fixture(name), "application/pdf");
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

  it("carries closed findings, a flag and concealed glyphs, and only the findings reach the summary (INV-1)", async () => {
    for (const inspection of await inspect("read-pages.pdf")) {
      expect(Object.keys(inspection).sort()).toEqual([
        "concealed",
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
   * by origin: every glyph filled, stroked or invisible on these pages meets
   * one within `POSITION_TOLERANCE`, bar those wholly outside the visible area
   * or wholly clipped away, which extraction drops.
   */
  it("finds an extracted character at the origin of every glyph it can judge (pin)", () => {
    const cases: readonly (readonly [string, number])[] = [
      ["text-page.pdf", 0],
      ["carlito.pdf", 0],
      ["detect-email.pdf", 1],
      ["ocr-aligned.pdf", 0],
      ["read-covered.pdf", 0],
      ["read-hidden.pdf", 0],
      ["read-hidden.pdf", 1],
    ];
    for (const [name, index] of cases) {
      const { glyphs, origins } = onPage(name, index, (page) => {
        const drawn: [number, number][] = [];
        walkDrawing(mupdf, page, (drawing) => {
          if (drawing.kind === "text" && drawing.mode !== "clip") {
            for (const glyph of drawing.glyphs) {
              if (glyph.unicode !== 0x20) drawn.push([...glyph.origin]);
            }
          }
        });
        const extracted: [number, number][] = [];
        walkCharacters(page, EXTRACTION_OPTIONS[0], ({ origin }) =>
          extracted.push([...origin]),
        );
        return { glyphs: drawn, origins: extracted };
      });

      expect(glyphs.length, name).toBeGreaterThan(0);
      for (const [x, y] of glyphs) {
        const met = origins.some(
          ([ox, oy]) =>
            Math.abs(ox - x) <= POSITION_TOLERANCE &&
            Math.abs(oy - y) <= POSITION_TOLERANCE,
        );
        expect(met, `${name}: a glyph at ${x}, ${y} met no character`).toBe(true);
      }
    }
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
