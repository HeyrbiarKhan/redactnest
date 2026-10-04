/**
 * The one date format every page shows: a British date, read in UTC.
 *
 * The legal pages' "Last updated" line (spec 0011, AC-2) and the account
 * page's renewal date (spec 0012, AC-10) both read through this, so the two
 * cannot drift into different formats.
 */

/** UTC, so the server's own zone cannot move the day. */
const BRITISH_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The day an instant falls on in UTC, as `3 November 2026`. */
export const formatBritishDate = (instant: Date): string => BRITISH_DATE.format(instant);
