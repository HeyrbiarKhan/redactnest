import { describe, expect, it } from "vitest";

import { DATE_LABELS, detect, type Span } from "@/detect";
import { datePasses } from "@/detect/date";
import type { DetectorKind } from "@/worker/protocol";

/**
 * Main's rows, frozen. Spec 0015, INV-1 and INV-2, made a gate (feature 27).
 *
 * Spec 0015's whole safety argument is that the date detector's first scan
 * is the scan main ran before it, so every row main lists keeps its start,
 * end, kind and tick. Its build measured that against main's code (AC-15),
 * but a measurement only holds while someone reruns it. A word moved into
 * `DATE_LABELS`, or a change to `FIRST_PASS` or `digitAfter`, would change
 * main's rows and pass every other test. So the rows below are main's.
 *
 * Main here is d42464b, the merge before spec 0015. Each string's rows were
 * read once by running that commit's `src/detect` (`DETECTORS.date` and
 * `detect`) and written out as literals, never from the code under test.
 * Never regenerate them from the current code: they would then freeze
 * whatever it does, and the gate would hold nothing. A failure here means a
 * change reached main's rows; a new rule belongs in the second scan
 * (`SECOND_PASS`, `ADDED_DATE_LABELS`), so fix the change, never a literal.
 * A string may be added with rows read from d42464b's code.
 *
 * Each string is read as the find step hands it over, every code point NFKC
 * normalised on its own, so `¹` is the digit `1` (`src/engine/find.ts`).
 */

/** A row: its kind, its start in code points, its text and its tick. */
type MainRow = readonly [
  kind: DetectorKind,
  start: number,
  text: string,
  ticked: boolean,
];

interface MainRows {
  readonly text: string;
  /** What main's date detector listed, which the first scan must list exactly. */
  readonly dates: readonly MainRow[];
  /** What main's `detect` listed, every kind, which `detect` must still list. */
  readonly rows: readonly MainRow[];
}

