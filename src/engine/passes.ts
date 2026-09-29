import type { Quad as MuQuad, PDFPage } from "mupdf";

import { EngineFailure } from "./failure";
import type { MuPdf } from "./load";
import type { Quad } from "./types";

/**
 * The three passes a target page goes through, in this order. Spec 0004,
 * *Redaction settings*.
 *
 * Each pass marks the page with one `Redact` annotation per target, its areas
 * set as quad points with no interior colour and no overlay text, then makes
 * one `applyRedactions` call. All four settings are written out at each call
 * site even where they match MuPDF's defaults (INV-5), so a library upgrade
 * that changed a default cannot quietly change what is removed.
 *
 *  1. The text pass, on the removal bands, removes text and nothing else.
 *  2. The padded pass, on the padded areas, blanks image pixels to white and
 *     removes vector marks it fully covers: scan ink the OCR text layer missed,
 *     an underline, a match drawn as outlines. It removes no text.
 *  3. The box pass, on the line boxes, draws the black box and removes nothing.
 *     Last, so the padded pass can never take a new box for covered line art.
 *
 * `areas` holds one entry per target on the page: that target's quads, already
 * turned into the pass's area.
 */
export type Pass = (
  mupdf: MuPdf,
  page: PDFPage,
  areas: readonly (readonly Quad[])[],
) => void;

export const textPass: Pass = (mupdf, page, areas) => {
  const { PDFPage: Settings } = mupdf;
  markThenApply(page, areas, () =>
    page.applyRedactions(
      false,
      Settings.REDACT_IMAGE_NONE,
      Settings.REDACT_LINE_ART_NONE,
      Settings.REDACT_TEXT_REMOVE,
    ),
  );
};

export const paddedPass: Pass = (mupdf, page, areas) => {
  const { PDFPage: Settings } = mupdf;
  markThenApply(page, areas, () =>
    page.applyRedactions(
      false,
      Settings.REDACT_IMAGE_PIXELS,
      Settings.REDACT_LINE_ART_REMOVE_IF_COVERED,
      Settings.REDACT_TEXT_NONE,
    ),
  );
};

export const boxPass: Pass = (mupdf, page, areas) => {
  const { PDFPage: Settings } = mupdf;
  markThenApply(page, areas, () =>
    page.applyRedactions(
      true,
      Settings.REDACT_IMAGE_NONE,
      Settings.REDACT_LINE_ART_NONE,
      Settings.REDACT_TEXT_NONE,
    ),
  );
};

/**
 * The trim's pass (spec 0006, AC-14): the strips outside the visible area,
 * each its own `Redact` mark, applied with no box, text removed, line art
 * removed when one strip covers it, and no image touched (AC-15, INV-11). All
 * four settings written out, as every pass here writes them (INV-5).
 */
export function trimPass(mupdf: MuPdf, page: PDFPage, strips: readonly Quad[]): void {
  const { PDFPage: Settings } = mupdf;
  markThenApply(
    page,
    strips.map((strip) => [strip]),
    () =>
      page.applyRedactions(
        false,
        Settings.REDACT_IMAGE_NONE,
        Settings.REDACT_LINE_ART_REMOVE_IF_COVERED,
        Settings.REDACT_TEXT_REMOVE,
      ),
  );
}

/**
 * Mark the page, apply, and prove nothing was left behind.
 *
 * A `Redact` annotation still on the page after the call would be applied again
 * by the next pass with that pass's settings, and would reach the rebuild as an
 * annotation. Either way the page would no longer be what the passes decided,
 * so the run stops.
 */
function markThenApply(
  page: PDFPage,
  areas: readonly (readonly Quad[])[],
  apply: () => void,
): void {
  for (const quads of areas) {
    const mark = page.createAnnotation("Redact");
    mark.setQuadPoints(quads.map((quad): MuQuad => [...quad]));
  }

  apply();

  if (holdsRedactMark(page)) {
    throw new EngineFailure("unsupported");
  }
}

/**
 * Read from the page object rather than `getAnnotations()`, which answers from
 * a list MuPDF.js keeps on its side and does not refresh when a redaction
 * deletes annotations natively.
 */
function holdsRedactMark(page: PDFPage): boolean {
  const annotations = page.getObject().get("Annots");
  if (!annotations.isArray()) return false;

  let found = false;
  annotations.forEach((annotation) => {
    const subtype = annotation.get("Subtype");
    if (subtype.isName() && subtype.asName() === "Redact") found = true;
  });
  return found;
}
