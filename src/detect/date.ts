import { isNumericDate, isRealDate } from "./dates";
import {
  ALPHANUMERIC,
  ASCII_DIGIT,
  codePoints,
  holds,
  HYPHEN,
  wordBefore,
  wordList,
} from "./text";
import type { DetectInput, Span } from "./types";

/**
 * Dates. Spec 0005, AC-19 and AC-10, *Detectors* (`date`).
 *
 * A day, a month and a year together, and nothing shorter: never a year alone,
 * a month and year, a time or a relative date. Two families of form:
 *
 *  - numeric, exactly the forms `isNumericDate` accepts (`27.09.2026`,
 *    `09/27/26`, `2026-09-27`), the same predicate the phone detector asks, so
 *    every numeric date is left for this detector (INV-14);
 *  - written, with an English month name, full or three letters (plus
 *    `Sept`), an optional full stop after an abbreviation, an optional
 *    ordinal, an optional `of` and an optional comma, day first
 *    (`27th of Sept. 2026`) or month first (`September 27, 2026`), with a four
 *    digit year.
 *
 * Documents are full of dates, and most are no secret: a letter's date, a
 * contract's start. So a date starts unticked unless a birth word ends within
 * `KEYWORD_REACH` before it (AC-10), and the checklist lists the rest for the
 * visitor to judge, never removing one by default.
 *
 * A date is never cut out of a longer code: no letter or digit touches either
 * end, nor a separator (`/`, `.` or a hyphen) that itself touches one, so
 * `REF-05.12.1980` and `1/05/12/1980` give nothing.
 *
 * Why it is linear (INV-7): a date may start only where nothing alphanumeric
 * touches, and each start reads a bounded stretch, at most three groups of at
 * most four digits for the numeric forms and `WRITTEN_LONGEST` code points for
 * the written ones. A found date is stepped over whole.
 */

/**
 * The words that say a date is a date of birth (AC-10), matched in any case as
 * whole words. A rule about how a value is labelled, not a cap on the visitor.
 */
export const BIRTH_WORDS: readonly string[] = Object.freeze([
  "date of birth",
  "birth date",
  "birthdate",
  "DOB",
  "D.O.B",
  "born",
]);

const BIRTH_WORD_LIST = wordList(BIRTH_WORDS);

/** The English month names, in the calendar's order. */
const MONTH_NAMES = Object.freeze([
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);

/**
 * Every way a month may be written, in lower case, to its number: each full
 * name, its first three letters, and `sept`. Rules about how dates are
 * written, not caps on the visitor.
 */
export const MONTHS: ReadonlyMap<string, number> = new Map(
  MONTH_NAMES.flatMap((name, index): [string, number][] => [
    [name, index + 1],
    [name.slice(0, 3), index + 1],
  ]).concat([["sept", 9]]),
);

/** The abbreviations, which alone may take a full stop (`Sept.`, `Dec.`). */
const ABBREVIATIONS: ReadonlySet<string> = new Set([
  ...MONTH_NAMES.map((name) => name.slice(0, 3)),
  "sept",
]);

/** What a date can start with: a digit, or the first letter of a month. */
const STARTS = /^[0-9a-z]$/iu;

/**
 * The most whitespace between two parts of a written date: the line join gives
 * one, and justified text may set a few. The phone detector reads a gap the
 * same way.
 */
const MAX_GAP = 3;

// The written forms, each tried at one start on a window of at most
// `WRITTEN_LONGEST` code points, anchored at its start, with every quantifier
// bounded and none nested in another (AC-16), so a try cannot backtrack beyond
// its window (INV-7). That is why the day first form with `of` is a pattern of
// its own rather than an optional group around a gap. A month is read as a
// word of 3 to 9 letters and looked up in `MONTHS`, rather than spelled out in
// the pattern.

const GAP = `\\s{1,${MAX_GAP}}`;
const ORDINAL = "(?:st|nd|rd|th)?";
const MONTH_AND_YEAR = `([a-z]{3,9})(\\.?),?${GAP}([0-9]{4})`;

/** `27 September 2026`, `27th Sept. 2026`, `1 May, 2026`. */
const DAY_FIRST = new RegExp(`^([0-9]{1,2})${ORDINAL}${GAP}${MONTH_AND_YEAR}`, "iu");

/** `27th of September 2026`, `1 of May, 2026`. */
const DAY_OF_MONTH = new RegExp(
  `^([0-9]{1,2})${ORDINAL}${GAP}of${GAP}${MONTH_AND_YEAR}`,
  "iu",
);

/** `September 27, 2026`, `Sep 27 2026`, `Sept. 27th, 2026`. */
const MONTH_FIRST = new RegExp(
  `^([a-z]{3,9})(\\.?)${GAP}([0-9]{1,2})${ORDINAL},?${GAP}([0-9]{4})`,
  "iu",
);

/**
 * The longest written date, in code points: a day of 2, an ordinal of 2, a gap
 * and `of`, a gap, a month of 9, a full stop, a comma, a gap and a year of 4.
 */
const WRITTEN_LONGEST = 2 + 2 + (MAX_GAP + 2) + MAX_GAP + 9 + 1 + 1 + MAX_GAP + 4;

/** The most digits one group of a numeric date holds: a year's 4. */
const MAX_GROUP_DIGITS = 4;

export function detectDate(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];

  for (let at = 0; at < points.length;) {
    const end =
      !holds(points, at, STARTS) || cutFrom(points, at - 1, -1)
        ? null
        : (numericAt(points, at) ?? writtenAt(points, at));
    if (end === null) {
      at += 1;
      continue;
    }
    spans.push({
      kind: "date",
      start: at,
      end,
      tickedByDefault: wordBefore(points, at, BIRTH_WORD_LIST),
    });
    at = end;
  }
  return spans;
}

