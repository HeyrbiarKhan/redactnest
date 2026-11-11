/**
 * Custom terms. Spec 0017, *Matching rules*, AC-7 to AC-13, AC-32 and AC-33.
 *
 * Pure, like every detector here (spec 0005, INV-5): one page's whole text and
 * the batch's terms in, spans out. No page, no config, no storage and no
 * console. A term is the visitor's own words and the page text is document
 * text; both live here for one call.
 *
 * The page is folded once per call, one code point at a time, with a map back
 * to the page (`streamOf`), and read in up to three ways, each a plain list of
 * folded code points:
 *
 *  - the exact reading (AC-8), with a run of whitespace or a break as one
 *    space and each hyphen right before a line break read as nothing with the
 *    break (`Smith-` then `son` for `Smithson`);
 *  - the same with each such hyphen kept and the break read as nothing
 *    (`Smith-son`), for a term that holds a hyphen;
 *  - the spaced reading (AC-11), with every separator left out.
 *
 * Each term is matched against each reading with a bit parallel matcher
 * (Shift-And): one step per code point over the term's length in 32 bit
 * words, so linear in the page for each term, with no backtracking and no
 * `RegExp` built from a term (AC-29, INV-5). Every code point of the term
 * meets exactly one of the reading's, so a match starts its term's length
 * before where it ends, found in one step.
 *
 * A recorded limit of reading each hyphen's two ways as two readings: one
 * match that needs one line end hyphen read as nothing and another read as a
 * hyphen is not read exactly. Its letters still meet in the spaced reading,
 * so it is listed unticked, never missed.
 *
 * Each place is then judged at its two edges (AC-8, AC-10), its marks
 * compared outside Latin, Greek and Cyrillic (AC-32), and the matches chosen
 * (AC-12). Only an exact whole word match with no note is ticked (INV-4).
 */

import { clusterMarks, foldPoint } from "@/lib/term-text";
import type { TermId, TermNote, TermQuery } from "@/worker/protocol";

/**
 * One page as the terms read it. Spec 0017, *API surface*.
 *
 * `text` is the whole page text the find step builds, each character NFKC
 * normalised on its own, its blocks joined by breaks, and prefixed with the
 * tail carried from the page before (AC-33). Offsets are code points.
 */
export interface TermInput {
  readonly text: string;
  /**
   * Every synthetic space that stands for a line, block or page break. A
   * space an off line stretch left (spec 0014, AC-4) is in neither list and
   * reads as an ordinary space.
   */
  readonly breaks: readonly number[];
  /** The line and page breaks among them, where the hyphen readings apply. */
  readonly lineBreaks: readonly number[];
  /**
   * Where this page begins, after the tail carried from the page before and
   * the page break standing for it; 0 when nothing is carried.
   */
  readonly pageStart: number;
}

/**
 * One place a term was found. Never crosses the worker boundary: the find
 * step turns it into a candidate, or two where it crosses `pageStart`.
 */
export interface TermSpan {
  readonly term: TermId;
  /** Code point offsets into `TermInput.text`, end exclusive. */
  readonly start: number;
  readonly end: number;
  /** In `TERM_NOTES` order. Empty only for an exact whole word match. */
  readonly notes: readonly TermNote[];
}

/* What a page character is, looked up once. */

// Each pattern below matches exactly one code point, anchored at both ends
// with no quantifier, so none can backtrack (spec 0005, INV-7).

const LETTER = /^\p{L}$/u;
const DIGIT = /^\p{N}$/u;
const LOWER = /^\p{Ll}$/u;
const UPPER_OR_TITLE = /^[\p{Lu}\p{Lt}]$/u;
const MARK = /^\p{M}$/u;

/**
 * Scripts written without spaces between words (AC-10, c): a glued edge there
 * is as likely a word break as not, so a match is listed, unticked.
 */
const NO_SPACE_SCRIPT =
  /^[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]$/u;

/** Marks on these scripts' letters are folded away for every match (AC-32). */
const SILENT_MARK_SCRIPT = /^[\p{sc=Latin}\p{sc=Greek}\p{sc=Cyrillic}]$/u;

