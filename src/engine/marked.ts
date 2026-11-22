import type { PDFObject } from "mupdf";

import { readsAsLanguageTag } from "./allowlist";

/**
 * The read only scan of a page's drawing instructions. Spec 0019, AC-9, *Scan
 * rules* and INV-4.
 *
 * MuPDF.js exposes no marked content: no callback hands out a `BDC` property
 * list, and no filter can drop one. So a description written inline in a
 * page's drawing instructions (alternate text for a screen reader, say) stays
 * in the cleaned file, even around text the visitor ticked. RedactNest cannot
 * remove it, so it says so: this scan finds where one may be, and the page
 * gets the `marked-descriptions` warning.
 *
 * The one named exception to spec 0001's "one PDF parser" (INV-4). It reads the
 * bytes MuPDF decodes, never a raw filtered stream, edits nothing and computes
 * no geometry. Its only outputs are whether a property list holds a string
 * that counts, which resource names the streams use, whether they show text
 * (`showsText`, spec 0020, which the glyph rule reads), whether an inline
 * picture would be lost by MuPDF's write (`losesPicture`) and which colour
 * space names inline pictures write under `/CS` (`inlineSpaces`, spec 0022,
 * which the inline picture rule and the check read). Nothing it answers
 * changes what the rebuild keeps: the glyph rule and the inline picture rule
 * refuse a file, they never delete. Any doubt is `"unsure"`, which warns at
 * open and fails the check, so a fault in here can add a warning or a refusal,
 * never pass a file the rest of the check would fail.
 */

/** The resource dictionaries a drawing names entries of. */
export type ResourceCategory =
  "Font" | "XObject" | "ExtGState" | "ColorSpace" | "Pattern" | "Shading" | "Properties";

/** What the scan found in one drawing. */
export interface DrawingRead {
  /** A marked content property list here holds a string that counts (AC-9). */
  readonly describes: boolean;
  /** Every resource name the streams use, by the dictionary it is looked up in. */
  readonly names: ReadonlyMap<ResourceCategory, ReadonlySet<string>>;
  /**
   * The streams hold a text showing operator (`Tj`, `TJ`, `'` or `"`). Bytes
   * inside a string, an inline image's data or a comment are never an
   * operator. Spec 0020, AC-3.
   */
  readonly showsText: boolean;
  /**
   * An inline picture here is one MuPDF 1.28.1's write would lose (spec 0022,
   * AC-1): the inline picture rule refuses the file, and the check fails an
   * output that still holds one.
   */
  readonly losesPicture: boolean;
  /**
   * Every name, neither empty nor a device name, an inline picture's `/CS`
   * holds directly: the names the writer prints as `/CS/Name`, which the
   * check holds against the owner's `/ColorSpace` entries (spec 0022, AC-4).
   */
  readonly inlineSpaces: ReadonlySet<string>;
}

/**
 * Read one drawing's streams. Spec 0019, *Scan rules*.
 *
 * `joined` streams are one drawing split in parts, as a page's contents are,
 * and are read as one with white space between; otherwise each is read on its
 * own (a Type 3 font's glyph procedures) and the answers joined. `properties`
 * is the owning `/Properties` dictionary, for a property list named by a name
 * operand. A stream MuPDF cannot decode, or one this cannot read to its end,
 * makes the whole answer `"unsure"`.
 */
export function readDrawing(
  streams: readonly PDFObject[],
  properties: PDFObject | null,
  joined = true,
): DrawingRead | "unsure" {
  const parts: Uint8Array[] = [];
  for (const stream of streams) {
    const bytes = decoded(stream);
    if (bytes === null) return "unsure";
    parts.push(bytes);
  }

  const reads = joined
    ? [scanContent(joinParts(parts), properties)]
    : parts.map((part) => scanContent(part, properties));
  if (reads.some((read) => read === "unsure")) return "unsure";

  const names = new Map<ResourceCategory, Set<string>>();
  const inlineSpaces = new Set<string>();
  let describes = false;
  let showsText = false;
  let losesPicture = false;
  for (const read of reads as DrawingRead[]) {
    describes ||= read.describes;
    showsText ||= read.showsText;
    losesPicture ||= read.losesPicture;
    for (const name of read.inlineSpaces) inlineSpaces.add(name);
    for (const [category, found] of read.names) {
      let into = names.get(category);
      if (!into) {
        into = new Set();
        names.set(category, into);
      }
      for (const name of found) into.add(name);
    }
  }
  return Object.freeze({ describes, names, showsText, losesPicture, inlineSpaces });
}

