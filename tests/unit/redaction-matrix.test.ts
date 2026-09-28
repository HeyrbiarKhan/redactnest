import type { Matrix, PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  blankedRegion,
  boundsReach,
  boxPass,
  EngineFailure,
  lineBox,
  paddedArea,
  paddedPass,
  PIPELINE,
  quadHeight,
  redactDocumentWith,
  removalBand,
  silenceEngineLog,
  textPass,
  type Pass,
  type Quad,
  type RedactionTarget,
} from "@/engine";
import type { EngineErrorKind } from "@/worker/protocol";

import { BOUNDS_PIN, OFF_PAGE_TEXT } from "../../scripts/lib/redaction-fixtures.mjs";
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

/**
 * A run refused with `kind` before anything is removed: neither pass that
 * removes anything is ever called (spec 0004, AC-28 and AC-29).
 */
async function expectRefusedBeforeAnyPass(
  name: string,
  targets: readonly RedactionTarget[],
  kind: EngineErrorKind,
) {
  const textPass = vi.fn<Pass>();
  const paddedPass = vi.fn<Pass>();

  await expect(
    redactDocumentWith(
      mupdf,
      fixture(name),
      targets,
      {},
      {
        ...PIPELINE,
        textPass,
        paddedPass,
      },
    ),
  ).rejects.toMatchObject({ errorKind: kind });
  expect(textPass).not.toHaveBeenCalled();
  expect(paddedPass).not.toHaveBeenCalled();
}

/** A target's one quad's bounds reach, as a share of its height (AC-28). */
function reachOf(target: RedactionTarget): number {
  expect(target.quads).toHaveLength(1);
  const [quad] = target.quads;
  return boundsReach(paddedArea(quad)) / quadHeight(quad);
}

/** Eight numbers from the fixture module, as the engine's `Quad`. */
function asQuad(values: readonly number[]): Quad {
  if (values.length !== 8) throw new Error("expected eight numbers");
  const [a, b, c, d, e, f, g, h] = values;
  return [a, b, c, d, e, f, g, h];
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
   * Text drawn at 30 degrees. MuPDF 1.28.1 acts on each redaction area's
   * upright bounds rather than the area, so every pass would reach far past
   * it. The slant check refuses the target before any pass runs (spec 0004,
   * AC-28).
   */
  it("refuses text drawn at 30 degrees with slanted-text before any pass runs", async () => {
    await expectRefusedBeforeAnyPass(
      "angled-text.pdf",
      [tick("angled-text.pdf", 0, "Jeremy Quigley")],
      "slanted-text",
    );
  });
});

/**
 * Spec 0004, AC-5 and AC-28: slanted targets, over `reach.pdf`. Each quad's
 * reach is held to the number the spec records, then run: within the limit
 * it redacts and passes its own checks, past it the run is refused before any
 * pass. The match is `Jeremy Quigley` in 12pt Helvetica on every page.
 */
describe("slanted targets", () => {
  const NAME = "reach.pdf";
  const match = (page: number) => tick(NAME, page, "Jeremy Quigley");

  it.each([
    [0, "drawn at 1 degree, 12pt leading", 0.092],
    [1, "drawn at 1 degree, 14pt leading", 0.092],
    [4, "turned whole to 90 degrees", 0],
    [5, "turned whole to 180 degrees", 0],
    [7, "level, joined from 12pt then 11pt", 0.093],
  ] as const)(
    "redacts page %i, %s, and passes its own checks",
    async (page, _label, reach) => {
      const target = match(page);
      expect(reachOf(target)).toBeCloseTo(reach, 2);

      const { output } = await run(NAME, [target]);

      const text = inspect(output, (doc) => pageText(doc, page));
      expect(text).not.toContain("Jeremy");
      expect(text).not.toContain("Quigley");
      for (const kept of [
        "Account holder",
        "here",
        "Descenders above",
        "Ascenders below",
      ]) {
        expect(text).toContain(kept);
      }
    },
  );

  it.each([
    [2, "drawn at 1.5 degrees, 12pt leading", 0.138],
    [3, "drawn at 1.5 degrees, 14pt leading", 0.138],
    [6, "set level with a 12 degree shear", 0.305],
  ] as const)(
    "refuses page %i, %s, with slanted-text before any pass runs",
    async (page, _label, reach) => {
      const target = match(page);
      expect(reachOf(target)).toBeCloseTo(reach, 2);

      await expectRefusedBeforeAnyPass(NAME, [target], "slanted-text");
    },
  );

  /** A target that does not hold up outranks a slanted one checked before it. */
  it("names unsupported when a slanted target comes with one naming other text", async () => {
    await expectRefusedBeforeAnyPass(
      NAME,
      [match(2), { ...match(7), text: "John Roe" }],
      "unsupported",
    );
  });

  /** A slanted target outranks an image blanked too far, checked before it. */
  it("names slanted-text when a slanted target comes with a match over an image at 30 degrees", async () => {
    await expectRefusedBeforeAnyPass(NAME, [match(9), match(2)], "slanted-text");
  });
});

