import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  lineBox,
  paddedArea,
  redactDocumentWith,
  silenceEngineLog,
  type RedactionTarget,
} from "@/engine";

import { fixture } from "../support/bytes";
import {
  containsInAnyEncoding,
  decompressedBytes,
  documentText,
  filledPaths,
  forEachImagePixel,
  inside,
  inspect,
  mupdf,
  pageCharacters,
  pageContent,
  pageText,
  pixelsInside,
  render,
  type Corners,
} from "../support/mupdf";
import { findTarget, findTargets } from "../support/targets";

/**
 * The fixture matrix. Spec 0004, AC-4, AC-5, AC-6 and AC-13, task 10.
 *
 * Every case runs the real engine in Node over a hand written fixture from
 * `scripts/lib/redaction-fixtures.mjs`, with targets found the way feature 6
 * will find them, and reads the output back with helpers that share no code
 * with the engine. A case expected to redact also proves there is no false
 * alarm: the run only resolves once its own character and pixel checks pass.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

function tick(
  name: string,
  page: number,
  needle: string,
  occurrence = 0,
): RedactionTarget {
  return findTarget(fixture(name), page, needle, "email", occurrence);
}

function run(name: string, targets: readonly RedactionTarget[]) {
  return redactDocumentWith(mupdf, fixture(name), targets);
}

/** The run's failure kind, or `null` if it produced a file. */
async function outcomeOf(name: string, targets: readonly RedactionTarget[]) {
  try {
    await run(name, targets);
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

/** The characters of one line, found by its baseline, as `char@x`. */
function lineCharacters(
  bytes: ArrayBuffer,
  page: number,
  baseline: number,
  options = "",
) {
  return pageCharacters(bytes, page, options)
    .filter(({ y }) => Math.abs(y - baseline) < 0.5)
    .map(({ char, x }) => `${char}@${x.toFixed(2)}`);
}

/**
 * The line holding `needle`, found by where its characters run in a row, and
 * that line's characters as `char@x` with the needle's run taken out: what the
 * line must read once the needle is removed and nothing else is.
 */
function lineWithout(bytes: ArrayBuffer, page: number, needle: string) {
  const characters = pageCharacters(bytes, page);
  const start = characters.findIndex((_, at) =>
    [...needle].every((char, offset) => characters[at + offset]?.char === char),
  );
  if (start < 0) throw new Error(`"${needle}" not found`);

  const baseline = characters[start].y;
  const run = new Set(characters.slice(start, start + needle.length));
  const kept = characters
    .filter((entry) => !run.has(entry) && Math.abs(entry.y - baseline) < 0.5)
    .map(({ char, x }) => `${char}@${x.toFixed(2)}`);
  return { baseline, kept };
}

/** Every baseline on a page, except the one given. */
function otherBaselines(bytes: ArrayBuffer, page: number, except: number): number[] {
  const baselines = new Set(
    pageCharacters(bytes, page).map(({ y }) => Math.round(y * 100) / 100),
  );
  return [...baselines].filter((y) => Math.abs(y - except) >= 0.5);
}

/**
 * Spec 0004, AC-4 and AC-6: single spacing. Three lines of 12pt text at 12pt
 * and 14pt leading with the middle one ticked, in each fixture font.
 */
describe.each([
  ["single-spacing.pdf", 0, "Helvetica", 12, null],
  ["single-spacing.pdf", 1, "Helvetica", 14, 4],
  ["single-spacing.pdf", 2, "Courier", 12, null],
  ["single-spacing.pdf", 3, "Courier", 14, 5],
  ["carlito.pdf", 0, "Carlito", 12, null],
  ["carlito.pdf", 1, "Carlito", 14, 2],
] as const)("%s page %i: %s at %ipt leading", (name, page, _font, leading, barePage) => {
  let target: RedactionTarget;
  let output: ArrayBuffer;
  // The ticked line's baseline, in the page space extraction uses.
  const baseline = 792 - (700 - leading);

  beforeAll(async () => {
    target = tick(name, page, "Jeremy Quigley");
    ({ output } = await run(name, [target]));
  });

  it("removes the match and keeps the rest of its line", () => {
    const text = inspect(output, (doc) => pageText(doc, page));

    expect(text).not.toContain("Jeremy");
    expect(text).not.toContain("Quigley");
    expect(text).toContain("Account holder");
    expect(text).toContain("here");
  });

  it("keeps every character of the lines above and below at its source origin, in both modes", () => {
    const source = fixture(name);
    const neighbours = otherBaselines(source, page, baseline);
    expect(neighbours).toHaveLength(2);

    for (const options of ["", "ignore-actualtext"]) {
      for (const y of neighbours) {
        expect(lineCharacters(output, page, y, options)).toEqual(
          lineCharacters(source, page, y, options),
        );
      }
    }
  });

  if (barePage !== null) {
    /**
     * *How the pixel and ink tests measure*: the neighbouring lines' ink is
     * the ink of the same page without its middle line, and none of it may lie
     * where the box is drawn.
     */
    it("leaves no ink of the neighbouring lines under the box", () => {
      const bare = render(fixture(name), barePage);
      const under = pixelsInside(bare, lineBox(target.quads[0]));

      expect(under.length).toBeGreaterThan(1000);
      expect(under.filter(({ column, row }) => bare.isInk(column, row))).toEqual([]);
    });
  }
});

/**
 * Spec 0004, AC-5: a neighbour drawn into the match by ordinary kerning, in a
 * font whose quad is 1.37 em tall and in one whose quad is 1.0 em.
 */
describe.each([
  ["Helvetica", "kerning.pdf", 0],
  ["Carlito", "carlito.pdf", 3],
] as const)("kerning in %s (%s page %i)", (_font, name, page) => {
  describe.each(["before", "after"] as const)("a neighbour %s the match", (side) => {
    it.each([80, 120, 150])("survives at %i thousandths of an em", async (kern) => {
      const needle = `${side}${kern}`;
      const source = fixture(name);
      const { baseline, kept } = lineWithout(source, page, needle);
      expect(kept.some((entry) => entry.startsWith("M@"))).toBe(true);

      const { output } = await run(name, [tick(name, page, needle)]);

      expect(lineCharacters(output, page, baseline)).toEqual(kept);
      expect(inspect(output, (doc) => pageText(doc, page))).not.toContain(needle);
    });

    /** Too deep: the band takes the neighbour, and the run refuses rather than lose it. */
    it("is refused with redaction-overreach at 300 thousandths of an em", async () => {
      await expect(outcomeOf(name, [tick(name, page, `${side}300`)])).resolves.toBe(
        "redaction-overreach",
      );
    });
  });
});

/** Spec 0004, AC-5: the geometric edges. */
describe("the geometric edges", () => {
  it("removes a match split across two lines, and nothing else on either line", async () => {
    const target = tick("two-lines.pdf", 0, "jane.doe@ example.com");
    expect(target.quads).toHaveLength(2);

    const { output } = await run("two-lines.pdf", [target]);

    const text = documentText(output);
    expect(text).not.toContain("jane.doe@");
    expect(text).not.toContain("example.com");
    expect(text).toContain("Please write to");
    expect(text).toContain("for any details");
    expect(text).toContain("The last line stays as it is");
    const bytes = decompressedBytes(output);
    expect(containsInAnyEncoding(bytes, "jane.doe@")).toBe(false);
    expect(containsInAnyEncoding(bytes, "example.com")).toBe(false);
  });

  it.each([
    [
      "rotated-page.pdf",
      "a page rotated 90 degrees",
      ["A rotated page, first line", "today"],
    ],
    [
      "offset-cropbox.pdf",
      "a crop box away from the origin",
      ["Inside the crop box", "today"],
    ],
  ] as const)("removes a match on %s (%s)", async (name, _label, kept) => {
    const { output } = await run(name, [tick(name, 0, "jane.doe@example.com")]);

    const text = documentText(output);
    expect(text).not.toContain("jane.doe@example.com");
    for (const words of [...kept, "Contact:"]) expect(text).toContain(words);
    expect(containsInAnyEncoding(decompressedBytes(output), "jane.doe@example.com")).toBe(
      false,
    );
  });

  it("removes a match inside a form XObject", async () => {
    const { output } = await run("form-xobject.pdf", [
      tick("form-xobject.pdf", 0, "SECRET-42"),
    ]);

    const text = documentText(output);
    expect(text).not.toContain("SECRET-42");
    expect(text).toContain("Reference:");
    expect(text).toContain("inside a form");
    expect(text).toContain("Text outside the form");
    expect(containsInAnyEncoding(decompressedBytes(output), "SECRET-42")).toBe(false);
  });

  /**
   * The `sanitize` write keeps only what each page draws, so the unredacted
   * form cannot ride along in the resource dictionary page 2 shares.
   */
  it("leaves no copy of a redacted form in resources shared with a page that never draws it", async () => {
    const { output } = await run("shared-xobject.pdf", [
      tick("shared-xobject.pdf", 0, "SECRET-SHARED"),
    ]);

    expect(containsInAnyEncoding(decompressedBytes(output), "SECRET-SHARED")).toBe(false);
    expect(inspect(output, (doc) => pageText(doc, 1))).toContain("Other form text");
    expect(inspect(output, (doc) => pageText(doc, 0))).toContain("Shared secret");
  });

  it.each([
    [".", "Total", "Due"],
    ["i", "Rank", "Code"],
  ])("removes a lone %s as a whole match", async (needle, before, after) => {
    const { output } = await run("lone-glyphs.pdf", [tick("lone-glyphs.pdf", 0, needle)]);

    const text = documentText(output);
    expect(text).toContain(before);
    expect(text).toContain(after);
    expect(text.replace(/\s+/g, " ")).not.toContain(`${before} ${needle} ${after}`);
    expect(pageCharacters(output, 0).filter(({ char }) => char === needle)).toEqual([]);
  });

  /**
   * A replacement text span that wraps exactly the match goes with it: every
   * glyph in the span is removed, so MuPDF drops the span, string and all.
   */
  it("removes a match wrapped exactly by replacement text, span and all", async () => {
    const { output } = await run("actual-text.pdf", [
      tick("actual-text.pdf", 0, "SECRET-AT"),
    ]);

    for (const options of ["", "ignore-actualtext"]) {
      const text = inspect(output, (doc) => pageText(doc, 0, options));
      expect(text).not.toContain("SECRET-AT");
      expect(text).toContain("Name:");
      expect(text).toContain("value");
    }
    // Only page 1's own drawing: the other pages still say it, unticked.
    const content = pageContent(output, 0);
    expect(containsInAnyEncoding(content, "SECRET-AT")).toBe(false);
    expect(content).not.toContain("ActualText");
    expect(content).toContain("Name:");
  });

  /** A span whose text differs from its glyph, beside a match, is left alone. */
  it("redacts beside a ligature's replacement text and keeps the ligature", async () => {
    const { output } = await run("actual-text.pdf", [
      tick("actual-text.pdf", 4, "SECRET-AT"),
    ]);

    expect(inspect(output, (doc) => pageText(doc, 4))).toContain("fi");
    expect(inspect(output, (doc) => pageText(doc, 4, "ignore-actualtext"))).toContain(
      "X",
    );
    expect(inspect(output, (doc) => pageText(doc, 4))).not.toContain("SECRET-AT");
  });

  /**
   * Text drawn at 30 degrees. MuPDF 1.28.1 removes text inside each redaction
   * quad's axis aligned bounds rather than the quad itself, so a thin band on
   * a slant sweeps the lines above and below. The self check sees the loss,
   * and the run refuses rather than hand back a file missing words. How to
   * hand MuPDF a slanted area is owed to `/architect` (spec 0004, AC-5).
   */
  it("refuses text drawn at 30 degrees rather than lose the lines around it", async () => {
    await expect(
      outcomeOf("angled-text.pdf", [tick("angled-text.pdf", 0, "Jeremy Quigley")]),
    ).resolves.toBe("redaction-overreach");
  });

  it.todo("removes a match drawn at 30 degrees through all three passes (AC-5)");
});

/**
 * Spec 0004, AC-5: invisible OCR text over a scan, written the way Tesseract
 * writes it, once aligned with the ink and once shifted down by 15% of the
 * quad's height and left by a tenth of an em.
 */
describe.each(["ocr-aligned.pdf", "ocr-misaligned.pdf"])("%s", (name) => {
  let target: RedactionTarget;
  let output: ArrayBuffer;

  beforeAll(async () => {
    target = tick(name, 0, "Quigley");
    ({ output } = await run(name, [target]));
  });

  it("blanks every image pixel in the padded area, descenders included", () => {
    const padded = target.quads.map(paddedArea);
    let checked = 0;
    const marked: string[] = [];

    forEachImagePixel(output, 0, (x, y, rgb) => {
      if (!padded.some((quad) => inside(quad, x, y))) return;
      checked += 1;
      if (rgb.some((value) => value !== 255)) marked.push(`${x},${y}`);
    });

    expect(checked).toBeGreaterThan(1000);
    expect(marked).toEqual([]);
  });

  /** The match's ink is whatever the scan holds that the bare scan does not. */
  it("leaves no ink of the match anywhere in the scan", () => {
    const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
    const neighbours = new Set<string>();
    forEachImagePixel(fixture("ocr-bare.pdf"), 0, (x, y, rgb) => {
      if (rgb.some((value) => value < 128)) neighbours.add(key(x, y));
    });

    const left: string[] = [];
    forEachImagePixel(output, 0, (x, y, rgb) => {
      if (rgb.some((value) => value < 128) && !neighbours.has(key(x, y)))
        left.push(key(x, y));
    });

    expect(neighbours.size).toBeGreaterThan(1000);
    expect(left).toEqual([]);
  });

  it("keeps the neighbouring OCR words as text", () => {
    const text = documentText(output).replace(/\s+/g, " ");

    expect(text).not.toContain("Quigley");
    expect(text).toContain("Payee");
    expect(text).toContain("gets paid");
    expect(text).toContain("Statement for the month of July");
    expect(text).toContain("Reference number 4471 applies");
  });
});

/**
 * Spec 0004, AC-13, *Pixels checked*: born digital text over an inline image,
 * and over a 1 bit image mask. Each comes out blank under the match or fails
 * the run; it never comes out with ink there.
 */
describe("text over images", () => {
  it("blanks an inline image and an image mask under the matches, or refuses", async () => {
    const bytes = fixture("images-under.pdf");
    const targets = [findTarget(bytes, 0, "12345678"), findTarget(bytes, 0, "40-11-22")];

    let output: ArrayBuffer;
    try {
      ({ output } = await redactDocumentWith(mupdf, bytes, targets));
    } catch (failure) {
      expect(failure).toMatchObject({ errorKind: "redaction-incomplete" });
      return;
    }

    const quads: Corners[] = targets.flatMap((target) => target.quads);
    let checked = 0;
    const marked: string[] = [];
    forEachImagePixel(output, 0, (x, y, rgb) => {
      if (!quads.some((quad) => inside(quad, x, y))) return;
      checked += 1;
      if (rgb.some((value) => value !== 255)) marked.push(`${x},${y}`);
    });
    expect(checked).toBeGreaterThan(0);
    expect(marked).toEqual([]);
    expect(documentText(output)).toContain("Account");
    expect(documentText(output)).toContain("Sort code");
  });
});

/**
 * Spec 0004, AC-5: a match drawn as vector outlines over an invisible text
 * layer. The padded pass removes every outline it fully covers, the accent
 * and the descenders included; the neighbours' outlines stay.
 */
describe("a match drawn as outlines", () => {
  it("loses every outlined glyph of the match, and nothing else", async () => {
    const bytes = fixture("outlined.pdf");
    const target = findTarget(bytes, 0, "Péguy");
    const { output } = await redactDocumentWith(mupdf, bytes, [target]);

    const outline = (path: { color: readonly number[] }) =>
      path.color.length === 3 && path.color[2] > 0.5;
    const inMatch = (path: { bounds: readonly number[] }) => {
      const [x0, y0, x1, y1] = path.bounds;
      return inside(target.quads[0], (x0 + x1) / 2, (y0 + y1) / 2);
    };

    const before = filledPaths(bytes, 0).filter(outline);
    const after = filledPaths(output, 0).filter(outline);
    expect(before.filter(inMatch)).toHaveLength(5);
    expect(after.filter(inMatch)).toEqual([]);
    expect(after).toHaveLength(before.length - 5);
  });
});

/**
 * Spec 0004, AC-13, *Recorded before redacted*. One form drawn on pages 1 and
 * 3, ticked on page 1 only. Either each drawing is redacted apart and page 3
 * keeps its copy, or the run refuses; it never passes with page 3's text gone.
 */
describe("a form drawn on two pages, ticked on one", () => {
  it("keeps page 3's copy, or refuses", async () => {
    const name = "xobject-two-pages.pdf";
    let output: ArrayBuffer;
    try {
      ({ output } = await run(name, [tick(name, 0, "SECRET-77")]));
    } catch (failure) {
      expect(failure).toMatchObject({ errorKind: "redaction-overreach" });
      return;
    }

    expect(inspect(output, (doc) => pageText(doc, 0))).not.toContain("SECRET-77");
    expect(inspect(output, (doc) => pageText(doc, 2))).toContain(
      "Case ref SECRET-77 in a form",
    );
  });
});

/**
 * Spec 0004, AC-5, *Measured, then recorded*. What MuPDF 1.28.1 does, pinned
 * so a change shows up here first.
 */
describe("measured cases", () => {
  /**
   * A form drawn twice on one page, ticked in its first drawing: MuPDF
   * redacts each drawing apart, so the second keeps its text.
   */
  it("redacts one drawing of a form drawn twice on a page, and keeps the other", async () => {
    const name = "xobject-twice.pdf";
    const drawings = findTargets(fixture(name), 0, "SECRET-99");
    expect(drawings).toHaveLength(2);

    const { output } = await run(name, [drawings[0]]);

    expect(findTargets(output, 0, "SECRET-99")).toHaveLength(1);
    expect(findTargets(output, 0, "SECRET-99")[0].quads).toEqual(drawings[1].quads);
  });

  /** A combining mark inside the match sits under the band and goes with it. */
  it("removes a match with a combining mark inside it", async () => {
    const { output } = await run("combining.pdf", [tick("combining.pdf", 0, "Renée")]);

    const text = documentText(output);
    expect(text).not.toContain("Ren");
    expect(text).toContain("José");
  });

  /**
   * A combining mark drawn at zero width on the match's last letter sits at
   * the match's very end, past the band's pulled in end, so it survives. The
   * self check sees the survivor and the run refuses.
   */
  it("refuses a match ending in a zero width combining mark", async () => {
    await expect(
      outcomeOf("combining.pdf", [tick("combining.pdf", 0, "José")]),
    ).resolves.toBe("redaction-incomplete");
  });
});
