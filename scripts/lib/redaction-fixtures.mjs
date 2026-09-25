/**
 * The fixture matrix for real removal. Spec 0004, slice 2 (task 10).
 *
 * Each fixture is a small document written object by object, so a reviewer can
 * read exactly what a page draws and where. None is made by the engine it tests.
 * Fonts are MuPDF's built in Helvetica (a 1.37 em quad) and Courier (1.25 em),
 * plus Carlito embedded (a 1.0 em quad, metric compatible with Calibri, under the
 * SIL Open Font License beside it in `scripts/fonts`).
 *
 * The Vitest target helper finds each match with a search, the way a detector
 * will, so the needles written here are what the tests search for.
 */

import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

import { stream, writePdf } from "./pdf-writer.mjs";
import { readTrueType } from "./truetype.mjs";

const CARLITO = readFileSync(new URL("../fonts/Carlito-Regular.ttf", import.meta.url));

/** A PDF literal string, with its three special characters escaped. */
function literal(text) {
  return `(${text.replace(/[\\()]/g, (character) => `\\${character}`)})`;
}

/** One line of text, in font `font` at `size`, with its baseline starting at `x`, `y`. */
function line(font, size, x, y, text) {
  return `BT /${font} ${size} Tf ${x} ${y} Td ${literal(text)} Tj ET\n`;
}

/**
 * A whole document from page specs, with its objects numbered as they are
 * added.
 *
 * `build` receives `add`, which appends an object and returns its number, and
 * `fonts`, the font resource entries every page can use: `/F1` Helvetica, `/F2`
 * Courier and, when asked for, `/F3` Carlito. It returns one spec per page:
 * `content`, and optionally `resources` (more resource entries), `resourcesRef`
 * (a shared resource dictionary's number, used instead), and `keys` (more page
 * keys, such as `/Rotate 90`).
 */
