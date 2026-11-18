import type { PDFObject } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  openDocumentWith,
  PIPELINE,
  redactDocumentWith,
  silenceEngineLog,
  type Pipeline,
  type RedactionTarget,
} from "@/engine";

import { GLYPH_TEXT } from "../../scripts/lib/glyph-fixtures.mjs";
import { fixture } from "../support/bytes";
import {
  containsInAnyEncoding,
  decodedStreams,
  decompressedBytes,
  inspect,
  LIMITS,
  mupdf,
  pageRenders,
} from "../support/mupdf";
import { findTarget } from "../support/targets";

/**
 * Type 3 glyphs stay inside their font. Spec 0020, AC-5 to AC-9.
 *
 * A Type 3 font draws each character with a glyph procedure nothing in
 * RedactNest can see inside. Each of the first four fixtures is a case
 * measured on 2026-11-17 where main made a file that passed its check and
 * still held the ticked value, through a glyph that names the form or picture
 * the page draws (drawn by text or not) or writes the value as text of its
 * own. Each failed here on main first (spec 0004, INV-3). The last two are the
 * controls, in the shapes Chrome and a bitmap font write, which open and
 * redact as they do today.
 *
 * Every output is read with `tests/support/mupdf.ts`, which shares no code
 * with the engine, so a test never just proves the engine agrees with itself.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

/** The measured cases, each with the value its ticked set ticks (AC-8). */
const REFUSED = [
  ["glyph-undrawn-form.pdf", GLYPH_TEXT.form],
  ["glyph-drawn-form.pdf", GLYPH_TEXT.form],
  ["glyph-shared-picture.pdf", GLYPH_TEXT.picture],
  ["glyph-text.pdf", GLYPH_TEXT.form],
] as const;

/** The controls, each with the value its ticked set ticks (AC-9). */
const CONTROLS = [
  ["glyph-emoji.pdf", GLYPH_TEXT.emoji],
  ["glyph-bitmap.pdf", GLYPH_TEXT.bitmap],
] as const;

/** The run with the glyph rule swapped out, as main runs it (AC-7, AC-10). */
const SKIP_GLYPHS: Pipeline = { ...PIPELINE, judgeGlyphs: () => "clean" };

/** The kind an open refuses with, or `null` if it opened. */
async function openKind(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    doc.close();
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

/** The kind a run fails with, or `null` if it made a file. */
async function runKind(
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

/** Is this decoded stream an image mask? */
function isMask({ dict }: { readonly dict: PDFObject }): boolean {
  const flag = dict.get("ImageMask");
  return flag.isBoolean() && flag.asBoolean();
}

describe("the measured cases, refused (AC-5, AC-6, AC-8)", () => {
  it.each(REFUSED)("refuses %s at open with unreadable-structure", async (name) => {
    await expect(openKind(fixture(name))).resolves.toBe("unreadable-structure");
  });

  it.each(REFUSED)(
    "refuses %s in a run with nothing ticked, before anything is removed",
    async (name) => {
      await expect(runKind(fixture(name), [])).resolves.toBe("unreadable-structure");
    },
  );

  it.each(REFUSED)(
    "refuses %s in a run with its ticked set, before anything is removed",
    async (name, needle) => {
      const bytes = fixture(name);
      await expect(runKind(bytes, [findTarget(bytes, 0, needle)])).resolves.toBe(
        "unreadable-structure",
      );
    },
  );
});

/**
 * AC-7: the check holds what the written bytes can show. With the run's glyph
 * rule swapped out, text below a glyph still fails the check, while a shared
 * picture cannot be seen on the written bytes at all: the page names MuPDF's
 * blanked copy and the glyph the original. That gap is pinned here so it stays
 * visible, and only the refusals at open and before the passes hold it.
 */
describe("the check alone, with the glyph rule skipped (AC-7)", () => {
  it.each([
    ["glyph-undrawn-form.pdf"],
    ["glyph-drawn-form.pdf"],
    ["glyph-text.pdf"],
  ] as const)("fails %s with redaction-incomplete, text below a glyph", async (name) => {
    const bytes = fixture(name);
    await expect(
      runKind(bytes, [findTarget(bytes, 0, GLYPH_TEXT.form)], SKIP_GLYPHS),
    ).resolves.toBe("redaction-incomplete");
  });

  it("makes a file from glyph-shared-picture.pdf still holding the original picture beside its blanked copy", async () => {
    const bytes = fixture("glyph-shared-picture.pdf");
    const original = inspect(bytes, (doc) => {
      const masks = decodedStreams(doc).filter(isMask);
      expect(masks).toHaveLength(1);
      return Buffer.from(masks[0].data);
    });

    const { output } = await redactDocumentWith(
      mupdf,
      bytes,
      [findTarget(bytes, 0, GLYPH_TEXT.picture)],
      {},
      SKIP_GLYPHS,
    );

    const masks = inspect(output, (doc) =>
      decodedStreams(doc)
        .filter(isMask)
        .map(({ data }) => Buffer.from(data)),
    );
    expect(masks.filter((mask) => original.equals(mask))).toHaveLength(1);
    expect(masks.filter((mask) => !original.equals(mask))).toHaveLength(1);
  });
});

describe("what still opens (AC-9)", () => {
  it.each(CONTROLS)("opens %s with no page finding, as main did", async (name) => {
    const doc = await openDocumentWith(mupdf, fixture(name), LIMITS);
    try {
      expect(doc.summary.pages.map(({ findings }) => findings)).toEqual([[]]);
    } finally {
      doc.close();
    }
  });

  it.each(CONTROLS)(
    "runs %s with nothing ticked, passes the check, and draws every page as main does",
    async (name) => {
      const now = await redactDocumentWith(mupdf, fixture(name), []);
      const main = await redactDocumentWith(mupdf, fixture(name), [], {}, SKIP_GLYPHS);

      expect(pageRenders(now.output)).toEqual(pageRenders(main.output));
    },
  );

  it.each(CONTROLS)(
    "runs %s with its ticked set, the value gone, and draws every page as main does",
    async (name, needle) => {
      const bytes = fixture(name);
      const targets = [findTarget(bytes, 0, needle)];
      const now = await redactDocumentWith(mupdf, bytes, targets);
      const main = await redactDocumentWith(mupdf, bytes, targets, {}, SKIP_GLYPHS);

      expect(containsInAnyEncoding(decompressedBytes(now.output), needle)).toBe(false);
      expect(pageRenders(now.output)).toEqual(pageRenders(main.output));
    },
  );
});
