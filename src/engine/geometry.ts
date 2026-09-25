import type { Quad } from "./types";

/**
 * Target geometry. Spec 0004, *Target geometry*.
 *
 * Every area a run acts on is derived here from a target quad, along the quad's
 * own axes, so text on a rotated page or drawn at an angle is treated exactly
 * like level text. A quad from `page.search()` runs from the font's ascent to
 * its descent as MuPDF measures them, which is 1.0 to 1.37 em tall depending on
 * the font. That is taller than the line pitch at single spacing, so the raw
 * quad is never used to remove text (INV-11).
 *
 * The values below are named engine constants, deliberately not config values.
 * They are rules about geometry, not caps on the visitor, and an environment
 * variable would let a typo widen what a run removes. With `PDF_HEADER_WINDOW`
 * and the self check's constants in `characters.ts`, they are the deliberate
 * exceptions to "every size limit comes from `src/config`". A fixture fails if
 * one is changed carelessly.
 */

/**
 * The height of the removal band, as a share of the quad's height, centred on
 * its middle. MuPDF removes a glyph whose full height box meets the area, so a
 * thin band through the middle takes every glyph of the match and none on the
 * lines above and below, even at single spacing (AC-4).
 */
export const REMOVAL_BAND_RATIO = 0.1;

/**
 * How far each end of the band is pulled in, as a share of the quad's height,
 * never more than a quarter of its width. Keeps a neighbour kerned up to 150
 * thousandths of an em into the match, in a 1.0 em font and a 1.37 em one,
 * while still removing a lone `.` or `i` (measured, AC-4 and AC-5).
 */
export const REMOVAL_INSET_RATIO = 0.1;

/**
 * Where the black box is drawn: from this share of the quad's height, measured
 * from its top edge, down to `LINE_BOX_BOTTOM`. About the em box at
 * Helvetica's metrics, so the box covers the match's own line and not the
 * lines around it (AC-6).
 */
export const LINE_BOX_TOP = 0.2;
export const LINE_BOX_BOTTOM = 0.93;

/**
 * How far the padded area grows across the line, above and below, as a share
 * of the quad's height. Pixels are blanked and covered line art removed over
 * the padded area, so scan ink the OCR text layer's quad misses is covered too
 * (AC-5). Grown from the full quad rather than the line box, because an OCR
 * layer's quad can sit wholly above its baseline.
 */
export const TARGET_PADDING_RATIO = 0.25;

/**
 * How far the padded area grows along the line, before and after, as a share of
 * the quad's height. Small, so a bullet, an icon or a table's cell divider
 * beside the match stays.
 */
export const TARGET_PADDING_ALONG_RATIO = 0.1;

/**
 * The shortest side a target quad may have, in points (AC-27). A quad with a
 * side shorter than this is a point or a hairline, not the outline of a match.
 */
export const MIN_QUAD_SIDE = 0.5;

type Point = readonly [number, number];

/** The four corners in text orientation: along the line from `ul` to `ur`. */
function corners(quad: Quad): { ul: Point; ur: Point; ll: Point; lr: Point } {
  return {
    ul: [quad[0], quad[1]],
    ur: [quad[2], quad[3]],
    ll: [quad[4], quad[5]],
    lr: [quad[6], quad[7]],
  };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1]);
}

/** Across the line: the mean of the two sides that run from top to bottom. */
export function quadHeight(quad: Quad): number {
  const { ul, ur, ll, lr } = corners(quad);
  return (distance(ul, ll) + distance(ur, lr)) / 2;
}

/** Along the line: the mean of the top edge and the bottom edge. */
export function quadWidth(quad: Quad): number {
  const { ul, ur, ll, lr } = corners(quad);
  return (distance(ul, ur) + distance(ll, lr)) / 2;
}

/**
 * The direction the line runs, in radians, from `ul` to `ur`. Used to tell a
 * glyph on the target's own line from one that only crosses it (AC-13).
 */
export function quadAngle(quad: Quad): number {
  const { ul, ur } = corners(quad);
  return Math.atan2(ur[1] - ul[1], ur[0] - ul[0]);
}

/**
 * The point at `along` (0 at the start of the line, 1 at its end) and `across`
 * (0 on the top edge, 1 on the bottom edge), by bilinear interpolation between
 * the four corners. Values outside 0 to 1 extrapolate, which is how the padded
 * area grows past the quad.
 */
