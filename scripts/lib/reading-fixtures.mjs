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
  {
    name: "a sparse scan with one recognised sentence",
    findings: ["bare-picture", "machine-read-text"],
  },
  {
    name: "a sparse scan with a few recognised words",
    findings: ["scanned", "machine-read-text"],
  },
]);

/** Typed words for the pages that are letters, so each is readable. */
function letterText() {
  return (
    line("F1", 14, 72, 720, "Application for a replacement card") +
    line("F1", 12, 72, 696, "The applicant's details are typed on this page.") +
    line("F1", 12, 72, 680, "The documents supplied are pasted below.")
  );
}

/** Spec 0006, AC-2, AC-4 and AC-5. One page per picture rule and near miss. */
export function readPictures() {
  return document(({ add }) => {
    const card = scanImage(add, { columns: 40, rows: 25 });
    const logo = scanImage(add, { columns: 8, rows: 8 });
    const photo = scanImage(add, { columns: 48, rows: 36 });
    const scan = scanImage(add);
    const glyphless = glyphlessFont(add);
    const ocr = `/Font << /Fg ${glyphless} 0 R >>`;

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
      {
        resources: `/XObject << /Scan ${scan} 0 R >> ${ocr}`,
        content: fullPage("Scan") + ocrLayer(),
      },
      {
        resources: `/XObject << /Scan ${scan} 0 R >> ${ocr}`,
        content: ocrLayer() + fullPage("Scan"),
      },
      {
        resources: `/XObject << /Scan ${scan} 0 R >> ${ocr}`,
        content:
          fullPage("Scan") +
          invisibleLine(
            12,
            72,
            120,
            "Signed for and on behalf of the company by its director",
          ),
      },
      {
        resources: `/XObject << /Scan ${scan} 0 R >> ${ocr}`,
        content: fullPage("Scan") + invisibleLine(12, 72, 120, "Signed John Smith"),
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
]);

/** Spec 0006, AC-7. Text a viewer does not show, and the near misses. */
export function readHidden() {
  return document(({ add }) => {
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
