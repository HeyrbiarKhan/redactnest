import type { PDFPage, StructuredText } from "mupdf";

import { EngineFailure } from "./failure";
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
 * The two ways a page is read as the visitor sees it: by detection (spec 0005,
 * which reads both), by target validation (AC-27), and by the Vitest target
 * helper.
 *
 * The first is MuPDF's defaults, which is what `page.search()` uses, so
 * character quads and target quads are built alike. The second ignores
 * replacement text (`/ActualText`), so a glyph that survived under replacement
 * text is told apart from replacement text that survived (AC-25).
 *
 * Never `dehyphenate`, `collect-styles`, `segment`, `accurate-bboxes` or `clip`
 * set here: each changes which characters exist or where their quads sit.
 * MuPDF 1.28.1's defaults already clip to the page (measured), which is right
 * for detection, since a visitor reviews only what the page shows. The self
 * check must not be blind there, so it reads `CHECK_EXTRACTION_OPTIONS`.
 */
export const EXTRACTION_OPTIONS = Object.freeze(["", "ignore-actualtext"] as const);

/**
 * The two ways every page is extracted for the record and the self check:
 * each entry of `EXTRACTION_OPTIONS`, in the same order, without clipping to
 * the page. Spec 0004, AC-13 and INV-12.
 *
 * MuPDF's content filter can move a line it rewrites off the page instead of
 * removing it (lines shown with `'` or `"`). Clipped, the check would see a
 * ticked glyph moved there as gone and pass a file that still holds it.
 * Unclipped, a glyph drawn anywhere in the page's content is a survivor,
 * wherever it lands.
 */
export const CHECK_EXTRACTION_OPTIONS = Object.freeze([
  "clip=no",
  "ignore-actualtext,clip=no",
] as const);

/** One character as the page reports it. */
export interface Character {
  /** The whole code point, above U+FFFF included (spec 0005, AC-26). */
  readonly code: number;
  readonly origin: readonly [number, number];
  readonly quad: Quad;
  /** The direction its line runs, in radians. */
  readonly angle: number;
  /**
   * The same direction as the unit vector MuPDF gives at `beginLine`. Detection
   * measures along it to find a match's two ends on each line (spec 0005).
   */
  readonly direction: readonly [number, number];
  /** Its text block, counted from 0 across the page in extraction order. */
  readonly block: number;
  /** Its line, counted the same way, so two characters share a line exactly when this is equal. */
  readonly line: number;
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

/**
 * A page's record, one list per entry of `CHECK_EXTRACTION_OPTIONS`, so it
 * holds glyphs drawn off the page as well as on it.
 */
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
 *
 * The one character reader (spec 0005, INV-12): detection, target validation,
 * the character record and the self check all read a page through here, so
 * they can never disagree about what a character is.
 *
 * It returns every code point whole. MuPDF.js 1.28.1's walker builds each
 * character with `String.fromCharCode`, which keeps only the low 16 bits of a
 * code point above U+FFFF (measured: U+1D400 comes back as U+D400, a different
 * letter, and U+2D800 as U+D800, a lone surrogate), while `asText()` and
 * `asJSON()` give whole code points. So when a read's text holds a code point
 * above U+FFFF, each text line's `text` is taken from `asJSON()` and its code
 * points are put in place of the walked characters, one for one (AC-26). A
 * page with none skips the JSON, so the common case costs one `asText()`.
 *
 * The repair fails closed: when a line's code point count differs from its
 * walked characters, or a walked character is not its code point's low 16
 * bits, this throws `EngineFailure("unsupported")`. That is `unsupported` in
 * detection, validation and the record, and the self check turns any throw
 * into `redaction-incomplete`. Once MuPDF.js walks whole code points, the pin
 * in `tests/unit/detection.test.ts` fails and this repair can go.
 */
export function walkCharacters(
  page: PDFPage,
  options: string,
  visit: (character: Character) => void,
): void {
  const stext = page.toStructuredText(options);
  let angle = 0;
  let direction: readonly [number, number] = [1, 0];
  let block = -1;
  let line = -1;
  let onLine = 0;

  try {
    const whole = wholeCodePoints(stext);

    stext.walk({
      beginTextBlock() {
        block += 1;
      },
      beginLine(_bbox, _wmode, lineDirection) {
        line += 1;
        onLine = 0;
        direction = [lineDirection[0], lineDirection[1]];
        angle = Math.atan2(lineDirection[1], lineDirection[0]);
      },
      onChar(text, origin, _font, _size, quad) {
        let code = text.codePointAt(0) ?? 0;
        if (whole) {
          const repaired = whole[line]?.[onLine];
          if (repaired === undefined || (repaired & 0xffff) !== code) {
            throw new EngineFailure("unsupported");
          }
          code = repaired;
        }
        onLine += 1;

        visit({
          code,
          origin: [origin[0], origin[1]],
          quad,
          angle,
          direction,
          block,
          line,
        });
      },
      endLine() {
        if (whole && onLine !== whole[line]?.length)
          throw new EngineFailure("unsupported");
      },
    });

    if (whole && line + 1 !== whole.length) throw new EngineFailure("unsupported");
  } finally {
    stext.destroy();
  }
}

/** A code point above U+FFFF, which the walker cannot return whole. */
const ABOVE_BMP = /[\u{10000}-\u{10FFFF}]/u;

/**
 * Each text line's code points, from `asJSON()`, or `null` when the page holds
 * no code point the walker would cut.
 */
function wholeCodePoints(stext: StructuredText): readonly (readonly number[])[] | null {
  if (!ABOVE_BMP.test(stext.asText())) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(stext.asJSON());
  } catch {
    throw new EngineFailure("unsupported");
  }
  return textLines(parsed);
}

