/**
 * The fixture for custom terms. Spec 0017, AC-30.
 *
 * Written object by object like the detection fixtures, from the same page
 * builders, so a reviewer can read exactly what each page draws and where.
 * None is made by MuPDF. Every name in it is invented, and every address is
 * on `example.com`, which is reserved for documentation.
 *
 * Seven pages, past the free page cap on purpose: custom terms are Pro, and a
 * Pro job opens up to 50.
 */

import { stream } from "./pdf-writer.mjs";
import { document, IDENTITY_UNICODE, line, literal } from "./redaction-fixtures.mjs";

/**
 * A Type0 font whose two byte codes are Unicode code points, as its identity
 * ToUnicode map says, for the Arabic and Hebrew lines the built in fonts
 * cannot encode. No font program is embedded, so MuPDF draws with a
 * substitute; extraction reads the map, a code point per code, the marks
 * included as code points of their own. The Arabic and Hebrew combining
 * marks (U+064B to U+0652, U+05B0 to U+05C7) advance nothing, as a real
 * font's do, so no gap opens where MuPDF would read a space.
 */
function identityFont(add) {
  const unicode = add(stream("", IDENTITY_UNICODE));
  const descriptor = add(
    "<< /Type /FontDescriptor /FontName /RedactNestUnicode /FontBBox [0 -200 1000 800] " +
      "/Ascent 800 /Descent -200 /CapHeight 700 /StemV 80 /ItalicAngle 0 /Flags 4 >>",
  );
  const cidFont = add(
    "<< /Type /Font /Subtype /CIDFontType2 /BaseFont /RedactNestUnicode /CIDToGIDMap /Identity " +
      "/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> " +
      `/FontDescriptor ${descriptor} 0 R /DW 600 /W [1611 1618 0 1456 1479 0] >>`,
  );
  return add(
    "<< /Type /Font /Subtype /Type0 /BaseFont /RedactNestUnicode /Encoding /Identity-H " +
      `/DescendantFonts [${cidFont} 0 R] /ToUnicode ${unicode} 0 R >>`,
  );
}

/** One line in the identity font: each code point below U+10000 as its own code. */
function unicodeLine(size, x, y, text) {
  const hex = [...text]
    .map((character) => character.codePointAt(0).toString(16).padStart(4, "0"))
    .join("");
  return `BT /U ${size} Tf ${x} ${y} Td <${hex}> Tj ET\n`;
}

/**
 * One right to left line, drawn as a PDF draws one: its glyphs in visual
 * order, left to right on the page, so the last letter comes first. MuPDF
 * turns a right to left run back into reading order as it extracts it.
 */
function rightToLeftLine(size, x, y, text) {
  return unicodeLine(size, x, y, [...text].reverse().join(""));
}

/** A marked content span whose replacement text says `actual` and whose glyphs draw `drawn`. */
function span(actual, drawn) {
  return `/Span << /ActualText ${literal(actual)} >> BDC ${literal(drawn)} Tj EMC`;
}

/** Lines 18 points apart from `top`, in 12 point Helvetica at the left margin. */
function lines(top, texts) {
  return texts.map((text, row) => line("F1", 12, 72, top - 18 * row, text)).join("");
}

/**
 * What `terms.pdf` holds, page by page, for the tests to name. Each page's
 * lines are in reading order.
 */
