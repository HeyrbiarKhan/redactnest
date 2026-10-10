import { describe, expect, it } from "vitest";

import { CARD_BRANDS, CARD_GROUP_DIGITS, detect, DETECTORS } from "@/detect";
import type { DetectorKind } from "@/worker/protocol";

/**
 * The card detector, on plain strings. Spec 0005, AC-20, AC-28, AC-10 and
 * INV-15.
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

/** `digits` cut into groups of `sizes` digits, in order, parted by single spaces. */
function spaced(digits: string, sizes: readonly number[]): string {
  let at = 0;
  return sizes
    .map((size) => {
      const group = digits.slice(at, at + size);
      at += size;
      return group;
    })
    .join(" ");
}

/**
 * A 19 digit Visa whose first 16 digits also pass: 15 digits from the
 * brand's prefix, the check digit that makes 16 pass, two more digits, then
 * the check digit that makes 19 pass. Spaced 4 4 4 4 3, its first 16 are a
 * window of their own, so this is what tells the longest window from a start
 * apart from the shortest.
 */
const NINETEEN = withCheckDigit(`${withCheckDigit("453921803765777")}35`);
const NINETEEN_SPACED = spaced(NINETEEN, [4, 4, 4, 4, 3]);

/** A CVV that, after `4111111111111111`, makes 19 digits that pass together. */
const CVV = "003";

/**
 * Unbroken digits and digits glued by hyphens are one unit, never cut
 * (INV-15). Units parted by one space are separate, so a card is read out of
 * the run they make.
 */
