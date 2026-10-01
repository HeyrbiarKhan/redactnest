import type { ColorSpaceType } from "mupdf";
import { describe, expect, it } from "vitest";

import {
  contrastWithWhite,
  COPY_REACH_RATIO,
  coverageLines,
  HIDDEN_CONTRAST_MAX,
  intersect,
  MACHINE_READ_RUN,
  machineReadRun,
  POSITION_TOLERANCE,
  readsAsNothing,
  relativeLuminance,
  runStep,
  transformPoint,
  transformRect,
  type PageInspection,
  type Paint,
  type Quad,
  type Rect,
  type RunStep,
  type Transform,
} from "@/engine";
import { PAGE_FINDINGS, type PageFinding } from "@/worker/protocol";
// Not on the engine's index, since nothing past the wall needs them; a test of
// the walled module imports it where it lives.
import { originIndex } from "@/engine/characters";
import { clipToConvex, polygonArea } from "@/engine/geometry";

/**
 * The measures the page reading makes, as plain arithmetic. Spec 0006, AC-4,
 * AC-6, AC-7, AC-9, AC-10 and AC-11 at the level of the numbers: the colour a
 * glyph is judged by, the placement that turns an image or a clip into page
 * space, the clip in force, how much of a glyph's box a cover holds, how a
 * glyph meets its extracted character, and which page counts toward nothing
 * readable. `reading.test.ts` proves the same rules on real pages; this pins
 * the edges no fixture reaches. Spec 0008 adds the machine read run's edges
 * and each character's step in it, and spec 0010 the lines that count toward a
 * picture's coverage.
 */

function paint(space: ColorSpaceType, ...components: number[]): Paint {
  return { space, components, alpha: 1 };
}

const IDENTITY: Transform = [1, 0, 0, 1, 0, 0];

/** Spec 0006, AC-7 and *Decision*: WCAG luminance over Gray, RGB and CMYK. */
describe("a paint's relative luminance", () => {
  it("is 1 for white and 0 for black in each space that is judged", () => {
    expect(relativeLuminance(paint("Gray", 1))).toBe(1);
    expect(relativeLuminance(paint("RGB", 1, 1, 1))).toBe(1);
    expect(relativeLuminance(paint("CMYK", 0, 0, 0, 0))).toBe(1);

    expect(relativeLuminance(paint("Gray", 0))).toBe(0);
    expect(relativeLuminance(paint("RGB", 0, 0, 0))).toBe(0);
    expect(relativeLuminance(paint("CMYK", 0, 0, 0, 1))).toBe(0);
  });

  it("weighs red, green and blue by the WCAG coefficients", () => {
    expect(relativeLuminance(paint("RGB", 1, 0, 0))).toBeCloseTo(0.2126, 10);
    expect(relativeLuminance(paint("RGB", 0, 1, 0))).toBeCloseTo(0.7152, 10);
    expect(relativeLuminance(paint("RGB", 0, 0, 1))).toBeCloseTo(0.0722, 10);
  });

  it("reads a grey the same in Gray and in RGB", () => {
    expect(relativeLuminance(paint("Gray", 0.5))).toBeCloseTo(
      relativeLuminance(paint("RGB", 0.5, 0.5, 0.5)),
      12,
    );
  });

  it("linearises a dark channel by the straight segment, and a lighter one by the curve", () => {
    // 0.04 sits below the 0.04045 knee, 0.5 well above it.
    expect(relativeLuminance(paint("Gray", 0.04))).toBeCloseTo(0.04 / 12.92, 12);
    expect(relativeLuminance(paint("Gray", 0.5))).toBeCloseTo(0.214041, 6);
  });

  it("turns CMYK into sRGB by the fixed formula", () => {
    // Cyan is no red, full green and blue.
    expect(relativeLuminance(paint("CMYK", 1, 0, 0, 0))).toBeCloseTo(0.7874, 10);
    // Half black is the same as half grey.
    expect(relativeLuminance(paint("CMYK", 0, 0, 0, 0.5))).toBeCloseTo(
      relativeLuminance(paint("Gray", 0.5)),
      12,
    );
  });

  it("holds a component outside 0 to 1 to the nearest end", () => {
    expect(relativeLuminance(paint("Gray", 1.4))).toBe(1);
    expect(relativeLuminance(paint("Gray", -0.3))).toBe(0);
    expect(relativeLuminance(paint("RGB", 2, -1, 0))).toBeCloseTo(0.2126, 10);
  });

  it.each(["None", "BGR", "Lab", "Indexed", "Separation"] as const)(
    "cannot judge %s, so it says NaN",
    (space) => {
      expect(relativeLuminance(paint(space, 1, 1, 1))).toBeNaN();
    },
  );

  it.each([
    ["Gray with three components", paint("Gray", 1, 1, 1)],
    ["RGB with one component", paint("RGB", 1)],
    ["CMYK with three components", paint("CMYK", 0, 0, 0)],
    ["no components at all", paint("RGB")],
    ["a component that is not a number", paint("RGB", 1, Number.NaN, 1)],
    ["an endless component", paint("Gray", Number.POSITIVE_INFINITY)],
  ] as const)("cannot judge %s, so it says NaN", (_label, value) => {
    expect(relativeLuminance(value)).toBeNaN();
  });
});

