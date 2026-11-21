import type { Document, PDFDocument, PDFObject } from "mupdf";

import type { EngineErrorKind } from "@/worker/protocol";

import {
  ADOBE_COLLECTIONS,
  decodeTextString,
  holdsTicked,
  TRAILER_KEYS,
  walkRoles,
  type ResourceOwner,
} from "./allowlist";
import { comparePage, type PageRecord } from "./characters";
import { EngineFailure } from "./failure";
import { lineBox } from "./geometry";
import { judgeGlyphs } from "./glyphs";
import type { MuPdf } from "./load";
import { forEachDictionary, hasKey, keysOf } from "./objects";
import { readDrawing, type ResourceCategory } from "./marked";
import { imagesAreBlank } from "./pixels";
import { CARRIER_KEYS, CATALOG_KEYS, PAGE_KEYS } from "./rebuild";
import type { RedactionTarget } from "./types";

/**
 * The engine checking its own work before anything leaves. Spec 0004, AC-13,
 * AC-25 and INV-2.
 *
 * Run on the written output, reopened from the exact bytes that will cross, so
 * what is checked is what is sent. It checks three ways: the structure holds
 * only what the rebuild chose to carry, every page's characters are the
 * source's less the ticked ones, and no image still shows ink under a target.
 * Any finding fails the whole run and hands back no file. That turns the one
 * failure this product cannot have, a file that looks clean and is not, into an
 * error message.
 */

/**
 * What the check found, as the kind the run fails with, or `null` for a pass.
 *
 * Every page is compared before a kind is named, because a leak outranks an
 * over removal and the leak may be on a later page. The only early stop is on
 * a leak, when the answer is already `redaction-incomplete`. In order (AC-25):
 *
 *  - `redaction-incomplete`: a structural failure, a pixel that is not blank,
 *    a throw while checking, or a character extra with replacement text
 *    ignored, which is a glyph that survived.
 *  - `replacement-text`: a character extra in ordinary extraction only, which
 *    is replacement text that survived around a ticked match.
 *  - `redaction-overreach`: a character missing, which is unticked text gone,
 *    or a character centred under a box, which is text hidden.
 *
 * On a run with nothing ticked, any character difference is `unsupported`
 * instead, since nothing ticked can have leaked or reached too far.
 *
 * Spec 0006, AC-17, adds one rule that is `redaction-incomplete` whatever is
 * ticked, because a leak is a leak: no character centred outside a page's
 * visible area survives, in either extraction mode. The record is taken after
 * the trim, so a trimmed character is never expected back, and a trim that
 * silently did nothing is caught here. The trim changes no pixel (INV-11), so
 * there is no pixel outside to check.
 *
 * Spec 0019, AC-15: when the structure part's only finding is a colour space
 * entry no drawing names (`unused-colour-space`) and `mayRewrite` is set, the
 * answer is `"rewrite"`, given before the page loop inside this one open of
 * the bytes, so the usual path still opens and walks the output once. The run
 * then writes once more and checks the new bytes with `mayRewrite` clear, where
 * the same verdict is `redaction-incomplete`, a leak like any unused entry.
 *
 * Spec 0021, AC-4: right after the structure part, before `"rewrite"` is
 * answered or any page is compared, the catalog's `/Lang` and every
 * `/Registry` and `/Ordering` string are held against `tickedTexts`, the
 * run's folded texts (`foldTicked`). A hit is a leak, `redaction-incomplete`,
 * so it outranks an unreadable stream and an unused colour space and never
 * leads to a second write, and it runs again on the second write's bytes. It
 * runs here, never through the `checkStructure` seam, so a swapped structure
 * check still faces it.
 */
