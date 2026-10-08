import { describe, expect, it } from "vitest";

import {
  BLOCKED_REASON_TEXT,
  countRemoved,
  DETECTOR_LABELS,
  detectionCounts,
  resultCounts,
} from "@/lib/detectors";
import {
  asMatchId,
  BLOCKED_REASONS,
  DETECTOR_KINDS,
  type RedactionOutcome,
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
    beforeCut: true,
    afterCut: true,
    tickedByDefault: blocked === null,
    blocked,
    concealed: null,
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

/**
 * Spec 0007, AC-25 and INV-4. The one source of the result card's Removed and
 * Left in the file lines, counts only.
 */
describe("resultCounts (spec 0007, AC-25)", () => {
  const MATCHES = [
    match("a", "email", null),
    match("b", "email", null),
    match("c", "email", "slanted-text"),
    match("d", "phone", null),
    match("e", "phone", "image-overreach"),
    match("f", "phone", "slanted-text"),
  ];
  const TICKED = new Set([asMatchId("a"), asMatchId("d")]);
  const OUTCOME: RedactionOutcome = {
    pageCount: 1,
    removedByType: { email: 1, phone: 1 },
    pagesByFinding: {},
    sanitized: ["document-info", "annotations"],
  };

  it("takes Removed from what the engine reported, never from the ticks", () => {
    const counts = resultCounts(MATCHES, TICKED, {
      ...OUTCOME,
      removedByType: { email: 1 },
    });

    expect(counts.removedByType).toEqual({ email: 1 });
    expect(counts.removedTotal).toBe(1);
  });

  it("counts the tickable matches left unticked, by kind", () => {
    expect(resultCounts(MATCHES, TICKED, OUTCOME).untickedByType).toEqual({ email: 1 });
  });

  it("counts the blocked matches by kind and by reason, whatever was ticked", () => {
    const counts = resultCounts(MATCHES, TICKED, OUTCOME);

    expect(counts.blockedByType).toEqual({ email: 1, phone: 2 });
    expect(counts.blockedByReason).toEqual({ "slanted-text": 2, "image-overreach": 1 });
  });

  it("sums what was removed and keeps what was stripped, in order", () => {
    const counts = resultCounts(MATCHES, TICKED, OUTCOME);

    expect(counts.removedTotal).toBe(2);
    expect(counts.sanitized).toEqual(["document-info", "annotations"]);
  });

  it("is empty for a run with nothing found and nothing removed, and frozen", () => {
    const counts = resultCounts([], new Set(), {
      ...OUTCOME,
      removedByType: {},
      sanitized: [],
    });

    expect(counts).toEqual({
      removedByType: {},
      untickedByType: {},
      blockedByType: {},
      blockedByReason: {},
      removedTotal: 0,
      sanitized: [],
    });
    expect(Object.isFrozen(counts)).toBe(true);
    expect(Object.isFrozen(counts.untickedByType)).toBe(true);
    expect(Object.isFrozen(counts.sanitized)).toBe(true);
  });

  it("carries no document text at all", () => {
    expect(JSON.stringify(resultCounts(MATCHES, TICKED, OUTCOME))).not.toContain(
      "private",
    );
  });

  it("agrees with countRemoved", () => {
    expect(countRemoved(OUTCOME)).toBe(
      resultCounts(MATCHES, TICKED, OUTCOME).removedTotal,
    );
    expect(countRemoved({ ...OUTCOME, removedByType: {} })).toBe(0);
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

  /** Spec 0005, *Value sourcing*: each release 3 kind's icon, label and nouns. */
  it.each([
    ["date", "Calendar", "Dates", "date", "dates"],
    ["card", "CreditCard", "Card numbers", "card number", "card numbers"],
    ["iban", "Landmark", "Bank account numbers (IBAN)", "IBAN", "IBANs"],
    [
      "us-ssn",
      "IdCard",
      "US Social Security numbers",
      "Social Security number",
      "Social Security numbers",
    ],
    [
      "uk-nino",
      "IdCard",
      "UK National Insurance numbers",
      "National Insurance number",
      "National Insurance numbers",
    ],
  ] as const)("labels %s", (kind, icon, label, one, other) => {
    const words = DETECTOR_LABELS[kind];
    expect(words.icon.displayName).toBe(icon);
    expect(words).toMatchObject({ label, noun: { one, other } });
  });

  it("says, for every blocked reason, that the value stays in the file", () => {
    expect(Object.keys(BLOCKED_REASON_TEXT).sort()).toEqual([...BLOCKED_REASONS].sort());
    for (const text of Object.values(BLOCKED_REASON_TEXT)) {
      expect(text).toMatch(/stay in the file\.$/);
    }
  });
});