/**
 * Spec 0006, AC-2 and AC-7: a path whose contrast with white paper is within
 * `HIDDEN_CONTRAST_MAX` leaves a page blank, and one whose colour cannot be
 * judged counts as contrasting.
 */
describe("a paint's contrast with white paper", () => {
  it("is 1 for white and 21 for black, the two ends of the WCAG scale", () => {
    expect(contrastWithWhite(paint("Gray", 1))).toBe(1);
    expect(contrastWithWhite(paint("Gray", 0))).toBeCloseTo(21, 10);
  });

  it("gives the WCAG figure for a known grey", () => {
    // #767676 is the lightest grey that reaches 4.5:1 on white.
    const grey = 118 / 255;
    expect(contrastWithWhite(paint("RGB", grey, grey, grey))).toBeCloseTo(4.54, 2);
  });

  it("is within HIDDEN_CONTRAST_MAX for a grey too pale to see on paper, and not for a light grey", () => {
    expect(contrastWithWhite(paint("Gray", 0.97))).toBeLessThan(HIDDEN_CONTRAST_MAX);
    expect(contrastWithWhite(paint("Gray", 0.95))).toBeGreaterThan(HIDDEN_CONTRAST_MAX);
  });

  it("says NaN for a colour it cannot judge, which fails every within test", () => {
    const spot = contrastWithWhite(paint("Separation", 0.1));
    expect(spot).toBeNaN();
    // The inspection asks `!(contrast <= HIDDEN_CONTRAST_MAX)`, so NaN contrasts.
    expect(spot <= HIDDEN_CONTRAST_MAX).toBe(false);
  });
});

function inspection(readable: boolean, ...findings: PageFinding[]): PageInspection {
  return { findings, readable, concealed: [], emptyClip: false };
}

/**
 * Spec 0006, AC-10: a page counts toward nothing readable when it is
 * `scanned`, `drawn-only` or `blank`, or holds no readable character. Only
 * when every page counts is the open refused.
 */
describe("a page that counts toward nothing readable", () => {
  it.each(["scanned", "drawn-only", "blank"] as const)(
    "counts a %s page, even one holding a readable stamp",
    (finding) => {
      expect(readsAsNothing(inspection(true, finding))).toBe(true);
    },
  );

  it("counts a page with no readable character, whatever else it says", () => {
    expect(readsAsNothing(inspection(false))).toBe(true);
    expect(readsAsNothing(inspection(false, "unreadable-text"))).toBe(true);
  });

  it("does not count a page of readable text with nothing to say", () => {
    expect(readsAsNothing(inspection(true))).toBe(false);
  });

  it.each(
    PAGE_FINDINGS.filter(
      (finding) => !["scanned", "drawn-only", "blank"].includes(finding),
    ),
  )("does not count a readable page that is %s", (finding) => {
    // A lone unmapped run beside typed text, a fake redaction, an ID card on a
    // typed page: each leaves something detection can read.
    expect(readsAsNothing(inspection(true, finding))).toBe(false);
  });
});

/** Spec 0006, AC-9: the device pass's coordinates are page space. */
describe("placing a point", () => {
  it("applies [a, b, c, d, e, f] as PDF writes it, x times a plus y times c plus e", () => {
    const m: Transform = [1, 2, 3, 4, 5, 6];
    expect(transformPoint([1, 1], m)).toEqual([9, 12]);
    expect(transformPoint([2, 0], m)).toEqual([7, 10]);
    expect(transformPoint([0, 2], m)).toEqual([11, 14]);
  });

  it("leaves a point where it is under the identity", () => {
    expect(transformPoint([12.5, -3], IDENTITY)).toEqual([12.5, -3]);
  });
});

