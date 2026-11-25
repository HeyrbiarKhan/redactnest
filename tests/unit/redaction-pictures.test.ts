import { createHash } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  joinParts,
  pictureFilter,
  PIPELINE,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  stripPictureDetails,
  structureIsClean,
  WRITE_OPTIONS,
  type Pipeline,
  type RedactionTarget,
} from "@/engine";

import {
  box,
  codestream,
  COLOUR,
  FILE_TYPE,
  IMAGE_HEADER,
  SIGNATURE,
} from "../../scripts/lib/jp2-writer.mjs";
import { encodeJpeg, jfif } from "../../scripts/lib/jpeg-writer.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import {
  exif,
  iccProfile,
  iccSegment,
  jpeg,
  PICTURE_KEPT_PROFILE,
  PICTURE_LINES,
  PICTURE_MARKERS,
  PICTURE_TICKED,
} from "../../scripts/lib/picture-fixtures.mjs";
import { fixture } from "../support/bytes";
import {
  inspect,
  mupdf,
  pageContent,
  pageRenders,
  storedStreams,
} from "../support/mupdf";
import { findTarget } from "../support/targets";

/**
 * The details stored inside a kept picture. Spec 0025.
 *
 * Every picture here is written from code by the fixture script or by the
 * test itself (INV-8). Each output is read with `tests/support/mupdf.ts`,
 * which reads raw streams with its own code, never the engine's reader.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

/** The pipeline with the strip swapped for one that changes nothing. */
const NO_STRIP: Pipeline = Object.freeze({
  ...PIPELINE,
  stripPictureDetails: async () => Object.freeze({ xmp: false, details: false }),
});

/**
 * The strip and the structure check both swapped out, as the gate's `MAIN`
 * does: a run writes what main wrote, for comparing pixels (AC-10).
 */
const MAIN_LIKE: Pipeline = Object.freeze({
  ...NO_STRIP,
  checkStructure: () => "clean" as const,
});

/** The kind a run fails with, or `null` if it made a file. */
async function runKind(
  bytes: ArrayBuffer,
  targets: readonly RedactionTarget[] = [],
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

/** Every marker string still in any stored stream of `bytes`. */
function markersLeft(bytes: ArrayBuffer, markers: readonly string[]): string[] {
  const streams = storedStreams(bytes);
  return markers.filter((marker) => streams.some((data) => data.includes(marker)));
}

/** A digest of every image stream's decoded pixels, sorted, so two files' pictures compare as sets. */
function decodedPictures(bytes: ArrayBuffer): string[] {
  return inspect(bytes, (doc) => {
    const found: string[] = [];
    for (let num = 1; num < doc.countObjects(); num += 1) {
      const ref = doc.newIndirect(num);
      if (!ref.isStream()) continue;
      const subtype = ref.get("Subtype");
      if (!subtype.isName() || subtype.asName() !== "Image") continue;
      const image = doc.loadImage(ref);
      try {
        const pixmap = image.toPixmap();
        try {
          found.push(createHash("sha256").update(pixmap.getPixels()).digest("hex"));
        } finally {
          pixmap.destroy();
        }
      } finally {
        image.destroy();
      }
    }
    return found.sort();
  });
}

/** Each image stream's `/Filter`, as MuPDF prints it, sorted. */
function pictureFilters(bytes: ArrayBuffer): string[] {
  return inspect(bytes, (doc) => {
    const found: string[] = [];
    for (let num = 1; num < doc.countObjects(); num += 1) {
      const ref = doc.newIndirect(num);
      if (!ref.isStream()) continue;
      const subtype = ref.get("Subtype");
      if (!subtype.isName() || subtype.asName() !== "Image") continue;
      found.push(ref.get("Filter").toString());
    }
    return found.sort();
  });
}

const buffer = (data: Uint8Array): ArrayBuffer => data.slice().buffer;

/**
 * A one page document drawing `picture` 64 points square at 72, 700, under a
 * line of Helvetica 14 at 72, 720 holding `line`, so a target on the line
 * lies over the picture.
 */
function documentWith(picture: ReturnType<typeof stream>, line: string): ArrayBuffer {
  return buffer(
    writePdf({
      objects: [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
          "/Resources << /Font << /F1 4 0 R >> /XObject << /Im1 6 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        stream(
          "",
          `q 64 0 0 64 72 700 cm /Im1 Do Q\nBT /F1 14 Tf 72 720 Td (${line}) Tj ET`,
        ),
        picture,
      ],
      trailer: "/Root 1 0 R",
    }).bytes,
  );
}