/** A stream's decoded bytes, copied out of MuPDF's heap, or `null` if MuPDF cannot decode it. */
function decoded(stream: PDFObject): Uint8Array | null {
  try {
    const buffer = stream.readStream();
    try {
      return buffer.asUint8Array().slice();
    } finally {
      buffer.destroy();
    }
  } catch {
    return null;
  }
}

/** Parts read as one, a newline between each, as MuPDF reads a `/Contents` array. */
function joinParts(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length + 1, 0);
  const out = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
    out[at] = 0x0a;
    at += 1;
  }
  return out;
}

/* The lexer. */

const WHITE = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20]);
const DELIMITERS = new Set([0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);

const isWhite = (byte: number): boolean => WHITE.has(byte);
const isDelimiter = (byte: number): boolean => DELIMITERS.has(byte);

/**
 * An operand, as far as the scan needs to know it. The keyword `true` is its
 * own value only inside an inline picture's dictionary, where the mask test
 * reads it (spec 0022, AC-1); everywhere else `true`, `false` and `null` are
 * scalars.
 */
type Value =
  | { readonly is: "scalar" }
  | { readonly is: "true" }
  | { readonly is: "name"; readonly name: string }
  | { readonly is: "string"; readonly bytes: Uint8Array }
  | { readonly is: "array"; readonly items: readonly Value[] }
  | { readonly is: "dict"; readonly entries: ReadonlyMap<string, Value> };

/** An array or dictionary still being read. */
interface Open {
  readonly is: "array" | "dict";
  readonly items: Value[];
}

/** One open marked content sequence. */
interface Sequence {
  /** Its property list held an `/ActualText` that counts unless text is drawn inside. */
  readonly actualText: boolean;
  drew: boolean;
}

/**
 * What the scan carries forward, restored when an inline image's end is tried
 * again. `showsText` lives here rather than beside the scan, so a retry after a
 * false `EI` forgets an operator read from the image's data: kept outside, it
 * would stick, and a bitmap font whose data holds `Tj` would be refused (spec
 * 0020, *Data model sketch*). `losesPicture` and `inlineSpaces` live here for
 * the same reason: a picture read from another picture's data is forgotten
 * once the scan settles on a later end (spec 0022, AC-1).
 */
interface Semantics {
  readonly sequences: Sequence[];
  readonly names: Map<ResourceCategory, Set<string>>;
  readonly inlineSpaces: Set<string>;
  describes: boolean;
  showsText: boolean;
  losesPicture: boolean;
}

/** An inline image whose data's end may be tried again further on. */
interface Choice {
  readonly dataStart: number;
  readonly end: number;
  readonly saved: Semantics;
}

const DEVICE_SPACES = new Set(["DeviceGray", "DeviceRGB", "DeviceCMYK", "Pattern"]);
const INLINE_DEVICE_SPACES = new Set([
  "DeviceGray",
  "DeviceRGB",
  "DeviceCMYK",
  "G",
  "RGB",
  "CMYK",
]);
const TEXT_SHOWING = new Set(["Tj", "TJ", "'", '"']);

/**
 * How many times one scan may give an inline image a new end before the
 * stream counts as unsure (spec 0021, AC-6). Each retry reads the rest of the
 * stream again, so with no cap a crafted stream of false ends grows with the
 * square of its length (1 MB would take about an hour); with it the scan
 * reads one stream at most 17 times (INV-4). Random data holds a false end
 * about once in 45 MB, and no committed fixture's stream takes one. Running
 * out is doubt, which warns or refuses, never passes a file. A rule about the
 * scan, not a cap on the visitor (spec 0019, INV-5).
 */
export const INLINE_END_RETRIES = 16;

/**
 * Scan decoded drawing instructions (spec 0019, *Scan rules*), or `"unsure"`
 * when they cannot be read to their end: an unbalanced string, array or
 * dictionary, a stray closing delimiter, or an inline image with no workable
 * `EI`.
 */
export function scanContent(
  bytes: Uint8Array,
  properties: PDFObject | null,
): DrawingRead | "unsure" {
  let state: Semantics = {
    sequences: [],
    names: new Map(),
    inlineSpaces: new Set(),
    describes: false,
    showsText: false,
    losesPicture: false,
  };
  const choices: Choice[] = [];
  // Whether the rest of a stream reads to its end depends only on where the
  // scan resumes after an `EI`, so a resume point that failed once fails again.
  const failed = new Set<number>();
  // Spec 0021, AC-6: one count per call, of new ends given.
  let retries = 0;
  let pos = 0;
  let operands: Value[] = [];
  let open: Open[] = [];

  const named = (category: ResourceCategory, name: string): void => {
    let found = state.names.get(category);
    if (!found) {
      found = new Set();
      state.names.set(category, found);
    }
    found.add(name);
  };

  const add = (value: Value): void => {
    const top = open.at(-1);
    if (top) top.items.push(value);
    else operands.push(value);
  };

  /**
   * Back to the latest inline image with an `EI` still to try, or false if
   * none, or once `INLINE_END_RETRIES` new ends have been given. A choice with
   * no end left takes none and counts for nothing.
   */
  const retry = (): boolean => {
    while (choices.length > 0) {
      const choice = choices.pop() as Choice;
      failed.add(choice.end + 2);
      const next = nextEnd(bytes, choice.dataStart, choice.end + 1, failed);
      if (next === null) continue;
      if (retries >= INLINE_END_RETRIES) return false;
      retries += 1;
      choices.push({ ...choice, end: next });
      state = copy(choice.saved);
      pos = next + 2;
      operands = [];
      open = [];
      return true;
    }
    return false;
  };

  for (;;) {
    const token = nextToken(bytes, pos);
    if (token.is === "unsure") {
      if (retry()) continue;
      return "unsure";
    }
    if (token.is === "end") {
      if (open.length > 0) {
        if (retry()) continue;
        return "unsure";
      }
      break;
    }
    pos = token.next;

    switch (token.is) {
      case "value":
        add(token.value);
        break;
      case "open":
        open.push({ is: token.container, items: [] });
        break;
      case "close": {
        const top = open.pop();
        if (!top || top.is !== token.container) {
          if (retry()) continue;
          return "unsure";
        }
        add(
          top.is === "array"
            ? { is: "array", items: top.items }
            : dictionaryOf(top.items),
        );
        break;
      }
      case "keyword": {
        // A keyword inside an array or a dictionary is a value, never an
        // operator; `true`, `false` and `null` are values anywhere.
        if (
          open.length > 0 ||
          token.word === "true" ||
          token.word === "false" ||
          token.word === "null"
        ) {
          add({ is: "scalar" });
          break;
        }
        if (token.word === "BI") {
          const image = inlineImage(bytes, pos);
          if (image === null) {
            if (retry()) continue;
            return "unsure";
          }
          if (
            image.colourSpace !== null &&
            !INLINE_DEVICE_SPACES.has(image.colourSpace)
          ) {
            named("ColorSpace", image.colourSpace);
          }
          // Spec 0022, AC-1: recorded before the state is saved for a retry,
          // so a later end for this picture keeps it, and a retry back to an
          // earlier picture forgets it.
          if (image.lost) state.losesPicture = true;
          if (image.printed !== null) state.inlineSpaces.add(image.printed);
          const end = nextEnd(bytes, image.dataStart, image.dataStart, failed);
          if (end === null) {
            if (retry()) continue;
            return "unsure";
          }
          choices.push({ dataStart: image.dataStart, end, saved: copy(state) });
          pos = end + 2;
          operands = [];
          break;
        }
        operate(token.word, operands, state, named, properties);
        operands = [];
        break;
      }
      case "number":
        add({ is: "scalar" });
        break;
    }
  }

  // A sequence the stream never closes: its `/ActualText` counts unless text
  // was drawn inside it, as at an `EMC`.
  for (const sequence of state.sequences) {
    if (sequence.actualText && !sequence.drew) state.describes = true;
  }
  return Object.freeze({
    describes: state.describes,
    names: state.names,
    showsText: state.showsText,
    losesPicture: state.losesPicture,
    inlineSpaces: state.inlineSpaces,
  });
}

/** One operator, with the operands collected before it. */
function operate(
  word: string,
  operands: readonly Value[],
  state: Semantics,
  named: (category: ResourceCategory, name: string) => void,
  properties: PDFObject | null,
): void {
  const last = operands.at(-1);
  const lastName = last?.is === "name" ? last.name : null;
  const firstName =
    operands[0]?.is === "name" ? (operands[0] as { name: string }).name : null;

  if (TEXT_SHOWING.has(word)) {
    state.showsText = true;
    for (const sequence of state.sequences) sequence.drew = true;
    return;
  }

  switch (word) {
    case "Do":
      if (lastName !== null) named("XObject", lastName);
      return;
    case "Tf":
      if (firstName !== null) named("Font", firstName);
      return;
    case "gs":
      if (lastName !== null) named("ExtGState", lastName);
      return;
    case "sh":
      if (lastName !== null) named("Shading", lastName);
      return;
    case "cs":
    case "CS":
      if (lastName !== null && !DEVICE_SPACES.has(lastName))
        named("ColorSpace", lastName);
      return;
    case "scn":
    case "SCN":
      if (lastName !== null) named("Pattern", lastName);
      return;
    case "BMC":
      state.sequences.push({ actualText: false, drew: false });
      return;
    case "BDC":
    case "DP": {
      // The tag first, then the property list: a lone tag is no list.
      const list = operands.length >= 2 ? operands.at(-1) : undefined;
      let reading: ListReading = { counts: false, actualText: false };
      if (list?.is === "dict") {
        reading = readInlineList(list);
      } else if (list?.is === "name") {
        named("Properties", list.name);
        reading = readNamedList(properties, list.name);
      }
      if (word === "BDC") {
        if (reading.counts) state.describes = true;
        state.sequences.push({ actualText: reading.actualText, drew: false });
      } else if (reading.counts || reading.actualText) {
        // A point is never a sequence, so its `/ActualText` always counts.
        state.describes = true;
      }
      return;
    }
    case "EMC": {
      const sequence = state.sequences.pop();
      if (sequence?.actualText && !sequence.drew) state.describes = true;
      return;
    }
  }
}

/** What one property list holds: a string that counts now, and an `/ActualText` that counts unless text is drawn. */
interface ListReading {
  readonly counts: boolean;
  readonly actualText: boolean;
}

/**
 * A property list written inline. Every string anywhere inside it counts,
 * except an `/ActualText`, which waits for its sequence's end, and a `/Lang`
 * that reads as a language tag (AC-9), by the one rule the catalog's `/Lang`
 * is held to too (`readsAsLanguageTag`, spec 0021, AC-2).
 */
function readInlineList(list: Extract<Value, { is: "dict" }>): ListReading {
  let counts = false;
  let actualText = false;
  for (const [key, value] of list.entries) {
    if (key === "ActualText" && value.is === "string") {
      actualText = true;
    } else if (key === "Lang" && value.is === "string") {
      if (!readsAsLanguageTag(value.bytes)) counts = true;
    } else if (holdsString(value)) {
      counts = true;
    }
  }
  return { counts, actualText };
}

/**
 * A property list named in the owning `/Properties`. The prune cuts it to
 * `/ActualText` and `/MCID`, so `/ActualText` is the one string that can stay.
 */
function readNamedList(properties: PDFObject | null, name: string): ListReading {
  if (properties === null || !properties.isDictionary())
    return { counts: false, actualText: false };
  const list = properties.get(name);
  if (!list.isDictionary()) return { counts: false, actualText: false };
  return { counts: false, actualText: list.get("ActualText").isString() };
}

/** Is there a string anywhere inside this value? Walked with a list, never recursion. */
function holdsString(value: Value): boolean {
  const pending: Value[] = [value];
  while (pending.length > 0) {
    const next = pending.pop() as Value;
    if (next.is === "string") return true;
    if (next.is === "array") pending.push(...next.items);
    if (next.is === "dict") pending.push(...next.entries.values());
  }
  return false;
}

/** A dictionary from its items read in order: each name key and the value after it. */
function dictionaryOf(items: readonly Value[]): Value {
  const entries = new Map<string, Value>();
  for (let at = 0; at + 1 < items.length; at += 2) {
    const key = items[at];
    if (key.is === "name") entries.set(key.name, items[at + 1]);
  }
  return { is: "dict", entries };
}

/** A copy of the state to restore when an inline image's end is tried again. */
function copy(state: Semantics): Semantics {
  return {
    sequences: state.sequences.map((sequence) => ({ ...sequence })),
    names: new Map(
      [...state.names].map(([category, found]) => [category, new Set(found)]),
    ),
    inlineSpaces: new Set(state.inlineSpaces),
    describes: state.describes,
    showsText: state.showsText,
    losesPicture: state.losesPicture,
  };
}

/** One token, and where the next one starts. */
type Token =
  | { readonly is: "end" }
  | { readonly is: "unsure" }
  | { readonly is: "value"; readonly value: Value; readonly next: number }
  | { readonly is: "number"; readonly next: number }
  | { readonly is: "open"; readonly container: "array" | "dict"; readonly next: number }
  | { readonly is: "close"; readonly container: "array" | "dict"; readonly next: number }
  | { readonly is: "keyword"; readonly word: string; readonly next: number };

/** The token at `start`, white space and comments skipped. */
function nextToken(bytes: Uint8Array, start: number): Token {
  let pos = start;
  for (;;) {
    while (pos < bytes.length && isWhite(bytes[pos])) pos += 1;
    if (pos < bytes.length && bytes[pos] === 0x25) {
      while (pos < bytes.length && bytes[pos] !== 0x0a && bytes[pos] !== 0x0d) pos += 1;
      continue;
    }
    break;
  }
  if (pos >= bytes.length) return { is: "end" };

  const byte = bytes[pos];
  switch (byte) {
    case 0x28: // (
      return literalString(bytes, pos + 1);
    case 0x29: // ) with no string open
      return { is: "unsure" };
    case 0x3c: // <
      if (bytes[pos + 1] === 0x3c)
        return { is: "open", container: "dict", next: pos + 2 };
      return hexString(bytes, pos + 1);
    case 0x3e: // >
      if (bytes[pos + 1] === 0x3e)
        return { is: "close", container: "dict", next: pos + 2 };
      return { is: "unsure" };
    case 0x5b: // [
      return { is: "open", container: "array", next: pos + 1 };
    case 0x5d: // ]
      return { is: "close", container: "array", next: pos + 1 };
    case 0x2f: // /
      return name(bytes, pos + 1);
    case 0x7b: // { and }, which drawing instructions never hold
    case 0x7d:
      return { is: "keyword", word: String.fromCharCode(byte), next: pos + 1 };
    default: {
      let end = pos;
      while (end < bytes.length && !isWhite(bytes[end]) && !isDelimiter(bytes[end]))
        end += 1;
      const word = latin1(bytes, pos, end);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) return { is: "number", next: end };
      return { is: "keyword", word, next: end };
    }
  }
}

