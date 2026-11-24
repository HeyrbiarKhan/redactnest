/**
 * The picture detail fixtures. Spec 0025, AC-13.
 *
 * A JPEG or JPEG 2000 picture can carry its own details inside its data: a
 * camera's make, a location, XMP, IPTC captions, comments, a thumbnail, a
 * second picture after the end. Every picture here is written by
 * `jpeg-writer.mjs` or `jp2-writer.mjs`, from code: no real photo, nothing
 * made by MuPDF, nothing read from outside the repository (INV-8). Each detail
 * holds a plain ASCII marker string the tests search the output's raw streams
 * for (`PICTURE_MARKERS`).
 *
 * Each page draws its picture beside one line of Helvetica, so the open reads
 * it and no earlier refusal takes it. No `/ToUnicode`, no date, no randomness.
 */

import { deflateSync } from "node:zlib";

import {
  box,
  codestream,
  codestreamComment,
  COLOUR,
  EXIF_UUID,
  FILE_TYPE,
  IMAGE_HEADER,
  openBox,
  SIGNATURE,
  XMP_UUID,
} from "./jp2-writer.mjs";
import {
  adobe,
  bytes,
  comment,
  encodeJpeg,
  EOI,
  jfif,
  segment,
  SOI,
} from "./jpeg-writer.mjs";
import { latin1, stream, writePdf } from "./pdf-writer.mjs";

/**
 * Every marker string a page's pictures carry, by fixture and page (1 based),
 * and the readable line each page draws. A test reads both from here, so the
 * fixture and its proof never drift apart.
 */
export const PICTURE_MARKERS = Object.freeze({
  "picture-jpeg.pdf": Object.freeze({
    1: Object.freeze([
      "RN-EXIF-MAKE-1",
      "RN-GPS-DATUM-1",
      "RN-XMP-PACKET-1",
      "RN-IPTC-CAPTION-1",
      "RN-COMMENT-1",
      "RN-APPENDED-1",
    ]),
    2: Object.freeze(["RN-EXIF-MAKE-2", "RN-GPS-DATUM-2", "RN-COMMENT-2"]),
    3: Object.freeze(["RN-JFIF-THUMB-3", "RN-JFXX-THUMB-3", "RN-ICC-GONE-3", "RN-MPF-3"]),
    4: Object.freeze(["RN-EXIF-MAKE-4", "RN-GPS-DATUM-4"]),
    5: Object.freeze([
      "RN-EXIF-MASK-5",
      "RN-GPS-MASK-5",
      "RN-EXIF-FORM-5",
      "RN-GPS-FORM-5",
    ]),
    6: Object.freeze(["RN-EXIF-MAKE-6", "RN-GPS-DATUM-6"]),
    7: Object.freeze([]),
  }),
  // Every one of these stays: each picture is one the reader leaves as stored
  // (AC-1, AC-4), so its details are a recorded limit (AC-11).
  "picture-kept.pdf": Object.freeze({
    1: Object.freeze(["RN-KEPT-CHAIN-1", "RN-KEPT-CHAIN-GPS-1"]),
    2: Object.freeze(["RN-KEPT-ADOBE-2", "RN-KEPT-ADOBE-GPS-2"]),
    3: Object.freeze(["RN-KEPT-INLINE-3", "RN-KEPT-INLINE-GPS-3"]),
    4: Object.freeze(["RN-KEPT-TILE-4", "RN-KEPT-XML-4"]),
  }),
  "picture-jpx.pdf": Object.freeze({
    1: Object.freeze([
      "RN-JPX-XML-1",
      "RN-JPX-XMP-1",
      "RN-JPX-EXIF-1",
      "RN-JPX-IPR-1",
      "RN-JPX-COM-1",
      "RN-JPX-TAIL-1",
      "RN-JPX-AFTER-1",
    ]),
    2: Object.freeze(["RN-JPX-COM-2"]),
    3: Object.freeze(["RN-JPX-XML-3", "RN-JPX-COM-3"]),
  }),
});

/**
 * The marker a run must keep in `picture-jpeg.pdf`: page 4's colour profile,
 * which the picture may need when its dictionary names no colour space (AC-2).
 */
export const PICTURE_KEPT_PROFILE = "RN-ICC-KEPT-4";

