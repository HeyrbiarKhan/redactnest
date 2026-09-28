import type { PDFDocument, PDFPage } from "mupdf";

import { PAGE_FINDINGS, type PageFinding } from "@/worker/protocol";

import {
  EXTRACTION_OPTIONS,
  originIndex,
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
import {
  clipToConvex,
  containsPoint,
  outline,
  polygonArea,
  quadBounds,
  quadCentre,
} from "./geometry";
import type { MuPdf } from "./load";
import type { ConcealedGlyph, PageInspection, Quad } from "./types";

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
 * The contrast ratio, by the WCAG formula, a colour must exceed to be seen
 * against what it is drawn on. Below it, a viewer sees nothing: the white
 * rectangle Word and Chrome paint on every page is not drawing (AC-2), and
 * text that close to the colour under it is hidden (AC-7).
 */
export const HIDDEN_CONTRAST_MAX = 1.1;

/**
 * The share of a glyph's box an opaque cover drawn after it must hold for the
 * glyph to count as covered (AC-6). A black box over a word holds all of it; a
 * strikethrough bar or an underline holds far less.
 */
export const COVER_MIN_OVERLAP = 0.8;

/**
 * Text whose em is shorter than this on the page, in points, cannot be read
 * by anybody (AC-7): the height of the text matrix times the transform
 * applied to the unit upright vector.
 */
export const TINY_TEXT_MAX = 1;

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
  /** Every fill and stroke of a glyph, in drawing order (AC-7). */
  readonly paints: readonly GlyphPaint[];
  /** Every opaque cover, in drawing order (AC-6). */
  readonly covers: readonly Cover[];
  /** Everything text can be drawn on, in drawing order (AC-7). */
  readonly backdrops: readonly Backdrop[];
  /** Glyphs used only as a clip that nothing was painted inside (AC-7). */
  readonly clipOnly: readonly Point[];
}

/** One fill or one stroke of a glyph, as the hidden rules read it (AC-7). */
interface GlyphPaint {
  /** Its place in drawing order. */
  readonly order: number;
  readonly origin: Point;
  readonly em: number;
  readonly paint: Paint;
  /** The bounds of the clip in force as it was drawn. */
  readonly clip: Rect | null;
  /**
   * What it is drawn in is what shows: not under a soft mask, not in a group
   * that is translucent or blends, not in a tile, not a mask's own content.
   */
  readonly plain: boolean;
}

/**
 * Something opaque drawn over the page (AC-6): a filled path that is one
 * level rectangle, or an image with no mask of its own, as a convex outline
 * already cut to the bounds of the clip in force.
 */
interface Cover {
  readonly order: number;
  readonly outline: readonly Point[];
  readonly bounds: Rect;
}

/**
 * Something drawn that text can sit on, as the colour rule reads it (AC-7).
 * Only an opaque level rectangle in a colour that is judged carries a colour;
 * an image, a shading, a tile, a translucent or restricted fill, a curve or a
 * rectangle in another colour space is drawn there and cannot be judged.
 */
interface Backdrop {
  readonly order: number;
  /** Null when it has no finite bounds, as an extended shading does. */
  readonly bounds: Rect | null;
  readonly under: (point: Point) => boolean;
  readonly colour: Paint | null;
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
  const overImage = (origin: Point) => {
    const centre = glyphCentre(text, origin);
    return drawing.footprints.some((footprint) => holds(footprint, centre));
  };
  if (drawing.invisible.some(overImage)) found.add("machine-read-text");

  // AC-6 and AC-7: text a viewer never shows.
  const concealed = concealedGlyphs(text, drawing, area, overImage);
  if (concealed.some(({ kind }) => kind === "covered")) found.add("covered-text");
  if (concealed.some(({ kind }) => kind === "hidden")) found.add("hidden-text");

  return {
    findings: PAGE_FINDINGS.filter((finding) => found.has(finding)),
    readable: text.readableCount > 0,
    concealed,
  };
}