/** A literal string from just after its `(`: balanced parentheses, `\` escaping the next byte. */
function literalString(bytes: Uint8Array, start: number): Token {
  const out: number[] = [];
  let depth = 1;
  let pos = start;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    if (byte === 0x5c) {
      pos += 1;
      if (pos >= bytes.length) break;
      const escaped = bytes[pos];
      if (escaped >= 0x30 && escaped <= 0x37) {
        let code = 0;
        let digits = 0;
        while (
          digits < 3 &&
          pos < bytes.length &&
          bytes[pos] >= 0x30 &&
          bytes[pos] <= 0x37
        ) {
          code = code * 8 + (bytes[pos] - 0x30);
          pos += 1;
          digits += 1;
        }
        out.push(code & 0xff);
        continue;
      }
      if (escaped === 0x0d) {
        // A backslash before a line end continues the string on the next line.
        pos += bytes[pos + 1] === 0x0a ? 2 : 1;
        continue;
      }
      if (escaped !== 0x0a) out.push(ESCAPES.get(escaped) ?? escaped);
      pos += 1;
      continue;
    }
    if (byte === 0x28) depth += 1;
    if (byte === 0x29) {
      depth -= 1;
      if (depth === 0) {
        return {
          is: "value",
          value: { is: "string", bytes: Uint8Array.from(out) },
          next: pos + 1,
        };
      }
    }
    out.push(byte);
    pos += 1;
  }
  return { is: "unsure" };
}

