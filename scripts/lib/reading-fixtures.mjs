/**
 * The fixtures for reading pages. Spec 0006, *Build plan*, tasks 7, 11, 14,
 * 18, 19 and 20.
 *
 * Written object by object like the redaction matrix, from the same page
 * builders, so a reviewer can read exactly what each page draws. None is made
 * by MuPDF. Every page is small: a scan is a coarse grey image, never a real
 * one, because the rules read where an image lands, not what it shows. Every
 * value in them is invented, and `example.com` is reserved for documentation.
 */

import { deflateSync } from "node:zlib";

import { stream } from "./pdf-writer.mjs";
import { document, IDENTITY_UNICODE, line, literal, num } from "./redaction-fixtures.mjs";

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

/**
 * The glyphless font Tesseract writes its text layer in: a Type0 font whose
 * codes are code points by its identity map, and whose glyphs draw nothing.
 * The tiny program Tesseract embeds is left out, as `ocrPage` in the
 * redaction matrix leaves it out, because the text is invisible anyway.
 */
function glyphlessFont(add) {
  const unicode = add(stream("", IDENTITY_UNICODE));
  const descriptor = add(
    "<< /Type /FontDescriptor /FontName /GlyphLessFont /FontBBox [0 0 500 1000] " +
      "/Ascent 1000 /Descent -1 /CapHeight 1000 /StemV 80 /ItalicAngle 0 /Flags 5 >>",
  );
  const cidFont = add(
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /GlyphLessFont /CIDToGIDMap /Identity " +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
      `/FontDescriptor ${descriptor} 0 R /DW 500 >>`,
  );
  return add(
    "<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H " +
      `/DescendantFonts [${cidFont} 0 R] /ToUnicode ${unicode} 0 R >>`,
  );
}

/** One line of invisible text (render mode 3) in the glyphless font. */
function invisibleLine(size, x, y, text) {
  const hex = [...text]
    .map((letter) => letter.codePointAt(0).toString(16).padStart(4, "0"))
    .join("");
  return `BT 3 Tr /Fg ${size} Tf ${x} ${y} Td <${hex}> Tj ET\n`;
}

/** The text layer of a full page OCR scan: twenty lines of words, 32 pt apart. */
function ocrLayer() {
  let layer = "";
  for (let row = 0; row < 20; row += 1) {
    layer += invisibleLine(
      12,
      60,
      740 - row * 32,
      `Line ${row + 1} of the statement reads as words recognised from the scan`,
    );
  }
  return layer;
}

/**
 * One page per picture rule and near miss, for slice 2. The findings each
 * page must give, in the same order, are `READ_PICTURES`.
 */
export const READ_PICTURES = Object.freeze([
  { name: "an ID card pasted on a typed page", findings: ["bare-picture"] },
  { name: "a small logo on a typed page", findings: [] },
  { name: "a large photo with a caption", findings: ["bare-picture"] },
  { name: "a headshot clipped to a small frame", findings: [] },
  {
    name: "a scan with its text layer over it (Tesseract)",
    findings: ["machine-read-text"],
  },
  {
    name: "a scan with its text layer under it (ABBYY)",
    findings: ["machine-read-text"],
  },
  // Spec 0008, AC-1 and AC-5: a machine read run clears each, so neither is
  // bare, and the short one is no longer a stamped scan.
  { name: "a sparse scan with one recognised sentence", findings: ["machine-read-text"] },
  { name: "a sparse scan with a few recognised words", findings: ["machine-read-text"] },
  // Spec 0008, from here on.
  {
    name: "a scan whose layer is stray marks",
    findings: ["scanned", "machine-read-text"],
  },
  {
    name: "a scan whose layer is words of one and two characters",
    findings: ["scanned", "machine-read-text"],
  },
  {
    name: "a scan whose layer is one three letter word",
    findings: ["machine-read-text"],
  },
  {
    name: "a scan whose three letter word a clip cuts to two",
    findings: ["scanned", "machine-read-text"],
  },
  { name: "a sparse Tesseract layer, straight", findings: ["machine-read-text"] },
  { name: "a sparse Tesseract layer, turned a degree", findings: ["machine-read-text"] },
  { name: "a sparse Tesseract layer on a turned page", findings: ["machine-read-text"] },
  {
    name: "a sentence drawn invisible and visible at one place over a scan",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a photo pasted onto an OCR scan, away from its layer",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a scan in two strips, its one word across the join",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a layered scan: a background and a stencil under one layer",
    findings: ["machine-read-text"],
  },
  // Spec 0008, after the 2026-09-30 review. AC-16: text over two pictures of
  // different footprints counts for neither, so each photo stays bare.
  {
    name: "a photo drawn after an OCR line that runs over it",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a photo drawn before an OCR line that runs over it",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a photo across the edge of a half page scan",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a small OCR scan on a full page photo",
    findings: ["bare-picture", "machine-read-text"],
  },
  // AC-14: only letters and numbers count toward a run.
  {
    name: "a scan whose layer is runs of punctuation",
    findings: ["scanned", "machine-read-text"],
  },
  {
    name: "a scan whose layer is runs of format characters",
    findings: ["scanned", "machine-read-text"],
  },
  // AC-15: a line within reach of drawn text counts for nothing.
  {
    name: "a sentence and its invisible copy half a point away",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a sentence and an invisible copy drifting ahead of it",
    findings: ["bare-picture", "machine-read-text"],
  },
  // AC-3's recorded limit, taken up as scope feature 20.
  {
    name: "a photo pasted onto a dense OCR layer",
    findings: ["machine-read-text"],
  },
]);

/** The sparse scans' one recognised sentence: 45 readable characters. */
const SPARSE_SENTENCE = "Signed for and on behalf of the company by its director";

/**
 * One line of Helvetica (`/F1`) in render mode `mode`: 3 is invisible, 0 is
 * filled. `spacing` is the character spacing (`Tc`), added after every glyph.
 * The mode and the spacing are text state, so they outlast the text object;
 * each line sets its own.
 */
function modeLine(mode, size, x, y, text, { spacing = 0 } = {}) {
  return `BT ${mode} Tr ${spacing} Tc /F1 ${size} Tf ${x} ${y} Td ${literal(text)} Tj ET\n`;
}

