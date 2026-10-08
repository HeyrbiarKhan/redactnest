import { ALPHANUMERIC, ASCII_DIGIT, codePoints, holds } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * UK National Insurance numbers. Spec 0005, AC-23, *Detectors* (`uk-nino`).
 *
 * Two letters, six digits, then an optional suffix `A` to `D`, in any case,
 * with an optional single space between the letters and the digits, between
 * the digit pairs and before the suffix (`AB 12 34 56 C`, `ab123456c`,
 * `AB123456`). The prefix follows HMRC's rules (`NI_PREFIX_RULES`), which is
 * what tells a National Insurance number from any two letters and six digits.
 * No letter or digit touches either end.
 *
 * A National Insurance number starts ticked (AC-10).
 *
 * Why it is linear (INV-7): a number may start only at a letter with nothing
 * alphanumeric before it, and each start reads at most fourteen code points.
 */

/**
 * HMRC's rules for the two letter prefix (National Insurance Manual,
 * NIM39110): letters never used first or second, and pairs never allocated.
 * Rules about how the numbers are issued, not caps on the visitor.
 */
export const NI_PREFIX_RULES: Readonly<
  Record<"neverFirst" | "neverSecond" | "neverPair", ReadonlySet<string>>
> = Object.freeze({
  neverFirst: new Set(["D", "F", "I", "Q", "U", "V"]),
  neverSecond: new Set(["D", "F", "I", "O", "Q", "U", "V"]),
  neverPair: new Set(["BG", "GB", "KN", "NK", "NT", "TN", "ZZ"]),
});

const LETTER = /^[A-Z]$/iu;
const SUFFIX = /^[A-D]$/iu;

/** The digit pairs after the prefix. */
const PAIRS = 3;

export function detectUkNino(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];

  for (let at = 0; at < points.length;) {
    const end = holds(points, at - 1, ALPHANUMERIC) ? null : ninoAt(points, at);
    if (end === null) {
      at += 1;
      continue;
    }
    spans.push({ kind: "uk-nino", start: at, end, tickedByDefault: true });
    at = end;
  }
  return spans;
}

/** Where a National Insurance number starting at `at` ends, or `null`. */
function ninoAt(points: readonly string[], at: number): number | null {
  if (!holds(points, at, LETTER) || !holds(points, at + 1, LETTER)) return null;
  const first = points[at].toUpperCase();
  const second = points[at + 1].toUpperCase();
  if (
    NI_PREFIX_RULES.neverFirst.has(first) ||
    NI_PREFIX_RULES.neverSecond.has(second) ||
    NI_PREFIX_RULES.neverPair.has(first + second)
  ) {
    return null;
  }

  let end = at + 2;
  for (let pair = 0; pair < PAIRS; pair += 1) {
    end = spaceThen(points, end, ASCII_DIGIT);
    if (!holds(points, end, ASCII_DIGIT) || !holds(points, end + 1, ASCII_DIGIT)) {
      return null;
    }
    end += 2;
  }

  // The suffix, only where nothing alphanumeric follows it, so the `a` of
  // `AB 12 34 56 apply` is never read as one.
  const suffix = spaceThen(points, end, SUFFIX);
  if (holds(points, suffix, SUFFIX) && !holds(points, suffix + 1, ALPHANUMERIC)) {
    return suffix + 1;
  }
  return holds(points, end, ALPHANUMERIC) ? null : end;
}

/** Past one optional space at `at`, when what follows it matches `next`. */
function spaceThen(points: readonly string[], at: number, next: RegExp): number {
  return points[at] === " " && holds(points, at + 1, next) ? at + 1 : at;
}
