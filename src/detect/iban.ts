import { ALPHANUMERIC, ASCII_DIGIT, codePoints, holds } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * International Bank Account Numbers. Spec 0005, AC-21, *Detectors* (`iban`).
 *
 * Two capital letters naming a country in `IBAN_LENGTHS`, two check digits,
 * then capital letters and digits, unbroken or in groups of four parted by
 * single spaces (the last group may be shorter), exactly as long as that
 * country's IBAN once the spaces are dropped. Then ISO 13616's check: move the
 * first four characters to the end, read each letter as two digits (A is 10),
 * and the remainder by 97 must be 1. A typo in any one character fails it.
 *
 * No letter or digit comes right before it, so an IBAN is never read out of
 * a longer code. One may come right after it (INV-17, as amended on
 * 2026-10-10): the country's exact length and the check already say where an
 * IBAN ends, so the characters past that length are never read, and the next
 * word glued on (`GB82WEST12345698765432Bank`) or a footnote marker, which
 * NFKC reads as a digit, no longer drops a real IBAN whole. A code that opens
 * like an IBAN and runs on past its length lists one only when the check
 * passes by chance, 1 in 97. The start keeps its rule, because a letter or
 * digit before it is how a value reads out of a longer code. An IBAN starts
 * ticked (AC-10).
 *
 * Why it is linear (INV-7): an IBAN may start only at a capital letter with
 * nothing alphanumeric before it, and each start reads at most the longest
 * IBAN and its spaces. A found IBAN is stepped over whole.
 */

/**
 * Each country's IBAN length, in characters, from the SWIFT IBAN Registry
 * (release 99, December 2024): every country in the registry proper, none of
 * the partial or experimental ones. A rule about how accounts are numbered,
 * not a cap on the visitor. `tests/unit/detect-iban.test.ts` pins a sample.
 */
export const IBAN_LENGTHS: Readonly<Partial<Record<string, number>>> = Object.freeze({
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DJ: 27,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HN: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
});

/** The size of every group but the last, in the grouped form. */
const GROUP = 4;

const CAPITAL = /^[A-Z]$/u;
const CAPITAL_OR_DIGIT = /^[A-Z0-9]$/u;

export function detectIban(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];

  for (let at = 0; at < points.length;) {
    const end = holds(points, at - 1, ALPHANUMERIC) ? null : ibanAt(points, at);
    if (end === null) {
      at += 1;
      continue;
    }
    spans.push({ kind: "iban", start: at, end, tickedByDefault: true });
    at = end;
  }
  return spans;
}

/**
 * Where an IBAN starting at `at` ends, or `null`. It ends at its country's
 * length, inside a group of four if it must, whatever follows.
 */
function ibanAt(points: readonly string[], at: number): number | null {
  if (!holds(points, at, CAPITAL) || !holds(points, at + 1, CAPITAL)) return null;
  const length = IBAN_LENGTHS[points[at] + points[at + 1]];
  if (length === undefined) return null;
  if (!holds(points, at + 2, ASCII_DIGIT) || !holds(points, at + 3, ASCII_DIGIT)) {
    return null;
  }

  // Grouped when a space follows the first four, and then only there and
  // after every four characters since.
  const grouped = points[at + GROUP] === " ";
  let characters = "";
  let end = at;
  while (characters.length < length) {
    if (grouped && characters.length > 0 && characters.length % GROUP === 0) {
      if (points[end] !== " ") return null;
      end += 1;
    }
    if (!holds(points, end, CAPITAL_OR_DIGIT)) return null;
    characters += points[end];
    end += 1;
  }
  return checksumIsOne(characters) ? end : null;
}

/**
 * ISO 13616's check, computed digit by digit so no number grows past what a
 * double holds exactly: the first four characters moved to the end, each
 * letter read as two digits (A is 10, Z is 35), and the remainder by 97.
 */
function checksumIsOne(characters: string): boolean {
  const moved = characters.slice(GROUP) + characters.slice(0, GROUP);
  let remainder = 0;
  for (const character of moved) {
    const value = Number.parseInt(character, 36);
    remainder = (remainder * (value > 9 ? 100 : 10) + value) % 97;
  }
  return remainder === 1;
}
