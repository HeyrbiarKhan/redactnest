import type { PDFDocument, PDFPage } from "mupdf";

import type { EngineErrorKind } from "@/worker/protocol";

import {
  CHECK_EXTRACTION_OPTIONS,
  originIndex,
  POSITION_TOLERANCE,
  walkCharacters,
  walkLines,
  type Character,
} from "./characters";
import {
  intersect,
  transformPoint,
  walkDrawing,
  type Rect,
  type Transform,
} from "./device";
import { checkpoint, EngineFailure } from "./failure";
import { quadBounds, quadCentre } from "./geometry";
import type { MuPdf } from "./load";
import { trimPass } from "./passes";
import type { Quad, TrimOutcome } from "./types";

/**
 * Removing what lies outside each page's visible area. Spec 0006, AC-14 to
 * AC-16, INV-3, INV-4 and INV-11.
 *
 * Nobody can see text or drawn shapes outside a page's crop box, and they have
 * no reason to stay in a redacted file. So wherever `prepareDocument` runs, on
 * the review copy at open and on every working copy, this runs right after
 * it, through this one function, so detection, target validation and the
 * character record all read the same trimmed page (INV-3, spec 0004's INV-9).
 *
 * A picture is never decoded, blanked or removed here (INV-11). One that
 * reaches outside the visible area is kept whole and named instead, because
 * MuPDF writes every image it blanks again as Flate: a run on a 50 page cropped
 * scan at 300 pixels per inch went past 800 MB and grew the file about five
 * times (spec 0006, `rationale.md`).
 *
 * Each page is read on its own terms, never from the inspection (which runs on
 * the review copy only), so a working copy decides exactly as the review copy
 * did (AC-18): its own drawing pass for image placements, paths and the
 * extent of what the page draws, and its own unclipped character read. A page
 * whose reads find no text and no shape outside is left untouched.
 */

/**
 * How far past the visible area, in points, a picture must reach on some side
 * before its page is named for it (AC-15). An uncropped scan whose image sits a
 * fraction of a point past a rounded media box (an A4 scan at 595.28 pt on a
 * 595 pt page) is not named for a sliver too thin to hold anything readable. A
 * rule about pages, not a cap on the visitor: an engine constant, never config
 * (INV-7).
 */
export const PICTURE_REACH_MIN = 1;

/**
 * How far past everything the page draws the strips reach, in points, so the
 * outermost glyph or shape lies inside a strip rather than on its edge (AC-14).
 */
const STRIP_MARGIN = 1;

/**
 * Trim every page of a prepared copy. One page at a time; after each it
 * yields a macrotask and asks whether to stop (AC-29).
 *
 * Throws `EngineFailure("edge-text")` or `EngineFailure("unsupported")` when
 * the proof fails, by AC-16's rule, `EngineFailure("unsupported")` for any
 * other throw while a page is read or trimmed, and `RunCancelled`.
 */
export async function trimToVisibleArea(
  mupdf: MuPdf,
  pdf: PDFDocument,
  isCancelled?: () => boolean,
): Promise<readonly TrimOutcome[]> {
  const outcomes: TrimOutcome[] = [];
  const pageCount = pdf.countPages();
  for (let index = 0; index < pageCount; index += 1) {
    outcomes.push(trimPage(mupdf, pdf, index));
    await checkpoint(isCancelled);
  }
  return outcomes;
}

/** What the trim's reads decided for one page, before anything is removed. */
interface Plan {
  readonly visible: Rect;
  /** Empty when no pass runs. */
  readonly strips: readonly Quad[];
  /** `removed` says whether a pass runs at all. */
  readonly outcome: TrimOutcome;
}

function trimPage(mupdf: MuPdf, pdf: PDFDocument, index: number): TrimOutcome {
  const plan = readable(() => onPage(pdf, index, (page) => planTrim(mupdf, page)));
  if (!plan.outcome.removed) return plan.outcome;

  // AC-16: both unclipped modes before the pass, and again on the page
  // loaded afresh after it.
  const before = readable(() => onPage(pdf, index, readBoth));
  readable(() => onPage(pdf, index, (page) => trimPass(mupdf, page, plan.strips)));
  const after = readable(() => onPage(pdf, index, readBoth));

  const verdict = prove(before, after, plan.visible);
  if (verdict !== null) throw new EngineFailure(verdict);
  return plan.outcome;
}

/**
 * Read a page and decide. Spec 0006, AC-14 and AC-15.
 *
 * A page is trimmed for a character whose quad reaches outside the visible
 * area, or a path wholly outside it. "Reaches outside" allows
 * `POSITION_TOLERANCE`, so a glyph laid exactly on the edge, to a rounding
 * error, does not trim a page for nothing. A picture never starts a pass: one
 * reaching past the visible area by more than `PICTURE_REACH_MIN` names the
 * page and is kept whole, like every other picture on it.
 */
