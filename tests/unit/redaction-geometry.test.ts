import { describe, expect, it } from "vitest";

import {
  containsPoint,
  EXTRACTION_OPTIONS,
  isSoundQuad,
  LINE_ANGLE_TOLERANCE,
  LINE_BOX_BOTTOM,
  LINE_BOX_TOP,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  lineBox,
  MIN_QUAD_SIDE,
  paddedArea,
  POSITION_TOLERANCE,
  quadHeight,
  quadWidth,
  REMOVAL_BAND_RATIO,
  REMOVAL_INSET_RATIO,
  removalBand,
  TARGET_PADDING_ALONG_RATIO,
  TARGET_PADDING_RATIO,
  type Quad,
} from "@/engine";

/**
 * The target geometry, as spec 0004's *Target geometry* sets it out. Pure
 * arithmetic on quads, so no engine is needed. Verifies AC-4, AC-6 and AC-27
 * at the level of the numbers; the fixture matrix proves them on real pages.
 */

/** 100pt along, 16pt across, level, with its top edge at y = 200. */
const LEVEL: Quad = [100, 200, 200, 200, 100, 216, 200, 216];

/** A quad from its start, its direction, its width and its height. */
function rotated(
  x: number,
  y: number,
  degrees: number,
  width: number,
  height: number,
): Quad {
  const angle = (degrees * Math.PI) / 180;
  const along = [Math.cos(angle), Math.sin(angle)];
  const across = [-Math.sin(angle), Math.cos(angle)];
  const at = (u: number, v: number): readonly [number, number] => [
    x + along[0] * u + across[0] * v,
    y + along[1] * u + across[1] * v,
  ];
  const [ul, ur, ll, lr] = [at(0, 0), at(width, 0), at(0, height), at(width, height)];
  return [ul[0], ul[1], ur[0], ur[1], ll[0], ll[1], lr[0], lr[1]];
}

function expectQuad(actual: Quad, expected: Quad): void {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 9));
}

describe("the constants", () => {
  /**
   * Written out rather than read back, so changing one is a deliberate edit to
   * this list as well as to `src/engine`, and a fixture shows what it cost.
   */
  it("hold the values spec 0004 fixes", () => {
    expect({
      REMOVAL_BAND_RATIO,
      REMOVAL_INSET_RATIO,
      LINE_BOX_TOP,
      LINE_BOX_BOTTOM,
      TARGET_PADDING_RATIO,
      TARGET_PADDING_ALONG_RATIO,
      MIN_QUAD_SIDE,
      POSITION_TOLERANCE,
      LINE_ANGLE_TOLERANCE,
      LINE_HEIGHT_MIN,
      LINE_HEIGHT_MAX,
    }).toEqual({
      REMOVAL_BAND_RATIO: 0.1,
      REMOVAL_INSET_RATIO: 0.1,
      LINE_BOX_TOP: 0.2,
      LINE_BOX_BOTTOM: 0.93,
      TARGET_PADDING_RATIO: 0.25,
      TARGET_PADDING_ALONG_RATIO: 0.1,
      MIN_QUAD_SIDE: 0.5,
      POSITION_TOLERANCE: 0.01,
      LINE_ANGLE_TOLERANCE: 2,
      LINE_HEIGHT_MIN: 0.67,
      LINE_HEIGHT_MAX: 1.5,
    });
  });

  /** MuPDF's defaults, then the same ignoring replacement text. Nothing else. */
  it("extract twice, the second time ignoring replacement text", () => {
    expect([...EXTRACTION_OPTIONS]).toEqual(["", "ignore-actualtext"]);
  });
});

describe("reading a quad", () => {
  it("measures height across the line and width along it", () => {
    expect(quadHeight(LEVEL)).toBe(16);
    expect(quadWidth(LEVEL)).toBe(100);
  });

  it("measures a quad at 30 degrees along its own axes", () => {
    const quad = rotated(50, 80, 30, 100, 16);

    expect(quadHeight(quad)).toBeCloseTo(16, 9);
    expect(quadWidth(quad)).toBeCloseTo(100, 9);
  });
});

describe("the removal band", () => {
  /** 0.45 to 0.55 of the height, each end pulled in by 0.1 of the height. */
  it("runs through the middle tenth of a level quad, its ends pulled in", () => {
    expectQuad(
      removalBand(LEVEL),
      [101.6, 207.2, 198.4, 207.2, 101.6, 208.8, 198.4, 208.8],
    );
  });

  it("lands in the same place along a quad's own axes at 30 degrees", () => {
    expectQuad(
      removalBand(rotated(50, 80, 30, 100, 16)),
      offsetRotated(50, 80, 30, 1.6, 7.2, 96.8, 1.6),
    );
  });

  /** A quarter of the width is the cap, so a narrow `.` or `i` keeps a band. */
  it("pulls the ends of a narrow quad in by no more than a quarter of its width", () => {
    const narrow: Quad = [100, 200, 104, 200, 100, 216, 104, 216];

    expectQuad(removalBand(narrow), [101, 207.2, 103, 207.2, 101, 208.8, 103, 208.8]);
  });
});