/** Typed words for the pages that are letters, so each is readable. */
function letterText() {
  return (
    line("F1", 14, 72, 720, "Application for a replacement card") +
    line("F1", 12, 72, 696, "The applicant's details are typed on this page.") +
    line("F1", 12, 72, 680, "The documents supplied are pasted below.")
  );
}

/**
 * Spec 0006, AC-2, AC-4 and AC-5, and spec 0008, AC-1 to AC-7 and, from page
 * 20, AC-14 to AC-16. One page per picture rule and near miss. The glyphless font joins each page through
 * `fonts`, so a page that also draws Helvetica has one `/Font` dictionary
 * holding both.
 */
export function readPictures() {
  return document(({ add }) => {
    const card = scanImage(add, { columns: 40, rows: 25 });
    const logo = scanImage(add, { columns: 8, rows: 8 });
    const photo = scanImage(add, { columns: 48, rows: 36 });
    const scan = scanImage(add);
    const stencil = stencilScan(add);
    const glyphless = glyphlessFont(add);
    const fonts = `/Fg ${glyphless} 0 R`;
    const scanned = `/XObject << /Scan ${scan} 0 R >>`;

    return [
      {
        resources: `/XObject << /Card ${card} 0 R >>`,
        // 243 by 153 pt, an ID card at full size: 7.7% of the page.
        content: `${letterText()}q 243 0 0 153 300 420 cm /Card Do Q\n`,
      },
      {
        resources: `/XObject << /Logo ${logo} 0 R >>`,
        content: `${letterText()}q 40 0 0 40 500 730 cm /Logo Do Q\n`,
      },
      {
        resources: `/XObject << /Photo ${photo} 0 R >>`,
        // 360 by 270 pt, a fifth of the page, with its caption beneath it.
        content:
          `${letterText()}q 360 0 0 270 126 300 cm /Photo Do Q\n` +
          line("F1", 10, 126, 285, "Figure 1: the site as it stands"),
      },
      {
        resources: `/XObject << /Photo ${photo} 0 R >>`,
        // A photo placed at full page size and clipped to a 120 pt frame,
        // 3% of the page: its footprint is the frame, not the photo.
        content: `${letterText()}q 72 460 120 120 re W n 612 0 0 792 0 0 cm /Photo Do Q\n`,
      },
      { fonts, resources: scanned, content: fullPage("Scan") + ocrLayer() },
      { fonts, resources: scanned, content: ocrLayer() + fullPage("Scan") },
      {
        fonts,
        resources: scanned,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, SPARSE_SENTENCE),
      },
      {
        fonts,
        resources: scanned,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, "Signed John Smith"),
      },
      // Spec 0008, AC-5: 8 readable marks, each alone, so no run.
      {
        fonts,
        resources: scanned,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, "| . ~ , | . ~ ,"),
      },
      // Spec 0008, AC-5: 8 readable characters in runs of one and two.
      {
        fonts,
        resources: scanned,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, "No 12 at 45"),
      },
      // Spec 0008, AC-1: a run of exactly `MACHINE_READ_RUN`.
      {
        fonts,
        resources: scanned,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, "Yes"),
      },
      // Spec 0008, AC-2: the glyphless font advances 6 pt a glyph at 12 pt,
      // so from x 72 the "s" spans 84 to 90. A clip ending at x 83 holds the
      // "Y" and most of the "e", and none of the "s", which the ordinary read
      // then drops (pinned in `reading.test.ts`): a run of 2.
      {
        fonts,
        resources: scanned,
        content:
          fullPage("Scan") +
          `q 60 100 23 40 re W n\n${invisibleLine(12, 72, 120, "Yes")}Q\n`,
      },
      // Spec 0008, AC-6: the same sentence written word by word the way
      // Tesseract writes it, straight, turned a degree, and on a turned page.
      {
        fonts,
        resources: scanned,
        content:
          fullPage("Scan") + tesseractLayer([{ x: 72, y: 120, text: SPARSE_SENTENCE }]),
      },
      {
        fonts,
        resources: scanned,
        content:
          fullPage("Scan") +
          tesseractLayer([{ x: 72, y: 120, text: SPARSE_SENTENCE }], { degrees: 1 }),
      },
      {
        keys: "/Rotate 90",
        fonts,
        resources: scanned,
        content:
          fullPage("Scan") + tesseractLayer([{ x: 72, y: 120, text: SPARSE_SENTENCE }]),
      },
      // Spec 0008, AC-2: each character is drawn invisible, then filled at the
      // same origin, so none is purely invisible and the scan stays bare. The
      // ordinary read reports each origin twice, one line per drawing
      // (measured 2026-09-30), so 90 readable characters: not a stamped scan
      // either way.
      {
        fonts,
        resources: scanned,
        content:
          fullPage("Scan") +
          modeLine(3, 12, 72, 120, SPARSE_SENTENCE) +
          modeLine(0, 12, 72, 120, SPARSE_SENTENCE),
      },
      // Spec 0008, AC-3: the photo, 300 by 100 pt (6.2% of the page), sits
      // below the layer's lowest line (y 132), so no run is over it.
      {
        fonts,
        resources: `/XObject << /Scan ${scan} 0 R /Photo ${photo} 0 R >>`,
        content: fullPage("Scan") + "q 300 0 0 100 156 10 cm /Photo Do Q\n" + ocrLayer(),
      },
      // Spec 0008, AC-3: strips 200 and 412 pt wide. "Signed" starts at x
      // 188, 6 pt a glyph, so "S" and "i" centre at 191 and 197 over the left
      // strip (a run of 2) and "gned" from 203 over the right (a run of 4).
      {
        fonts,
        resources: scanned,
        content:
          "q 200 0 0 792 0 0 cm /Scan Do Q\n" +
          "q 412 0 0 792 200 0 cm /Scan Do Q\n" +
          invisibleLine(12, 188, 400, "Signed"),
      },
      // Spec 0008, AC-7: a background image and a stencil mask, each over the
      // whole page, with the text layer over both.
      {
        fonts,
        resources: `/XObject << /Scan ${scan} 0 R /Mask ${stencil} 0 R >>`,
        content:
          fullPage("Scan") +
          `0 0 0 rg ${fullPage("Mask")}` +
          invisibleLine(12, 72, 120, SPARSE_SENTENCE),
      },
      // Spec 0008, AC-16. The glyphless font advances 6 pt a glyph at 12 pt,
      // so from x 60 "by its director" starts at x 300 and centres over the
      // photo (x 300 to 600, y 250 to 550) and the scan, and the words before
      // it over the scan alone, which they clear. The line covers under 3% of
      // the photo's grid points, so the photo is searched, and stays bare. The
      // next page draws the photo first.
      {
        fonts,
        resources: `/XObject << /Scan ${scan} 0 R /Photo ${photo} 0 R >>`,
        content:
          fullPage("Scan") +
          invisibleLine(12, 60, 400, SPARSE_SENTENCE) +
          "q 300 0 0 300 300 250 cm /Photo Do Q\n",
      },
      {
        fonts,
        resources: `/XObject << /Scan ${scan} 0 R /Photo ${photo} 0 R >>`,
        content:
          fullPage("Scan") +
          "q 300 0 0 300 300 250 cm /Photo Do Q\n" +
          invisibleLine(12, 60, 400, SPARSE_SENTENCE),
      },
      // Spec 0008, AC-16. The scan is the top half of the page (y 396 up), the
      // photo reaches 146 pt below it, so it is not wholly inside the scan: the
      // review's own fix would have cleared it. The line's words before "by"
      // lie over the scan alone, its last three over both.
      {
        fonts,
        resources: `/XObject << /Scan ${scan} 0 R /Photo ${photo} 0 R >>`,
        content:
          "q 612 0 0 396 0 396 cm /Scan Do Q\n" +
          "q 300 0 0 200 300 250 cm /Photo Do Q\n" +
          invisibleLine(12, 60, 420, SPARSE_SENTENCE),
      },
      // Spec 0008, AC-16. A 300 by 200 pt scan on a full page photo, its three
      // lines wholly inside it (at 10 pt, x 166 to 441). Each baseline puts one
      // row of grid points in its 10 pt line box, so the lines cover about 17%
      // of the scan, which the coverage test clears, and about 2% of the photo.
      // The scan still takes the characters from the photo: a veto from a
      // picture that passed coverage. The review's own fix, a picture wholly
      // inside a larger one takes no run, would have cleared the photo.
      {
        fonts,
        resources: `/XObject << /Scan ${scan} 0 R /Photo ${photo} 0 R >>`,
        content:
          fullPage("Photo") +
          "q 300 0 0 200 156 300 cm /Scan Do Q\n" +
          [446, 410, 372].map((y) => invisibleLine(10, 166, y, SPARSE_SENTENCE)).join(""),
      },
      // Spec 0008, AC-14: 15 readable characters in runs of three, none of
      // them a letter or a number.
      {
        fonts,
        resources: scanned,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, "___ ... ||| --- ~~~"),
      },
      // Spec 0008, AC-14: the zero width space, the zero width joiner and the
      // soft hyphen, three of each. 9 readable characters, each kept by the
      // ordinary read (pinned in `reading.test.ts`).
      {
        fonts,
        resources: scanned,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, "​​​ ‍‍‍ ­­­"),
      },
      // Spec 0008, AC-15: an invisible copy of a visible sentence, offset half
      // a point left and down.
      {
        resources: scanned,
        content:
          fullPage("Scan") +
          modeLine(0, 12, 72, 120, SPARSE_SENTENCE) +
          modeLine(3, 12, 71.5, 119.5, SPARSE_SENTENCE),
      },
      // Spec 0008, AC-15: an invisible copy from the same start, drifting ahead
      // with character spacing, 32.4 pt by the line's end. Its last 4 letters
      // ("ctor") lie out of reach of every visible glyph (measured
      // 2026-09-30), so judged character by character they would clear the
      // scan; judged per line, they do not.
      {
        resources: scanned,
        content:
          fullPage("Scan") +
          modeLine(0, 12, 72, 120, SPARSE_SENTENCE) +
          modeLine(3, 12, 72, 120, SPARSE_SENTENCE, { spacing: 0.6 }),
      },
      // Spec 0008, AC-3's recorded limit. The full text layer covers about a
      // third of the photo (x 156 to 456, y 300 to 600), so spec 0006's
      // coverage test clears the photo before any run is asked, as it did
      // before spec 0008. Accepted, and taken up as scope feature 20.
      {
        fonts,
        resources: `/XObject << /Scan ${scan} 0 R /Photo ${photo} 0 R >>`,
        content: fullPage("Scan") + "q 300 0 0 300 156 300 cm /Photo Do Q\n" + ocrLayer(),
      },
    ];
  });
}

