import type {
  BlendMode,
  ColorSpace,
  ColorSpaceType,
  Image,
  Matrix,
  Path,
  PDFPage,
  Rect as MuRect,
  Shade,
  StrokeState,
  Text,
} from "mupdf";

import { POSITION_TOLERANCE } from "./characters";
import type { MuPdf } from "./load";

/**
 * The one drawing reader. Spec 0006, AC-9 and INV-10.
 *
 * Runs a prepared page through a MuPDF callback `Device`, with
 * `Matrix.identity`, so every coordinate is in the page space structured text
 * uses, and hands each thing the page draws to `visit` as plain data, in
 * drawing order. `inspect.ts` reads a page's findings from it and `trim.ts`
 * reads what lies outside the visible area, so both see a page the same way.
 *
 * Three rules hold every callback in here:
 *
 *  - **Every MuPDF object a callback receives is let go before it returns**
 *    (INV-10). MuPDF.js 1.28.1 wraps `Path`, `Text`, `StrokeState` and
 *    `ColorSpace` with a reference it keeps, and `Image`'s constructor keeps
 *    one too, so each is destroyed here. `Shade` is wrapped with no reference
 *    at all, yet still registered for collection, and a collected wrapper frees
 *    a shading MuPDF is still using (measured: the next page run crashes), so
 *    it is disowned rather than destroyed. The text walker's `Font` is a
 *    wrapper MuPDF.js keeps and reuses itself, so it is left alone. Pinned in
 *    `tests/unit/device.test.ts`, so an upgrade that changes any of this fails
 *    a test.
 *  - **Nothing escapes a callback.** A throw would unwind through MuPDF's C
 *    frames without their cleanup. Each callback catches, remembers the first
 *    failure, ignores everything after it, and `walkDrawing` throws it once
 *    `page.run` has returned.
 *  - **Only numbers leave.** A visitor never sees a MuPDF object, so it cannot
 *    hold one past its callback.
 */

export type Point = readonly [number, number];

/** `[x0, y0, x1, y1]`, in page space. */
export type Rect = readonly [number, number, number, number];

/** An affine placement, `[a, b, c, d, e, f]`, as MuPDF writes one. */
export type Transform = readonly [number, number, number, number, number, number];

/** How a text object is drawn. `ignore` is invisible text (render mode 3). */
export type TextMode = "fill" | "stroke" | "clip" | "clip-stroke" | "ignore";

/**
 * A colour as a callback reports it: the colour space's type and the
 * components in it. Only Gray, RGB and CMYK are ever judged (spec 0006,
 * *Decision*); an ICC based space reports its base type.
 */
export interface Paint {
  readonly space: ColorSpaceType;
  readonly components: readonly number[];
  readonly alpha: number;
}

/** One glyph a text object shows. */
export interface Glyph {
  /** Its origin, in page space. */
  readonly origin: Point;
  /**
   * The length of the text matrix times the transform applied to the unit
   * upright vector: how tall one em of it is on the page (spec 0006, AC-7).
   */
  readonly em: number;
  /** The code point MuPDF maps it to, U+FFFD when it maps to none. */
  readonly unicode: number;
}

/** One thing a page draws, or one change to what later drawing is under. */
export type Drawing =
  | {
      readonly kind: "text";
      readonly mode: TextMode;
      readonly glyphs: readonly Glyph[];
      /** Null for the modes that paint nothing: clip and ignore. */
      readonly paint: Paint | null;
      /** Null when MuPDF reports no finite bounds. */
      readonly bounds: Rect | null;
    }
  | {
      readonly kind: "path";
      readonly stroked: boolean;
      readonly paint: Paint;
      readonly bounds: Rect | null;
      /**
       * The path as one level rectangle in page space, when it is one: a
       * single closed subpath of four corners, or five points whose last
       * equals its first, each edge level or upright within
       * `POSITION_TOLERANCE` (spec 0006, AC-6). Null otherwise, and always
       * null for a stroke.
       */
      readonly rectangle: Rect | null;
    }
  | {
      readonly kind: "image";
      /** Maps the image's unit square onto the page, pixel row 0 at the top. */
      readonly transform: Transform;
      readonly width: number;
      readonly height: number;
      /** Drawn through `fillImageMask`: a stencil painted in `paint`. */
      readonly stencil: boolean;
      /** The image carries a mask of its own (`Image.getMask()` is not null). */
      readonly masked: boolean;
      readonly alpha: number;
      readonly paint: Paint | null;
    }
  | {
      readonly kind: "shade";
      /** Null when the shading is unbounded, as an extended axial one is. */
      readonly bounds: Rect | null;
      readonly alpha: number;
    }
  | {
      /** A clip that is not text: a path, a stroked path or an image mask. */
      readonly kind: "clip";
      readonly bounds: Rect | null;
    }
  | { readonly kind: "pop-clip" }
  | {
      readonly kind: "begin-group";
      readonly blend: BlendMode;
      readonly alpha: number;
    }
  | { readonly kind: "end-group" }
  | { readonly kind: "begin-mask" }
  | { readonly kind: "end-mask" }
  | { readonly kind: "begin-tile"; readonly area: Rect | null }
  | { readonly kind: "end-tile" };

