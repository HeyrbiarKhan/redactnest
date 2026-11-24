import type { Buffer as MuBuffer, PDFDocument, PDFObject } from "mupdf";

import {
  decodeTextString,
  holdsTicked,
  readsAsLanguageTag,
  walkRoles,
} from "./allowlist";
import { EngineFailure } from "./failure";
import type { MuPdf } from "./load";
import { forEachDictionary, hasKey, keepOnly } from "./objects";
import {
  decodingParts,
  joinParts,
  readPicture,
  sameDecodingParts,
  type PictureKind,
  type PicturePart,
} from "./picture-reader";

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

/**
 * What a strip dropped across every picture: an XMP packet, and anything
 * else. Spec 0025, AC-9. Only these two kinds cross the worker boundary,
 * never which picture, how many or what a part held (INV-5).
 */
export interface PictureReport {
  readonly xmp: boolean;
  readonly details: boolean;
}

/** How the new bytes are built from a strip's parts; a test swaps it to prove the guard (AC-6). */
export type JoinParts = (bytes: Uint8Array, parts: readonly PicturePart[]) => Uint8Array;

/**
 * Which container a picture's filter names, or `null` when the reader leaves
 * it alone. Spec 0025, AC-1: a direct `/DCTDecode` or `/JPXDecode` name, or a
 * direct array of one such name. Any other filter, a chain, an indirect
 * `/Filter`, the inline short names `/DCT` and `/JPX`, and a stream whose data
 * lives in an external file (`/F`) are `null`. Read through the reference,
 * never resolved (INV-3). Shared with the self check, so both read the same
 * pictures (INV-2).
 */
export function pictureFilter(ref: PDFObject): PictureKind | null {
  if (hasKey(ref, "F")) return null;
  const filter = ref.get("Filter");
  if (filter.isIndirect()) return null;
  let name: PDFObject = filter;
  if (filter.isArray()) {
    if (filter.length !== 1) return null;
    name = filter.get(0);
    if (name.isIndirect()) return null;
  }
  if (!name.isName()) return null;
  const value = name.asName();
  if (value === "DCTDecode") return "jpeg";
  if (value === "JPXDecode") return "jpx";
  return null;
}

/**
 * A picture's stored bytes, copied out of MuPDF's heap before its buffer is
 * destroyed, read raw through the reference (spec 0025, *Value sourcing*).
 */
export function storedPicture(ref: PDFObject): Uint8Array {
  const raw = ref.readRawStream();
  try {
    return raw.asUint8Array().slice();
  } finally {
    raw.destroy();
  }
}

/**
 * Every picture reached in the `image` role (AC-1): a picture a page, form,
 * tiling pattern or Type 3 glyph draws, a soft mask and an explicit mask, by
 * the walk's role, never the object's own `/Subtype` (INV-3). Each object
 * once, however many places draw it, as its reference.
 */
export function rolePictures(
  doc: PDFDocument,
  reached: ReadonlyMap<number, ReadonlySet<string>>,
): readonly { readonly ref: PDFObject; readonly kind: PictureKind }[] {
  const found: { ref: PDFObject; kind: PictureKind }[] = [];
  for (const [num, labels] of reached) {
    if (!labels.has("image")) continue;
    const ref = doc.newIndirect(num);
    if (!ref.isStream()) continue;
    const kind = pictureFilter(ref);
    if (kind !== null) found.push({ ref, kind });
  }
  return found;
}

/**
 * Strip the details stored inside every kept JPEG and JPEG 2000 picture.
 * Spec 0025, AC-1 to AC-7.
 *
 * Runs in the rebuild after `sweepCarriers` and before the write, so it reads
 * the rebuilt document: a picture the padded pass blanked faces the same rule
 * as any other (AC-7). A read role walk names the pictures; a walk with a
 * problem fails the run with `unreadable-structure`. Each picture's raw bytes
 * go through the picture reader (`picture-reader.ts`): one it leaves `clean`
 * or `as-stored` is never written (AC-5, INV-6). For one it would change, the
 * new bytes are read again by the same reader before they are written, and
 * must hold nothing to drop and keep every part a decoder reads, byte for
 * byte (`decodingParts`); then `writeRawStream` through the reference
 * replaces the data and nothing else, MuPDF setting `/Length` (INV-4).
 *
 * A failed requirement, or a throw from MuPDF while reading or writing a
 * picture, fails the run with `unsupported`: a fault in RedactNest's own
 * reader, never a document's (AC-6). `checkpoint` runs after each picture it
 * writes, so a cancel lands within one picture, and a cancel is never turned
 * into a failure. One picture's bytes are held at a time.
 */
export async function stripPictureDetails(
  out: PDFDocument,
  checkpoint: () => Promise<void>,
  join: JoinParts = joinParts,
): Promise<PictureReport> {
  const walk = walkRoles(out, "read");
  if (walk.problem !== null) throw new EngineFailure("unreadable-structure");

  let xmp = false;
  let details = false;
  for (const { ref, kind } of rolePictures(out, walk.reached)) {
    let dropped: ReadonlySet<string> | null;
    try {
      dropped = stripOne(ref, kind, join);
    } catch (failure) {
      if (failure instanceof EngineFailure) throw failure;
      throw new EngineFailure("unsupported");
    }
    if (dropped === null) continue;
    xmp ||= dropped.has("xmp");
    details ||= dropped.has("other");
    await checkpoint();
  }
  return { xmp, details };
}

/** One picture: written anew and what it dropped, or `null` when it is left alone. */
function stripOne(
  ref: PDFObject,
  kind: PictureKind,
  join: JoinParts,
): ReadonlySet<string> | null {
  const hasColourSpace = hasKey(ref, "ColorSpace");
  const source = storedPicture(ref);
  const read = readPicture(source, kind, hasColourSpace);
  if (read.kind !== "strip") return null;

  const next = join(source, read.parts);
  const before = decodingParts(source, kind, hasColourSpace);
  const after = decodingParts(next, kind, hasColourSpace);
  if (
    readPicture(next, kind, hasColourSpace).kind !== "clean" ||
    before === null ||
    after === null ||
    !sameDecodingParts(before, after)
  ) {
    throw new EngineFailure("unsupported");
  }

  ref.writeRawStream(next);
  return read.dropped;
}
