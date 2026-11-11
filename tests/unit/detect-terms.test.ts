import { describe, expect, it } from "vitest";

import { findTerms, tailFrom, termReach, type TermInput } from "@/detect";
import { HYPHEN } from "@/detect/text";
import { asTermId, type TermNote } from "@/worker/protocol";

/**
 * The custom term matcher. Spec 0017, AC-7 to AC-13, AC-32 and AC-33, with
 * each criterion's own examples.
 *
 * Pages are written with `\n` for a line break and `¶` for a block break; each
 * becomes the one synthetic space the find step writes for it, recorded in
 * `breaks` (and `lineBreaks` for a line break), as `pageText` records them.
 */
function page(written: string, pageStart = 0): TermInput {
  const points = Array.from(written);
  const breaks: number[] = [];
  const lineBreaks: number[] = [];
  const text = points
    .map((point, at) => {
      if (point === "\n") {
        breaks.push(at);
        lineBreaks.push(at);
        return " ";
      }
      if (point === "¶") {
        breaks.push(at);
        return " ";
      }
      return point;
    })
    .join("");
  return { text, breaks, lineBreaks, pageStart };
}

const ID = asTermId("term-1");

/** Each row a term lists: its page text, and its notes. */
function rows(term: string, written: string): [string, readonly TermNote[]][] {
  const input = page(written);
  const points = Array.from(input.text);
  return findTerms(input, [{ id: ID, text: term }]).map((span) => [
    points.slice(span.start, span.end).join(""),
    span.notes,
  ]);
}

/** Only the ticked ones, an exact whole word match with no note (INV-4). */
function exact(term: string, written: string): string[] {
  return rows(term, written)
    .filter(([, notes]) => notes.length === 0)
    .map(([text]) => text);
}

describe("the fold (AC-7)", () => {
  it("folds case, marks, ß, apostrophes and hyphens alike on both sides", () => {
    expect(exact("José", "Paid to JOSE today")).toEqual(["JOSE"]);
    expect(exact("Muller", "Herr Müller wrote")).toEqual(["Müller"]);
    expect(exact("Straße", "STRASSE 12")).toEqual(["STRASSE"]);
    expect(exact("O'Brien", "Mr O’Brien and Ms Oʼbrien")).toEqual(["O’Brien", "Oʼbrien"]);
    expect(exact("Smith-Jones", "Dr Smith–Jones signed")).toEqual(["Smith–Jones"]);
  });

  it("reads a combining mark after the last letter as part of the match", () => {
    expect(exact("Jose", "Jose\u0301 came")).toEqual(["Jose\u0301"]);
  });

  it("reads invisible characters as nothing and a zero width space as a space", () => {
    expect(exact("Smithson", "Smith\u00adson")).toEqual(["Smith\u00adson"]);
    expect(exact("Acme Ltd", "Acme\u200bLtd")).toEqual(["Acme\u200bLtd"]);
  });

  it("uses the detectors' hyphen set", () => {
    for (const point of [
      "-",
      "\u2010",
      "\u2011",
      "\u2012",
      "\u2013",
      "\u2014",
      "\u2015",
      "\u2212",
    ]) {
      expect(HYPHEN.test(point)).toBe(true);
      expect(exact("a-b", `x a${point}b y`)).toEqual([`a${point}b`]);
    }
  });
});

describe("the exact reading (AC-8, AC-9)", () => {
  it("matches a run of whitespace, a line break or a block break as one space", () => {
    expect(exact("Acme Ltd", "Acme   Ltd")).toEqual(["Acme   Ltd"]);
    expect(exact("Acme Ltd", "Acme\nLtd")).toEqual(["Acme Ltd"]);
    expect(exact("Acme Ltd", "Acme¶Ltd")).toEqual(["Acme Ltd"]);
  });

  it("reads a hyphen before a line break either way", () => {
    expect(exact("Smithson", "Smith-\nson")).toEqual(["Smith- son"]);
    expect(exact("Smith-son", "Smith-\nson")).toEqual(["Smith- son"]);
  });

  it("lists a match needing both readings at once unticked, never missed (a recorded limit)", () => {
    expect(rows("Jean-Luc Smithson", "Jean-\nLuc Smith-\nson")).toEqual([
      ["Jean- Luc Smith- son", ["spaced"]],
    ]);
  });

  it("never reads a hyphen before a block break as either", () => {
    expect(exact("Smithson", "Smith-¶son")).toEqual([]);
  });

  it("needs a word edge at each end", () => {
    expect(exact("Smith", "Smith, Smith. (Smith)")).toEqual(["Smith", "Smith", "Smith"]);
    expect(rows("Smith", "Smithson")).toEqual([]);
    expect(rows("Smith", "SMITHSON")).toEqual([]);
  });

  it("never touches an edge whose boundary is not a letter or digit", () => {
    expect(exact("#42", "ref#42")).toEqual(["#42"]);
    expect(exact("O'", "O'Neil")).toEqual(["O'"]);
  });
});

