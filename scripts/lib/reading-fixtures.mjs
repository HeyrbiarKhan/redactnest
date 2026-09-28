/**
 * The fixtures for reading pages. Spec 0006, *Build plan*, tasks 7, 11, 14
 * and 18.
 *
 * Written object by object like the redaction matrix, from the same page
 * builders, so a reviewer can read exactly what each page draws. None is made
 * by MuPDF. Every page is small: a scan is a coarse grey image, never a real
 * one, because the rules read where an image lands, not what it shows. Every
 * value in them is invented, and `example.com` is reserved for documentation.
 */

import { deflateSync } from "node:zlib";

import { stream } from "./pdf-writer.mjs";
import { document, IDENTITY_UNICODE, line } from "./redaction-fixtures.mjs";

/** The page the builders draw on: US Letter, as `document()` sets it. */
const PAGE = Object.freeze({ width: 612, height: 792 });

/**
 * A scan as a picture: `columns` by `rows` grey pixels, white with a few dark
 * bands where lines of type would be. Coarse on purpose, since only its
 * placement is read.
 */
function scanImage(add, { columns = 51, rows = 66 } = {}) {
  const pixels = new Uint8Array(columns * rows).fill(235);
  for (let row = 6; row < rows - 6; row += 4) {
    pixels.fill(40, row * columns + 5, row * columns + columns - 5);
  }
  return add(
    stream(
      `/Type /XObject /Subtype /Image /Width ${columns} /Height ${rows} ` +
        "/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode",
      deflateSync(pixels),
    ),
  );
}

/**
 * The same, as a one bit stencil painted in black, the way a fax or a JBIG2
 * scan is drawn (`/ImageMask true`).
 */
function stencilScan(add, { columns = 64, rows = 66 } = {}) {
  const stride = columns / 8;
  const bits = new Uint8Array(stride * rows).fill(0xff);
  for (let row = 6; row < rows - 6; row += 4)
    bits.fill(0x00, row * stride + 1, row * stride + stride - 1);
  return add(
    stream(
      `/Type /XObject /Subtype /Image /Width ${columns} /Height ${rows} /ImageMask true ` +
        "/BitsPerComponent 1 /Filter /FlateDecode",
      deflateSync(bits),
    ),
  );
}

/** Draw `/name` over the whole page, as a scanner's PDF does. */
function fullPage(name) {
  return `q ${PAGE.width} 0 0 ${PAGE.height} 0 0 cm /${name} Do Q\n`;
}

/**
 * A simple font whose glyph names map to no character, and no ToUnicode map:
 * what a subset font from some producers looks like. MuPDF extracts every
 * glyph of it as U+FFFD (measured).
 */
function mysteryFont(add) {
  const descriptor = add(
    "<< /Type /FontDescriptor /FontName /Mystery /FontBBox [0 -200 1000 800] " +
      "/Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /ItalicAngle 0 /Flags 4 >>",
  );
  const names = [];
  for (let code = 65; code <= 90; code += 1) names.push(`/zz${code}`);
  return add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Mystery /FirstChar 32 /LastChar 90 " +
      `/Widths [${Array(59).fill(600).join(" ")}] ` +
      `/Encoding << /Type /Encoding /Differences [65 ${names.join(" ")}] >> ` +
      `/FontDescriptor ${descriptor} 0 R >>`,
  );
}

/**
 * A Type0 font whose codes are Unicode code points by its identity map, used
 * here only for private use code points (U+E000 up), as an icon or a symbol
 * font maps them.
 */
function privateFont(add) {
  const unicode = add(stream("", IDENTITY_UNICODE));
  const descriptor = add(
    "<< /Type /FontDescriptor /FontName /RedactNestPrivate /FontBBox [0 -200 1000 800] " +
      "/Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /ItalicAngle 0 /Flags 4 >>",
  );
  const cidFont = add(
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /RedactNestPrivate /CIDToGIDMap /Identity " +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
      `/FontDescriptor ${descriptor} 0 R /DW 600 >>`,
  );
  return add(
    "<< /Type /Font /Subtype /Type0 /BaseFont /RedactNestPrivate /Encoding /Identity-H " +
      `/DescendantFonts [${cidFont} 0 R] /ToUnicode ${unicode} 0 R >>`,
  );
}

