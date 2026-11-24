/**
 * The dated change lists behind each page's "Last updated" line. Spec 0011,
 * AC-1 and AC-2.
 *
 * Both lists live here, beside the type, the order check and the date format,
 * so both pages keep one rule. A change to either page adds an entry at the top
 * of its list in the same change (INV-3). Each date is a literal written on the
 * day, never computed at build, so a rebuild cannot move it.
 *
 * Launch readiness step 7 folded every entry made before launch into one
 * `First published.` entry dated launch day, 2026-10-06.
 */

import { formatBritishDate } from "@/lib/british-date";

export interface PolicyChange {
  /** `YYYY-MM-DD`, a real calendar date. */
  readonly date: string;
  readonly summary: string;
}

/** At least one entry, newest first. */
export type PolicyChanges = readonly [PolicyChange, ...PolicyChange[]];

export const PRIVACY_CHANGES: PolicyChanges = Object.freeze<PolicyChanges>([
  Object.freeze({
    date: "2026-11-14",
    summary:
      "Added custom terms: the names, numbers or phrases you type for RedactNest to find stay on your device, like your document, and the counts now include how many custom terms were used, never the terms.",
  }),
  Object.freeze({
    date: "2026-11-08",
    summary:
      "Added Counts and error reports: we now count what happens on the site, by kind and in ranges, and report when our code fails, through Umami and Sentry, with nothing about your document or you. Global Privacy Control and Do Not Track stop the counts.",
  }),
  Object.freeze({
    date: "2026-10-07",
    summary:
      "Made clear that the one day applies to the logs our host keeps for us, and that what it keeps for itself follows its own privacy policy.",
  }),
  Object.freeze({ date: "2026-10-06", summary: "First published." }),
]);

export const TERMS_CHANGES: PolicyChanges = Object.freeze<PolicyChanges>([
  Object.freeze({ date: "2026-10-06", summary: "First published." }),
]);

/**
 * The security page's list (spec 0018, AC-3). It shares the legal pages' frame,
 * so a change to what it says adds an entry here the same way.
 */
export const SECURITY_CHANGES: PolicyChanges = Object.freeze<PolicyChanges>([
  // Spec 0025, AC-11: dated the day it merges, a literal. 2026-11-18 holds
  // spec 0020's entry and the list runs strictly newest first; written on
  // 2026-11-24, so move it to the merge day if that is later. "No longer stay
  // there" covers only pictures RedactNest takes apart, and rests on the check
  // failing any output where such a picture still holds a part it would drop
  // (AC-8), a gate every file passes; the "can" line keeps the limit by kind.
  Object.freeze({
    date: "2026-11-24",
    summary:
      "Details stored inside a JPEG or JPEG 2000 picture RedactNest can take apart, such as a photo’s camera details, location, captions and comments, no longer stay there: it keeps only the parts on a fixed list chosen for drawing the picture, and the check fails any file in which such a picture still holds a part it would drop. They can still stay in a picture it leaves as stored.",
  }),
  // Spec 0020, AC-11: dated the day it merges, a literal. 2026-11-17 holds
  // spec 0019's entry and the list runs strictly newest first, so 2026-11-18
  // is the earliest day it can merge; move it to the merge day if that is
  // later. "Can no longer stay" sits behind gates every file passes: the
  // glyph rule's refusal at open and before the passes (AC-5, AC-6), with the
  // check failing text below a glyph (AC-7). "A figure or picture the rest of
  // the file also uses" is narrower than the rule, which refuses a file whose
  // glyphs name anything outside the fonts reaches, so it promises no more
  // than the code holds.
  Object.freeze({
    date: "2026-11-18",
    summary:
      "The original copy of a redacted figure or picture can no longer stay in a font character. RedactNest now stops, at open and again before it removes anything, on a file whose font characters draw a figure or picture the rest of the file also uses, or draw text of their own.",
  }),
  // Spec 0019, AC-14: dated the day it merges. "First published." holds
  // 2026-11-15 and no two entries share a day, so 2026-11-16 was the earliest
  // day it could merge; it merges on 2026-11-17. Said as the
  // structure item says it, what the check does and one "can" line: the walk
  // holds keys and strings to lists and no name a file chooses (spec 0019's
  // *Consequences*), and "can stay", since a name can go with what it named
  // (the open steps verify, 2026-11-15). "A warning on each page where RedactNest finds some" is
  // the descriptions line's own reach (AC-9: a description written another
  // way than as a string stays with no warning), never "with a warning".
  Object.freeze({
    date: "2026-11-17",
    summary:
      "The check now fails a file holding an object it does not reach from the file’s starting point, or an entry off the fixed list for that object’s kind, though names a file chooses can stay as written and can carry words. So this page says where the original copy of a redacted figure or picture can still be, what else RedactNest strips, and that descriptions written into a page can stay, with a warning on each page where RedactNest finds some. The check’s text part now says it reads selectable text. What it finds is now What it looks for.",
  }),
  Object.freeze({ date: "2026-11-15", summary: "First published." }),
]);

/** The newest entry's date, which is what "Last updated" shows (AC-2). */
export const lastUpdated = (changes: PolicyChanges): string => changes[0].date;

const DATE_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A date written `YYYY-MM-DD` that exists on the calendar (AC-2). It survives a
 * round trip through `Date.UTC`, which rolls `2026-02-30` over into March, so
 * a day that does not exist comes back different and fails.
 */
export function isCalendarDate(date: string): boolean {
  const parts = DATE_SHAPE.exec(date);
  if (parts === null) return false;

  const [year, month, day] = parts.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Strictly newest first (AC-2): no two entries share a day, and none is older
 * than the one after it. `YYYY-MM-DD` sorts as text in date order.
 */
export const isNewestFirst = (changes: PolicyChanges): boolean =>
  changes.every((change, index) => index === 0 || changes[index - 1].date > change.date);

/** `2026-10-02` as `2 October 2026` (AC-2), the format the account page shares. */
export const formatPolicyDate = (date: string): string =>
  formatBritishDate(new Date(`${date}T00:00:00Z`));
