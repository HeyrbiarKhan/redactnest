import type { PDFPage } from "mupdf";

import { containsPoint, quadAngle, quadCentre, quadHeight } from "./geometry";
import type { Quad } from "./types";

/**
 * The characters of a page, recorded before a run and compared after it.
 * Spec 0004, AC-13 and INV-12.
 *
 * Every page's characters in the output must be exactly the prepared source's
 * characters less the ticked ones: the same character at the same origin, none
 * missing and none extra. An extra means something ticked survived; a missing
 * one means something nobody ticked was removed. The same rule sees a leak and
 * an over removal, which is why it compares whole pages rather than sampling
 * the targets.
 *
 * Like the target geometry, the values below are named engine constants rather
 * than config values: rules about extraction and position, not caps on the
 * visitor. They are deliberate exceptions to "every size limit comes from
 * `src/config`".
 */

/**
 * How far a surviving character's origin may move and still be the same
 * character, in points, on each axis. Surviving glyphs keep their origins to
 * about 0.00002 pt through removal and a `sanitize` write (measured), so this
 * leaves a wide margin with no false matches.
 */
export const POSITION_TOLERANCE = 0.01;

/**
 * How far a character's line may turn from a target's and still be on that
 * target's line, in degrees. A large diagonal watermark letter crossing a
 * target is not on its line, so it is recorded as unticked, and a run that takes
 * it out is reported rather than passed.
 */
export const LINE_ANGLE_TOLERANCE = 2;

/**
 * How small and how large a character's quad may be, as a share of the target
 * quad's height, and still be on the target's line. A superscript or a stamp's
 * letter is not, however it sits.
 */
export const LINE_HEIGHT_MIN = 0.67;
export const LINE_HEIGHT_MAX = 1.5;

/**
 * The two ways every page is extracted, for the record, the check and target
 * validation alike. Also what the Vitest target helper imports.
 *
 * The first is MuPDF's defaults, which is what `page.search()` uses, so
 * character quads and target quads are built alike. The second ignores
 * replacement text (`/ActualText`), so a glyph that survived under replacement
 * text is told apart from replacement text that survived (AC-25).
 *
 * Never `dehyphenate`, `collect-styles`, `segment`, `clip` or `accurate-bboxes`:
 * each changes which characters exist or where their quads sit.
 */
export const EXTRACTION_OPTIONS = Object.freeze(["", "ignore-actualtext"] as const);

/** One character as the page reports it. */
export interface Character {
  readonly code: number;
  readonly origin: readonly [number, number];
  readonly quad: Quad;
  /** The direction its line runs, in radians. */
  readonly angle: number;
}

/**
 * One page's characters in one extraction mode: origins as `x, y` pairs and code
 * points, never strings, never the structured text itself. Document text, so it
 * lives only in the engine for the length of a run and never crosses the
 * boundary.
 */
export interface CharacterList {
  readonly origins: Float64Array;
  readonly codes: Uint32Array;
}

/** A page's record, one list per entry of `EXTRACTION_OPTIONS`. */
export type PageRecord = readonly CharacterList[];

/** A target quad with what the ticked test reads from it worked out once. */
export interface TargetArea {
  readonly quad: Quad;
  readonly angle: number;
  readonly height: number;
}

export function targetArea(quad: Quad): TargetArea {
  return { quad, angle: quadAngle(quad), height: quadHeight(quad) };
}

/** What comparing one page in one mode found. */
export interface PageDifference {
  /** A character the record does not hold: something ticked survived. */
  readonly extra: boolean;
  /** A recorded character the output lacks: something unticked was removed. */
  readonly missing: boolean;
  /** A character centred inside a line box, where a black box is drawn. */
  readonly hidden: boolean;
}

/** MuPDF infers spaces from gaps, and a removed target leaves one. */
function isWhitespace(code: number): boolean {
  return /\s/u.test(String.fromCodePoint(code));
}

/**
 * Visit every character of a page in extraction order, whitespace included.
 * The structured text is destroyed before this returns, whatever happens.
 */
export function walkCharacters(
  page: PDFPage,
  options: string,
  visit: (character: Character) => void,
): void {
  const stext = page.toStructuredText(options);
  let angle = 0;

  try {
    stext.walk({
      beginLine(_bbox, _wmode, direction) {
        angle = Math.atan2(direction[1], direction[0]);
      },
      onChar(text, origin, _font, _size, quad) {
        visit({
          code: text.codePointAt(0) ?? 0,
          origin: [origin[0], origin[1]],
          quad,
          angle,
        });
      },
    });
  } finally {
    stext.destroy();
  }
}