/** A grey JPEG `size` pixels square, as an image stream, with `head` before its tables. */
function greyPicture(
  size: number,
  head: Uint8Array[],
  extra = "/ColorSpace /DeviceGray",
): ReturnType<typeof stream> {
  const encoded = encodeJpeg({
    width: size,
    height: size,
    pixel: (x: number, y: number) => 60 + ((x * 3 + y * 7) % 120),
  });
  return stream(
    `/Type /XObject /Subtype /Image /Width ${size} /Height ${size} ${extra} ` +
      "/BitsPerComponent 8 /Filter /DCTDecode",
    jpeg(encoded, { head }),
  );
}

describe("MuPDF 1.28.1, what the strip rests on (task 1)", () => {
  /**
   * The design rests on three: `readRawStream` and `writeRawStream` work
   * through an unresolved reference on a grafted document, the deduplicating
   * write keeps the new data, and the write leaves a DCT and a JPX stream's
   * bytes alone. If one fails after an upgrade, stop and take it to
   * `/architect`.
   */
  it("keeps new data written through a reference on a grafted document, its filter, and DCT and JPX bytes", () => {
    const source = fixture("picture-jpeg.pdf");
    const plain = jpeg(encodeJpeg({ width: 16, height: 16, pixel: () => 90 }), {
      head: [jfif()],
    });
    const jpx = codestream();
    const jp2 = new Uint8Array([
      ...SIGNATURE,
      ...FILE_TYPE,
      ...box("jp2h", IMAGE_HEADER, COLOUR),
      ...box("jp2c", jpx),
    ]);

    const written = inspect(source, (work) => {
      const out = new mupdf.PDFDocument();
      try {
        const map = out.newGraftMap();
        map.graftPage(0, work, 0);
        map.destroy();
        let picture = null;
        for (let num = 1; num < out.countObjects(); num += 1) {
          const ref = out.newIndirect(num);
          const subtype = ref.isStream() ? ref.get("Subtype") : null;
          if (subtype?.isName() && subtype.asName() === "Image") picture = ref;
        }
        expect(picture).not.toBeNull();
        picture!.writeRawStream(plain);

        const dict = out.newDictionary();
        dict.put("Type", out.newName("XObject"));
        dict.put("Subtype", out.newName("Image"));
        dict.put("Width", 16);
        dict.put("Height", 16);
        dict.put("ColorSpace", out.newName("DeviceGray"));
        dict.put("BitsPerComponent", 8);
        dict.put("Filter", out.newName("JPXDecode"));
        const jpxRef = out.addRawStream(jp2, dict);
        out.findPage(0).get("Resources").get("XObject").put("Jx", jpxRef);
        const contents = out.findPage(0).get("Contents");
        const old = contents.readStream();
        const drawing = Buffer.from(old.asUint8Array()).toString("latin1");
        old.destroy();
        contents.writeStream(`${drawing}\nq 16 0 0 16 300 520 cm /Jx Do Q`);

        const saved = out.saveToBuffer(WRITE_OPTIONS);
        try {
          return saved.asUint8Array().slice().buffer;
        } finally {
          saved.destroy();
        }
      } finally {
        out.destroy();
      }
    });

    const streams = storedStreams(written);
    const latin = (data: Uint8Array) => Buffer.from(data).toString("latin1");
    expect(streams).toContain(latin(plain));
    expect(streams).toContain(latin(jp2));
    expect(pictureFilters(written)).toEqual(["/DCTDecode", "/JPXDecode"]);
  });

  /** AC-7: a picture the padded pass blanks is written again as Flate, so its details go with the decode. */
  it("writes a blanked DCT picture again as Flate", async () => {
    const line = "Contact ana.ruiz@example.com today";
    const bytes = documentWith(
      greyPicture(64, [jfif(), exif({ make: "RN-PIN-MAKE", datum: "RN-PIN-DATUM" })]),
      line,
    );
    const target = findTarget(bytes, 0, "ana.ruiz@example.com");
    const result = await redactDocumentWith(mupdf, bytes, [target], {}, NO_STRIP);
    expect(pictureFilters(result.output)).toEqual(["/FlateDecode"]);
    expect(markersLeft(result.output, ["RN-PIN-MAKE", "RN-PIN-DATUM"])).toEqual([]);
  });

  /**
   * Measured for `rationale.md`: MuPDF 1.28.1 does not read an embedded ICC
   * profile for a DCT picture whose dictionary names no colour space, so a
   * gamma 3 profile changes no pixel. The rule keeps the profile either way
   * (AC-2); a release that starts reading it shows here.
   */
  it("draws a DCT picture with no colour space the same with and without an embedded profile", () => {
    const profile = iccProfile({ space: "GRAY", gamma: 3, description: "pin" });
    const without = documentWith(greyPicture(16, [jfif()], ""), "Plain line");
    const withProfile = documentWith(
      greyPicture(16, [jfif(), iccSegment(profile)], ""),
      "Plain line",
    );
    expect(pageRenders(withProfile)).toEqual(pageRenders(without));
  });
});

