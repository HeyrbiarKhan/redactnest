import { beforeAll, describe, expect, it } from "vitest";

import {
  openDocumentWith,
  redactDocumentWith,
  silenceEngineLog,
  type FoundMatch,
  type RedactionTarget,
} from "@/engine";
import { asTermId, type TermQuery } from "@/worker/protocol";

import { TERMS_DENSE, TERMS_PDF } from "../../scripts/lib/terms-fixtures.mjs";
import { fixture } from "../support/bytes";
import { documentText, LIMITS, mupdf } from "../support/mupdf";

/**
 * Custom terms through the real MuPDF in Node. Spec 0017, AC-9, AC-12, AC-13,
 * AC-21, AC-30, AC-32 and AC-33.
 *
 * `terms.pdf` is opened as the worker opens the review copy and searched
 * with the terms the criteria name. Each output a test redacts is read back
 * with `tests/support/mupdf.ts`, which shares no code with the engine, and
 * every run passes the engine's own self check on its exact bytes.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

const TERM_LIMITS = Object.freeze({ ...LIMITS, maxTerms: 50, maxTermChars: 100 });

/** A term whose id is its own text, so a row names its term plainly. */
function query(text: string): TermQuery {
  return { id: asTermId(text), text };
}

async function search(
  name: string,
  terms: readonly string[],
  read: "open" | "review" = "open",
): Promise<readonly FoundMatch[]> {
  const doc = await openDocumentWith(mupdf, fixture(name), TERM_LIMITS);
  try {
    const options = { contextChars: 30, terms: terms.map(query) };
    return await (read === "open" ? doc.findMatches(options) : doc.findTerms(options));
  } finally {
    doc.close();
  }
}

/** Each term row: its page, its term, its text, its notes, whether it is ticked. */
function rowsOf(found: readonly FoundMatch[], term?: string) {
  return found
    .filter(
      (match) => match.kind === "term" && (term === undefined || match.term === term),
    )
    .map((match) => [
      match.page + 1,
      match.term,
      match.text,
      match.termNotes.join("+"),
      match.tickedByDefault,
    ]);
}

async function redact(name: string, targets: readonly RedactionTarget[]) {
  return redactDocumentWith(mupdf, fixture(name), targets);
}

function targetsOf(found: readonly FoundMatch[]): readonly RedactionTarget[] {
  return found.flatMap((match) =>
    match.target !== null && match.tickedByDefault ? [match.target] : [],
  );
}

const { marks } = TERMS_PDF;

