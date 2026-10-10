import { isNumericDate, isRealDate } from "./dates";
import {
  ALPHANUMERIC,
  ASCII_DIGIT,
  codePoints,
  holds,
  HYPHEN,
  wordBefore,
  wordList,
  type WordList,
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
 *    `June 3–5, 2026`, and month first with spaces round the dash,
 *    `June 5 - 7, 2026`), one row for both, since the first day alone is not
 *    a full date.
 *
 * Documents are full of dates, and most are no secret: a letter's date, a
 * contract's start. So a date starts unticked unless a birth word ends within
 * `KEYWORD_REACH` before it, glued to its start included (AC-10), and the
 * checklist lists the rest for the visitor to judge, never removing one by
 * default.
 *
 * A full, real date is never dropped for what follows it or what it is joined
 * to (INV-17): a letter glued to it (`05.12.1980a`, `27 September 2026AD`), a
 * separator and a word (`12/05/1980-Smith`), a different separator and digits
 * (`05.12.1980-17`), a time (`2026-09-27T10:00:00Z`), a footnote marker. The
 * row is the date alone, and at worst it is listed unticked. Two rejections
 * are kept, each because measurement shows that without it a longer code
 * lists a date:
 *
 *  - a letter glued to a date's start, or right before a hyphen or a slash
 *    right before a numeric date: how a reference or a path reads
 *    (`x27 September 2026`, `REF-05.12.1980`, `report-27-09-2026-v2.pdf`). A
 *    letter before a dot never cuts, since a full stop after a letter ends an
 *    abbreviation or a sentence (`Exp.31.12.2026`, `w.e.f.27.09.2026`) and
 *    never glues a code;
 *  - a numeric date's own separator (the one its groups share, by class: `/`,
 *    `.` or any hyphen) running on with a digit on either side: how a longer
 *    number of the same shape reads (`1/05/12/1980`, `2026-09-27-01`,
 *    `05.12.1980.17`).
 *
 * A footnote marker stuck after a date does not hide it (spec 0005, third
 * update of 2026-10-11). NFKC reads a superscript `¹` as `1`, and MuPDF reads
 * a mark set flush after a value as glued to it, so exactly one ASCII digit
 * right after a date whose year has four digits, with no digit after it, is a
 * marker and lies outside the row (`Born 12/05/1980¹`, `27 September 2026¹`).
 * A dotted date's own full stop followed by one is a sentence's end and its
 * mark (`geboren am 12.05.1980.¹`). Two or more digits, a digit in another
 * script, or one digit after a two digit year are a longer number, never a
 * date (`27 September 202612`, `05.12.80¹`), and so is a hyphen or a slash and
 * one digit, the shape of a build number (`2026-09-27-1`).
 *
 * Each rejection before a date has exemptions. A joiner (one hyphen or one
 * slash, never a dot) parts two full dates when only a time stands between it
 * and the end of the last date listed, so both dates of
 * `27/09/2026 10:00-28/09/2026 11:00` and of
 * `2026-09-27T10:00:00EST-2026-09-28` are found, each its own row. The time is
 * judged by its characters, never parsed, so no way of writing one is left
 * out and nothing can read into the next date. And a birth word or a date
 * label glued to the date, directly or through one separator
 * (`DOB27/09/1980`, `D.O.B.12.05.1980`, `Date27/09/2026`, `Date-27/09/2026`),
 * lists it: text extraction runs a label into its value. A birth word ticks
 * it, as one before any date does, since a date of birth is the date this
 * detector exists for; a label leaves it unticked, since it says the value is
 * a date, not whose. After a date, the own separator rule is lifted by a
 * joiner with a full date beyond it (`2026-09-01-2026-09-30`).
 *
 * Why it is linear (INV-7): each start reads a bounded stretch, at most three
 * groups of at most four digits for the numeric forms (the last read one digit
 * further, for a marker) and `WRITTEN_LONGEST` code points for the written
 * ones, and a glued birth word or date label is looked for in a window of
 * constant length. A date's end reads at most one more bounded stretch, the
 * date beyond a joiner, read with no edge check of its own. A start whose
 * rejection would fire reads at most `TIME_LONGEST` more, back to the last
 * date listed. A found date is stepped over whole.
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

