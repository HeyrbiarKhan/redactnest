import type { PDFDocument } from "mupdf";

import { SANITIZED_KINDS, type SanitizedKind } from "@/worker/protocol";

import {
  forEachDictionary,
  hasKey,
  isNonEmptyArray,
  keysOf,
  nameTreeHasEntries,
} from "./objects";

/**
 * What the source carried that the rebuild will leave behind. Spec 0004, AC-15.
 *
 * Read from the working copy before it is prepared, because preparing flattens
 * annotations and forms into the page and they would no longer be found. Each
 * rule is a row of the spec's inventory table, so `sanitized` names exactly what
 * was there and never a kind the file did not have.
 *
 * Private application data, page labels, viewer preferences, automatic actions
 * that are not scripts, and the file identifier are stripped too and never
 * reported here, because they would only confuse a summary. Feature 16 documents
 * them.
 */
export function takeInventory(doc: PDFDocument): readonly SanitizedKind[] {
  const found = new Set<SanitizedKind>();
  const trailer = doc.getTrailer();
  const catalog = trailer.get("Root");

  const info = trailer.get("Info");
  if (info.isDictionary() && keysOf(info).length > 0) {
    found.add("document-info");
  }

  if (
    isNonEmptyArray(catalog.get("AcroForm", "Fields")) ||
    hasKey(catalog.get("AcroForm"), "XFA")
  ) {
    found.add("form-fields");
  }

  if (nameTreeHasEntries(catalog.get("Names", "EmbeddedFiles"))) {
    found.add("attachments");
  }

  if (hasKey(catalog.get("Outlines"), "First")) {
    found.add("bookmarks");
  }

  if (hasKey(catalog.get("Names"), "JavaScript")) {
    found.add("javascript");
  }

  if (hasKey(catalog, "StructTreeRoot")) {
    found.add("accessibility-tags");
  }

  const pageCount = doc.countPages();
  for (let index = 0; index < pageCount; index += 1) {
    const page = doc.findPage(index);

    if (hasKey(page, "Thumb")) {
      found.add("page-thumbnails");
    }

    const annotations = page.get("Annots");
    if (annotations.isArray()) {
      annotations.forEach((annotation) => {
        const subtype = annotation.get("Subtype");
        const name = subtype.isName() ? subtype.asName() : "";

        // A widget is a form field's face. Everything else is an annotation,
        // links and popups included, because the rebuild drops them all.
        found.add(name === "Widget" ? "form-fields" : "annotations");
        if (name === "FileAttachment") found.add("attachments");
      });
    }
  }

  forEachDictionary(doc, (dict) => {
    if (hasKey(dict, "Metadata")) found.add("xmp-metadata");
    if (hasKey(dict, "AF")) found.add("attachments");
    if (hasKey(dict, "JS")) found.add("javascript");
  });

  // A file MuPDF had to repair reports what MuPDF can count. The rebuild drops
  // earlier revisions either way, because it writes one brand new file.
  if (doc.countVersions() > 1) {
    found.add("incremental-versions");
  }

  return SANITIZED_KINDS.filter((kind) => found.has(kind));
}
