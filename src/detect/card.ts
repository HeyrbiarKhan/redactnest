import { ASCII_DIGIT, codePoints, holds, HYPHEN } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * Payment card numbers. Spec 0005, AC-20 and AC-28, *Detectors* (`card`)
 * steps 1 to 7.
 *
 * 13 to 19 digits that pass the Luhn check and start with a prefix
 * `CARD_BRANDS` gives at a length that brand issues. Luhn alone passes one
 * digit string in ten, so the brand table is what keeps an account or order
 * number of the right length out of the list.
 *
 * A card is whole units, chosen from inside its run (INV-15). Unbroken digits,
 * and digits glued by hyphens, form one unit that is never cut, so
 * `411111111111111112` and the licence key `1234-5678-9012-3456-7890` give no
 * card. Units parted by one space are separate, and a card is any window of
 * whole units that passes. So a card is found with its expiry, a CVV, a date,
 * another card or a row number beside it (`4111111111111111 12/28`,
 * `1 4111 1111 1111 1111`), where reading the whole run as one number found
 * none. A hyphen or dash next to an expiry or a date parts rather than glues,
 * so a card typed against its expiry (`4111111111111111-12/28`) is found too.
 *
 * A window of several units, which only a spaced card makes, is grouped as
 * cards are printed (`CARD_GROUP_DIGITS`), so a row number, a lone digit or
 * an unbroken card's neighbour never joins a card. From each start the card
 * is the window that reaches the run's end, when that passes and nothing glued
 * by a dot or slash follows; else the shortest that passes. So a card never
 * takes the first group of a number that goes on after it.
 *
 * Every card starts ticked (AC-10), whether it is a whole run or part of one.
 *
 * Why it is linear (INV-7): one pass builds the units and runs, reading each
 * code point a bounded number of times (the group after a hyphen is read
 * once more, to see whether a slash follows it). From each unit at most six
 * windows are read, since a window of several units opens with 4 or more
 * digits, every later unit adds at least 1 and all but the last at least 3,
 * and growth stops past 19 digits. Each window is judged at most once per
 * start, a constant per unit.
 */

/** One issuer: the prefixes it numbers from, and the lengths it issues. */
export interface CardBrand {
  readonly name: string;
  /**
   * Each a range of prefixes, both ends included and written with the same
   * number of digits: `["51", "55"]` is 51 to 55, `["4", "4"]` is 4 alone.
   */
  readonly prefixes: readonly (readonly [string, string])[];
  readonly lengths: ReadonlySet<number>;
}

function brand(
  name: string,
  prefixes: readonly (readonly [string, string])[],
  lengths: readonly number[],
): CardBrand {
  return Object.freeze({
    name,
    prefixes: Object.freeze(prefixes.map((range) => Object.freeze([...range] as const))),
    lengths: new Set(lengths),
  });
}

/** `from` to `to`, both included. */
function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}

/**
 * The issuers a card number is recognised by, their prefixes and their
 * lengths. Spec 0005, *Detectors* (`card`), row for row. Rules about how
 * cards are numbered, not caps on the visitor.
 */
export const CARD_BRANDS: readonly CardBrand[] = Object.freeze([
  brand("Visa", [["4", "4"]], [13, 16, 19]),
  brand(
    "Mastercard",
    [
      ["51", "55"],
      ["2221", "2720"],
    ],
    [16],
  ),
  brand(
    "American Express",
    [
      ["34", "34"],
      ["37", "37"],
    ],
    [15],
  ),
  brand(
    "Discover",
    [
      ["6011", "6011"],
      ["644", "649"],
      ["65", "65"],
    ],
    range(16, 19),
  ),
  brand("JCB", [["3528", "3589"]], range(16, 19)),
  brand(
    "Diners Club",
    [
      ["300", "305"],
      ["36", "36"],
      ["38", "38"],
      ["39", "39"],
    ],
    range(14, 19),
  ),
  brand("UnionPay", [["62", "62"]], range(16, 19)),
]);

