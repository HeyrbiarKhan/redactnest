/**
 * The fixtures for pattern detection. Spec 0005, *Build plan*, tasks 7, 10,
 * 14, 15 and 22.
 *
 * Written object by object like the redaction matrix, from the same page
 * builders, so a reviewer can read exactly what each page draws and where.
 * None is made by MuPDF. Every value in them is invented: `example.com` and
 * its kin are reserved for documentation, `020 7946 0xxx` is Ofcom's drama
 * range, and `555-01xx` is the US one.
 */

import { stream } from "./pdf-writer.mjs";
import {
  document,
  drawImage,
  flatImage,
  IDENTITY_UNICODE,
  line,
  literal,
  num,
} from "./redaction-fixtures.mjs";

/**
 * A Type0 font whose two byte codes are Unicode code points, as its identity
 * ToUnicode map says, for text the built in fonts cannot encode: Greek,
 * Cyrillic, a fullwidth `＠` and the `ﬁ` ligature. No font program is
 * embedded, so MuPDF draws with a substitute; extraction reads the map.
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
      `/FontDescriptor ${descriptor} 0 R /DW 600 >>`,
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

/** The email addresses `detect-email.pdf` holds, by page, for the tests to name. */
export const DETECT_EMAIL = Object.freeze({
  running: Object.freeze([
    "jane.doe@example.com",
    "jane.doe@example.com",
    "sales@example.org",
    "support@example.net",
    "josé.müller@exämple.de",
  ]),
  scripts: Object.freeze([
    "δοκιμή@παράδειγμα.ελ",
    "пример@почта.рф",
    // NFKC: the fullwidth `＠` reads as `@`, and the `ﬁ` as `fi`.
    "info@example.com",
    "finance@example.com",
  ]),
  columns: Object.freeze(["left@example.com", "right@example.org"]),
  reversed: "שלום@דוגמה.ישראל",
});

/** The identity font's advance at 12pt, its `/DW` of 600 thousandths of an em. */
const IDENTITY_ADVANCE = 7.2;

/**
 * Spec 0005, AC-1, AC-3, AC-5, AC-6 and AC-7. Email addresses as a visitor's
 * documents hold them:
 *
 *  1. running text in Helvetica: an address, the same address again, one
 *     before a full stop, one after `mailto:`, one with accented letters, and
 *     a near miss written out in words;
 *  2. other scripts through the identity font: Greek, Cyrillic, an address
 *     written with a fullwidth `＠`, one set with the `ﬁ` ligature, and last a
 *     Hebrew address drawn right to left one positioned glyph at a time, in
 *     logical order, so extraction order runs against visual order. The
 *     identity font carries the Hebrew through its map, since no committed font
 *     holds a right to left script. It has to be a right to left script:
 *     MuPDF 1.28.1 keeps Hebrew glyphs drawn this way on one line, at bidi
 *     level 1, but puts each Latin glyph drawn backwards on a line of its own
 *     (measured), where no address can be found;
 *  3. two columns, one address in each, so each is its own text block.
 *
 * Three pages, within the free page cap, so the browser suite can open it.
 */
export function detectEmail() {
  const reversed = [...DETECT_EMAIL.reversed]
    .map((glyph, index) => {
      const hex = glyph.codePointAt(0).toString(16).padStart(4, "0");
      return `1 0 0 1 ${(400 - (index + 1) * IDENTITY_ADVANCE).toFixed(1)} 620 Tm <${hex}> Tj`;
    })
    .join(" ");

  return document(({ add }) => {
    const unicode = identityFont(add);
    return [
      {
        content:
          line("F1", 12, 72, 720, "Contact: jane.doe@example.com for the report.") +
          line(
            "F1",
            12,
            72,
            700,
            "Write to jane.doe@example.com again, or to sales@example.org.",
          ) +
          line("F1", 12, 72, 680, "Link: mailto:support@example.net") +
          line("F1", 12, 72, 660, "Berlin office: josé.müller@exämple.de today") +
          line("F1", 12, 72, 640, "Nothing here: user at example dot com") +
          line("F1", 12, 72, 620, "Keep this sentence exactly as it is"),
      },
      {
        fonts: `/U ${unicode} 0 R`,
        content:
          unicodeLine(12, 72, 720, "Ελλάδα: δοκιμή@παράδειγμα.ελ τώρα") +
          unicodeLine(12, 72, 700, "Россия: пример@почта.рф сегодня") +
          unicodeLine(12, 72, 680, "Fullwidth: info＠example.com here") +
          unicodeLine(12, 72, 660, "Ligature: ﬁnance@example.com here") +
          unicodeLine(12, 72, 640, "Drawn right to left below") +
          `BT /U 12 Tf ${reversed} ET\n` +
          unicodeLine(12, 72, 600, "Keep this line as it is"),
      },
      {
        content:
          line("F1", 11, 72, 720, "Left column opens here") +
          line("F1", 11, 72, 706, "Mail left@example.com today") +
          line("F1", 11, 72, 692, "Left column closes here") +
          line("F1", 11, 360, 720, "Right column opens here") +
          line("F1", 11, 360, 706, "Mail right@example.org today") +
          line("F1", 11, 360, 692, "Right column closes here"),
      },
    ];
  });
}

