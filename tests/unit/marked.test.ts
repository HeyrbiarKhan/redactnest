import { readdirSync } from "node:fs";

import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  INLINE_END_RETRIES,
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

/** Spec 0021, AC-2: the real tag shape, matched against the whole string. */
describe("LANG_TAG", () => {
  it.each([
    "en",
    "deu",
    "EN-gb",
    "en-GB",
    "en_US",
    "es-419",
    "zh-Hant-TW",
    "sr-Latn-RS-1994",
    "de-DE-1996",
  ])("reads %s as a language tag", (tag) => expect(LANG_TAG.test(tag)).toBe(true));

  it.each([
    "Amy-Jones",
    "Bob_Smith",
    "Jane Smith",
    "english",
    "e",
    "12",
    "en-",
    "en--GB",
    "en-GB ",
    "en-toolongsubtag",
    "x-none",
    "sl-rozaj",
  ])("does not read %j as one", (text) => expect(LANG_TAG.test(text)).toBe(false));

  /**
   * The limit the pattern's comment names: a short name that fits the shape
   * still reads as a tag. Pinned, so a change to it is deliberate.
   */
  it.each(["Doe", "Amy-Rose", "Ann-Li"])(
    "still reads the short name %s as a tag",
    (name) => expect(LANG_TAG.test(name)).toBe(true),
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
    expect(describes("/Span << /Lang (sr-Latn-RS-1994) >> BDC BT (x) Tj ET EMC")).toBe(
      false,
    );
    expect(describes("/Span << /Lang (Jane Smith) >> BDC BT (x) Tj ET EMC")).toBe(true);
  });

  /** Spec 0021, AC-2: a hyphenated name is warned about, as any other name is. */
  it("counts a /Lang holding a hyphenated name", () => {
    expect(describes("/Span << /Lang (Amy-Jones) >> BDC BT (x) Tj ET EMC")).toBe(true);
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

  /**
   * Spec 0021, AC-7: the format allows a named resource inside an inline
   * image's colour space only at an indexed space's base, so that name, and
   * nothing else inside an array, is a use.
   */
  it.each([
    ["[/I /Cs1 1 <FF000000FF00>]", ["Cs1"]],
    ["[/Indexed /Cs1 1 <FF000000FF00>]", ["Cs1"]],
    ["[/I /G 1 <00FF>]", []],
    ["[/I /RGB 1 <FF000000FF00>]", []],
    ["[/Indexed /DeviceRGB 1 <FF000000FF00>]", []],
    ["[/CalRGB << /WhitePoint [0.95 1 1.09] >>]", []],
  ])("reads an inline /CS %s as naming %j", (space, names) => {
    expect(namesOf(`BI /W 1 /H 1 /CS ${space} /BPC 8 ID x EI`, "ColorSpace")).toEqual(
      names,
    );
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

  /**
   * Spec 0021, AC-6: at most `INLINE_END_RETRIES` new ends per stream. Each
   * false end resumes on a stray `)` and fails; the real one resumes on `Q`
   * and reads. Sixteen false ends take sixteen retries, seventeen one too many.
   */
  it.each([
    [16, "reads to its end"],
    [17, "unsure"],
  ] as const)("with %i false ends, %s", (falseEnds, answer) => {
    const text = `BI /W 1 /H 1 /BPC 8 /CS /G ID x${" EI )".repeat(falseEnds)} EI Q`;
    const result = scanContent(bytes(text), null);

    expect(result === "unsure" ? "unsure" : "reads to its end").toBe(answer);
  });

  it("allows 16 retries, an engine constant", () => {
    expect(INLINE_END_RETRIES).toBe(16);
  });

  /** One count per call, shared by every inline image the stream holds. */
  it.each([
    [8, "reads to its end"],
    [9, "unsure"],
  ] as const)(
    "with %i false ends in the first of two images and 8 in the second, %s",
    (first, answer) => {
      const image = (data: string, falseEnds: number) =>
        `BI /W 1 /H 1 /BPC 8 /CS /G ID ${data}${" EI )".repeat(falseEnds)} EI Q `;
      const result = scanContent(bytes(image("a", first) + image("b", 8)), null);

      expect(result === "unsure" ? "unsure" : "reads to its end").toBe(answer);
    },
  );
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

/**
 * Spec 0022, AC-1: an inline picture MuPDF 1.28.1's write would lose or
 * change, judged by the rule its loader and writer follow. Each case is one
 * picture whose dictionary holds `dict` beside its size and depth.
 */
describe("an inline picture MuPDF's write would lose (spec 0022)", () => {
  const PALETTE = "<FF0000 00FF00 0000FF FFFF00>";
  const TINT = "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [1 0 0 0] /N 1 >>";
  const picture = (dict: string) => `BI /W 1 /H 1 /BPC 8 ${dict} ID x EI`;
  const loses = (dict: string) => read(picture(dict)).losesPicture;
  const spacesOf = (dict: string) => [...read(picture(dict)).inlineSpaces].sort();

  it.each([
    ["an indexed space over a short device base", `/CS [/I /RGB 3 ${PALETTE}]`],
    [
      "an indexed space over a full device base",
      `/CS [/Indexed /DeviceRGB 3 ${PALETTE}]`,
    ],
    ["an indexed space over a named resource", "/CS [/I /Cs1 1 <FF000000FF00>]"],
    ["an inline CalRGB space", "/CS [/CalRGB << /WhitePoint [0.9505 1 1.089] >>]"],
    ["an inline Lab space", "/CS [/Lab << /WhitePoint [0.9505 1 1.089] >>]"],
    ["an inline Separation space", `/CS [/Separation /Spot /DeviceCMYK ${TINT}]`],
    ["an inline DeviceN space", `/CS [/DeviceN [/Cyan] /DeviceCMYK ${TINT}]`],
    ["a resource name under /ColorSpace", "/ColorSpace /Cs1"],
    ["a number under /ColorSpace", "/ColorSpace 3"],
    ["a string under /ColorSpace", "/ColorSpace (DeviceRGB)"],
    ["a dictionary under /ColorSpace", "/ColorSpace << >>"],
    [
      "/Pattern under /ColorSpace, which the scan does not look up",
      "/ColorSpace /Pattern",
    ],
    [
      "a device /CS beside an indexed /ColorSpace",
      `/CS /RGB /ColorSpace [/I /RGB 3 ${PALETTE}]`,
    ],
    ["/CS and /ColorSpace naming different resources", "/CS /Cs1 /ColorSpace /Cs2"],
    ["no colour space, not a mask", ""],
    ["an inline JPX picture", "/CS /RGB /Filter /JPXDecode"],
    ["a JPX filter in an /F array", "/CS /RGB /F [/AHx /JPXDecode]"],
    ["a mask with a JPX filter", "/IM true /Filter /JPXDecode"],
    ["the empty name MuPDF writes for a lost one", "/CS/"],
    [
      "/ImageMask false beside /IM true, with no colour space",
      "/ImageMask false /IM true",
    ],
  ])("counts %s as lost", (_label, dict) => {
    expect(loses(dict)).toBe(true);
  });

  it.each([
    ["a mask", "/IM true"],
    ["a mask under the long key", "/ImageMask true"],
    ["/IM true beside an indexed array", `/IM true /CS [/I /RGB 3 ${PALETTE}]`],
    ["a short device name", "/CS /G"],
    ["a full device name", "/CS /DeviceCMYK"],
    ["a resource name under /CS alone", "/CS /Cs1"],
    ["/CS and /ColorSpace naming the same resource", "/CS /Cs1 /ColorSpace /Cs1"],
    ["[/DeviceRGB] under /CS", "/CS [/DeviceRGB]"],
    ["[/RGB] under /CS", "/CS [/RGB]"],
    ["[/DeviceRGB 7] under /CS", "/CS [/DeviceRGB 7]"],
    ["[/CalCMYK << >>] under /CS", "/CS [/CalCMYK << >>]"],
    ["[/RGB] under /ColorSpace", "/ColorSpace [/RGB]"],
    ["[/CalCMYK << >>] under /ColorSpace", "/ColorSpace [/CalCMYK << >>]"],
    ["a device name under /ColorSpace", "/ColorSpace /DeviceRGB"],
    [
      "a device /ColorSpace beside an indexed /CS",
      `/ColorSpace /DeviceRGB /CS [/I /RGB 3 ${PALETTE}]`,
    ],
    ["a device /ColorSpace beside a resource /CS", "/ColorSpace /G /CS /Cs1"],
  ])("keeps %s", (_label, dict) => {
    expect(loses(dict)).toBe(false);
  });

  it("holds the name /CS writes directly, whatever /ColorSpace says", () => {
    expect(spacesOf("/CS /Cs1")).toEqual(["Cs1"]);
    expect(spacesOf("/CS /Cs1 /ColorSpace /Cs2")).toEqual(["Cs1"]);
  });

  it("holds no device name, no empty name and nothing written inside an array", () => {
    expect(spacesOf("/CS /RGB")).toEqual([]);
    expect(spacesOf("/CS/")).toEqual([]);
    expect(spacesOf("/CS [/I /Cs1 1 <FF000000FF00>]")).toEqual([]);
    expect(spacesOf("/ColorSpace /Cs1")).toEqual([]);
  });

  it("joins every picture a drawing holds", () => {
    const result = read(
      `${picture("/CS /Cs1")} ${picture("/CS /G")} ${picture("/CS /Cs2")} ${picture("/CS [/I /RGB 0 <000000>]")}`,
    );
    expect(result.losesPicture).toBe(true);
    expect([...result.inlineSpaces].sort()).toEqual(["Cs1", "Cs2"]);
  });

  it("reads the keyword true as a scalar outside a picture's dictionary", () => {
    expect(read("/Span << /Open true >> BDC EMC true pop").describes).toBe(false);
  });

  /**
   * A false `EI` in the first picture's data. The bytes after it read as a
   * second, lost picture's dictionary, whose data holds no end, so the scan
   * goes back to the first picture and settles on its real end, written inside
   * the second dictionary's comment. The second picture was never there.
   */
  it("forgets a lost picture read from another picture's data once the scan settles on a later end", () => {
    const result = read(
      "BI /W 4 /H 1 /CS /G /BPC 8 ID a EI BI /CS [/I /RGB 0 <000000>] /W 1 % EI\n/BPC 8 ID z Q",
    );
    expect(result.losesPicture).toBe(false);
    expect([...result.inlineSpaces]).toEqual([]);
  });

  it("ORs a lost picture and joins the names across glyph procedures read apart", () => {
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>",
      stream("", `1000 0 d0 ${picture("/CS /Cs1")}`),
      stream("", `1000 0 d0 ${picture("/CS [/I /RGB 0 <000000>]")}`),
    ];
    withDoc(objects, (doc) => {
      const kept = readDrawing([doc.newIndirect(4)], null, false);
      const both = readDrawing([doc.newIndirect(4), doc.newIndirect(5)], null, false);
      expect(kept).toMatchObject({ losesPicture: false });
      expect(both).toMatchObject({ losesPicture: true });
      if (both === "unsure") throw new Error("expected a reading");
      expect([...both.inlineSpaces]).toEqual(["Cs1"]);
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
