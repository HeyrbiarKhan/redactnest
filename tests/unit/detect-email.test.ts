import { describe, expect, it } from "vitest";

import { DETECTORS, type Span } from "@/detect";

/**
 * The email detector, on plain strings. Spec 0005, AC-1 and *Detectors*.
 *
 * Offsets are code points (INV-12), so every expectation is written as the
 * matched text, read back through `Array.from`, which steps by code point.
 */

function found(text: string, joins: readonly number[] = []): string[] {
  const points = Array.from(text);
  return DETECTORS.email({ text, joins }).map((span) =>
    points.slice(span.start, span.end).join(""),
  );
}

function spans(text: string): readonly Span[] {
  return DETECTORS.email({ text, joins: [] });
}

describe("the common form", () => {
  it("finds an address in running text, ticked by default", () => {
    expect(spans("Contact: jane.doe@example.com or call")).toEqual([
      { kind: "email", start: 9, end: 29, tickedByDefault: true },
    ]);
  });

  it("finds every occurrence, the same value twice included (AC-3)", () => {
    expect(found("a@example.com, b@example.org and a@example.com")).toEqual([
      "a@example.com",
      "b@example.org",
      "a@example.com",
    ]);
  });

  it.each([
    ["plus tags", "jane+news@example.com"],
    ["underscores and percent signs", "first_last%dept@example.com"],
    ["hyphens in the local part and the domain", "o-neil@mail-server.example.co.uk"],
    ["digits", "user2026@example123.com"],
    ["upper case", "Jane.Doe@Example.COM"],
  ])("accepts %s", (_what, address) => {
    expect(found(`write to ${address} today`)).toEqual([address]);
  });
});

/** AC-1: letters, marks and digits are Unicode classes. */
describe("any script", () => {
  it.each([
    ["Greek", "δοκιμή@παράδειγμα.ελ"],
    ["Cyrillic", "пример@почта.рф"],
    ["accented Latin", "josé.müller@exämple.de"],
    ["a local part above U+FFFF", "\u{20BB7}\u{2D800}@example.jp"],
  ])("finds an address in %s", (_script, address) => {
    expect(found(`Email: ${address}.`)).toEqual([address]);
  });

  it("counts offsets in code points, so a letter above U+FFFF is one position", () => {
    expect(spans("\u{20BB7}\u{20BB7} a@example.com")).toEqual([
      { kind: "email", start: 3, end: 16, tickedByDefault: true },
    ]);
  });

  it("keeps a combining mark with the letter it sits on", () => {
    expect(found("renée@example.fr")).toEqual(["renée@example.fr"]);
  });
});

describe("where an address starts and ends", () => {
  it("finds the address after a mailto: prefix, without the prefix", () => {
    expect(found("mailto:jane@example.com")).toEqual(["jane@example.com"]);
  });

  it("leaves a sentence's closing full stop out", () => {
    expect(found("Write to jane@example.com.")).toEqual(["jane@example.com"]);
  });

  it("leaves brackets and quotes out", () => {
    expect(found('("jane@example.com")')).toEqual(["jane@example.com"]);
  });

  it("stops at a double dot in the domain", () => {
    expect(found("jane@example.com..next")).toEqual(["jane@example.com"]);
  });

  /**
   * The boundary rule: no domain character, or dot followed by one, right
   * after it. A run that goes on is not cut short to make an address.
   */
  it.each([
    ["a domain that runs on into a one letter label", "jane@example.com.x"],
    ["a top level label with a digit", "jane@example.c0m"],
    ["a top level label with a hyphen", "jane@example.co-uk"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  it("finds nothing across an ordinary space after an @", () => {
    expect(found("jane.doe@ example.com")).toEqual([]);
  });
});

/**
 * AC-4. A line join right after `@` or `.` is read as absent, once, and the
 * address across it is kept only when it swallows nothing already found. The
 * span keeps the join space, so offsets still index the block; the engine
 * leaves the space out of the text.
 */
describe("the rejoin", () => {
  it("finds an address wrapped right after its @", () => {
    expect(found("Write to jane.doe@ example.com today", [18])).toEqual([
      "jane.doe@ example.com",
    ]);
  });

  it("finds an address wrapped after a dot in its domain", () => {
    expect(found("Orders to sales@example. org today", [24])).toEqual([
      "sales@example. org",
    ]);
  });

  it("never turns Call Bob. and smith@example.com into one address", () => {
    expect(found("Call Bob. smith@example.com today", [9])).toEqual([
      "smith@example.com",
    ]);
  });

  it("lists only the part after the break of a local part wrapped at a dot", () => {
    expect(found("From john. smith@example.net only", [10])).toEqual([
      "smith@example.net",
    ]);
  });

  it("does not read a join that follows anything but @ or .", () => {
    expect(found("Write to jane doe@example.com", [13])).toEqual(["doe@example.com"]);
  });

  it("reads one join only, never two at once", () => {
    expect(found("jane@ example. com", [5, 14])).toEqual([]);
  });

  it("keeps offsets in the block the engine built", () => {
    expect(
      DETECTORS.email({ text: "Write to jane.doe@ example.com today", joins: [18] }),
    ).toEqual([{ kind: "email", start: 9, end: 30, tickedByDefault: true }]);
  });

  it("keeps the addresses on either side of a join it does not use", () => {
    expect(found("a@example.com. b@example.org", [14])).toEqual([
      "a@example.com",
      "b@example.org",
    ]);
  });
});

describe("what is not an address", () => {
  it.each([
    ["a lone @", "@"],
    ["no local part", "@example.com"],
    ["no domain", "jane@"],
    ["a domain of one label", "jane@localhost"],
    ["a one letter top level label", "jane@example.c"],
    ["a numeric top level label", "jane@10.0.0.1"],
    ["a local part starting with a dot", ".jane@example.com"],
    ["a local part ending with a dot", "jane.@example.com"],
    ["a local part with a double dot", "ja..ne@example.com"],
    ["a label starting with a hyphen", "jane@-example.com"],
    ["a label ending with a hyphen", "jane@example-.com"],
    ["a handle", "follow @redactnest today"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });

  it("refuses a local part longer than 64 characters", () => {
    expect(found(`${"a".repeat(64)}@example.com`)).toHaveLength(1);
    expect(found(`${"a".repeat(65)}@example.com`)).toEqual([]);
  });

  it("refuses a domain longer than 253 characters", () => {
    // Three labels of 60, three dots, one label of 66 and `.com`: 253.
    const label = "a".repeat(60);
    const fits = `${[label, label, label, "b".repeat(66)].join(".")}.com`;
    const tooLong = `${[label, label, label, "b".repeat(67)].join(".")}.com`;
    expect(Array.from(fits)).toHaveLength(253);
    expect(found(`jane@${fits}`)).toHaveLength(1);
    expect(found(`jane@${tooLong}`)).toEqual([]);
  });

  /** Two addresses sharing characters: the earlier is kept (AC-3). */
  it("never lets two addresses share a character", () => {
    expect(found("a@b.cc@d.com")).toEqual(["a@b.cc"]);
  });
});