/**
 * The part of a rotated quad that starts `u` along and `v` across from the same
 * origin, `width` long and `height` tall: what a region of `rotated(...)` is.
 */
function offsetRotated(
  x: number,
  y: number,
  degrees: number,
  u: number,
  v: number,
  width: number,
  height: number,
): Quad {
  const angle = (degrees * Math.PI) / 180;
  const start = [
    x + Math.cos(angle) * u - Math.sin(angle) * v,
    y + Math.sin(angle) * u + Math.cos(angle) * v,
  ];
  return rotated(start[0], start[1], degrees, width, height);
}

describe("the line box", () => {
  /** 0.20 to 0.93 of the height, the whole width. */
  it("covers the match's own line on a level quad", () => {
    expectQuad(lineBox(LEVEL), [100, 203.2, 200, 203.2, 100, 214.88, 200, 214.88]);
  });

  it("covers the same share of a quad at 30 degrees", () => {
    expectQuad(
      lineBox(rotated(50, 80, 30, 100, 16)),
      offsetRotated(50, 80, 30, 0, 3.2, 100, 11.68),
    );
  });
});

describe("the padded area", () => {
  /** A quarter of the height above and below, a tenth of it before and after. */
  it("grows a level quad across and along the line", () => {
    expectQuad(paddedArea(LEVEL), [98.4, 196, 201.6, 196, 98.4, 220, 201.6, 220]);
  });

  it("grows a quad at 30 degrees along its own axes", () => {
    expectQuad(
      paddedArea(rotated(50, 80, 30, 100, 16)),
      offsetRotated(50, 80, 30, -1.6, -4, 103.2, 24),
    );
  });
});

/** Spec 0004, AC-27: what a target quad must be before it is trusted. */
describe("a sound quad", () => {
  it("accepts a level quad and one at 30 degrees", () => {
    expect(isSoundQuad(LEVEL)).toBe(true);
    expect(isSoundQuad(rotated(50, 80, 30, 100, 16))).toBe(true);
  });

  it("accepts a quad whose corners run the other way round", () => {
    expect(isSoundQuad([100, 216, 200, 216, 100, 200, 200, 200])).toBe(true);
  });

  it.each([
    ["not a number", [Number.NaN, 200, 200, 200, 100, 216, 200, 216]],
    ["infinite", [100, 200, Number.POSITIVE_INFINITY, 200, 100, 216, 200, 216]],
    ["crossing itself", [100, 200, 200, 200, 200, 216, 100, 216]],
    ["folded in on itself", [100, 200, 200, 200, 100, 216, 110, 205]],
    ["a side under half a point", [100, 200, 100.4, 200, 100, 216, 100.4, 216]],
    ["a point", [100, 200, 100, 200, 100, 200, 100, 200]],
  ] as const)("refuses a quad that is %s", (_label, quad) => {
    expect(isSoundQuad(quad)).toBe(false);
  });

  it("accepts a side of exactly half a point", () => {
    expect(isSoundQuad([100, 200, 100.5, 200, 100, 216, 100.5, 216])).toBe(true);
  });
});

describe("a point in a quad", () => {
  it("is inside when it is within the quad or on its edge, and outside otherwise", () => {
    expect(containsPoint(LEVEL, [150, 208])).toBe(true);
    expect(containsPoint(LEVEL, [100, 208])).toBe(true);
    expect(containsPoint(LEVEL, [200, 216])).toBe(true);
    expect(containsPoint(LEVEL, [99.99, 208])).toBe(false);
    expect(containsPoint(LEVEL, [150, 216.01])).toBe(false);
  });

  it("follows a quad at 30 degrees rather than its bounds", () => {
    const quad = rotated(50, 80, 30, 100, 16);

    // Inside the quad's bounding box, but not the quad.
    expect(containsPoint(quad, [52, 128])).toBe(false);
    // The middle of the quad.
    expect(
      containsPoint(quad, [
        50 + 50 * Math.cos(Math.PI / 6) - 8 * 0.5,
        80 + 25 + 8 * Math.cos(Math.PI / 6),
      ]),
    ).toBe(true);
  });
});
