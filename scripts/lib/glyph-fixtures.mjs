/**
 * The Type 3 glyph fixtures. Spec 0020, AC-8 and AC-9, *Fixture recipes*.
 *
 * A Type 3 font draws each of its characters with a small drawing of its own
 * (a glyph procedure), and nothing in RedactNest can see inside one: MuPDF
 * hands every reader the character as a single letter. The first four files
 * are the cases measured on 2026-11-17, each a run main finished with the
 * ticked value still in the file: a glyph naming the same form or picture the
 * page draws (drawn by text or not), and a glyph writing the ticked words as
 * text of its own. The last two are controls in the shapes Chrome and a bitmap
 * font write, which must open and redact as they do today.
 *
 * Written object by object with the recipes' own numbers, never by MuPDF, so
 * an engine bug cannot write a fixture that hides itself (spec 0004, INV-3).
 * No `/ToUnicode` anywhere, no date, no randomness. Every Type 3 line sits on
 * a line of its own, so `tests/unit/detection.test.ts` finds no glyph off its
 * line, and nothing here warns at open, so `marked-descriptions.pdf` stays the
 * one committed fixture that does.
 */

import { deflateSync } from "node:zlib";

import { latin1, stream, writePdf } from "./pdf-writer.mjs";

/** The value each fixture's ticked set ticks, written here and nowhere else. */
export const GLYPH_TEXT = Object.freeze({
  /** `glyph-undrawn-form.pdf`, `glyph-drawn-form.pdf` and `glyph-text.pdf`. */
  form: "SECRET-42",
  /** `glyph-shared-picture.pdf`. */
  picture: "40-11-22",
  /** `glyph-emoji.pdf`. */
  emoji: "Jane Example",
  /** `glyph-bitmap.pdf`. */
  bitmap: "12345678",
});

const CATALOG = "<< /Type /Catalog /Pages 2 0 R >>";
const PAGES = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

/** Object 3: the one page, drawing object 4 with `resources`. */
function page(resources) {
  return (
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
    `/Resources << ${resources} >> /Contents 4 0 R >>`
  );
}

/**
 * Object 7 of the form fixtures: two glyphs, `ga` drawing a square and `gb`
 * whatever object 9 holds, with `resources` as the font's own `/Resources`
 * entries, or no `/Resources` key at all when `null`.
 */
function twoGlyphFont(resources) {
  return (
    "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] " +
    "/FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /ga 8 0 R /gb 9 0 R >> " +
    "/Encoding << /Type /Encoding /Differences [97 /ga /gb] >> " +
    "/FirstChar 97 /LastChar 98 /Widths [1000 1000]" +
    (resources === null ? "" : ` /Resources << ${resources} >>`) +
    " >>"
  );
}

/** Glyph `ga`: a filled square, which names nothing and shows no text. */
const SQUARE_GLYPH = stream("", "1000 0 0 0 1000 1000 d1 0 0 1000 1000 re f");

/**
 * The three form fixtures: a page drawing a Helvetica line, a form holding
 * `SECRET-42`, and a Type 3 line, beside a Type 3 font whose glyph `gb`
 * draws `gbBody` with `fontResources`.
 */
