import type { PDFDocument, PDFPage } from "mupdf";

import { PAGE_FINDINGS, type PageFinding } from "@/worker/protocol";

import {
  EXTRACTION_OPTIONS,
  POSITION_TOLERANCE,
  walkCharacters,
  type Character,
} from "./characters";
import {
  intersect,
  transformPoint,
  walkDrawing,
  type Paint,
  type Point,
  type Rect,
  type Transform,
} from "./device";
import { checkpoint, EngineFailure } from "./failure";
import { containsPoint, quadBounds, quadCentre } from "./geometry";
import type { MuPdf } from "./load";
import type { PageInspection, Quad } from "./types";

/**
 * Reading every page before review. Spec 0006, *Page findings*.
 *
 * Each prepared page of the review copy is read twice: once through the
 * drawing reader (`device.ts`), which reports everything the page draws in
 * drawing order, and once as ordinary mode structured text. What each read
 * sees is turned into zero or more closed findings, and a flag for whether the
 * page holds a readable character. Nothing else leaves: no text, no position,
 * no colour (INV-1). The page's characters live in here for one page and are
 * dropped (INV-8).
 *
 * The values below are engine constants, never config. They are rules about
 * pages, not caps on the visitor, and an environment variable that could
 * change one could switch a warning off (INV-7). They are the same deliberate
 * exception `BOUNDS_REACH_RATIO` and the detectors' constants take. Each
 * started as a judgement and is measured against the fixtures and the local
 * scans (spec 0006, *Constants*).
 */

/**
 * How many points a side the visible area is sampled on. Every share below
 * (a picture's size, the text over it, the bare pictures' part of the page) is
 * counted over these 64 by 64 points, never computed as an exact union: cheap,
 * deterministic, and exact enough for thresholds that are judgements.
 */
export const READING_GRID = 64;

/**
 * The share of the visible area an image's footprint must hold to count as a
 * picture. A pasted ID card on a letter is one; a small logo is not.
 */
export const PICTURE_MIN_SHARE = 0.05;

/**
 * The share of a picture that readable text lines may cover and still leave
 * it bare. An OCR scan's text layer covers far more than this.
 */
export const TEXT_OVER_PICTURE_MAX = 0.05;

/** The share of the visible area bare pictures must hold for a page to be a scan. */
export const SCAN_MIN_SHARE = 0.5;

/**
 * Fewer readable characters than this, over bare pictures, is a stamp on a
 * scan (a page number, a Bates number) rather than a page of text. A slide
 * with a title and bullets over a full bleed photo holds more (AC-2).
 */
export const STAMP_MAX_CHARS = 40;

/**
 * This many U+FFFD or private use characters in a row on one line is text in
 * a font RedactNest cannot read. A lone unmapped bullet is not (AC-3).
 */
export const UNREADABLE_RUN = 3;

/**
 * The contrast ratio, by the WCAG formula, a colour must exceed against white
 * paper to count as drawing something. Below it, a viewer sees nothing: the
 * white rectangle Word and Chrome paint on every page (AC-2).
 */
export const HIDDEN_CONTRAST_MAX = 1.1;

/** The findings that count toward "nothing readable" (AC-10). */
const NOTHING_READABLE: readonly PageFinding[] = Object.freeze([
  "scanned",
  "drawn-only",
  "blank",
]);

/**
 * Read every page of the prepared review copy. Spec 0006, AC-1.
 *
 * One page at a time, in page order. After each page it yields a macrotask
 * and asks whether to stop (AC-29), so a cancel or a replacement open is
 * noticed within one page. A page that throws while being read fails the open
 * with `unsupported` (AC-11): an inspection that cannot finish never reports
 * fewer findings (INV-2).
 */