export function checkOutput(
  mupdf: MuPdf,
  output: ArrayBuffer,
  record: readonly PageRecord[],
  targets: ReadonlyMap<number, readonly RedactionTarget[]>,
  tickedTexts: readonly string[],
  checkStructure: StructureCheck,
  mayRewrite: true,
): EngineErrorKind | "rewrite" | null;
export function checkOutput(
  mupdf: MuPdf,
  output: ArrayBuffer,
  record: readonly PageRecord[],
  targets: ReadonlyMap<number, readonly RedactionTarget[]>,
  tickedTexts: readonly string[],
  checkStructure?: StructureCheck,
  mayRewrite?: false,
): EngineErrorKind | null;
export function checkOutput(
  mupdf: MuPdf,
  output: ArrayBuffer,
  record: readonly PageRecord[],
  targets: ReadonlyMap<number, readonly RedactionTarget[]>,
  tickedTexts: readonly string[],
  checkStructure: StructureCheck = structureIsClean,
  mayRewrite = false,
): EngineErrorKind | "rewrite" | null {
  const ticked = targets.size > 0;
  let leaked = false;
  let escaped = false;
  let replaced = false;
  let overreached = false;
  let unreadable = false;
  let check: Document | null = null;

  try {
    check = mupdf.Document.openDocument(output, "application/pdf");
    const pdf: PDFDocument | null = check.asPDF();
    if (!pdf) return "redaction-incomplete";
    const structure = checkStructure(pdf, record.length);
    if (structure === "leak") return "redaction-incomplete";
    // Spec 0021, AC-4: a ticked text at a string place is a leak, whatever the
    // rebuild did (INV-3), so it comes before the second write is offered.
    if (tickedAtStringPlace(pdf, tickedTexts)) return "redaction-incomplete";
    // Spec 0019, AC-15: a colour space MuPDF could not load leaves an entry
    // its own filter drops on a second pass, so the run may write once more.
    // On the bytes that cross it is a leak like any unused entry.
    if (structure === "unused-colour-space") {
      return mayRewrite ? "rewrite" : "redaction-incomplete";
    }
    // Spec 0019, AC-5: a drawing stream the scan cannot read is `unsupported`,
    // since nothing was found to leak, unless a page below finds a leak, which
    // outranks it; every page is still compared.
    unreadable = structure === "unreadable";

    for (let index = 0; index < record.length; index += 1) {
      const quads = (targets.get(index) ?? []).flatMap((target) => target.quads);
      const page = pdf.loadPage(index);

      try {
        const bounds = page.getBounds();
        const visible = [bounds[0], bounds[1], bounds[2], bounds[3]] as const;
        const [ordinary, ignoring] = comparePage(
          page,
          record[index],
          quads.map(lineBox),
          visible,
        );
        if (ordinary.outside || ignoring.outside) escaped = true;
        if (ignoring.extra) leaked = true;
        if (ordinary.extra) replaced = true;
        if (ordinary.missing || ignoring.missing || ordinary.hidden || ignoring.hidden) {
          overreached = true;
        }
        if (quads.length > 0 && !imagesAreBlank(mupdf, page, quads)) leaked = true;
      } finally {
        page.destroy();
      }

      if ((leaked && ticked) || escaped) break;
    }
  } catch {
    // An output that cannot be reopened, extracted or decoded is an output
    // nobody can vouch for.
    return "redaction-incomplete";
  } finally {
    check?.destroy();
  }

  if (escaped) return "redaction-incomplete";
  if (!ticked)
    return leaked || replaced || overreached || unreadable ? "unsupported" : null;
  if (leaked) return "redaction-incomplete";
  if (unreadable) return "unsupported";
  if (replaced) return "replacement-text";
  if (overreached) return "redaction-overreach";
  return null;
}

/**
 * Does the catalog's `/Lang`, or a string at `/Registry` or `/Ordering` in any
 * dictionary, hold a ticked item's text? Spec 0021, AC-4 and INV-3.
 *
 * Every dictionary is read through its reference (`forEachDictionary`), so a
 * `CIDSystemInfo` inside a CID font or a character map is found wherever it
 * hangs, reached or not. One of Adobe's own values, whole, is never compared
 * (`ADOBE_COLLECTIONS`). With nothing ticked there is nothing to find.
 */
