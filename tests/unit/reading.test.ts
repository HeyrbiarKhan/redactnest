import type { PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  EngineFailure,
  EXTRACTION_OPTIONS,
  inspectPages,
  openDocumentWith,
  prepareDocument,
  readsAsNothing,
  RunCancelled,
  silenceEngineLog,
  walkCharacters,
  walkDrawing,
  type Drawing,
  type PageInspection,
} from "@/engine";

import {
  MIXED_EMAIL,
  READ_PAGES,
  STAMP_EMAIL,
} from "../../scripts/lib/reading-fixtures.mjs";
import { fixture } from "../support/bytes";
import { LIMITS, mupdf } from "../support/mupdf";

/**
 * Reading every page before review, driven with the real MuPDF in Node. Spec
 * 0006, slice 1.
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

  it("carries nothing but closed findings and a flag (INV-1)", async () => {
    for (const inspection of await inspect("read-pages.pdf")) {
      expect(Object.keys(inspection).sort()).toEqual(["findings", "readable"]);
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