export async function inspectPages(
  mupdf: MuPdf,
  pdf: PDFDocument,
  isCancelled?: () => boolean,
): Promise<readonly PageInspection[]> {
  const inspections: PageInspection[] = [];
  const pageCount = pdf.countPages();

  for (let index = 0; index < pageCount; index += 1) {
    inspections.push(inspectOne(mupdf, pdf, index));
    await checkpoint(isCancelled);
  }
  return inspections;
}

/**
 * Does this page count toward "nothing readable"? Spec 0006, AC-10: it is
 * `scanned`, `drawn-only` or `blank`, or holds no readable character.
 */
export function readsAsNothing(inspection: PageInspection): boolean {
  return (
    !inspection.readable ||
    inspection.findings.some((finding) => NOTHING_READABLE.includes(finding))
  );
}

/** One page, loaded, read and handed back to MuPDF whatever happens. */
function inspectOne(mupdf: MuPdf, pdf: PDFDocument, index: number): PageInspection {
  let page: PDFPage | null = null;
  try {
    page = pdf.loadPage(index);
    return inspectPage(mupdf, page);
  } catch {
    throw new EngineFailure("unsupported");
  } finally {
    page?.destroy();
  }
}

/** What the ordinary mode read says about a page's text. */
interface TextReading {
  /** Characters that are not whitespace, U+FFFD, Cc, Cs or Co (AC-3). */
  readonly readableCount: number;
  /** A line holds a run of `UNREADABLE_RUN` U+FFFD or private use characters. */
  readonly unreadableRun: boolean;
  /** The boxes of lines holding a readable character, visible or invisible. */
  readonly readableLines: readonly Rect[];
  /**
   * The extracted character at a glyph's origin, within `POSITION_TOLERANCE`,
   * or null. Its quad is the glyph's box (AC-9).
   */
  readonly characterAt: (origin: Point) => Character | null;
}

/** What the drawing reader says about a page. */
interface DrawingReading {
  /** Glyphs of any kind: filled, stroked, clipping or invisible. */
  readonly glyphs: number;
  /** Images of any size, stencils included. */
  readonly images: number;
  /** Where each image painted on the page lands, as sampled on the grid. */
  readonly footprints: readonly Footprint[];
  /** A path or shading whose colour contrasts with white paper, or cannot be judged. */
  readonly contrasting: boolean;
  /** The origins of invisible glyphs (render mode 3), in drawing order. */
  readonly invisible: readonly Point[];
}

/** An image's placement, cut to the bounds of the clip in force (AC-4). */
interface Footprint {
  readonly quad: Quad;
  readonly clip: Rect | null;
}