/** Every marker `picture-jpeg.pdf` carries, every page's. */
const JPEG_MARKERS: readonly string[] = Object.values(
  PICTURE_MARKERS["picture-jpeg.pdf"] as Record<string, readonly string[]>,
).flat();

/** Every marker `picture-kept.pdf` carries, each of which must stay. */
const KEPT_MARKERS: readonly string[] = Object.values(
  PICTURE_MARKERS["picture-kept.pdf"] as Record<string, readonly string[]>,
).flat();

/** The ticked line's address on `picture-jpeg.pdf` page 6, as a target. */
function tickedOnPageSix(bytes: ArrayBuffer): RedactionTarget {
  return findTarget(bytes, 5, PICTURE_TICKED);
}

/** Does any stored stream of `bytes` hold `text`? */
function holds(bytes: ArrayBuffer, text: string): boolean {
  return storedStreams(bytes).some((data) => data.includes(text));
}

describe("picture-jpeg.pdf: every detail gone (AC-1, AC-2, AC-7, AC-9, AC-10)", () => {
  it("holds every marker before a run, and a line on every page", () => {
    const source = fixture("picture-jpeg.pdf");
    expect(markersLeft(source, JPEG_MARKERS)).toEqual([...JPEG_MARKERS]);
    expect(holds(source, PICTURE_KEPT_PROFILE)).toBe(true);
    expect(inspect(source, (doc) => doc.countPages())).toBe(
      PICTURE_LINES["picture-jpeg.pdf"].length,
    );
  });

  it("leaves no marker with nothing ticked, keeps the pixels and the profile, and reports both kinds", async () => {
    const source = fixture("picture-jpeg.pdf");
    const result = await redactDocumentWith(mupdf, source, []);
    expect(markersLeft(result.output, JPEG_MARKERS)).toEqual([]);
    expect(result.sanitized).toEqual(["xmp-metadata", "picture-details"]);

    // What a decoder reads stays: the JFIF header (page 1 and the cut one on
    // page 3), the Adobe header (page 2), the profile page 4 may need.
    expect(holds(result.output, "JFIF\0")).toBe(true);
    expect(holds(result.output, "Adobe")).toBe(true);
    expect(holds(result.output, PICTURE_KEPT_PROFILE)).toBe(true);
    expect(holds(result.output, "JFXX")).toBe(false);
    expect(holds(result.output, "ICC_PROFILE")).toBe(true);

    expect(decodedPictures(result.output)).toEqual(decodedPictures(source));
    const unstripped = await redactDocumentWith(mupdf, source, [], {}, MAIN_LIKE);
    expect(pageRenders(result.output)).toEqual(pageRenders(unstripped.output));
  });

  /**
   * AC-5: the control keeps every byte, whitespace tail included. Its stored
   * bytes are found whole in the output.
   */
  it("keeps the control picture byte for byte", async () => {
    const source = fixture("picture-jpeg.pdf");
    const control = storedStreams(source).filter(
      (data) => data.startsWith("\xff\xd8") && data.endsWith("\xff\xd9\r\n"),
    );
    expect(control).toHaveLength(1);
    const { output } = await redactDocumentWith(mupdf, source, []);
    expect(storedStreams(output)).toContain(control[0]);
  });

  /**
   * AC-7: with page 6's line ticked, its picture is blanked and written again
   * as Flate, which the strip never reads, and still no detail is left. Every
   * page draws as main draws it with the same tick.
   */
  it("leaves no detail in a picture the padded pass blanked", async () => {
    const source = fixture("picture-jpeg.pdf");
    const target = tickedOnPageSix(source);
    const result = await redactDocumentWith(mupdf, source, [target]);
    expect(markersLeft(result.output, JPEG_MARKERS)).toEqual([]);
    expect(pictureFilters(result.output)).toContain("/FlateDecode");
    expect(result.removedByType).toEqual({ email: 1 });

    const unstripped = await redactDocumentWith(mupdf, source, [target], {}, MAIN_LIKE);
    expect(pageRenders(result.output)).toEqual(pageRenders(unstripped.output));
  });
});

