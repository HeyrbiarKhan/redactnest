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
    ["a five digit year", "on 1 May 20261 we"],
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
    ["a time joined to an ISO date", "2026-09-27T10:00"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  it("still finds a date after a hyphen or slash with a space before it", () => {
    expect(texts("Dates - 05.12.1980 / 06.12.1980")).toEqual([
      "05.12.1980",
      "06.12.1980",
    ]);
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
});