/**
 * How many digits each unit of a spaced card holds, both ends included: its
 * first unit, every unit between, and its last. Spec 0005, *Detectors*
 * (`card`) step 3. Cards are printed 4 4 4 4, 4 6 5 and 4 6 4, and payment
 * forms close a short number with a short group (`4222 2222 2222 2`), so a
 * card opens with 4 to 6 digits and only its last group may hold 1 or 2. A
 * rule about how cards are printed, not a cap on the visitor.
 */
export const CARD_GROUP_DIGITS = Object.freeze({
  first: Object.freeze([4, 6] as const),
  middle: Object.freeze([3, 6] as const),
  last: Object.freeze([1, 6] as const),
});

/** The fewest and most digits a card number holds. */
const SHORTEST = 13;
const LONGEST = 19;

/**
 * Digits glued by gluing hyphens, never cut (step 1). `digits` holds them
 * without the hyphens, kept only while there are at most `LONGEST`: a longer
 * unit is never judged.
 */
interface Unit {
  readonly start: number;
  readonly end: number;
  readonly count: number;
  readonly digits: string;
  /** Holds no hyphen. Only bare units are spaced into a card. */
  readonly bare: boolean;
}

/** Consecutive units of one run, from a start to `last`, and their digits. */
interface Window {
  readonly last: number;
  readonly count: number;
  readonly digits: string;
}

export function detectCard(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  return runsIn(points).flatMap((run) => cardsIn(points, run));
}

/**
 * The runs of card units in the block (steps 1 and 2): each a unit, then any
 * number of further units each after exactly one space.
 */