/**
 * What a drawing is under when it is drawn. Kept here, once, so the
 * inspection and the trim agree on what a clip or a group means.
 */
export interface DrawState {
  /**
   * The bounds of the clip in force: the intersection of the bounds of every
   * open clip and soft mask that has finite bounds, leaving out MuPDF's own
   * clip to a cropped page's crop box. Null when none is left.
   */
  readonly clip: Rect | null;
  /** A soft mask is in force (spec 0006, AC-6). */
  readonly softMasked: boolean;
  /**
   * Inside a group whose alpha is below 1 or whose blend is not `Normal`. A
   * plain group, which Chrome and Word wrap ordinary content in, is not.
   */
  readonly restricted: boolean;
  /** Drawing a soft mask's own content, which nobody sees as paint. */
  readonly defining: boolean;
  /** Inside a tiling pattern's cell. */
  readonly tiled: boolean;
}

/**
 * The corners of `rect` through `m`, as bounds. Null for a rect MuPDF calls
 * infinite, or one that comes out not finite.
 */
export function transformRect(rect: MuRect | Rect, m: Transform): Rect | null {
  if (isUnbounded(rect)) return null;
  const [x0, y0, x1, y1] = rect;
  const corners = [
    transformPoint([x0, y0], m),
    transformPoint([x1, y0], m),
    transformPoint([x0, y1], m),
    transformPoint([x1, y1], m),
  ];
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  const bounds: Rect = [
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs),
    Math.max(...ys),
  ];
  return bounds.every(Number.isFinite) ? bounds : null;
}

export function transformPoint([x, y]: Point, [a, b, c, d, e, f]: Transform): Point {
  return [a * x + c * y + e, b * x + d * y + f];
}

/** The rect two bounds share, or null when they do not meet. */
export function intersect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  return x0 <= x1 && y0 <= y1 ? [x0, y0, x1, y1] : null;
}

/**
 * MuPDF's infinite rect runs from about -2^31 to 2^31. Anything that far out
 * is treated as unbounded, as MuPDF treats it.
 */
const UNBOUNDED = 1e9;

function isUnbounded(rect: MuRect | Rect): boolean {
  return (
    !rect.every(Number.isFinite) ||
    rect[0] <= -UNBOUNDED ||
    rect[1] <= -UNBOUNDED ||
    rect[2] >= UNBOUNDED ||
    rect[3] >= UNBOUNDED ||
    rect[0] > rect[2] ||
    rect[1] > rect[3]
  );
}

/** How a walk is asked to run. */
export interface WalkOptions {
  /**
   * Walk each text object's glyphs, for their origins and em heights. On by
   * default. The trim reads only where a text object reaches, from its bounds
   * and the character read, so it leaves this off and saves the walk.
   */
  readonly glyphs?: boolean;
}

/** An open clip, and whether it is a soft mask. */
interface OpenClip {
  readonly bounds: Rect | null;
  readonly mask: boolean;
  /**
   * MuPDF's own clip to the crop box, which it opens before a cropped page's
   * content. Not a clip the document draws, so never part of the clip in
   * force.
   */
  readonly page: boolean;
}

