import { describe, expect, expectTypeOf, it } from "vitest";

import { detect, DETECTORS, PRECEDENCE, readsJoinAsNothing } from "@/detect";
import { datePasses } from "@/detect/date";
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
 * Spec 0014, AC-1 and AC-15, through `detect`: a stretch the phone rescue
 * lists is a row of its own, unticked, and yields to a date, since phone
 * outranks date and the phone detector cannot see where a date is read. It is
 * cut back to its last letter or digit before the date, or dropped where
 * nothing is left, and every row of today's keeps its place and its tick.
 */
describe("a rescued stretch beside other kinds (spec 0014, AC-15)", () => {
  it.each<[string, [DetectorKind, string, boolean][], string[]]>([
    // `1119` is a free group before the date, so it keeps a row; without the
    // yield the date became `June 2014`.
    [
      "212 918 8665 1119 21 June 2014",
      [
        ["phone", "212 918 8665", true],
        ["phone", "1119", false],
        ["date", "21 June 2014", false],
      ],
      ["212 918 8665", "1119 21"],
    ],
    // The hyphen at the cut goes with it.
    [
      "212 918 8665 1119-21 June 2014",
      [
        ["phone", "212 918 8665", true],
        ["phone", "1119", false],
        ["date", "21 June 2014", false],
      ],
      ["212 918 8665", "1119-21"],
    ],
    // The date begins at the stretch's first digit, so it is dropped; without
    // the yield the date became `/01/1992`.
    [
      "+44 20 3149 6135 18/01/1992",
      [
        ["phone", "+44 20 3149 6135", true],
        ["date", "18/01/1992", false],
      ],
      ["+44 20 3149 6135", "18"],
    ],
    [
      "212 555 0123 9346 21 June 2014",
      [
        ["phone", "212 555 0123", true],
        ["date", "21 June 2014", false],
      ],
      ["212 555 0123"],
    ],
    // A numeric date stops the stretch before any yield is needed: no phone
    // window holds a date unit (spec 0005, INV-14), so even the phone
    // detector alone leaves the date out of `0123`.
    [
      "9346 212 555 0123 05.12.1980",
      [
        ["phone", "9346 212 555", true],
        ["phone", "0123", false],
        ["date", "05.12.1980", false],
      ],
      ["9346 212 555", "0123"],
    ],
    // A higher kind holds the whole stretch, so precedence leaves no piece.
    [
      "9346 212 555 0123@example.com",
      [
        ["phone", "9346 212 555", true],
        ["email", "0123@example.com", true],
      ],
      ["9346 212 555", "0123"],
    ],
    // Nothing below phone meets the stretch, so it is listed whole.
    [
      "9346 212 555 0123 GB82 WEST 1234 5698 7654 32",
      [
        ["phone", "9346 212 555", true],
        ["phone", "0123", false],
        ["iban", "GB82 WEST 1234 5698 7654 32", true],
      ],
      ["9346 212 555", "0123", "5698 7654 32"],
    ],
    [
      "9346 212 555 0123 ext. 45",
      [
        ["phone", "9346 212 555", true],
        ["phone", "0123 ext. 45", false],
      ],
      ["9346 212 555", "0123 ext. 45"],
    ],
    // Today's piece `020` beside the card keeps its tick (spec 0005, INV-16),
    // and the rest of the UK number is a stretch, unticked, where today it
    // had no row.
    [
      "6293 6608 0005 7382 276 020 7946 0958",
      [
        ["card", "6293 6608 0005 7382 276", true],
        ["phone", "020", true],
        ["phone", "7946 0958", false],
      ],
      ["7382 276 020", "7946 0958"],
    ],
  ])("resolves %s", (text, expected, phoneAlone) => {
    expect(withTicks(text)).toEqual(expected);
    // The yield lives in `detect`, so the phone detector alone still lists
    // each stretch whole.
    const points = Array.from(text);
    expect(
      DETECTORS.phone({ text, joins: [] }).map((span) =>
        points.slice(span.start, span.end).join(""),
      ),
    ).toEqual(phoneAlone);
  });

  it("returns no span carrying rescued", () => {
    expect(detect({ text: "212 918 8665 1119 21 June 2014", joins: [] })).toStrictEqual([
      { kind: "phone", start: 0, end: 12, tickedByDefault: true },
      { kind: "phone", start: 13, end: 17, tickedByDefault: false },
      { kind: "date", start: 18, end: 30, tickedByDefault: false },
    ]);
  });

  /**
   * Every way a stretch leaves the yield, so `rescued` never reaches the
   * engine: listed whole, with an extension, beside a higher kind, beside a
   * card's piece, and stopped before a numeric date. Each string holds a span
   * the phone detector marks `rescued`, checked first so a case cannot pass
   * by holding no stretch at all.
   */
  it.each([
    "9346 212 555 0123",
    "9346 212 555 0123 ext. 45",
    "9346 212 555 0123 GB82 WEST 1234 5698 7654 32",
    "6293 6608 0005 7382 276 020 7946 0958",
    "212 526 5087 020 2208 1633 24",
    "9346 212 555 0123 05.12.1980",
  ])("strips rescued from every span detect returns for %s", (text) => {
    expect(
      DETECTORS.phone({ text, joins: [] }).some((span) => span.rescued === true),
    ).toBe(true);
    for (const span of detect({ text, joins: [] })) {
      expect(Object.keys(span).sort()).toEqual([
        "end",
        "kind",
        "start",
        "tickedByDefault",
      ]);
    }
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

/**
 * Each code point NFKC normalised on its own, as the find step does before
 * any detector runs (`src/engine/find.ts`), so a superscript `¹` reads as `1`.
 */
function nfkc(text: string): string {
  return Array.from(text, (point) => point.normalize("NFKC")).join("");
}

/**
 * Spec 0005, AC-19, AC-20 and AC-22, third update of 2026-10-11, through
 * `detect`: a footnote marker after a date, a Social Security number or a
 * card leaves one row, the marker outside it, and no phone row.
 */
describe("footnote markers through detect (AC-19, AC-20, AC-22)", () => {
  it.each<[string, [DetectorKind, string, boolean][]]>([
    ["Born 12/05/1980¹", [["date", "12/05/1980", true]]],
    ["SSN 123-45-6789¹", [["us-ssn", "123-45-6789", false]]],
    ["Card 4111 1111 1111 1111¹", [["card", "4111 1111 1111 1111", false]]],
  ])("lists %s as one row", (text, expected) => {
    expect(withTicks(nfkc(text))).toEqual(expected);
  });

  /**
   * Pinned as a known behaviour (spec 0005, *Consequences*): the phone
   * detector reads `223-45-67891` as a possible US number, the Social Security
   * row wins by `PRECEDENCE`, and the marker is left as a phone piece with the
   * phone row's tick (AC-3, INV-16). One character too many removed by
   * default, never one too few.
   */
  /**
   * The other forms each detector reads a marker after, a glued label, and two
   * marked values on one line: no phone row reads a marker or the value
   * before it, and each value keeps its own detector's tick.
   */
  // covers: AC-19, AC-20, AC-22, AC-10, INV-14
  it.each<[string, [DetectorKind, string, boolean][]]>([
    ["Logged 2026-09-27¹ here", [["date", "2026-09-27", false]]],
    ["Signed 27 September 2026¹ here", [["date", "27 September 2026", false]]],
    ["Exp.31.12.2026 here", [["date", "31.12.2026", false]]],
    ["SSN 123 45 6789¹ here", [["us-ssn", "123 45 6789", false]]],
    ["Amex 378282246310005¹ here", [["card", "378282246310005", false]]],
    ["Card 4111-1111-1111-1111¹ here", [["card", "4111-1111-1111-1111", false]]],
    ["Card 4111111111111111¹ exp 12/28", [["card", "4111111111111111", false]]],
    [
      "DOB 12/05/1980¹ SSN 123-45-6789¹",
      [
        ["date", "12/05/1980", true],
        ["us-ssn", "123-45-6789", false],
      ],
    ],
  ])("lists %s with no phone row", (text, expected) => {
    expect(withTicks(nfkc(text))).toEqual(expected);
  });

  it("leaves the marker after SSN 223-45-6789¹ as a ticked phone piece", () => {
    expect(withTicks(nfkc("SSN 223-45-6789¹"))).toEqual([
      ["us-ssn", "223-45-6789", false],
      ["phone", "1", true],
    ]);
  });
});

/**
 * Spec 0014, AC-9, as the owner narrowed it on 2026-10-19: a marker read on
 * OCR text, where it is a plain digit, never takes a digit from a row listed
 * before spec 0014, and never a tick. The bare Social Security marker, the two
 * digit year marker and AC-3's two phone unit rules each did, so they were
 * dropped; the National Insurance marker stays only where letters glue the
 * number shut. Each row is written out as `detect` listed it before.
 */
describe("a marker on OCR text beside other rows (spec 0014, AC-9)", () => {
  it("keeps the phone row after SSN 123-45-6789 whole and ticked", () => {
    expect(withTicks("SSN 123-45-6789 tel 2125550123 ok")).toEqual([
      ["us-ssn", "123-45-6789", true],
      ["phone", "2125550123", true],
    ]);
  });

  // Each listed a marker reading that cut or replaced the row below.
  it.each<[string, [DetectorKind, string, boolean][]]>([
    ["SSN 2125550123", [["phone", "2125550123", false]]],
    ["Born 25.05.804 282 246 9648", [["phone", "25.05.804 282", true]]],
    ["21-05-566 988 7048", [["phone", "21-05-566 988", true]]],
    ["22-04-20137 8", [["phone", "22-04-20137 8", true]]],
    ["DOB: 05.12.19801 12 High Street", [["phone", "05.12.19801 12", false]]],
    [
      "Ref 78-1972-01-21 020 3114 8249",
      [
        ["phone", "78-1972-01-21", true],
        ["phone", "020 3114 8249", true],
      ],
    ],
    [
      "2026-09-27 10:00-2026-09-28 11:00",
      [
        ["date", "2026-09-27", false],
        ["phone", "00-2026-09-28 11", false],
      ],
    ],
    // A National Insurance number with a space in it: the phone row stands.
    ["NI PX 85 87 420 020", [["phone", "85 87 420 020", true]]],
  ])("keeps the rows listed before in %s", (text, expected) => {
    expect(withTicks(text)).toEqual(expected);
  });

  // Written together, the letters keep the phone detector out of the digits.
  it.each<[string, [DetectorKind, string, boolean][]]>([
    [
      "NI AB1234561 212 555 0123",
      [
        ["uk-nino", "AB123456", false],
        ["phone", "212 555 0123", true],
      ],
    ],
    [
      "Tel 212 555 0123 NI AB1234561 ok",
      [
        ["phone", "212 555 0123", true],
        ["uk-nino", "AB123456", false],
      ],
    ],
  ])("adds only the National Insurance row in %s", (text, expected) => {
    expect(withTicks(text)).toEqual(expected);
  });
});

/**
 * Spec 0014, AC-3: no unit is a date unless it is a full numeric date, and no
 * unit is cut at one, as on main. These are its cases the table above does not
 * hold (`22-04-20137 8`, the normalised DOB line, `Ref 78-1972-01-21 020 3114
 * 8249` and the ISO interval are there), each with the rows main lists. The
 * DOB line is written raw, marker and all, and read as the find step hands it
 * over, so the pin holds the whole OCR path from `¹` to the phone row.
 */
// covers: AC-3
describe("AC-3's cases on NFKC text keep main's rows (spec 0014, AC-3)", () => {
  it.each<[string, [DetectorKind, string, boolean][]]>([
    ["DOB: 05.12.1980¹ 12 High Street", [["phone", "05.12.19801 12", false]]],
    ["Born 12.05.1980.1 44 years", [["phone", "12.05.1980.1 44", false]]],
    ["John Smith 1980-12-051 44", [["phone", "1980-12-051 44", false]]],
    ["Ref 00-2026-09-28-11 here", [["phone", "00-2026-09-28-11", false]]],
    ["2026-09-27-01", [["phone", "2026-09-27-01", true]]],
    ["01-02-03-04-05", [["phone", "01-02-03-04-05", false]]],
  ])("lists main's rows in %s", (text, expected) => {
    expect(withTicks(nfkc(text))).toEqual(expected);
  });
});

/** The text of each span, read from `text`. */
function spanTexts(
  text: string,
  spans: readonly { start: number; end: number }[],
): string[] {
  const points = Array.from(text);
  return spans.map((span) => points.slice(span.start, span.end).join(""));
}

/**
 * Spec 0015, AC-12 and AC-14, through `detect`: a rescued phone stretch
 * yields only to the dates the date detector's first scan lists, today's, so
 * it keeps exactly today's extent beside a date only the second scan reads,
 * and that date keeps its free pieces under precedence (spec 0005, INV-16).
 * Each case's rows are main's, written out, plus the new date.
 */
describe("dates only the second scan lists, through detect (spec 0015, AC-12)", () => {
  it("keeps a rescued stretch at today's extent beside a new form", () => {
    const text = "212 918 8665 1119 21. June 2014";
    expect(withTicks(text)).toEqual([
      ["phone", "212 918 8665", true],
      ["phone", "1119 21", false],
      ["date", ". June 2014", false],
    ]);
    // The phone detector alone lists the stretch whole, and the date is the
    // second scan's, so the stretch has no first scan date to yield to.
    expect(spanTexts(text, DETECTORS.phone({ text, joins: [] }))).toEqual([
      "212 918 8665",
      "1119 21",
    ]);
    const { first, added } = datePasses({ text, joins: [] });
    expect(spanTexts(text, first)).toEqual([]);
    expect(spanTexts(text, added)).toEqual(["21. June 2014"]);
  });

  it("returns spans holding only kind, start, end and tick", () => {
    expect(
      detect({ text: "Tel 020 7946 0958 DOB 27-Sep-1980", joins: [] }),
    ).toStrictEqual([
      { kind: "phone", start: 4, end: 17, tickedByDefault: true },
      { kind: "date", start: 22, end: 33, tickedByDefault: true },
    ]);
  });

  it("lists a new form beside a phone row and a stranded group, each as main lists them", () => {
    expect(withTicks("9346 212 555 0123 05-Jan-2026")).toEqual([
      ["phone", "9346 212 555", true],
      ["phone", "0123", false],
      ["date", "05-Jan-2026", false],
    ]);
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
