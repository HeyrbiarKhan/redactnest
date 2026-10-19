import type { PDFDocument, PDFPage } from "mupdf";

import { detect, readsJoinAsNothing, type Span } from "@/detect";
import type { BlockedReason, Concealment } from "@/worker/protocol";

import {
  EXTRACTION_OPTIONS,
  OFF_LINE_MIN_LINE_GLYPHS,
  OFF_LINE_SHIFT_MIN,
  OFF_LINE_SIZE_MAX,
  OFF_LINE_STRETCH_MAX,
  originIndex,
  SUPERSCRIPT_CODE_POINTS,
  walkCharacters,
  type Character,
} from "./characters";
import { checkpoint, EngineFailure } from "./failure";
import {
  containsPoint,
  isSoundQuad,
  quadBounds,
  quadCentre,
  quadHeight,
} from "./geometry";
import { imageReachVerdicts } from "./pixels";
import { slantedTargets, unsoundTargetsIn } from "./targets";
import type {
  ConcealedGlyph,
  FindOptions,
  FoundMatch,
  PageInspection,
  Quad,
  RedactionTarget,
} from "./types";

/**
 * The find step. Spec 0005, *The find step*.
 *
 * Reads each prepared review page's characters through the one character
 * reader, builds the page's text as detection sees it, hands each text block to
 * `@/detect`, and turns every span back into the characters it came from:
 * their quads, one per line, with the same geometry `page.search()` gives, and
 * their raw code points as the target's `text`. A match the engine would refuse
 * is still listed, blocked, with no target (AC-8, INV-2).
 *
 * A short stretch of glyphs off its line and glued to the text, such as a
 * footnote marker, is not part of the text a detector reads, a target's text
 * or a target quad (spec 0014, INV-3), so no detector meets a real raised
 * marker and no ticked row holds one, which the self check would refuse.
 *
 * Nothing here calls `search()` (INV-11), so MuPDF.js's 500 quad cap on search
 * can never drop a match (AC-25). Document text lives in here for the length
 * of one page and is never logged, stored or sent (INV-5).
 */

/** A text block's place in the page text, and where its lines were joined. */
interface BlockText {
  readonly start: number;
  readonly end: number;
  /** Join space positions, relative to the block's start. */
  readonly joins: readonly number[];
}

/**
 * One page as detection reads it. `points` is the page text, one code point
 * per entry, each character NFKC normalised on its own. `source` maps every
 * position back to the character it came from, or to -1 for a synthetic space.
 * `left` marks, over `characters`, each one of an off line stretch that left
 * the text (spec 0014, AC-4), whitespace inside the stretch included, so a
 * span's quads can be parted round it (AC-7).
 */
interface PageText {
  readonly characters: readonly Character[];
  readonly points: readonly string[];
  readonly source: Int32Array;
  readonly blocks: readonly BlockText[];
  readonly left: Uint8Array;
}

/** A match before the checks decide whether it can be ticked. */
interface Candidate {
  readonly span: Span;
  readonly text: string;
  /** The characters it covers, in extraction order, each once. */
  readonly characters: readonly Character[];
  readonly target: RedactionTarget;
}

const WHITESPACE = /^\s$/u;

/**
 * Every match on every page that holds a readable character, by page, then in
 * reading order (AC-3). Any other page is not read at all (AC-12, as spec
 * 0006 rewords it), so a scanned page's stamp is still searched and a blank
 * page costs nothing.
 */
export async function findMatchesIn(
  doc: PDFDocument,
  pages: readonly Pick<PageInspection, "readable" | "concealed">[],
  options: FindOptions,
): Promise<readonly FoundMatch[]> {
  const found: FoundMatch[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    if (!pages[index].readable) continue;
    found.push(...(await findOnPage(doc, index, options, pages[index].concealed)));
  }
  return found;
}

/**
 * How a match is kept from view, from the page's concealed glyphs. Spec 0006,
 * AC-13: a character of the match whose origin lies within
 * `POSITION_TOLERANCE` of a covered glyph makes it covered; otherwise one near
 * a hidden glyph makes it hidden; otherwise it is in plain sight.
 */