/**
 * Spec 0006, AC-4 and AC-11: an image's footprint and a clip's bounds, in page
 * space, and MuPDF's infinite rect never mistaken for a real one.
 */
describe("placing a rect", () => {
  it("scales and moves it", () => {
    expect(transformRect([0, 0, 1, 1], [200, 0, 0, 100, 50, 60])).toEqual([
      50, 60, 250, 160,
    ]);
  });

  it("takes the bounds of all four corners when the placement turns it", () => {
    // A quarter turn maps (x, y) to (-y, x).
    expect(transformRect([0, 0, 10, 20], [0, 1, -1, 0, 0, 0])).toEqual([-20, 0, 0, 10]);
  });

  it("keeps its bounds in order when the placement flips it", () => {
    // The unit square of an image, drawn with pixel row 0 at the top.
    expect(transformRect([0, 0, 1, 1], [100, 0, 0, -50, 10, 700])).toEqual([
      10, 650, 110, 700,
    ]);
  });

  it("passes a rect with no width through, for the caller to judge", () => {
    expect(transformRect([5, 5, 5, 10], IDENTITY)).toEqual([5, 5, 5, 10]);
  });

  it.each([
    ["MuPDF's infinite rect", [-(2 ** 31), -(2 ** 31), 2 ** 31, 2 ** 31]],
    ["a rect reaching 1e9 on one side", [0, 0, 1e9, 10]],
    ["a rect reaching -1e9 on one side", [0, -1e9, 10, 10]],
    ["an inverted rect", [10, 0, 0, 10]],
    ["a rect with a side that is not a number", [0, 0, Number.NaN, 10]],
  ] as const)("calls %s unbounded, so null", (_label, rect) => {
    expect(transformRect(rect, IDENTITY)).toBeNull();
  });

  it("is null when the placement throws a finite rect out past every number", () => {
    expect(transformRect([0, 0, 10, 10], [1e308, 0, 0, 1e308, 0, 0])).toBeNull();
  });
});

/** Spec 0006, AC-4 and AC-11: the clip in force is the bounds every open clip shares. */
describe("the rect two bounds share", () => {
  it("is their overlap", () => {
    expect(intersect([0, 0, 100, 100], [50, 20, 150, 80])).toEqual([50, 20, 100, 80]);
  });

  it("is the inner one when one holds the other", () => {
    expect(intersect([0, 0, 612, 792], [72, 72, 540, 720])).toEqual([72, 72, 540, 720]);
  });

  it("is null when they do not meet on either axis", () => {
    expect(intersect([0, 0, 10, 10], [20, 0, 30, 10])).toBeNull();
    expect(intersect([0, 0, 10, 10], [0, 20, 10, 30])).toBeNull();
  });

  it("is a rect with no width when they only touch, so the caller decides it holds no area", () => {
    const shared = intersect([0, 0, 10, 10], [10, 0, 20, 10]);
    expect(shared).toEqual([10, 0, 10, 10]);
  });

  it("gives the same answer whichever comes first", () => {
    const a: Rect = [3, -4, 60, 18];
    const b: Rect = [-10, 2, 25, 40];
    expect(intersect(a, b)).toEqual(intersect(b, a));
  });
});

/** The square from (x0, y0) to (x1, y1), walked clockwise on screen. */
function square(x0: number, y0: number, x1: number, y1: number) {
  return [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as const;
}

describe("a polygon's area", () => {
  it("is width times height for a rectangle, in either winding", () => {
    const box = square(10, 20, 40, 30);
    expect(polygonArea(box)).toBe(300);
    expect(polygonArea([...box].reverse())).toBe(300);
  });

  it("is half base times height for a triangle", () => {
    expect(
      polygonArea([
        [0, 0],
        [10, 0],
        [0, 6],
      ]),
    ).toBe(30);
  });

  it("is 0 for fewer than three points, or points on one line", () => {
    expect(polygonArea([])).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [5, 5],
      ]),
    ).toBe(0);
    expect(
      polygonArea([
        [0, 0],
        [5, 5],
        [10, 10],
      ]),
    ).toBe(0);
  });
});

/**
 * Spec 0006, AC-6: a glyph is covered when at least `COVER_MIN_OVERLAP` of its
 * box lies inside one opaque cover. This is the cut that measures it.
 */