/** A character's classes, as bits, with `KNOWN` once they are read. */
const KNOWN = 1;
const IS_LETTER = 2;
const IS_DIGIT = 4;
const IS_LOWER = 8;
const IS_UPPER = 16;
const NO_SPACE = 32;
const IS_MARK = 64;
const READS_AS_NOTHING = 128;
const MARKS_COUNT = 256;

function classesOf(point: string): number {
  let classes = KNOWN;
  if (LETTER.test(point)) {
    classes |= IS_LETTER;
    if (LOWER.test(point)) classes |= IS_LOWER;
    else if (UPPER_OR_TITLE.test(point)) classes |= IS_UPPER;
    if (!SILENT_MARK_SCRIPT.test(point)) classes |= MARKS_COUNT;
  } else if (DIGIT.test(point)) {
    classes |= IS_DIGIT;
  } else if (MARK.test(point)) {
    classes |= IS_MARK;
  }
  if (NO_SPACE_SCRIPT.test(point)) classes |= NO_SPACE;
  if (foldPoint(point) === "" && !(classes & IS_MARK)) classes |= READS_AS_NOTHING;
  return classes;
}

/**
 * The page's characters, each read once, when first asked about. Most never
 * are: only the edges of a place that matched.
 */
interface Page {
  readonly points: readonly string[];
  classes(at: number): number;
}

function pageOf(points: readonly string[]): Page {
  const known = new Uint16Array(points.length);
  return {
    points,
    classes(at) {
      if (known[at] === 0) known[at] = classesOf(points[at]);
      return known[at];
    },
  };
}

/* The page, folded. */

/**
 * The page, folded one code point at a time, as parallel arrays.
 *
 * Each page character gives as many elements as its fold has code points
 * (`ß` gives two, a mark or an invisible character none); a run of
 * whitespace and breaks gives one element, a space. `from` is the page
 * position each came from (a run's first). `head` and `last` mark an
 * element as the first and the last its character gave, so a match never
 * starts or ends inside one character's fold. `alt` marks a hyphen right
 * before a line break, which the exact reading reads two ways (AC-8).
 */
interface Stream {
  readonly length: number;
  readonly codes: readonly string[];
  readonly from: Int32Array;
  readonly head: Uint8Array;
  readonly last: Uint8Array;
  readonly alt: Uint8Array;
}

function streamOf(points: readonly string[], lineBreaks: ReadonlySet<number>): Stream {
  const codes: string[] = [];
  const from: number[] = [];
  const head: number[] = [];
  const last: number[] = [];
  /** For a run, its page end, so a hyphen's break can be told a run of one. */
  const runEnd: number[] = [];
  const folds = new Map<string, string>();

  for (let at = 0; at < points.length; at += 1) {
    const point = points[at];
    let folded = folds.get(point);
    if (folded === undefined) {
      folded = foldPoint(point);
      folds.set(point, folded);
    }
    if (folded === "") continue;

    if (folded === " ") {
      const previous = codes.length - 1;
      if (previous >= 0 && codes[previous] === " ") {
        runEnd[previous] = at + 1;
        continue;
      }
      codes.push(" ");
      from.push(at);
      head.push(1);
      last.push(1);
      runEnd.push(at + 1);
      continue;
    }

    let first = true;
    for (const code of folded) {
      codes.push(code);
      from.push(at);
      head.push(first ? 1 : 0);
      last.push(0);
      runEnd.push(-1);
      first = false;
    }
    last[codes.length - 1] = 1;
  }

  // A hyphen that is its character's whole fold, followed at once by a run
  // that is one line break and nothing else. Never a block break (AC-8).
  const alt = new Uint8Array(codes.length);
  for (let index = 0; index + 1 < codes.length; index += 1) {
    const next = index + 1;
    if (
      codes[index] === "-" &&
      head[index] === 1 &&
      last[index] === 1 &&
      codes[next] === " " &&
      from[next] === from[index] + 1 &&
      runEnd[next] === from[next] + 1 &&
      lineBreaks.has(from[next])
    ) {
      alt[index] = 1;
    }
  }

  return {
    length: codes.length,
    codes,
    from: Int32Array.from(from),
    head: Uint8Array.from(head),
    last: Uint8Array.from(last),
    alt,
  };
}