/**
 * The words that label a value as a date, matched in any case as whole
 * words. One glued to a date, directly or through one separator
 * (`Exp.31.12.2026`, `Date-27/09/2026`), is a label run into its value by
 * text extraction, so it lifts the start rejections as a glued birth word
 * does, and the date stays unticked (AC-19, INV-17). A rule about how a value
 * is labelled, not a cap on the visitor.
 */
export const DATE_LABELS: readonly string[] = Object.freeze([
  "date",
  "dated",
  "dt",
  "exp",
  "expiry",
  "expires",
  "expired",
  "issued",
  "valid",
  "from",
  "to",
  "until",
  "on",
  "effective",
  "signed",
]);

const BIRTH_WORD_LIST = wordList(BIRTH_WORDS);

/**
 * A word list matched only where a word ends exactly where the text it is
 * tried on ends: the whole word pattern `wordList` builds, anchored at that
 * end. Tried on a window of the list's longest word and the one code point
 * before it, so the test costs a constant.
 */
interface WordsAtEnd {
  readonly pattern: RegExp;
  readonly longest: number;
}

function atEnd(list: WordList): WordsAtEnd {
  return Object.freeze({
    pattern: new RegExp(`${list.pattern.source}$`, "iu"),
    longest: list.longest,
  });
}

const BIRTH_WORD_AT_END = atEnd(BIRTH_WORD_LIST);
const DATE_LABEL_AT_END = atEnd(wordList(DATE_LABELS));

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
 * the match. Day first, the dash takes no spaces, because a number, a spaced
 * dash and a date is also how a numbered heading reads (`Table 2 - 14 March
 * 2026`), and one row for the whole would remove the number with the date.
 */
const DAY_RANGE = `(?:${DASH}[0-9]{1,2}${ORDINAL})?`;

/**
 * Month first, the range's dash may have 0 to `MAX_GAP` whitespace on each
 * side, counted apart (`June 5 - 7, 2026`): between the month and the dash
 * nothing but a day can stand, so no heading number is swallowed.
 */
const SPACED_DAY_RANGE = `(?:\\s{0,${MAX_GAP}}${DASH}\\s{0,${MAX_GAP}}[0-9]{1,2}${ORDINAL})?`;

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

/** `September 27, 2026`, `Sep 27 2026`, `Sept. 27th, 2026`, `June 5 - 7, 2026`. */
const MONTH_FIRST = new RegExp(
  `^([a-z]{3,9})(\\.?)${GAP}([0-9]{1,2})${ORDINAL}${SPACED_DAY_RANGE},?${GAP}([0-9]{4})`,
  "iu",
);

/**
 * A day range's second day, read from a written date's match, with the spaces
 * the month first range allows. Nothing else in a written date holds a dash,
 * so the first is the range's.
 */
const SECOND_DAY = new RegExp(`${DASH}\\s{0,${MAX_GAP}}([0-9]{1,2})`, "u");

/**
 * The longest written date, in code points: a day of 2, an ordinal of 2, a
 * day range of 5 (a dash, a day of 2, an ordinal of 2) and, month first, a gap
 * on each side of its dash, a gap and `of`, a gap, a month of 9, a full stop,
 * a comma, a gap and a year of 4.
 */
const WRITTEN_LONGEST =
  2 + 2 + 5 + 2 * MAX_GAP + (MAX_GAP + 2) + MAX_GAP + 9 + 1 + 1 + MAX_GAP + 4;

/** The most digits one group of a numeric date holds: a year's 4. */
const MAX_GROUP_DIGITS = 4;