export const PICTURE_LINES = Object.freeze({
  "picture-jpeg.pdf": Object.freeze([
    "Site photo one",
    "Site photo two in three scans",
    "Site photo three with thumbnails",
    "Site photo four with its own colours",
    "Site photo five as a mask and in a form",
    "ana.ruiz@example.com leads the survey",
    "Site photo seven, nothing to drop",
  ]),
  "picture-kept.pdf": Object.freeze([
    "Kept photo one under two filters",
    "Kept photo two with two Adobe headers",
    "Kept photo three written inline",
    "Kept photo four with a tile part note",
  ]),
  "picture-jpx.pdf": Object.freeze([
    "Plan scan one in JP2 boxes",
    "Plan scan two as a bare codestream",
    "Plan scan three running to the end",
  ]),
});

/** The address on `picture-jpeg.pdf` page 6, the line over its picture, ticked by the tests. */
export const PICTURE_TICKED = "ana.ruiz@example.com";

/* The detail segments a camera or an editor writes. */

/** A big endian number in `size` bytes. */
function be(value, size) {
  const out = new Uint8Array(size);
  for (
    let index = size - 1, rest = value;
    index >= 0;
    index -= 1, rest = Math.floor(rest / 256)
  ) {
    out[index] = rest % 256;
  }
  return out;
}

/** An ASCII TIFF string: its text and a closing zero, padded to an even length. */
function tiffString(text) {
  const raw = bytes(text, "\0");
  return raw.length % 2 === 0 ? raw : bytes(raw, "\0");
}

/**
 * An `APP1` EXIF segment, as a camera writes it: `Exif\0\0`, then a big endian
 * TIFF header, the first directory with the camera's make and a pointer to
 * the GPS directory, and the GPS directory with its map datum. Both strings
 * are markers.
 */
export function exif({ make, datum }) {
  const makeBytes = tiffString(make);
  const datumBytes = tiffString(datum);
  const first = 8;
  const makeAt = first + 2 + 2 * 12 + 4;
  const gpsAt = makeAt + makeBytes.length;
  const datumAt = gpsAt + 2 + 12 + 4;

  const entry = (tag, type, count, value) =>
    bytes(be(tag, 2), be(type, 2), be(count, 4), be(value, 4));

  const tiff = bytes(
    "MM",
    be(42, 2),
    be(first, 4),
    be(2, 2),
    entry(0x010f, 2, make.length + 1, makeAt),
    entry(0x8825, 4, 1, gpsAt),
    be(0, 4),
    makeBytes,
    be(1, 2),
    entry(0x0012, 2, datum.length + 1, datumAt),
    be(0, 4),
    datumBytes,
  );
  return segment(0xe1, bytes("Exif\0\0", tiff));
}

/** A number as ICC's `s15Fixed16`: rounded once to sixteenths of a unit, four bytes. */
function fixed16(value) {
  return be((Math.round(value * 65536) + 2 ** 32) % 2 ** 32, 4);
}

/** An ICC `XYZType` holding one colour. */
function xyz([x, y, z]) {
  return bytes("XYZ ", be(0, 4), fixed16(x), fixed16(y), fixed16(z));
}

/**
 * A small ICC version 2 display profile written from code: grey (`GRAY`, a
 * `kTRC` curve) or RGB (`RGB `, three colourants over the sRGB primaries
 * adapted to D50, and one curve for all three), each curve a plain `gamma`,
 * and a `desc` tag holding `description`, which can be a marker string. Its
 * date is fixed, so the bytes never change.
 */