function pointAt(quad: Quad, along: number, across: number): Point {
  const { ul, ur, ll, lr } = corners(quad);
  const top: Point = [ul[0] + (ur[0] - ul[0]) * along, ul[1] + (ur[1] - ul[1]) * along];
  const bottom: Point = [
    ll[0] + (lr[0] - ll[0]) * along,
    ll[1] + (lr[1] - ll[1]) * along,
  ];
  return [top[0] + (bottom[0] - top[0]) * across, top[1] + (bottom[1] - top[1]) * across];
}

/** The part of the quad between two positions along it and two across it. */
function region(
  quad: Quad,
  alongFrom: number,
  alongTo: number,
  acrossFrom: number,
  acrossTo: number,
): Quad {
  const ul = pointAt(quad, alongFrom, acrossFrom);
  const ur = pointAt(quad, alongTo, acrossFrom);
  const ll = pointAt(quad, alongFrom, acrossTo);
  const lr = pointAt(quad, alongTo, acrossTo);
  return [ul[0], ul[1], ur[0], ur[1], ll[0], ll[1], lr[0], lr[1]];
}

/**
 * Where text is removed: from 0.45 to 0.55 of the height, each end pulled in by
 * `min(REMOVAL_INSET_RATIO × h, 0.25 × w)`. The only area a pass that removes
 * text ever uses (INV-11).
 */
export function removalBand(quad: Quad): Quad {
  const width = quadWidth(quad);
  const inset = Math.min(REMOVAL_INSET_RATIO * quadHeight(quad), 0.25 * width) / width;
  const half = REMOVAL_BAND_RATIO / 2;
  return region(quad, inset, 1 - inset, 0.5 - half, 0.5 + half);
}

/** Where the black box is drawn, and where no character may be left (INV-10). */
export function lineBox(quad: Quad): Quad {
  return region(quad, 0, 1, LINE_BOX_TOP, LINE_BOX_BOTTOM);
}

/** Where pixels are blanked and covered line art is removed. */
export function paddedArea(quad: Quad): Quad {
  const along = (TARGET_PADDING_ALONG_RATIO * quadHeight(quad)) / quadWidth(quad);
  return region(quad, -along, 1 + along, -TARGET_PADDING_RATIO, 1 + TARGET_PADDING_RATIO);
}

/**
 * The z component of `(b - a) × (p - a)`: which side of the edge from `a` to
 * `b` the point `p` lies on, or 0 when it lies on the edge's line.
 */
function turn(a: Point, b: Point, p: Point): number {
  return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
}

/** The corners in the order that walks the outline: `ul`, `ur`, `lr`, `ll`. */
function outline(quad: Quad): readonly Point[] {
  const { ul, ur, ll, lr } = corners(quad);
  return [ul, ur, lr, ll];
}

/**
 * Can this quad be trusted as the outline of a match? Spec 0004, AC-27.
 *
 * Finite, every side at least `MIN_QUAD_SIDE` long, and not crossing itself.
 * The last is checked as "every corner turns the same way", which also refuses
 * a quad folded in on itself: the point test below assumes a convex quad, as
 * every quad `page.search()` gives is.
 */
export function isSoundQuad(quad: Quad): boolean {
  if (quad.length !== 8 || !quad.every(Number.isFinite)) return false;

  const points = outline(quad);
  const turns = points.map((point, index) => {
    const next = points[(index + 1) % 4];
    const after = points[(index + 2) % 4];
    if (distance(point, next) < MIN_QUAD_SIDE) return Number.NaN;
    return turn(point, next, after);
  });

  return turns.every((value) => value > 0) || turns.every((value) => value < 0);
}

/**
 * Is `point` inside the quad? A point on an edge counts as inside (AC-13).
 *
 * The convex point test: the point lies on the same side of all four edges, or
 * on one of them. Only ever asked of quads `isSoundQuad` accepted, or quads
 * derived from them, which are convex too.
 */
export function containsPoint(quad: Quad, point: Point): boolean {
  const points = outline(quad);
  let sign = 0;

  for (let index = 0; index < 4; index += 1) {
    const side = turn(points[index], points[(index + 1) % 4], point);
    if (side === 0) continue;
    if (sign === 0) sign = Math.sign(side);
    else if (Math.sign(side) !== sign) return false;
  }
  return true;
}

/** The mean of the four corners. What decides where a character sits. */
export function quadCentre(quad: Quad): Point {
  return [
    (quad[0] + quad[2] + quad[4] + quad[6]) / 4,
    (quad[1] + quad[3] + quad[5] + quad[7]) / 4,
  ];
}

/** The quad's axis aligned bounds, as `[x0, y0, x1, y1]`. */
export function quadBounds(quad: Quad): readonly [number, number, number, number] {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
