/**
 * Phrases no page that describes RedactNest may hold, matched as whole words
 * in any case. Shared by the security page test (spec 0018, AC-5) and the
 * search pages test (spec 0024, AC-5), so a phrase banned on one is banned on
 * both. An honest sentence one of these catches is reworded, never let
 * through: loosen neither list.
 */

/**
 * Outcome phrases that claim RedactNest finds, reads, ticks or carries on in
 * every case (spec 0018, AC-5). A limit is a "can" line instead.
 */
export const CLAIM_BANNED_PHRASES: readonly string[] = Object.freeze([
  "is found",
  "are found",
  "found whole",
  "is read",
  "are read",
  "starts ticked",
  "start ticked",
  "never stops",
]);

/**
 * The search pages' own (spec 0024, *Claim test*). A run draws a box once the
 * text is gone, so nothing says text is never covered (spec 0004's
 * Follow-up); and the self check reads what each page draws, not every object
 * in the file, so nothing says text is gone for good or removed from the file
 * (spec 0019, AC-12), and nothing claims hidden data is stripped, which lives
 * on `/security`.
 */
export const MARKETING_BANNED_PHRASES: readonly string[] = Object.freeze([
  "never covered",
  "not covered with a black box",
  "instead of a black box",
  "permanently",
  "for good",
  "is removed from the file",
  "is stripped",
]);

/**
 * A phrase as a whole word pattern in any case, its spaces any run of white
 * space. Built with `String.raw`, because a plain template literal reads `\b`
 * as a backspace and `\s` as the letter s, and the pattern then matches no
 * page at all (it did, from 9693896 until feature 34). Every phrase is plain
 * words, so nothing in one needs escaping (`tests/unit/claim-phrases.test.ts`).
 */
export function phrasePattern(phrase: string): RegExp {
  return new RegExp(String.raw`\b${phrase.split(" ").join(String.raw`\s+`)}\b`, "i");
}