const MAIN_ROWS: readonly MainRows[] = Object.freeze([
  // Today's forms, numeric and written.
  {
    text: "Born 12/05/1980 in Leeds",
    dates: [["date", 5, "12/05/1980", true]],
    rows: [["date", 5, "12/05/1980", true]],
  },
  {
    text: "Signed 2026-09-27 here",
    dates: [["date", 7, "2026-09-27", false]],
    rows: [["date", 7, "2026-09-27", false]],
  },
  {
    text: "On 27 September 2026 we met",
    dates: [["date", 3, "27 September 2026", false]],
    rows: [["date", 3, "27 September 2026", false]],
  },
  {
    text: "Seen 27th of Sep, 2026 and Sept. 27th, 2026 here",
    dates: [
      ["date", 5, "27th of Sep, 2026", false],
      ["date", 27, "Sept. 27th, 2026", false],
    ],
    rows: [
      ["date", 5, "27th of Sep, 2026", false],
      ["date", 27, "Sept. 27th, 2026", false],
    ],
  },
  {
    text: "Seen 3–5 June 2026 and June 5 - 7, 2026 here",
    dates: [
      ["date", 5, "3–5 June 2026", false],
      ["date", 23, "June 5 - 7, 2026", false],
    ],
    rows: [
      ["date", 5, "3–5 June 2026", false],
      ["date", 23, "June 5 - 7, 2026", false],
    ],
  },
  // The longest reach `WORD_REACH` must cover.
  {
    text: "Seen 12-15th May 2026 here",
    dates: [["date", 5, "12-15th May 2026", false]],
    rows: [["date", 5, "12-15th May 2026", false]],
  },
  {
    text: "Table 2 - 14 March 2026",
    dates: [["date", 10, "14 March 2026", false]],
    rows: [["date", 10, "14 March 2026", false]],
  },
  {
    text: "Born 05.12.80 in Leeds",
    dates: [["date", 5, "05.12.80", true]],
    rows: [["date", 5, "05.12.80", true]],
  },
  {
    text: "Logged 2012-01-02 08:00",
    dates: [["date", 7, "2012-01-02", false]],
    rows: [["date", 7, "2012-01-02", false]],
  },
  // A date read out of a longer code, and where a reading may start.
  {
    text: "Ref 2022/9/31 Oct 11, 1988",
    dates: [["date", 14, "Oct 11, 1988", false]],
    rows: [["date", 14, "Oct 11, 1988", false]],
  },
  {
    text: "5-7/6/2026",
    dates: [["date", 2, "7/6/2026", false]],
    rows: [["date", 2, "7/6/2026", false]],
  },
  { text: "REF-05.12.1980 and 1/05/12/1980", dates: [], rows: [] },
  // The joiner rule. Today's scan sees only today's forms beyond a joiner,
  // so a new form there cuts the date before it (`newFormsBeyondJoiner`).
  {
    text: "DOB 04-03-19660 - 2023-05-15-28-APR-55/21.11.69",
    dates: [
      ["date", 4, "04-03-1966", true],
      ["date", 23, "05-15-28", true],
      ["date", 39, "21.11.69", false],
    ],
    rows: [
      ["date", 4, "04-03-1966", true],
      ["date", 23, "05-15-28", true],
      ["date", 39, "21.11.69", false],
    ],
  },
  {
    text: "27-09-2026 10:00-12-10-2026",
    dates: [
      ["date", 0, "27-09-2026", false],
      ["date", 17, "12-10-2026", false],
    ],
    rows: [
      ["date", 0, "27-09-2026", false],
      ["date", 17, "12-10-2026", false],
    ],
  },
  {
    text: "Leave 2026-09-01-2026-09-30 ok",
    dates: [
      ["date", 6, "2026-09-01", false],
      ["date", 17, "2026-09-30", false],
    ],
    rows: [
      ["date", 6, "2026-09-01", false],
      ["date", 17, "2026-09-30", false],
    ],
  },
  { text: "Leave 2026-09-01-2026-9-30 ok", dates: [], rows: [] },
  { text: "Leave 05-12-1980-05-Jan-2026 ok", dates: [], rows: [] },
  // The labels. Today's scan reads `DATE_LABELS` alone.
  {
    text: "Date27/09/2026 and Exp.31.12.2026",
    dates: [
      ["date", 4, "27/09/2026", false],
      ["date", 23, "31.12.2026", false],
    ],
    rows: [
      ["date", 4, "27/09/2026", false],
      ["date", 23, "31.12.2026", false],
    ],
  },
  {
    text: "DOB27/09/1980 and Reborn27/09/1980",
    dates: [["date", 3, "27/09/1980", true]],
    rows: [["date", 3, "27/09/1980", true]],
  },
  {
    text: "Updated27/09/2026, Due-27/09/2026 and Toronto27/09/2026",
    dates: [],
    rows: [],
  },
  // The end rules. A digit of any script glued after a date, or after its
  // marker, makes it part of a longer number (`digitAfter`,
  // `scriptDigitEndsRow`); one ASCII digit after a four digit year is a
  // marker outside the row; its own separator and a digit cut it.
  {
    text: "Signed 27 September 2026¹ here",
    dates: [["date", 7, "27 September 2026", false]],
    rows: [["date", 7, "27 September 2026", false]],
  },
  {
    text: "Seen 27/09/2026¹ here",
    dates: [["date", 5, "27/09/2026", false]],
    rows: [["date", 5, "27/09/2026", false]],
  },
  { text: "Seen 27 September 2026١ here", dates: [], rows: [] },
  { text: "Seen 05.12.1980١ here", dates: [], rows: [] },
  { text: "Born 12/05/1980¹١", dates: [], rows: [] },
  {
    text: "Seen 12.05.1980.¹ and 12.05.1980.¹١ here",
    dates: [["date", 5, "12.05.1980", false]],
    rows: [["date", 5, "12.05.1980", false]],
  },
  {
    text: "Logged 2026-09-27¹² here",
    dates: [],
    rows: [["phone", 7, "2026-09-2712", true]],
  },
  {
    text: "Seen 2026-09-27-01 and 2026-09-27-1 here",
    dates: [],
    rows: [["phone", 5, "2026-09-27-01", true]],
  },
  { text: "Seen 05.12.801 here", dates: [], rows: [] },
  { text: "on 1 May 26 we", dates: [], rows: [] },
  {
    text: "27/09/20261/5",
    dates: [["date", 0, "27/09/2026", false]],
    rows: [["date", 0, "27/09/2026", false]],
  },
  {
    text: "27-09-20261-5",
    dates: [["date", 0, "27-09-2026", false]],
    rows: [["phone", 0, "27-09-20261-5", true]],
  },
  // Beside the other kinds, through `detect`: precedence, the pieces it
  // leaves, and spec 0014's rescue yielding to the first scan's dates.
  {
    text: "Call 020 7946 0958 or write to jane@example.com",
    dates: [],
    rows: [
      ["phone", 5, "020 7946 0958", true],
      ["email", 31, "jane@example.com", true],
    ],
  },
  {
    text: "05.12.1980 020 7946 0958",
    dates: [["date", 0, "05.12.1980", false]],
    rows: [
      ["date", 0, "05.12.1980", false],
      ["phone", 11, "020 7946 0958", true],
    ],
  },
  {
    text: "212 918 8665 1119 21 June 2014",
    dates: [["date", 18, "21 June 2014", false]],
    rows: [
      ["phone", 0, "212 918 8665", true],
      ["phone", 13, "1119", false],
      ["date", 18, "21 June 2014", false],
    ],
  },
  {
    text: "212 918 8665 1119 21. June 2014",
    dates: [],
    rows: [
      ["phone", 0, "212 918 8665", true],
      ["phone", 13, "1119 21", false],
    ],
  },
  {
    text: "+44 20 3149 6135 18/01/1992",
    dates: [["date", 17, "18/01/1992", false]],
    rows: [
      ["phone", 0, "+44 20 3149 6135", true],
      ["date", 17, "18/01/1992", false],
    ],
  },
  {
    text: "9346 212 555 0123 05.12.1980",
    dates: [["date", 18, "05.12.1980", false]],
    rows: [
      ["phone", 0, "9346 212 555", true],
      ["phone", 13, "0123", false],
      ["date", 18, "05.12.1980", false],
    ],
  },
  {
    text: "9346 212 555 0123 05-Jan-2026",
    dates: [],
    rows: [
      ["phone", 0, "9346 212 555", true],
      ["phone", 13, "0123", false],
    ],
  },
  {
    text: "Ref 23 60915 488, 9145 36006 2 1987.12.278",
    dates: [],
    rows: [
      ["phone", 4, "23 60915 488", false],
      ["phone", 18, "9145 36006 2", true],
      ["phone", 31, "1987.12.278", false],
    ],
  },
  {
    text: "Tel 2026-9-7 0123 ok",
    dates: [],
    rows: [["phone", 4, "2026-9-7 0123", true]],
  },
  {
    text: "Ref 20260927 12 x",
    dates: [],
    rows: [["phone", 4, "20260927 12", true]],
  },
  {
    text: "Tel 212 918 8665 20260927",
    dates: [],
    rows: [["phone", 4, "212 918 8665", true]],
  },
  {
    text: "212 918 8665 2026.09.27 x",
    dates: [],
    rows: [["phone", 0, "212 918 8665", true]],
  },
  {
    text: "Tel 020 7946 0958 DOB 27-Sep-1980",
    dates: [],
    rows: [["phone", 4, "020 7946 0958", true]],
  },
  {
    text: "Signed 05-Jan-2026 at 020 7946 0958 today",
    dates: [],
    rows: [["phone", 22, "020 7946 0958", true]],
  },
  {
    text: "Created27/09/2026 by 212 555 0123",
    dates: [],
    rows: [["phone", 21, "212 555 0123", true]],
  },
  {
    text: "2026-09-27 10:00-2026-09-28 11:00",
    dates: [
      ["date", 0, "2026-09-27", false],
      ["date", 17, "2026-09-28", false],
    ],
    rows: [
      ["date", 0, "2026-09-27", false],
      ["phone", 14, "00-2026-09-28 11", false],
    ],
  },
  {
    text: "DOB: 05.12.1980¹ 12 High Street",
    dates: [["date", 5, "05.12.1980", true]],
    rows: [["phone", 5, "05.12.19801 12", false]],
  },
  {
    text: "Born 12.05.1980.1 44 years",
    dates: [["date", 5, "12.05.1980", true]],
    rows: [["phone", 5, "12.05.1980.1 44", false]],
  },
  {
    text: "Born 25.05.804 282 246 9648",
    dates: [],
    rows: [["phone", 5, "25.05.804 282", true]],
  },
  {
    text: "Ref 78-1972-01-21 020 3114 8249",
    dates: [],
    rows: [
      ["phone", 4, "78-1972-01-21", true],
      ["phone", 18, "020 3114 8249", true],
    ],
  },
  {
    text: "Ref 00-2026-09-28-11 here",
    dates: [],
    rows: [["phone", 4, "00-2026-09-28-11", false]],
  },
  {
    text: "Box 2000 212 555 0123",
    dates: [],
    rows: [["phone", 9, "212 555 0123", true]],
  },
  {
    text: "212 526 5087 020 2208 1633 24",
    dates: [],
    rows: [
      ["phone", 0, "212 526 5087", true],
      ["phone", 13, "020", false],
      ["phone", 17, "2208 1633 24", true],
    ],
  },
  {
    text: "6293 6608 0005 7382 276 020 7946 0958",
    dates: [],
    rows: [
      ["card", 0, "6293 6608 0005 7382 276", true],
      ["phone", 24, "020", true],
      ["phone", 28, "7946 0958", false],
    ],
  },
  {
    text: "Card 4111 1111 1111 11111١",
    dates: [],
    rows: [["card", 5, "4111 1111 1111 1111", false]],
  },
  {
    text: "SSN 123-45-67891١",
    dates: [],
    rows: [["phone", 4, "123-45-67891١", true]],
  },
  {
    text: "123-45-6789 15/03/2026",
    dates: [["date", 12, "15/03/2026", false]],
    rows: [
      ["us-ssn", 0, "123-45-6789", true],
      ["phone", 12, "15", true],
      ["date", 14, "/03/2026", false],
    ],
  },
  {
    text: "Batch 20260927 SSN 123-45-6789 on file",
    dates: [],
    rows: [["us-ssn", 19, "123-45-6789", true]],
  },
  {
    text: "Born 1980.05.12 NI AB 12 34 56 C",
    dates: [],
    rows: [["uk-nino", 19, "AB 12 34 56 C", true]],
  },
  {
    text: "GB82 WEST 1234 5698 7654 32 15/03/2026",
    dates: [["date", 28, "15/03/2026", false]],
    rows: [
      ["iban", 0, "GB82 WEST 1234 5698 7654 32", true],
      ["date", 28, "15/03/2026", false],
    ],
  },
]);

