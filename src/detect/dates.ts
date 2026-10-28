/**
 * Full numeric dates. Spec 0005, *Detectors* (`date`) and INV-14.
 *
 * The phone detector asks this of every unit it reads, so a date is never
 * part of a phone window (AC-2), and the `date` detector (`./date.ts`) asks it
 * for its numeric forms rather than restating them (AC-19). Both asking the
 * same predicate is what leaves every numeric date for `date`, whatever
 * `PRECEDENCE` says. The trunk rule alone cannot do it: `05.12.1980` reads as
 * a `0` then seven digits, a possible UK number. The `date` detector's
 * written forms ask `isRealDate` too, so one calendar serves every form.
 *
 * Not exported from `@/detect`: these are rules the detectors share, not
 * detectors.
 *
 * Spec 0015 adds two numeric forms, year first with any separator and eight
 * digits unseparated, judged by `isYearFirstDate` and `isUnseparatedDate`.
 * Only the `date` detector's second scan asks them (AC-13). `isNumericDate`
 * reads neither, since a phone unit read as a date leaves the phone window:
 * widening it took digits from phone rows listed before (194 of 230,000
 * strings, spec 0015's `rationale.md`), where a new numeric date a phone row
 * holds now stays in that row, as it did before.
 */

/** The four digit years a date may name. A rule about the pattern, not a cap. */
const FIRST_YEAR = 1900;
const LAST_YEAR = 2099;

/** The longest form, `27.09.2026` or `2026-09-27`, in code points. */
const LONGEST = 10;

// Each pattern is anchored at both ends with every quantifier bounded, and
// runs only on text of at most `LONGEST` characters, so neither can backtrack
// far (INV-7).

/** Day and month in either order, then a 4 or 2 digit year, one separator twice. */
const DAY_MONTH_YEAR = /^([0-9]{1,2})([-/.])([0-9]{1,2})\2([0-9]{4}|[0-9]{2})$/u;
/** Year first, in ISO 8601's order: `2026-09-27`, `2026/09/27`. */
const YEAR_FIRST = /^([0-9]{4})([-/])([0-9]{2})\2([0-9]{2})$/u;
/** Year first with any separator and one or two digit parts: `2026.09.27`, `2026/9/7`. */
const YEAR_FIRST_ANY = /^([0-9]{4})([-/.])([0-9]{1,2})\2([0-9]{1,2})$/u;
/** Year, month and day with nothing between: `20260927`. */
const UNSEPARATED = /^([0-9]{4})([0-9]{2})([0-9]{2})$/u;

/**
 * Every dash a phone unit may be glued by, read here as `-`, so the phone
 * detector and this predicate agree on what one separator is.
 */
const DASHES = /[\u2010-\u2015\u2212]/gu;

const DAYS_IN_MONTH = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

/**
 * Is `text` a full numeric date: day, month and year as numbers with the same
 * separator (`/`, `-` or `.`) twice, real under a day first or a month first
 * reading, or year first ISO? A 4 digit year runs 1900 to 2099; a 2 digit
 * year is real when it is real in either of those centuries.
 */
export function isNumericDate(text: string): boolean {
  if (text.length > LONGEST) return false;
  const plain = text.replace(DASHES, "-");

  const yearFirst = YEAR_FIRST.exec(plain);
  if (yearFirst) {
    const [, year, , month, day] = yearFirst;
    return isRealDate(year, Number(month), Number(day));
  }

  const numeric = DAY_MONTH_YEAR.exec(plain);
  if (!numeric) return false;
  const [, first, , second, year] = numeric;
  return (
    isRealDate(year, Number(second), Number(first)) ||
    isRealDate(year, Number(first), Number(second))
  );
}

/**
 * Is `text` a year first date with any separator: a four digit year, then a
 * month and a day of one or two digits each, the same separator (`/`, `.` or
 * any hyphen, read as `-`) twice, and a real day? Spec 0015, AC-3.
 */
export function isYearFirstDate(text: string): boolean {
  if (text.length > LONGEST) return false;
  const found = YEAR_FIRST_ANY.exec(text.replace(DASHES, "-"));
  if (!found) return false;
  const [, year, , month, day] = found;
  return isRealDate(year, Number(month), Number(day));
}

/**
 * Is `text` exactly eight digits read as a four digit year, a month and a
 * day, and a real day? Only that order: `27092026` is none. Spec 0015, AC-4.
 */
export function isUnseparatedDate(text: string): boolean {
  const found = UNSEPARATED.exec(text);
  if (!found) return false;
  const [, year, month, day] = found;
  return isRealDate(year, Number(month), Number(day));
}

/**
 * Is this a real calendar day in a year the date forms may name? `yearText`
 * is the year as written: 4 digits run 1900 to 2099, and 2 digits are real
 * when they are real in either of those centuries.
 */
export function isRealDate(yearText: string, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const years =
    yearText.length === 4
      ? [Number(yearText)]
      : [FIRST_YEAR + Number(yearText), FIRST_YEAR + 100 + Number(yearText)];

  return years.some(
    (year) => year >= FIRST_YEAR && year <= LAST_YEAR && day <= daysIn(year, month),
  );
}

function daysIn(year: number, month: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return month === 2 && leap ? 29 : DAYS_IN_MONTH[month - 1];
}
