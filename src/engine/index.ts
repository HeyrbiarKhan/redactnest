/**
 * The PDF engine. MuPDF compiled to WebAssembly.
 *
 * WALLED MODULE. Only `src/worker/engine.worker.ts` may import this file.
 *
 * Spec 0001 invariants this file exists to hold:
 *   - One PDF parser only. Nothing else in the codebase parses or renders a PDF.
 *   - Only the worker may import the engine module.
 *   - Document bytes live only inside the Web Worker.
 *
 * Until feature 2 installs the lint rule, that boundary rests on discipline. If
 * you are reading this from anywhere on the main thread, you are on the wrong
 * side of the wall: talk to the worker through `src/worker/client.ts` instead.
 *
 * Licence note: MuPDF is AGPL 3.0, which is why RedactNest itself is AGPL 3.0
 * and its source is published. See feature 18.
 */

import type { DocumentSummary, EngineErrorKind } from "@/worker/protocol";

/**
 * A failure the engine can describe in the protocol's terms.
 *
 * Deliberately carries the kind and nothing else. Anything MuPDF said about the
 * document (its message, its stack) stops here and never crosses the boundary.
 */
export class EngineFailure extends Error {
  readonly errorKind: EngineErrorKind;

  constructor(errorKind: EngineErrorKind) {
    super(errorKind);
    this.name = "EngineFailure";
    this.errorKind = errorKind;
  }
}

type MuPdf = typeof import("mupdf");

let enginePromise: Promise<MuPdf> | null = null;

/**
 * Where `scripts/sync-engine.mjs` puts the engine.
 *
 * This application's own origin, served by the static handler, never a content
 * delivery network. `mupdf.js` pulls in `mupdf-wasm.js` beside it, which in turn
 * resolves `new URL("mupdf-wasm.wasm", import.meta.url)` to this same folder.
 *
 * Typed as `string` rather than left as a literal on purpose: TypeScript only
 * tries to resolve types for a literal specifier, and there is nothing to
 * resolve here because this path exists at runtime, not at compile time.
 */
const ENGINE_MODULE_URL: string = "/engine/mupdf.js";

/**
 * Load the engine once per worker.
 *
 * Dynamic so the multi megabyte WebAssembly payload is fetched when a document
 * is actually on its way, rather than when the page loads.
 *
 * The ignore comments matter. MuPDF's WebAssembly glue carries a Node branch
 * that does `await import("module")`. The branch never runs in a browser, but a
 * bundler resolves specifiers statically and fails on it regardless. Keeping the
 * import opaque means the browser loads the engine natively and no bundler ever
 * looks inside it. Both comments are present so this survives the spec's
 * fallback from Turbopack to webpack.
 */
export function loadEngine(): Promise<MuPdf> {
  if (!enginePromise) {
    enginePromise = import(
      /* webpackIgnore: true */
      /* turbopackIgnore: true */
      ENGINE_MODULE_URL
    )
      .then((module: unknown) => module as MuPdf)
      .catch(() => {
        // Let a later attempt retry rather than caching the failure forever.
        enginePromise = null;
        throw new EngineFailure("engine-unavailable");
      });
  }
  return enginePromise;
}

/**
 * Open a document and report what is safe to report.
 *
 * Takes ownership of `bytes`. Returns counts and per page flags only: no text,
 * no file name, nothing that could identify the document.
 */
export async function inspectDocument(
  bytes: ArrayBuffer,
  limits: { maxBytes: number; maxPages: number },
  onPhase?: (phase: "loading-engine" | "opening" | "inspecting") => void,
): Promise<DocumentSummary> {
  if (bytes.byteLength > limits.maxBytes) {
    throw new EngineFailure("too-large");
  }

  onPhase?.("loading-engine");
  const mupdf = await loadEngine();

  onPhase?.("opening");
  let doc: InstanceType<MuPdf["Document"]> | null = null;

  try {
    try {
      doc = mupdf.Document.openDocument(bytes, "application/pdf");
    } catch {
      // MuPDF does not distinguish "not a PDF" from "damaged PDF" here, and the
      // difference does not change what we can do about it.
      throw new EngineFailure("corrupt");
    }

    if (doc.needsPassword()) {
      throw new EngineFailure("password-required");
    }

    const pageCount = doc.countPages();
    if (pageCount < 1) {
      throw new EngineFailure("corrupt");
    }
    if (pageCount > limits.maxPages) {
      throw new EngineFailure("too-many-pages");
    }

    onPhase?.("inspecting");
    const pagesWithText: boolean[] = [];

    for (let index = 0; index < pageCount; index += 1) {
      pagesWithText.push(pageHasText(doc, index));
    }

    return { pageCount, pagesWithText };
  } finally {
    // MuPDF holds native memory that garbage collection will not reclaim.
    doc?.destroy();
  }
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
function pageHasText(doc: InstanceType<MuPdf["Document"]>, index: number): boolean {
  let page: ReturnType<InstanceType<MuPdf["Document"]>["loadPage"]> | null = null;
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
