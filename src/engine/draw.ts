import type { PDFDocument, PDFPage, Pixmap } from "mupdf";

import { EngineFailure } from "./failure";
import type { PageFrame } from "./geometry";
import type { MuPdf } from "./load";

/**
 * Drawing a page of the review copy as a picture. Spec 0026 child 0002,
 * AC-49: the page preview's renderer, and the base feature 14 builds on.
 *
 * It reads the review copy only (spec 0004, INV-1), which is prepared and
 * trimmed, so the picture shows exactly the page detection read, and it edits
 * nothing. Only the worker calls it, through `OpenDocument.drawPage`.
 */

/**
 * The longest side a canvas may have in the browsers RedactNest supports.
 * A rule about canvases, not a cap on the visitor, so it lives here under
 * the engine's exception rather than in `src/config`, where an environment
 * variable could ask for a picture no browser can show (spec 0026 child
 * 0002, AC-49).
 */
export const CANVAS_SIDE_MAX = 16_384;

/**
 * How far the drawn picture's side can pass the scaled frame's: MuPDF rounds
 * the scaled page out to whole pixels on both edges. The scale is chosen
 * with this room, so the rounding can never take a picture past either cap.
 */
const ROUNDING_ROOM = 2;

export interface DrawOptions {
  /** Device pixels wanted across the page's frame. */
  readonly width: number;
  /** The most device pixels the picture may hold. */
  readonly maxPixels: number;
}

/**
 * One drawn page. `pixels` is straight RGBA (alpha 255 everywhere), in a fresh
 * buffer outside MuPDF's heap, `width` times `height` times 4 long. `frame` is
 * the page's bounds in the page space the target quads are in.
 */
export interface DrawnPage {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray<ArrayBuffer>;
  readonly frame: PageFrame;
}

/**
 * The scale that puts `width` device pixels across a frame `frameWidth` by
 * `frameHeight` points, reduced until the picture, with MuPDF's rounding,
 * holds at most `maxPixels` and neither side passes `CANVAS_SIDE_MAX`. Pure,
 * so the caps are tested without drawing. Not finite or not above 0 means
 * there is no picture to draw.
 */
export function drawScale(
  frameWidth: number,
  frameHeight: number,
  { width, maxPixels }: DrawOptions,
): number {
  const wanted = width / frameWidth;
  // The largest s with (s * w + room) * (s * h + room) <= maxPixels.
  const a = frameWidth * frameHeight;
  const b = ROUNDING_ROOM * (frameWidth + frameHeight);
  const c = ROUNDING_ROOM * ROUNDING_ROOM - maxPixels;
  const byArea = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  const bySide = Math.min(
    (CANVAS_SIDE_MAX - ROUNDING_ROOM) / frameWidth,
    (CANVAS_SIDE_MAX - ROUNDING_ROOM) / frameHeight,
  );
  return Math.min(wanted, byArea, bySide);
}

/**
 * Draw page `pageIndex` (zero based) of `pdf` with `mupdf`, the loaded module.
 * The seam a test calls with the real engine, as the other `With` steps are.
 *
 * Opaque RGB on white with annotations drawn (`toPixmap`'s last two
 * arguments), expanded into RGBA in one pass outside MuPDF's heap, so the
 * caller can wrap it in `ImageData` once MuPDF's memory has moved on. The
 * pixmap and the page are destroyed on every path out, and MuPDF's store is
 * emptied after every draw, so the pictures a page decoded never pile up in a
 * heap that never shrinks. `emptyStore` is called here and nowhere else.
 *
 * Any throw, a page with no area or a scale with no picture is an
 * `EngineFailure("unsupported")`: the worker answers it with no picture.
 */
export function drawPageWith(
  mupdf: MuPdf,
  pdf: PDFDocument,
  pageIndex: number,
  options: DrawOptions,
): DrawnPage {
  let page: PDFPage | null = null;
  let pixmap: Pixmap | null = null;
  try {
    page = pdf.loadPage(pageIndex);
    const bounds = page.getBounds();
    const frame: PageFrame = Object.freeze([bounds[0], bounds[1], bounds[2], bounds[3]]);
    const frameWidth = frame[2] - frame[0];
    const frameHeight = frame[3] - frame[1];
    if (!(frameWidth > 0 && frameHeight > 0)) throw new EngineFailure("unsupported");

    const scale = drawScale(frameWidth, frameHeight, options);
    if (!(Number.isFinite(scale) && scale > 0)) throw new EngineFailure("unsupported");

    pixmap = page.toPixmap(
      mupdf.Matrix.scale(scale, scale),
      mupdf.ColorSpace.DeviceRGB,
      false,
      true,
    );
    return Object.freeze({ ...expand(pixmap), frame });
  } catch {
    throw new EngineFailure("unsupported");
  } finally {
    pixmap?.destroy();
    page?.destroy();
    mupdf.emptyStore();
  }
}

/**
 * The pixmap's RGB samples as straight RGBA in a fresh buffer. `getPixels`
 * is a view into MuPDF's heap, so it is read here, before the pixmap goes,
 * and never kept.
 */
function expand(pixmap: Pixmap): {
  width: number;
  height: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
} {
  const width = pixmap.getWidth();
  const height = pixmap.getHeight();
  const stride = pixmap.getStride();
  const components = pixmap.getNumberOfComponents();
  if (components !== 3 || width < 1 || height < 1) throw new EngineFailure("unsupported");

  const samples = pixmap.getPixels();
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    let from = y * stride;
    let to = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      pixels[to] = samples[from];
      pixels[to + 1] = samples[from + 1];
      pixels[to + 2] = samples[from + 2];
      pixels[to + 3] = 255;
      from += 3;
      to += 4;
    }
  }
  return { width, height, pixels };
}
