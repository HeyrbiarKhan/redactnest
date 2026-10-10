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
    // Its first 19 digits fail Luhn, so it is no card with a footnote marker
    // either; `cardFrom("62", 20)`, whose first 19 pass, is pinned below.
    ["20 digits", cardFrom("621", 20)],
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
    ["a hyphenated group after", "4111-1111-1111-1111-12"],
    // INV-15 from the other side: the hyphen glues `12` to the card's first
    // digit, so the unit is 18 digits starting `1`, which no brand issues.
    ["a hyphenated group before", "12-4111111111111111"],
  ])("finds nothing with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  /**
   * One digit after a card is read as a footnote marker (third update of
   * 2026-10-11): the card is listed without it, unticked. The marker cases
   * are below.
   */
  it("finds the card alone, unticked, with a digit after", () => {
    expect(found("41111111111111110")).toEqual([["4111111111111111", false]]);
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

  /**
   * Step 3: only bare units are spaced into a card, and a spaced card opens
   * with 4 to 6 digits. So taking the longest passing window never reaches
   * past an unbroken or hyphenated card, even to a CVV the two would pass
   * with.
   */
  it.each([
    ["unbroken", "4111111111111111"],
    ["hyphenated", "4111-1111-1111-1111"],
  ])("leaves a CVV the two would pass with out of a card written %s", (_what, card) => {
    expect(found(`${card} ${CVV} on file`)).toEqual([[card, true]]);
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
   * The other side of the case above: a phone number on the next line whose
   * first group passes with the card. `4000 0000 0000 0044` is built so that
   * its 19 digits with `020` pass as a Visa too, so the row takes `020`, and
   * the rest of the number keeps its own row (AC-3, INV-16) instead of going
   * with the card or being dropped.
   */
  it("keeps the rest of a phone number whose first group joins a card's row", () => {
    const card = "4000 0000 0000 0044";
    const text = `Card ${card} 020 7946 0958 today`;
    const points = Array.from(text);
    const join = text.indexOf(" 020");
    expect(withCheckDigit(`${card.replaceAll(" ", "")}02`)).toBe(
      `${card.replaceAll(" ", "")}020`,
    );

    expect(
      detect({ text, joins: [join] }).map((span) => [
        span.kind,
        points.slice(span.start, span.end).join(""),
      ]),
    ).toEqual([
      ["card", `${card} 020`],
      ["phone", "7946 0958"],
    ]);
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
   * With `marker`, a footnote digit is glued after the card (third update of
   * 2026-10-11), and every card digit still lies inside a card row.
   */
  function expectEveryCardDigitInARow(marker: boolean): void {
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
      const glued = marker ? digits(1) : "";
      const after = random(2) === 0 ? ` ${digits(1 + random(6))}` : "";
      const text = `Ref ${before}${spaced(card, [4, 4, 4, 4])}${glued}${after} on file`;
      // Every character before the card is ASCII, so offsets and code points agree.
      const from = "Ref ".length + before.length;
      const to = from + "4111 1111 1111 1111".length;

      const rows = DETECTORS.card({ text, joins: [] });
      expect(
        rows.some((row) => row.start <= from && row.end >= to),
        text,
      ).toBe(true);
    }
  }

  it("leaves no digit of a real card without a card row, whatever its neighbours", () => {
    expectEveryCardDigitInARow(false);
  });

  it("leaves no digit of a real card without a card row with a marker after it", () => {
    expectEveryCardDigitInARow(true);
  });

  /**
   * INV-15 as amended, checked against every window rather than one card:
   * in runs of spaced groups built at random around real cards, every window
   * that passes lies inside one card row, no two rows share a digit, and each
   * row starts on a group's edge and ends on one (step 6), or one digit before
   * the end of a group of two or more, where that digit is a footnote marker
   * (third update of 2026-10-11). Every tolerated window lies inside one card
   * row too, all but its marker. Which windows pass or are tolerated is worked
   * out here from steps 3 and 4 as the spec writes them, with this file's own
   * Luhn digit, not asked of the detector. Seeded, so a failure names a fixed
   * run.
   */
  it("puts every window that passes inside one card row, and no digit in two (INV-15)", () => {
    let state = 20261010;
    const random = (below: number): number => {
      state = (state * 48_271) % 2_147_483_647;
      return state % below;
    };
    const digits = (count: number): string =>
      Array.from({ length: count }, () => String(random(10))).join("");
    const prefixes = ["4", "51", "2221", "6011", "3528", "62"];
    const pieces: (() => string)[] = [
      () =>
        spaced(cardFrom(prefixes[random(prefixes.length)] + digits(6), 16), [4, 4, 4, 4]),
      () => spaced(cardFrom(`37${digits(6)}`, 15), [4, 6, 5]),
      () => cardFrom(`4${digits(6)}`, 16),
      // Short groups, some opening as a brand does, so windows pass by chance.
      () => digits(1 + random(6)),
      () => `4${digits(3 + random(3))}`,
      () => `5${digits(3)}`,
    ];

    let windowsPassed = 0;
    let windowsTolerated = 0;
    let rowsCarried = 0;
    for (let trial = 0; trial < 500; trial += 1) {
      const groups = Array.from({ length: 2 + random(6) }, () =>
        pieces[random(pieces.length)](),
      )
        .join(" ")
        .split(" ");
      const text = `Ref ${groups.join(" ")} on file`;
      // Every character is ASCII, so offsets and code points agree.
      const starts = groups.map(
        (_, index) =>
          "Ref ".length + groups.slice(0, index).join(" ").length + (index > 0 ? 1 : 0),
      );
      const ends = groups.map((group, index) => starts[index] + group.length);
      const markedEnds = groups.flatMap((group, index) =>
        group.length >= 2 ? [ends[index] - 1] : [],
      );
      const rows = DETECTORS.card({ text, joins: [] });

      for (const [index, row] of rows.entries()) {
        expect(starts, text).toContain(row.start);
        expect([...ends, ...markedEnds], text).toContain(row.end);
        if (index > 0) expect(row.start, text).toBeGreaterThan(rows[index - 1].end);
      }

      for (let first = 0; first < groups.length; first += 1) {
        for (let last = first; last < groups.length; last += 1) {
          const window = groups.slice(first, last + 1);
          const passing = isWindow(window, 19) && passesStep4(window.join(""));
          const tolerated = isWindow(window, 20) && isTolerated(window);
          if (!passing && !tolerated) continue;
          // A tolerated window's marker may lie outside the row.
          const end = passing ? ends[last] : ends[last] - 1;
          if (passing) windowsPassed += 1;
          else windowsTolerated += 1;
          const holding = rows.filter(
            (row) => row.start <= starts[first] && row.end >= end,
          );
          expect(holding, `${text}: ${window.join(" ")}`).toHaveLength(1);
          if (holding[0].start !== starts[first] || holding[0].end !== end) {
            rowsCarried += 1;
          }
        }
      }
    }

    // The runs must hold overlapping windows, or the check above proves little.
    // This seed gives 1,167 windows that pass, 30 more only tolerated, and 129
    // windows inside a row carried past them.
    expect(windowsPassed).toBeGreaterThan(500);
    expect(windowsTolerated).toBeGreaterThan(20);
    expect(rowsCarried).toBeGreaterThan(40);
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
 * Spec 0005, AC-20 and INV-15, third update of 2026-10-11: a footnote marker
 * stuck after a card does not hide it. A window whose last unit ends in a
 * group of two or more digits, and passes without that unit's last digit, is
 * tolerated: the card is listed with the marker outside its row, unticked,
 * unless a window inside the row passes whole.
 */
describe("a footnote marker after a card (AC-20, AC-10, INV-15)", () => {
  it.each([
    ["Card 4111 1111 1111 1111¹", "4111 1111 1111 1111"],
    ["Card 4111-1111-1111-1111¹", "4111-1111-1111-1111"],
    ["Card 4111111111111111¹", "4111111111111111"],
    ["41111111111111110", "4111111111111111"],
    ["Amex 378282246310005¹", "378282246310005"],
    ["Visa 4222222222222¹", "4222222222222"],
    ["Card 4111 1111 1111 1111² on file", "4111 1111 1111 1111"],
  ])("lists the card in %s alone, unticked", (text, card) => {
    expect(found(nfkc(text))).toEqual([[card, false]]);
  });

  it("lists a card with a marker and the card after it, each its own row", () => {
    expect(found("4111 1111 1111 11111 5555 5555 5555 4444")).toEqual([
      ["4111 1111 1111 1111", false],
      ["5555 5555 5555 4444", true],
    ]);
  });

  /**
   * The marker must be the last digit of a group of two or more, and only
   * one: two glued digits, or a hyphenated group of one, give no card.
   */
  it.each([
    ["two glued digits", "411111111111111112"],
    ["a hyphenated group of one after", "4111-1111-1111-1111-1"],
    ["a hyphenated group of two after", "4111-1111-1111-1111-12"],
    ["a licence key", "1234-5678-9012-3456-7890"],
    ["a 20 digit number whose first 19 fail", cardFrom("621", 20)],
  ])("finds no card with %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  /**
   * A number that passes whole with its last digit is listed whole and
   * ticked, as before: the passing window beats the tolerated one at the same
   * unit. `6212345678901232` passes as 16 digits too, and `62123456789012321`
   * as a 17 digit UnionPay number by chance.
   */
  it("lists a number that passes whole with its marker whole, ticked", () => {
    expect(found(nfkc("6212345678901232¹"))).toEqual([["62123456789012321", true]]);
  });

  /**
   * Step 5: a tolerated window carries a row as a passing one does, so a card
   * a chance window overlaps is still whole, the marker outside. The row is
   * ticked, because `2226 4111 1111 1111` passes whole inside it.
   */
  it("carries a row to the card before a marker, ticked", () => {
    expect(found("Ref 2226 4111 1111 1111 11111 on file")).toEqual([
      ["2226 4111 1111 1111 1111", true],
    ]);
  });

  /**
   * And from the row's own start: `4111 1111 1111 1111 003` passes once the
   * last digit of `0031` is left out, so it reaches further than the card
   * alone. The card passes whole, so the row is ticked.
   */
  it("takes a CVV that passes with the card once a marker is left out, ticked", () => {
    expect(found(`4111 1111 1111 1111 ${CVV}1`)).toEqual([
      [`4111 1111 1111 1111 ${CVV}`, true],
    ]);
  });

  /**
   * The cross check's case: a row is ticked when any window inside it passes
   * whole, never by its start's window alone. Here no window from `4521`
   * passes or is tolerated, so the card is listed alone, ticked.
   */
  it("lists the card in 4521 4111 1111 1111 1111 alone, ticked", () => {
    expect(found("Ref 4521 4111 1111 1111 1111 on file")).toEqual([
      ["4111 1111 1111 1111", true],
    ]);
  });

  /**
   * The cost the spec records: a 20 digit number whose first 19 digits pass
   * lists them as a card with a marker, unticked. A unit of 20 digits keeps
   * 19, and the digit left out is the 20th.
   */
  it("lists the first 19 digits of a 20 digit number that pass, unticked", () => {
    const twenty = cardFrom("62", 20);
    expect(found(`Number ${twenty} here`)).toEqual([[twenty.slice(0, 19), false]]);
  });
});

/**
 * The marker's edges (AC-20, AC-10, INV-15): a payment form's short last
 * group, the expiry and CVV printed after a marked card, a marker on every
 * brand, two cards with a marker each, two marker digits, and the chance that
 * a marked number passes whole. Each case goes through NFKC first, as the
 * find step does.
 */
describe("a footnote marker after a card, at its edges (AC-20, AC-10, INV-15)", () => {
  /**
   * A payment form closes a 13 digit card with a group of one, so a marker
   * makes that group two digits, and the marker is its last.
   */
  // covers: AC-20, INV-15
  it("lists a card closed by a one digit group and a marker, unticked", () => {
    expect(found(nfkc("Visa 4222 2222 2222 2¹ on file"))).toEqual([
      ["4222 2222 2222 2", false],
    ]);
  });

  // covers: AC-20, AC-28 (the expiry and CVV after a marked card stay outside its row)
  it.each([
    ["spaced, then its expiry", "4111 1111 1111 1111¹ 12/28", "4111 1111 1111 1111"],
    ["unbroken, typed against its expiry", "4111111111111111¹-12/28", "4111111111111111"],
    [
      "hyphenated, typed against its expiry",
      "4111-1111-1111-1111¹-12/28",
      "4111-1111-1111-1111",
    ],
    [
      "unbroken, then its expiry and CVV",
      `4111111111111111¹ 12/28 ${CVV}`,
      "4111111111111111",
    ],
    ["spaced, then a group of two", "4111 1111 1111 1111¹ 12", "4111 1111 1111 1111"],
  ])("lists the card %s alone, unticked", (_what, text, card) => {
    expect(found(nfkc(`Card ${text} on file`))).toEqual([[card, false]]);
  });

  // covers: AC-20, AC-10
  it.each([
    ["a Mastercard", "5555555555554444"],
    ["a Mastercard in the 2 series", "2223003122003222"],
    ["a Discover", "6011111111111117"],
    ["a 14 digit Diners Club", "30569309025904"],
    ["a UnionPay", "6200000000000005"],
  ])("lists %s with a marker alone, unticked", (_what, card) => {
    expect(found(nfkc(`Card ${card}¹ on file`))).toEqual([[card, false]]);
  });

  // covers: AC-20, INV-15 (no unit belongs to two cards)
  it("lists two spaced cards that each carry a marker, each its own row", () => {
    expect(found(nfkc("Card 4111 1111 1111 1111¹ 5555 5555 5555 4444² on file"))).toEqual(
      [
        ["4111 1111 1111 1111", false],
        ["5555 5555 5555 4444", false],
      ],
    );
  });

  // covers: AC-20 (a marker is one digit, never two)
  it.each([
    ["a spaced card", "4111 1111 1111 1111¹²"],
    ["a 19 digit card", `${cardFrom("62", 19)}¹²`],
  ])("finds no card with two marker digits after %s", (_what, text) => {
    expect(found(nfkc(`Card ${text} on file`))).toEqual([]);
  });

  /**
   * The cost AC-20 records, on a published test card: JCB's
   * `3530111333300000` with a `1` glued on is 17 digits that pass whole by
   * chance, so they are listed whole and ticked, the marker inside the row.
   * This file's own step 4 says they pass, not the detector.
   */
  // covers: AC-20, AC-10
  it("lists a JCB test card whose marker passes whole with it whole, ticked", () => {
    expect(passesStep4("35301113333000001")).toBe(true);
    expect(found(nfkc("Card 3530111333300000¹ on file"))).toEqual([
      ["35301113333000001", true],
    ]);
  });
});

/**
 * Step 3, as the spec writes it: one unit alone, or two or more bare units
 * whose first holds 4 to 6 digits, whose last holds 1 to 6, and every other 3
 * to 6, with `most` digits at most: 19 for a window that passes, 20 for one
 * tolerated with its marker.
 */
function isWindow(units: readonly string[], most: number): boolean {
  if (units.length === 1) return true;
  const within = (unit: string, [least, top]: readonly [number, number]) =>
    unit.length >= least && unit.length <= top;
  return (
    within(units[0], CARD_GROUP_DIGITS.first) &&
    within(units[units.length - 1], CARD_GROUP_DIGITS.last) &&
    units.slice(1, -1).every((unit) => within(unit, CARD_GROUP_DIGITS.middle)) &&
    units.join("").length <= most
  );
}

/**
 * Step 3's tolerated window, on bare units: its last unit holds two or more
 * digits, and its digits pass step 4 once that unit's last digit is left out.
 */
function isTolerated(units: readonly string[]): boolean {
  return units[units.length - 1].length >= 2 && passesStep4(units.join("").slice(0, -1));
}

/** Step 4: 13 to 19 digits that pass Luhn, at a prefix and length a brand issues. */
function passesStep4(number: string): boolean {
  return (
    number.length >= 13 &&
    number.length <= 19 &&
    withCheckDigit(number.slice(0, -1)) === number &&
    CARD_BRANDS.some(
      (brand) =>
        brand.lengths.has(number.length) &&
        brand.prefixes.some(([from, to]) => {
          const prefix = Number(number.slice(0, from.length));
          return prefix >= Number(from) && prefix <= Number(to);
        }),
    )
  );
}
