import { ASCII_DIGIT, codePoints, holds, HYPHEN } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * Payment card numbers. Spec 0005, AC-20, *Detectors* (`card`).
 *
 * 13 to 19 digits, unbroken or split by single spaces or single hyphens, one
 * kind of separator throughout, that pass the Luhn check and start with a
 * prefix `CARD_BRANDS` gives at a length that brand issues. Luhn alone passes
 * one digit string in ten, so the brand table is what keeps an account or
 * order number of the right length out of the list.
 *
 * Never cut out of a longer number: no digit, and no separator followed by a
 * digit, touches either end. So `4111 1111 1111 1111 12` (18 digits) gives
 * nothing, rather than a card read out of its first sixteen.
 *
 * A card number starts ticked (AC-10): nothing else a document holds passes
 * both checks by chance.
 *
 * Why it is linear (INV-7): one pass reads each run of digit groups once,
 * from its first digit to where it stops, and the next run starts after it.
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

/** The fewest and most digits a card number holds. */
const SHORTEST = 13;
const LONGEST = 19;

type SeparatorKind = "space" | "hyphen";

function separatorKind(point: string | undefined): SeparatorKind | null {
  if (point === " ") return "space";
  return point !== undefined && HYPHEN.test(point) ? "hyphen" : null;
}

export function detectCard(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];

  for (let at = 0; at < points.length;) {
    if (!holds(points, at, ASCII_DIGIT)) {
      at += 1;
      continue;
    }
    const run = runAt(points, at);
    if (
      run.digits.length >= SHORTEST &&
      run.digits.length <= LONGEST &&
      !touchesNumber(points, at - 1, -1) &&
      !touchesNumber(points, run.end, 1) &&
      passesLuhn(run.digits) &&
      isIssued(run.digits)
    ) {
      spans.push({ kind: "card", start: at, end: run.end, tickedByDefault: true });
    }
    at = run.end;
  }
  return spans;
}

/**
 * The run of digit groups starting at `at`: groups parted by one space or one
 * hyphen, the first separator setting the kind for the rest. A separator of
 * the other kind, or two in a row, ends the run before it.
 */
function runAt(points: readonly string[], at: number): { end: number; digits: string } {
  let digits = "";
  let end = at;
  let kind: SeparatorKind | null = null;

  for (;;) {
    while (holds(points, end, ASCII_DIGIT)) {
      digits += points[end];
      end += 1;
    }
    const next = separatorKind(points[end]);
    if (next === null || (kind !== null && next !== kind)) break;
    if (!holds(points, end + 1, ASCII_DIGIT)) break;
    kind = next;
    end += 1;
  }
  return { end, digits };
}

/**
 * Is the code point at `at` a digit, or a space or hyphen with a digit beyond
 * it, `away` from the number? Then the number is part of a longer one.
 */
function touchesNumber(points: readonly string[], at: number, away: -1 | 1): boolean {
  if (holds(points, at, ASCII_DIGIT)) return true;
  return separatorKind(points[at]) !== null && holds(points, at + away, ASCII_DIGIT);
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
