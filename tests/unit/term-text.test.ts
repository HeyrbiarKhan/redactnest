import { describe, expect, it } from "vitest";

import { HYPHEN } from "@/detect/text";
import {
  foldPoint,
  foldTerm,
  prepareTerm,
  TERM_MIN_CHARS,
  TERM_REFUSALS,
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

  it("counts code points, never UTF-16 units", () => {
    expect(termRefusal("𝐀𝐁", none, CAPS)).toBeNull();
    expect(termRefusal("𝐀", none, CAPS)).toBe("too-short");
    expect(termRefusal("𝐀".repeat(10), none, CAPS)).toBeNull();
  });
});
