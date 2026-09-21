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
 * The engine wall zones in `eslint.config.mjs` enforce that boundary, so a stray
 * import fails the lint run rather than quietly shipping. If you are reading
 * this from anywhere on the main thread, you are on the wrong side of the wall:
 * talk to the worker through `src/worker/client.ts` instead.
 *
 * Licence note: MuPDF is AGPL 3.0, which is why RedactNest itself is AGPL 3.0
 * and its source is published. See feature 18.
 */

import type { DocumentSummary, EngineErrorKind, MatchId } from "@/worker/protocol";

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
 * One quad, as MuPDF gives them: four corners, upper left first, then upper
 * right, lower left, lower right.
 *
 * Spec 0002, INV-2: this type never reaches `@/worker/protocol`, because
 * anything declared there can cross to the main thread. Geometry stays here and
 * in the worker's private target map. Feature 5 owns what it does with these;
 * feature 14 will need them on the main thread and must widen INV-2 with its own
 * decision rather than by moving this type.
 */
export type Quad = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/**
 * Everything needed to remove one match, and nothing the main thread may see.
 *
 * Held in the worker's session, keyed by `MatchId`. A ticked id is resolved
 * against this map at redaction time, so a stale or tampered quad from the page
 * cannot cause a wrong removal.
 */
export interface RedactionTarget {
  /** Zero based, as the engine counts. Converted for display in the worker. */
  readonly page: number;
  readonly quads: readonly Quad[];
  /** Offsets into the page's extracted text, for matches broken across runs. */
  readonly start: number;
  readonly end: number;
}

/**
 * The worker's private map from a ticked id to the geometry that removes it.
 *
 * Mutable because feature 6 fills it as it detects. It is the one structure in
 * the codebase that must never be serialised into a message.
 */
export type TargetMap = Map<MatchId, RedactionTarget>;

/**
 * A document held open for the life of a session.
 *
 * Spec 0002 keeps the document open across steps rather than reopening it per
 * call, so ticking a box and running again costs no reparse. That makes closing
 * it an explicit act: `close()` is the only thing that hands MuPDF's native
 * memory back, and the worker calls it when the session ends.
 */
export interface OpenDocument {
  readonly summary: DocumentSummary;
  /**
   * Release the native memory MuPDF holds.
   *
   * Safe to call more than once. This is the tidy ending, taken when a second
   * document replaces this session. Terminating the worker is the other one
   * (spec 0002, INV-6): it reclaims the same memory without calling this, and
   * does so even when the worker is wedged.
   */
  close(): void;
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
  limits: { maxBytes: number; maxPages: number },
  onPhase?: (phase: "loading-engine" | "opening" | "inspecting") => void,
): Promise<OpenDocument> {
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

    return holdOpen(doc, { pageCount, pagesWithText });
  } catch (failure) {
    // The document only survives a successful open. Anything else hands the
    // native memory straight back rather than waiting for a session that will
    // never exist.
    doc?.destroy();
    throw failure;
  }
}

/**
 * Wrap an open document in the handle the worker holds.
 *
 * The MuPDF document itself stays captured in here, so nothing outside this
 * module can reach it or name its type. That is the engine wall at the value
 * level rather than only at the import level.
 */
function holdOpen(
  doc: InstanceType<MuPdf["Document"]>,
  summary: DocumentSummary,
): OpenDocument {
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