export const TERMS_PDF = Object.freeze({
  /** Page 1: the folds, a line break, a hyphenated break each way, a block break. */
  exact: Object.freeze([
    "Paid to JOSE today, and Herr Müller wrote back.",
    "Mail to the Straße office or the STRASSE depot.",
    "Acme Ltd signed the lease on time.",
    "The tenant is Acme",
    "Ltd from May onwards.",
    "The landlord Smith-",
    "son agreed, and Jean-",
    "Luc witnessed it.",
  ]),
  /** Page 1's two columns: `Acme` ends the left block and `Ltd` starts the right. */
  columns: Object.freeze({
    left: Object.freeze(["The deposit is paid by", "Acme"]),
    right: Object.freeze(["Ltd in full", "before May."]),
  }),
  /** Page 2: the joined and unlisted edges, and each spaced form. */
  edges: Object.freeze([
    "JohnSmith signed, and SmithDate was set.",
    "Smithson and SMITHSON are other people.",
    "Annual planning starts in May.",
    "Call 0958Mobile or write to Smith2026.",
    "Smith Jones and SmithJones both came.",
    "Invoice INV 2026 0042 and INV20260042 were paid.",
    "Mc Donald, S M I T H, OBrien and O Brien signed.",
    "J Smith and the landlord Smith",
    "son, whose hyphen was lost.",
  ]),
  /** Page 3: Arabic and Hebrew with their vowel marks, for terms typed without them. */
  marks: Object.freeze({
    arabic: "قال مُحَمَّد اليوم",
    arabicName: "مُحَمَّد",
    arabicBare: "محمد",
    hebrew: "אמר שָׁלוֹם לכולם",
    hebrewWord: "שָׁלוֹם",
    hebrewBare: "שלום",
  }),
  /**
   * Page 4: a term under a box drawn over it (covered), a term whose
   * replacement text names it while the glyphs draw another word of the same
   * widths (`Smith` over `Smlth`, blocked), a term drawn only behind
   * unrelated replacement text (`Jane Doe` behind `Figure 2`, found only with
   * it ignored), and the same beside a detector's row: replacement text
   * saying an address over glyphs drawing `Ann Lee`.
   */
  concealed: Object.freeze({
    covered: "Covered: Acme Ltd here.",
    replaced: Object.freeze({ said: "Smith", drawn: "Smlth" }),
    hidden: Object.freeze({ said: "Figure 2", drawn: "Jane Doe" }),
    beside: Object.freeze({ said: "ann@example.com", drawn: "Ann Lee here" }),
  }),
  /** Pages 5 and 6: `Acme` ends page 5 and `Ltd` starts page 6. */
  split: Object.freeze({
    before: Object.freeze([
      "Page five holds one more line.",
      "The rent was paid to Acme",
    ]),
    after: Object.freeze(["Ltd on the first of May.", "The last payee is Acme"]),
  }),
  /** Page 6's footer, drawn after its last line, so it sits between the parts. */
  footer: "Page 6",
  /** Page 7: `Ltd` starts it, kept from page 6's `Acme` by the footer. */
  afterFooter: Object.freeze(["Ltd again, after the footer."]),
});

/**
 * Spec 0017, AC-30. A line for each case AC-7 to AC-13 names:
 *
 *  1. the folds (`José` finds `JOSE`, `Muller` finds `Müller`, `Straße` finds
 *     `Straße` and `STRASSE`, so one page character folds to two), a line break
 *     (`Acme` then `Ltd`), a hyphenated break each way (`Smith-` then `son`
 *     for `Smithson`, `Jean-` then `Luc` for `Jean-Luc`), and a block break
 *     (two columns, `Acme` ending the left one and `Ltd` starting the right);
 *  2. the joined edges (`JohnSmith`, `SmithDate`, `0958Mobile`, `Smith2026`),
 *     the unlisted ones (`Smithson`, `SMITHSON`, `Annual planning` for `Ann`),
 *     and each spaced form;
 *  3. Arabic and Hebrew with their vowel marks, for terms typed without them;
 *  4. a covered place and the replacement text places;
 *  5. and 6. a term split across a page break, listed as two parts;
 *  6. and 7. one split by a footer between its parts, which lists nothing.
 */
