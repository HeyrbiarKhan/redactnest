/**
 * Pattern detection. Spec 0005.
 *
 * Pure functions from one text block to the spans it holds, one detector per
 * kind, each with its own validator. No MuPDF, no page, no network, no storage
 * and no console: this folder sees text and hands back offsets, nothing else
 * (INV-5). The engine's find step (`src/engine/find.ts`) turns the offsets into
 * characters, quads and review rows.
 *
 * WALLED BY LINT. Only `src/engine` imports this folder, and only this folder
 * imports `libphonenumber-js` (INV-8), so the phone metadata ships in the
 * worker's chunk and never in a page's. The `redactnest/detect` zone in
 * `eslint.config.mjs` holds both, and bans `search()` here as in the engine
 * (INV-11).
 *
 * Every detector is linear in its input (INV-7): each file says why.
 */

import { detectCard } from "./card";
import { datePasses, detectDate } from "./date";
import { detectEmail } from "./email";
import { detectIban } from "./iban";
import { detectPhone } from "./phone";
import { ALPHANUMERIC } from "./text";
import type { Detector, DetectInput, Span } from "./types";
import { detectUkNino } from "./uk-nino";
import { detectUsSsn } from "./us-ssn";
import type { DetectorKind } from "@/worker/protocol";

export { CARD_BRANDS, CARD_GROUP_DIGITS, type CardBrand } from "./card";
export { ADDED_DATE_LABELS, BIRTH_WORDS, DATE_LABELS, MONTHS } from "./date";
export { IBAN_LENGTHS } from "./iban";
export { KEYWORD_REACH } from "./text";
export { NI_PREFIX_RULES } from "./uk-nino";
export { SSN_WORDS } from "./us-ssn";
export {
  EXTENSION_MARKERS,
  MAX_PARSES_PER_GROUP,
  MAX_WINDOW_DIGITS,
  PHONE_READINGS,
  PHONE_REGIONS,
  PHONE_WORDS,
  type PhoneReading,
} from "./phone";
export type { Detector, DetectInput, Span } from "./types";

/**
 * Every kind's detector. A record over `DetectorKind`, so a kind added to the
 * protocol without a detector fails `pnpm typecheck` (INV-9, AC-24).
 */
export const DETECTORS: Readonly<Record<DetectorKind, Detector>> = Object.freeze({
  email: detectEmail,
  phone: detectPhone,
  date: detectDate,
  card: detectCard,
  iban: detectIban,
  "us-ssn": detectUsSsn,
  "uk-nino": detectUkNino,
});

/**
 * Which kind keeps a place two kinds both claim, highest first. Spec 0005,
 * *Decided within it*: a kind with a checksum or a unique marker outranks a
 * looser digit shape, so an IBAN's digits never list as a phone number. A
 * rule about patterns, not a cap on the visitor. `date` comes last, but no
 * numeric date is ever lost to `phone` for it: the phone detector never reads
 * one (INV-14). A rescued stretch's phone row is cut back where a lower kind's
 * span begins, or dropped, before precedence is applied (spec 0014, AC-15), so
 * the rescue never takes a date's digits either; of the dates, it yields only
 * to those the date detector's first scan lists, so every row today lists keeps
 * its extent (spec 0015, AC-12). `tests/unit/detect.test.ts`
 * fails `pnpm typecheck` when a kind has no place here (AC-24).
 */
export const PRECEDENCE = Object.freeze([
  "email",
  "iban",
  "card",
  "us-ssn",
  "uk-nino",
  "phone",
  "date",
] as const);

/**
 * Every span in one block, in order of `start`, with no position claimed by
 * two. Spec 0005, AC-3 and INV-16.
 *
 * Kinds are taken in `PRECEDENCE` order. A span that meets no claimed
 * position is kept whole. One that meets a position a higher kind already
 * holds keeps each stretch no higher match holds, trimmed of whitespace at
 * both ends, as a piece of its own kind with its own tick; a stretch with no
 * letter or digit is dropped. So no character a detector found is left
 * without a row: where a false card cuts into a spaced Social Security
 * number, the rest of that number is still its own row, and unticking the
 * card can never untick it. The higher row is never touched.
 *
 * Before that, each stretch the phone rescue lists yields to the kinds below
 * `phone` (spec 0014, AC-15), the date detector's first scan alone among the
 * dates (spec 0015, AC-12), and no span leaves with `rescued`.
 *
 * Positions are marked as they are claimed, and each span's positions are
 * read once, so this costs the length of what was found.
 */
