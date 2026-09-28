import type { PDFDocument, PDFPage } from "mupdf";

import { EXTRACTION_OPTIONS, walkCharacters, type Character } from "./characters";
import { EngineFailure } from "./failure";
import {
  containsPoint,
  isSoundQuad,
  isTooSlanted,
  paddedArea,
  quadBounds,
  quadCentre,
} from "./geometry";
import { imageReachVerdicts } from "./pixels";
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
 *
 * Each check is decided per target, through predicates detection asks too
 * (spec 0005, INV-3), so a match detection left unblocked passes here alone
 * and beside any other unblocked match.
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
    if (onPage(doc, index, (page) => unsoundTargets(page, targets)).some(Boolean)) {
      throw new EngineFailure("unsupported");
    }
  }

  for (const targets of pages.values()) {
    if (slantedTargets(targets).some(Boolean)) {
      throw new EngineFailure("slanted-text");
    }
  }

  for (const [index, targets] of pages) {
    if (onPage(doc, index, (page) => imageReachVerdicts(page, targets)).some(Boolean)) {
      throw new EngineFailure("redaction-overreach");
    }
  }
}

/**
 * Which targets have a quad set at too steep an angle to redact? Spec 0004,
 * AC-28, and spec 0005, AC-8 (`slanted-text`). One answer per target, `true`
 * for one that does. `isTooSlanted` fails closed, so a quad that yields `NaN`
 * anywhere counts as too slanted.
 */
export function slantedTargets(
  targets: readonly Pick<RedactionTarget, "quads">[],
): readonly boolean[] {
  return targets.map((target) => target.quads.some(isTooSlanted));
}

/** What the outline check reads from a target. */
export type OutlinedText = Pick<RedactionTarget, "quads" | "text">;

/**
 * Which targets do not hold up on this page? Spec 0004, AC-27, and spec 0005,
 * AC-8 (`unsound-outline`). One answer per target, in order, `true` for one
 * that does not.
 *
 * A target holds up when it has at least one quad, every quad and its padded
 * area are sound, its `text` is not only whitespace, and the characters whose
 * centres lie inside its quads, in extraction order with whitespace removed,
 * contain its `text` as one unbroken run. Without this a run would trust the
 * quads blindly: a quad in the wrong page space would remove the wrong glyphs,
 * the real match would be recorded as unticked, and the self check would pass
 * a file that still says it.
 *
 * Reads the page once in ordinary extraction. Detection has that read already,
 * so it asks `unsoundTargetsIn` with the characters it holds.
 */
export function unsoundTargets(
  page: PDFPage,
  targets: readonly OutlinedText[],
): readonly boolean[] {
  const characters: Character[] = [];
  walkCharacters(page, EXTRACTION_OPTIONS[0], (character) => characters.push(character));
  return unsoundTargetsIn(characters, targets);
}

/**
 * `unsoundTargets` over characters already read in `EXTRACTION_OPTIONS[0]`.
 * The same predicate, so detection and validation give the same answer.
 */
export function unsoundTargetsIn(
  characters: readonly Character[],
  targets: readonly OutlinedText[],
): readonly boolean[] {
  const outlined = targets.map(
    (target) =>
      target.quads.length > 0 &&
      target.quads.every(holdsUp) &&
      withoutWhitespace(target.text).length > 0,
  );
  // Each target's reach on the page, so a character far from it costs four
  // comparisons rather than a point test per quad. Only asked of targets whose
  // quads are sound, since the point test assumes a convex quad.
  const reach = targets.map((target, at) =>
    outlined[at] ? target.quads.map(quadBounds).reduce(union) : null,
  );
  const found = targets.map(() => [] as string[]);

  for (const character of characters) {
    const centre = quadCentre(character.quad);
    targets.forEach((target, at) => {
      const bounds = reach[at];
      if (
        bounds !== null &&
        centre[0] >= bounds[0] &&
        centre[0] <= bounds[2] &&
        centre[1] >= bounds[1] &&
        centre[1] <= bounds[3] &&
        target.quads.some((quad) => containsPoint(quad, centre))
      ) {
        found[at].push(String.fromCodePoint(character.code));
      }
    });
  }

  return targets.map(
    (target, at) =>
      !outlined[at] ||
      !withoutWhitespace(found[at].join("")).includes(withoutWhitespace(target.text)),
  );
}

type Bounds = readonly [number, number, number, number];

function union(a: Bounds, b: Bounds): Bounds {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
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
