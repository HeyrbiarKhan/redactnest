import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  glyphRuleOf,
  judgeGlyphs,
  openDocumentWith,
  redactDocumentWith,
  silenceEngineLog,
  walkRoles,
} from "@/engine";

import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { LIMITS, mupdf } from "../support/mupdf";

/**
 * The glyph rule. Spec 0020, AC-1 to AC-4, INV-1 to INV-5.
 *
 * Every document here is built in the test, object by object, and none is
 * committed. Objects 1 to 8 are the catalog, the page tree, the page, its
 * contents, Helvetica, a Type 3 font and its two glyphs: `ga` fills a square
 * and is drawn, `gb` holds each case's drawing and is drawn by no text
 * (INV-1: drawn or not plays no part). Each case's own objects start at 9.
 * The page always draws a Helvetica line, so the open reads it and goes on to
 * the glyph rule.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

type Body = string | ReturnType<typeof stream> | null;

const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
const READABLE =
  "BT /F1 12 Tf 72 700 Td (A line anybody can read) Tj ET BT /T3 24 Tf 72 300 Td (a) Tj ET";
const FORM = "/Type /XObject /Subtype /Form /BBox [0 0 100 100]";
const PICTURE =
  "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8";
const STENCIL =
  "/Type /XObject /Subtype /Image /Width 8 /Height 1 /ImageMask true /BitsPerComponent 1";
const TILING =
  "/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] " +
  "/XStep 10 /YStep 10 /Resources << >>";
const SHADING =
  "<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [0 0 1 1] " +
  "/Function << /FunctionType 2 /Domain [0 1] /C0 [0 0 0] /C1 [1 1 1] /N 1 >> >>";

/** A Type 3 font with glyphs `ga` and `gb` at objects `a` and `b`, and `rest` in its dictionary. */
function type3(a: number, b: number, rest = ""): string {
  return (
    "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] " +
    `/FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /ga ${a} 0 R /gb ${b} 0 R >> ` +
    "/Encoding << /Type /Encoding /Differences [97 /ga /gb] >> " +
    `/FirstChar 97 /LastChar 98 /Widths [1000 1000]${rest} >>`
  );
}

interface Case {
  /** More entries in the page's `/Font`, beside `/F1 5 0 R /T3 6 0 R`. */
  readonly fonts?: string;
  /** More entries on the page's resources, beside its `/Font`. */
  readonly page?: string;
  /** More drawing on the page, after the Helvetica and Type 3 lines. */
  readonly draws?: string;
  /** The Type 3 font's own `/Resources` entries, or `null` for no `/Resources` key. */
  readonly font?: string | null;
  /** Glyph `gb`'s drawing, after `1000 0 d0`. */
  readonly glyph?: string;
  /** Glyph `gb`'s whole stream, when it must not start with `d0`. */
  readonly glyphStream?: string;
  /** The page's `/Contents`, when it is not object 4 alone. */
  readonly contents?: string;
  /** More page keys. */
  readonly pageKeys?: string;
  /** Objects from 9. */
  readonly rest?: readonly Body[];
}

/** One case's objects. */
function objectsOf(spec: Case): Body[] {
  const font = spec.font === undefined ? "" : spec.font;
  return [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      `/Resources << /Font << /F1 5 0 R /T3 6 0 R ${spec.fonts ?? ""}>> ${spec.page ?? ""} >> ` +
      `/Contents ${spec.contents ?? "4 0 R"} ${spec.pageKeys ?? ""}>>`,
    stream("", `${READABLE} ${spec.draws ?? ""}`),
    HELVETICA,
    type3(7, 8, font === null ? "" : ` /Resources << ${font} >>`),
    stream("", "1000 0 0 0 1000 1000 d1 0 0 1000 1000 re f"),
    stream("", spec.glyphStream ?? `1000 0 d0 ${spec.glyph ?? ""}`),
    ...(spec.rest ?? []),
  ];
}

