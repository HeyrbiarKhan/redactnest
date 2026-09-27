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

  it("puts email above phone", () => {
    expect(PRECEDENCE.indexOf("email")).toBeLessThan(PRECEDENCE.indexOf("phone"));
  });
});

describe("resolving overlaps (AC-3)", () => {
  /** A phone number shaped local part: both claim the digits, email keeps them. */
  it("keeps only the higher kind where two kinds' spans overlap", () => {
    expect(found("Write to 02079460958@example.com today")).toEqual([
      ["email", "02079460958@example.com"],
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
    expect(readsJoinAsNothing("phone")).toBe(false);
  });
});