const ESCAPES = new Map([
  [0x6e, 0x0a], // \n
  [0x72, 0x0d], // \r
  [0x74, 0x09], // \t
  [0x62, 0x08], // \b
  [0x66, 0x0c], // \f
]);

/** A hex string from just after its `<`, digits decoded to bytes, an odd last digit padded with 0. */
function hexString(bytes: Uint8Array, start: number): Token {
  const out: number[] = [];
  let high: number | null = null;
  let pos = start;
  while (pos < bytes.length) {
    const byte = bytes[pos];
    pos += 1;
    if (byte === 0x3e) {
      if (high !== null) out.push(high << 4);
      return {
        is: "value",
        value: { is: "string", bytes: Uint8Array.from(out) },
        next: pos,
      };
    }
    const digit = hexDigit(byte);
    if (digit === null) continue;
    if (high === null) {
      high = digit;
    } else {
      out.push((high << 4) | digit);
      high = null;
    }
  }
  return { is: "unsure" };
}

function hexDigit(byte: number): number | null {
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  if (byte >= 0x41 && byte <= 0x46) return byte - 0x37;
  if (byte >= 0x61 && byte <= 0x66) return byte - 0x57;
  return null;
}

/** A name from just after its `/`, its `#xx` escapes decoded before it is compared with a key. */
function name(bytes: Uint8Array, start: number): Token {
  let end = start;
  while (end < bytes.length && !isWhite(bytes[end]) && !isDelimiter(bytes[end])) end += 1;
  let text = "";
  for (let at = start; at < end; at += 1) {
    const byte = bytes[at];
    if (byte === 0x23 && at + 2 < end) {
      const high = hexDigit(bytes[at + 1]);
      const low = hexDigit(bytes[at + 2]);
      if (high !== null && low !== null) {
        text += String.fromCharCode((high << 4) | low);
        at += 2;
        continue;
      }
    }
    text += String.fromCharCode(byte);
  }
  return { is: "value", value: { is: "name", name: text }, next: end };
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let text = "";
  for (let at = start; at < end; at += 1) text += String.fromCharCode(bytes[at]);
  return text;
}

