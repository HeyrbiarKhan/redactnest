import type { PDFDocument, PDFObject } from "mupdf";

/**
 * The typed allowlist below the pages. Spec 0019, AC-1 to AC-3, INV-1 and
 * INV-2.
 *
 * The catalog and page allowlists in `rebuild.ts` decide what those two
 * objects keep, but everything they point at was grafted whole: a font, a
 * figure or a picture kept every key it came with, and whatever each key
 * pointed at. A private key on a font could hold the original copy of a figure
 * a pass had redacted, so a ticked value stayed in the file and passed every
 * check (feature 31's measurements).
 *
 * So every object below the catalog gets a role, taken from the key and the
 * role of the object that reached it, never from what the object says about
 * itself (INV-1), and keeps only the keys that role needs to draw. Each kept
 * key's value has a shape the PDF format gives that key. What is off every list
 * an object is reached under is deleted; what is on a list but in a shape the
 * format never gives that key, or kept by one of an object's roles and dropped
 * by another, is refused (INV-2). The rule never keeps an unlisted key and
 * never guesses a shape.
 *
 * `ROLES`, `STRING_PLACES` and `TRAILER_KEYS` are engine constants, rules about
 * the file format rather than caps on the visitor, so no environment variable
 * can change them (INV-5). A key the output needs is a reviewed `ROLES` change
 * with a failing fixture as its proof, never a key removed from `CARRIER_KEYS`
 * (INV-6). Spec 0021 adds `LANG_TAG`, `CID_TOKEN` and `ADOBE_COLLECTIONS`
 * beside them, on the same terms (its INV-6): each string place says what its
 * string must read as, and one fold serves the rebuild and the check (its
 * INV-1).
 *
 * The walk never calls `.resolve()` on what it reaches. In a document built by
 * grafting, MuPDF 1.28.1 writes a stream it was asked to resolve as a bare
 * dictionary whenever the deduplicating write merges an object that stream
 * points to, so a form or a picture would lose its drawing. Reading and editing
 * through the reference (`get`, `forEach`, `delete`) leaves it alone.
 */

/** Every role an object below the trailer can take. Spec 0019, *Role table*. */
export const ROLE_NAMES = Object.freeze([
  "catalog",
  "pages",
  "page",
  "content",
  "resources",
  "simple-font",
  "type3-font",
  "type0-font",
  "cid-font",
  "cid-system-info",
  "font-descriptor",
  "font-file",
  "encoding",
  "character-map",
  "image",
  "form",
  "group",
  "graphics-state",
  "soft-mask",
  "tiling-pattern",
  "shading-pattern",
  "shading",
  "function",
  "colour-profile",
  "calibrated-space",
  "devicen-attributes",
  "devicen-process",
  "property-list",
  "decode-parameters",
  "plain-stream",
] as const);

export type Role = (typeof ROLE_NAMES)[number];

/**
 * The shape a kept key's value may take (spec 0019, *Role table*). Choosers
 * (`font`, `xobject`, `pattern`, `kid`) pick a role by the one key the table
 * says decides: `/Subtype`, `/PatternType` or a tree node's `/Type` (INV-1).
 */
export type Shape =
  /** A name, a number or a boolean. */
  | { readonly is: "scalar" }
  /** An array of numbers, names and booleans, nested arrays allowed. */
  | { readonly is: "numbers" }
  /** An array of names. */
  | { readonly is: "names" }
  /** A string that reads as `text`. Used only at `STRING_PLACES`. */
  | { readonly is: "string"; readonly text: StringText }
  /** A dictionary or stream that takes this role. */
  | { readonly is: "role"; readonly role: Role }
  /** The first option whose outer form fits the value. */
  | { readonly is: "either"; readonly options: readonly Shape[] }
  /** An array, each item of this shape. */
  | { readonly is: "array"; readonly item: Shape; readonly label: string }
  /** A dictionary whose every value is of this shape. */
  | { readonly is: "dict"; readonly value: Shape; readonly label: string }
  /** A name, or a colour space array of a family the table knows. */
  | { readonly is: "colour" }
  /** A function dictionary or stream, an array of them, `/Identity` or `/Default`. */
  | { readonly is: "function" }
  /** An `/Indexed` colour space's lookup table: a string or a stream. */
  | { readonly is: "palette" }
  /** A font, its role chosen by `/Subtype`. */
  | { readonly is: "font" }
  /** An XObject, its role chosen by `/Subtype`; neither an image nor a form is deleted. */
  | { readonly is: "xobject" }
  /** A pattern, its role chosen by `/PatternType`; neither 1 nor 2 is deleted. */
  | { readonly is: "pattern" }
  /** A page tree node, its role chosen by `/Type`. */
  | { readonly is: "kid" };

/** What a role keeps, and whether it is a dictionary, a stream or either. */
export interface RoleRule {
  readonly form: "dict" | "stream" | "either";
  readonly keys: Readonly<Record<string, Shape>>;
}

const SCALAR: Shape = { is: "scalar" };
const NUMBERS: Shape = { is: "numbers" };
const NAMES: Shape = { is: "names" };
// Spec 0021, AC-3: one string shape per thing a string place's text must read
// as, each carrying it, so the walk tests a string where it meets one.
const LANG_STRING: Shape = { is: "string", text: "language-tag" };
const TOKEN_STRING: Shape = { is: "string", text: "token" };
const ANY_STRING: Shape = { is: "string", text: "any" };
const COLOUR: Shape = { is: "colour" };
const FUNCTION: Shape = { is: "function" };
const PALETTE: Shape = { is: "palette" };
const FONT: Shape = { is: "font" };
const XOBJECT: Shape = { is: "xobject" };
const PATTERN: Shape = { is: "pattern" };
const KID: Shape = { is: "kid" };

const role = (name: Role): Shape => ({ is: "role", role: name });
const either = (...options: Shape[]): Shape => ({ is: "either", options });
const arrayOf = (item: Shape, label: string): Shape => ({ is: "array", item, label });
const dictOf = (value: Shape, label: string): Shape => ({ is: "dict", value, label });

/** Every stream role also keeps these, so MuPDF can decode it. */
const STREAM_KEYS: Readonly<Record<string, Shape>> = {
  Length: SCALAR,
  Filter: either(SCALAR, NAMES),
  DecodeParms: either(
    role("decode-parameters"),
    arrayOf(role("decode-parameters"), "decode parameters array"),
  ),
};

const SIMPLE_FONT_KEYS: Readonly<Record<string, Shape>> = {
  Type: SCALAR,
  Subtype: SCALAR,
  BaseFont: SCALAR,
  FirstChar: SCALAR,
  LastChar: SCALAR,
  Widths: NUMBERS,
  FontDescriptor: role("font-descriptor"),
  Encoding: either(SCALAR, role("encoding")),
  ToUnicode: role("character-map"),
};

