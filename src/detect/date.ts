import { isNumericDate, isRealDate, isUnseparatedDate, isYearFirstDate } from "./dates";
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
 * Two scans (spec 0015, AC-1). Everything above is the first scan, run
 * exactly as it always was (`FIRST_PASS`), so every date it lists keeps its
 * start, end and tick. A second scan (`SECOND_PASS`) then reads the forms
 * spec 0015 adds, only over what the first left free: it steps over each first
 * scan row whole, and lists a date only where it ends before the next one
 * starts. A new form read at an earlier start could otherwise swallow the
 * start of a date the first scan lists (`31 Oct 11` out of
 * `2022/9/31 Oct 11, 1988` took the year), and dates are the lowest kind, so
 * nothing else can be touched (INV-1, INV-2). The forms it adds:
 *
 *  - a written month with flush separators, one hyphen, slash or full stop,
 *    the same code point both times: `05-Jan-2026`, `Sep-27-2026`,
 *    `2026-Sep-27`;
 *  - new joints in the written forms: a comma with no space before the year
 *    (`15 March,2026`), `day of` after an ordinal day
 *    (`27th day of September 2026`), a full stop after the day
 *    (`27. September 2026`), a comma after the month (`September, 27 2026`),
 *    and a day glued to an abbreviation's full stop (`Sept.27, 2026`);
 *  - year first with any separator and one or two digit parts (`2026.09.27`,
 *    `2026/9/7`), judged by `isYearFirstDate` and read with the numeric edges
 *    above;
 *  - eight digits unseparated (`20260927`), judged by `isUnseparatedDate`,
 *    which a digit of any script glued after drops with no marker reading;
 *  - spaced numeric separators with a four digit year (`27 / 09 / 2026`);
 *  - two digit years in the day first and month first written forms, flush
 *    or spaced, the spaced ones with an apostrophe or none (`27 Sep 26`,
 *    `27-SEP-26`, `Sep 27, '26`), which a letter or a time after drops
 *    (`Sep 27 10am`).
 *
 * The written forms' edges follow the written date rule above. The numeric
 * forms are never read through `isNumericDate`, which the phone detector
 * shares, so every phone row stays as it was (spec 0015, AC-13).
 *
 * The second scan reads today's forms too, wherever the first left them, with
 * two rules of its own. A word in `ADDED_DATE_LABELS` glued to a date lists
 * it unticked, as one in `DATE_LABELS` does (`Updated27/09/2026`, AC-8). And
 * a digit in another script right after a date, or after its footnote
 * marker, ends the row there rather than making the date part of a longer
 * number (`27 September 2026١`, `Born 12/05/1980¹١`, AC-9); two ASCII digits
 * still do, and so does a digit of any script before a date. The phone, card
 * and Social Security detectors read such a digit as before. Every new date
 * starts unticked unless a birth word stands before it (AC-14).
 *
 * Why it is linear (INV-7): each start reads a bounded stretch, at most three
 * groups of at most four digits for the numeric forms (the last read one digit
 * further, for a marker) and `WRITTEN_LONGEST` code points for the written
 * ones, and a glued birth word or date label is looked for in a window of
 * constant length. A date's end reads at most one more bounded stretch, the
 * date beyond a joiner, read with no edge check of its own. A start whose
 * rejection would fire reads at most `TIME_LONGEST` more, back to the last
 * date listed. A found date is stepped over whole. The second scan tries a
 * fixed list of readers at each start, the new written forms on a window of
 * `ADDED_WRITTEN_LONGEST`, and its pointer into the first scan's rows only
 * moves forward (spec 0015, AC-16).
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

/**
 * More words that label a value as a date (spec 0015, AC-8), read with
 * `DATE_LABELS` in the second scan only, exactly as `DATE_LABELS` is read:
 * one glued to a date, directly or through one separator
 * (`Updated27/09/2026`, `Due-27/09/2026`), lists it unticked. Kept apart so
 * the first scan, and every row it lists, stays as it was. A rule about how a
 * value is labelled, not a cap on the visitor.
 */
