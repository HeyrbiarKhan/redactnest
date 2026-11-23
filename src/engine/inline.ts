import type { PDFDocument, PDFObject } from "mupdf";

import { walkRoles, type RoleWalk } from "./allowlist";
import { readDrawing } from "./marked";

/**
 * Inline pictures MuPDF's write would lose. Spec 0022.
 *
 * MuPDF 1.28.1 writes an inline picture's colour space only as the name under
 * its `/CS`, so a palette or any other space written inline leaves as `/CS/`,
 * an empty name, and the cleaned copy draws nothing there with the check
 * passing (spec 0022, `rationale.md`). MuPDF.js offers no way round the write,
 * and the engine never edits a content stream (spec 0004, INV-13), so such a
 * file is refused (INV-2).
 *
 * The open refuses it from its own inspection of each page; this is the same
 * question asked by a run, on its own prepared working copy, before anything
 * is removed (AC-3). Both read `losesPicture` from `marked.ts`, the one place
 * that reads drawing instructions, so the open, the run and the check never
 * disagree on a source (INV-1). It refuses and nothing else.
 */

/** Whether a document holds an inline picture MuPDF's write would lose. */
export type InlineVerdict = "kept" | "lost";

/**
 * Judge every drawing a walk names for the pages: their contents, and every
 * form, tiling pattern and Type 3 glyph procedure they draw. Spec 0022, AC-3.
 *
 * Pure, and takes a walk, as `judgeGlyphs` does, so the glyph rule and this
 * one could later share one walk as a drop in. A drawing several pages draw is
 * read once, since its answer depends only on its streams. A drawing the scan
 * cannot read gives no answer here and keeps its `marked-descriptions`
 * warning, as at open (INV-4's one exception).
 */
export function judgeInlinePictures(walk: RoleWalk): InlineVerdict {
  const read = new Set<string>();
  for (const units of walk.pages) {
    for (const unit of units) {
      const key = drawingKey(unit.streams, unit.joined);
      if (key !== null) {
        if (read.has(key)) continue;
        read.add(key);
      }
      const reading = readDrawing(unit.streams, null, unit.joined);
      if (reading !== "unsure" && reading.losesPicture) return "lost";
    }
  }
  return "kept";
}

/**
 * The inline picture rule on a prepared copy, as the run's `Pipeline` seam
 * asks it (spec 0022, AC-3): one read only walk from the pages, `"problem"`
 * at once when that walk names one (its units are then empty, so nothing could
 * be judged), else `judgeInlinePictures`.
 */
export function inlineRuleOf(doc: PDFDocument): InlineVerdict | "problem" {
  const walk = walkRoles(doc, "read", "pages");
  if (walk.problem !== null) return "problem";
  return judgeInlinePictures(walk);
}

/** A drawing's streams by object number, or `null` when one is written in place. */
function drawingKey(streams: readonly PDFObject[], joined: boolean): string | null {
  const numbers: number[] = [];
  for (const stream of streams) {
    if (!stream.isIndirect()) return null;
    numbers.push(stream.asIndirect());
  }
  return `${joined ? "J" : "A"} ${numbers.join(" ")}`;
}
