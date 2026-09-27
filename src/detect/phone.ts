import { findNumbers, type CountryCode, type NumberFound } from "libphonenumber-js/max";

import { codePointIndex, codePoints, wordBefore, wordList } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * Phone numbers. Spec 0005, AC-2 and AC-10.
 *
 * Candidates come from libphonenumber-js with its `max` metadata, which is the
 * only metadata whose `isValid()` checks the digits rather than the length
 * alone. The finder runs once per region in `PHONE_REGIONS` over the whole
 * block, and the results are merged.
 */

/**
 * The regions a number written without a country code is read as. Spec 0005,
 * *Decided within it*. A number written internationally is found under either.
 * The order is the tie break when two regions read overlapping numbers of the
 * same length, so GB comes first. A rule about which national formats are
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
 * The options `findNumbers` is called with. `leniency` works (the matcher reads
 * it, and accepts `POSSIBLE` and `VALID`) but is missing from the package's
 * types, so it is declared here rather than passed through `any`. Without it
 * the finder returns valid numbers only, and the plausible ones AC-10 lists
 * unticked would be hidden. `tests/unit/detect-phone.test.ts` pins that a
 * possible only number still comes back, so an upgrade that drops the option
 * fails a test.
 */
interface PossibleNumbers {
  readonly defaultCountry: CountryCode;
  readonly v2: true;
  readonly leniency: "POSSIBLE";
}

// The three patterns below each match one character from one class, with no
// quantifier, so none can backtrack (INV-7). The time this detector takes is
// libphonenumber-js's, linear in the block and paid once per region, which
// `tests/unit/detect-adversarial.test.ts` measures.

/** A letter or a digit: what a number may not be cut out of (AC-2). */
const ALPHANUMERIC = /^[\p{L}\p{N}]$/u;
/** What may join a number to a longer code, as in `INV-2026-000123`. */
const JOINER = /^[-./]$/u;
/** Written like a phone number: a separator or a bracket inside it (AC-10). */
const SEPARATOR = /[ \-.()]/u;

interface Candidate extends Span {
  /** The region's place in `PHONE_REGIONS`, the tie break between regions. */
  readonly region: number;
}

export function detectPhone(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const toPoint = codePointIndex(input.text);

  const candidates = PHONE_REGIONS.flatMap((defaultCountry, region) => {
    const search: PossibleNumbers = { defaultCountry, v2: true, leniency: "POSSIBLE" };
    return findNumbers(input.text, search).flatMap((found): Candidate[] => {
      const start = toPoint[found.startsAt];
      const end = toPoint[found.endsAt];
      if (cutFromLongerCode(points, start, end)) return [];
      return [
        {
          kind: "phone",
          start,
          end,
          region,
          tickedByDefault: ticks(found, points, start, end),
        },
      ];
    });
  });

  return merge(candidates, points.length);
}

/**
 * Is this candidate part of a longer run of letters and digits? A letter or
 * digit touches it, or a hyphen, dot or slash that itself touches one. That is
 * how the `2026-000123` inside `INV-2026-000123`, a valid US number, is never
 * listed.
 */
function cutFromLongerCode(
  points: readonly string[],
  start: number,
  end: number,
): boolean {
  const touches = (at: number, away: number): boolean => {
    const next = points[at];
    if (next === undefined) return false;
    if (ALPHANUMERIC.test(next)) return true;
    const beyond = points[at + away];
    return JOINER.test(next) && beyond !== undefined && ALPHANUMERIC.test(beyond);
  };
  return touches(start - 1, -1) || touches(end, 1);
}

/**
 * AC-10. Ticked only when valid and written like a phone number: with a `+` or
 * `00` country prefix, with a space, hyphen, dot or brackets inside it, or
 * after a phone word. Validity alone would tick an order number such as
 * `12345678901`, which is a valid US number.
 */
function ticks(
  found: NumberFound,
  points: readonly string[],
  start: number,
  end: number,
): boolean {
  if (!found.number.isValid()) return false;

  const written = points.slice(start, end).join("");
  return (
    written.startsWith("+") ||
    written.startsWith("00") ||
    SEPARATOR.test(written) ||
    wordBefore(points, start, PHONE_WORD_LIST)
  );
}

/**
 * One span per place. The same span from two regions counts once, ticked if
 * either region ticks it. Of two that overlap, the longer is kept, then the one
 * from the region earlier in `PHONE_REGIONS`.
 *
 * Positions a kept span holds are marked as they are claimed, so each
 * candidate costs its own length and the merge stays linear.
 */
function merge(candidates: readonly Candidate[], length: number): readonly Span[] {
  const ranked = [...candidates].sort(
    (a, b) =>
      b.end - b.start - (a.end - a.start) || a.region - b.region || a.start - b.start,
  );

  const kept: Candidate[] = [];
  const atPlace = new Map<string, number>();
  const claimed = new Uint8Array(length);

  for (const candidate of ranked) {
    const place = `${candidate.start}:${candidate.end}`;
    const same = atPlace.get(place);
    if (same !== undefined) {
      if (candidate.tickedByDefault)
        kept[same] = { ...kept[same], tickedByDefault: true };
      continue;
    }
    if (claimed.subarray(candidate.start, candidate.end).includes(1)) continue;

    claimed.fill(1, candidate.start, candidate.end);
    atPlace.set(place, kept.length);
    kept.push(candidate);
  }

  return kept
    .sort((a, b) => a.start - b.start)
    .map(({ kind, start, end, tickedByDefault }) => ({
      kind,
      start,
      end,
      tickedByDefault,
    }));
}
