import { describe, expect, it } from "vitest";

import {
  decodingParts,
  joinParts,
  readJpeg,
  readJpx,
  sameDecodingParts,
  type PictureKind,
  type PictureRead,
} from "@/engine/picture-reader";

import {
  box,
  codestream,
  codestreamComment,
  codestreamSegment,
  COLOUR,
  FILE_TYPE,
  IMAGE_HEADER,
  longBox,
  openBox,
  SIGNATURE,
  XMP_UUID,
} from "../../scripts/lib/jp2-writer.mjs";
import {
  adobe,
  bytes,
  comment,
  encodeJpeg,
  EOI,
  jfif,
  marker,
  segment,
  SOI,
} from "../../scripts/lib/jpeg-writer.mjs";

/**
 * The picture reader alone, on bytes built in the test. Spec 0025, AC-2 to
 * AC-5. Every strip is also read again, as the strip's guard reads it (AC-6):
 * the new bytes hold nothing to drop, and what a decoder reads is unchanged.
 */

const grey = encodeJpeg({
  width: 16,
  height: 16,
  pixel: (x: number, y: number) => (x * 7 + y * 11) % 256,
});
const colour = encodeJpeg({
  width: 16,
  height: 16,
  colour: true,
  separate: true,
  pixel: (x: number, y: number) => [x * 15, y * 15, 128],
});

/** SOI, `head`, the grey tables and scan, EOI, `tail`. */
function greyJpeg(head: Uint8Array[] = [], tail: Uint8Array | string = ""): Uint8Array {
  return bytes(SOI, ...head, ...grey.tables, ...grey.scans, EOI, tail);
}

const exifLike = segment(0xe1, bytes("Exif\0\0", "MM\0*", "secret camera"));
const xmpMain = segment(0xe1, bytes("http://ns.adobe.com/xap/1.0/\0", "<x:xmpmeta/>"));
const xmpExtended = segment(0xe1, bytes("http://ns.adobe.com/xmp/extension/\0", "0123"));
const icc = segment(0xe2, bytes("ICC_PROFILE\0", Uint8Array.of(1, 1), "profile bytes"));
const multiPicture = segment(0xe2, bytes("MPF\0", "II*\0"));

type Strip = Extract<PictureRead, { kind: "strip" }>;

function stripOf(read: PictureRead): Strip {
  if (read.kind !== "strip") throw new Error(`expected a strip, read ${read.kind}`);
  return read;
}

/** Strip `source`, then hold the guard's rule on the new bytes, and hand them back. */
function stripped(
  source: Uint8Array,
  kind: PictureKind,
  hasColourSpace = false,
): Uint8Array {
  const read = kind === "jpeg" ? readJpeg(source, hasColourSpace) : readJpx(source);
  const after = joinParts(source, stripOf(read).parts);
  const again = kind === "jpeg" ? readJpeg(after, hasColourSpace) : readJpx(after);
  expect(again.kind).toBe("clean");
  const before = decodingParts(source, kind, hasColourSpace);
  const now = decodingParts(after, kind, hasColourSpace);
  expect(before).not.toBeNull();
  expect(now).not.toBeNull();
  expect(sameDecodingParts(before!, now!)).toBe(true);
  return after;
}

const text = (data: Uint8Array): string => Buffer.from(data).toString("latin1");

