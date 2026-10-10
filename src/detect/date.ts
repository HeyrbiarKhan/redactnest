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
 *    digit year. The day may be a range of two days (`3–5 June 2026`,
 *    `June 3–5, 2026`), one row for both, since the first day alone is not a
 *    full date.
 *
 * Documents are full of dates, and most are no secret: a letter's date, a
 * contract's start. So a date starts unticked unless a birth word ends within
 * `KEYWORD_REACH` before it (AC-10), and the checklist lists the rest for the
 * visitor to judge, never removing one by default.
 *
 * A numeric date is never cut out of a longer code (INV-17): no letter or
 * digit touches either end, nor a separator (`/`, `.` or a hyphen) that itself
 * touches one, so `REF-05.12.1980`, `1/05/12/1980` and `2026-09-27-01` give
 * nothing. Two exceptions, each where the neighbour is no code. A hyphen or
 * slash joining two full dates parts them, so both dates of
 * `01/05/1980-31/05/1980` are found, each its own row. And a `T` and a time
 * after a year first date (`2026-09-27T10:00:00Z`) end it cleanly, as ISO
 * 8601 joins them; the row is the date alone, and the time's end stands in
 * for the date's when the joiner rule asks where the date before ended, so
 * both dates of an interval with times are found.
 *
 * A written date is cut only by a letter or digit touching it. A month name
 * is never part of a code, so a separator beside one never drops it, and the
 * full date in a range across months is found (`28 May-3 June 2026` lists
 * `3 June 2026`), where the first half has no year for the joiner to see.
 *
 * Why it is linear (INV-7): a date may start only where nothing alphanumeric
 * touches, and each start reads a bounded stretch, at most three groups of at
 * most four digits for the numeric forms and `WRITTEN_LONGEST` code points for
 * the written ones. A numeric date's end reads at most one more bounded
 * stretch: the date beyond a joiner, read with no end check of its own, or a
 * time of at most `TIME_LONGEST` code points and its offset. A found date is
 * stepped over whole.
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

/** A hyphen, as `HYPHEN` reads one: `-`, U+2010 to U+2015, or U+2212 minus. */
const DASH = "[-\\u2010-\\u2015\\u2212]";

/**
 * A day range's second day, right after the first day's ordinal, flush
 * against its dash on both sides (`3–5`, `3rd-5th`). Non capturing, so the
 * patterns' groups keep their numbers; `SECOND_DAY` reads the day back out of
 * the match.
 */
const DAY_RANGE = `(?:${DASH}[0-9]{1,2}${ORDINAL})?`;

/** `27 September 2026`, `27th Sept. 2026`, `1 May, 2026`, `3–5 June 2026`. */
const DAY_FIRST = new RegExp(
  `^([0-9]{1,2})${ORDINAL}${DAY_RANGE}${GAP}${MONTH_AND_YEAR}`,
  "iu",
);

/** `27th of September 2026`, `1 of May, 2026`, `3rd-5th of June 2026`. */
const DAY_OF_MONTH = new RegExp(
  `^([0-9]{1,2})${ORDINAL}${DAY_RANGE}${GAP}of${GAP}${MONTH_AND_YEAR}`,
  "iu",
);

/** `September 27, 2026`, `Sep 27 2026`, `Sept. 27th, 2026`, `June 3–5, 2026`. */
const MONTH_FIRST = new RegExp(
  `^([a-z]{3,9})(\\.?)${GAP}([0-9]{1,2})${ORDINAL}${DAY_RANGE},?${GAP}([0-9]{4})`,
  "iu",
);

/**
 * A day range's second day, read from a written date's match. Nothing else in
 * a written date holds a dash, so the first is the range's.
 */
const SECOND_DAY = new RegExp(`${DASH}([0-9]{1,2})`, "u");

/**
 * The longest written date, in code points: a day of 2, an ordinal of 2, a
 * day range of 5 (a dash, a day of 2, an ordinal of 2), a gap and `of`, a gap,
 * a month of 9, a full stop, a comma, a gap and a year of 4.
 */
const WRITTEN_LONGEST = 2 + 2 + 5 + (MAX_GAP + 2) + MAX_GAP + 9 + 1 + 1 + MAX_GAP + 4;

/** The most digits one group of a numeric date holds: a year's 4. */
const MAX_GROUP_DIGITS = 4;

/**
 * The most code points of a time's digits, `:`, `.` and `,` read after a year
 * first date's `T`, before its offset: `23:59:59.999999999` is 18. A rule
 * about how times are written, not a cap on the visitor.
 */
const TIME_LONGEST = 20;

const TIME_CHARACTER = /^[0-9:.,]$/u;

/** What a time may start after a year first date with: `T` or `t`. */
const TIME_MARK = /^[Tt]$/u;

/**
 * A date found at one start: where its row ends, and where it ends for the
 * joiner rule, which is past its time when one follows it.
 */
interface Found {
  readonly end: number;
  readonly joinsAt: number;
}