function tickedAtStringPlace(pdf: PDFDocument, tickedTexts: readonly string[]): boolean {
  if (tickedTexts.length === 0) return false;
  if (placeHoldsTicked(pdf.getTrailer().get("Root", "Lang"), tickedTexts, []))
    return true;

  let hit = false;
  forEachDictionary(pdf, (dict) => {
    if (hit) return;
    hit =
      placeHoldsTicked(dict.get("Registry"), tickedTexts, ADOBE_COLLECTIONS.Registry) ||
      placeHoldsTicked(dict.get("Ordering"), tickedTexts, ADOBE_COLLECTIONS.Ordering);
  });
  return hit;
}

/**
 * Does this value, if it is a string, hold a ticked text? Decoded as the scan
 * decodes a string, and passed over when it is exactly one of `skip`. A string
 * that cannot be decoded may hold anything, so it counts as a hit: the check
 * fails closed (INV-3). The walk refuses such a string at every one of these
 * places already, so only a swapped structure check meets one here.
 */
function placeHoldsTicked(
  value: PDFObject,
  tickedTexts: readonly string[],
  skip: readonly string[],
): boolean {
  if (!value.isString()) return false;
  const text = decodeTextString(value.asByteString());
  if (text === null) return true;
  if (skip.includes(text)) return false;
  return holdsTicked(text, tickedTexts);
}

/**
 * What the structure part found: nothing, something the rebuild should not
 * have carried (a leak), a drawing stream it could not read to its end, or,
 * as its only finding, a colour space entry no drawing names (spec 0019,
 * AC-5). They rank in that order from the leak down: a leak outranks an
 * unreadable stream, and both outrank an unused colour space, so a file
 * holding either is never written twice (AC-15).
 */
export type StructureVerdict = "clean" | "leak" | "unreadable" | "unused-colour-space";

/** The structure part of the self check, as the `Pipeline` seam holds it. */
export type StructureCheck = (
  check: PDFDocument,
  sourcePageCount: number,
) => StructureVerdict;

/**
 * The structural half. Does the output hold only what the rebuild chose to
 * carry?
 *
 * Spec 0004's checks: the trailer has no `/Info` or `/Encrypt`, the catalog and
 * every page hold only their allowlisted keys, no object anywhere carries a
 * carrier key or a `/JS` entry, the file is a single revision, and it has the
 * source's page count.
 *
 * Spec 0019's, which hold every rule the prune applies on the written bytes,
 * whether or not the prune ran, and add what only the written file can show
 * (AC-5, INV-3): the trailer holds only `TRAILER_KEYS`; a walk from the catalog
 * meets no key off its role's list, no value outside its key's shape and no
 * string outside `STRING_PLACES`, at any depth; every object satisfies every
 * role and kind it is reached in, so two empty dictionaries the write merged
 * pass; every object in the file is reached; no embedded file stream, file
 * specification or `/EF` is anywhere, reached or not; and every resource entry
 * is named by a drawing that draws with its dictionary (*Resource use*). A
 * drawing stream the scan cannot read to its end answers `"unreadable"`,
 * which any leak outranks. An unused colour space entry answers
 * `"unused-colour-space"` only when nothing else was found, so the carrier
 * and embedded file checks run before resource use's answer is returned.
 *
 * Spec 0020's, AC-7: no drawing below a Type 3 glyph shows text, judged by
 * the same `judgeGlyphs` the open and the run refuse with, on this walk, which
 * scans only the glyph side (empty in a file with no Type 3 font). A glyph
 * side drawing the scan cannot read is judged as its worst, so it can answer
 * a leak where resource use said `"unreadable"`. A drawing both sides reach
 * is not judged here: after the passes the page names MuPDF's redacted copy
 * and the glyph the original, so no written file shows the sharing, and a
 * write that merged two identical pictures would make a clean file look
 * shared. The refusals at open and before the passes hold that part, on the
 * bytes a run redacts.
 */
