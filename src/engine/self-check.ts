import type { PDFDocument, PDFObject } from "mupdf";

import { forEachDictionary, hasKey, keysOf } from "./objects";
import { CARRIER_KEYS, CATALOG_KEYS, PAGE_KEYS } from "./rebuild";

/**
 * The engine checking its own work before anything leaves. Spec 0004, AC-13 and
 * INV-2.
 *
 * Run on the written output, reopened from the exact bytes that will cross, so
 * what is checked is what is sent. A check that fails fails the whole run with
 * `redaction-incomplete`. That turns the one failure this product cannot have, a
 * file that looks clean and is not, into an error message.
 */

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