/** The labels main's date detector read, which the first scan still reads alone. */
const MAIN_DATE_LABELS: readonly string[] = Object.freeze([
  "date",
  "dated",
  "dt",
  "exp",
  "expiry",
  "expires",
  "expired",
  "issued",
  "valid",
  "from",
  "to",
  "until",
  "on",
  "effective",
  "signed",
]);

/** A string as the find step hands it over: each code point NFKC normalised on its own. */
function asFound(text: string): string {
  return Array.from(text, (point) => point.normalize("NFKC")).join("");
}

/**
 * Each frozen row as the span it stands for, its text checked against the
 * string first, so a mistyped literal fails here rather than pinning nothing.
 */
function spans(text: string, rows: readonly MainRow[]): Span[] {
  const points = Array.from(text);
  return rows.map(([kind, start, row, ticked]) => {
    const end = start + Array.from(row).length;
    expect(points.slice(start, end).join(""), `the literal at ${start}`).toBe(row);
    return { kind, start, end, tickedByDefault: ticked };
  });
}

describe("main's rows, frozen (spec 0015, INV-1, INV-2)", () => {
  it.each(MAIN_ROWS)(
    "lists main's date rows exactly in the first scan: $text",
    (main) => {
      const text = asFound(main.text);
      expect(datePasses({ text, joins: [] }).first).toStrictEqual(
        spans(text, main.dates),
      );
    },
  );

  /**
   * Spec 0015, AC-15's three columns: no digit main puts in a row is left
   * without one, no ticked row loses its tick, and no row changes. All three
   * hold when every row main lists is listed exactly; the second scan may add
   * rows beside them, over positions no row of main's holds.
   */
  it.each(MAIN_ROWS)("keeps every row main lists through detect: $text", (main) => {
    const text = asFound(main.text);
    const found = detect({ text, joins: [] });
    for (const row of spans(text, main.rows)) {
      expect(found, `main's ${row.kind} row at ${row.start}`).toContainEqual(row);
    }
  });

  /**
   * The first scan reads `DATE_LABELS` alone, so a word moved in changes
   * main's rows (`Updated27/09/2026` above lists nothing in it). A new label
   * goes in `ADDED_DATE_LABELS`, which only the second scan reads (AC-8).
   */
  it("holds DATE_LABELS at main's words", () => {
    expect(DATE_LABELS).toEqual(MAIN_DATE_LABELS);
  });
});
