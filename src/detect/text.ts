/**
 * The text helpers every detector shares. Spec 0005, *Detectors*.
 *
 * Offsets in this folder count code points, never UTF-16 units (INV-12). Each
 * detector reads its block as `codePoints`, one string per code point, and
 * steps through that, so a letter above U+FFFF is one position like any other.
 */

/**
 * How far before a match a keyword may end and still speak for it, in code
 * points. Spec 0005, AC-10. "Tel: 020 7946 0958" and "Date of birth: 1 May
 * 1980" put the word a few characters before its value; a word further back
 * belongs to something else. Like the engine's geometry constants, this is a
 * rule about how a pattern is written, not a cap on the visitor, so it is a
 * constant here rather than config.
 */
export const KEYWORD_REACH = 32;

/** The code points of `text`, one string each. */
export function codePoints(text: string): readonly string[] {
  return Array.from(text);
}

/** A list of keywords, matched in any case as whole words. */
export interface WordList {
  readonly pattern: RegExp;
  /** The longest word, in code points, so a window can hold any of them. */
  readonly longest: number;
}

/**
 * Build a `WordList`. A whole word has no letter or digit touching either end,
 * judged by Unicode class rather than `\b`, which knows only ASCII.
 *
 * The pattern is one alternation of fixed strings with no quantifier, run over
 * a window of constant length, so it cannot backtrack beyond that window
 * (INV-7).
 */
export function wordList(words: readonly string[]): WordList {
  const alternatives = [...words]
    // Longest first, so `telephone` is tried before `tel`.
    .sort((a, b) => codePoints(b).length - codePoints(a).length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
    .join("|");

  return Object.freeze({
    pattern: new RegExp(
      `(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`,
      "giu",
    ),
    longest: Math.max(...words.map((word) => codePoints(word).length)),
  });
}

/**
 * Does a word from `words` end within `KEYWORD_REACH` code points before
 * `start`? Spec 0005, AC-10.
 *
 * Reads only the window where such a word could sit, plus one code point
 * before it so the whole word test can see what touches the word's first
 * letter. The cost is the same for every match, however long the block.
 */
export function wordBefore(
  points: readonly string[],
  start: number,
  words: WordList,
): boolean {
  const from = Math.max(0, start - KEYWORD_REACH - words.longest - 1);
  const window = points.slice(from, start).join("");

  for (const found of window.matchAll(words.pattern)) {
    const after = codePoints(window.slice(found.index + found[0].length)).length;
    if (after <= KEYWORD_REACH) return true;
  }
  return false;
}