/** What the scan reads from one inline picture's dictionary. */
interface InlinePicture {
  /** The resource name its colour space uses, for resource use (spec 0021, AC-7). */
  readonly colourSpace: string | null;
  /** Where its data starts: one white space byte after `ID`. */
  readonly dataStart: number;
  /** MuPDF 1.28.1's write would lose it (spec 0022, AC-1). */
  readonly lost: boolean;
  /** The name its `/CS` holds directly, when neither empty nor a device name (AC-1). */
  readonly printed: string | null;
}

/**
 * An inline image's dictionary, from just after `BI` to its `ID`. `null` if
 * the dictionary cannot be read to an `ID`.
 */
function inlineImage(bytes: Uint8Array, start: number): InlinePicture | null {
  const items: Value[] = [];
  const open: Open[] = [];
  let pos = start;
  for (;;) {
    const token = nextToken(bytes, pos);
    if (token.is === "end" || token.is === "unsure") return null;
    pos = token.next;
    const add = (value: Value) => {
      const top = open.at(-1);
      if (top) top.items.push(value);
      else items.push(value);
    };
    if (token.is === "open") {
      open.push({ is: token.container, items: [] });
    } else if (token.is === "close") {
      const top = open.pop();
      if (!top || top.is !== token.container) return null;
      add(
        top.is === "array" ? { is: "array", items: top.items } : dictionaryOf(top.items),
      );
    } else if (token.is === "keyword") {
      if (open.length === 0 && token.word === "ID") break;
      if (
        open.length === 0 &&
        token.word !== "true" &&
        token.word !== "false" &&
        token.word !== "null"
      ) {
        return null;
      }
      // Spec 0022, AC-1: `true` kept apart, so the mask test can read it.
      add(token.word === "true" ? { is: "true" } : { is: "scalar" });
    } else if (token.is === "number") {
      add({ is: "scalar" });
    } else {
      add(token.value);
    }
  }
  const { entries } = dictionaryOf(items) as Extract<Value, { is: "dict" }>;
  const space = entries.get("CS") ?? entries.get("ColorSpace");
  const dataStart = pos < bytes.length && isWhite(bytes[pos]) ? pos + 1 : pos;
  const short = entries.get("CS");
  return {
    colourSpace: inlineSpaceName(space),
    dataStart,
    lost: losesPicture(entries),
    printed:
      short?.is === "name" && short.name !== "" && !INLINE_DEVICE_SPACES.has(short.name)
        ? short.name
        : null,
  };
}

