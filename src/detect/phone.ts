import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

import { isNumericDate } from "./dates";
import { codePoints, wordBefore, wordList } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * Phone numbers. Spec 0005, AC-2, AC-10 and AC-27, *Detectors* steps 1 to 8.
 *
 * Our own scanner proposes the candidates and libphonenumber-js judges each
 * one, with its `max` metadata, the only metadata whose `isValid()` checks the
 * digits rather than the length alone. The library's own matcher,
 * `findNumbers`, is not used: it finds nothing in a run of numbers side by
 * side, reads a comma as an extension and so swallows the next number's area
 * code, and costs about a second per region on adversarial text (measured,
 * spec 0005's `rationale.md`).
 *
 * In order: one pass cuts the block into runs of digit groups; a unit that is
 * a full numeric date is marked; every stretch of units is a window, given one
 * reading or none by `PHONE_READINGS` and parsed at most once; valid windows
 * are taken first, then possible ones; an extension joins a taken window; and
 * the tick is decided.
 *
 * Why it is linear (INV-7): the scan reads each code point a bounded number of
 * times. A window holds at most `MAX_WINDOW_DIGITS` digits as written, so each
 * unit starts at most that many windows. Each start costs at most
 * `MAX_PARSES_PER_GROUP` parses, and a verdict is kept for the block, so the
 * same digits under the same reading are parsed once. The two choosing passes
 * step over each unit once.
 */

/**
 * The regions `PHONE_READINGS` names for a number written without a `+`.
 * Spec 0005, *Decided within it*. Its order breaks no ties: no window has two
 * readings at one digit count. A rule about which national formats are
 * recognised, not a cap on the visitor.
 */
export const PHONE_REGIONS: readonly CountryCode[] = Object.freeze(["GB", "US"]);

/**
 * The words that say a bare run of digits is a phone number (AC-10), matched in
 * any case as whole words ending within `KEYWORD_REACH` before it.
 */
export const PHONE_WORDS: readonly string[] = Object.freeze([
  "phone",
  "tel",
  "telephone",
  "mobile",
  "mob",
  "cell",
  "fax",
  "call",
]);

const PHONE_WORD_LIST = wordList(PHONE_WORDS);

/**
 * One way a window may be read. Spec 0005, *Detectors* step 4.
 *
 * A `+` row reads a window written with a `+`, and only such a window. Every
 * other row reads a window with no `+` whose first group (`first-group`) or
 * whose digits joined together (`digits`) start with one of `starts`, spelled
 * out digit by digit so `MAX_PARSES_PER_GROUP` can be derived from them.
 */
export interface PhoneReading {
  readonly written: "+" | "first-group" | "digits";
  readonly starts: readonly string[];
  /** The region it is parsed under, `null` for a number read from its own `+`. */
  readonly region: CountryCode | null;
  /** The window digit counts it parses, a bracketed `(0)` left out. */
  readonly counts: ReadonlySet<number>;
  /** Written with a country prefix (`+`, `00` or `011`), which AC-10's tick counts. */
  readonly countryPrefix: boolean;
}

function reading(row: PhoneReading): PhoneReading {
  return Object.freeze({ ...row, starts: Object.freeze([...row.starts]) });
}

/** `lead` followed by each digit in `next`. */
function followedBy(lead: string, next: string): string[] {
  return [...next].map((digit) => `${lead}${digit}`);
}

/** `from` to `to`, both included. */
function counts(from: number, to: number): ReadonlySet<number> {
  return new Set(Array.from({ length: to - from + 1 }, (_, index) => from + index));
}

/**
 * How a window is read, from its prefix and its digit count together. Spec
 * 0005, *Detectors* step 4, whose table this is, row for row.
 *
 * The national rows count each region's national number lengths (GB 7, 9 and
 * 10; US 10, as `numberingPlan.possibleLengths()` gives them, pinned in
 * `tests/unit/detect-phone.test.ts`) plus the prefix written before them. They
 * leave out the lengths the library accepts as local only, because nobody
 * writes a local only number with a trunk `0`. The UK national row needs its
 * trunk `0` (the trunk rule): without it every bare 7, 9 or 10 digit run, a
 * ZIP+4 or a Social Security shape among them, is a possible UK number. A
 * window starting `011` with 10 or 11 digits is a UK number (the 011x areas,
 * such as Leeds `0113`), never a US international call.
 *
 * Rules about how numbers are written, not caps on the visitor.
 */
export const PHONE_READINGS: readonly PhoneReading[] = Object.freeze([
  // International, no default region: E.164's 7 to 15 digits after the `+`.
  reading({
    written: "+",
    starts: [""],
    region: null,
    counts: counts(7, 15),
    countryPrefix: true,
  }),
  // `00`, the UK's international prefix, then 7 to 15 digits.
  reading({
    written: "first-group",
    starts: ["00"],
    region: "GB",
    counts: counts(9, 17),
    countryPrefix: true,
  }),
  // `011`, the US's international prefix, then 9 to 15 digits.
  reading({
    written: "first-group",
    starts: ["011"],
    region: "US",
    counts: counts(12, 18),
    countryPrefix: true,
  }),
  // UK national, with its trunk `0`.
  reading({
    written: "digits",
    starts: followedBy("0", "123456789"),
    region: "GB",
    counts: new Set([8, 10, 11]),
    countryPrefix: false,
  }),
  // UK, its country code written without the `+`.
  reading({
    written: "digits",
    starts: ["44"],
    region: "GB",
    counts: new Set([9, 11, 12]),
    countryPrefix: false,
  }),
  // US national, with its trunk `1`.
  reading({
    written: "digits",
    starts: followedBy("1", "23456789"),
    region: "US",
    counts: new Set([11]),
    countryPrefix: false,
  }),
  // US national.
  reading({
    written: "digits",
    starts: followedBy("", "23456789"),
    region: "US",
    counts: new Set([10]),
    countryPrefix: false,
  }),
]);

/**
 * The most digits a window may hold, as written: the most any reading parses
 * (the `011` row's 18). A window is never grown past it.
 */
export const MAX_WINDOW_DIGITS = Math.max(
  ...PHONE_READINGS.flatMap((row) => [...row.counts]),
);

/**
 * The most parses one start can cost: the most digit counts that the readings
 * one start can match hold between them. Spec 0005, AC-16 and INV-7.
 *
 * The windows from one start are prefixes of each other, so each digit count
 * is one string, parsed once. The readings a start matches are those with a
 * prefix its own lead starts with, so the rows' prefixes are the only leads
 * worth trying. The most is 10, from a first group starting `011` (3 UK counts
 * and 7 US ones). Derived rather than written, so a change to `PHONE_READINGS`
 * moves it, and `tests/unit/detect-adversarial.test.ts` counts real parses
 * against it.
 */
export const MAX_PARSES_PER_GROUP = Math.max(
  ...PHONE_READINGS.flatMap((lead) =>
    lead.starts.map((prefix) => {
      const plus = lead.written === "+";
      const matched = PHONE_READINGS.filter(
        (row) =>
          (row.written === "+") === plus &&
          row.starts.some((start) => prefix.startsWith(start)),
      );
      return new Set(matched.flatMap((row) => [...row.counts])).size;
    }),
  ),
);

/**
 * What may follow a number as its extension, in any case, then 1 to 6 digits.
 * Spec 0005, *Detectors* step 7. The word markers may have a space on either
 * side; `x` and `#` come right after the number, after one space or none, with
 * their digits flush. A comma or semicolon, which libphonenumber-js reads as
 * an auto dial extension, is never a marker, so a comma list is never read as
 * one number. Rules about how numbers are written, not caps on the visitor.
 */
export const EXTENSION_MARKERS: readonly string[] = Object.freeze([
  "ext",
  "ext.",
  "extn",
  "extension",
  "x",
  "#",
]);

/** Longest first, so `extension` is tried before `ext`. */
const MARKERS_LONGEST_FIRST = [...EXTENSION_MARKERS].sort(
  (a, b) => codePoints(b).length - codePoints(a).length,
);

/** The most digits an extension holds. */
const MAX_EXTENSION_DIGITS = 6;

/** The most whitespace between two units of one run. */
const MAX_GAP = 3;

// Every pattern below matches exactly one code point, anchored at both ends
// with no quantifier, so none can backtrack (INV-7).

/** A digit in any script. */
const DIGIT = /^\p{Nd}$/u;
const SPACE = /^\s$/u;
const LETTER = /^\p{L}$/u;
/** A letter or a digit: what a number may not be cut out of (AC-2). */
const ALPHANUMERIC = /^[\p{L}\p{N}]$/u;
/** A hyphen a unit may be glued by: `-`, U+2010 to U+2015, or U+2212 minus. */
const HYPHEN = /^[-\u2010-\u2015\u2212]$/u;
/** Written like a phone number: a space, hyphen, dot or bracket inside it (AC-10). */
const SEPARATOR = /^[\s().\-\u2010-\u2015\u2212]$/u;

export function detectPhone(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const judge = judgeForBlock();

  const windows = runsIn(points).flatMap((run) => chosenIn(run, points, judge));

  return windows.map((window, index): Span => {
    const extension = extensionAt(points, window.end);
    const next = windows[index + 1];
    // An extension never takes a digit of the next number, so no two matches
    // share a character (INV-13): `ext. 020 7946 0321` stays a number.
    const keeps = extension !== null && (next === undefined || extension <= next.start);
    return {
      kind: "phone",
      start: window.start,
      end: keeps ? extension : window.end,
      tickedByDefault: ticks(window, points),
    };
  });
}

/**
 * One or more digit groups glued together, as one piece of a number. Spec
 * 0005, *Detectors* step 1.
 */
interface Unit {
  /** Code point offsets of its first character (a `(`, or the run's `+`) and past its last. */
  readonly start: number;
  readonly end: number;
  /** Its digits, a bracketed `(0)` left out, and how many code points they are. */
  readonly digits: string;
  readonly count: number;
  /** Its digits as written, a `(0)` included, which is what caps a window. */
  readonly written: number;
  /** Its first group's digits, `(0)` left out, which the `00` and `011` rows test. */
  readonly firstGroup: string;
  /** Written with the run's `+`. Only a run's first unit can be. */
  readonly plus: boolean;
  /** Parted from the unit before it by a slash, which no window crosses. */
  readonly afterSlash: boolean;
  /** A full numeric date, which no window holds (INV-14). */
  readonly date: boolean;
}

type Run = readonly Unit[];

interface Group {
  readonly end: number;
  readonly digits: string;
  readonly bracketed: boolean;
}

/** One or more digits, bare or inside one pair of brackets, at `at`. */
function groupAt(points: readonly string[], at: number): Group | null {
  const bracketed = points[at] === "(";
  let step = bracketed ? at + 1 : at;
  let digits = "";
  while (step < points.length && DIGIT.test(points[step])) {
    digits += points[step];
    step += 1;
  }
  if (digits === "") return null;
  if (!bracketed) return { end: step, digits, bracketed };
  return points[step] === ")" ? { end: step + 1, digits, bracketed } : null;
}

/**
 * The unit at `at`: a group, then further groups each glued to the one before
 * by one hyphen, one dot, or nothing where a bracket closes or opens between
 * them (`(0)20`, `(212)555-0123`).
 */
function unitAt(
  points: readonly string[],
  at: number,
): Omit<Unit, "plus" | "afterSlash"> | null {
  let group = groupAt(points, at);
  if (!group) return null;

  let digits = "";
  let count = 0;
  let written = 0;
  let firstGroup = "";
  let end = at;
  while (group) {
    const codes = codePoints(group.digits).length;
    written += codes;
    // A trunk `0` written in brackets after a country code (`+44 (0)20`) is
    // never dialled, so it is left out of what is counted and parsed.
    if (!(group.bracketed && group.digits === "0")) {
      digits += group.digits;
      count += codes;
      if (firstGroup === "") firstGroup = group.digits;
    }
    end = group.end;

    const glue = points[end];
    if (glue !== undefined && (HYPHEN.test(glue) || glue === ".")) {
      group = groupAt(points, end + 1);
    } else if (group.bracketed || glue === "(") {
      group = groupAt(points, end);
    } else {
      group = null;
    }
  }

  const date = isNumericDate(points.slice(at, end).join(""));
  return { start: at, end, digits, count, written, firstGroup, date };
}

/**
 * Every run in the block, in order. Spec 0005, *Detectors* step 1: units
 * parted by 1 to 3 whitespace characters or by one slash. A `+` belongs to the
 * run's first unit, with up to `MAX_GAP` whitespace characters after it; a `+`
 * anywhere else ends the run and starts a new one. Anything else ends it.
 */
function runsIn(points: readonly string[]): readonly Run[] {
  const runs: Run[] = [];
  let at = 0;

  while (at < points.length) {
    const opening = openingAt(points, at);
    if (!opening) {
      at += 1;
      continue;
    }

    const run: Unit[] = [opening];
    let end = opening.end;
    for (;;) {
      let gap = 0;
      while (gap <= MAX_GAP && SPACE.test(points[end + gap] ?? "")) gap += 1;

      const afterSlash = gap === 0 && points[end] === "/";
      const next =
        afterSlash || (gap >= 1 && gap <= MAX_GAP)
          ? unitAt(points, end + (afterSlash ? 1 : gap))
          : null;
      if (!next) break;
      run.push({ ...next, plus: false, afterSlash });
      end = next.end;
    }

    runs.push(run);
    at = end;
  }
  return runs;
}

/** The first unit of a run starting at `at`, with its `+` if it has one. */
function openingAt(points: readonly string[], at: number): Unit | null {
  if (points[at] !== "+") {
    const unit = unitAt(points, at);
    return unit && { ...unit, plus: false, afterSlash: false };
  }

  let gap = 0;
  while (gap < MAX_GAP && SPACE.test(points[at + 1 + gap] ?? "")) gap += 1;
  const unit = unitAt(points, at + 1 + gap);
  return unit && { ...unit, start: at, plus: true, afterSlash: false };
}

type Verdict = "none" | "possible" | "valid";

type Judge = (reading: PhoneReading, digits: string) => Verdict;

/**
 * Parse each window once. Spec 0005, *Detectors* step 5. The verdict is kept
 * for the block, keyed by the region and the text parsed, so a table that
 * repeats one number parses it once.
 */
function judgeForBlock(): Judge {
  const kept = new Map<string, Verdict>();

  return (reading, digits) => {
    const text = reading.region === null ? `+${digits}` : digits;
    const key = `${reading.region ?? ""}:${text}`;
    const known = kept.get(key);
    if (known !== undefined) return known;

    const number = parsePhoneNumberFromString(
      text,
      reading.region === null
        ? { extract: false }
        : { defaultCountry: reading.region, extract: false },
    );
    const verdict: Verdict = !number?.isPossible()
      ? "none"
      : number.isValid()
        ? "valid"
        : "possible";
    kept.set(key, verdict);
    return verdict;
  };
}

/**
 * The rows that parse each digit count, so a window holding a count no row
 * parses, as most short windows do, costs one lookup.
 */
const ROWS_BY_COUNT: readonly (readonly PhoneReading[])[] = Array.from(
  { length: MAX_WINDOW_DIGITS + 1 },
  (_, count) => PHONE_READINGS.filter((row) => row.counts.has(count)),
);

/** The reading a window has, or `undefined` when no row accepts it. */
function readingOf(
  plus: boolean,
  firstGroup: string,
  digits: string,
  count: number,
): PhoneReading | undefined {
  return ROWS_BY_COUNT[count]?.find(
    (row) =>
      (row.written === "+") === plus &&
      row.starts.some((start) =>
        (row.written === "first-group" ? firstGroup : digits).startsWith(start),
      ),
  );
}

/** A stretch of a run's units that libphonenumber-js reads as a number. */
interface Window {
  /** Code point offsets into the block. */
  readonly start: number;
  readonly end: number;
  /** The index in its run past its last unit. */
  readonly last: number;
  readonly reading: PhoneReading;
  readonly valid: boolean;
}

/**
 * Every window starting at `first` that is at least possible, shortest first.
 * Spec 0005, *Detectors* steps 3 to 5. Every length is tried, because a longer
 * window can have no reading while a shorter one is a real number.
 */
function windowsFrom(
  run: Run,
  first: number,
  points: readonly string[],
  judge: Judge,
): readonly Window[] {
  const opening = run[first];
  if (opening.date || joinsLongerCode(points, opening.start - 1, -1)) return [];

  const windows: Window[] = [];
  let digits = "";
  let count = 0;
  let written = 0;
  let firstGroup = "";

  for (let index = first; index < run.length; index += 1) {
    const unit = run[index];
    if (unit.date || (index > first && unit.afterSlash)) break;
    // Counted as written, `(0)` included, so a run of `(0)` groups cannot grow
    // one window without end.
    written += unit.written;
    if (written > MAX_WINDOW_DIGITS) break;

    digits += unit.digits;
    count += unit.count;
    if (firstGroup === "") firstGroup = unit.firstGroup;

    const reading = readingOf(opening.plus, firstGroup, digits, count);
    if (!reading) continue;
    // A number may end against a letter only where an extension starts there
    // (`020 7946 0958x12`), which then has its own end to keep clear.
    if (joinsLongerCode(points, unit.end, 1) && extensionAt(points, unit.end) === null) {
      continue;
    }

    const verdict = judge(reading, digits);
    if (verdict !== "none") {
      windows.push({
        start: opening.start,
        end: unit.end,
        last: index + 1,
        reading,
        valid: verdict === "valid",
      });
    }
  }
  return windows;
}

/**
 * Is the character at `at` part of a longer run of letters and digits the
 * window would be cut from? A letter or digit, a hyphen or dot that itself
 * touches one, or a slash that touches a letter. `away` is the direction away
 * from the window. That is how the `2026-000123` inside `INV-2026-000123`, a
 * valid US number, is never listed, while `020 7946 0958/0959` still lists its
 * number.
 */
function joinsLongerCode(points: readonly string[], at: number, away: -1 | 1): boolean {
  const next = points[at];
  if (next === undefined) return false;
  if (ALPHANUMERIC.test(next)) return true;

  const beyond = points[at + away];
  if (beyond === undefined) return false;
  if (HYPHEN.test(next) || next === ".") return ALPHANUMERIC.test(beyond);
  return next === "/" && LETTER.test(beyond);
}

/**
 * The windows taken from one run, in order. Spec 0005, *Detectors* step 6.
 *
 * First the valid ones, across the whole run from left to right: at each unit
 * the longest valid window starting there is taken, and scanning resumes after
 * it. Then, over the units still free, the longest possible window holding
 * only free units, the same way. So `Box 2000 212 555 0123` lists
 * `212 555 0123`, not `2000 212 555` (possible, not valid) with `0123` left
 * behind. No unit belongs to two windows (INV-13).
 */
function chosenIn(run: Run, points: readonly string[], judge: Judge): readonly Window[] {
  const cache: (readonly Window[] | undefined)[] = [];
  const windowsAt = (first: number) =>
    (cache[first] ??= windowsFrom(run, first, points, judge));

  const taken = new Uint8Array(run.length);
  const chosen: Window[] = [];
  const take = (first: number, window: Window) => {
    taken.fill(1, first, window.last);
    chosen.push(window);
    return window.last;
  };

  for (let first = 0; first < run.length;) {
    const valid = longest(windowsAt(first), (window) => window.valid);
    first = valid ? take(first, valid) : first + 1;
  }

  // Where each stretch of free units ends, found once from the right, so the
  // second pass costs the run's length.
  const freeUntil = new Uint32Array(run.length + 1);
  freeUntil[run.length] = run.length;
  for (let index = run.length - 1; index >= 0; index -= 1) {
    freeUntil[index] = taken[index] ? index : freeUntil[index + 1];
  }

  for (let first = 0; first < run.length;) {
    if (taken[first]) {
      first += 1;
      continue;
    }
    const limit = freeUntil[first];
    const possible = longest(windowsAt(first), (window) => window.last <= limit);
    first = possible ? take(first, possible) : first + 1;
  }

  return chosen.sort((a, b) => a.start - b.start);
}

/** The last, so the longest, of `windows` that passes `test`. */
function longest(
  windows: readonly Window[],
  test: (window: Window) => boolean,
): Window | undefined {
  for (let index = windows.length - 1; index >= 0; index -= 1) {
    if (test(windows[index])) return windows[index];
  }
  return undefined;
}

/**
 * Where an extension written right after a number ends, or `null`. Spec 0005,
 * *Detectors* step 7. Reads a bounded stretch after `at`, whatever the block.
 */
function extensionAt(points: readonly string[], at: number): number | null {
  const spaced = SPACE.test(points[at] ?? "");
  const from = spaced ? at + 1 : at;

  for (const marker of MARKERS_LONGEST_FIRST) {
    const length = codePoints(marker).length;
    if (!spells(points, from, marker, length)) continue;

    let digitsAt = from + length;
    if (length > 1 && SPACE.test(points[digitsAt] ?? "")) digitsAt += 1;
    const end = extensionDigitsEnd(points, digitsAt);
    if (end !== null) return end;
  }
  return null;
}

/** Do the `length` code points at `at` spell `marker`, in any case? */
function spells(
  points: readonly string[],
  at: number,
  marker: string,
  length: number,
): boolean {
  const written = points.slice(at, at + length).join("");
  return written.toLowerCase() === marker;
}

/** The end of 1 to 6 digits at `at` with no letter or digit touching their end. */
function extensionDigitsEnd(points: readonly string[], at: number): number | null {
  let end = at;
  while (end - at <= MAX_EXTENSION_DIGITS && DIGIT.test(points[end] ?? "")) end += 1;

  const held = end - at;
  if (held === 0 || held > MAX_EXTENSION_DIGITS) return null;
  return ALPHANUMERIC.test(points[end] ?? "") ? null : end;
}

/**
 * AC-10. Ticked only when valid and written like a phone number: with a `+`,
 * `00` or `011` country prefix, with a space, hyphen, dot or brackets inside
 * it, or after a phone word. Validity alone would tick an order number such as
 * `12345678901`, which is a valid US number. The tick reads the window alone,
 * never its extension, so `12345678901 ext. 4` stays unticked.
 */
function ticks(window: Window, points: readonly string[]): boolean {
  if (!window.valid) return false;
  if (window.reading.countryPrefix) return true;

  for (let at = window.start; at < window.end; at += 1) {
    if (SEPARATOR.test(points[at])) return true;
  }
  return wordBefore(points, window.start, PHONE_WORD_LIST);
}
