import { codePoints } from "./text";
import type { DetectInput, Span } from "./types";

/**
 * Email addresses. Spec 0005, AC-1 and *Detectors*.
 *
 * Found by scanning out from each `@` over the characters a local part and a
 * domain may hold, then checking what was read, never with one regular
 * expression over the block, which is where email patterns classically blow up
 * (basis: OWASP, Regular expression Denial of Service). The only expressions
 * here test one code point at a time.
 *
 * Why it is linear (INV-7): a scan never crosses another `@`, because `@`
 * belongs to neither part, so each code point is read by the scan of at most
 * one `@` on either side. Each scan also stops once it has read more than a
 * part may hold, 64 code points to the left and 253 to the right.
 *
 * Letters, marks and digits are Unicode classes, so an address in any script
 * is found (AC-1). The engine hands this text NFKC normalised, so a fullwidth
 * `＠` arrives as `@`.
 */

/** RFC 5321's limits, which a real address never exceeds. */
const MAX_LOCAL = 64;
const MAX_DOMAIN = 253;

/** A character a local part may hold: letters, marks, digits and `. _ % + -`. */
const LOCAL = /^[\p{L}\p{M}\p{N}._%+-]$/u;
/** A character a domain label may hold. A hyphen only inside a label. */
const LABEL = /^[\p{L}\p{M}\p{N}-]$/u;
/** The last label is letters, with any marks they carry. */
const TOP_LEVEL = /^[\p{L}\p{M}]$/u;
const LETTER = /^\p{L}$/u;

/**
 * Positions to step over as if they were absent. The rejoin (AC-4) reads one
 * join space this way; it is skipped, never deleted, so offsets still index
 * the block the engine built.
 */
type Hidden = ReadonlySet<number>;

const NONE: Hidden = new Set();

export function detectEmail(input: DetectInput): readonly Span[] {
  const points = codePoints(input.text);
  const spans: Span[] = [];

  for (let at = 0; at < points.length; at += 1) {
    if (points[at] !== "@") continue;
    const found = emailAt(points, at, NONE);
    // An address that overlaps one already found is dropped, so no character
    // belongs to two (AC-3). Scanning left to right keeps the earlier one.
    if (found && (spans.length === 0 || found.start >= spans[spans.length - 1].end)) {
      spans.push(found);
    }
  }
  return spans;
}

/**
 * The address around the `@` at `at`, or `null`. Exported for the rejoin, which
 * asks the same question with one join space hidden.
 */
export function emailAt(
  points: readonly string[],
  at: number,
  hidden: Hidden,
): Span | null {
  const before = (index: number) => {
    let step = index - 1;
    while (hidden.has(step)) step -= 1;
    return step;
  };
  const after = (index: number) => {
    let step = index + 1;
    while (hidden.has(step)) step += 1;
    return step;
  };

  // The local part: the whole run of local characters before the `@`, so no
  // local character is left touching its start. A run too long to be a local
  // part is not an address, and is not searched for a shorter one inside it.
  const local: string[] = [];
  let start = at;
  for (
    let step = before(at);
    step >= 0 && LOCAL.test(points[step]);
    step = before(step)
  ) {
    if (local.length === MAX_LOCAL) return null;
    local.unshift(points[step]);
    start = step;
  }
  if (!isLocalPart(local)) return null;

  // The domain: labels joined by single dots. A dot is read only when a label
  // character follows it, so a sentence's full stop, `..` or a dot at the end
  // closes the address rather than joining it.
  const domain: string[] = [];
  let end = at + 1;
  for (let step = after(at); step < points.length; step = after(step)) {
    const point = points[step];
    const joinsLabel =
      point === "." && after(step) < points.length && LABEL.test(points[after(step)]);
    if (!LABEL.test(point) && !joinsLabel) break;
    if (domain.length === MAX_DOMAIN) return null;
    domain.push(point);
    end = step + 1;
  }
  if (!isDomain(domain)) return null;

  return { kind: "email", start, end, tickedByDefault: true };
}

/** 1 to 64 characters, not starting or ending with `.`, and no `..`. */
function isLocalPart(local: readonly string[]): boolean {
  if (local.length === 0) return false;
  if (local[0] === "." || local[local.length - 1] === ".") return false;
  return local.every((point, index) => point !== "." || local[index - 1] !== ".");
}

/**
 * Two or more labels of letters, marks, digits and inner hyphens, the last of
 * them letters only, with at least two letters in it.
 */
function isDomain(domain: readonly string[]): boolean {
  const labels = domain.join("").split(".").map(codePoints);
  if (labels.length < 2) return false;

  const wellFormed = labels.every(
    (label) => label.length > 0 && label[0] !== "-" && label[label.length - 1] !== "-",
  );
  const last = labels[labels.length - 1];
  return (
    wellFormed &&
    last.every((point) => TOP_LEVEL.test(point)) &&
    last.filter((point) => LETTER.test(point)).length >= 2
  );
}
