import { describe, expect, it } from "vitest";

import {
  formatPolicyDate,
  isCalendarDate,
  isNewestFirst,
  lastUpdated,
  PRIVACY_CHANGES,
  TERMS_CHANGES,
  type PolicyChanges,
} from "@/lib/policy-changes";

/**
 * The change lists behind each page's "Last updated" line. Spec 0011, AC-2.
 *
 * The real lists are checked against the rules rather than against a date,
 * so this test stays true as entries are added and when Launch readiness
 * step 7 folds them into one.
 */

const LISTS = [
  ["the privacy policy", PRIVACY_CHANGES],
  ["the terms of service", TERMS_CHANGES],
] as const;

describe.each(LISTS)("the change list for %s", (_page, changes) => {
  /** covers: AC-2 */
  it("holds at least one entry, each with a summary", () => {
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) expect(change.summary.trim()).not.toBe("");
  });

  /** covers: AC-2 */
  it("dates every entry with a real calendar date, written YYYY-MM-DD", () => {
    for (const change of changes) {
      expect(isCalendarDate(change.date), change.date).toBe(true);
    }
  });

  /** covers: AC-2 */
  it("runs strictly newest first", () => {
    expect(isNewestFirst(changes)).toBe(true);
  });

  /** covers: AC-2. "Last updated" is the newest entry. */
  it("is last updated on its first entry", () => {
    expect(lastUpdated(changes)).toBe(changes[0].date);
  });

  it("is frozen, entries included", () => {
    expect(Object.isFrozen(changes)).toBe(true);
    for (const change of changes) expect(Object.isFrozen(change)).toBe(true);
  });
});

describe("a calendar date", () => {
  /** covers: AC-2 */
  it.each(["2026-10-02", "2024-02-29", "2026-12-31", "2027-01-01"])(
    "accepts %s",
    (date) => {
      expect(isCalendarDate(date)).toBe(true);
    },
  );

  /** covers: AC-2. Each of these is either not on the calendar or not in the shape. */
  it.each([
    ["a day February does not have", "2026-02-30"],
    ["the 29th in a common year", "2026-02-29"],
    ["a thirteenth month", "2026-13-01"],
    ["a day zero", "2026-10-00"],
    ["a single digit month", "2026-1-02"],
    ["a British order", "02-10-2026"],
    ["a time on the end", "2026-10-02T00:00:00Z"],
    ["slashes", "2026/10/02"],
    ["nothing", ""],
  ])("refuses %s", (_label, date) => {
    expect(isCalendarDate(date)).toBe(false);
  });
});

describe("newest first", () => {
  const entry = (date: string) => ({ date, summary: "A change." });

  /** covers: AC-2 */
  it("accepts a list running back in time", () => {
    const changes: PolicyChanges = [
      entry("2027-03-01"),
      entry("2026-11-15"),
      entry("2026-10-02"),
    ];
    expect(isNewestFirst(changes)).toBe(true);
  });

  /** covers: AC-2 */
  it("refuses an older entry above a newer one", () => {
    expect(isNewestFirst([entry("2026-10-02"), entry("2026-11-15")])).toBe(false);
  });

  /** covers: AC-2. Strictly, so two entries on one day fail. */
  it("refuses two entries on the same day", () => {
    expect(isNewestFirst([entry("2026-10-02"), entry("2026-10-02")])).toBe(false);
  });
});

describe("the British date", () => {
  /** covers: AC-2 */
  it.each([
    ["2026-10-02", "2 October 2026"],
    ["2027-01-31", "31 January 2027"],
    ["2024-02-29", "29 February 2024"],
  ])("writes %s as %s", (date, british) => {
    expect(formatPolicyDate(date)).toBe(british);
  });
});
