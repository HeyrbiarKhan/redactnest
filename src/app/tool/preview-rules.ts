/**
 * The page preview's layout and scheduling rules (spec 0026 child 0002,
 * AC-44 and AC-45). Each is a rule about the preview, not a cap on the
 * visitor, so it lives here beside the preview, as the detectors' and the
 * page reading's constants live beside their code. The one cap, the most
 * device pixels a page picture may hold, is `config.previewMaxPixels`.
 */

/**
 * The zoom steps, in percent, where 100 is the page's width fitting the page
 * area (AC-44). The preview starts at 100.
 */
export const ZOOM_STEPS: readonly number[] = Object.freeze([50, 75, 100, 125, 150, 200]);

/** Where the zoom starts: 100%. */
export const ZOOM_START = ZOOM_STEPS.indexOf(100);

/**
 * How long after the last zoom press, resize or change of pixel density the
 * preview waits before asking for a fresh picture (AC-44). Until then the
 * current picture is stretched with CSS, which is instant.
 */
export const ZOOM_SETTLE_MS = 150;

/**
 * A thumbnail's box in the rail, in CSS pixels (AC-45): the page is kept
 * whole inside it.
 */
export const THUMB_BOX = Object.freeze({ width: 84, height: 112 });

/**
 * At most one page draw and two thumbnail draws in flight (AC-45), so the
 * worker is never handed a queue the visitor has already moved past.
 */
export const PAGE_DRAWS_IN_FLIGHT = 1;
export const THUMB_DRAWS_IN_FLIGHT = 2;

/**
 * The longest side a canvas may have, the engine's `CANVAS_SIDE_MAX`: the
 * worker answers a wider ask with no picture, so the page's ask is held to
 * it here. The engine cannot be imported on this side of its wall, so
 * `tests/unit/preview-rules.test.ts` holds the two equal.
 */
export const PREVIEW_SIDE_MAX = 16_384;

/** US Letter's height over its width, the page's shape until one is known. */
export const LETTER_SHAPE = 11 / 8.5;

/**
 * The device pixels to ask across the page: the page area's content width
 * times the zoom step times the pixel density, rounded, and never wider
 * than a canvas may be. `null` until the area has a width.
 */
export function pageAskWidth(
  areaWidth: number | null,
  zoomPercent: number,
  pixelRatio: number,
): number | null {
  if (areaWidth === null || !(areaWidth > 0)) return null;
  const width = Math.round(((areaWidth * zoomPercent) / 100) * pixelRatio);
  return width < 1 ? null : Math.min(width, PREVIEW_SIDE_MAX);
}

/**
 * A thumbnail's ask (AC-45): 84 CSS pixels across at the pixel density, and
 * at most the box's area at that density, or the config cap if smaller.
 */
export function thumbAsk(
  pixelRatio: number,
  maxPixels: number,
): { readonly width: number; readonly maxPixels: number } {
  const width = Math.max(1, Math.round(THUMB_BOX.width * pixelRatio));
  const box = Math.round(THUMB_BOX.width * THUMB_BOX.height * pixelRatio * pixelRatio);
  return { width, maxPixels: Math.max(1, Math.min(maxPixels, box)) };
}

/**
 * A thumbnail's CSS size inside its box, kept whole: as wide as the box and
 * no taller, or as tall and no wider, by the page's shape (height over width).
 */
export function thumbSize(shape: number): {
  readonly width: number;
  readonly height: number;
} {
  const boxShape = THUMB_BOX.height / THUMB_BOX.width;
  return shape > boxShape
    ? { width: THUMB_BOX.height / shape, height: THUMB_BOX.height }
    : { width: THUMB_BOX.width, height: THUMB_BOX.width * shape };
}