describe("a card number is never cut from a unit, but is read out of a run", () => {
  it.each([
    ["a digit before", "04111111111111111"],
    ["a digit after", "41111111111111110"],
    ["a hyphenated group after", "4111-1111-1111-1111-12"],
    // INV-15 from the other side: the hyphen glues `12` to the card's first
    // digit, so the unit is 18 digits starting `1`, which no brand issues.
    ["a hyphenated group before", "12-4111111111111111"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  it.each([
    ["a spaced group before", "12 4111 1111 1111 1111", "4111 1111 1111 1111"],
    ["a spaced group after", "4111 1111 1111 1111 12", "4111 1111 1111 1111"],
    [
      "a group of the other separator after",
      "4111-1111-1111-1111 12",
      "4111-1111-1111-1111",
    ],
    [
      "a group of the other separator before",
      "1234-5678 4111 1111 1111 1111",
      "4111 1111 1111 1111",
    ],
  ])("finds the card alone with %s", (_what, text, card) => {
    expect(found(text)).toEqual([[card, true]]);
  });

  it("finds a number with a letter or punctuation beside it", () => {
    expect(texts("Card:4111111111111111, thanks")).toEqual(["4111111111111111"]);
  });
});

/**
 * Spec 0005, AC-28: a card with other digits beside it, parted by one space,
 * a line join, or a hyphen or dash next to an expiry or a date, is found
 * whole, ticked, and alone.
 */
describe("a card beside other digits (AC-28)", () => {
  it.each([
    ["before its expiry", "4111111111111111 12/28", "4111111111111111"],
    ["hyphenated, before its expiry", "4111-1111-1111-1111 12/28", "4111-1111-1111-1111"],
    [
      "an American Express, before its expiry",
      "3782 822463 10005 12/28",
      "3782 822463 10005",
    ],
    ["a Diners Club, before its expiry", "3056 930902 5904 12/28", "3056 930902 5904"],
    ["after a row number", "1 4111 1111 1111 1111", "4111 1111 1111 1111"],
    ["typed against its expiry", "4111111111111111-12/28", "4111111111111111"],
    [
      "spaced, against its expiry by an en dash",
      "4111 1111 1111 1111–12/28",
      "4111 1111 1111 1111",
    ],
    ["after an expiry and a hyphen", "12/28-4111111111111111", "4111111111111111"],
    ["after a slashed group", "12/4111111111111111", "4111111111111111"],
    ["before a slashed group", "4111111111111111/12", "4111111111111111"],
    ["after a dotted digit", "1.4111111111111111", "4111111111111111"],
  ])("finds a card %s", (_what, text, card) => {
    expect(found(text)).toEqual([[card, true]]);
  });

  it("finds two unbroken cards side by side", () => {
    expect(found("4111111111111111 5555555555554444")).toEqual([
      ["4111111111111111", true],
      ["5555555555554444", true],
    ]);
  });

  it("finds a spaced card before a spaced phone number, and takes none of it", () => {
    expect(texts("4111 1111 1111 1111 020 7946 0958")).toEqual(["4111 1111 1111 1111"]);
  });

  /**
   * Through `detect`, with every other kind: no phone row holds a digit of
   * the card. Before, the American Express and Diners Club cards were listed
   * as phone numbers cut from their first ten digits. The lone `4` before the
   * last card reads with the card's first group as a possible UK number
   * (`4 4111 1111`), so it stays as an unticked phone piece of its own (AC-3,
   * INV-16), holding no digit of the card.
   */
  it.each<[string, [DetectorKind, string][]]>([
    ["3782 822463 10005 12/28", [["card", "3782 822463 10005"]]],
    ["3056 930902 5904 12/28", [["card", "3056 930902 5904"]]],
    [
      "4 4111 1111 1111 1111",
      [
        ["phone", "4"],
        ["card", "4111 1111 1111 1111"],
      ],
    ],
  ])("leaves no card digit to a phone row through detect: %s", (text, expected) => {
    const points = Array.from(text);
    expect(
      detect({ text, joins: [] }).map((span) => [
        span.kind,
        points.slice(span.start, span.end).join(""),
      ]),
    ).toEqual(expected);
  });
});

describe("a hyphen glues digits, unless it sits next to an expiry or a date (AC-28)", () => {
  it.each([
    ["eighteen unbroken digits", "411111111111111112"],
    ["a hyphenated group after, with no slash", "4111-1111-1111-1111-12"],
    ["a hyphen before an expiry with no slash", "4111111111111111-1228"],
    ["a licence key", "1234-5678-9012-3456-7890"],
  ])("finds no card in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });
});

/**
 * A spaced card is grouped as cards are printed and as payment forms group
 * them (`CARD_GROUP_DIGITS`): a first group of 4 to 6 digits, a last of 1 to
 * 6, every other 3 to 6.
 */
describe("the groups of a spaced card (AC-28)", () => {
  it.each([
    ["a payment form's short last group", "4222 2222 2222 2"],
    ["a 17 digit card spaced 4 4 4 4 1", spaced(cardFrom("6011", 17), [4, 4, 4, 4, 1])],
    ["an 18 digit card spaced 4 4 4 4 2", spaced(cardFrom("6011", 18), [4, 4, 4, 4, 2])],
  ])("finds %s whole", (_what, card) => {
    expect(found(`Card ${card} on file`)).toEqual([[card, true]]);
  });

  it.each([
    ["two spaces between groups", "4111  1111  1111  1111"],
    // *Detectors* (`card`) step 2: only one space joins a run.
    ["tabs between groups", "4111\t1111\t1111\t1111"],
    ["pairs", "41 11 11 11 11 11 11 11"],
  ])("finds no card in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  /**
   * Each edge of `CARD_GROUP_DIGITS`, one group just inside and one just
   * outside. The pin below holds the numbers; these hold that each bound is
   * applied to its own place in the card. Every number is the Visa
   * `4000000000000002` regrouped, so any window that does not start at the
   * `4` starts at a `0`, which no brand issues, and only the whole card can
   * pass.
   */
  const VISA = cardFrom("4", 16);

  it.each([
    ["a first group of 6", [6, 4, 6]],
    ["a middle group of 3", [4, 3, 4, 5]],
    ["a last group of 6", [4, 6, 6]],
  ] as const)("finds the card with %s", (_what, sizes) => {
    const card = spaced(VISA, sizes);
    expect(found(`Card ${card} on file`)).toEqual([[card, true]]);
  });

  it.each([
    ["a first group of 3", [3, 4, 4, 5]],
    ["a first group of 7", [7, 4, 5]],
    ["a middle group of 2", [4, 2, 5, 5]],
    ["a last group of 7", [4, 5, 7]],
  ] as const)("finds no card with %s", (_what, sizes) => {
    expect(found(`Card ${spaced(VISA, sizes)} on file`)).toEqual([]);
  });

  it.each([
    ["unbroken", "4111111111111111"],
    ["hyphenated", "41-11-11-11-11-11-11-11"],
  ])("finds the same pairs %s", (_what, card) => {
    expect(found(card)).toEqual([[card, true]]);
  });

  it("pins the group sizes the spec gives", () => {
    expect(CARD_GROUP_DIGITS).toEqual({ first: [4, 6], middle: [3, 6], last: [1, 6] });
  });
});

/**
 * From each start, the longest window that passes, and the row carried on
 * while a later start inside it has a passing window that reaches further.
 * Spec 0005, *Detectors* (`card`) step 5, as rewritten on 2026-10-10.
 */
describe("choosing where a card ends (AC-28)", () => {
  it("is tried on a 19 digit card whose first 16 also pass", () => {
    expect(texts(NINETEEN)).toEqual([NINETEEN]);
    expect(texts(NINETEEN.slice(0, 16))).toEqual([NINETEEN.slice(0, 16)]);
  });

  it.each([
    ["alone", NINETEEN_SPACED],
    ["before an expiry", `${NINETEEN_SPACED} 12/28`],
    ["before a hyphen and an expiry", `${NINETEEN_SPACED}-12/28`],
    ["before a date", `${NINETEEN_SPACED} 05/12/2026`],
  ])("takes a 19 digit card whole %s", (_what, text) => {
    expect(texts(text)).toEqual([NINETEEN_SPACED]);
  });

  it("takes a 19 digit card whole before a spaced expiry", () => {
    expect(texts(`${NINETEEN_SPACED} 12 28`)).toEqual([NINETEEN_SPACED]);
  });

  it("takes a 19 digit card whole when it is unbroken, whatever follows", () => {
    expect(texts(`${NINETEEN} 12 28`)).toEqual([NINETEEN]);
  });

  /**
   * A dot or a slash ends the run, so the 19 digit window is the longest
   * from the card's start whatever is glued on beyond it. Unbroken, the card
   * is one unit, never cut, so it stays whole too.
   */
  it.each([
    ["a dot", "."],
    ["a slash", "/"],
  ])("takes a 19 digit card whole when %s and a digit follow it", (_what, glue) => {
    expect(texts(`${NINETEEN_SPACED}${glue}5`)).toEqual([NINETEEN_SPACED]);
    expect(texts(`${NINETEEN}${glue}5`)).toEqual([NINETEEN]);
  });

  it("takes a CVV that ends the run when the two pass together", () => {
    expect(texts(`4111 1111 1111 1111 ${CVV}`)).toEqual([`4111 1111 1111 1111 ${CVV}`]);
  });

  it("takes a CVV when the two pass together and more digits follow it", () => {
    expect(texts(`4111 1111 1111 1111 ${CVV} 1234`)).toEqual([
      `4111 1111 1111 1111 ${CVV}`,
    ]);
  });
});

/**
 * Where two windows that pass overlap, the card's row covers both, so no
 * digit of a real card is left without a row whatever stands beside it.
 * Spec 0005, AC-28 and INV-15, as amended on 2026-10-10. Each number before
 * the Visa test card makes a 16 digit Mastercard or Diners Club window that
 * passes by chance; before, that false window was the only row, and the
 * card's last group was left in the file.
 */
describe("overlapping card windows share one row (AC-28, INV-15)", () => {
  it.each([
    "2226 4111 1111 1111 1111",
    "2234 4111 1111 1111 1111",
    "2259 4111 1111 1111 1111",
    "2309 4111 1111 1111 1111",
    "30003 4111 1111 1111 1111",
    "300000 4111 1111 1111 1111",
  ])("lists every digit of %s as one card", (text) => {
    expect(found(`Ref ${text} on file`)).toEqual([[text, true]]);
  });

  it("starts the row at the first window that passes", () => {
    expect(found("Ref 1000 4016 4111 1111 1111 1111 on file")).toEqual([
      ["4016 4111 1111 1111 1111", true],
    ]);
  });

  /**
   * Through `detect`: carrying a row never reaches a neighbour no passing
   * window holds, so a Social Security number cut by a false card keeps the
   * rest as its own piece (`detect.test.ts`), and a phone number after a card
   * keeps all of its digits.
   */
  it.each<[string, [DetectorKind, string][]]>([
    [
      "Ref 3400 0000 0005 123 45 6789 on file",
      [
        ["card", "3400 0000 0005 123"],
        ["us-ssn", "45 6789"],
      ],
    ],
    [
      "4111 1111 1111 1111 020 7946 0958",
      [
        ["card", "4111 1111 1111 1111"],
        ["phone", "020 7946 0958"],
      ],
    ],
  ])("leaves a neighbour no passing window holds its own row: %s", (text, expected) => {
    const points = Array.from(text);
    expect(
      detect({ text, joins: [] }).map((span) => [
        span.kind,
        points.slice(span.start, span.end).join(""),
      ]),
    ).toEqual(expected);
  });

  /**
   * Pinned, so the merge is a known behaviour: every start's window passes,
   * so the row is carried to the run's end.
   */
  it("lists a run where every start passes as one row", () => {
    const text = "4242 4242 4242 4242 4242 4242 4242 4242";
    expect(found(text)).toEqual([[text, true]]);
  });

  /**
   * The case the update closes, built from random cards rather than chosen:
   * whatever stands before or after a card, every digit of it lies inside a
   * card row. The generator is seeded, so a failure names a fixed layout.
   */
  it("leaves no digit of a real card without a card row, whatever its neighbours", () => {
    let seed = 20261010;
    const random = (below: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % below;
    };
    const digits = (count: number): string =>
      Array.from({ length: count }, () => String(random(10))).join("");
    const prefixes = ["4", "51", "2221", "6011", "3528", "62"];

    for (let trial = 0; trial < 400; trial += 1) {
      const card = cardFrom(prefixes[trial % prefixes.length] + digits(6), 16);
      const before = random(2) === 0 ? `${digits(4 + random(3))} ` : "";
      const after = random(2) === 0 ? ` ${digits(1 + random(6))}` : "";
      const text = `Ref ${before}${spaced(card, [4, 4, 4, 4])}${after} on file`;
      // Every character before the card is ASCII, so offsets and code points agree.
      const from = "Ref ".length + before.length;
      const to = from + "4111 1111 1111 1111".length;

      const rows = DETECTORS.card({ text, joins: [] });
      expect(
        rows.some((row) => row.start <= from && row.end >= to),
        text,
      ).toBe(true);
    }
  });
});
