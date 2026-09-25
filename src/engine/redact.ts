import type { Buffer as MuBuffer, Document, PDFDocument, PDFPage } from "mupdf";

import type { DetectorKind } from "@/worker/protocol";

import { recordPage, targetArea, type PageRecord } from "./characters";
import { EngineFailure, RunCancelled } from "./failure";
import { lineBox, paddedArea, removalBand } from "./geometry";
import { takeInventory } from "./inventory";
import { loadEngine, type MuPdf } from "./load";
import { boxPass, paddedPass, textPass, type Pass } from "./passes";
import { prepareDocument } from "./prepare";
import { graftPages, stripToAllowlist, sweepCarriers, WRITE_OPTIONS } from "./rebuild";
import { checkOutput } from "./self-check";
import { targetsByPage, validateTargets } from "./targets";
import type { Quad, RedactionResult, RedactionTarget, RunHooks } from "./types";

/**
 * The steps a run takes that a test needs to be able to change.
 *
 * Spec 0004 proves each part of the self check fires by running the pipeline
 * with a step left out or changed and watching the run fail: the text pass
 * skipped leaves a glyph, the padded pass skipped leaves scan ink, removal on
 * the exact quads takes the lines around a target, the sweep skipped leaves a
 * carrier. A parameter with a frozen default, rather than a setter, so the
 * walled module holds no mutable hook and the worker can only ever run the
 * real thing.
 */
export interface Pipeline {
  /** The carrier sweep over the rebuilt document (`rebuild.ts`). */
  readonly sweepCarriers: (out: PDFDocument) => void;
  /** The pass that removes text (`passes.ts`). */
  readonly textPass: Pass;
  /** The pass that blanks pixels and removes covered line art (`passes.ts`). */
  readonly paddedPass: Pass;
  /** The area text is removed on, from a target quad (`geometry.ts`). */
  readonly removalArea: (quad: Quad) => Quad;
}

export const PIPELINE: Pipeline = Object.freeze({
  sweepCarriers,
  textPass,
  paddedPass,
  removalArea: removalBand,
});

/**
 * Redact a document and hand back a file the engine has proved clean.
 *
 * Takes the clean original, never the review document's handle, so the type
 * system itself keeps a run off the review copy (spec 0004, INV-1). Every run
 * opens its own working copy from these bytes, which is what makes a second run
 * with different ticks come out reflecting only its own (AC-11).
 */
export async function redactDocument(
  bytes: ArrayBuffer,
  targets: readonly RedactionTarget[],
  hooks: RunHooks = {},
): Promise<RedactionResult> {
  const mupdf = await loadEngine();
  return redactDocumentWith(mupdf, bytes, targets, hooks);
}

/**
 * `redactDocument` with the engine already in hand: the same seam
 * `openDocumentWith` gives Vitest, so both run the real MuPDF in Node.
 *
 * The pipeline order is fixed (spec 0004, *State transitions*). The inventory
 * comes before preparing, or flattened annotations would no longer be found.
 * Preparing comes before any Redact annotation is added, or the flatten would
 * bake the markers into the page. Targets are checked on the prepared copy,
 * the page detection read. Every page is recorded before any page is
 * redacted, or a pass that changes a resource shared with a later page would
 * change that page's record too.
 *
 * All or nothing (AC-14). Every native object this opens is destroyed on every
 * path out, and nothing is returned unless the self check passed on the exact
 * bytes being returned.
 */