/** The address in `read-short-ocr.pdf`'s text layer. */
export const SHORT_OCR_EMAIL = "jo@example.com";

/**
 * Spec 0008, AC-8. A full page scan whose text layer is one short line,
 * "Signed" and an address: 20 readable characters, under `STAMP_MAX_CHARS`.
 * With the layer it opens with the machine read note only; `layer: false`
 * builds the same page with none, which the test builds in memory and sees
 * refused. The scan is 150 ppi, fine enough that blanking its pixels under
 * the address stays within `BOUNDS_REACH_RATIO`, so the address can be
 * ticked and removed; the coarse `scanImage` would block it `image-overreach`.
 */
export function readShortOcr({ layer = true } = {}) {
  return document(({ add }) => {
    const scan = bandedScan(add, PAGE.width, PAGE.height, 150);
    const glyphless = glyphlessFont(add);
    return [
      {
        fonts: `/Fg ${glyphless} 0 R`,
        resources: `/XObject << /Scan ${scan} 0 R >>`,
        content:
          fullPage("Scan") +
          (layer ? invisibleLine(12, 72, 120, `Signed ${SHORT_OCR_EMAIL}`) : ""),
      },
    ];
  });
}

/**
 * Spec 0006, AC-2 and AC-4. A slide deck whose every slide is a full bleed
 * photo with a title and two bullets over it. More than a stamp's readable
 * characters, so each slide is `bare-picture` and the deck opens, rather than
 * being refused as a stamped scan.
 */
