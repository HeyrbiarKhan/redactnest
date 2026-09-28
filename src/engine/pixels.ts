import type { Image, Matrix, PDFPage, Pixmap } from "mupdf";

import {
  BOUNDS_REACH_RATIO,
  containsPoint,
  imageReach,
  paddedArea,
  quadBounds,
  quadHeight,
} from "./geometry";
import type { MuPdf } from "./load";
import type { Quad, RedactionTarget } from "./types";

/**
 * Which targets would MuPDF blank an image under past reach of their padded
 * areas? Spec 0004, AC-29 and INV-15; spec 0005, AC-8 (`image-overreach`) and
 * INV-3. One answer per target, in order, `true` for one that would.
 *
 * MuPDF blanks an image's pixels whole, over each area's page bounds taken in
 * the image's own pixel grid, so an image drawn at an angle or at a coarse
 * resolution is blanked well past the padded area even under level text, over
 * ink no part of the self check looks at. So before anything is removed, the
 * page is walked once with images kept, and for each image block that meets a
 * padded area's bounds, the region MuPDF will blank may reach no more than
 * `BOUNDS_REACH_RATIO` of the target quad's height past the padded area.
 *
 * One walk answers for every target, and each answer depends on that target
 * alone, so detection can block exactly the matches validation would refuse.
 * Reads each image's size and never decodes it. Fails closed: a placement that
 * cannot be inverted counts as out of reach.
 */
export function imageReachVerdicts(
  page: PDFPage,
  targets: readonly Pick<RedactionTarget, "quads">[],
): readonly boolean[] {
  const areas = targets.map((target) =>
    target.quads.map((quad) => {
      const padded = paddedArea(quad);
      return {
        padded,
        bounds: quadBounds(padded),
        limit: BOUNDS_REACH_RATIO * quadHeight(quad),
      };
    }),
  );
  const overreaches = targets.map(() => false);
  const stext = page.toStructuredText("preserve-images");

  try {
    stext.walk({
      onImageBlock(bbox, transform, image) {
        try {
          const width = image.getWidth();
          const height = image.getHeight();
          areas.forEach((target, at) => {
            // "Within the limit" rather than "not past it", so a reach that
            // is not a number counts as out of reach.
            const within = target.every(
              ({ padded, bounds, limit }) =>
                !boundsMeet(bbox, bounds) ||
                imageReach(transform, width, height, padded) <= limit,
            );
            if (!within) overreaches[at] = true;
          });
        } finally {
          image.destroy();
        }
      },
    });
  } finally {
    stext.destroy();
  }
  return overreaches;
}

/**
 * The pixel half of the self check. Spec 0004, AC-13.
 *
 * The character check reads text only, so scan ink the padded pass missed
 * would pass it unseen while hidden under the box. So on every page holding a
 * target, each image the output's structured text reports that meets a target
 * quad is decoded, and every pixel whose centre falls inside a target quad
 * must be blank: white in every colour channel once converted to RGB, or
 * unpainted for an image mask.
 *
 * Fails closed. An image that cannot be decoded, converted or placed counts as
 * not blank, because a check that cannot look vouches for nothing.
 *
 * What it cannot see, stated in the spec: an image drawn only through a tiling
 * pattern, or used only as a soft mask, is not reported as an image block.
 */
export function imagesAreBlank(
  mupdf: MuPdf,
  page: PDFPage,
  quads: readonly Quad[],
): boolean {
  const stext = page.toStructuredText("preserve-images");
  let blank = true;

  try {
    stext.walk({
      onImageBlock(bbox, transform, image) {
        try {
          if (blank && meetsAny(bbox, quads)) {
            blank = blankUnder(mupdf, image, transform, quads);
          }
        } finally {
          // The wrapper holds its own reference to the image, so letting it
          // go now frees the decoded copy as soon as it has been looked at.
          image.destroy();
        }
      },
    });
  } finally {
    stext.destroy();
  }
  return blank;
}

