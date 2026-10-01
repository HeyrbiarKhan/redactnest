import type { PDFDocument, PDFPage } from "mupdf";

import { PAGE_FINDINGS, type PageFinding } from "@/worker/protocol";

import {
  EXTRACTION_OPTIONS,
  originIndex,
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
import {
  clipToConvex,
  containsPoint,
  outline,
  polygonArea,
  quadBounds,
  quadCentre,
  quadHeight,
  quadWidth,
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
 * The share of a picture that visible lines of words may cover and still
 * leave it bare. Spec 0010, AC-1: only a line holding a letter or number, with
 * every readable character on it drawn where the text says, counts
 * (`coverageLines`). Machine read text counts toward no picture's coverage,
 * and clears a picture only through a machine read run (AC-2).
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
 * This many letters or numbers in a row on one line, purely invisible and
 * centred inside a picture and inside no picture of a different footprint, is
 * text recognition having read that picture: in practice one word. A stray
 * mark, a run of punctuation, or a word of one or two characters is not. Spec
 * 0008, AC-1 and AC-14. A line with drawn text within `COPY_REACH_RATIO` of
 * its characters counts for nothing, however long its run (AC-15). It counts
 * characters in a row on one line as `UNREADABLE_RUN` does, but it is a
 * separate rule with its own number.
 */
export const MACHINE_READ_RUN = 3;

/**
 * How near drawn text may come to a line of machine read text before the line
 * counts as a drawn copy of it, as a share of each character's own quad
 * height (spec 0008, AC-15). Half the height: MuPDF makes a quad somewhat
 * taller than an em (1.0 em for Tesseract's glyphless font, about 1.37 em for
 * Helvetica, measured), so the reach is half an em to about 0.7 em. That holds
 * a hidden copy offset by half a point or drifting along its line, while a
 * neighbouring line's baseline sits a line's spacing away, more than that in
 * ordinary text, so the next line is out of reach. A share of the quad, as
 * `TARGET_PADDING_RATIO` is a share of a target's, because a reach in ems would
 * be wrong by a third for Helvetica.
 */
export const COPY_REACH_RATIO = 0.5;

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
  /**
   * Each line's box, the union of its characters' quads, by its line number,
   * finite boxes only. `coverageLines` decides which of them count (spec
   * 0010, AC-1).
   */
  readonly lineBoxes: ReadonlyMap<number, Rect>;
  /**
   * The extracted character at a glyph's origin, within `POSITION_TOLERANCE`,
   * or null. Its quad is the glyph's box (AC-9).
   */
  readonly characterAt: (origin: Point) => Character | null;
  /**
   * The page's characters in reading order, each with its line: the ones
   * `characterAt` matches glyphs to, handed out for the machine read run
   * (spec 0008, AC-11) and the lines that count (spec 0010, AC-10), so
   * nothing more of the page is held (INV-8).
   */
  readonly characters: readonly Character[];
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
  /** Invisible glyphs (render mode 3), in drawing order. */
  readonly invisible: readonly Placed[];
  /** Every fill and stroke of a glyph, in drawing order (AC-7). */
  readonly paints: readonly GlyphPaint[];
  /** Every opaque cover, in drawing order (AC-6). */
  readonly covers: readonly Cover[];
  /** Everything text can be drawn on, in drawing order (AC-7). */
  readonly backdrops: readonly Backdrop[];
  /** Glyphs used only as a clip that nothing was painted inside (AC-7). */
  readonly clipOnly: readonly Point[];
  /**
   * The origin of every glyph drawn as part of a clip (render modes 4 to 7),
   * whatever was painted inside it, so a clipping glyph can make a line of
   * machine read text a drawn copy (spec 0008, AC-2 and AC-15).
   */
  readonly clipGlyphs: readonly Point[];
  /** A glyph, in any render mode, drawn while the clip in force holds no area (AC-11). */
  readonly emptyClip: boolean;
}

/**
 * Where a glyph was drawn and what clipped it: all the clipped away rule reads
 * of a glyph the ordinary read dropped (AC-7).
 */
interface Placed {
  readonly origin: Point;
  /** The code point MuPDF maps it to, so whitespace can be skipped. */
  readonly unicode: number;
  /** The bounds of the clip in force as it was drawn. */
  readonly clip: Rect | null;
}

/** One fill or one stroke of a glyph, as the hidden rules read it (AC-7). */
interface GlyphPaint extends Placed {
  /** Its place in drawing order. */
  readonly order: number;
  readonly em: number;
  readonly paint: Paint;
  /** The paint's relative luminance, `NaN` when its colour is not judged. */
  readonly luminance: number;
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

/**
 * An image whose footprint holds at least `PICTURE_MIN_SHARE` of the grid
 * points (AC-4), with the points it holds.
 */
interface Picture {
  readonly footprint: Footprint;
  readonly held: Uint8Array;
  readonly count: number;
}

function inspectPage(mupdf: MuPdf, page: PDFPage): PageInspection {
  const visible = page.getBounds();
  const area: Rect = [visible[0], visible[1], visible[2], visible[3]];

  const text = readText(page);
  const drawing = readDrawing(mupdf, page);
  const grid = sampleGrid(area);

  // Every picture with the points its footprint holds, gathered before any is
  // judged, so a search can ask which other pictures hold a character's
  // centre, whether drawn before it or after (spec 0008, AC-16).
  const pictures: Picture[] = [];
  for (const footprint of drawing.footprints) {
    const held = new Uint8Array(grid.count);
    const count = grid.mark(
      held,
      (point) => holds(footprint, point),
      footprintBounds(footprint),
    );
    if (count >= PICTURE_MIN_SHARE * grid.count)
      pictures.push({ footprint, held, count });
  }

  // Which grid points the lines that count cover (spec 0006, AC-4): visible
  // lines of words, every readable character drawn where the text says, so an
  // OCR layer, a line of marks and text the page never draws count for
  // nothing (spec 0010, AC-1 and AC-2). The invisible glyphs and the drawn
  // glyph origins are gathered once here and shared with the machine read
  // run, and only on a page with a picture, so a page with none pays nothing
  // new (AC-10, AC-11).
  const glyphs = pictures.length > 0 ? glyphOrigins(drawing) : null;
  const underText = new Uint8Array(grid.count);
  if (glyphs !== null) {
    const counting = coverageLines(
      text.characters,
      (origin) => isDrawnAt(glyphs.drawn, origin),
      (origin) => glyphs.invisible.find(origin) !== null,
    );
    for (const line of counting) {
      const box = text.lineBoxes.get(line);
      if (box !== undefined) grid.mark(underText, (point) => inRect(box, point), box);
    }
  }
  const machineRead = glyphs === null ? null : machineReadTest(text.characters, glyphs);
  const runArea = runAreas(pictures);

  // Then each picture, and whether it has readable text over it.
  const bare = new Uint8Array(grid.count);
  let bareShare = 0;
  let anyBare = false;
  for (let index = 0; index < pictures.length; index += 1) {
    const { held, count } = pictures[index];
    let covered = 0;
    for (let at = 0; at < grid.count; at += 1)
      if (held[at] && underText[at]) covered += 1;
    if (covered >= TEXT_OVER_PICTURE_MAX * count) continue;

    // Spec 0008, AC-1 to AC-3: a picture text recognition read a word on is
    // not bare, judged picture by picture. Searched only when the coverage
    // test failed and the page draws enough invisible glyphs to hold a run,
    // so a born digital page pays nothing (AC-12). Since spec 0010 this is
    // the only way machine read text clears a picture, dense or sparse (AC-2).
    if (
      machineRead !== null &&
      drawing.invisible.length >= MACHINE_READ_RUN &&
      machineReadRun(text.characters, machineRead, runArea(index))
    ) {
      continue;
    }

    anyBare = true;
    for (let at = 0; at < grid.count; at += 1) if (held[at]) bare[at] = 1;
  }
  for (let at = 0; at < grid.count; at += 1) bareShare += bare[at];
  bareShare = grid.count === 0 ? 0 : bareShare / grid.count;

  const found = new Set<PageFinding>();

  // AC-2. A page with no readable character over pictures holding half the
  // page is a scan, and so is one with a stamp's few characters over bare
  // pictures; with no readable character every picture is bare, so the one
  // test covers both. A picture holding a machine read run is not bare, so a
  // short OCR page is not a scan (spec 0008, AC-5).
  const scanned = text.readableCount < STAMP_MAX_CHARS && bareShare >= SCAN_MIN_SHARE;
  if (scanned) found.add("scanned");

  const blank = drawing.glyphs === 0 && drawing.images === 0 && !drawing.contrasting;
  if (blank) found.add("blank");
  if (drawing.glyphs === 0 && !scanned && !blank) found.add("drawn-only");

  // AC-3.
  if (text.unreadableRun || (drawing.glyphs > 0 && text.readableCount === 0)) {
    found.add("unreadable-text");
  }

  // AC-4. A picture with next to no visible lines of words over it and no
  // machine read run (spec 0010, AC-1 and AC-2), on a page that is not
  // already a scan: a pasted ID card, a photo, a slide's background.
  if (!scanned && anyBare) found.add("bare-picture");

  // AC-5. Invisible text whose centre lies over an image, whichever the
  // producer drew first, is a text recognition layer: Tesseract and OCRmyPDF
  // draw it over the scan, ABBYY under it. A note, never a warning.
  const overImage = (origin: Point) => {
    const centre = glyphCentre(text, origin);
    return drawing.footprints.some((footprint) => holds(footprint, centre));
  };
  if (drawing.invisible.some(({ origin }) => overImage(origin)))
    found.add("machine-read-text");

  // AC-6 and AC-7: text a viewer never shows.
  const concealed = concealedGlyphs(text, drawing, area, overImage);
  if (concealed.some(({ kind }) => kind === "covered")) found.add("covered-text");
  if (concealed.some(({ kind }) => kind === "hidden")) found.add("hidden-text");

  return {
    findings: PAGE_FINDINGS.filter((finding) => found.has(finding)),
    readable: text.readableCount > 0,
    concealed,
    emptyClip: drawing.emptyClip,
  };
}

/**
 * What a character does to a machine read run. Spec 0008, AC-14: a letter or
 * a number counts, a combining mark continues a run without adding to it,
 * since it is part of the letter before it, and anything else ends one.
 */
export type RunStep = "counts" | "continues" | "ends";

/**
 * A code point's step in a machine read run. Spec 0008, AC-14: `\p{L}` or
 * `\p{N}` counts, `\p{M}` continues, and anything else ends a run, readable or
 * not: whitespace, punctuation, symbols, and format characters such as the
 * zero width space. The readable count keeps `isReadable`, so a punctuation
 * mark still counts toward the stamp cap.
 */
export function runStep(code: number): RunStep {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return "ends";
  // ASCII, most of any page, answered without the pattern. No ASCII character
  // is a mark, and only its letters and digits count, so `_` ends a run.
  if (code < 0x80) {
    return (code >= 0x30 && code <= 0x39) ||
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a)
      ? "counts"
      : "ends";
  }
  const character = String.fromCodePoint(code);
  if (LETTER_OR_NUMBER.test(character)) return "counts";
  return COMBINING_MARK.test(character) ? "continues" : "ends";
}

const LETTER_OR_NUMBER = /^[\p{L}\p{N}]$/u;
const COMBINING_MARK = /^\p{M}$/u;

/**
 * Does a picture hold a machine read run? Spec 0008, AC-1 and AC-14:
 * `MACHINE_READ_RUN` or more characters that count, in a row on one line of
 * the ordinary read, each with its quad centre `inside` the picture. A
 * character that continues (a combining mark) carries a run without adding to
 * it. One that ends, one centred outside, and the end of a line each end a
 * run. So a word straddling a picture's edge counts only its letters centred
 * inside, and one letter carrying two marks is no run. It stops at the first
 * run.
 *
 * Pure, over the page's characters in reading order, so its edges are proved
 * as plain logic. `step` is asked by index and only for a character centred
 * inside, so the page's answers are computed where a picture needs them and no
 * further (AC-12).
 */
export function machineReadRun(
  characters: readonly Pick<Character, "line" | "quad">[],
  step: (at: number) => RunStep,
  inside: (centre: Point) => boolean,
): boolean {
  let run = 0;
  let line = -1;
  for (let at = 0; at < characters.length; at += 1) {
    const character = characters[at];
    if (character.line !== line) {
      line = character.line;
      run = 0;
    }
    if (!inside(quadCentre(character.quad))) {
      run = 0;
      continue;
    }
    const next = step(at);
    if (next === "counts") {
      run += 1;
      if (run >= MACHINE_READ_RUN) return true;
    } else if (next === "ends") {
      run = 0;
    }
  }
  return false;
}

/**
 * The lines of the ordinary read whose boxes count toward a picture's
 * coverage (spec 0006, AC-4). Spec 0010, AC-1: a line counts when it holds a
 * letter or number (a character `runStep` counts), every readable character
 * on it (`isReadable`) has a drawn glyph at its origin, and none has an
 * invisible one there. So a line of machine read text, a line mixing hidden
 * and drawn characters, text drawn invisible and visible at one place, a line
 * holding a readable character the page draws no glyph for, and a line of only
 * punctuation, symbols or format characters each count for nothing (INV-1,
 * INV-3). Whitespace and unreadable characters are never asked whether they
 * match.
 *
 * Pure, over the page's characters in reading order, where a line's
 * characters are contiguous, so its edges are proved as plain logic. Once a
 * character fails a line, the rest of that line is not asked about.
 */
export function coverageLines(
  characters: readonly Pick<Character, "line" | "code" | "origin">[],
  isDrawn: (origin: Point) => boolean,
  isHidden: (origin: Point) => boolean,
): ReadonlySet<number> {
  const counting = new Set<number>();
  let line = -1;
  let word = false;
  let failed = false;
  for (const character of characters) {
    if (character.line !== line) {
      if (word && !failed) counting.add(line);
      line = character.line;
      word = false;
      failed = false;
    }
    if (failed || !isReadable(character.code)) continue;
    if (!isDrawn(character.origin) || isHidden(character.origin)) failed = true;
    else if (runStep(character.code) === "counts") word = true;
  }
  if (word && !failed) counting.add(line);
  return counting;
}

/**
 * A character's step, or a line's copy answer, as `machineReadTest` keeps it.
 * 0 is not yet asked, which is what a fresh `Uint8Array` holds.
 */
const UNASKED = 0;
const COUNTS = 1;
const CONTINUES = 2;
const ENDS = 3;
const DRAWN_COPY = 1;
const NO_COPY = 2;

/**
 * The step of the page's character at `at` (spec 0008, AC-2, AC-14 and
 * AC-15). It ends a run unless it is purely invisible: the drawing pass drew
 * an invisible glyph at its origin, within `POSITION_TOLERANCE`, and its line
 * is no drawn copy. Then its step is its code point's, `runStep`. A drawn glyph
 * at a character's own origin is within its reach, so text drawn both
 * invisible and visible at one place never counts.
 *
 * Neither answer depends on the picture, so each character's step is decided
 * once per page, and each line's copy answer once per line, the first time a
 * picture needs it (AC-12). The invisible glyphs and the drawn glyph origins
 * it asks are `inspectPage`'s, built once and shared with `coverageLines`
 * (spec 0010, AC-10).
 */
function machineReadTest(
  characters: readonly Character[],
  { invisible, drawn }: GlyphOrigins,
): (at: number) => RunStep {
  let asked: { readonly steps: Uint8Array; readonly lines: Uint8Array } | null = null;

  /** Is the line of the character at `at` a drawn copy? Decided once per line. */
  const isCopy = (at: number, lines: Uint8Array): boolean => {
    const { line } = characters[at];
    if (lines[line] === UNASKED) {
      // A line's characters are contiguous in reading order.
      let from = at;
      while (from > 0 && characters[from - 1].line === line) from -= 1;
      let copy = false;
      for (
        let each = from;
        !copy && each < characters.length && characters[each].line === line;
        each += 1
      ) {
        copy = withinReach(characters[each], drawn);
      }
      lines[line] = copy ? DRAWN_COPY : NO_COPY;
    }
    return lines[line] === DRAWN_COPY;
  };

  return (at) => {
    if (asked === null) {
      // Lines are counted from 0 in reading order, so the last is the highest.
      const lineCount =
        characters.length === 0 ? 0 : characters[characters.length - 1].line + 1;
      asked = {
        steps: new Uint8Array(characters.length),
        lines: new Uint8Array(lineCount),
      };
    }
    const { steps, lines } = asked;
    if (steps[at] === UNASKED) {
      const { code, origin } = characters[at];
      // The code point first: it is the cheapest, and whitespace and
      // punctuation end a run whatever is drawn.
      const step = runStep(code);
      steps[at] =
        step === "ends" || invisible.find(origin) === null || isCopy(at, lines)
          ? ENDS
          : step === "counts"
            ? COUNTS
            : CONTINUES;
    }
    return steps[at] === COUNTS
      ? "counts"
      : steps[at] === CONTINUES
        ? "continues"
        : "ends";
  };
}

/**
 * The origin of every glyph drawn visibly, filled, stroked or as a clip
 * (`drawing.paints` and `drawing.clipGlyphs`), in one list sorted by x, so the
 * area within a character's reach is asked with a binary search on x and a
 * check of y (spec 0008, AC-15). An origin that is not a finite number lies
 * within reach of no character, so it is left out rather than let it spoil the
 * order.
 */
interface DrawnOrigins {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
}

function drawnOrigins(drawing: DrawingReading): DrawnOrigins {
  const origins: Point[] = [];
  for (const { origin } of drawing.paints) origins.push(origin);
  for (const origin of drawing.clipGlyphs) origins.push(origin);
  const finite = origins.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  finite.sort(([a], [b]) => a - b);
  return {
    xs: Float64Array.from(finite, ([x]) => x),
    ys: Float64Array.from(finite, ([, y]) => y),
  };
}

/**
 * Where a page draws its glyphs, as the lines that count and the machine read
 * run both ask (spec 0010, AC-10): the invisible glyphs (render mode 3) by
 * origin, and every drawn one in `DrawnOrigins`. Built once per page with a
 * picture, and dropped with the page.
 */
interface GlyphOrigins {
  readonly invisible: ReturnType<typeof originIndex<true>>;
  readonly drawn: DrawnOrigins;
}

function glyphOrigins(drawing: DrawingReading): GlyphOrigins {
  const invisible = originIndex<true>();
  for (const { origin } of drawing.invisible) invisible.add(origin, true);
  return { invisible, drawn: drawnOrigins(drawing) };
}

/**
 * Is a glyph drawn at this origin? Spec 0010, AC-1: a drawn glyph's origin
 * within `POSITION_TOLERANCE` of it on each axis, the same match spec 0006's
 * AC-9 makes between a glyph and its character. A binary search on x, then a
 * check of y. An origin that is not finite matches nothing, so the line it
 * sits on does not count.
 */
function isDrawnAt(drawn: DrawnOrigins, [x, y]: Point): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  for (
    let at = firstAtLeast(drawn.xs, x - POSITION_TOLERANCE);
    at < drawn.xs.length && drawn.xs[at] <= x + POSITION_TOLERANCE;
    at += 1
  ) {
    if (Math.abs(drawn.ys[at] - y) <= POSITION_TOLERANCE) return true;
  }
  return false;
}

