import type { Buffer as MuBuffer, PDFDocument, PDFObject } from "mupdf";

import {
  decodeTextString,
  holdsTicked,
  readsAsLanguageTag,
  walkRoles,
} from "./allowlist";
import { EngineFailure } from "./failure";
import type { MuPdf } from "./load";
import { forEachDictionary, keepOnly } from "./objects";

/**
 * The rebuild: a brand new document made from the redacted pages alone.
 *
 * Spec 0004, INV-3. The output carries nothing from the source that the rebuild
 * did not choose to carry. It is an allowlist at the catalog and at each page,
 * a typed allowlist for every object below them (`pruneToRoles`, spec 0019), a
 * sweep for known carriers kept as a backstop, and a write that keeps only the
 * resources each page actually draws, run a second time only on the self
 * check's `unused-colour-space` verdict (`rewriteOutput`, spec 0019, AC-15).
 * Subtracting known keys from the source
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
 * source had one, so a screen reader still picks the right voice, and since
 * spec 0021 only when it reads as a language tag holding nothing ticked
 * (`graftPages`, its AC-1): no page needs it to draw, so anything else is left
 * out rather than refused.
 */
export const CATALOG_KEYS: readonly string[] = Object.freeze(["Type", "Pages", "Lang"]);

/**
 * Keys that carry data below the catalog and the pages, deleted from every
 * object in the new document wherever a producer nested them: XMP packets,
 * private application data, thumbnails, automatic actions, associated files and
 * modification dates.
 *
 * Since spec 0019 the prune deletes all of them first, as keys off every
 * role's list, so the sweep is a backstop. Never widened key by key: a key the
 * output must not keep is already off the lists, and one it must keep is a
 * `ROLES` change with a failing fixture as its proof (INV-6).
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
 * Copy the written file out of MuPDF's heap into a fresh `ArrayBuffer`, then
 * hand MuPDF's buffer straight back. Shared by both writes, so the bytes the
 * self check reads are always the engine's own copy (spec 0004, INV-2).
 *
 * `asUint8Array()` is a view into the WebAssembly heap, not a copy, so the
 * `slice()` is load bearing: without it the output would be memory MuPDF is
 * about to reuse.
 */
export function takeOutput(written: MuBuffer): ArrayBuffer {
  try {
    return written.asUint8Array().slice().buffer;
  } finally {
    written.destroy();
  }
}

/**
 * The second write: the first write's bytes, opened and saved again with
 * `WRITE_OPTIONS`, and nothing else called on that document. Spec 0019, AC-15
 * and INV-8.
 *
 * MuPDF's `sanitize` keeps the `/ColorSpace` entry of a space it fails to
 * load and draws with a device colour instead, so nothing names the entry; a
 * second pass of the same filter reads only the device colour and drops it.
 * The engine never deletes the entry itself (spec 0004, INV-13): which spaces
 * MuPDF can load is MuPDF's call, and so is what its filter keeps.
 *
 * Nothing is called on the document but `asPDF` and `saveToBuffer`, never a
 * `.resolve()`, because a stream MuPDF was asked to resolve leaves with no
 * data when the deduplicating write merges what it points to (AC-16). A file
 * that does not open as a PDF fails the run with `redaction-incomplete`, and
 * the run treats any throw from here the same way. The document and the buffer
 * are destroyed on every path out.
 */
export function rewriteOutput(mupdf: MuPdf, bytes: ArrayBuffer): ArrayBuffer {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new EngineFailure("redaction-incomplete");
    return takeOutput(pdf.saveToBuffer(WRITE_OPTIONS));
  } finally {
    doc.destroy();
  }
}

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
 *
 * Spec 0021, AC-1: the catalog's `/Lang` is copied only when it is a string
 * that reads as a language tag and holds none of `ticked` (the run's folded
 * texts, `foldTicked`), and then as written, direct or indirect. Anything else
 * is left out, with no refusal and nothing reported.
 */
export function graftPages(
  mupdf: MuPdf,
  work: PDFDocument,
  ticked: readonly string[],
): PDFDocument {
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
    if (keepsLang(lang, ticked)) {
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
 * Is this catalog `/Lang` a language tag holding nothing ticked? Its bytes are
 * read through the reference with `asByteString()`, never resolved, and
 * decoded as the scan decodes a string (spec 0021, AC-1). A name, a number, an
 * empty string, free text or a string that cannot be decoded is no tag.
 */
function keepsLang(lang: PDFObject, ticked: readonly string[]): boolean {
  if (!lang.isString()) return false;
  const bytes = lang.asByteString();
  if (!readsAsLanguageTag(bytes)) return false;
  return !holdsTicked(decodeTextString(bytes) ?? "", ticked);
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
 * Every object below the catalog and the pages, cut to its role's list. Spec
 * 0019, AC-1 to AC-3.
 *
 * Runs on the rebuilt document after `stripToAllowlist` and before the sweep.
 * The walk gives each object a role from the key that reached it and deletes
 * every key, at any depth, that the role does not need to draw, so whatever
 * only that key reached is left unreferenced and the write's
 * `garbage=deduplicate` drops it: a font's private key on the original copy of
 * a redacted figure, a figure's embedded file, pdfTeX's notes on where a figure
 * came from. It deletes keys and nothing else, so it never removes less than
 * main from what a page draws (INV-7).
 *
 * A shape the walk cannot read refuses the run with `unreadable-structure`
 * before anything is written, and leaves the document as it was.
 */
export function pruneToRoles(out: PDFDocument): void {
  if (walkRoles(out, "prune").problem !== null) {
    throw new EngineFailure("unreadable-structure");
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