/** How many addresses `detect-many.pdf` holds: more than search's 500 cap. */
export const DETECT_MANY_COUNT = 600;

/** The address in `detect-many.pdf` at `index`, from 0. */
export function manyAddress(index) {
  return `m${String(index).padStart(3, "0")}@ex.io`;
}

/**
 * Spec 0005, AC-25. One page of 600 addresses, ten to a line in 5pt Courier,
 * so a detector that asked `search()` would lose a hundred of them to its 500
 * quad cap.
 */
export function detectMany() {
  const perLine = 10;
  let content = "";
  for (let row = 0; row < DETECT_MANY_COUNT / perLine; row += 1) {
    const addresses = Array.from({ length: perLine }, (_, column) =>
      manyAddress(row * perLine + column),
    );
    content += line("F2", 5, 40, 760 - row * 8, addresses.join("  "));
  }
  return document(() => [{ content }]);
}

/** The two addresses `detect-stamped.pdf` holds. */
export const DETECT_STAMPED = Object.freeze({
  stamped: "jane.doe@example.com",
  clear: "office@example.org",
});

/**
 * Spec 0007, AC-14. A run a tick can cause to be refused, reached through the
 * page: a large diagonal CONFIDENTIAL stamp, drawn as text as `watermark.pdf`
 * draws it, crosses one address, and a second address sits well clear of it.
 * Detection has no reason to block the stamped one, so it is ticked; removing
 * it would cut the stamp, so the run is refused with `redaction-overreach`.
 * Untick it, and a run over the clear one alone goes through.
 */
export function detectStamped() {
  const cos = Math.SQRT1_2;
  return document(() => [
    {
      content:
        `0.8 g BT /F1 72 Tf ${cos} ${cos} ${-cos} ${cos} 60 250 Tm (CONFIDENTIAL) Tj ET 0 g\n` +
        line("F1", 12, 72, 400, `Payee name ${DETECT_STAMPED.stamped} here`) +
        line("F1", 12, 72, 150, `Also write to ${DETECT_STAMPED.clear} today`),
    },
  ]);
}

/** How `detect-dense.pdf` is laid out: 50 pages of 22 staff rows. */
export const DETECT_DENSE_PAGES = 50;
export const DETECT_DENSE_PER_PAGE = 22;

const DENSE_FIRST = Object.freeze(
  "Alex Bea Cai Dana Eli Fay Gus Hana Ivo Jo Kit Lior Mae Nia Oli Pia Rex Sol Tam Uma".split(
    " ",
  ),
);
const DENSE_LAST = Object.freeze(
  "Abbot Bryce Chen Dunn Evans Ford Garcia Hughes Iqbal Jones Khan Lopez Moss Nowak Okafor Patel Quinn Reyes Shaw Tran".split(
    " ",
  ),
);

/**
 * The staff row `detect-dense.pdf` holds at `index`, from 0: an invented name,
 * an address at `example.com` and a number from Ofcom's drama range, then, past
 * its thousand numbers, the US one.
 */
export function denseRow(index) {
  const name = `${DENSE_FIRST[index % 20]} ${DENSE_LAST[Math.floor(index / 20) % 20]}`;
  const email = `staff.${String(index).padStart(4, "0")}@example.com`;
  const phone =
    index < 1000
      ? `020 7946 0${String(index).padStart(3, "0")}`
      : `(212) 555-01${String(index - 1000).padStart(2, "0")}`;
  return Object.freeze({ name, email, phone });
}

/**
 * Spec 0007, task 13. A 50 page staff directory, the paid cap's worth of a
 * dense document: 1,100 rows, each a name, an email address and a phone
 * number, so detection lists 2,200 matches, every one ticked by default. The
 * checklist's first render and a single tick are measured against it (AC-8).
 */
export function detectDense() {
  return document(() =>
    Array.from({ length: DETECT_DENSE_PAGES }, (_, page) => {
      let content = line("F1", 14, 72, 760, "Staff directory");
      for (let row = 0; row < DETECT_DENSE_PER_PAGE; row += 1) {
        const { name, email, phone } = denseRow(page * DETECT_DENSE_PER_PAGE + row);
        content += line("F1", 10, 72, 730 - row * 30, `${name}    ${email}    ${phone}`);
      }
      return { content };
    }),
  );
}

/**
 * The address `detect-unicode.pdf` holds. Its local part starts with U+20BB7
 * (𠮷, a character used in Japanese names) and U+2D800, both above U+FFFF.
 */
export const DETECT_UNICODE_EMAIL = "\u{20BB7}\u{2D800}.tanaka@example.jp";

