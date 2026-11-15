import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  PIPELINE,
  redactDocumentWith,
  silenceEngineLog,
  structureIsClean,
  type Pipeline,
  type RedactionTarget,
} from "@/engine";

import { KEPT_TEXT } from "../../scripts/lib/kept-fixtures.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { fixture } from "../support/bytes";
import {
  containsInAnyEncoding,
  decodedStreams,
  decompressedBytes,
  everyKey,
  everyTypeName,
  inspect,
  mupdf,
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

function verdictOf(objects: Body[], trailer = "/Root 1 0 R"): string {
  const { bytes } = writePdf({ objects, trailer });
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    return structureIsClean(doc.asPDF() as PDFDocument, 1);
  } finally {
    doc.destroy();
  }
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
    [
      "an embedded file stream nothing reaches",
      document({ extra: [stream("/Type /EmbeddedFile", "attached")] }),
    ],
    [
      "a stream reached as both an image and a form",
      document({ image: "/SMask 6 0 R " }),
    ],
    ["a value outside its key's shape", document({ font: "/Widths << /A 1 >> " })],
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