/** A glyph as the drawing reader drew it: every fill and stroke at one origin. */
interface DrawnGlyph {
  readonly origin: Point;
  readonly em: number;
  readonly paints: GlyphPaint[];
}

/**
 * Which glyphs a viewer never sees, and why. Spec 0006, AC-6, AC-7 and AC-9.
 *
 * Only a glyph that meets an extracted character is judged, with that
 * character's quad as its box, and only when the box's centre lies inside the
 * visible area: a glyph outside it is the trim's business, not a warning. A
 * machine read glyph is never judged (AC-5).
 *
 * Covered comes first (AC-6): a filled or stroked glyph with at least
 * `COVER_MIN_OVERLAP` of its box under one opaque cover drawn after its last
 * paint. Otherwise it is hidden (AC-7) when no paint of it shows; an
 * invisible glyph with no image under or over it is hidden; and a glyph used
 * only as a clip is hidden when nothing was painted inside that clip.
 */
function concealedGlyphs(
  text: TextReading,
  drawing: DrawingReading,
  area: Rect,
  overImage: (origin: Point) => boolean,
): readonly ConcealedGlyph[] {
  const concealed: ConcealedGlyph[] = [];
  const glyphs = byOrigin(drawing.paints);

  /** The glyph's box and its centre, when it is judged at all. */
  const judged = (origin: Point): { box: readonly Point[]; centre: Point } | null => {
    const character = text.characterAt(origin);
    if (character === null) return null;
    const centre = quadCentre(character.quad);
    return inRect(area, centre) ? { box: outline(character.quad), centre } : null;
  };

  for (const glyph of glyphs.all) {
    const seen = judged(glyph.origin);
    if (seen === null) continue;

    const last = Math.max(...glyph.paints.map(({ order }) => order));
    if (isCovered(seen.box, last, drawing.covers)) {
      concealed.push({ origin: glyph.origin, kind: "covered" });
    } else if (
      glyph.paints.every((paint) => !shows(paint, glyph.em, seen.centre, drawing))
    ) {
      concealed.push({ origin: glyph.origin, kind: "hidden" });
    }
  }

  // Invisible text with no image under or over it (AC-7), never machine read.
  for (const origin of drawing.invisible) {
    if (overImage(origin) || judged(origin) === null) continue;
    concealed.push({ origin, kind: "hidden" });
  }

  // Text used only as a clip, with nothing painted inside it (AC-7). A glyph
  // that is also filled or stroked is judged by its paints above.
  for (const origin of drawing.clipOnly) {
    if (glyphs.at(origin) !== null || judged(origin) === null) continue;
    concealed.push({ origin, kind: "hidden" });
  }

  return concealed;
}

/** Group paints by origin, within `POSITION_TOLERANCE`, into glyphs. */
function byOrigin(paints: readonly GlyphPaint[]): {
  readonly all: readonly DrawnGlyph[];
  at(origin: Point): DrawnGlyph | null;
} {
  const all: DrawnGlyph[] = [];
  const index = originIndex<DrawnGlyph>();
  for (const paint of paints) {
    const glyph = index.find(paint.origin);
    if (glyph !== null) {
      glyph.paints.push(paint);
    } else {
      const drawn: DrawnGlyph = { origin: paint.origin, em: paint.em, paints: [paint] };
      all.push(drawn);
      index.add(paint.origin, drawn);
    }
  }
  return { all, at: (origin) => index.find(origin) };
}

/**
 * Does one opaque cover drawn after `last` hold at least
 * `COVER_MIN_OVERLAP` of the box? The overlap is the exact area of the box
 * clipped to the cover's outline, which is already cut to its clip.
 */