/**
 * One way of reading the stream: the elements it keeps, in order, as stream
 * indices, and their codes.
 */
interface Reading {
  readonly codes: readonly string[];
  readonly at: Int32Array;
}

function readingOf(stream: Stream, keeps: (index: number) => boolean): Reading {
  const codes: string[] = [];
  const at: number[] = [];
  for (let index = 0; index < stream.length; index += 1) {
    if (!keeps(index)) continue;
    codes.push(stream.codes[index]);
    at.push(index);
  }
  return { codes, at: Int32Array.from(at) };
}

/**
 * Separators, as folded code points (AC-11): whitespace and breaks (one
 * space once folded), hyphens and dashes (`-`), apostrophes (`'`) and full
 * stops. The invisible characters fold to nothing, so they never get here.
 */
function isSeparator(code: string): boolean {
  return code === " " || code === "-" || code === "'" || code === ".";
}

/* The term, folded the same way. */

interface Unit {
  readonly code: string;
  /** The term's own code point it came from, and the marks after it. */
  readonly cluster: string;
  /** The first code point its character's fold gave. */
  readonly head: boolean;
}

/**
 * A term as folded units, through the same `foldPoint` as the page, with each
 * run of whitespace one space and none at either end.
 */
function unitsOf(text: string): readonly Unit[] {
  const units: Unit[] = [];
  // The head unit of the last character, whose cluster takes the marks after it.
  let lastHead = -1;

  for (const point of text) {
    const folded = foldPoint(point);
    if (folded === "") {
      if (MARK.test(point) && lastHead >= 0) {
        const { code, cluster, head } = units[lastHead];
        units[lastHead] = { code, cluster: cluster + point, head };
      }
      continue;
    }
    if (folded === " ") {
      lastHead = -1;
      if (units.length > 0 && units[units.length - 1].code !== " ") {
        units.push({ code: " ", cluster: " ", head: true });
      }
      continue;
    }
    lastHead = units.length;
    let head = true;
    for (const code of folded) {
      units.push({ code, cluster: point, head });
      head = false;
    }
  }
  while (units.length > 0 && units[units.length - 1].code === " ") units.pop();
  return units;
}

/**
 * How many characters that are not separators a term holds once folded:
 * AC-33's carried tail is this long for the batch's longest term (INV-12).
 */
export function termReach(text: string): number {
  return unitsOf(text).filter(({ code }) => !isSeparator(code)).length;
}

/**
 * Where the tail carried into the next page starts (AC-33): at the
 * `reach`-th last folded code point that is not a separator, or the page's
 * start when it holds fewer. A crossing match has at most `reach - 1` of them
 * before the break, so the character before it is always in the tail.
 */
export function tailFrom(points: readonly string[], reach: number): number {
  if (reach <= 0) return points.length;
  let counted = 0;
  for (let at = points.length - 1; at >= 0; at -= 1) {
    for (const code of foldPoint(points[at])) {
      if (!isSeparator(code)) counted += 1;
    }
    if (counted >= reach) return at;
  }
  return 0;
}

/* The matcher. */

/** A Shift-And pattern: bit `i` of the state means "the first `i + 1` match here". */
interface Pattern {
  readonly length: number;
  readonly words: number;
  readonly masks: ReadonlyMap<string, Uint32Array>;
}

function compile(codes: readonly string[]): Pattern {
  const words = Math.max(1, Math.ceil(codes.length / 32));
  const masks = new Map<string, Uint32Array>();
  codes.forEach((code, index) => {
    let mask = masks.get(code);
    if (mask === undefined) {
      mask = new Uint32Array(words);
      masks.set(code, mask);
    }
    mask[index >>> 5] |= 1 << (index & 31);
  });
  return { length: codes.length, words, masks };
}

/**
 * Where the pattern ends in `codes`, in order. One step per code point: every
 * live prefix moves on by one, and a new one starts at each code point.
 */