describe("the strip's guard (AC-6)", () => {
  it("fails the run with unsupported when a kept byte changes", async () => {
    const corrupt: Pipeline = {
      ...PIPELINE,
      stripPictureDetails: (out, checkpoint) =>
        stripPictureDetails(out, checkpoint, (bytes, parts) => {
          const next = joinParts(bytes, parts);
          next[next.length - 3] ^= 0x01;
          return next;
        }),
    };
    expect(await runKind(fixture("picture-jpeg.pdf"), [], corrupt)).toBe("unsupported");
  });

  it("hears a cancel after a picture it writes", async () => {
    let cancelled = false;
    const cancelling: Pipeline = {
      ...PIPELINE,
      stripPictureDetails: (out, checkpoint) => {
        cancelled = true;
        return stripPictureDetails(out, checkpoint);
      },
    };
    await expect(
      redactDocumentWith(
        mupdf,
        fixture("picture-jpeg.pdf"),
        [],
        { isCancelled: () => cancelled },
        cancelling,
      ),
    ).rejects.toBeInstanceOf(RunCancelled);
  });
});

describe("the self check holds the rule (AC-8)", () => {
  it("fails a picture still holding a detail as a leak", async () => {
    expect(await runKind(fixture("picture-jpeg.pdf"), [], NO_STRIP)).toBe(
      "redaction-incomplete",
    );
  });

  it("passes a picture holding nothing to drop with the strip skipped", async () => {
    const bytes = documentWith(greyPicture(16, [jfif()]), "Plain line");
    expect(await runKind(bytes, [], NO_STRIP)).toBeNull();
  });

  /**
   * The stripped output passes; the same output with one DCT picture's stored
   * bytes replaced by page 1's source picture, details and all, is a leak.
   */
  it("answers leak on written bytes whose picture still holds a detail", async () => {
    const source = fixture("picture-jpeg.pdf");
    const pages = PICTURE_LINES["picture-jpeg.pdf"].length;
    const original = storedStreams(source).find((data) =>
      data.includes(PICTURE_MARKERS["picture-jpeg.pdf"][1][0]),
    );
    expect(original).toBeDefined();
    const { output } = await redactDocumentWith(mupdf, source, []);
    expect(inspect(output, (doc) => structureIsClean(doc, pages))).toBe("clean");

    const restored = inspect(output, (doc) => {
      for (let num = 1; num < doc.countObjects(); num += 1) {
        const ref = doc.newIndirect(num);
        if (!ref.isStream()) continue;
        const filter = ref.get("Filter");
        if (filter.isName() && filter.asName() === "DCTDecode") {
          ref.writeRawStream(Buffer.from(original!, "latin1"));
          break;
        }
      }
      const saved = doc.saveToBuffer("");
      try {
        return saved.asUint8Array().slice().buffer;
      } finally {
        saved.destroy();
      }
    });
    expect(inspect(restored, (doc) => structureIsClean(doc, pages))).toBe("leak");
  });
});