function isCovered(
  box: readonly Point[],
  last: number,
  covers: readonly Cover[],
): boolean {
  const boxArea = polygonArea(box);
  if (!(boxArea > 0)) return false;
  const [x0, y0, x1, y1] = boundsOf(box);

  return covers.some(
    (cover) =>
      cover.order > last &&
      cover.bounds[0] <= x1 &&
      x0 <= cover.bounds[2] &&
      cover.bounds[1] <= y1 &&
      y0 <= cover.bounds[3] &&
      polygonArea(clipToConvex(box, cover.outline)) >= COVER_MIN_OVERLAP * boxArea,
  );
}

function boundsOf(points: readonly Point[]): Rect {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/**
 * Does this paint of a glyph show? Spec 0006, AC-7. Not at zero opacity, not
 * with its centre outside the bounds of the clip in force, not under
 * `TINY_TEXT_MAX` of em height, and not so close in colour to what is under
 * it that the contrast is below `HIDDEN_CONTRAST_MAX`.
 */
function shows(
  paint: GlyphPaint,
  em: number,
  centre: Point,
  drawing: DrawingReading,
): boolean {
  if (!(paint.paint.alpha > 0)) return false;
  if (paint.clip !== null && !inRect(paint.clip, centre)) return false;
  if (!(em >= TINY_TEXT_MAX)) return false;
  return !blendsIn(paint, centre, drawing.backdrops);
}

/**
 * Is this paint within `HIDDEN_CONTRAST_MAX` of what is directly under its
 * centre? Judged only for a plain paint in Gray, RGB or CMYK. What is under it
 * is the last thing drawn before it under its centre: an opaque level
 * rectangle whose own colour is judged gives its colour; anything else drawn
 * there cannot be judged; and nothing at all is white paper.
 */
function blendsIn(
  paint: GlyphPaint,
  centre: Point,
  backdrops: readonly Backdrop[],
): boolean {
  if (!paint.plain) return false;
  const luminance = relativeLuminance(paint.paint);
  if (!Number.isFinite(luminance)) return false;

  let under = WHITE_PAPER;
  for (let at = backdrops.length - 1; at >= 0; at -= 1) {
    const backdrop = backdrops[at];
    if (backdrop.order >= paint.order) continue;
    if (backdrop.bounds !== null && !inRect(backdrop.bounds, centre)) continue;
    if (!backdrop.under(centre)) continue;
    if (backdrop.colour === null) return false;
    under = relativeLuminance(backdrop.colour);
    break;
  }
  return contrastRatio(luminance, under) < HIDDEN_CONTRAST_MAX;
}

/** White paper's relative luminance. */
const WHITE_PAPER = 1;

/** The WCAG contrast ratio of two relative luminances. */
function contrastRatio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
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
  const index = originIndex<Character>();
  for (const character of characters) index.add(character.origin, character);
  return (origin) => index.find(origin);
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
  let order = 0;
  const footprints: Footprint[] = [];
  const invisible: Point[] = [];
  const paints: GlyphPaint[] = [];
  const covers: Cover[] = [];
  const backdrops: Backdrop[] = [];
  const clipOnly: Point[] = [];

  // The clips open as the page draws, mirroring the reader's own stack: a
  // clip of text keeps its glyphs, so its pop can tell whether anything was
  // painted inside it (AC-7).
  const open: { glyphs: readonly Point[] | null; painted: boolean }[] = [];
  const paintInside = () => {
    for (const clip of open) clip.painted = true;
  };

  walkDrawing(mupdf, page, (drawing, state) => {
    order += 1;
    const plain =
      !state.softMasked && !state.restricted && !state.tiled && !state.defining;
    const opaque = (alpha: number) => alpha >= 1 && plain;

    switch (drawing.kind) {
      case "text": {
        glyphs += drawing.glyphs.length;
        if (drawing.mode === "ignore") {
          for (const glyph of drawing.glyphs) invisible.push(glyph.origin);
        } else if (drawing.mode === "clip" || drawing.mode === "clip-stroke") {
          open.push({
            glyphs: drawing.glyphs.map(({ origin }) => origin),
            painted: false,
          });
        } else if (drawing.paint !== null && !state.defining) {
          paintInside();
          for (const { origin, em } of drawing.glyphs) {
            paints.push({
              order,
              origin,
              em,
              paint: drawing.paint,
              clip: state.clip,
              plain,
            });
          }
        }
        break;
      }
      case "clip":
      case "begin-mask":
        open.push({ glyphs: null, painted: false });
        break;
      case "pop-clip": {
        const closed = open.pop();
        if (closed?.glyphs && !closed.painted) clipOnly.push(...closed.glyphs);
        break;
      }
      case "image": {
        images += 1;
        // A soft mask's own content is never seen as paint, so it is no
        // picture, though the page still draws it.
        if (state.defining) break;
        paintInside();
        const footprint: Footprint = {
          quad: unitSquare(drawing.transform),
          clip: state.clip,
        };
        const bounds = footprintBounds(footprint);
        footprints.push(footprint);
        backdrops.push({
          order,
          bounds,
          under: (point) => holds(footprint, point),
          colour: null,
        });
        if (
          !drawing.stencil &&
          !drawing.masked &&
          opaque(drawing.alpha) &&
          bounds !== null
        ) {
          const shape = clipOutline(outline(footprint.quad), state.clip);
          if (shape.length > 2) covers.push({ order, outline: shape, bounds });
        }
        break;
      }
      case "path": {
        if (!(contrastWithWhite(drawing.paint) <= HIDDEN_CONTRAST_MAX))
          contrasting = true;
        if (state.defining) break;
        paintInside();
        // A stroke draws lines, not an area text sits on.
        if (drawing.stroked) break;
        if (drawing.rectangle !== null) {
          const rect = cut(drawing.rectangle, state.clip);
          if (rect === null) break;
          const isOpaque = opaque(drawing.paint.alpha);
          const judged = isOpaque && Number.isFinite(relativeLuminance(drawing.paint));
          backdrops.push({
            order,
            bounds: rect,
            under: (point) => inRect(rect, point),
            colour: judged ? drawing.paint : null,
          });
          // Any colour counts as a cover (AC-6).
          if (isOpaque) covers.push({ order, outline: rectOutline(rect), bounds: rect });
        } else {
          const bounds = cut(drawing.bounds, state.clip);
          if (bounds !== null) {
            backdrops.push({
              order,
              bounds,
              under: (point) => inRect(bounds, point),
              colour: null,
            });
          }
        }
        break;
      }
      case "shade": {
        // A shading's colour is never judged, so it always counts as drawn.
        contrasting = true;
        if (state.defining) break;
        paintInside();
        const bounds =
          drawing.bounds === null ? state.clip : cut(drawing.bounds, state.clip);
        backdrops.push({
          order,
          bounds,
          under: (point) => bounds === null || inRect(bounds, point),
          colour: null,
        });
        break;
      }
      case "begin-tile": {
        const { area } = drawing;
        if (!state.defining && area !== null) {
          backdrops.push({
            order,
            bounds: area,
            under: (point) => inRect(area, point),
            colour: null,
          });
        }
        break;
      }
      default:
        break;
    }
  });

  return {
    glyphs,
    images,
    footprints,
    contrasting,
    invisible,
    paints,
    covers,
    backdrops,
    clipOnly,
  };
}

/** Bounds cut to the clip in force, or null when nothing of them is left. */
function cut(bounds: Rect | null, clip: Rect | null): Rect | null {
  if (bounds === null) return null;
  return clip === null ? bounds : intersect(bounds, clip);
}

function rectOutline([x0, y0, x1, y1]: Rect): readonly Point[] {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ];
}

/** A convex outline cut to the bounds of the clip in force. */
function clipOutline(shape: readonly Point[], clip: Rect | null): readonly Point[] {
  return clip === null ? shape : clipToConvex(shape, rectOutline(clip));
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
