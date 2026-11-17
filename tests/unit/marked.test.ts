import { readdirSync } from "node:fs";

import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  LANG_TAG,
  openDocumentWith,
  readDrawing,
  redactDocumentWith,
  scanContent,
  silenceEngineLog,
  type DrawingRead,
} from "@/engine";

import { MARKED_TEXT } from "../../scripts/lib/kept-fixtures.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { fixture } from "../support/bytes";
import {
  containsInAnyEncoding,
  decompressedBytes,
  LIMITS,
  mupdf,
} from "../support/mupdf";
import { findTarget } from "../support/targets";

/**
 * The read only scan of drawing instructions. Spec 0019, AC-9, *Scan rules*
 * and INV-4.
 *
 * Most probes scan bytes directly; the ones that need a document (a property
 * list named in `/Properties`, a form's own stream, a page's contents in two
 * parts) are built in the test with the fixture script's serialiser.
 */

const bytes = (text: string): Uint8Array =>
  Uint8Array.from(text, (char) => char.charCodeAt(0));

/** Scan `text`, which must read to its end. */
function read(text: string): DrawingRead {
  const result = scanContent(bytes(text), null);
  if (result === "unsure") throw new Error("expected the scan to read to its end");
  return result;
}

const describes = (text: string): boolean => read(text).describes;
const namesOf = (text: string, category: Parameters<DrawingRead["names"]["get"]>[0]) =>
  [...(read(text).names.get(category) ?? [])].sort();

describe("LANG_TAG", () => {
  it.each(["en", "deu", "en-GB", "en_US", "zh-Hant-TW", "sr-Latn-RS-1994"])(
    "reads %s as a language tag",
    (tag) => expect(LANG_TAG.test(tag)).toBe(true),
  );

  it.each(["e", "english", "Jane Smith", "en-", "en--GB", "en-toolongsubtag", "12"])(
    "does not read %s as one",
    (text) => expect(LANG_TAG.test(text)).toBe(false),
  );
});

describe("which property lists count (AC-9)", () => {
  it("counts an inline /Alt and /E around a line", () => {
    expect(
      describes("/Span << /Alt (Jane Smith) /E (JS) >> BDC BT (Jane Smith) Tj ET EMC"),
    ).toBe(true);
  });

  it("counts any string nested inside an inline list", () => {
    expect(describes("/Span << /Private << /Note [(kept)] >> >> BDC EMC")).toBe(true);
  });

  it("does not count /ActualText around text the character check reads", () => {
    expect(describes("/Span << /ActualText (Shown) >> BDC BT (x) Tj ET EMC")).toBe(false);
    expect(
      describes("/Span << /ActualText (Shown) >> BDC BT [(x) 10 (y)] TJ ET EMC"),
    ).toBe(false);
    expect(describes("/Span << /ActualText (Shown) >> BDC BT (x) ' ET EMC")).toBe(false);
    expect(describes('/Span << /ActualText (Shown) >> BDC BT 1 2 (x) " ET EMC')).toBe(
      false,
    );
  });

  it("counts /ActualText around only a filled shape", () => {
    expect(describes("/Span << /ActualText (A figure) >> BDC 0 0 10 10 re f EMC")).toBe(
      true,
    );
  });

  it("counts /ActualText around no text when the sequence is never closed", () => {
    expect(describes("/Span << /ActualText (A figure) >> BDC 0 0 10 10 re f")).toBe(true);
  });

  it("counts an outer /ActualText as drawn when text runs in a nested sequence", () => {
    expect(
      describes(
        "/Span << /ActualText (Outer) >> BDC /P << /MCID 1 >> BDC BT (x) Tj ET EMC EMC",
      ),
    ).toBe(false);
  });

  it("does not count a list holding only /MCID", () => {
    expect(describes("/P << /MCID 0 >> BDC BT (x) Tj ET EMC")).toBe(false);
  });

  it("does not count a /Lang that reads as a language tag, and counts one that does not", () => {
    expect(describes("/Span << /Lang (en-GB) >> BDC BT (x) Tj ET EMC")).toBe(false);
    expect(describes("/Span << /Lang (en_US) >> BDC BT (x) Tj ET EMC")).toBe(false);
    expect(describes("/Span << /Lang (Jane Smith) >> BDC BT (x) Tj ET EMC")).toBe(true);
  });

  it("does not count an artifact holding only names", () => {
    expect(
      describes(
        "/Artifact << /Type /Pagination /Subtype /Header >> BDC BT (1) Tj ET EMC",
      ),
    ).toBe(false);
    expect(describes("/Artifact BMC BT (1) Tj ET EMC")).toBe(false);
  });

  it("counts a string on a DP point, /ActualText included, since a point is never a sequence", () => {
    expect(describes("/Note << /Private (secret) >> DP")).toBe(true);
    expect(describes("/Note << /ActualText (x) >> DP BT (x) Tj ET")).toBe(true);
    expect(describes("/Note << /MCID 3 >> DP")).toBe(false);
  });

  it("reads a hex string and a UTF-16 string before testing a language tag", () => {
    expect(describes("/Span << /Lang <656E2D4742> >> BDC EMC")).toBe(false);
    expect(describes("/Span << /Lang <FEFF0065006E002D00470042> >> BDC EMC")).toBe(false);
    expect(describes("/Span << /Lang <FEFF004A0061006E0065> >> BDC EMC")).toBe(true);
    expect(describes("/Span << /Lang <FEFF00650065> >> BDC EMC")).toBe(false);
    expect(describes("/Span << /Lang <FEFF0065006> >> BDC EMC")).toBe(true);
  });

  it("never reads drawing instructions held inside a string", () => {
    expect(describes("BT ( /X << /Alt (y) >> BDC ) Tj ET")).toBe(false);
  });
});