export function readSlides() {
  return document(({ add }) => {
    const photo = scanImage(add, { columns: 48, rows: 62 });
    return [
      ["Quarterly results", "Revenue grew in every region", "Costs held flat"],
      ["Next steps", "Open two new offices this year", "Hire a regional lead"],
    ].map(([title, first, second]) => ({
      resources: `/XObject << /Photo ${photo} 0 R >>`,
      content:
        fullPage("Photo") +
        line("F1", 24, 72, 700, title) +
        line("F1", 14, 90, 640, `- ${first}`) +
        line("F1", 14, 90, 612, `- ${second}`),
    }));
  });
}

/** The addresses on `read-crooked.pdf`, one on each page, both long enough to be blocked. */
export const CROOKED_EMAILS = Object.freeze({
  scanned: "accounts.receivable@example.com",
  typed: "billing.department@example.com",
});

/** The turn `read-crooked.pdf` sets its lines at: about a degree and a half. */
const CROOKED_DEGREES = 1.5;

/** `cm` that turns the frame by `CROOKED_DEGREES` about `[x, y]`. */
function turned([x, y]) {
  const angle = (CROOKED_DEGREES * Math.PI) / 180;
  const cos = Math.cos(angle).toFixed(6);
  const sin = Math.sin(angle).toFixed(6);
  return `${cos} ${sin} ${-sin} ${cos} ${x} ${y} cm`;
}

/**
 * Spec 0006, AC-25. A scan about a degree and a half crooked, its text layer
 * turned with it, and a typed page turned the same way: a long address on
 * each is blocked `slanted-text`, and only the scan's page is machine read,
 * so only it earns the crooked scan line.
 */
export function readCrooked() {
  return document(({ add }) => {
    const scan = scanImage(add, { columns: 60, rows: 18 });
    const glyphless = glyphlessFont(add);
    return [
      {
        resources: `/XObject << /Scan ${scan} 0 R >> /Font << /Fg ${glyphless} 0 R >>`,
        content:
          `q ${turned([72, 500])}\n` +
          "q 440 0 0 132 0 0 cm /Scan Do Q\n" +
          invisibleLine(12, 10, 100, "Payment reminder for the second quarter") +
          invisibleLine(12, 10, 70, `Write to ${CROOKED_EMAILS.scanned} today`) +
          invisibleLine(12, 10, 40, "Thank you for settling the balance promptly") +
          "Q\n",
      },
      {
        content:
          `q ${turned([72, 600])}\n` +
          line("F1", 12, 0, 0, `Write to ${CROOKED_EMAILS.typed} today`) +
          "Q\n",
      },
    ];
  });
}

/** Helvetica's advance widths, in thousandths of an em, for the letters placed by hand. */
const HELVETICA_WIDTHS = Object.freeze({
  " ": 278,
  O: 778,
  a: 556,
  b: 556,
  c: 500,
  e: 556,
  f: 278,
  g: 556,
  i: 222,
  l: 222,
  n: 556,
  o: 556,
  r: 333,
  t: 278,
  v: 500,
  w: 722,
  x: 500,
});

/** Where each glyph of `text` starts, set in Helvetica at `size` from `x`. */
function glyphStarts(text, size, x) {
  let at = x;
  return [...text].map((letter) => {
    const start = at;
    at += (HELVETICA_WIDTHS[letter] * size) / 1000;
    return start;
  });
}

/** The values the covered and hidden fixtures hold, for the tests to name. */
export const CONCEALED = Object.freeze({
  coveredEmail: "board.minutes@example.com",
  coveredPhone: "020 7946 0321",
  hiddenEmail: "white.ink@example.com",
  clippedEmail: "clipped.away@example.com",
  boxedEmail: "outside.the.box@example.com",
});

/**
 * One page per covering rule and near miss (AC-6). The findings each page must
 * give, in the same order, are `READ_COVERED`. Each value sits at x 130 on a
 * baseline at 700, so a cover from 125 to 425 and from 695 to 713 holds all of
 * it, and nothing of the label to its left.
 */
export const READ_COVERED = Object.freeze([
  { name: "a black box over an email", findings: ["covered-text"] },
  { name: "a white box over a phone number", findings: ["covered-text"] },
  { name: "a black box inside a plain group", findings: ["covered-text"] },
  { name: "a black Square annotation, baked in", findings: ["covered-text"] },
  { name: "a strikethrough bar", findings: [] },
  { name: "an underline", findings: [] },
  { name: "a translucent highlight", findings: [] },
  { name: "a box turned 10 degrees (a recorded limit)", findings: [] },
  { name: "a box inside a group at half alpha", findings: [] },
  { name: "a table cell background drawn before its text", findings: [] },
]);

/** A labelled value on the covered pages' one line. */
function labelled(label, value) {
  return line("F1", 12, 72, 700, label) + line("F1", 12, 130, 700, value);
}

const COVER = "125 695 300 18 re f";

/** Spec 0006, AC-6. Covers drawn over text, and the things that are not covers. */
export function readCovered() {
  return document(({ add }) => {
    const box = add(
      stream(
        "/Type /XObject /Subtype /Form /BBox [0 0 612 792] /Group << /S /Transparency >>",
        `0 0 0 rg ${COVER}\n`,
      ),
    );
    const boxAppearance = add(
      stream(
        "/Type /XObject /Subtype /Form /BBox [0 0 300 18]",
        "0 0 0 rg 0 0 300 18 re f\n",
      ),
    );
    const square = add(
      "<< /Type /Annot /Subtype /Square /Rect [125 695 425 713] /IC [0 0 0] /C [0 0 0] /F 4 " +
        `/AP << /N ${boxAppearance} 0 R >> >>`,
    );
    const turn = (10 * Math.PI) / 180;
    const cos = Math.cos(turn).toFixed(6);
    const sin = Math.sin(turn).toFixed(6);
    const states = "/ExtGState << /Hl << /ca 0.4 >> /Half << /ca 0.5 /CA 0.5 >> >>";
    const name = labelled("Name:", "Jeremy Quigley");

    return [
      { content: `${labelled("Email:", CONCEALED.coveredEmail)}0 0 0 rg ${COVER}\n` },
      { content: `${labelled("Phone:", CONCEALED.coveredPhone)}1 1 1 rg ${COVER}\n` },
      { resources: `/XObject << /Box ${box} 0 R >>`, content: `${name}q /Box Do Q\n` },
      { keys: `/Annots [${square} 0 R]`, content: name },
      { content: `${name}0 0 0 rg 125 703 300 1.2 re f\n` },
      { content: `${name}0 0 0 rg 125 697 300 0.8 re f\n` },
      { resources: states, content: `${name}q /Hl gs 1 1 0 rg ${COVER} Q\n` },
      {
        content: `${name}q ${cos} ${sin} -${sin} ${cos} 125 695 cm 0 0 0 rg 0 0 300 18 re f Q\n`,
      },
      {
        resources: `/XObject << /Box ${box} 0 R >> ${states}`,
        content: `${name}q /Half gs /Box Do Q\n`,
      },
      { content: `q 0.9 0.9 0.9 rg ${COVER} Q\n${name}` },
    ];
  });
}