/** A line of private use code points, one per letter of `text`. */
function privateLine(size, x, y, text) {
  const hex = [...text]
    .map((letter) => (0xe000 + letter.charCodeAt(0)).toString(16).padStart(4, "0"))
    .join("");
  return `BT /P ${size} Tf ${x} ${y} Td <${hex}> Tj ET\n`;
}

/** Words drawn as filled outlines, with no glyph at all: the letters' bodies. */
function outlinedWords(x, y, text) {
  let paths = "0.1 0.1 0.3 rg\n";
  let at = x;
  for (const letter of text) {
    if (letter !== " ") {
      const tall = /[A-Z]/.test(letter);
      paths += `${at.toFixed(2)} ${y} 7.2 ${tall ? 8.6 : 6.2} re `;
    }
    at += 8;
  }
  return `${paths}f\n`;
}

/** The Bates number a scanner stamps on each page: a few readable characters. */
export const BATES_STAMP = "RN-000123";

/** A stamp that holds an address, so detection must read the scanned page (AC-12). */
export const STAMP_EMAIL = "records@example.com";

/**
 * One page per rule, and per near miss, for slice 1. The findings each page
 * must give, in the same order, are `READ_PAGES`.
 */
export const READ_PAGES = Object.freeze([
  { name: "a typed page", findings: [], readable: true },
  { name: "an image covering the page", findings: ["scanned"], readable: false },
  { name: "a stamped scan", findings: ["scanned"], readable: true },
  { name: "a stencil scan", findings: ["scanned"], readable: false },
  { name: "words drawn as outlines", findings: ["drawn-only"], readable: false },
  { name: "a lone small logo", findings: ["drawn-only"], readable: false },
  { name: "an empty page", findings: ["blank"], readable: false },
  { name: "a white rectangle over the page", findings: ["blank"], readable: false },
  { name: "a page in an unmapped font", findings: ["unreadable-text"], readable: false },
  {
    name: "a page in a private use font",
    findings: ["unreadable-text"],
    readable: false,
  },
  { name: "one unmapped bullet among typed text", findings: [], readable: true },
  { name: "a scan stamped with an address", findings: ["scanned"], readable: true },
]);

/** The pages `READ_PAGES` names, in its order. */
function readPageSpecs(add) {
  const scan = scanImage(add);
  const stencil = stencilScan(add);
  const logo = scanImage(add, { columns: 8, rows: 8 });
  const mystery = mysteryFont(add);
  const privately = privateFont(add);
  const fonts = `/M ${mystery} 0 R /P ${privately} 0 R`;

  return [
    {
      content:
        line("F1", 14, 72, 720, "Quarterly statement") +
        line("F1", 12, 72, 696, "Everything on this page is typed and can be read."),
    },
    { resources: `/XObject << /Scan ${scan} 0 R >>`, content: fullPage("Scan") },
    {
      resources: `/XObject << /Scan ${scan} 0 R >>`,
      content: fullPage("Scan") + line("F1", 9, 520, 24, BATES_STAMP),
    },
    {
      resources: `/XObject << /Scan ${stencil} 0 R >>`,
      content: `0 0 0 rg ${fullPage("Scan")}`,
    },
    { content: outlinedWords(72, 700, "Words drawn as shapes") },
    {
      resources: `/XObject << /Logo ${logo} 0 R >>`,
      content: "q 40 0 0 40 72 700 cm /Logo Do Q\n",
    },
    { content: "" },
    { content: `q 1 1 1 rg 0 0 ${PAGE.width} ${PAGE.height} re f Q\n` },
    {
      fonts,
      content:
        "BT /M 12 Tf 72 700 Td (QUARTERLY STATEMENT FOR ACCOUNT) Tj ET\n" +
        "BT /M 12 Tf 72 680 Td (PAYEE AND REFERENCE) Tj ET\n",
    },
    { fonts, content: privateLine(12, 72, 700, "Private symbols") },
    {
      fonts,
      content:
        "BT /F1 12 Tf 72 700 Td (Item ) Tj /M 12 Tf (A) Tj /F1 12 Tf ( typed words after an unmapped bullet) Tj ET\n",
    },
    {
      resources: `/XObject << /Scan ${scan} 0 R >>`,
      content: fullPage("Scan") + line("F1", 9, 72, 24, `Sent to ${STAMP_EMAIL}`),
    },
  ];
}