/**
 * Would MuPDF 1.28.1's write lose this inline picture? Spec 0022, AC-1, by the
 * rule its loader and writer follow (`pdf_load_image_imp`,
 * `parse_inline_image`, `pdf_out_BI`; `rationale.md`, *MuPDF 1.28.1's
 * source*). MuPDF reads both pairs of keys short key first (`pdf_dict_geta`:
 * `/IM` before `/ImageMask`, `/CS` before `/ColorSpace`), whichever comes first
 * in the bytes, as task 8 measured, so the long key counts only when the short
 * one is absent. A key is present whatever its value, `null` included, which
 * can only refuse more (INV-4). The lost cases:
 *
 *  - a `/JPXDecode` filter under `/Filter` or `/F`, a mask included: MuPDF
 *    throws on an inline JPX picture, so it is never written;
 *  - not a mask, and no colour space for MuPDF to load: every write throws;
 *  - not a mask, the loaded space not a device space, and `/CS` not a name
 *    that is not empty. The writer prints `/CS` whenever it is a direct name
 *    and the empty name otherwise, and since `/CS` is the space MuPDF loads, a
 *    name that is not empty there is always written under its own name.
 *
 * It looks no resource up and follows no drawing state, so a `/ColorSpace`
 * name whose resource is a device space, `/ColorSpace /Pattern` and a picture
 * under a clip with no area count as lost although the write keeps them. It
 * leans to refusing (INV-4), with one exception: a `/CS` name with no resource
 * entry is kept, though the write drops it, because the file never defines its
 * colours and MuPDF draws nothing for it in the source either.
 */