function planTrim(mupdf: MuPdf, page: PDFPage): Plan {
  const visible = toRect(page.getBounds());
  const media = toRect(page.getBounds("MediaBox"));

  let extent: Rect = visible;
  const reach = (bounds: Rect | null) => {
    if (bounds !== null) extent = union(extent, bounds);
  };

  let pathOutside = false;
  let pictureOutside = false;

  walkDrawing(
    mupdf,
    page,
    (drawing, state) => {
      switch (drawing.kind) {
        case "image": {
          const bounds = cut(quadBounds(unitSquare(drawing.transform)), state.clip);
          if (bounds === null) break;
          reach(bounds);
          // A soft mask's own content is never seen as paint, so it is no
          // picture, here as in the inspection (AC-15).
          if (!state.defining && reachesPast(bounds, visible, PICTURE_REACH_MIN)) {
            pictureOutside = true;
          }
          break;
        }
        case "path":
          if (drawing.bounds !== null) {
            reach(drawing.bounds);
            if (intersect(drawing.bounds, visible) === null) pathOutside = true;
          }
          break;
        case "shade":
          // Cut to the clip in force, or to the media box when a shading
          // with no bounds of its own is still unbounded (AC-14).
          reach(
            drawing.bounds === null
              ? (state.clip ?? media)
              : (cut(drawing.bounds, state.clip) ?? null),
          );
          break;
        case "begin-tile":
          reach(drawing.area);
          break;
        default:
          break;
      }
    },
    { glyphs: false },
  );

  // A character whose quad reaches outside sits on a line whose box does,
  // since a line's box is the union of its characters' quads.
  let characterOutside = false;
  walkLines(page, CHECK_EXTRACTION_OPTIONS[0], (bounds) => {
    if (!bounds.every(Number.isFinite)) return;
    reach(bounds);
    if (reachesPast(bounds, visible, POSITION_TOLERANCE)) characterOutside = true;
  });

  const removed = characterOutside || pathOutside;
  return {
    visible,
    strips: removed ? stripsAround(visible, grow(extent, STRIP_MARGIN)) : [],
    outcome: { removed, pictureOutside },
  };
}

/**
 * The four strips outside the visible area, out to `outer`. The side strips
 * span the full height, so each corner is covered twice rather than not at
 * all; the top and bottom strips run between them (AC-14). An empty strip is
 * left out.
 */
function stripsAround(visible: Rect, outer: Rect): readonly Quad[] {
  const [vx0, vy0, vx1, vy1] = visible;
  const [ox0, oy0, ox1, oy1] = outer;
  const rects: Rect[] = [
    [ox0, oy0, vx0, oy1],
    [vx1, oy0, ox1, oy1],
    [vx0, oy0, vx1, vy0],
    [vx0, vy1, vx1, oy1],
  ];
  return rects
    .filter(([x0, y0, x1, y1]) => x1 > x0 && y1 > y0)
    .map(([x0, y0, x1, y1]): Quad => [x0, y0, x1, y0, x0, y1, x1, y1]);
}

/** A character as the proof reads it: where it is, and which line it is on. */
interface Placed {
  readonly character: Character;
  /** Its quad's bounds. */
  readonly bounds: Rect;
}

/** Both unclipped extraction modes of a page. */
function readBoth(page: PDFPage): readonly (readonly Placed[])[] {
  return CHECK_EXTRACTION_OPTIONS.map((options) => {
    const placed: Placed[] = [];
    walkCharacters(page, options, (character) => {
      if (isWhitespace(character.code)) return;
      const [x0, y0, x1, y1] = quadBounds(character.quad);
      placed.push({ character, bounds: [x0, y0, x1, y1] });
    });
    return placed;
  });
}

/**
 * The trim's proof. Spec 0006, AC-16 and INV-4.
 *
 * In each mode, the characters before the pass are matched with those after
 * it as the self check matches them: the same code point, the origin within
 * `POSITION_TOLERANCE` on each axis, each matched once. Wrong is a character
 * whose quad lay wholly inside the visible area and is gone or moved, a
 * character centred outside it that is still there, or a character after the
 * pass that was not there before. A character straddling the edge may go or
 * stay.
 *
 * When every wrong character sits on a line that crosses the edge, the
 * failure is `edge-text`: MuPDF moved or kept text beside the glyphs the trim
 * took. Anything else is `unsupported`, so a file that spec 0004 could never
 * redact (lines shown with `'` or `"`, which the content filter moves) is not
 * blamed on the edge.
 */