describe("the resource names a drawing uses", () => {
  it("reads each operator's name, a #xx escape decoded first", () => {
    const text =
      "/GS1 gs /Sh1 sh /CS1 cs /DeviceRGB CS /Pattern cs /P1 scn 1 0 0 /P2 SCN " +
      "BT /F#31 12 Tf ET /Fm1 Do /Span /MC#30 BDC EMC";
    expect(namesOf(text, "ExtGState")).toEqual(["GS1"]);
    expect(namesOf(text, "Shading")).toEqual(["Sh1"]);
    expect(namesOf(text, "ColorSpace")).toEqual(["CS1"]);
    expect(namesOf(text, "Pattern")).toEqual(["P1", "P2"]);
    expect(namesOf(text, "Font")).toEqual(["F1"]);
    expect(namesOf(text, "XObject")).toEqual(["Fm1"]);
    expect(namesOf(text, "Properties")).toEqual(["MC0"]);
  });

  it("never counts a lone marked content tag as a property list name", () => {
    expect(namesOf("/Span BDC EMC /Tag MP", "Properties")).toEqual([]);
  });

  it("reads an inline image's colour space name, never a device space", () => {
    expect(namesOf("BI /W 1 /H 1 /CS /CS0 /BPC 8 ID x EI", "ColorSpace")).toEqual([
      "CS0",
    ]);
    expect(
      namesOf("BI /W 1 /H 1 /ColorSpace /DeviceRGB /BPC 8 ID xyz EI", "ColorSpace"),
    ).toEqual([]);
    expect(namesOf("BI /W 1 /H 1 /CS /G /BPC 8 ID x EI", "ColorSpace")).toEqual([]);
  });
});

describe("inline images", () => {
  it("tries the next EI when the rest cannot be read from the first", () => {
    const result = read(
      "q BI /W 4 /H 1 /CS /G /BPC 8 ID a EI )b EI\nBT /F1 12 Tf (x) Tj ET Q",
    );
    expect([...(result.names.get("Font") ?? [])]).toEqual(["F1"]);
  });

  it("takes the first EI when the rest reads from it", () => {
    const result = read("BI /W 1 /H 1 /CS /G /BPC 8 ID z EI /F2 9 Tf");
    expect([...(result.names.get("Font") ?? [])]).toEqual(["F2"]);
  });

  it("reads an image whose data is empty", () => {
    expect(read("BI /W 0 /H 0 ID EI /F3 9 Tf").names.get("Font")).toEqual(
      new Set(["F3"]),
    );
  });

  it("is unsure of an image with no workable EI", () => {
    expect(scanContent(bytes("BI /W 1 /H 1 /CS /G /BPC 8 ID xyz"), null)).toBe("unsure");
    expect(scanContent(bytes("BI /W 1 /H 1 /CS /G /BPC 8 ID x EIx"), null)).toBe(
      "unsure",
    );
  });

  it("is unsure of an image whose dictionary never reaches ID", () => {
    expect(scanContent(bytes("BI /W 1 /H 1 Tj"), null)).toBe("unsure");
  });
});

/**
 * Spec 0020, AC-3: whether a drawing shows text, which the glyph rule reads.
 * Only an operator counts, by the lexer's own rules, so the same bytes inside
 * a string, an inline image's data or a comment never do.
 */
