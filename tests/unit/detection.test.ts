import { readdirSync } from "node:fs";

import type { PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  containsPoint,
  EXTRACTION_OPTIONS,
  EngineFailure,
  imageReachVerdicts,
  slantedTargets,
  unsoundTargets,
  findMatchesIn,
  OFF_LINE_MIN_LINE_GLYPHS,
  OFF_LINE_SHIFT_MIN,
  OFF_LINE_SIZE_MAX,
  OFF_LINE_STRETCH_MAX,
  offLineGlyphs,
  openDocumentWith,
  POSITION_TOLERANCE,
  prepareDocument,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  SUPERSCRIPT_CODE_POINTS,
  walkCharacters,
  type Character,
  type FoundMatch,
  type Quad,
  type RedactionTarget,
} from "@/engine";

import type { DetectorKind } from "@/worker/protocol";

import {
  DETECT_BLOCKED,
  DETECT_CARD,
  DETECT_CARD_PIECES,
  DETECT_DATE,
  DETECT_DATE_FORMS,
  DETECT_DATE_FORMS_OTHERS,
  DETECT_DENSE_PAGES,
  DETECT_DENSE_PER_PAGE,
  DETECT_IBAN,
  DETECT_STAMPED,
  DETECT_EMAIL,
  DETECT_MANY_COUNT,
  DETECT_MARKERS,
  DETECT_PHONE,
  DETECT_PHONE_COLUMN,
  DETECT_PHONE_DATES,
  DETECT_PHONE_LISTED,
  DETECT_PHONE_OTHERS,
  DETECT_PHONE_SPACED,
  DETECT_UK_NINO,
  DETECT_UNICODE_EMAIL,
  DETECT_US_SSN,
  DETECT_WRAPS,
  denseRow,
  manyAddress,
  SAMPLE_AGREEMENT,
} from "../../scripts/lib/detection-fixtures.mjs";
import { fixture } from "../support/bytes";
import { inspect, LIMITS, mupdf, pageText } from "../support/mupdf";
import { SEARCH_QUAD_CAP, searchQuads } from "../support/targets";

/**
 * Detection, driven with the real MuPDF in Node. Spec 0005.
 *
 * Every fixture is opened through `openDocumentWith`, exactly as the worker
 * opens the review copy, and read with `findMatches`. Each output a test
 * redacts is read back with `tests/support/mupdf.ts`, which shares no code
 * with the engine.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

async function find(name: string, contextChars = 40): Promise<readonly FoundMatch[]> {
  const doc = await openDocumentWith(mupdf, fixture(name), LIMITS);
  try {
    return await doc.findMatches({ contextChars });
  } finally {
    doc.close();
  }
}

/**
 * A one page PDF whose text is `show`, one text showing operator in 12pt
 * Helvetica. For a shape no committed fixture has, here a run of spaces
 * inside a line, which MuPDF keeps as it is drawn.
 */
function onePage(show: string): ArrayBuffer {
  return pageDrawing(`BT /F1 12 Tf 72 700 Td ${show} ET\n`);
}

/**
 * A one page PDF whose lines are drawn piece by piece in Helvetica, each
 * piece its own text object placed where the one before ends, at its own
 * size and rise, as `detect-markers.pdf` draws a marker. A piece on a new
 * `line` starts that line, 14pt below the one before. For the guards no
 * committed fixture should carry.
 */
function piecesPage(
  parts: readonly {
    readonly text: string;
    readonly size?: number;
    readonly rise?: number;
    readonly line?: number;
  }[],
): ArrayBuffer {
  const font = new mupdf.Font("Helvetica");
  let x = 72;
  let on = 0;
  let content = "";
  for (const { text, size = 12, rise = 0, line = 0 } of parts) {
    if (line !== on) [x, on] = [72, line];
    content += `BT /F1 ${size} Tf 1 0 0 1 ${x} ${700 - 14 * line + rise} Tm (${text}) Tj ET\n`;
    for (const character of text) {
      x += font.advanceGlyph(font.encodeCharacter(character.codePointAt(0) ?? 0)) * size;
    }
  }
  return pageDrawing(content);
}

function pageDrawing(content: string): ArrayBuffer {
  const pdf = new mupdf.PDFDocument();
  try {
    const fonts = pdf.newDictionary();
    fonts.put("F1", pdf.addSimpleFont(new mupdf.Font("Helvetica")));
    const resources = pdf.newDictionary();
    resources.put("Font", fonts);
    pdf.insertPage(-1, pdf.addPage([0, 0, 612, 792], 0, resources, content));
    const buffer = pdf.saveToBuffer("");
    try {
      return buffer.asUint8Array().slice().buffer;
    } finally {
      buffer.destroy();
    }
  } finally {
    pdf.destroy();
  }
}

/**
 * Feature 12's fixtures, one per release 3 kind, and spec 0015's date forms
 * (AC-17), with what each holds as found, in reading order, and its tick, then
 * the rows of any other kind it holds (AC-3's pieces, or a date form's
 * neighbours, with their kind). The last value in each is wrapped across two
 * lines of one block.
 */
const RELEASE_3: readonly (readonly [
  DetectorKind,
  string,
  readonly (readonly (string | boolean)[])[],
  readonly (readonly (string | boolean)[])[],
])[] = [
  ["date", "detect-date.pdf", DETECT_DATE, []],
  ["card", "detect-card.pdf", DETECT_CARD, DETECT_CARD_PIECES],
  ["iban", "detect-iban.pdf", DETECT_IBAN, []],
  ["us-ssn", "detect-us-ssn.pdf", DETECT_US_SSN, []],
  ["uk-nino", "detect-uk-nino.pdf", DETECT_UK_NINO, []],
  ["date", "detect-date-forms.pdf", DETECT_DATE_FORMS, DETECT_DATE_FORMS_OTHERS],
];

const RELEASE_3_FIXTURES = RELEASE_3.map(([, name]) => name);

function targetsOf(matches: readonly FoundMatch[]): RedactionTarget[] {
  return matches.flatMap((match) => (match.target ? [match.target] : []));
}

/**
 * AC-9's recorded limit, in `detect-blocked.pdf`: listed unblocked, because
 * nothing MuPDF.js 1.28.1 reports tells them apart, and refused by the self
 * check with `replacement-text` when ticked. Pinned below, and left out of the
 * runs that must pass.
 */
const RECORDED_LIMIT: ReadonlySet<string> = new Set([
  DETECT_BLOCKED.wide,
  DETECT_BLOCKED.unequal.found,
]);

function removable(matches: readonly FoundMatch[]): RedactionTarget[] {
  return targetsOf(matches).filter((target) => !RECORDED_LIMIT.has(target.text));
}

/** A page's text with whitespace removed, so a wrapped value reads as one. */
function packedText(bytes: ArrayBuffer, page: number): string {
  return inspect(bytes, (doc) => pageText(doc, page)).replace(/\s/gu, "");
}

function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Redact `targets` from `name` and prove each is gone: on its page, the
 * output holds one occurrence fewer of its text than the source did, for each
 * time a target's text holds it. A target holds its own text once, and a
 * longer target may hold it too: spec 0014's rescued `0123` sits inside
 * `(212) 555-0123` on the same page, and both go. The engine's own self check
 * has also passed, or the run would have thrown.
 */
