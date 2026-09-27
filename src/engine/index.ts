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
 *   - `targets.ts` checks each target's quads really surround its text, and
 *     refuses one too slanted, or over an image blanked too far, to redact.
 *   - `geometry.ts` derives the band, the line box and the padded area, and
 *     measures how far MuPDF acts past an area it is given.
 *   - `passes.ts` removes text, blanks pixels and draws the boxes.
 *   - `inventory.ts` records what the source carried, for `sanitized`.
 *   - `rebuild.ts` builds the output from the redacted pages alone.
 *   - `characters.ts` records every page's characters and compares them.
 *   - `pixels.ts` measures how far each image under a target would be blanked,
 *     and checks no image still shows ink under one.
 *   - `self-check.ts` reopens the output and proves it clean.
 *
 * Spec 0005 added detection, on the same prepared page:
 *
 *   - `find.ts` reads each page's characters, hands each text block to
 *     `@/detect`, and turns every find into quads and a target, or blocks it
 *     with the reason the engine would refuse it for. `OpenDocument.findMatches`
 *     runs it. Only this folder imports `@/detect`.
 *
 * Nothing in this folder calls `search()` (spec 0005, INV-11); lint holds it.
 *
 * The functions ending in `With` take the loaded MuPDF module as a parameter.
 * They are the seam Vitest uses to run the real engine in Node; the worker
 * calls the plain versions, which load the engine themselves.
 *
 * Licence note: MuPDF is AGPL 3.0, which is why RedactNest itself is AGPL 3.0
 * and its source is published. See feature 18.
 */

export {
  CHECK_EXTRACTION_OPTIONS,
  EXTRACTION_OPTIONS,
  LINE_ANGLE_TOLERANCE,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  POSITION_TOLERANCE,
  walkCharacters,
  type Character,
} from "./characters";
export { hasPdfHeader, PDF_HEADER_WINDOW } from "./door";
export { checkpoint, EngineFailure, RunCancelled } from "./failure";
export { findMatchesIn } from "./find";
export {
  blankedRegion,
  BOUNDS_REACH_RATIO,
  boundsReach,
  containsPoint,
  imageReach,
  isSoundQuad,
  isTooSlanted,
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
export { imagesWithinReach } from "./pixels";
export { prepareDocument } from "./prepare";
export { PIPELINE, redactDocument, redactDocumentWith, type Pipeline } from "./redact";
export { unsoundTargets, unsoundTargetsIn, type OutlinedText } from "./targets";
export {
  CARRIER_KEYS,
  CATALOG_KEYS,
  PAGE_KEYS,
  stripToAllowlist,
  sweepCarriers,
  WRITE_OPTIONS,
} from "./rebuild";
export type {
  FindOptions,
  FoundMatch,
  OpenDocument,
  Quad,
  RedactionResult,
  RedactionTarget,
  RunHooks,
  TargetMap,
} from "./types";
