import { describe, expect, it } from "vitest";

import { DETECTORS, KEYWORD_REACH, SSN_WORDS } from "@/detect";

/**
 * The US Social Security number detector, on plain strings. Spec 0005, AC-22
 * and AC-10. The numbers follow the SSA's rules and are invented.
 */

function found(text: string): [string, boolean][] {
  const points = Array.from(text);
  return DETECTORS["us-ssn"]({ text, joins: [] }).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

function texts(text: string): string[] {
  return found(text).map(([ssn]) => ssn);
}

describe("Social Security numbers found and ticked (AC-22, AC-10)", () => {
  it.each([
    ["hyphenated", "123-45-6789"],
    ["spaced", "123 45 6789"],
    ["with non breaking hyphens", "123‑45‑6789"],
    ["the highest area the SSA issues", "899-45-6789"],
    ["an area of 665 and 667", "665-01-0001"],
    ["an area of 667", "667-01-0001"],
  ])("finds one %s", (_what, ssn) => {
    expect(found(`Number ${ssn} on file`)).toEqual([[ssn, true]]);
  });

  it("finds each of several, and one before a full stop", () => {
    expect(texts("Either 123-45-6789 or 234-56-7890.")).toEqual([
      "123-45-6789",
      "234-56-7890",
    ]);
  });

  it.each(SSN_WORDS)("finds a bare nine digit run after %s, in any case", (word) => {
    expect(found(`${word}: 123456789`)).toEqual([["123456789", true]]);
    expect(found(`${word.toLowerCase()} 123456789`)).toEqual([["123456789", true]]);
  });

  it("finds a bare run when the SSN word ends exactly KEYWORD_REACH before", () => {
    const gap = " ".repeat(KEYWORD_REACH);
    expect(texts(`SSN${gap}123456789`)).toEqual(["123456789"]);
    expect(texts(`SSN ${gap}123456789`)).toEqual([]);
  });
});

describe("what the SSN detector does not read as one (AC-22)", () => {
  it.each([
    ["an area of 000", "000-12-3456"],
    ["an area of 666", "666-12-3456"],
    ["an area of 900", "900-12-3456"],
    ["an area of 999", "999-12-3456"],
    ["a group of 00", "123-00-4567"],
    ["a serial of 0000", "123-45-0000"],
    ["mixed separators", "123-45 6789"],
    ["a hyphen and an en dash", "123-45–6789"],
    ["a dot as separator", "123.45.6789"],
    ["parts of the wrong sizes", "1234-5-6789"],
    ["two separators in a row", "123--45--6789"],
    ["a bare run with no SSN word", "123456789"],
    ["a bare run after a word that only contains SSN", "SSNX 123456789"],
    ["ten bare digits after an SSN word", "SSN 1234567890"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  it("finds nothing with a digit before", () => {
    expect(found("0123-45-6789")).toEqual([]);
  });

  /**
   * One digit after a separated number is a footnote marker (third update of
   * 2026-10-11): the number is listed without it, unticked. The marker cases
   * are below.
   */
  it("finds the number alone, unticked, with a digit after", () => {
    expect(found("123-45-67890")).toEqual([["123-45-6789", false]]);
  });

  /**
   * *Detectors* (`us-ssn`): a bare run counts only "under the same rules", so
   * the SSN word lets in the shape, never a number the SSA would not issue.
   */
  it.each([
    ["an area of 000", "000123456"],
    ["an area of 666", "666123456"],
    ["an area of 900", "900123456"],
    ["a group of 00", "123004567"],
    ["a serial of 0000", "123450000"],
  ])("finds nothing in a bare run after an SSN word with %s", (_what, digits) => {
    expect(found(`SSN: ${digits}`)).toEqual([]);
  });
});

/**
 * Spec 0005, AC-28: a Social Security number with a date or a reference
 * after it, or digits before it, is found whole. Pinned so a later edit to
 * the boundary rules cannot bring in the miss a card had. The same layouts
 * through `detect` are in `detect.test.ts`.
 */
describe("a Social Security number beside other digits (AC-28)", () => {
  it.each([
    ["a date after it", "123-45-6789 15/03/2026", "123-45-6789"],
    ["a reference after it, spaced", "123 45 6789 1234", "123 45 6789"],
    ["digits before it", "12 123-45-6789", "123-45-6789"],
  ])("finds one whole with %s", (_what, text, ssn) => {
    expect(found(text)).toEqual([[ssn, true]]);
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

/**
 * Spec 0005, AC-22, third update of 2026-10-11: a footnote marker stuck after
 * a separated number does not hide it. Exactly one ASCII digit with no digit
 * after it is the marker, outside the row, and the number starts unticked.
 */
describe("a footnote marker after a Social Security number (AC-22, AC-10)", () => {
  it.each([
    ["SSN 123-45-6789¹", "123-45-6789"],
    ["SSN 123 45 6789¹", "123 45 6789"],
    ["Number 123-45-6789³ on file", "123-45-6789"],
  ])("lists the number in %s, unticked, the marker outside", (text, ssn) => {
    expect(found(nfkc(text))).toEqual([[ssn, false]]);
  });

  it.each([
    ["two marker digits", "SSN 123-45-6789¹²"],
    ["a marker then a digit in another script", "SSN 123-45-67891١"],
    ["a bare run with a marker", "SSN 123456789¹"],
    ["a bare run with a digit after", "SSN 1234567891"],
    ["a marker after a number the SSA never issues", "SSN 666-45-6789¹"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(nfkc(text))).toEqual([]);
  });
});