/**
 * Each JPEG 2000 picture's bytes from its first tile part (`FF 90`) to its end
 * of codestream marker, sorted, read by the test's own search, never the
 * engine's reader. The hand built codestreams hold no `FF 90` before their
 * tile parts and no `FF D9` after.
 */
function tileParts(bytes: ArrayBuffer): string[] {
  return storedStreams(bytes)
    .filter((data) => data.includes("\xff\x4f\xff\x51"))
    .map((data) => data.slice(data.indexOf("\xff\x90"), data.lastIndexOf("\xff\xd9") + 2))
    .sort();
}

describe("picture-jpx.pdf: every detail gone, tile parts byte for byte (AC-3, AC-10)", () => {
  const markers: readonly string[] = Object.values(
    PICTURE_MARKERS["picture-jpx.pdf"] as Record<string, readonly string[]>,
  ).flat();

  it("holds every marker before a run", () => {
    expect(markersLeft(fixture("picture-jpx.pdf"), markers)).toEqual([...markers]);
  });

  it("leaves no marker, keeps the tile parts and pixels, and reports both kinds", async () => {
    const source = fixture("picture-jpx.pdf");
    const result = await redactDocumentWith(mupdf, source, []);
    expect(markersLeft(result.output, markers)).toEqual([]);
    expect(result.sanitized).toEqual(["xmp-metadata", "picture-details"]);
    expect(holds(result.output, "resc")).toBe(false);
    expect(holds(result.output, "jp2h")).toBe(true);
    expect(tileParts(result.output)).toEqual(tileParts(source));
    expect(tileParts(source)).toHaveLength(3);
    expect(pictureFilters(result.output)).toEqual(Array(3).fill("/JPXDecode"));

    expect(decodedPictures(result.output)).toEqual(decodedPictures(source));
    const unstripped = await redactDocumentWith(mupdf, source, [], {}, MAIN_LIKE);
    expect(pageRenders(result.output)).toEqual(pageRenders(unstripped.output));
  });

  it("fails the check with the strip skipped (AC-8)", async () => {
    expect(await runKind(fixture("picture-jpx.pdf"), [], NO_STRIP)).toBe(
      "redaction-incomplete",
    );
  });
});

describe("picture-kept.pdf: pictures left as stored (AC-1, AC-4, AC-10, INV-6)", () => {
  it("keeps every marker, passes the check, and reports nothing", async () => {
    const source = fixture("picture-kept.pdf");
    const result = await redactDocumentWith(mupdf, source, []);
    const inline = pageContent(result.output, 2);
    const left = KEPT_MARKERS.filter(
      (marker) => holds(result.output, marker) || inline.includes(marker),
    );
    expect(left).toEqual([...KEPT_MARKERS]);
    expect(result.sanitized).toEqual([]);
    expect(decodedPictures(result.output)).toEqual(decodedPictures(source));
  });

  it("makes the same file with the strip skipped, since nothing is taken apart", async () => {
    const source = fixture("picture-kept.pdf");
    const stripped = await redactDocumentWith(mupdf, source, []);
    const skipped = await redactDocumentWith(mupdf, source, [], {}, NO_STRIP);
    expect(new Uint8Array(skipped.output)).toEqual(new Uint8Array(stripped.output));
  });
});

/**
 * Which pictures the strip reads, by their filter (AC-1). Each case is a
 * stream written in the test; `pictureFilter` reads it through its
 * reference, as the strip and the self check both do (INV-2).
 */
