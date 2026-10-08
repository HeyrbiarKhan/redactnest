import { describe, expect, it } from "vitest";

import { CARD_BRANDS, DETECTORS } from "@/detect";

/**
 * The card detector, on plain strings. Spec 0005, AC-20 and AC-10.
 *
 * Every number here is a published test card number or is built below from a
 * brand's prefix with its own Luhn check digit, so none is anyone's card.
 */

function found(text: string): [string, boolean][] {
  const points = Array.from(text);
  return DETECTORS.card({ text, joins: [] }).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

function texts(text: string): string[] {
  return found(text).map(([card]) => card);
}

/**
 * `body` with the digit appended that makes it pass Luhn, computed here
 * rather than by the detector's own check, so a fault in that check cannot
 * also make the test numbers.
 */
function withCheckDigit(body: string): string {
  const sum = [...body].reverse().reduce((total, character, index) => {
    const doubled = index % 2 === 0 ? Number(character) * 2 : Number(character);
    return total + (doubled > 9 ? doubled - 9 : doubled);
  }, 0);
  return body + String((10 - (sum % 10)) % 10);
}

/** A number of `length` digits starting `prefix`, padded with zeros, that passes Luhn. */
function cardFrom(prefix: string, length: number): string {
  return withCheckDigit(prefix.padEnd(length - 1, "0"));
}

describe("card numbers found and ticked (AC-20, AC-10)", () => {
  it.each([
    ["a Visa test number, spaced", "4111 1111 1111 1111"],
    ["the same, hyphenated", "4111-1111-1111-1111"],
    ["the same, unbroken", "4111111111111111"],
    ["a 13 digit Visa", "4222222222222"],
    ["a Mastercard", "5555 5555 5555 4444"],
    ["a Mastercard in the 2 series", "2223 0031 2200 3222"],
    ["an American Express, grouped 4 6 5", "3782 822463 10005"],
    ["a Discover", "6011 1111 1111 1117"],
    ["a JCB", "3530 1113 3330 0000"],
    ["a Diners Club, 14 digits", "3056 930902 5904"],
    ["a UnionPay", "6200 0000 0000 0005"],
    ["en dashes for hyphens", "4111–1111–1111–1111"],
  ])("finds %s", (_what, card) => {
    expect(found(`Card ${card} on file`)).toEqual([[card, true]]);
  });

  it("finds a number before a sentence's full stop, and each of several", () => {
    expect(texts("Cards 4111 1111 1111 1111 and 5555 5555 5555 4444.")).toEqual([
      "4111 1111 1111 1111",
      "5555 5555 5555 4444",
    ]);
  });

  it("finds a number across a line join, which reads as one space", () => {
    const text = "Card 4111 1111 1111 1111 expires soon";
    expect(
      DETECTORS.card({ text, joins: [14] }).map((span) => [span.start, span.end]),
    ).toEqual([[5, 24]]);
  });
});

describe("every brand's prefixes and lengths (AC-20)", () => {
  const cases = CARD_BRANDS.flatMap((brand) =>
    brand.prefixes.flatMap(([from, to]) =>
      [...brand.lengths].flatMap((length) => [
        [brand.name, from, length],
        [brand.name, to, length],
      ]),
    ),
  );

  it.each(cases)("finds a %s number from %s at %i digits", (_brand, prefix, length) => {
    const card = cardFrom(String(prefix), Number(length));
    expect(texts(`Card ${card} on file`)).toEqual([card]);
  });

  it("pins the table the spec gives", () => {
    expect(
      CARD_BRANDS.map(({ name, prefixes, lengths }) => [
        name,
        prefixes.map(([from, to]) => (from === to ? from : `${from}-${to}`)),
        [...lengths],
      ]),
    ).toEqual([
      ["Visa", ["4"], [13, 16, 19]],
      ["Mastercard", ["51-55", "2221-2720"], [16]],
      ["American Express", ["34", "37"], [15]],
      ["Discover", ["6011", "644-649", "65"], [16, 17, 18, 19]],
      ["JCB", ["3528-3589"], [16, 17, 18, 19]],
      ["Diners Club", ["300-305", "36", "38", "39"], [14, 15, 16, 17, 18, 19]],
      ["UnionPay", ["62"], [16, 17, 18, 19]],
    ]);
  });
});

describe("what the card detector does not read as a card (AC-20)", () => {
  it.each([
    ["a Luhn failure", "4111 1111 1111 1112"],
    ["a prefix no brand uses", cardFrom("1", 16)],
    ["a prefix just below a range", cardFrom("2220", 16)],
    ["a prefix just above a range", cardFrom("2721", 16)],
    ["a length its brand does not issue", cardFrom("4", 15)],
    ["an American Express at 16 digits", cardFrom("34", 16)],
    ["12 digits", cardFrom("4", 12)],
    ["20 digits", cardFrom("62", 20)],
    ["mixed separators", "4111 1111-1111 1111"],
    ["two separators in a row", "4111  1111  1111  1111"],
    ["a dot as separator", "4111.1111.1111.1111"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(`Number ${text} here`)).toEqual([]);
  });
});

describe("a card number is never cut from a longer number", () => {
  it.each([
    ["a digit before", "04111111111111111"],
    ["a digit after", "41111111111111110"],
    ["a spaced group before", "12 4111 1111 1111 1111"],
    ["a spaced group after", "4111 1111 1111 1111 12"],
    ["a hyphenated group after", "4111-1111-1111-1111-12"],
    ["a group of the other separator after", "4111-1111-1111-1111 12"],
    ["a group of the other separator before", "1234-5678 4111 1111 1111 1111"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  it("finds a number with a letter or punctuation beside it", () => {
    expect(texts("Card:4111111111111111, thanks")).toEqual(["4111111111111111"]);
  });
});