/** `/`, `.` or a hyphen: what parts a numeric date's numbers. */
function isSeparator(point: string | undefined): boolean {
  return point !== undefined && (point === "/" || point === "." || HYPHEN.test(point));
}

/**
 * Would a date ending (or starting) next to `at` be cut from a longer code? The
 * code point at `at` is a letter or digit, or a separator whose neighbour
 * further `away` from the date is one. A sentence's full stop after a date is
 * neither, so "on 05.12.1980." still lists `05.12.1980`.
 */
function cutFrom(points: readonly string[], at: number, away: -1 | 1): boolean {
  if (holds(points, at, ALPHANUMERIC)) return true;
  return isSeparator(points[at]) && holds(points, at + away, ALPHANUMERIC);
}

/**
 * Where a numeric date starting at `at` ends, or `null`: three groups of 1 to
 * 4 ASCII digits parted by single separators, which `isNumericDate` then
 * judges, separators and calendar together.
 */
function numericAt(points: readonly string[], at: number): number | null {
  let end = at;
  for (let group = 0; group < 3; group += 1) {
    if (group > 0) {
      if (!isSeparator(points[end])) return null;
      end += 1;
    }
    const from = end;
    while (end - from <= MAX_GROUP_DIGITS && holds(points, end, ASCII_DIGIT)) end += 1;
    if (end === from || end - from > MAX_GROUP_DIGITS) return null;
  }
  if (cutFrom(points, end, 1)) return null;
  return isNumericDate(points.slice(at, end).join("")) ? end : null;
}

/**
 * Where a written date starting at `at` ends, or `null`: day first from a
 * digit, month first from a letter, with a month `MONTHS` knows, a full stop
 * only after an abbreviation, and a real day of that month in 1900 to 2099.
 */
function writtenAt(points: readonly string[], at: number): number | null {
  const digitFirst = holds(points, at, ASCII_DIGIT);
  const window = points.slice(at, at + WRITTEN_LONGEST).join("");
  // `of` is two letters, too short to read as a month, so at most one of the
  // day first patterns can match.
  const found = digitFirst
    ? (DAY_FIRST.exec(window) ?? DAY_OF_MONTH.exec(window))
    : MONTH_FIRST.exec(window);
  if (!found) return null;

  const [whole, first, second, third, year] = found;
  const [day, name, stop] = digitFirst ? [first, second, third] : [third, first, second];
  const month = MONTHS.get(name.toLowerCase());
  if (month === undefined) return null;
  if (stop === "." && !ABBREVIATIONS.has(name.toLowerCase())) return null;
  if (!isRealDate(year, month, Number(day))) return null;

  const end = at + codePoints(whole).length;
  return cutFrom(points, end, 1) ? null : end;
}