/**
 * Is this clip MuPDF's own crop, rather than one the page's content draws?
 * MuPDF.js 1.28.1 runs a page whose crop box differs from its media box inside
 * a clip to the crop box, opened before anything is drawn (measured, and
 * pinned in `tests/unit/trim.test.ts`). Counted as the clip in force, it
 * would cut every picture to the visible area, and the trim could never see
 * the margins of a cropped scan (spec 0006, AC-14 and AC-15).
 */
function isPageClip(
  bounds: Rect | null,
  visible: Rect,
  drawn: boolean,
  depth: number,
): boolean {
  if (drawn || depth !== 0 || bounds === null) return false;
  return bounds.every(
    (value, at) => Math.abs(value - visible[at]) <= PAGE_CLIP_TOLERANCE,
  );
}

/** How close, in points, a clip's bounds must come to the crop box to be MuPDF's. */
const PAGE_CLIP_TOLERANCE = 0.01;

/**
 * Run `page` through a callback device and hand every drawing to `visit`, in
 * order, with the state it is drawn under.
 *
 * Throws what a callback caught once the run has returned, and lets a throw
 * from `page.run` itself through as it is: the caller decides what either
 * means (`unsupported`, for the inspection and the trim).
 */
export function walkDrawing(
  mupdf: MuPdf,
  page: PDFPage,
  visit: (drawing: Drawing, state: DrawState) => void,
  { glyphs: walkGlyphs = true }: WalkOptions = {},
): void {
  const clips: OpenClip[] = [];
  const groups: boolean[] = [];
  let defining = 0;
  let tiles = 0;
  let failure: unknown = null;
  let hasFailed = false;

  const visible = toRect(page.getBounds());
  // Whether anything has been drawn yet, so MuPDF's own crop clip, which it
  // opens before the page's content, can be told from the content's clips.
  let drawn = false;

  const state = (): DrawState => {
    // A clip with no finite bounds says nothing a bound can, so it is left out
    // of the intersection rather than treated as clipping everything away.
    let clip: Rect | null = null;
    for (const open of clips) {
      if (open.bounds === null || open.page) continue;
      clip = clip === null ? open.bounds : (intersect(clip, open.bounds) ?? EMPTY);
    }
    return {
      clip,
      softMasked: clips.some((open) => open.mask),
      restricted: groups.some(Boolean),
      defining: defining > 0,
      tiled: tiles > 0,
    };
  };

  /** Run one callback's work, never letting a throw reach MuPDF. */
  const guard = (work: () => void, release: () => void): void => {
    try {
      if (!hasFailed) work();
    } catch (caught) {
      if (!hasFailed) {
        hasFailed = true;
        failure = caught;
      }
    } finally {
      try {
        release();
      } catch (caught) {
        if (!hasFailed) {
          hasFailed = true;
          failure = caught;
        }
      }
    }
  };

  const emit = (drawing: Drawing) => {
    if (drawing.kind !== "clip" && drawing.kind !== "pop-clip") drawn = true;
    visit(drawing, state());
  };

  const text = (
    mode: TextMode,
    shown: Text,
    ctm: Matrix,
    stroke: StrokeState | null,
    paint: Paint | null,
  ) => {
    const glyphs = walkGlyphs ? glyphsOf(shown, ctm) : [];
    const bounds = transformRectOrNull(shown.getBounds(stroke as StrokeState, ctm));
    emit({ kind: "text", mode, glyphs, paint, bounds });
    if (mode === "clip" || mode === "clip-stroke") {
      clips.push({ bounds, mask: false, page: false });
    }
  };

  const device = new mupdf.Device({
    fillPath(path, _evenOdd, ctm, colorspace, color, alpha) {
      guard(
        () =>
          emit({
            kind: "path",
            stroked: false,
            paint: paintOf(colorspace, color, alpha),
            bounds: transformRectOrNull(
              path.getBounds(null as unknown as StrokeState, ctm),
            ),
            rectangle: rectangleOf(path, ctm),
          }),
        () => free(path, colorspace),
      );
    },
    strokePath(path, stroke, ctm, colorspace, color, alpha) {
      guard(
        () =>
          emit({
            kind: "path",
            stroked: true,
            paint: paintOf(colorspace, color, alpha),
            bounds: transformRectOrNull(path.getBounds(stroke, ctm)),
            rectangle: null,
          }),
        () => free(path, stroke, colorspace),
      );
    },
    clipPath(path, _evenOdd, ctm) {
      guard(
        () => {
          const bounds = transformRectOrNull(
            path.getBounds(null as unknown as StrokeState, ctm),
          );
          const page = isPageClip(bounds, visible, drawn, clips.length);
          emit({ kind: "clip", bounds });
          clips.push({ bounds, mask: false, page });
        },
        () => free(path),
      );
    },
    clipStrokePath(path, stroke, ctm) {
      guard(
        () => {
          const bounds = transformRectOrNull(path.getBounds(stroke, ctm));
          emit({ kind: "clip", bounds });
          clips.push({ bounds, mask: false, page: false });
        },
        () => free(path, stroke),
      );
    },
    fillText(shown, ctm, colorspace, color, alpha) {
      guard(
        () => text("fill", shown, ctm, null, paintOf(colorspace, color, alpha)),
        () => free(shown, colorspace),
      );
    },
    strokeText(shown, stroke, ctm, colorspace, color, alpha) {
      guard(
        () => text("stroke", shown, ctm, stroke, paintOf(colorspace, color, alpha)),
        () => free(shown, stroke, colorspace),
      );
    },
    clipText(shown, ctm) {
      guard(
        () => text("clip", shown, ctm, null, null),
        () => free(shown),
      );
    },
    clipStrokeText(shown, stroke, ctm) {
      guard(
        () => text("clip-stroke", shown, ctm, stroke, null),
        () => free(shown, stroke),
      );
    },
    ignoreText(shown, ctm) {
      guard(
        () => text("ignore", shown, ctm, null, null),
        () => free(shown),
      );
    },
    fillShade(shade, ctm, alpha) {
      guard(
        () =>
          emit({
            kind: "shade",
            bounds: transformRectOrNull(shade.getBounds(), ctm),
            alpha,
          }),
        () => disown(shade),
      );
    },
    fillImage(image, ctm, alpha) {
      guard(
        () =>
          emit({
            kind: "image",
            transform: ctm,
            width: image.getWidth(),
            height: image.getHeight(),
            stencil: false,
            masked: hasMask(image),
            alpha,
            paint: null,
          }),
        () => free(image),
      );
    },
    fillImageMask(image, ctm, colorspace, color, alpha) {
      guard(
        () =>
          emit({
            kind: "image",
            transform: ctm,
            width: image.getWidth(),
            height: image.getHeight(),
            stencil: true,
            masked: hasMask(image),
            alpha,
            paint: paintOf(colorspace, color, alpha),
          }),
        () => free(image, colorspace),
      );
    },
    clipImageMask(image, ctm) {
      guard(
        () => {
          const bounds = transformRectOrNull(UNIT_SQUARE, ctm);
          emit({ kind: "clip", bounds });
          clips.push({ bounds, mask: false, page: false });
        },
        () => free(image),
      );
    },
    popClip() {
      guard(
        () => {
          clips.pop();
          emit({ kind: "pop-clip" });
        },
        () => {},
      );
    },
    beginMask(bbox, _luminosity, colorspace) {
      guard(
        () => {
          emit({ kind: "begin-mask" });
          defining += 1;
          // In force from its end until the matching pop, like a clip.
          clips.push({ bounds: transformRectOrNull(bbox), mask: true, page: false });
        },
        () => free(colorspace),
      );
    },
    endMask() {
      guard(
        () => {
          defining = Math.max(0, defining - 1);
          emit({ kind: "end-mask" });
        },
        () => {},
      );
    },
    beginGroup(_bbox, colorspace, _isolated, _knockout, blendmode, alpha) {
      guard(
        () => {
          emit({ kind: "begin-group", blend: blendmode, alpha });
          groups.push(!(alpha >= 1) || blendmode !== "Normal");
        },
        () => free(colorspace),
      );
    },
    endGroup() {
      guard(
        () => {
          groups.pop();
          emit({ kind: "end-group" });
        },
        () => {},
      );
    },
    beginTile(area, _view, _xstep, _ystep, ctm) {
      guard(
        () => {
          emit({ kind: "begin-tile", area: transformRectOrNull(area, ctm) });
          tiles += 1;
        },
        () => {},
      );
      // Zero asks MuPDF to run the cell's content once, here, rather than
      // skip it as a cell already drawn.
      return 0;
    },
    endTile() {
      guard(
        () => {
          tiles = Math.max(0, tiles - 1);
          emit({ kind: "end-tile" });
        },
        () => {},
      );
    },
  });

  try {
    page.run(device, mupdf.Matrix.identity);
    device.close();
  } finally {
    device.destroy();
  }
  if (hasFailed) throw failure;
}