function prove(
  before: readonly (readonly Placed[])[],
  after: readonly (readonly Placed[])[],
  visible: Rect,
): EngineErrorKind | null {
  let wrong = false;
  let offEdge = false;

  before.forEach((was, mode) => {
    const now = after[mode];
    const index = originIndex<number>();
    now.forEach(({ character }, at) => index.add(character.origin, at));
    const used = new Uint8Array(now.length);

    const beforeCrossing = crossingLines(was, visible);
    const afterCrossing = crossingLines(now, visible);
    const flag = (onCrossingLine: boolean) => {
      wrong = true;
      if (!onCrossingLine) offEdge = true;
    };

    for (const { character, bounds } of was) {
      // The same code point at the same origin, not matched yet: fake bold
      // draws one glyph twice at one place, and each copy matches once.
      const found =
        index.findWhere(
          character.origin,
          (at) => used[at] === 0 && now[at].character.code === character.code,
        ) ?? -1;
      if (found >= 0) used[found] = 1;

      const inside = whollyInside(bounds, visible);
      const outside = !containsPointRect(visible, quadCentre(character.quad));
      if ((inside && found < 0) || (outside && found >= 0)) {
        flag(beforeCrossing.has(character.line));
      }
    }

    now.forEach(({ character }, at) => {
      if (used[at] === 0) flag(afterCrossing.has(character.line));
    });
  });

  if (!wrong) return null;
  return offEdge ? "unsupported" : "edge-text";
}

/**
 * The lines, by index, that cross the visible area's edge: one character's
 * quad reaches outside it and one's lies at least partly inside it.
 */
function crossingLines(placed: readonly Placed[], visible: Rect): ReadonlySet<number> {
  const outside = new Set<number>();
  const inside = new Set<number>();
  for (const { character, bounds } of placed) {
    if (reachesPast(bounds, visible, POSITION_TOLERANCE)) outside.add(character.line);
    if (intersect(bounds, visible) !== null) inside.add(character.line);
  }
  return new Set([...outside].filter((line) => inside.has(line)));
}

/** Load a page, read or change it, and hand it back to MuPDF whatever happens. */
function onPage<T>(pdf: PDFDocument, index: number, work: (page: PDFPage) => T): T {
  const page = pdf.loadPage(index);
  try {
    return work(page);
  } finally {
    page.destroy();
  }
}

/**
 * Run a read or the pass. A described failure passes through; any other throw
 * is `unsupported`: a page the trim cannot read or change is one it cannot
 * vouch for.
 */
function readable<T>(work: () => T): T {
  try {
    return work();
  } catch (failure) {
    if (failure instanceof EngineFailure) throw failure;
    throw new EngineFailure("unsupported");
  }
}

function isWhitespace(code: number): boolean {
  return /\s/u.test(String.fromCodePoint(code));
}

function toRect(rect: readonly number[]): Rect {
  return [rect[0], rect[1], rect[2], rect[3]];
}

function union(a: Rect, b: Rect): Rect {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

function grow([x0, y0, x1, y1]: Rect, by: number): Rect {
  return [x0 - by, y0 - by, x1 + by, y1 + by];
}

function cut(bounds: Rect, clip: Rect | null): Rect | null {
  return clip === null ? bounds : intersect(bounds, clip);
}

/** Does any part of `bounds` lie outside `visible` by more than `by` on some side? */
function reachesPast(
  [x0, y0, x1, y1]: Rect,
  [vx0, vy0, vx1, vy1]: Rect,
  by: number,
): boolean {
  return x0 < vx0 - by || y0 < vy0 - by || x1 > vx1 + by || y1 > vy1 + by;
}

/**
 * Does `bounds` lie wholly inside `visible`, exactly? The proof's promise
 * (AC-16) holds only for such a character. One that pokes past the edge by
 * any amount straddles it, and may go or stay: MuPDF removes a glyph whose
 * box touches a strip.
 */
function whollyInside([x0, y0, x1, y1]: Rect, [vx0, vy0, vx1, vy1]: Rect): boolean {
  return x0 >= vx0 && y0 >= vy0 && x1 <= vx1 && y1 <= vy1;
}

function containsPointRect(
  [x0, y0, x1, y1]: Rect,
  [x, y]: readonly [number, number],
): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/** The unit square through an image's placement, corners in quad order. */
function unitSquare(transform: Transform): Quad {
  const ul = transformPoint([0, 0], transform);
  const ur = transformPoint([1, 0], transform);
  const ll = transformPoint([0, 1], transform);
  const lr = transformPoint([1, 1], transform);
  return [ul[0], ul[1], ur[0], ur[1], ll[0], ll[1], lr[0], lr[1]];
}
