/**
 * The PDF engine. MuPDF compiled to WebAssembly.
 *
 * WALLED MODULE. Only `src/worker/engine.worker.ts` may import this folder.
 *
 * Spec 0001 invariants this folder exists to hold:
 *   - One PDF parser only. Nothing else in the codebase parses or renders a PDF.
 *   - Only the worker may import the engine module.
 *   - Document bytes live only inside the Web Worker.
 *
 * The engine wall zones in `eslint.config.mjs` enforce that boundary, so a stray
 * import fails the lint run rather than quietly shipping. If you are reading
 * this from anywhere on the main thread, you are on the wrong side of the wall:
 * talk to the worker through `src/worker/client.ts` instead.
 *
 * Spec 0004 grew it from an opener into the redaction engine, one file per step:
 *
 *   - `door.ts` refuses what is not a PDF, from the bytes, before the engine loads.
 *   - `open.ts` opens and prepares the review copy.
 *   - `prepare.ts` is the one prepare step detection and redaction share.
 *   - `redact.ts` runs a redaction on a working copy of the original.
 *   - `targets.ts` checks each target's quads really surround its text.
 *   - `geometry.ts` derives the band, the line box and the padded area.
 *   - `passes.ts` removes text, blanks pixels and draws the boxes.
 *   - `inventory.ts` records what the source carried, for `sanitized`.
 *   - `rebuild.ts` builds the output from the redacted pages alone.
 *   - `characters.ts` records every page's characters and compares them.
 *   - `pixels.ts` checks no image still shows ink under a target.
 *   - `self-check.ts` reopens the output and proves it clean.
 *
 * The functions ending in `With` take the loaded MuPDF module as a parameter.
 * They are the seam Vitest uses to run the real engine in Node; the worker
 * calls the plain versions, which load the engine themselves.
 *
 * Licence note: MuPDF is AGPL 3.0, which is why RedactNest itself is AGPL 3.0
 * and its source is published. See feature 18.
 */

export {
  EXTRACTION_OPTIONS,
  LINE_ANGLE_TOLERANCE,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  POSITION_TOLERANCE,
} from "./characters";
export { hasPdfHeader, PDF_HEADER_WINDOW } from "./door";
export { EngineFailure, RunCancelled } from "./failure";
export {
  containsPoint,
  isSoundQuad,
  LINE_BOX_BOTTOM,
  LINE_BOX_TOP,
  lineBox,
  MIN_QUAD_SIDE,
  paddedArea,
  quadHeight,
  quadWidth,
  REMOVAL_BAND_RATIO,
  REMOVAL_INSET_RATIO,
  removalBand,
  TARGET_PADDING_ALONG_RATIO,
  TARGET_PADDING_RATIO,
} from "./geometry";
export { loadEngine, silenceEngineLog, type MuPdf } from "./load";
export { openDocument, openDocumentWith } from "./open";
export { boxPass, paddedPass, textPass, type Pass } from "./passes";
export { prepareDocument } from "./prepare";
export { PIPELINE, redactDocument, redactDocumentWith, type Pipeline } from "./redact";
export {
  CARRIER_KEYS,
  CATALOG_KEYS,
  PAGE_KEYS,
  stripToAllowlist,
  sweepCarriers,
  WRITE_OPTIONS,
} from "./rebuild";
export type {
  OpenDocument,
  Quad,
  RedactionResult,
  RedactionTarget,
  RunHooks,
  TargetMap,
} from "./types";
