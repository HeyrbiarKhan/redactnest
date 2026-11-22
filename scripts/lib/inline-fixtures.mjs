/**
 * The lost inline picture fixtures. Spec 0022, AC-6.
 *
 * An inline picture is a small picture stored inside a drawing's instructions,
 * between `BI` and `EI`, rather than as an object of its own. MuPDF 1.28.1's
 * write can carry its colour space only as the name written under `/CS`, so a
 * palette written inline (`/CS [/I /RGB 3 <...>]`) leaves as `/CS/`, an empty
 * name, and the picture stops drawing with the check passing (spec 0021's
 * `rationale.md`, *A lost inline picture*). RedactNest refuses such a file at
 * open with `inline-picture`. Each fixture holds the same picture in one of the
 * four places the open's role walk reads: a page's contents, a form, a tiling
 * pattern and a Type 3 glyph.
 *
 * Written object by object, never by MuPDF, so an engine bug cannot write a
 * fixture that hides itself (spec 0004, INV-3). No `/ToUnicode`, no date, no
 * randomness. Each page also draws one line of Helvetica, so it reads and no
 * earlier refusal takes it.
 */

import { latin1, stream, writePdf } from "./pdf-writer.mjs";

/** The readable line every fixture draws, at 72, 700 in Helvetica 18. */
export const INLINE_TEXT = "Palette logo sample";

const CATALOG = "<< /Type /Catalog /Pages 2 0 R >>";
const PAGES = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
const HELVETICA = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
const LINE = `BT /F1 18 Tf 72 700 Td (${INLINE_TEXT}) Tj ET`;

/**
 * The picture: 2 by 2, 8 bits per index, indexes 0 to 3 over red, green, blue
 * and yellow, its palette written inline. Drawn into the unit square, so the
 * caller's transform sets where it lands and how big. The four index bytes hold
 * no `EI`, so the scan settles on the real end at once.
 */
function picture(scale) {
  return Uint8Array.from([
    ...latin1(
      `q ${scale} 0 0 ${scale} 0 0 cm ` +
        "BI /W 2 /H 2 /BPC 8 /CS [/I /RGB 3 <FF0000 00FF00 0000FF FFFF00>] ID ",
    ),
    0x00,
    0x01,
    0x02,
    0x03,
    ...latin1(" EI Q"),
  ]);
}

/** Bytes joined in order, a string written one byte per character. */
function joined(...parts) {
  const bytes = parts.map((part) => (typeof part === "string" ? latin1(part) : part));
  const out = new Uint8Array(bytes.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of bytes) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** Object 3: the one page, drawing object 4 with `resources`. */
function page(resources) {
  return (
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
    `/Resources << ${resources} >> /Contents 4 0 R >>`
  );
}

/** `inline-indexed.pdf`: the picture in the page's contents, 100 points square at 72, 500. */
export function inlineIndexed() {
  return writePdf({
    objects: [
      CATALOG,
      PAGES,
      page("/Font << /F1 5 0 R >>"),
      stream("", joined(`${LINE}\nq 1 0 0 1 72 500 cm `, picture(100), " Q")),
      HELVETICA,
    ],
    trailer: "/Root 1 0 R",
  }).bytes;
}