function runsIn(points: readonly string[]): readonly (readonly Unit[])[] {
  const runs: Unit[][] = [];
  let run: Unit[] = [];

  for (let at = 0; at < points.length;) {
    if (!holds(points, at, ASCII_DIGIT)) {
      at += 1;
      continue;
    }
    // The unit before ended at a code point that is neither a digit nor a
    // gluing hyphen, so a unit begins here.
    const unit = unitAt(points, at);
    const previous = run.at(-1);
    const joins =
      previous !== undefined &&
      points[previous.end] === " " &&
      unit.start === previous.end + 1;

    if (!joins && run.length > 0) {
      runs.push(run);
      run = [];
    }
    // The `12` of `12/28`, the `05` of `05/12/2026`: a short group glued to a
    // slash is part of a date, never of a card, so the run ends before it.
    if (unit.bare && unit.count <= 2 && slashBeside(points, unit.end, 1)) {
      if (run.length > 0) runs.push(run);
      run = [];
    } else {
      run.push(unit);
    }
    at = unit.end;
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

/** The unit whose first digit is at `at`: its groups and the hyphens gluing them. */
function unitAt(points: readonly string[], at: number): Unit {
  let end = at;
  let groupStart = at;
  let count = 0;
  let digits = "";
  let bare = true;

  for (;;) {
    while (holds(points, end, ASCII_DIGIT)) {
      if (count < LONGEST) digits += points[end];
      count += 1;
      end += 1;
    }
    if (!glues(points, groupStart, end)) break;
    bare = false;
    end += 1;
    groupStart = end;
  }
  return { start: at, end, count, digits, bare };
}

/**
 * Does the hyphen at `at`, right after the group that starts at `groupStart`,
 * glue that group to the next? Step 1: a single hyphen with a digit right on
 * each side glues, unless the group after it is followed right away by a
 * slash and a digit, or the group before it has a digit and a slash right
 * before it. Such a hyphen parts an expiry or a date from its neighbour
 * (`4111111111111111-12/28`, `12/28-4111111111111111`) and belongs to
 * neither.
 */
function glues(points: readonly string[], groupStart: number, at: number): boolean {
  if (!holds(points, at, HYPHEN) || !holds(points, at + 1, ASCII_DIGIT)) return false;
  if (slashBeside(points, groupStart - 1, -1)) return false;

  let after = at + 1;
  while (holds(points, after, ASCII_DIGIT)) after += 1;
  return !slashBeside(points, after, 1);
}

/** Is the code point at `at` a slash, with a digit beyond it, `away` from a group? */
function slashBeside(points: readonly string[], at: number, away: -1 | 1): boolean {
  return points[at] === "/" && holds(points, at + away, ASCII_DIGIT);
}

/**
 * The cards in one run (steps 5 to 7). At each unit not yet taken, the window
 * to the run's last unit when it passes and its end is clear, else the
 * shortest window that passes; scanning resumes after the window taken. A
 * unit where no window passes is passed over.
 */
function cardsIn(points: readonly string[], run: readonly Unit[]): readonly Span[] {
  const spans: Span[] = [];

  for (let at = 0; at < run.length;) {
    const windows = windowsFrom(run, at);
    const whole = windows[windows.length - 1];
    const chosen =
      whole.last === run.length - 1 &&
      passes(whole) &&
      clearAfter(points, run[whole.last].end)
        ? whole
        : windows.find(passes);

    if (chosen === undefined) {
      at += 1;
      continue;
    }
    spans.push({
      kind: "card",
      start: run[at].start,
      end: run[chosen.last].end,
      tickedByDefault: true,
    });
    at = chosen.last + 1;
  }
  return spans;
}

/**
 * Every window from the unit at `first`, shortest first (step 3): the unit
 * alone, then, when it is bare and opens a spaced card, each longer stretch
 * of bare units grouped by `CARD_GROUP_DIGITS`, until the sizes break or the
 * digits pass `LONGEST`. Windows from one start are nested, so the first that
 * passes is the shortest.
 */
function windowsFrom(run: readonly Unit[], first: number): readonly Window[] {
  const opening = run[first];
  const windows: Window[] = [
    { last: first, count: opening.count, digits: opening.digits },
  ];
  if (!opening.bare || !within(opening.count, CARD_GROUP_DIGITS.first)) return windows;

  let count = opening.count;
  let digits = opening.digits;
  for (let last = first + 1; last < run.length; last += 1) {
    const unit = run[last];
    // The unit before was the window's last, and is now one between.
    const between = last - 1 > first ? run[last - 1] : null;
    if (!unit.bare || !within(unit.count, CARD_GROUP_DIGITS.last)) break;
    if (between !== null && !within(between.count, CARD_GROUP_DIGITS.middle)) break;

    count += unit.count;
    if (count > LONGEST) break;
    digits += unit.digits;
    windows.push({ last, count, digits });
  }
  return windows;
}

function within(count: number, [least, most]: readonly [number, number]): boolean {
  return count >= least && count <= most;
}

/**
 * Is a window's end clear (step 5)? Not when a dot or slash with a digit
 * right after it follows its last unit: the run's last group is then glued to
 * more digits, as in a dotted date, and may belong to them.
 */
function clearAfter(points: readonly string[], end: number): boolean {
  return !(
    (points[end] === "." || points[end] === "/") &&
    holds(points, end + 1, ASCII_DIGIT)
  );
}

/** Step 4: 13 to 19 digits that pass Luhn, at a prefix and length a brand issues. */
function passes(window: Window): boolean {
  return (
    window.count >= SHORTEST &&
    window.count <= LONGEST &&
    passesLuhn(window.digits) &&
    isIssued(window.digits)
  );
}

/**
 * The Luhn check (ISO/IEC 7812): from the right, every second digit doubled,
 * less 9 when that passes 9, and the sum a multiple of 10.
 */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    const digit = Number(digits[digits.length - 1 - index]);
    const doubled = index % 2 === 1 ? digit * 2 : digit;
    sum += doubled > 9 ? doubled - 9 : doubled;
  }
  return sum % 10 === 0;
}

/** Does a brand in `CARD_BRANDS` number from this prefix at this length? */
function isIssued(digits: string): boolean {
  return CARD_BRANDS.some(
    (card) =>
      card.lengths.has(digits.length) &&
      card.prefixes.some(([from, to]) => {
        const prefix = Number(digits.slice(0, from.length));
        return prefix >= Number(from) && prefix <= Number(to);
      }),
  );
}