function inspectPage(mupdf: MuPdf, page: PDFPage): PageInspection {
  const visible = page.getBounds();
  const area: Rect = [visible[0], visible[1], visible[2], visible[3]];

  const text = readText(page);
  const drawing = readDrawing(mupdf, page);
  const grid = sampleGrid(area);

  // Which grid points readable text lines cover, visible or invisible, so an
  // OCR layer counts and an unmapped font does not.
  const underText = new Uint8Array(grid.count);
  for (const box of text.readableLines)
    grid.mark(underText, (point) => inRect(box, point), box);

  // The pictures, each with the points its footprint holds, and which of
  // those have readable text over them.
  const bare = new Uint8Array(grid.count);
  let bareShare = 0;
  let anyBare = false;
  for (const footprint of drawing.footprints) {
    const held = new Uint8Array(grid.count);
    const count = grid.mark(
      held,
      (point) => holds(footprint, point),
      footprintBounds(footprint),
    );
    if (count < PICTURE_MIN_SHARE * grid.count) continue;

    let covered = 0;
    for (let at = 0; at < grid.count; at += 1)
      if (held[at] && underText[at]) covered += 1;
    if (covered >= TEXT_OVER_PICTURE_MAX * count) continue;

    anyBare = true;
    for (let at = 0; at < grid.count; at += 1) if (held[at]) bare[at] = 1;
  }
  for (let at = 0; at < grid.count; at += 1) bareShare += bare[at];
  bareShare = grid.count === 0 ? 0 : bareShare / grid.count;

  const found = new Set<PageFinding>();

  // AC-2. A page with no readable character over pictures holding half the
  // page is a scan, and so is one with a stamp's few characters over bare
  // pictures; with no readable character every picture is bare, so the one
  // test covers both.
  const scanned = text.readableCount < STAMP_MAX_CHARS && bareShare >= SCAN_MIN_SHARE;
  if (scanned) found.add("scanned");

  const blank = drawing.glyphs === 0 && drawing.images === 0 && !drawing.contrasting;
  if (blank) found.add("blank");
  if (drawing.glyphs === 0 && !scanned && !blank) found.add("drawn-only");

  // AC-3.
  if (text.unreadableRun || (drawing.glyphs > 0 && text.readableCount === 0)) {
    found.add("unreadable-text");
  }

  // AC-4. A picture with next to no readable text over it, on a page that is
  // not already a scan: a pasted ID card, a photo, a slide's background.
  if (!scanned && anyBare) found.add("bare-picture");

  // AC-5. Invisible text whose centre lies over an image, whichever the
  // producer drew first, is a text recognition layer: Tesseract and OCRmyPDF
  // draw it over the scan, ABBYY under it. A note, never a warning.
  const machineRead = drawing.invisible.some((origin) => {
    const centre = glyphCentre(text, origin);
    return drawing.footprints.some((footprint) => holds(footprint, centre));
  });
  if (machineRead) found.add("machine-read-text");

  return {
    findings: PAGE_FINDINGS.filter((finding) => found.has(finding)),
    readable: text.readableCount > 0,
  };
}

/**
 * Is this code point a readable character? Spec 0006, AC-3: not whitespace,
 * not U+FFFD, not a control character (Cc) and not a private use one (Co). A
 * lone surrogate (Cs) is not a code point at all, and detection reads it as
 * U+FFFD, so it is not readable either.
 */
function isReadable(code: number): boolean {
  return !UNREADABLE.test(String.fromCodePoint(code));
}

const UNREADABLE = /^[\s\p{Cc}\p{Co}\p{Cs}�]$/u;

/** U+FFFD, a lone surrogate, or private use: what an unreadable font extracts as. */
function isUnmapped(code: number): boolean {
  return UNMAPPED.test(String.fromCodePoint(code));
}

const UNMAPPED = /^[\p{Co}\p{Cs}�]$/u;

/** The ordinary mode read (`EXTRACTION_OPTIONS[0]`), through the one character reader. */
function readText(page: PDFPage): TextReading {
  let readableCount = 0;
  let unreadableRun = false;
  let run = 0;
  let line = -1;
  // Each line's box, from its characters' quads, and whether it holds a
  // readable character.
  const boxes = new Map<
    number,
    { box: [number, number, number, number]; readable: boolean }
  >();
  // Held for this page only, to match glyphs to (INV-8).
  const characters: Character[] = [];

  walkCharacters(page, EXTRACTION_OPTIONS[0], (character: Character) => {
    characters.push(character);
    if (character.line !== line) {
      line = character.line;
      run = 0;
    }

    const readable = isReadable(character.code);
    if (readable) readableCount += 1;
    run = isUnmapped(character.code) ? run + 1 : 0;
    if (run >= UNREADABLE_RUN) unreadableRun = true;

    const [x0, y0, x1, y1] = quadBounds(character.quad);
    const entry = boxes.get(character.line);
    if (entry === undefined) {
      boxes.set(character.line, { box: [x0, y0, x1, y1], readable });
    } else {
      entry.box[0] = Math.min(entry.box[0], x0);
      entry.box[1] = Math.min(entry.box[1], y0);
      entry.box[2] = Math.max(entry.box[2], x1);
      entry.box[3] = Math.max(entry.box[3], y1);
      entry.readable ||= readable;
    }
  });

  const readableLines = [...boxes.values()]
    .filter(({ readable, box }) => readable && box.every(Number.isFinite))
    .map(({ box }): Rect => [box[0], box[1], box[2], box[3]]);

  return {
    readableCount,
    unreadableRun,
    readableLines,
    characterAt: indexByOrigin(characters),
  };
}

