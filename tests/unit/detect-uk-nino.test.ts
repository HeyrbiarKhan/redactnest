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

/**
 * Spec 0005, AC-23, AC-10 and INV-17, as amended on 2026-10-10: a letter glued
 * to the six digits no longer hides the number. It is listed unticked, taking
 * that letter when it is a suffix letter, whatever follows it. A digit glued to
 * the six digits still drops it, as part of a longer number.
 */
describe("a National Insurance number glued to what follows it (AC-23, INV-17)", () => {
  it.each([
    ["a second suffix letter", "AB123456CD", "AB123456C"],
    ["two suffix letters, lower case", "AB123456cd", "AB123456c"],
    ["a letter after its suffix", "AB123456CX", "AB123456C"],
    ["a word after its suffix", "AB123456Cname", "AB123456C"],
    ["a digit after its suffix", "AB123456C7", "AB123456C"],
    // How a footnote marker `¹` after a suffix reads once NFKC has made it `1`.
    ["a footnote marker after its suffix", "AB123456C1", "AB123456C"],
    ["a word starting with a suffix letter", "AB123456Date", "AB123456D"],
    ["a suffix past D", "AB123456E", "AB123456"],
    ["a word starting past D", "AB123456Ename", "AB123456"],
    ["a word glued to a spaced number's suffix", "AB 12 34 56Cname", "AB 12 34 56C"],
    ["a word starting past D glued to a spaced number", "AB 12 34 56Xyz", "AB 12 34 56"],
    ["a letter in another script", "AB123456é", "AB123456"],
  ])("lists it unticked with %s", (_what, text, nino) => {
    expect(found(`Ref ${text} here`)).toEqual([[nino, false]]);
  });

  it.each([
    ["a word after a spaced suffix", "AB 12 34 56 Cname", "AB 12 34 56"],
    ["a digit after a spaced suffix", "AB 12 34 56 C7", "AB 12 34 56"],
    [
      "a word starting with a suffix letter after a spaced suffix",
      "AB 12 34 56 CDate",
      "AB 12 34 56",
    ],
    ["a reference after it", "AB123456 1234", "AB123456"],
    ["its suffix and nothing glued", "AB 12 34 56 C", "AB 12 34 56 C"],
  ])("still lists it ticked with %s", (_what, text, nino) => {
    expect(found(`Ref ${text} here`)).toEqual([[nino, true]]);
  });

  it.each([
    ["a digit after the six digits", "AB1234567"],
    ["a footnote marker after a number with no suffix", "AB1234561"],
    ["a tracking number", "AB123456789GB"],
  ])("still finds nothing with %s", (_what, text) => {
    expect(found(`Ref ${text} here`)).toEqual([]);
  });
});