/**
 * The role table. A role's list is the keys MuPDF needs to draw it, from the
 * PDF 2.0 tables, less every key that carries data instead (spec 0019, *Role
 * table*). What each leaves out on purpose is in the spec's table beside it.
 *
 * `catalog` and `page` restate `CATALOG_KEYS` and `PAGE_KEYS` from
 * `rebuild.ts`, which stay as they are; `tests/unit/allowlist.test.ts` holds
 * the two equal. Written out here rather than imported, because `rebuild.ts`
 * imports this file.
 */
export const ROLES: Readonly<Record<Role, RoleRule>> = deepFreeze<Record<Role, RoleRule>>(
  {
    catalog: {
      form: "dict",
      keys: { Type: SCALAR, Pages: role("pages"), Lang: LANG_STRING },
    },
    pages: {
      form: "dict",
      keys: {
        Type: SCALAR,
        Kids: arrayOf(KID, "page tree kids"),
        Count: SCALAR,
        Parent: role("pages"),
        Resources: role("resources"),
        MediaBox: NUMBERS,
        CropBox: NUMBERS,
        Rotate: SCALAR,
      },
    },
    page: {
      form: "dict",
      keys: {
        Type: SCALAR,
        Parent: role("pages"),
        MediaBox: NUMBERS,
        CropBox: NUMBERS,
        BleedBox: NUMBERS,
        TrimBox: NUMBERS,
        ArtBox: NUMBERS,
        Rotate: SCALAR,
        UserUnit: SCALAR,
        Resources: role("resources"),
        Contents: either(role("content"), arrayOf(role("content"), "contents array")),
        Group: role("group"),
      },
    },
    content: { form: "stream", keys: { ...STREAM_KEYS } },
    resources: {
      form: "dict",
      keys: {
        Font: dictOf(FONT, "font resources"),
        XObject: dictOf(XOBJECT, "xobject resources"),
        ExtGState: dictOf(role("graphics-state"), "graphics state resources"),
        ColorSpace: dictOf(COLOUR, "colour space resources"),
        Pattern: dictOf(PATTERN, "pattern resources"),
        Shading: dictOf(role("shading"), "shading resources"),
        Properties: dictOf(role("property-list"), "property list resources"),
        ProcSet: NAMES,
      },
    },
    "simple-font": { form: "dict", keys: SIMPLE_FONT_KEYS },
    "type3-font": {
      form: "dict",
      keys: {
        ...SIMPLE_FONT_KEYS,
        FontBBox: NUMBERS,
        FontMatrix: NUMBERS,
        CharProcs: dictOf(role("content"), "glyph procedures"),
        Resources: role("resources"),
      },
    },
    "type0-font": {
      form: "dict",
      keys: {
        Type: SCALAR,
        Subtype: SCALAR,
        BaseFont: SCALAR,
        Encoding: either(SCALAR, role("character-map")),
        DescendantFonts: arrayOf(role("cid-font"), "descendant fonts"),
        ToUnicode: role("character-map"),
      },
    },
    "cid-font": {
      form: "dict",
      keys: {
        Type: SCALAR,
        Subtype: SCALAR,
        BaseFont: SCALAR,
        CIDSystemInfo: role("cid-system-info"),
        FontDescriptor: role("font-descriptor"),
        DW: SCALAR,
        W: NUMBERS,
        DW2: NUMBERS,
        W2: NUMBERS,
        CIDToGIDMap: either(SCALAR, role("plain-stream")),
      },
    },
    "cid-system-info": {
      form: "dict",
      keys: { Registry: TOKEN_STRING, Ordering: TOKEN_STRING, Supplement: SCALAR },
    },
    "font-descriptor": {
      form: "dict",
      keys: {
        Type: SCALAR,
        FontName: SCALAR,
        FontStretch: SCALAR,
        FontWeight: SCALAR,
        Flags: SCALAR,
        FontBBox: NUMBERS,
        ItalicAngle: SCALAR,
        Ascent: SCALAR,
        Descent: SCALAR,
        Leading: SCALAR,
        CapHeight: SCALAR,
        XHeight: SCALAR,
        StemV: SCALAR,
        StemH: SCALAR,
        AvgWidth: SCALAR,
        MaxWidth: SCALAR,
        MissingWidth: SCALAR,
        FontFile: role("font-file"),
        FontFile2: role("font-file"),
        FontFile3: role("font-file"),
      },
    },
    "font-file": {
      form: "stream",
      keys: {
        ...STREAM_KEYS,
        Length1: SCALAR,
        Length2: SCALAR,
        Length3: SCALAR,
        Subtype: SCALAR,
      },
    },
    encoding: {
      form: "dict",
      keys: { Type: SCALAR, BaseEncoding: SCALAR, Differences: NUMBERS },
    },
    "character-map": {
      form: "stream",
      keys: {
        ...STREAM_KEYS,
        Type: SCALAR,
        CMapName: SCALAR,
        CIDSystemInfo: role("cid-system-info"),
        WMode: SCALAR,
        UseCMap: either(SCALAR, role("character-map")),
      },
    },
    image: {
      form: "stream",
      keys: {
        ...STREAM_KEYS,
        Type: SCALAR,
        Subtype: SCALAR,
        Width: SCALAR,
        Height: SCALAR,
        ColorSpace: COLOUR,
        BitsPerComponent: SCALAR,
        Intent: SCALAR,
        ImageMask: SCALAR,
        Mask: either(NUMBERS, role("image")),
        Decode: NUMBERS,
        Interpolate: SCALAR,
        SMask: role("image"),
        SMaskInData: SCALAR,
        Matte: NUMBERS,
      },
    },
    form: {
      form: "stream",
      keys: {
        ...STREAM_KEYS,
        Type: SCALAR,
        Subtype: SCALAR,
        FormType: SCALAR,
        BBox: NUMBERS,
        Matrix: NUMBERS,
        Resources: role("resources"),
        Group: role("group"),
      },
    },
    group: {
      form: "dict",
      keys: { Type: SCALAR, S: SCALAR, CS: COLOUR, I: SCALAR, K: SCALAR },
    },
    "graphics-state": {
      form: "dict",
      keys: {
        Type: SCALAR,
        LW: SCALAR,
        LC: SCALAR,
        LJ: SCALAR,
        ML: SCALAR,
        D: NUMBERS,
        RI: SCALAR,
        OP: SCALAR,
        op: SCALAR,
        OPM: SCALAR,
        Font: arrayOf(either(FONT, SCALAR), "graphics state font"),
        BG: FUNCTION,
        BG2: FUNCTION,
        UCR: FUNCTION,
        UCR2: FUNCTION,
        TR: FUNCTION,
        TR2: FUNCTION,
        FL: SCALAR,
        SM: SCALAR,
        SA: SCALAR,
        BM: either(SCALAR, NAMES),
        SMask: either(SCALAR, role("soft-mask")),
        CA: SCALAR,
        ca: SCALAR,
        AIS: SCALAR,
        TK: SCALAR,
        UseBlackPtComp: SCALAR,
      },
    },
    "soft-mask": {
      form: "dict",
      keys: { Type: SCALAR, S: SCALAR, G: role("form"), BC: NUMBERS, TR: FUNCTION },
    },
    "tiling-pattern": {
      form: "stream",
      keys: {
        ...STREAM_KEYS,
        Type: SCALAR,
        PatternType: SCALAR,
        PaintType: SCALAR,
        TilingType: SCALAR,
        BBox: NUMBERS,
        XStep: SCALAR,
        YStep: SCALAR,
        Resources: role("resources"),
        Matrix: NUMBERS,
      },
    },
    "shading-pattern": {
      form: "dict",
      keys: {
        Type: SCALAR,
        PatternType: SCALAR,
        Shading: role("shading"),
        Matrix: NUMBERS,
        ExtGState: role("graphics-state"),
      },
    },
    shading: {
      form: "either",
      keys: {
        ...STREAM_KEYS,
        ShadingType: SCALAR,
        ColorSpace: COLOUR,
        Background: NUMBERS,
        BBox: NUMBERS,
        AntiAlias: SCALAR,
        Coords: NUMBERS,
        Domain: NUMBERS,
        Extend: NUMBERS,
        Function: FUNCTION,
        Matrix: NUMBERS,
        BitsPerCoordinate: SCALAR,
        BitsPerComponent: SCALAR,
        BitsPerFlag: SCALAR,
        Decode: NUMBERS,
        VerticesPerRow: SCALAR,
      },
    },
    function: {
      form: "either",
      keys: {
        ...STREAM_KEYS,
        FunctionType: SCALAR,
        Domain: NUMBERS,
        Range: NUMBERS,
        Size: NUMBERS,
        BitsPerSample: SCALAR,
        Order: SCALAR,
        Encode: NUMBERS,
        Decode: NUMBERS,
        C0: NUMBERS,
        C1: NUMBERS,
        N: SCALAR,
        Functions: arrayOf(FUNCTION, "functions"),
        Bounds: NUMBERS,
      },
    },
    "colour-profile": {
      form: "stream",
      keys: { ...STREAM_KEYS, N: SCALAR, Alternate: COLOUR, Range: NUMBERS },
    },
    "calibrated-space": {
      form: "dict",
      keys: {
        WhitePoint: NUMBERS,
        BlackPoint: NUMBERS,
        Gamma: either(SCALAR, NUMBERS),
        Matrix: NUMBERS,
        Range: NUMBERS,
      },
    },
    "devicen-attributes": {
      form: "dict",
      keys: {
        Subtype: SCALAR,
        Colorants: dictOf(COLOUR, "colorants"),
        Process: role("devicen-process"),
      },
    },
    "devicen-process": { form: "dict", keys: { ColorSpace: COLOUR, Components: NAMES } },
    "property-list": { form: "dict", keys: { ActualText: ANY_STRING, MCID: SCALAR } },
    "decode-parameters": {
      form: "dict",
      keys: {
        Predictor: SCALAR,
        Colors: SCALAR,
        BitsPerComponent: SCALAR,
        Columns: SCALAR,
        EarlyChange: SCALAR,
        K: SCALAR,
        EndOfLine: SCALAR,
        EncodedByteAlign: SCALAR,
        Rows: SCALAR,
        EndOfBlock: SCALAR,
        BlackIs1: SCALAR,
        DamagedRowsBeforeError: SCALAR,
        ColorTransform: SCALAR,
        JBIG2Globals: role("plain-stream"),
      },
    },
    "plain-stream": { form: "stream", keys: { ...STREAM_KEYS } },
  },
);