describe("whether a drawing shows text (spec 0020)", () => {
  it.each([
    ["Tj", "BT /F1 12 Tf (x) Tj ET"],
    ["TJ", "BT /F1 12 Tf [(x) 10 (y)] TJ ET"],
    ["'", "BT /F1 12 Tf (x) ' ET"],
    ['"', 'BT /F1 12 Tf 1 2 (x) " ET'],
  ])("reads %s as showing text", (_operator, text) => {
    expect(read(text).showsText).toBe(true);
  });

  it("reads a drawing of paths, forms and a font change alone as showing none", () => {
    expect(read("0 0 10 10 re f /Fm0 Do BT /F1 12 Tf ET").showsText).toBe(false);
  });

  it("never reads the operators held inside a string", () => {
    expect(read("/Span << /Alt (Tj TJ ' \") >> BDC EMC").showsText).toBe(false);
  });

  it("never reads an operator in an inline image's data", () => {
    expect(read("BI /W 3 /H 1 /CS /G /BPC 8 ID Tj EI").showsText).toBe(false);
  });

  it("never reads an operator in a comment", () => {
    expect(read("% BT (x) Tj ET\n0 0 1 1 re f").showsText).toBe(false);
  });

  it("forgets an operator read past a false EI once the scan tries the next one", () => {
    const result = read("BI /W 4 /H 1 /CS /G /BPC 8 ID a EI Tj ) EI Q");
    expect(result.showsText).toBe(false);
  });

  it("keeps an operator read after the EI the scan settles on", () => {
    expect(read("BI /W 1 /H 1 /CS /G /BPC 8 ID z EI BT (x) Tj ET").showsText).toBe(true);
  });

  it("shows text when any one glyph procedure does, read alone or joined", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
      stream("", "1000 0 d0 0 0 1000 1000 re f"),
      stream("", "1000 0 d0 BT /F9 1 Tf (x) Tj ET"),
    ];
    withDoc(objects, (doc) => {
      const square = [doc.newIndirect(4)];
      const both = [doc.newIndirect(4), doc.newIndirect(5)];
      expect(readDrawing(square, null, false)).toMatchObject({ showsText: false });
      expect(readDrawing(both, null, false)).toMatchObject({ showsText: true });
      expect(readDrawing(both, null, true)).toMatchObject({ showsText: true });
    });
  });
});

describe("what makes the scan unsure", () => {
  it.each([
    ["an unbalanced string", "BT (abc Tj ET"],
    ["an unbalanced array", "BT [(a) 10 (b) TJ ET"],
    ["an unbalanced dictionary", "/Span << /Alt (x) BDC EMC"],
    ["a stray closing bracket", "BT (a) Tj ] ET"],
    ["a stray closing parenthesis", "BT a) Tj ET"],
    ["a stray closing angle bracket", "BT > ET"],
    ["a dictionary closed as an array", "/Span << /A 1 ] BDC"],
  ])("is unsure of %s", (_label, text) => {
    expect(scanContent(bytes(text), null)).toBe("unsure");
  });

  it("reads balanced and escaped parentheses inside a string", () => {
    expect(read("BT (a (b) c) Tj (d \\) e) Tj ET").describes).toBe(false);
  });

  it("skips comments, even one holding a stray delimiter", () => {
    expect(read("% a comment with ) and ]\nBT (x) Tj ET").describes).toBe(false);
  });
});

/** Objects 1 to 4 are the catalog, the page tree, the page and its contents. */
function withDoc<T>(
  objects: (string | ReturnType<typeof stream>)[],
  open: (doc: PDFDocument) => T,
): T {
  const { bytes: file } = writePdf({ objects, trailer: "/Root 1 0 R" });
  const doc = mupdf.Document.openDocument(file, "application/pdf");
  try {
    return open(doc.asPDF() as PDFDocument);
  } finally {
    doc.destroy();
  }
}

