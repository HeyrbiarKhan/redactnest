import * as mupdf from "mupdf";
import type { PDFDocument, PDFObject } from "mupdf";

/**
 * The real MuPDF, in Node, for looking at what the engine produced.
 *
 * Everything here is written independently of `src/engine` on purpose. An
 * output checked with the engine's own walker would only prove the engine
 * agrees with itself.
 */

export { mupdf };

export const LIMITS = Object.freeze({ maxBytes: 26_214_400, maxPages: 50 });

/** Open `bytes` for a look, and destroy the document after, whatever happens. */
export function inspect<T>(bytes: ArrayBuffer, read: (doc: PDFDocument) => T): T {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF document");
    return read(pdf);
  } finally {
    doc.destroy();
  }
}

/** The page's extracted text. */
export function pageText(doc: PDFDocument, index: number, options = ""): string {
  const page = doc.loadPage(index);
  try {
    const stext = page.toStructuredText(options);
    try {
      return stext.asText();
    } finally {
      stext.destroy();
    }
  } finally {
    page.destroy();
  }
}

/** Every page's text, joined. */
export function documentText(bytes: ArrayBuffer): string {
  return inspect(bytes, (doc) =>
    Array.from({ length: doc.countPages() }, (_, index) => pageText(doc, index)).join(
      "\n",
    ),
  );
}

/**
 * The whole file with every stream decompressed, read one byte per character,
 * so a string can be searched for anywhere in it: in a content stream, in an
 * object, in an earlier revision.
 */
export function decompressedBytes(bytes: ArrayBuffer): string {
  return inspect(bytes, (doc) => {
    const buffer = doc.saveToBuffer("decompress");
    try {
      return Buffer.from(buffer.asUint8Array()).toString("latin1");
    } finally {
      buffer.destroy();
    }
  });
}

/** The raw file, one byte per character, without MuPDF touching it. */
export function rawBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("latin1");
}

/**
 * Does `needle` appear in `haystack` in either PDF string encoding (spec 0004,
 * AC-4)? PDFDocEncoding and UTF-16BE, each as raw bytes or as a hex string, in
 * either case.
 */
export function containsInAnyEncoding(haystack: string, needle: string): boolean {
  const single = Buffer.from(needle, "latin1");
  const utf16 = Buffer.from(needle, "utf16le").swap16();
  const lower = haystack.toLowerCase();

  return (
    haystack.includes(single.toString("latin1")) ||
    haystack.includes(utf16.toString("latin1")) ||
    lower.includes(single.toString("hex")) ||
    lower.includes(utf16.toString("hex"))
  );
}

/** A dictionary's keys. */
export function keysOf(dict: PDFObject): string[] {
  const keys: string[] = [];
  dict.forEach((_value, key) => {
    if (typeof key === "string") keys.push(key);
  });
  return keys;
}

/**
 * Every dictionary in the file: each numbered object, and every dictionary
 * written directly inside one.
 */
export function everyDictionary(doc: PDFDocument): PDFObject[] {
  const found: PDFObject[] = [];
  const walk = (obj: PDFObject): void => {
    if (obj.isIndirect()) return;
    if (obj.isDictionary()) {
      found.push(obj);
      obj.forEach(walk);
    } else if (obj.isArray()) {
      obj.forEach(walk);
    }
  };

  for (let num = 1; num < doc.countObjects(); num += 1) {
    walk(doc.newIndirect(num).resolve());
  }
  return found;
}

/** Every key used anywhere in the file. */
export function everyKey(doc: PDFDocument): Set<string> {
  return new Set(everyDictionary(doc).flatMap(keysOf));
}

/** Every `/Type` and `/Subtype` name used anywhere in the file. */
export function everyTypeName(doc: PDFDocument): Set<string> {
  const names = new Set<string>();
  for (const dict of everyDictionary(doc)) {
    for (const key of ["Type", "Subtype"]) {
      const value = dict.get(key);
      if (value.isName()) names.add(value.asName());
    }
  }
  return names;
}

/** A page box or other number array, as plain numbers. */
export function numbers(obj: PDFObject): number[] {
  const values: number[] = [];
  obj.forEach((value) => values.push(value.asNumber()));
  return values;
}
