import { ASCII_DIGIT, codePoints, holds, HYPHEN, wordBefore, wordList } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * US Social Security numbers. Spec 0005, AC-22, *Detectors* (`us-ssn`).
 *
 * Three, two and four digits parted by one hyphen or one space, the same both
 * times (`123-45-6789`, `123 45 6789`), that the SSA could issue: the area
 * never `000`, `666` or `900` to `999`, the group never `00`, the serial never
 * `0000`. A bare run of nine digits under the same rules counts only when an
 * SSN word ends within `KEYWORD_REACH` before it, because a bare nine digit
 * run is as often an order or account number. No digit touches either end.
 *
 * A Social Security number starts ticked (AC-10).
 *
 * Why it is linear (INV-7): a number may start only at a digit with no digit
 * before it, and each start reads at most eleven code points.
 */

/**
 * The words that say a bare nine digit run is a Social Security number,
 * matched in any case as whole words. A rule about how a value is labelled,
 * not a cap on the visitor.
 */
export const SSN_WORDS: readonly string[] = Object.freeze([
  "SSN",
  "SS#",
  "SS No",
  "Social Security",
]);

const SSN_WORD_LIST = wordList(SSN_WORDS);

/** The digits in each part: area, group and serial. */
const PARTS = Object.freeze([3, 2, 4]);

export function detectUsSsn(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];

  for (let at = 0; at < points.length;) {
    const end = holds(points, at - 1, ASCII_DIGIT) ? null : ssnAt(points, at);
    if (end === null) {
      at += 1;
      continue;
    }
    spans.push({ kind: "us-ssn", start: at, end, tickedByDefault: true });
    at = end;
  }
  return spans;
}

/** Where a Social Security number starting at `at` ends, or `null`. */
function ssnAt(points: readonly string[], at: number): number | null {
  const separated = partsAt(points, at, points[at + PARTS[0]]);
  if (separated !== null) return separated;

  const bare = partsAt(points, at, null);
  return bare !== null && wordBefore(points, at, SSN_WORD_LIST) ? bare : null;
}

/**
 * Where the three parts starting at `at` end, each parted from the next by
 * `separator` (a space or a hyphen, the same both times) or by nothing, or
 * `null` when they are not there, are followed by a digit, or name a number
 * the SSA never issues.
 */
function partsAt(
  points: readonly string[],
  at: number,
  separator: string | null | undefined,
): number | null {
  if (separator === undefined) return null;
  if (separator !== null && separator !== " " && !HYPHEN.test(separator)) return null;

  const parts: string[] = [];
  let end = at;
  for (const [index, size] of PARTS.entries()) {
    if (index > 0 && separator !== null) {
      if (points[end] !== separator) return null;
      end += 1;
    }
    const part = points.slice(end, end + size);
    if (part.length < size || !part.every((point) => ASCII_DIGIT.test(point))) {
      return null;
    }
    parts.push(part.join(""));
    end += size;
  }
  if (holds(points, end, ASCII_DIGIT)) return null;
  return isIssuable(parts) ? end : null;
}

/** The SSA's rules for a number it could issue. */
function isIssuable([area, group, serial]: readonly string[]): boolean {
  return (
    area !== "000" &&
    area !== "666" &&
    !area.startsWith("9") &&
    group !== "00" &&
    serial !== "0000"
  );
}
