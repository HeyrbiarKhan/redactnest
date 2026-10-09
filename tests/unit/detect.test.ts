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

function withTicks(text: string): [DetectorKind, string, boolean][] {
  const points = Array.from(text);
  return detect({ text, joins: [] }).map((span) => [
    span.kind,
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
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
   * The phone number shares only `0958` with the address. The address keeps
   * its span whole, and the rest of the number is a row of its own, ticked as
   * the whole number was, so no digit the phone detector found is left
   * without a row (INV-16).
   */
  it("keeps the rest of a lower kind's span as a piece where a higher kind's cuts into it", () => {
    expect(withTicks("Call 020 7946 0958@example.com")).toEqual([
      ["phone", "020 7946", true],
      ["email", "0958@example.com", true],
    ]);
  });

  /** The address holds every digit, so the phone number's free stretch is `+ `. */
  it("leaves no piece where the free stretch holds no letter or digit", () => {
    expect(withTicks("Call + 442079460958@example.com")).toEqual([
      ["email", "442079460958@example.com", true],
    ]);
  });

  /**
   * A card window that passes by chance takes the first group of a spaced
   * Social Security number. The rest of that number is its own ticked row,
   * so unticking the false card can never untick it. Before, the number was
   * dropped whole, and `45 6789` had no row.
   */
  it("keeps the rest of a Social Security number a false card cuts into", () => {
    expect(withTicks("Ref 3400 0000 0005 123 45 6789 on file")).toEqual([
      ["card", "3400 0000 0005 123", true],
      ["us-ssn", "45 6789", true],
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

/**
 * Spec 0005, AC-28, through `detect`: an IBAN, a Social Security number and
 * a National Insurance number beside other digits are each found whole, with
 * whatever their neighbours are, and no card. Each kind's own detector finds
 * the same layouts alone (`detect-iban.test.ts`, `detect-us-ssn.test.ts`,
 * `detect-uk-nino.test.ts`).
 */
describe("other kinds beside other digits (AC-28)", () => {
  it.each<[string, [DetectorKind, string, boolean][]]>([
    [
      "GB82 WEST 1234 5698 7654 32 15/03/2026",
      [
        ["iban", "GB82 WEST 1234 5698 7654 32", true],
        ["date", "15/03/2026", false],
      ],
    ],
    ["GB82WEST12345698765432 1234", [["iban", "GB82WEST12345698765432", true]]],
    ["12 GB82 WEST 1234 5698 7654 32", [["iban", "GB82 WEST 1234 5698 7654 32", true]]],
    [
      "AB 12 34 56 C 15/03/2026",
      [
        ["uk-nino", "AB 12 34 56 C", true],
        ["date", "15/03/2026", false],
      ],
    ],
    ["AB123456C 1234", [["uk-nino", "AB123456C", true]]],
    ["12 AB123456C", [["uk-nino", "AB123456C", true]]],
    // The phone detector reads `45 6789 1234` as a possible US number, so
    // the reference is left as an unticked phone piece.
    [
      "123 45 6789 1234",
      [
        ["us-ssn", "123 45 6789", true],
        ["phone", "1234", false],
      ],
    ],
    // `12 123-45-6789` is a valid US number written with a trunk `1`, so the
    // row number is left as a ticked phone piece: two digits more removed by
    // default, never fewer.
    [
      "12 123-45-6789",
      [
        ["phone", "12", true],
        ["us-ssn", "123-45-6789", true],
      ],
    ],
    // `123-45-6789 15` is a valid US number too, and the phone detector stops
    // at the slash, so its piece `15` cuts the date: the date keeps
    // `/03/2026`, unticked as it was, and every digit still has a row. The
    // same cause as spec 0005's Follow-up on digits before a phone number.
    [
      "123-45-6789 15/03/2026",
      [
        ["us-ssn", "123-45-6789", true],
        ["phone", "15", true],
        ["date", "/03/2026", false],
      ],
    ],
  ])("finds the value whole in %s", (text, expected) => {
    expect(withTicks(text)).toEqual(expected);
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