/**
 * Does a drawn glyph's origin lie within this character's reach? Spec 0008,
 * AC-15. The reach is `COPY_REACH_RATIO` of the character's quad height, never
 * less than `POSITION_TOLERANCE`, measured from its baseline along its
 * `direction`: up to the reach on either side of the baseline, and along the
 * line from the reach before its origin to the reach past its end (its origin
 * plus its quad's width). A character whose height, width, direction or origin
 * cannot be measured answers yes, so its line is a drawn copy and fails safe.
 * The height and width checks are defence in depth: `machineReadRun` asks
 * whether a quad's centre is inside the picture first, and a quad with a non
 * finite corner has a centre inside nothing, so such a character never reaches
 * here.
 */
function withinReach(character: Character, drawn: DrawnOrigins): boolean {
  const height = quadHeight(character.quad);
  const width = quadWidth(character.quad);
  const [ox, oy] = character.origin;
  const [dx, dy] = character.direction;
  const length = Math.hypot(dx, dy);
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(width) ||
    !Number.isFinite(ox) ||
    !Number.isFinite(oy) ||
    !(length > 0 && Number.isFinite(length))
  ) {
    return true;
  }

  // Along the line, and across it.
  const ux = dx / length;
  const uy = dy / length;
  const reach = Math.max(COPY_REACH_RATIO * height, POSITION_TOLERANCE);
  const before = -reach;
  const past = width + reach;

  // The bounds of that area in page space, to ask the list with: its four
  // corners, `along` from the origin and `across` either side, written out
  // rather than built as arrays, since a dense layer with no word asks this of
  // every character it holds (spec 0010, AC-11).
  const startX = ox + before * ux;
  const endX = ox + past * ux;
  const startY = oy + before * uy;
  const endY = oy + past * uy;
  const acrossX = reach * uy;
  const acrossY = reach * ux;
  const x0 = Math.min(startX + acrossX, startX - acrossX, endX + acrossX, endX - acrossX);
  const x1 = Math.max(startX + acrossX, startX - acrossX, endX + acrossX, endX - acrossX);
  const y0 = Math.min(startY - acrossY, startY + acrossY, endY - acrossY, endY + acrossY);
  const y1 = Math.max(startY - acrossY, startY + acrossY, endY - acrossY, endY + acrossY);

  for (let at = firstAtLeast(drawn.xs, x0); at < drawn.xs.length; at += 1) {
    const x = drawn.xs[at];
    if (x > x1) break;
    const y = drawn.ys[at];
    if (y < y0 || y > y1) continue;
    const along = (x - ox) * ux + (y - oy) * uy;
    const across = (y - oy) * ux - (x - ox) * uy;
    if (along >= before && along <= past && Math.abs(across) <= reach) return true;
  }
  return false;
}