describe("drawings read from a document", () => {
  const page = (resources: string, contents: string) =>
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents ${contents} >>`;

  it("reads a property list named in the owning /Properties, as the prune cuts it", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      page("<< /Properties << /P1 5 0 R /P2 6 0 R >> >>", "4 0 R"),
      stream("", "/Span /P1 BDC 0 0 10 10 re f EMC /Span /P2 BDC 0 0 10 10 re f EMC"),
      "<< /ActualText (A figure) >>",
      "<< /Alt (Removed by the prune) /MCID 2 >>",
    ];
    withDoc(objects, (doc) => {
      const properties = doc.findPage(0).get("Resources", "Properties");
      const contents = [doc.newIndirect(4)];
      expect(readDrawing(contents, properties)).toMatchObject({ describes: true });

      const onlyAlt = [stream("", "/Span /P2 BDC 0 0 10 10 re f EMC")];
      withDoc([...objects.slice(0, 3), ...onlyAlt, ...objects.slice(4)], (other) => {
        const listed = other.findPage(0).get("Resources", "Properties");
        expect(readDrawing([other.newIndirect(4)], listed)).toMatchObject({
          describes: false,
        });
      });
    });
  });

  it("does not count a named /ActualText around text", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      page("<< /Properties << /P1 5 0 R >> >>", "4 0 R"),
      stream("", "/Span /P1 BDC BT (x) Tj ET EMC"),
      "<< /ActualText (Shown) >>",
    ];
    withDoc(objects, (doc) => {
      const properties = doc.findPage(0).get("Resources", "Properties");
      expect(readDrawing([doc.newIndirect(4)], properties)).toMatchObject({
        describes: false,
      });
    });
  });

  it("reads a form's own stream", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      page("<< /XObject << /Fm1 5 0 R >> >>", "4 0 R"),
      stream("", "/Fm1 Do"),
      stream(
        "/Type /XObject /Subtype /Form /BBox [0 0 10 10]",
        "/Span << /E (x) >> BDC EMC",
      ),
    ];
    withDoc(objects, (doc) => {
      expect(readDrawing([doc.newIndirect(5)], null)).toMatchObject({ describes: true });
      expect(readDrawing([doc.newIndirect(4)], null)).toMatchObject({ describes: false });
    });
  });

  it("reads a page's contents in two parts as one, and glyph procedures each alone", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      page("<< >>", "[4 0 R 5 0 R]"),
      stream("", "/Span << /ActualText (Split) >> BDC"),
      stream("", "BT (x) Tj ET EMC"),
    ];
    withDoc(objects, (doc) => {
      const parts = [doc.newIndirect(4), doc.newIndirect(5)];
      expect(readDrawing(parts, null, true)).toMatchObject({ describes: false });
      expect(readDrawing(parts, null, false)).toMatchObject({ describes: true });
    });
  });

  /**
   * MuPDF 1.28.1 never throws reading a stream: a filter it does not know
   * hands back the stored bytes, and damaged compressed data hands back what
   * it could decode. The scan reads exactly that, as MuPDF draws it.
   */
  it("reads the bytes MuPDF decodes, a filter MuPDF does not know included", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      page("<< >>", "4 0 R"),
      stream("/Filter /NoSuchFilter", "/Span << /E (x) >> BDC EMC"),
      stream("/Filter /FlateDecode", "/Span << /E (x) >> BDC EMC"),
    ];
    withDoc(objects, (doc) => {
      expect(readDrawing([doc.newIndirect(4)], null)).toMatchObject({ describes: true });
      expect(readDrawing([doc.newIndirect(5)], null)).toMatchObject({ describes: false });
    });
  });
});

/** The pages (from 1) the open names with `marked-descriptions`, or `null` if it refused. */
async function warnedPages(bytes: ArrayBuffer): Promise<number[] | null> {
  let doc;
  try {
    doc = await openDocumentWith(mupdf, bytes, LIMITS);
  } catch (failure) {
    if (failure instanceof EngineFailure) return null;
    throw failure;
  }
  try {
    return doc.summary.pages.flatMap(({ findings }, index) =>
      findings.includes("marked-descriptions") ? [index + 1] : [],
    );
  } finally {
    doc.close();
  }
}

/**
 * AC-9, through the open: the scan reads every drawing the role walk names on
 * a page, its contents and every form, tiling pattern and Type 3 glyph
 * procedure it draws, with the owning `/Properties`, inherited resources
 * included. `marked-descriptions.pdf` holds a form; these hold the rest. Each
 * page also draws a line of Helvetica, so it is readable and the open goes on.
 */
describe("at open, from every drawing the walk names", () => {
  beforeAll(() => {
    silenceEngineLog(mupdf);
  });

  const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const LINE = "BT /F1 12 Tf 72 700 Td (A line anybody can read) Tj ET";
  const TILE =
    "/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] /XStep 10 /YStep 10";
  const TYPE3 =
    "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] /FontMatrix [0.001 0 0 0.001 0 0] " +
    "/CharProcs << /a 7 0 R >> /Encoding << /Type /Encoding /Differences [97 /a] >> " +
    "/FirstChar 97 /LastChar 97 /Widths [1000] >>";

  /** One page: `resources` on it, `contents` after the readable line, `rest` from object 5. */
  function onePage(
    resources: string,
    contents: string,
    rest: (string | ReturnType<typeof stream>)[],
  ): ArrayBuffer {
    const { bytes: file } = writePdf({
      objects: [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources ${resources} /Contents 4 0 R >>`,
        stream("", `${LINE}\n${contents}`),
        ...rest,
      ],
      trailer: "/Root 1 0 R",
    });
    return file.slice().buffer;
  }

  const tiling = (drawing: string) =>
    onePage(
      "<< /Font << /F1 5 0 R >> /Pattern << /P1 6 0 R >> >>",
      "/Pattern cs /P1 scn 72 500 100 100 re f",
      [HELVETICA, stream(TILE, drawing)],
    );

  const glyph = (drawing: string) =>
    onePage("<< /Font << /F1 5 0 R /T3 6 0 R >> >>", "BT /T3 12 Tf 72 600 Td (a) Tj ET", [
      HELVETICA,
      TYPE3,
      stream("", `1000 0 0 0 1000 1000 d1 ${drawing}`),
    ]);

  it("warns about a description inside a tiling pattern the page fills with", async () => {
    await expect(
      warnedPages(tiling("/Span << /Alt (A tile's description) >> BDC 0 0 5 5 re f EMC")),
    ).resolves.toEqual([1]);
    await expect(warnedPages(tiling("0 0 5 5 re f"))).resolves.toEqual([]);
  });

  it("warns about a description inside a Type 3 glyph procedure", async () => {
    await expect(
      warnedPages(
        glyph("/Span << /Alt (A glyph's description) >> BDC 0 0 1000 1000 re f EMC"),
      ),
    ).resolves.toEqual([1]);
    await expect(warnedPages(glyph("0 0 1000 1000 re f"))).resolves.toEqual([]);
  });

  it("reads a named property list through resources the page inherits from its tree", async () => {
    const inherited = (properties: string) => {
      const { bytes: file } = writePdf({
        objects: [
          "<< /Type /Catalog /Pages 2 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] " +
            `/Resources << /Font << /F1 5 0 R >> /Properties << /P1 6 0 R >> >> >>`,
          "<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>",
          stream("", `${LINE}\n/Figure /P1 BDC 72 500 100 100 re f EMC`),
          HELVETICA,
          properties,
        ],
        trailer: "/Root 1 0 R",
      });
      return file.slice().buffer;
    };

    await expect(
      warnedPages(inherited("<< /ActualText (Words no text shows) >>")),
    ).resolves.toEqual([1]);
    await expect(warnedPages(inherited("<< /MCID 0 >>"))).resolves.toEqual([]);
  });

  it("warns about a page whose contents the scan cannot read to its end, and still opens it", async () => {
    await expect(
      warnedPages(onePage("<< /Font << /F1 5 0 R >> >>", "q ] Q", [HELVETICA])),
    ).resolves.toEqual([1]);
  });
});