/** Spec 0006, AC-1 to AC-3. One page per rule and near miss. */
export function readPages() {
  return document(({ add }) => readPageSpecs(add));
}

/** Every page a scan, so there is nothing readable (AC-10). */
export function readScans() {
  return document(({ add }) => {
    const scan = scanImage(add);
    return [0, 1].map(() => ({
      resources: `/XObject << /Scan ${scan} 0 R >>`,
      content: fullPage("Scan"),
    }));
  });
}

/** Every page blank: one empty, one a white rectangle (AC-10). */
export function readBlank() {
  return document(() => [
    { content: "" },
    { content: `q 1 1 1 rg 0 0 ${PAGE.width} ${PAGE.height} re f Q\n` },
  ]);
}

/** Every page a scan with its Bates number (AC-2, AC-10). */
export function readStamped() {
  return document(({ add }) => {
    const scan = scanImage(add);
    return ["RN-000124", "RN-000125"].map((stamp) => ({
      resources: `/XObject << /Scan ${scan} 0 R >>`,
      content: fullPage("Scan") + line("F1", 9, 520, 24, stamp),
    }));
  });
}

/** Every page set in a font with no character map (AC-3, AC-10). */
export function readUnmapped() {
  return document(({ add }) => {
    const fonts = `/M ${mysteryFont(add)} 0 R`;
    return ["FIRST PAGE OF THE LETTER", "SECOND PAGE OF THE LETTER"].map((text) => ({
      fonts,
      content: `BT /M 12 Tf 72 700 Td (${text}) Tj ET\n`,
    }));
  });
}

/** Every page set in private use code points (AC-3, AC-10). */
export function readPrivate() {
  return document(({ add }) => [
    {
      fonts: `/P ${privateFont(add)} 0 R`,
      content: privateLine(12, 72, 700, "Symbols only"),
    },
  ]);
}

/** A scan, a blank page, a stamped scan and an unmapped page: nothing readable (AC-10). */
export function readRefusedMix() {
  return document(({ add }) => {
    const scan = scanImage(add);
    const fonts = `/M ${mysteryFont(add)} 0 R`;
    return [
      { resources: `/XObject << /Scan ${scan} 0 R >>`, content: fullPage("Scan") },
      { content: "" },
      {
        resources: `/XObject << /Scan ${scan} 0 R >>`,
        content: fullPage("Scan") + line("F1", 9, 520, 24, BATES_STAMP),
      },
      { fonts, content: "BT /M 12 Tf 72 700 Td (UNMAPPED LETTERS) Tj ET\n" },
    ];
  });
}

/** The words on `read-mixed.pdf`'s typed page, with an address to find. */
export const MIXED_EMAIL = "jane.doe@example.com";

/**
 * Spec 0006, the happy path of slice 1: a typed page, a scan and a blank
 * page. It opens, names page 2 as scanned, and downloads as partly redacted.
 */
export function readMixed() {
  return document(({ add }) => {
    const scan = scanImage(add);
    return [
      {
        content:
          line("F1", 14, 72, 720, "Letter with an enclosure") +
          line("F1", 12, 72, 696, `Contact: ${MIXED_EMAIL}`),
      },
      { resources: `/XObject << /Scan ${scan} 0 R >>`, content: fullPage("Scan") },
      { content: "" },
    ];
  });
}
