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
 * Targets minted the way feature 6 will mint them. Spec 0004, *Standing in for
 * feature 6 in tests*.
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
        return stext.search(needle, "").map((hit) => ({
          page,
          quads: hit.map((quad): Quad => [...quad]),
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
