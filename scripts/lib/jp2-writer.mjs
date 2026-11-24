/**
 * A JPEG 2000 picture written by hand, for the fixture script. Spec 0025,
 * AC-13.
 *
 * No encoder: the codestream is a grey 16 by 16 picture in 2 by 2 tiles of 8
 * by 8, with no wavelet levels, one quality layer and the reversible
 * transform, and every tile's one packet empty. So every coefficient is zero
 * and the picture decodes to an even grey (128), the level shift alone. That
 * is enough for the strip: what it reads is the codestream's marker segments
 * and tile part lengths, never the packets. The JP2 boxes around it are
 * written here too.
 *
 * Every byte is fixed, so the script writes the same file on every run.
 */

import { bytes } from "./jpeg-writer.mjs";

/** A big endian unsigned number in `size` bytes. */
function be(value, size) {
  const out = new Uint8Array(size);
  let rest = BigInt(value);
  for (let index = size - 1; index >= 0; index -= 1) {
    out[index] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

/** A codestream marker segment: `FF code`, a two byte length counting itself, then `payload`. */
export function codestreamSegment(code, payload) {
  const body = bytes(payload);
  return bytes(Uint8Array.of(0xff, code), be(body.length + 2, 2), body);
}

/** A comment segment (`COM`), its text written as Latin text (`Rcom` 1). */
export function codestreamComment(text) {
  return codestreamSegment(0x64, bytes(be(1, 2), text));
}

const SIZE = 16;
const TILE = 8;

/** The main header's three segments: the picture and tile sizes, coding style and quantisation. */
export function mainHeader() {
  const size = codestreamSegment(
    0x51,
    bytes(
      be(0, 2), // Rsiz: Part 1, no profile
      be(SIZE, 4), // Xsiz
      be(SIZE, 4), // Ysiz
      be(0, 4), // XOsiz
      be(0, 4), // YOsiz
      be(TILE, 4), // XTsiz
      be(TILE, 4), // YTsiz
      be(0, 4), // XTOsiz
      be(0, 4), // YTOsiz
      be(1, 2), // Csiz: one component
      Uint8Array.of(7, 1, 1), // 8 bits unsigned, no subsampling
    ),
  );
  // No precincts or markers, layer then resolution order, one layer, no
  // colour transform, no wavelet levels, 64 by 64 code blocks, the 5/3
  // reversible filter.
  const coding = codestreamSegment(0x52, Uint8Array.of(0, 0, 0, 1, 0, 0, 4, 4, 0, 1));
  // Two guard bits, no quantisation, one subband whose exponent is 8.
  const quantisation = codestreamSegment(0x5c, Uint8Array.of(0x40, 8 << 3));
  return { size, coding, quantisation };
}

/**
 * One tile part: `SOT`, any `header` segments, `SOD`, then one empty packet
 * (a zero bit, padded to a byte). `SOT`'s tile part length counts all of it,
 * unless `toEnd` writes 0 (running to the end of the codestream).
 *
 * @param {number} index
 * @param {{ header?: Uint8Array[], toEnd?: boolean }} [options]
 */
export function tilePart(index, { header = [], toEnd = false } = {}) {
  const body = bytes(...header, Uint8Array.of(0xff, 0x93, 0x00));
  const length = 12 + body.length;
  return bytes(
    Uint8Array.of(0xff, 0x90),
    be(10, 2),
    be(index, 2),
    be(toEnd ? 0 : length, 4),
    Uint8Array.of(0, 1),
    body,
  );
}

/**
 * A whole codestream: `SOC`, the main header with `extra` segments after its
 * three, the four tile parts (the first with `tileHeader` in its header, the
 * last running to the end when `lastToEnd`), `EOC`, then `tail`.
 *
 * @param {{ extra?: Uint8Array[], tileHeader?: Uint8Array[], lastToEnd?: boolean,
 *   tail?: string | Uint8Array }} [options]
 */
export function codestream({
  extra = [],
  tileHeader = [],
  lastToEnd = false,
  tail = "",
} = {}) {
  const { size, coding, quantisation } = mainHeader();
  return bytes(
    Uint8Array.of(0xff, 0x4f),
    size,
    coding,
    quantisation,
    ...extra,
    tilePart(0, { header: tileHeader }),
    tilePart(1),
    tilePart(2),
    tilePart(3, { toEnd: lastToEnd }),
    Uint8Array.of(0xff, 0xd9),
    tail,
  );
}

/** A box: a four byte length counting its eight byte header, its type, then `content`. */
export function box(type, ...content) {
  const body = bytes(...content);
  return bytes(be(body.length + 8, 4), type, body);
}

/** A box with the eight byte extended length (`LBox` 1, then `XLBox`). */
export function longBox(type, ...content) {
  const body = bytes(...content);
  return bytes(be(1, 4), type, be(body.length + 16, 8), body);
}

/** A box of length 0, running to the end of the file. */
export function openBox(type, ...content) {
  return bytes(be(0, 4), type, ...content);
}

/** The JP2 signature box. */
export const SIGNATURE = Uint8Array.of(
  0,
  0,
  0,
  0x0c,
  0x6a,
  0x50,
  0x20,
  0x20,
  0x0d,
  0x0a,
  0x87,
  0x0a,
);

/** The file type box: brand `jp2 `, minor version 0, compatible with `jp2 `. */
export const FILE_TYPE = box("ftyp", "jp2 ", be(0, 4), "jp2 ");

/** The image header: 16 by 16, one component of 8 bits, JPEG 2000 compressed. */
export const IMAGE_HEADER = box(
  "ihdr",
  be(SIZE, 4),
  be(SIZE, 4),
  be(1, 2),
  Uint8Array.of(7, 7, 0, 0),
);

/** The colour specification: enumerated, greyscale (17). */
export const COLOUR = box("colr", Uint8Array.of(1, 0, 0), be(17, 4));

/** XMP's `uuid` box id, as the JPEG 2000 standard's Annex I names it. */
export const XMP_UUID = Uint8Array.of(
  0xbe,
  0x7a,
  0xcf,
  0xcb,
  0x97,
  0xa9,
  0x42,
  0xe8,
  0x9c,
  0x71,
  0x99,
  0x94,
  0x91,
  0xe3,
  0xaf,
  0xac,
);

/** The `uuid` id producers write EXIF under (`JpgTiffExif->JP2`). */
export const EXIF_UUID = bytes("JpgTiffExif->JP2");