function concealmentOf(
  concealed: readonly ConcealedGlyph[],
): (characters: readonly Character[]) => Concealment | null {
  if (concealed.length === 0) return () => null;
  const index = originIndex<Concealment>();
  // Covered first, so a lookup that meets both finds the covered one.
  for (const kind of ["covered", "hidden"] as const) {
    for (const glyph of concealed) if (glyph.kind === kind) index.add(glyph.origin, kind);
  }
  return (characters) => {
    const kinds = characters.map(({ origin }) => index.find(origin));
    if (kinds.includes("covered")) return "covered";
    return kinds.includes("hidden") ? "hidden" : null;
  };
}

/**
 * One page: three reads, the checks, and the context. Spec 0005, *The find
 * step*, steps 1 to 7.
 *
 * After each read (ordinary extraction, extraction with replacement text
 * ignored, and the image pass) it yields and asks whether to stop (AC-11), so
 * a cancel or a replacement open is noticed within one read of work. The page
 * is destroyed on every path out; each read destroys its own structured text.
 */
async function findOnPage(
  doc: PDFDocument,
  index: number,
  { contextChars, isCancelled }: FindOptions,
  concealed: readonly ConcealedGlyph[],
): Promise<readonly FoundMatch[]> {
  const concealedIn = concealmentOf(concealed);
  const page = readable(() => doc.loadPage(index));

  try {
    const ordinary = readable(() => pageText(page, EXTRACTION_OPTIONS[0]));
    await checkpoint(isCancelled);

    const ignoring = readable(() => pageText(page, EXTRACTION_OPTIONS[1]));
    await checkpoint(isCancelled);

    const found = candidatesIn(ordinary, index);
    const targets = found.map(({ target }) => target);

    // The image pass answers for every match at once, so a page with none
    // skips it.
    let overreach: readonly boolean[] = [];
    if (found.length > 0) {
      overreach = readable(() => imageReachVerdicts(page, targets));
      await checkpoint(isCancelled);
    }

    // AC-8's reasons, in its order, through the predicates target validation
    // asks (INV-3). The first that applies is the one given.
    const checks: readonly (readonly [BlockedReason, readonly boolean[]])[] = [
      ["unsound-outline", unsoundTargetsIn(ordinary.characters, targets)],
      ["replacement-text", replacedTargets(ordinary, ignoring, targets)],
      ["slanted-text", slantedTargets(targets)],
      ["image-overreach", overreach],
    ];

    const context = contextReader(ordinary.points, contextChars);
    const listed = found.map(({ span, text, target, characters }, at): FoundMatch => {
      const around = {
        page: index,
        kind: span.kind,
        text,
        ...context(target),
        concealed: concealedIn(characters),
      };
      const blocked = checks.find(([, failed]) => failed[at])?.[0] ?? null;
      return blocked === null
        ? { ...around, tickedByDefault: span.tickedByDefault, blocked, target }
        : { ...around, tickedByDefault: false, blocked, target: null };
    });

    // AC-9: glyphs hidden behind unrelated replacement text are found only
    // with it ignored. Each is listed, blocked, never skipped, unless it sits
    // where a match from ordinary extraction already does, so one place on
    // the page is one row. Listed after the page's ordinary matches, in their
    // own reading order.
    //
    // Only sound quads say where an ordinary match sits: an unsound one has no
    // inside worth asking about, so a point test against it could hide a
    // hidden match that sits somewhere else. A match found only with
    // replacement text ignored, at a place whose ordinary match has unsound
    // quads, is therefore listed too, as two blocked rows for one place. That
    // has no safety effect, since neither row can be ticked (spec 0014,
    // AC-10, the pattern detection review's Minor 1).
    const covering = targets.flatMap(({ quads }) => quads.filter(isSoundQuad));
    const hiddenContext = contextReader(ignoring.points, contextChars);
    const hidden = candidatesIn(ignoring, index)
      .filter(({ characters }) =>
        characters.every(
          (character) =>
            !covering.some((quad) => containsPoint(quad, quadCentre(character.quad))),
        ),
      )
      .map(({ span, text, target, characters }): FoundMatch => ({
        page: index,
        kind: span.kind,
        text,
        ...hiddenContext(target),
        concealed: concealedIn(characters),
        tickedByDefault: false,
        blocked: "replacement-text",
        target: null,
      }));

    return [...listed, ...hidden];
  } finally {
    page.destroy();
  }
}

