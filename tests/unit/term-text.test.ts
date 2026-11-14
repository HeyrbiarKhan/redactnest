import { describe, expect, it } from "vitest";

import { HYPHEN } from "@/detect/text";
import {
  foldPoint,
  foldTerm,
  prepareTerm,
  TERM_MIN_CHARS,
  TERM_POINTS_PER_CHAR,
  TERM_REFUSALS,
  termHead,
  termLength,
  termRefusal,
} from "@/lib/term-text";

/**
 * The term text rules the page's list, the worker's gate and the matcher all
 * read. Spec 0017, AC-3, AC-4, AC-7 and AC-27.
 */

const CAPS = { maxTerms: 3, maxTermChars: 10 };

describe("prepareTerm (AC-3)", () => {
  it("trims and collapses each inner run of whitespace to one space", () => {
    expect(prepareTerm("  Acme \t  Ltd  ")).toBe("Acme Ltd");
    expect(prepareTerm("Acme Ltd")).toBe("Acme Ltd");
  });
});

describe("foldTerm (AC-7)", () => {
  it("folds two writings of one term to the same text", () => {
    expect(foldTerm("José Müller")).toBe(foldTerm("JOSE MULLER"));
    expect(foldTerm("Straße")).toBe("strasse");
    expect(foldTerm("O’Brien")).toBe(foldTerm("o'brien"));
    expect(foldTerm("Smith–Jones")).toBe("smith-jones");
    expect(foldTerm("Smith\u00adson")).toBe("smithson");
    expect(foldTerm("Acme\u200bLtd")).toBe("acme ltd");
  });

  it("folds a capital I with a dot to a plain i, its mark gone", () => {
    expect(foldPoint("İ")).toBe("i");
  });

  it("folds every hyphen the detectors read to one", () => {
    for (let code = 0; code <= 0x2fff; code += 1) {
      const point = String.fromCodePoint(code);
      if (HYPHEN.test(point)) expect(foldPoint(point), point).toBe("-");
    }
  });
});

describe("termRefusal (AC-4)", () => {
  const none = new Set<string>();

  it("judges in TERM_REFUSALS order and gives the first that applies", () => {
    expect(TERM_REFUSALS).toEqual([
      "too-short",
      "too-long",
      "no-letter-or-digit",
      "duplicate",
      "list-full",
    ]);
    expect(TERM_MIN_CHARS).toBe(2);
    expect(termRefusal("a", none, CAPS)).toBe("too-short");
    expect(termRefusal("abcdefghijk", none, CAPS)).toBe("too-long");
    expect(termRefusal("--", none, CAPS)).toBe("no-letter-or-digit");
    expect(termRefusal("JOSE", new Set([foldTerm("José")]), CAPS)).toBe("duplicate");
    expect(termRefusal("Acme", new Set(["a", "b", "c"]), CAPS)).toBe("list-full");
    expect(termRefusal("Acme", none, CAPS)).toBeNull();
  });

  it("counts characters, never UTF-16 units", () => {
    expect(termRefusal("𝐀𝐁", none, CAPS)).toBeNull();
    expect(termRefusal("𝐀", none, CAPS)).toBe("too-short");
    expect(termRefusal("𝐀".repeat(10), none, CAPS)).toBeNull();
  });

  // As fixed 2026-11-14: the floor and the cap count characters as a person
  // sees them, so a letter and its accent is one, and two code points that
  // fold to one letter no longer pass the floor.
  it("counts characters as a person sees them, for the floor and the cap alike", () => {
    expect(termRefusal("a\u0301", none, CAPS)).toBe("too-short");
    expect(termRefusal("a\u200d", none, CAPS)).toBe("too-short");
    expect(termRefusal("a\u00ad", none, CAPS)).toBe("too-short");
    expect(termRefusal("e\u0301".repeat(2), none, CAPS)).toBeNull();
    expect(termRefusal("e\u0301".repeat(10), none, CAPS)).toBeNull();
    expect(termRefusal("e\u0301".repeat(11), none, CAPS)).toBe("too-long");
  });

  it("judges the floor on the fold as well, so a term that folds to one letter is too short", () => {
    // A spacing acute folds to a space, a mark before its letter to nothing,
    // and a zero width space to a space, so each of these reads as `a`.
    expect(foldTerm("a\u00b4")).toBe("a");
    expect(termRefusal("a\u00b4", none, CAPS)).toBe("too-short");
    expect(termRefusal("\u0301a", none, CAPS)).toBe("too-short");
    expect(termRefusal("a\u200b", none, CAPS)).toBe("too-short");
    // One character that folds to two is still one character.
    expect(termRefusal("ß", none, CAPS)).toBe("too-short");
    expect(termRefusal("ab", none, CAPS)).toBeNull();
  });

  it("refuses a term past four code points a character as too long, so the cap still bounds a search", () => {
    expect(TERM_POINTS_PER_CHAR).toBe(4);
    const room = CAPS.maxTermChars * TERM_POINTS_PER_CHAR;
    // Two characters, the second carrying every mark the room has left.
    expect(termRefusal(`ab${"\u0301".repeat(room - 2)}`, none, CAPS)).toBeNull();
    expect(termRefusal(`ab${"\u0301".repeat(room - 1)}`, none, CAPS)).toBe("too-long");
  });
});

describe("termLength (AC-4, as fixed 2026-11-14)", () => {
  it("counts characters as a person sees them, never code points", () => {
    expect(termLength("Acme Ltd")).toBe(8);
    expect(termLength("e\u0301")).toBe(1);
    // A Hangul syllable written as three jamo, and a family emoji of five.
    expect(termLength("\u1112\u1161\u11ab")).toBe(1);
    expect(termLength("\u{1f468}\u200d\u{1f469}\u200d\u{1f467}")).toBe(1);
    expect(termLength("𝐀𝐁")).toBe(2);
  });

  it("leaves out a character that shows nothing", () => {
    expect(termLength("a\u00adb")).toBe(2);
    expect(termLength("a\u200b")).toBe(1);
    expect(termLength("\u2060\ufeff")).toBe(0);
  });
});

describe("termHead (AC-4)", () => {
  it("gives the whole text when it fits, and cuts between characters, never inside one", () => {
    expect(termHead("Acme", 4)).toBe("Acme");
    expect(termHead("Acme\u00ad", 4)).toBe("Acme\u00ad");
    expect(termHead("Acme Ltd", 4)).toBe("Acme");
    expect(termHead("e\u0301".repeat(3), 2)).toBe("e\u0301".repeat(2));
  });

  it("shows no more than four code points a character, even of one character", () => {
    const stacked = `a${"\u0301".repeat(50)}`;
    expect(termHead(stacked, 2)).toBe(stacked.slice(0, 2 * TERM_POINTS_PER_CHAR));
  });
});