/** Codes 0x80 and 0x81 name the two letters above U+FFFF, as UTF-16. */
const ABOVE_BMP_UNICODE = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-AboveBmp-UCS def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
2 beginbfchar
<80> <D842DFB7>
<81> <D876DC00>
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end
`;

/**
 * Spec 0005, AC-26. An address whose local part holds two letters above
 * U+FFFF, drawn through a ToUnicode map, since no committed font carries
 * them: codes 0x80 and 0x81 draw Helvetica's `A` and `B` (by `/Differences`,
 * so their widths are Helvetica's own) and the map names the two letters.
 * MuPDF.js 1.28.1's walker returns them as U+0BB7 and U+D800.
 */
export function detectUnicode() {
  return document(({ add }) => {
    const unicode = add(stream("", ABOVE_BMP_UNICODE));
    const font = add(
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica " +
        "/Encoding << /BaseEncoding /WinAnsiEncoding /Differences [128 /A /B] >> " +
        `/ToUnicode ${unicode} 0 R >>`,
    );
    return [
      {
        fonts: `/F5 ${font} 0 R`,
        content:
          line("F5", 12, 72, 720, "Staff directory") +
          `BT /F5 12 Tf 72 700 Td (Contact: \\200\\201.tanaka@example.jp today) Tj ET\n` +
          line("F5", 12, 72, 680, "Keep this sentence exactly as it is"),
      },
    ];
  });
}

/** The column of `detect-phone.pdf`: five numbers, one per line of one block. */
export const DETECT_PHONE_COLUMN = Object.freeze([
  "020 7946 0100",
  "020 7946 0101",
  "020 7946 0102",
  "020 7946 0103",
  "020 7946 0104",
]);

/** The numbers `detect-phone.pdf` holds side by side on one line each. */
export const DETECT_PHONE_SPACED = Object.freeze([
  "020 7946 0200",
  "020 7946 0201",
  "020 7946 0202",
]);
export const DETECT_PHONE_LISTED = Object.freeze([
  "020 7946 0300",
  "020 7946 0301",
  "020 7946 0302",
]);

/** The phone numbers `detect-phone.pdf` holds, as found, with their tick. */
export const DETECT_PHONE = Object.freeze([
  ["020 7946 0958", true],
  ["+44 20 7946 0958", true],
  ["(212) 555-0123", true],
  ["1-800-555-0199", true],
  ["00 44 20 7946 0012", true],
  ["020 7946 0321 ext. 123", true],
  ["(212) 123 4567", false],
  ["12345678901", false],
  ["12345678902", true],
  ["020 7946 0777", true],
  ...DETECT_PHONE_COLUMN.map((number) => [number, true]),
  ...DETECT_PHONE_SPACED.map((number) => [number, true]),
  ...DETECT_PHONE_LISTED.map((number) => [number, true]),
  ["020 7946 0400", true],
  ["(212) 555-0142", true],
]);

/**
 * Spec 0005, AC-2, AC-4, AC-6, AC-10 and AC-27. Phone numbers, and the things
 * that look like them:
 *
 *  - UK and US national numbers, international numbers with `+` and `00`, and
 *    an extension, each ticked;
 *  - a possible but not valid number, and a valid number written as bare
 *    digits, each unticked, then the same bare digits after `Tel:`, ticked;
 *  - a number wrapped across two lines of one block;
 *  - an invoice code, dates, UK postcodes and ZIP codes, none a phone number;
 *  - numbers side by side (AC-27): a column of five, one per line of one block
 *    (14 pt apart, as the wrapped number is, so the line join makes them one
 *    run), three on one line parted by single spaces, a comma and semicolon
 *    list, a call log line with a time before the number and a duration
 *    after it, and a US number beside a ZIP+4;
 *  - a dotted date starting with `0`, which the trunk rule alone would read as
 *    a UK number.
 */
export function detectPhone() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 740, "London office: 020 7946 0958 weekdays") +
        line("F1", 12, 72, 720, "From abroad: +44 20 7946 0958") +
        line("F1", 12, 72, 700, "New York: (212) 555-0123") +
        line("F1", 12, 72, 680, "Toll free: 1-800-555-0199") +
        line("F1", 12, 72, 660, "Dial 00 44 20 7946 0012 from abroad") +
        line("F1", 12, 72, 640, "Switchboard 020 7946 0321 ext. 123") +
        line("F1", 12, 72, 620, "Old number (212) 123 4567 no longer used") +
        line("F1", 12, 72, 600, "Order 12345678901 shipped") +
        line("F1", 12, 72, 580, "Tel: 12345678902") +
        line("F1", 12, 72, 560, "Out of hours call us on 020 7946") +
        line("F1", 12, 72, 546, "0777 and leave a message") +
        line("F1", 12, 72, 520, "Invoice INV-2026-000123 paid") +
        line("F1", 12, 72, 500, "Born 12/05/1980, signed 2026-09-27") +
        line("F1", 12, 72, 480, "Postcodes SW1A 1AA and EC1A 1BB") +
        line("F1", 12, 72, 460, "ZIP codes 90210 and 10001") +
        DETECT_PHONE_COLUMN.map((number, row) =>
          line("F1", 12, 72, 420 - row * 14, number),
        ).join("") +
        line("F1", 12, 72, 330, `Desk ${DETECT_PHONE_SPACED.join(" ")}`) +
        line(
          "F1",
          12,
          72,
          310,
          `Ring ${DETECT_PHONE_LISTED[0]}, ${DETECT_PHONE_LISTED[1]}; ${DETECT_PHONE_LISTED[2]}`,
        ) +
        line("F1", 12, 72, 290, "12:30 020 7946 0400 3 min") +
        line("F1", 12, 72, 270, "Ship to CA 90210-1234 (212) 555-0142") +
        line("F1", 12, 72, 250, "Born 05.12.1980 in Leeds"),
    },
  ]);
}

/**
 * The dates `detect-phone.pdf` holds. Spec 0005, INV-14: a numeric date is
 * never read as a phone number, so each is left for `date`, and each sits
 * within reach of "Born", so each is ticked.
 */
export const DETECT_PHONE_DATES = Object.freeze([
  ["12/05/1980", true],
  ["2026-09-27", true],
  ["05.12.1980", true],
]);

/**
 * The values each release 3 fixture holds, as found, in reading order, with
 * their tick. Spec 0005, AC-19 to AC-23 and AC-10. The last of each is the one
 * wrapped across two lines of one block, which the line join finds whole.
 */
export const DETECT_DATE = Object.freeze([
  ["27 September 2026", false],
  ["05.12.1980", true],
  ["12th of Sept. 1985", true],
  ["March 3, 2027", false],
  ["2026-09-27", false],
  ["09/30/2026", false],
  ["1 May 1990", true],
  // Spec 0005, AC-19 and INV-17 (update of 2026-10-10): two full dates joined
  // by a hyphen, a day range, a written date beside a dash, an ISO interval
  // with times, and an ISO date with its time after a birth word.
  ["01/05/2026", false],
  ["31/05/2026", false],
  ["3-5 June 2026", false],
  ["3 June 2026", false],
  ["2026-09-01", false],
  ["2026-09-30", false],
  ["1980-05-12", true],
  // Spec 0005, AC-19, AC-10 and INV-17 (second update of 2026-10-10): an
  // interval with clock times, a date of birth with a name after it and one
  // glued to its label, a spaced month first range, a day range before a
  // numeric date, an interval with an offset and a zone name, and a date
  // glued to a letter.
  ["27/09/2026", false],
  ["28/09/2026", false],
  ["12/05/1980", true],
  ["14.02.1991", true],
  ["June 5 - 7, 2026", false],
  ["7/6/2026", false],
  ["2026-10-05", false],
  ["2026-10-06", false],
  ["03.11.2026", false],
  // Spec 0005, AC-19, AC-10 and INV-17 (third update of 2026-10-11): a date
  // of birth with a footnote marker glued after it, a date label glued to a
  // date by a dot and directly, and an ISO date with a marker.
  ["12/05/1981", true],
  ["31.12.2027", false],
  ["27/09/2027", false],
  ["2027-09-28", false],
  ["27 September 2026", false],
]);

export const DETECT_CARD = Object.freeze([
  ["4111 1111 1111 1111", true],
  ["5555-5555-5555-4444", true],
  ["378282246310005", true],
  ["6011 1111 1111 1117", true],
  // Spec 0005, AC-28: a card beside other digits.
  ["5105105105105100", true],
  ["3714 496353 98431", true],
  ["3056 930902 5904", true],
  ["3530 1113 3330 0000", true],
  ["6011000990139424", true],
  ["3566002020360505", true],
  ["6200-0000-0000-0005", true],
  ["4222 2222 2222 2", true],
  // A window that passes by chance, which takes the first group of the
  // spaced Social Security number after it.
  ["3400 0000 0005 123", true],
  // Spec 0005, INV-15 (update of 2026-10-10): `2223 4000 0566 5566` passes
  // by chance, and the Visa test card after its first group is the real one,
  // so the row covers both.
  ["2223 4000 0566 5566 5556", true],
  // Spec 0005, AC-20 and INV-15 (third update of 2026-10-11): a card with a
  // footnote marker glued after it, listed unticked.
  ["5425 2334 3010 9903", false],
  ["4012 8888 8888 1881", true],
]);

/**
 * The rows of other kinds `detect-card.pdf` holds, in reading order. Spec
 * 0005, AC-3 and INV-16: the rest of the Social Security number the chance
 * card cuts into is its own row, ticked as the whole number was.
 */
export const DETECT_CARD_PIECES = Object.freeze([["us-ssn", "45 6789", true]]);

export const DETECT_IBAN = Object.freeze([
  ["GB82 WEST 1234 5698 7654 32", true],
  ["DE89370400440532013000", true],
  ["FR14 2004 1010 0505 0001 3M02 606", true],
  // Spec 0005, AC-21 and INV-17 (update of 2026-10-10): a footnote style `1`
  // and a currency code glued after an IBAN.
  ["IE29 AIBK 9311 5212 3456 78", true],
  ["ES9121000418450200051332", true],
  ["NL91 ABNA 0417 1643 00", true],
]);

export const DETECT_US_SSN = Object.freeze([
  ["123-45-6789", true],
  ["234 56 7890", true],
  ["345678901", true],
  // Spec 0005, AC-22 (third update of 2026-10-11): a number with a footnote
  // marker glued after it, listed unticked.
  ["178-05-1123", false],
  ["567 89 0123", true],
]);

export const DETECT_UK_NINO = Object.freeze([
  ["AB 12 34 56 C", true],
  ["ce123456d", true],
  ["PX123456", true],
  // Spec 0005, AC-23 and INV-17 (update of 2026-10-10): a number glued to
  // the next word is listed, unticked.
  ["KL123456B", false],
  ["JK 65 43 21 B", true],
]);

/**
 * Spec 0005, AC-19 and AC-10. Dates, written and numeric, each ticked only
 * after a birth word; the near misses a document is full of (a year alone, a
 * month and year, a day and month, a time, a date cut from a code, impossible
 * dates); two dates joined by a hyphen, a day range, a range across months, an
 * ISO interval with times and an ISO date with its time (INV-17, update of
 * 2026-10-10); an interval with clock times, a name after a date, a birth
 * word glued to a date, a spaced month first range, a day range before a
 * numeric date, an interval with an offset and a zone name, and a letter
 * after a date (INV-17, second update of 2026-10-10); a footnote marker after
 * a date of birth and after an ISO date, and a date label glued to a date by
 * a dot and directly (INV-17, third update of 2026-10-11), each marker drawn
 * as a plain glued `1`, as the IBAN fixture draws its footnote style digit;
 * and a written date wrapped across two lines of one block.
 */
export function detectDate() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 740, "Signed 27 September 2026 by both parties") +
        line("F1", 12, 72, 720, "Date of birth: 05.12.1980") +
        line("F1", 12, 72, 700, "DOB 12th of Sept. 1985 (verified)") +
        line("F1", 12, 72, 680, "Renewal due on March 3, 2027 at noon") +
        line("F1", 12, 72, 660, "Invoice dated 2026-09-27, paid 09/30/2026") +
        line("F1", 12, 72, 640, "Born on 1 May 1990 in Leeds") +
        line("F1", 12, 72, 620, "Since 2019, in September 2026, on 27 September") +
        line("F1", 12, 72, 600, "Meeting at 12:30 on Tuesday, ref INV-05.12.1980") +
        line("F1", 12, 72, 580, "Impossible 31.02.1980 and 31 April 2026") +
        line("F1", 12, 72, 560, "Leave 01/05/2026-31/05/2026 approved") +
        line("F1", 12, 72, 540, "Course 3-5 June 2026 in Leeds") +
        line("F1", 12, 72, 520, "Term 28 May-3 June 2026 agreed") +
        line(
          "F1",
          12,
          72,
          500,
          "Window 2026-09-01T00:00:00Z/2026-09-30T23:59:59Z logged",
        ) +
        line("F1", 12, 72, 480, "DOB 1980-05-12T00:00:00Z exported") +
        line("F1", 12, 72, 460, "Shift 27/09/2026 10:00-28/09/2026 11:00 booked") +
        line("F1", 12, 72, 440, "DOB 12/05/1980-Smith on file") +
        line("F1", 12, 72, 420, "D.O.B.14.02.1991 on file") +
        line("F1", 12, 72, 400, "Course June 5 - 7, 2026 in York") +
        line("F1", 12, 72, 380, "Exam 5-7/6/2026 sat") +
        line(
          "F1",
          12,
          72,
          360,
          "Logged 2026-10-05T10:00:00+0100-2026-10-06T09:00:00EST",
        ) +
        line("F1", 12, 72, 340, "Noted 03.11.2026a in the margin") +
        line("F1", 12, 72, 320, "Born 12/05/19811 per the register") +
        line("F1", 12, 72, 300, "Exp.31.12.2027 printed on the card") +
        line("F1", 12, 72, 280, "Issued27/09/2027 and logged 2027-09-281 later") +
        line("F1", 12, 72, 260, "The lease began on 27 September") +
        line("F1", 12, 72, 246, "2026 and runs for one year"),
    },
  ]);
}

/**
 * WinAnsiEncoding's en dash, byte 0x96. The fixture writer turns each
 * character into one byte, so the dash is written as the byte the font's
 * encoding gives it, and MuPDF reads it back as U+2013.
 */
const EN_DASH = "\x96";

/**
 * Spec 0005, AC-20 and AC-28. Test card numbers spaced, hyphenated and
 * unbroken, from every brand; a Luhn failure, a number no brand issues, and
 * two references a card is never cut from (eighteen unbroken digits, and
 * digits glued by hyphens); cards beside an expiry, a row number and another
 * card, typed against an expiry with a hyphen and with an en dash, and
 * spaced as a payment form prints one; a card that passes by chance and
 * cuts into a Social Security number; a number before a card that makes a
 * window pass by chance, which the card's row covers (INV-15, update of
 * 2026-10-10); a card with a footnote marker glued after it, drawn as a plain
 * `1` (INV-15, third update of 2026-10-11); and a card wrapped across two
 * lines of one block.
 */
export function detectCard() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 740, "Visa 4111 1111 1111 1111 on file") +
        line("F1", 12, 72, 720, "Mastercard 5555-5555-5555-4444 expires soon") +
        line("F1", 12, 72, 700, "Amex 378282246310005 for travel") +
        line("F1", 12, 72, 680, "Discover 6011 1111 1111 1117.") +
        line("F1", 12, 72, 660, "Order 4111 1111 1111 1112 failed") +
        line("F1", 12, 72, 640, "Account 1234 5678 9012 3456 has no brand") +
        line("F1", 12, 72, 620, "Reference 411111111111111112 is too long") +
        line("F1", 12, 72, 600, "Reference 4111-1111-1111-1111-12 is too long") +
        line("F1", 12, 72, 580, "Mastercard 5105105105105100 12/28 on file") +
        line("F1", 12, 72, 560, "Amex 3714 496353 98431 12/28 on file") +
        line("F1", 12, 72, 540, "Diners 3056 930902 5904 12/28 on file") +
        line("F1", 12, 72, 520, "1 3530 1113 3330 0000 JCB on file") +
        line("F1", 12, 72, 500, "Cards 6011000990139424 3566002020360505 on file") +
        line("F1", 12, 72, 480, "UnionPay 6200-0000-0000-0005 12/28 on file") +
        line("F1", 12, 72, 460, `Visa 4222 2222 2222 2${EN_DASH}12/28 on file`) +
        line("F1", 12, 72, 440, "Ref 3400 0000 0005 123 45 6789 on file") +
        line("F1", 12, 72, 420, "Ref 2223 4000 0566 5566 5556 on file") +
        line("F1", 12, 72, 400, "Mastercard 5425 2334 3010 99031 in the notes") +
        line("F1", 12, 72, 380, "Backup card 4012 8888") +
        line("F1", 12, 72, 366, "8888 1881 kept on file"),
    },
  ]);
}

/**
 * Spec 0005, AC-21. The published example IBANs for six countries, grouped,
 * unbroken and with letters inside; a wrong check, an unknown country and
 * lower case; an IBAN with a footnote style digit after it and one glued to a
 * currency code (INV-17, update of 2026-10-10); and a grouped IBAN wrapped
 * across two lines of one block.
 */
export function detectIban() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 740, "IBAN GB82 WEST 1234 5698 7654 32 for salary") +
        line("F1", 12, 72, 720, "Pay DE89370400440532013000 by Friday") +
        line("F1", 12, 72, 700, "Account FR14 2004 1010 0505 0001 3M02 606.") +
        line("F1", 12, 72, 680, "Typo GB82WEST12345698765433 rejected") +
        line("F1", 12, 72, 660, "Unknown XX82WEST12345698765432 country") +
        line("F1", 12, 72, 640, "Lower gb82west12345698765432 case") +
        line("F1", 12, 72, 620, "See IE29 AIBK 9311 5212 3456 781 above") +
        line("F1", 12, 72, 600, "Pay ES9121000418450200051332EUR today") +
        line("F1", 12, 72, 580, "Transfer to NL91 ABNA") +
        line("F1", 12, 72, 566, "0417 1643 00 today"),
    },
  ]);
}

/**
 * Spec 0005, AC-22. Social Security numbers hyphenated and spaced, a bare one
 * after an SSN phrase; a bare run with no SSN word and numbers the SSA never
 * issues; a number with a footnote marker glued after it, drawn as a plain
 * `1` (third update of 2026-10-11); and a spaced number wrapped across two
 * lines of one block.
 */
export function detectUsSsn() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 740, "SSN 123-45-6789 on file") +
        line("F1", 12, 72, 720, "Spouse 234 56 7890 listed") +
        line("F1", 12, 72, 700, "Social Security number: 345678901") +
        line("F1", 12, 72, 680, "Order 456789012 shipped") +
        line("F1", 12, 72, 660, "Never issued 666-12-3456, 900-12-3456 and 123-45-0000") +
        line("F1", 12, 72, 640, "SSN 178-05-11231 on the form") +
        line("F1", 12, 72, 620, "Applicant number 567 89") +
        line("F1", 12, 72, 606, "0123 confirmed"),
    },
  ]);
}

/**
 * Spec 0005, AC-23. National Insurance numbers spaced, in lower case and with
 * no suffix; HMRC's own example and prefixes it never issues; a number glued
 * to the next word, listed unticked (INV-17, update of 2026-10-10); and a
 * number wrapped across two lines of one block.
 */
export function detectUkNino() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 740, "NI number AB 12 34 56 C on payslip") +
        line("F1", 12, 72, 720, "Employee ce123456d joined") +
        line("F1", 12, 72, 700, "Ref PX123456 without suffix") +
        line("F1", 12, 72, 680, "Example QQ 12 34 56 C is never issued") +
        line("F1", 12, 72, 660, "Prefixes GB 12 34 56 A and TN123456B are never used") +
        line("F1", 12, 72, 640, "Codes DA123456A and AB1234567") +
        line("F1", 12, 72, 620, "Merged KL123456Bsigned here") +
        line("F1", 12, 72, 600, "His number is JK 65 43") +
        line("F1", 12, 72, 586, "21 B as printed"),
    },
  ]);
}

/** The addresses `detect-blocked.pdf` holds, by the reason each is blocked. */
export const DETECT_BLOCKED = Object.freeze({
  slanted: "slanted@example.com",
  overImage: "image@example.com",
  replaced: "dave@example.com",
  replacedGlyphs: "gave@example.com",
  hidden: "hidden@example.com",
  plain: "plain@example.com",
  wide: "wide@example.com",
  unequal: Object.freeze({
    said: "sales@example.com",
    drawn: "saxes@example.com",
    found: "es@example.com",
  }),
});

/**
 * Spec 0005, AC-8 and AC-9. A match the engine would refuse, for each reason
 * detection can see before anything is ticked, and the cases it cannot:
 *
 *  1. an address set at 30 degrees (`slanted-text`), and a level address over
 *     an 8 by 8 pixel image drawn 200 pt across at 30 degrees, which MuPDF
 *     would blank far past it (`image-overreach`);
 *  2. an address whose replacement text names a different one: the page draws
 *     `gave@…` and says `dave@…` (`replacement-text`, one row); glyphs of an
 *     address behind unrelated replacement text, found only with it ignored
 *     (`replacement-text`); and a plain address, the control;
 *  3. the recorded limit, twice. An address inside replacement text wider
 *     than it, whose glyphs equal the text, which MuPDF.js 1.28.1 cannot tell
 *     from a span that wraps exactly the match. And replacement text whose
 *     letters differ from the glyphs in width: the page draws `saxes@…` and
 *     says `sales@…`, MuPDF aligns the two by its own lights and reads
 *     `sal es@…` (measured), so detection finds `es@example.com`, whose
 *     glyphs equal its text inside its quads. Both are listed unblocked, and a
 *     run that ticks either is refused by the self check with
 *     `replacement-text`, never a leak. Pinned.
 *
 * Page 2 differs by one letter of the same width (`d` and `g` are both 556
 * thousandths of an em in Helvetica), so MuPDF maps the replacement text onto
 * the glyphs one for one and ordinary extraction finds the whole address.
 *
 * Three pages, within the free page cap.
 */
export function detectBlocked() {
  const turned = (degrees, [x, y], text) => {
    const angle = (degrees * Math.PI) / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return `BT /F1 12 Tf ${num(cos)} ${num(sin)} ${num(-sin)} ${num(cos)} ${x} ${y} Tm ${literal(text)} Tj ET