/** The words of the cell that overflows its clip. */
const OVERFLOW = "Overflowing text in a narrow table cell";

/**
 * The right edge of the overflowing cell's clip: a tenth of the way into the
 * `w` of "Overflowing", so that glyph straddles the edge with its centre
 * outside, and every glyph after it lies wholly outside. MuPDF extracts a
 * glyph partly inside a clip and drops one wholly outside it (measured), so
 * the straddling glyph is the one the clip rule can judge (AC-7, AC-9).
 */
function overflowEdge() {
  const starts = glyphStarts(OVERFLOW, 12, 72);
  const w = OVERFLOW.indexOf("w");
  return starts[w] + 0.1 * (starts[w + 1] - starts[w]);
}

/**
 * One page per hiding rule and near miss (AC-7). The findings each page must
 * give, in the same order, are `READ_HIDDEN`; the slug line's page is left to
 * the trim (slice 4), so only its lack of `hidden-text` is fixed here.
 */
export const READ_HIDDEN = Object.freeze([
  { name: "white text on a white page", findings: ["hidden-text"] },
  { name: "invisible text with no image", findings: ["hidden-text"] },
  { name: "text at zero opacity", findings: ["hidden-text"] },
  { name: "text used only as a clip, with nothing inside", findings: ["hidden-text"] },
  { name: "text overflowing a table cell clip", findings: ["hidden-text"] },
  { name: "text half a point tall", findings: ["hidden-text"] },
  { name: "white text on a dark box drawn first", findings: [] },
  { name: "a heading clipped and filled with a gradient", findings: [] },
  { name: "pale text in a spot colour (not judged)", findings: [] },
  { name: "a scan with its text layer over it", findings: ["machine-read-text"] },
  { name: "a slug line outside the crop box", findings: null },
  { name: "an email a rectangle clip hides wholly", findings: ["hidden-text"] },
  { name: "an email a form's /BBox hides wholly", findings: ["hidden-text"] },
  {
    name: "invisible text a clip hides wholly, with no image",
    findings: ["hidden-text"],
  },
  { name: "text drawn wholly inside its clip", findings: [] },
  { name: "trailing spaces drawn past a cell's clip", findings: [] },
]);

/**
 * Where the cell's clip ends on the trailing spaces page: half a point past
 * the last letter of `cell text`, so every letter lies inside it and the
 * spaces after them run past it.
 */
function cellEdge() {
  const text = "cell text";
  const starts = glyphStarts(text, 12, 72);
  return starts[text.length - 1] + (HELVETICA_WIDTHS.t * 12) / 1000 + 0.5;
}

/** Spec 0006, AC-7. Text a viewer does not show, and the near misses. */
export function readHidden() {
  return document(({ add, fonts }) => {
    const scan = scanImage(add, { columns: 60, rows: 18 });
    const glyphless = glyphlessFont(add);
    const tint = add(
      "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [0 0 0 1] /N 1 >>",
    );
    const shading = add(
      "<< /ShadingType 2 /ColorSpace /DeviceRGB /Coords [72 690 400 690] " +
        "/Function << /FunctionType 2 /Domain [0 1] /C0 [0.8 0.1 0.1] /C1 [0.1 0.1 0.8] /N 1 >> >>",
    );
    const visible = line("F1", 12, 72, 740, "This page also holds visible words.");
    // A form whose /BBox is a 10 pt square at the page's corner, drawing an
    // address far outside it (AC-7's clipped away rule, task 22).
    const boxed = add(
      stream(
        `/Type /XObject /Subtype /Form /BBox [0 0 10 10] /Resources << /Font << ${fonts} >> >>`,
        line("F1", 12, 72, 700, `Write to ${CONCEALED.boxedEmail}`),
      ),
    );

    return [
      {
        content: `${visible}1 1 1 rg ${line("F1", 12, 72, 700, `Write to ${CONCEALED.hiddenEmail}`)}`,
      },
      {
        content: `${visible}BT 3 Tr /F1 12 Tf 72 700 Td (Invisible words stay in the file) Tj ET\n`,
      },
      {
        resources: "/ExtGState << /Zero << /ca 0 >> >>",
        content: `${visible}q /Zero gs ${line("F1", 12, 72, 700, "Text at zero opacity")}Q\n`,
      },
      { content: `${visible}q BT 7 Tr /F1 12 Tf 72 700 Td (Clip only words) Tj ET Q\n` },
      {
        content:
          `${visible}q 72 690 ${(overflowEdge() - 72).toFixed(3)} 30 re W n ` +
          `${line("F1", 12, 72, 700, OVERFLOW)}Q\n`,
      },
      { content: `${visible}${line("F1", 0.5, 72, 700, "Tiny print")}` },
      {
        content:
          `${visible}q 0.1 0.1 0.1 rg 60 690 320 24 re f Q ` +
          `1 1 1 rg ${line("F1", 12, 72, 700, "White words on a dark box")}`,
      },
      {
        resources: `/Shading << /Sh0 ${shading} 0 R >>`,
        content: `${visible}q BT 7 Tr /F1 24 Tf 72 700 Td (Gradient heading) Tj ET /Sh0 sh Q\n`,
      },
      {
        resources: `/ColorSpace << /Spot [/Separation /Brand /DeviceCMYK ${tint} 0 R] >>`,
        content: `${visible}q /Spot cs 0.02 scn ${line("F1", 12, 72, 700, "Pale spot colour")}Q\n`,
      },
      {
        resources: `/XObject << /Scan ${scan} 0 R >> /Font << /Fg ${glyphless} 0 R >>`,
        // A text layer over the whole scan, as recognition leaves one, so the
        // scan is machine read and not a bare picture.
        content:
          "q 440 0 0 132 72 600 cm /Scan Do Q\n" +
          [700, 680, 660, 640, 620]
            .map((y) =>
              invisibleLine(12, 82, y, "Recognised words over the scanned image"),
            )
            .join(""),
      },
      {
        keys: "/CropBox [0 100 612 792]",
        content: `${visible}${line("F1", 8, 72, 60, "Slug: proof 3, printed in the bleed")}`,
      },
      {
        // A 10 pt clip far from the address, which it hides wholly.
        content:
          `${visible}q 400 100 10 10 re W n ` +
          `${line("F1", 12, 72, 700, `Write to ${CONCEALED.clippedEmail}`)}Q\n`,
      },
      {
        resources: `/XObject << /Boxed ${boxed} 0 R >>`,
        content: `${visible}q /Boxed Do Q\n`,
      },
      {
        content:
          `${visible}q 400 100 10 10 re W n ` +
          "BT 3 Tr /F1 12 Tf 72 700 Td (Invisible words behind a clip) Tj ET Q\n",
      },
      {
        content:
          `${visible}q 60 690 400 30 re W n ` +
          `${line("F1", 12, 72, 700, "Words drawn wholly inside their clip")}Q\n`,
      },
      {
        content:
          `${visible}q 72 690 ${(cellEdge() - 72).toFixed(3)} 30 re W n ` +
          `${line("F1", 12, 72, 700, "cell text    ")}Q\n`,
      },
    ];
  });
}