export function structureIsClean(
  check: PDFDocument,
  sourcePageCount: number,
): StructureVerdict {
  const trailer = check.getTrailer();

  if (hasKey(trailer, "Info") || hasKey(trailer, "Encrypt")) return "leak";
  if (!holdsOnly(trailer, TRAILER_KEYS)) return "leak";
  if (check.countVersions() !== 1) return "leak";
  if (check.countPages() !== sourcePageCount) return "leak";
  if (!holdsOnly(trailer.get("Root"), CATALOG_KEYS)) return "leak";

  for (let index = 0; index < sourcePageCount; index += 1) {
    if (!holdsOnly(check.findPage(index), PAGE_KEYS)) return "leak";
  }

  const walk = walkRoles(check, "read");
  if (walk.problem !== null || walk.strays > 0) return "leak";
  if (!everyObjectReached(check, walk.reached)) return "leak";

  const use = resourceUse(walk.owners);
  if (use === "leak") return "leak";

  let clean = true;
  forEachDictionary(check, (dict) => {
    if (!clean) return;
    if (
      hasKey(dict, "JS") ||
      CARRIER_KEYS.some((key) => hasKey(dict, key)) ||
      holdsEmbeddedFile(dict)
    ) {
      clean = false;
    }
  });
  if (!clean) return "leak";
  // Text below a glyph is a leak that outranks `"unreadable"` and
  // `"unused-colour-space"`, so it never leads to a second write.
  if (judgeGlyphs(walk) === "text") return "leak";
  return use;
}

/** The dictionaries a resource dictionary keeps its entries in, as `marked.ts` names them. */
const RESOURCE_CATEGORIES: readonly ResourceCategory[] = Object.freeze([
  "Font",
  "XObject",
  "ExtGState",
  "ColorSpace",
  "Pattern",
  "Shading",
  "Properties",
]);

/**
 * Colour spaces a device colour uses without naming them, so they count as
 * used wherever they are listed (spec 0019, *Resource use*).
 */
const DEFAULT_SPACES: ReadonlySet<string> = new Set([
  "DefaultGray",
  "DefaultRGB",
  "DefaultCMYK",
]);

/**
 * Spec 0019, AC-5, *Resource use*. Each resource dictionary against the union
 * of the names every drawing that draws with it uses: an entry none of them
 * names is something `sanitize` should have dropped, so a leak. A drawing the
 * scan cannot read to its end makes the answer `"unreadable"`, unless another
 * dictionary holds a leak, which outranks it.
 *
 * Since the fourth pass, an unused entry under `/ColorSpace` only sets a flag
 * and the comparison goes on, because MuPDF's `sanitize` keeps the entry of a
 * space it fails to load and draws with a device colour instead, and a second
 * pass of the same filter drops it (AC-15). An unused entry in any other
 * category is still a leak at once. After every owner the answer ranks
 * `"unreadable"` over `"unused-colour-space"` over `"clean"`, so a drawing
 * the scan cannot read, anywhere in the file, means no second write.
 */
function resourceUse(owners: readonly ResourceOwner[]): StructureVerdict {
  let unreadable = false;
  let unusedColourSpace = false;

  for (const { resources, units } of owners) {
    const properties = resources.get("Properties");
    const used = new Map<ResourceCategory, Set<string>>();
    let unsure = false;
    for (const unit of units) {
      const read = readDrawing(
        unit.streams,
        properties.isDictionary() ? properties : null,
        unit.joined,
      );
      if (read === "unsure") {
        unsure = true;
        continue;
      }
      for (const [category, names] of read.names) {
        const into = used.get(category) ?? new Set<string>();
        for (const name of names) into.add(name);
        used.set(category, into);
      }
    }

    // A drawing that cannot be read names nothing anybody knows, so this
    // dictionary's entries cannot be judged; the answer is unreadable.
    if (unsure) {
      unreadable = true;
      continue;
    }

    for (const category of RESOURCE_CATEGORIES) {
      const entries = resources.get(category);
      if (!entries.isDictionary()) continue;
      for (const key of keysOf(entries)) {
        if (used.get(category)?.has(key)) continue;
        if (category !== "ColorSpace") return "leak";
        if (!DEFAULT_SPACES.has(key)) unusedColourSpace = true;
      }
    }
  }
  if (unreadable) return "unreadable";
  return unusedColourSpace ? "unused-colour-space" : "clean";
}