describe("the part of a box inside a cover", () => {
  const GLYPH = square(100, 100, 110, 112);

  it("is the whole box when the cover holds it", () => {
    const inside = clipToConvex(GLYPH, square(90, 90, 200, 200));
    expect(polygonArea(inside)).toBeCloseTo(120, 10);
  });

  it("is the overlap when the cover reaches part way across", () => {
    // A box drawn over the top three quarters of the glyph.
    const part = clipToConvex(GLYPH, square(0, 0, 500, 109));
    expect(polygonArea(part)).toBeCloseTo(90, 10);
  });

  it("is nothing when the cover lies beside the box", () => {
    expect(clipToConvex(GLYPH, square(200, 100, 260, 112))).toEqual([]);
  });

  it("works for a cover wound either way", () => {
    const cover = square(105, 0, 500, 500);
    const clockwise = polygonArea(clipToConvex(GLYPH, cover));
    const counter = polygonArea(clipToConvex(GLYPH, [...cover].reverse()));
    expect(clockwise).toBeCloseTo(60, 10);
    expect(counter).toBeCloseTo(60, 10);
  });

  it("cuts to a turned cover's outline, not its bounds", () => {
    // A diamond whose bounds hold the glyph, but whose outline cuts a 3 by 3
    // triangle off each of its corners.
    const diamond = [
      [105, 98],
      [113, 106],
      [105, 114],
      [97, 106],
    ] as const;
    expect(polygonArea(clipToConvex(GLYPH, diamond))).toBeCloseTo(120 - 4 * 4.5, 10);
  });

  it.each([
    ["no points", []],
    [
      "points on one line",
      [
        [0, 0],
        [50, 50],
        [100, 100],
      ],
    ],
  ] as const)("leaves nothing for a cover of %s", (_label, cover) => {
    expect(clipToConvex(GLYPH, cover)).toEqual([]);
  });
});

/**
 * Spec 0006, AC-9 and AC-13: a glyph meets the extracted character whose origin
 * lies within `POSITION_TOLERANCE` of its own, and a match is concealed when a
 * character of it lies within reach of a concealed glyph.
 */
describe("finding a value by its origin", () => {
  const HALF = POSITION_TOLERANCE / 2;

  it("finds a value at its own origin, and one a hair away on each axis", () => {
    const index = originIndex<string>();
    index.add([72, 700], "a");

    expect(index.find([72, 700])).toBe("a");
    expect(index.find([72 + HALF, 700 - HALF])).toBe("a");
  });

  it("finds nothing past the tolerance on either axis", () => {
    const index = originIndex<string>();
    index.add([72, 700], "a");

    expect(index.find([72 + 2 * POSITION_TOLERANCE, 700])).toBeNull();
    expect(index.find([72, 700 - 2 * POSITION_TOLERANCE])).toBeNull();
  });

  it("finds a value across a cell boundary, including across zero", () => {
    const index = originIndex<string>();
    index.add([0.0099, -0.004], "near zero");

    expect(index.find([0.0101, 0.004])).toBe("near zero");
  });

  it("finds nothing in an index that holds nothing", () => {
    expect(originIndex<number>().find([0, 0])).toBeNull();
  });

  it("passes over a value the caller does not accept, and finds the next within reach", () => {
    const index = originIndex<{ readonly used: boolean; readonly name: string }>();
    index.add([300, 400], { used: true, name: "first" });
    index.add([300 + HALF, 400], { used: false, name: "second" });

    expect(index.findWhere([300, 400], (value) => !value.used)?.name).toBe("second");
    expect(index.findWhere([300, 400], () => false)).toBeNull();
  });

  it("never matches a far point that shares a cell key, since it compares the points themselves", () => {
    // Past about 2^21 cells the packed key repeats: these two points share
    // one, 41,943 pt apart.
    const index = originIndex<string>();
    index.add([0.005, -20971.515], "far away");

    expect(index.find([-0.005, 20971.525])).toBeNull();
    expect(index.find([0.005, -20971.515])).toBe("far away");
  });
});

/**
 * Spec 0008, AC-14: only letters and numbers count toward a run, a combining
 * mark continues one without adding to it, and anything else ends it.
 */