/**
 * The longest stretch, in code points, that may stand between the end of the
 * last date listed and a joiner for the joiner to part two dates: past any
 * real time (`T23:59:59.999999999` is 19), with room for a gap, an offset and
 * a zone (`, 10:00 PM EST`, `T10:00:00+01:00`). The cap is there for INV-7,
 * not to judge a time: with none, every start whose rejection would fire
 * could read all the way back to the last date listed, which is quadratic on
 * a crafted block. A time longer than this is one the joiner cannot see
 * across, and lifting the cap is never the fix for one.
 */
const TIME_LONGEST = 40;

/**
 * The most letters in a row a time may hold: the `T` of ISO 8601, the `h` of
 * `10h00`, `PM`, `EST`, `UTC`. A six letter word (`Monday`) is not part of a
 * time. A rule about how times are written, not a cap on the visitor.
 */
const TIME_LETTERS_MOST = 5;

/**
 * What a time between two dates is made of, one code point at a time: a
 * digit, whitespace, `:`, `.`, `,`, `+`, `@`, a hyphen as `HYPHEN` reads one,
 * or a letter. Judged by its characters rather than parsed, so `@ 10:00`,
 * `10h00`, `UTC+1` and `T10:00:00.123Z` are all times, and nothing is read
 * that could swallow part of the next date.
 */
const TIME_CHARACTER = /^[\p{L}\p{N}\s:.,+@\-‐-―−]$/u;

const LETTER = /^\p{L}$/u;

/** A digit in any script: a value glued to one is part of a longer number. */
const DIGIT = /^\p{N}$/u;

/** A date found at one start: where its row ends. */
interface Found {
  readonly end: number;
}

export function detectDate(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];
  // Where the last date listed ended, for the joiner rule. Kept only for a
  // date actually listed, and never reset: a stale value is either too far
  // back for a time to fill, or has only a time after it, which is exactly
  // what the rule lets a joiner part.
  let lastEnd = -1;

  for (let at = 0; at < points.length;) {
    const date =
      !holds(points, at, STARTS) || gluedAt(points, at)
        ? null
        : (numericAt(points, at, lastEnd) ?? writtenAt(points, at, true));
    if (date === null) {
      at += 1;
      continue;
    }
    spans.push({
      kind: "date",
      start: at,
      end: date.end,
      // `wordBefore`'s window ends at the date's start, so it sees a birth
      // word glued there as whole (`DOB27/09/1980`) and needs no help (AC-10).
      tickedByDefault: wordBefore(points, at, BIRTH_WORD_LIST),
    });
    lastEnd = date.end;
    at = date.end;
  }
  return spans;
}

/** The three classes a numeric date's separator falls in: `/`, `.`, or any hyphen. */
type SeparatorClass = "/" | "." | "-";

function separatorClass(point: string | undefined): SeparatorClass | null {
  if (point === "/" || point === ".") return point;
  return point !== undefined && HYPHEN.test(point) ? "-" : null;
}

/** A hyphen or a slash, never a dot: what may join two full dates. */
function isJoiner(point: string | undefined): boolean {
  const kind = separatorClass(point);
  return kind === "/" || kind === "-";
}

/**
 * Is a letter or digit glued to a date starting at `at`, with no birth word
 * or date label as the thing glued? Either form of date may not start inside
 * a word or a number (INV-17), but `DOB27/09/1980` and `Date27/09/2026` are
 * labels run into their values.
 */
function gluedAt(points: readonly string[], at: number): boolean {
  return (
    holds(points, at - 1, ALPHANUMERIC) &&
    !birthGluedTo(points, at) &&
    !labelGluedTo(points, at)
  );
}

/**
 * Does a birth word, with no letter or digit before it, end exactly at `at`,
 * or exactly before the one separator at `at - 1`? So `DOB27/09/1980`,
 * `DOB-12/05/1980` and `D.O.B.12.05.1980` each have one, and
 * `Reborn27/09/1980` has none (AC-10, INV-17).
 */
function birthGluedTo(points: readonly string[], at: number): boolean {
  return wordGluedTo(points, at, BIRTH_WORD_AT_END);
}

/**
 * Does a date label glued to `at` the same way? So `Date27/09/2026`,
 * `Exp.31.12.2026` and `Date-27/09/2026` each have one, and
 * `Updated27/09/2026` and `Toronto27/09/2026` have none (AC-19, INV-17).
 */