/**
 * Find a character by its origin. Spec 0006, AC-9: a glyph from the drawing
 * reader and a character from extraction are the same when their page space
 * origins lie within `POSITION_TOLERANCE` on each axis, because both come
 * from MuPDF multiplying the same text matrix by the same transform. Indexed
 * one `POSITION_TOLERANCE` square per cell, so a lookup probes nine cells, as
 * the self check's own matching does.
 */
function indexByOrigin(
  characters: readonly Character[],
): (origin: Point) => Character | null {
  const cell = (value: number) => Math.floor(value / POSITION_TOLERANCE);
  const cells = new Map<string, Character[]>();
  for (const character of characters) {
    const key = `${cell(character.origin[0])},${cell(character.origin[1])}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(character);
    else cells.set(key, [character]);
  }

  return ([x, y]) => {
    const [cx, cy] = [cell(x), cell(y)];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (const character of cells.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (
            Math.abs(character.origin[0] - x) <= POSITION_TOLERANCE &&
            Math.abs(character.origin[1] - y) <= POSITION_TOLERANCE
          ) {
            return character;
          }
        }
      }
    }
    return null;
  };
}

/**
 * Where a glyph sits: the centre of its matched character's quad, which is
 * its box (AC-9), or its origin when no character matches. The origin is the
 * cautious fallback for AC-5: an OCR layer with no extracted character there
 * is still judged by where it was drawn.
 */
function glyphCentre(text: TextReading, origin: Point): Point {
  const character = text.characterAt(origin);
  return character === null ? origin : quadCentre(character.quad);
}

/** One pass through the drawing reader, kept to what the rules ask. */
function readDrawing(mupdf: MuPdf, page: PDFPage): DrawingReading {
  let glyphs = 0;
  let images = 0;
  let contrasting = false;
  const footprints: Footprint[] = [];
  const invisible: Point[] = [];

  walkDrawing(mupdf, page, (drawing, state) => {
    switch (drawing.kind) {
      case "text":
        glyphs += drawing.glyphs.length;
        if (drawing.mode === "ignore") {
          for (const glyph of drawing.glyphs) invisible.push(glyph.origin);
        }
        break;
      case "image":
        images += 1;
        // A soft mask's own content is never seen as paint, so it is no
        // picture, though the page still draws it.
        if (!state.defining) {
          footprints.push({ quad: unitSquare(drawing.transform), clip: state.clip });
        }
        break;
      case "path":
        if (!(contrastWithWhite(drawing.paint) <= HIDDEN_CONTRAST_MAX))
          contrasting = true;
        break;
      case "shade":
        // A shading's colour is never judged, so it always counts as drawn.
        contrasting = true;
        break;
      default:
        break;
    }
  });

  return { glyphs, images, footprints, contrasting, invisible };
}

/**
 * The unit square through an image's placement, as a quad whose corners are
 * in the order `containsPoint` walks: upper left, upper right, lower left,
 * lower right in the image's own orientation.
 */
function unitSquare(transform: Transform): Quad {
  const ul = transformPoint([0, 0], transform);
  const ur = transformPoint([1, 0], transform);
  const ll = transformPoint([0, 1], transform);
  const lr = transformPoint([1, 1], transform);
  return [ul[0], ul[1], ur[0], ur[1], ll[0], ll[1], lr[0], lr[1]];
}

function footprintBounds({ quad, clip }: Footprint): Rect | null {
  const bounds = quadBounds(quad);
  if (!bounds.every(Number.isFinite)) return null;
  return clip === null ? bounds : intersect(bounds, clip);
}

/** Does a footprint hold a point? Inside the placement and inside the clip. */
function holds({ quad, clip }: Footprint, point: Point): boolean {
  if (clip !== null && !inRect(clip, point)) return false;
  return !isDegenerate(quad) && containsPoint(quad, point);
}

/** A placement that covers no area, which `containsPoint` cannot judge. */
function isDegenerate(quad: Quad): boolean {
  const [ulx, uly, urx, ury, llx, lly] = quad;
  const area = (urx - ulx) * (lly - uly) - (ury - uly) * (llx - ulx);
  return !(Math.abs(area) > 1e-9);
}

function inRect([x0, y0, x1, y1]: Rect, [x, y]: Point): boolean {
  return x >= x0 && x <= x1 && y >= y0 && y <= y1;
}

/**
 * The `READING_GRID` by `READING_GRID` points over the visible area, one at
 * the centre of each cell. `mark` sets every point a test holds, looking only
 * at the points inside `bounds`, and returns how many it set.
 */
function sampleGrid([x0, y0, x1, y1]: Rect): {
  readonly count: number;
  mark(into: Uint8Array, test: (point: Point) => boolean, bounds: Rect | null): number;
} {
  const size = READING_GRID;
  const width = x1 - x0;
  const height = y1 - y0;
  const usable =
    width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height);
  const count = usable ? size * size : 0;

  const column = (x: number) => x0 + ((x + 0.5) * width) / size;
  const row = (y: number) => y0 + ((y + 0.5) * height) / size;
  // The cells whose centres could lie between two coordinates.
  const span = (from: number, to: number, origin: number, extent: number) => [
    Math.max(0, Math.floor(((from - origin) / extent) * size - 0.5)),
    Math.min(size - 1, Math.ceil(((to - origin) / extent) * size - 0.5)),
  ];

  return {
    count,
    mark(into, test, bounds) {
      if (!usable || bounds === null) return 0;
      const [fromColumn, toColumn] = span(bounds[0], bounds[2], x0, width);
      const [fromRow, toRow] = span(bounds[1], bounds[3], y0, height);
      let marked = 0;
      for (let y = fromRow; y <= toRow; y += 1) {
        for (let x = fromColumn; x <= toColumn; x += 1) {
          if (test([column(x), row(y)])) {
            const at = y * size + x;
            if (!into[at]) marked += 1;
            into[at] = 1;
          }
        }
      }
      return marked;
    },
  };
}

/**
 * The contrast ratio of a paint against white paper, by the WCAG formula, or
 * `NaN` when its colour space is not one that is judged. Only Gray, RGB and
 * CMYK are (spec 0006, *Decision*), converted to sRGB by fixed formulas; an
 * ICC based space reports its base type. `NaN` fails every "within" test, so a
 * colour that cannot be judged counts as contrasting.
 */
export function contrastWithWhite(paint: Paint): number {
  const luminance = relativeLuminance(paint);
  return (1 + 0.05) / (luminance + 0.05);
}

/** WCAG 2 relative luminance of a paint, or `NaN` when it cannot be judged. */
export function relativeLuminance({ space, components }: Paint): number {
  const rgb = toRgb(space, components);
  if (rgb === null) return Number.NaN;
  const [r, g, b] = rgb.map((channel) => {
    const c = Math.min(1, Math.max(0, channel));
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function toRgb(
  space: Paint["space"],
  components: readonly number[],
): readonly [number, number, number] | null {
  if (!components.every(Number.isFinite)) return null;
  switch (space) {
    case "Gray":
      return components.length === 1
        ? [components[0], components[0], components[0]]
        : null;
    case "RGB":
      return components.length === 3
        ? [components[0], components[1], components[2]]
        : null;
    case "CMYK": {
      if (components.length !== 4) return null;
      const [c, m, y, k] = components;
      return [(1 - c) * (1 - k), (1 - m) * (1 - k), (1 - y) * (1 - k)];
    }
    default:
      return null;
  }
}