/** The address each empty clip fixture draws where nothing can show it. */
export const EMPTY_CLIP_EMAIL = "under.nothing@example.com";

/**
 * The clips that hold no area, one per `read-empty-clip-N.pdf` (AC-11, task
 * 23): a zero area rectangle, a zero width one over the address, two nested
 * rectangles that do not meet, and a clip whose path is empty.
 */
export const EMPTY_CLIPS = Object.freeze([
  "0 0 0 0 re W n",
  "72 690 0 30 re W n",
  "72 690 100 30 re W n 300 690 100 30 re W n",
  "W n",
]);

/**
 * Spec 0006, AC-11. One file per empty clip, since an open stops at the first
 * page it refuses: a typed line a viewer can read, and the address under the
 * clip.
 */
export function readEmptyClip() {
  return EMPTY_CLIPS.map((clip) =>
    document(() => [
      {
        content:
          line("F1", 12, 72, 740, "This page holds typed words a viewer can read.") +
          `q ${clip} ${line("F1", 12, 72, 700, `Write to ${EMPTY_CLIP_EMAIL}`)}Q\n`,
      },
    ]),
  );
}

/**
 * Spec 0006, AC-10 before AC-11: a scan with nothing readable that also draws
 * the address under a zero area clip. Refused as `no-readable-text`, whose
 * advice helps, not as `unsupported`.
 */
export function readEmptyClipScan() {
  return document(({ add }) => {
    const scan = scanImage(add);
    return [
      {
        resources: `/XObject << /Scan ${scan} 0 R >>`,
        content:
          fullPage("Scan") +
          `q ${EMPTY_CLIPS[0]} ${line("F1", 12, 72, 700, `Write to ${EMPTY_CLIP_EMAIL}`)}Q\n`,
      },
    ];
  });
}

/**
 * Spec 0006, AC-24 and AC-27, for the browser: three pages, within the free
 * page cap, each holding one value a viewer never sees. An email under a black
 * box, a phone number under a white one, and an email in white.
 */
export function readConcealed() {
  return document(() => [
    { content: `${labelled("Email:", CONCEALED.coveredEmail)}0 0 0 rg ${COVER}\n` },
    { content: `${labelled("Phone:", CONCEALED.coveredPhone)}1 1 1 rg ${COVER}\n` },
    {
      content:
        line("F1", 12, 72, 740, "This page also holds visible words.") +
        `1 1 1 rg ${line("F1", 12, 72, 700, `Write to ${CONCEALED.hiddenEmail}`)}`,
    },
  ]);
}

/** What `trim-text.pdf` holds, for the tests to name. */
export const TRIM_TEXT = Object.freeze({
  visibleEmail: "visible.person@example.com",
  belowCrop: "offpage.person@example.com",
  belowMedia: "Below the media box",
  straddling: "Edge",
});

/**
 * Spec 0006, AC-14, AC-16 and AC-17. A page cropped to its top half. On it,
 * a line with an address; below the crop, a line with another address a
 * viewer never sees; below the media box, a line of its own; and a word
 * whose glyphs straddle the crop's bottom edge, their quads running from
 * about 389 to 406 against an edge at 396.
 */
export function trimText() {
  return document(() => [
    {
      keys: "/CropBox [0 396 612 792]",
      content:
        line("F1", 12, 72, 700, `Contact: ${TRIM_TEXT.visibleEmail}`) +
        line("F1", 12, 72, 680, "Everything on this line stays where it is.") +
        line("F1", 12, 72, 200, `Hidden below: ${TRIM_TEXT.belowCrop}`) +
        line("F1", 12, 72, -30, TRIM_TEXT.belowMedia) +
        line("F1", 12, 300, 393, TRIM_TEXT.straddling),
    },
  ]);
}

/**
 * A scan as a picture at `ppi` pixels per inch over `width` by `height`
 * points: grey, with dark bands across it, margins included, so its margins
 * hold ink a crop hides.
 */
