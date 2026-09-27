import { findNumbers } from "libphonenumber-js/max";
import { describe, expect, it } from "vitest";

import { DETECTORS, KEYWORD_REACH, PHONE_REGIONS } from "@/detect";

/**
 * The phone detector, on plain strings. Spec 0005, AC-2 and AC-10.
 *
 * Each case gives the text found and whether it starts ticked, since for phone
 * numbers the tick is the interesting half: nothing unsure is removed by
 * default, and nothing plausible is hidden.
 */

function found(text: string): [string, boolean][] {
  const points = Array.from(text);
  return DETECTORS.phone({ text, joins: [] }).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.tickedByDefault,
  ]);
}

describe("numbers found and ticked (AC-2, AC-10)", () => {
  it.each([
    ["a UK national number", "Call 020 7946 0958 today", "020 7946 0958"],
    ["a UK number written internationally", "+44 20 7946 0958", "+44 20 7946 0958"],
    ["a 00 country prefix", "Dial 00 44 20 7946 0958", "00 44 20 7946 0958"],
    ["a US number in brackets", "Office (212) 555-0123", "(212) 555-0123"],
    ["a US number with dots", "Office 212.555.0123", "212.555.0123"],
    ["a US number written internationally", "+1 212-555-0123", "+1 212-555-0123"],
    ["a trunk prefix in brackets", "Fax: +44 (0)20 7946 0958", "+44 (0)20 7946 0958"],
  ])("finds %s, ticked", (_what, text, number) => {
    expect(found(text)).toEqual([[number, true]]);
  });

  it("keeps an extension the library includes in the match", () => {
    expect(found("Call 020 7946 0958 ext. 123 today")).toEqual([
      ["020 7946 0958 ext. 123", true],
    ]);
  });

  it("finds a number before a sentence's full stop", () => {
    expect(found("Call 020 7946 0958.")).toEqual([["020 7946 0958", true]]);
  });

  it("finds each occurrence of a repeated number", () => {
    expect(found("020 7946 0958 or 020 7946 0958")).toEqual([
      ["020 7946 0958", true],
      ["020 7946 0958", true],
    ]);
  });

  it("finds an international number once, though both regions read it", () => {
    expect(found("+44 20 7946 0958")).toHaveLength(1);
  });

  it("counts offsets in code points after a letter above U+FFFF", () => {
    expect(DETECTORS.phone({ text: "\u{20BB7} 020 7946 0958", joins: [] })).toEqual([
      { kind: "phone", start: 2, end: 15, tickedByDefault: true },
    ]);
  });
});

describe("numbers found and left unticked (AC-10)", () => {
  /** Possible, the right length for its region, but not a real number. */
  it("lists a possible but not valid number unticked", () => {
    expect(found("Office (212) 123 4567")).toEqual([["(212) 123 4567", false]]);
  });

  /** A valid US number, and an order number too. Validity alone never ticks. */
  it("lists a valid number written as bare digits unticked", () => {
    expect(found("Order 12345678901 shipped")).toEqual([["12345678901", false]]);
  });

  it.each(["Tel:", "tel", "Phone", "TELEPHONE", "mobile", "Mob.", "cell", "Fax", "call"])(
    "ticks the same digits after %s",
    (word) => {
      expect(found(`${word} 12345678901`)).toEqual([["12345678901", true]]);
    },
  );

  it("ticks them when the phone word ends exactly KEYWORD_REACH before", () => {
    const gap = " ".repeat(KEYWORD_REACH);
    expect(found(`Tel${gap}12345678901`)).toEqual([["12345678901", true]]);
    expect(found(`Tel ${gap}12345678901`)).toEqual([["12345678901", false]]);
  });

  it("does not read a phone word inside another word", () => {
    expect(found("Hotel 12345678901")).toEqual([["12345678901", false]]);
  });

  it("does not tick a number that is not valid, even after a phone word", () => {
    expect(found("Tel: (212) 123 4567")).toEqual([["(212) 123 4567", false]]);
  });
});

/** AC-2: the look alikes. */
describe("what is not a phone number", () => {
  it.each([
    ["an invoice code", "Invoice INV-2026-000123 paid"],
    ["a reference joined by a slash", "Ref AB/2026/000123"],
    ["a day first date", "Born 12/05/1980 in Leeds"],
    ["an ISO date", "Signed 2026-09-27 here"],
    ["a dashed date", "Due 12-05-1980 now"],
    ["a written date", "On 27 September 2026 we met"],
    ["UK postcodes", "SW1A 1AA, EC1A 1BB, M1 1AE, B33 8TH, DN55 1PT"],
    ["ZIP codes", "ZIP 90210, 10001 and 02134"],
    ["a sort code", "Sort code 20-00-00"],
    ["times", "Open 12:30 to 14:45"],
    ["an amount", "Total £1,234.56"],
    ["a page number", "Page 1 of 12"],
  ])("finds nothing in %s", (_what, text) => {
    expect(found(text)).toEqual([]);
  });
});

/**
 * The pin. `leniency` is missing from the package's types, so an upgrade could
 * drop it without a compile error. Without it the finder returns valid numbers
 * only, and every possible only number the checklist lists unticked would be
 * hidden instead.
 */
describe("libphonenumber-js, as the detector relies on it", () => {
  it("still returns a possible only number under POSSIBLE leniency", () => {
    const options = { defaultCountry: "US", v2: true, leniency: "POSSIBLE" } as const;
    const results = findNumbers("Office (212) 123 4567", options);

    expect(results).toHaveLength(1);
    expect(results[0].number.isValid()).toBe(false);
  });

  it("reads national numbers as GB first, then US", () => {
    expect(PHONE_REGIONS).toEqual(["GB", "US"]);
  });
});