/**
 * Spec 0004, AC-29: images under a level match, over `reach.pdf`. MuPDF blanks
 * whole pixels in each image's own pixel grid, so an image drawn at an angle,
 * or so coarse a pixel spans more than a tenth of the quad's height, would be
 * blanked well past the padded area. Refused before any pass runs.
 */
describe("images under a target", () => {
  const NAME = "reach.pdf";

  it.each([
    ["drawn at 30 degrees", 9],
    ["8 by 8 pixels stretched to 200 pt", 10],
  ] as const)(
    "refuses a level match over an image %s (page %i) with redaction-overreach before any pass runs",
    async (_label, page) => {
      await expectRefusedBeforeAnyPass(
        NAME,
        [tick(NAME, page, "Jeremy Quigley")],
        "redaction-overreach",
      );
    },
  );

  it("redacts the same match over an upright image at 4 pixels per point", async () => {
    const target = tick(NAME, 8, "Jeremy Quigley");
    const { output } = await run(NAME, [target]);

    const padded = target.quads.map(paddedArea);
    let checked = 0;
    const marked: string[] = [];
    forEachImagePixel(output, 8, (x, y, rgb) => {
      if (!padded.some((quad) => inside(quad, x, y))) return;
      checked += 1;
      if (rgb.some((value) => value !== 255)) marked.push(`${x},${y}`);
    });

    expect(checked).toBeGreaterThan(1000);
    expect(marked).toEqual([]);
    expect(inspect(output, (doc) => pageText(doc, 8))).not.toContain("Quigley");
  });
});

/**
 * Spec 0004, *MuPDF's bounds behaviour is pinned by a test*: AC-28 and AC-29
 * rest on what MuPDF 1.28.1 does, so it is driven directly over
 * `bounds-pin.pdf` with the engine's own passes. If a later MuPDF acts on the
 * area rather than its bounds, this fails and `BOUNDS_REACH_RATIO` can be
 * lifted; if it starts judging covered over all areas together, cutting a
 * slanted area into pieces becomes worth weighing again.
 */
