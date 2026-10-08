import { describe, expect, expectTypeOf, it } from "vitest";

import { detect, DETECTORS, PRECEDENCE, readsJoinAsNothing } from "@/detect";
import { DETECTOR_KINDS, type DetectorKind } from "@/worker/protocol";

/**
 * The registry and the precedence between kinds. Spec 0005, AC-3, AC-24 and
 * INV-9.
 */

function found(text: string): [DetectorKind, string][] {
  const points = Array.from(text);
  return detect({ text, joins: [] }).map((span) => [
    span.kind,
    points.slice(span.start, span.end).join(""),
  ]);
}

describe("every kind is complete (INV-9, AC-24)", () => {
  /**
   * `DETECTORS` is a record over `DetectorKind`, so a kind missing from it
   * fails the compile on its own. `PRECEDENCE` is a list, so this gate does
   * the same for it: it runs at `pnpm typecheck`, like `loggable.test.ts`.
   */
  it("gives every kind a place in PRECEDENCE, or the typecheck fails", () => {
    expectTypeOf<Exclude<DetectorKind, (typeof PRECEDENCE)[number]>>().toBeNever();
  });

  it("has a detector and one place in the precedence for each kind", () => {
    expect(Object.keys(DETECTORS).sort()).toEqual([...DETECTOR_KINDS].sort());
    expect([...PRECEDENCE].sort()).toEqual([...DETECTOR_KINDS].sort());
    expect(new Set(PRECEDENCE).size).toBe(PRECEDENCE.length);
  });

  it("orders the seven kinds as the spec does", () => {
    expect(PRECEDENCE).toEqual([
      "email",
      "iban",
      "card",
      "us-ssn",
      "uk-nino",
      "phone",
      "date",
    ]);
  });
});

/**
 * Where two kinds both claim a place, the one with a checksum or a unique
 * marker keeps it (spec 0005, *Decided within it*). Each case is a value the
 * lower kind also reads on its own, so the higher kind's place is what decides
 * it. A numeric date is no such case: the phone detector never reads one
 * (INV-14, `detect-dates.test.ts`).
 */
describe("precedence across the seven kinds (AC-3, AC-24)", () => {
  it.each<[string, string, [DetectorKind, string][]]>([
    [
      "an IBAN over the possible phone number inside its digits",
      "Pay GB82 WEST 1234 5698 7654 32 today",
      [["iban", "GB82 WEST 1234 5698 7654 32"]],
    ],
    [
      "a Social Security number over the possible UK number its digits make",
      "SSN 441234567 on file",
      [["us-ssn", "441234567"]],
    ],
    [
      "an email over a card number in its local part",
      "Write to 4111111111111111@example.com today",
      [["email", "4111111111111111@example.com"]],
    ],
  ])("keeps %s", (_what, text, expected) => {
    expect(found(text)).toEqual(expected);
  });

  it("finds every kind side by side, in order of start", () => {
    expect(
      found(
        "jane@example.com, 020 7946 0958, 05.12.1980, 4111 1111 1111 1111, " +
          "GB82 WEST 1234 5698 7654 32, 123-45-6789 and AB 12 34 56 C.",
      ),
    ).toEqual([
      ["email", "jane@example.com"],
      ["phone", "020 7946 0958"],
      ["date", "05.12.1980"],
      ["card", "4111 1111 1111 1111"],
      ["iban", "GB82 WEST 1234 5698 7654 32"],
      ["us-ssn", "123-45-6789"],
      ["uk-nino", "AB 12 34 56 C"],
    ]);
  });
});

describe("resolving overlaps (AC-3)", () => {
  /** A phone number shaped local part: both claim the digits, email keeps them. */
  it("keeps only the higher kind where two kinds' spans overlap", () => {
    expect(found("Write to 02079460958@example.com today")).toEqual([
      ["email", "02079460958@example.com"],
    ]);
  });

  /**
   * The phone number shares only `0958` with the address, and is still dropped
   * whole rather than trimmed to `020 7946`: a trimmed span would be a new
   * match no detector judged.
   */
  it("drops a lower kind's span whole where it meets a higher kind's, never trims it", () => {
    expect(found("Call 020 7946 0958@example.com")).toEqual([
      ["email", "0958@example.com"],
    ]);
  });

  it("keeps spans of different kinds that do not overlap, in order of start", () => {
    expect(found("Call 020 7946 0958 or write to jane@example.com")).toEqual([
      ["phone", "020 7946 0958"],
      ["email", "jane@example.com"],
    ]);
  });

  it("finds nothing in nothing", () => {
    expect(detect({ text: "", joins: [] })).toEqual([]);
  });
});

describe("line joins", () => {
  it("reads a join inside an email as nothing, and inside anything else as a space", () => {
    expect(readsJoinAsNothing("email")).toBe(true);
    for (const kind of DETECTOR_KINDS.filter((other) => other !== "email")) {
      expect(readsJoinAsNothing(kind)).toBe(false);
    }
  });
});
