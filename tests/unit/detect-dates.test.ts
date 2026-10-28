import { describe, expect, it } from "vitest";

import {
  ADDED_DATE_LABELS,
  BIRTH_WORDS,
  DATE_LABELS,
  detect,
  DETECTORS,
  KEYWORD_REACH,
  MONTHS,
} from "@/detect";
import { datePasses } from "@/detect/date";
import { isNumericDate, isUnseparatedDate, isYearFirstDate } from "@/detect/dates";

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
    ["a full stop after a full month name", "on 1 September. 2026 we"],
    ["a word that only starts like a month", "on 1 Mayday 2026 we"],
    ["a word that is not a month", "on 1 Smarch 2026 we"],
    ["a three digit day", "on 127 May 2026 we"],
    ["a day of 0, written", "on 0 May 2026 we"],
    // The detector reads at most three whitespace characters between parts.
    ["four spaces between parts, day first", "on 27    September 2026 we"],
    ["four spaces between parts, month first", "on September    27, 2026 we"],
    ["mixed separators", "on 05.12-1980 we"],
    ["a numeric date with spaces", "on 05 12 1980 we"],
    ["digits only", "on 05121980 we"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  /**
   * A five digit year is no year, but one ASCII digit after a four digit year
   * is a footnote marker (third update of 2026-10-11): the date is listed
   * without it, unticked.
   */
  it.each([
    ["a written date", "on 1 May 20261 we", "1 May 2026"],
    ["a numeric date", "on 05.12.19801 we", "05.12.1980"],
  ])("finds %s before one glued digit, without it", (_what, text, date) => {
    expect(found(text)).toEqual([[date, false]]);
  });

  /**
   * Flipped by spec 0015, AC-5 and AC-18: a written date with a two digit
   * year is now read, in the second scan, so this pin moved out of the list
   * above.
   */
  it("finds a two digit year, written, unticked", () => {
    expect(found("on 1 May 26 we")).toEqual([["1 May 26", false]]);
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
    ["two digits after the year", "27 September 202612"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  /**
   * A letter after a date is no longer code (INV-17, second update of
   * 2026-10-10), and nor is one digit after its four digit year, a footnote
   * marker (third update of 2026-10-11): the date is listed alone, unticked,
   * for the visitor to judge.
   */
  it.each([
    ["a letter after", "05.12.1980a", "05.12.1980"],
    ["a letter after the year", "27 September 2026AD", "27 September 2026"],
    ["a digit after the year", "27 September 20261", "27 September 2026"],
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
   * A birth word glued to a date ticks it (second update of 2026-10-10).
   * `wordBefore`'s window ends at the date's start, so its whole word test
   * sees the glued word as whole, and the separate tick call the second update
   * added was dead (third update of 2026-10-11): these hold that it was.
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
    ["27 September 20261", [["27 September 2026", false]]],
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
    ["two digits glued after a written date", "27 September 202612"],
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
   * included. A dot never joins, so after a time a dot dated date's own dot
   * still cuts. But a letter before a dot no longer cuts (third update of
   * 2026-10-11), so after `EST.` an ISO date, whose own separator is not the
   * dot, is listed.
   */
  it.each([
    ["27/09/2026 10:00/28/09/2026", ["27/09/2026", "28/09/2026"]],
    ["2026/09/27 10:00/2026/09/28", ["2026/09/27", "2026/09/28"]],
    ["27-09-2026 10:00–28-09-2026", ["27-09-2026", "28-09-2026"]],
    ["27.09.2026 10:00.28.09.2026", ["27.09.2026"]],
    ["2026-09-27 10:00 EST.2026-09-28", ["2026-09-27", "2026-09-28"]],
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
   * second. Since the third update of 2026-10-11 the second keeps its row with
   * a footnote marker after it, and loses it with two digits. An impossible
   * date beyond it is no date, so the rule still cuts.
   */
  it.each([
    ["05-12-1980-3 June 2026", ["05-12-1980", "3 June 2026"]],
    ["2026-09-01-30 September 2026", ["2026-09-01", "30 September 2026"]],
    ["05-12-1980-3 June 20261", ["05-12-1980", "3 June 2026"]],
    ["05-12-1980-3 June 202612", ["05-12-1980"]],
    ["2026-09-01-2026-02-30", []],
  ])("reads the date beyond the joiner at the end of %s", (text, dates) => {
    expect(texts(`Leave ${text} approved`)).toEqual(dates);
  });

  /** A digit in any script glued before a date makes a longer number, never a date. */
  it("finds nothing with a digit in another script glued before: ١05.12.1980", () => {
    expect(found("Ref ١05.12.1980 here")).toEqual([]);
  });

  /**
   * Flipped by spec 0015, AC-9 and AC-18: a digit in another script after a
   * date ends its row in the second scan, which lists the date, unticked.
   * Today's scan still drops it, so the date is the second scan's.
   */
  it.each([
    ["05.12.1980١", "05.12.1980"],
    ["27 September 2026١", "27 September 2026"],
  ])("lists the date before a digit in another script glued after: %s", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
    expect(scans(`Ref ${text} here`).first).toEqual([]);
  });

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

/**
 * Each code point NFKC normalised on its own, as the find step does before
 * any detector runs (`src/engine/find.ts`). The detectors never normalise, so
 * to them a raw `¹` is a digit of another script.
 */
function nfkc(text: string): string {
  return Array.from(text, (point) => point.normalize("NFKC")).join("");
}

/** The superscripts these cases use, written as the plain digits a PDF may hold. */
function plain(text: string): string {
  return text.replaceAll("¹", "1").replaceAll("²", "2").replaceAll("³", "3");
}

/**
 * Spec 0005, AC-19, AC-10 and INV-17, as the third update of 2026-10-11
 * amended them: a footnote marker stuck after a date does not hide it, a date
 * label glued to a date lists it unticked, and a letter before a dot no
 * longer cuts a numeric date. Each kept rejection beside them is pinned by
 * name, so widening one is noticed.
 */
describe("footnote markers and glued labels (AC-19, AC-10, INV-17)", () => {
  /**
   * Exactly one ASCII digit after a date whose year has four digits is a
   * marker, outside the row, and a birth word still ticks the date. Each case
   * is tried with the superscript through NFKC and with the plain digit.
   */
  it.each([
    ["Born 12/05/1980¹", "12/05/1980", true],
    ["DOB: 12/05/1980¹", "12/05/1980", true],
    ["Signed 27 September 2026¹", "27 September 2026", false],
    ["Sep 27 2026²", "Sep 27 2026", false],
    ["1st of May 2026³", "1st of May 2026", false],
    ["2026-09-27¹", "2026-09-27", false],
    ["geboren am 12.05.1980.¹", "12.05.1980", false],
    ["05.12.19800", "05.12.1980", false],
    ["on 1 May 20261 we", "1 May 2026", false],
    ["on 05.12.19801 we", "05.12.1980", false],
  ])("lists the date in %s, the marker outside", (text, date, ticked) => {
    expect(found(nfkc(text))).toEqual([[date, ticked]]);
    expect(found(plain(text))).toEqual([[date, ticked]]);
  });

  it.each([
    ["27/09/2026¹-28/09/2026", ["27/09/2026", "28/09/2026"]],
    ["05-12-1980-3 June 2026¹", ["05-12-1980", "3 June 2026"]],
  ])("lists both dates of %s", (text, dates) => {
    expect(texts(nfkc(`Leave ${text} approved`))).toEqual(dates);
  });

  /**
   * Two or more digits, or one digit after a two digit year, are a longer
   * number; a hyphen or a slash and one digit are a build number; its own
   * separator and two digits are a longer code. A digit in another script
   * after a date left this list with spec 0015's AC-9: the second scan lists
   * the date before it.
   */
  it.each([
    ["two marker digits", "Born 12/05/1980¹²"],
    ["two plain digits", "Born 12/05/198012"],
    ["a marker after a two digit year", "05.12.80¹"],
    ["a dot and a digit after a two digit year", "1.2.26.1"],
    ["a hyphen and one digit", "2026-09-27-1"],
    ["a slash and one digit", "27/09/2026/1"],
    ["a hyphen and two digits", "2026-09-27-01"],
    ["a dot and two digits", "05.12.1980.17"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(nfkc(`Ref ${text} here`))).toEqual([]);
  });

  /** A birth word before a glued label still ticks the date. */
  it("ticks the date in Born Date27/09/1980", () => {
    expect(found("Born Date27/09/1980")).toEqual([["27/09/1980", true]]);
  });

  /** A date label glued to a date, directly or through one separator, lists it unticked. */
  it.each([
    ["Date27/09/2026", ["27/09/2026"]],
    ["Dated27 September 2026", ["27 September 2026"]],
    ["Issued27/09/2026", ["27/09/2026"]],
    ["Signed27 September 2026¹", ["27 September 2026"]],
    ["Exp.31.12.2026", ["31.12.2026"]],
    ["Dt.27/09/2026", ["27/09/2026"]],
    ["Date.31.12.2026", ["31.12.2026"]],
    ["Date-27/09/2026", ["27/09/2026"]],
    ["Valid-31/12/2026", ["31/12/2026"]],
    ["from27/09/2026 to28/09/2026", ["27/09/2026", "28/09/2026"]],
  ])("lists the date glued to a label in %s, unticked", (text, dates) => {
    expect(found(nfkc(`Seen ${text} here`))).toEqual(dates.map((date) => [date, false]));
  });

  it("still ticks a date glued to a birth word", () => {
    expect(found("Patient DOB27/09/1980 here")).toEqual([["27/09/1980", true]]);
  });

  /**
   * A word not in either list, or a label with a letter before it, is no
   * label: the letter glued, or before a hyphen, still cuts.
   */
  it.each([
    "Toronto27/09/2026",
    "photo-27/09/2026",
    "M-12/05/1980",
    "Monday-28/09/2026",
    "Reborn27/09/1980",
  ])("finds no date in %s", (text) => {
    expect(found(`Seen ${text} here`)).toEqual([]);
  });

  /**
   * Flipped by spec 0015, AC-8 and AC-18: `updated` is one of
   * `ADDED_DATE_LABELS`, which the second scan reads, so the date is listed,
   * unticked. Today's scan, reading `DATE_LABELS` alone, still drops it.
   */
  it("lists the date glued to Updated, unticked, in the second scan", () => {
    expect(found("Seen Updated27/09/2026 here")).toEqual([["27/09/2026", false]]);
    expect(scans("Seen Updated27/09/2026 here").first).toEqual([]);
  });

  /**
   * A full stop after a letter ends an abbreviation or a sentence, never
   * glues a code, so it no longer cuts the date after it. A digit before the
   * date's own dot, or a letter before a hyphen, still does.
   */
  it.each([
    ["w.e.f.27.09.2026", "27.09.2026"],
    ["Rev.27.09.2026", "27.09.2026"],
    ["No.27.09.2026", "27.09.2026"],
    ["b.12/05/1980", "12/05/1980"],
    ["REF.05.12.1980", "05.12.1980"],
    ["report.27.09.2026.pdf", "27.09.2026"],
  ])("lists the date after a letter and a dot in %s, unticked", (text, date) => {
    expect(found(`Seen ${text} here`)).toEqual([[date, false]]);
  });

  it.each(["v1.05.12.1980", "report-27-09-2026-v2.pdf"])(
    "still finds no date in %s",
    (text) => {
      expect(found(`Seen ${text} here`)).toEqual([]);
    },
  );

  it("pins the date labels the spec gives", () => {
    expect(DATE_LABELS).toEqual([
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
  });

  it.each(DATE_LABELS)("lists a date glued to %s, in any case, unticked", (label) => {
    const upper = label.toUpperCase();
    expect(found(`Seen ${label}27/09/2026 here`)).toEqual([["27/09/2026", false]]);
    expect(found(`Seen ${upper}-27/09/2026 here`)).toEqual([["27/09/2026", false]]);
    expect(found(`Seen ${label}.31.12.2026 here`)).toEqual([["31.12.2026", false]]);
    expect(found(`Seen ${upper}27 September 2026 here`)).toEqual([
      ["27 September 2026", false],
    ]);
  });

  /** Spec 0015, AC-8: the second scan's labels, read with `DATE_LABELS`. */
  it("pins the added date labels spec 0015 gives", () => {
    expect(ADDED_DATE_LABELS).toEqual([
      "created",
      "updated",
      "modified",
      "printed",
      "due",
      "deadline",
      "start",
      "starts",
      "end",
      "ends",
      "issue",
    ]);
  });

  it.each(ADDED_DATE_LABELS)(
    "lists a date glued to %s, in any case, unticked, in the second scan only",
    (label) => {
      const upper = label.toUpperCase();
      expect(found(`Seen ${label}27/09/2026 here`)).toEqual([["27/09/2026", false]]);
      expect(found(`Seen ${upper}-27/09/2026 here`)).toEqual([["27/09/2026", false]]);
      expect(found(`Seen ${upper}27 September 2026 here`)).toEqual([
        ["27 September 2026", false],
      ]);
      expect(scans(`Seen ${label}27/09/2026 here`).first).toEqual([]);
    },
  );

  it.each([
    ["Created27/09/2026", "27/09/2026"],
    ["Due-27/09/2026", "27/09/2026"],
    ["Date of issue27/09/2026", "27/09/2026"],
    ["Deadline.31.12.2026", "31.12.2026"],
    ["Updated2026.9.7", "2026.9.7"],
    ["Ends-20260927", "20260927"],
  ])("lists the date glued to an added label in %s, unticked", (text, date) => {
    expect(found(`Seen ${text} here`)).toEqual([[date, false]]);
  });

  it("still ticks a date after a birth word with an added label glued", () => {
    expect(found("Born, updated27/09/1980")).toEqual([["27/09/1980", true]]);
  });

  /** An added label is a whole word too: `Weekend` only ends like `end`. */
  it.each(["Weekend27/09/2026", "Overdue27/09/2026", "xstart-27/09/2026"])(
    "finds no date in %s",
    (text) => {
      expect(found(`Seen ${text} here`)).toEqual([]);
    },
  );
});

/**
 * The third update's rules past the spec's named examples (AC-19, AC-10,
 * INV-17): what may stand after a marker, every form a marker may follow, a
 * marker on the far side of a joiner, and how a glued label is told from a
 * word that only ends like one. Each case goes through NFKC first, as the find
 * step does.
 */
describe("footnote markers and glued labels, at their edges (AC-19, AC-10, INV-17)", () => {
  // covers: AC-19, INV-17 (a marker has no ASCII digit after it)
  it("finds no date when another digit follows the marker after an ISO date, as two digits", () => {
    expect(found(nfkc("Ref 2026-09-27¹² here"))).toEqual([]);
  });

  /**
   * Flipped by spec 0015, AC-9 and AC-18: in the second scan a digit in
   * another script after a marker is where the row ends, so the date is
   * listed and the marker and that digit are both outside it. Today's scan
   * still drops each.
   */
  it.each([
    ["a numeric date", "27/09/2026¹١", "27/09/2026"],
    ["a written date", "27 September 2026¹١", "27 September 2026"],
    ["a dotted date's stop", "12.05.1980.¹١", "12.05.1980"],
  ])(
    "lists the date when another script's digit follows the marker after %s: %s",
    (_what, text, date) => {
      expect(found(nfkc(`Ref ${text} here`))).toEqual([[date, false]]);
      expect(scans(nfkc(`Ref ${text} here`)).first).toEqual([]);
    },
  );

  // covers: AC-19 (only a digit after the marker makes a longer number)
  it.each([
    ["27/09/2026¹a", "27/09/2026"],
    ["27/09/2026¹.", "27/09/2026"],
    ["12.05.1980.¹a", "12.05.1980"],
  ])("lists the date in %s, since no digit follows the marker", (text, date) => {
    expect(found(nfkc(`Seen ${text} here`))).toEqual([[date, false]]);
  });

  // covers: AC-19 (a marker after any form with a four digit year)
  it.each([
    ["a month first numeric date", "09/27/2026¹", "09/27/2026"],
    ["a hyphen dated date", "27-09-2026¹", "27-09-2026"],
    ["one digit day and month", "1/5/2026¹", "1/5/2026"],
    ["a year of the last century", "27/09/1999¹", "27/09/1999"],
    ["a month first written date", "September 27, 2026¹", "September 27, 2026"],
    ["a day range", "3–5 June 2026¹", "3–5 June 2026"],
    ["a spaced month first day range", "June 5 - 7, 2026¹", "June 5 - 7, 2026"],
  ])("lists %s with a marker, the marker outside: %s", (_what, text, date) => {
    expect(found(nfkc(`Seen ${text} here`))).toEqual([[date, false]]);
  });

  /**
   * The retry without the last digit asks `isNumericDate` again, and a
   * written date's calendar check runs before its end is looked at, so a
   * marker never turns a day that does not exist into one.
   */
  // covers: AC-19
  it.each(["31/02/2026¹", "2026-02-30¹", "29.02.2027¹", "31 April 2026¹"])(
    "finds no date in the impossible %s",
    (text) => {
      expect(found(nfkc(`Seen ${text} here`))).toEqual([]);
    },
  );

  // covers: AC-19 (the scan resumes at the marker, which hides nothing after it)
  it("lists two dates that each carry a marker", () => {
    expect(found(nfkc("Seen 27/09/2026¹ and 28/09/2026² here"))).toEqual([
      ["27/09/2026", false],
      ["28/09/2026", false],
    ]);
  });

  /**
   * The far side of a joiner is read by the same `numericAt`, so a marker
   * after a joined pair's second date leaves both listed, and two digits
   * leave the second no date. The first then meets the own separator rule as
   * any date does: a hyphen dated one before a hyphen and digits is cut, and a
   * slash dated one is not, since the hyphen is not its own separator.
   */
  // covers: AC-19, INV-17
  it.each([
    ["2026-09-01-2026-09-30¹", ["2026-09-01", "2026-09-30"]],
    ["01/05/1980-31/05/1980¹", ["01/05/1980", "31/05/1980"]],
    ["2026-09-01-2026-09-30¹²", []],
    ["01/05/1980-31/05/1980¹²", ["01/05/1980"]],
  ])("reads a marker on the far side of the joiner in %s", (text, dates) => {
    expect(texts(nfkc(`Leave ${text} approved`))).toEqual(dates);
  });

  /**
   * Through one separator means a slash too, and a label glued to a month
   * first written date lifts the letter glued to its month as it does for a
   * day first one. Each control puts a word that is no label in the label's
   * place, and gives none, so the label is what lists the date.
   */
  // covers: AC-19, AC-10 (a label lists the date and never ticks it)
  it.each([
    ["Exp/31/12/2026", "31/12/2026", "Note/31/12/2026"],
    ["Date/27/09/2026", "27/09/2026", "Note/27/09/2026"],
    ["DateSeptember 27, 2026", "September 27, 2026", "xSeptember 27, 2026"],
    ["fromSep 27 2026", "Sep 27 2026", "xSep 27 2026"],
  ])("lists the date glued to a label in %s, unticked", (text, date, control) => {
    expect(found(`Seen ${text} here`)).toEqual([[date, false]]);
    expect(found(`Seen ${control} here`)).toEqual([]);
  });

  /**
   * A label is a whole word: a letter or a digit right before it makes it the
   * end of something else, so what is glued to the date is no label and the
   * date is dropped.
   */
  // covers: AC-19, INV-17
  it.each([
    "1Date27/09/2026",
    "xDate-27/09/2026",
    "ExpDate27/09/2026",
    "ValidFrom27/09/2026",
  ])("finds no date in %s", (text) => {
    expect(found(`Seen ${text} here`)).toEqual([]);
  });

  // covers: AC-19, AC-10 (a glued word and a marker together)
  it.each([
    ["Date27/09/2026¹", "27/09/2026", false],
    ["Exp.31.12.2026.¹", "31.12.2026", false],
    ["D.O.B.12.05.1980¹", "12.05.1980", true],
  ])("lists the date in %s, glued word and marker both outside", (text, date, ticked) => {
    expect(found(nfkc(`Seen ${text} here`))).toEqual([[date, ticked]]);
  });

  // covers: AC-19, INV-17 (a letter before a dot never cuts, whatever the date's own separator)
  it.each([
    ["Rev.27/09/2026", "27/09/2026"],
    ["Rev.27-09-2026", "27-09-2026"],
    ["Rev.2026-09-27", "2026-09-27"],
  ])("lists the date after a letter and a dot in %s, unticked", (text, date) => {
    expect(found(`Seen ${text} here`)).toEqual([[date, false]]);
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

/** Each scan's dates, as their text and tick. Spec 0015, AC-1. */
function scans(text: string): { first: [string, boolean][]; added: [string, boolean][] } {
  const points = Array.from(text);
  const { first, added } = datePasses({ text, joins: [] });
  const rows = (spans: typeof first): [string, boolean][] =>
    spans.map((span) => [
      points.slice(span.start, span.end).join(""),
      span.tickedByDefault,
    ]);
  return { first: rows(first), added: rows(added) };
}

/**
 * Spec 0015, AC-1: today's scan runs first, untouched, and a second scan
 * reads the forms spec 0015 adds only over what it leaves free. Today's rows
 * are written as literals, as the date detector listed them before the
 * second scan existed.
 */
describe("the date detector's two scans (spec 0015, AC-1)", () => {
  // A single scan trying a new form at every start took `28` and its tick
  // here, when a joiner was allowed to see a new form beyond it.
  it("lists today's rows exactly, ticks and all, with nothing added", () => {
    expect(scans("DOB 04-03-19660 - 2023-05-15-28-APR-55/21.11.69")).toEqual({
      first: [
        ["04-03-1966", true],
        ["05-15-28", true],
        ["21.11.69", false],
      ],
      added: [],
    });
  });

  // A new form read at `31` would take the year of the date today lists.
  it("lists nothing where a new reading runs into a first scan row", () => {
    expect(scans("Ref 2022/9/31 Oct 11, 1988")).toEqual({
      first: [["Oct 11, 1988", false]],
      added: [],
    });
  });

  it("lists a new form in the second scan only, and both scans together", () => {
    const text = "Signed 05-Jan-2026 and 27 September 2026 here";
    expect(scans(text)).toEqual({
      first: [["27 September 2026", false]],
      added: [["05-Jan-2026", false]],
    });
    expect(found(text)).toEqual([
      ["05-Jan-2026", false],
      ["27 September 2026", false],
    ]);
  });

  /**
   * In the second scan a joiner parts a date from a new form beyond it, so
   * the own separator rule no longer cuts the first; today's scan, which
   * sees only today's forms beyond a joiner, lists neither.
   */
  it("parts a date from a new form beyond a joiner in the second scan", () => {
    expect(scans("Leave 05-12-1980-05-Jan-2026 ok")).toEqual({
      first: [],
      added: [
        ["05-12-1980", false],
        ["05-Jan-2026", false],
      ],
    });
    expect(scans("Leave 2026-09-01-2026-9-30 ok")).toEqual({
      first: [],
      added: [
        ["2026-09-01", false],
        ["2026-9-30", false],
      ],
    });
  });

  /**
   * The joiner rule's last listed end is the last row either scan listed, so
   * a first scan row with only a time after it lifts the start rejection of a
   * new form beyond the joiner.
   */
  it("parts a first scan row from a new form across a time", () => {
    expect(scans("Leave 2026-09-27 10:00-2026-9-28 ok")).toEqual({
      first: [["2026-09-27", false]],
      added: [["2026-9-28", false]],
    });
  });

  /**
   * A joiner sees today's forms, year first and the new written patterns
   * beyond it, never a spaced date (AC-1), so the own separator rule still
   * cuts the date before it in both scans. The spaced date is listed alone,
   * since nothing before it is checked beyond the start test (AC-7).
   */
  it("does not part a date from a spaced date beyond a joiner", () => {
    expect(scans("Leave 05-12-1980-27 / 09 / 2026 ok")).toEqual({
      first: [],
      added: [["27 / 09 / 2026", false]],
    });
  });
});

/**
 * Spec 0015, AC-3, AC-4 and AC-13: the two predicates for the numeric forms
 * spec 0015 adds, which only the date detector reads, and `isNumericDate`,
 * which the phone detector shares, reading neither.
 */
describe("isYearFirstDate and isUnseparatedDate (spec 0015, AC-3, AC-4, AC-13)", () => {
  it.each([
    "2026.09.27",
    "2026/9/7",
    "2026-9-7",
    "2026.9.7",
    "2026-09-27",
    "2026–9–7",
    "2024.2.29",
  ])("reads %s as year first", (text) => {
    expect(isYearFirstDate(text)).toBe(true);
  });

  it.each([
    "2026.9-7",
    "2026.02.30",
    "2023.2.29",
    "1899.1.1",
    "2100.1.1",
    "2026.13.1",
    "2026.123.1",
    "26.9.7",
    "27.09.2026",
    "2026.09.27.",
  ])("does not read %s as year first", (text) => {
    expect(isYearFirstDate(text)).toBe(false);
  });

  it.each(["20260927", "19800512", "19000101", "20991231", "20240229"])(
    "reads %s as unseparated",
    (text) => {
      expect(isUnseparatedDate(text)).toBe(true);
    },
  );

  it.each([
    "27092026",
    "09272026",
    "20261327",
    "20260230",
    "18991231",
    "2026092",
    "202609271",
  ])("does not read %s as unseparated", (text) => {
    expect(isUnseparatedDate(text)).toBe(false);
  });

  it.each(["2026.09.27", "2026/9/7", "2026-9-7", "20260927"])(
    "leaves isNumericDate rejecting %s",
    (text) => {
      expect(isNumericDate(text)).toBe(false);
    },
  );

  /** Every dash reads as `-`, as `isNumericDate` reads them (AC-3). */
  it.each(["2026–9-7", "2026−09−27", "2026‐9‐7"])(
    "reads %s as year first, its dashes as one class",
    (text) => {
      expect(isYearFirstDate(text)).toBe(true);
    },
  );

  it.each([
    ["a year after 2099", "21000101"],
    ["a leap day in a common year", "20230229"],
  ])("does not read %s as unseparated: %s", (_what, text) => {
    expect(isUnseparatedDate(text)).toBe(false);
  });
});

/** Spec 0015, AC-3: year first with any separator, read with today's numeric edges. */
describe("year first dates with any separator (spec 0015, AC-3)", () => {
  it.each(["2026.09.27", "2026/9/7", "2026-9-7", "2026.9.7", "2026–9–7", "1980.5.12"])(
    "finds %s",
    (date) => {
      expect(found(`Signed ${date} here`)).toEqual([[date, false]]);
    },
  );

  it.each([
    ["a letter before a hyphen", "Lot-2026-9-7"],
    ["its own separator with a digit before", "801-666-2504/2035/6/24"],
    ["a letter glued", "v2024.1.3"],
    ["two different separators", "2026.9-7"],
    ["an impossible day", "2026.02.30"],
    ["its own separator and digits after", "2026.9.7.12"],
    ["a day read as two digits with a glued digit", "2026.9.71"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  it.each([
    ["Rev.2026.9.7", "2026.9.7"],
    ["2026.09.271", "2026.09.27"],
    ["2026/9/7, then", "2026/9/7"],
  ])("lists the date in %s", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });

  /**
   * Today's numeric edges, read with `isYearFirstDate` (AC-3): a different
   * separator and digits after a date never cut it (INV-17), a dotted date's
   * own full stop then a marker is a sentence's end and its mark, and mixed
   * dashes are one class.
   */
  it.each([
    ["2026.9.7-17", "2026.9.7"],
    ["2026.9.7.¹", "2026.9.7"],
    ["2026–9-7", "2026–9-7"],
  ])("lists the date in %s, as a numeric date's edges read it", (text, date) => {
    expect(found(nfkc(`Ref ${text} here`))).toEqual([[date, false]]);
  });
});

/** Spec 0015, AC-4: eight digits read as year, month and day. */
describe("unseparated dates (spec 0015, AC-4)", () => {
  it.each(["20260927", "19800512"])("finds %s", (date) => {
    expect(found(`Batch ${date} here`)).toEqual([[date, false]]);
  });

  it.each([
    ["day first", "27092026"],
    ["month first", "09272026"],
    ["a ninth digit", "202609271"],
    ["a digit in another script after", "20260927١"],
    ["a letter then a hyphen before", "INV-20260927"],
    ["a digit then a hyphen before", "12-20260927"],
    ["a digit then a dot before", "1.20260927"],
    ["a separator and digits after", "20260927-001"],
    ["a joiner and another unseparated date after", "20260901-20260930"],
    ["an impossible day", "20260230"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  it.each([
    ["20260927T101500Z", "20260927"],
    ["Date-20260927", "20260927"],
    ["20260927-27/09/2026", "20260927"],
  ])("lists the date in %s", (text, date) => {
    expect(texts(`Ref ${text} here`)[0]).toBe(date);
  });

  /**
   * Today's exemption (AC-4): a joiner with only a time back to the last date
   * listed lifts the start rejection, and that date may be the first scan's
   * row (AC-1).
   */
  it("parts an unseparated date from a first scan row across a time", () => {
    expect(scans("Leave 2026-09-27 10:00-20260928 ok")).toEqual({
      first: [["2026-09-27", false]],
      added: [["20260928", false]],
    });
  });

  /** Only a separator with a digit after it drops the date, never a sentence's end. */
  it.each([
    ["20260927. Next", "20260927"],
    ["20260927, then", "20260927"],
    ["20260927-final", "20260927"],
  ])("lists the date before a separator with no digit after it in %s", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });
});

/** Spec 0015, AC-7: spaced numeric separators with a four digit year. */
describe("spaced numeric separators (spec 0015, AC-7)", () => {
  it.each([
    "27 / 09 / 2026",
    "27 . 09 . 2026",
    "27 - 09 - 2026",
    "09 / 27 / 2026",
    "2026 - 09 - 27",
    "2026 / 9 / 7",
    "27   /   09   /   2026",
    "27 – 09 - 2026",
  ])("finds %s", (date) => {
    expect(found(`Spaced ${date} here`)).toEqual([[date, false]]);
  });

  it.each([
    ["a two digit year, a score", "won 6 - 7 - 77"],
    ["two separator classes", "27 / 09 - 2026"],
    ["no space after a separator, a recorded miss", "27 /09 / 2026"],
    ["four spaces before a separator", "27    / 09 / 2026"],
    ["a digit in another script after", "27 / 09 / 2026١"],
    ["two digits after", "27 / 09 / 202612"],
    ["an impossible day", "31 / 02 / 2026"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  /**
   * A marker digit is read as for numeric dates: after a four digit year,
   * last or first, with the day then read as three digits. A day of one
   * digit with one glued reads as two, and is no date.
   */
  it.each([
    ["27 / 09 / 20261", "27 / 09 / 2026"],
    ["2026 - 09 - 271", "2026 - 09 - 27"],
  ])("lists the date in %s, the marker outside", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });

  it("finds no date in 2026 - 9 - 71", () => {
    expect(found("Ref 2026 - 9 - 71 here")).toEqual([]);
  });

  /** Recorded under spec 0015's *Consequences*: a spaced code lists its last three groups. */
  it("lists the last three groups of a spaced code, unticked", () => {
    expect(found("Ref 1 / 27 / 09 / 2026 here")).toEqual([["27 / 09 / 2026", false]]);
  });
});

/**
 * Spec 0015, AC-2: a written month with flush separators, day first, month
 * first or year first, one hyphen (any dash `HYPHEN` reads), one slash or
 * one full stop, the same code point both times.
 */
describe("written months with flush separators (spec 0015, AC-2)", () => {
  it.each([
    "05-Jan-2026",
    "27/Sep/2026",
    "27-September-2026",
    "27.Sep.2026",
    "27–Sep–2026",
    "5-jan-2026",
    "Sep-27-2026",
    "Sep.27.2026",
    "SEPT/27/2026",
    "2026-Sep-27",
    "2026/SEP/27",
    "2026.Sep.7",
  ])("finds %s", (date) => {
    expect(found(`Signed ${date} here`)).toEqual([[date, false]]);
  });

  it.each([
    ["two different dashes", "27-Sep–2026"],
    ["two different separators", "27-Sep/2026"],
    ["a space beside a separator", "27- Sep-2026"],
    ["an ordinal, a recorded miss", "1st-May-2026"],
    ["a word that is not a month", "27-Foo-2026"],
    ["an impossible day", "31-Apr-2026"],
    ["a year before 1900", "27-Sep-1899"],
    ["a letter glued to its start", "x05-Jan-2026"],
    ["two digits glued after its year", "05-Jan-202612"],
    ["two digits glued after a year first day", "2026-Sep-2712"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  /** Its end follows today's written date rule with a four digit year. */
  it.each([
    ["05-Jan-20261", "05-Jan-2026"],
    ["2026-Sep-271", "2026-Sep-27"],
    ["05-Jan-2026a", "05-Jan-2026"],
    ["Sep-27-2026.", "Sep-27-2026"],
  ])("lists the date in %s without what is glued after it", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });

  /**
   * A month name is never part of a code, so, as for every written date, a
   * separator and digits after the year leave the date listed (INV-17), its
   * own separator included, unlike a numeric date's.
   */
  it.each([
    ["05-Jan-2026-17", "05-Jan-2026"],
    ["27/Sep/2026/3", "27/Sep/2026"],
  ])("lists the date in %s without the separator and digits after it", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });
});

/** Spec 0015, AC-6: new joints in the written forms. */
describe("new joints in the written forms (spec 0015, AC-6)", () => {
  it.each([
    ["a comma and no space before the year, day first", "15 March,2026"],
    ["a comma and no space before the year, month first", "March 15,2026"],
    ["day of after an ordinal", "27th day of September 2026"],
    ["day of and a comma", "1st day of May, 2026"],
    ["day of with gaps as wide as MAX_GAP", "2nd   day   of   June 2026"],
    ["a full stop after the day", "27. September 2026"],
    ["a full stop after a one digit day", "1. May 2026"],
    ["a full stop after an ordinal", "27th. September 2026"],
    ["a comma after the month", "September, 27 2026"],
    ["a day glued to an abbreviation's full stop", "Sept.27, 2026"],
    ["a day glued to a three letter abbreviation's full stop", "Dec.1 2026"],
  ])("finds %s: %s", (_what, date) => {
    expect(found(`Signed ${date} here`)).toEqual([[date, false]]);
  });

  /** The row starts at the day, so the words before the legal formula stay in the file. */
  it("leaves Dated this out of the legal formula's row", () => {
    expect(texts("Dated this 1st day of May, 2026 at noon")).toEqual([
      "1st day of May, 2026",
    ]);
  });

  it.each([
    ["day of after a day with no ordinal", "27 day of September 2026"],
    ["a full stop after a full month name", "September.27, 2026"],
    ["a day glued to a full month name", "September27, 2026"],
    ["a day glued to an abbreviation", "Sep27, 2026"],
    ["a space before the comma, a recorded miss", "15 March ,2026"],
    ["four spaces after the comma", "15 March,    2026"],
    ["four spaces round day of", "27th    day of September 2026"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  it.each([
    ["27th day of September 20261", "27th day of September 2026"],
    ["15 March,2026a", "15 March,2026"],
  ])("lists the date in %s without what is glued after it", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });

  it("finds no date with two digits glued after the year", () => {
    expect(found("Ref 27. September 202612 here")).toEqual([]);
  });

  /** A deed often sets the formula in capitals: the month, `day of` and the ordinal read in any case. */
  it.each([
    ["THIS 1ST DAY OF MAY, 2026", "1ST DAY OF MAY, 2026"],
    ["ON 27. SEPTEMBER 2026", "27. SEPTEMBER 2026"],
    ["BY SEPT.27, 2026", "SEPT.27, 2026"],
    ["AT 15 MARCH,2026", "15 MARCH,2026"],
  ])("lists the date in %s, in capitals", (text, date) => {
    expect(found(text)).toEqual([[date, false]]);
  });
});

/**
 * Spec 0015, AC-5: a two digit year in the day first and month first written
 * forms, flush or spaced, and after an apostrophe in the spaced ones, real in
 * either century. A glued digit is never a marker after two digits, and a
 * letter, or a `:`, `.` or `,` with a digit after it, drops the date.
 */
describe("two digit years in written dates (spec 0015, AC-5)", () => {
  it.each([
    "27 Sep 26",
    "27 September 26",
    "27th of Sep, 26",
    "27. September 26",
    "27th day of September 26",
    "15 March,26",
    "Sep 27, 26",
    "Sep 27 26",
    "27-SEP-26",
    "SEP-27-26",
    "27 Sep '26",
    "Sept 27th, ’26",
    "29 Feb 24",
    "1 Jan 00",
  ])("finds %s", (date) => {
    expect(found(`Seen ${date} here`)).toEqual([[date, false]]);
  });

  it.each([
    ["four digits after the month, read as the year only", "27 September 202612"],
    ["a letter after the year", "Sep 27 10am"],
    ["a clock time", "Mon 27 Sep 10:00"],
    ["a time with a full stop", "27 Sep 10.30"],
    ["a longer number", "Sep 27, 26,000"],
    ["a glued ASCII digit", "27 Sep 261"],
    ["an apostrophe before four digits", "27 Sep '2026"],
    ["a leap day in a year no century makes leap", "29 Feb 23"],
    ["an apostrophe in a flush form", "27-SEP-'26"],
    ["a space between the apostrophe and the year", "27 Sep ' 26"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  it.each([
    ["29 JUL 11,1984", ["JUL 11,1984"]],
    ["06-MAR-23/07700 859 471", ["06-MAR-23"]],
    ["Jul 20, 59: 617 822 7505", ["Jul 20, 59"]],
    ["27 Sep 26, then", ["27 Sep 26"]],
  ])("reads what follows a two digit year in %s", (text, dates) => {
    expect(texts(`Ref ${text} here`)).toEqual(dates);
  });

  /** The owner's decision: the lower case word `may` reads as a month like any other. */
  it("lists Rule 8 may 42 apply's 8 may 42, unticked", () => {
    expect(found("Rule 8 may 42 apply")).toEqual([["8 may 42", false]]);
  });

  it("ticks a two digit year after a birth word", () => {
    expect(found("DOB 5 Jan 80")).toEqual([["5 Jan 80", true]]);
  });

  /** A `:`, `.` or `,` with no digit after it ends a sentence or a clause, not the year. */
  it.each([
    ["Seen 27 Sep 26. Next", "27 Sep 26"],
    ["On 27-SEP-26: signed", "27-SEP-26"],
    ["By Sep 27, '26.", "Sep 27, '26"],
  ])("lists the date in %s", (text, date) => {
    expect(found(text)).toEqual([[date, false]]);
  });
});

/**
 * Spec 0015, AC-9: in the second scan a digit in another script right after a
 * date, or after its footnote marker, is where the row ends, for every reader
 * whose end goes through today's end check. Two ASCII digits still drop a
 * date, and so does a digit of any script before it, and the unseparated and
 * spaced readers drop a date with a digit of any script after it. Each case
 * goes through NFKC first, as the find step does.
 */
describe("a digit in another script after a date (spec 0015, AC-9)", () => {
  it.each([
    ["Born 12/05/1980¹١", "12/05/1980", true],
    ["27 September 2026١", "27 September 2026", false],
    ["05.12.1980١", "05.12.1980", false],
    ["27/09/2026¹١", "27/09/2026", false],
    ["12.05.1980.¹١", "12.05.1980", false],
    ["2026.9.7١", "2026.9.7", false],
    ["27 Sep 26١", "27 Sep 26", false],
    ["05-Jan-2026१", "05-Jan-2026", false],
    ["2026-09-27١ later", "2026-09-27", false],
    ["05-Jan-2026¹١", "05-Jan-2026", false],
    ["1st day of May, 2026١", "1st day of May, 2026", false],
    ["15 March,2026١", "15 March,2026", false],
    ["27. September 2026¹١", "27. September 2026", false],
  ])("lists the date in %s", (text, date, ticked) => {
    expect(found(nfkc(`Ref ${text}`))).toEqual([[date, ticked]]);
  });

  it("leaves both the marker and the other digit outside the row in 27/09/20261١", () => {
    const text = "Ref 27/09/20261١ here";
    expect(
      DETECTORS.date({ text, joins: [] }).map((span) => [span.start, span.end]),
    ).toEqual([[4, 14]]);
  });

  it.each([
    ["two ASCII digits", "2026-09-27¹²"],
    ["a digit in another script before", "١05.12.1980"],
    ["an unseparated date", "20260927١"],
    ["a spaced date", "27 / 09 / 2026١"],
    ["a marker, then a digit in another script, after a spaced date", "27 / 09 / 20261١"],
  ])("finds no date with %s: %s", (_what, text) => {
    expect(found(nfkc(`Ref ${text} here`))).toEqual([]);
  });

  /**
   * Only the digit right after a date or its marker changed: a numeric date's
   * own separator with a digit of any script after it is still a longer code,
   * as today (AC-9).
   */
  it.each(["2026-09-27-١", "12.05.1980.١", "27/09/2026/١"])(
    "finds no date in %s, its own separator then another script's digit",
    (text) => {
      expect(found(`Ref ${text} here`)).toEqual([]);
    },
  );
});

/**
 * Spec 0015, AC-11: the `cutAtEnd` asymmetry of the fourth review, pinned as
 * it stands. A hyphen or a slash and one digit after a date is a build number
 * (`2026-09-27-1`), but after a marker it is not looked at, so the date
 * detector alone lists each date here without its marker. Through `detect`
 * (`detect.test.ts`) the first two are ticked phone rows on main, so dropping
 * the date would take nothing, and the third a date main lists, so dropping it
 * would take a row.
 */
describe("a marker, then a separator and a digit (spec 0015, AC-11)", () => {
  it.each([
    ["27-09-20261-5", "27-09-2026"],
    ["2026-09-271-5", "2026-09-27"],
    ["27/09/20261/5", "27/09/2026"],
  ])("lists %s as the date without the marker", (text, date) => {
    expect(found(`Ref ${text} here`)).toEqual([[date, false]]);
  });
});

/** Spec 0015, AC-14: a birth word ticks a date the second scan lists, as any date. */
describe("the tick on a date the second scan lists (spec 0015, AC-14)", () => {
  it.each([
    ["DOB 27-Sep-1980", "27-Sep-1980"],
    ["born on the 1st day of May, 1980", "1st day of May, 1980"],
    ["Date of birth: 12. May 1980", "12. May 1980"],
    ["DOB27/Sep/1980", "27/Sep/1980"],
    ["Born 1980.05.12", "1980.05.12"],
    ["DOB 19800512", "19800512"],
    ["DOB-19800512", "19800512"],
    ["Born 12 / 05 / 1980", "12 / 05 / 1980"],
  ])("ticks the date in %s", (text, date) => {
    expect(found(text)).toEqual([[date, true]]);
  });

  it("leaves a new form with no birth word before it unticked", () => {
    expect(found("Signed 27/Sep/1980 here")).toEqual([["27/Sep/1980", false]]);
  });
});
