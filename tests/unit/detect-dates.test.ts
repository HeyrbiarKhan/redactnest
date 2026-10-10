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
    ["a letter after", "05.12.1980a"],
    ["a hyphen and a digit after", "2026-09-27-01"],
    ["a letter before a written date", "x27 September 2026"],
    ["a letter before a month", "xSeptember 27, 2026"],
    ["a digit after the year", "27 September 20261"],
    ["a letter after the year", "27 September 2026AD"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
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

  /** A joiner is one hyphen or one `/`, never `.` (*Detectors*, `date`). */
  it.each(["05.12.1980.10.12.1980", "2026-09-01.2026-09-30"])(
    "finds neither date where a dot stands between them: %s",
    (text) => {
      expect(found(`Leave ${text} approved`)).toEqual([]);
    },
  );

  /**
   * A joiner parts only where a full date starts right after it. With no 31
   * February beyond the hyphen, the first date runs on into a longer code and
   * is cut, and the second is no date.
   */
  it("finds no date where a joiner leads to an impossible one", () => {
    expect(found("Leave 01/05/1980-31/02/1980 approved")).toEqual([]);
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
   * `TIME_LONGEST` bounds only how far the joiner rule reads for the time's
   * end. The date itself is found whatever the time holds.
   */
  it("finds the date before a time longer than the joiner rule reads", () => {
    expect(texts(`Logged 2026-09-27T10:00:00.${"0".repeat(30)}Z here`)).toEqual([
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

  it.each([
    ["REF-05.12.1980-06.12.1980"],
    ["2026-09-27-01"],
    ["1/05/12/1980"],
    ["05.12.1980.17"],
    ["05.12.1980a"],
    ["05.12.1980T10:00"],
    ["2026-09-27Tuesday"],
    ["x27 September 2026"],
    ["27 September 2026AD"],
  ])("still finds no date read out of the code %s", (text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  /**
   * The joiner parts only where a full date lies beyond it, read with no end
   * check of its own: here the second date runs on into a letter, so it is
   * cut, while the first still sees a full date beyond its hyphen.
   */
  it("parts at a joiner whose far date is then cut on its own", () => {
    expect(texts("01/05/1980-31/05/1980x")).toEqual(["01/05/1980"]);
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