function toRect(rect: readonly number[]): Rect {
  return [rect[0], rect[1], rect[2], rect[3]];
}

/** A rect that holds nothing, for a clip whose parts do not meet. */
const EMPTY: Rect = [0, 0, -1, -1];

const UNIT_SQUARE: Rect = [0, 0, 1, 1];

function transformRectOrNull(rect: MuRect | Rect, m?: Transform): Rect | null {
  if (m === undefined)
    return isUnbounded(rect) ? null : [rect[0], rect[1], rect[2], rect[3]];
  return transformRect(rect, m);
}

/** Every glyph in a text object, its origin and em height on the page. */
function glyphsOf(shown: Text, ctm: Matrix): readonly Glyph[] {
  const [a, b, c, d] = ctm;
  const glyphs: Glyph[] = [];
  shown.walk({
    showGlyph(_font, trm, _glyph, unicode) {
      // Plain arithmetic only, so nothing in here can throw into MuPDF.
      const upX = a * trm[2] + c * trm[3];
      const upY = b * trm[2] + d * trm[3];
      glyphs.push({
        origin: transformPoint([trm[4], trm[5]], ctm),
        em: Math.hypot(upX, upY),
        unicode,
      });
    },
  });
  return glyphs;
}

function paintOf(colorspace: ColorSpace, color: readonly number[], alpha: number): Paint {
  return { space: colorspace.getType(), components: [...color], alpha };
}