/** The first index of an ascending list whose value is at least `value`. */
function firstAtLeast(sorted: Float64Array, value: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (sorted[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

/**
 * Where each picture's run may be counted. Spec 0008, AC-16: a character's
 * centre inside its footprint and inside no picture of a different footprint,
 * whether that picture passed the coverage test or not. Two pictures share a
 * footprint when they hold exactly the same grid points, as a scan and its
 * stencil layer do (AC-7), so they never take a character from each other.
 *
 * The pictures are grouped once per page, on the first search, in a `Map`
 * keyed on the points each holds, so equal footprints meet without a compare
 * per pair (AC-12).
 */
function runAreas(
  pictures: readonly Picture[],
): (index: number) => (centre: Point) => boolean {
  let grouped: readonly number[] | null = null;

  return (index) => {
    if (grouped === null) {
      const byPoints = new Map<string, number>();
      grouped = pictures.map(({ held }) => {
        const key = pointsKey(held);
        const group = byPoints.get(key) ?? byPoints.size;
        byPoints.set(key, group);
        return group;
      });
    }
    const groups = grouped;
    const own = groups[index];
    const { footprint } = pictures[index];
    const others = pictures.filter((_, other) => groups[other] !== own);
    return (centre) =>
      holds(footprint, centre) && !others.some((other) => holds(other.footprint, centre));
  };
}

/** A picture's grid points as a key, sixteen points to a character. */
function pointsKey(held: Uint8Array): string {
  let key = "";
  for (let at = 0; at < held.length; at += 16) {
    let unit = 0;
    for (let bit = 0; bit < 16 && at + bit < held.length; bit += 1)
      if (held[at + bit]) unit |= 1 << bit;
    key += String.fromCharCode(unit);
  }
  return key;
}

/** A glyph as the drawing reader drew it: every fill and stroke at one origin. */
interface DrawnGlyph {
  readonly origin: Point;
  readonly em: number;
  readonly paints: GlyphPaint[];
  /** The drawing order of its last paint, which a cover must come after. */
  lastOrder: number;
}

/**
 * Which glyphs a viewer never sees, and why. Spec 0006, AC-6, AC-7 and AC-9.
 *
 * A glyph that meets an extracted character is judged with that character's
 * quad as its box, and only when the box's centre lies inside the visible
 * area: a glyph outside it is the trim's business, not a warning. A glyph the
 * ordinary read dropped has no box, so it is judged by AC-7's clipped away
 * rule alone (`clippedAway`). A machine read glyph is never judged (AC-5).
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
  const lastCover = drawing.covers.reduce(
    (latest, { order }) => Math.max(latest, order),
    0,
  );
  const firstBackdrop =
    drawing.backdrops.length === 0 ? Infinity : drawing.backdrops[0].order;

  /** The glyph's box and its centre, or null when the ordinary read dropped it. */
  const read = (origin: Point): { box: readonly Point[]; centre: Point } | null => {
    const character = text.characterAt(origin);
    if (character === null) return null;
    return { box: outline(character.quad), centre: quadCentre(character.quad) };
  };

  for (const glyph of glyphs.all) {
    // Most glyphs on most pages can be neither covered nor hidden, and are
    // settled without looking up their character (AC-29's budget). A glyph a
    // clip hides wholly is never passed over: its clip's edge is in reach.
    if (!mayBeConcealed(glyph, lastCover, firstBackdrop)) continue;

    const seen = read(glyph.origin);
    if (seen === null) {
      if (clippedAway(glyph.paints, area)) {
        concealed.push({ origin: glyph.origin, kind: "hidden" });
      }
      continue;
    }
    if (!inRect(area, seen.centre)) continue;

    const last = glyph.lastOrder;
    if (last < lastCover && isCovered(seen.box, last, drawing.covers)) {
      concealed.push({ origin: glyph.origin, kind: "covered" });
    } else if (
      glyph.paints.every((paint) => !shows(paint, glyph.em, seen.centre, drawing))
    ) {
      concealed.push({ origin: glyph.origin, kind: "hidden" });
    }
  }

  // Invisible text with no image under or over it (AC-7), never machine read.
  // One the ordinary read dropped is judged by the clipped away rule alone.
  for (const glyph of drawing.invisible) {
    if (overImage(glyph.origin)) continue;
    const seen = read(glyph.origin);
    if (seen === null ? clippedAway([glyph], area) : inRect(area, seen.centre)) {
      concealed.push({ origin: glyph.origin, kind: "hidden" });
    }
  }

  // Text used only as a clip, with nothing painted inside it (AC-7). A glyph
  // that is also filled or stroked is judged by its paints above.
  for (const origin of drawing.clipOnly) {
    if (glyphs.at(origin) !== null) continue;
    const seen = read(origin);
    if (seen === null || !inRect(area, seen.centre)) continue;
    concealed.push({ origin, kind: "hidden" });
  }

  return concealed;
}

/**
 * AC-7's clipped away rule, for a glyph the ordinary read dropped: it is not
 * whitespace, its origin lies inside the visible area, and every time it was
 * drawn, its origin lay outside the bounds of the clip in force. MuPDF's
 * ordinary read drops a glyph a clip hides wholly (measured 2026-09-29), so
 * without this, text a clip hides would ship with no word said. Whitespace is
 * skipped, since extraction does not report every space a producer draws. The
 * origin stands in for the centre, since there is no box to take one from.
 */
function clippedAway(drawn: readonly Placed[], area: Rect): boolean {
  const [{ origin }] = drawn;
  return (
    inRect(area, origin) &&
    drawn.some(({ unicode }) => !isSpace(unicode)) &&
    drawn.every(({ clip }) => clip !== null && !inRect(clip, origin))
  );
}

/** Is this code point whitespace? Printable ASCII, most of any page, answered without the pattern. */
function isSpace(code: number): boolean {
  if (code > 0x20 && code < 0x7f) return false;
  return WHITESPACE.test(String.fromCodePoint(code));
}

const WHITESPACE = /^\s$/u;

/**
 * Group paints into glyphs: every fill and stroke drawn at one origin. A
 * glyph filled and stroked (render mode 2) is drawn twice from one text
 * object, with the same text matrix, so its two paints share their origin
 * exactly, and a map keyed by the exact coordinates groups them without a
 * tolerance search. `at` answers within `POSITION_TOLERANCE`, for the rare
 * clip only glyph asked about.
 */
function byOrigin(paints: readonly GlyphPaint[]): {
  readonly all: readonly DrawnGlyph[];
  at(origin: Point): DrawnGlyph | null;
} {
  const all: DrawnGlyph[] = [];
  const exact = new Map<number, Map<number, DrawnGlyph>>();
  for (const paint of paints) {
    const [x, y] = paint.origin;
    let row = exact.get(x);
    if (row === undefined) {
      row = new Map();
      exact.set(x, row);
    }
    const glyph = row.get(y);
    if (glyph !== undefined) {
      glyph.paints.push(paint);
      glyph.lastOrder = Math.max(glyph.lastOrder, paint.order);
    } else {
      const drawn: DrawnGlyph = {
        origin: paint.origin,
        em: paint.em,
        paints: [paint],
        lastOrder: paint.order,
      };
      all.push(drawn);
      row.set(y, drawn);
    }
  }

  let index: ReturnType<typeof originIndex<DrawnGlyph>> | null = null;
  return {
    all,
    at(origin) {
      if (index === null) {
        index = originIndex<DrawnGlyph>();
        for (const glyph of all) index.add(glyph.origin, glyph);
      }
      return index.find(origin);
    },
  };
}

/**
 * Could this glyph be covered or hidden at all? A cheap test that never
 * answers no for a glyph a rule would conceal, so a glyph it passes over is
 * one the full judgement would pass over too.
 *
 * It could be covered only when a cover is drawn after it. It could be hidden
 * only when some paint of it is at zero opacity, under `TINY_TEXT_MAX`, in
 * a clip whose edge comes within reach of it, or in a colour that could be
 * lost against what is under it: white paper, when nothing is drawn before
 * it, and anything, when something is.
 */
function mayBeConcealed(
  glyph: DrawnGlyph,
  lastCover: number,
  firstBackdrop: number,
): boolean {
  if (glyph.lastOrder < lastCover) return true;
  if (!(glyph.em >= TINY_TEXT_MAX)) return true;

  // The centre of a glyph's box lies within this many ems of its origin in
  // any font a page draws; a clip further than this from the origin on every
  // side holds the centre.
  const reach = CENTRE_REACH_EMS * glyph.em;
  const [x, y] = glyph.origin;
  return glyph.paints.some(
    (paint) =>
      !(paint.paint.alpha > 0) ||
      (paint.clip !== null &&
        !(
          x - reach >= paint.clip[0] &&
          x + reach <= paint.clip[2] &&
          y - reach >= paint.clip[1] &&
          y + reach <= paint.clip[3]
        )) ||
      (paint.plain &&
        Number.isFinite(paint.luminance) &&
        (paint.order > firstBackdrop ||
          contrastRatio(paint.luminance, WHITE_PAPER) < HIDDEN_CONTRAST_MAX)),
  );
}

/**
 * How far from its origin, in ems, a glyph's box centre can lie: well past
 * the widest advance and the tallest ascent a font gives, so the test above
 * errs toward judging a glyph in full.
 */
const CENTRE_REACH_EMS = 4;

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
 *
 * The clip is not judged for whitespace, as the clipped away rule does not
 * judge it: a cell's trailing spaces run past its clip as a matter of course,
 * and hide nothing.
 */
function shows(
  paint: GlyphPaint,
  em: number,
  centre: Point,
  drawing: DrawingReading,
): boolean {
  if (!(paint.paint.alpha > 0)) return false;
  if (paint.clip !== null && !inRect(paint.clip, centre) && !isSpace(paint.unicode))
    return false;
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
  const { luminance } = paint;
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
  // Printable ASCII, most of any page, answered without the pattern.
  if (code > 0x20 && code < 0x7f) return true;
  return !UNREADABLE.test(String.fromCodePoint(code));
}

const UNREADABLE = /^[\s\p{Cc}\p{Co}\p{Cs}�]$/u;

/** U+FFFD, a lone surrogate, or private use: what an unreadable font extracts as. */
function isUnmapped(code: number): boolean {
  if (code < 0x80) return false;
  return UNMAPPED.test(String.fromCodePoint(code));
}

const UNMAPPED = /^[\p{Co}\p{Cs}�]$/u;

/** The ordinary mode read (`EXTRACTION_OPTIONS[0]`), through the one character reader. */
function readText(page: PDFPage): TextReading {
  let readableCount = 0;
  let unreadableRun = false;
  let run = 0;
  let line = -1;
  // Each line's box, from its characters' quads. Which lines count is
  // `coverageLines`' to decide (spec 0010, AC-1).
  const boxes = new Map<number, [number, number, number, number]>();
  // Held for this page only, to match glyphs to, for the machine read run and
  // for the lines that count (INV-8; spec 0008, AC-11; spec 0010, AC-10).
  const characters: Character[] = [];

  walkCharacters(page, EXTRACTION_OPTIONS[0], (character: Character) => {
    characters.push(character);
    if (character.line !== line) {
      line = character.line;
      run = 0;
    }

    if (isReadable(character.code)) readableCount += 1;
    run = isUnmapped(character.code) ? run + 1 : 0;
    if (run >= UNREADABLE_RUN) unreadableRun = true;

    const [x0, y0, x1, y1] = quadBounds(character.quad);
    const box = boxes.get(character.line);
    if (box === undefined) {
      boxes.set(character.line, [x0, y0, x1, y1]);
    } else {
      box[0] = Math.min(box[0], x0);
      box[1] = Math.min(box[1], y0);
      box[2] = Math.max(box[2], x1);
      box[3] = Math.max(box[3], y1);
    }
  });

  const lineBoxes = new Map<number, Rect>();
  for (const [each, box] of boxes)
    if (box.every(Number.isFinite)) lineBoxes.set(each, [box[0], box[1], box[2], box[3]]);

  return {
    readableCount,
    unreadableRun,
    lineBoxes,
    characterAt: indexByOrigin(characters),
    characters,
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
  // Built on the first lookup, so a page whose glyphs need none pays nothing.
  let index: ReturnType<typeof originIndex<Character>> | null = null;
  return (origin) => {
    if (index === null) {
      index = originIndex<Character>();
      for (const character of characters) index.add(character.origin, character);
    }
    return index.find(origin);
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
  let order = 0;
  const footprints: Footprint[] = [];
  const invisible: Placed[] = [];
  const paints: GlyphPaint[] = [];
  const covers: Cover[] = [];
  const backdrops: Backdrop[] = [];
  const clipOnly: Point[] = [];
  const clipGlyphs: Point[] = [];
  let emptyClip = false;

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
        if (state.emptyClip && drawing.glyphs.length > 0) emptyClip = true;
        if (drawing.mode === "ignore") {
          // With the clip in force, as a painted glyph's record carries it, for
          // the clipped away rule (AC-7).
          for (const { origin, unicode } of drawing.glyphs) {
            invisible.push({ origin, unicode, clip: state.clip });
          }
        } else if (drawing.mode === "clip" || drawing.mode === "clip-stroke") {
          const origins = drawing.glyphs.map(({ origin }) => origin);
          // Every one, whatever is painted inside the clip, so a clipping
          // glyph makes a line of machine read text beside it a drawn copy
          // (spec 0008, AC-2 and AC-15). A loop, not a spread, for a clip of
          // many glyphs.
          for (const origin of origins) clipGlyphs.push(origin);
          open.push({ glyphs: origins, painted: false });
        } else if (drawing.paint !== null && !state.defining) {
          paintInside();
          // Once per text object, not once per glyph.
          const luminance = relativeLuminance(drawing.paint);
          for (const { origin, em, unicode } of drawing.glyphs) {
            paints.push({
              order,
              origin,
              unicode,
              em,
              paint: drawing.paint,
              luminance,
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
    clipGlyphs,
    emptyClip,
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