export function detect(input: DetectInput): readonly Span[] {
  const points = Array.from(input.text);
  const claimed = new Uint8Array(points.length);
  const kept: Span[] = [];

  // Every kind below `phone` runs once, and its spans are what a rescued
  // stretch yields to: of the date detector's, only those its first scan
  // lists, today's, so a stretch keeps exactly today's extent beside a date
  // only the second scan reads (spec 0015, AC-12). Precedence reads both.
  const dates = datePasses(input);
  const lower = new Map<DetectorKind, readonly Span[]>(
    PRECEDENCE.slice(PRECEDENCE.indexOf("phone") + 1).map((kind) => [
      kind,
      kind === "date" ? dates.first : DETECTORS[kind](input),
    ]),
  );
  const spansOf = (kind: DetectorKind): readonly Span[] =>
    kind === "date"
      ? [...dates.first, ...dates.added]
      : (lower.get(kind) ??
        (kind === "phone"
          ? yieldRescued(points, DETECTORS.phone(input), [...lower.values()].flat())
          : DETECTORS[kind](input)));

  for (const kind of PRECEDENCE) {
    for (const span of spansOf(kind)) {
      const pieces = claimed.subarray(span.start, span.end).includes(1)
        ? freeStretches(points, claimed, span)
        : [span];
      for (const piece of pieces) {
        claimed.fill(1, piece.start, piece.end);
        kept.push(piece);
      }
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * The phone spans with each rescued stretch cut back where a lower kind's span
 * begins, or dropped, and `rescued` stripped from every one. Spec 0014, AC-15.
 *
 * The phone detector cannot see where the date detector reads a date, and
 * phone outranks date, so without this a stretch could take a date's day:
 * `212 918 8665 1119 21 June 2014` would cut the date to `June 2014`. A
 * stretch's end moves back to the earliest start among the lower spans that
 * overlap it, extension included, then back to its last letter or digit, so a
 * space or hyphen at the cut goes too; a stretch with nothing left is
 * dropped. No row the two choosing passes chose is rescued, so this never
 * touches one of today's rows (spec 0014, INV-7).
 *
 * One sweep: the phone spans come in start order and never overlap, so a
 * pointer over the lower spans in start order only moves forward. `reach` is
 * the furthest end among the lower spans starting at or before the stretch,
 * so a lower span already running into it drops it whole.
 */
function yieldRescued(
  points: readonly string[],
  phone: readonly Span[],
  lower: readonly Span[],
): readonly Span[] {
  const byStart = [...lower].sort((a, b) => a.start - b.start);
  const kept: Span[] = [];
  let next = 0;
  let reach = -1;

  for (const { rescued, ...span } of phone) {
    while (next < byStart.length && byStart[next].start <= span.start) {
      reach = Math.max(reach, byStart[next].end);
      next += 1;
    }
    if (!rescued) {
      kept.push(span);
      continue;
    }

    const later = byStart[next];
    let end =
      reach > span.start
        ? span.start
        : later !== undefined && later.start < span.end
          ? later.start
          : span.end;
    if (end < span.end) {
      while (end > span.start && !ALPHANUMERIC.test(points[end - 1])) end -= 1;
    }
    if (end > span.start) kept.push({ ...span, end });
  }
  return kept;
}

/** One whitespace code point. Matches one code point, so it cannot backtrack. */
const SPACE = /^\s$/u;

/**
 * The stretches of `span` that no claimed position holds, each trimmed of
 * whitespace and kept only when it holds a letter or a digit, with the span's
 * kind and tick. Spec 0005, AC-3.
 */
function freeStretches(
  points: readonly string[],
  claimed: Uint8Array,
  span: Span,
): readonly Span[] {
  const pieces: Span[] = [];
  let at = span.start;

  while (at < span.end) {
    if (claimed[at] === 1) {
      at += 1;
      continue;
    }
    let end = at;
    while (end < span.end && claimed[end] === 0) end += 1;

    let start = at;
    let stop = end;
    while (start < stop && SPACE.test(points[start])) start += 1;
    while (stop > start && SPACE.test(points[stop - 1])) stop -= 1;
    if (points.slice(start, stop).some((point) => ALPHANUMERIC.test(point))) {
      pieces.push({ ...span, start, end: stop });
    }
    at = end;
  }
  return pieces;
}

/**
 * Does a match of this kind read a line join as nothing at all? Spec 0005,
 * AC-4.
 *
 * An email never holds a space, so a join inside an email span is one the
 * rejoin read as invisible: the address wrapped right after `@` or `.`. Its
 * display text and its target's `text` leave that join out. Every other kind
 * reads a join as the one space it stands for.
 */
export function readsJoinAsNothing(kind: DetectorKind): boolean {
  return kind === "email";
}
