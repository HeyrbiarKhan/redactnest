import type { PDFDocument, PDFPage } from "mupdf";

import { detect, readsJoinAsNothing, type Span } from "@/detect";
import type { BlockedReason } from "@/worker/protocol";

import { EXTRACTION_OPTIONS, walkCharacters, type Character } from "./characters";
import { checkpoint, EngineFailure } from "./failure";
import { containsPoint, isSoundQuad, quadBounds, quadCentre } from "./geometry";
import { imageReachVerdicts } from "./pixels";
import { slantedTargets, unsoundTargetsIn } from "./targets";
import type { FindOptions, FoundMatch, Quad, RedactionTarget } from "./types";

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
 */
interface PageText {
  readonly characters: readonly Character[];
  readonly points: readonly string[];
  readonly source: Int32Array;
  readonly blocks: readonly BlockText[];
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
 * Every match on every page that reported a text layer, by page, then in
 * reading order (AC-3). A page without a text layer is not read at all
 * (AC-12).
 */
export async function findMatchesIn(
  doc: PDFDocument,
  pagesWithText: readonly boolean[],
  options: FindOptions,
): Promise<readonly FoundMatch[]> {
  const found: FoundMatch[] = [];
  for (let index = 0; index < pagesWithText.length; index += 1) {
    if (!pagesWithText[index]) continue;
    found.push(...(await findOnPage(doc, index, options)));
  }
  return found;
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
): Promise<readonly FoundMatch[]> {
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
    const listed = found.map(({ span, text, target }, at): FoundMatch => {
      const around = { page: index, kind: span.kind, text, ...context(target) };
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
    const covering = targets.flatMap(({ quads }) => quads.filter(isSoundQuad));
    const hiddenContext = contextReader(ignoring.points, contextChars);
    const hidden = candidatesIn(ignoring, index)
      .filter(({ characters }) =>
        characters.every(
          (character) =>
            !covering.some((quad) => containsPoint(quad, quadCentre(character.quad))),
        ),
      )
      .map(({ span, text, target }): FoundMatch => ({
        page: index,
        kind: span.kind,
        text,
        ...hiddenContext(target),
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
 * Run a read of a page that reported a text layer. A throw from MuPDF on the
 * way fails the open with `unsupported` (AC-12): a page with text that cannot
 * be read cannot be reviewed, and reviewing the rest would pass it over in
 * silence.
 */
function readable<T>(read: () => T): T {
  try {
    return read();
  } catch {
    throw new EngineFailure("unsupported");
  }
}

/**
 * Read a page and build its text. Spec 0005, *The find step*, step 1.
 *
 * Each text block's characters in order, the lines inside a block joined by
 * one synthetic space and blocks joined the same way, with no space added
 * where either side is already whitespace. Image blocks carry no characters,
 * so the reader never visits them.
 */
function pageText(page: PDFPage, options: string): PageText {
  const characters: Character[] = [];
  walkCharacters(page, options, (character) => characters.push(character));

  const points: string[] = [];
  const source: number[] = [];
  const blocks: BlockText[] = [];
  let block: { start: number; joins: number[] } | null = null;
  let line = -1;

  const joinable = (next: string | undefined) =>
    points.length > 0 &&
    !WHITESPACE.test(points[points.length - 1]) &&
    next !== undefined &&
    !WHITESPACE.test(next);

  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index];
    const normalised = normalise(character.code);

    if (block === null || character.block !== characters[index - 1].block) {
      if (block !== null) blocks.push({ ...block, end: points.length });
      if (joinable(normalised[0])) {
        points.push(" ");
        source.push(-1);
      }
      block = { start: points.length, joins: [] };
    } else if (character.line !== line && joinable(normalised[0])) {
      block.joins.push(points.length - block.start);
      points.push(" ");
      source.push(-1);
    }
    line = character.line;

    for (const point of normalised) {
      points.push(point);
      source.push(index);
    }
  }
  if (block !== null) blocks.push({ ...block, end: points.length });

  return { characters, points, source: Int32Array.from(source), blocks };
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
      quads: lineQuads(characters),
      start,
      end,
      kind: span.kind,
      text: raw,
    },
  };
}

/**
 * One quad per line the match touches. Spec 0005, *Quads built from
 * characters*.
 *
 * On each line, every character is measured along the line's direction by its
 * quad's centre. The one furthest back gives the line quad's upper left and
 * lower left corners, the one furthest forward its upper right and lower
 * right. On left to right text that is the first character's left corners and
 * the last one's right corners, which is how `page.search()` builds its own
 * (AC-7); on text drawn against its extraction order it still covers the
 * match.
 */
function lineQuads(characters: readonly Character[]): readonly Quad[] {
  const lines = new Map<number, Character[]>();
  for (const character of characters) {
    const onLine = lines.get(character.line);
    if (onLine) onLine.push(character);
    else lines.set(character.line, [character]);
  }

  return [...lines.values()].map((onLine) => {
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

/**
 * Cut `before` and `after` from the page text. Spec 0005, AC-5 and INV-6.
 *
 * Up to `contextChars` code points either side, from this page only, with
 * runs of whitespace collapsed to one space. The page is collapsed once, with
 * an index from each position into the collapsed text, so each match costs
 * its context and not the page.
 */
function contextReader(
  points: readonly string[],
  contextChars: number,
): (target: Pick<RedactionTarget, "start" | "end">) => { before: string; after: string } {
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
  });
}
