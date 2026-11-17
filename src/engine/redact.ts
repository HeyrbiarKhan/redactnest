import type { Document, PDFDocument, PDFPage } from "mupdf";

import type { MatchKind, TermId, TermRemoval } from "@/worker/protocol";

import { recordPage, targetArea, type PageRecord } from "./characters";
import { checkpoint as yieldThenCheck, EngineFailure } from "./failure";
import { lineBox, paddedArea, removalBand } from "./geometry";
import { glyphRuleOf, type GlyphVerdict } from "./glyphs";
import { takeInventory } from "./inventory";
import { loadEngine, type MuPdf } from "./load";
import { boxPass, paddedPass, textPass, type Pass } from "./passes";
import { prepareDocument } from "./prepare";
import {
  graftPages,
  pruneToRoles,
  rewriteOutput,
  stripToAllowlist,
  sweepCarriers,
  takeOutput,
  WRITE_OPTIONS,
} from "./rebuild";
import {
  checkOutput,
  drawnShape,
  sameDrawnShape,
  structureIsClean,
  type DrawnShape,
  type StructureCheck,
} from "./self-check";
import { targetsByPage, validateTargets } from "./targets";
import { trimToVisibleArea } from "./trim";
import type {
  Quad,
  RedactionResult,
  RedactionTarget,
  RunHooks,
  TrimOutcome,
} from "./types";

/**
 * The steps a run takes that a test needs to be able to change.
 *
 * Spec 0004 proves each part of the self check fires by running the pipeline
 * with a step left out or changed and watching the run fail: the text pass
 * skipped leaves a glyph, the padded pass skipped leaves scan ink, removal on
 * the exact quads takes the lines around a target, the sweep skipped leaves a
 * carrier. Spec 0006 adds the trim: skipped, it leaves text outside the
 * visible area, and swapped, it disagrees with the open. Spec 0019 adds the
 * prune and the structure check: the prune skipped, every kept object case
 * fails the check on its own (AC-6), and both skipped, a run writes main's
 * output, which every fixture's pixels are compared with (AC-7). Its fourth
 * pass adds the second write, so a test can make it keep the entry it should
 * drop, throw, or change what a page draws, and watch the run fail (AC-15).
 * Spec 0020 adds the glyph rule: swapped out, a run writes main's output, so
 * a test can watch the check fail text below a glyph on its own, and the gate
 * can compare what main drew (AC-7, AC-10). A parameter with a frozen default,
 * rather than a setter, so the walled module holds no mutable hook and the
 * worker can only ever run the real thing.
 */
export interface Pipeline {
  /**
   * The glyph rule on the prepared working copy (`glyphs.ts`). Spec 0020,
   * AC-6: the run refuses on any answer but `"clean"`, and on a throw.
   */
  readonly judgeGlyphs: (pdf: PDFDocument) => GlyphVerdict | "problem";
  /** What lies outside each page's visible area, removed (`trim.ts`). */
  readonly trim: (
    mupdf: MuPdf,
    pdf: PDFDocument,
    isCancelled?: () => boolean,
  ) => Promise<readonly TrimOutcome[]>;
  /** The typed allowlist below the pages (`rebuild.ts`). Spec 0019, AC-1. */
  readonly pruneToRoles: (out: PDFDocument) => void;
  /** The carrier sweep over the rebuilt document (`rebuild.ts`). */
  readonly sweepCarriers: (out: PDFDocument) => void;
  /** The structure part of the self check (`self-check.ts`). Spec 0019, AC-5. */
  readonly checkStructure: StructureCheck;
  /**
   * The second write, on the check's `unused-colour-space` verdict alone
   * (`rebuild.ts`). Spec 0019, AC-15.
   */
  readonly rewrite: (mupdf: MuPdf, bytes: ArrayBuffer) => ArrayBuffer;
  /** The pass that removes text (`passes.ts`). */
  readonly textPass: Pass;
  /** The pass that blanks pixels and removes covered line art (`passes.ts`). */
  readonly paddedPass: Pass;
  /** The area text is removed on, from a target quad (`geometry.ts`). */
  readonly removalArea: (quad: Quad) => Quad;
}