export function termsPdf() {
  const { exact, columns, edges, marks, concealed, split, footer, afterFooter } =
    TERMS_PDF;
  return document(({ add }) => {
    const unicode = identityFont(add);
    return [
      {
        content:
          lines(740, exact) +
          line("F1", 11, 72, 560, columns.left[0]) +
          line("F1", 11, 72, 546, columns.left[1]) +
          line("F1", 11, 360, 560, columns.right[0]) +
          line("F1", 11, 360, 546, columns.right[1]),
      },
      { content: lines(740, edges) },
      {
        fonts: `/U ${unicode} 0 R`,
        content:
          rightToLeftLine(14, 72, 740, marks.arabic) +
          rightToLeftLine(14, 72, 710, marks.hebrew),
      },
      {
        content:
          // `Covered: ` is 52.0 points wide in 12 point Helvetica and `Acme
          // Ltd` 50.7, so the box covers the term and neither neighbour.
          line("F1", 12, 72, 740, concealed.covered) +
          "0 0 0 rg 124 735 50.7 19 re f\n" +
          `BT /F1 12 Tf 72 700 Td ${literal("Contact: ")} Tj ` +
          `${span(concealed.replaced.said, concealed.replaced.drawn)} ${literal(" today.")} Tj ET\n` +
          `BT /F1 12 Tf 72 660 Td ${literal("See ")} Tj ` +
          `${span(concealed.hidden.said, concealed.hidden.drawn)} ${literal(" below.")} Tj ET\n` +
          `BT /F1 12 Tf 72 620 Td ${literal("Write to ")} Tj ` +
          `${span(concealed.beside.said, concealed.beside.drawn)} ${literal(" soon.")} Tj ET\n`,
      },
      { content: lines(740, split.before) },
      { content: lines(740, split.after) + line("F1", 9, 300, 40, footer) },
      { content: lines(740, afterFooter) },
    ];
  });
}

/**
 * What `terms-dense.pdf` holds, for the tests to name. `tests/e2e/terms-speed.spec.ts`
 * writes the term and the count out again, because Playwright cannot import
 * this script; change them together.
 */
export const TERMS_DENSE = Object.freeze({
  /** The reviewer's initials every line names twice, each as a whole word. */
  term: "JK",
  pages: 50,
  linesPerPage: 30,
  /** Two places a line, 60 a page, 3,000 in all, every one exact. */
  places: 3_000,
});

/*
 * The words around the initials. None holds a `j`, so nothing else on the
 * page folds to `jk`, spaced or joined; none holds a digit or an `@`, so no
 * detector lists anything. Six, seven and five words, so the lines cycle
 * through 210 different sentences before one repeats.
 */
const DENSE_FIRST = Object.freeze([
  "Drafted",
  "Prepared",
  "Written",
  "Revised",
  "Collated",
  "Summarised",
]);
const DENSE_SECOND = Object.freeze([
  "checked",
  "approved",
  "signed",
  "countersigned",
  "reviewed",
  "initialled",
  "filed",
]);
const DENSE_TOPIC = Object.freeze([
  "the supplier notes",
  "the site visit",
  "the board minutes",
  "the staff survey",
  "the lease terms",
]);

/**
 * Spec 0017, AC-28: one group of thousands of rows. A 50 page review log,
 * each page a heading and 30 lines, each line naming the initials twice as
 * whole words, so `JK` lists 3,000 exact rows, every one ticked, and its
 * group is the checklist's only group. `detect-dense.pdf` stays as it is,
 * because specs 0007, 0012 and 0017 recorded their figures on it.
 */
export function termsDense() {
  const { term, pages, linesPerPage } = TERMS_DENSE;
  return document(() =>
    Array.from({ length: pages }, (_, page) => {
      let content = line("F1", 14, 72, 760, "Review log");
      for (let row = 0; row < linesPerPage; row += 1) {
        const index = page * linesPerPage + row;
        const text =
          `${DENSE_FIRST[index % DENSE_FIRST.length]} by ${term} and ` +
          `${DENSE_SECOND[index % DENSE_SECOND.length]} by ${term}: ` +
          `${DENSE_TOPIC[index % DENSE_TOPIC.length]}`;
        content += line("F1", 10, 72, 730 - row * 22, text);
      }
      return { content };
    }),
  );
}