describe("terms.pdf, read at open (AC-9, AC-30)", () => {
  let found: readonly FoundMatch[];
  beforeAll(async () => {
    found = await search("terms.pdf", [
      "José",
      "Muller",
      "Acme Ltd",
      "Smithson",
      "Jean-Luc",
      "Smith",
      "Ann",
      "0958",
      "Smith-Jones",
      "INV-2026-0042",
      "McDonald",
      "O'Brien",
      "J. Smith",
      marks.arabicBare,
      marks.hebrewBare,
      "Jane Doe",
      "Ann Lee",
    ]);
  });

  it("finds the folds, a line break, a hyphen before a break each way and a block break", () => {
    expect(rowsOf(found.filter(({ page }) => page === 0))).toEqual([
      [1, "José", "JOSE", "", true],
      [1, "Muller", "Müller", "", true],
      [1, "Acme Ltd", "Acme Ltd", "", true],
      [1, "Acme Ltd", "Acme Ltd", "", true],
      // AC-13: a line break right after a hyphen reads as nothing.
      [1, "Smithson", "Smith-son", "", true],
      [1, "Smith", "Smith", "", true],
      [1, "Jean-Luc", "Jean-Luc", "", true],
      [1, "Acme Ltd", "Acme Ltd", "", true],
    ]);
  });

  it("lists the joined edges and each spaced form unticked, and the glued ones not at all", () => {
    expect(rowsOf(found.filter(({ page }) => page === 1))).toEqual([
      [2, "Smith", "Smith", "joined", false],
      [2, "Smith", "Smith", "joined", false],
      [2, "Smithson", "Smithson", "", true],
      [2, "Smithson", "SMITHSON", "", true],
      [2, "0958", "0958", "joined", false],
      [2, "Smith", "Smith", "joined", false],
      [2, "Smith", "Smith", "", true],
      [2, "Smith-Jones", "Smith Jones", "spaced", false],
      [2, "Smith", "Smith", "joined", false],
      [2, "Smith-Jones", "SmithJones", "spaced", false],
      [2, "INV-2026-0042", "INV 2026 0042", "spaced", false],
      [2, "INV-2026-0042", "INV20260042", "spaced", false],
      [2, "McDonald", "Mc Donald", "spaced", false],
      [2, "Smith", "S M I T H", "spaced", false],
      [2, "O'Brien", "OBrien", "spaced", false],
      [2, "O'Brien", "O Brien", "spaced", false],
      [2, "J. Smith", "J Smith", "spaced", false],
      [2, "Smith", "Smith", "", true],
      [2, "Smithson", "Smith son", "spaced", false],
      [2, "Smith", "Smith", "", true],
    ]);
    // `Ann` lists nothing in `Annual planning` (AC-10).
    expect(
      rowsOf(
        found.filter(({ page }) => page === 1),
        "Ann",
      ),
    ).toEqual([]);
  });

  it("lists a vowelled form unticked with the marks note for a term typed without them (AC-32)", () => {
    expect(rowsOf(found.filter(({ page }) => page === 2))).toEqual([
      [3, marks.arabicBare, marks.arabicName, "marks", false],
      [3, marks.hebrewBare, marks.hebrewWord, "marks", false],
    ]);
  });

  it("marks a covered place and blocks the replacement text places, a term's beside a detector's", () => {
    const page = found.filter(({ page: at }) => at === 3);
    expect(
      page.map((match) => [match.kind, match.term, match.blocked, match.concealed]),
    ).toEqual([
      ["email", null, "replacement-text", null],
      ["term", "Acme Ltd", null, "covered"],
      ["term", "Smith", "replacement-text", null],
      ["term", "Ann", "replacement-text", null],
      ["term", "Jane Doe", "replacement-text", null],
      ["term", "Ann Lee", "replacement-text", null],
    ]);
  });

  it("lists a match across a page break as two parts, each with its own page's context (AC-33)", () => {
    const parts = found.filter((match) => match.termNotes.includes("page-break"));
    expect(
      parts.map(({ page, text, before, after, tickedByDefault }) => [
        page + 1,
        text,
        before,
        after,
        tickedByDefault,
      ]),
    ).toEqual([
      [5, "Acme", "re line. The rent was paid to ", "", false],
      [6, "Ltd", "", " on the first of May. The last", false],
    ]);
  });

  it("keeps a footer between the parts apart, so nothing is listed across it", () => {
    expect(
      rowsOf(
        found.filter(({ page }) => page === 5 || page === 6),
        "Acme Ltd",
      ),
    ).toEqual([[6, "Acme Ltd", "Ltd", "page-break", false]]);
  });

  it("finds the same term rows in a review search, with no detector", async () => {
    const review = await search(
      "terms.pdf",
      ["José", "Acme Ltd", "Smith", marks.arabicBare],
      "review",
    );
    expect(review.every(({ kind }) => kind === "term")).toBe(true);
    expect(rowsOf(review)).toEqual(
      rowsOf(
        found.filter(({ term }) =>
          ["José", "Acme Ltd", "Smith", marks.arabicBare].includes(term ?? ""),
        ),
      ),
    );
  });
});