/**
 * What a string place's text must read as (spec 0021, AC-3): a language tag
 * (`LANG_TAG`), a short token (`CID_TOKEN`), or any string at all.
 */
export type StringText = "language-tag" | "token" | "any";

/** One place outside a stream where the output may hold a string, and what it must read as. */
export type StringPlace =
  | { readonly role: Role; readonly key: string; readonly text: StringText }
  | { readonly colourSpace: "Indexed"; readonly item: number; readonly text: "any" };

/**
 * Where the output may hold a string, and nowhere else (spec 0019, AC-2): the
 * catalog's `/Lang`, a `CIDSystemInfo`'s `/Registry` and `/Ordering`, the
 * fourth item of an `/Indexed` colour space array (its palette), and a marked
 * content property list's `/ActualText`. `ROLES` gives the string shape only
 * at these keys, which `tests/unit/allowlist.test.ts` holds, so every other
 * string goes with its key.
 *
 * Spec 0021, AC-3: each place says what its string must read as, and `ROLES`
 * gives each key the string shape carrying the same `text`, which the test
 * holds too. The palette's `text` is read by no shape: the palette shape is
 * binary and stays as it is.
 */
export const STRING_PLACES: readonly StringPlace[] = deepFreeze<StringPlace[]>([
  { role: "catalog", key: "Lang", text: "language-tag" },
  { role: "cid-system-info", key: "Registry", text: "token" },
  { role: "cid-system-info", key: "Ordering", text: "token" },
  { colourSpace: "Indexed", item: 3, text: "any" },
  { role: "property-list", key: "ActualText", text: "any" },
]);

/**
 * A string that reads as a language tag, matched against the whole decoded
 * string, letters in either case (spec 0021, AC-2): a language of two or three
 * ASCII letters; then, each after a hyphen or an underscore, each optional and
 * in this order, a script of four letters, a region of two letters or three
 * digits, and any number of variants of a digit followed by three letters or
 * digits. So `en-GB`, `es-419` and `sr-Latn-RS-1994` read as tags, and
 * `Amy-Jones`, `Bob_Smith` and `Jane Smith` do not.
 *
 * Its limit, on purpose: a short name that fits the shape (`Doe`, `Amy-Rose`,
 * `Ann-Li`) still reads as a tag. Unticked it can stay, as spec 0019 says
 * unticked text can; ticked, the rebuild leaves it out of the catalog, and an
 * inline one keeps spec 0019's warning rules. `tests/unit/marked.test.ts`
 * pins those three as tags, so a change here is deliberate. Real tags the
 * shape leaves out (private use such as `x-none`, a variant of five to eight
 * letters, an extended language) count as text.
 *
 * One pattern serves the scan's inline `/Lang` rule (`marked.ts`), the
 * rebuild's catalog `/Lang` and the walk, so the inline and catalog rules never
 * disagree (INV-1). A rule about the format, not a cap on the visitor (INV-6).
 */
export const LANG_TAG =
  /^[A-Za-z]{2,3}(?:[-_][A-Za-z]{4})?(?:[-_](?:[A-Za-z]{2}|[0-9]{3}))?(?:[-_][0-9][A-Za-z0-9]{3})*$/;