/** AC-9 and AC-10: the limit, pinned on its own fixture. */
describe("marked-descriptions.pdf", () => {
  beforeAll(() => {
    silenceEngineLog(mupdf);
  });

  it("warns on exactly the pages whose descriptions can stay", async () => {
    await expect(warnedPages(fixture("marked-descriptions.pdf"))).resolves.toEqual([
      1, 2, 4, 5, 8, 9,
    ]);
  });

  /**
   * MuPDF's `sanitize` keeps both, so RedactNest warns rather than removes. A
   * MuPDF upgrade that changes either fails here, and the warning is revisited
   * (spec 0019, *Follow-up*).
   */
  it("keeps the /Alt around a ticked value, and the /ActualText around a shape", async () => {
    const bytes = fixture("marked-descriptions.pdf");
    const ticked = await redactDocumentWith(mupdf, bytes, [
      findTarget(bytes, 0, MARKED_TEXT.value),
    ]);
    const tickedBytes = decompressedBytes(ticked.output);
    expect(containsInAnyEncoding(tickedBytes, MARKED_TEXT.value)).toBe(false);
    expect(containsInAnyEncoding(tickedBytes, MARKED_TEXT.alt)).toBe(true);

    const { output } = await redactDocumentWith(mupdf, bytes, []);
    expect(containsInAnyEncoding(decompressedBytes(output), MARKED_TEXT.shape)).toBe(
      true,
    );
  });

  it("is the only committed fixture that warns", async () => {
    const names = readdirSync(new URL("../fixtures/", import.meta.url)).filter(
      (name) => name.endsWith(".pdf") && name !== "marked-descriptions.pdf",
    );
    expect(names.length).toBeGreaterThan(90);
    for (const name of names) {
      const pages = await warnedPages(fixture(name));
      expect(pages ?? [], name).toEqual([]);
    }
  }, 120_000);
});
