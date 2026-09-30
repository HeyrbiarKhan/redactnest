import type { PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  EXTRACTION_OPTIONS,
  EngineFailure,
  imageReachVerdicts,
  slantedTargets,
  unsoundTargets,
  findMatchesIn,
  openDocumentWith,
  POSITION_TOLERANCE,
  prepareDocument,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  walkCharacters,
  type FoundMatch,
  type Quad,
  type RedactionTarget,
} from "@/engine";

import {
  DETECT_BLOCKED,
  DETECT_DENSE_PAGES,
  DETECT_DENSE_PER_PAGE,
  DETECT_EMAIL,
  DETECT_MANY_COUNT,
  DETECT_PHONE,
  DETECT_PHONE_COLUMN,
  DETECT_PHONE_LISTED,
  DETECT_PHONE_SPACED,
  DETECT_UNICODE_EMAIL,
  DETECT_WRAPS,
  denseRow,
  manyAddress,
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
 * target that named it. The engine's own self check has also passed, or the
 * run would have thrown.
 */
async function expectRemoved(name: string, targets: readonly RedactionTarget[]) {
  const source = fixture(name);
  const { output } = await redactDocumentWith(mupdf, source, targets);

  for (const target of targets) {
    const text = target.text.replace(/\s/gu, "");
    const named = targets.filter(
      (other) => other.page === target.page && other.text.replace(/\s/gu, "") === text,
    ).length;
    expect(occurrences(packedText(output, target.page), text)).toBe(
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
    const found = await find("detect-phone.pdf");

    expect(found.map((match) => [match.text, match.tickedByDefault])).toEqual(
      DETECT_PHONE.map(([text, ticked]) => [text, ticked]),
    );
    expect(found.every((match) => match.kind === "phone" && match.blocked === null)).toBe(
      true,
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
