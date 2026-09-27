import type { Document, PDFDocument } from "mupdf";

import type { DocumentSummary } from "@/worker/protocol";

import { refuseAtTheDoor } from "./door";
import { EngineFailure } from "./failure";
import { loadEngine, type MuPdf } from "./load";
import { prepareDocument } from "./prepare";
import type { OpenDocument } from "./types";

type OpenPhase = "loading-engine" | "opening" | "inspecting";

interface OpenLimits {
  readonly maxBytes: number;
  readonly maxPages: number;
}

/**
 * Open a document and report what is safe to report.
 *
 * The summary is counts and per page flags only: no text, no file name, nothing
 * that could identify the document.
 *
 * The caller owns the returned handle and must `close()` it. Every failure path
 * in here closes the document before throwing, so a refused open leaks nothing.
 *
 * The size cap and the `%PDF-` header are checked before `loadEngine` (spec
 * 0004, AC-1), so a PNG or an oversized file never costs anybody the engine
 * download.
 *
 * **What happens to `bytes`, because spec 0002 AC-5a rests on it.** This module
 * keeps no reference to the caller's `ArrayBuffer`. MuPDF copies it into the
 * WebAssembly heap (`new Buffer(arg)` does a `HEAPU8.set`), opens the document
 * from that copy, and frees the wrapper straight away; the `Document` object it
 * returns holds a numeric pointer and nothing else. `holdOpen` then closes over
 * that document and the summary, never over `bytes`, and it is a top level
 * function, so there is no scope chain from the returned handle back to this
 * one's parameter. The caller's buffer is therefore the caller's alone to drop.
 *
 * Note the consequence: while a session is open the document exists twice inside
 * the worker, once as the caller's `ArrayBuffer` and once as MuPDF's copy in the
 * WebAssembly heap. Both are inside the worker, so nothing about the privacy
 * guarantee changes, but `close()` frees only the second. Whoever holds the
 * first has to drop it themselves.
 */
export async function openDocument(
  bytes: ArrayBuffer,
  limits: OpenLimits,
  onPhase?: (phase: OpenPhase) => void,
): Promise<OpenDocument> {
  refuseAtTheDoor(bytes, limits);

  onPhase?.("loading-engine");
  const mupdf = await loadEngine();

  return openDocumentWith(mupdf, bytes, limits, onPhase);
}

/**
 * `openDocument` with the engine already in hand.
 *
 * The seam spec 0004 puts here so Vitest can run the real MuPDF in Node, where
 * the engine's own URL does not exist. Taking the module as a parameter, rather
 * than a test only setter on `loadEngine`, keeps the walled module free of a
 * mutable hook.
 *
 * The door is checked again in here, so a caller that already holds the engine
 * cannot skip it. On the path through `openDocument` it has passed already and
 * costs a scan of at most 1024 bytes.
 */
export function openDocumentWith(
  mupdf: MuPdf,
  bytes: ArrayBuffer,
  limits: OpenLimits,
  onPhase?: (phase: OpenPhase) => void,
): OpenDocument {
  refuseAtTheDoor(bytes, limits);

  onPhase?.("opening");
  let doc: Document | null = null;

  try {
    try {
      doc = mupdf.Document.openDocument(bytes, "application/pdf");
    } catch {
      // MuPDF does not distinguish "not a PDF" from "damaged PDF" here, and the
      // difference does not change what we can do about it.
      throw new EngineFailure("corrupt");
    }

    // MuPDF picks its handler by sniffing content, not by trusting the type it
    // was given. Something that passed the header check and still opened as
    // another kind of document cannot be redacted, because redaction needs a
    // PDF document object (spec 0004, AC-2).
    const pdf = doc.asPDF();
    if (!pdf) {
      throw new EngineFailure("corrupt");
    }

    if (pdf.needsPassword()) {
      throw new EngineFailure("password-required");
    }

    const pageCount = pdf.countPages();
    if (pageCount < 1) {
      throw new EngineFailure("corrupt");
    }
    if (pageCount > limits.maxPages) {
      throw new EngineFailure("too-many-pages");
    }

    if (hasLayers(pdf)) {
      throw new EngineFailure("hidden-layers");
    }

    onPhase?.("inspecting");

    // Before anything is extracted, so detection reads exactly the page a run
    // will act on (AC-22). The review copy is prepared this once, as part of
    // opening it, and never again (INV-1).
    prepareDocument(mupdf, pdf);

    const pagesWithText: boolean[] = [];
    for (let index = 0; index < pageCount; index += 1) {
      pagesWithText.push(pageHasText(pdf, index));
    }

    return holdOpen(pdf, { pageCount, pagesWithText });
  } catch (failure) {
    // The document only survives a successful open. Anything else hands the
    // native memory straight back rather than waiting for a session that will
    // never exist.
    doc?.destroy();
    throw failure;
  }
}

/**
 * Spec 0004, AC-3. Does the catalog declare optional content?
 *
 * Any `/OCProperties` at all, whatever each layer's state. Asking MuPDF which
 * layers are visible is not enough: it reports each layer's on or off state in
 * the default configuration, and cannot see membership rules (`AnyOff`,
 * `AllOff`, visibility expressions) that hide content with every layer on, or
 * layers that show only when printed. Refusing them all is broader than it has
 * to be, and it is the only rule MuPDF lets us state truthfully.
 */
function hasLayers(pdf: PDFDocument): boolean {
  return !pdf.getTrailer().get("Root", "OCProperties").isNull();
}

/**
 * Wrap an open document in the handle the worker holds.
 *
 * The MuPDF document itself stays captured in here, so nothing outside this
 * module can reach it or name its type. That is the engine wall at the value
 * level rather than only at the import level.
 */
function holdOpen(doc: PDFDocument, summary: DocumentSummary): OpenDocument {
  let closed = false;

  return {
    summary,
    close() {
      if (closed) return;
      closed = true;
      // MuPDF holds native memory that garbage collection will not reclaim.
      doc.destroy();
    },
  };
}

/**
 * Does this page carry a text layer?
 *
 * Feature 7 builds the scanned page warnings on this. The extracted text is read
 * inside the worker and dropped immediately; only the boolean leaves this
 * function, and only the boolean ever crosses the worker boundary.
 *
 * A page that cannot be read at all counts as having no text layer. That is the
 * cautious answer: it produces a warning rather than a false all clear.
 */
function pageHasText(doc: PDFDocument, index: number): boolean {
  let page: ReturnType<PDFDocument["loadPage"]> | null = null;
  let stext: { asText(): string; destroy(): void } | null = null;

  try {
    page = doc.loadPage(index);
    stext = page.toStructuredText("");
    return stext.asText().trim().length > 0;
  } catch {
    return false;
  } finally {
    stext?.destroy();
    page?.destroy();
  }
}