describe("a character's step in a machine read run", () => {
  const code = (character: string) => character.codePointAt(0) ?? -1;

  it.each([
    ["a Latin capital", "S"],
    ["a Latin small letter", "z"],
    ["a Latin letter with its accent composed", "é"],
    ["a CJK ideograph", "漢"],
    ["an ASCII digit", "7"],
    ["an Arabic Indic digit", "٣"],
  ])("counts %s", (_label, character) => {
    expect(runStep(code(character))).toBe("counts");
  });

  it.each([
    ["a Devanagari vowel sign (U+093F)", 0x093f],
    ["a combining acute accent (U+0301)", 0x0301],
  ])("continues on %s", (_label, point) => {
    expect(runStep(point)).toBe("continues");
  });

  it.each<readonly [string, number]>([
    ...["_", ".", "|", "-", "~", "*"].map((mark) => [`"${mark}"`, code(mark)] as const),
    ["a zero width space (U+200B)", 0x200b],
    ["a zero width joiner (U+200D)", 0x200d],
    ["a soft hyphen (U+00AD)", 0x00ad],
    ["a word joiner (U+2060)", 0x2060],
    ["a space", 0x20],
    ["U+FFFD", 0xfffd],
    ["a private use code point (U+E000)", 0xe000],
    ["a lone surrogate (U+D800)", 0xd800],
    ["a value that is no code point", 0x110000],
  ])("ends on %s", (_label, point) => {
    expect(runStep(point)).toBe("ends");
  });
});

/**
 * Spec 0008, AC-1, AC-2 and AC-14: a picture holds a machine read run when
 * `MACHINE_READ_RUN` characters that count lie in a row on one line, each
 * centred inside it. A combining mark carries a run without adding to it;
 * anything else ends it.
 */
describe("the machine read run", () => {
  /** The picture: x 0 to 500, y 0 to 100 in page space. */
  const inside = ([x, y]: readonly [number, number]) =>
    x >= 0 && x <= 500 && y >= 0 && y <= 100;

  /**
   * Characters from a pattern, 6 pt apart on one baseline, as the ordinary
   * read gives them: `c` counts and centres inside the picture, `m` continues
   * (a combining mark), `e` ends (a space, punctuation, a visible character or
   * one on a drawn copy), `o` counts but centres outside it, and `/` starts
   * the next line.
   */
  function laidOut(pattern: string) {
    const characters: { readonly line: number; readonly quad: Quad }[] = [];
    const steps: RunStep[] = [];
    let line = 0;
    for (const mark of pattern) {
      if (mark === "/") {
        line += 1;
        continue;
      }
      const x = (mark === "o" ? 600 : 10) + 6 * characters.length;
      characters.push({ line, quad: [x, 40, x + 6, 40, x, 52, x + 6, 52] });
      steps.push(mark === "m" ? "continues" : mark === "e" ? "ends" : "counts");
    }
    return { characters, step: (at: number) => steps[at] };
  }

  it("is 3 characters in a row, and a drawn copy's reach is half a character's height", () => {
    expect(MACHINE_READ_RUN).toBe(3);
    expect(COPY_REACH_RATIO).toBe(0.5);
  });

  it.each([
    ["exactly three that count", "ccc"],
    ["three after a broken pair", "cceccc"],
    ["three on the second line", "cc/ccc"],
    ["a word straddling the edge, three of its letters inside", "ooccc"],
    ["a letter, a mark, then two letters", "cmcc"],
    ["three letters, each carrying a mark", "cmcmcm"],
  ])("finds one in %s", (_label, pattern) => {
    const { characters, step } = laidOut(pattern);
    expect(machineReadRun(characters, step, inside)).toBe(true);
  });

  it.each([
    ["two, then a space or punctuation", "ccecc"],
    ["two, then the end of the line", "cc/cc"],
    ["two, then one centred outside", "ccocc"],
    ["a word straddling the edge, two of its letters inside", "ccooo"],
    ["characters that count one at a time", "cecece"],
    ["one letter carrying two marks", "cmm"],
    ["marks alone", "mmmm"],
    ["a letter and a mark, an end, then two letters", "cmecc"],
    ["nothing at all", ""],
  ])("finds none in %s", (_label, pattern) => {
    const { characters, step } = laidOut(pattern);
    expect(machineReadRun(characters, step, inside)).toBe(false);
  });

  it("asks only about characters centred inside, and stops at the first run (AC-12)", () => {
    const { characters, step } = laidOut("ooccccccc");
    const asked: number[] = [];
    const counting = (at: number) => {
      asked.push(at);
      return step(at);
    };

    expect(machineReadRun(characters, counting, inside)).toBe(true);
    expect(asked).toEqual([2, 3, 4]);
  });
});

/**
 * Spec 0010, AC-1: a line counts toward a picture's coverage when it holds a
 * letter or number, every readable character on it is drawn at its origin,
 * and none is hidden there. Whitespace and unreadable characters are never
 * asked.
 */
