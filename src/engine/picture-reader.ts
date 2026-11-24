/**
 * The picture reader: which parts of a JPEG or JPEG 2000 picture's container
 * a viewer needs to draw it. Spec 0025.
 *
 * A picture can carry its own details inside its data: a camera's make and
 * settings, a location, XMP, IPTC captions, comments, a thumbnail, a second
 * picture after the end. This reads only the container, the list of tagged
 * segments or boxes around the compressed picture data, and answers which
 * byte ranges to keep. It never decodes the compressed data, never computes a
 * pixel, and reads no PDF syntax (INV-1): spec 0001's second named exception
 * to "one PDF parser". Pure functions over bytes, importing nothing.
 *
 * It is an allowlist, as the rest of the rebuild is: only the parts named
 * below stay, so a detail nobody thought to list goes too. Whatever it cannot
 * read is `as-stored`, and the caller leaves that picture's bytes untouched,
 * never refused and never reported (AC-4, INV-6). One reader decides for the
 * strip, the strip's guard and the self check, so they never disagree (INV-2).
 *
 * Every list here is a rule about a file format, never config: changing one
 * is a reviewed change with a failing fixture as its proof (INV-7, spec 0021's
 * INV-6).
 */

/** What a strip dropped: an XMP packet, or anything else. */
export type DroppedKind = "xmp" | "other";

/** A piece of the new bytes: a range of the source, kept as stored, or bytes written anew. */
export type PicturePart =
  { readonly from: number; readonly to: number } | { readonly bytes: Uint8Array };

/**
 * The reader's answer. `clean`: nothing to drop, leave the picture alone
 * (AC-5). `strip`: the parts that form the new bytes, and what went.
 * `as-stored`: a container this reader does not take apart (AC-4).
 */
export type PictureRead =
  | { readonly kind: "clean" }
  | {
      readonly kind: "strip";
      readonly parts: readonly PicturePart[];
      readonly dropped: ReadonlySet<DroppedKind>;
    }
  | { readonly kind: "as-stored" };

/** Which container a picture's filter names. */
export type PictureKind = "jpeg" | "jpx";

/**
 * The marker segments a JPEG decoder reads to draw the picture, kept in place
 * wherever they sit, after a scan included (AC-2): every frame header (`SOF`),
 * the Huffman tables (`C4`), arithmetic conditioning (`CC`), quantisation
 * tables (`DB`), the number of lines (`DC`), the restart interval (`DD`),
 * hierarchical progression (`DE`) and expand reference (`DF`). A rule about
 * the format (INV-7).
 */
export const JPEG_KEPT_MARKERS: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf, 0xc4,
  0xcc, 0xdb, 0xdc, 0xdd, 0xde, 0xdf,
]);

/** The frame headers among them: one must come before the first scan. */
const FRAME_MARKERS: ReadonlySet<number> = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

/**
 * How an `APP1` segment holding XMP begins: the main packet and the extended
 * one (AC-9). Dropping either reports `xmp-metadata`. A rule about the format.
 */
export const XMP_APP1_IDS: readonly string[] = Object.freeze([
  "http://ns.adobe.com/xap/1.0/\0",
  "http://ns.adobe.com/xmp/extension/\0",
]);

/** The `uuid` box id XMP is written under in a JPEG 2000 file (AC-9). A rule about the format. */
export const XMP_UUID: readonly number[] = Object.freeze([
  0xbe, 0x7a, 0xcf, 0xcb, 0x97, 0xa9, 0x42, 0xe8, 0x9c, 0x71, 0x99, 0x94, 0x91, 0xe3,
  0xaf, 0xac,
]);

/**
 * The top level JP2 boxes kept (AC-3): the signature, file type, reader
 * requirements, header and codestream boxes. A rule about the format.
 */
export const JP2_KEPT_BOXES: ReadonlySet<string> = new Set([
  "jP  ",
  "ftyp",
  "rreq",
  "jp2h",
  "jp2c",
]);

/**
 * The boxes kept inside the JP2 header box (AC-3): the image header, bits per
 * component, colour specification (an ICC profile included, since JPEG 2000
 * can carry its own colours), palette, component mapping and channel
 * definition. A rule about the format.
 */