function endsOf(codes: readonly string[], pattern: Pattern): readonly number[] {
  const { length, words, masks } = pattern;
  const ends: number[] = [];
  const finalWord = (length - 1) >>> 5;
  const finalBit = (length - 1) & 31;

  if (words === 1) {
    let state = 0;
    for (let at = 0; at < codes.length; at += 1) {
      const mask = masks.get(codes[at]);
      state = mask === undefined ? 0 : ((state << 1) | 1) & mask[0];
      if ((state >>> finalBit) & 1) ends.push(at);
    }
    return ends;
  }

  const state = new Uint32Array(words);
  for (let at = 0; at < codes.length; at += 1) {
    const mask = masks.get(codes[at]);
    if (mask === undefined) {
      state.fill(0);
      continue;
    }
    let carry = 1;
    for (let word = 0; word < words; word += 1) {
      const value = state[word];
      state[word] = ((value << 1) | carry) & mask[word];
      carry = value >>> 31;
    }
    if ((state[finalWord] >>> finalBit) & 1) ends.push(at);
  }
  return ends;
}

/* Edges. */

const GLUED = -1;
const WORD = 0;
const JOINED = 1;

/**
 * One edge of a match (AC-8, AC-10), between the character `left` and the
 * character `right`, either -1 past the page's start or end. A word edge when
 * either side is not a letter or digit; otherwise touched, and listed
 * (`joined`) only where a word break was likely lost: a case change across
 * it, a letter meeting a digit, or a script written without spaces. Read as
 * the page has them, case and marks kept.
 */
function edgeOf(page: Page, left: number, right: number): number {
  if (left < 0 || right < 0) return WORD;
  const a = page.classes(left);
  const b = page.classes(right);
  if (!(a & (IS_LETTER | IS_DIGIT)) || !(b & (IS_LETTER | IS_DIGIT))) return WORD;
  if (a & IS_LOWER && b & IS_UPPER) return JOINED;
  if ((a & IS_LETTER && b & IS_DIGIT) || (a & IS_DIGIT && b & IS_LETTER)) return JOINED;
  if ((a | b) & NO_SPACE) return JOINED;
  return GLUED;
}

/**
 * The page character nearest before `at`, past invisible characters and
 * marks (a mark belongs to the letter before it), or -1 at the start.
 */
function before(page: Page, at: number): number {
  let index = at - 1;
  while (index >= 0 && page.classes(index) & (IS_MARK | READS_AS_NOTHING)) index -= 1;
  return index;
}

/** The page character nearest at or after `at`, past invisible characters, or -1. */
function after(page: Page, at: number): number {
  let index = at;
  while (index < page.points.length && page.classes(index) & READS_AS_NOTHING) index += 1;
  return index < page.points.length ? index : -1;
}

/** The end of the character at `at`, with the combining marks after it. */
function clusterEnd(page: Page, at: number): number {
  let end = at + 1;
  while (end < page.points.length && page.classes(end) & IS_MARK) end += 1;
  return end;
}

/* One term. */

interface Candidate {
  readonly start: number;
  readonly end: number;
  readonly notes: readonly TermNote[];
  readonly crossing: boolean;
}

/** What one call reads, shared by every term of the batch. */
interface Readings {
  readonly page: Page;
  readonly stream: Stream;
  /** Each hyphen before a line break read as nothing, with its break. */
  readonly plain: Reading;
  /** Each such hyphen kept, and its break read as nothing; null with none. */
  readonly hyphened: Reading | null;
  readonly skeleton: Reading;
  /** For each stream index, the skeleton index at or before it, or -1. */
  readonly skeletonBefore: Int32Array;
  readonly pageStart: number;
  /** The edge after the character a stream element ends, shared by the batch. */
  edgeAfter(final: number): number;
  /** The edge before the character a stream element starts. */
  edgeBefore(first: number): number;
}

const UNKNOWN_EDGE = 2;

/**
 * Each stream element's edges, judged once per call and shared by every term
 * of the batch, since every term asks about the same characters' edges.
 */
