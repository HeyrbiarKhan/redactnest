import type { PDFDocument, PDFPage } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  boxPass,
  EngineFailure,
  lineBox,
  paddedArea,
  paddedPass,
  PIPELINE,
  redactDocumentWith,
  removalBand,
  silenceEngineLog,
  sweepCarriers,
  textPass,
  type Pass,
  type Pipeline,
  type Quad,
  type RedactionTarget,
} from "@/engine";

import { fixture } from "../support/bytes";
import { mupdf } from "../support/mupdf";
import { findTarget } from "../support/targets";

/**
 * The self check, proved to fire, and the refusals that keep a run honest.
 * Spec 0004, AC-13, AC-14, AC-25, AC-26 and AC-27. The slant and image reach
 * refusals (AC-28, AC-29) are proved over their fixtures in
 * `redaction-matrix.test.ts`.
 *
 * Each part of the check is shown to catch the fault it exists for by running
 * the real engine with one step of its pipeline changed through the test seam
 * (`Pipeline`), or over a fixture built to trip it. Every failing run hands
 * back no file: `redactDocumentWith` rejects, so there is nothing to return.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

const EMAIL = "jane.doe@example.com";

/** The kind a run fails with, or `null` if it produced a file. */
async function kindOf(
  bytes: ArrayBuffer,
  targets: readonly RedactionTarget[],
  pipeline: Pipeline = PIPELINE,
): Promise<string | null> {
  try {
    await redactDocumentWith(mupdf, bytes, targets, {}, pipeline);
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

const skip: Pass = () => {};

describe("the self check fires", () => {
  /** A glyph that survived, seen with replacement text ignored. */
  it("fails with redaction-incomplete when the text pass is skipped", async () => {
    const bytes = fixture("text-page.pdf");

    await expect(
      kindOf(bytes, [findTarget(bytes, 0, EMAIL)], { ...PIPELINE, textPass: skip }),
    ).resolves.toBe("redaction-incomplete");
  });

  /**
   * The OCR text is removed by the text pass either way, so the character
   * check has nothing to see. Only the pixel check can catch the scan's ink
   * left under the box.
   */
  it("fails with redaction-incomplete through the pixel check when a scan's padded pass is skipped", async () => {
    const bytes = fixture("ocr-aligned.pdf");

    await expect(
      kindOf(bytes, [findTarget(bytes, 0, "Quigley")], { ...PIPELINE, paddedPass: skip }),
    ).resolves.toBe("redaction-incomplete");
  });

  /** The first design's removal: at single spacing it takes the lines around. */
  it("fails with redaction-overreach when text is removed on the exact quads", async () => {
    const bytes = fixture("single-spacing.pdf");

    await expect(
      kindOf(bytes, [findTarget(bytes, 0, "Jeremy Quigley")], {
        ...PIPELINE,
        removalArea: (quad) => quad,
      }),
    ).resolves.toBe("redaction-overreach");
  });

  it("fails with redaction-incomplete when a carrier survives the rebuild", async () => {
    await expect(
      kindOf(fixture("metadata.pdf"), [], { ...PIPELINE, sweepCarriers: () => {} }),
    ).resolves.toBe("redaction-incomplete");
  });

  /**
   * A run with nothing ticked cannot have leaked or reached too far, so a
   * difference in its characters, forced here by dropping a page's drawing
   * after the rebuild, is `unsupported`.
   */
  it("fails with unsupported when a run with nothing ticked changes a page's characters", async () => {
    const dropFirstPage = (out: PDFDocument) => {
      sweepCarriers(out);
      out.findPage(0).delete("Contents");
    };

    await expect(
      kindOf(fixture("two-pages.pdf"), [], { ...PIPELINE, sweepCarriers: dropFirstPage }),
    ).resolves.toBe("unsupported");
  });

  /**
   * A leak outranks an over removal, and the check compares every page before
   * naming a kind, so the leak is found even when the over removal comes
   * first: page 1 loses its neighbours to the exact quads, and page 2 keeps
   * its match because its text pass is skipped.
   */
  it("names the leak, not the over removal, even when the over removal is on an earlier page", async () => {
    const bytes = fixture("single-spacing.pdf");
    let calls = 0;
    const firstPageOnly: Pass = (engine, page, areas) => {
      calls += 1;
      if (calls === 1) textPass(engine, page, areas);
    };

    await expect(
      kindOf(
        bytes,
        [findTarget(bytes, 0, "Jeremy Quigley"), findTarget(bytes, 1, "Jeremy Quigley")],
        { ...PIPELINE, removalArea: (quad) => quad, textPass: firstPageOnly },
      ),
    ).resolves.toBe("redaction-incomplete");
    expect(calls).toBe(2);
  });

  it("passes the same runs with the real pipeline", async () => {
    const letter = fixture("text-page.pdf");
    const scan = fixture("ocr-aligned.pdf");
    const spaced = fixture("single-spacing.pdf");

    await expect(kindOf(letter, [findTarget(letter, 0, EMAIL)])).resolves.toBeNull();
    await expect(kindOf(scan, [findTarget(scan, 0, "Quigley")])).resolves.toBeNull();
    await expect(
      kindOf(spaced, [
        findTarget(spaced, 0, "Jeremy Quigley"),
        findTarget(spaced, 1, "Jeremy Quigley"),
      ]),
    ).resolves.toBeNull();
  });
});

/**
 * Spec 0004, AC-26. A match inside replacement text wider than itself: MuPDF
 * keeps the span's whole string when it removes only some of the span's
 * glyphs, and the engine never edits a content stream to trim it. So the run
 * refuses, whichever form the span takes.
 */
describe("a match inside wider replacement text", () => {
  it.each([
    [1, "written inline"],
    [2, "written inline in UTF-16"],
    [3, "named in the page's /Properties"],
  ])("fails with replacement-text when the span is %s (page %i)", async (page) => {
    const bytes = fixture("actual-text.pdf");

    await expect(kindOf(bytes, [findTarget(bytes, page, "SECRET-AT")])).resolves.toBe(
      "replacement-text",
    );
  });
});

/**
 * Spec 0004, AC-13 and AC-25. Text nobody ticked is never lost or hidden in
 * silence: a glyph off the match's line that the band takes, and one the box
 * would cover, each refuse the run.
 */
describe("text that is not on the match's line", () => {
  it("fails with redaction-overreach when a diagonal watermark crosses the match", async () => {
    const bytes = fixture("watermark.pdf");

    await expect(kindOf(bytes, [findTarget(bytes, 0, "SECRET-WM")])).resolves.toBe(
      "redaction-overreach",
    );
  });

  it("fails with redaction-overreach when a superscript would be hidden under the box", async () => {
    const bytes = fixture("superscript.pdf");

    await expect(kindOf(bytes, [findTarget(bytes, 0, "SECRET-SUP")])).resolves.toBe(
      "redaction-overreach",
    );
  });
});

/**
 * Spec 0004, AC-27 and INV-14. Every target is checked against its own text
 * before anything is removed, and one that does not hold up is refused.
 */
describe("a target that does not surround its match", () => {
  function emailTarget(bytes: ArrayBuffer): RedactionTarget {
    return findTarget(bytes, 0, EMAIL);
  }

  /** Every quad moved `by` points down the page. */
  function moved(target: RedactionTarget, by: number): RedactionTarget {
    return {
      ...target,
      quads: target.quads.map(([ulx, uly, urx, ury, llx, lly, lrx, lry]): Quad => [
        ulx,
        uly + by,
        urx,
        ury + by,
        llx,
        lly + by,
        lrx,
        lry + by,
      ]),
    };
  }

  it.each([
    ["shifted a line down", (target: RedactionTarget) => moved(target, 20)],
    ["on the wrong page", (target: RedactionTarget) => ({ ...target, page: 1 })],
    [
      "on a page that does not exist",
      (target: RedactionTarget) => ({ ...target, page: 7 }),
    ],
    [
      "holding a quad that crosses itself",
      (target: RedactionTarget) => {
        const [ulx, uly, urx, ury, llx, lly, lrx, lry] = target.quads[0];
        const crossed: Quad = [ulx, uly, urx, ury, lrx, lry, llx, lly];
        return { ...target, quads: [crossed] };
      },
    ],
    [
      "holding a quad with a side under half a point",
      (target: RedactionTarget) => {
        const [ulx, uly, , , llx, lly] = target.quads[0];
        const hairline: Quad = [ulx, uly, ulx + 0.4, uly, llx, lly, llx + 0.4, lly];
        return { ...target, quads: [hairline] };
      },
    ],
    [
      "holding a sound trapezoid, 4 pt wide at the top and 24 pt at the bottom, whose padded area crosses itself",
      (target: RedactionTarget) => {
        const [ulx, uly, urx, , , lly] = target.quads[0];
        const middle = (ulx + urx) / 2;
        const trapezoid: Quad = [
          middle - 2,
          uly,
          middle + 2,
          uly,
          middle - 12,
          lly,
          middle + 12,
          lly,
        ];
        return { ...target, quads: [trapezoid] };
      },
    ],
    ["holding no quads", (target: RedactionTarget) => ({ ...target, quads: [] })],
    [
      "naming other text",
      (target: RedactionTarget) => ({ ...target, text: "john.roe@example.com" }),
    ],
    ["naming no text", (target: RedactionTarget) => ({ ...target, text: " " })],
  ])(
    "is refused with unsupported when it is %s, before anything is removed",
    async (_label, spoil) => {
      const bytes = fixture("text-page.pdf");
      const before = new Uint8Array(bytes).slice();
      const onPhase = vi.fn();

      await expect(
        redactDocumentWith(mupdf, bytes, [spoil(emailTarget(bytes))], { onPhase }),
      ).rejects.toMatchObject({ errorKind: "unsupported" });

      expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual(["redacting"]);
      expect(new Uint8Array(bytes)).toEqual(before);
    },
  );

  it("accepts the same target unspoiled", async () => {
    const bytes = fixture("text-page.pdf");

    await expect(kindOf(bytes, [emailTarget(bytes)])).resolves.toBeNull();
  });

  /** Whitespace goes on both sides, so a match across a line break holds up. */
  it("accepts a match across two lines, whitespace and all", async () => {
    const bytes = fixture("two-lines.pdf");

    await expect(
      kindOf(bytes, [findTarget(bytes, 0, "jane.doe@ example.com")]),
    ).resolves.toBeNull();
  });
});

/**
 * Spec 0004, *Redaction settings*. After every pass the page holds no `Redact`
 * annotation, so the next pass cannot apply one with its own settings and the
 * rebuild cannot carry one.
 */
describe("each pass", () => {
  function redactMarks(page: PDFPage): number {
    const annotations = page.getObject().get("Annots");
    let count = 0;
    if (annotations.isArray()) {
      annotations.forEach((annotation) => {
        if (annotation.get("Subtype").asName() === "Redact") count += 1;
      });
    }
    return count;
  }

  it("leaves no Redact annotation behind, pass after pass", () => {
    const bytes = fixture("text-page.pdf");
    const quads = findTarget(bytes, 0, EMAIL).quads;
    const doc: PDFDocument | null = mupdf.Document.openDocument(
      bytes,
      "application/pdf",
    ).asPDF();
    if (!doc) throw new Error("expected a PDF");

    try {
      const page = doc.loadPage(0);
      try {
        const passes: [Pass, (quad: Quad) => Quad][] = [
          [textPass, removalBand],
          [paddedPass, paddedArea],
          [boxPass, lineBox],
        ];
        for (const [pass, area] of passes) {
          pass(mupdf, page, [quads.map(area)]);
          expect(redactMarks(page)).toBe(0);
        }
      } finally {
        page.destroy();
      }
    } finally {
      doc.destroy();
    }
  });
});