/**
 * Is every object in the file one the walk from the catalog reached? An
 * object nothing on the lists reaches is something the rebuild did not choose
 * to carry (AC-5). A free entry or a null holds nothing, so it is passed over.
 */
function everyObjectReached(
  check: PDFDocument,
  reached: ReadonlyMap<number, ReadonlySet<string>>,
): boolean {
  const count = check.countObjects();
  for (let num = 1; num < count; num += 1) {
    if (reached.has(num)) continue;
    const object = check.newIndirect(num);
    if (object.isNull()) continue;
    if (object.isStream() || object.isDictionary() || object.isArray()) return false;
    if (object.isString() || object.isName() || object.isNumber() || object.isBoolean()) {
      return false;
    }
  }
  return true;
}

/**
 * An embedded file stream, a file specification, or a dictionary holding
 * `/EF`, whatever points at it (AC-5, AC-8): whatever the source held, none of
 * it leaves.
 */
function holdsEmbeddedFile(dict: PDFObject): boolean {
  const type = dict.get("Type");
  if (
    type.isName() &&
    (type.asName() === "EmbeddedFile" || type.asName() === "Filespec")
  ) {
    return true;
  }
  return hasKey(dict, "EF");
}

function holdsOnly(dict: PDFObject, allowed: readonly string[]): boolean {
  return keysOf(dict).every((key) => allowed.includes(key));
}

/**
 * What a file draws, as far as a second write could change it unseen. Spec
 * 0019, AC-15 and INV-8.
 *
 * The full check on the second write's bytes holds text, structure and the
 * pixels under ticked items, but reads no picture nobody ticked and counts no
 * figure, so a second write that dropped a picture's data or a form would
 * pass it. The shape is how many objects the role walk reaches as a form, and
 * the stored length of every object it reaches as an image, read through the
 * reference and sorted. A reached image that is not a stream counts as -1.
 */
export interface DrawnShape {
  readonly forms: number;
  readonly images: readonly number[];
}

/**
 * The drawn shape of written bytes, opened on their own and destroyed before
 * this returns. Called only on bytes the check already opened once, so a file
 * that does not open as a PDF is a check that cannot finish:
 * `redaction-incomplete`.
 */
export function drawnShape(mupdf: MuPdf, bytes: ArrayBuffer): DrawnShape {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new EngineFailure("redaction-incomplete");

    let forms = 0;
    const images: number[] = [];
    for (const [num, labels] of walkRoles(pdf, "read").reached) {
      if (labels.has("form")) forms += 1;
      if (labels.has("image")) images.push(storedLength(pdf.newIndirect(num)));
    }
    return Object.freeze({
      forms,
      images: Object.freeze(images.sort((a, b) => a - b)),
    });
  } finally {
    doc.destroy();
  }
}

/** Do two files draw the same number of forms, and pictures of the same stored lengths? */
export function sameDrawnShape(first: DrawnShape, second: DrawnShape): boolean {
  return (
    first.forms === second.forms &&
    first.images.length === second.images.length &&
    first.images.every((length, index) => length === second.images[index])
  );
}

/** A stream's stored length, read raw through its reference, or -1 if it is not one. */
function storedLength(ref: PDFObject): number {
  if (!ref.isStream()) return -1;
  const raw = ref.readRawStream();
  try {
    return raw.getLength();
  } finally {
    raw.destroy();
  }
}