function document(build, { carlito = false } = {}) {
  const objects = [];
  const add = (body) => objects.push(body);

  const catalog = add(null);
  const pages = add(null);
  const fonts = [
    `/F1 ${add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")} 0 R`,
    `/F2 ${add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>")} 0 R`,
    ...(carlito ? [`/F3 ${embedCarlito(add)} 0 R`] : []),
  ].join(" ");

  const kids = build({ add, fonts }).map((spec) => {
    const content = add(stream("", spec.content));
    const resources =
      spec.resourcesRef === undefined
        ? `<< /Font << ${fonts} >> ${spec.resources ?? ""} >>`
        : `${spec.resourcesRef} 0 R`;
    return add(
      `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 612 792] ${spec.keys ?? ""} ` +
        `/Resources ${resources} /Contents ${content} 0 R >>`,
    );
  });

  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pages} 0 R >>`;
  objects[pages - 1] =
    `<< /Type /Pages /Kids [${kids.map((kid) => `${kid} 0 R`).join(" ")}] ` +
    `/Count ${kids.length} >>`;

  return writePdf({ objects, trailer: `/Root ${catalog} 0 R` }).bytes;
}

/**
 * Carlito as a simple TrueType font, printable ASCII only, with its widths read
 * from the font's own tables. The font program is compressed; it is the one
 * large thing in the matrix.
 */
function embedCarlito(add) {
  const metrics = readTrueType(CARLITO);
  const widths = [];
  for (let code = 32; code <= 126; code += 1) {
    widths.push(metrics.widthOf(String.fromCharCode(code)));
  }

  const file = add(
    stream(`/Length1 ${CARLITO.length} /Filter /FlateDecode`, deflateSync(CARLITO)),
  );
  const descriptor = add(
    `<< /Type /FontDescriptor /FontName /Carlito /Flags 32 /FontBBox [${metrics.bbox.join(" ")}] ` +
      `/ItalicAngle 0 /Ascent ${metrics.ascent} /Descent ${metrics.descent} /CapHeight 632 ` +
      `/StemV 80 /FontFile2 ${file} 0 R >>`,
  );
  return add(
    `<< /Type /Font /Subtype /TrueType /BaseFont /Carlito /FirstChar 32 /LastChar 126 ` +
      `/Widths [${widths.join(" ")}] /Encoding /WinAnsiEncoding /FontDescriptor ${descriptor} 0 R >>`,
  );
}

/**
 * Spec 0004, AC-4, AC-6, AC-11, AC-15 and AC-27. An ordinary letter: a heading,
 * a line with an email address and a phone number to tick, and a line nobody
 * ticks. Page two exists so a target can be pointed at the wrong page.
 */
export function textPage() {
  return document(() => [
    {
      content:
        line("F1", 18, 72, 720, "Staff record") +
        line("F1", 12, 72, 690, "Contact: jane.doe@example.com or 020 7946 0958") +
        line("F1", 12, 72, 670, "Keep this sentence exactly as it is"),
    },
    { content: line("F1", 12, 72, 720, "Page two has other words") },
  ]);
}

/** The three lines of the single spacing fixtures. The middle one is ticked. */
export const SPACING_LINES = Object.freeze({
  above: "Descenders above: gjpqy gjpqy gjpqy",
  target: "Account holder Jeremy Quigley here",
  below: "Ascenders below: Tdfhk Tdfhk Tdfhk",
});

/**
 * Three lines of 12pt text, `leading` apart. `bare` leaves the middle line out,
 * which is how the ink tests isolate the neighbouring lines' ink.
 */
function spaced(font, leading, bare = false) {
  return (
    line(font, 12, 72, 700, SPACING_LINES.above) +
    (bare ? "" : line(font, 12, 72, 700 - leading, SPACING_LINES.target)) +
    line(font, 12, 72, 700 - 2 * leading, SPACING_LINES.below)
  );
}

/**
 * Spec 0004, AC-4 and AC-6. Single spacing in the built in fonts: pages 1 to 4
 * are Helvetica at 12pt and 14pt leading, then Courier at 12pt and 14pt; pages
 * 5 and 6 are the 14pt pages without the middle line.
 */
export function singleSpacing() {
  return document(() => [
    { content: spaced("F1", 12) },
    { content: spaced("F1", 14) },
    { content: spaced("F2", 12) },
    { content: spaced("F2", 14) },
    { content: spaced("F1", 14, true) },
    { content: spaced("F2", 14, true) },
  ]);
}

/** Kerning amounts, in thousandths of an em (AC-5). 300 is deliberately too deep. */
export const KERNS = Object.freeze([80, 120, 150, 300]);

/**
 * A neighbour drawn into the match by ordinary kerning, one line per amount
 * and side, 24pt apart so no two lines meet. The neighbour is an `M`, wide
 * enough that its centre never falls inside the match, so a neighbour the band
 * takes is one nobody ticked. The needles are `before80`, `after80` and so on.
 */
function kerned(font) {
  let content = "";
  let y = 740;
  for (const kern of KERNS) {
    content += `BT /${font} 12 Tf 72 ${y} Td [${literal("Name M")} ${kern} ${literal(`before${kern}`)} ${literal(" value")}] TJ ET\n`;
    y -= 24;
    content += `BT /${font} 12 Tf 72 ${y} Td [${literal("Name ")} ${literal(`after${kern}`)} ${kern} ${literal("M value")}] TJ ET\n`;
    y -= 24;
  }
  return content;
}

/** Spec 0004, AC-5. Kerning in Helvetica. */
export function kerning() {
  return document(() => [{ content: kerned("F1") }]);
}

/**
 * Spec 0004, AC-4 to AC-6, in a font whose quad is 1.0 em tall: single spacing
 * at 12pt and 14pt leading, the 14pt page without its middle line, then the
 * kerning lines.
 */
export function carlito() {
  return document(
    () => [
      { content: spaced("F3", 12) },
      { content: spaced("F3", 14) },
      { content: spaced("F3", 14, true) },
      { content: kerned("F3") },
    ],
    { carlito: true },
  );
}

/** Spec 0004, AC-5. A match split across two lines. */
export function twoLines() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 700, "Please write to jane.doe@") +
        line("F1", 12, 72, 686, "example.com for any details") +
        line("F1", 12, 72, 672, "The last line stays as it is"),
    },
  ]);
}

/** Spec 0004, AC-5. A page rotated 90 degrees. */
export function rotatedPage() {
  return document(() => [
    {
      keys: "/Rotate 90",
      content:
        line("F1", 12, 72, 700, "A rotated page, first line") +
        line("F1", 12, 72, 686, "Contact: jane.doe@example.com today") +
        line("F1", 12, 72, 672, "A rotated page, last line"),
    },
  ]);
}

/**
 * Spec 0004, AC-5. Text drawn at 30 degrees, three lines 14pt apart across the
 * line, with the middle one ticked, through all three passes.
 */
export function angledText() {
  const cos = Math.cos(Math.PI / 6);
  const sin = Math.sin(Math.PI / 6);
  const at = (step, text) => {
    const x = 100 + step * 14 * sin;
    const y = 400 - step * 14 * cos;
    return `BT /F1 12 Tf ${cos} ${sin} ${-sin} ${cos} ${x} ${y} Tm ${literal(text)} Tj ET\n`;
  };
  return document(() => [
    {
      content:
        at(0, SPACING_LINES.above) +
        at(1, SPACING_LINES.target) +
        at(2, SPACING_LINES.below),
    },
  ]);
}

/** Spec 0004, AC-5. A crop box that does not start at the origin. */
export function offsetCropBox() {
  return document(() => [
    {
      keys: "/CropBox [100 150 500 650]",
      content:
        line("F1", 12, 120, 600, "Inside the crop box") +
        line("F1", 12, 120, 586, "Contact: jane.doe@example.com today") +
        line("F1", 12, 120, 572, "Inside the crop box, last line"),
    },
  ]);
}

/** A form XObject holding `text`, with its own font resources. */
function formXObject(add, fonts, text) {
  return add(
    stream(
      `/Type /XObject /Subtype /Form /BBox [0 0 400 40] /Resources << /Font << ${fonts} >> >>`,
      line("F1", 12, 4, 20, text),
    ),
  );
}

/** Spec 0004, AC-5. The match inside a form XObject, drawn once. */
export function formXObjectPage() {
  return document(({ add, fonts }) => {
    const form = formXObject(add, fonts, "Reference: SECRET-42 inside a form");
    return [
      {
        resources: `/XObject << /Fm1 ${form} 0 R >>`,
        content:
          line("F1", 12, 72, 700, "Text outside the form") +
          "q 1 0 0 1 72 600 cm /Fm1 Do Q\n",
      },
    ];
  });
}

/**
 * Spec 0004, AC-5 and the `sanitize` write. Two pages share one resource
 * dictionary. Page 1 draws the form holding the match; page 2 draws only the
 * other form. The unredacted form must not survive in the output through page
 * 2's resources.
 */
export function sharedXObject() {
  return document(({ add, fonts }) => {
    const secret = formXObject(add, fonts, "Shared secret SECRET-SHARED here");
    const other = formXObject(add, fonts, "Other form text");
    const shared = add(
      `<< /Font << ${fonts} >> /XObject << /Fm1 ${secret} 0 R /Fm2 ${other} 0 R >> >>`,
    );
    return [
      { resourcesRef: shared, content: "q 1 0 0 1 72 600 cm /Fm1 Do Q\n" },
      { resourcesRef: shared, content: "q 1 0 0 1 72 600 cm /Fm2 Do Q\n" },
    ];
  });
}

/**
 * Spec 0004, AC-13, *Recorded before redacted*. One form holding the match,
 * drawn on pages 1 and 3, ticked on page 1 only.
 */
export function xObjectTwoPages() {
  return document(({ add, fonts }) => {
    const form = formXObject(add, fonts, "Case ref SECRET-77 in a form");
    const drawn = {
      resources: `/XObject << /Fm1 ${form} 0 R >>`,
      content: "q 1 0 0 1 72 600 cm /Fm1 Do Q\n",
    };
    return [drawn, { content: line("F1", 12, 72, 700, "A page between") }, drawn];
  });
}

/**
 * Spec 0004, AC-5, *Measured, then recorded*. One form holding the match,
 * drawn twice on one page, with only the first drawing ticked.
 */
export function xObjectTwice() {
  return document(({ add, fonts }) => {
    const form = formXObject(add, fonts, "Ref SECRET-99 in a form");
    return [
      {
        resources: `/XObject << /Fm1 ${form} 0 R >>`,
        content: "q 1 0 0 1 72 650 cm /Fm1 Do Q\nq 1 0 0 1 72 550 cm /Fm1 Do Q\n",
      },
    ];
  });
}

/*
 * The OCR fixtures. A grey scan with blocks of ink where letters are, and a
 * text layer written the way Tesseract writes one: an invisible glyphless font
 * whose quad sits wholly above the baseline, each word placed on its own and
 * stretched with `Tz` to the width of its ink.
 *
 * Tesseract embeds a tiny glyphless TrueType program. It is left out here:
 * MuPDF measures the quad from the descriptor (1.0 em above the baseline and
 * 0.001 below, as it measures a real OCRmyPDF file), and the text is invisible,
 * so the program would change nothing a test can see.
 */

/** The scan: where it sits on the page, and how many pixels per point. */
const SCAN = Object.freeze({ x: 72, y: 560, width: 300, height: 140, scale: 4 });

/** The words of the scan, line by line, 18pt apart. The middle line holds the match. */
export const OCR_LINES = Object.freeze([
  { baseline: 670, words: ["Statement", "for", "the", "month", "of", "July"] },
  { baseline: 652, words: ["Payee", "Quigley", "gets", "paid"] },
  { baseline: 634, words: ["Reference", "number", "4471", "applies"] },
]);

export const OCR_TARGET = "Quigley";

const OCR_SIZE = 12;
/** Each scanned letter's advance, and the gap between words, in em. */
const LETTER = 0.55;
const WORD_GAP = 0.35;

/** Where each word's ink sits: its left edge, width and baseline. */
function ocrWords() {
  return OCR_LINES.flatMap(({ baseline, words }) => {
    let x = SCAN.x + 8;
    return words.map((word) => {
      const width = word.length * LETTER * OCR_SIZE;
      const placed = { word, x, width, baseline };
      x += width + WORD_GAP * OCR_SIZE;
      return placed;
    });
  });
}

/**
 * The ink of one letter, as rectangles in points relative to the baseline: a
 * body to the x height or the cap height, a descender below the baseline, and
 * the dot of an `i` or `j`.
 */
function letterInk(letter, left, advance) {
  const x0 = left + 0.1 * advance;
  const x1 = left + 0.9 * advance;
  const em = OCR_SIZE;
  const tall = /[A-Z0-9bdfhklt]/.test(letter);
  const rects = [[x0, 0, x1, (tall ? 0.72 : 0.52) * em]];

  if (/[gjpqyQ]/.test(letter)) rects.push([x0, -0.22 * em, x1, 0]);
  if (/[ij]/.test(letter)) rects.push([x0, 0.62 * em, x1, 0.72 * em]);
  return rects;
}

/**
 * The scan as 8 bit grey pixels, white with black ink. `skip` leaves one word's
 * ink out, which is how the OCR tests isolate the neighbouring words' ink.
 */
function scanPixels(skip) {
  const columns = SCAN.width * SCAN.scale;
  const rows = SCAN.height * SCAN.scale;
  const pixels = new Uint8Array(columns * rows).fill(255);
  const top = SCAN.y + SCAN.height;

  for (const { word, x, width, baseline } of ocrWords()) {
    if (word === skip) continue;
    const advance = width / word.length;
    [...word].forEach((letter, index) => {
      for (const [x0, y0, x1, y1] of letterInk(letter, x + index * advance, advance)) {
        const fromColumn = Math.ceil((x0 - SCAN.x) * SCAN.scale - 0.5);
        const toColumn = Math.floor((x1 - SCAN.x) * SCAN.scale - 0.5);
        const fromRow = Math.ceil((top - (baseline + y1)) * SCAN.scale - 0.5);
        const toRow = Math.floor((top - (baseline + y0)) * SCAN.scale - 0.5);
        for (let row = fromRow; row <= toRow; row += 1) {
          pixels.fill(0, row * columns + fromColumn, row * columns + toColumn + 1);
        }
      }
    });
  }
  return pixels;
}

/**
 * The text layer, each word shifted `down` and `left` points from its ink.
 * Glyph ids are Unicode code points, as the identity ToUnicode map says.
 */
function textLayer(down, left) {
  return ocrWords()
    .map(({ word, x, width, baseline }) => {
      const stretch = (100 * width) / (word.length * 0.5 * OCR_SIZE);
      const hex = [...word]
        .map((letter) => letter.codePointAt(0).toString(16).padStart(4, "0"))
        .join("");
      return `BT 3 Tr /Fg ${OCR_SIZE} Tf ${stretch} Tz 1 0 0 1 ${x - left} ${baseline - down} Tm <${hex}> Tj ET\n`;
    })
    .join("");
}

const IDENTITY_UNICODE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
1 beginbfrange
<0000> <FFFF> <0000>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

/**
 * One OCR page. `down` and `left` misalign the text layer from the ink; `skip`
 * leaves a word's ink out of the scan.
 */
function ocrPage({ down = 0, left = 0, skip } = {}) {
  return document(({ add }) => {
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
    const font = add(
      "<< /Type /Font /Subtype /Type0 /BaseFont /GlyphLessFont /Encoding /Identity-H " +
        `/DescendantFonts [${cidFont} 0 R] /ToUnicode ${unicode} 0 R >>`,
    );
    const scan = add(
      stream(
        `/Type /XObject /Subtype /Image /Width ${SCAN.width * SCAN.scale} ` +
          `/Height ${SCAN.height * SCAN.scale} /ColorSpace /DeviceGray /BitsPerComponent 8 ` +
          "/Filter /FlateDecode",
        deflateSync(scanPixels(skip)),
      ),
    );
    return [
      {
        resources: `/Font << /Fg ${font} 0 R >> /XObject << /Scan ${scan} 0 R >>`,
        content:
          `q ${SCAN.width} 0 0 ${SCAN.height} ${SCAN.x} ${SCAN.y} cm /Scan Do Q\n` +
          textLayer(down, left),
      },
    ];
  });
}

/** Spec 0004, AC-5. A scan with its text layer where Tesseract puts it. */
export function ocrAligned() {
  return ocrPage();
}

/**
 * Spec 0004, AC-5. The same scan with its text layer shifted down by 15% of
 * the quad's height and left by a tenth of an em.
 */
export function ocrMisaligned() {
  return ocrPage({ down: 0.15 * OCR_SIZE, left: 0.1 * OCR_SIZE });
}

/** The same scan without the match's ink, to isolate the neighbouring words' ink. */
export function ocrBare() {
  return ocrPage({ skip: OCR_TARGET });
}

/**
 * Spec 0004, AC-13, *Pixels checked*. Born digital text over images: an inline
 * image under one match and a 1 bit image mask under another.
 */
export function imagesUnder() {
  return document(({ add }) => {
    const mask = add(
      stream(
        "/Type /XObject /Subtype /Image /Width 16 /Height 4 /ImageMask true /BitsPerComponent 1",
        new Uint8Array(8).fill(0),
      ),
    );
    const grey = "60".repeat(12 * 4);
    return [
      {
        resources: `/XObject << /Mask ${mask} 0 R >>`,
        content:
          `q 170 0 0 20 140 684 cm BI /W 12 /H 4 /CS /G /BPC 8 /F /AHx ID ${grey}> EI Q\n` +
          line("F1", 12, 150, 690, "Account 12345678 held") +
          `q 0.2 0.2 0.8 rg 170 0 0 20 140 624 cm /Mask Do Q\n` +
          line("F1", 12, 150, 630, "Sort code 40-11-22 used"),
      },
    ];
  });
}

/** Helvetica's advance widths, in thousandths of an em, for the outlined line. */
const HELVETICA = Object.freeze({
  N: 722,
  a: 556,
  m: 833,
  e: 556,
  ":": 278,
  " ": 278,
  P: 667,
  é: 556,
  g: 556,
  u: 556,
  y: 500,
  h: 556,
  r: 333,
});

/** The outlined line. The match is `Péguy`, with an accent and two descenders. */
export const OUTLINED_TEXT = "Name: Péguy here";
export const OUTLINED_TARGET = "Péguy";

/**
 * Spec 0004, AC-5. A match drawn as vector outlines over an invisible text
 * layer, the way some producers draw text. Each glyph is its own filled path,
 * in dark blue so a test can tell the outlines from the black box: a body to
 * the x height or cap height, a descender for `g` and `y`, and an accent for
 * `é`.
 */
export function outlined() {
  const size = 12;
  const baseline = 700;
  let x = 72;
  let paths = "0.1 0.1 0.6 rg\n";

  for (const letter of OUTLINED_TEXT) {
    const advance = (HELVETICA[letter] * size) / 1000;
    if (letter !== " ") {
      const x0 = x + 0.08 * advance;
      const width = 0.84 * advance;
      const tall = /[A-Zh:]/.test(letter);
      const rects = [[0, (tall ? 0.72 : 0.52) * size]];
      if (/[gy]/.test(letter)) rects.push([-0.21 * size, 0]);
      if (letter === "é") rects.push([0.6 * size, 0.74 * size]);
      for (const [y0, y1] of rects) {
        paths += `${x0.toFixed(3)} ${(baseline + y0).toFixed(3)} ${width.toFixed(3)} ${(y1 - y0).toFixed(3)} re `;
      }
      paths += "f\n";
    }
    x += advance;
  }

  const layer = `BT 3 Tr /F1 ${size} Tf 72 ${baseline} Td (Name: P\\351guy here) Tj ET\n`;
  return document(() => [{ content: paths + layer }]);
}

/** Spec 0004, AC-4 and AC-5. A lone `.` and a lone `i`, each a whole match. */
export function loneGlyphs() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 700, "Total . Due") + line("F1", 12, 72, 680, "Rank i Code"),
    },
  ]);
}

/**
 * Spec 0004, AC-13 and AC-25. A large diagonal watermark crossing a ticked
 * match. The band meets a watermark letter that is not on the match's line, so
 * the run must refuse with `redaction-overreach` rather than take it out.
 */
export function watermark() {
  const cos = Math.SQRT1_2;
  return document(() => [
    {
      content:
        `0.8 g BT /F1 72 Tf ${cos} ${cos} ${-cos} ${cos} 60 250 Tm (CONFIDENTIAL) Tj ET 0 g\n` +
        line("F1", 12, 72, 400, "Payee name SECRET-WM here"),
    },
  ]);
}

/**
 * Spec 0004, AC-13 and AC-25. A small superscript over the middle of a match,
 * inside its line box but clear of its removal band. It is not on the match's
 * line, so it is not ticked, it survives, and the box would hide it: the run
 * must refuse with `redaction-overreach`.
 */
export function superscript() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 500, "Payee SECRET-SUP here") + line("F1", 4, 148, 507.5, "2"),
    },
  ]);
}

/** Code 0xB4 is U+0301, the combining acute. Every other code keeps its encoding. */
const COMBINING_ACUTE_UNICODE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Combining-UCS def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
1 beginbfchar
<B4> <0301>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

/**
 * Spec 0004, AC-5, *Measured, then recorded*. A match holding a combining mark:
 * `e` then U+0301, the acute drawn at zero width over it, once at the end of
 * the match (`José`) and once inside it (`Renée`). A Helvetica with its own
 * widths, where code 0xB4 has none, and a ToUnicode map naming it.
 */
export function combining() {
  const advances = { ...HELVETICA, J: 500, o: 556, s: 500 };
  return document(({ add }) => {
    const widths = Array.from({ length: 180 - 32 + 1 }, (_, index) =>
      32 + index === 0xb4 ? 0 : (advances[String.fromCharCode(32 + index)] ?? 556),
    );
    const unicode = add(stream("", COMBINING_ACUTE_UNICODE));
    const font = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding " +
        `/FirstChar 32 /LastChar 180 /Widths [${widths.join(" ")}] /ToUnicode ${unicode} 0 R >>`,
    );
    return [
      {
        resources: `/Font << /F4 ${font} 0 R >>`,
        content:
          `BT /F4 12 Tf 72 700 Td (Name: Jose\\264 here) Tj ET\n` +
          `BT /F4 12 Tf 72 670 Td (Name: Rene\\264e here) Tj ET\n`,
      },
    ];
  });
}

/** UTF-16BE with its byte order mark, as a PDF hex string. */
function utf16(text) {
  return `<FEFF${[...text].map((c) => c.codePointAt(0).toString(16).padStart(4, "0")).join("")}>`;
}

/**
 * Spec 0004, AC-5, AC-13, AC-25 and AC-26. Replacement text (`/ActualText`):
 *
 *  1. a span that wraps exactly the match, which redacts cleanly;
 *  2. a span wider than the match, inline;
 *  3. the same in UTF-16;
 *  4. the same named in the page's `/Properties`;
 *  5. a span whose text differs from its glyph (a ligature standing in for
 *     `fi`) beside a match, which redacts cleanly.
 *
 * Pages 2 to 4 must fail with `replacement-text`.
 */
export function actualText() {
  const wide = "Name: SECRET-AT value";
  return document(() => [
    {
      content: `BT /F1 12 Tf 72 700 Td (Name: ) Tj /Span << /ActualText (SECRET-AT) >> BDC (SECRET-AT) Tj EMC ( value) Tj ET\n`,
    },
    {
      content: `BT /F1 12 Tf 72 700 Td /Span << /ActualText ${literal(wide)} >> BDC ${literal(wide)} Tj EMC ET\n`,
    },
    {
      content: `BT /F1 12 Tf 72 700 Td /Span << /ActualText ${utf16(wide)} >> BDC ${literal(wide)} Tj EMC ET\n`,
    },
    {
      resources: `/Properties << /P1 << /ActualText ${literal(wide)} >> >>`,
      content: `BT /F1 12 Tf 72 700 Td /Span /P1 BDC ${literal(wide)} Tj EMC ET\n`,
    },
    {
      content: `BT /F1 12 Tf 72 700 Td /Span << /ActualText (fi) >> BDC (X) Tj EMC ( SECRET-AT here) Tj ET\n`,
    },
  ]);
}