function bytesOf(objects: readonly Body[]): ArrayBuffer {
  const { bytes } = writePdf({ objects: [...objects], trailer: "/Root 1 0 R" });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function withDoc<T>(objects: readonly Body[], read: (doc: PDFDocument) => T): T {
  const doc = mupdf.Document.openDocument(bytesOf(objects), "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF");
    return read(pdf);
  } finally {
    doc.destroy();
  }
}

/** The rule's answer on a case, through the run's seam: a walk from the pages. */
function verdictOf(spec: Case): string {
  return withDoc(objectsOf(spec), glyphRuleOf);
}

/** The kind an open refuses with, or `null` if it opened. */
async function openKind(objects: readonly Body[]): Promise<string | null> {
  try {
    const doc = await openDocumentWith(mupdf, bytesOf(objects), LIMITS);
    doc.close();
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

describe("a drawing both sides reach (AC-1, AC-3 b)", () => {
  it("refuses a glyph naming the form the page draws, and passes one only the font holds", () => {
    const form = stream(FORM, "0 0 1 1 re f");
    expect(
      verdictOf({
        page: "/XObject << /Fm 9 0 R >>",
        draws: "/Fm Do",
        font: "/XObject << /Fm 9 0 R >>",
        glyph: "/Fm Do",
        rest: [form],
      }),
    ).toBe("shared");
    expect(
      verdictOf({ font: "/XObject << /Fm 9 0 R >>", glyph: "/Fm Do", rest: [form] }),
    ).toBe("clean");
  });

  it("refuses a glyph only picture whose /SMask is the picture the page draws", () => {
    expect(
      verdictOf({
        page: "/XObject << /Im 10 0 R >>",
        draws: "/Im Do",
        font: "/XObject << /P 9 0 R >>",
        glyph: "/P Do",
        rest: [stream(`${PICTURE} /SMask 10 0 R`, "\x80"), stream(PICTURE, "\x40")],
      }),
    ).toBe("shared");
  });

  it("refuses a glyph only picture whose /Mask is the stencil the page draws", () => {
    expect(
      verdictOf({
        page: "/XObject << /St 10 0 R >>",
        draws: "/St Do",
        font: "/XObject << /P 9 0 R >>",
        glyph: "/P Do",
        rest: [stream(`${PICTURE} /Mask 10 0 R`, "\x80"), stream(STENCIL, "\x00")],
      }),
    ).toBe("shared");
  });

  it("follows a mask chain: a glyph only picture whose /SMask's /SMask the page draws", () => {
    const chain = (pageDraws: boolean) =>
      verdictOf({
        page: pageDraws ? "/XObject << /Im 11 0 R >>" : "",
        draws: pageDraws ? "/Im Do" : "",
        font: "/XObject << /P 9 0 R >>",
        glyph: "/P Do",
        rest: [
          stream(`${PICTURE} /SMask 10 0 R`, "\x80"),
          stream(`${PICTURE} /SMask 11 0 R`, "\x80"),
          stream(PICTURE, "\x40"),
        ],
      });
    expect(chain(true)).toBe("shared");
    expect(chain(false)).toBe("clean");
  });

  it("refuses a glyph filling with the tiling pattern the page fills with", () => {
    expect(
      verdictOf({
        page: "/Pattern << /P1 9 0 R >>",
        draws: "/Pattern cs /P1 scn 0 0 10 10 re f",
        font: "/Pattern << /P1 9 0 R >>",
        glyph: "/Pattern cs /P1 scn 0 0 10 10 re f",
        rest: [stream(TILING, "0 0 5 5 re f")],
      }),
    ).toBe("shared");
  });

  it("refuses a shading pattern written in place whose soft mask group is the page's form", () => {
    expect(
      verdictOf({
        page: "/XObject << /Fm 9 0 R >>",
        draws: "/Fm Do",
        font:
          `/Pattern << /P2 << /PatternType 2 /Shading ${SHADING} ` +
          "/ExtGState << /SMask << /S /Luminosity /G 9 0 R >> >> >> >>",
        glyph: "/Pattern cs /P2 scn 0 0 10 10 re f",
        rest: [stream(FORM, "0 0 1 1 re f")],
      }),
    ).toBe("shared");
  });

  it("refuses a graphics state whose soft mask group is the page's form", () => {
    expect(
      verdictOf({
        page: "/XObject << /Fm 9 0 R >>",
        draws: "/Fm Do",
        font: "/ExtGState << /GS1 << /SMask << /S /Luminosity /G 9 0 R >> >> >>",
        glyph: "/GS1 gs 0 0 1 1 re f",
        rest: [stream(FORM, "0 0 1 1 re f")],
      }),
    ).toBe("shared");
  });

  it("refuses a glyph naming a page's figure from a font with no resources of its own, drawn or only listed", () => {
    const form = stream(FORM, "0 0 1 1 re f");
    for (const draws of ["/Fm Do", ""]) {
      expect(
        verdictOf({
          page: "/XObject << /Fm 9 0 R >>",
          draws,
          font: null,
          glyph: "/Fm Do",
          rest: [form],
        }),
        draws,
      ).toBe("shared");
    }
  });

  it("reads a form with no resources of its own in each font's dictionary it is named from", () => {
    // Form 9 draws `/Im`: a glyph only picture under font 6, picture 12 under
    // font 11. Read in one dictionary only, it could miss the page's picture.
    const twoFonts = (pageDraws: boolean) =>
      verdictOf({
        fonts: "/T4 11 0 R ",
        page: pageDraws ? "/XObject << /Pg 12 0 R >>" : "",
        draws: pageDraws ? "/Pg Do" : "",
        font: "/XObject << /X 9 0 R /Im 10 0 R >>",
        glyph: "/X Do",
        rest: [
          stream(FORM, "/Im Do"),
          stream(PICTURE, ""),
          type3(13, 14, " /Resources << /XObject << /X 9 0 R /Im 12 0 R >> >>"),
          stream(PICTURE, "@"),
          stream("", "1000 0 d0 /X Do"),
          stream("", "1000 0 d0 /X Do"),
        ],
      });
    expect(twoFonts(true)).toBe("shared");
    expect(twoFonts(false)).toBe("clean");
  });

  it("refuses a glyph procedure that is also one part of a page's /Contents", () => {
    expect(verdictOf({ contents: "[4 0 R 8 0 R]", glyphStream: "0 0 1 1 re f" })).toBe(
      "shared",
    );
  });
});

describe("what never counts as shared (AC-1, AC-3, INV-4)", () => {
  it("passes a glyph only picture byte for byte the same as the page's, since sharing is by object", () => {
    expect(
      verdictOf({
        page: "/XObject << /Im 10 0 R >>",
        draws: "/Im Do",
        font: "/XObject << /P 9 0 R >>",
        glyph: "/P Do",
        rest: [stream(PICTURE, "\x80"), stream(PICTURE, "\x80")],
      }),
    ).toBe("clean");
  });

  it("passes an entry the font lists that no glyph names", () => {
    expect(
      verdictOf({
        page: "/XObject << /Fm 9 0 R >>",
        draws: "/Fm Do",
        font: "/XObject << /Fm 9 0 R >>",
        glyph: "0 0 1 1 re f",
        rest: [stream(FORM, "0 0 1 1 re f")],
      }),
    ).toBe("clean");
  });

  it("passes a name with no entry, and a category the dictionary lacks, without a throw", () => {
    expect(
      verdictOf({
        page: "/XObject << /Fm 9 0 R >>",
        draws: "/Fm Do",
        font: "/XObject << /Fm 9 0 R >>",
        glyph: "/Nope Do",
        rest: [stream(FORM, "0 0 1 1 re f")],
      }),
    ).toBe("clean");
    expect(verdictOf({ font: "", glyph: "/Nope Do /GS9 gs /Pattern cs /P9 scn" })).toBe(
      "clean",
    );
    expect(verdictOf({ font: null, glyph: "/Nope Do /GS9 gs /Pattern cs /P9 scn" })).toBe(
      "clean",
    );
  });

  it("passes two Type 3 fonts sharing a form no page reaches", () => {
    const objects = objectsOf({
      fonts: "/T4 10 0 R ",
      font: "/XObject << /X 9 0 R >>",
      glyph: "/X Do",
      rest: [
        stream(FORM, "0 0 1 1 re f"),
        type3(11, 12, " /Resources << /XObject << /X 9 0 R >> >>"),
        stream("", "1000 0 d0 /X Do"),
        stream("", "1000 0 d0 /X Do"),
      ],
    });
    withDoc(objects, (doc) => {
      expect(walkRoles(doc, "read", "pages").glyphs).toHaveLength(2);
      expect(glyphRuleOf(doc)).toBe("clean");
    });
  });

  it("passes a graphics state the page lists and uses too", () => {
    expect(
      verdictOf({
        page: "/ExtGState << /G3 9 0 R >>",
        draws: "/G3 gs",
        font: "/ExtGState << /G3 9 0 R >>",
        glyph: "/G3 gs 0 0 1 1 re f",
        rest: ["<< /ca 1 >>"],
      }),
    ).toBe("clean");
  });

  it("ends a cycle of forms each drawing the other", () => {
    expect(
      verdictOf({
        font: "/XObject << /A 9 0 R >>",
        glyph: "/A Do",
        rest: [
          stream(`${FORM} /Resources << /XObject << /B 10 0 R >> >>`, "/B Do"),
          stream(`${FORM} /Resources << /XObject << /A 9 0 R >> >>`, "/A Do"),
        ],
      }),
    ).toBe("clean");
  });
});

describe("text below a glyph (AC-3 a)", () => {
  it("refuses text shown through a font set by Tf, by a graphics state's /Font, or by none", () => {
    expect(
      verdictOf({ font: "/Font << /F9 5 0 R >>", glyph: "BT /F9 1 Tf (x) Tj ET" }),
    ).toBe("text");
    expect(
      verdictOf({
        font: "/ExtGState << /GS1 << /Font [5 0 R 1] >> >>",
        glyph: "BT /GS1 gs (x) Tj ET",
      }),
    ).toBe("text");
    expect(verdictOf({ font: "", glyph: "BT (x) Tj ET" })).toBe("text");
  });

  it("refuses text in a form a glyph draws", () => {
    expect(
      verdictOf({
        font: "/XObject << /Fm 9 0 R >>",
        glyph: "/Fm Do",
        rest: [
          stream(
            `${FORM} /Resources << /Font << /F1 5 0 R >> >>`,
            "BT /F1 1 Tf (x) Tj ET",
          ),
        ],
      }),
    ).toBe("text");
  });

  it("names text first when a glyph both shows text and shares a drawing", () => {
    expect(
      verdictOf({
        page: "/XObject << /Fm 9 0 R >>",
        draws: "/Fm Do",
        font: "/XObject << /Fm 9 0 R >>",
        glyph: "/Fm Do",
        rest: [
          stream(
            `${FORM} /Resources << /Font << /F1 5 0 R >> >>`,
            "BT /F1 1 Tf (x) Tj ET",
          ),
        ],
      }),
    ).toBe("text");
  });
});

describe("a glyph side drawing the scan cannot read (AC-4)", () => {
  const unreadable = (font: string, rest: Body[] = [], page = "", draws = "") => ({
    page,
    draws,
    font,
    glyph: "( never closed",
    rest,
  });

  it("takes it to show text only when its dictionary holds /Font or a graphics state holding /Font", () => {
    expect(verdictOf(unreadable(""))).toBe("clean");
    expect(verdictOf(unreadable("/Font << /F9 5 0 R >>"))).toBe("text");
    expect(verdictOf(unreadable("/ExtGState << /GS1 << /Font [5 0 R 1] >> >>"))).toBe(
      "text",
    );
    expect(verdictOf(unreadable("/ExtGState << /GS1 << /ca 1 >> >>"))).toBe("clean");
  });

  it("takes it to name every entry of its dictionary", () => {
    expect(
      verdictOf(
        unreadable(
          "/XObject << /Fm 9 0 R >>",
          [stream(FORM, "0 0 1 1 re f")],
          "/XObject << /Fm 9 0 R >>",
          "/Fm Do",
        ),
      ),
    ).toBe("shared");
  });

  it("judges each form it adds on that form's own read", () => {
    expect(
      verdictOf(
        unreadable("/XObject << /Fm 9 0 R >>", [
          stream(`${FORM} /Resources << /Font << /F1 5 0 R >> >>`, "0 0 1 1 re f"),
        ]),
      ),
    ).toBe("clean");
    expect(
      verdictOf(
        unreadable("/XObject << /Fm 9 0 R >>", [
          stream(
            `${FORM} /Resources << /Font << /F1 5 0 R >> >>`,
            "BT /F1 1 Tf (x) Tj ET",
          ),
        ]),
      ),
    ).toBe("text");
  });
});

/** AC-5, AC-9: the built documents the spec names, through the open and a run. */
describe("built documents at open and in a run", () => {
  it("opens an undrawn glyph the scan cannot read in a font whose resources hold no font, with the warning it gives today", async () => {
    const objects = objectsOf({ font: "/XObject << >>", glyph: "( never closed" });
    const doc = await openDocumentWith(mupdf, bytesOf(objects), LIMITS);
    try {
      expect(doc.summary.pages[0].findings).toContain("marked-descriptions");
    } finally {
      doc.close();
    }
  });

  it("refuses the same glyph when its font's resources hold /F9", async () => {
    const objects = objectsOf({ font: "/Font << /F9 5 0 R >>", glyph: "( never closed" });
    await expect(openKind(objects)).resolves.toBe("unreadable-structure");
  });

  it("refuses at open and in a run a glyph procedure that is also part of a page's /Contents", async () => {
    const objects = objectsOf({ contents: "[4 0 R 8 0 R]", glyphStream: "0 0 1 1 re f" });
    await expect(openKind(objects)).resolves.toBe("unreadable-structure");
    await expect(
      redactDocumentWith(mupdf, bytesOf(objects), []).then(
        () => null,
        (failure: unknown) =>
          failure instanceof EngineFailure ? failure.errorKind : failure,
      ),
    ).resolves.toBe("unreadable-structure");
  });

  /**
   * Before the bake the appearance hangs off `/Annots`, which the walk never
   * follows, so the glyph alone names it. The open's bake makes it the page's
   * own XObject, the same object, so the open refuses (spec 0020, *Annotations
   * after the bake*).
   */
  it("refuses a glyph naming a visible annotation's normal appearance, once the bake draws it", async () => {
    const objects = objectsOf({
      pageKeys: "/Annots [9 0 R] ",
      font: "/XObject << /Ap 10 0 R >>",
      glyph: "/Ap Do",
      rest: [
        "<< /Type /Annot /Subtype /Square /Rect [100 100 200 200] /F 4 /AP << /N 10 0 R >> >>",
        stream(FORM, "0 0 1 RG 1 1 98 98 re S"),
      ],
    });
    expect(withDoc(objects, glyphRuleOf)).toBe("clean");
    await expect(openKind(objects)).resolves.toBe("unreadable-structure");
  });
});

describe("judgeGlyphs on a walk", () => {
  it("answers clean on a file with no Type 3 font, reading nothing", () => {
    const objects = objectsOf({}).map((body, index) =>
      index === 2 && typeof body === "string" ? body.replace(" /T3 6 0 R", "") : body,
    );
    withDoc(objects, (doc) => {
      const walk = walkRoles(doc, "read");
      expect(walk.glyphs).toEqual([]);
      expect(judgeGlyphs(walk)).toBe("clean");
    });
  });

  it("answers problem through the seam when the walk names one", () => {
    expect(verdictOf({ font: "/XObject 5" })).toBe("problem");
  });
});
