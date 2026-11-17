import { readdirSync } from "node:fs";

import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  drawnShape,
  EngineFailure,
  PIPELINE,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  structureIsClean,
  walkRoles,
  WRITE_OPTIONS,
  type Pipeline,
  type RedactionTarget,
  type StructureVerdict,
} from "@/engine";
import { forEachDictionary } from "@/engine/objects";
import { sameDrawnShape } from "@/engine/self-check";

import {
  COLOUR_TEXT,
  KEPT_TEXT,
  UNREADABLE_PROFILE,
} from "../../scripts/lib/kept-fixtures.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
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
  mupdf,
  pageContent,
  pageRenders,
} from "../support/mupdf";
import { findTarget } from "../support/targets";

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
  const checkStructure: Pipeline["checkStructure"] = (check, count) => {
    const verdict = answer ?? structureIsClean(check, count);
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
    const checkStructure: Pipeline["checkStructure"] = (check, count) => {
      seen.push(structureIsClean(check, count));
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
 * check, which reads no picture nobody ticked and counts no figure. The run
 * level guard is "fails with unsupported when the second write changes what a
 * page draws", above; these hold what the shape counts.
 */
describe("the drawn shape a second write is held to", () => {
  it("counts each form once and lists every picture's stored length, smallest first", () => {
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

    expect(drawnShape(mupdf, bytes.slice().buffer)).toEqual({ forms: 2, images: [1, 3] });
  });

  it("tells two shapes apart by their forms and by any picture's stored length", () => {
    const shape = { forms: 2, images: [1, 3] };

    expect(sameDrawnShape(shape, { forms: 2, images: [1, 3] })).toBe(true);
    expect(sameDrawnShape(shape, { forms: 1, images: [1, 3] })).toBe(false);
    expect(sameDrawnShape(shape, { forms: 2, images: [0, 3] })).toBe(false);
    expect(sameDrawnShape(shape, { forms: 2, images: [1] })).toBe(false);
    expect(sameDrawnShape(shape, { forms: 2, images: [1, 3, 3] })).toBe(false);
  });
});

/** AC-16, AC-17: what a picture or a figure points at, merged by the write. */
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
    expect(names).toHaveLength(7);
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
