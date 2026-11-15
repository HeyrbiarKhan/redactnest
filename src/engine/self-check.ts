import type { Document, PDFDocument, PDFObject } from "mupdf";

import type { EngineErrorKind } from "@/worker/protocol";

import { TRAILER_KEYS, walkRoles, type ResourceOwner } from "./allowlist";
import { comparePage, type PageRecord } from "./characters";
import { lineBox } from "./geometry";
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
 */
export function checkOutput(
  mupdf: MuPdf,
  output: ArrayBuffer,
  record: readonly PageRecord[],
  targets: ReadonlyMap<number, readonly RedactionTarget[]>,
  checkStructure: (
    check: PDFDocument,
    sourcePageCount: number,
  ) => StructureVerdict = structureIsClean,
): EngineErrorKind | null {
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
 * What the structure part found: nothing, something the rebuild should not
 * have carried (a leak), or a drawing stream it could not read to its end
 * (spec 0019, AC-5).
 */
export type StructureVerdict = "clean" | "leak" | "unreadable";

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
 * which any leak outranks.
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
 */
function resourceUse(owners: readonly ResourceOwner[]): StructureVerdict {
  let unreadable = false;

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
        if (category === "ColorSpace" && DEFAULT_SPACES.has(key)) continue;
        if (!used.get(category)?.has(key)) return "leak";
      }
    }
  }
  return unreadable ? "unreadable" : "clean";
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