/** Does the image carry a mask of its own? The mask's wrapper is let go at once. */
function hasMask(image: Image): boolean {
  const mask = image.getMask();
  if (mask === null) return false;
  mask.destroy();
  return true;
}

/**
 * The path as one level rectangle in page space, or null. Walks the path's
 * own points, puts each through `ctm`, and accepts a single closed subpath of
 * four corners, or five points whose last equals its first, whose edges are
 * each level or upright within `POSITION_TOLERANCE`.
 */
function rectangleOf(path: Path, ctm: Matrix): Rect | null {
  const points: Point[] = [];
  let subpaths = 0;
  let closed = false;
  let curved = false;

  path.walk({
    moveTo(x, y) {
      subpaths += 1;
      points.push(transformPoint([x, y], ctm));
    },
    lineTo(x, y) {
      points.push(transformPoint([x, y], ctm));
    },
    curveTo() {
      curved = true;
    },
    closePath() {
      closed = true;
    },
  });

  if (curved || subpaths !== 1) return null;
  if (points.length === 5 && same(points[0], points[4])) points.pop();
  else if (points.length !== 4 || !closed) return null;

  for (let index = 0; index < 4; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[(index + 1) % 4];
    const level = Math.abs(y1 - y0) <= POSITION_TOLERANCE;
    const upright = Math.abs(x1 - x0) <= POSITION_TOLERANCE;
    if (!level && !upright) return null;
  }

  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const rect: Rect = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  return rect.every(Number.isFinite) ? rect : null;
}

function same(a: Point, b: Point): boolean {
  return (
    Math.abs(a[0] - b[0]) <= POSITION_TOLERANCE &&
    Math.abs(a[1] - b[1]) <= POSITION_TOLERANCE
  );
}

/** Let go of every wrapper a callback owns a reference through. */
function free(...owned: readonly { destroy(): void }[]): void {
  for (const object of owned) object.destroy();
}

/**
 * Take a wrapper MuPDF.js made without a reference out of its registry for
 * collection, so collecting it never frees what MuPDF still uses. Reaches the
 * registry through the wrapper's own class, the one MuPDF.js registered it
 * with.
 */
function disown(object: Shade): void {
  const registry = (object.constructor as { _finalizer?: FinalizationRegistry<unknown> })
    ._finalizer;
  registry?.unregister(object);
}