function meetsAny(bbox: readonly number[], quads: readonly Quad[]): boolean {
  return quads.some((quad) => boundsMeet(bbox, quadBounds(quad)));
}

/** Do two `[x0, y0, x1, y1]` boxes touch or overlap? */
function boundsMeet(a: readonly number[], b: readonly number[]): boolean {
  return a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
}

/**
 * Is every pixel of `image` centred inside a target quad blank?
 *
 * The block's transform maps the image's unit square onto the page with pixel
 * row 0 at the top (MuPDF flips PDF's image space as it draws), so the pixel
 * in column `i` and row `j` of a `w` by `h` image has its centre at
 * `transform × ((i + 0.5) / w, (j + 0.5) / h)`.
 */
function blankUnder(
  mupdf: MuPdf,
  image: Image,
  transform: Matrix,
  quads: readonly Quad[],
): boolean {
  let decoded: Pixmap | null = null;
  let converted: Pixmap | null = null;

  try {
    decoded = image.toPixmap();
    const mask = image.getImageMask();

    // An image mask decodes to coverage alone: 0 where nothing is painted.
    // Anything else is compared in RGB, where white is 255 in every channel
    // whatever colour space the image was drawn in.
    let pixmap = decoded;
    if (!mask && (decoded.getAlpha() !== 0 || !decoded.getColorSpace()?.isRGB())) {
      converted = decoded.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false);
      pixmap = converted;
    }

    const width = pixmap.getWidth();
    const height = pixmap.getHeight();
    const stride = pixmap.getStride();
    const step = pixmap.getNumberOfComponents();
    const pixels = pixmap.getPixels();

    const isBlank = (offset: number): boolean =>
      mask
        ? pixels[offset] === 0
        : pixels[offset] === 255 &&
          pixels[offset + 1] === 255 &&
          pixels[offset + 2] === 255;

    const [a, b, c, d, e, f] = transform;
    const determinant = a * d - b * c;
    if (determinant === 0 || !Number.isFinite(determinant)) return false;

    for (const quad of quads) {
      const range = pixelRange(quad, transform, determinant, width, height);
      if (!range) continue;

      for (let row = range.rowFrom; row <= range.rowTo; row += 1) {
        const v = (row + 0.5) / height;
        for (let column = range.columnFrom; column <= range.columnTo; column += 1) {
          const u = (column + 0.5) / width;
          const centre: readonly [number, number] = [
            a * u + c * v + e,
            b * u + d * v + f,
          ];
          if (containsPoint(quad, centre) && !isBlank(row * stride + column * step)) {
            return false;
          }
        }
      }
    }
    return true;
  } catch {
    return false;
  } finally {
    converted?.destroy();
    decoded?.destroy();
  }
}

/**
 * The columns and rows whose centres could lie inside `quad`: its corners
 * mapped back into the image, widened by a pixel each way and clipped to the
 * image. Only these are tested, so a full page scan costs the target's area
 * rather than the page's.
 */
function pixelRange(
  quad: Quad,
  transform: Matrix,
  determinant: number,
  width: number,
  height: number,
): { columnFrom: number; columnTo: number; rowFrom: number; rowTo: number } | null {
  const [a, b, c, d, e, f] = transform;
  const columns: number[] = [];
  const rows: number[] = [];

  for (let corner = 0; corner < 8; corner += 2) {
    const x = quad[corner] - e;
    const y = quad[corner + 1] - f;
    columns.push(((d * x - c * y) / determinant) * width);
    rows.push(((a * y - b * x) / determinant) * height);
  }

  const columnFrom = Math.max(0, Math.floor(Math.min(...columns)) - 1);
  const columnTo = Math.min(width - 1, Math.ceil(Math.max(...columns)) + 1);
  const rowFrom = Math.max(0, Math.floor(Math.min(...rows)) - 1);
  const rowTo = Math.min(height - 1, Math.ceil(Math.max(...rows)) + 1);

  return columnFrom > columnTo || rowFrom > rowTo
    ? null
    : { columnFrom, columnTo, rowFrom, rowTo };
}
