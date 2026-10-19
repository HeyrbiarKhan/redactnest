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
 * run is as often an order or account number. No digit touches its start.
 *
 * At its end, a separated number may have a footnote marker stuck after it
 * (spec 0005, third update of 2026-10-11): exactly one ASCII digit with no
 * digit of any script after it, which is how NFKC reads `¹` and how MuPDF
 * reads a mark set flush after a value. The number is listed with the digit
 * outside its row (`123-45-6789¹`, `123-45-67890`). Two digits give none, and
 * so does a bare run with any digit after it, since only an SSN word and its
 * length of nine say what a bare run is.
 *
 * A Social Security number starts ticked (AC-10), but one with a marker
 * starts unticked: the visitor judges a number the marker may belong to.
 *
 * Why it is linear (INV-7): a number may start only at a digit with no digit
 * before it, and each start reads at most thirteen code points.
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

/** A digit in any script: a number glued to one is part of a longer number. */
const DIGIT = /^\p{N}$/u;

/** A Social Security number found at one start: where its row ends, and its tick. */
interface Found {
  readonly end: number;
  readonly ticked: boolean;
}

export function detectUsSsn(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];

  for (let at = 0; at < points.length;) {
    const found = holds(points, at - 1, ASCII_DIGIT) ? null : ssnAt(points, at);
    if (found === null) {
      at += 1;
      continue;
    }
    spans.push({
      kind: "us-ssn",
      start: at,
      end: found.end,
      tickedByDefault: found.ticked,
    });
    at = found.end;
  }
  return spans;
}

/** The Social Security number starting at `at`, or `null`. */
function ssnAt(points: readonly string[], at: number): Found | null {
  const separated = partsAt(points, at, points[at + PARTS[0]]);
  if (separated !== null) return separated;

  const bare = partsAt(points, at, null);
  return bare !== null && wordBefore(points, at, SSN_WORD_LIST) ? bare : null;
}

/**
 * The three parts starting at `at`, each parted from the next by `separator`
 * (a space or a hyphen, the same both times) or by nothing, or `null` when
 * they are not there, are followed by a digit, or name a number the SSA never
 * issues. Separated, one footnote marker may follow, outside the row and
 * leaving the number unticked.
 */
function partsAt(
  points: readonly string[],
  at: number,
  separator: string | null | undefined,
): Found | null {
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
  if (!isIssuable(parts)) return null;
  if (!holds(points, end, ASCII_DIGIT)) return { end, ticked: true };
  const marker = separator !== null && !holds(points, end + 1, DIGIT);
  return marker ? { end, ticked: false } : null;
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