/** Every span on a page, back on the page as characters, quads and a target. */
function candidatesIn(page: PageText, pageIndex: number): readonly Candidate[] {
  return page.blocks.flatMap((block) =>
    detect({
      text: page.points.slice(block.start, block.end).join(""),
      joins: block.joins,
    }).map((span) => candidate(page, pageIndex, block.start, span)),
  );
}

/**
 * Which matches does replacement text cover? Spec 0005, AC-9. One answer per
 * target, `true` for one that it does.
 *
 * The characters whose centres lie inside a match's quads, in each mode's
 * extraction order, NFKC normalised and with whitespace removed, must spell
 * the same string with replacement text ignored as in ordinary extraction.
 * When they do not, what the visitor reads there is not what the page draws
 * there, and a run would leave the drawn glyphs or the replacement text
 * behind. A target whose quads are not sound spells nothing either way; it is
 * blocked as `unsound-outline` first.
 */
function replacedTargets(
  ordinary: PageText,
  ignoring: PageText,
  targets: readonly RedactionTarget[],
): readonly boolean[] {
  const inOrdinary = spelledInside(ordinary.characters, targets);
  const inIgnoring = spelledInside(ignoring.characters, targets);
  return targets.map((_, at) => inOrdinary[at] !== inIgnoring[at]);
}

function spelledInside(
  characters: readonly Character[],
  targets: readonly RedactionTarget[],
): readonly string[] {
  const areas = targets.map(({ quads }) => {
    const sound = quads.filter(isSoundQuad);
    const bounds = sound.map(quadBounds);
    return {
      quads: sound,
      x0: Math.min(...bounds.map((each) => each[0])),
      y0: Math.min(...bounds.map((each) => each[1])),
      x1: Math.max(...bounds.map((each) => each[2])),
      y1: Math.max(...bounds.map((each) => each[3])),
    };
  });
  const spelled = targets.map(() => [] as string[]);

  for (const character of characters) {
    const centre = quadCentre(character.quad);
    areas.forEach((area, at) => {
      if (
        centre[0] >= area.x0 &&
        centre[0] <= area.x1 &&
        centre[1] >= area.y0 &&
        centre[1] <= area.y1 &&
        area.quads.some((quad) => containsPoint(quad, centre))
      ) {
        spelled[at].push(...normalise(character.code));
      }
    });
  }
  return spelled.map((points) => points.join("").replace(/\s/gu, ""));
}

/**
 * Run a read of a page that holds a readable character. A throw from MuPDF on
 * the way fails the open with `unsupported` (AC-12): a page with text that
 * cannot be read cannot be reviewed, and reviewing the rest would pass it over
 * in silence.
 */
function readable<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new EngineFailure("unsupported");
  }
}

/**
 * Read a page and build its text. Spec 0005, *The find step*, steps 1 and 1b.
 *
 * Each text block's characters in order, the lines inside a block joined by
 * one synthetic space and blocks joined the same way, with no space added
 * where either side is already whitespace. Image blocks carry no characters,
 * so the reader never visits them.
 *
 * Step 1b (spec 0014, AC-4 and AC-5): each short off line stretch glued to
 * the text, such as a footnote marker or an ordinal's raised letters, leaves
 * it, and one synthetic space stands in its place, not listed in `joins`, so
 * the email rejoin never reads it as a line break. None stands where either
 * side is already whitespace, or where the stretch opens or closes its line
 * and the line join stands instead. That is the one reading under which
 * `27ᵗʰ September 2026` reads `27 September 2026` and `1980¹on` reads
 * `1980 on`: dropped with no space the next word would glue on, and kept as
 * text the marker glues to the value. The stretch only takes positions out,
 * never adds a character or widens what a span can cover (INV-4).
 */