`;
  };
  const span = (actual, drawn) =>
    `/Span << /ActualText ${literal(actual)} >> BDC ${literal(drawn)} Tj EMC`;
  const { unequal } = DETECT_BLOCKED;

  return document(({ add }) => {
    const coarse = flatImage(add, 8, 0xc0);
    return [
      {
        resources: `/XObject << /Coarse ${coarse} 0 R >>`,
        content:
          turned(30, [100, 600], `Write to ${DETECT_BLOCKED.slanted} here`) +
          drawImage("Coarse", 200, 30, [300, 300]) +
          line("F1", 12, 240, 296, `Over ${DETECT_BLOCKED.overImage} here`),
      },
      {
        content:
          `BT /F1 12 Tf 72 700 Td ${literal("Contact: ")} Tj ` +
          `${span(DETECT_BLOCKED.replaced, DETECT_BLOCKED.replacedGlyphs)} ${literal(" today")} Tj ET
` +
          `BT /F1 12 Tf 72 660 Td ${literal("See ")} Tj ${span("Figure 1", DETECT_BLOCKED.hidden)} ET
` +
          line("F1", 12, 72, 620, `Plain: ${DETECT_BLOCKED.plain} here`),
      },
      {
        content:
          `BT /F1 12 Tf 72 700 Td ` +
          `${span(`Name: ${DETECT_BLOCKED.wide} value`, `Name: ${DETECT_BLOCKED.wide} value`)} ET
