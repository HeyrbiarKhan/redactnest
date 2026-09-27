import { EngineFailure } from "./failure";

export type MuPdf = typeof import("mupdf");

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
      .then((module: unknown) => {
        const mupdf = module as MuPdf;
        // Before anything is opened, so not one line about a document can be
        // printed ahead of it.
        silenceEngineLog(mupdf);
        return mupdf;
      })
      .catch(() => {
        // Let a later attempt retry rather than caching the failure forever.
        enginePromise = null;
        throw new EngineFailure("engine-unavailable");
      });
  }
  return enginePromise;
}

/** Where MuPDF's warnings and errors go now: nowhere. */
function discardLogLine(): void {}

/**
 * Spec 0004, AC-24. MuPDF's own warnings and errors never reach the console.
 *
 * MuPDF reports what it finds as it parses, flattens and redacts, and those
 * lines can quote the document: a font name, a field name, a damaged object's
 * contents. Silencing them at the source makes the rule in `AGENTS.md` that
 * error reporting must never capture worker console output a backstop rather
 * than the only line of defence.
 *
 * A callback that discards every line, never `null`. `null` means "no
 * callback", and what MuPDF does without one is MuPDF's to decide: 1.28 prints
 * nothing, but its default before any `setLog` call is to print to the
 * console, and an upgrade that fell back to that would undo this in silence. A
 * callback that throws every line away is silent by construction.
 */
export function silenceEngineLog(mupdf: MuPdf): void {
  mupdf.setLog(discardLogLine);
}