/**
 * What a `CIDSystemInfo`'s `/Registry` and `/Ordering` must be, matched on the
 * string's raw bytes (spec 0021, AC-3): empty, or an ASCII letter followed by
 * up to 15 ASCII letters or digits. So a hyphen, an underscore, a space, a
 * leading digit or any byte outside ASCII refuses, and `123-45-6789`,
 * `Rowan-Ashby` and `Rowan Ashby` never pass, while every value Adobe defines
 * (`Adobe`; `Identity`, `UCS`, `Japan1`, `GB1` and the rest) does.
 *
 * These strings name the character collection a CID font's codes come from,
 * which can change how a reader draws and reads its text, so the walk refuses
 * a value outside the token rather than deleting it (INV-2). What the token
 * still lets through, a run together name or code such as `RowanAshby`, stays
 * only when unticked: the self check fails a ticked one (AC-4). A rule about
 * the format, not a cap on the visitor (INV-6).
 */
export const CID_TOKEN = /^(?:[A-Za-z][A-Za-z0-9]{0,15})?$/;

/** Do these raw bytes read as `CID_TOKEN`? A byte outside ASCII never does. */
function readsAsToken(bytes: Uint8Array): boolean {
  if (bytes.length > 16) return false;
  let text = "";
  for (const byte of bytes) {
    if (byte >= 0x80) return false;
    text += String.fromCharCode(byte);
  }
  return CID_TOKEN.test(text);
}

/**
 * Does this string read as a language tag? Decoded as `decodeTextString`
 * decodes it; one that cannot be decoded is no tag. Spec 0021, AC-2.
 */
export function readsAsLanguageTag(bytes: Uint8Array): boolean {
  const text = decodeTextString(bytes);
  return text !== null && LANG_TAG.test(text);
}

/**
 * The characters PDFDocEncoding gives bytes 0x18 to 0x1F and 0x80 to 0xA0,
 * where it parts from Latin 1 (PDF 2.0, Annex D). Every other byte is its
 * Latin 1 character; the few the encoding leaves undefined are no letter or
 * digit, so the fold drops them either way.
 */
const PDF_DOC_LOW = "\u02d8\u02c7\u02c6\u02d9\u02dd\u02db\u02da\u02dc";
const PDF_DOC_HIGH =
  "\u2022\u2020\u2021\u2026\u2014\u2013\u0192\u2044\u2039\u203a\u2212\u2030\u201e\u201c" +
  "\u201d\u2018\u2019\u201a\u2122\ufb01\ufb02\u0141\u0152\u0160\u0178\u017d\u0131\u0142" +
  "\u0153\u0161\u017e\u009f\u20ac";

/**
 * A string's text, decoded as the scan decodes one: UTF-16BE after the `FE FF`
 * mark, PDFDocEncoding otherwise, or `null` when it cannot be decoded (a
 * UTF-16 string of an odd length). Spec 0021, AC-1.
 */
export function decodeTextString(bytes: Uint8Array): string | null {
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    if (bytes.length % 2 !== 0) return null;
    let text = "";
    for (let at = 2; at < bytes.length; at += 2) {
      text += String.fromCharCode((bytes[at] << 8) | bytes[at + 1]);
    }
    return text;
  }
  let text = "";
  for (const byte of bytes) {
    if (byte >= 0x18 && byte <= 0x1f) text += PDF_DOC_LOW[byte - 0x18];
    else if (byte >= 0x80 && byte <= 0xa0) text += PDF_DOC_HIGH[byte - 0x80];
    else text += String.fromCharCode(byte);
  }
  return text;
}

/**
 * A string place's text, or a ticked item's, folded for comparison (spec
 * 0021, AC-4): lowercase, then NFKD, then only letters and digits, so case,
 * accents and every space, hyphen or underscore drop out, and `Rowan Ashby`
 * folds to `rowanashby`, as an `/Ordering (RowanAshby)` does.
 */
export function foldPlaceText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Every ticked item's text, folded once per run, empty folds dropped (spec
 * 0021, AC-4, *Value sourcing*). The rebuild and the check take this one list,
 * so the two never disagree (INV-1). The folds are document text: they live
 * only inside the worker for the length of the run, as the character record
 * does, and are never logged or sent.
 */
export function foldTicked(texts: Iterable<string>): readonly string[] {
  const folded = new Set<string>();
  for (const text of texts) {
    const fold = foldPlaceText(text);
    if (fold.length > 0) folded.add(fold);
  }
  return Object.freeze([...folded]);
}

/**
 * The format's own values at a `CIDSystemInfo`'s strings, never compared with
 * a ticked text (spec 0021, AC-4): a `/Registry` that is exactly `Adobe`, an
 * `/Ordering` that is exactly one of Adobe's collections. They are the same
 * in every file and never taken from the document, so ticking `ID`, `Adobe` or
 * `Japan` does not refuse every file with such a font. A ticked word that
 * matches one whole stays, as a ticked word matching a font's name already
 * does. A rule about the format, not a cap on the visitor (INV-6).
 */
export const ADOBE_COLLECTIONS: Readonly<
  Record<"Registry" | "Ordering", readonly string[]>
> = deepFreeze({
  Registry: ["Adobe"],
  Ordering: ["Identity", "UCS", "Japan1", "Japan2", "GB1", "CNS1", "Korea1", "KR"],
});

/**
 * Does a string place's text hold a ticked item's? Plain containment of the
 * folds, so any of `ticked` inside the folded `text` answers true (spec 0021,
 * AC-4). An empty fold in `ticked` is skipped, so it never matches everything.
 */
export function holdsTicked(text: string, ticked: readonly string[]): boolean {
  const folded = foldPlaceText(text);
  return ticked.some((fold) => fold.length > 0 && folded.includes(fold));
}

/**
 * Does a string's raw bytes read as its place's `text`? Spec 0021, AC-2 and
 * AC-3. A language tag is tested on the decoded text, a token on the raw
 * bytes, and `any` takes every string.
 */
function fitsText(text: StringText, bytes: Uint8Array): boolean {
  switch (text) {
    case "language-tag":
      return readsAsLanguageTag(bytes);
    case "token":
      return readsAsToken(bytes);
    case "any":
      return true;
  }
}

/** The keys the output's trailer may hold (spec 0019, AC-1). */
export const TRAILER_KEYS: readonly string[] = Object.freeze(["Size", "Root"]);

/**
 * Drawing streams read together: a page's contents (an array read as one,
 * with white space between), a form's or a tiling pattern's own stream, or a
 * Type 3 font's glyph procedures, each read on its own (`joined` false).
 */
export interface DrawingUnit {
  /** Indirect references to the streams. */
  readonly streams: readonly PDFObject[];
  /** Whether the streams are one drawing split in parts, as a page's contents are. */
  readonly joined: boolean;
  /** The resource dictionary the streams draw with, or `null` for none. */
  readonly resources: PDFObject | null;
}

/** One resource dictionary, and every drawing that draws with it. */
export interface ResourceOwner {
  readonly resources: PDFObject;
  readonly units: readonly DrawingUnit[];
}