export function iccProfile({ space, gamma, description }) {
  const descText = bytes(description, "\0");
  const desc = bytes(
    "desc",
    be(0, 4),
    be(descText.length, 4),
    descText,
    be(0, 4),
    be(0, 4),
    be(0, 2),
    Uint8Array.of(0),
    new Uint8Array(67),
  );
  const curve = bytes(
    "curv",
    be(0, 4),
    be(1, 4),
    be(Math.round(gamma * 256), 2),
    be(0, 2),
  );
  const white = xyz([0.9642, 1, 0.8249]);

  const tags =
    space === "GRAY"
      ? [
          ["desc", desc],
          ["wtpt", white],
          ["kTRC", curve],
        ]
      : [
          ["desc", desc],
          ["wtpt", white],
          ["rXYZ", xyz([0.4361, 0.2225, 0.0139])],
          ["gXYZ", xyz([0.3851, 0.7169, 0.0971])],
          ["bXYZ", xyz([0.1431, 0.0606, 0.7141])],
          ["rTRC", curve],
          ["gTRC", curve],
          ["bTRC", curve],
        ];

  // Each tag's data four byte aligned, after the header and the tag table.
  const padded = (data) =>
    data.length % 4 === 0 ? data : bytes(data, new Uint8Array(4 - (data.length % 4)));
  let offset = 128 + 4 + tags.length * 12;
  const table = [];
  const data = [];
  for (const [signature, body] of tags) {
    table.push(bytes(signature, be(offset, 4), be(body.length, 4)));
    const aligned = padded(body);
    data.push(aligned);
    offset += aligned.length;
  }

  const header = bytes(
    be(offset, 4),
    be(0, 4),
    be(0x02100000, 4),
    "mntr",
    space,
    "XYZ ",
    be(2026, 2),
    be(1, 2),
    be(1, 2),
    be(0, 2),
    be(0, 2),
    be(0, 2),
    "acsp",
    be(0, 4),
    be(0, 4),
    be(0, 4),
    be(0, 4),
    new Uint8Array(8),
    be(0, 4),
    fixed16(0.9642),
    fixed16(1),
    fixed16(0.8249),
    be(0, 4),
    new Uint8Array(44),
  );
  return bytes(header, be(tags.length, 4), ...table, ...data);
}

/** An `APP2` segment carrying a whole ICC profile in one chunk (sequence 1 of 1). */
export function iccSegment(profile) {
  return segment(0xe2, bytes("ICC_PROFILE\0", Uint8Array.of(1, 1), profile));
}

/** An `APP1` XMP packet whose title is `title`. */
export function xmp(title) {
  return segment(
    0xe1,
    bytes(
      "http://ns.adobe.com/xap/1.0/\0",
      '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>',
      '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF ',
      'xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
      '<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/">',
      `<dc:title>${title}</dc:title></rdf:Description></rdf:RDF></x:xmpmeta>`,
      '<?xpacket end="w"?>',
    ),
  );
}

/**
 * An `APP13` Photoshop segment holding IPTC: one `8BIM` resource (`0404`,
 * the IPTC record) with an empty name, and in it the caption record (2:120).
 */
export function iptc(caption) {
  const record = bytes(Uint8Array.of(0x1c, 2, 120), be(caption.length, 2), caption);
  const padded = record.length % 2 === 0 ? record : bytes(record, "\0");
  return segment(
    0xed,
    bytes(
      "Photoshop 3.0\0",
      "8BIM",
      be(0x0404, 2),
      Uint8Array.of(0, 0),
      be(record.length, 4),
      padded,
    ),
  );
}

/* The pictures. */

/** A grey picture: soft diagonal stripes, so every block carries coefficients. */
function greyPattern(x, y) {
  return 64 + ((x * 5 + y * 3) % 128);
}

/** A colour picture: red across, green down, a steady blue. */
function colourPattern(x, y) {
  return [x * 15, y * 15, 96];
}

/** A JFIF or JFXX thumbnail of `text`'s bytes, three to a pixel, in one row. */
function thumbnailOf(text) {
  if (text.length % 3 !== 0) throw new Error("a thumbnail holds three bytes a pixel");
  return { width: text.length / 3, height: 1, pixels: latin1(text) };
}

/** A JFXX `APP0`: an extension header holding an RGB thumbnail (`13`). */
function jfxx(text) {
  const { width, height, pixels } = thumbnailOf(text);
  return segment(0xe0, bytes("JFXX\0", Uint8Array.of(0x13, width, height), pixels));
}

/** An `APP2` multi picture segment, as a camera writes for a second view. */
function multiPicture(text) {
  return segment(0xe2, bytes("MPF\0", "MM\0*", text));
}

/**
 * A whole JPEG: `SOI`, `head` (the segments before the tables), the tables,
 * the scans with `between[i]` written after scan `i`, `EOI`, then `tail`.
 *
 * @param {{ tables: Uint8Array[], scans: Uint8Array[] }} encoded
 * @param {{ head?: Uint8Array[], between?: Uint8Array[][], tail?: Uint8Array }} [options]
 */
export function jpeg(
  encoded,
  { head = [], between = [], tail = new Uint8Array(0) } = {},
) {
  const scans = encoded.scans.flatMap((scan, index) => [scan, ...(between[index] ?? [])]);
  return bytes(SOI, ...head, ...encoded.tables, ...scans, EOI, tail);
}