describe("MuPDF acts on each area's bounds", () => {
  const PIN = "bounds-pin.pdf";
  const slanted = asQuad(BOUNDS_PIN.slanted);
  const level = asQuad(BOUNDS_PIN.level);
  const isWhite = (rgb: readonly number[]) => rgb.every((value) => value === 255);
  const coloured = (bytes: ArrayBuffer, rgb: string) =>
    filledPaths(bytes, 0).filter(({ color }) => color.join(",") === rgb);

  /** The pin's page after `passes`, written out so the helpers can read it. */
  function afterPasses(
    index: number,
    passes: readonly (readonly [Pass, readonly (readonly Quad[])[]])[],
  ): ArrayBuffer {
    const doc = mupdf.Document.openDocument(fixture(PIN), "application/pdf");
    try {
      const pdf: PDFDocument | null = doc.asPDF();
      if (!pdf) throw new Error("expected a PDF");
      const page = pdf.loadPage(index);
      try {
        for (const [pass, areas] of passes) pass(mupdf, page, areas);
      } finally {
        page.destroy();
      }
      const buffer = pdf.saveToBuffer("");
      try {
        return buffer.asUint8Array().slice().buffer;
      } finally {
        buffer.destroy();
      }
    } finally {
      doc.destroy();
    }
  }

  /** The one image a page draws: its placement and its size in pixels. */
  function imageOn(index: number): { transform: Matrix; width: number; height: number } {
    const found: { transform: Matrix; width: number; height: number }[] = [];
    inspect(fixture(PIN), (doc) => {
      const page = doc.loadPage(index);
      const stext = page.toStructuredText("preserve-images");
      try {
        stext.walk({
          onImageBlock(_bbox, transform, image) {
            found.push({ transform, width: image.getWidth(), height: image.getHeight() });
            image.destroy();
          },
        });
      } finally {
        stext.destroy();
        page.destroy();
      }
    });
    expect(found).toHaveLength(1);
    return found[0];
  }

  it("blanks every image pixel inside a slanted area's bounds, and none outside them", () => {
    const [x0, y0, x1, y1] = BOUNDS_PIN.bounds;
    const output = afterPasses(0, [[paddedPass, [[slanted]]]]);

    const wrong: string[] = [];
    let pastArea = 0;
    forEachImagePixel(output, 0, (x, y, rgb) => {
      const inBounds = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (isWhite(rgb) !== inBounds) wrong.push(`${x},${y}`);
      if (isWhite(rgb) && !inside(slanted, x, y)) pastArea += 1;
    });

    expect(wrong).toEqual([]);
    expect(pastArea).toBeGreaterThan(1000);
  });

  it("removes squares at the bounds' corners, well outside the area, and keeps one just outside the bounds", () => {
    expect(coloured(fixture(PIN), "1,0,0")).toHaveLength(3);

    const kept = coloured(afterPasses(0, [[paddedPass, [[slanted]]]]), "1,0,0");

    expect(kept).toHaveLength(1);
    expect(kept[0].bounds[0]).toBeCloseTo(BOUNDS_PIN.outsideSquare[0], 3);
  });

  it.each([
    ["both halves in one annotation", [BOUNDS_PIN.halves.map(asQuad)], 1],
    [
      "each half in its own annotation",
      BOUNDS_PIN.halves.map((half) => [asQuad(half)]),
      1,
    ],
    ["one area over the whole bar", [[asQuad(BOUNDS_PIN.whole)]], 0],
  ] as const)(
    "judges covered one area at a time: %s leaves %i bar",
    (_label, areas, bars) => {
      expect(coloured(fixture(PIN), "0,0,1")).toHaveLength(1);

      expect(coloured(afterPasses(0, [[paddedPass, areas]]), "0,0,1")).toHaveLength(bars);
    },
  );

  it("draws the box on the area itself, not its bounds", () => {
    const [, y0, x1] = BOUNDS_PIN.bounds;
    // Inside the bounds, far outside the area: the black image before.
    const corner = [x1 - 4, y0 + 4] as const;
    const before = render(fixture(PIN), 0);
    expect(before.isInk(...before.pixelAt(...corner))).toBe(true);

    const image = render(
      afterPasses(0, [
        [paddedPass, [[slanted]]],
        [boxPass, [[slanted]]],
      ]),
      0,
    );

    expect(image.isBlack(...image.pixelAt(200, 292))).toBe(true);
    expect(image.isInk(...image.pixelAt(...corner))).toBe(false);
  });

  it.each([
    ["the image drawn at 30 degrees", 1],
    ["an 8 by 8 pixel image stretched to 200 pt", 2],
  ] as const)(
    "blanks only inside blankedRegion's quad, and past the area, over %s (page %i)",
    (_label, page) => {
      const { transform, width, height } = imageOn(page);
      const region = blankedRegion(transform, width, height, level);
      if (!region) throw new Error("expected a region");

      const outside: string[] = [];
      let blanked = 0;
      let pastArea = 0;
      forEachImagePixel(
        afterPasses(page, [[paddedPass, [[level]]]]),
        page,
        (x, y, rgb) => {
          if (!isWhite(rgb)) return;
          blanked += 1;
          if (!inside(region, x, y)) outside.push(`${x},${y}`);
          if (!inside(level, x, y)) pastArea += 1;
        },
      );

      expect(blanked).toBeGreaterThan(0);
      expect(outside).toEqual([]);
      expect(pastArea).toBeGreaterThan(0);
    },
  );
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
 * Spec 0004, AC-5 and AC-13, *Recorded before redacted*. One form drawn on
 * pages 1 and 3, ticked on page 1 only. MuPDF redacts each drawing apart
 * (measured), so the run passes and page 3 keeps its copy where it was. A
 * MuPDF that redacted the shared form in place would fail here, rather than
 * pass as a `redaction-overreach` this test also accepted.
 */
describe("a form drawn on two pages, ticked on one", () => {
  it("redacts page 1's drawing and keeps page 3's copy at its own place", async () => {
    const name = "xobject-two-pages.pdf";
    const { output } = await run(name, [tick(name, 0, "SECRET-77")]);

    expect(inspect(output, (doc) => pageText(doc, 0))).not.toContain("SECRET-77");
    expect(findTargets(output, 2, "SECRET-77").map(({ quads }) => quads)).toEqual(
      findTargets(fixture(name), 2, "SECRET-77").map(({ quads }) => quads),
    );
  });
});

/**
 * What MuPDF 1.28.1 does, measured and pinned so a change shows up here first.
 * Spec 0004 records each result, under *The measured results* and in its
 * *Security model* and *Neutral* consequences. The accents are written as
 * escapes: each is `e` then U+0301, the combining acute, as the fixture draws
 * them.
 */
describe("measured cases", () => {
  const RENEE = "Rene\u0301e";
  const JOSE = "Jose\u0301";

  /**
   * A form drawn twice on one page, ticked in its first drawing: MuPDF
   * redacts each drawing apart, so the second keeps its text (spec 0004,
   * *Neutral*).
   */
  it("redacts one drawing of a form drawn twice on a page, and keeps the other", async () => {
    const name = "xobject-twice.pdf";
    const drawings = findTargets(fixture(name), 0, "SECRET-99");
    expect(drawings).toHaveLength(2);

    const { output } = await run(name, [drawings[0]]);

    expect(findTargets(output, 0, "SECRET-99")).toHaveLength(1);
    expect(findTargets(output, 0, "SECRET-99")[0].quads).toEqual(drawings[1].quads);
  });

  /**
   * A combining mark inside the match sits under the band and goes with it,
   * U+0301 and all (spec 0004, AC-5). The match's line is the one drawn at
   * 670pt, 122pt down the page.
   */
  it("removes a match with a combining mark inside it", async () => {
    const onItsLine = (bytes: ArrayBuffer) =>
      pageCharacters(bytes, 0)
        .filter(({ y }) => Math.abs(y - 122) < 0.5)
        .map(({ char }) => char);
    expect(onItsLine(fixture("combining.pdf"))).toContain("\u0301");

    const { output } = await run("combining.pdf", [tick("combining.pdf", 0, RENEE)]);

    expect(onItsLine(output)).not.toContain("\u0301");
    expect(onItsLine(output).join("")).toBe("Name:here");
    expect(documentText(output)).toContain(JOSE);
  });

  /**
   * A combining mark drawn at zero width on the match's last letter sits at
   * the match's very end, past the band's pulled in end, so it survives. The
   * self check sees the survivor and the run refuses (spec 0004, *Security
   * model*).
   */
  it("refuses a match ending in a zero width combining mark", async () => {
    await expect(
      outcomeOf("combining.pdf", [tick("combining.pdf", 0, JOSE)]),
    ).resolves.toBe("redaction-incomplete");
  });

  /**
   * `reach.pdf` page 7's joined line written as one text object, its size
   * changed by `Tf` between the runs. MuPDF writes out the gap removed glyphs
   * leave at the next glyph it keeps, under the size in force there, so when
   * a size change sits between them the text after the match moves (by the
   * removed width times one less the ratio of the sizes). The self check sees
   * the moved glyphs and the run refuses. Measured during slice 4's build and
   * recorded as an honest limit in spec 0004's *Security model*; the same line
   * as two text objects redacts.
   */
  it("refuses a match followed by a size change inside the same text object", async () => {
    await expect(
      outcomeOf("reach.pdf", [tick("reach.pdf", 11, "Jeremy Quigley")]),
    ).resolves.toBe("redaction-incomplete");
  });

  /**
   * The same case pinned directly, as the bounds pin does it, because the
   * refusal above asserts only the kind, which a surviving glyph or a self
   * check regression would satisfy just as well (spec 0004, AC-13 and the size
   * change limit in *Security model*). The text pass runs on the removal band
   * the engine builds, and the page is read back without clipping: nothing
   * ticked survives anywhere, and only ` here` moves, back by the width of
   * `Jeremy ` at 12pt (42.672 pt) times 11/12 less one, 3.556 pt.
   *
   * If this fails because ` here` stays where it was, MuPDF has fixed its
   * filter: mark that upstream item in spec 0004's Follow-up done, and change
   * the case above to expect a clean redaction.
   */
  it("pins the text after the match moving 3.556 pt back, with nothing ticked surviving", () => {
    const source = fixture("reach.pdf");
    const target = tick("reach.pdf", 11, "Jeremy Quigley");
    const before = pageCharacters(source, 11, "clip=no");
    const after = pageCharacters(withTextPass(source, 11, target), 11, "clip=no");
    const at = ({ char, x, y }: { char: string; x: number; y: number }) =>
      `${char}@${x.toFixed(2)},${y.toFixed(2)}`;

    // `pageCharacters` drops whitespace, so the match is its letters in a row.
    const letters = [..."JeremyQuigley"];
    const start = before.findIndex((_, index) =>
      letters.every((char, offset) => before[index + offset]?.char === char),
    );
    expect(start).toBeGreaterThanOrEqual(0);
    const baseline = before[start].y;
    const onLine = ({ y }: { y: number }) => Math.abs(y - baseline) < 0.5;

    const line = before.filter(onLine);
    const matchAt = line.indexOf(before[start]);
    const ahead = line.slice(0, matchAt);
    const behind = line.slice(matchAt + letters.length);
    expect(behind.map(({ char }) => char).join("")).toBe("here");

    // Every other line, and the text ahead of the match, exactly where it was.
    expect(after.filter((entry) => !onLine(entry)).map(at)).toEqual(
      before.filter((entry) => !onLine(entry)).map(at),
    );
    const lineAfter = after.filter(onLine);
    expect(lineAfter.map(({ char }) => char).join("")).toBe("Accountholderhere");
    expect(lineAfter.slice(0, ahead.length).map(at)).toEqual(ahead.map(at));

    // The four letters of ` here`, each moved back along the line and no other way.
    const moved = 42.672 * (11 / 12 - 1);
    lineAfter.slice(ahead.length).forEach((entry, index) => {
      expect(Math.abs(entry.x - behind[index].x - moved)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(entry.y - behind[index].y)).toBeLessThanOrEqual(0.01);
    });
  });
});

/**
 * `bytes` with the text pass run on page `index` over the target's removal
 * band, as the engine builds it, and written out so the helpers can read it.
 */
function withTextPass(
  bytes: ArrayBuffer,
  index: number,
  target: RedactionTarget,
): ArrayBuffer {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf: PDFDocument | null = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF");
    const page = pdf.loadPage(index);
    try {
      textPass(mupdf, page, [target.quads.map(removalBand)]);
    } finally {
      page.destroy();
    }
    const buffer = pdf.saveToBuffer("");
    try {
      return buffer.asUint8Array().slice().buffer;
    } finally {
      buffer.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/**
 * Spec 0004, slice 5: the self check sees text drawn off the page, over
 * `next-line-0.pdf` to `next-line-4.pdf`. One case per file, because a `'`
 * line on any page fails every run on its document. MuPDF 1.28.1's filter
 * moves a line shown with `'` or `"` off the page instead of removing the
 * match on it. Clipped to the page, the check saw the match gone and handed
 * back a file that still held it; extracted without clipping, the moved glyphs
 * are survivors, and the run refuses (AC-4, AC-13, AC-25, INV-12).
 */
describe("text off the page", () => {
  const MATCH = "Jeremy Quigley";
  const name = (index: number) => `next-line-${index}.pdf`;
  const match = (index: number) => tick(name(index), 0, MATCH);
  const unclipped = (bytes: ArrayBuffer) =>
    inspect(bytes, (doc) => pageText(doc, 0, "clip=no"));

  it.each([
    ["'", 0],
    ['"', 1],
  ] as const)(
    "refuses a match alone on a line shown with %s (case %i) with redaction-incomplete",
    async (_operator, index) => {
      await expect(outcomeOf(name(index), [match(index)])).resolves.toBe(
        "redaction-incomplete",
      );
    },
  );

  it("redacts case 2, the same match moved to its line with T*, and passes its own checks", async () => {
    const { output } = await run(name(2), [match(2)]);

    expect(containsInAnyEncoding(decompressedBytes(output), MATCH)).toBe(false);
    expect(unclipped(output)).toContain("Name:");
  });

  /**
   * Kept text moved off the page is a survivor too, and so is it missing.
   * Spec 0006, AC-17: a character centred outside the visible area is a leak
   * whatever is ticked, so with nothing ticked this is no longer the
   * `unsupported` it was under spec 0004 alone.
   */
  it.each([
    ["with the match ticked", "redaction-incomplete", true],
    ["with nothing ticked", "redaction-incomplete", false],
  ] as const)(
    "refuses case 3, kept text on a line shown with ', %s, with %s",
    async (_label, kind, ticked) => {
      await expect(outcomeOf(name(3), ticked ? [match(3)] : [])).resolves.toBe(kind);
    },
  );

  describe("case 4, a line drawn wholly off the page", () => {
    it("is hidden from what detection reads, and on the record the check reads", () => {
      const source = fixture(name(4));

      expect(inspect(source, (doc) => pageText(doc, 0))).not.toContain(OFF_PAGE_TEXT);
      expect(unclipped(source)).toContain(OFF_PAGE_TEXT);
    });

    // Spec 0006, AC-14: nobody can see a line drawn off the page, so every
    // run now removes it, with nothing ticked as well. Spec 0004 kept it.
    it("removes the line off the page with nothing ticked, and raises no false alarm", async () => {
      const { output, removedByType, trim } = await run(name(4), []);

      expect(removedByType).toEqual({});
      expect(unclipped(output)).not.toContain(OFF_PAGE_TEXT);
      expect(unclipped(output)).toContain("Name:");
      expect(trim).toEqual([{ removed: true, picturesKept: false, pixelMode: true }]);
    });

    it("redacts the match on the page and removes the line off it", async () => {
      const { output } = await run(name(4), [match(4)]);

      expect(containsInAnyEncoding(decompressedBytes(output), MATCH)).toBe(false);
      expect(unclipped(output)).not.toContain(OFF_PAGE_TEXT);
    });
  });

  /**
   * MuPDF's fault, pinned directly as the bounds pin does it: a `sanitize`
   * write with nothing removed moves case 0's match off the page, out of
   * default extraction but still in the file. If this fails because the line
   * stays on the page, MuPDF has fixed the filter: mark that upstream item in
   * spec 0004's Follow-up done, and change cases 0, 1 and 3 to expect a clean
   * run.
   */
  it("pins a sanitize write moving a line shown with ' off the page", () => {
    const source = fixture(name(0));
    const written = inspect(source, (doc) => {
      const buffer = doc.saveToBuffer("sanitize");
      try {
        return buffer.asUint8Array().slice().buffer;
      } finally {
        buffer.destroy();
      }
    });

    expect(inspect(source, (doc) => pageText(doc, 0))).toContain(MATCH);
    expect(inspect(written, (doc) => pageText(doc, 0))).not.toContain(MATCH);
    expect(unclipped(written)).toContain(MATCH);
    expect(containsInAnyEncoding(decompressedBytes(written), MATCH)).toBe(true);
  });
});