function labelGluedTo(points: readonly string[], at: number): boolean {
  return wordGluedTo(points, at, DATE_LABEL_AT_END);
}

function wordGluedTo(points: readonly string[], at: number, words: WordsAtEnd): boolean {
  return (
    wordEndsAt(points, at, words) ||
    (separatorClass(points[at - 1]) !== null && wordEndsAt(points, at - 1, words))
  );
}

function wordEndsAt(points: readonly string[], end: number, words: WordsAtEnd): boolean {
  const from = Math.max(0, end - words.longest - 1);
  return words.pattern.test(points.slice(from, end).join(""));
}

/**
 * Would a numeric date starting at `at`, its groups parted by `own`, be read
 * out of a longer code? Yes after a letter and a hyphen or a slash
 * (`REF-05.12.1980`), never a dot (`Exp.31.12.2026`), or after its own
 * separator and a digit (`1/05/12/1980`), unless the separator is a joiner
 * with only a time between it and the last date listed
 * (`27-09-2026 10:00-12-10-2026`), or a birth word or a date label is what is
 * glued (`DOB-12/05/1980`, `Date-27/09/2026`). A letter or digit glued right
 * to its start is `gluedAt`'s, asked before the date is read. A different
 * separator after a digit never cuts: `5-7/6/2026` lists `7/6/2026`.
 */
function cutAtStart(
  points: readonly string[],
  at: number,
  own: SeparatorClass,
  lastEnd: number,
): boolean {
  const joiner = isJoiner(points[at - 1]);
  const cut =
    (joiner && holds(points, at - 2, LETTER)) ||
    (separatorClass(points[at - 1]) === own && holds(points, at - 2, DIGIT));
  if (!cut) return false;
  if (joiner && onlyTimeBetween(points, lastEnd, at - 1)) return false;
  return !birthGluedTo(points, at) && !labelGluedTo(points, at);
}

/**
 * Would a date ending at `end`, whose year has `yearDigits` digits, be read
 * out of a longer number? Yes with a digit glued to it, unless that digit is
 * a footnote marker (`27 September 20261`). For a numeric date, yes too with
 * its `own` separator and a digit after it (`2026-09-27-01`, `05.12.1980.17`),
 * unless that separator is a joiner with a full date beyond it
 * (`2026-09-01-2026-09-30`), or a dot followed by a marker, a sentence's full
 * stop and its mark (`12.05.1980.1`); a hyphen or a slash and one digit stays
 * the shape of a build number (`2026-09-27-1`). Anything else after a date
 * leaves it listed: a letter, a word, a different separator, a sentence's
 * full stop.
 */
function cutAtEnd(
  points: readonly string[],
  end: number,
  own: SeparatorClass | null,
  yearDigits: number,
): boolean {
  if (holds(points, end, DIGIT)) return !markerAt(points, end, yearDigits);
  return (
    own !== null &&
    separatorClass(points[end]) === own &&
    holds(points, end + 1, DIGIT) &&
    !joinsDate(points, end) &&
    !(own === "." && markerAt(points, end + 1, yearDigits))
  );
}

/**
 * Is the code point at `at` a footnote marker after a date whose year has
 * `yearDigits` digits? Exactly one ASCII digit with no digit of any script
 * after it, after a four digit year: NFKC reads `¹` as `1`. After a two digit
 * year a digit is as likely a longer number's (`05.12.801`), so it is none.
 */
function markerAt(points: readonly string[], at: number, yearDigits: number): boolean {
  return (
    yearDigits === 4 && holds(points, at, ASCII_DIGIT) && !holds(points, at + 1, DIGIT)
  );
}

/** A numeric date's year of four digits: before its first separator, or after its last. */
const FOUR_DIGIT_YEAR = /^[0-9]{4}[^0-9]|[^0-9][0-9]{4}$/u;

