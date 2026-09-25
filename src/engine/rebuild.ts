import type { PDFDocument } from "mupdf";

import type { MuPdf } from "./load";
import { forEachDictionary, keepOnly } from "./objects";

/**
 * The rebuild: a brand new document made from the redacted pages alone.
 *
 * Spec 0004, INV-3. The output carries nothing from the source that the rebuild
 * did not choose to carry. It is an allowlist at the catalog and at each page,
 * a sweep for known carriers below them, and a write that keeps only the
 * resources each page actually draws. Subtracting known keys from the source
 * instead would carry across anything nobody thought to list, and a future PDF
 * feature that hides data somewhere new would ride along until somebody
 * noticed.
 *
 * Every list and option here is a constant, so changing one is a reviewed code
 * change with a failing fixture as its proof.
 */

/**
 * The keys a page may keep. Everything else a page carried (annotations,
 * thumbnails, actions, private data, structure parents) is deleted after
 * grafting, whatever the graft chose to copy.
 */
export const PAGE_KEYS: readonly string[] = Object.freeze([
  "Type",
  "Parent",
  "MediaBox",
  "CropBox",
  "BleedBox",
  "TrimBox",
  "ArtBox",
  "Rotate",
  "UserUnit",
  "Resources",
  "Contents",
  "Group",
]);

/**
 * The keys the catalog, the file's root object, may keep. `/Lang` only when the
 * source had one, so a screen reader still picks the right voice.
 */
export const CATALOG_KEYS: readonly string[] = Object.freeze(["Type", "Pages", "Lang"]);

/**
 * Keys that carry data below the catalog and the pages, deleted from every
 * object in the new document wherever a producer nested them: XMP packets,
 * private application data, thumbnails, automatic actions, associated files and
 * modification dates.
 */
export const CARRIER_KEYS: readonly string[] = Object.freeze([
  "Metadata",
  "PieceInfo",
  "Thumb",
  "AA",
  "AF",
  "LastModified",
]);

/**
 * How the new document is written.
 *
 * `sanitize` rewrites every page's content through MuPDF's filter, so each page
 * keeps only the resources it actually draws. That is what stops an unredacted
 * form XObject surviving in a resource dictionary shared with a page that never
 * draws it. `garbage=deduplicate` then drops every object nothing refers to any
 * more. Never `incremental` (which would append to a source), never `encrypt`
 * (spec 0004, AC-10: the output is unrestricted), never `linearize`.
 */
export const WRITE_OPTIONS = "garbage=deduplicate,compress,sanitize";

/**
 * Graft every page of the working copy into a new document.
 *
 * One graft map for the whole run, so a font or an image shared by several
 * pages is copied once. MuPDF's page graft copies the contents, the resources
 * and the page boxes and nothing else, and it is not relied on to carry the
 * transparency group, so `/Group` is grafted through the same map explicitly
 * (AC-9).
 *
 * The map holds a reference to the working copy, so it is dropped before this
 * returns. That is what lets the caller's destroy of the working copy actually
 * free it.
 */
export function graftPages(mupdf: MuPdf, work: PDFDocument): PDFDocument {
  const out = new mupdf.PDFDocument();
  const map = out.newGraftMap();

  try {
    const pageCount = work.countPages();

    for (let index = 0; index < pageCount; index += 1) {
      map.graftPage(index, work, index);

      const group = work.findPage(index).get("Group");
      if (!group.isNull()) {
        out.findPage(index).put("Group", map.graftObject(group));
      }
    }

    const lang = work.getTrailer().get("Root", "Lang");
    if (!lang.isNull()) {
      out.getTrailer().get("Root").put("Lang", map.graftObject(lang));
    }

    return out;
  } catch (failure) {
    out.destroy();
    throw failure;
  } finally {
    map.destroy();
  }
}

/**
 * Cut the catalog and every page down to their allowlists.
 *
 * A fresh MuPDF document puts an `/Info` in its own catalog, and this is what
 * takes it out again.
 */
export function stripToAllowlist(out: PDFDocument): void {
  keepOnly(out.getTrailer().get("Root"), CATALOG_KEYS);

  const pageCount = out.countPages();
  for (let index = 0; index < pageCount; index += 1) {
    keepOnly(out.findPage(index), PAGE_KEYS);
  }
}

/**
 * Every carrier key, off every dictionary in the document, recursing into the
 * dictionaries written directly inside each one. The allowlists cover the
 * catalog and the pages; this covers what hangs below them.
 */
export function sweepCarriers(out: PDFDocument): void {
  forEachDictionary(out, (dict) => {
    for (const key of CARRIER_KEYS) dict.delete(key);
  });
}