async function expectRemoved(name: string, targets: readonly RedactionTarget[]) {
  const source = fixture(name);
  const { output } = await redactDocumentWith(mupdf, source, targets);

  for (const target of targets) {
    const text = target.text.replace(/\s/gu, "");
    const named = targets
      .filter((other) => other.page === target.page)
      .reduce(
        (held, other) => held + occurrences(other.text.replace(/\s/gu, ""), text),
        0,
      );
    expect(occurrences(packedText(output, target.page), text), text).toBe(
      occurrences(packedText(source, target.page), text) - named,
    );
  }
  return output;
}

/** The quads `page.search()` gives for `needle` on a prepared review page. */
function searched(name: string, page: number, needle: string): Quad[][] {
  const doc = mupdf.Document.openDocument(fixture(name), "application/pdf");
  const pdf: PDFDocument | null = doc.asPDF();
  if (!pdf) throw new Error("expected a PDF");
  try {
    prepareDocument(mupdf, pdf);
    const loaded = pdf.loadPage(page);
    const stext = loaded.toStructuredText(EXTRACTION_OPTIONS[0]);
    try {
      return searchQuads(stext, needle);
    } finally {
      stext.destroy();
      loaded.destroy();
    }
  } finally {
    doc.destroy();
  }
}

function expectSameQuads(actual: readonly Quad[], expected: readonly Quad[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((quad, index) => {
    quad.forEach((corner, at) => {
      expect(Math.abs(corner - expected[index][at])).toBeLessThanOrEqual(
        POSITION_TOLERANCE,
      );
    });
  });
}

describe("email addresses (AC-1, AC-3)", () => {
  it("finds every address, by page, then in reading order", async () => {
    const found = await find("detect-email.pdf");

    expect(found.map((match) => [match.page, match.text])).toEqual([
      ...DETECT_EMAIL.running.map((text) => [0, text]),
      ...DETECT_EMAIL.scripts.map((text) => [1, text]),
      [1, DETECT_EMAIL.reversed],
      ...DETECT_EMAIL.columns.map((text) => [2, text]),
    ]);
  });

  it("lists every address as an email, ticked, with a target that names it", async () => {
    const found = await find("detect-email.pdf");

    for (const match of found) {
      expect(match).toMatchObject({
        kind: "email",
        tickedByDefault: true,
        blocked: null,
      });
      expect(match.target).toMatchObject({ page: match.page, kind: "email" });
    }
  });

  /**
   * AC-6: the target's `text` is the raw characters, which is what the engine
   * compares; the display text is NFKC. The two differ only where NFKC does.
   */
  it("keeps the raw characters for the target and the normalised ones for display", async () => {
    const found = await find("detect-email.pdf");
    const fullwidth = found.find((match) => match.text === "info@example.com");

    expect(fullwidth?.target?.text).toBe("info＠example.com");
    for (const match of found.filter((other) => other !== fullwidth)) {
      expect(match.target?.text).toBe(match.text);
    }
  });

  it("finds nothing on a page without a text layer, and does not read it (AC-12)", async () => {
    const found = await find("two-pages.pdf");

    expect(found.map((match) => [match.page, match.text])).toEqual([
      [0, "contact@example.com"],
    ]);
  });
});

/** AC-5 and INV-6. */
describe("context", () => {
  it("carries up to contextChars code points either side, whitespace collapsed", async () => {
    const [first, second] = await find("detect-email.pdf", 20);

    expect(first).toMatchObject({ before: "Contact: ", after: " for the report. Wri" });
    // The context runs across the line break, joined by one space.
    expect(second).toMatchObject({
      before: "he report. Write to ",
      after: " again, or to sales@",
    });
  });

  it("gives empty strings when contextChars is 0", async () => {
    for (const match of await find("detect-email.pdf", 0)) {
      expect(match.before).toBe("");
      expect(match.after).toBe("");
    }
  });

  it("never takes context from another page", async () => {
    const found = await find("detect-email.pdf", 200);
    const greek = found.find((match) => match.page === 1);

    expect(greek?.before).toBe("Ελλάδα: ");
  });

  it("never carries more than contextChars code points", async () => {
    for (const match of await find("detect-email.pdf", 7)) {
      expect(Array.from(match.before).length).toBeLessThanOrEqual(7);
      expect(Array.from(match.after).length).toBeLessThanOrEqual(7);
    }
  });

  /**
   * Spec 0007, AC-9. Each side says whether the page went on past it, so the
   * row shows "…" only where something was left out.
   */
  it("says a side was cut only when the page text goes on past it", async () => {
    const [first, second] = await find("detect-email.pdf", 20);

    // The page's first words, so nothing was left out before it.
    expect(first).toMatchObject({
      before: "Contact: ",
      beforeCut: false,
      afterCut: true,
    });
    // Mid page: both sides stop short of the page's text.
    expect(second).toMatchObject({ beforeCut: true, afterCut: true });
  });

  /**
   * AC-9's two comparisons at their edge, the one place `> 0` and `>= 0`, or
   * `<` and `<=`, part: a side holding exactly the reach is whole, and a side
   * with one code point more is cut. The first match opens its page after
   * "Contact: " (9 code points); the last on the first page is followed by the
   * page's closing words.
   */
  it("cuts a side only when the page holds a code point past the reach", async () => {
    const first = async (contextChars: number) =>
      (await find("detect-email.pdf", contextChars))[0];
    expect(await first(9)).toMatchObject({ before: "Contact: ", beforeCut: false });
    expect(await first(8)).toMatchObject({ before: "ontact: ", beforeCut: true });

    const tail =
      " today Nothing here: user at example dot com Keep this sentence exactly as it is";
    const reach = Array.from(tail).length;
    const last = async (contextChars: number) =>
      (await find("detect-email.pdf", contextChars)).find(
        (match) => match.page === 0 && match.text === "josé.müller@exämple.de",
      );
    expect(await last(reach)).toMatchObject({ after: tail, afterCut: false });
    expect(await last(reach - 1)).toMatchObject({
      after: tail.slice(0, -1),
      afterCut: true,
    });
  });

  /**
   * The flags count in the collapsed text, as the strings do: four spaces
   * either side of the address are one code point of context each, so a reach
   * of 6 holds "Mail: " whole where the raw text would have counted it cut.
   */
  it("counts a run of whitespace as the one space it shows when judging a cut", async () => {
    const doc = await openDocumentWith(
      mupdf,
      onePage("(Mail:    jane@example.com    today) Tj"),
      LIMITS,
    );
    const at = async (contextChars: number) => {
      const [match] = await doc.findMatches({ contextChars });
      return match;
    };
    try {
      expect(await at(6)).toMatchObject({
        before: "Mail: ",
        after: " today",
        beforeCut: false,
        afterCut: false,
      });
      expect(await at(5)).toMatchObject({
        before: "ail: ",
        after: " toda",
        beforeCut: true,
        afterCut: true,
      });
    } finally {
      doc.close();
    }
  });

  it("never says a side was cut when its context stopped short of the reach", async () => {
    const found = await find("detect-email.pdf", 200);

    expect(found.length).toBeGreaterThan(0);
    for (const match of found) {
      if (Array.from(match.before).length < 200) expect(match.beforeCut).toBe(false);
      if (Array.from(match.after).length < 200) expect(match.afterCut).toBe(false);
    }
    // The last match on a page reaches its end.
    expect(found.some((match) => !match.afterCut)).toBe(true);
  });

  /**
   * Spec 0007, AC-9: the reader with replacement text ignored sets them too, so
   * a match found only that way shows "…" by the same rule as any other row.
   * `hidden@…` sits mid page, between the replaced line and the plain one.
   */
  it("says a side was cut for a match found only with replacement text ignored", async () => {
    const hidden = async (contextChars: number) =>
      (await find("detect-blocked.pdf", contextChars)).find(
        (match) => match.text === DETECT_BLOCKED.hidden,
      );

    expect(await hidden(3)).toMatchObject({
      blocked: "replacement-text",
      beforeCut: true,
      afterCut: true,
    });
    // A reach wider than the page's text runs out before anything is cut.
    expect(await hidden(200)).toMatchObject({ beforeCut: false, afterCut: false });
  });
});

/** AC-7: the same geometry `page.search()` gives, on left to right text. */
describe("quads", () => {
  it.each([
    [0, "jane.doe@example.com"],
    [0, "sales@example.org"],
    [0, "support@example.net"],
    [0, "josé.müller@exämple.de"],
    [1, "δοκιμή@παράδειγμα.ελ"],
    [1, "пример@почта.рф"],
    [2, "left@example.com"],
    [2, "right@example.org"],
  ])("equal search()'s on page %i for %s", async (page, needle) => {
    const found = (await find("detect-email.pdf")).filter(
      (match) => match.page === page && match.text === needle,
    );
    const hits = searched("detect-email.pdf", page, needle);

    expect(found).toHaveLength(hits.length);
    found.forEach((match, index) =>
      expectSameQuads(match.target?.quads ?? [], hits[index]),
    );
  });

  it.each([
    "+44 20 7946 0958",
    "(212) 555-0123",
    "1-800-555-0199",
    "00 44 20 7946 0012",
    "(212) 123 4567",
    // Side by side (AC-27): in the middle of a spaced run, in a comma list,
    // after a time, and after a ZIP+4.
    DETECT_PHONE_SPACED[1],
    DETECT_PHONE_LISTED[1],
    "020 7946 0400",
    "(212) 555-0142",
  ])("equal search()'s for the phone number %s", async (needle) => {
    const [match] = (await find("detect-phone.pdf")).filter(
      (each) => each.text === needle,
    );
    const [hit] = searched("detect-phone.pdf", 0, needle);

    expectSameQuads(match.target?.quads ?? [], hit);
  });

  it("gives a value wrapped across two lines one quad per line (AC-4)", async () => {
    const wrapped = (await find("detect-phone.pdf")).find(
      (match) => match.text === "020 7946 0777",
    );

    expect(wrapped?.target?.quads).toHaveLength(2);
    expect(wrapped?.target?.text).toBe("020 7946 0777");
  });

  /**
   * Text drawn against its extraction order: each Hebrew glyph placed left of
   * the one before. Proved by redacting cleanly (AC-6), not against search().
   */
  it("covers a match drawn right to left from its leftmost to its rightmost glyph", async () => {
    const reversed = (await find("detect-email.pdf")).find(
      (match) => match.text === DETECT_EMAIL.reversed,
    );
    const [quad] = reversed?.target?.quads ?? [];

    expect(quad[0]).toBeCloseTo(284.8, 1);
    expect(quad[2]).toBeCloseTo(400, 1);
  });
});

/** AC-6, INV-2 and INV-3: every row that can be ticked is one the engine accepts. */
describe("every unblocked match redacts", () => {
  it.each([
    "detect-email.pdf",
    "detect-phone.pdf",
    "detect-unicode.pdf",
    "detect-blocked.pdf",
    ...RELEASE_3_FIXTURES,
  ])(
    "in %s, each alone, but for the recorded limit",
    async (name) => {
      const targets = removable(await find(name));
      expect(targets.length).toBeGreaterThan(0);
      for (const target of targets) {
        await expectRemoved(name, [target]);
      }
    },
    60_000,
  );

  it.each([
    "detect-email.pdf",
    "detect-phone.pdf",
    "detect-unicode.pdf",
    "detect-blocked.pdf",
    ...RELEASE_3_FIXTURES,
  ])(
    "in %s, all together, but for the recorded limit",
    async (name) => {
      await expectRemoved(name, removable(await find(name)));
    },
    60_000,
  );

  it("leaves an unticked neighbour where it was", async () => {
    const found = await find("detect-email.pdf");
    const sales = found.find((match) => match.text === "sales@example.org");
    const output = await expectRemoved("detect-email.pdf", targetsOf(found.slice(0, 2)));

    expect(packedText(output, 0)).toContain(sales?.text);
  });
});

/** AC-25 and INV-11: detection walks characters, so no hit cap can drop a match. */
describe("a page with more matches than search() returns", () => {
  it("is exactly what the cap would cut short", () => {
    expect(() => searched("detect-many.pdf", 0, "@ex.io")).toThrow(/cut short/);
    expect(SEARCH_QUAD_CAP).toBe(500);
  });

  it("gives all 600 matches, every one unblocked", async () => {
    const found = await find("detect-many.pdf");

    expect(found).toHaveLength(DETECT_MANY_COUNT);
    expect(found.map((match) => match.text)).toEqual(
      Array.from({ length: DETECT_MANY_COUNT }, (_, index) => manyAddress(index)),
    );
    expect(found.every((match) => match.blocked === null)).toBe(true);
  });

  it("redacts all 600", async () => {
    const found = await find("detect-many.pdf");
    const { output } = await redactDocumentWith(
      mupdf,
      fixture("detect-many.pdf"),
      targetsOf(found),
    );

    expect(packedText(output, 0)).not.toContain("@ex.io");
  }, 120_000);
});

/**
 * Spec 0007, AC-14. The refusal a tick causes, as the flow's browser suite
 * reaches it: both addresses listed and tickable, a run over both refused for
 * the stamp, and a run over the clear one alone clean.
 */
describe("an address under a stamp", () => {
  it("is listed tickable, and refused in a run, while the one clear of it redacts", async () => {
    const found = await find("detect-stamped.pdf");
    expect(found.map((match) => match.text)).toEqual([
      DETECT_STAMPED.stamped,
      DETECT_STAMPED.clear,
    ]);
    expect(found.every((match) => match.blocked === null && match.tickedByDefault)).toBe(
      true,
    );

    await expect(
      redactDocumentWith(mupdf, fixture("detect-stamped.pdf"), targetsOf(found)),
    ).rejects.toEqual(new EngineFailure("redaction-overreach"));

    const clear = found.filter((match) => match.text === DETECT_STAMPED.clear);
    const { output } = await redactDocumentWith(
      mupdf,
      fixture("detect-stamped.pdf"),
      targetsOf(clear),
    );
    expect(packedText(output, 0)).not.toContain(DETECT_STAMPED.clear);
    expect(packedText(output, 0)).toContain(DETECT_STAMPED.stamped);
  }, 60_000);
});

/**
 * Spec 0007, task 13. The dense document the checklist is measured against
 * holds exactly what the measure assumes: every row's address and number,
 * each tickable and ticked by default.
 */
describe("the dense staff directory", () => {
  it("lists every address and number, in page and reading order, none blocked", async () => {
    const found = await find("detect-dense.pdf");
    const rows = DETECT_DENSE_PAGES * DETECT_DENSE_PER_PAGE;

    expect(found).toHaveLength(rows * 2);
    expect(found.map((match) => match.text)).toEqual(
      Array.from({ length: rows }, (_, index) => {
        const { email, phone } = denseRow(index);
        return [email, phone];
      }).flat(),
    );
    expect(found.every((match) => match.blocked === null && match.tickedByDefault)).toBe(
      true,
    );
  }, 120_000);
});

/** AC-26 and INV-12: no character is lost or changed between the page and a match. */
describe("code points above U+FFFF", () => {
  /**
   * The pin. MuPDF.js 1.28.1's walker cuts each character to its low 16 bits.
   * When this fails, a release walks whole code points and the repair in
   * `walkCharacters` can go.
   */
  it("still come back cut from MuPDF.js's own walker", () => {
    const walked = inspect(fixture("detect-unicode.pdf"), (doc) => {
      const page = doc.loadPage(0);
      const stext = page.toStructuredText("");
      const codes: number[] = [];
      try {
        stext.walk({ onChar: (text) => codes.push(text.codePointAt(0) ?? 0) });
      } finally {
        stext.destroy();
        page.destroy();
      }
      return codes;
    });

    expect(walked).toContain(0x0bb7);
    expect(walked).toContain(0xd800);
    expect(walked).not.toContain(0x20bb7);
  });

  it("come back whole from the engine's reader", () => {
    const codes: number[] = [];
    inspect(fixture("detect-unicode.pdf"), (doc) => {
      const page = doc.loadPage(0);
      try {
        walkCharacters(page, EXTRACTION_OPTIONS[0], (character) =>
          codes.push(character.code),
        );
      } finally {
        page.destroy();
      }
    });

    expect(codes).toContain(0x20bb7);
    expect(codes).toContain(0x2d800);
    expect(codes).not.toContain(0x0bb7);
    expect(codes).not.toContain(0xd800);
  });

  it("are found whole in the match, and redact through the self check", async () => {
    const [match] = await find("detect-unicode.pdf");

    expect(match.text).toBe(DETECT_UNICODE_EMAIL);
    expect(match.target?.text).toBe(DETECT_UNICODE_EMAIL);
    expect(match.blocked).toBeNull();

    const output = await expectRemoved("detect-unicode.pdf", targetsOf([match]));
    expect(packedText(output, 0)).not.toContain("tanaka");
  });
});

describe("phone numbers (AC-2, AC-10)", () => {
  it("finds every number with the tick its rule gives, and no look alike", async () => {
    const found = (await find("detect-phone.pdf")).filter(
      (match) => match.kind === "phone",
    );

    expect(found.map((match) => [match.text, match.tickedByDefault])).toEqual(
      DETECT_PHONE.map(([text, ticked]) => [text, ticked]),
    );
    expect(found.every((match) => match.blocked === null)).toBe(true);
  });

  /** Spec 0014: the card before a UK number, the only other kind on the page. */
  it("lists the card beside a number and nothing else", async () => {
    const others = (await find("detect-phone.pdf")).filter(
      (match) => match.kind !== "phone" && match.kind !== "date",
    );

    expect(
      others.map((match) => [match.kind, match.text, match.tickedByDefault]),
    ).toEqual(DETECT_PHONE_OTHERS.map((row) => [...row]));
  });

  /** INV-14: the look alike dates are left for `date`, never read as phone numbers. */
  it("lists the fixture's numeric dates as dates", async () => {
    const dates = (await find("detect-phone.pdf")).filter(
      (match) => match.kind === "date",
    );

    expect(dates.map((match) => [match.text, match.tickedByDefault])).toEqual(
      DETECT_PHONE_DATES.map(([text, ticked]) => [text, ticked]),
    );
  });

  /** AC-27 and INV-13: numbers side by side, each on its own, none holding a neighbour. */
  it("gives each number in a column one quad on its own line", async () => {
    const found = await find("detect-phone.pdf");
    const column = DETECT_PHONE_COLUMN.map((number) =>
      found.find((match) => match.text === number),
    );

    const lines = column.map((match) => {
      expect(match?.target?.quads).toHaveLength(1);
      const [quad] = match?.target?.quads ?? [];
      return quad[1];
    });
    expect(new Set(lines).size).toBe(DETECT_PHONE_COLUMN.length);
  });

  it("gives numbers on one line quads that do not overlap", async () => {
    const found = await find("detect-phone.pdf");

    for (const numbers of [DETECT_PHONE_SPACED, DETECT_PHONE_LISTED]) {
      const quads = numbers.map((number) => {
        const [quad] = found.find((match) => match.text === number)?.target?.quads ?? [];
        return quad;
      });
      quads.slice(1).forEach((quad, index) => {
        // Each number's left edge sits right of its neighbour's right edge.
        expect(quad[0]).toBeGreaterThan(quads[index][2]);
      });
    }
  });
});

/**
 * Feature 12: the release 3 kinds (AC-19 to AC-23, AC-10), through the real
 * MuPDF. Each fixture lists exactly its values with their ticks, none of its
 * near misses, and nothing of any other kind but the pieces AC-3 keeps. The
 * every unblocked match redacts runs above take each fixture too, its pieces
 * included (AC-6).
 */
describe.each(RELEASE_3)("the %s detector on %s", (kind, name, expected, others) => {
  it("finds every value with its tick, no near miss, and no other row but its pieces", async () => {
    const found = await find(name);

    expect(
      found
        .filter((match) => match.kind === kind)
        .map((match) => [match.text, match.tickedByDefault]),
    ).toEqual(expected.map(([text, ticked]) => [text, ticked]));
    expect(
      found
        .filter((match) => match.kind !== kind)
        .map((match) => [match.kind, match.text, match.tickedByDefault]),
    ).toEqual(others);
    expect(found.every((match) => match.blocked === null)).toBe(true);
  });

  it("gives the value wrapped across two lines one quad per line (AC-4)", async () => {
    const text = String(expected[expected.length - 1][0]);
    const wrapped = (await find(name)).at(-1);

    expect(wrapped?.text).toBe(text);
    expect(wrapped?.target?.text).toBe(text);
    const quads = wrapped?.target?.quads ?? [];
    expect(quads).toHaveLength(2);
    expect(quads[1][1]).not.toBeCloseTo(quads[0][1], 0);
  });

  it("gives the first value search()'s quads (AC-7)", async () => {
    const needle = String(expected[0][0]);
    const [match] = await find(name);
    const [hit] = searched(name, 0, needle);

    expectSameQuads(match.target?.quads ?? [], hit);
  });
});

/**
 * Spec 0005, AC-28 and AC-3: cards beside other digits in `detect-card.pdf`.
 * Each card on one line, and the Social Security piece a chance card leaves,
 * has its own quads, and a run that removes every row leaves each expiry and
 * both references a card is never cut from.
 */
describe("cards beside other digits (AC-28)", () => {
  it.each([
    ...DETECT_CARD.slice(0, -1).map(([text]) => String(text)),
    ...DETECT_CARD_PIECES.map(([, text]) => String(text)),
  ])("give %s search()'s quads (AC-7)", async (needle) => {
    const [match] = (await find("detect-card.pdf")).filter(
      (each) => each.text === needle,
    );
    const [hit] = searched("detect-card.pdf", 0, needle);

    expectSameQuads(match.target?.quads ?? [], hit);
  });

  it("leave each expiry and both references in the redacted page", async () => {
    const found = await find("detect-card.pdf");
    const output = await expectRemoved("detect-card.pdf", removable(found));
    const text = inspect(output, (doc) => pageText(doc, 0));

    // Mastercard, Amex, Diners, UnionPay and the Visa typed against its expiry.
    expect(occurrences(text, "12/28")).toBe(5);
    expect(text).toContain("411111111111111112");
    expect(text).toContain("4111-1111-1111-1111-12");
  });
});

/**
 * Spec 0005, AC-19, AC-21, AC-23, AC-28 and INV-17 (update of 2026-10-10,
 * and the second update the same day, which made the date's boundary rule
 * general): the rows the reviews found missing, through the real MuPDF. Each
 * new row has search()'s quads, the card's included above, and a run removing
 * every row removes the whole card a chance window overlaps, while each time,
 * offset and zone name, the word or label beside a date, the first day of a
 * range before a numeric date, the glued footnote marker, currency code and
 * words, and the first half of a range across months stay in the file. The
 * fixtures' own tests above hold that no new line gives a phone row.
 */
describe("the review's silent misses (AC-19, AC-21, AC-23, AC-28)", () => {
  it.each([
    ["detect-date.pdf", "01/05/2026"],
    ["detect-date.pdf", "31/05/2026"],
    ["detect-date.pdf", "3-5 June 2026"],
    ["detect-date.pdf", "3 June 2026"],
    ["detect-date.pdf", "2026-09-01"],
    ["detect-date.pdf", "2026-09-30"],
    ["detect-date.pdf", "1980-05-12"],
    ["detect-date.pdf", "27/09/2026"],
    ["detect-date.pdf", "28/09/2026"],
    ["detect-date.pdf", "12/05/1980"],
    ["detect-date.pdf", "14.02.1991"],
    ["detect-date.pdf", "June 5 - 7, 2026"],
    ["detect-date.pdf", "7/6/2026"],
    ["detect-date.pdf", "2026-10-05"],
    ["detect-date.pdf", "2026-10-06"],
    ["detect-date.pdf", "03.11.2026"],
    ["detect-iban.pdf", "IE29 AIBK 9311 5212 3456 78"],
    ["detect-iban.pdf", "ES9121000418450200051332"],
    ["detect-uk-nino.pdf", "KL123456B"],
  ])("give %s's %s search()'s quads (AC-7)", async (name, needle) => {
    const found = (await find(name)).filter((each) => each.text === needle);
    const hits = searched(name, 0, needle);

    expect(found).toHaveLength(1);
    expect(hits).toHaveLength(1);
    expectSameQuads(found[0].target?.quads ?? [], hits[0]);
  });

  it.each<[string, readonly string[], readonly string[]]>([
    ["detect-card.pdf", [], ["2223"]],
    [
      "detect-date.pdf",
      [
        "28 May",
        "T23:59:59Z",
        "T00:00:00Z",
        "10:00",
        "11:00",
        "Smith",
        "D.O.B.",
        "5-",
        "T10:00:00+0100",
        "T09:00:00EST",
        "a in the margin",
      ],
      [],
    ],
    ["detect-iban.pdf", ["1 above", "EUR"], []],
    ["detect-uk-nino.pdf", ["signed"], []],
  ])(
    "leave in %s what no row holds",
    async (name, kept, gone) => {
      const output = await expectRemoved(name, removable(await find(name)));
      const text = inspect(output, (doc) => pageText(doc, 0));

      for (const fragment of kept) expect(text).toContain(fragment);
      for (const fragment of gone) expect(text).not.toContain(fragment);
    },
    60_000,
  );
});

/**
 * Spec 0005, AC-19, AC-20, AC-22, AC-10 and INV-17 (third update of
 * 2026-10-11): a footnote marker glued after a date of birth, an ISO date, a
 * card and a Social Security number, each drawn as a plain `1`, and a date
 * label glued to a date, through the real MuPDF. Each new row has search()'s
 * quads, and a run removing every row leaves each marker and each glued label
 * in the file. The fixtures' own tests above hold each row's tick and that no
 * new line gives a phone row, and the runs that redact every unblocked match
 * take each new row alone and together.
 */
describe("the third review's footnote markers and glued labels (AC-19, AC-20, AC-22)", () => {
  it.each([
    ["detect-date.pdf", "12/05/1981"],
    ["detect-date.pdf", "31.12.2027"],
    ["detect-date.pdf", "27/09/2027"],
    ["detect-date.pdf", "2027-09-28"],
    ["detect-card.pdf", "5425 2334 3010 9903"],
    ["detect-us-ssn.pdf", "178-05-1123"],
  ])("give %s's %s search()'s quads (AC-7)", async (name, needle) => {
    const found = (await find(name)).filter((each) => each.text === needle);
    const hits = searched(name, 0, needle);

    expect(found).toHaveLength(1);
    expect(hits).toHaveLength(1);
    expectSameQuads(found[0].target?.quads ?? [], hits[0]);
  });

  it.each<[string, readonly string[]]>([
    ["detect-date.pdf", ["1 per", "Exp.", "Issued", "1 later"]],
    ["detect-card.pdf", ["1 in the notes"]],
    ["detect-us-ssn.pdf", ["1 on the form"]],
  ])(
    "leave in %s each marker and glued label",
    async (name, kept) => {
      const output = await expectRemoved(name, removable(await find(name)));
      const text = inspect(output, (doc) => pageText(doc, 0));

      for (const fragment of kept) expect(text).toContain(fragment);
    },
    60_000,
  );
});

/** A page's characters as the find step reads them, from a prepared page. */
function characters(bytes: ArrayBuffer, page: number, prepared = true): Character[] {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf: PDFDocument | null = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF");
    if (prepared) prepareDocument(mupdf, pdf);
    const loaded = pdf.loadPage(page);
    const read: Character[] = [];
    try {
      walkCharacters(loaded, EXTRACTION_OPTIONS[0], (character) => read.push(character));
    } finally {
      loaded.destroy();
    }
    return read;
  } finally {
    doc.destroy();
  }
}

