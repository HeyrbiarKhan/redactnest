/**
 * The dated change lists behind each page's "Last updated" line. Spec 0011,
 * AC-1 and AC-2.
 *
 * Both lists live here, beside the type, the order check and the date format,
 * so both pages keep one rule. A change to either page adds an entry at the top
 * of its list in the same change (INV-3). Each date is a literal written on the
 * day, never computed at build, so a rebuild cannot move it.
 *
 * Launch readiness step 7 folds every entry made before launch into one
 * `First published.` entry dated launch day.
 */

export interface PolicyChange {
  /** `YYYY-MM-DD`, a real calendar date. */
  readonly date: string;
  readonly summary: string;
}

/** At least one entry, newest first. */
export type PolicyChanges = readonly [PolicyChange, ...PolicyChange[]];

export const PRIVACY_CHANGES: PolicyChanges = Object.freeze<PolicyChanges>([
  Object.freeze({ date: "2026-10-02", summary: "First published." }),
]);

export const TERMS_CHANGES: PolicyChanges = Object.freeze<PolicyChanges>([
  Object.freeze({ date: "2026-10-02", summary: "First published." }),
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

/** British, in UTC, so the server's own zone cannot move the day. */
const BRITISH_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** `2026-10-02` as `2 October 2026` (AC-2). */
export const formatPolicyDate = (date: string): string =>
  BRITISH_DATE.format(new Date(`${date}T00:00:00Z`));