function bandedScan(add, width, height, ppi) {
  const columns = Math.round((width * ppi) / 72);
  const rows = Math.round((height * ppi) / 72);
  const pixels = new Uint8Array(columns * rows).fill(230);
  for (let row = 0; row < rows; row += 8)
    pixels.fill(30, row * columns, (row + 2) * columns);
  return add(
    stream(
      `/Type /XObject /Subtype /Image /Width ${columns} /Height ${rows} ` +
        "/ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode",
      deflateSync(pixels),
    ),
  );
}

/** Typed words enough to make a page readable, and never a stamp (AC-2). */
const TYPED =
  line("F1", 12, 72, 700, "This page holds typed words as well as its picture.") +
  line("F1", 12, 72, 684, "They keep it a page of text rather than a scan.");

/**
 * Spec 0006, AC-15. Page 1: an upright scan at 150 pixels per inch over the
 * whole media box, cropped by half an inch on every side, so its margins lie
 * outside the visible area. Page 2: a picture placed wholly outside the page,
 * left of the media box. Both are kept whole and named.
 */
export function trimScan() {
  return document(({ add }) => {
    const scan = bandedScan(add, 612, 792, 150);
    const outside = bandedScan(add, 144, 144, 72);
    return [
      {
        keys: "/CropBox [36 36 576 756]",
        resources: `/XObject << /Scan ${scan} 0 R >>`,
        content: `q 612 0 0 792 0 0 cm /Scan Do Q\n${TYPED}`,
      },
      {
        resources: `/XObject << /Outside ${outside} 0 R >>`,
        content: `q 144 0 0 144 -300 300 cm /Outside Do Q\n${TYPED}`,
      },
    ];
  });
}

/**
 * A 4 by 4 pixel picture of four colour bands, to stretch into a bleed.
 * Compressed, as every producer stores a picture: the engine's write
 * (`compress`, spec 0004) deflates a stream stored with no filter on every run,
 * cropped or not, so a raw one could not show that the trim rewrote nothing.
 */
function colourBand(add) {
  const pixels = new Uint8Array(4 * 4 * 3);
  const colours = [
    [200, 30, 30],
    [30, 160, 60],
    [30, 60, 200],
    [220, 180, 20],
  ];
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      pixels.set(colours[row], (row * 4 + column) * 3);
    }
  }
  return add(
    stream(
      "/Type /XObject /Subtype /Image /Width 4 /Height 4 /ColorSpace /DeviceRGB " +
        "/BitsPerComponent 8 /Filter /FlateDecode",
      deflateSync(pixels),
    ),
  );
}

/**
 * Spec 0006, AC-15. Pictures across the edge, each kept whole and its page
 * named. Page 1: a 4 by 4 pixel band stretched 100 pt tall across the crop's
 * top edge into the bleed. Page 2: a picture turned 30 degrees across the
 * crop's right edge.
 */
export function trimKept() {
  return document(({ add }) => {
    const band = colourBand(add);
    const photo = scanImage(add, { columns: 40, rows: 40 });
    const turn = (30 * Math.PI) / 180;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const size = 120;
    // Centred on the crop's right edge at x 560, y 400.
    const tx = 560 - (size / 2) * (cos - sin);
    const ty = 400 - (size / 2) * (sin + cos);
    return [
      {
        keys: "/CropBox [0 0 612 740]",
        resources: `/XObject << /Band ${band} 0 R >>`,
        content: `q 612 0 0 100 0 700 cm /Band Do Q\n${TYPED}`,
      },
      {
        keys: "/CropBox [0 0 560 792]",
        resources: `/XObject << /Photo ${photo} 0 R >>`,
        content:
          `q ${num(size * cos)} ${num(size * sin)} ${num(-size * sin)} ${num(size * cos)} ` +
          `${num(tx)} ${num(ty)} cm /Photo Do Q\n${TYPED}`,
      },
    ];
  });
}

/**
 * Spec 0006, AC-29 (task 21). A US Letter scan of `pages` pages, built by the
 * cost test and the heap measurement and never committed. Each page draws a
 * JPEG over the whole page, taken from `jpegs` in turn (one shared by every
 * page, or one each), with a text layer over it so the document opens, and a
 * header line the scanner stamped in the top margin. `cropped` crops half an
 * inch off every side, which puts the header, and each scan's margins, outside
 * the visible area, so every page is trimmed and every page's picture reaches
 * outside.
 */
export function scanPages({ jpegs, columns, rows, colour = false, pages, cropped }) {
  return document(({ add }) => {
    const glyphless = glyphlessFont(add);
    const images = jpegs.map((jpeg) =>
      add(
        stream(
          `/Type /XObject /Subtype /Image /Width ${columns} /Height ${rows} ` +
            `/ColorSpace /Device${colour ? "RGB" : "Gray"} /BitsPerComponent 8 /Filter /DCTDecode`,
          jpeg,
        ),
      ),
    );
    return Array.from({ length: pages }, (_, index) => ({
      keys: cropped ? "/CropBox [36 36 576 756]" : "",
      resources:
        `/XObject << /Scan ${images[index % images.length]} 0 R >> ` +
        `/Font << /Fg ${glyphless} 0 R >>`,
      content:
        fullPage("Scan") +
        invisibleLine(9, 60, 770, `Scanned on the office copier, page ${index + 1}`) +
        ocrLayer(),
    }));
  });
}

/** What `trim-edge.pdf` holds, for the tests to name. */
export const TRIM_EDGE = Object.freeze({ belowCrop: "under.the.crop@example.com" });

/**
 * Spec 0006, AC-15, the edges of the picture rule (task 20). Page 1: an A4
 * scan, 595.28 by 841.89 pt, on a media box rounded to 595 by 842, so it sits
 * 0.28 pt past the right edge with no crop at all, with its text layer: no
 * finding but the machine read note. Page 2: a picture across the crop's
 * bottom edge beside an address wholly below it: both findings, and the
 * address goes. Page 3: an image drawn only as a soft mask's content,
 * reaching far past the page, which nobody sees as paint: no finding.
 */
