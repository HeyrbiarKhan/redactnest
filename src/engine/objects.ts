import type { PDFDocument, PDFObject } from "mupdf";

/**
 * Small readers over MuPDF's object model, shared by the inventory, the rebuild
 * and the self check so all three agree on what "an object carries a key"
 * means.
 */

/**
 * Visit every dictionary in the document: each numbered object, and every
 * dictionary written directly inside one (an annotation's action, an image's
 * decode parameters, a page's inline resources).
 *
 * Indirect references are not followed from here. Each one is a numbered object
 * of its own and gets its own turn, so following them would only visit things
 * twice and loop on a cycle.
 *
 * Spec 0004 asks for "any object anywhere", recursing into direct sub
 * dictionaries and arrays, because a producer can nest a carrier wherever it
 * likes. An XMP packet on an image, or private data on a form XObject, is below
 * the catalog and the pages that the allowlists cover.
 */
export function forEachDictionary(
  doc: PDFDocument,
  visit: (dict: PDFObject) => void,
): void {
  const count = doc.countObjects();

  for (let num = 1; num < count; num += 1) {
    walkDirect(doc.newIndirect(num).resolve(), visit);
  }
}

function walkDirect(obj: PDFObject, visit: (dict: PDFObject) => void): void {
  if (obj.isIndirect()) return;

  if (obj.isDictionary()) {
    // Visited before its children are read, so a visitor that deletes a key
    // never has the walk descend into what it just removed.
    visit(obj);
    obj.forEach((value) => walkDirect(value, visit));
  } else if (obj.isArray()) {
    obj.forEach((value) => walkDirect(value, visit));
  }
}

/**
 * Is this key present at all, whatever its value?
 *
 * Safe on a missing dictionary. MuPDF hands back one shared `Null` object for
 * anything absent, and calling `get` on that throws rather than answering, so
 * every lookup that might start from nothing goes through here or through a
 * path lookup (`get("A", "B")`) on an object that exists.
 */
export function hasKey(dict: PDFObject, key: string): boolean {
  return !dict.isNull() && !dict.get(key).isNull();
}

/** The keys a dictionary holds, in the order MuPDF stores them. */
export function keysOf(dict: PDFObject): readonly string[] {
  const keys: string[] = [];
  dict.forEach((_value, key) => {
    if (typeof key === "string") keys.push(key);
  });
  return keys;
}

/** Does this array exist and hold at least one entry? */
export function isNonEmptyArray(obj: PDFObject): boolean {
  return obj.isArray() && obj.length > 0;
}

/**
 * Does this name tree node hold any entry, directly or through its children?
 *
 * A name tree keeps its entries in `/Names` on a leaf and its children in
 * `/Kids`, so either being non empty means somebody put something in it.
 */
export function nameTreeHasEntries(node: PDFObject): boolean {
  return (
    node.isDictionary() &&
    (isNonEmptyArray(node.get("Names")) || isNonEmptyArray(node.get("Kids")))
  );
}

/** Delete every key that is not on the list. */
export function keepOnly(dict: PDFObject, allowed: readonly string[]): void {
  for (const key of keysOf(dict)) {
    if (!allowed.includes(key)) dict.delete(key);
  }
}