export const PIPELINE: Pipeline = Object.freeze({
  judgeGlyphs: glyphRuleOf,
  trim: trimToVisibleArea,
  pruneToRoles,
  sweepCarriers,
  checkStructure: structureIsClean,
  rewrite: rewriteOutput,
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
 * The pipeline order is fixed (spec 0004, *State transitions*, as specs 0006,
 * 0019 and 0020 amend it): inventory, prepare, the glyph rule, trim, validate
 * targets, slant, images, record every page, the three passes page by page,
 * rebuild, write, self check; on the check's `unused-colour-space` verdict
 * alone, a checkpoint, the second write and the whole self check on its bytes.
 * The inventory comes before preparing, or flattened annotations would
 * no longer be found. Preparing comes before any Redact annotation is added,
 * or the flatten would bake the markers into the page. The glyph rule comes
 * right after preparing, on the page the bake drew, as it does at open, and
 * before anything is removed. The trim comes next, as it does at open, so
 * targets are checked on the page detection read, prepared and trimmed alike
 * (spec 0004, INV-9, as spec 0006 rewords it). Every page is recorded before any page is redacted, and after
 * the trim, so a trimmed character is never expected back, and a pass that
 * changes a resource shared with a later page cannot change that page's
 * record too.
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

  /** A yield, then a look at whether the run should stop. Spec 0004, AC-17. */
  const checkpoint = (): Promise<void> => yieldThenCheck(isCancelled);

  onPhase?.("redacting");

  let work: PDFDocument | null = openWorkingCopy(mupdf, bytes);
  let out: PDFDocument | null = null;

  const sourcePageCount = work.countPages();

  try {
    await checkpoint();

    const sanitized = takeInventory(work);
    prepareDocument(mupdf, work);

    // Spec 0020, AC-6: what a Type 3 font's glyphs draw, judged on the
    // prepared copy before any pass removes anything, so a ticked value can
    // never survive through a glyph. The open refused such a file already;
    // this holds it for any bytes a run is handed.
    refuseBrokenGlyphs(pipeline, work);
    await checkpoint();

    // Spec 0006, AC-14: on every working copy, with nothing ticked as well,
    // through the same function the open trims the review copy with (INV-3).
    // It yields and checks for a cancel after every page.
    const trim = await pipeline.trim(mupdf, work, isCancelled);

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

    // The catalog and the pages first, then every object below them (spec
    // 0019): the prune walks from the cut catalog, so nothing a dropped
    // catalog key reached is walked at all. The sweep stays as a backstop.
    stripToAllowlist(out);
    pipeline.pruneToRoles(out);
    pipeline.sweepCarriers(out);
    await checkpoint();

    onPhase?.("writing");
    const written = out.saveToBuffer(WRITE_OPTIONS);

    // Then the rebuilt document, right after it is written, and MuPDF's own
    // buffer right after it is copied. The engine makes the copy itself, so the
    // bytes the self check reads are the bytes that cross (INV-2).
    out.destroy();
    out = null;
    let output = takeOutput(written);

    onPhase?.("verifying");
    const verdict = checkOutput(
      mupdf,
      output,
      record,
      pages,
      pipeline.checkStructure,
      true,
    );
    if (verdict === "rewrite") {
      // Spec 0019, AC-15: the second write's bytes replace the first as the
      // bytes that cross, so the run holds the first only until it is written
      // again.
      output = await writeAgain(mupdf, output, record, pages, pipeline, checkpoint);
    } else if (verdict !== null) {
      throw new EngineFailure(verdict);
    }

    return {
      output,
      removedByType: countByKind(targets),
      removedByTerm: countByTerm(targets),
      sanitized,
      trim,
    };
  } finally {
    work?.destroy();
    out?.destroy();
  }
}

/**
 * The glyph rule's refusal (spec 0020, AC-6): `unreadable-structure` on any
 * answer but `"clean"`, a walk with a problem included, and on a throw, since
 * a rule that cannot finish vouches for nothing. Its words are spec 0019's,
 * unchanged, and name no page.
 */
function refuseBrokenGlyphs(pipeline: Pipeline, work: PDFDocument): void {
  let verdict: GlyphVerdict | "problem";
  try {
    verdict = pipeline.judgeGlyphs(work);
  } catch {
    throw new EngineFailure("unreadable-structure");
  }
  if (verdict !== "clean") throw new EngineFailure("unreadable-structure");
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
 * The second write, and the whole self check on its bytes. Spec 0019, AC-15
 * and INV-8.
 *
 * Run only when the check's one finding on the first bytes was a colour space
 * entry no drawing names, and at most once. The first bytes' drawn shape is
 * taken, the run yields at a checkpoint (a cancel there ends the run as a
 * cancel, never a failure), and `pipeline.rewrite` writes them again. Once it
 * has started it cannot be cancelled, as the first write cannot, and the phase
 * stays `verifying`. The new bytes then face the whole check with no second
 * chance, so an entry still unused is `redaction-incomplete`. Only once that
 * passes are the two drawn shapes compared: the full check reads no picture
 * nobody ticked and counts no figure, so a second write that dropped either is
 * caught here, as `unsupported`, since nothing was found to leak but what a
 * page draws changed. Any failure the full check finds outranks it.
 *
 * The rebuilt document is already gone, and the documents the check and the
 * shape opened on the first bytes are destroyed before the second write opens
 * them again, so the peak stays at about four copies (spec 0004's destroy
 * order).
 */
async function writeAgain(
  mupdf: MuPdf,
  first: ArrayBuffer,
  record: readonly PageRecord[],
  pages: ReadonlyMap<number, readonly RedactionTarget[]>,
  pipeline: Pipeline,
  checkpoint: () => Promise<void>,
): Promise<ArrayBuffer> {
  const before = shapeOf(mupdf, first);
  await checkpoint();

  let second: ArrayBuffer;
  try {
    second = pipeline.rewrite(mupdf, first);
  } catch {
    // A second write that throws vouches for nothing, the same as a throw
    // while checking: `redaction-incomplete`.
    throw new EngineFailure("redaction-incomplete");
  }

  const failure = checkOutput(mupdf, second, record, pages, pipeline.checkStructure);
  if (failure !== null) throw new EngineFailure(failure);

  if (!sameDrawnShape(before, shapeOf(mupdf, second))) {
    throw new EngineFailure("unsupported");
  }
  return second;
}

/** A file's drawn shape; a throw while reading it is a check that cannot finish. */
function shapeOf(mupdf: MuPdf, bytes: ArrayBuffer): DrawnShape {
  try {
    return drawnShape(mupdf, bytes);
  } catch {
    throw new EngineFailure("redaction-incomplete");
  }
}

/**
 * Ticked targets per kind. Only ever called once the self check has passed.
 * Two ticked targets over one place each count once, under their own kind
 * (spec 0017, AC-21).
 */
function countByKind(
  targets: readonly RedactionTarget[],
): Readonly<Partial<Record<MatchKind, number>>> {
  const counts: Partial<Record<MatchKind, number>> = {};
  for (const target of targets) {
    counts[target.kind] = (counts[target.kind] ?? 0) + 1;
  }
  return Object.freeze(counts);
}

/**
 * Ticked term targets per term, in the order each term first appears, once
 * the self check has passed (spec 0017, AC-22). Ids only: the page puts the
 * words back from its own list.
 */
function countByTerm(targets: readonly RedactionTarget[]): readonly TermRemoval[] {
  const counts = new Map<TermId, number>();
  for (const { term } of targets) {
    if (term !== null) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return Object.freeze(
    [...counts].map(([term, removed]) => Object.freeze({ term, removed })),
  );
}