/** The centre of a quad, as the find step and the self check take it. */
function centreOf([ulx, uly, urx, ury, llx, lly, lrx, lry]: Quad): [number, number] {
  return [(ulx + urx + llx + lrx) / 4, (uly + ury + lly + lry) / 4];
}

/**
 * Spec 0014, AC-4 to AC-6 and AC-8: a glyph off its line, by geometry or by
 * code point, is not part of the text a detector reads. `detect-markers.pdf`
 * draws a real raised marker after a value of every kind, as a word processor
 * draws one, so the premise that MuPDF reads it glued to the value is held on
 * a real glyph through the engine, not on NFKC text alone. An engine upgrade
 * that reads raised glyphs another way fails here.
 */
describe("glyphs off their line (spec 0014, AC-4 to AC-6)", () => {
  it("lists every marked value without its marker, with its kind's tick", async () => {
    const found = await find("detect-markers.pdf");

    expect(found.map((match) => [match.kind, match.text, match.tickedByDefault])).toEqual(
      DETECT_MARKERS.map(([kind, text, ticked]) => [kind, text, ticked]),
    );
    expect(found.every((match) => match.blocked === null)).toBe(true);
  });

  it("starts the text after each value past its marker, never at it", async () => {
    const found = await find("detect-markers.pdf");

    found.forEach((match, at) => {
      const begins = String(DETECT_MARKERS[at][3]);
      expect(match.after.slice(0, begins.length), match.text).toBe(begins);
    });
  });

  it("gives no target a quad holding an off line glyph's centre", async () => {
    const found = await find("detect-markers.pdf");
    const read = characters(fixture("detect-markers.pdf"), 0);
    const off = offLineGlyphs(read);
    const markers = read.filter((_, at) => off[at] === 1);

    // Thirteen markers after values, two pairs of raised letters, a two glyph
    // marker and the six single markers drawn other ways.
    expect(markers).toHaveLength(25);
    for (const quad of found.flatMap((match) => match.target?.quads ?? [])) {
      for (const marker of markers) {
        expect(containsPoint(quad, centreOf(marker.quad))).toBe(false);
      }
    }
  });

  /** AC-7: a quad over `27ᵗʰ` would hold the raised letters, so it is parted. */
  it("parts an ordinal's row into one quad either side of its raised letters", async () => {
    const found = await find("detect-markers.pdf");
    const ordinals = found.filter(({ text }) => / of May | September /u.test(text));

    expect(ordinals.map(({ text }) => text)).toEqual([
      "27 September 2026",
      "1 of May 2026",
    ]);
    for (const ordinal of ordinals) expect(ordinal.target?.quads).toHaveLength(2);
  });

  /**
   * INV-4: a whole value drawn small and raised, after a space, is glued to no
   * kept glyph, so it stays in the text and is still listed, though every
   * digit of it is off its line.
   */
  it("keeps a spaced number drawn small and raised in the text", async () => {
    const bytes = piecesPage([
      { text: "Call the office on " },
      { text: "020 7946 0958", size: 8, rise: 5 },
      { text: " today please" },
    ]);
    const off = offLineGlyphs(characters(bytes, 0));

    expect(off.filter((each) => each === 1)).toHaveLength(11);
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    try {
      const found = await doc.findMatches({ contextChars: 40 });
      expect(
        found.map((match) => [match.kind, match.text, match.tickedByDefault]),
      ).toEqual([["phone", "020 7946 0958", true]]);
    } finally {
      doc.close();
    }
  });

  /** INV-4: a glued run of more than `OFF_LINE_STRETCH_MAX` glyphs is text. */
  it.each([
    ["ABCDE", " refABCDE end"],
    ["ABCD", " ref end"],
  ])(
    "keeps a glued run of %s in the text only past four glyphs",
    async (raised, after) => {
      const bytes = piecesPage([
        { text: "Tel 020 7946 0958 ref" },
        { text: raised, size: 8, rise: 5 },
        { text: " end" },
      ]);
      const doc = await openDocumentWith(mupdf, bytes, LIMITS);
      try {
        const [match] = await doc.findMatches({ contextChars: 40 });
        expect(match).toMatchObject({ text: "020 7946 0958", after });
      } finally {
        doc.close();
      }
    },
  );

  /**
   * AC-4: a marker glued on both sides leaves one synthetic space, so the word
   * after it cannot glue on to the value in its place. With no space the
   * email address would read `john@example.comtoday`.
   */
  it("stands one space where a marker glued on both sides leaves", async () => {
    const bytes = piecesPage([
      { text: "Mail john@example.com" },
      { text: "1", size: 8, rise: 5 },
      { text: "today please" },
    ]);
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    try {
      const found = await doc.findMatches({ contextChars: 40 });
      expect(
        found.map((match) => [match.kind, match.text, match.after.slice(0, 7)]),
      ).toEqual([["email", "john@example.com", " today "]]);
    } finally {
      doc.close();
    }
  });

  /** AC-4: a marker that closes its line leaves the line join, and no space of its own. */
  it("leaves only the line join where a marker closes its line", async () => {
    const bytes = piecesPage([
      { text: "Tel 020 7946 0958" },
      { text: "1", size: 8, rise: 5 },
      { text: "today please", line: 1 },
    ]);
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    try {
      const found = await doc.findMatches({ contextChars: 40 });
      expect(
        found.map((match) => [match.kind, match.text, match.after.slice(0, 7)]),
      ).toEqual([["phone", "020 7946 0958", " today "]]);
    } finally {
      doc.close();
    }
  });

  /** AC-4 and AC-8: the boundary meets nothing on any other page this suite reads. */
  it("finds no glyph off its line in any other committed fixture", () => {
    const names = readdirSync(new URL("../fixtures/", import.meta.url)).filter(
      (name) => name.endsWith(".pdf") && name !== "detect-markers.pdf",
    );

    expect(names.length).toBeGreaterThan(70);
    for (const name of names) {
      const bytes = fixture(name);
      const pages = inspect(bytes, (doc) => doc.countPages());
      for (let page = 0; page < pages; page += 1) {
        const off = offLineGlyphs(characters(bytes, page, false));
        expect(off.includes(1), `${name}, page ${page + 1}`).toBe(false);
      }
    }
  }, 60_000);

  it("sets the boundary's constants as measured", () => {
    expect([
      OFF_LINE_SIZE_MAX,
      OFF_LINE_SHIFT_MIN,
      OFF_LINE_STRETCH_MAX,
      OFF_LINE_MIN_LINE_GLYPHS,
    ]).toEqual([0.9, 0.15, 4, 3]);
  });

  /** AC-5: every code point the set holds would otherwise read as a letter or digit. */
  it("holds only code points NFKC folds to one letter or digit", () => {
    for (const code of SUPERSCRIPT_CODE_POINTS) {
      expect(String.fromCodePoint(code).normalize("NFKC"), code.toString(16)).toMatch(
        /^[\p{L}\p{Nd}]$/u,
      );
    }
    expect(SUPERSCRIPT_CODE_POINTS.size).toBe(114);
    expect(SUPERSCRIPT_CODE_POINTS.has(0xb9)).toBe(true);
    expect(SUPERSCRIPT_CODE_POINTS.has(0x1d57)).toBe(true);
  });
});