/** The smaller angle between two directions, in degrees. */
function angleBetween(a: number, b: number): number {
  const turn = Math.abs(a - b) % (2 * Math.PI);
  return (Math.min(turn, 2 * Math.PI - turn) * 180) / Math.PI;
}

/**
 * Is this character ticked? Spec 0004, AC-13.
 *
 * Its centre lies inside a target quad on its page, and it sits on that
 * target's line: its line within `LINE_ANGLE_TOLERANCE` of the quad's direction,
 * and its own quad between `LINE_HEIGHT_MIN` and `LINE_HEIGHT_MAX` times the
 * target quad's height. A glyph that only crosses a target, such as a watermark
 * letter, is therefore recorded, and removing it is reported.
 */
export function isTicked(character: Character, areas: readonly TargetArea[]): boolean {
  const centre = quadCentre(character.quad);
  const height = quadHeight(character.quad);

  return areas.some(
    (area) =>
      containsPoint(area.quad, centre) &&
      angleBetween(character.angle, area.angle) <= LINE_ANGLE_TOLERANCE &&
      height >= LINE_HEIGHT_MIN * area.height &&
      height <= LINE_HEIGHT_MAX * area.height,
  );
}

/**
 * Record a page before any page is redacted: in each extraction mode, every
 * character that is not whitespace and not ticked.
 */
export function recordPage(page: PDFPage, areas: readonly TargetArea[]): PageRecord {
  return EXTRACTION_OPTIONS.map((options) => {
    const origins: number[] = [];
    const codes: number[] = [];

    walkCharacters(page, options, (character) => {
      if (isWhitespace(character.code) || isTicked(character, areas)) return;
      origins.push(character.origin[0], character.origin[1]);
      codes.push(character.code);
    });

    return { origins: Float64Array.from(origins), codes: Uint32Array.from(codes) };
  });
}

/**
 * Compare a page of the output with its record, in each extraction mode.
 *
 * `lineBoxes` are where black boxes were drawn on this page. Any character
 * centred inside one, ticked or not, is `hidden` (INV-10): a surviving match
 * hidden only by its box, or unticked text the box covers.
 */
export function comparePage(
  page: PDFPage,
  record: PageRecord,
  lineBoxes: readonly Quad[],
): readonly PageDifference[] {
  return EXTRACTION_OPTIONS.map((options, mode) =>
    compareMode(page, options, record[mode], lineBoxes),
  );
}

function compareMode(
  page: PDFPage,
  options: string,
  list: CharacterList,
  lineBoxes: readonly Quad[],
): PageDifference {
  const index = gridIndex(list);
  // Each record entry matches once, so a glyph drawn twice in the same place
  // (fake bold) is counted as two.
  const used = new Uint8Array(list.codes.length);
  let extra = false;
  let hidden = false;

  walkCharacters(page, options, (character) => {
    if (isWhitespace(character.code)) return;

    const centre = quadCentre(character.quad);
    if (lineBoxes.some((box) => containsPoint(box, centre))) hidden = true;

    const found = findUnused(index, list, used, character);
    if (found < 0) extra = true;
    else used[found] = 1;
  });

  return { extra, missing: used.includes(0), hidden };
}

/** The cell a position falls in, one `POSITION_TOLERANCE` square per cell. */
function cellOf(x: number, y: number): readonly [number, number] {
  return [Math.floor(x / POSITION_TOLERANCE), Math.floor(y / POSITION_TOLERANCE)];
}

/** Record entries by cell, so a lookup probes nine cells rather than the page. */
function gridIndex(list: CharacterList): ReadonlyMap<string, readonly number[]> {
  const cells = new Map<string, number[]>();

  for (let entry = 0; entry < list.codes.length; entry += 1) {
    const [cx, cy] = cellOf(list.origins[entry * 2], list.origins[entry * 2 + 1]);
    const key = `${cx},${cy}`;
    const bucket = cells.get(key);
    if (bucket) bucket.push(entry);
    else cells.set(key, [entry]);
  }
  return cells;
}

/**
 * An unused record entry with the same code point and both coordinates within
 * `POSITION_TOLERANCE`, found in the 3 by 3 cells around the character, or -1.
 */
function findUnused(
  index: ReadonlyMap<string, readonly number[]>,
  list: CharacterList,
  used: Uint8Array,
  character: Character,
): number {
  const [x, y] = character.origin;
  const [cx, cy] = cellOf(x, y);

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (const entry of index.get(`${cx + dx},${cy + dy}`) ?? []) {
        if (
          used[entry] === 0 &&
          list.codes[entry] === character.code &&
          Math.abs(list.origins[entry * 2] - x) <= POSITION_TOLERANCE &&
          Math.abs(list.origins[entry * 2 + 1] - y) <= POSITION_TOLERANCE
        ) {
          return entry;
        }
      }
    }
  }
  return -1;
}
