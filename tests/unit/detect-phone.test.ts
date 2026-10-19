import { Metadata, parsePhoneNumberFromString } from "libphonenumber-js/max";
import { describe, expect, it } from "vitest";

import {
  DETECTORS,
  EXTENSION_MARKERS,
  KEYWORD_REACH,
  MAX_PARSES_PER_GROUP,
  MAX_WINDOW_DIGITS,
  PHONE_READINGS,
  PHONE_REGIONS,
} from "@/detect";

/**
 * The phone detector, on plain strings. Spec 0005, AC-2, AC-10 and AC-27.
 *
 * Each case gives the text found and whether it starts ticked, since for phone
 * numbers the tick is the interesting half: nothing unsure is removed by
 * default, and nothing plausible is hidden.
 */

function found(text: string, joins: readonly number[] = []): [string, boolean][] {
  const points = Array.from(text);
  return DETECTORS.phone({ text, joins }).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

function texts(text: string, joins: readonly number[] = []): string[] {
  return found(text, joins).map(([number]) => number);
}

describe("numbers found and ticked (AC-2, AC-10)", () => {
  it.each([
    ["a UK national number", "Call 020 7946 0958 today", "020 7946 0958"],
    ["a UK number written internationally", "+44 20 7946 0958", "+44 20 7946 0958"],
    ["a 00 country prefix", "Dial 00 44 20 7946 0958", "00 44 20 7946 0958"],
    ["a 011 country prefix", "Dial 011 44 20 7946 0958", "011 44 20 7946 0958"],
    [
      "a Leeds number, whose 011x area is not a US prefix",
      "0113 496 0000",
      "0113 496 0000",
    ],
    ["a US number in brackets", "Office (212) 555-0123", "(212) 555-0123"],
    ["a US number with dots", "Office 212.555.0123", "212.555.0123"],
    ["a US number written internationally", "+1 212-555-0123", "+1 212-555-0123"],
    ["a trunk prefix in brackets", "Fax: +44 (0)20 7946 0958", "+44 (0)20 7946 0958"],
    [
      "a trunk prefix in brackets after 00",
      "0044 (0)20 7946 0958",
      "0044 (0)20 7946 0958",
    ],
    ["a space between the + and the code", "Call + 44 20 7946 0958", "+ 44 20 7946 0958"],
    ["a number glued by en dashes", "Call 020–7946–0958", "020–7946–0958"],
    ["a number glued by non breaking hyphens", "Call 020‑7946‑0958", "020‑7946‑0958"],
    [
      "a + country prefix with no separator at all",
      "Call +442079460958",
      "+442079460958",
    ],
    [
      "a 00 country prefix with no separator at all",
      "Dial 00442079460958",
      "00442079460958",
    ],
  ])("finds %s, ticked", (_what, text, number) => {
    expect(found(text)).toEqual([[number, true]]);
  });

  it("finds a number before a sentence's full stop", () => {
    expect(found("Call 020 7946 0958.")).toEqual([["020 7946 0958", true]]);
  });

  it("finds each occurrence of a repeated number", () => {
    expect(found("020 7946 0958 or 020 7946 0958")).toEqual([
      ["020 7946 0958", true],
      ["020 7946 0958", true],
    ]);
  });

  it("finds an international number once", () => {
    expect(found("+44 20 7946 0958")).toHaveLength(1);
  });

  it("counts offsets in code points after a letter above U+FFFF", () => {
    expect(DETECTORS.phone({ text: "\u{20BB7} 020 7946 0958", joins: [] })).toEqual([
      { kind: "phone", start: 2, end: 15, tickedByDefault: true },
    ]);
  });

  it("does not start a number against a letter", () => {
    expect(found("Tel020 7946 0958")).toEqual([]);
  });
});

/** *Detectors* step 7: a marker from `EXTENSION_MARKERS`, then 1 to 6 digits. */
describe("extensions", () => {
  it("keeps an extension written after a word marker in the match", () => {
    expect(found("Call 020 7946 0958 ext. 123 today")).toEqual([
      ["020 7946 0958 ext. 123", true],
    ]);
  });

  it.each([
    "020 7946 0958 ext 12",
    "020 7946 0958 ext. 12",
    "020 7946 0958 extn 12",
    "020 7946 0958 extension 12",
    "020 7946 0958 EXT. 12",
    "020 7946 0958ext.12",
    "020 7946 0958 x12",
    "020 7946 0958 X12",
    "020 7946 0958x12",
    "020 7946 0958 #12",
    "020 7946 0958#12",
  ])("keeps the extension in %s", (text) => {
    expect(found(`${text} today`)).toEqual([[text, true]]);
  });

  it("names every marker the rule reads", () => {
    expect(EXTENSION_MARKERS).toEqual(["ext", "ext.", "extn", "extension", "x", "#"]);
  });

  it("does not take digits parted from x by a space", () => {
    expect(texts("020 7946 0958 x 12")).toEqual(["020 7946 0958"]);
  });

  it("does not take more than six digits", () => {
    expect(texts("020 7946 0958 ext. 1234567")).toEqual(["020 7946 0958"]);
  });

  it("never reads a comma or a semicolon as a marker", () => {
    expect(texts("020 7946 0958, 123")).toEqual(["020 7946 0958"]);
    expect(texts("020 7946 0958; 123")).toEqual(["020 7946 0958"]);
  });

  it("does not take a digit of the next number as an extension (INV-13)", () => {
    expect(texts("020 7946 0958 ext. 020 7946 0321")).toEqual([
      "020 7946 0958",
      "020 7946 0321",
    ]);
  });

  /** A recorded tradeoff: two characters too many, never a number left behind. */
  it("takes a short token after x, as the spec records", () => {
    expect(texts("020 7946 0958 x2 monitors")).toEqual(["020 7946 0958 x2"]);
  });

  it("does not take extension digits that run into a letter", () => {
    expect(texts("020 7946 0958 ext. 12a")).toEqual(["020 7946 0958"]);
  });

  it("keeps the number alone when a marker has no digits after it", () => {
    expect(texts("020 7946 0958 ext. today")).toEqual(["020 7946 0958"]);
  });

  it("reads the tick from the number alone, never its extension", () => {
    expect(found("Order 12345678901 ext. 4")).toEqual([["12345678901 ext. 4", false]]);
  });
});

describe("numbers found and left unticked (AC-10)", () => {
  /** Possible, the right length for its region, but not a real number. */
  it("lists a possible but not valid number unticked", () => {
    expect(found("Office (212) 123 4567")).toEqual([["(212) 123 4567", false]]);
  });

  /** A valid US number, and an order number too. Validity alone never ticks. */
  it("lists a valid number written as bare digits unticked", () => {
    expect(found("Order 12345678901 shipped")).toEqual([["12345678901", false]]);
  });

  /** The trunk rule's national reading, bare: valid, but written like an ID. */
  it("lists a valid UK number written as bare digits unticked, and ticks it after a phone word", () => {
    expect(found("Ref 02079460958")).toEqual([["02079460958", false]]);
    expect(found("Tel 02079460958")).toEqual([["02079460958", true]]);
  });

  it.each(["Tel:", "tel", "Phone", "TELEPHONE", "mobile", "Mob.", "cell", "Fax", "call"])(
    "ticks the same digits after %s",
    (word) => {
      expect(found(`${word} 12345678901`)).toEqual([["12345678901", true]]);
    },
  );

  it("ticks them when the phone word ends exactly KEYWORD_REACH before", () => {
    const gap = " ".repeat(KEYWORD_REACH);
    expect(found(`Tel${gap}12345678901`)).toEqual([["12345678901", true]]);
    expect(found(`Tel ${gap}12345678901`)).toEqual([["12345678901", false]]);
  });

  it("does not read a phone word inside another word", () => {
    expect(found("Hotel 12345678901")).toEqual([["12345678901", false]]);
  });

  it("does not tick a number that is not valid, even after a phone word", () => {
    expect(found("Tel: (212) 123 4567")).toEqual([["(212) 123 4567", false]]);
  });
});

/** AC-27 and INV-13: one match per number, and none holds a neighbour's digit. */
describe("numbers side by side", () => {
  const LONDON = ["020 7946 0958", "020 7946 0321", "020 7946 0123"];

  it("finds each of a run separated by single spaces", () => {
    expect(found(LONDON.join(" "))).toEqual(LONDON.map((number) => [number, true]));
  });

  it("finds each of a column, one per line of one block", () => {
    const text = LONDON.join(" ");
    const joins = [LONDON[0].length, LONDON[0].length + 1 + LONDON[1].length];
    expect(texts(text, joins)).toEqual(LONDON);
  });

  it.each([
    ["a comma list", "020 7946 0958, 020 7946 0321", ["020 7946 0958", "020 7946 0321"]],
    [
      "a semicolon list",
      "020 7946 0958; 020 7946 0321",
      ["020 7946 0958", "020 7946 0321"],
    ],
    ["a call log line", "12:30 020 7946 0958 3 min", ["020 7946 0958"]],
    [
      "a stray digit between two numbers",
      "020 7946 0958 2 020 7946 0321",
      ["020 7946 0958", "020 7946 0321"],
    ],
    [
      "an international number beside a national one",
      "+44 20 7946 0958 020 7946 0321",
      ["+44 20 7946 0958", "020 7946 0321"],
    ],
    [
      "two bracketed US numbers",
      "(212) 555-0123 (212) 555-0147",
      ["(212) 555-0123", "(212) 555-0147"],
    ],
    ["a valid number after a digit group", "Box 2000 212 555 0123", ["212 555 0123"]],
    ["numbers split by a slash", "020 7946 0958/0959", ["020 7946 0958"]],
    ["a real number beside a ZIP+4", "CA 90210-1234 (212) 555-0123", ["(212) 555-0123"]],
    /** Step 1: a `+` anywhere but a run's start ends the run and starts a new one. */
    [
      "two international numbers",
      "+44 20 7946 0958 +44 20 7946 0321",
      ["+44 20 7946 0958", "+44 20 7946 0321"],
    ],
    [
      "two whole numbers split by a slash",
      "020 7946 0958/020 7946 0321",
      ["020 7946 0958", "020 7946 0321"],
    ],
    /** INV-14: the date unit is never in a window, and the number beside it is. */
    ["a full date beside a number", "05.12.1980 020 7946 0958", ["020 7946 0958"]],
  ])("finds exactly the numbers in %s", (_what, text, numbers) => {
    expect(texts(text)).toEqual(numbers);
  });

  /**
   * Step 6's second pass: valid windows are taken first, then the longest
   * possible window fills each stretch they left free, listed unticked.
   */
  it("fills the stretch a valid number leaves free with a possible one, unticked", () => {
    expect(found("(212) 123 4567 (212) 555-0123")).toEqual([
      ["(212) 123 4567", false],
      ["(212) 555-0123", true],
    ]);
  });

  /** Step 1: units part by 1 to 3 whitespace characters; a fourth ends the run. */
  it("joins units parted by up to three spaces, and no more", () => {
    expect(texts("Call 020   7946 0958")).toEqual(["020   7946 0958"]);
    expect(texts("Call 020    7946 0958")).toEqual([]);
  });
});

/**
 * Spec 0014, AC-1 and AC-2: after both choosing passes, a digit group they
 * leave stranded beside a valid row, which a valid window from that row
 * covers, is listed as a row of its own, unticked and marked `rescued`.
 *
 * `today` is what the detector listed before the rescue, written out as
 * literals rather than read from a copy of the old code: the rows not marked
 * `rescued` must equal it exactly, so every row today lists keeps its start,
 * end and tick, and the default never removes less than today (INV-1, INV-2).
 */
describe("the rescue of stranded digit groups (spec 0014, AC-1, AC-2)", () => {
  function rows(text: string, rescued: boolean): [string, boolean][] {
    const points = Array.from(text);
    return DETECTORS.phone({ text, joins: [] })
      .filter((span) => (span.rescued === true) === rescued)
      .map((span) => [points.slice(span.start, span.end).join(""), span.tickedByDefault]);
  }

  it.each<[string, [string, boolean][], [string, boolean][]]>([
    // A stray group before a number: the valid pass takes it with the
    // number's head, and today the number's last group has no row.
    ["9346 212 555 0123", [["9346 212 555", true]], [["0123", false]]],
    // An extension is read after a stretch as after any row.
    ["9346 212 555 0123 ext. 45", [["9346 212 555", true]], [["0123 ext. 45", false]]],
    // The possible pass takes `020` before the rescue runs, so the second
    // number keeps its own row: the pin on the rescue's place, last.
    [
      "0131 410 5214 020 2977 5777",
      [
        ["0131 410 5214", true],
        ["020 2977 5777", false],
      ],
      [],
    ],
    // A next number's first digits, left with no row today.
    [
      "212 526 5087 020 2208 1633 24",
      [
        ["212 526 5087", true],
        ["2208 1633 24", true],
      ],
      [["020", false]],
    ],
    [
      "212 555 0123 9346 415 234 5678",
      [
        ["212 555 0123", true],
        ["9346 415 234", true],
      ],
      [["5678", false]],
    ],
    // Through the phone detector alone; `detect.test.ts` holds what the card
    // leaves of it.
    [
      "6293 6608 0005 7382 276 020 7946 0958",
      [["7382 276 020", true]],
      [["7946 0958", false]],
    ],
    // The rescue lives in the phone detector, so a date's digits are rescued
    // here and the yield in `detect` gives them back (AC-15).
    ["212 918 8665 1119 21 June 2014", [["212 918 8665", true]], [["1119 21", false]]],
    ["+44 20 3149 6135 18/01/1992", [["+44 20 3149 6135", true]], [["18", false]]],
    // Nothing is stranded in any of these, so each lists exactly today's rows.
    ["Box 2000 212 555 0123", [["212 555 0123", true]], []],
    ["Ste 1 212 555 0123", [["1 212 555 0123", true]], []],
    [
      "020 7946 0958 020 7946 0321",
      [
        ["020 7946 0958", true],
        ["020 7946 0321", true],
      ],
      [],
    ],
    [
      "212 555 0123 212 555 0124",
      [
        ["212 555 0123", true],
        ["212 555 0124", true],
      ],
      [],
    ],
    // A row with a unit after it has no extension, and a stretch never starts
    // inside an extension's digits, which open the next run.
    [
      "212 555 0123 ext. 4567 212 555 0124",
      [
        ["212 555 0123 ext. 4567", true],
        ["212 555 0124", true],
      ],
      [],
    ],
  ])(
    "keeps today's rows in %s and lists each stretch unticked",
    (text, today, stretches) => {
      expect(rows(text, false)).toEqual(today);
      expect(rows(text, true)).toEqual(stretches);
    },
  );

  it("marks only a stretch as rescued, and never a row the two passes chose", () => {
    const spans = DETECTORS.phone({ text: "9346 212 555 0123", joins: [] });
    expect(spans).toStrictEqual([
      { kind: "phone", start: 0, end: 12, tickedByDefault: true },
      { kind: "phone", start: 13, end: 17, tickedByDefault: false, rescued: true },
    ]);
  });

  /**
   * A recorded miss (spec 0014, *Consequences*): the UK number here is only
   * possible, so a window starting at a stray group takes its head and the
   * rescue, which follows only valid windows, cannot reach `0001`.
   */
  it("leaves a number that is only possible cut as today", () => {
    expect(rows("01865 514994 0472 0117 853 0001", true)).toEqual([]);
  });
});

/** AC-2: a number is found however its digits are grouped. */
describe("every grouping kept", () => {
  it.each([
    "0 20 7946 0958",
    "02 0794 60958",
    "+33 (0)1 23 45 67 89",
    "0044 (0)20 7946 0958",
    "1 (800) 555-0199",
    "(212)555-0123",
  ])("finds %s", (number) => {
    expect(texts(`Call ${number} now`)).toEqual([number]);
  });
});

/** AC-2 and INV-14: the look alikes. */
describe("what is not a phone number", () => {
  it.each([
    ["an invoice code", "Invoice INV-2026-000123 paid"],
    ["a reference joined by a slash", "Ref AB/2026/000123"],
    ["a day first date", "Born 12/05/1980 in Leeds"],
    ["an ISO date", "Signed 2026-09-27 here"],
    ["a dashed date", "Due 12-05-1980 now"],
    ["a written date", "On 27 September 2026 we met"],
    ["UK postcodes", "SW1A 1AA, EC1A 1BB, M1 1AE, B33 8TH, DN55 1PT"],
    ["ZIP codes", "ZIP 90210, 10001 and 02134"],
    ["a ZIP+4 code", "Beverly Hills CA 90210-1234"],
    ["a Social Security shape", "SSN 123-45-6789"],
    ["a US local number", "Dial 555-0123"],
    ["bare 7 digit runs", "Ref 1234567 and 0123456"],
    ["bare 9 digit runs", "Ref 123456789 and 012345678"],
    ["a sort code", "Sort code 20-00-00"],
    ["times", "Open 12:30 to 14:45"],
    ["a timestamp", "Logged 2012-01-02 08:00"],
    ["an amount", "Total £1,234.56"],
    ["a page number", "Page 1 of 12"],
    ["a dotted date starting with 0", "Born 05.12.1980 in Leeds"],
    ["a dashed date starting with 0", "Born 05-12-1980 in Leeds"],
    ["another dotted date", "Signed 01.02.2003"],
    ["a dotted date with a one digit day", "Born 5.12.1980"],
    ["a date glued by en dashes", "Born 05–12–1980 in Leeds"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });
});

/**
 * Spec 0014, AC-3, upholding INV-14 for text with no raised glyph, as an OCR
 * layer hands a footnote marker over: a numeric date with one digit glued on
 * is a date unit, and a year first date inside a hyphen glued unit is a unit
 * of its own, so no window holds either. Each listed a phone row before.
 */
describe("dates inside a phone unit (spec 0014, AC-3)", () => {
  it.each([
    ["a dotted date with a marker", "DOB: 05.12.19801 12 High Street"],
    ["a year first date with a marker", "John Smith 1980-12-051 44"],
    ["a dotted date, a dot and a marker", "Born 12.05.1980.1 44 years"],
    ["a dashed date with a marker before a digit", "27-09-20261 5"],
    ["a dotted date with a marker after a page number", "Page 3 05.12.19801"],
    // The two digit year, mirrored from the date detector's tolerance (AC-9).
    ["a dashed date with a two digit year and a marker", "Born 05-12-801 2345 x"],
    ["a dotted date with a two digit year, a dot and a marker", "Born 05.12.80.1 2345 x"],
    // The year first date is cut out on both sides.
    ["an ISO interval with plain times", "2026-09-27 10:00-2026-09-28 11:00"],
    ["a year first date inside a hyphen glued code", "Ref 00-2026-09-28-11 here"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  it.each<[string, [string, boolean][]]>([
    // No four digit group, so nothing is cut.
    ["01-02-03-04-05", [["01-02-03-04-05", false]]],
    // The date opens its unit with nothing cut before it, so it keeps its row.
    ["2026-09-27-01", [["2026-09-27-01", true]]],
  ])("keeps the row in %s", (text, rows) => {
    expect(found(text)).toEqual(rows);
  });
});

/** *Detectors* step 4: the table, and the bounds it sets. */
describe("PHONE_READINGS", () => {
  it("names only the regions in PHONE_REGIONS", () => {
    const named = PHONE_READINGS.flatMap((row) => (row.region ? [row.region] : []));
    expect(new Set(named)).toEqual(new Set(PHONE_REGIONS));
    expect(PHONE_REGIONS).toEqual(["GB", "US"]);
  });

  it("never gives one start two readings at one digit count", () => {
    for (const lead of PHONE_READINGS) {
      for (const prefix of lead.starts) {
        for (let count = 1; count <= MAX_WINDOW_DIGITS; count += 1) {
          const readings = PHONE_READINGS.filter(
            (row) =>
              (row.written === "+") === (lead.written === "+") &&
              row.counts.has(count) &&
              row.starts.some((start) => prefix.startsWith(start)),
          );
          expect(readings.length, `${prefix} at ${count}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("sets a window's cap at 18 digits and a start's cost at 10 parses", () => {
    expect(MAX_WINDOW_DIGITS).toBe(18);
    expect(MAX_PARSES_PER_GROUP).toBe(10);
  });
});

/**
 * The pins. The detector leans on these answers from libphonenumber-js, and
 * `PHONE_READINGS` is written from its metadata, so an upgrade that moves any
 * of them fails here rather than quietly changing what is found.
 */
describe("libphonenumber-js, as the detector relies on it", () => {
  it("still reads a number of the right length that is not real as possible, not valid", () => {
    const number = parsePhoneNumberFromString("2121234567", {
      defaultCountry: "US",
      extract: false,
    });

    expect(number?.isPossible()).toBe(true);
    expect(number?.isValid()).toBe(false);
  });

  it.each([
    ["GB", [7, 9, 10], "00"],
    ["US", [10], "011"],
  ] as const)(
    "still gives %s the national lengths and international prefix the readings use",
    (region, lengths, prefix) => {
      const metadata = new Metadata();
      metadata.selectNumberingPlan(region);

      expect(metadata.numberingPlan?.possibleLengths()).toEqual(lengths);
      expect(metadata.numberingPlan?.IDDPrefix()).toBe(prefix);
    },
  );
});

/**
 * The recorded limit on digits other than ASCII (spec 0005, *Consequences*
 * and Follow-up). Every row of `PHONE_READINGS` but `+` tests its prefix as
 * ASCII digits, so a national number in Arabic Indic digits gets no reading,
 * while one written with `+` is parsed, and libphonenumber-js reads those
 * digits. Devanagari it does not read either way. Pinned so a change to the
 * readings or to the library's digit handling is noticed.
 */
describe("digits other than ASCII", () => {
  it("finds no national number written in Arabic Indic digits", () => {
    expect(found("Call ٠٢٠ ٧٩٤٦ ٠٩٥٨ today")).toEqual([]);
  });

  it("finds an international number written in Arabic Indic digits, ticked", () => {
    expect(found("Call +٤٤ ٢٠ ٧٩٤٦ ٠٩٥٨ today")).toEqual([["+٤٤ ٢٠ ٧٩٤٦ ٠٩٥٨", true]]);
  });

  it("finds no number written in Devanagari digits, even with a +", () => {
    expect(found("Call +४४ २० ७९४६ ०९५८ today")).toEqual([]);
  });
});