describe("removing term rows (AC-21)", () => {
  const TERMS = ["José", "Muller", "Acme Ltd", "Smithson", "Jean-Luc", "Smith", "Ltd"];

  it(
    "removes every ticked row alone, passing the self check each time",
    { timeout: 240_000 },
    async () => {
      const found = await search("terms.pdf", TERMS);
      const ticked = found.filter(
        (match) => match.target !== null && match.tickedByDefault,
      );
      expect(ticked.length).toBe(20);
      for (const match of ticked) {
        const { removedByType, removedByTerm } = await redact("terms.pdf", [
          match.target!,
        ]);
        expect(removedByType).toEqual({ term: 1 });
        expect(removedByTerm).toEqual([{ term: match.term, removed: 1 }]);
      }
    },
  );

  it("removes them all together, overlaps included, and leaves every neighbour's text", async () => {
    const found = await search("terms.pdf", TERMS);
    const { output, removedByType, removedByTerm } = await redact(
      "terms.pdf",
      targetsOf(found),
    );
    // `Acme Ltd` and `Ltd` overlap: each row counts once under its own term.
    expect(removedByType).toEqual({ term: 20 });
    expect(removedByTerm).toEqual([
      { term: "José", removed: 1 },
      { term: "Muller", removed: 1 },
      { term: "Acme Ltd", removed: 4 },
      { term: "Ltd", removed: 6 },
      { term: "Smithson", removed: 3 },
      { term: "Smith", removed: 4 },
      { term: "Jean-Luc", removed: 1 },
    ]);

    const text = documentText(output);
    for (const gone of ["JOSE", "Müller", "Jean", "SMITHSON", "Acme Ltd"]) {
      expect(text).not.toContain(gone);
    }
    for (const kept of [
      "Paid to",
      "today, and Herr",
      "wrote back.",
      "signed the lease on time.",
      "The tenant is",
      "from May onwards.",
      "The landlord",
      "agreed, and",
      "witnessed it.",
      "JohnSmith signed, and SmithDate was set.",
      "Annual planning starts in May.",
      "Jones and SmithJones both came.",
    ]) {
      expect(text).toContain(kept);
    }
  });

  it("removes both parts of a match across a page break, and the rest of each page stays", async () => {
    const found = await search("terms.pdf", ["Acme Ltd"]);
    const parts = found.filter((match) => match.termNotes.includes("page-break"));
    const { output, removedByTerm } = await redact(
      "terms.pdf",
      parts.map((match) => match.target!),
    );
    expect(removedByTerm).toEqual([{ term: "Acme Ltd", removed: 2 }]);
    const text = documentText(output);
    expect(text).toContain("The rent was paid to");
    expect(text).not.toContain("The rent was paid to Acme");
    expect(text).toContain("on the first of May.");
    expect(text).not.toContain("Ltd on the first of May.");
  });

  it("removes a term inside an address with the address, each counted once", async () => {
    const found = await search("sample-agreement.pdf", ["Morgan"]);
    const rows = found.filter(
      (match) => match.term === "Morgan" || match.text.includes("morgan@"),
    );
    // A page lists its detector rows first, then its term rows.
    expect(
      rows.map(({ kind, text, tickedByDefault }) => [kind, text, tickedByDefault]),
    ).toEqual([
      ["email", "alex.morgan@example.com", true],
      ["term", "Morgan", true],
      ["term", "Morgan", true],
      ["term", "morgan", true],
    ]);
    const { removedByType, removedByTerm } = await redact(
      "sample-agreement.pdf",
      targetsOf(rows),
    );
    expect(removedByType).toEqual({ email: 1, term: 3 });
    expect(removedByTerm).toEqual([{ term: "Morgan", removed: 3 }]);
  });
});

describe("terms-dense.pdf, one group of thousands (AC-28)", () => {
  // The fixture's promise, held outside the stopwatch: the speed project times
  // this group, so it must be exactly this group, every row exact and ticked,
  // with nothing else listed beside it.
  it(
    "lists the initials 60 times a page, 3,000 exact rows in all, and nothing else",
    { timeout: 60_000 },
    async () => {
      const { term, pages, places } = TERMS_DENSE;
      const found = await search("terms-dense.pdf", [term]);
      expect(found).toHaveLength(places);
      expect(found.every((match) => match.kind === "term" && match.term === term)).toBe(
        true,
      );
      expect(found.every((match) => match.text === term)).toBe(true);
      expect(found.every((match) => match.termNotes.length === 0)).toBe(true);
      expect(found.every((match) => match.tickedByDefault && match.target !== null)).toBe(
        true,
      );
      const perPage = new Map<number, number>();
      for (const { page } of found) perPage.set(page, (perPage.get(page) ?? 0) + 1);
      expect([...perPage.values()]).toEqual(Array(pages).fill(places / pages));
    },
  );
});