function pageText(page: PDFPage, options: string): PageText {
  const characters: Character[] = [];
  walkCharacters(page, options, (character) => characters.push(character));
  const { left, spaced } = leavingStretches(characters, offLineGlyphs(characters));

  const points: string[] = [];
  const source: number[] = [];
  const blocks: BlockText[] = [];
  let block: { start: number; joins: number[] } | null = null;
  // The block and line of the last character written, which a stretch that
  // left can stand between.
  let blockOf = -1;
  let line = -1;
  let spaceDue = false;

  const joinable = (next: string | undefined) =>
    points.length > 0 &&
    !WHITESPACE.test(points[points.length - 1]) &&
    next !== undefined &&
    !WHITESPACE.test(next);
  const space = () => {
    points.push(" ");
    source.push(-1);
  };

  for (let index = 0; index < characters.length; index += 1) {
    if (left[index] === 1) {
      spaceDue ||= spaced[index] === 1;
      continue;
    }
    const character = characters[index];
    const normalised = normalise(character.code);

    if (block === null || character.block !== blockOf) {
      if (block !== null) blocks.push({ ...block, end: points.length });
      if (joinable(normalised[0])) space();
      block = { start: points.length, joins: [] };
    } else if (character.line !== line) {
      if (joinable(normalised[0])) {
        block.joins.push(points.length - block.start);
        space();
      }
    } else if (spaceDue && joinable(normalised[0])) {
      // A stretch that neither opens nor closes its line, so the character
      // after it is on the same line.
      space();
    }
    spaceDue = false;
    blockOf = character.block;
    line = character.line;

    for (const point of normalised) {
      points.push(point);
      source.push(index);
    }
  }
  if (block !== null) blocks.push({ ...block, end: points.length });

  return { characters, points, source: Int32Array.from(source), blocks, left };
}

/**
 * Which of a page's characters are off their line, 1 for each. Spec 0014,
 * AC-4 and AC-5.
 *
 * Judged per MuPDF line, never across one, so a marker MuPDF puts on a line of
 * its own is never off that line. On each line the solid glyphs are its non
 * whitespace characters; whitespace is never off. The dominant height is the
 * upper median of their quad heights, and the dominant baseline the upper
 * median, over the glyphs taller than `OFF_LINE_SIZE_MAX` of it, of each
 * origin's offset along the line's normal. A glyph is off when it is no taller
 * than that cap and its origin sits at least `OFF_LINE_SHIFT_MIN` of the
 * dominant height off the baseline, with at least `OFF_LINE_MIN_LINE_GLYPHS`
 * tall glyphs to set it; or, whatever its geometry, when its code point is in
 * `SUPERSCRIPT_CODE_POINTS`. Each line's glyphs are read twice, once for the
 * medians and once to judge, after a sort of each line's own values.
 */
export function offLineGlyphs(characters: readonly Character[]): Uint8Array {
  const off = new Uint8Array(characters.length);
  for (let first = 0; first < characters.length;) {
    let end = first + 1;
    while (end < characters.length && characters[end].line === characters[first].line) {
      end += 1;
    }
    markLine(characters, first, end, off);
    first = end;
  }
  return off;
}

/** AC-4 and AC-5 on the line held by `characters` from `first` to `end`. */
function markLine(
  characters: readonly Character[],
  first: number,
  end: number,
  off: Uint8Array,
): void {
  const solid: number[] = [];
  for (let index = first; index < end; index += 1) {
    if (!isSpace(characters[index].code)) solid.push(index);
  }
  if (solid.length === 0) return;

  // The normal to the line, so a shift is measured the same way on a turned
  // line as on a level one.
  const [dx, dy] = characters[first].direction;
  const offset = (character: Character) =>
    -character.origin[0] * dy + character.origin[1] * dx;

  const heights = solid.map((index) => quadHeight(characters[index].quad));
  const dominant = upperMedian(heights);
  const cap = OFF_LINE_SIZE_MAX * dominant;
  const tall = solid.filter((_, at) => heights[at] > cap);
  const byGeometry = tall.length >= OFF_LINE_MIN_LINE_GLYPHS;
  const baseline = byGeometry
    ? upperMedian(tall.map((index) => offset(characters[index])))
    : 0;

  solid.forEach((index, at) => {
    const character = characters[index];
    const shifted =
      byGeometry &&
      heights[at] <= cap &&
      Math.abs(offset(character) - baseline) >= OFF_LINE_SHIFT_MIN * dominant;
    if (shifted || SUPERSCRIPT_CODE_POINTS.has(character.code)) off[index] = 1;
  });
}