export const JP2_HEADER_BOXES: ReadonlySet<string> = new Set([
  "ihdr",
  "bpcc",
  "colr",
  "pclr",
  "cmap",
  "cdef",
]);

/**
 * The bytes PDF reads as whitespace. A tail of only these after a picture's
 * end marker is kept as stored and never reported, since a producer pads a
 * stream that way. A rule about the format.
 */
export const PDF_WHITESPACE: ReadonlySet<number> = new Set([
  0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20,
]);

/**
 * The marker segments JPEG 2000 Part 1 lets a main header hold, after `SIZ`:
 * `CAP`, `COD`, `COC`, `TLM`, `PLM`, `CPF`, `QCD`, `QCC`, `RGN`, `POC`,
 * `PPM`, `CRG` and `COM`. Any other is `as-stored` (AC-4). A rule about the
 * format.
 */
const JPX_MAIN_MARKERS: ReadonlySet<number> = new Set([
  0x50, 0x52, 0x53, 0x55, 0x57, 0x59, 0x5c, 0x5d, 0x5e, 0x5f, 0x60, 0x63, 0x64,
]);

/** The JP2 signature box, whole. */
const JP2_SIGNATURE: readonly number[] = Object.freeze([
  0x00, 0x00, 0x00, 0x0c, 0x6a, 0x50, 0x20, 0x20, 0x0d, 0x0a, 0x87, 0x0a,
]);

const AS_STORED: PictureRead = Object.freeze({ kind: "as-stored" });
const CLEAN: PictureRead = Object.freeze({ kind: "clean" });

/* Small readers. */

function u16(bytes: Uint8Array, at: number): number {
  return (bytes[at]! << 8) | bytes[at + 1]!;
}

function u32(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at]! << 24) >>> 0) +
    (bytes[at + 1]! << 16) +
    (bytes[at + 2]! << 8) +
    bytes[at + 3]!
  );
}