describe("the JPEG rule (AC-2)", () => {
  it("leaves a picture holding only what a decoder needs alone (AC-5)", () => {
    expect(readJpeg(greyJpeg([jfif()]), true).kind).toBe("clean");
    expect(readJpeg(greyJpeg(), true).kind).toBe("clean");
    expect(readJpeg(greyJpeg([adobe()]), true).kind).toBe("clean");
  });

  it("drops every detail segment, reporting XMP apart", () => {
    const cases: [Uint8Array, string][] = [
      [exifLike, "other"],
      [xmpMain, "xmp"],
      [xmpExtended, "xmp"],
      [segment(0xed, bytes("Photoshop 3.0\0", "8BIM")), "other"],
      [comment("a comment"), "other"],
      [multiPicture, "other"],
      [segment(0xe0, bytes("JFXX\0", Uint8Array.of(0x10), "thumb")), "other"],
      [segment(0xe3, "maker data"), "other"],
      [segment(0xee, "NotAdobe at all"), "other"],
      [segment(0xef, "app15"), "other"],
      [segment(0xc8, "reserved"), "other"],
      [segment(0xf0, "reserved"), "other"],
      [segment(0xfd, "reserved"), "other"],
    ];
    for (const [part, kind] of cases) {
      const source = greyJpeg([jfif(), part]);
      const read = stripOf(readJpeg(source, true));
      expect([...read.dropped]).toEqual([kind]);
      expect(stripped(source, "jpeg", true)).toEqual(greyJpeg([jfif()]));
    }
  });

  it("keeps a decoding segment in place after a scan, and drops a detail between scans", () => {
    const [quant, frame, huffman] = colour.tables;
    const [first, second, third] = colour.scans;
    const restart = segment(0xdd, Uint8Array.of(0, 0));
    const source = bytes(
      SOI,
      adobe(),
      quant,
      frame,
      huffman,
      first,
      exifLike,
      huffman,
      restart,
      second,
      comment("between"),
      third,
      EOI,
    );
    const after = stripped(source, "jpeg", true);
    expect(after).toEqual(
      bytes(
        SOI,
        adobe(),
        quant,
        frame,
        huffman,
        first,
        huffman,
        restart,
        second,
        third,
        EOI,
      ),
    );
  });

  it("gives fill bytes to the marker after them", () => {
    const [quant, frame, huffman] = grey.tables;
    const fill = Uint8Array.of(0xff, 0xff);
    const source = bytes(
      SOI,
      fill,
      quant,
      fill,
      comment("gone"),
      frame,
      huffman,
      ...grey.scans,
      EOI,
    );
    expect(stripped(source, "jpeg")).toEqual(
      bytes(SOI, fill, quant, frame, huffman, ...grey.scans, EOI),
    );
  });

  it("reads stuffed bytes and restart markers as scan data, and fill before the end marker as the marker's", () => {
    const [quant, frame, huffman] = grey.tables;
    const header = segment(0xda, Uint8Array.of(1, 1, 0x00, 0, 63, 0));
    const data = Uint8Array.of(
      0x12,
      0xff,
      0x00,
      0x34,
      0xff,
      0xd0,
      0x56,
      0xff,
      0xd7,
      0x78,
    );
    const source = bytes(
      SOI,
      quant,
      frame,
      huffman,
      header,
      data,
      comment("after"),
      Uint8Array.of(0xff),
      EOI,
    );
    const after = stripped(source, "jpeg");
    expect(after).toEqual(
      bytes(SOI, quant, frame, huffman, header, data, Uint8Array.of(0xff), EOI),
    );
  });

  it("reads a missing end marker as the data ending inside the last scan", () => {
    const body = bytes(SOI, ...grey.tables, ...grey.scans);
    expect(readJpeg(body, true).kind).toBe("clean");
    const withComment = bytes(SOI, comment("gone"), ...grey.tables, ...grey.scans);
    expect(stripped(withComment, "jpeg")).toEqual(body);
  });

  it("keeps a whitespace tail as stored and drops any other", () => {
    expect(readJpeg(greyJpeg([], "\n\r \0\t\f"), true).kind).toBe("clean");
    const tail = greyJpeg([], bytes(SOI, comment("a second picture"), EOI));
    const read = stripOf(readJpeg(tail, true));
    expect([...read.dropped]).toEqual(["other"]);
    expect(stripped(tail, "jpeg")).toEqual(greyJpeg());
    expect(stripped(greyJpeg([], " x"), "jpeg")).toEqual(greyJpeg());
  });

  it("cuts a JFIF thumbnail and any extra bytes, keeping version, units and density", () => {
    const thumbnail = {
      width: 2,
      height: 1,
      pixels: Uint8Array.from("THUMB!", (c) => c.charCodeAt(0)),
    };
    for (const source of [
      greyJpeg([jfif({ thumbnail })]),
      greyJpeg([jfif({ extra: "padding" })]),
    ]) {
      const after = stripped(source, "jpeg");
      expect(after).toEqual(greyJpeg([jfif()]));
      expect(text(after)).not.toContain("THUMB!");
      expect(text(after)).not.toContain("padding");
    }
  });

  it("writes a long Adobe segment again as its first 12 payload bytes", () => {
    const long = segment(
      0xee,
      bytes("Adobe", Uint8Array.of(0, 100, 0, 0, 0, 0, 1), "and more"),
    );
    expect(stripped(greyJpeg([long]), "jpeg")).toEqual(greyJpeg([adobe()]));
  });

  it("keeps the embedded colour profile only when the dictionary names no colour space", () => {
    const source = greyJpeg([icc]);
    expect(readJpeg(source, false).kind).toBe("clean");
    expect(stripped(source, "jpeg", true)).toEqual(greyJpeg());
    expect(stripped(greyJpeg([icc, multiPicture]), "jpeg", false)).toEqual(
      greyJpeg([icc]),
    );
  });
});