export function detectDate(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];
  // Where the last date listed ended for the joiner rule. Kept only for a date
  // actually listed, and never reset: a joiner parts only at exactly this
  // place, so a stale value can never match.
  let joinsAt = -1;

  for (let at = 0; at < points.length;) {
    const date =
      !holds(points, at, STARTS) || holds(points, at - 1, ALPHANUMERIC)
        ? null
        : ((numericStartsAt(points, at, joinsAt) ? numericAt(points, at, true) : null) ??
          writtenAt(points, at, true));
    if (date === null) {
      at += 1;
      continue;
    }
    spans.push({
      kind: "date",
      start: at,
      end: date.end,
      tickedByDefault: wordBefore(points, at, BIRTH_WORD_LIST),
    });
    joinsAt = date.joinsAt;
    at = date.end;
  }
  return spans;
}

/** `/`, `.` or a hyphen: what parts a numeric date's numbers. */
function isSeparator(point: string | undefined): boolean {
  return point !== undefined && (point === "/" || point === "." || HYPHEN.test(point));
}

/** A hyphen or a slash, never a dot: what may join two full dates. */
function isJoiner(point: string | undefined): boolean {
  return point !== undefined && (point === "/" || HYPHEN.test(point));
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
 * May a numeric date start at `at`, nothing alphanumeric touching it? Not
 * after a separator that touches a letter or digit, unless that separator is
 * a joiner standing exactly where the last date listed ended, or its time
 * did (INV-17).
 */
function numericStartsAt(
  points: readonly string[],
  at: number,
  joinsAt: number,
): boolean {
  return !cutFrom(points, at - 1, -1) || (isJoiner(points[at - 1]) && at - 1 === joinsAt);
}

/**
 * A numeric date starting at `at`, or `null`: three groups of 1 to 4 ASCII
 * digits parted by single separators, which `isNumericDate` then judges,
 * separators and calendar together. With `checkEnd`, it must not run on into a
 * longer code, unless a time or a joiner to another full date follows it.
 * Without, as the far side of a joiner is read, its end is not checked, so
 * each joiner costs one bounded read.
 */
function numericAt(
  points: readonly string[],
  at: number,
  checkEnd: boolean,
): Found | null {
  let end = at;
  let firstDigits = 0;
  for (let group = 0; group < 3; group += 1) {
    if (group > 0) {
      if (!isSeparator(points[end])) return null;
      end += 1;
    }
    const from = end;
    while (end - from <= MAX_GROUP_DIGITS && holds(points, end, ASCII_DIGIT)) end += 1;
    if (end === from || end - from > MAX_GROUP_DIGITS) return null;
    if (group === 0) firstDigits = end - from;
  }
  if (!isNumericDate(points.slice(at, end).join(""))) return null;
  if (!checkEnd) return { end, joinsAt: end };

  // A year first date opens with its four digit year, which no day first or
  // month first date can, since `isNumericDate` holds their first group to 2.
  const yearFirst = firstDigits === MAX_GROUP_DIGITS;
  if (yearFirst && holds(points, end, TIME_MARK) && holds(points, end + 1, ASCII_DIGIT)) {
    return { end, joinsAt: timeEnd(points, end + 1) };
  }
  if (cutFrom(points, end, 1) && !joinsDate(points, end)) return null;
  return { end, joinsAt: end };
}

/**
 * Is the code point at `at` a joiner with a full date right after it, in any
 * form this detector reads, its end unchecked? So `01/05/1980-31/05/1980`
 * parts at its hyphen, while `2026-09-27-01` stays one code.
 */
function joinsDate(points: readonly string[], at: number): boolean {
  return (
    isJoiner(points[at]) &&
    (numericAt(points, at + 1, false) !== null ||
      writtenAt(points, at + 1, false) !== null)
  );
}

/**
 * Where a time starting at `at`, right after its `T`, ends: past its run of
 * digits, `:`, `.` and `,`, at most `TIME_LONGEST` code points, then one `Z`,
 * or a `+` or hyphen and an offset written `01:00`. Only the joiner rule reads
 * it; the time itself stays in the file.
 */
function timeEnd(points: readonly string[], at: number): number {
  let end = at;
  while (end - at < TIME_LONGEST && holds(points, end, TIME_CHARACTER)) end += 1;

  if (points[end] === "Z" || points[end] === "z") return end + 1;
  const offset =
    (points[end] === "+" || holds(points, end, HYPHEN)) &&
    holds(points, end + 1, ASCII_DIGIT) &&
    holds(points, end + 2, ASCII_DIGIT) &&
    points[end + 3] === ":" &&
    holds(points, end + 4, ASCII_DIGIT) &&
    holds(points, end + 5, ASCII_DIGIT);
  return offset ? end + 6 : end;
}

/**
 * A written date starting at `at`, or `null`: day first from a digit, month
 * first from a letter, with a month `MONTHS` knows, a full stop only after an
 * abbreviation, and a real day of that month in 1900 to 2099, both days real
 * when it names a range. With `checkEnd`, no letter or digit may touch its
 * end; a separator may, whatever is beyond it.
 */
function writtenAt(
  points: readonly string[],
  at: number,
  checkEnd: boolean,
): Found | null {
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
  const range = SECOND_DAY.exec(whole);
  if (range !== null && !isRealDate(year, month, Number(range[1]))) return null;

  const end = at + codePoints(whole).length;
  if (checkEnd && holds(points, end, ALPHANUMERIC)) return null;
  return { end, joinsAt: end };
}
