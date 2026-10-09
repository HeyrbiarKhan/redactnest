import { describe, expect, it } from "vitest";

import { DETECTORS, NI_PREFIX_RULES } from "@/detect";

/**
 * The UK National Insurance number detector, on plain strings. Spec 0005,
 * AC-23 and AC-10. The numbers follow HMRC's prefix rules and are invented.
 */

function found(text: string): [string, boolean][] {
  const points = Array.from(text);
  return DETECTORS["uk-nino"]({ text, joins: [] }).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

function texts(text: string): string[] {
  return found(text).map(([nino]) => nino);
}

describe("National Insurance numbers found and ticked (AC-23, AC-10)", () => {
  it.each([
    ["spaced, with its suffix", "AB 12 34 56 C"],
    ["unbroken, in lower case", "ab123456c"],
    ["with no suffix", "AB123456"],
    ["spaced, with no suffix", "AB 12 34 56"],
    ["each space optional on its own", "AB12 3456 D"],
    ["a space before the suffix only", "AB123456 A"],
    ["mixed case", "Ab 12 34 56 b"],
  ])("finds one %s", (_what, nino) => {
    expect(found(`NI number ${nino} on file`)).toEqual([[nino, true]]);
  });

  it("finds each of several, and one before a full stop", () => {
    expect(texts("Either AB123456C or CE 65 43 21 D.")).toEqual([
      "AB123456C",
      "CE 65 43 21 D",
    ]);
  });

  it("leaves a word starting A to D after the number out of it", () => {
    expect(texts("AB 12 34 56 applies")).toEqual(["AB 12 34 56"]);
    expect(texts("AB123456 Dear")).toEqual(["AB123456"]);
  });
});

describe("HMRC's prefix rules (AC-23)", () => {
  it("pins the rules the spec gives", () => {
    expect([...NI_PREFIX_RULES.neverFirst]).toEqual(["D", "F", "I", "Q", "U", "V"]);
    expect([...NI_PREFIX_RULES.neverSecond]).toEqual(["D", "F", "I", "O", "Q", "U", "V"]);
    expect([...NI_PREFIX_RULES.neverPair]).toEqual([
      "BG",
      "GB",
      "KN",
      "NK",
      "NT",
      "TN",
      "ZZ",
    ]);
  });

  it.each([...NI_PREFIX_RULES.neverFirst])("never starts with %s", (letter) => {
    expect(found(`${letter}A123456C`)).toEqual([]);
    expect(found(`${letter.toLowerCase()}a123456c`)).toEqual([]);
  });

  it.each([...NI_PREFIX_RULES.neverSecond])("never has %s second", (letter) => {
    expect(found(`A${letter}123456C`)).toEqual([]);
  });

  it.each([...NI_PREFIX_RULES.neverPair])("never has the prefix %s", (pair) => {
    expect(found(`${pair}123456C`)).toEqual([]);
    expect(found(`${pair.toLowerCase()} 12 34 56 c`)).toEqual([]);
  });

  it("does not read HMRC's own example, whose Q is never used", () => {
    expect(found("QQ 12 34 56 C")).toEqual([]);
  });
});

describe("what the NI detector does not read as one (AC-23)", () => {
  it.each([
    ["five digits", "AB12345C"],
    ["seven digits", "AB1234567"],
    ["a suffix past D", "AB123456E"],
    ["two spaces", "AB  12 34 56 C"],
    ["a space inside a pair", "AB 1 234 56 C"],
    ["one letter", "A123456C"],
    ["three letters", "ABC123456C"],
    ["letters other than A to Z", "ÀB123456C"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });

  it.each([
    ["a letter before", "XAB123456C"],
    ["a digit before", "1AB123456C"],
    ["a letter after", "AB123456CX"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });
});

/**
 * Spec 0005, AC-28: a National Insurance number with a date or a reference
 * after it, or digits before it, is found whole. Pinned so a later edit to
 * the boundary rules cannot bring in the miss a card had. The same layouts
 * through `detect` are in `detect.test.ts`.
 */
describe("a National Insurance number beside other digits (AC-28)", () => {
  it.each([
    ["a date after it", "AB 12 34 56 C 15/03/2026", "AB 12 34 56 C"],
    ["a reference after it", "AB123456C 1234", "AB123456C"],
    ["digits before it", "12 AB123456C", "AB123456C"],
  ])("finds one whole with %s", (_what, text, nino) => {
    expect(found(text)).toEqual([[nino, true]]);
  });
});