function edgesOf(page: Page, stream: Stream): Pick<Readings, "edgeAfter" | "edgeBefore"> {
  const afterEdges = new Int8Array(stream.length).fill(UNKNOWN_EDGE);
  const beforeEdges = new Int8Array(stream.length).fill(UNKNOWN_EDGE);
  return {
    edgeAfter(final) {
      if (afterEdges[final] === UNKNOWN_EDGE) {
        const at = stream.from[final];
        afterEdges[final] = edgeOf(page, at, after(page, clusterEnd(page, at)));
      }
      return afterEdges[final];
    },
    edgeBefore(first) {
      if (beforeEdges[first] === UNKNOWN_EDGE) {
        const at = stream.from[first];
        beforeEdges[first] = edgeOf(page, before(page, at), at);
      }
      return beforeEdges[first];
    },
  };
}

function findTerm(read: Readings, query: TermQuery): readonly TermSpan[] {
  const { page, stream, pageStart } = read;
  const units = unitsOf(query.text);
  if (units.length === 0) return [];

  const termMarks = units
    .filter((unit) => unit.head && classesOf(firstPoint(unit.cluster)) & MARKS_COUNT)
    .map((unit) => clusterMarks(unit.cluster));
  const breakAt = pageStart - 1;

  /** The marks of the page's letters at these stream indices, as `termMarks`. */
  const pageMarks = (indices: Iterable<number>): readonly string[] => {
    const marks: string[] = [];
    for (const index of indices) {
      if (stream.head[index] !== 1) continue;
      const at = stream.from[index];
      if (page.classes(at) & MARKS_COUNT) {
        marks.push(clusterMarks(page.points.slice(at, clusterEnd(page, at)).join("")));
      }
    }
    return marks;
  };

  /**
   * A place from stream index `first` to `final`, judged: its page range and
   * its notes, or null when it lists nothing. Its end edge first, which needs
   * nothing more, so a glued place costs two lookups.
   */
  const judge = (
    first: number,
    final: number,
    spaced: boolean,
    letters: () => Iterable<number>,
  ): Candidate | null => {
    if (stream.head[first] !== 1 || stream.last[final] !== 1) return null;
    const endEdge = read.edgeAfter(final);
    if (endEdge === GLUED) return null;
    const end = clusterEnd(page, stream.from[final]);
    // Wholly in the tail the page before already read (AC-33).
    if (pageStart > 0 && end <= breakAt) return null;

    const startEdge = read.edgeBefore(first);
    if (startEdge === GLUED) return null;
    const start = stream.from[first];

    const crossing = pageStart > 0 && start < breakAt;
    // A term with no letter whose marks count finds only letters that fold
    // like its own, Latin, Greek or Cyrillic, so there is nothing to compare.
    const marksDiffer =
      termMarks.length > 0 && !sameList(termMarks, pageMarks(letters()));

    const notes: TermNote[] = [];
    if (startEdge === JOINED || endEdge === JOINED) notes.push("joined");
    if (spaced) notes.push("spaced");
    if (marksDiffer) notes.push("marks");
    if (crossing) notes.push("page-break");
    return { start, end, notes, crossing };
  };

  const candidates: Candidate[] = [];
  // The skeleton index each exact reading ends on, so the spaced reading never
  // lists a place an exact reading already read: the two then hold the same
  // letters, the term's, one for one.
  const covered = new Uint8Array(read.skeleton.at.length);

  const exactCodes = units.map(({ code }) => code);
  const exact = compile(exactCodes);
  const ways =
    read.hyphened !== null && exactCodes.includes("-")
      ? [read.plain, read.hyphened]
      : [read.plain];
  // The two ways agree wherever no hyphen before a break lies inside, so
  // with two, each place is judged once.
  const seen = ways.length > 1 ? new Set<number>() : null;
  for (const way of ways) {
    for (const last of endsOf(way.codes, exact)) {
      const first = way.at[last - exact.length + 1];
      const final = way.at[last];
      const skeletonEnd = read.skeletonBefore[final];
      if (skeletonEnd >= 0) covered[skeletonEnd] = 1;
      if (seen !== null) {
        const key = first * stream.length + final;
        if (seen.has(key)) continue;
        seen.add(key);
      }
      const judged = judge(first, final, false, () => range(first, final));
      if (judged !== null) candidates.push(judged);
    }
  }

  // The spaced reading (AC-11), over the page with every separator left out.
  const skeletonCodes = exactCodes.filter((code) => !isSeparator(code));
  if (skeletonCodes.length > 0) {
    const plain = compile(skeletonCodes);
    for (const last of endsOf(read.skeleton.codes, plain)) {
      if (covered[last] === 1) continue;
      const firstSkeleton = last - plain.length + 1;
      const judged = judge(
        read.skeleton.at[firstSkeleton],
        read.skeleton.at[last],
        true,
        () => read.skeleton.at.subarray(firstSkeleton, last + 1),
      );
      if (judged !== null) candidates.push(judged);
    }
  }

  return choose(candidates).map(({ start, end, notes }) => ({
    term: query.id,
    start,
    end,
    notes,
  }));
}