function formFixture({ shows, fontResources, gbBody }) {
  return writePdf({
    objects: [
      CATALOG,
      PAGES,
      page("/Font << /F1 5 0 R /T3 7 0 R >> /XObject << /Fm0 6 0 R >>"),
      stream(
        "",
        "BT /F1 12 Tf 72 700 Td (Glyph probe line) Tj ET " +
          "q 1 0 0 1 72 500 cm /Fm0 Do Q " +
          `BT /T3 24 Tf 72 300 Td (${shows}) Tj ET`,
      ),
      HELVETICA,
      stream(
        "/Type /XObject /Subtype /Form /BBox [0 0 300 100] /Resources << /Font << /F1 5 0 R >> >>",
        `BT /F1 12 Tf 10 50 Td (${GLYPH_TEXT.form}) Tj ET`,
      ),
      twoGlyphFont(fontResources),
      SQUARE_GLYPH,
      stream("", gbBody),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * `glyph-undrawn-form.pdf`: the glyph naming the page's form is one no text
 * draws, so only `a` is shown. Main kept the original form, `SECRET-42` and
 * all, with `SECRET-42` ticked.
 */
export function glyphUndrawnForm() {
  return formFixture({
    shows: "a",
    fontResources: "/XObject << /Fm0 6 0 R >>",
    gbBody: "1000 0 d0 /Fm0 Do",
  });
}

/** `glyph-drawn-form.pdf`: the same page with both glyphs drawn, which main kept too. */
export function glyphDrawnForm() {
  return formFixture({
    shows: "ab",
    fontResources: "/XObject << /Fm0 6 0 R >>",
    gbBody: "1000 0 d0 /Fm0 Do",
  });
}

/**
 * `glyph-text.pdf`: the undrawn glyph writes `SECRET-42` as text of its own,
 * in Helvetica from the font's own resources, which no reader, pass or check
 * can see.
 */
export function glyphText() {
  return formFixture({
    shows: "a",
    fontResources: "/Font << /F9 5 0 R >>",
    gbBody: `1000 0 d0 BT /F9 1 Tf (${GLYPH_TEXT.form}) Tj ET`,
  });
}

/**
 * `glyph-shared-picture.pdf`: a page draws an image mask under the line
 * holding `40-11-22`, and the font's undrawn glyph names the same picture in
 * its own resources. Main kept both the blanked copy and the original.
 */
export function glyphSharedPicture() {
  return writePdf({
    objects: [
      CATALOG,
      PAGES,
      page("/Font << /F1 5 0 R /T3 7 0 R >> /XObject << /Mask 6 0 R >>"),
      stream(
        "",
        "q 0.2 0.2 0.8 rg 170 0 0 20 140 624 cm /Mask Do Q " +
          `BT /F1 12 Tf 150 630 Td (Sort code ${GLYPH_TEXT.picture} used) Tj ET ` +
          "BT /T3 24 Tf 72 300 Td (a) Tj ET",
      ),
      HELVETICA,
      stream(
        "/Type /XObject /Subtype /Image /Width 680 /Height 80 /ImageMask true " +
          "/BitsPerComponent 1 /Filter /FlateDecode",
        deflateSync(new Uint8Array(6_800)),
      ),
      twoGlyphFont("/XObject << /Im0 6 0 R >>"),
      SQUARE_GLYPH,
      stream("", "1000 0 d0 /Im0 Do"),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * `glyph-emoji.pdf`: Chrome's shape, as measured (spec 0020, *What Chrome
 * writes*). An undrawn notdef glyph of paths, a drawn glyph naming a form in
 * the font's own resources that fills through a shading pattern with a
 * graphics state the page also lists and uses, and a drawn glyph naming a
 * picture held only in the font's resources. Nothing a glyph draws is drawn
 * outside the font but that graphics state, which never counts as shared.
 * The recipe has no object 6, so its number stays free.
 */
export function glyphEmoji() {
  return writePdf({
    objects: [
      CATALOG,
      PAGES,
      page("/Font << /F1 5 0 R /T3 7 0 R >> /ExtGState << /G3 10 0 R >>"),
      stream(
        "",
        `/G3 gs BT /F1 12 Tf 72 700 Td (Invoice for ${GLYPH_TEXT.emoji}) Tj ET ` +
          "BT /T3 24 Tf 72 400 Td (ab) Tj ET",
      ),
      HELVETICA,
      null,
      "<< /Type /Font /Subtype /Type3 /FontBBox [0 0 1000 1000] " +
        "/FontMatrix [0.001 0 0 0.001 0 0] /CharProcs << /g0 8 0 R /ga 9 0 R /gb 11 0 R >> " +
        "/Encoding << /Type /Encoding /Differences [96 /g0 /ga /gb] >> " +
        "/FirstChar 96 /LastChar 98 /Widths [1000 1000 1000] " +
        "/Resources << /XObject << /Xa 12 0 R /Xb 13 0 R >> >> >>",
      stream("", "1000 0 0 0 1000 1000 d1 0 0 m 0 1000 l 1000 1000 l 1000 0 l h f"),
      stream("", "1000 0 d0 1 0 0 1 0 0 cm /Xa Do"),
      "<< /ca 1 /BM /Normal >>",
      stream("", "1000 0 d0 1 0 0 1 0 0 cm /Xb Do"),
      stream(
        "/Type /XObject /Subtype /Form /BBox [0 0 1000 1000] " +
          "/Resources << /ExtGState << /G3 10 0 R >> /Pattern << /P1 14 0 R >> >>",
        "q 0 0 1000 1000 re W n /G3 gs /Pattern cs /P1 scn 100 100 800 800 re f Q",
      ),
      stream(
        "/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceRGB " +
          "/BitsPerComponent 8 /Filter /FlateDecode",
        deflateSync(new Uint8Array(192).fill(0xf0)),
      ),
      "<< /Type /Pattern /PatternType 2 /Shading << /ShadingType 2 /ColorSpace /DeviceRGB " +
        "/Coords [0 0 1000 1000] /Function << /FunctionType 2 /Domain [0 1] " +
        "/C0 [1 0.9569 0.4706] /C1 [1 0.6902 0.1804] /N 1 >> >> >>",
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}

/**
 * `glyph-bitmap.pdf`: a bitmap font in its hardest form for the rule (spec
 * 0020, *A bitmap font with no resources*). The Type 3 font has no resources
 * of its own, so it draws with the page's dictionary, which holds fonts; each
 * `d1` glyph draws an inline image mask whose data holds the bytes `EI` and
 * `Tj`, one glyph drawn and one not. The scan must read both to their end, or
 * the rule would judge them as showing text. No object 6 either.
 */
export function glyphBitmap() {
  const glyph = () =>
    stream(
      "",
      Uint8Array.from([
        ...latin1(
          "1000 0 0 0 1000 1000 d1 q 1000 0 0 1000 0 0 cm " +
            "BI /IM true /W 8 /H 8 /BPC 1 /D [1 0] ID ",
        ),
        0xff,
        0x45,
        0x49,
        0x20,
        0x54,
        0x6a,
        0x81,
        0xff,
        ...latin1(" EI Q"),
      ]),
    );

  return writePdf({
    objects: [
      CATALOG,
      PAGES,
      page("/Font << /F1 5 0 R /T3 7 0 R >>"),
      stream(
        "",
        `BT /F1 12 Tf 72 700 Td (Bitmap font sample ${GLYPH_TEXT.bitmap}) Tj ET ` +
          "BT /T3 24 Tf 72 400 Td (a) Tj ET",
      ),
      HELVETICA,
      null,
      twoGlyphFont(null),
      glyph(),
      glyph(),
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}