describe("the lines that count toward a picture's coverage", () => {
  /** How the page draws a character: a drawn glyph, an invisible one, both, or none. */
  type Drawn = "drawn" | "hidden" | "both" | "none";

  /**
   * Characters 6 pt apart on one baseline, one list per line, each with how
   * the page draws it, and the origins `coverageLines` asked about.
   */
  function judge(lines: readonly (readonly (readonly [string | number, Drawn])[])[]) {
    const characters: {
      line: number;
      code: number;
      origin: readonly [number, number];
    }[] = [];
    const drawn = new Set<number>();
    const hidden = new Set<number>();
    lines.forEach((glyphs, line) => {
      for (const [character, how] of glyphs) {
        const x = 6 * characters.length;
        const code =
          typeof character === "number" ? character : (character.codePointAt(0) ?? -1);
        characters.push({ line, code, origin: [x, 100] });
        if (how === "drawn" || how === "both") drawn.add(x);
        if (how === "hidden" || how === "both") hidden.add(x);
      }
    });
    const asked = new Set<number>();
    const counting = coverageLines(
      characters,
      ([x]) => {
        asked.add(x / 6);
        return drawn.has(x);
      },
      ([x]) => {
        asked.add(x / 6);
        return hidden.has(x);
      },
    );
    const ascending = (a: number, b: number) => a - b;
    return { counting: [...counting].sort(ascending), asked: [...asked].sort(ascending) };
  }

  it.each<readonly [string, readonly (readonly [string | number, Drawn])[]]>([
    ["one drawn letter", [["A", "drawn"]]],
    ["a drawn digit", [["7", "drawn"]]],
    ["a drawn CJK letter", [["漢", "drawn"]]],
    [
      "a drawn letter with drawn punctuation",
      [
        ["A", "drawn"],
        [",", "drawn"],
      ],
    ],
    [
      "drawn letters around unmatched whitespace",
      [
        ["N", "drawn"],
        [" ", "none"],
        ["o", "drawn"],
      ],
    ],
    [
      "a drawn letter beside an unmatched U+FFFD",
      [
        ["A", "drawn"],
        [0xfffd, "none"],
      ],
    ],
  ])("counts %s", (_label, line) => {
    expect(judge([line]).counting).toEqual([0]);
  });

  it.each<readonly [string, readonly (readonly [string | number, Drawn])[]]>([
    [
      "a line of only drawn punctuation",
      [
        ["_", "drawn"],
        [".", "drawn"],
        ["|", "drawn"],
      ],
    ],
    [
      "a drawn letter with an unmatched comma",
      [
        ["A", "drawn"],
        [",", "none"],
      ],
    ],
    [
      "a drawn letter with a hidden letter",
      [
        ["A", "drawn"],
        ["B", "hidden"],
      ],
    ],
    ["a letter drawn invisible and visible at one place", [["A", "both"]]],
    [
      "a hidden word",
      [
        ["Y", "hidden"],
        ["e", "hidden"],
        ["s", "hidden"],
      ],
    ],
    ["a letter at no glyph's origin", [["A", "none"]]],
    ["a lone drawn combining mark", [[0x0301, "drawn"]]],
    [
      "a line of only drawn format characters",
      [
        [0x200b, "drawn"],
        [0x200d, "drawn"],
        [0x00ad, "drawn"],
      ],
    ],
    [
      "a drawn letter with a format character at no glyph's origin",
      [
        ["A", "drawn"],
        [0x200b, "none"],
      ],
    ],
  ])("does not count %s", (_label, line) => {
    expect(judge([line]).counting).toEqual([]);
  });

  it("judges each line alone", () => {
    const { counting } = judge([
      [["A", "drawn"]],
      [["B", "hidden"]],
      [[",", "drawn"]],
      [
        ["C", "drawn"],
        ["D", "drawn"],
      ],
      [],
    ]);
    expect(counting).toEqual([0, 3]);
  });

  it("counts nothing on a page with no characters", () => {
    expect(judge([]).counting).toEqual([]);
  });

  it("never asks about whitespace or U+FFFD, and stops asking once a line fails", () => {
    const { counting, asked } = judge([
      [
        ["A", "drawn"],
        [" ", "none"],
        [0xfffd, "none"],
      ],
      [
        ["B", "none"],
        ["C", "drawn"],
        ["D", "drawn"],
      ],
      [["E", "drawn"]],
    ]);
    expect(counting).toEqual([0, 2]);
    expect(asked).toEqual([0, 3, 6]);
  });
});