/** How many digits the year of a numeric date `isNumericDate` accepts has: 4 or 2. */
function yearDigitsOf(text: string): number {
  return FOUR_DIGIT_YEAR.test(text) ? 4 : 2;
}

/**
 * Is the stretch from `from` up to `to` empty, or only a time? At most
 * `TIME_LONGEST` code points, each a `TIME_CHARACTER`, holding at least one
 * ASCII digit and no run of more than `TIME_LETTERS_MOST` letters. With no
 * date listed yet (`from` below 0), it is neither.
 */
function onlyTimeBetween(points: readonly string[], from: number, to: number): boolean {
  if (from < 0 || to - from > TIME_LONGEST) return false;
  if (from === to) return true;
  let digit = false;
  let letters = 0;
  for (let at = from; at < to; at += 1) {
    if (!holds(points, at, TIME_CHARACTER)) return false;
    letters = holds(points, at, LETTER) ? letters + 1 : 0;
    if (letters > TIME_LETTERS_MOST) return false;
    digit ||= holds(points, at, ASCII_DIGIT);
  }
  return digit;
}

/**
 * A numeric date starting at `at`, or `null`: three groups of 1 to 4 ASCII
 * digits parted by single separators, which `isNumericDate` then judges,
 * separators and calendar together, so both separators fall in the class of
 * the first. The last group is read one digit further, and when the whole is
 * no date, the text without that group's last digit is tried, for a footnote
 * marker stuck after a four digit year (`27/09/20261` reads `27/09/2026`,
 * `2026-09-271` reads `2026-09-27`); the row ends before the marker. With
 * `lastEnd`, where the last date listed ended, both edges are checked. With
 * `null`, as the far side of a joiner is read, neither is, so each joiner
 * costs one bounded read; the marker is read on either side.
 */
function numericAt(
  points: readonly string[],
  at: number,
  lastEnd: number | null,
): Found | null {
  let end = at;
  let own: SeparatorClass | null = null;
  let lastGroup = 0;
  for (let group = 0; group < 3; group += 1) {
    if (group > 0) {
      const separator = separatorClass(points[end]);
      if (separator === null) return null;
      own ??= separator;
      end += 1;
    }
    const from = end;
    const most = group === 2 ? MAX_GROUP_DIGITS + 1 : MAX_GROUP_DIGITS;
    while (end - from <= most && holds(points, end, ASCII_DIGIT)) end += 1;
    if (end === from || end - from > most) return null;
    lastGroup = end - from;
  }
  if (own === null) return null;

  let text = points.slice(at, end).join("");
  if (!isNumericDate(text)) {
    // Only a group of three or more less its last digit can leave a year of
    // four, or an ISO day of two.
    if (lastGroup < 3) return null;
    end -= 1;
    text = points.slice(at, end).join("");
    if (!isNumericDate(text) || !markerAt(points, end, yearDigitsOf(text))) return null;
  }
  if (lastEnd === null) return { end };
  if (cutAtStart(points, at, own, lastEnd)) return null;
  if (cutAtEnd(points, end, own, yearDigitsOf(text))) return null;
  return { end };
}

/**
 * Is the code point at `at` a joiner with a full date right after it, in any
 * form this detector reads, its edges unchecked? So `01/05/1980-31/05/1980`
 * parts at its hyphen, while `2026-09-27-01` stays one code.
 */
function joinsDate(points: readonly string[], at: number): boolean {
  return (
    isJoiner(points[at]) &&
    (numericAt(points, at + 1, null) !== null ||
      writtenAt(points, at + 1, false) !== null)
  );
}

/**
 * A written date starting at `at`, or `null`: day first from a digit, month
 * first from a letter, with a month `MONTHS` knows, a full stop only after an
 * abbreviation, and a real day of that month in 1900 to 2099, both days real
 * when it names a range. With `checkEnd`, no digit may touch its year but a
 * footnote marker (`27 September 20261`); a letter or a separator may,
 * whatever is beyond it, since a month name is never part of a code.
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
  if (checkEnd && cutAtEnd(points, end, null, 4)) return null;
  return { end };
}