export function trimEdge() {
  return document(({ add }) => {
    const scan = scanImage(add);
    const photo = scanImage(add, { columns: 40, rows: 40 });
    const glyphless = glyphlessFont(add);
    const mask = add(
      stream(
        "/Type /XObject /Subtype /Form /BBox [-200 -200 812 992] " +
          "/Group << /S /Transparency /CS /DeviceGray >> " +
          `/Resources << /XObject << /Photo ${photo} 0 R >> >>`,
        "q 1012 0 0 1192 -200 -200 cm /Photo Do Q\n",
      ),
    );
    return [
      {
        mediaBox: "[0 0 595 842]",
        resources: `/XObject << /Scan ${scan} 0 R >> /Font << /Fg ${glyphless} 0 R >>`,
        content: `q 595.28 0 0 841.89 0 0 cm /Scan Do Q\n${ocrLayer()}`,
      },
      {
        keys: "/CropBox [0 396 612 792]",
        resources: `/XObject << /Photo ${photo} 0 R >>`,
        content:
          `q 200 0 0 150 300 330 cm /Photo Do Q\n${TYPED}` +
          line("F1", 12, 72, 200, `Below the crop: ${TRIM_EDGE.belowCrop}`),
      },
      {
        resources:
          "/ExtGState << /Masked << /Type /ExtGState " +
          `/SMask << /Type /Mask /S /Luminosity /G ${mask} 0 R >> >> >>`,
        content: `q /Masked gs 0.2 0.2 0.2 rg 72 400 300 100 re f Q\n${TYPED}`,
      },
    ];
  });
}

/** Where `trim-ocr.pdf` is cropped: through every line on the left, and through line 1 at the top. */
export const TRIM_OCR = Object.freeze({ cropLeft: 80, cropTop: 746 });

/** The twenty rows of a full page statement, 32 pt apart, as `tesseractLayer` takes them. */
function statementRows() {
  return Array.from({ length: 20 }, (_, row) => ({
    x: 60,
    y: 740 - row * 32,
    text: `Line ${row + 1} of the statement reads as words recognised from the scan`,
  }));
}

/**
 * A page's text layer the way Tesseract writes one (its `pdfrenderer.cpp`):
 * one text object for the whole page, invisible (`3 Tr`), the first word
 * placed with `Tm` and each after it with `Td` from the word before, and every
 * word with a `Tf` and a `Tz` of its own, the stretch that fits the word to
 * its box. The size steps by half a point from word to word, so no `Tf` is
 * ever redundant: the worst case for spec 0004's quirk, where a `Tf` or a `Tz`
 * between removed glyphs and the next kept one moves the text after them.
 *
 * `rows` are the lines, each with its first word's origin. `degrees` turns the
 * first word's `Tm`, and so the whole layer about that origin, since each `Td`
 * moves in the turned text space: a crooked scan's layer (spec 0008, AC-6).
 */
function tesseractLayer(rows = statementRows(), { degrees = 0 } = {}) {
  const angle = (degrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  let layer = "BT 3 Tr ";
  let previous = null;
  let count = 0;
  for (const { x: start, y: baseline, text } of rows) {
    const words = text.split(" ");
    let x = start;
    words.forEach((word, at) => {
      const size = 11.5 + (count % 3) * 0.5;
      count += 1;
      const width = word.length * 0.55 * size;
      const last = at === words.length - 1;
      const hex = [...(last ? word : `${word} `)]
        .map((letter) => letter.codePointAt(0).toString(16).padStart(4, "0"))
        .join("");
      layer +=
        previous === null
          ? `${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${num(x)} ${baseline} Tm `
          : `${num(x - previous[0])} ${baseline - previous[1]} Td `;
      layer += `/Fg ${size} Tf ${num((100 * width) / (word.length * 0.5 * size))} Tz [ <${hex}> ] TJ\n`;
      previous = [x, baseline];
      x += width + 0.35 * size;
    });
  }
  return `${layer}ET\n`;
}

/**
 * Spec 0006, AC-14 to AC-16, the cropped OCR scan (task 19). A full page scan
 * with Tesseract's text layer over it, cropped on the left through the first
 * word or two of every line, and at the top through line 1, whose every glyph
 * straddles the edge. It must open named, never refused with `edge-text`.
 */
export function trimOcr() {
  return document(({ add }) => {
    const scan = scanImage(add);
    const glyphless = glyphlessFont(add);
    return [
      {
        keys: `/CropBox [${TRIM_OCR.cropLeft} 0 612 ${TRIM_OCR.cropTop}]`,
        resources: `/XObject << /Scan ${scan} 0 R >> /Font << /Fg ${glyphless} 0 R >>`,
        content: fullPage("Scan") + tesseractLayer(),
      },
    ];
  });
}

/**
 * Spec 0006, AC-16. One text object across the crop's left edge: `Offside`
 * wholly outside it, a size change, then words wholly inside it. MuPDF moves
 * the text after removed glyphs when a size change sits between them and the
 * next glyph kept (spec 0004's recorded quirk), so the trim's proof finds the
 * inside words moved on a line that crosses the edge: `edge-text`.
 *
 * `Offside ` at 12 pt Helvetica from x 50 is 41.352 pt wide, so the words
 * after it start at 91.352, where the crop starts.
 */
export function trimRefused() {
  return document(() => [
    {
      keys: "/CropBox [91.352 0 612 792]",
      content:
        line("F1", 12, 120, 700, "This page holds typed words inside its crop box.") +
        line("F1", 12, 120, 684, "They keep it a page of text rather than a scan.") +
        `BT /F1 12 Tf 50 640 Td ${literal("Offside ")} Tj /F1 11 Tf ` +
        `${literal("inside words stay put")} Tj ET\n`,
    },
  ]);
}

/**
 * Spec 0006, AC-16. A page trimmed for a line below its crop that also shows
 * a line with `'` inside the visible area: the content filter the trim's pass
 * runs moves that line, which spec 0004 could never redact either, and the
 * proof blames the filter, not the edge: `unsupported`.
 */
export function trimQuote() {
  return document(() => [
    {
      keys: "/CropBox [0 396 612 792]",
      content:
        `BT /F1 12 Tf 14 TL 72 700 Td ${literal("Name: Jeremy Quigley")} Tj ` +
        `${literal("kept line")} ' ET\n` +
        line("F1", 12, 72, 200, "A line below the crop"),
    },
  ]);
}
