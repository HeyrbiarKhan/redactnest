import { describe, expect, it } from "vitest";

import { BLOCKED_REASON_TEXT, DETECTOR_LABELS, detectionCounts } from "@/lib/detectors";
import {
  asMatchId,
  BLOCKED_REASONS,
  DETECTOR_KINDS,
  type ReviewMatch,
} from "@/worker/protocol";

/**
 * The words and counts the checklist and feature 11 take from detection. Spec
 * 0005, AC-15, AC-24 and INV-9. Both records are typed over their unions, so
 * a missing kind or reason fails the compile; these assert the words say what
 * the spec asks.
 */

function match(
  id: string,
  type: ReviewMatch["type"],
  blocked: ReviewMatch["blocked"],
): ReviewMatch {
  return {
    id: asMatchId(id),
    type,
    page: 1,
    text: "private value",
    before: "private before",
    after: "private after",
    tickedByDefault: blocked === null,
    blocked,
  };
}

describe("detectionCounts (AC-15)", () => {
  const MATCHES = [
    match("a", "email", null),
    match("b", "email", "slanted-text"),
    match("c", "phone", null),
    match("d", "email", "slanted-text"),
    match("e", "phone", "image-overreach"),
  ];

  it("counts every match by kind, blocked ones included", () => {
    expect(detectionCounts(MATCHES).foundByType).toEqual({ email: 3, phone: 2 });
  });

  it("counts the blocked ones by reason", () => {
    expect(detectionCounts(MATCHES).blockedByReason).toEqual({
      "slanted-text": 2,
      "image-overreach": 1,
    });
  });

  it("carries no document text at all", () => {
    expect(JSON.stringify(detectionCounts(MATCHES))).not.toContain("private");
  });

  it("is empty for nothing found, and frozen", () => {
    const counts = detectionCounts([]);

    expect(counts).toEqual({ foundByType: {}, blockedByReason: {} });
    expect(Object.isFrozen(counts)).toBe(true);
    expect(Object.isFrozen(counts.foundByType)).toBe(true);
  });
});

describe("the words for each kind and reason", () => {
  it("labels every kind, with a singular and a plural noun", () => {
    expect(Object.keys(DETECTOR_LABELS).sort()).toEqual([...DETECTOR_KINDS].sort());
    expect(DETECTOR_LABELS.email).toMatchObject({
      label: "Email addresses",
      noun: { one: "email address", other: "email addresses" },
    });
    expect(DETECTOR_LABELS.phone).toMatchObject({
      label: "Phone numbers",
      noun: { one: "phone number", other: "phone numbers" },
    });
  });

  it("says, for every blocked reason, that the value stays in the file", () => {
    expect(Object.keys(BLOCKED_REASON_TEXT).sort()).toEqual([...BLOCKED_REASONS].sort());
    for (const text of Object.values(BLOCKED_REASON_TEXT)) {
      expect(text).toMatch(/stay in the file\.$/);
    }
  });
});