function firstPoint(text: string): string {
  return Array.from(text)[0] ?? "";
}

function* range(first: number, final: number): Iterable<number> {
  for (let index = first; index <= final; index += 1) yield index;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((each, index) => each === b[index]);
}

/**
 * The matches one term lists (AC-12): exact matches first, leftmost and not
 * overlapping; then matches with notes that overlap none of them, leftmost
 * and not overlapping, those within one page before those across a page
 * break. In page order.
 */
function choose(candidates: readonly Candidate[]): readonly Candidate[] {
  const byStart = (a: Candidate, b: Candidate) => a.start - b.start || a.end - b.end;
  const chosen: Candidate[] = [];

  const pass = (pool: readonly Candidate[]) => {
    const taken = [...chosen].sort(byStart);
    let lastEnd = -1;
    for (const candidate of [...pool].sort(byStart)) {
      if (candidate.start < lastEnd) continue;
      if (overlapsAny(taken, candidate)) continue;
      chosen.push(candidate);
      lastEnd = candidate.end;
    }
  };

  pass(candidates.filter(({ notes }) => notes.length === 0));
  pass(candidates.filter(({ notes, crossing }) => notes.length > 0 && !crossing));
  pass(candidates.filter(({ crossing }) => crossing));
  return chosen.sort(byStart);
}

/** Does `candidate` overlap any of `taken`, which are sorted and never overlap? */
function overlapsAny(taken: readonly Candidate[], candidate: Candidate): boolean {
  let low = 0;
  let high = taken.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (taken[middle].start < candidate.end) low = middle + 1;
    else high = middle;
  }
  // `taken[low - 1]` is the last one starting before the candidate ends.
  return low > 0 && taken[low - 1].end > candidate.start;
}

/**
 * Every place each term appears on one page. Spec 0017, *API surface*.
 *
 * The page is folded and read once for the whole batch (INV-8), and each term
 * read against it in turn. A span wholly in the tail carried from the page
 * before is left out, since that page listed it; one that crosses
 * `pageStart` carries the `page-break` note, and the find step parts it per
 * page (AC-33). In order of `start`, the batch's order within one place.
 */
export function findTerms(
  input: TermInput,
  terms: readonly TermQuery[],
): readonly TermSpan[] {
  if (terms.length === 0) return [];
  const points = Array.from(input.text);
  const page = pageOf(points);
  const stream = streamOf(points, new Set(input.lineBreaks));

  const hasAlt = stream.alt.includes(1);
  const plain = readingOf(
    stream,
    (index) => stream.alt[index] !== 1 && !(index > 0 && stream.alt[index - 1] === 1),
  );
  const hyphened = hasAlt
    ? readingOf(stream, (index) => !(index > 0 && stream.alt[index - 1] === 1))
    : null;
  const skeleton = readingOf(stream, (index) => !isSeparator(stream.codes[index]));

  const skeletonBefore = new Int32Array(stream.length);
  let next = 0;
  for (let index = 0; index < stream.length; index += 1) {
    while (next < skeleton.at.length && skeleton.at[next] <= index) next += 1;
    skeletonBefore[index] = next - 1;
  }

  const read: Readings = {
    page,
    stream,
    plain,
    hyphened,
    skeleton,
    skeletonBefore,
    pageStart: input.pageStart,
    ...edgesOf(page, stream),
  };
  const order = new Map(terms.map(({ id }, index) => [id, index]));
  return terms
    .flatMap((query) => findTerm(read, query))
    .sort(
      (a, b) => a.start - b.start || (order.get(a.term) ?? 0) - (order.get(b.term) ?? 0),
    );
}