function losesPicture(entries: ReadonlyMap<string, Value>): boolean {
  if (namesJpx(entries.get("Filter")) || namesJpx(entries.get("F"))) return true;

  const mask = entries.has("IM") ? entries.get("IM") : entries.get("ImageMask");
  if (mask?.is === "true") return false;

  const short = entries.get("CS");
  const loaded = entries.has("CS") ? short : entries.get("ColorSpace");
  if (loaded === undefined) return true;
  if (isDeviceSpace(loaded)) return false;
  return !(short?.is === "name" && short.name !== "");
}

/** A filter value naming `/JPXDecode`, alone or in an array. */
function namesJpx(filter: Value | undefined): boolean {
  if (filter?.is === "name") return filter.name === "JPXDecode";
  if (filter?.is !== "array") return false;
  return filter.items.some((item) => item.is === "name" && item.name === "JPXDecode");
}

/**
 * A device space as MuPDF loads one inline (spec 0022, AC-1): a name in
 * `INLINE_DEVICE_SPACES`, or an array whose first item is such a name or
 * `/CalCMYK`, of any length, since MuPDF loads that array as its device space
 * and ignores the rest (`pdf_load_colorspace_imp`). Anything else present, a
 * number, a string or a dictionary included, is not one.
 */
function isDeviceSpace(space: Value): boolean {
  if (space.is === "name") return INLINE_DEVICE_SPACES.has(space.name);
  if (space.is !== "array") return false;
  const [family] = space.items;
  return (
    family?.is === "name" &&
    (INLINE_DEVICE_SPACES.has(family.name) || family.name === "CalCMYK")
  );
}

/**
 * The colour space name an inline image's `/CS` uses: the name itself, or the
 * base of an `/I` or `/Indexed` array when the base is a name (spec 0021,
 * AC-7). The format allows a named resource inside an inline image's colour
 * space only there, so nothing else inside an array counts. The caller leaves
 * out a device space.
 */
function inlineSpaceName(space: Value | undefined): string | null {
  if (space?.is === "name") return space.name;
  if (space?.is !== "array") return null;
  const [family, base] = space.items;
  if (family?.is !== "name" || (family.name !== "I" && family.name !== "Indexed")) {
    return null;
  }
  return base?.is === "name" ? base.name : null;
}

/**
 * Where an inline image's data may end: the first `EI` at or after `from` with
 * white space before it and white space, a delimiter or the end after it,
 * passing over any whose resume point already failed. `null` if none is left.
 */
function nextEnd(
  bytes: Uint8Array,
  dataStart: number,
  from: number,
  failed: ReadonlySet<number>,
): number | null {
  for (let at = Math.max(from, dataStart); at + 1 < bytes.length; at += 1) {
    if (bytes[at] !== 0x45 || bytes[at + 1] !== 0x49) continue;
    if (!isWhite(bytes[at - 1])) continue;
    const after = at + 2;
    if (after < bytes.length && !isWhite(bytes[after]) && !isDelimiter(bytes[after]))
      continue;
    if (failed.has(after)) continue;
    return at;
  }
  return null;
}
