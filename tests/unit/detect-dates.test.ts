import { describe, expect, it } from "vitest";

import { BIRTH_WORDS, detect, DETECTORS, KEYWORD_REACH, MONTHS } from "@/detect";
import { isNumericDate } from "@/detect/dates";

/**
 * Dates. Spec 0005, AC-19, AC-10 and INV-14, *Detectors* (`date`).
 *
 * First `isNumericDate`, the one predicate the phone detector and the `date`
 * detector share for the numeric forms, then the `date` detector itself on
 * plain strings: every form it reads, the near misses it must not, where a
 * date may not be cut from, and the birth word tick.
 */

/** Each date found, as its text and whether it starts ticked. */
function found(text: string): [string, boolean][] {
  const points = Array.from(text);
  return DETECTORS.date({ text, joins: [] }).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

function texts(text: string): string[] {
  return found(text).map(([date]) => date);
}

/** Every row `detect` gives, as its kind, its text and its tick. */
function detected(text: string): [string, string, boolean][] {
  const points = Array.from(text);
  return detect({ text, joins: [] }).map((span) => [
    span.kind,
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

describe("isNumericDate", () => {
  it.each([
    ["day first with dots", "27.09.2026"],
    ["day first with slashes", "27/09/2026"],
    ["day first with hyphens", "27-09-2026"],
    ["month first", "09/27/2026"],
    ["a leading 0", "05.12.1980"],
    ["a one digit day", "5.12.1980"],
    ["one digit day and month", "5/6/1980"],
    ["a two digit year", "05.12.80"],
    ["a two digit year with slashes", "12/05/19"],
    ["year first with hyphens", "2026-09-27"],
    ["year first with slashes", "2026/09/27"],
    ["the first year", "01.01.1900"],
    ["the last year", "31.12.2099"],
    ["a leap day", "29.02.2024"],
    ["a leap day in 2000", "29.02.2000"],
    ["a leap day with a two digit year", "29.02.24"],
    ["an en dash for the hyphen", "05\u201312\u20131980"],
    ["a minus sign for the hyphen", "05\u221212\u22121980"],
  ])("accepts %s", (_what, text) => {
    expect(isNumericDate(text)).toBe(true);
  });

  it.each([
    ["the 31st of February", "31.02.1980"],
    ["a 13th month either way", "13.13.1980"],
    ["a year before 1900", "01.01.1899"],
    ["a year after 2099", "01.01.2100"],
    ["a leap day in a common year", "29.02.2023"],
    ["a leap day in 1900", "29.02.1900"],
    ["a day of 0", "00.12.1980"],
    ["two different separators", "05.12-1980"],
    ["a three digit year", "05.12.198"],
    ["a month and year only", "12/2026"],
    ["year first with dots", "2026.09.27"],
    ["year first with one digit month", "2026-9-27"],
    ["year first, impossible", "2026-02-30"],
    ["a time", "12:30"],
    ["digits only", "05121980"],
    ["a phone number's groups", "020-7946-0958"],
    ["too long", "05.12.19800"],
    ["empty", ""],
  ])("rejects %s", (_what, text) => {
    expect(isNumericDate(text)).toBe(false);
  });
});

describe("the date detector's forms (AC-19)", () => {
  it.each([
    ["day first with dots", "27.09.2026"],
    ["month first with slashes", "09/27/2026"],
    ["a two digit year", "05/12/80"],
    ["year first ISO", "2026-09-27"],
    ["year first with slashes", "2026/09/27"],
    ["en dashes for hyphens", "27–09–2026"],
    ["a full month name, day first", "27 September 2026"],
    ["an ordinal and of", "27th of September 2026"],
    ["an ordinal, of and an abbreviation with a full stop", "27th of Sept. 2026"],
    ["an abbreviation with a full stop", "27 Sept. 2026"],
    ["a three letter abbreviation", "1 Dec 2026"],
    ["a comma before the year, day first", "1 May, 2026"],
    ["month first with a comma", "September 27, 2026"],
    ["month first with no comma", "Sep 27 2026"],
    ["month first with every option", "Sept. 27th, 2026"],
    ["capitals", "27 SEPTEMBER 2026"],
    ["lower case", "september 27, 2026"],
    ["a 1st", "1st May 2026"],
    ["a 2nd", "2nd May 2026"],
    ["a 3rd", "3rd May 2026"],
    ["a leap day, written", "29 February 2024"],
    ["the first year", "1 January 1900"],
    ["the last year", "31 December 2099"],
    ["two spaces where the line was set wide", "27  September  2026"],
  ])("finds %s", (_what, date) => {
    expect(texts(`Signed ${date} here`)).toEqual([date]);
  });

  it("reads every month, full and as three letters, and Sept", () => {
    // Twelve names and twelve abbreviations, one of them `may` for both, and `sept`.
    expect(MONTHS.size).toBe(24);
    for (const [name, month] of MONTHS) {
      const day = month === 2 ? 28 : 30;
      expect(texts(`on ${day} ${name} 2026`)).toEqual([`${day} ${name} 2026`]);
    }
  });

  it("finds a date before a sentence's full stop, without the stop", () => {
    expect(texts("It was signed on 05.12.1980.")).toEqual(["05.12.1980"]);
    expect(texts("It was signed on 5 December 1980.")).toEqual(["5 December 1980"]);
  });

  it("finds a date across a line join, which reads as one space", () => {
    const text = "Signed 27 September 2026 here";
    expect(
      DETECTORS.date({ text, joins: [9] }).map((span) => [span.start, span.end]),
    ).toEqual([[7, 24]]);
  });

  it("finds each of several dates in a row", () => {
    expect(texts("From 1 May 2026 to 05.06.2026, then June 7, 2026")).toEqual([
      "1 May 2026",
      "05.06.2026",
      "June 7, 2026",
    ]);
  });
});

describe("what the date detector does not read as a date (AC-19)", () => {
  it.each([
    ["a year alone", "in 2026 we"],
    ["a month and year", "in September 2026 we"],
    ["a day and month", "on 27 September we"],
    ["a month and day", "on September 27 we"],
    ["a time", "at 12:30 we"],
    ["a relative date", "yesterday and next Tuesday"],
    ["an impossible numeric date", "on 31.02.1980 we"],
    ["an impossible written date", "on 31 April 2026 we"],
    ["a leap day in a common year", "on 29 February 2023 we"],
    ["a year before 1900, written", "on 1 May 1899 we"],
    ["a year after 2099, written", "on 1 May 2100 we"],
    ["a two digit year, written", "on 1 May 26 we"],
    ["a full stop after a full month name", "on 1 September. 2026 we"],
    ["a word that only starts like a month", "on 1 Mayday 2026 we"],
    ["a word that is not a month", "on 1 Smarch 2026 we"],
    ["a three digit day", "on 127 May 2026 we"],
    ["a day of 0, written", "on 0 May 2026 we"],
    ["a five digit year", "on 1 May 20261 we"],
    ["a five digit year, numeric", "on 05.12.19801 we"],
    // The detector reads at most three whitespace characters between parts.
    ["four spaces between parts, day first", "on 27    September 2026 we"],
    ["four spaces between parts, month first", "on September    27, 2026 we"],
    ["mixed separators", "on 05.12-1980 we"],
    ["a numeric date with spaces", "on 05 12 1980 we"],
    ["digits only", "on 05121980 we"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });
});

describe("a date is never cut from a longer code", () => {
  it.each([
    ["a letter before", "REF05.12.1980"],
    ["a hyphen and a letter before", "REF-05.12.1980"],
    ["a slash and a digit before", "1/05/12/1980"],
    ["a fourth group after", "05.12.1980.17"],
    ["a hyphen and a digit after", "2026-09-27-01"],
    ["a letter before a written date", "x27 September 2026"],
    ["a letter before a month", "xSeptember 27, 2026"],
    ["a digit after the year", "27 September 20261"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  /**
   * A letter after a date is no longer code (INV-17, second update of
   * 2026-10-10): the date is listed alone, unticked, for the visitor to judge.
   */
  it.each([
    ["a letter after", "05.12.1980a", "05.12.1980"],
    ["a letter after the year", "27 September 2026AD", "27 September 2026"],
  ])("finds the date alone with %s", (_what, text, date) => {
    expect(found(text)).toEqual([[date, false]]);
  });

  it("finds an ISO date joined to a time, without the time", () => {
    expect(texts("2026-09-27T10:00")).toEqual(["2026-09-27"]);
  });

  it("still finds a date after a hyphen or slash with a space before it", () => {
    expect(texts("Dates - 05.12.1980 / 06.12.1980")).toEqual([
      "05.12.1980",
      "06.12.1980",
    ]);
  });
});

/**
 * Spec 0005, AC-19 and INV-17, as amended on 2026-10-10: a boundary rule
 * drops a date only where it would be read out of a longer code.
 */
describe("date ranges and times (AC-19, INV-17)", () => {
  it.each([
    ["a hyphen", "01/05/1980-31/05/1980", ["01/05/1980", "31/05/1980"]],
    ["an en dash", "01/05/1980–31/05/1980", ["01/05/1980", "31/05/1980"]],
    [
      "a hyphen between dotted dates",
      "05.12.1980-10.12.1980",
      ["05.12.1980", "10.12.1980"],
    ],
    ["a slash between ISO dates", "2026-09-01/2026-09-30", ["2026-09-01", "2026-09-30"]],
    ["a hyphen between ISO dates", "2026-09-01-2026-09-30", ["2026-09-01", "2026-09-30"]],
    [
      "a hyphen between written dates",
      "1 May 2026-31 May 2026",
      ["1 May 2026", "31 May 2026"],
    ],
    [
      "a hyphen before a written date",
      "05/12/1980-3 June 2026",
      ["05/12/1980", "3 June 2026"],
    ],
    // Each joiner the scenario names (`-`, an en dash, `/`) for each of
    // AC-19's ranges, beside the cases above.
    [
      "a slash between slashed dates",
      "01/05/1980/31/05/1980",
      ["01/05/1980", "31/05/1980"],
    ],
    [
      "an en dash between dotted dates",
      "05.12.1980–10.12.1980",
      ["05.12.1980", "10.12.1980"],
    ],
    [
      "a slash between dotted dates",
      "05.12.1980/10.12.1980",
      ["05.12.1980", "10.12.1980"],
    ],
    [
      "an en dash between ISO dates",
      "2026-09-01–2026-09-30",
      ["2026-09-01", "2026-09-30"],
    ],
    [
      "an en dash between written dates",
      "1 May 2026–31 May 2026",
      ["1 May 2026", "31 May 2026"],
    ],
    [
      "a slash between written dates",
      "1 May 2026/31 May 2026",
      ["1 May 2026", "31 May 2026"],
    ],
    // The start check sees the written date's end just as a numeric one's.
    [
      "a hyphen after a written date",
      "1 May 2026-31/05/2026",
      ["1 May 2026", "31/05/2026"],
    ],
  ])("finds both of two full dates joined by %s", (_what, text, dates) => {
    expect(texts(`Leave ${text} approved`)).toEqual(dates);
  });

  /**
   * A joiner is one hyphen or one `/`, never `.` (*Detectors*, `date`). So a
   * dot between two dotted dates is their own separator running on, and
   * neither is found; between two ISO dates it is not their own separator,
   * which never cuts, so both are.
   */
  it.each([
    ["05.12.1980.10.12.1980", []],
    ["2026-09-01.2026-09-30", ["2026-09-01", "2026-09-30"]],
  ])(
    "never joins at a dot, which cuts only dates it is the own separator of: %s",
    (text, dates) => {
      expect(texts(`Leave ${text} approved`)).toEqual(dates);
    },
  );

  /**
   * With no 31 February beyond the hyphen, the second is no date. The first is
   * not cut, since a hyphen is not its own separator (`/`), so it is listed
   * whatever follows it (INV-17, second update of 2026-10-10).
   */
  it("finds the first date where a joiner leads to an impossible one", () => {
    expect(found("Leave 01/05/1980-31/02/1980 approved")).toEqual([
      ["01/05/1980", false],
    ]);
  });

  it.each([
    "3–5 June 2026",
    "3-5 June 2026",
    "3−5 June 2026",
    "3rd-5th of June 2026",
    "3rd–5th of June 2026",
    "3-5th June 2026",
    "June 3–5, 2026",
    "June 3-5 2026",
    "June 3rd–5th, 2026",
    "3-5 of June 2026",
    // The days' order is not checked.
    "5-3 June 2026",
    // Both days are real in a leap year.
    "28-29 February 2024",
  ])("finds the day range %s as one row", (date) => {
    expect(texts(`Course ${date} in Leeds`)).toEqual([date]);
  });

  /** The second day is checked against the year too, as the first is. */
  it("finds no day range whose second day is a leap day in a common year", () => {
    expect(texts("Course 28-29 February 2023 in Leeds")).toEqual([]);
  });

  it("reads a range with spaces around its dash as the second day's date", () => {
    expect(texts("Course 3 - 5 June 2026 in Leeds")).toEqual(["5 June 2026"]);
  });

  it.each([
    ["no 31 June", "1-31 June 2026"],
    ["no 32 May", "1-32 May 2026"],
  ])("finds no day range with %s", (_what, text) => {
    expect(texts(`Course ${text} in Leeds`)).toEqual([]);
  });

  /**
   * The first day is no real day, so the range is no date; the second day
   * then reads as a written date beside a separator, which never drops one
   * (INV-17), and is listed unticked for the visitor to judge.
   */
  it("finds the second day's date where a range's first day is not real", () => {
    expect(found("Course 31-30 June 2026 in Leeds")).toEqual([["30 June 2026", false]]);
  });

  it.each([
    ["28 May-3 June 2026", "3 June 2026"],
    ["5 June–3 July 2026", "3 July 2026"],
    ["Dec 30-Jan 2, 2026", "Jan 2, 2026"],
    ["REF-27 September 2026", "27 September 2026"],
    ["27 September 2026-01", "27 September 2026"],
  ])("finds the written date beside a separator in %s", (text, date) => {
    expect(texts(`Term ${text} agreed`)).toEqual([date]);
  });

  it.each([
    ["2026-09-27T10:00:00Z", "2026-09-27"],
    ["1980-05-12T00:00:00+01:00", "1980-05-12"],
    ["2026-09-27t10:00", "2026-09-27"],
    ["2026/09/27T10:00", "2026/09/27"],
  ])("finds the year first date in %s without its time", (text, date) => {
    expect(texts(`Logged ${text} here`)).toEqual([date]);
  });

  /**
   * `TIME_LONGEST` bounds only how far back the joiner rule reads from a
   * joiner for the last date's end. The date itself is found whatever the
   * time after it holds.
   */
  it("finds the date before a time longer than the joiner rule reads", () => {
    expect(texts(`Logged 2026-09-27T10:00:00.${"0".repeat(50)}Z here`)).toEqual([
      "2026-09-27",
    ]);
  });

  it.each([
    "2026-09-01T00:00:00/2026-09-30T23:59:59",
    "2026-09-01T00:00:00Z/2026-09-30T23:59:59Z",
    "2026-09-01T00:00:00+01:00/2026-09-30",
    "2026-09-01T00:00-2026-09-30",
    "2026-09-01T00:00:00.000-05:00/2026-09-30",
  ])("finds both dates of the interval %s, each alone", (text) => {
    expect(texts(`Window ${text} logged`)).toEqual(["2026-09-01", "2026-09-30"]);
  });

  /**
   * A code lists only the dates the boundary rule leaves it (INV-17, second
   * update of 2026-10-10): none where one would be read out of it, and the
   * date alone, unticked, where only a letter, a time or a different
   * separator stands beside it.
   */
  it.each([
    ["REF-05.12.1980-06.12.1980", ["06.12.1980"]],
    ["2026-09-27-01", []],
    ["1/05/12/1980", []],
    ["05.12.1980.17", []],
    ["05.12.1980a", ["05.12.1980"]],
    ["05.12.1980T10:00", ["05.12.1980"]],
    ["2026-09-27Tuesday", ["2026-09-27"]],
    ["x27 September 2026", []],
    ["27 September 2026AD", ["27 September 2026"]],
  ])("lists only the dates beside or inside the code %s", (text, dates) => {
    expect(found(`Ref ${text} here`)).toEqual(dates.map((date) => [date, false]));
  });

  /**
   * A letter glued after a date no longer cuts it (INV-17, second update of
   * 2026-10-10), so the far date is listed too, as is the first, which sees a
   * full date beyond its hyphen.
   */
  it("finds both dates where the far one has a letter glued to it", () => {
    expect(texts("01/05/1980-31/05/1980x")).toEqual(["01/05/1980", "31/05/1980"]);
  });

  it("ticks each date of a range on its own (AC-10)", () => {
    expect(found("DOB 01/05/1980-31/05/1980")).toEqual([
      ["01/05/1980", true],
      ["31/05/1980", true],
    ]);
    expect(found("Leave 02/05/2026-31/05/2026")).toEqual([
      ["02/05/2026", false],
      ["31/05/2026", false],
    ]);
    expect(found("DOB 1980-05-12T00:00")).toEqual([["1980-05-12", true]]);
  });
});

describe("the date tick (AC-10)", () => {
  it("leaves a date unticked with no birth word before it", () => {
    expect(found("Signed 27 September 2026")).toEqual([["27 September 2026", false]]);
  });

  it.each(BIRTH_WORDS)("ticks a date after %s, in any case", (word) => {
    expect(found(`${word}: 05.12.1980`)).toEqual([["05.12.1980", true]]);
    expect(found(`${word.toUpperCase()} 5 December 1980`)).toEqual([
      ["5 December 1980", true],
    ]);
    expect(found(`${word.toLowerCase()} December 5, 1980`)).toEqual([
      ["December 5, 1980", true],
    ]);
  });

  it("ticks a date when the birth word ends exactly KEYWORD_REACH before", () => {
    const gap = " ".repeat(KEYWORD_REACH);
    expect(found(`DOB${gap}05.12.1980`)).toEqual([["05.12.1980", true]]);
    expect(found(`DOB ${gap}05.12.1980`)).toEqual([["05.12.1980", false]]);
  });

  it("does not read a birth word inside another word", () => {
    expect(found("Reborn 05.12.1980")).toEqual([["05.12.1980", false]]);
    expect(found("Stubborn 05.12.1980")).toEqual([["05.12.1980", false]]);
  });

  /**
   * The whole word test refuses a word with a digit right after it, so a
   * birth word glued to a date is asked for on its own (second update of
   * 2026-10-10).
   */
  it.each(BIRTH_WORDS)(
    "ticks a date glued to %s, directly or through one separator",
    (word) => {
      expect(found(`${word}27/09/1980`)).toEqual([["27/09/1980", true]]);
      expect(found(`${word}-12/05/1980`)).toEqual([["12/05/1980", true]]);
      expect(found(`${word}.12.05.1980`)).toEqual([["12.05.1980", true]]);
      expect(found(`${word.toUpperCase()}27 September 1980`)).toEqual([
        ["27 September 1980", true],
      ]);
    },
  );
});

/**
 * Spec 0005, AC-19, AC-10 and INV-17, as the second update of 2026-10-10
 * rewrote them: a full, real date is never dropped for what follows it or
 * what it is joined to. Only two rejections are kept, a letter before a date
 * or before its separator, and its own separator running on with a digit,
 * each lifted by a joiner with only a time since the last date listed, and by
 * a birth word glued to the date.
 */
describe("the general date boundary rule (AC-19, INV-17)", () => {
  /** A joiner parts two dates whatever time stands before it. */
  it.each([
    ["27/09/2026 10:00-28/09/2026 11:00", "27/09/2026", "28/09/2026"],
    ["27.09.2026 10:00-28.09.2026 11:00", "27.09.2026", "28.09.2026"],
    ["27-09-2026 10:00-12-10-2026 11:00", "27-09-2026", "12-10-2026"],
    ["27/09/2026, 10:00-28/09/2026", "27/09/2026", "28/09/2026"],
    ["27/09/2026 10-28/09/2026", "27/09/2026", "28/09/2026"],
    ["27/09/2026 at 10-28/09/2026", "27/09/2026", "28/09/2026"],
    ["2026-09-27 10:00-2026-09-28 11:00", "2026-09-27", "2026-09-28"],
    ["2026-09-27 10-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 at 10-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 @ 10:00-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 10h00-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 10:00-11:00-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 10:00 pm-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 10:00 PM EST-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 10:00 UTC+1-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27 10:00 GMT+01:00-2026-09-28", "2026-09-27", "2026-09-28"],
    ["27 September 2026 10:00-2026-09-28", "27 September 2026", "2026-09-28"],
    ["2026-09-01T00:00:00Z/2026-09-30T23:59:59Z", "2026-09-01", "2026-09-30"],
    ["2026-09-27T10:00:00+0100-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27T10:00:00+01-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27T10:00:00 Z-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27T10:00:00EST-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27T10:00:00,123456789012Z-2026-09-28", "2026-09-27", "2026-09-28"],
    ["2026-09-27T10:00:00.12345678901234567890Z/2026-09-28", "2026-09-27", "2026-09-28"],
  ])("finds both dates of the interval %s, each alone", (text, first, second) => {
    expect(found(`Booked ${text} here`)).toEqual([
      [first, false],
      [second, false],
    ]);
  });

  /** A date is listed whatever follows it; a birth word before it still ticks it. */
  it.each([
    ["DOB 12/05/1980-Smith", [["12/05/1980", true]]],
    ["DOB 12/05/1980Smith", [["12/05/1980", true]]],
    ["born 05.12.1980-London", [["05.12.1980", true]]],
    [
      "Mon 27/09/2026-Tue 28/09/2026",
      [
        ["27/09/2026", false],
        ["28/09/2026", false],
      ],
    ],
    ["05.12.1980a", [["05.12.1980", false]]],
    ["05.12.1980T10:00", [["05.12.1980", false]]],
    ["2026-09-27Tuesday", [["2026-09-27", false]]],
    ["27 September 2026AD", [["27 September 2026", false]]],
    ["05.12.1980-17", [["05.12.1980", false]]],
    ["2026-09-27/01", [["2026-09-27", false]]],
    ["2026-09-27-A1", [["2026-09-27", false]]],
    ["Fig 3/4/05a", [["3/4/05", false]]],
  ])("lists the date in %s, whatever follows it", (text, dates) => {
    expect(found(`Seen ${text} here`)).toEqual(dates);
  });

  /** A birth word glued to a date lifts every start rejection, and ticks it. */
  it.each([
    ["DOB27/09/1980", "27/09/1980"],
    ["DOB-12/05/1980", "12/05/1980"],
    ["D.O.B.12.05.1980", "12.05.1980"],
    ["Born-05.12.1980", "05.12.1980"],
    ["DOB27 September 1980", "27 September 1980"],
  ])("lists the date glued to a birth word in %s, ticked", (text, date) => {
    expect(found(`Patient ${text} here`)).toEqual([[date, true]]);
  });

  it.each(["Reborn27/09/1980", "Stubborn-05.12.1980"])(
    "reads no birth word inside another word: %s",
    (text) => {
      expect(found(`Patient ${text} here`)).toEqual([]);
    },
  );

  /**
   * Month first, the range's dash may be spaced; day first it may not, so a
   * heading's number is never read as a first day. A day range before a
   * numeric date leaves the numeric date alone.
   */
  it.each([
    ["June 5 - 7, 2026", [["June 5 - 7, 2026", false]]],
    ["June 5 -7, 2026", [["June 5 -7, 2026", false]]],
    ["June 5- 7, 2026", [["June 5- 7, 2026", false]]],
    ["June 5   -   7, 2026", [["June 5   -   7, 2026", false]]],
    ["June 5 – 7 2026", [["June 5 – 7 2026", false]]],
    ["3 - 5 June 2026", [["5 June 2026", false]]],
    ["Table 2 - 14 March 2026", [["14 March 2026", false]]],
    ["Item 12 - 5 June 2026", [["5 June 2026", false]]],
    ["5-7/6/2026", [["7/6/2026", false]]],
    ["DOB: 5-7/6/2026", [["7/6/2026", true]]],
  ])("reads the range in %s", (text, dates) => {
    expect(found(`Course ${text} here`)).toEqual(dates);
  });

  /** The second day is checked as the first is, spaces or not. */
  it("finds no spaced month first range whose second day is not real", () => {
    expect(found("Course June 5 - 31, 2026 here")).toEqual([]);
  });

  /** Each kept rejection, pinned by name, so widening one is noticed. */
  it.each([
    ["a letter glued before", "REF05.12.1980"],
    ["a letter before a hyphen", "REF-05.12.1980"],
    ["a letter before a hyphen, again", "INV-05.12.1980"],
    ["a letter before a slash", "INV/12/05/2026"],
    ["a name before a hyphen", "Smith-12/05/1980"],
    ["a file name", "report-27-09-2026-v2.pdf"],
    ["a URL path", "example.com/2026/09/27/slug"],
    ["its own slash and a digit before", "1/05/12/1980"],
    ["its own hyphen and a digit after", "2026-09-27-01"],
    ["its own dot and a digit after", "05.12.1980.17"],
    ["a letter glued before a written date", "x27 September 2026"],
    ["a digit glued after a written date", "27 September 20261"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  /**
   * Only a time lifts a rejection before a joiner: a word of six letters, a
   * stretch with no digit, and a time longer than `TIME_LONGEST` are not one,
   * so the second date stays cut while the first is listed.
   */
  it.each([
    ["01/05/1980 Smith-12/05/1980", "01/05/1980"],
    ["2026-09-27 10:00 Monday-2026-09-28", "2026-09-27"],
    ["2026-09-27 ref INV-2026-09-28", "2026-09-27"],
    [`2026-09-27T10:00:00.${"0".repeat(50)}Z/2026-09-28`, "2026-09-27"],
  ])("finds the first date only in %s", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });

  /**
   * Through `detect`, `phone` stands above `date`. A slashed interval leaves
   * no phone row, while in an ISO one with plain times the phone detector
   * reads `00-2026-09-28 11` and covers the second date: the phone
   * Follow-up's case, pinned so a change there is noticed.
   */
  it("gives the rows PRECEDENCE leaves through detect", () => {
    expect(detected("Shift 27/09/2026 10:00-28/09/2026 11:00 booked")).toEqual([
      ["date", "27/09/2026", false],
      ["date", "28/09/2026", false],
    ]);
    expect(detected("Shift 2026-09-27 10:00-2026-09-28 11:00 booked")).toEqual([
      ["date", "2026-09-27", false],
      ["phone", "00-2026-09-28 11", false],
    ]);
  });
});

/**
 * The edges of the general date boundary rule (spec 0005, second update of
 * 2026-10-10): each bound the rule names, held at its exact value, and the
 * parts of the rule the scenario's cases reach only once. A change to any of
 * these changes the rows a visitor sees, so it should be a decision, never a
 * side effect.
 */
describe("the general date boundary rule's edges (AC-19, AC-10, INV-7, INV-17)", () => {
  /**
   * Spec 0005, *Detectors* (`date`): the longest stretch a joiner sees across.
   * The source keeps it private; the spec fixes it at 40.
   */
  const TIME_LONGEST = 40;

  /** A time of exactly `length` code points: `T10:00:00.`, zeros, then `Z`. */
  function timeOf(length: number): string {
    return `T10:00:00.${"0".repeat(length - 11)}Z`;
  }

  /**
   * The stretch is counted from the last listed date's end up to the joiner.
   * The cap is there for INV-7, so it is held both ways: a time of exactly
   * `TIME_LONGEST` still parts the dates, one code point more does not.
   */
  it("parts two dates across a time of exactly TIME_LONGEST code points", () => {
    expect(texts(`Booked 2026-09-27${timeOf(TIME_LONGEST)}/2026-09-28 here`)).toEqual([
      "2026-09-27",
      "2026-09-28",
    ]);
  });

  it("does not part them across one code point more", () => {
    expect(texts(`Booked 2026-09-27${timeOf(TIME_LONGEST + 1)}/2026-09-28 here`)).toEqual(
      ["2026-09-27"],
    );
  });

  /**
   * A time holds runs of at most five letters (`TIME_LETTERS_MOST`), each run
   * counted on its own: five in a row still part the dates, six do not, and
   * two runs of three are two short runs, not one of six.
   */
  it.each([
    ["five letters in a row", "10:00 ABCDE", ["2026-09-27", "2026-09-28"]],
    ["six letters in a row", "10:00 ABCDEF", ["2026-09-27"]],
    ["two runs of three letters", "10:00 ABC DEF", ["2026-09-27", "2026-09-28"]],
  ])("reads a time holding %s", (_what, time, dates) => {
    expect(texts(`Booked 2026-09-27 ${time}-2026-09-28 here`)).toEqual(dates);
  });

  /**
   * A time is judged by its characters: at least one ASCII digit, and nothing
   * but digits, whitespace, `: . , + @`, hyphens and letters. A stretch whose
   * only digits are in another script, or one holding any other mark, is no
   * time, so the reference after it stays cut.
   */
  it.each([
    ["a time in Arabic Indic digits only", "2026-09-27 ١٠:٠٠-2026-09-28"],
    ["a number sign", "2026-09-27 #4 INV-2026-09-28"],
    ["a semicolon", "2026-09-27 10:00; 11-2026-09-28"],
  ])("finds the first date only after %s", (_what, text) => {
    expect(texts(`Invoice ${text} here`)).toEqual(["2026-09-27"]);
  });

  /**
   * Every joiner lifts a rejection after a time: each hyphen `HYPHEN` reads,
   * and the slash. Here the letter before it (`EST`) is what would cut.
   */
  it.each([
    ["a hyphen", "-"],
    ["the hyphen U+2010", "‐"],
    ["an en dash", "–"],
    ["an em dash", "—"],
    ["a minus sign", "−"],
    ["a slash", "/"],
  ])("finds both dates joined by %s after a zone name", (_what, joiner) => {
    expect(texts(`Booked 2026-09-27 10:00 EST${joiner}2026-09-28 here`)).toEqual([
      "2026-09-27",
      "2026-09-28",
    ]);
  });

  /**
   * Here the date's own separator after a digit is what would cut, and a
   * joiner of the same class lifts it, an en dash for a hyphen dated pair
   * included. A dot never joins, so after a time it still cuts.
   */
  it.each([
    ["27/09/2026 10:00/28/09/2026", ["27/09/2026", "28/09/2026"]],
    ["2026/09/27 10:00/2026/09/28", ["2026/09/27", "2026/09/28"]],
    ["27-09-2026 10:00–28-09-2026", ["27-09-2026", "28-09-2026"]],
    ["27.09.2026 10:00.28.09.2026", ["27.09.2026"]],
    ["2026-09-27 10:00 EST.2026-09-28", ["2026-09-27"]],
  ])("reads the joiner after a time in %s", (text, dates) => {
    expect(texts(`Booked ${text} here`)).toEqual(dates);
  });

  /**
   * The stretch is read back to the end of the last date listed, never to a
   * date the rule dropped, and with none listed nothing is lifted, so a time
   * alone before a joiner is no interval (`00-2026-09-28` under *Detectors*).
   * A separator of another class still never cuts. Each listed date moves the
   * mark on, so a chain of intervals lists every date.
   */
  it.each([
    ["a time with no date before it", "10:00-28-09-2026", []],
    ["a time with no date before an ISO date", "10:00-2026-09-28", []],
    ["a time before a slashed date", "10:00-28/09/2026", ["28/09/2026"]],
    ["a dropped date before the time", "REF-27-09-2026 10:00-28-09-2026", []],
    [
      "three intervals in a row",
      "2026-09-01 10:00-2026-09-02 11:00-2026-09-03 12:00",
      ["2026-09-01", "2026-09-02", "2026-09-03"],
    ],
  ])("reads the joiner rule from the last date listed: %s", (_what, text, dates) => {
    expect(texts(`Open ${text} here`)).toEqual(dates);
  });

  /**
   * A glued birth word is looked for in a window of the longest birth word and
   * one code point more, so even `date of birth` sees what touches its front:
   * a letter or digit there makes it part of another word, and the date stays
   * cut.
   */
  it.each(["xdate of birth27/09/1980", "xdate of birth-12/05/1980", "1DOB27/09/1980"])(
    "reads no glued birth word in %s",
    (text) => {
      expect(found(`Patient ${text} here`)).toEqual([]);
    },
  );

  /**
   * A numeric date's own separator is compared by class, so after an en dashed
   * date a plain hyphen and digits run on as its own separator would, while
   * after a dotted date they are a different separator, which never cuts.
   */
  it.each([
    ["05–12–1980-17", []],
    ["05.12.1980-17", ["05.12.1980"]],
  ])("compares the own separator by class in %s", (text, dates) => {
    expect(texts(`Ref ${text} here`)).toEqual(dates);
  });

  /**
   * At a date's end, a joiner lifts the own separator rule when any full date
   * this detector reads starts beyond it, a written one included, read with no
   * edge check of its own: the first date is listed whatever becomes of the
   * second. An impossible date beyond it is no date, so the rule still cuts.
   */
  it.each([
    ["05-12-1980-3 June 2026", ["05-12-1980", "3 June 2026"]],
    ["2026-09-01-30 September 2026", ["2026-09-01", "30 September 2026"]],
    ["05-12-1980-3 June 20261", ["05-12-1980"]],
    ["2026-09-01-2026-02-30", []],
  ])("reads the date beyond the joiner at the end of %s", (text, dates) => {
    expect(texts(`Leave ${text} approved`)).toEqual(dates);
  });

  /** A digit in any script glued to either end makes a longer number, never a date. */
  it.each(["05.12.1980١", "27 September 2026١", "١05.12.1980"])(
    "finds nothing with a digit in another script glued: %s",
    (text) => {
      expect(found(`Ref ${text} here`)).toEqual([]);
    },
  );

  /**
   * Month first, the range's dash takes 0 to 3 (`MAX_GAP`) whitespace on each
   * side, counted apart, so four on either side is no range, and a month and
   * its first day alone are no date. Day first, a space on either side of the
   * dash ends the range, leaving the second day's date.
   */
  it.each([
    ["June 5th - 7th, 2026", ["June 5th - 7th, 2026"]],
    ["June 5    - 7, 2026", []],
    ["June 5 -    7, 2026", []],
    ["3 -5 June 2026", ["5 June 2026"]],
    ["3- 5 June 2026", ["5 June 2026"]],
  ])("reads the spaces round a day range's dash in %s", (text, dates) => {
    expect(texts(`Course ${text} in York`)).toEqual(dates);
  });

  /**
   * Each written form is tried on a window of `WRITTEN_LONGEST` code points,
   * so the longest real date each form allows, every gap at its widest, is
   * still read whole.
   */
  it.each([
    "September 12th   –   15th,   2026",
    "12th-15th   of   September,   2026",
    "12th-15th   September,   2026",
  ])("reads the longest form %s whole", (date) => {
    expect(texts(`Course ${date} in York`)).toEqual([date]);
  });
});

describe("dates and phone numbers (INV-14)", () => {
  /**
   * The trunk rule alone would read `05.12.1980` as a `0` then seven digits, a
   * possible UK number. The phone detector never reads a numeric date, so it
   * is left for `date` though `phone` stands higher in `PRECEDENCE`.
   */
  it.each([["05.12.1980"], ["05-12-1980"], ["01.02.2003"], ["2026-09-27"]])(
    "lists %s as a date, never a phone number",
    (date) => {
      const text = `Born ${date} in Leeds`;
      const points = Array.from(text);
      expect(
        detect({ text, joins: [] }).map((span) => [
          span.kind,
          points.slice(span.start, span.end).join(""),
        ]),
      ).toEqual([["date", date]]);
    },
  );

  /**
   * `phone` stands above `date` in `PRECEDENCE`, so a phone row holding any
   * digit of two joined dates would cut them. Through `detect`, each joined
   * numeric range gives its two dates and no other row (AC-19, INV-14).
   */
  it.each([
    ["01/05/1980-31/05/1980", ["01/05/1980", "31/05/1980"]],
    ["05.12.1980-10.12.1980", ["05.12.1980", "10.12.1980"]],
    ["05-12-1980-10-12-1980", ["05-12-1980", "10-12-1980"]],
    ["2026-09-01/2026-09-30", ["2026-09-01", "2026-09-30"]],
    ["2026-09-01-2026-09-30", ["2026-09-01", "2026-09-30"]],
    ["2026-09-01T00:00:00Z/2026-09-30T23:59:59Z", ["2026-09-01", "2026-09-30"]],
  ])("lists both dates of %s, and no phone number", (range, dates) => {
    const text = `Leave ${range} approved`;
    const points = Array.from(text);
    expect(
      detect({ text, joins: [] }).map((span) => [
        span.kind,
        points.slice(span.start, span.end).join(""),
      ]),
    ).toEqual(dates.map((date) => ["date", date]));
  });
});