export async function redactDocumentWith(
  mupdf: MuPdf,
  bytes: ArrayBuffer,
  targets: readonly RedactionTarget[],
  hooks: RunHooks = {},
  pipeline: Pipeline = PIPELINE,
): Promise<RedactionResult> {
  const { onPhase, isCancelled } = hooks;
  const pages = targetsByPage(targets);

  /**
   * A yield, then a look at whether the run should stop. Spec 0004, AC-17.
   *
   * A macrotask rather than a microtask, so a `cancel` message waiting in the
   * worker's queue is actually delivered before the check reads the flag.
   */
  const checkpoint = async (): Promise<void> => {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (isCancelled?.()) throw new RunCancelled();
  };

  onPhase?.("redacting");

  let work: PDFDocument | null = openWorkingCopy(mupdf, bytes);
  let out: PDFDocument | null = null;

  const sourcePageCount = work.countPages();

  try {
    await checkpoint();

    const sanitized = takeInventory(work);
    prepareDocument(mupdf, work);
    await checkpoint();

    validateTargets(work, pages);

    // The character record: every page, both extraction modes, before a
    // single page is redacted (INV-12). Pages with no target are recorded
    // too, so damage to a page nobody ticked is caught as well. Held only for
    // this run, and dropped with it.
    const record: PageRecord[] = [];
    for (let index = 0; index < sourcePageCount; index += 1) {
      const areas = (pages.get(index) ?? []).flatMap((target) =>
        target.quads.map(targetArea),
      );
      record.push(onPage(work, index, (page) => recordPage(page, areas)));
      await checkpoint();
    }

    for (let index = 0; index < sourcePageCount; index += 1) {
      const onThisPage = pages.get(index);
      if (onThisPage) redactPage(mupdf, work, index, onThisPage, pipeline);
      // Every page is visited, with a target or without, so even an empty run
      // notices a cancel within one page of work.
      await checkpoint();
    }

    out = graftPages(mupdf, work);

    // The destroy order holds a run's peak at about four copies of the
    // document (spec 0004): the working copy goes the moment its last page is
    // grafted.
    work.destroy();
    work = null;

    stripToAllowlist(out);
    pipeline.sweepCarriers(out);
    await checkpoint();

    onPhase?.("writing");
    const written = out.saveToBuffer(WRITE_OPTIONS);

    // Then the rebuilt document, right after it is written, and MuPDF's own
    // buffer right after it is copied. The engine makes the copy itself, so the
    // bytes the self check reads are the bytes that cross (INV-2).
    out.destroy();
    out = null;
    const output = takeOutput(written);

    onPhase?.("verifying");
    const failure = checkOutput(mupdf, output, record, pages);
    if (failure !== null) {
      throw new EngineFailure(failure);
    }

    return {
      output,
      removedByType: countByKind(targets),
      sanitized,
    };
  } finally {
    work?.destroy();
    out?.destroy();
  }
}

/** Load a page, read it, and hand it back to MuPDF whatever happens. */
function onPage<T>(doc: PDFDocument, index: number, read: (page: PDFPage) => T): T {
  const page = doc.loadPage(index);
  try {
    return read(page);
  } finally {
    page.destroy();
  }
}

/**
 * The three passes over one page, in their fixed order: text on the removal
 * bands, then pixels and covered line art on the padded areas, then the box on
 * the line boxes (spec 0004, *Redaction settings*).
 *
 * A throw from MuPDF while a pass runs is `unsupported`: the page is a shape
 * the engine could not redact, which is different from a redaction it could not
 * prove.
 */
function redactPage(
  mupdf: MuPdf,
  work: PDFDocument,
  index: number,
  targets: readonly RedactionTarget[],
  pipeline: Pipeline,
): void {
  const areas = (area: (quad: Quad) => Quad) =>
    targets.map((target) => target.quads.map(area));

  try {
    onPage(work, index, (page) => {
      pipeline.textPass(mupdf, page, areas(pipeline.removalArea));
      pipeline.paddedPass(mupdf, page, areas(paddedArea));
      boxPass(mupdf, page, areas(lineBox));
    });
  } catch (failure) {
    if (failure instanceof EngineFailure) throw failure;
    throw new EngineFailure("unsupported");
  }
}

/**
 * A copy of the original that this run alone owns and destroys.
 *
 * The bytes opened once already, as the review copy, so a failure here is
 * MuPDF disagreeing with itself, and the honest kind for it is `corrupt`.
 */
function openWorkingCopy(mupdf: MuPdf, bytes: ArrayBuffer): PDFDocument {
  let doc: Document;
  try {
    doc = mupdf.Document.openDocument(bytes, "application/pdf");
  } catch {
    throw new EngineFailure("corrupt");
  }

  const pdf = doc.asPDF();
  if (!pdf) {
    doc.destroy();
    throw new EngineFailure("corrupt");
  }
  return pdf;
}

/**
 * Copy the written file out of MuPDF's heap into a fresh `ArrayBuffer`, then
 * hand MuPDF's buffer straight back.
 *
 * `asUint8Array()` is a view into the WebAssembly heap, not a copy, so the
 * `slice()` is load bearing: without it the output would be memory MuPDF is
 * about to reuse.
 */
function takeOutput(written: MuBuffer): ArrayBuffer {
  try {
    return written.asUint8Array().slice().buffer;
  } finally {
    written.destroy();
  }
}

/** Ticked targets per kind. Only ever called once the self check has passed. */
function countByKind(
  targets: readonly RedactionTarget[],
): Readonly<Partial<Record<DetectorKind, number>>> {
  const counts: Partial<Record<DetectorKind, number>> = {};
  for (const target of targets) {
    counts[target.kind] = (counts[target.kind] ?? 0) + 1;
  }
  return Object.freeze(counts);
}