describe("a JPEG the reader leaves as stored (AC-4)", () => {
  const [quant, frame, huffman] = grey.tables;
  const scans = grey.scans;
  const cases: Record<string, Uint8Array> = {
    "no start of image": bytes(...grey.tables, ...scans, EOI),
    "a length below 2": bytes(
      SOI,
      Uint8Array.of(0xff, 0xfe, 0, 1),
      ...grey.tables,
      ...scans,
      EOI,
    ),
    "a segment past the end": bytes(SOI, Uint8Array.of(0xff, 0xfe, 0x40, 0), "short"),
    "a byte where a marker should be": bytes(
      SOI,
      quant,
      Uint8Array.of(0x12),
      frame,
      huffman,
      ...scans,
      EOI,
    ),
    "a second start of image": bytes(SOI, quant, SOI, frame, huffman, ...scans, EOI),
    "a scan before any frame": bytes(SOI, quant, huffman, ...scans, frame, EOI),
    "an end before any scan": bytes(SOI, quant, frame, huffman, EOI, ...scans),
    "no scan at all": bytes(SOI, quant, frame, huffman),
    "a short JFIF header": bytes(
      SOI,
      segment(0xe0, "JFIF\0\x01\x02"),
      ...grey.tables,
      ...scans,
      EOI,
    ),
    "a short Adobe header": bytes(
      SOI,
      segment(0xee, "Adobe\0d"),
      ...grey.tables,
      ...scans,
      EOI,
    ),
    "a second JFIF header": greyJpeg([jfif(), exifLike, jfif()]),
    "a second Adobe header": greyJpeg([adobe(), exifLike, adobe()]),
    "a restart marker outside a scan": bytes(
      SOI,
      marker(0xd0),
      ...grey.tables,
      ...scans,
      EOI,
    ),
  };

  for (const [name, source] of Object.entries(cases)) {
    it(name, () => {
      expect(readJpeg(source, true).kind).toBe("as-stored");
      expect(decodingParts(source, "jpeg", true)).toBeNull();
    });
  }
});

/** A JP2 file: signature, file type, `header` in `jp2h`, then `rest`. */
function jp2(header: Uint8Array[], ...rest: Uint8Array[]): Uint8Array {
  return bytes(SIGNATURE, FILE_TYPE, box("jp2h", ...header), ...rest);
}

const plain = codestream();
const xml = box("xml ", "<details>secret</details>");
const xmpBox = box("uuid", Uint8Array.from(XMP_UUID), "<x:xmpmeta/>");
const resolution = box("res ", box("resc", Uint8Array.of(0, 1, 0, 1, 0, 1, 0, 1, 0, 0)));