/**
 * The `text` of every line of every text block, narrowed from the JSON MuPDF
 * printed. Anything not shaped as expected fails closed.
 */
function textLines(json: unknown): readonly (readonly number[])[] {
  const blocks = field(json, "blocks");
  if (!Array.isArray(blocks)) throw new EngineFailure("unsupported");

  return blocks.flatMap((block: unknown) => {
    if (field(block, "type") !== "text") return [];
    const lines = field(block, "lines");
    if (!Array.isArray(lines)) throw new EngineFailure("unsupported");

    return lines.map((line: unknown) => {
      const text = field(line, "text");
      if (typeof text !== "string") throw new EngineFailure("unsupported");
      return Array.from(text, (point) => point.codePointAt(0) ?? 0);
    });
  });
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined;
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
  return CHECK_EXTRACTION_OPTIONS.map((options) => {
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
  return CHECK_EXTRACTION_OPTIONS.map((options, mode) =>
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

/**
 * Values kept by a page space point, found again within
 * `POSITION_TOLERANCE` on each axis: one tolerance square per cell, so a
 * lookup probes the nine cells around a point. The key packs both cells into
 * one number, which a `Map` looks up faster than a string.
 */
export function originIndex<T>(): {
  add(origin: readonly [number, number], value: T): void;
  find(origin: readonly [number, number]): T | null;
} {
  const cells = new Map<number, { origin: readonly [number, number]; value: T }[]>();
  const cell = (value: number) => Math.floor(value / POSITION_TOLERANCE);
  // Cells from about -2^21 to 2^21 on each axis keep the key exact; a point
  // further out shares a key with another, which costs a comparison, never a
  // wrong match, since every candidate's own coordinates are compared.
  const key = (cx: number, cy: number) =>
    (cx + CELL_OFFSET) * CELL_STRIDE + (cy + CELL_OFFSET);

  return {
    add(origin, value) {
      const at = key(cell(origin[0]), cell(origin[1]));
      const bucket = cells.get(at);
      if (bucket) bucket.push({ origin, value });
      else cells.set(at, [{ origin, value }]);
    },
    find([x, y]) {
      const cx = cell(x);
      const cy = cell(y);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const entry of cells.get(key(cx + dx, cy + dy)) ?? []) {
            if (
              Math.abs(entry.origin[0] - x) <= POSITION_TOLERANCE &&
              Math.abs(entry.origin[1] - y) <= POSITION_TOLERANCE
            ) {
              return entry.value;
            }
          }
        }
      }
      return null;
    },
  };
}

const CELL_OFFSET = 2 ** 21;
const CELL_STRIDE = 2 ** 22;

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