/**
 * One line of hand built glyphs, laid along `direction` from (72, 700): each
 * glyph `size` tall and half as wide, its origin `rise` up off the line's
 * baseline. y runs down the page, as MuPDF's does, so up the glyph is the
 * direction turned a quarter turn back.
 */
function glyphLine(
  parts: readonly {
    readonly text: string;
    readonly size?: number;
    readonly rise?: number;
  }[],
  {
    direction = [1, 0],
    line = 0,
  }: { readonly direction?: readonly [number, number]; readonly line?: number } = {},
): Character[] {
  const [ux, uy] = direction;
  const [upX, upY] = [uy, -ux];
  const glyphs: Character[] = [];
  let along = 0;
  for (const { text, size = 10, rise = 0 } of parts) {
    for (const glyph of text) {
      const width = size / 2;
      const [ox, oy] = [72 + ux * along + upX * rise, 700 + uy * along + upY * rise];
      const [ex, ey] = [ox + ux * width, oy + uy * width];
      glyphs.push({
        code: glyph.codePointAt(0) ?? 0,
        origin: [ox, oy],
        quad: [
          ox + upX * size,
          oy + upY * size,
          ex + upX * size,
          ey + upY * size,
          ox,
          oy,
          ex,
          ey,
        ],
        angle: Math.atan2(uy, ux),
        direction,
        block: 0,
        line,
      });
      along += width;
    }
  }
  return glyphs;
}

