import { describe, expect, it } from "vitest";

import { DETECTORS, IBAN_LENGTHS } from "@/detect";

/**
 * The IBAN detector, on plain strings. Spec 0005, AC-21 and AC-10.
 *
 * The IBANs here are the examples banks and the ECBS publish for each
 * country, which pass the check and name no real account.
 */

function found(text: string): [string, boolean][] {
  const points = Array.from(text);
  return DETECTORS.iban({ text, joins: [] }).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

function texts(text: string): string[] {
  return found(text).map(([iban]) => iban);
}

describe("IBANs found and ticked (AC-21, AC-10)", () => {
  it.each([
    ["a UK IBAN in groups of four", "GB82 WEST 1234 5698 7654 32"],
    ["the same, unbroken", "GB82WEST12345698765432"],
    ["a German IBAN", "DE89 3704 0044 0532 0130 00"],
    ["a French IBAN, letters inside", "FR14 2004 1010 0505 0001 3M02 606"],
    ["a Dutch IBAN", "NL91 ABNA 0417 1643 00"],
    ["a Spanish IBAN", "ES91 2100 0418 4502 0005 1332"],
    ["an Italian IBAN", "IT60 X054 2811 1010 0000 0123 456"],
    ["an Irish IBAN", "IE29 AIBK 9311 5212 3456 78"],
    ["a Belgian IBAN, the shortest group last", "BE68 5390 0754 7034"],
    ["a Norwegian IBAN, the shortest length", "NO93 8601 1117 947"],
  ])("finds %s", (_what, iban) => {
    expect(found(`IBAN: ${iban} today`)).toEqual([[iban, true]]);
  });

  it("finds an IBAN before a sentence's full stop, and each of several", () => {
    expect(texts("Pay GB82 WEST 1234 5698 7654 32 or DE89370400440532013000.")).toEqual([
      "GB82 WEST 1234 5698 7654 32",
      "DE89370400440532013000",
    ]);
  });

  it("finds a grouped IBAN across a line join, which reads as one space", () => {
    const text = "Pay GB82 WEST 1234 5698 7654 32 now";
    expect(
      DETECTORS.iban({ text, joins: [18] }).map((span) => [span.start, span.end]),
    ).toEqual([[4, 31]]);
  });
});

describe("IBAN_LENGTHS", () => {
  /** A sample from the SWIFT IBAN Registry, as the spec asks. */
  it.each([
    ["GB", 22],
    ["DE", 22],
    ["FR", 27],
    ["NL", 18],
    ["ES", 24],
    ["IT", 27],
    ["IE", 22],
  ])("gives %s a length of %i", (country, length) => {
    expect(IBAN_LENGTHS[country]).toBe(length);
  });

  it("holds every registry country, each between 15 and 34 characters", () => {
    const lengths = Object.entries(IBAN_LENGTHS);
    expect(lengths).toHaveLength(89);
    for (const [country, length] of lengths) {
      expect(country).toMatch(/^[A-Z]{2}$/u);
      expect(length).toBeGreaterThanOrEqual(15);
      expect(length).toBeLessThanOrEqual(34);
    }
  });
});

describe("what the IBAN detector does not read as an IBAN (AC-21)", () => {
  it.each([
    ["a wrong check", "GB82 WEST 1234 5698 7654 33"],
    ["two characters swapped", "GB82 WEST 1234 5698 7645 32"],
    ["a country not in the registry", "XX82 WEST 1234 5698 7654 32"],
    ["one character too few", "GB82 WEST 1234 5698 7654 3"],
    ["one character too many, unbroken", "GB82WEST123456987654321"],
    ["lower case", "gb82 west 1234 5698 7654 32"],
    ["letters for check digits", "GBAB WEST 1234 5698 7654 32"],
    ["groups of three", "GB8 2WE ST1 234 569 876 543 2"],
    ["a space inside a group", "GB82 WE ST 1234 5698 7654 32"],
    ["two spaces between groups", "GB82  WEST  1234  5698  7654  32"],
    // Unbroken or grouped throughout, never half of each.
    ["a space after the first four only", "GB82 WEST12345698765432"],
    ["spaces after the first eight only", "GB82WEST 1234 5698 7654 32"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(`IBAN ${text} here`)).toEqual([]);
  });

  it.each([
    ["a letter before", "XGB82WEST12345698765432"],
    ["a digit before", "1GB82WEST12345698765432"],
    ["a letter after", "GB82WEST12345698765432X"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  it("finds an IBAN with punctuation beside it", () => {
    expect(texts("(GB82WEST12345698765432)")).toEqual(["GB82WEST12345698765432"]);
  });
});

/**
 * Spec 0005, AC-28: an IBAN with a date, a year or a reference after it, or
 * digits before it, is found whole. Pinned so a later edit to the boundary
 * rules cannot bring in the miss a card had. The same layouts through
 * `detect` are in `detect.test.ts`.
 */
describe("an IBAN beside other digits (AC-28)", () => {
  it.each([
    [
      "a date after it",
      "GB82 WEST 1234 5698 7654 32 15/03/2026",
      "GB82 WEST 1234 5698 7654 32",
    ],
    ["a reference after it", "GB82WEST12345698765432 1234", "GB82WEST12345698765432"],
    ["digits before it", "12 GB82 WEST 1234 5698 7654 32", "GB82 WEST 1234 5698 7654 32"],
  ])("finds one whole with %s", (_what, text, iban) => {
    expect(found(text)).toEqual([[iban, true]]);
  });
});
