import type { Buffer as MuBuffer, Document, PDFDocument } from "mupdf";

import type { DetectorKind } from "@/worker/protocol";

import { EngineFailure, RunCancelled } from "./failure";
import { takeInventory } from "./inventory";
import { loadEngine, type MuPdf } from "./load";
import { prepareDocument } from "./prepare";
import { graftPages, stripToAllowlist, sweepCarriers, WRITE_OPTIONS } from "./rebuild";
import { structureIsClean } from "./self-check";
import type { RedactionResult, RedactionTarget, RunHooks } from "./types";

/**
 * The steps a run takes that a test needs to be able to leave out.
 *
 * Spec 0004 proves the self check fires by running the pipeline with a step
 * skipped and watching the run fail. A parameter with a frozen default, rather
 * than a setter, so the walled module holds no mutable hook and the worker can
 * only ever run the real thing.
 */
export interface Pipeline {
  /** The carrier sweep over the rebuilt document (`rebuild.ts`). */
  readonly sweepCarriers: (out: PDFDocument) => void;
}

export const PIPELINE: Pipeline = Object.freeze({ sweepCarriers });

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
 * bake the markers into the page.
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

  // Slice 1 of spec 0004 cleans a file but removes nothing. Until the exact
  // pass and the target half of the self check land together, a run that was
  // asked to remove something refuses, so no build ever hands back a file that
  // was asked to remove text and did not.
  if (targets.length > 0) {
    throw new EngineFailure("unsupported");
  }

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

    for (let index = 0; index < sourcePageCount; index += 1) {
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
    if (!selfCheckPasses(mupdf, output, sourcePageCount)) {
      throw new EngineFailure("redaction-incomplete");
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

/**
 * Reopen the written output and check it. The document opened for the check is
 * destroyed before this returns, whatever it finds.
 */
function selfCheckPasses(
  mupdf: MuPdf,
  output: ArrayBuffer,
  sourcePageCount: number,
): boolean {
  let check: Document | null = null;

  try {
    check = mupdf.Document.openDocument(output, "application/pdf");
    const pdf = check.asPDF();
    return pdf !== null && structureIsClean(pdf, sourcePageCount);
  } catch {
    // An output MuPDF cannot even reopen is an output nobody can vouch for.
    return false;
  } finally {
    check?.destroy();
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
