import { readdirSync } from "node:fs";

import type { PDFDocument, PDFObject } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  drawnShape,
  EngineFailure,
  openDocumentWith,
  PIPELINE,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  structureIsClean,
  walkRoles,
  WRITE_OPTIONS,
  type DrawnShape,
  type Pass,
  type Pipeline,
  type RedactionTarget,
  type StructureVerdict,
} from "@/engine";
import { foldTicked, holdsTicked } from "@/engine/allowlist";
import { forEachDictionary } from "@/engine/objects";
import { checkOutput, sameDrawnShape } from "@/engine/self-check";

import {
  cidDocument,
  COLOUR_TEXT,
  KEPT_TEXT,
  MARKED_TICKED_TEXT,
  UNREADABLE_PROFILE,
} from "../../scripts/lib/kept-fixtures.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import {
  IDENTITY_UNICODE,
  document as letterDocument,
} from "../../scripts/lib/redaction-fixtures.mjs";
import { fixture } from "../support/bytes";
import {
  containsInAnyEncoding,
  decodedStreams,
  decompressedBytes,
  documentImages,
  documentText,
  everyDictionary,
  everyKey,
  everyTypeName,
  inspect,
  keysOf,
  LIMITS,
  mupdf,
  pageContent,
  pageRenders,
} from "../support/mupdf";
import { findTarget, findTargets } from "../support/targets";

/**
 * What a kept object points at. Spec 0019, AC-4.
 *
 * Each fixture is a case feature 31's row measured: a payload reached only
 * through a key the rebuild used to carry across, on a font, a figure or a
 * picture. Every case failed on main (spec 0004, INV-3: a list changes with a
 * failing fixture as its proof). Each output is read with the helpers in
 * `tests/support/mupdf.ts`, which share no code with the engine, so a test
 * never just proves the engine agrees with itself.
 *
 * Every run here resolves, so the self check passed on each output as well.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

function run(name: string, targets: readonly RedactionTarget[] = []) {
  return redactDocumentWith(mupdf, fixture(name), targets);
}

function holds(output: ArrayBuffer, text: string): boolean {
  return containsInAnyEncoding(decompressedBytes(output), text);
}

describe("what a kept object points at, gone from the output", () => {
  it("keeps no copy of a ticked value in the original figure a font points at", async () => {
    const bytes = fixture("kept-figure.pdf");
    const { output } = await redactDocumentWith(mupdf, bytes, [
      findTarget(bytes, 0, KEPT_TEXT.figure),
    ]);

    expect(holds(output, KEPT_TEXT.figure)).toBe(false);
  });

  it("keeps no copy of the unblanked image mask a font points at", async () => {
    const bytes = fixture("kept-picture.pdf");
    const original = inspect(bytes, (doc) => {
      const masks = decodedStreams(doc).filter(({ dict }) =>
        dict.get("ImageMask").isBoolean() ? dict.get("ImageMask").asBoolean() : false,
      );
      expect(masks).toHaveLength(1);
      return Buffer.from(masks[0].data);
    });

    const { output } = await redactDocumentWith(mupdf, bytes, [
      findTarget(bytes, 0, "12345678"),
      findTarget(bytes, 0, "40-11-22"),
    ]);

    const same = inspect(output, (doc) =>
      decodedStreams(doc).filter(({ data }) => original.equals(data)),
    );
    expect(same).toEqual([]);
  });

  it("keeps neither a note's text nor an attached file a font points at", async () => {
    const { output, sanitized } = await run("kept-annotations.pdf");

    expect(holds(output, KEPT_TEXT.note)).toBe(false);
    expect(holds(output, KEPT_TEXT.attachment)).toBe(false);
    expect(sanitized).toEqual(expect.arrayContaining(["annotations", "attachments"]));
  });

  it("keeps none of the catalog's strings a font points at", async () => {
    const { output } = await run("kept-catalog.pdf");

    for (const text of [
      KEPT_TEXT.label,
      KEPT_TEXT.preference,
      KEPT_TEXT.uri,
      KEPT_TEXT.alt,
    ]) {
      expect(holds(output, text), text).toBe(false);
    }
  });

  it("keeps none of pdfTeX's strings on a figure or an image", async () => {
    const { output } = await run("kept-program-keys.pdf");

    for (const text of [KEPT_TEXT.author, KEPT_TEXT.title, KEPT_TEXT.path]) {
      expect(holds(output, text), text).toBe(false);
    }
  });

  it("keeps no embedded file reached through a figure's /Ref or /OPI or an image's /OPI", async () => {
    const { output } = await run("kept-embedded.pdf");

    for (const text of [KEPT_TEXT.ref, KEPT_TEXT.formOpi, KEPT_TEXT.imageOpi]) {
      expect(holds(output, text), text).toBe(false);
    }
    inspect(output, (doc) => {
      const types = everyTypeName(doc);
      expect(types.has("EmbeddedFile")).toBe(false);
      expect(types.has("Filespec")).toBe(false);
      expect(everyKey(doc).has("EF")).toBe(false);
    });
  });

  /** AC-8: whatever the source held, none of it leaves, so it is reported. */
  it("reports attachments for embedded files reached through /Ref and /OPI", async () => {
    const { sanitized } = await run("kept-embedded.pdf");

    expect(sanitized).toContain("attachments");
  });
});

/** The output's catalog keys, read with the test's own helpers. */
function catalogKeys(output: ArrayBuffer): string[] {
  return inspect(output, (doc) => keysOf(doc.getTrailer().get("Root")));
}

/**
 * Spec 0021, AC-1 and AC-5. The catalog's `/Lang` is kept only when it reads
 * as a language tag holding nothing ticked; a name is neither, so it goes
 * whether or not it was ticked, and the run neither refuses nor reports it.
 */
describe("a catalog /Lang repeating the page's name (spec 0021)", () => {
  it("keeps the ticked name nowhere, the catalog's /Lang included", async () => {
    const bytes = fixture("kept-lang.pdf");
    const { output } = await redactDocumentWith(mupdf, bytes, [
      findTarget(bytes, 0, KEPT_TEXT.lang),
    ]);

    expect(holds(output, KEPT_TEXT.lang)).toBe(false);
    expect(catalogKeys(output)).not.toContain("Lang");
  });

  it("leaves the /Lang out with nothing ticked, and reports nothing for it", async () => {
    const { output, sanitized } = await run("kept-lang.pdf");

    expect(catalogKeys(output)).not.toContain("Lang");
    expect(sanitized).toEqual([]);
  });
});