export const ADDED_DATE_LABELS: readonly string[] = Object.freeze([
  "created",
  "updated",
  "modified",
  "printed",
  "due",
  "deadline",
  "start",
  "starts",
  "end",
  "ends",
  "issue",
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

/**
 * What one scan reads by, handed to every reader as a plain value, so no
 * module state says which scan is running. Spec 0015, AC-1.
 */
interface DatePassRules {
  /** The labels a date may be glued to, directly or through one separator. */
  readonly labels: WordsAtEnd;
  /**
   * Whether a digit in another script right after a date, or after its
   * footnote marker, ends the row there with the date listed, rather than
   * making the date part of a longer number (AC-9).
   */
  readonly scriptDigitEndsRow: boolean;
  /** Whether a joiner parts a date from a form only the second scan reads beyond it. */
  readonly newFormsBeyondJoiner: boolean;
}

/** The first scan: today's labels, today's end rules, today's forms beyond a joiner. */
const FIRST_PASS: DatePassRules = Object.freeze({
  labels: DATE_LABEL_AT_END,
  scriptDigitEndsRow: false,
  newFormsBeyondJoiner: false,
});

/**
 * The second scan, which only adds rows where the first listed none: both
 * label lists, a digit in another script as the end of a row, and the new
 * forms beyond a joiner.
 */
const SECOND_PASS: DatePassRules = Object.freeze({
  labels: atEnd(wordList([...DATE_LABELS, ...ADDED_DATE_LABELS])),
  scriptDigitEndsRow: true,
  newFormsBeyondJoiner: true,
});

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

// The written forms spec 0015 adds, read only by the second scan. Like today's,
// each is anchored at its start with every quantifier bounded and none nested
// in another, and runs on a window of at most `ADDED_WRITTEN_LONGEST` code
// points (AC-16). Their named groups are judged by `judged`. Rules about how
// dates are written, not caps on the visitor.

/** One flush separator: a hyphen as `HYPHEN` reads one, a slash or a full stop. */
const FLUSH = "[-\\u2010-\\u2015\\u2212/.]";

/**
 * The year of a day first or month first written date: four digits, or two
 * (AC-5). Where four follow, they are the year and are never read again as
 * two, since the first alternative that holds is the one read.
 */
const YEAR = "(?<year>[0-9]{4}|[0-9]{2})";

/**
 * The same after a gap or a comma, where two digits may also follow an
 * apostrophe, `'` or U+2019, with no gap (`27 Sep '26`). `judged` drops it.
 */
const SPACED_YEAR = "(?<year>[0-9]{4}|['\\u2019]?[0-9]{2})";

/** An apostrophe before a two digit year, as `SPACED_YEAR` reads one. */
const APOSTROPHE = /^['’]/u;

/**
 * `05-Jan-2026`, `27/Sep/2026`, `27.Sep.2026`, `27-SEP-26`: the same code
 * point both times, so `27-Sep–2026` is not read (AC-2).
 */
const FLUSH_DAY_FIRST = new RegExp(
  `^(?<day>[0-9]{1,2})(?<separator>${FLUSH})(?<month>[a-z]{3,9})\\k<separator>${YEAR}`,
  "iu",
);

/** `Sep-27-2026`, `Sep.27.2026`, `SEP-27-26` (AC-2). */
const FLUSH_MONTH_FIRST = new RegExp(
  `^(?<month>[a-z]{3,9})(?<separator>${FLUSH})(?<day>[0-9]{1,2})\\k<separator>${YEAR}`,
  "iu",
);

/** `2026-Sep-27`, `2026/SEP/27` (AC-2). */
const FLUSH_YEAR_FIRST = new RegExp(
  `^(?<year>[0-9]{4})(?<separator>${FLUSH})(?<month>[a-z]{3,9})\\k<separator>(?<day>[0-9]{1,2})`,
  "iu",
);

/**
 * Before the year: a comma and 0 to `MAX_GAP` whitespace (`15 March,2026`), or
 * a gap alone. A comma and a gap is today's joint too.
 */
const YEAR_JOINT = `(?:,\\s{0,${MAX_GAP}}|${GAP})`;

/**
 * Day first with the new joints (AC-6): a full stop after the day
 * (`27. September 2026`), `day of` after an ordinal day
 * (`27th day of September 2026`), and the comma of `YEAR_JOINT`; and with any
 * joint, today's included, a two digit year (`27 Sep 26`, AC-5). No day
 * range, which only today's form reads.
 */
const DAY_FIRST_JOINTS = new RegExp(
  `^(?<day>[0-9]{1,2})(?<ordinal>st|nd|rd|th)?(?<dayStop>\\.)?${GAP}` +
    `(?:(?<legal>day)${GAP}of${GAP}|of${GAP})?` +
    `(?<month>[a-z]{3,9})(?<monthStop>\\.?)${YEAR_JOINT}${SPACED_YEAR}`,
  "iu",
);

/**
 * Month first with the new joints (AC-6): a comma after the month
 * (`September, 27 2026`), a day glued to an abbreviation's full stop
 * (`Sept.27, 2026`, `judged` holds a glued day to that), and the comma of
 * `YEAR_JOINT` (`March 15,2026`); and with any joint, a two digit year
 * (`Sep 27, '26`, AC-5).
 */
const MONTH_FIRST_JOINTS = new RegExp(
  `^(?<month>[a-z]{3,9})(?<monthStop>\\.?)(?<monthJoint>,${GAP}|${GAP}|)` +
    `(?<day>[0-9]{1,2})${ORDINAL}${YEAR_JOINT}${SPACED_YEAR}`,
  "iu",
);

/** The added written patterns tried from a digit, then from a letter, in AC-1's order. */
const ADDED_FROM_DIGIT = Object.freeze([
  FLUSH_DAY_FIRST,
  FLUSH_YEAR_FIRST,
  DAY_FIRST_JOINTS,
]);
const ADDED_FROM_LETTER = Object.freeze([FLUSH_MONTH_FIRST, MONTH_FIRST_JOINTS]);

/**
 * The window the added written patterns read, in code points: today's longest
 * grown by `day` and its gap before `of` (AC-6). No other new joint is longer
 * than a part today's longest form already counts.
 */
const ADDED_WRITTEN_LONGEST = WRITTEN_LONGEST + "day".length + MAX_GAP;

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

/** A reader: the date starting at `at`, its edges checked, or `null`. */
type Reader = (
  points: readonly string[],
  at: number,
  lastEnd: number,
  rules: DatePassRules,
) => Found | null;

/** Today's readers: a numeric date, then a written one. */
const readToday: Reader = (points, at, lastEnd, rules) =>
  numericAt(points, at, lastEnd, rules, isNumericDate) ??
  writtenAt(points, at, true, rules);

/**
 * The second scan's readers in AC-1's order, today's first, so a form today
 * reads is read as today reads it wherever the first scan left it free.
 */
const readAll: Reader = (points, at, lastEnd, rules) =>
  readToday(points, at, lastEnd, rules) ??
  numericAt(points, at, lastEnd, rules, isYearFirstDate) ??
  unseparatedAt(points, at, lastEnd, rules) ??
  spacedAt(points, at, rules) ??
  addedWrittenAt(points, at, true, rules);

/** The date detector's two scans. Spec 0015, AC-1. */
export interface DatePasses {
  /** Today's scan, exactly. */
  readonly first: readonly Span[];
  /** The second scan's dates, each over positions no `first` row holds. */
  readonly added: readonly Span[];
}

/**
 * Both scans over one block (AC-1). `detect` reads them apart, since a
 * rescued phone stretch yields only to `first` (AC-12).
 */
export function datePasses(input: DetectInput): DatePasses {
  const points = codePoints(input.text);
  const first = scan(points, FIRST_PASS, readToday, []);
  return Object.freeze({ first, added: scan(points, SECOND_PASS, readAll, first) });
}

/** Every date in one block, both scans together, in order of start. */
export function detectDate(input: DetectInput): readonly Span[] {
  const { first, added } = datePasses(input);
  return [...first, ...added].sort((a, b) => a.start - b.start);
}

/**
 * One scan with `read`. With `taken`, the first scan's rows, a row is stepped
 * over whole, and a date is listed only where it ends at or before the next
 * row's start; otherwise nothing is listed at that start (AC-1).
 */
function scan(
  points: readonly string[],
  rules: DatePassRules,
  read: Reader,
  taken: readonly Span[],
): Span[] {
  const spans: Span[] = [];
  // Where the last row either scan listed ended, for the joiner rule. Kept
  // only for a date actually listed, and never reset: a stale value is either
  // too far back for a time to fill, or has only a time after it, which is
  // exactly what the rule lets a joiner part.
  let lastEnd = -1;
  // The first of `taken` that ends after `at`. It only moves forward (AC-16).
  let next = 0;

  for (let at = 0; at < points.length;) {
    while (next < taken.length && taken[next].end <= at) next += 1;
    const row = taken[next];
    if (row !== undefined && row.start <= at) {
      lastEnd = row.end;
      at = row.end;
      continue;
    }
    const date =
      !holds(points, at, STARTS) || gluedAt(points, at, rules)
        ? null
        : read(points, at, lastEnd, rules);
    if (date === null || (row !== undefined && date.end > row.start)) {
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
function gluedAt(points: readonly string[], at: number, rules: DatePassRules): boolean {
  return (
    holds(points, at - 1, ALPHANUMERIC) &&
    !birthGluedTo(points, at) &&
    !labelGluedTo(points, at, rules)
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
 * Does one of the scan's date labels glue to `at` the same way? So
 * `Date27/09/2026`, `Exp.31.12.2026` and `Date-27/09/2026` each have one, and
 * `Toronto27/09/2026` has none (AC-19, INV-17).
 */
function labelGluedTo(
  points: readonly string[],
  at: number,
  rules: DatePassRules,
): boolean {
  return wordGluedTo(points, at, rules.labels);
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
  rules: DatePassRules,
): boolean {
  const cut =
    (isJoiner(points[at - 1]) && holds(points, at - 2, LETTER)) ||
    (separatorClass(points[at - 1]) === own && holds(points, at - 2, DIGIT));
  return cut && !startExempt(points, at, lastEnd, rules);
}

/**
 * Is a date starting at `at` exempt from a start rejection? Yes when the
 * separator before it is a joiner with only a time back to the last date
 * listed, or when a birth word or one of the scan's labels is what is glued.
 */
function startExempt(
  points: readonly string[],
  at: number,
  lastEnd: number,
  rules: DatePassRules,
): boolean {
  if (isJoiner(points[at - 1]) && onlyTimeBetween(points, lastEnd, at - 1)) return true;
  return birthGluedTo(points, at) || labelGluedTo(points, at, rules);
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
  rules: DatePassRules,
): boolean {
  if (holds(points, end, digitAfter(rules))) {
    return !markerAt(points, end, yearDigits, rules);
  }
  return (
    own !== null &&
    separatorClass(points[end]) === own &&
    holds(points, end + 1, DIGIT) &&
    !joinsDate(points, end, rules) &&
    !(own === "." && markerAt(points, end + 1, yearDigits, rules))
  );
}

/**
 * Is the code point at `at` a footnote marker after a date whose year has
 * `yearDigits` digits? Exactly one ASCII digit with no digit after it, after
 * a four digit year: NFKC reads `¹` as `1`. After a two digit year a digit is
 * as likely a longer number's (`05.12.801`), so it is none.
 */
function markerAt(
  points: readonly string[],
  at: number,
  yearDigits: number,
  rules: DatePassRules,
): boolean {
  return (
    yearDigits === 4 &&
    holds(points, at, ASCII_DIGIT) &&
    !holds(points, at + 1, digitAfter(rules))
  );
}

/**
 * The digit that, glued after a date or its marker, makes it part of a longer
 * number: a digit of any script, or in a scan whose `scriptDigitEndsRow` holds,
 * an ASCII digit only, since a digit in another script is then where the row
 * ends (spec 0015, AC-9).
 */
function digitAfter(rules: DatePassRules): RegExp {
  return rules.scriptDigitEndsRow ? ASCII_DIGIT : DIGIT;
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
 * costs one bounded read; the marker is read on either side. `isDate` is
 * `isNumericDate`, or in the second scan `isYearFirstDate` too, read with
 * these same edges (spec 0015, AC-3).
 */
function numericAt(
  points: readonly string[],
  at: number,
  lastEnd: number | null,
  rules: DatePassRules,
  isDate: (text: string) => boolean,
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
  if (!isDate(text)) {
    // Only a group of three or more less its last digit can leave a year of
    // four, or an ISO day of two.
    if (lastGroup < 3) return null;
    end -= 1;
    text = points.slice(at, end).join("");
    if (!isDate(text) || !markerAt(points, end, yearDigitsOf(text), rules)) return null;
  }
  if (lastEnd === null) return { end };
  if (cutAtStart(points, at, own, lastEnd, rules)) return null;
  if (cutAtEnd(points, end, own, yearDigitsOf(text), rules)) return null;
  return { end };
}

/**
 * Is the code point at `at` a joiner with a full date right after it, its
 * edges unchecked? In the first scan, a date in any of today's forms; in the
 * second, a form it adds too (spec 0015, AC-1). So `01/05/1980-31/05/1980`
 * parts at its hyphen, while `2026-09-27-01` stays one code.
 */
function joinsDate(points: readonly string[], at: number, rules: DatePassRules): boolean {
  if (!isJoiner(points[at])) return false;
  return (
    numericAt(points, at + 1, null, rules, isNumericDate) !== null ||
    writtenAt(points, at + 1, false, rules) !== null ||
    (rules.newFormsBeyondJoiner &&
      (numericAt(points, at + 1, null, rules, isYearFirstDate) !== null ||
        addedWrittenAt(points, at + 1, false, rules) !== null))
  );
}

/** How many digits an unseparated date holds: `yyyymmdd`. A rule about the form. */
const UNSEPARATED_DIGITS = 8;

/**
 * An unseparated date starting at `at`, or `null`: exactly eight ASCII digits
 * that `isUnseparatedDate` reads (spec 0015, AC-4). A digit of any script
 * glued after it drops it, with no marker reading, since a ninth digit is as
 * likely a longer number's. Before it, a letter then a joiner, or any
 * separator with a digit before it, drops it (`INV-20260927`, `12-20260927`,
 * `1.20260927`), with `startExempt`'s exemptions. After it, a separator with
 * a digit after it drops it (`20260927-001`), unless it is a joiner with a
 * full date beyond it. A letter after it does not (`20260927T101500Z`).
 */
function unseparatedAt(
  points: readonly string[],
  at: number,
  lastEnd: number,
  rules: DatePassRules,
): Found | null {
  let end = at;
  while (end - at <= UNSEPARATED_DIGITS && holds(points, end, ASCII_DIGIT)) end += 1;
  if (end - at !== UNSEPARATED_DIGITS || holds(points, end, DIGIT)) return null;
  if (!isUnseparatedDate(points.slice(at, end).join(""))) return null;

  const cutBefore =
    (isJoiner(points[at - 1]) && holds(points, at - 2, LETTER)) ||
    (separatorClass(points[at - 1]) !== null && holds(points, at - 2, DIGIT));
  if (cutBefore && !startExempt(points, at, lastEnd, rules)) return null;
  const cutAfter =
    separatorClass(points[end]) !== null &&
    holds(points, end + 1, DIGIT) &&
    !joinsDate(points, end, rules);
  return cutAfter ? null : { end };
}

const WHITESPACE = /^\s$/u;

/**
 * A date with spaced separators starting at `at`, or `null` (spec 0015,
 * AC-7): three groups of ASCII digits, each separator one `/`, `.` or hyphen
 * with 1 to `MAX_GAP` whitespace on each side, the same class both times,
 * where the first or the last group has four digits and the groups closed up
 * round the first separator are a date under `isNumericDate` or
 * `isYearFirstDate` (`27 / 09 / 2026`, `2026 - 09 - 27`). No two digit years:
 * a score reads as one (`won 6 - 7 - 77`). A digit of any script after it
 * drops it, but for one marker digit after it, read as for numeric dates and
 * outside the row (`27 / 09 / 20261`, `2026 - 09 - 271`). Nothing before it
 * is checked beyond the start test every date passes, so a spaced code lists
 * its last three groups.
 */
function spacedAt(
  points: readonly string[],
  at: number,
  rules: DatePassRules,
): Found | null {
  const groups: string[] = [];
  let own: SeparatorClass | null = null;
  let closer = "";
  let end = at;
  for (let group = 0; group < 3; group += 1) {
    if (group > 0) {
      const separator = gapEnd(points, end);
      const kind = separatorClass(points[separator]);
      if (separator === end || kind === null || (own !== null && kind !== own))
        return null;
      own ??= kind;
      closer ||= points[separator];
      end = gapEnd(points, separator + 1);
      if (end === separator + 1) return null;
    }
    const from = end;
    const most = group === 2 ? MAX_GROUP_DIGITS + 1 : MAX_GROUP_DIGITS;
    while (end - from <= most && holds(points, end, ASCII_DIGIT)) end += 1;
    if (end === from || end - from > most) return null;
    groups.push(points.slice(from, end).join(""));
  }
  if (holds(points, end, DIGIT)) return null;

  const [first, second, last] = groups;
  if (spacedDate(first, second, last, closer)) return { end };
  // A footnote marker, read as for numeric dates: only a last group of three
  // or more less its last digit can leave a year of four, or a day of two,
  // and `spacedDate` holds that the year has four.
  if (last.length < 3 || !spacedDate(first, second, last.slice(0, -1), closer))
    return null;
  return markerAt(points, end - 1, 4, rules) ? { end: end - 1 } : null;
}

/** Is a spaced date's three groups, closed up round `closer`, a date with a four digit year? */
function spacedDate(
  first: string,
  second: string,
  last: string,
  closer: string,
): boolean {
  if (first.length !== MAX_GROUP_DIGITS && last.length !== MAX_GROUP_DIGITS) return false;
  const text = [first, second, last].join(closer);
  return isNumericDate(text) || isYearFirstDate(text);
}

/**
 * Where a run of 1 to `MAX_GAP` whitespace starting at `at` ends, or `at`
 * itself when there is none or too much, so the caller's next test fails.
 */
function gapEnd(points: readonly string[], at: number): number {
  let end = at;
  while (end - at <= MAX_GAP && holds(points, end, WHITESPACE)) end += 1;
  return end - at > MAX_GAP ? at : end;
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
  rules: DatePassRules,
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
  if (checkEnd && cutAtEnd(points, end, null, 4, rules)) return null;
  return { end };
}

/**
 * A date in one of the written forms spec 0015 adds starting at `at`, or
 * `null`: from a digit the flush day first and year first forms, then day
 * first with the new joints; from a letter the flush month first form, then
 * month first with the new joints. The first that reads a date decides
 * (AC-1). With `checkEnd`, its end follows today's written date rule.
 */
function addedWrittenAt(
  points: readonly string[],
  at: number,
  checkEnd: boolean,
  rules: DatePassRules,
): Found | null {
  const patterns = holds(points, at, ASCII_DIGIT) ? ADDED_FROM_DIGIT : ADDED_FROM_LETTER;
  const window = points.slice(at, at + ADDED_WRITTEN_LONGEST).join("");
  for (const pattern of patterns) {
    const parts = pattern.exec(window);
    if (parts?.groups === undefined) continue;
    const end = judged(points, at, parts[0], parts.groups, checkEnd, rules);
    if (end !== null) return { end };
  }
  return null;
}

/**
 * Where a match of an added written pattern ends, or `null` when it is no
 * date: a month `MONTHS` knows, a full stop only after an abbreviation,
 * `day of` only after an ordinal, a day glued to the month only after an
 * abbreviation's full stop (AC-6), and a real day of that month (AC-2), a two
 * digit year real in either century (AC-5). With `checkEnd`, its end follows
 * today's written date rule, and after a two digit year `shortYearRunsOn`'s.
 */
function judged(
  points: readonly string[],
  at: number,
  whole: string,
  parts: Readonly<Record<string, string | undefined>>,
  checkEnd: boolean,
  rules: DatePassRules,
): number | null {
  const name = (parts.month ?? "").toLowerCase();
  const month = MONTHS.get(name);
  if (month === undefined) return null;
  if (parts.monthStop === "." && !ABBREVIATIONS.has(name)) return null;
  if (parts.legal !== undefined && parts.ordinal === undefined) return null;
  if (parts.monthJoint === "" && parts.monthStop !== ".") return null;
  const year = (parts.year ?? "").replace(APOSTROPHE, "");
  if (!isRealDate(year, month, Number(parts.day))) return null;

  const end = at + codePoints(whole).length;
  if (!checkEnd) return end;
  if (cutAtEnd(points, end, null, year.length, rules)) return null;
  return year.length === 2 && shortYearRunsOn(points, end) ? null : end;
}

/** What makes a two digit year a time or a longer number, with a digit after it. */
const RUNS_ON = /^[:.,]$/u;

/**
 * Does what follows a two digit year ending at `end` make it no year (AC-5)?
 * A letter makes it part of a word or a time (`Sep 27 10am`), and a `:`, `.`
 * or `,` with a digit after it a time, a longer number, or the start of a
 * year beyond (`Mon 27 Sep 10:00`, `27 Sep 10.30`, `Sep 27, 26,000`,
 * `29 JUL 11,1984`). A digit glued to it is `cutAtEnd`'s, and never a marker
 * after two digits. Anything else leaves it listed, a slash or a hyphen and a
 * digit included (`06-MAR-23/07700 859 471`): a broader rule missed such
 * dates in the measurement.
 */
function shortYearRunsOn(points: readonly string[], end: number): boolean {
  return (
    holds(points, end, LETTER) ||
    (holds(points, end, RUNS_ON) && holds(points, end + 1, DIGIT))
  );
}