/**
 * Why the walk refused: a value in a shape the format never gives its key, or
 * an object reached in roles or kinds it cannot satisfy together (AC-3).
 */
export type RoleProblem = "shape" | "roles";

/** What `walkRoles` found. When it names a problem, `pages`, `owners`, `glyphs` and `outside` are empty. */
export interface RoleWalk {
  /** The first problem, or `null`. When set, the walk stopped and nothing was deleted. */
  readonly problem: RoleProblem | null;
  /**
   * How many keys, entries and nulls the prune deletes: deleted in `"prune"`,
   * only counted in `"read"`. The check fails on any (AC-5); the open ignores
   * them, since a run's prune deletes them.
   */
  readonly strays: number;
  /** Every indirect object reached, with the roles and kinds it was reached in. */
  readonly reached: ReadonlyMap<number, ReadonlySet<string>>;
  /** Each page's drawings: its contents first, then every form, tiling pattern and Type 3 font it draws. */
  readonly pages: readonly (readonly DrawingUnit[])[];
  /** One entry per resource dictionary reached, with every drawing that draws with it. */
  readonly owners: readonly ResourceOwner[];
  /**
   * The glyph side's starting drawings (spec 0020, AC-1): one unit per Type 3
   * font found and each dictionary it draws with (its own `/Resources`, or,
   * holding none, each dictionary it was found under), its streams every glyph
   * procedure in `/CharProcs`, drawn by text or not, `joined` false. A font
   * written in place and found twice gives two units.
   */
  readonly glyphs: readonly DrawingUnit[];
  /**
   * The other side (spec 0020, AC-2): every indirect object reached from the
   * walk's starting point by a path that never passes through a Type 3 font's
   * `/CharProcs` or `/Resources`. Judged by keys, not by what a drawing names,
   * so an entry a page lists and never draws still counts.
   */
  readonly outside: ReadonlySet<number>;
}

type Outer = "missing" | "scalar" | "string" | "array" | "dict" | "stream";

/**
 * A value's outer form, read through a reference without resolving it.
 *
 * A reference to an object that does not exist answers false to every test,
 * `isNull()` included, so it counts as missing, as a null does.
 */
function outerOf(value: PDFObject): Outer {
  if (value.isNull()) return "missing";
  if (value.isStream()) return "stream";
  if (value.isDictionary()) return "dict";
  if (value.isArray()) return "array";
  if (value.isString()) return "string";
  if (value.isName() || value.isNumber() || value.isBoolean()) return "scalar";
  return "missing";
}

function fitsForm(form: RoleRule["form"], outer: Outer): boolean {
  if (form === "either") return outer === "dict" || outer === "stream";
  return outer === form;
}

/** Could `shape` take a value of this outer form? Picks the option of an `either`. */
function accepts(shape: Shape, outer: Outer): boolean {
  switch (shape.is) {
    case "scalar":
      return outer === "scalar";
    case "string":
      return outer === "string";
    case "numbers":
    case "names":
    case "array":
      return outer === "array";
    case "role":
      return fitsForm(ROLES[shape.role].form, outer);
    case "either":
      return shape.options.some((option) => accepts(option, outer));
    case "dict":
    case "font":
    case "kid":
      return outer === "dict";
    case "colour":
      return outer === "scalar" || outer === "array";
    case "function":
      return outer !== "missing" && outer !== "string";
    case "palette":
      return outer === "string" || outer === "stream";
    case "xobject":
    case "pattern":
      return true;
  }
}

/** A name's text, or `null` if the value is not a name. */
function nameOf(value: PDFObject): string | null {
  return value.isName() ? value.asName() : null;
}

/** Where a value sits, so its key or entry can be deleted. */
interface Place {
  readonly container: PDFObject;
  readonly key: string;
}

/**
 * Where a value hangs, for the other side (spec 0020, AC-2): its nearest
 * indirect ancestor (`null` at a starting point), and whether a Type 3 font's
 * `/CharProcs` or `/Resources` lies between that ancestor and the value.
 */
interface Lineage {
  readonly parent: number | null;
  readonly barred: boolean;
}

/** One value still to visit. */
interface Item extends Lineage {
  readonly value: PDFObject;
  readonly shape: Shape;
  readonly at: Place | null;
  /** The resource dictionary this value hangs under, for drawings found in it. */
  readonly res: string | null;
  /** A resource dictionary's id, chosen by the drawing that owns it. */
  readonly id?: string;
}

/** The three kinds of drawing below a page that draw with a resource dictionary. */
type DrawerKind = "form" | "tiling-pattern" | "type3-font";

/** A form, a tiling pattern or a Type 3 font, and where it draws from. */
interface Drawer {
  /** Which of the three, so a font's drawer is known by its kind, never by `joined` (spec 0020). */
  readonly kind: DrawerKind;
  readonly streams: PDFObject[];
  readonly joined: boolean;
  own: string | null;
  readonly from: Set<string>;
}

/** A page's contents and the resource dictionary they draw with. */
interface PageDrawing {
  streams: PDFObject[];
  res: string | null;
}

/** A role visit to an indirect object: its reference and the keys off that role's list. */
interface RoleVisit {
  readonly ref: PDFObject;
  readonly off: Map<Role, readonly string[]>;
}

/**
 * Walk the document and give every object it reaches a role. Spec 0019,
 * AC-1 to AC-3.
 *
 * `"prune"` deletes every key not on its role's list, every null at a key, and
 * every resource the format gives no drawing; `"read"` only reports. Both stop
 * at the first problem, and a prune that stops has deleted nothing.
 *
 * From `"catalog"` (the rebuild and the check), the walk starts at the trailer:
 * its keys outside `TRAILER_KEYS` are strays, and `/Root` is the catalog. From
 * `"pages"` (the open, on the prepared review copy), it starts at each page
 * from `findPage`, reads the page's inherited `/Resources`, `/MediaBox`,
 * `/CropBox` and `/Rotate` through `getInheritable`, and never walks the page
 * tree or follows `/Parent`, so a tree node is never refused for a missing
 * `/Type`.
 *
 * An explicit work list, each indirect object visited once per role or kind,
 * and no recursion, so a cycle or a deep nesting cannot stop it.
 *
 * Spec 0020 adds what the glyph rule reads: `glyphs`, from each Type 3 font's
 * drawer, and `outside`, from the edges between indirect objects. Each item
 * carries its nearest indirect ancestor and whether a Type 3 font's
 * `/CharProcs` or `/Resources` lies between (`barred`), and every edge is
 * recorded as its item is visited, before `reach` can stop a second visit, so
 * an object found again by another path still gains that path. `outside` is
 * then every object reachable from the starting points over edges that are
 * not barred, worked out after the loop. Never by visiting an object again: a
 * second visit would mint fresh ids for dictionaries written in place, giving
 * the check an owner with no drawings, and count its deletions twice.
 */