/** Do the bytes at `at` spell `text`, one byte per character? */
function startsWith(bytes: Uint8Array, at: number, end: number, text: string): boolean {
  if (at + text.length > end) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[at + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

function sameBytes(bytes: Uint8Array, at: number, expected: readonly number[]): boolean {
  if (at + expected.length > bytes.length) return false;
  return expected.every((byte, index) => bytes[at + index] === byte);
}

function onlyWhitespace(bytes: Uint8Array, from: number, to: number): boolean {
  for (let index = from; index < to; index += 1) {
    if (!PDF_WHITESPACE.has(bytes[index]!)) return false;
  }
  return true;
}

function equalBytes(first: Uint8Array, second: Uint8Array): boolean {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

/**
 * One step of a walk over a container, in source order: a range kept as
 * stored, a range dropped, or a part written anew in place of a range. Each
 * kept or rewritten step that matters to drawing carries `decoding`, the
 * bytes the strip's guard compares (AC-6).
 */
type KeepStep = Extract<Step, { readonly act: "keep" }>;

type Step =
  | {
      readonly act: "keep";
      readonly from: number;
      readonly to: number;
      readonly decoding: Uint8Array | null;
    }
  | {
      readonly act: "drop";
      readonly from: number;
      readonly to: number;
      readonly dropped: DroppedKind;
    }
  | {
      readonly act: "write";
      readonly bytes: Uint8Array;
      readonly decoding: Uint8Array | null;
      readonly dropped: DroppedKind | null;
    };

/** A walk's answer: its steps, or `null` for a container it does not take apart. */
type Walk = readonly Step[] | null;

/** A walk's steps as the reader's answer: `clean` when nothing went or changed. */
function answer(steps: Walk): PictureRead {
  if (steps === null) return AS_STORED;
  const dropped = new Set<DroppedKind>();
  let changed = false;
  for (const step of steps) {
    if (step.act === "drop") {
      changed = true;
      dropped.add(step.dropped);
    } else if (step.act === "write") {
      changed = true;
      if (step.dropped !== null) dropped.add(step.dropped);
    }
  }
  if (!changed) return CLEAN;

  const parts: PicturePart[] = [];
  for (const step of steps) {
    if (step.act === "keep") {
      const last = parts.at(-1);
      // Neighbouring ranges join, so the parts list stays short.
      if (last !== undefined && "to" in last && last.to === step.from) {
        parts[parts.length - 1] = { from: last.from, to: step.to };
      } else {
        parts.push({ from: step.from, to: step.to });
      }
    } else if (step.act === "write") {
      parts.push({ bytes: step.bytes });
    }
  }
  return { kind: "strip", parts, dropped };
}

/** Build the new bytes from the source and a strip's parts. */
export function joinParts(bytes: Uint8Array, parts: readonly PicturePart[]): Uint8Array {
  const pieces = parts.map((part) =>
    "bytes" in part ? part.bytes : bytes.subarray(part.from, part.to),
  );
  const out = new Uint8Array(pieces.reduce((total, piece) => total + piece.length, 0));
  let at = 0;
  for (const piece of pieces) {
    out.set(piece, at);
    at += piece.length;
  }
  return out;
}

/* JPEG (AC-2). */

/** The libjpeg header lengths: a JFIF `APP0` payload of 14 bytes, an Adobe `APP14` of 12. */
const JFIF_HEADER = 14;
const ADOBE_HEADER = 12;

/** `FF code`, a length counting itself, then `payload`. */
function jpegSegment(code: number, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 4);
  out[0] = 0xff;
  out[1] = code;
  out[2] = (payload.length + 2) >> 8;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}

/**
 * Walk a JPEG's marker segments from its start of image marker. AC-2's rule,
 * with AC-4's cases answering `null`.
 */
function walkJpeg(bytes: Uint8Array, hasColourSpace: boolean): Walk {
  const end = bytes.length;
  if (end < 2 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  const steps: Step[] = [{ act: "keep", from: 0, to: 2, decoding: null }];
  let frame = false;
  let scanned = false;
  let jfifSeen = false;
  let adobeSeen = false;
  let at = 2;

  for (;;) {
    // A marker, after any fill bytes, which belong to it.
    const start = at;
    if (at >= end || bytes[at] !== 0xff) return null;
    while (at < end && bytes[at] === 0xff) at += 1;
    if (at >= end) return null;
    const code = bytes[at]!;
    const fill = { from: start, to: at - 1 };
    at += 1;

    if (code === 0xd9) {
      // The end of image marker: only once a frame and a scan were read.
      if (!frame || !scanned) return null;
      steps.push({ act: "keep", from: start, to: at, decoding: null });
      if (at < end) {
        if (onlyWhitespace(bytes, at, end)) {
          steps.push({ act: "keep", from: at, to: end, decoding: null });
        } else {
          steps.push({ act: "drop", from: at, to: end, dropped: "other" });
        }
      }
      return steps;
    }

    // A stray `FF 00`, a second start of image, a restart marker or `TEM`
    // outside a scan: no picture this reader takes apart.
    if (
      code === 0x00 ||
      code === 0xd8 ||
      code === 0x01 ||
      (code >= 0xd0 && code <= 0xd7)
    ) {
      return null;
    }

    if (at + 2 > end) return null;
    const length = u16(bytes, at);
    if (length < 2 || at + length > end) return null;
    const payload = at + 2;
    const segmentEnd = at + length;
    at = segmentEnd;

    if (JPEG_KEPT_MARKERS.has(code)) {
      if (FRAME_MARKERS.has(code)) frame = true;
      steps.push(keepSegment(bytes, fill, start, segmentEnd));
      continue;
    }

    if (code === 0xda) {
      if (!frame) return null;
      scanned = true;
      steps.push(keepSegment(bytes, fill, start, segmentEnd));
      const dataEnd = scanEnd(bytes, segmentEnd);
      steps.push({
        act: "keep",
        from: segmentEnd,
        to: dataEnd,
        decoding: bytes.slice(segmentEnd, dataEnd),
      });
      // A missing end of image marker is fine: the data ends inside the last
      // scan, and so does the output.
      if (dataEnd === end) return steps;
      at = dataEnd;
      continue;
    }

    if (code === 0xe0 && startsWith(bytes, payload, segmentEnd, "JFIF\0")) {
      // libjpeg acts on each JFIF header it reads, so a repeat could change
      // the colours if dropped: not a picture this reader takes apart.
      if (jfifSeen || length < JFIF_HEADER + 2) return null;
      jfifSeen = true;
      const header = bytes.slice(payload, payload + JFIF_HEADER);
      header[12] = 0;
      header[13] = 0;
      const thumbless = bytes[payload + 12] === 0 && bytes[payload + 13] === 0;
      if (length === JFIF_HEADER + 2 && thumbless) {
        steps.push({ ...keepSegment(bytes, fill, start, segmentEnd), decoding: header });
      } else {
        // The thumbnail and any extra bytes go; version, units and density stay.
        steps.push(...fillSteps(fill));
        steps.push({
          act: "write",
          bytes: jpegSegment(0xe0, header),
          decoding: header,
          dropped: "other",
        });
      }
      continue;
    }

    if (code === 0xee && startsWith(bytes, payload, segmentEnd, "Adobe")) {
      if (adobeSeen || length < ADOBE_HEADER + 2) return null;
      adobeSeen = true;
      const header = bytes.slice(payload, payload + ADOBE_HEADER);
      if (length === ADOBE_HEADER + 2) {
        steps.push({ ...keepSegment(bytes, fill, start, segmentEnd), decoding: header });
      } else {
        // libjpeg reads only the first 12 payload bytes.
        steps.push(...fillSteps(fill));
        steps.push({
          act: "write",
          bytes: jpegSegment(0xee, header),
          decoding: header,
          dropped: "other",
        });
      }
      continue;
    }

    if (
      code === 0xe2 &&
      !hasColourSpace &&
      startsWith(bytes, payload, segmentEnd, "ICC_PROFILE\0")
    ) {
      // The embedded colour profile, which a decoder may use when the PDF
      // names no colour space.
      steps.push(keepSegment(bytes, fill, start, segmentEnd));
      continue;
    }

    const xmpPacket =
      code === 0xe1 &&
      XMP_APP1_IDS.some((id) => startsWith(bytes, payload, segmentEnd, id));
    steps.push({
      act: "drop",
      from: start,
      to: segmentEnd,
      dropped: xmpPacket ? "xmp" : "other",
    });
  }
}

/** A kept segment with its fill bytes, its decoding bytes the segment without them. */
function keepSegment(
  bytes: Uint8Array,
  fill: { readonly from: number; readonly to: number },
  start: number,
  end: number,
): KeepStep {
  return { act: "keep", from: start, to: end, decoding: bytes.slice(fill.to, end) };
}

/** The fill bytes before a rewritten segment, kept as stored. */
function fillSteps(fill: { readonly from: number; readonly to: number }): Step[] {
  return fill.to > fill.from
    ? [{ act: "keep", from: fill.from, to: fill.to, decoding: null }]
    : [];
}

/**
 * Where a scan's compressed data ends: at the first `FF xx` whose `xx` is not
 * a stuffed `00`, a restart marker (`D0` to `D7`) or another `FF`, less any
 * fill bytes before that marker, which belong to it. The data never holds a
 * lone `FF` before a fill byte, since every data `FF` is stuffed. With no such
 * marker, the data runs to the end.
 */
function scanEnd(bytes: Uint8Array, from: number): number {
  const end = bytes.length;
  for (let index = from; index + 1 < end; index += 1) {
    if (bytes[index] !== 0xff) continue;
    const next = bytes[index + 1]!;
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) continue;
    let markerStart = index;
    while (markerStart > from && bytes[markerStart - 1] === 0xff) markerStart -= 1;
    return markerStart;
  }
  return end;
}

/**
 * Read a JPEG picture's container (AC-2, AC-4). `hasColourSpace` says whether
 * the picture's dictionary names a colour space: without one, the embedded
 * ICC profile stays, since a decoder may need it.
 */
export function readJpeg(bytes: Uint8Array, hasColourSpace: boolean): PictureRead {
  return answer(walkJpeg(bytes, hasColourSpace));
}

/* JPEG 2000 (AC-3). */

interface Box {
  readonly type: string;
  readonly start: number;
  readonly header: number;
  readonly end: number;
  /** The length form: 4 (`LBox`), 16 (`XLBox`), or 0 (to the end). */
  readonly form: 0 | 4 | 16;
}

/**
 * The boxes between `from` and `to`, or `null` when one is too short, runs
 * past `to`, or (with `nested`) runs to the end. Bytes left over too few for
 * a box header are only allowed as PDF whitespace, given back as `tail`.
 */
function readBoxes(
  bytes: Uint8Array,
  from: number,
  to: number,
  nested: boolean,
): { readonly boxes: readonly Box[]; readonly tail: number } | null {
  const boxes: Box[] = [];
  let at = from;
  while (at < to) {
    if (at + 8 > to) {
      return onlyWhitespace(bytes, at, to) ? { boxes, tail: at } : null;
    }
    const length = u32(bytes, at);
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (length === 0) {
      if (nested) return null;
      boxes.push({ type, start: at, header: 8, end: to, form: 0 });
      at = to;
    } else if (length === 1) {
      if (at + 16 > to) return null;
      const high = u32(bytes, at + 8);
      const low = u32(bytes, at + 12);
      const long = high * 2 ** 32 + low;
      if (long < 16 || at + long > to) return null;
      boxes.push({ type, start: at, header: 16, end: at + long, form: 16 });
      at += long;
    } else {
      if (length < 8 || at + length > to) return null;
      boxes.push({ type, start: at, header: 8, end: at + length, form: 4 });
      at += length;
    }
  }
  return { boxes, tail: to };
}

/** A box header for `contentLength` bytes, in `form`'s length form (0 keeps 0). */
function boxHeader(type: string, form: 0 | 4 | 16, contentLength: number): Uint8Array {
  const out = new Uint8Array(form === 16 ? 16 : 8);
  const view = new DataView(out.buffer);
  if (form === 16) {
    view.setUint32(0, 1);
    const total = contentLength + 16;
    view.setUint32(8, Math.floor(total / 2 ** 32));
    view.setUint32(12, total % 2 ** 32);
  } else {
    view.setUint32(0, form === 0 ? 0 : contentLength + 8);
  }
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
  return out;
}

/** The total length of a list of steps' new bytes. */
function stepsLength(steps: readonly Step[]): number {
  let total = 0;
  for (const step of steps) {
    if (step.act === "keep") total += step.to - step.from;
    else if (step.act === "write") total += step.bytes.length;
  }
  return total;
}

/** Did any of these steps drop or rewrite anything? */
function anyChange(steps: readonly Step[]): boolean {
  return steps.some((step) => step.act !== "keep");
}

/**
 * Walk a codestream from `from` (its `SOC`) to `to` (AC-3, AC-4): the main
 * header segment by segment, dropping every comment, then tile part to tile
 * part by each `SOT`'s length, then `EOC` and any tail.
 */
function walkCodestream(bytes: Uint8Array, from: number, to: number): Walk {
  if (!sameBytes(bytes, from, [0xff, 0x4f, 0xff, 0x51]) || from + 4 > to) return null;
  const steps: Step[] = [{ act: "keep", from, to: from + 2, decoding: null }];
  let at = from + 2;

  // The main header, `SIZ` first.
  for (;;) {
    if (at + 2 > to || bytes[at] !== 0xff) return null;
    const code = bytes[at + 1]!;
    if (code === 0x90) break;
    if (code >= 0x30 && code <= 0x3f) {
      steps.push({ act: "keep", from: at, to: at + 2, decoding: null });
      at += 2;
      continue;
    }
    if (code !== 0x51 && !JPX_MAIN_MARKERS.has(code)) return null;
    if (code === 0x51 && at !== from + 2) return null;
    if (at + 4 > to) return null;
    const length = u16(bytes, at + 2);
    if (length < 2 || at + 2 + length > to) return null;
    const segmentEnd = at + 2 + length;
    if (code === 0x64) {
      steps.push({ act: "drop", from: at, to: segmentEnd, dropped: "other" });
    } else {
      steps.push({
        act: "keep",
        from: at,
        to: segmentEnd,
        decoding: code === 0x51 ? bytes.slice(at, segmentEnd) : null,
      });
    }
    at = segmentEnd;
  }

  // The tile parts, hop by hop, never by searching for marker bytes.
  const tiles = tileCount(bytes, from + 2);
  if (tiles === null) return null;
  const seen = new Set<number>();
  const tilesFrom = at;
  let codestreamEnd = -1;
  for (;;) {
    if (at + 12 > to || bytes[at] !== 0xff || bytes[at + 1] !== 0x90) return null;
    if (u16(bytes, at + 2) !== 10) return null;
    const tile = u16(bytes, at + 4);
    if (tile >= tiles) return null;
    seen.add(tile);
    const length = u32(bytes, at + 6);
    let partEnd: number;
    if (length === 0) {
      // Running to the end: only the last tile part, so every tile has been
      // met by now and, when the part says how many its tile has, it is that
      // tile's last. Its data ends with `EOC`, PDF whitespace after it aside.
      const part = bytes[at + 10]!;
      const parts = bytes[at + 11]!;
      if (seen.size !== tiles || (parts !== 0 && part !== parts - 1)) return null;
      let last = to;
      while (last > at && PDF_WHITESPACE.has(bytes[last - 1]!)) last -= 1;
      if (last - 2 < at + 12 || bytes[last - 2] !== 0xff || bytes[last - 1] !== 0xd9)
        return null;
      partEnd = last - 2;
    } else {
      if (length < 14 || at + length > to) return null;
      partEnd = at + length;
    }
    if (tilePartHasComment(bytes, at + 12, partEnd)) return null;
    at = partEnd;
    if (length === 0) {
      codestreamEnd = at + 2;
      break;
    }
    if (at + 2 <= to && bytes[at] === 0xff && bytes[at + 1] === 0xd9) {
      codestreamEnd = at + 2;
      break;
    }
    if (!(at + 2 <= to && bytes[at] === 0xff && bytes[at + 1] === 0x90)) return null;
  }

  steps.push({
    act: "keep",
    from: tilesFrom,
    to: codestreamEnd,
    decoding: bytes.slice(tilesFrom, codestreamEnd),
  });
  if (codestreamEnd < to) {
    if (onlyWhitespace(bytes, codestreamEnd, to)) {
      steps.push({ act: "keep", from: codestreamEnd, to, decoding: null });
    } else {
      steps.push({ act: "drop", from: codestreamEnd, to, dropped: "other" });
    }
  }
  return steps;
}

/**
 * How many tiles `SIZ` (at `at`) lays out, or `null` for a segment too short
 * or a tile size of 0.
 */
function tileCount(bytes: Uint8Array, at: number): number | null {
  if (u16(bytes, at + 2) < 41) return null;
  const across = u32(bytes, at + 6) - u32(bytes, at + 30);
  const down = u32(bytes, at + 10) - u32(bytes, at + 34);
  const width = u32(bytes, at + 22);
  const height = u32(bytes, at + 26);
  if (width === 0 || height === 0 || across <= 0 || down <= 0) return null;
  return Math.ceil(across / width) * Math.ceil(down / height);
}

/**
 * Does a tile part header hold a comment? Cutting one would change that tile
 * part's length field, so such a picture is `as-stored` (AC-4). A header with
 * no `SOD`, or a segment running past the tile part, counts as one: either way
 * this reader does not take it apart.
 */
function tilePartHasComment(bytes: Uint8Array, from: number, to: number): boolean {
  let at = from;
  for (;;) {
    if (at + 2 > to || bytes[at] !== 0xff) return true;
    const code = bytes[at + 1]!;
    if (code === 0x93) return false;
    if (code === 0x64) return true;
    if (at + 4 > to) return true;
    const length = u16(bytes, at + 2);
    if (length < 2 || at + 2 + length > to) return true;
    at += 2 + length;
  }
}

/** Walk a JP2 file's boxes (AC-3, AC-4). */
function walkJp2(bytes: Uint8Array): Walk {
  const top = readBoxes(bytes, 0, bytes.length, false);
  if (top === null) return null;
  const { boxes, tail } = top;

  const headers = boxes.filter((box) => box.type === "jp2h");
  const streams = boxes.filter((box) => box.type === "jp2c");
  if (headers.length !== 1 || streams.length !== 1) return null;
  const header = headers[0]!;
  const codestream = streams[0]!;
  if (codestream.start < header.start) return null;
  if (boxes.some((box) => box.start > codestream.start && JP2_KEPT_BOXES.has(box.type))) {
    return null;
  }

  const steps: Step[] = [];
  for (const box of boxes) {
    if (box.type === "jp2h") {
      const inner = walkJp2Header(bytes, box);
      if (inner === null) return null;
      steps.push(...inner);
    } else if (box.type === "jp2c") {
      const inner = walkCodestream(bytes, box.start + box.header, box.end);
      if (inner === null) return null;
      if (anyChange(inner)) {
        steps.push({
          act: "write",
          bytes: boxHeader("jp2c", box.form, stepsLength(inner)),
          decoding: null,
          dropped: null,
        });
      } else {
        steps.push({
          act: "keep",
          from: box.start,
          to: box.start + box.header,
          decoding: null,
        });
      }
      steps.push(...inner);
    } else if (JP2_KEPT_BOXES.has(box.type)) {
      steps.push({ act: "keep", from: box.start, to: box.end, decoding: null });
    } else {
      const xmpBox =
        box.type === "uuid" &&
        box.end - box.start >= box.header + 16 &&
        sameBytes(bytes, box.start + box.header, XMP_UUID);
      steps.push({
        act: "drop",
        from: box.start,
        to: box.end,
        dropped: xmpBox ? "xmp" : "other",
      });
    }
  }
  if (tail < bytes.length)
    steps.push({ act: "keep", from: tail, to: bytes.length, decoding: null });
  return steps;
}

/** The header box's children, only the kept ones, its header written anew if any went. */
function walkJp2Header(bytes: Uint8Array, box: Box): Step[] | null {
  const inner = readBoxes(bytes, box.start + box.header, box.end, true);
  if (inner === null || inner.tail !== box.end) return null;

  const children: Step[] = [];
  for (const child of inner.boxes) {
    if (JP2_HEADER_BOXES.has(child.type)) {
      children.push({
        act: "keep",
        from: child.start,
        to: child.end,
        decoding: bytes.slice(child.start, child.end),
      });
    } else {
      children.push({ act: "drop", from: child.start, to: child.end, dropped: "other" });
    }
  }
  const kept = new Set(
    inner.boxes
      .filter((child) => JP2_HEADER_BOXES.has(child.type))
      .map((child) => child.type),
  );
  if (!kept.has("ihdr") || !kept.has("colr")) return null;

  if (!anyChange(children)) {
    return [
      { act: "keep", from: box.start, to: box.start + box.header, decoding: null },
      ...children,
    ];
  }
  return [
    {
      act: "write",
      bytes: boxHeader("jp2h", box.form, stepsLength(children)),
      decoding: null,
      dropped: null,
    },
    ...children,
  ];
}

function walkJpx(bytes: Uint8Array): Walk {
  if (sameBytes(bytes, 0, JP2_SIGNATURE)) return walkJp2(bytes);
  if (sameBytes(bytes, 0, [0xff, 0x4f, 0xff, 0x51]))
    return walkCodestream(bytes, 0, bytes.length);
  return null;
}

/**
 * Read a JPEG 2000 picture's container (AC-3, AC-4): a JP2 file starting with
 * its signature box, or a bare codestream.
 */
export function readJpx(bytes: Uint8Array): PictureRead {
  return answer(walkJpx(bytes));
}

/** Read a picture by its kind. */
export function readPicture(
  bytes: Uint8Array,
  kind: PictureKind,
  hasColourSpace: boolean,
): PictureRead {
  return kind === "jpeg" ? readJpeg(bytes, hasColourSpace) : readJpx(bytes);
}

/**
 * What the strip's guard compares (AC-6), in source order: for a JPEG, every
 * kept segment (without its fill bytes) and every scan's compressed data,
 * with the JFIF and Adobe headers as their first 14 and 12 payload bytes, the
 * JFIF thumbnail size set to 0; for a JPEG 2000 picture, the kept header
 * boxes, the codestream's `SIZ` segment, and every byte from its first tile
 * part to its end of codestream marker. `null` for a container the reader
 * does not take apart.
 */
export function decodingParts(
  bytes: Uint8Array,
  kind: PictureKind,
  hasColourSpace = false,
): readonly Uint8Array[] | null {
  const steps = kind === "jpeg" ? walkJpeg(bytes, hasColourSpace) : walkJpx(bytes);
  if (steps === null) return null;
  const parts: Uint8Array[] = [];
  for (const step of steps) {
    if (step.act !== "drop" && step.decoding !== null) parts.push(step.decoding);
  }
  return parts;
}

/** Are two lists of decoding parts equal, byte for byte and in order? */
export function sameDecodingParts(
  first: readonly Uint8Array[],
  second: readonly Uint8Array[],
): boolean {
  return (
    first.length === second.length &&
    first.every((part, index) => equalBytes(part, second[index]!))
  );
}