/* The documents. */

const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

/** The readable line, at 72, 720 in Helvetica 14. */
function line(text) {
  return `BT /F1 14 Tf 72 720 Td (${text}) Tj ET`;
}

/**
 * A document of `pages`, each `{ text, objects, resources, draw, before }`:
 * its line, the objects it adds (numbered from `first`, handed to `objects`),
 * the entries its resources hold beside the font, what it draws after the
 * line, and what before it (a picture under the line). Object 1 is the
 * catalog, 2 the page tree, 3 the font.
 */
function pictureDocument(pages) {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", null, HELVETICA];
  const kids = [];

  for (const recipe of pages) {
    const pageNum = objects.length + 1;
    const contentNum = pageNum + 1;
    const first = pageNum + 2;
    const own = recipe.objects(first);
    kids.push(`${pageNum} 0 R`);
    objects.push(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        `/Resources << /Font << /F1 3 0 R >> ${recipe.resources(first)} >> ` +
        `/Contents ${contentNum} 0 R >>`,
      stream("", bytes(recipe.before ?? "", line(recipe.text), "\n", recipe.draw)),
      ...own,
    );
  }

  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${kids.length} >>`;
  return writePdf({ objects, trailer: "/Root 1 0 R" }).bytes;
}

/** An image XObject: a picture `width` by `height`, its filter and colour space as given. */
function image({
  width,
  height,
  data,
  filter = "/DCTDecode",
  space = "/ColorSpace /DeviceGray",
  extra = "",
}) {
  return stream(
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
      `${space} /BitsPerComponent 8 /Filter ${filter}${extra ? ` ${extra}` : ""}`,
    data,
  );
}

/** One picture drawn 144 points square at 72, 520 under the name `/Im1`. */
function onePicture(text, picture) {
  return {
    text,
    objects: () => [picture],
    resources: (first) => `/XObject << /Im1 ${first} 0 R >>`,
    draw: "q 144 0 0 144 72 520 cm /Im1 Do Q",
  };
}

/**
 * `picture-jpeg.pdf`, one page per case of AC-2 and AC-7 (spec 0025,
 * *Fixtures*):
 *
 * 1. A grey JPEG with a thumbnail free JFIF header, an EXIF segment (a camera
 *    make and a GPS map datum), an XMP packet, IPTC, a comment, and a second
 *    JPEG written after its end marker. Every detail goes, the JFIF header
 *    stays, and the run reports `xmp-metadata` and `picture-details`.
 * 2. A colour JPEG in three scans with an Adobe header, an EXIF segment after
 *    the first scan and a comment after the second. Both go; Adobe stays.
 * 3. A colour JPEG whose dictionary names `/DeviceRGB`: a JFIF header with a
 *    thumbnail, a JFXX thumbnail, an ICC profile and multi picture data. The
 *    thumbnail is cut from the JFIF header; the rest goes.
 * 4. A colour JPEG whose dictionary names no colour space: an ICC profile,
 *    which stays (`PICTURE_KEPT_PROFILE`), and EXIF, which goes.
 * 5. A JPEG with EXIF as a picture's `/SMask`, and another drawn inside a
 *    form XObject. Both are stripped.
 * 6. A grey JPEG with EXIF under the ticked line (`PICTURE_TICKED`), one
 *    pixel to a point so the image reach rule passes: the padded pass blanks
 *    it and MuPDF writes it again as Flate, so no detail is left (AC-7).
 * 7. The control: a thumbnail free JFIF header only, and whitespace after the
 *    end marker. Every byte stays.
 */
export function pictureJpeg() {
  const markers = PICTURE_MARKERS["picture-jpeg.pdf"];
  const lines = PICTURE_LINES["picture-jpeg.pdf"];
  const grey = encodeJpeg({ width: 16, height: 16, pixel: greyPattern });
  const colourThreeScans = encodeJpeg({
    width: 16,
    height: 16,
    colour: true,
    separate: true,
    pixel: colourPattern,
  });
  const colour = encodeJpeg({
    width: 16,
    height: 16,
    colour: true,
    pixel: colourPattern,
  });

  const appended = jpeg(encodeJpeg({ width: 8, height: 8, pixel: () => 200 }), {
    head: [jfif(), comment(markers[1][5])],
  });
  const pageOne = jpeg(grey, {
    head: [
      jfif(),
      exif({ make: markers[1][0], datum: markers[1][1] }),
      xmp(markers[1][2]),
      iptc(markers[1][3]),
      comment(markers[1][4]),
    ],
    tail: appended,
  });

  const pageTwo = jpeg(colourThreeScans, {
    head: [adobe()],
    between: [
      [exif({ make: markers[2][0], datum: markers[2][1] })],
      [comment(markers[2][2])],
    ],
  });

  const pageThree = jpeg(colour, {
    head: [
      jfif({ thumbnail: thumbnailOf(markers[3][0]) }),
      jfxx(markers[3][1]),
      iccSegment(iccProfile({ space: "RGB ", gamma: 2.2, description: markers[3][2] })),
      multiPicture(markers[3][3]),
    ],
  });

  const pageFour = jpeg(colour, {
    head: [
      jfif(),
      iccSegment(
        iccProfile({ space: "RGB ", gamma: 2.2, description: PICTURE_KEPT_PROFILE }),
      ),
      exif({ make: markers[4][0], datum: markers[4][1] }),
    ],
  });

  const mask = jpeg(encodeJpeg({ width: 16, height: 16, pixel: (x) => x * 16 }), {
    head: [jfif(), exif({ make: markers[5][0], datum: markers[5][1] })],
  });
  const inForm = jpeg(grey, {
    head: [jfif(), exif({ make: markers[5][2], datum: markers[5][3] })],
  });
  const masked = jpeg(colour, { head: [jfif()] });

  const underLine = jpeg(encodeJpeg({ width: 64, height: 64, pixel: greyPattern }), {
    head: [jfif(), exif({ make: markers[6][0], datum: markers[6][1] })],
  });

  const control = jpeg(grey, { head: [jfif()], tail: latin1("\r\n") });

  const rgb = "/ColorSpace /DeviceRGB";
  return pictureDocument([
    onePicture(lines[0], image({ width: 16, height: 16, data: pageOne })),
    onePicture(lines[1], image({ width: 16, height: 16, data: pageTwo, space: rgb })),
    onePicture(lines[2], image({ width: 16, height: 16, data: pageThree, space: rgb })),
    onePicture(lines[3], image({ width: 16, height: 16, data: pageFour, space: "" })),
    {
      text: lines[4],
      // The masked picture, its soft mask, the form and the form's picture.
      objects: (first) => [
        image({
          width: 16,
          height: 16,
          data: masked,
          space: rgb,
          extra: `/SMask ${first + 1} 0 R`,
        }),
        image({ width: 16, height: 16, data: mask }),
        stream(
          "/Type /XObject /Subtype /Form /BBox [0 0 1 1] " +
            `/Resources << /XObject << /Ph ${first + 3} 0 R >> >>`,
          "/Ph Do",
        ),
        image({ width: 16, height: 16, data: inForm }),
      ],
      resources: (first) => `/XObject << /Im1 ${first} 0 R /Fm1 ${first + 2} 0 R >>`,
      draw: "q 144 0 0 144 72 520 cm /Im1 Do Q\nq 144 0 0 144 300 520 cm /Fm1 Do Q",
    },
    {
      text: lines[5],
      objects: () => [image({ width: 64, height: 64, data: underLine })],
      resources: (first) => `/XObject << /Im1 ${first} 0 R >>`,
      before: "q 64 0 0 64 72 700 cm /Im1 Do Q\n",
      draw: "",
    },
    onePicture(lines[6], image({ width: 16, height: 16, data: control })),
  ]);
}

/**
 * `picture-kept.pdf`, one page per picture the reader leaves as stored, each
 * holding EXIF whose markers stay (spec 0025, *Fixtures*; AC-1, AC-4):
 *
 * 1. A JPEG under two filters, `[/FlateDecode /DCTDecode]`, its Flate layer
 *    written at level 0 so the stored stream shows its markers (AC-1).
 * 2. A colour JPEG with two Adobe headers, which libjpeg acts on both of, so
 *    dropping one could change the colours (AC-4).
 * 3. A grey JPEG written inline in the page's drawing instructions (AC-1).
 *
 * 4. A JPEG 2000 picture with a comment in a tile part header, which cutting
 *    would change that tile part's length field (AC-4), and an XML box.
 */
export function pictureKept() {
  const markers = PICTURE_MARKERS["picture-kept.pdf"];
  const lines = PICTURE_LINES["picture-kept.pdf"];
  const grey = encodeJpeg({ width: 16, height: 16, pixel: greyPattern });
  const colour = encodeJpeg({
    width: 16,
    height: 16,
    colour: true,
    pixel: colourPattern,
  });

  const chained = deflateSync(
    jpeg(grey, { head: [jfif(), exif({ make: markers[1][0], datum: markers[1][1] })] }),
    { level: 0 },
  );
  const twoAdobe = jpeg(colour, {
    head: [adobe(), exif({ make: markers[2][0], datum: markers[2][1] }), adobe()],
  });
  const inline = jpeg(grey, {
    head: [jfif(), exif({ make: markers[3][0], datum: markers[3][1] })],
  });

  return pictureDocument([
    onePicture(
      lines[0],
      image({
        width: 16,
        height: 16,
        data: chained,
        filter: "[/FlateDecode /DCTDecode]",
      }),
    ),
    onePicture(
      lines[1],
      image({ width: 16, height: 16, data: twoAdobe, space: "/ColorSpace /DeviceRGB" }),
    ),
    {
      text: lines[2],
      objects: () => [],
      resources: () => "",
      draw: bytes(
        "q 144 0 0 144 72 520 cm BI /W 16 /H 16 /CS /G /BPC 8 /F /DCT ID ",
        inline,
        " EI Q",
      ),
    },
    onePicture(
      lines[3],
      jpxImage(
        jp2(
          [IMAGE_HEADER, COLOUR],
          box("xml ", `<note>${markers[4][1]}</note>`),
          box("jp2c", codestream({ tileHeader: [codestreamComment(markers[4][0])] })),
        ),
      ),
    ),
  ]);
}

/** A JP2 file: the signature, the file type, `header` inside `jp2h`, then `rest`. */
function jp2(header, ...rest) {
  return bytes(SIGNATURE, FILE_TYPE, box("jp2h", ...header), ...rest);
}

/** A JPEG 2000 image XObject, 16 by 16 and grey, as `jp2-writer.mjs` writes it. */
function jpxImage(data) {
  return image({ width: 16, height: 16, data, filter: "/JPXDecode" });
}

/**
 * `picture-jpx.pdf`, the JPEG 2000 cases of AC-3 (spec 0025, *Fixtures*),
 * every codestream the hand built grey one, its tile parts byte for byte:
 *
 * 1. A JP2 file whose header box holds a resolution box (`res `), then an XML
 *    box, an XMP `uuid`, an EXIF `uuid`, an intellectual property box
 *    (`jp2i`), a codestream with a main header comment and bytes after its
 *    end, and a box after the codestream. All go; the header box's length is
 *    written anew.
 * 2. A bare codestream with a main header comment, which goes.
 * 3. A JP2 file whose codestream box has length 0 (running to the end), an
 *    XML box before it and a comment in the codestream. Read and stripped.
 */
export function pictureJpx() {
  const markers = PICTURE_MARKERS["picture-jpx.pdf"];
  const lines = PICTURE_LINES["picture-jpx.pdf"];
  const resolution = box(
    "res ",
    box("resc", Uint8Array.of(0, 1, 0, 1, 0, 1, 0, 1, 0, 0)),
  );

  const pageOne = jp2(
    [IMAGE_HEADER, resolution, COLOUR],
    box("xml ", `<note>${markers[1][0]}</note>`),
    box("uuid", XMP_UUID, `<x:xmpmeta><dc:title>${markers[1][1]}</dc:title></x:xmpmeta>`),
    box("uuid", EXIF_UUID, `MM\0*${markers[1][2]}`),
    box("jp2i", markers[1][3]),
    box(
      "jp2c",
      codestream({ extra: [codestreamComment(markers[1][4])], tail: markers[1][5] }),
    ),
    box("xml ", `<after>${markers[1][6]}</after>`),
  );
  const pageTwo = codestream({ extra: [codestreamComment(markers[2][0])] });
  const pageThree = jp2(
    [IMAGE_HEADER, COLOUR],
    box("xml ", `<note>${markers[3][0]}</note>`),
    openBox("jp2c", codestream({ extra: [codestreamComment(markers[3][1])] })),
  );

  return pictureDocument([
    onePicture(lines[0], jpxImage(pageOne)),
    onePicture(lines[1], jpxImage(pageTwo)),
    onePicture(lines[2], jpxImage(pageThree)),
  ]);
}
