import { describe, expect, it } from "vitest";

import {
  CLAIM_BANNED_PHRASES,
  MARKETING_BANNED_PHRASES,
  phrasePattern,
} from "../support/claim-phrases";

/**
 * The banned phrase gate itself (spec 0018, AC-5; spec 0024, AC-5). The page
 * tests only ever prove a page holds no banned phrase, which a pattern that
 * matches nothing passes too: from 9693896 the pattern lost its `\b` and `\s`
 * to a template literal and every page check passed on nothing. These cases
 * prove it catches a phrase and misses a near one, so that cannot happen
 * silently again.
 */

const PHRASES = [...CLAIM_BANNED_PHRASES, ...MARKETING_BANNED_PHRASES];

describe("phrasePattern", () => {
  it.each(PHRASES)("catches %s inside a sentence", (phrase) => {
    expect(`Every page says it ${phrase}, then stops.`).toMatch(phrasePattern(phrase));
  });

  it("catches a phrase in any letter case", () => {
    expect("Each Name Is Found.").toMatch(phrasePattern("is found"));
  });

  it("catches a phrase over any run of white space, a line break included", () => {
    expect("the name is \n   found").toMatch(phrasePattern("is found"));
    expect("text gone\tfor good").toMatch(phrasePattern("for good"));
  });

  it("catches a phrase at the very start and end of the text", () => {
    expect("is found").toMatch(phrasePattern("is found"));
  });

  it("misses a phrase whose first word is the end of a longer word", () => {
    expect("this found nothing").not.toMatch(phrasePattern("is found"));
  });

  it("misses a phrase whose last word is the start of a longer word", () => {
    expect("it is foundational").not.toMatch(phrasePattern("is found"));
    expect("those that start ticking").not.toMatch(phrasePattern("start ticked"));
  });

  it("misses the words apart or joined", () => {
    expect("is often found").not.toMatch(phrasePattern("is found"));
    expect("isfound").not.toMatch(phrasePattern("is found"));
  });

  /**
   * The pattern escapes nothing, so a phrase holding a character a regular
   * expression reads (a full stop, a bracket) would match more than it says,
   * and `\b` beside punctuation means something else. Every phrase stays
   * plain words with single spaces.
   */
  it("holds plain words with single spaces in every phrase", () => {
    for (const phrase of PHRASES) {
      expect(phrase).toMatch(/^[a-z]+( [a-z]+)*$/);
    }
  });
});
