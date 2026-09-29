import type { Document, PDFDocument, PDFObject } from "mupdf";

import type { EngineErrorKind } from "@/worker/protocol";

import { comparePage, type PageRecord } from "./characters";
import { lineBox } from "./geometry";
import type { MuPdf } from "./load";
import { forEachDictionary, hasKey, keysOf } from "./objects";
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
): EngineErrorKind | null {
  const ticked = targets.size > 0;
  let leaked = false;
  let escaped = false;
  let replaced = false;
  let overreached = false;
  let check: Document | null = null;

  try {
    check = mupdf.Document.openDocument(output, "application/pdf");
    const pdf: PDFDocument | null = check.asPDF();
    if (!pdf || !structureIsClean(pdf, record.length)) return "redaction-incomplete";

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
  if (!ticked) return leaked || replaced || overreached ? "unsupported" : null;
  if (leaked) return "redaction-incomplete";
  if (replaced) return "replacement-text";
  if (overreached) return "redaction-overreach";
  return null;
}

/**
 * The structural half. Does the output hold only what the rebuild chose to
 * carry?
 *
 * The trailer has no `/Info` or `/Encrypt`, the catalog and every page hold only
 * their allowlisted keys, no object anywhere carries a carrier key or a `/JS`
 * entry, the file is a single revision, and it has the source's page count.
 */
export function structureIsClean(check: PDFDocument, sourcePageCount: number): boolean {
  const trailer = check.getTrailer();

  if (hasKey(trailer, "Info") || hasKey(trailer, "Encrypt")) return false;
  if (check.countVersions() !== 1) return false;
  if (check.countPages() !== sourcePageCount) return false;
  if (!holdsOnly(trailer.get("Root"), CATALOG_KEYS)) return false;

  for (let index = 0; index < sourcePageCount; index += 1) {
    if (!holdsOnly(check.findPage(index), PAGE_KEYS)) return false;
  }

  let clean = true;
  forEachDictionary(check, (dict) => {
    if (!clean) return;
    if (hasKey(dict, "JS") || CARRIER_KEYS.some((key) => hasKey(dict, key))) {
      clean = false;
    }
  });
  return clean;
}

function holdsOnly(dict: PDFObject, allowed: readonly string[]): boolean {
  return keysOf(dict).every((key) => allowed.includes(key));
}