/**
 * Spec 0014, AC-4 and AC-5, glyph by glyph: `offLineGlyphs` on lines built by
 * hand, so each rule is held on its own, at its edge, with no font or MuPDF
 * layout in the way. The line's text is 10 units tall, so `OFF_LINE_SIZE_MAX`
 * is a 9 unit glyph and `OFF_LINE_SHIFT_MIN` a 1.5 unit shift, both exact.
 */
describe("which glyphs are off their line (spec 0014, AC-4, AC-5)", () => {
  const off = (glyphs: readonly Character[]) => Array.from(offLineGlyphs(glyphs));

  it.each<[string, Parameters<typeof glyphLine>[0], number[]]>([
    [
      "a small raised marker",
      [{ text: "Ref" }, { text: "1", size: 6.5, rise: 3 }],
      [0, 0, 0, 1],
    ],
    [
      "a small lowered one",
      [{ text: "CO" }, { text: "2", size: 6.5, rise: -2 }, { text: "s" }],
      [0, 0, 1, 0],
    ],
    // "At most" OFF_LINE_SIZE_MAX of the dominant height, and "at least"
    // OFF_LINE_SHIFT_MIN of it off the baseline: each edge, and just past it.
    [
      "a glyph exactly the size cap",
      [{ text: "Ref" }, { text: "1", size: 9, rise: 3 }],
      [0, 0, 0, 1],
    ],
    [
      "a glyph just over the size cap",
      [{ text: "Ref" }, { text: "1", size: 9.5, rise: 3 }],
      [0, 0, 0, 0],
    ],
    [
      "a glyph exactly the least shift",
      [{ text: "Ref" }, { text: "1", size: 6, rise: 1.5 }],
      [0, 0, 0, 1],
    ],
    [
      "a glyph just short of the least shift",
      [{ text: "Ref" }, { text: "1", size: 6, rise: 1.4 }],
      [0, 0, 0, 0],
    ],
    // Smaller and shifted both: either alone is ordinary text.
    [
      "small print on the baseline",
      [{ text: "Total" }, { text: "incl", size: 7 }],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
    ["a full size glyph raised", [{ text: "Ref" }, { text: "1", rise: 4 }], [0, 0, 0, 0]],
    // Fewer than OFF_LINE_MIN_LINE_GLYPHS glyphs taller than the cap set no
    // baseline, so nothing is off by geometry.
    [
      "two full size glyphs and a raised one",
      [{ text: "No" }, { text: "1", size: 6.5, rise: 3 }],
      [0, 0, 0],
    ],
    // The dominant height is the upper median, so three raised glyphs after
    // three full size ones still leave the line's height at 10.
    [
      "three raised glyphs after three full size ones",
      [{ text: "Ref" }, { text: "123", size: 6.5, rise: 3 }],
      [0, 0, 0, 1, 1, 1],
    ],
    // Whitespace is never off, however it is drawn.
    [
      "a small raised space",
      [{ text: "Ref" }, { text: " ", size: 6.5, rise: 3 }, { text: "x" }],
      [0, 0, 0, 0, 0],
    ],
    // AC-5: a superscript code point is off whatever its geometry, and still
    // counts toward the line's medians, so it lets the `2` after it be judged.
    ["a full size ¹ on the baseline", [{ text: "No" }, { text: "¹" }], [0, 0, 1]],
    ["a full size plain 1 on the baseline", [{ text: "No" }, { text: "1" }], [0, 0, 0]],
    [
      "a raised 2 after a full size ¹",
      [{ text: "Re" }, { text: "¹" }, { text: "2", size: 6.5, rise: 3 }],
      [0, 0, 1, 1],
    ],
  ])("reads %s", (_what, parts, expected) => {
    expect(off(glyphLine(parts))).toEqual(expected);
  });

  /** Per MuPDF line, never across one: a marker on a line of its own stays. */
  it("judges each line by its own glyphs", () => {
    const glyphs = [
      ...glyphLine([{ text: "Ref" }]),
      ...glyphLine([{ text: "1", size: 6.5, rise: 3 }], { line: 1 }),
    ];

    expect(off(glyphs)).toEqual([0, 0, 0, 0]);
  });

  /** The shift is measured along the line's normal, so a turned line reads as a level one. */
  it.each<[string, readonly [number, number]]>([
    ["up the page", [0, -1]],
    ["at 45 degrees", [Math.SQRT1_2, -Math.SQRT1_2]],
  ])("reads a line turned %s as a level one", (_what, direction) => {
    expect(
      off(glyphLine([{ text: "Ref" }, { text: "1", size: 6.5, rise: 3 }], { direction })),
    ).toEqual([0, 0, 0, 1]);
    expect(
      off(glyphLine([{ text: "Total" }, { text: "incl", size: 7 }], { direction })),
    ).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});

/** AC-11 and AC-12: one page at a time, and a page that cannot be read fails. */
describe("reading pages", () => {
  it("asks whether to stop after every read of every page, and stops when told", async () => {
    const doc = await openDocumentWith(mupdf, fixture("detect-email.pdf"), LIMITS);
    try {
      const asked = vi.fn(() => false);
      await doc.findMatches({ contextChars: 40, isCancelled: asked });
      // Three pages, each read three ways: ordinary, with replacement text
      // ignored, and the image pass.
      expect(asked).toHaveBeenCalledTimes(9);

      let reads = 0;
      await expect(
        doc.findMatches({ contextChars: 40, isCancelled: () => (reads += 1) === 2 }),
      ).rejects.toBeInstanceOf(RunCancelled);
    } finally {
      doc.close();
    }
  });

  it("fails with unsupported when a page with text cannot be loaded", async () => {
    const broken = {
      loadPage() {
        throw new Error("page tree damaged");
      },
    } as unknown as PDFDocument;

    await expect(
      findMatchesIn(broken, [{ readable: true, concealed: [] }], { contextChars: 40 }),
    ).rejects.toEqual(new EngineFailure("unsupported"));
  });

  it("does not touch a page that holds no readable character", async () => {
    const loadPage = vi.fn();
    const blank = { loadPage } as unknown as PDFDocument;

    await expect(
      findMatchesIn(
        blank,
        [
          { readable: false, concealed: [] },
          { readable: false, concealed: [] },
        ],
        {
          contextChars: 40,
        },
      ),
    ).resolves.toEqual([]);
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("refuses to read a document once it is closed", async () => {
    const doc = await openDocumentWith(mupdf, fixture("detect-email.pdf"), LIMITS);
    doc.close();

    await expect(doc.findMatches({ contextChars: 40 })).rejects.toEqual(
      new EngineFailure("unsupported"),
    );
  });
});

/**
 * AC-8 and AC-9, and INV-2. A match the engine would refuse is listed, so
 * nobody believes it is gone, with the first reason that applies, no target
 * and no tick.
 */
describe("blocked matches", () => {
  const byText = async () =>
    new Map((await find("detect-blocked.pdf")).map((match) => [match.text, match]));

  it.each([
    [DETECT_BLOCKED.slanted, "slanted-text"],
    [DETECT_BLOCKED.overImage, "image-overreach"],
    [DETECT_BLOCKED.replaced, "replacement-text"],
    [DETECT_BLOCKED.hidden, "replacement-text"],
  ] as const)(
    "lists %s blocked %s, with no target and unticked",
    async (text, reason) => {
      const match = (await byText()).get(text);

      expect(match).toMatchObject({
        blocked: reason,
        target: null,
        tickedByDefault: false,
      });
    },
  );

  it("leaves the plain address beside them unblocked and ticked", async () => {
    expect((await byText()).get(DETECT_BLOCKED.plain)).toMatchObject({
      blocked: null,
      tickedByDefault: true,
    });
  });

  /**
   * The page draws `gave@…` where its replacement text says `dave@…`. Ordinary
   * extraction finds the one, and the glyphs found with replacement text
   * ignored sit in the same place, so they make no second row.
   */
  it("gives one place on the page one row", async () => {
    const matches = await byText();

    expect(matches.has(DETECT_BLOCKED.replacedGlyphs)).toBe(false);
    expect([...matches.keys()]).toHaveLength(7);
  });

  it("lists what was found only with replacement text ignored after the page's other matches", async () => {
    const onPageTwo = (await find("detect-blocked.pdf"))
      .filter((match) => match.page === 1)
      .map((match) => match.text);

    expect(onPageTwo).toEqual([
      DETECT_BLOCKED.replaced,
      DETECT_BLOCKED.plain,
      DETECT_BLOCKED.hidden,
    ]);
  });

  /**
   * The pin (AC-9). When MuPDF.js reports replacement spans, or reads the two
   * modes apart here, these become blocked, this test fails, and the limit in
   * spec 0005 can close.
   */
  it.each([DETECT_BLOCKED.wide, DETECT_BLOCKED.unequal.found])(
    "lists %s unblocked, and a run that ticks it is refused with replacement-text",
    async (text) => {
      const match = (await byText()).get(text);
      expect(match?.blocked).toBeNull();
      if (!match?.target) throw new Error("expected a target");

      await expect(
        redactDocumentWith(mupdf, fixture("detect-blocked.pdf"), [match.target]),
      ).rejects.toEqual(new EngineFailure("replacement-text"));
    },
  );
});

/**
 * INV-3. Detection and target validation answer through the same predicates,
 * one answer per target, so a match's verdict never depends on what else is
 * ticked beside it.
 */
describe("the shared predicates", () => {
  /** The prepared first page of `detect-blocked.pdf`, and its two matches' targets. */
  async function pageOne<T>(
    read: (page: PDFPage, targets: RedactionTarget[]) => T,
  ): Promise<T> {
    const found = await find("detect-blocked.pdf");
    // Blocked matches carry no target, so the geometry is rebuilt with the
    // same search the stand in uses; the quads agree within tolerance (AC-7).
    const targets = [DETECT_BLOCKED.slanted, DETECT_BLOCKED.overImage].map(
      (needle): RedactionTarget => {
        const [quads] = searched("detect-blocked.pdf", 0, needle);
        return { page: 0, quads, start: 0, end: 0, kind: "email", text: needle };
      },
    );
    expect(found.filter((match) => match.page === 0)).toHaveLength(2);

    const doc = mupdf.Document.openDocument(
      fixture("detect-blocked.pdf"),
      "application/pdf",
    );
    const pdf: PDFDocument | null = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF");
    try {
      prepareDocument(mupdf, pdf);
      const page = pdf.loadPage(0);
      try {
        return read(page, targets);
      } finally {
        page.destroy();
      }
    } finally {
      doc.destroy();
    }
  }

  it("answer per target: slanted, over an image, and neither is unsound", async () => {
    const answers = await pageOne((page, targets) => ({
      unsound: unsoundTargets(page, targets),
      slanted: slantedTargets(targets),
      overreach: imageReachVerdicts(page, targets),
    }));

    expect(answers).toEqual({
      unsound: [false, false],
      slanted: [true, false],
      overreach: [false, true],
    });
  });

  it("give each target the answer it gets alone", async () => {
    const [together, first, second] = await pageOne((page, targets) => [
      imageReachVerdicts(page, targets),
      imageReachVerdicts(page, [targets[0]]),
      imageReachVerdicts(page, [targets[1]]),
    ]);

    expect(together).toEqual([...first, ...second]);
  });

  /**
   * AC-6: what a visitor may tick, the engine accepts. Every blocked reason
   * detection gives is the refusal validation would make.
   */
  it("refuse, in a run, exactly what detection blocked", async () => {
    const run = (targets: RedactionTarget[]) =>
      redactDocumentWith(mupdf, fixture("detect-blocked.pdf"), targets);
    const [slanted, overImage] = [DETECT_BLOCKED.slanted, DETECT_BLOCKED.overImage].map(
      (needle): RedactionTarget => ({
        page: 0,
        quads: searched("detect-blocked.pdf", 0, needle)[0],
        start: 0,
        end: 0,
        kind: "email",
        text: needle,
      }),
    );

    await expect(run([slanted])).rejects.toEqual(new EngineFailure("slanted-text"));
    await expect(run([overImage])).rejects.toEqual(
      new EngineFailure("redaction-overreach"),
    );
  });
});

/**
 * AC-4. A value that wraps onto the next line of its block is found, with one
 * quad per line; an address wrapped after `@` or `.` is read with that one
 * join as nothing; nothing is ever joined across two blocks.
 */
describe("wraps", () => {
  it("finds an address wrapped after its @ and one wrapped after a dot, each with two quads", async () => {
    const found = await find("detect-wraps.pdf");

    for (const text of [DETECT_WRAPS.afterAt, DETECT_WRAPS.afterDot]) {
      const match = found.find((each) => each.text === text);
      expect(match, text).toBeDefined();
      expect(match?.target?.text).toBe(text);
      expect(match?.target?.quads).toHaveLength(2);
      expect(match?.blocked).toBeNull();
    }
  });

  it("lists smith@example.com alone after Call Bob., never Bob.smith@", async () => {
    const texts = (await find("detect-wraps.pdf")).map((match) => match.text);

    expect(texts).toContain(DETECT_WRAPS.bob);
    expect(texts.some((text) => text.includes("Bob"))).toBe(false);
  });

  it("joins nothing across two text blocks", async () => {
    const onPageTwo = (await find("detect-wraps.pdf")).filter(
      (match) => match.page === 1,
    );

    expect(onPageTwo).toEqual([]);
  });

  it("finds the address spec 0004's two line fixture wraps", async () => {
    const [match] = await find("two-lines.pdf");

    expect(match).toMatchObject({ text: "jane.doe@example.com", blocked: null });
    expect(match.target?.quads).toHaveLength(2);
  });

  it("removes every wrapped address, both lines of each", async () => {
    const targets = targetsOf(await find("detect-wraps.pdf"));
    const { output } = await redactDocumentWith(
      mupdf,
      fixture("detect-wraps.pdf"),
      targets,
    );

    const text = packedText(output, 0);
    expect(text).not.toContain("jane.doe@");
    expect(text).not.toContain("example.comfor");
    expect(text).not.toContain("sales@example.");
    expect(text).not.toContain("smith@example.com");
    expect(text).toContain("CallBob.");
    expect(text).toContain("Pleasewriteto");
  });
});

/**
 * Spec 0013, AC-12. The home page's product shot is a capture of the review of
 * `sample-agreement.pdf`, so the engine has to read it the way the shot shows
 * it: four email addresses and three phone numbers, every one tickable and
 * ticked, on pages with nothing to warn about. The browser test in
 * `tests/e2e/review.spec.ts` proves the same through the page; this one fails
 * in the unit suite first, before a rerun of `scripts/make-brand.mjs` would
 * capture a different review.
 */
describe("the sample agreement behind the product shot (spec 0013, AC-12)", () => {
  const [person, payroll, hr, legal] = SAMPLE_AGREEMENT.emails;
  const [direct, pay, us] = SAMPLE_AGREEMENT.phones;

  it("opens two pages with nothing to warn about", async () => {
    const doc = await openDocumentWith(mupdf, fixture("sample-agreement.pdf"), LIMITS);
    try {
      expect(doc.summary).toEqual({
        pageCount: 2,
        pages: [{ findings: [] }, { findings: [] }],
      });
    } finally {
      doc.close();
    }
  });

  it("finds the four addresses and three numbers, by page, then in reading order", async () => {
    const found = await find("sample-agreement.pdf");

    expect(found.map(({ page, kind, text }) => [page, kind, text])).toEqual([
      [0, "email", person],
      [0, "phone", direct],
      [0, "email", payroll],
      [0, "phone", pay],
      [1, "email", hr],
      [1, "email", legal],
      [1, "phone", us],
    ]);
  });

  it("ticks every one by default, with none blocked or kept from view", async () => {
    for (const match of await find("sample-agreement.pdf")) {
      expect(match).toMatchObject({
        tickedByDefault: true,
        blocked: null,
        concealed: null,
      });
    }
  });

  it("removes all seven, and the self check passes", async () => {
    const targets = targetsOf(await find("sample-agreement.pdf"));

    const output = await expectRemoved("sample-agreement.pdf", targets);

    expect(packedText(output, 0)).toContain("EmploymentAgreement");
    expect(packedText(output, 1)).toContain("6.Signatures");
  });
});
