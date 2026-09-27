import type { PDFDocument, PDFPage } from "mupdf";

import { EXTRACTION_OPTIONS, walkCharacters } from "./characters";
import { EngineFailure } from "./failure";
import {
  containsPoint,
  isSoundQuad,
  isTooSlanted,
  paddedArea,
  quadCentre,
} from "./geometry";
import { imagesWithinReach } from "./pixels";
import type { Quad, RedactionTarget } from "./types";

/**
 * The ticked targets, grouped by the page they sit on.
 *
 * A run visits pages in order and asks each for its targets, so this is worked
 * out once rather than filtered for every page.
 */
export function targetsByPage(
  targets: readonly RedactionTarget[],
): ReadonlyMap<number, readonly RedactionTarget[]> {
  const pages = new Map<number, RedactionTarget[]>();
  for (const target of targets) {
    const onPage = pages.get(target.page);
    if (onPage) onPage.push(target);
    else pages.set(target.page, [target]);
  }
  return pages;
}

/** Whitespace goes on both sides: MuPDF infers spaces, and a line break is one. */
function withoutWhitespace(text: string): string {
  return text.replace(/\s/gu, "");
}

/**
 * Check every target against the prepared working copy before anything is
 * removed. Spec 0004, AC-27 to AC-29, INV-14 and INV-15.
 *
 * Three checks, each over every target on every page before the next begins,
 * so the most basic fault is the one reported: `unsupported` outranks
 * `slanted-text`, which outranks an image blanked too far.
 *
 *  1. Each target holds up (AC-27). Each quad, and its padded area, must be
 *     finite, must not cross itself, and must have every side at least
 *     `MIN_QUAD_SIDE` long. Then the characters whose centres lie inside the
 *     target's quads, in extraction order with whitespace removed, must
 *     contain the target's `text` as one unbroken run. Without this the run
 *     would trust the quads blindly: a quad in the wrong page space would
 *     remove the wrong glyphs, the real match would be recorded as unticked,
 *     and the self check would pass a file that still says it.
 *  2. No quad is too slanted (AC-28), refused with `slanted-text`. MuPDF acts
 *     on each area's upright bounds, so a slanted padded area would take line
 *     art and blank pixels past itself, where nothing checks.
 *  3. No image under a target would be blanked too far (AC-29), refused with
 *     `redaction-overreach`, since that would remove image content nobody
 *     ticked.
 *
 * A throw from MuPDF while checking is `unsupported`: a page nobody can check
 * a target on is not a page to redact.
 */
export function validateTargets(
  doc: PDFDocument,
  pages: ReadonlyMap<number, readonly RedactionTarget[]>,
): void {
  const pageCount = doc.countPages();

  for (const [index, targets] of pages) {
    if (!Number.isInteger(index) || index < 0 || index >= pageCount) {
      throw new EngineFailure("unsupported");
    }
    for (const target of targets) {
      if (
        target.quads.length === 0 ||
        !target.quads.every(holdsUp) ||
        withoutWhitespace(target.text).length === 0
      ) {
        throw new EngineFailure("unsupported");
      }
    }

    const found = targets.map(() => [] as string[]);
    onPage(doc, index, (page) =>
      walkCharacters(page, EXTRACTION_OPTIONS[0], (character) => {
        const centre = quadCentre(character.quad);
        targets.forEach((target, at) => {
          if (target.quads.some((quad) => containsPoint(quad, centre))) {
            found[at].push(String.fromCodePoint(character.code));
          }
        });
      }),
    );

    targets.forEach((target, at) => {
      if (
        !withoutWhitespace(found[at].join("")).includes(withoutWhitespace(target.text))
      ) {
        throw new EngineFailure("unsupported");
      }
    });
  }

  for (const targets of pages.values()) {
    if (targets.some((target) => target.quads.some(isTooSlanted))) {
      throw new EngineFailure("slanted-text");
    }
  }

  for (const [index, targets] of pages) {
    if (!onPage(doc, index, (page) => imagesWithinReach(page, targets))) {
      throw new EngineFailure("redaction-overreach");
    }
  }
}

/**
 * A quad sound enough to trust, with a padded area sound enough to act on. A
 * quad whose sides converge sharply, such as a trapezoid 4 pt wide at the top
 * and 24 pt at the bottom, is sound itself but gives a padded area that
 * crosses itself, and every measure after this one assumes a convex area.
 */
function holdsUp(quad: Quad): boolean {
  return isSoundQuad(quad) && isSoundQuad(paddedArea(quad));
}

/**
 * Load a page, read it, and hand it back to MuPDF whatever happens. A throw
 * from MuPDF on the way is `unsupported`.
 */
function onPage<T>(doc: PDFDocument, index: number, read: (page: PDFPage) => T): T {
  let page: PDFPage;
  try {
    page = doc.loadPage(index);
  } catch {
    throw new EngineFailure("unsupported");
  }
  try {
    return read(page);
  } catch {
    throw new EngineFailure("unsupported");
  } finally {
    page.destroy();
  }
}