describe("which filter the strip reads (AC-1)", () => {
  const FILTERS: readonly (readonly [string, string, "jpeg" | "jpx" | null])[] = [
    ["a direct /DCTDecode", "/Filter /DCTDecode", "jpeg"],
    ["a direct /JPXDecode", "/Filter /JPXDecode", "jpx"],
    ["an array of one /DCTDecode", "/Filter [/DCTDecode]", "jpeg"],
    ["an array of one /JPXDecode", "/Filter [/JPXDecode]", "jpx"],
    ["a chain ending in /DCTDecode", "/Filter [/FlateDecode /DCTDecode]", null],
    ["the inline short name /DCT", "/Filter /DCT", null],
    ["the inline short name /JPX", "/Filter /JPX", null],
    ["an indirect /Filter", "/Filter 99 0 R", null],
    ["an array holding an indirect name", "/Filter [99 0 R]", null],
    ["data in an external file", "/Filter /DCTDecode /F (picture.jpg)", null],
    ["another filter", "/Filter /FlateDecode", null],
    ["no filter", "", null],
  ];

  it("names a direct DCT or JPX filter, alone or as an array of one, and nothing else", () => {
    const first = 4;
    const objects: (string | ReturnType<typeof stream>)[] = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>",
      ...FILTERS.map(([, filter]) =>
        stream(
          `/Type /XObject /Subtype /Image /Width 1 /Height 1 ${filter.replace("99 0 R", `${first + FILTERS.length} 0 R`)}`,
          "x",
        ),
      ),
      "/DCTDecode",
    ];
    const source = buffer(writePdf({ objects, trailer: "/Root 1 0 R" }).bytes);
    const read = inspect(source, (doc) =>
      FILTERS.map((_, index) => pictureFilter(doc.newIndirect(first + index))),
    );
    expect(
      Object.fromEntries(FILTERS.map(([name], index) => [name, read[index]])),
    ).toEqual(Object.fromEntries(FILTERS.map(([name, , kind]) => [name, kind])));
  });

  /** A one page document whose picture, filtered by `filter`, carries an EXIF make. */
  function documentFiltered(filter: string): ArrayBuffer {
    const encoded = encodeJpeg({
      width: 16,
      height: 16,
      pixel: (x: number, y: number) => 60 + ((x * 3 + y * 7) % 120),
    });
    const picture = stream(
      "/Type /XObject /Subtype /Image /Width 16 /Height 16 /ColorSpace /DeviceGray " +
        `/BitsPerComponent 8 ${filter}`,
      jpeg(encoded, { head: [jfif(), exif({ make: FILTER_MAKE, datum: "WGS-84" })] }),
    );
    return buffer(
      writePdf({
        objects: [
          "<< /Type /Catalog /Pages 2 0 R >>",
          "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
          "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
            "/Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
          stream("", "q 64 0 0 64 72 700 cm /Im1 Do Q"),
          picture,
          "/DCTDecode",
        ],
        trailer: "/Root 1 0 R",
      }).bytes,
    );
  }

  const FILTER_MAKE = "RN-FILTER-MAKE";

  it("strips a picture filtered by an array of one /DCTDecode", async () => {
    const source = documentFiltered("/Filter [/DCTDecode]");
    expect(holds(source, FILTER_MAKE)).toBe(true);
    const result = await redactDocumentWith(mupdf, source, []);
    expect(holds(result.output, FILTER_MAKE)).toBe(false);
    expect(result.sanitized).toEqual(["picture-details"]);
    expect(decodedPictures(result.output)).toEqual(decodedPictures(source));
  });

  it.each([
    ["an indirect /Filter", "/Filter 6 0 R"],
    ["the inline short name /DCT", "/Filter /DCT"],
  ])(
    "leaves a picture with %s as stored, passes the check and reports nothing",
    async (_, filter) => {
      const source = documentFiltered(filter);
      const result = await redactDocumentWith(mupdf, source, []);
      expect(holds(result.output, FILTER_MAKE)).toBe(true);
      expect(result.sanitized).toEqual([]);
    },
  );
});
