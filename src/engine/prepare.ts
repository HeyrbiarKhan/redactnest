import type { PDFDocument } from "mupdf";

import type { MuPdf } from "./load";

/**
 * The one shared prepare step. Spec 0004, AC-22 and INV-9.
 *
 * Detection and redaction have to read the same page, or a value can be found
 * in one place and removed from another. So the review copy is prepared with
 * this once, at open, before a single character is extracted, and every working
 * copy is prepared with it again before its targets are applied. Anything that
 * changes what a page shows belongs in here, never applied to one copy alone.
 *
 * In order:
 *
 *  1. Delete every annotation a viewer never shows: flagged hidden, no view or
 *     invisible. Flattening would otherwise paint content nobody reviewed into
 *     the page.
 *  2. Delete every Redact mark the source already carried. The exact pass
 *     applies every Redact annotation on a page, so one left in place would
 *     remove text nobody ticked, and flattening one would bake its overlay in.
 *  3. Flatten forms and visible annotations into the page, so a filled field
 *     and a typed comment are page text that detection can find and redaction
 *     can remove. A field MuPDF regenerates the appearance of is regenerated
 *     here, on both copies alike, so it lands where it was reviewed.
 */
export function prepareDocument(mupdf: MuPdf, doc: PDFDocument): void {
  const unseen =
    mupdf.PDFAnnotation.IS_HIDDEN |
    mupdf.PDFAnnotation.IS_NO_VIEW |
    mupdf.PDFAnnotation.IS_INVISIBLE;

  const pageCount = doc.countPages();

  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.loadPage(index);
    try {
      // Widgets are annotations in the file, and MuPDF lists them apart. A
      // hidden form field is exactly as unseen as a hidden comment.
      const annotations = [...page.getAnnotations(), ...page.getWidgets()];

      for (const annotation of annotations) {
        const hidden = (annotation.getFlags() & unseen) !== 0;
        if (hidden || annotation.getType() === "Redact") {
          page.deleteAnnotation(annotation);
        }
      }
    } finally {
      page.destroy();
    }
  }

  doc.bake(true, true);
}