` +
          `BT /F1 12 Tf 72 660 Td ${literal("Write to ")} Tj ` +
          `${span(unequal.said, unequal.drawn)} ${literal(" today")} Tj ET
`,
      },
    ];
  });
}

/** What `detect-wraps.pdf` should list, and the one thing it must not. */
export const DETECT_WRAPS = Object.freeze({
  afterAt: "jane.doe@example.com",
  afterDot: "sales@example.org",
  bob: "smith@example.com",
  split: "split@example.com",
});

/**
 * Spec 0005, AC-4. Addresses wrapped onto the next line of their block, and
 * the joins that must not happen:
 *
 *  1. one address wrapped right after its `@`, one wrapped after a dot in its
 *     domain (both found, each with two quads), and "Call Bob." at a line's
 *     end with `smith@example.com` starting the next (found as
 *     `smith@example.com` alone, never `Bob.smith@…`);
 *  2. two columns, the left one ending `split@` and the right one starting
 *     `example.com`: two text blocks, so nothing is joined across them.
 */
export function detectWraps() {
  return document(() => [
    {
      content:
        line("F1", 12, 72, 720, "Please write to jane.doe@") +
        line("F1", 12, 72, 706, "example.com for any details") +
        line("F1", 12, 72, 692, "Orders go to sales@example.") +
        line("F1", 12, 72, 678, "org from Monday") +
        line("F1", 12, 72, 664, "Call Bob.") +
        line("F1", 12, 72, 650, "smith@example.com answers today"),
    },
    {
      content:
        line("F1", 11, 72, 720, "Left column opens here") +
        line("F1", 11, 72, 706, "Write to split@") +
        line("F1", 11, 360, 720, "example.com is where") +
        line("F1", 11, 360, 706, "the right column goes on"),
    },
  ]);
}

/**
 * What `sample-agreement.pdf` holds, in reading order, for the tests to name.
 * Every value is reserved: `example.com` for the addresses, Ofcom's London
 * drama range for the UK numbers, and `555-01xx` for the US one.
 */
export const SAMPLE_AGREEMENT = Object.freeze({
  emails: Object.freeze([
    "alex.morgan@example.com",
    "payroll@example.com",
    "hr@example.com",
    "legal@example.com",
  ]),
  phones: Object.freeze(["020 7946 0182", "020 7946 0347", "(212) 555-0147"]),
});

/**
 * Spec 0013, AC-12. Two pages of a fictional employment agreement, for the
 * home page's product shot (`scripts/make-brand.mjs`): four email addresses
 * and three phone numbers, every page readable and nothing blocked, so the
 * review opens with the all clear line and all seven ticked.
 *
 * It holds no date, card, IBAN or national number on purpose, so the shot shows
 * exactly the seven items spec 0013 describes, every one ticked: a contract's
 * own date is listed unticked by the `date` detector (spec 0005, AC-10).
 *
 * The UK numbers are both London drama numbers on purpose. Ofcom's drama
 * mobile range (`07700 900xxx`) is reserved too, but the phone metadata does
 * not call it a valid allocation, so the detector lists such a number unticked
 * and the review would not open with all seven ticked.
 */
export function sampleAgreement() {
  const [person, payroll, hr, legal] = SAMPLE_AGREEMENT.emails;
  const [direct, pay, us] = SAMPLE_AGREEMENT.phones;
  return document(() => [
    {
      content:
        line("F1", 20, 72, 730, "Employment Agreement") +
        line(
          "F1",
          11,
          72,
          700,
          "This agreement is made between Larkfield Studio Ltd (the Company)",
        ) +
        line(
          "F1",
          11,
          72,
          686,
          "and Alex Morgan (the Employee). Each keeps a signed copy.",
        ) +
        line("F1", 13, 72, 650, "1. Employee details") +
        line("F1", 11, 72, 628, "Name: Alex Morgan") +
        line("F1", 11, 72, 612, `Email: ${person}`) +
        line("F1", 11, 72, 596, `Phone: ${direct}`) +
        line("F1", 13, 72, 560, "2. Role") +
        line(
          "F1",
          11,
          72,
          538,
          "The Employee is employed as a Product Designer and reports to the Head of Design.",
        ) +
        line("F1", 13, 72, 502, "3. Pay") +
        line(
          "F1",
          11,
          72,
          480,
          `The salary is paid monthly. Questions about pay go to ${payroll}`,
        ) +
        line("F1", 11, 72, 464, `or ${pay}, Monday to Friday.`),
    },
    {
      content:
        line("F1", 13, 72, 730, "4. Leave") +
        line(
          "F1",
          11,
          72,
          708,
          `Holiday requests go to ${hr} at least two weeks ahead.`,
        ) +
        line("F1", 13, 72, 672, "5. Notices") +
        line("F1", 11, 72, 650, `Notices to the Company go to ${legal}. Its US office`) +
        line(
          "F1",
          11,
          72,
          634,
          `can be reached on ${us} for anything sent from the United States.`,
        ) +
        line("F1", 13, 72, 598, "6. Signatures") +
        line("F1", 11, 72, 576, "Signed for Larkfield Studio Ltd and by the Employee."),
    },
  ]);
}