describe("joined edges (AC-10)", () => {
  it("lists a case change, a letter meeting a digit, and scripts without spaces", () => {
    expect(rows("Smith", "JohnSmith")).toEqual([["Smith", ["joined"]]]);
    expect(rows("Smith", "SmithDate")).toEqual([["Smith", ["joined"]]]);
    expect(rows("0958", "0958Mobile")).toEqual([["0958", ["joined"]]]);
    expect(rows("Smith", "Smith2026")).toEqual([["Smith", ["joined"]]]);
    expect(rows("東京", "東京都")).toEqual([["東京", ["joined"]]]);
  });

  it("lists nothing for any other touched edge", () => {
    expect(rows("Ann", "Annual planning")).toEqual([]);
    expect(rows("Smith", "Smithson")).toEqual([]);
    expect(rows("Smith", "SMITHSON")).toEqual([]);
    // A known miss, recorded: no case change marks an all capitals edge.
    expect(rows("Smith", "SMITHDate")).toEqual([]);
  });
});

describe("the spaced reading (AC-11)", () => {
  it("finds each of the criterion's forms, unticked", () => {
    const cases: [string, string, string][] = [
      ["Smith-Jones", "Smith Jones", "Smith Jones"],
      ["Smith-Jones", "SmithJones", "SmithJones"],
      ["INV-2026-0042", "INV 2026 0042", "INV 2026 0042"],
      ["INV-2026-0042", "INV20260042", "INV20260042"],
      ["McDonald", "Mc Donald", "Mc Donald"],
      ["Smith", "S M I T H", "S M I T H"],
      ["O'Brien", "OBrien", "OBrien"],
      ["O'Brien", "O Brien", "O Brien"],
      ["J. Smith", "J Smith", "J Smith"],
      ["Smithson", "Smith\nson", "Smith son"],
    ];
    for (const [term, written, text] of cases) {
      expect(rows(term, written), `${term} in ${written}`).toEqual([[text, ["spaced"]]]);
    }
  });

  it("never lists a spaced row where an exact one covers the place", () => {
    expect(rows("Smith", "Smith")).toEqual([["Smith", []]]);
  });

  it("puts notes in TERM_NOTES order", () => {
    expect(rows("Smith-Jones", "JohnSmith Jones")).toEqual([
      ["Smith Jones", ["joined", "spaced"]],
    ]);
  });
});

describe("choosing (AC-12)", () => {
  it("takes exact matches first, then noted ones that overlap none", () => {
    expect(rows("Ann Lee", "Ann Lee and AnnLee and Ann  Lee")).toEqual([
      ["Ann Lee", []],
      ["AnnLee", ["spaced"]],
      ["Ann  Lee", []],
    ]);
  });

  it("lists each term on its own, so two terms may share a place", () => {
    const input = page("John Smith");
    const spans = findTerms(input, [
      { id: asTermId("a"), text: "John Smith" },
      { id: asTermId("b"), text: "Smith" },
    ]);
    expect(spans.map(({ term, start, end }) => [term, start, end])).toEqual([
      ["a", 0, 10],
      ["b", 5, 10],
    ]);
  });
});

describe("marks outside Latin, Greek and Cyrillic (AC-32)", () => {
  it("lists a vowelled form unticked for a term typed without vowel marks", () => {
    // Arabic: Muhammad with and without its vowel marks.
    expect(rows("محمد", "قال مُحَمَّد اليوم")).toEqual([["مُحَمَّد", ["marks"]]]);
    // Hebrew: shalom with and without its points.
    expect(rows("שלום", "אמר שָׁלוֹם לכולם")).toEqual([["שָׁלוֹם", ["marks"]]]);
  });

  it("ticks a match whose marks agree", () => {
    expect(exact("مُحَمَّد", "قال مُحَمَّد اليوم")).toEqual(["مُحَمَّد"]);
  });

  it("folds marks in silence on a Latin, Greek or Cyrillic letter", () => {
    expect(exact("José", "JOSE")).toEqual(["JOSE"]);
    expect(exact("Αθήνα", "ΑΘΗΝΑ")).toEqual(["ΑΘΗΝΑ"]);
    expect(exact("Йошкар", "Иошкар")).toEqual(["Иошкар"]);
  });
});

describe("a page break (AC-33)", () => {
  /** The tail of one page, a page break, and the next page. */
  function across(before: string, after: string, term: string) {
    const reach = termReach(term);
    const points = Array.from(before);
    const tail = points.slice(tailFrom(points, reach)).join("");
    const tailLength = Array.from(tail).length;
    const input = page(`${tail}\n${after}`, tailLength + 1);
    const text = Array.from(input.text);
    return findTerms(input, [{ id: ID, text: term }]).map((span) => [
      text.slice(span.start, span.end).join(""),
      span.notes,
      span.start < input.pageStart - 1,
    ]);
  }

  it("lists a match across the break with the page-break note", () => {
    expect(across("paid to Acme", "Ltd on time", "Acme Ltd")).toEqual([
      ["Acme Ltd", ["page-break"], true],
    ]);
    expect(across("paid to Smith-", "son today", "Smithson")).toEqual([
      ["Smith- son", ["page-break"], true],
    ]);
  });

  it("leaves out what the page before already listed, and keeps the rest", () => {
    expect(across("Acme Ltd", "Acme Ltd again", "Acme Ltd")).toEqual([
      ["Acme Ltd", [], false],
    ]);
  });

  it("keeps a footer between the parts apart", () => {
    expect(across("paid to Acme Page 1", "Ltd", "Acme Ltd")).toEqual([]);
  });

  it("carries no more than the longest term's characters that are not separators", () => {
    const points = Array.from("one two three-four");
    expect(points.slice(tailFrom(points, termReach("re-fo ur"))).join("")).toEqual(
      "ee-four",
    );
  });
});