/** The kind an open refuses with, or `null` if it opened. */
async function openKind(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    doc.close();
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

/**
 * Spec 0021, AC-3 and AC-5. A CID font's `/Registry` and `/Ordering` may be
 * needed to draw its text, so a value outside the short token is refused,
 * never deleted: at open, before a review, and in a run handed the bytes.
 */
describe("a CID font's /Ordering repeating the page's name (spec 0021)", () => {
  it("is refused at open with unreadable-structure", async () => {
    await expect(openKind(fixture("kept-cid-strings.pdf"))).resolves.toBe(
      "unreadable-structure",
    );
  });

  it("refuses a run handed its bytes with the name ticked, the same way", async () => {
    const bytes = fixture("kept-cid-strings.pdf");

    await expect(kindOf(bytes, [findTarget(bytes, 0, KEPT_TEXT.ordering)])).resolves.toBe(
      "unreadable-structure",
    );
  });
});

/** A code the token lets through, on the page line and as a CID font's `/Ordering`. */
const CODE = "ACME12345";

/**
 * Two pages: the first `cidDocument`'s page, `CODE` on its line and at
 * `/Ordering`; the second a Helvetica line and a square painted through the
 * unreadable profile, so its first write keeps a colour space entry nothing
 * names (spec 0019, AC-15). A ticked page's contents go through MuPDF's filter
 * in the pass, which drops such an entry, so the square sits on a page nobody
 * ticks.
 */
function codeBesideUnusedSpace(): ArrayBuffer {
  const codes = [...`Reference ${CODE}`]
    .map((character) => character.codePointAt(0)?.toString(16).padStart(4, "0"))
    .join("");
  const { bytes } = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 10 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      stream("", `BT /F1 18 Tf 72 700 Td <${codes}> Tj ET`),
      "<< /Type /Font /Subtype /Type0 /BaseFont /Cid /Encoding /Identity-H " +
        "/DescendantFonts [6 0 R] /ToUnicode 8 0 R >>",
      "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Cid /CIDToGIDMap /Identity " +
        `/CIDSystemInfo << /Registry (Adobe) /Ordering (${CODE}) /Supplement 0 >> ` +
        "/FontDescriptor 7 0 R /DW 600 >>",
      "<< /Type /FontDescriptor /FontName /Cid /Flags 32 /FontBBox [0 -200 1000 900] " +
        "/ItalicAngle 0 /Ascent 900 /Descent -200 /CapHeight 700 /StemV 80 >>",
      stream("", IDENTITY_UNICODE),
      stream("/N 3", UNREADABLE_PROFILE),
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << " +
        "/Font << /F1 12 0 R >> /ColorSpace << /CS0 [/ICCBased 9 0 R] >> >> /Contents 11 0 R >>",
      stream(
        "",
        "q /CS0 cs 0.2 0.4 0.6 sc 72 500 100 100 re f Q BT /F1 18 Tf 72 700 Td (A square) Tj ET",
      ),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

/**
 * Spec 0021, AC-4 and AC-5. A ticked text at a string place fails the check
 * with `redaction-incomplete`, run in `checkOutput` itself, so it holds
 * whatever the rebuild did and outranks an unused colour space.
 */
describe("a ticked text at a string place (spec 0021)", () => {
  const codePage = (): ArrayBuffer =>
    cidDocument(`Reference ${CODE}`, CODE).slice().buffer;

  it("fails a run whose CID font's /Ordering holds the ticked code, and makes no file", async () => {
    const bytes = codePage();

    await expect(kindOf(bytes, [findTarget(bytes, 0, CODE)])).resolves.toBe(
      "redaction-incomplete",
    );
  });

  it("makes a file from the same document with nothing ticked", async () => {
    await expect(kindOf(codePage(), [])).resolves.toBeNull();
  });

  /**
   * `checkOutput` on bytes built here, the ticked texts handed in, with a
   * structure check that answers clean and no page to compare, so the string
   * place check is all that can answer. The `CIDSystemInfo` hangs on its own:
   * the check reads every dictionary, reached or not.
   */
  function placeCheck(
    at: "Lang" | "Registry" | "Ordering",
    text: string,
    ticked: string,
  ) {
    const objects = document({
      extra:
        at === "Lang"
          ? []
          : [
              `<< /Registry ${at === "Registry" ? `(${text})` : "(Adobe)"} ` +
                `/Ordering ${at === "Ordering" ? `(${text})` : "(Identity)"} /Supplement 0 >>`,
            ],
    });
    if (at === "Lang") objects[0] = `<< /Type /Catalog /Pages 2 0 R /Lang (${text}) >>`;
    const { bytes } = writePdf({ objects, trailer: "/Root 1 0 R" });
    return checkOutput(
      mupdf,
      bytes.slice().buffer,
      [],
      new Map(),
      foldTicked([ticked]),
      () => "clean",
    );
  }

  it.each([
    ["Lang", "Amy-Rose", "Amy-Rose"],
    ["Ordering", "RowanAshby", "Rowan Ashby"],
    ["Ordering", "Rowanx1", "rowan"],
  ] as const)("fails /%s (%s) with %j ticked", (at, text, ticked) => {
    expect(placeCheck(at, text, ticked)).toBe("redaction-incomplete");
  });

  it.each([
    ["Ordering", "Identity", "ID"],
    ["Registry", "Adobe", "Adobe"],
  ] as const)("passes Adobe's own /%s (%s) with %j ticked", (at, text, ticked) => {
    expect(placeCheck(at, text, ticked)).toBeNull();
    // ADOBE_COLLECTIONS skips them; containment alone would not.
    expect(holdsTicked(text, foldTicked([ticked]))).toBe(true);
  });

  it("passes every string place with nothing ticked", () => {
    expect(placeCheck("Ordering", "RowanAshby", "")).toBeNull();
  });

  /**
   * Spec 0021's AC-4 as built, owed by its build and written by spec 0022's
   * (its AC-8): a string place the check cannot decode fails it whenever
   * anything is ticked, since it may hold anything. The walk refuses such a
   * string at every one of these places first, so only bytes built here, with
   * a structure check that answers clean, reach it. `<FEFF00650E>` opens as
   * UTF-16 and ends on half a unit, so it cannot be decoded.
   */
  describe("an /Ordering the check cannot decode (spec 0021's owed test)", () => {
    const undecodable = (ticked: readonly string[]) => {
      const { bytes } = writePdf({
        objects: document({
          extra: ["<< /Registry (Adobe) /Ordering <FEFF00650E> /Supplement 0 >>"],
        }),
        trailer: "/Root 1 0 R",
      });
      return checkOutput(
        mupdf,
        bytes.slice().buffer,
        [],
        new Map(),
        foldTicked(ticked),
        () => "clean",
      );
    };

    it.each([["Clean"], ["e"], ["Rowan Ashby"]])(
      "fails with redaction-incomplete with %j ticked",
      (ticked) => {
        expect(undecodable([ticked])).toBe("redaction-incomplete");
      },
    );

    it("passes with nothing ticked", () => {
      expect(undecodable([])).toBeNull();
    });
  });

  it("fails beside an unused colour space entry and never writes twice", async () => {
    const bytes = codeBesideUnusedSpace();
    const { rewrite, calls } = countedRewrite();
    const { checkStructure, verdicts } = countedCheck();

    await expect(
      kindOf(bytes, [findTarget(bytes, 0, CODE)], {
        ...PIPELINE,
        checkStructure,
        rewrite,
      }),
    ).resolves.toBe("redaction-incomplete");
    expect(verdicts).toEqual(["unused-colour-space"]);
    expect(calls.count).toBe(0);
  });
});

/**
 * A one page document whose catalog holds `/Lang lang`, its page reading
 * "Prepared in GB", with `extra` objects from 6.
 */
function langDocument(lang: string, extra: Body[] = []): ArrayBuffer {
  const { bytes } = writePdf({
    objects: [
      `<< /Type /Catalog /Pages 2 0 R /Lang ${lang} >>`,
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      stream("", "BT /F1 18 Tf 72 700 Td (Prepared in GB) Tj ET"),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      ...extra,
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

/** The output catalog's `/Lang` bytes, read through any reference, or `null` for none. */
function outputLang(output: ArrayBuffer): number[] | null {
  return inspect(output, (doc) => {
    const lang = doc.getTrailer().get("Root", "Lang");
    return lang.isString() ? [...lang.asByteString()] : null;
  });
}

function latin1Bytes(text: string): number[] {
  return [...Buffer.from(text, "latin1")];
}

/** Spec 0021, AC-1: what the catalog keeps of `/Lang`, on documents built here. */
describe("the catalog's /Lang (spec 0021)", () => {
  it.each([
    ["a name", "/en-US"],
    ["a number", "12"],
    ["an empty string", "()"],
    ["free text", "(Jane Smith 123-45-6789)"],
    ["a UTF-16 string of an odd length", "<FEFF00650E>"],
  ])("leaves out %s, making a file all the same", async (_label, lang) => {
    const { output, sanitized } = await redactDocumentWith(mupdf, langDocument(lang), []);

    expect(outputLang(output)).toBeNull();
    expect(catalogKeys(output)).not.toContain("Lang");
    expect(sanitized).toEqual([]);
  });

  it("keeps a tag written as a literal string", async () => {
    const { output } = await redactDocumentWith(mupdf, langDocument("(en-GB)"), []);

    expect(outputLang(output)).toEqual(latin1Bytes("en-GB"));
  });

  it("keeps a UTF-16 tag as written", async () => {
    const { output } = await redactDocumentWith(
      mupdf,
      langDocument("<FEFF0065006E002D00470042>"),
      [],
    );

    expect(outputLang(output)).toEqual([
      0xfe, 0xff, 0, 0x65, 0, 0x6e, 0, 0x2d, 0, 0x47, 0, 0x42,
    ]);
  });

  it("keeps a tag written as an indirect string", async () => {
    const { output } = await redactDocumentWith(
      mupdf,
      langDocument("6 0 R", ["(en-GB)"]),
      [],
    );

    expect(outputLang(output)).toEqual(latin1Bytes("en-GB"));
  });

  it("leaves out a tag holding a ticked text, and the run makes a file", async () => {
    const bytes = langDocument("(en-GB)");
    const { output } = await redactDocumentWith(mupdf, bytes, [
      findTarget(bytes, 0, "GB"),
    ]);

    expect(outputLang(output)).toBeNull();
  });

  it("fails the structure check on a free text /Lang, and passes the same with a tag", () => {
    const objects = (lang: string): Body[] => {
      const built = document();
      built[0] = `<< /Type /Catalog /Pages 2 0 R /Lang ${lang} >>`;
      return built;
    };

    expect(verdictOf(objects("(Jane Smith)"))).toBe("leak");
    expect(verdictOf(objects("(en-GB)"))).toBe("clean");
  });
});

/** The kind a run fails with, or `null` if it produced a file. */
async function kindOf(
  bytes: ArrayBuffer,
  targets: readonly RedactionTarget[],
  pipeline: Pipeline = PIPELINE,
): Promise<string | null> {
  try {
    await redactDocumentWith(mupdf, bytes, targets, {}, pipeline);
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

/**
 * AC-6: the check holds the rule even when the rebuild does not. With the
 * prune swapped for one that does nothing, every case fails the run on the
 * structure check alone and hands back no file.
 */
describe("the structure check, with the prune skipped", () => {
  const skipPrune: Pipeline = { ...PIPELINE, pruneToRoles: () => {} };

  it.each([
    ["kept-figure.pdf", [KEPT_TEXT.figure]],
    ["kept-picture.pdf", ["12345678", "40-11-22"]],
    ["kept-annotations.pdf", []],
    ["kept-catalog.pdf", []],
    ["kept-program-keys.pdf", []],
    ["kept-embedded.pdf", []],
  ] as const)("fails %s with redaction-incomplete", async (name, needles) => {
    const bytes = fixture(name);
    const targets = needles.map((needle) => findTarget(bytes, 0, needle));

    await expect(kindOf(bytes, targets, skipPrune)).resolves.toBe("redaction-incomplete");
  });
});

type Body = string | ReturnType<typeof stream>;

/**
 * A clean one page document: a font, a form with no resources of its own and
 * an image, each named by the page's contents. `fault` changes one thing.
 */
function document(
  fault: {
    font?: string;
    form?: string;
    image?: string;
    extra?: Body[];
    trailer?: string;
  } = {},
): Body[] {
  return [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
      "/Resources << /Font << /F1 5 0 R >> /XObject << /Fm1 6 0 R /Im1 7 0 R >> >> /Contents 4 0 R >>",
    stream("", "BT /F1 12 Tf 72 700 Td (Clean) Tj ET /Fm1 Do /Im1 Do"),
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica ${fault.font ?? ""}>>`,
    stream(`/Type /XObject /Subtype /Form /BBox [0 0 10 10] ${fault.form ?? ""}`, ""),
    stream(
      "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray " +
        `/BitsPerComponent 8 ${fault.image ?? ""}`,
      "\u0080",
    ),
    ...(fault.extra ?? []),
  ];
}

/** The page's resources given a colour space entry nothing draws with. */
function withUnusedSpace(objects: Body[]): Body[] {
  const changed = [...objects];
  changed[2] = (changed[2] as string).replace(
    "/XObject",
    "/ColorSpace << /CS9 [/CalRGB << /WhitePoint [0.95 1 1.09] >>] >> /XObject",
  );
  return changed;
}

/** Open `objects` as a document, hand it to `read`, and destroy it after. */
function withDoc<T>(
  objects: Body[],
  read: (doc: PDFDocument) => T,
  trailer = "/Root 1 0 R",
): T {
  const { bytes } = writePdf({ objects, trailer });
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    return read(doc.asPDF() as PDFDocument);
  } finally {
    doc.destroy();
  }
}

function verdictOf(objects: Body[], trailer = "/Root 1 0 R", pages = 1): string {
  return withDoc(objects, (doc) => structureIsClean(doc, pages), trailer);
}

/** AC-6: one fault per document fails the check, and the same document without it passes. */
describe("the structure check, one fault at a time", () => {
  it("passes the document with no fault", () => {
    expect(verdictOf(document())).toBe("clean");
  });

  it.each([
    ["a key off a font's list", document({ font: "/RedactNestPrivate 1 " })],
    ["a string on a form", document({ form: "/PTEX.FileName (secret/path.pdf) " })],
    ["an object nothing reaches", document({ extra: ["<< /Orphan 1 >>"] })],
    // covers: AC-5, an unreached object need not be a dictionary to hold words
    ["a string nothing reaches", document({ extra: ["(SECRET-42)"] })],
    [
      "an embedded file stream nothing reaches",
      document({ extra: [stream("/Type /EmbeddedFile", "attached")] }),
    ],
    [
      "a stream reached as both an image and a form",
      document({ image: "/SMask 6 0 R " }),
    ],
    ["a value outside its key's shape", document({ font: "/Widths << /A 1 >> " })],
    [
      "a resource its stream never names",
      (() => {
        const objects = document({
          extra: ["<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"],
        });
        objects[2] = (objects[2] as string).replace("/F1 5 0 R", "/F1 5 0 R /F2 8 0 R");
        return objects;
      })(),
    ],
  ])("fails %s", (_label, objects) => {
    expect(verdictOf(objects)).toBe("leak");
  });

  it("fails a trailer key outside /Size and /Root", () => {
    expect(verdictOf(document(), "/Root 1 0 R /ID [<00> <00>]")).toBe("leak");
  });

  it("fails an embedded file reached through a key on the lists' objects", () => {
    expect(
      verdictOf(
        document({
          form: "/Ref << /F 8 0 R /Page 0 >> ",
          extra: ["<< /Type /Filespec /F (a.pdf) /EF << /F 9 0 R >> >>", stream("", "x")],
        }),
      ),
    ).toBe("leak");
  });

  /**
   * AC-5: an embedded file or a file specification fails the check "reached
   * or not". Each object here is reached, and every key on it is on its
   * role's list (roles come from the path, INV-1, so `/Type` is any name), so
   * the walk and reachability find nothing: the embedded file rule alone
   * fails it.
   */
  it.each([
    [
      "a font whose /Type says /Filespec",
      4,
      "<< /Type /Filespec /Subtype /Type1 /BaseFont /Helvetica >>",
    ],
    [
      "a picture whose /Type says /EmbeddedFile",
      6,
      stream(
        "/Type /EmbeddedFile /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray " +
          "/BitsPerComponent 8",
        "\u0080",
      ),
    ],
  ] as const)(
    "fails %s, though the walk reaches it and keeps every key",
    (_label, at, body) => {
      const objects = document();
      objects[at] = body;

      withDoc(objects, (doc) => {
        const walk = walkRoles(doc, "read");
        expect(walk.problem).toBeNull();
        expect(walk.strays).toBe(0);
        expect(walk.reached.has(at + 1)).toBe(true);
      });
      expect(verdictOf(objects)).toBe("leak");
    },
  );

  /** Two emptied dictionaries the write merged into one object (AC-5). */
  it("passes one empty dictionary reached as a property list and a graphics state", () => {
    const objects = document();
    objects[2] =
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> " +
      "/XObject << /Fm1 6 0 R /Im1 7 0 R >> /ExtGState << /G1 8 0 R >> /Properties << /P1 8 0 R >> >> " +
      "/Contents 4 0 R >>";
    objects[3] = stream(
      "",
      "/G1 gs /Span /P1 BDC BT /F1 12 Tf 72 700 Td (Clean) Tj ET EMC /Fm1 Do /Im1 Do",
    );
    objects.push("<< >>");
    expect(verdictOf(objects)).toBe("clean");
  });
});

/**
 * AC-5 and AC-6: the real prune empties a graphics state and a property list,
 * the write merges the two into one object, and the check passes it.
 */
describe("dictionaries the prune empties", () => {
  it("passes a graphics state and a property list merged into one empty object", async () => {
    const { bytes } = writePdf({
      objects: [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << " +
          "/Font << /F1 5 0 R >> /ExtGState << /G1 6 0 R >> /Properties << /P1 7 0 R >> >> " +
          "/Contents 4 0 R >>",
        stream("", "/G1 gs /Span /P1 BDC BT /F1 12 Tf 72 700 Td (Merged) Tj ET EMC"),
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        "<< /HT /Default >>",
        "<< /Alt (A description) >>",
      ],
      trailer: "/Root 1 0 R",
    });
    const input = bytes.slice().buffer;

    const { output } = await redactDocumentWith(mupdf, input, []);

    inspect(output, (doc) => {
      const resources = doc.findPage(0).get("Resources");
      const state = resources.get("ExtGState", "G1");
      const properties = resources.get("Properties", "P1");
      expect(state.isIndirect() && properties.isIndirect()).toBe(true);
      expect(state.asIndirect()).toBe(properties.asIndirect());
    });
  });
});

/** AC-5, *Resource use*: what the drawings name, and what they cannot be read for. */
describe("resource use", () => {
  it("counts /DefaultRGB as used, since a device colour uses it unnamed", () => {
    const objects = document();
    objects[2] = (objects[2] as string).replace(
      "/XObject",
      "/ColorSpace << /DefaultRGB [/CalRGB << /WhitePoint [0.95 1 1.09] >>] >> /XObject",
    );
    expect(verdictOf(objects)).toBe("clean");
  });

  /**
   * Since the fourth pass, its own verdict, so a run may write once more
   * (AC-15); on the bytes that cross it is still a leak.
   */
  it("answers unused-colour-space for a colour space nothing names, its only finding", () => {
    expect(verdictOf(withUnusedSpace(document()))).toBe("unused-colour-space");
  });

  it("lets an unused font in a later owner outrank an unused colour space", () => {
    // The page's dictionary is reached first, the form's own after it.
    const objects = withUnusedSpace(
      document({ form: "/Resources << /Font << /F9 5 0 R >> >> " }),
    );
    expect(verdictOf(objects)).toBe("leak");
  });

  it("lets an unsure drawing in another owner outrank an unused colour space", () => {
    const objects = withUnusedSpace(document());
    objects[5] = stream(
      "/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << >>",
      "(unbalanced",
    );
    expect(verdictOf(objects)).toBe("unreadable");
  });

  it("lets an off list key outrank an unused colour space", () => {
    expect(verdictOf(withUnusedSpace(document({ font: "/RedactNestPrivate 1 " })))).toBe(
      "leak",
    );
  });

  /**
   * *Resource use*: a form with no resources of its own draws with the
   * dictionary it was found under, so what it names counts there. The same
   * font named by no drawing is "a resource its stream never names", above.
   */
  it("counts a name used inside a form with no resources of its own toward the page's dictionary", () => {
    const objects = document({
      extra: ["<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"],
    });
    objects[2] = (objects[2] as string).replace("/F1 5 0 R", "/F1 5 0 R /F2 8 0 R");
    objects[5] = stream(
      "/Type /XObject /Subtype /Form /BBox [0 0 10 10]",
      "BT /F2 12 Tf (x) Tj ET",
    );
    expect(verdictOf(objects)).toBe("clean");
  });

  /** Many producers share one resource dictionary across every page, each page naming some of it. */
  it("joins the names of every page that draws with one shared dictionary", () => {
    const objects: Body[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources 7 0 R /Contents 5 0 R >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources 7 0 R /Contents 6 0 R >>",
      stream("", "BT /F1 12 Tf 72 700 Td (One) Tj ET"),
      stream("", "BT /F2 12 Tf 72 700 Td (Two) Tj ET"),
      "<< /Font << /F1 8 0 R /F2 9 0 R >> >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>",
    ];
    expect(verdictOf(objects, "/Root 1 0 R", 2)).toBe("clean");
  });

  it("answers unreadable for a drawing stream the scan cannot read to its end", () => {
    const objects = document();
    objects[3] = stream("", "BT /F1 12 Tf 72 700 Td (Clean Tj ET /Fm1 Do /Im1 Do");
    expect(verdictOf(objects)).toBe("unreadable");
  });

  it("lets a leak elsewhere outrank an unreadable stream", () => {
    const objects = document({ font: "/RedactNestPrivate 1 " });
    objects[3] = stream("", "BT /F1 12 Tf 72 700 Td (Clean Tj ET /Fm1 Do /Im1 Do");
    expect(verdictOf(objects)).toBe("leak");
  });
});

/** AC-5: in a run, an unreadable output stream is `unsupported`, unless a leak outranks it. */
describe("an unreadable output stream in a run", () => {
  const unreadable: Pipeline = { ...PIPELINE, checkStructure: () => "unreadable" };
  const EMAIL = "jane.doe@example.com";

  it("fails a run with nothing ticked with unsupported", async () => {
    await expect(kindOf(fixture("text-page.pdf"), [], unreadable)).resolves.toBe(
      "unsupported",
    );
  });

  it("fails a clean ticked run with unsupported", async () => {
    const bytes = fixture("text-page.pdf");
    await expect(kindOf(bytes, [findTarget(bytes, 0, EMAIL)], unreadable)).resolves.toBe(
      "unsupported",
    );
  });

  it("lets a glyph that survived outrank it with redaction-incomplete", async () => {
    const bytes = fixture("text-page.pdf");
    await expect(
      kindOf(bytes, [findTarget(bytes, 0, EMAIL)], { ...unreadable, textPass: () => {} }),
    ).resolves.toBe("redaction-incomplete");
  });
});

/**
 * Spec 0019's fourth pass, AC-15 to AC-17. Each fixture is a case its
 * measurements found failing a run with nothing ticked as
 * `redaction-incomplete` on a file main cleans, written by the fixture script
 * and read with `tests/support/mupdf.ts` only.
 */

/** Main's output: the prune, the structure check and the second write swapped out. */
const MAIN_WRITE: Pipeline = {
  ...PIPELINE,
  pruneToRoles: () => {},
  checkStructure: () => "clean",
  rewrite: (_mupdf, bytes) => bytes,
};

/** A second write that writes nothing new, as if MuPDF kept every entry it cannot load. */
const SAME_BYTES: Pipeline = { ...PIPELINE, rewrite: (_mupdf, bytes) => bytes };

/** A second write that must never run. */
const NO_REWRITE: Pipeline = {
  ...PIPELINE,
  rewrite: () => {
    throw new Error("the second write ran");
  },
};

/** Every page's line, one target each. */
function everyLine(bytes: ArrayBuffer, lines: readonly string[]): RedactionTarget[] {
  return lines.map((text, page) => findTarget(bytes, page, text));
}

/** How many entries every resource dictionary's `/ColorSpace` holds, in all. */
function colourSpaceEntries(output: ArrayBuffer): number {
  return inspect(output, (doc) =>
    everyDictionary(doc).reduce((count, dict) => {
      const spaces = dict.get("ColorSpace");
      return spaces.isDictionary() ? count + keysOf(spaces).length : count;
    }, 0),
  );
}

/** AC-15, AC-17: a colour space MuPDF cannot load, cleaned by the second write. */
describe("a page painting through a colour space MuPDF cannot load", () => {
  describe.each([
    ["colour-icc-alternate.pdf", COLOUR_TEXT.iccAlternate],
    ["colour-icc-bare.pdf", COLOUR_TEXT.iccBare],
    ["colour-calrgb.pdf", COLOUR_TEXT.calRgb],
    ["colour-calgray.pdf", COLOUR_TEXT.calGray],
    ["colour-inline.pdf", COLOUR_TEXT.inline],
  ] as const)("%s", (name, lines) => {
    it("makes a file with nothing ticked, drawn as main draws it, with no colour space entry", async () => {
      const { output } = await run(name);
      const main = await redactDocumentWith(mupdf, fixture(name), [], {}, MAIN_WRITE);

      expect(pageRenders(output)).toEqual(pageRenders(main.output));
      expect(colourSpaceEntries(output)).toBe(0);
    });

    it("fails with redaction-incomplete when the second write keeps the entry", async () => {
      await expect(kindOf(fixture(name), [], SAME_BYTES)).resolves.toBe(
        "redaction-incomplete",
      );
    });

    it("makes a file with the line on every page ticked", async () => {
      const bytes = fixture(name);
      await expect(kindOf(bytes, everyLine(bytes, lines))).resolves.toBeNull();
    });
  });

  /** The control: spaces with a broken part MuPDF keeps naming, so the trigger stays narrow. */
  it("never writes twice for a space MuPDF keeps naming, and keeps every entry named", async () => {
    const { output } = await redactDocumentWith(
      mupdf,
      fixture("colour-loaded.pdf"),
      [],
      {},
      NO_REWRITE,
    );

    COLOUR_TEXT.loaded.forEach((line, index) => {
      const names = inspect(output, (doc) => {
        const spaces = doc.findPage(index).get("Resources").get("ColorSpace");
        return spaces.isDictionary() ? keysOf(spaces) : [];
      });
      expect(names, line).toHaveLength(1);
      expect(pageContent(output, index), line).toMatch(
        new RegExp(`/${names[0]}\\s+(cs|CS)\\s`),
      );
    });
  });
});

/**
 * A document built here, painting through the unreadable profile beside a
 * form and a picture, so its first write keeps a colour space entry nothing
 * names. `fault` changes one other thing, as `document` takes it.
 */
function unloadableSpace(fault: Parameters<typeof document>[0] = {}): ArrayBuffer {
  const objects = document(fault);
  const profile = objects.length + 1;
  objects.push(stream("/N 3", UNREADABLE_PROFILE));
  objects[2] = (objects[2] as string).replace(
    "/XObject",
    `/ColorSpace << /CS0 [/ICCBased ${profile} 0 R] >> /XObject`,
  );
  objects[3] = stream(
    "",
    "q /CS0 cs 0.2 0.4 0.6 sc 72 500 100 100 re f Q " +
      "BT /F1 12 Tf 72 700 Td (Clean) Tj ET /Fm1 Do /Im1 Do",
  );
  return writePdf({ objects, trailer: "/Root 1 0 R" }).bytes.slice().buffer;
}

/** A structure check that answers `answer`, or the real verdict, and counts every call. */
function countedCheck(answer?: StructureVerdict) {
  const verdicts: StructureVerdict[] = [];
  const checkStructure: Pipeline["checkStructure"] = (check, count, ticked) => {
    const verdict = answer ?? structureIsClean(check, count, ticked);
    verdicts.push(verdict);
    return verdict;
  };
  return { checkStructure, verdicts };
}

/** A second write that counts its calls and writes as the real one does. */
function countedRewrite() {
  const calls = { count: 0 };
  const rewrite: Pipeline["rewrite"] = (engine, bytes) => {
    calls.count += 1;
    return PIPELINE.rewrite(engine, bytes);
  };
  return { rewrite, calls };
}

/** AC-15: the second write runs on its verdict alone, at most once, and its bytes face the whole check. */
describe("the second write", () => {
  it("makes a file from a document built here, writing it twice", async () => {
    const { checkStructure, verdicts } = countedCheck();
    const { rewrite, calls } = countedRewrite();

    await expect(
      kindOf(unloadableSpace(), [], { ...PIPELINE, checkStructure, rewrite }),
    ).resolves.toBeNull();
    expect(verdicts).toEqual(["unused-colour-space", "clean"]);
    expect(calls.count).toBe(1);
  });

  it("fails with redaction-incomplete when the entry stays through both writes", async () => {
    await expect(kindOf(unloadableSpace(), [], SAME_BYTES)).resolves.toBe(
      "redaction-incomplete",
    );
  });

  it("never writes twice beside an off list key, which fails with redaction-incomplete", async () => {
    const { checkStructure, verdicts } = countedCheck();
    const { rewrite, calls } = countedRewrite();
    const pipeline = { ...PIPELINE, pruneToRoles: () => {}, checkStructure, rewrite };

    await expect(
      kindOf(unloadableSpace({ font: "/RedactNestPrivate 1 " }), [], pipeline),
    ).resolves.toBe("redaction-incomplete");
    expect(verdicts).toEqual(["leak"]);
    expect(calls.count).toBe(0);
  });

  /**
   * MuPDF's filter rewrites every drawing a test can write, page contents,
   * forms, tiling patterns and Type 3 glyphs alike, so an unreadable one never
   * reaches an output. The real verdict stands for the entry here, and the
   * stub adds the unreadable drawing, which outranks it (`structureIsClean`'s
   * own ranking is held above, on documents built here).
   */
  it("never writes twice beside an unreadable drawing, which fails with unsupported", async () => {
    const seen: StructureVerdict[] = [];
    const { rewrite, calls } = countedRewrite();
    const checkStructure: Pipeline["checkStructure"] = (check, count, ticked) => {
      seen.push(structureIsClean(check, count, ticked));
      return "unreadable";
    };

    await expect(
      kindOf(unloadableSpace(), [], { ...PIPELINE, checkStructure, rewrite }),
    ).resolves.toBe("unsupported");
    expect(seen).toEqual(["unused-colour-space"]);
    expect(calls.count).toBe(0);
  });

  it.each([
    ["once on a clean run", "text-page.pdf", undefined, PIPELINE.pruneToRoles, null, 1],
    [
      "twice on the rewrite path",
      "colour-calgray.pdf",
      undefined,
      PIPELINE.pruneToRoles,
      null,
      2,
    ],
    [
      "once on a leak",
      "kept-program-keys.pdf",
      undefined,
      () => {},
      "redaction-incomplete",
      1,
    ],
    [
      "once on an unreadable stream",
      "text-page.pdf",
      "unreadable",
      PIPELINE.pruneToRoles,
      "unsupported",
      1,
    ],
  ] as const)(
    "calls the structure check %s",
    async (_label, name, answer, pruneToRoles, kind, calls) => {
      const { checkStructure, verdicts } = countedCheck(answer);

      await expect(
        kindOf(fixture(name), [], { ...PIPELINE, pruneToRoles, checkStructure }),
      ).resolves.toBe(kind);
      expect(verdicts).toHaveLength(calls);
    },
  );

  it("fails with redaction-incomplete when the second write throws", async () => {
    await expect(kindOf(fixture("colour-calgray.pdf"), [], NO_REWRITE)).resolves.toBe(
      "redaction-incomplete",
    );
  });

  it("fails with unsupported when the second write changes what a page draws", async () => {
    // The real second write, then the picture's data written empty: the full
    // check reads no picture nobody ticked, so only the drawn shape sees it.
    const emptiesPicture: Pipeline["rewrite"] = (engine, bytes) => {
      const doc = mupdf.Document.openDocument(
        PIPELINE.rewrite(engine, bytes),
        "application/pdf",
      );
      try {
        const pdf = doc.asPDF() as PDFDocument;
        pdf
          .findPage(0)
          .get("Resources")
          .get("XObject")
          .forEach((xobject) => {
            if (xobject.get("Subtype").asName() === "Image") {
              xobject.writeStream(new Uint8Array(0));
            }
          });
        const buffer = pdf.saveToBuffer(WRITE_OPTIONS);
        try {
          return buffer.asUint8Array().slice().buffer;
        } finally {
          buffer.destroy();
        }
      } finally {
        doc.destroy();
      }
    };

    await expect(
      kindOf(unloadableSpace(), [], { ...PIPELINE, rewrite: emptiesPicture }),
    ).resolves.toBe("unsupported");
  });

  it("ends as a cancel, never a failure, when cancelled at the checkpoint before it", async () => {
    const { checkStructure, verdicts } = countedCheck();
    const { rewrite, calls } = countedRewrite();

    await expect(
      redactDocumentWith(
        mupdf,
        fixture("colour-calgray.pdf"),
        [],
        { isCancelled: () => verdicts.length > 0 },
        { ...PIPELINE, checkStructure, rewrite },
      ),
    ).rejects.toBeInstanceOf(RunCancelled);
    expect(calls.count).toBe(0);
  });
});

/**
 * AC-15, INV-8: what the second write's bytes are held to besides the full
 * check, which reads no picture nobody ticked and counts no figure. Spec
 * 0021's AC-8 widens it to every stream the walk reaches, by role, with only
 * a whole colour profile allowed to go. The run level guards are "fails with
 * unsupported when the second write changes what a page draws", above, and
 * the positive document below; these hold what the shape records.
 */
describe("the drawn shape a second write is held to", () => {
  it("lists every reached stream's stored length under each stream role, smallest first", () => {
    const { bytes } = writePdf({
      objects: [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
          "/Resources << /XObject << /Fm1 7 0 R /Im1 9 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
          "/Resources << /XObject << /Fm1 7 0 R /Fm2 8 0 R /Im2 10 0 R >> >> /Contents 6 0 R >>",
        stream("", "/Fm1 Do /Im1 Do"),
        stream("", "/Fm1 Do /Fm2 Do /Im2 Do"),
        stream("/Type /XObject /Subtype /Form /BBox [0 0 10 10]", ""),
        stream("/Type /XObject /Subtype /Form /BBox [0 0 10 10]", ""),
        stream(
          "/Type /XObject /Subtype /Image /Width 3 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\u0010\u0080ð",
        ),
        stream(
          "/Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
          "\u0080",
        ),
      ],
      trailer: "/Root 1 0 R",
    });

    // A form drawn by both pages is one object, so it is listed once.
    expect(drawnShape(mupdf, bytes.slice().buffer)).toEqual({
      content: ["/Fm1 Do /Im1 Do".length, "/Fm1 Do /Fm2 Do /Im2 Do".length],
      form: [0, 0],
      image: [1, 3],
    });
  });

  const SHAPE: DrawnShape = {
    content: [40, 120],
    form: [0, 30],
    image: [1, 3],
    "font-file": [5000],
    "character-map": [200],
    "tiling-pattern": [26],
    shading: [32],
    function: [-1, 18],
    "colour-profile": [45, 45, 3144],
    "plain-stream": [12],
  };

  /** `SHAPE` with one role's list replaced. */
  const replaced = (role: keyof DrawnShape, list: readonly number[]): DrawnShape => ({
    ...SHAPE,
    [role]: list,
  });

  it("holds an equal record", () => {
    expect(sameDrawnShape(SHAPE, { ...SHAPE })).toBe(true);
  });

  it("holds a second write that lost whole colour profiles, and fails one that changed one", () => {
    expect(sameDrawnShape(SHAPE, replaced("colour-profile", [3144]))).toBe(true);
    expect(sameDrawnShape(SHAPE, replaced("colour-profile", [45]))).toBe(true);
    expect(sameDrawnShape(SHAPE, replaced("colour-profile", []))).toBe(true);
    expect(sameDrawnShape(SHAPE, replaced("colour-profile", [44, 45, 3144]))).toBe(false);
    expect(sameDrawnShape(SHAPE, replaced("colour-profile", [45, 45, 45]))).toBe(false);
    expect(sameDrawnShape(SHAPE, replaced("colour-profile", [45, 45, 3144, 3144]))).toBe(
      false,
    );
  });

  it.each([
    "content",
    "form",
    "image",
    "font-file",
    "character-map",
    "tiling-pattern",
    "shading",
    "function",
    "plain-stream",
  ] as const)("fails a %s changed, dropped or added", (role) => {
    const list = SHAPE[role] ?? [];
    expect(sameDrawnShape(SHAPE, replaced(role, [list[0] - 1, ...list.slice(1)]))).toBe(
      false,
    );
    expect(sameDrawnShape(SHAPE, replaced(role, list.slice(1)))).toBe(false);
    expect(sameDrawnShape(SHAPE, replaced(role, [...list, 7]))).toBe(false);
  });

  it("fails a reached stream turned into a bare dictionary, unless the first had one there", () => {
    expect(sameDrawnShape(SHAPE, replaced("shading", [-1]))).toBe(false);
    expect(sameDrawnShape(SHAPE, replaced("function", [-1, -1]))).toBe(false);
    expect(sameDrawnShape(SHAPE, replaced("function", [-1, 18]))).toBe(true);
    expect(sameDrawnShape(replaced("shading", [-1]), replaced("shading", [-1]))).toBe(
      true,
    );
  });

  it("treats a role missing from a record as an empty list", () => {
    const rest: DrawnShape = Object.fromEntries(
      Object.entries(SHAPE).filter(([role]) => role !== "plain-stream"),
    );
    expect(sameDrawnShape(SHAPE, rest)).toBe(false);
    expect(sameDrawnShape(rest, { ...rest, "plain-stream": [] })).toBe(true);
  });
});

/**
 * One page drawing in Carlito (an embedded font file), filling a square with
 * a tiling pattern, painting a type 4 shading, and painting a square through
 * the unreadable profile first, so its first write keeps a colour space entry
 * nothing names and the run writes twice (spec 0021, AC-8's positive case).
 */
function drawnEverything(): ArrayBuffer {
  const vertex = (x: number, y: number, rgb: readonly number[]): number[] => {
    const ex = Math.round((x / 612) * 65535);
    const ey = Math.round((y / 792) * 65535);
    return [0, ex >> 8, ex & 0xff, ey >> 8, ey & 0xff, ...rgb];
  };
  const bytes = letterDocument(
    ({ add }: { add: (body: unknown) => number }) => {
      const profile = add(stream("/N 3", UNREADABLE_PROFILE));
      const tile = add(
        stream(
          "/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 10 10] " +
            "/XStep 10 /YStep 10 /Resources << >>",
          "1 0 0 rg 0 0 5 5 re f\n",
        ),
      );
      const shading = add(
        stream(
          "/ShadingType 4 /ColorSpace /DeviceRGB /BitsPerCoordinate 16 /BitsPerComponent 8 " +
            "/BitsPerFlag 8 /Decode [0 612 0 792 0 1 0 1 0 1]",
          Uint8Array.from([
            ...vertex(350, 500, [255, 0, 0]),
            ...vertex(450, 500, [0, 255, 0]),
            ...vertex(400, 600, [0, 0, 255]),
          ]),
        ),
      );
      return [
        {
          resources:
            `/ColorSpace << /CS0 [/ICCBased ${profile} 0 R] >> /Pattern << /P0 ${tile} 0 R >> ` +
            `/Shading << /Sh0 ${shading} 0 R >>`,
          content:
            "q /CS0 cs 0.2 0.4 0.6 sc 72 500 100 100 re f Q " +
            "q /Pattern cs /P0 scn 200 500 100 100 re f Q " +
            "q 350 500 100 100 re W n /Sh0 sh Q " +
            "BT /F3 18 Tf 72 700 Td (A line in Carlito) Tj ET\n",
        },
      ];
    },
    { carlito: true },
  );
  return bytes.slice().buffer;
}

/**
 * The real second write, then the first stream `pick` chooses written again
 * as `change` makes it, and the file saved as the engine saves one.
 */
function rewriteThen(
  pick: (ref: PDFObject) => boolean,
  change: (data: Uint8Array) => Uint8Array,
): Pipeline["rewrite"] {
  return (engine, bytes) => {
    const doc = mupdf.Document.openDocument(
      PIPELINE.rewrite(engine, bytes),
      "application/pdf",
    );
    try {
      const pdf = doc.asPDF() as PDFDocument;
      for (let num = 1; num < pdf.countObjects(); num += 1) {
        const ref = pdf.newIndirect(num);
        if (!ref.isStream() || !pick(ref)) continue;
        const data = ref.readStream();
        try {
          ref.writeStream(change(data.asUint8Array().slice()));
        } finally {
          data.destroy();
        }
        break;
      }
      const buffer = pdf.saveToBuffer(WRITE_OPTIONS);
      try {
        return buffer.asUint8Array().slice().buffer;
      } finally {
        buffer.destroy();
      }
    } finally {
      doc.destroy();
    }
  };
}

/** Spec 0021, AC-8: the drawn shape through the real second write. */
describe("the drawn shape on a font file, a pattern and a shading", () => {
  it("makes a file through the real second write, writing twice", async () => {
    const { rewrite, calls } = countedRewrite();

    await expect(
      kindOf(drawnEverything(), [], { ...PIPELINE, rewrite }),
    ).resolves.toBeNull();
    expect(calls.count).toBe(1);
  });

  it.each([
    ["the font file's", (ref: PDFObject) => ref.get("Length1").isNumber()],
    ["the tiling pattern's", (ref: PDFObject) => ref.get("PatternType").isNumber()],
  ])(
    "fails with unsupported when the second write writes %s data shorter",
    async (_label, pick) => {
      const rewrite = rewriteThen(pick, (data) =>
        data.slice(0, Math.floor(data.length / 2)),
      );

      await expect(kindOf(drawnEverything(), [], { ...PIPELINE, rewrite })).resolves.toBe(
        "unsupported",
      );
    },
  );
});

/** AC-16, AC-17: what a picture or a figure points at, merged by the write. */
/**
 * A page with a line of Helvetica and, when `space` is given, an inline
 * picture drawn 100 points square whose `/CS` is `space`, one index byte,
 * with `/Cs1` a calibrated RGB space in the page's resources.
 */
function inlineIndexed(space?: string): ArrayBuffer {
  const picture =
    space === undefined
      ? ""
      : `q 100 0 0 100 72 500 cm BI /W 1 /H 1 /CS ${space} /BPC 8 ID ${String.fromCharCode(1)} EI Q `;
  const { bytes } = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << " +
        "/Font << /F1 5 0 R >> /ColorSpace << /Cs1 [/CalRGB << /WhitePoint [0.9505 1 1.089] >>] >> >> " +
        "/Contents 4 0 R >>",
      stream("", `${picture}BT /F1 18 Tf 72 700 Td (A palette picture) Tj ET`),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

/**
 * Spec 0021, AC-7, the pin. The scan now counts an inline picture's indexed
 * base name as a use, but no output reaches the case today: MuPDF 1.28.1 does
 * not draw an inline picture whose indexed `/CS` names a resource as its base,
 * and a run's write keeps neither the picture nor the entry. A release that
 * starts drawing it fails here, and shows the rule now matters.
 */
describe("MuPDF and an inline picture over a named indexed base", () => {
  const NAMED = "[/I /Cs1 1 <FF000000FF00>]";

  it("is not drawn in the source, where the same picture over a device base is", () => {
    const without = pageRenders(inlineIndexed());

    expect(pageRenders(inlineIndexed(NAMED))).toEqual(without);
    expect(pageRenders(inlineIndexed("[/I /RGB 1 <FF000000FF00>]"))).not.toEqual(without);
  });

  /**
   * Spec 0022 refuses this picture (AC-1, AC-3), so the run swaps its inline
   * picture rule out: this pins MuPDF's behaviour, not the rule (AC-7).
   */
  it("leaves a run's output with no inline picture and no colour space entry", async () => {
    const { output } = await redactDocumentWith(
      mupdf,
      inlineIndexed(NAMED),
      [],
      {},
      {
        ...PIPELINE,
        judgeInlinePictures: () => "kept",
      },
    );

    expect(pageContent(output, 0)).not.toMatch(/\bBI\b/);
    expect(colourSpaceEntries(output)).toBe(0);
  });
});

describe("pictures and figures pointing at identical small objects", () => {
  it.each([
    ["nothing ticked", false],
    ["the first page's line ticked", true],
  ])("keeps every picture's stored bytes with %s", async (_label, ticked) => {
    const bytes = fixture("shared-pictures.pdf");
    const targets = ticked ? [findTarget(bytes, 0, COLOUR_TEXT.sharedPictures[0])] : [];

    const { output } = await redactDocumentWith(mupdf, bytes, targets);

    expect(documentImages(output)).toEqual(documentImages(bytes));
  });

  it("draws every page of the pictures as the source draws it, with nothing ticked", async () => {
    const { output } = await run("shared-pictures.pdf");

    expect(pageRenders(output)).toEqual(pageRenders(fixture("shared-pictures.pdf")));
  });

  it("keeps both figures' lines, drawn as the source draws them, with nothing ticked", async () => {
    const { output } = await run("shared-forms.pdf");

    const text = documentText(output);
    for (const line of [COLOUR_TEXT.sharedForms[0], ...COLOUR_TEXT.sharedFormLines]) {
      expect(text, line).toContain(line);
    }
    expect(pageRenders(output)).toEqual(pageRenders(fixture("shared-forms.pdf")));
  });
});

/**
 * AC-16. The carrier sweep, the inventory and the self check walk every
 * dictionary through `forEachDictionary`, which reads each numbered object
 * through its reference. A top level visit that went through `walkDirect`
 * would pass over every reference and visit nothing, and the sweep, the
 * inventory and the carrier check would all go quiet.
 */
describe("every dictionary, read through its reference", () => {
  const names = [
    "metadata.pdf",
    ...readdirSync(new URL("../fixtures/", import.meta.url)).filter((name) =>
      /^kept-.*\.pdf$/.test(name),
    ),
  ];

  it("reads every kept object fixture", () => {
    expect(names).toHaveLength(9);
  });

  it.each(names)(
    "visits as many dictionaries in %s as the test's own walk finds",
    (name) => {
      inspect(fixture(name), (doc) => {
        let visits = 0;
        forEachDictionary(doc, () => {
          visits += 1;
        });

        expect(visits).toBeGreaterThan(0);
        expect(visits).toBe(everyDictionary(doc).length);
      });
    },
  );
});

/**
 * AC-16, the pin. MuPDF 1.28.1 writes a stream it was asked to resolve as a
 * dictionary with no data when its deduplicating write merges an object that
 * stream's own dictionary points to, and loses nothing when nothing was called
 * on the document. That is why no code in `src/engine` resolves an object, and
 * a release that fixes it fails here, so the ban can be revisited.
 */
describe("MuPDF's empty stream after a resolve", () => {
  function written(resolveFirst: boolean): ArrayBuffer {
    const doc = mupdf.Document.openDocument(
      fixture("shared-pictures.pdf"),
      "application/pdf",
    );
    try {
      const pdf = doc.asPDF() as PDFDocument;
      const resolved = [];
      if (resolveFirst) {
        for (let num = 1; num < pdf.countObjects(); num += 1) {
          const ref = pdf.newIndirect(num);
          if (ref.isStream()) resolved.push(ref.resolve());
        }
      }
      const buffer = pdf.saveToBuffer(WRITE_OPTIONS);
      try {
        return buffer.asUint8Array().slice().buffer;
      } finally {
        buffer.destroy();
      }
    } finally {
      doc.destroy();
    }
  }

  it("leaves the pictures with no data once every stream was resolved", () => {
    expect(documentImages(written(true)).flat()).toEqual([]);
  });

  it("keeps every picture's stored bytes when nothing was resolved", () => {
    expect(documentImages(written(false))).toEqual(
      documentImages(fixture("shared-pictures.pdf")),
    );
  });
});

/** `marked-ticked.pdf`'s name for a page, from 1. */
function markedName(page: number): string {
  return MARKED_TICKED_TEXT[page as keyof typeof MARKED_TICKED_TEXT];
}

/** Every place `findTargets` finds a page's name, the page counted from 1. */
function markedTargets(page: number): RedactionTarget[] {
  return findTargets(fixture("marked-ticked.pdf"), page - 1, markedName(page));
}

/**
 * Spec 0023, AC-3. Each page of `marked-ticked.pdf` writes its own made up
 * name into a description that MuPDF keeps once the name's glyphs go: a span
 * that also draws a shape, a highlight, a clip or a form, a named list, an
 * inline `/Alt`, a `DP` and a name split across two spans. On the code before
 * spec 0023 each of those runs made a file still holding the name (page 9:
 * both words), with the check passing. Page 7's `DP` was measured first (task
 * 1, 2026-11-23): MuPDF 1.28.1 keeps it beside the name's removed glyphs.
 */
describe("a ticked text in a description (spec 0023)", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 9])(
    "fails page %i with its name ticked with replacement-text, and makes no file",
    async (page) => {
      const targets = markedTargets(page);
      expect(targets).toHaveLength(1);

      await expect(kindOf(fixture("marked-ticked.pdf"), targets)).resolves.toBe(
        "replacement-text",
      );
    },
  );

  /**
   * The recorded false refusal (AC-1, *Consequences*): the span's
   * `/ActualText` sits round only a form that draws other text, which the
   * scan never counts as drawn, so ticking the plain row refuses although the
   * character check would read the span. The find step blocks the span's row,
   * so the plain row is the one a visitor can tick; every place
   * `findTargets` finds refuses the same way.
   */
  it("fails page 10 with replacement-text, its plain row alone or every place", async () => {
    const bytes = fixture("marked-ticked.pdf");
    const targets = markedTargets(10);
    expect(targets).toHaveLength(2);

    await expect(kindOf(bytes, targets.slice(0, 1))).resolves.toBe("replacement-text");
    await expect(kindOf(bytes, targets)).resolves.toBe("replacement-text");
  });

  it("makes a file from page 8, the control, without its name", async () => {
    const bytes = fixture("marked-ticked.pdf");
    const { output } = await redactDocumentWith(mupdf, bytes, markedTargets(8));

    expect(holds(output, markedName(8))).toBe(false);
  });

  it("makes a file with nothing ticked", async () => {
    await expect(kindOf(fixture("marked-ticked.pdf"), [])).resolves.toBeNull();
  });
});

/** The name the places and the order of kinds tests draw, and describe. */
const PLACE_NAME = "Hester Quayle";

/** An inline `/Alt` naming `PLACE_NAME` around a square `size` wide. */
const placeAlt = (size: number): string =>
  `/Figure << /Alt (A photo of ${PLACE_NAME}) >> BDC 0 0 ${size} ${size} re f EMC`;

/** The page line drawing `PLACE_NAME` in Helvetica. */
const PLACE_LINE = `BT /F1 12 Tf 72 700 Td (${PLACE_NAME}) Tj ET`;

/**
 * One page drawing `PLACE_NAME`, beside a description naming it inside
 * `place`: a form XObject, a coloured tiling pattern, or a Type 3 glyph
 * procedure that draws only a square (so spec 0020's glyph rule passes it),
 * its font with or without `/Resources`.
 */
function placeDocument(
  place: "form" | "pattern" | "glyph" | "glyph with resources",
): ArrayBuffer {
  const helvetica = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  const page = (resources: string) =>
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
    `/Resources << /Font << /F1 5 0 R ${resources.startsWith("/T3") ? resources : ""}>> ` +
    `${resources.startsWith("/T3") ? "" : resources} >> /Contents 4 0 R >>`;
  const head = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  ];
  const objects: Body[] =
    place === "form"
      ? [
          ...head,
          page("/XObject << /Fm0 6 0 R >>"),
          stream("", `${PLACE_LINE}\nq 1 0 0 1 72 500 cm /Fm0 Do Q`),
          helvetica,
          stream("/Type /XObject /Subtype /Form /BBox [0 0 100 100]", placeAlt(100)),
        ]
      : place === "pattern"
        ? [
            ...head,
            page("/Pattern << /P1 6 0 R >>"),
            stream("", `${PLACE_LINE}\n/Pattern cs /P1 scn 72 500 100 100 re f`),
            helvetica,
            stream(
              "/Type /Pattern /PatternType 1 /PaintType 1 /TilingType 1 /BBox [0 0 100 100] " +
                "/XStep 100 /YStep 100 /Matrix [1 0 0 1 72 500] /Resources << >>",
              placeAlt(100),
            ),
          ]
        : [
            ...head,
            page("/T3 6 0 R"),
            stream("", `${PLACE_LINE}\nBT /T3 100 Tf 72 500 Td (A) Tj ET`),
            helvetica,
            "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] " +
              "/FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /sq 7 0 R >> " +
              "/Encoding << /Type /Encoding /Differences [65 /sq] >> " +
              "/FirstChar 65 /LastChar 65 /Widths [1000] " +
              `${place === "glyph with resources" ? "/Resources << >> " : ""}>>`,
            stream("", `1000 0 d0 ${placeAlt(1000)}`),
          ];
  return writePdf({ objects, trailer: "/Root 1 0 R" }).bytes.slice().buffer;
}

/**
 * Spec 0023, AC-2 and AC-3: the rule holds in every drawing the walk reaches,
 * not only a page's contents. A form, a tiling pattern and a Type 3 glyph
 * procedure each keep an inline `/Alt` naming the ticked name; each run
 * refuses, and the same document with nothing ticked makes a file. The glyph
 * procedures are read per procedure (`joined` false), under the font's owner
 * when the font has `/Resources`, else with the drawings that have none.
 */
describe("a ticked text in a description, in every place (spec 0023)", () => {
  it.each(["form", "pattern", "glyph", "glyph with resources"] as const)(
    "fails a %s naming the ticked name with replacement-text",
    async (place) => {
      const bytes = placeDocument(place);

      await expect(kindOf(bytes, [findTarget(bytes, 0, PLACE_NAME)])).resolves.toBe(
        "replacement-text",
      );
    },
  );

  it.each(["form", "pattern", "glyph", "glyph with resources"] as const)(
    "makes a file from the %s with nothing ticked",
    async (place) => {
      await expect(kindOf(placeDocument(place), [])).resolves.toBeNull();
    },
  );

  /** Read on the source: the hit is found in each place, by both readers. */
  it.each(["form", "pattern", "glyph", "glyph with resources"] as const)(
    "answers ticked-description for the %s, and clean with nothing ticked",
    (place) => {
      const doc = mupdf.Document.openDocument(placeDocument(place), "application/pdf");
      try {
        const pdf = doc.asPDF() as PDFDocument;
        expect(structureIsClean(pdf, 1, foldTicked([PLACE_NAME]))).toBe(
          "ticked-description",
        );
        expect(structureIsClean(pdf, 1)).toBe("clean");
      } finally {
        doc.destroy();
      }
    },
  );

  /**
   * Where the glyph procedures are read, as measured in this build
   * (2026-11-23): always in resource use. A font with `/Resources` is an owner
   * of its own; a font with none is read under the dictionary it is reached
   * from, the page's, as a form with none is (`drawer.from` in the walk), so
   * the hit in the font with no `/Resources` comes through the page's owner,
   * never `resourcelessUse`. Spec 0023's AC-2 and AC-3 expected that one in
   * `resourcelessUse`; the next test reaches that reader through a page with
   * no resource dictionary.
   */
  it.each([
    ["glyph with resources", "an owner of its own"],
    ["glyph", "the page's owner"],
  ] as const)("reads the %s's procedures in %s", (place, where) => {
    const doc = mupdf.Document.openDocument(placeDocument(place), "application/pdf");
    try {
      const walk = walkRoles(doc.asPDF() as PDFDocument, "read");
      const holders = walk.owners.filter(({ units }) =>
        units.some((unit) => !unit.joined),
      );
      expect(holders).toHaveLength(1);
      const withPage = holders[0].units.some((unit) => unit.joined);
      expect(withPage ? "the page's owner" : "an owner of its own").toBe(where);
      expect(
        walk.pages.flat().some((unit) => !unit.joined && unit.resources === null),
      ).toBe(false);
    } finally {
      doc.destroy();
    }
  });

  /**
   * `resourcelessUse`, which reads every drawing with no resource dictionary:
   * a second page with none, holding only an inline `/Alt` naming the name
   * the first page draws. Read on the source, since a run on a page with no
   * `/Resources` already refuses with nothing ticked, `/Alt` or not (seen in
   * this build, older than spec 0023, and failing safe).
   */
  it("answers ticked-description for a page with no resource dictionary", () => {
    const objects: Body[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      stream("", PLACE_LINE),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 7 0 R >>",
      stream("", `q 1 0 0 1 72 500 cm ${placeAlt(100)} Q`),
    ];
    withDoc(objects, (doc) => {
      const walk = walkRoles(doc, "read");
      expect(walk.pages[1].every((unit) => unit.resources === null)).toBe(true);
      expect(structureIsClean(doc, 2, foldTicked([PLACE_NAME]))).toBe(
        "ticked-description",
      );
      expect(structureIsClean(doc, 2)).toBe("clean");
    });
  });
});

/**
 * Two pages: the first draws `PLACE_NAME` beside an inline `/Alt` naming it
 * around a square; the second paints a square through the unreadable profile,
 * so the first write keeps a colour space entry nothing names (spec 0019,
 * AC-15), on a page nobody ticks.
 */
function describedBesideUnusedSpace(): ArrayBuffer {
  const { bytes } = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R 6 0 R] /Count 2 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      stream("", `${PLACE_LINE}\nq 1 0 0 1 72 500 cm ${placeAlt(100)} Q`),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << " +
        "/Font << /F1 5 0 R >> /ColorSpace << /CS0 [/ICCBased 8 0 R] >> >> /Contents 7 0 R >>",
      stream(
        "",
        "q /CS0 cs 0.2 0.4 0.6 sc 72 500 100 100 re f Q BT /F1 18 Tf 72 700 Td (A square) Tj ET",
      ),
      stream("/N 3", UNREADABLE_PROFILE),
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

/**
 * `document()`'s page, its contents also holding an inline `/Alt` naming
 * `Clean` around a square, and its form's stream unbalanced, so the scan
 * cannot read it. `ownResources` gives the form a resource dictionary of its
 * own, so it is read under another owner than the page's.
 */
function describedBesideUnreadable(ownResources: boolean): Body[] {
  const objects = document({ form: ownResources ? "/Resources << >>" : "" });
  objects[3] = stream(
    "",
    "BT /F1 12 Tf 72 700 Td (Clean) Tj ET /Fm1 Do /Im1 Do " +
      "/Figure << /Alt (Clean) >> BDC 0 0 1 1 re f EMC",
  );
  objects[5] = stream(
    `/Type /XObject /Subtype /Form /BBox [0 0 10 10] ${ownResources ? "/Resources << >>" : ""}`,
    "BT (abc Tj ET",
  );
  return objects;
}

/** A ticked target for `checkOutput`'s kind, on a record with no page to compare. */
const TICKED_ELSEWHERE: RedactionTarget = Object.freeze({
  page: 0,
  quads: [],
  start: 0,
  end: 5,
  kind: "email",
  term: null,
  text: "Clean",
});

/**
 * Spec 0023, AC-2: where `"ticked-description"` ranks, in the structure part
 * and in `checkOutput`'s kinds.
 */
describe("the order of kinds for a ticked description (spec 0023)", () => {
  it("fails beside an unused colour space entry with replacement-text and never writes twice", async () => {
    const bytes = describedBesideUnusedSpace();
    const { rewrite, calls } = countedRewrite();
    const { checkStructure, verdicts } = countedCheck();

    await expect(
      kindOf(bytes, [findTarget(bytes, 0, PLACE_NAME)], {
        ...PIPELINE,
        checkStructure,
        rewrite,
      }),
    ).resolves.toBe("replacement-text");
    expect(verdicts).toEqual(["ticked-description"]);
    expect(calls.count).toBe(0);
  });

  it.each([
    ["in the same owner", false],
    ["in another owner", true],
  ] as const)(
    "outranks an unreadable stream %s, which reads unreadable with nothing ticked",
    (_label, ownResources) => {
      const objects = describedBesideUnreadable(ownResources);
      withDoc(objects, (doc) => {
        expect(structureIsClean(doc, 1, foldTicked(["Clean"]))).toBe(
          "ticked-description",
        );
        expect(structureIsClean(doc, 1)).toBe("unreadable");
      });

      const { bytes } = writePdf({ objects, trailer: "/Root 1 0 R" });
      expect(
        checkOutput(
          mupdf,
          bytes.slice().buffer,
          [],
          new Map([[0, [TICKED_ELSEWHERE]]]),
          foldTicked(["Clean"]),
          (check, _count, ticked) => structureIsClean(check, 1, ticked),
        ),
      ).toBe("replacement-text");
    },
  );

  /**
   * A page that still shows the ticked name is a leak, which outranks the
   * hit: the text pass skipped on `marked-ticked.pdf`'s page 6 leaves the
   * name's glyphs, beside its `/Alt` naming it.
   */
  it("gives way to a ticked leak on a page, which is redaction-incomplete", async () => {
    const skip: Pass = () => {};
    const { checkStructure, verdicts } = countedCheck();

    await expect(
      kindOf(fixture("marked-ticked.pdf"), markedTargets(6), {
        ...PIPELINE,
        textPass: skip,
        checkStructure,
      }),
    ).resolves.toBe("redaction-incomplete");
    expect(verdicts).toEqual(["ticked-description"]);
  });

  /** Spec 0021's string place check runs right after, outside the seam, and wins. */
  it("gives way to a ticked text at a string place, which is redaction-incomplete", () => {
    const { bytes } = writePdf({
      objects: document({
        extra: ["<< /Registry (Adobe) /Ordering (RowanAshby) /Supplement 0 >>"],
      }),
      trailer: "/Root 1 0 R",
    });

    expect(
      checkOutput(
        mupdf,
        bytes.slice().buffer,
        [],
        new Map([[0, [TICKED_ELSEWHERE]]]),
        foldTicked(["Rowan Ashby"]),
        () => "ticked-description",
      ),
    ).toBe("redaction-incomplete");
  });

  it("answers replacement-text from the verdict alone, on a run with something ticked", () => {
    const { bytes } = writePdf({ objects: document(), trailer: "/Root 1 0 R" });

    expect(
      checkOutput(
        mupdf,
        bytes.slice().buffer,
        [],
        new Map([[0, [TICKED_ELSEWHERE]]]),
        foldTicked(["Clean"]),
        () => "ticked-description",
      ),
    ).toBe("replacement-text");
  });

  /** With nothing ticked the list is empty, so the scan never compares. */
  it("cannot arise with nothing ticked", () => {
    const objects = describedBesideUnreadable(false);
    objects[5] = stream("/Type /XObject /Subtype /Form /BBox [0 0 10 10]", "");
    withDoc(objects, (doc) => {
      expect(structureIsClean(doc, 1, [])).toBe("clean");
      expect(structureIsClean(doc, 1, foldTicked(["Clean"]))).toBe("ticked-description");
    });
  });
});
