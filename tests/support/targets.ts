import type { PDFDocument } from "mupdf";

import {
  EXTRACTION_OPTIONS,
  prepareDocument,
  type Quad,
  type RedactionTarget,
} from "@/engine";
import type { DetectorKind } from "@/worker/protocol";

import { mupdf } from "./mupdf";

/**
 * MuPDF.js 1.28.1 caps `search()` at 500 quads (`max_hits` in `runSearch`) and
 * drops the rest without saying so. Spec 0005, AC-25: an answer of exactly 500
 * may have been cut short, so no test may trust it.
 */
export const SEARCH_QUAD_CAP = 500;

/** `search()` on structured text, refusing an answer the cap may have cut short. */
export function searchQuads(
  stext: { search(needle: string, options: string): Quad[][] },
  needle: string,
): Quad[][] {
  const hits = stext.search(needle, "");
  const quads = hits.reduce((total, hit) => total + hit.length, 0);
  if (quads >= SEARCH_QUAD_CAP) {
    throw new Error(
      `search() returned ${quads} quads for "${needle}": it may be cut short`,
    );
  }
  return hits.map((hit) => hit.map((quad): Quad => [...quad]));
}

/**
 * Targets minted as spec 0004's stand in for feature 6. Spec 0004, *Standing
 * in for feature 6 in tests*; the real detection is `OpenDocument.findMatches`
 * (spec 0005), which `tests/unit/detection.test.ts` compares against this.
 *
 * The fixture is opened and prepared exactly as the review copy is, then
 * searched through structured text extracted with the engine's own
 * `EXTRACTION_OPTIONS`, so quads land in the same page space a detector's
 * will. `text` is the needle, and the fixtures are written so its case matches
 * the page.
 */
export function findTargets(
  bytes: ArrayBuffer,
  page: number,
  needle: string,
  kind: DetectorKind = "email",
): RedactionTarget[] {
  const doc = openPrepared(bytes);
  try {
    const loaded = doc.loadPage(page);
    try {
      const stext = loaded.toStructuredText(EXTRACTION_OPTIONS[0]);
      try {
        // MuPDF's default search: case sensitive, as a detector matches.
        return searchQuads(stext, needle).map((quads) => ({
          page,
          quads,
          start: 0,
          end: needle.length,
          kind,
          text: needle,
        }));
      } finally {
        stext.destroy();
      }
    } finally {
      loaded.destroy();
    }
  } finally {
    doc.destroy();
  }
}

/** The one match of `needle` on `page`, or the `occurrence`th when there are more. */
export function findTarget(
  bytes: ArrayBuffer,
  page: number,
  needle: string,
  kind: DetectorKind = "email",
  occurrence = 0,
): RedactionTarget {
  const found = findTargets(bytes, page, needle, kind)[occurrence];
  if (!found) throw new Error(`"${needle}" not found on page ${page}`);
  return found;
}

function openPrepared(bytes: ArrayBuffer): PDFDocument {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  const pdf: PDFDocument | null = doc.asPDF();
  if (!pdf) {
    doc.destroy();
    throw new Error("expected a PDF");
  }
  prepareDocument(mupdf, pdf);
  return pdf;
}