/** The value at the middle of `values` once sorted, the upper one of two. */
function upperMedian(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Whitespace as the page writes it, which is never off its line. */
function isSpace(code: number): boolean {
  return WHITESPACE.test(rawText(code));
}

/**
 * Which characters leave the page text, and where a synthetic space stands.
 * Spec 0014, AC-4.
 *
 * A run is a maximal stretch of off line glyphs on one line, whitespace
 * between them allowed. It leaves when it holds at most `OFF_LINE_STRETCH_MAX`
 * of them and touches a kept glyph on at least one side with no whitespace
 * between; every other run stays as ordinary text, so a spaced value or an
 * isolated word drawn small and shifted is never dropped from detection
 * (INV-4). A run is maximal, so a glyph beside it on its line is either
 * whitespace or a kept glyph. `spaced` marks the first character of a run that
 * leaves with a character on its line on both sides; whether a space then
 * stands is decided as the text is written.
 */
function leavingStretches(
  characters: readonly Character[],
  off: Uint8Array,
): { readonly left: Uint8Array; readonly spaced: Uint8Array } {
  const left = new Uint8Array(characters.length);
  const spaced = new Uint8Array(characters.length);
  const onLine = (at: number, line: number) =>
    at >= 0 && at < characters.length && characters[at].line === line;

  for (let first = 0; first < characters.length;) {
    if (off[first] === 0) {
      first += 1;
      continue;
    }
    const { line } = characters[first];
    let last = first;
    let glyphs = 1;
    for (let at = first + 1; onLine(at, line); at += 1) {
      if (off[at] === 1) {
        last = at;
        glyphs += 1;
      } else if (!isSpace(characters[at].code)) {
        break;
      }
    }

    const before = onLine(first - 1, line);
    const after = onLine(last + 1, line);
    const glued =
      (before && !isSpace(characters[first - 1].code)) ||
      (after && !isSpace(characters[last + 1].code));
    if (glyphs <= OFF_LINE_STRETCH_MAX && glued) {
      left.fill(1, first, last + 1);
      if (before && after) spaced[first] = 1;
    }
    first = last + 1;
  }
  return { left, spaced };
}

/**
 * One character as detection reads it: NFKC normalised on its own, so `ﬁ`
 * reads as `fi` and a fullwidth `＠` as `@`, one position per code point. A
 * lone surrogate, or anything that is not a code point at all, reads as
 * U+FFFD, so two lone halves can never fuse into one character when the text
 * is joined.
 */
function normalise(code: number): readonly string[] {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return ["�"];
  if (code >= 0xd800 && code <= 0xdfff) return ["�"];
  return Array.from(String.fromCodePoint(code).normalize("NFKC"));
}

/** The raw text of a character, as the target and validation compare it. */
function rawText(code: number): string {
  return Number.isInteger(code) && code >= 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : "�";
}

/**
 * A span, back on the page. Spec 0005, *The find step*, step 3.
 *
 * The display `text` is the NFKC page text between the span's offsets; the
 * target's `text` is the raw code points of the characters it covers, which is
 * what validation compares (spec 0004, AC-27). A line join is one space in
 * both, or nothing where the detector read it as nothing (AC-4).
 */
function candidate(
  page: PageText,
  pageIndex: number,
  blockStart: number,
  span: Span,
): Candidate {
  const start = blockStart + span.start;
  const end = blockStart + span.end;
  const joinAsNothing = readsJoinAsNothing(span.kind);

  let text = "";
  let raw = "";
  const covered: number[] = [];

  for (let at = start; at < end; at += 1) {
    const from = page.source[at];
    if (from < 0) {
      if (!joinAsNothing) {
        text += " ";
        raw += " ";
      }
      continue;
    }
    text += page.points[at];
    // One character can give several positions (`ﬁ` gives two), and counts once.
    if (covered[covered.length - 1] !== from) {
      covered.push(from);
      raw += rawText(page.characters[from].code);
    }
  }

  const characters = covered.map((from) => page.characters[from]);
  return {
    span,
    text,
    characters,
    target: {
      page: pageIndex,
      quads: lineQuads(page, covered),
      start,
      end,
      kind: span.kind,
      text: raw,
    },
  };
}

/**
 * One quad per run of the match's characters on each line. Spec 0005, *Quads
 * built from characters*, as spec 0014, AC-7 parts it.
 *
 * `covered` is the match's characters, as indices into `page.characters` in
 * extraction order, where each line's characters are consecutive. A run ends
 * where the line changes or where an off line stretch that left the text lies
 * between two of them, so no quad holds a marker or an ordinal's raised
 * letters: a line quad over `27ᵗʰ September 2026` would hold the raised `th`,
 * and target validation would block the row as unsound. With no stretch
 * inside it, a match has one quad per line, as before.
 *
 * In each run, every character is measured along the line's direction by its
 * quad's centre. The one furthest back gives the quad's upper left and lower
 * left corners, the one furthest forward its upper right and lower right. On
 * left to right text that is the first character's left corners and the last
 * one's right corners, which is how `page.search()` builds its own (AC-7); on
 * text drawn against its extraction order it still covers the match.
 */
function lineQuads(page: PageText, covered: readonly number[]): readonly Quad[] {
  const runs: Character[][] = [];
  covered.forEach((from, at) => {
    const character = page.characters[from];
    const previous = covered[at - 1];
    const joins =
      previous !== undefined &&
      page.characters[previous].line === character.line &&
      !page.left.subarray(previous + 1, from).includes(1);
    if (joins) runs[runs.length - 1].push(character);
    else runs.push([character]);
  });

  return runs.map((onLine) => {
    const [dx, dy] = onLine[0].direction;
    const along = (character: Character) => {
      const [x, y] = quadCentre(character.quad);
      return x * dx + y * dy;
    };

    let back = onLine[0];
    let front = onLine[0];
    for (const character of onLine) {
      if (along(character) < along(back)) back = character;
      if (along(character) > along(front)) front = character;
    }

    const [ulx, uly, , , llx, lly] = back.quad;
    const [, , urx, ury, , , lrx, lry] = front.quad;
    return [ulx, uly, urx, ury, llx, lly, lrx, lry];
  });
}

/** A match's context, and whether each side stopped short of the page's edge. */
interface Context {
  readonly before: string;
  readonly after: string;
  readonly beforeCut: boolean;
  readonly afterCut: boolean;
}

/**
 * Cut `before` and `after` from the page text. Spec 0005, AC-5 and INV-6.
 *
 * Up to `contextChars` code points either side, from this page only, with
 * runs of whitespace collapsed to one space. The page is collapsed once, with
 * an index from each position into the collapsed text, so each match costs
 * its context and not the page.
 *
 * Spec 0007, AC-9: each side also says whether the page text went on past
 * it, so the row shows "…" only where something was really left out. Two
 * booleans per match, the only new thing to cross the boundary (AC-26).
 */
function contextReader(
  points: readonly string[],
  contextChars: number,
): (target: Pick<RedactionTarget, "start" | "end">) => Context {
  const collapsed: string[] = [];
  const at = new Uint32Array(points.length + 1);

  points.forEach((point, index) => {
    at[index] = collapsed.length;
    const space = WHITESPACE.test(point);
    if (space && collapsed[collapsed.length - 1] === " ") return;
    collapsed.push(space ? " " : point);
  });
  at[points.length] = collapsed.length;

  const reach = Math.max(0, Math.floor(contextChars));
  return ({ start, end }) => ({
    before: collapsed.slice(Math.max(0, at[start] - reach), at[start]).join(""),
    after: collapsed.slice(at[end], at[end] + reach).join(""),
    beforeCut: at[start] - reach > 0,
    afterCut: at[end] + reach < collapsed.length,
  });
}