export function walkRoles(
  doc: PDFDocument,
  mode: "prune" | "read",
  from: "catalog" | "pages" = "catalog",
): RoleWalk {
  const stack: Item[] = [];
  const seen = new Set<string>();
  const reached = new Map<number, Set<string>>();
  const roleVisits = new Map<number, RoleVisit>();
  const deletions: Place[] = [];
  const resources = new Map<string, PDFObject>();
  const children = new Map<string, Set<string>>();
  const drawers = new Map<string, Drawer>();
  const pageCount = doc.countPages();
  const pageAt = new Map<number, number>();
  const pageDrawings: PageDrawing[] = [];
  // The other side's graph (spec 0020, AC-2): the objects a starting point
  // holds, and each object's edges to the objects it holds, barred ones left
  // out, since no path to the other side may cross one.
  const roots = new Set<number>();
  const edges = new Map<number, number[]>();
  // State the visits change, in one object, so the problem a closure records
  // is read back as it is rather than as TypeScript last narrowed it.
  const state: { problem: RoleProblem | null; anonymous: number } = {
    problem: null,
    anonymous: 0,
  };

  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.findPage(index);
    if (page.isIndirect()) pageAt.set(page.asIndirect(), index);
    pageDrawings.push({ streams: [], res: null });
  }

  const fail = (kind: RoleProblem): void => {
    state.problem ??= kind;
  };

  /** Count an indirect object as reached in this role or kind; true the first time. */
  const reach = (value: PDFObject, label: string): boolean => {
    if (!value.isIndirect()) return true;
    const num = value.asIndirect();
    let labels = reached.get(num);
    if (!labels) {
      labels = new Set();
      reached.set(num, labels);
    }
    labels.add(label);
    const key = `${num} ${label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };

  /** A resource dictionary's id: its object number, or a fresh one if written in place. */
  const resourceId = (value: PDFObject): string => {
    if (value.isIndirect()) return `R${value.asIndirect()}`;
    state.anonymous += 1;
    return `D${state.anonymous}`;
  };

  const push = (item: Item): void => {
    stack.push(item);
  };

  /**
   * Where the children of `item` hang: below an indirect object, that object
   * and no bar; below a value written in place, wherever it hangs itself, so
   * a bar is carried through direct containers.
   */
  const below = (item: Item): Lineage =>
    item.value.isIndirect()
      ? { parent: item.value.asIndirect(), barred: false }
      : { parent: item.parent, barred: item.barred };

  /** Record the edge to an indirect value, unless it is barred (spec 0020, AC-2). */
  const link = (value: PDFObject, from: Lineage): void => {
    if (from.barred || !value.isIndirect()) return;
    const num = value.asIndirect();
    if (from.parent === null) {
      roots.add(num);
      return;
    }
    let next = edges.get(from.parent);
    if (!next) {
      next = [];
      edges.set(from.parent, next);
    }
    next.push(num);
  };

  const remove = (at: Place | null): void => {
    if (at) deletions.push(at);
    else fail("shape");
  };

  /** Each item of an array of `item`, nulls left where they are. */
  const visitArray = (array: Item, item: Shape, label: string) => {
    const { value, res } = array;
    if (outerOf(value) !== "array") return fail("shape");
    if (!reach(value, label)) return;
    const lineage = below(array);
    const length = value.length;
    for (let index = 0; index < length; index += 1) {
      const entry = value.get(index);
      if (outerOf(entry) === "missing") continue;
      push({ value: entry, shape: item, at: null, res, ...lineage });
    }
  };

  /** An array of numbers, names and booleans, nested arrays allowed. */
  const visitNumbers = (array: Item, label: string, namesOnly: boolean) => {
    const { value } = array;
    if (outerOf(value) !== "array") return fail("shape");
    if (!reach(value, label)) return;
    const lineage = below(array);
    const length = value.length;
    for (let index = 0; index < length; index += 1) {
      const entry = value.get(index);
      const outer = outerOf(entry);
      if (outer === "missing") continue;
      if (outer === "scalar") {
        if (namesOnly && !entry.isName()) return fail("shape");
        link(entry, lineage);
        reach(entry, "scalar");
      } else if (outer === "array" && !namesOnly) {
        push({ value: entry, shape: NUMBERS, at: null, res: null, ...lineage });
      } else {
        return fail("shape");
      }
    }
  };

  /** A name, or a colour space array of a family the table knows (AC-3). */
  const visitColour = (item: Item) => {
    const { value, res } = item;
    const outer = outerOf(value);
    if (outer === "scalar") {
      if (!value.isName()) return fail("shape");
      reach(value, "colour space");
      return;
    }
    if (outer !== "array") return fail("shape");
    if (!reach(value, "colour space")) return;

    const length = value.length;
    const family = length > 0 ? nameOf(value.get(0)) : null;
    const lineage = below(item);
    const items = (...shapes: Shape[]) => {
      shapes.forEach((shape, index) => {
        const entry = value.get(index + 1);
        if (outerOf(entry) === "missing") return fail("shape");
        push({ value: entry, shape, at: null, res, ...lineage });
      });
    };

    switch (family) {
      case "ICCBased":
        if (length !== 2) return fail("shape");
        return items(role("colour-profile"));
      case "Indexed":
        if (length !== 4) return fail("shape");
        return items(COLOUR, SCALAR, PALETTE);
      case "Separation":
        if (length !== 4) return fail("shape");
        return items(SCALAR, COLOUR, FUNCTION);
      case "DeviceN":
        if (length === 4) return items(NAMES, COLOUR, FUNCTION);
        if (length === 5)
          return items(NAMES, COLOUR, FUNCTION, role("devicen-attributes"));
        return fail("shape");
      case "Pattern":
        if (length === 1) return;
        if (length === 2) return items(COLOUR);
        return fail("shape");
      case "CalRGB":
      case "CalGray":
      case "Lab":
        if (length !== 2) return fail("shape");
        return items(role("calibrated-space"));
      default:
        return fail("shape");
    }
  };

  /** A dictionary or stream in `name`'s role: its keys checked, and the kept ones followed. */
  const visitRole = (item: Item, name: Role) => {
    const { value } = item;
    const rule = ROLES[name];
    if (!fitsForm(rule.form, outerOf(value))) return fail("shape");

    // A drawing found under a resource dictionary draws from it, every time it
    // is found, so the edge is kept before the visit is counted once.
    const drawer = drawerOf(item, name);
    if (!reach(value, name)) return;

    const off: string[] = [];
    let ownResources: string | null = null;
    let contents: PDFObject | null = null;
    const res = name === "resources" ? (item.id ?? resourceId(value)) : item.res;
    if (name === "resources") resources.set(res as string, value);

    // Spec 0020, AC-2: what a Type 3 font's glyphs draw with, and the glyphs
    // themselves, hang below a bar, so nothing reached only through them is on
    // the other side.
    const lineage = below(item);
    const barred: Lineage = { parent: lineage.parent, barred: true };
    const lineageOf = (key: string): Lineage =>
      name === "type3-font" && (key === "CharProcs" || key === "Resources")
        ? barred
        : lineage;

    value.forEach((child, key) => {
      if (typeof key !== "string") return;
      if (outerOf(child) === "missing") {
        deletions.push({ container: value, key });
        return;
      }
      const shape = rule.keys[key];
      if (!shape) {
        off.push(key);
        return;
      }
      if (name === "page" && key === "Parent" && from === "pages") return;
      if (key === "Resources") {
        const id = resourceId(child);
        ownResources = id;
        push({
          value: child,
          shape,
          at: { container: value, key },
          res,
          id,
          ...lineageOf(key),
        });
        return;
      }
      if (name === "page" && key === "Contents") contents = child;
      push({
        value: child,
        shape,
        at: { container: value, key },
        res,
        ...lineageOf(key),
      });
    });

    if (value.isIndirect()) {
      const num = value.asIndirect();
      let visit = roleVisits.get(num);
      if (!visit) {
        visit = { ref: value, off: new Map() };
        roleVisits.set(num, visit);
      }
      visit.off.set(name, off);
    } else {
      for (const key of off) deletions.push({ container: value, key });
    }

    if (name === "page") {
      if (from === "pages") {
        for (const key of ["Resources", "MediaBox", "CropBox", "Rotate"] as const) {
          if (key === "Resources" ? ownResources !== null : !value.get(key).isNull()) {
            continue;
          }
          const inherited = value.getInheritable(key);
          if (outerOf(inherited) === "missing") continue;
          const shape = rule.keys[key];
          if (key === "Resources") {
            ownResources = resourceId(inherited);
            push({
              value: inherited,
              shape,
              at: null,
              res: null,
              id: ownResources,
              ...lineage,
            });
          } else {
            push({ value: inherited, shape, at: null, res: null, ...lineage });
          }
        }
      }
      const index = value.isIndirect() ? pageAt.get(value.asIndirect()) : undefined;
      if (index !== undefined) {
        pageDrawings[index] = {
          streams: contents === null ? [] : streamsOf(contents),
          res: ownResources,
        };
      }
    }
    if (drawer) drawer.own = ownResources;
  };

  /**
   * The drawer record for a form, a tiling pattern or a Type 3 font, with the
   * resource dictionary it was found under added to where it draws from.
   */
  const drawerOf = (item: Item, name: Role): Drawer | null => {
    if (name !== "form" && name !== "tiling-pattern" && name !== "type3-font")
      return null;
    const { value } = item;
    let id: string;
    if (value.isIndirect()) {
      id = `U${value.asIndirect()}`;
    } else {
      state.anonymous += 1;
      id = `T${state.anonymous}`;
    }
    let drawer = drawers.get(id);
    if (!drawer) {
      const streams =
        name === "type3-font"
          ? glyphProcedures(value)
          : value.isIndirect()
            ? [value]
            : [];
      drawer = {
        kind: name,
        streams,
        joined: name !== "type3-font",
        own: null,
        from: new Set(),
      };
      drawers.set(id, drawer);
    }
    if (item.res !== null) {
      drawer.from.add(item.res);
      let found = children.get(item.res);
      if (!found) {
        found = new Set();
        children.set(item.res, found);
      }
      found.add(id);
    }
    return drawer;
  };

  const visit = (item: Item): void => {
    const { value, shape, res } = item;
    // The edge first, before any `reach` can end a second visit (spec 0020,
    // AC-2). An `either` visits again with its option, which records it.
    if (shape.is !== "either") link(value, item);
    switch (shape.is) {
      case "scalar":
        if (outerOf(value) !== "scalar") return fail("shape");
        reach(value, "scalar");
        return;
      case "string":
        if (outerOf(value) !== "string") return fail("shape");
        // Spec 0021, AC-3: a string outside what its place reads as is a value
        // in a shape the format never gives that key (spec 0019, INV-2). The
        // bytes are read through the reference, never resolved.
        if (!fitsText(shape.text, value.asByteString())) return fail("shape");
        reach(value, "string");
        return;
      case "numbers":
        return visitNumbers(item, "number array", false);
      case "names":
        return visitNumbers(item, "name array", true);
      case "role":
        return visitRole(item, shape.role);
      case "either": {
        const outer = outerOf(value);
        const option = shape.options.find((candidate) => accepts(candidate, outer));
        if (!option) return fail("shape");
        return visit({ ...item, shape: option });
      }
      case "array":
        return visitArray(item, shape.item, shape.label);
      case "dict": {
        if (outerOf(value) !== "dict") return fail("shape");
        if (!reach(value, shape.label)) return;
        const lineage = below(item);
        value.forEach((entry, key) => {
          if (typeof key !== "string") return;
          if (outerOf(entry) === "missing") {
            deletions.push({ container: value, key });
            return;
          }
          push({
            value: entry,
            shape: shape.value,
            at: { container: value, key },
            res,
            ...lineage,
          });
        });
        return;
      }
      case "colour":
        return visitColour(item);
      case "function": {
        const outer = outerOf(value);
        if (outer === "dict" || outer === "stream") return visitRole(item, "function");
        if (outer === "array") return visitArray(item, FUNCTION, "function");
        const name = nameOf(value);
        if (name === "Identity" || name === "Default") return;
        return fail("shape");
      }
      case "palette": {
        const outer = outerOf(value);
        if (outer === "stream") return visitRole(item, "plain-stream");
        if (outer !== "string") return fail("shape");
        reach(value, "palette");
        return;
      }
      case "font": {
        if (outerOf(value) !== "dict") return fail("shape");
        const subtype = nameOf(value.get("Subtype"));
        const chosen: Role =
          subtype === "Type0"
            ? "type0-font"
            : subtype === "Type3"
              ? "type3-font"
              : "simple-font";
        return visitRole(item, chosen);
      }
      case "xobject": {
        // A resource the format gives no drawing is deleted, not refused,
        // because nothing on the page is drawn from it (AC-3).
        const subtype = outerOf(value) === "stream" ? nameOf(value.get("Subtype")) : null;
        if (subtype === "Image") return visitRole(item, "image");
        if (subtype === "Form") return visitRole(item, "form");
        return remove(item.at);
      }
      case "pattern": {
        // Neither 1 nor 2 is a pattern MuPDF draws, so it is deleted (AC-3).
        const outer = outerOf(value);
        const type =
          outer === "dict" || outer === "stream" ? value.get("PatternType") : null;
        const kind = type?.isNumber() ? type.asNumber() : 0;
        if (kind === 1) return visitRole(item, "tiling-pattern");
        if (kind === 2) return visitRole(item, "shading-pattern");
        return remove(item.at);
      }
      case "kid": {
        if (outerOf(value) !== "dict") return fail("shape");
        const type = nameOf(value.get("Type"));
        if (type === "Pages") return visitRole(item, "pages");
        if (type === "Page") return visitRole(item, "page");
        return fail("shape");
      }
    }
  };

  if (from === "catalog") {
    const trailer = doc.getTrailer();
    trailer.forEach((value, key) => {
      if (typeof key !== "string") return;
      if (!TRAILER_KEYS.includes(key)) {
        deletions.push({ container: trailer, key });
        return;
      }
      const shape = key === "Root" ? role("catalog") : SCALAR;
      push({
        value,
        shape,
        at: { container: trailer, key },
        res: null,
        parent: null,
        barred: false,
      });
    });
  } else {
    for (let index = pageCount - 1; index >= 0; index -= 1) {
      push({
        value: doc.findPage(index),
        shape: role("page"),
        at: null,
        res: null,
        parent: null,
        barred: false,
      });
    }
  }

  while (stack.length > 0 && state.problem === null) {
    visit(stack.pop() as Item);
  }

  // An object reached in two roles must satisfy each: a key one keeps and
  // another drops is refused, never guessed (AC-3, INV-2).
  const offIndirect: Place[] = [];
  if (state.problem === null) {
    for (const { ref, off } of roleVisits.values()) {
      const lists = [...off.values()];
      const first = new Set(lists[0]);
      const agree = lists.every(
        (list) => list.length === first.size && list.every((key) => first.has(key)),
      );
      if (!agree) {
        fail("roles");
        break;
      }
      for (const key of first) offIndirect.push({ container: ref, key });
    }
  }

  if (state.problem !== null) {
    return Object.freeze({
      problem: state.problem,
      strays: 0,
      reached,
      pages: [],
      owners: [],
      glyphs: [],
      outside: new Set<number>(),
    });
  }

  const strays = deletions.length + offIndirect.length;
  if (mode === "prune") {
    for (const { container, key } of [...deletions, ...offIndirect])
      container.delete(key);
  }

  return Object.freeze({
    problem: null,
    strays,
    reached,
    pages: pageDrawings.map((page) => drawingsOf(page, resources, children, drawers)),
    owners: ownersOf(pageDrawings, resources, drawers),
    glyphs: glyphsOf(resources, drawers),
    outside: reachable(roots, edges),
  });
}

/**
 * Each Type 3 font's glyph procedures, once per dictionary they draw with:
 * the font's own `/Resources`, or, holding none, each dictionary it was found
 * under (spec 0020, AC-1). A font found under none still gives one unit, with
 * no dictionary, so its glyphs are judged all the same.
 */
function glyphsOf(
  resources: ReadonlyMap<string, PDFObject>,
  drawers: ReadonlyMap<string, Drawer>,
): readonly DrawingUnit[] {
  const units: DrawingUnit[] = [];
  for (const drawer of drawers.values()) {
    if (drawer.kind !== "type3-font") continue;
    const draws = drawer.own === null ? [...drawer.from] : [drawer.own];
    if (draws.length === 0) draws.push("");
    for (const id of draws) {
      units.push(
        Object.freeze({
          streams: drawer.streams,
          joined: false,
          resources: resources.get(id) ?? null,
        }),
      );
    }
  }
  return Object.freeze(units);
}

/** Every object reachable from `roots` over `edges`, each edge followed once. */
function reachable(
  roots: ReadonlySet<number>,
  edges: ReadonlyMap<number, readonly number[]>,
): ReadonlySet<number> {
  const found = new Set(roots);
  const pending = [...roots];
  while (pending.length > 0) {
    const num = pending.pop() as number;
    for (const next of edges.get(num) ?? []) {
      if (found.has(next)) continue;
      found.add(next);
      pending.push(next);
    }
  }
  return found;
}

/** A page's `/Contents`: one stream, or an array of them read as one. */
function streamsOf(contents: PDFObject): PDFObject[] {
  if (contents.isStream()) return [contents];
  const streams: PDFObject[] = [];
  if (contents.isArray()) {
    const length = contents.length;
    for (let index = 0; index < length; index += 1) {
      const part = contents.get(index);
      if (part.isStream()) streams.push(part);
    }
  }
  return streams;
}

/** A Type 3 font's glyph procedures, each a stream of its own. */
function glyphProcedures(font: PDFObject): PDFObject[] {
  const streams: PDFObject[] = [];
  const procedures = font.get("CharProcs");
  if (procedures.isDictionary()) {
    procedures.forEach((procedure) => {
      if (procedure.isStream()) streams.push(procedure);
    });
  }
  return streams;
}

/**
 * Every drawing a page draws: its contents first, then each form, tiling
 * pattern and Type 3 font found under the resource dictionaries it draws with,
 * and under theirs in turn. A drawing with no resources of its own draws with
 * the dictionary it was found under.
 */
function drawingsOf(
  page: PageDrawing,
  resources: ReadonlyMap<string, PDFObject>,
  children: ReadonlyMap<string, ReadonlySet<string>>,
  drawers: ReadonlyMap<string, Drawer>,
): readonly DrawingUnit[] {
  const units: DrawingUnit[] = [
    {
      streams: page.streams,
      joined: true,
      resources: page.res === null ? null : (resources.get(page.res) ?? null),
    },
  ];
  if (page.res === null) return Object.freeze(units);

  const pending = [page.res];
  const visited = new Set(pending);
  const listed = new Set<string>();
  while (pending.length > 0) {
    const res = pending.pop() as string;
    for (const id of children.get(res) ?? []) {
      const drawer = drawers.get(id);
      if (!drawer) continue;
      const draws = drawer.own ?? res;
      const key = `${id} ${draws}`;
      if (listed.has(key)) continue;
      listed.add(key);
      units.push({
        streams: drawer.streams,
        joined: drawer.joined,
        resources: resources.get(draws) ?? null,
      });
      if (!visited.has(draws)) {
        visited.add(draws);
        pending.push(draws);
      }
    }
  }
  return Object.freeze(units);
}

/**
 * One owner per resource dictionary reached, with every drawing that draws
 * with it: the pages whose contents use it, and each form, tiling pattern and
 * Type 3 font that holds it or, holding none, was found under it.
 */
function ownersOf(
  pages: readonly PageDrawing[],
  resources: ReadonlyMap<string, PDFObject>,
  drawers: ReadonlyMap<string, Drawer>,
): readonly ResourceOwner[] {
  const units = new Map<string, DrawingUnit[]>();
  for (const id of resources.keys()) units.set(id, []);
  const add = (id: string, unit: Omit<DrawingUnit, "resources">) => {
    const list = units.get(id);
    const dict = resources.get(id);
    if (list && dict) list.push({ ...unit, resources: dict });
  };

  for (const page of pages) {
    if (page.res !== null) add(page.res, { streams: page.streams, joined: true });
  }
  for (const drawer of drawers.values()) {
    const draws = drawer.own === null ? [...drawer.from] : [drawer.own];
    for (const id of draws) add(id, { streams: drawer.streams, joined: drawer.joined });
  }

  return Object.freeze(
    [...units].map(([id, list]) =>
      Object.freeze({
        resources: resources.get(id) as PDFObject,
        units: Object.freeze(list),
      }),
    ),
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