describe("the JPEG 2000 rule (AC-3)", () => {
  it("leaves a bare codestream and a plain JP2 file alone (AC-5)", () => {
    expect(readJpx(plain).kind).toBe("clean");
    expect(readJpx(jp2([IMAGE_HEADER, COLOUR], box("jp2c", plain))).kind).toBe("clean");
    expect(readJpx(bytes(plain, "\n")).kind).toBe("clean");
  });

  it("drops a main header comment, keeping every tile part byte for byte", () => {
    const source = codestream({ extra: [codestreamComment("secret note")] });
    const after = stripped(source, "jpx");
    expect(after).toEqual(plain);
  });

  it("drops bytes after the end of codestream unless they are whitespace", () => {
    expect(stripped(codestream({ tail: "trailing secret" }), "jpx")).toEqual(plain);
  });

  it("keeps only the listed boxes, at both levels, and writes the header box's length anew", () => {
    const source = jp2(
      [IMAGE_HEADER, resolution, COLOUR],
      box("rreq", Uint8Array.of(1, 0, 0)),
      xml,
      xmpBox,
      box("uuid", "JpgTiffExif->JP2", "camera"),
      box("jp2i", "rights"),
      box("jp2c", codestream({ extra: [codestreamComment("c")], tail: "x" })),
      box("asoc", box("lbl ", "label")),
    );
    const read = stripOf(readJpx(source));
    expect([...read.dropped].sort()).toEqual(["other", "xmp"]);
    const after = stripped(source, "jpx");
    expect(after).toEqual(
      jp2(
        [IMAGE_HEADER, COLOUR],
        box("rreq", Uint8Array.of(1, 0, 0)),
        box("jp2c", plain),
      ),
    );
  });

  it("keeps a box's length form: an extended length, and a codestream box running to the end", () => {
    const long = jp2(
      [IMAGE_HEADER, COLOUR],
      xml,
      longBox("jp2c", codestream({ extra: [codestreamComment("c")] })),
    );
    expect(stripped(long, "jpx")).toEqual(
      jp2([IMAGE_HEADER, COLOUR], longBox("jp2c", plain)),
    );
    const open = jp2(
      [IMAGE_HEADER, COLOUR],
      xml,
      openBox("jp2c", codestream({ extra: [codestreamComment("c")] })),
    );
    expect(stripped(open, "jpx")).toEqual(
      jp2([IMAGE_HEADER, COLOUR], openBox("jp2c", plain)),
    );
  });

  it("reads a last tile part running to the end", () => {
    const toEnd = codestream({ lastToEnd: true, extra: [codestreamComment("c")] });
    expect(stripped(toEnd, "jpx")).toEqual(codestream({ lastToEnd: true }));
  });
});

describe("a JPEG 2000 picture the reader leaves as stored (AC-4)", () => {
  const unknown = codestreamSegment(0x6f, "??");
  const truncated = plain.slice(0, plain.length - 2);
  const cases: Record<string, Uint8Array> = {
    "neither form": bytes("not a picture at all"),
    "a box below its header size": bytes(SIGNATURE, Uint8Array.of(0, 0, 0, 4), "ftyp"),
    "a box past the end": bytes(SIGNATURE, Uint8Array.of(0, 0, 0x10, 0), "ftyp"),
    "a length 0 box inside jp2h": jp2(
      [IMAGE_HEADER, COLOUR, openBox("res ", "x")],
      box("jp2c", plain),
    ),
    "two header boxes": jp2(
      [IMAGE_HEADER, COLOUR],
      box("jp2h", IMAGE_HEADER, COLOUR),
      box("jp2c", plain),
    ),
    "no header box": bytes(SIGNATURE, FILE_TYPE, box("jp2c", plain)),
    "the codestream before the header": bytes(
      SIGNATURE,
      FILE_TYPE,
      box("jp2c", plain),
      box("jp2h", IMAGE_HEADER, COLOUR),
    ),
    "a kept box after the codestream": jp2(
      [IMAGE_HEADER, COLOUR],
      box("jp2c", plain),
      FILE_TYPE,
    ),
    "no image header": jp2([COLOUR], box("jp2c", plain)),
    "no colour specification": jp2([IMAGE_HEADER], box("jp2c", plain)),
    "a codestream box not starting the codestream": jp2(
      [IMAGE_HEADER, COLOUR],
      box("jp2c", "junk"),
    ),
    "a marker outside Part 1's list": codestream({ extra: [unknown] }),
    "a tile part past the codestream": truncated,
    "a length 0 tile part that is not the last": firstTileToEnd(),
    "hops that do not end at the end marker": bytes(
      plain.slice(0, plain.length - 2),
      "\xff\x64",
    ),
    "a comment in a tile part header": codestream({
      tileHeader: [codestreamComment("tile note")],
    }),
  };

  for (const [name, source] of Object.entries(cases)) {
    it(name, () => {
      expect(readJpx(source).kind).toBe("as-stored");
      expect(decodingParts(source, "jpx")).toBeNull();
    });
  }
});

/** The plain codestream with its first tile part's length set to 0 (to the end). */
function firstTileToEnd(): Uint8Array {
  const source = plain.slice();
  for (let index = 0; index + 1 < source.length; index += 1) {
    if (source[index] === 0xff && source[index + 1] === 0x90) {
      source.fill(0, index + 6, index + 10);
      return source;
    }
  }
  throw new Error("no tile part");
}
