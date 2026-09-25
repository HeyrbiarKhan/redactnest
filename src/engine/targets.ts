import type { PDFDocument } from "mupdf";

import { EXTRACTION_OPTIONS, walkCharacters } from "./characters";
import { EngineFailure } from "./failure";
import { containsPoint, isSoundQuad, quadCentre } from "./geometry";
import type { RedactionTarget } from "./types";

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
 * removed. Spec 0004, AC-27 and INV-14.
 *
 * Each quad must be finite, must not cross itself, and must have every side at
 * least `MIN_QUAD_SIDE` long. Then the characters whose centres lie inside the
 * target's quads, in extraction order with whitespace removed, must contain
 * the target's `text` as one unbroken run.
 *
 * Without this the run would trust the quads blindly. A quad in the wrong page
 * space would remove the wrong glyphs, the real match would lie outside it and
 * be recorded as unticked, and the self check would pass a file that still
 * says it. A target that fails is refused with `unsupported` rather than
 * redacted.
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
        !target.quads.every(isSoundQuad) ||
        withoutWhitespace(target.text).length === 0
      ) {
        throw new EngineFailure("unsupported");
      }
    }

    const found = targets.map(() => [] as string[]);
    try {
      const page = doc.loadPage(index);
      try {
        walkCharacters(page, EXTRACTION_OPTIONS[0], (character) => {
          const centre = quadCentre(character.quad);
          targets.forEach((target, at) => {
            if (target.quads.some((quad) => containsPoint(quad, centre))) {
              found[at].push(String.fromCodePoint(character.code));
            }
          });
        });
      } finally {
        page.destroy();
      }
    } catch {
      // A page MuPDF cannot extract is a page nobody can check a target on.
      throw new EngineFailure("unsupported");
    }

    targets.forEach((target, at) => {
      if (
        !withoutWhitespace(found[at].join("")).includes(withoutWhitespace(target.text))
      ) {
        throw new EngineFailure("unsupported");
      }
    });
  }
}
