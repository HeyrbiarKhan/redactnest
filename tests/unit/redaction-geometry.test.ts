import { describe, expect, it } from "vitest";

import {
  blankedRegion,
  BOUNDS_REACH_RATIO,
  boundsReach,
  CHECK_EXTRACTION_OPTIONS,
  containsPoint,
  EXTRACTION_OPTIONS,
  imageReach,
  isSoundQuad,
  isTooSlanted,
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
 * to AC-29 at the level of the numbers; the fixture matrix proves them on real
 * pages.
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

/** A region `blankedRegion` found, landing on `expected`. */
function expectRegion(actual: Quad | null, expected: Quad): void {
  expect(actual).not.toBeNull();
  if (actual) expectQuad(actual, expected);
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
      BOUNDS_REACH_RATIO,
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
      BOUNDS_REACH_RATIO: 0.1,
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

  /**
   * The self check reads the same two ways, in the same order, without
   * clipping to the page, so a glyph MuPDF moves off the page still counts
   * (spec 0004, slice 5).
   */
  it("check the same two ways without clipping to the page", () => {
    expect([...CHECK_EXTRACTION_OPTIONS]).toEqual([
      "clip=no",
      "ignore-actualtext,clip=no",
    ]);
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

  /**
   * Sound itself, but its sides converge so sharply that growing it by the
   * padding turns its top edge back on itself. AC-27 refuses the target, so
   * every measure after it can assume a convex padded area.
   */
  it("finds a trapezoid 4 pt wide at the top and 24 pt at the bottom sound, and its padded area not", () => {
    const trapezoid: Quad = [148, 200, 152, 200, 138, 216, 162, 216];

    expect(isSoundQuad(trapezoid)).toBe(true);
    expect(isSoundQuad(paddedArea(trapezoid))).toBe(false);
  });
});

/** A quad sheared by `degrees` along the line, the way synthetic italic draws. */
function sheared(degrees: number, width: number, height: number): Quad {
  const lean = height * Math.tan((degrees * Math.PI) / 180);
  return [
    100 + lean,
    200,
    100 + lean + width,
    200,
    100,
    200 + height,
    100 + width,
    200 + height,
  ];
}

/** Spec 0004, AC-28, *Bounds reach*. */
describe("the bounds reach", () => {
  it.each([0, 90, 180, 270])("is 0 for a rectangle at %i degrees", (degrees) => {
    expect(boundsReach(rotated(50, 400, degrees, 100, 16))).toBeCloseTo(0, 9);
  });

  it.each([1, 1.5, 10, 30, 60, -20])(
    "is the longer side times |sin 2θ| / 2 for a rectangle at %f degrees",
    (degrees) => {
      const expected = (100 * Math.abs(Math.sin((2 * degrees * Math.PI) / 180))) / 2;

      expect(boundsReach(rotated(50, 400, degrees, 100, 16))).toBeCloseTo(expected, 9);
    },
  );

  /** 0.305 of the height at a shear of 0.2126, about 12 degrees. */
  it("is 0.75 × sin 2s of the height for a padded quad sheared by s", () => {
    const shear = Math.atan(0.2126);
    const quad = sheared((shear * 180) / Math.PI, 100, 16);

    const reach = boundsReach(paddedArea(quad)) / quadHeight(quad);
    expect(reach).toBeCloseTo(0.75 * Math.sin(2 * shear), 9);
    expect(reach).toBeCloseTo(0.305, 3);
    expect(isTooSlanted(quad)).toBe(true);
  });

  it("is not a number for an area that is not", () => {
    expect(boundsReach([Number.NaN, 200, 200, 200, 100, 216, 200, 216])).toBeNaN();
  });
});

/** Spec 0004, AC-28: refused once the padded area reaches past a tenth of the height. */
describe("too slanted", () => {
  /**
   * A 100 by 16 quad pads to 103.2 by 24, so its reach is 103.2 × sin 2θ / 2,
   * and 1.6 (a tenth of 16) is reached at this angle.
   */
  const limit = (Math.asin((2 * BOUNDS_REACH_RATIO * 16) / 103.2) / 2) * (180 / Math.PI);

  it("turns true just past BOUNDS_REACH_RATIO", () => {
    expect(isTooSlanted(rotated(50, 400, limit * 0.99, 100, 16))).toBe(false);
    expect(isTooSlanted(rotated(50, 400, limit * 1.01, 100, 16))).toBe(true);
  });

  it.each([0, 90, 180, 270])("is never true for a rectangle at %i degrees", (degrees) => {
    expect(isTooSlanted(rotated(50, 400, degrees, 100, 16))).toBe(false);
  });

  it.each([
    ["a NaN corner", [Number.NaN, 200, 200, 200, 100, 216, 200, 216]],
    ["an infinite corner", [100, 200, Number.POSITIVE_INFINITY, 200, 100, 216, 200, 216]],
  ] as const)("fails closed on a quad with %s", (_label, quad) => {
    expect(isTooSlanted(quad)).toBe(true);
  });
});

/**
 * Spec 0004, AC-29, *The image reach check*. `transform` maps an image's unit
 * square onto the page with pixel row 0 at the top, as MuPDF reports it.
 */
describe("the region blanked in an image", () => {
  /** 200 pt square at (100, 100), 4 pixels per point: pixel edges every 0.25 pt. */
  const FINE = [200, 0, 0, 200, 100, 100] as const;
  const FINE_PIXELS = 800;

  it("is the area's bounds for an upright image whose pixel edges fall on them", () => {
    const area: Quad = [150, 200, 250, 200, 150, 224, 250, 224];

    expectRegion(blankedRegion(FINE, FINE_PIXELS, FINE_PIXELS, area), area);
    expect(imageReach(FINE, FINE_PIXELS, FINE_PIXELS, area)).toBeCloseTo(0, 9);
  });

  /** A floating point error must not round out to a whole extra pixel. */
  it("keeps an edge a hair past a pixel boundary on that boundary", () => {
    const area: Quad = [150.00001, 200, 249.99999, 200, 150.00001, 224, 249.99999, 224];

    expectRegion(
      blankedRegion(FINE, FINE_PIXELS, FINE_PIXELS, area),
      [150, 200, 250, 200, 150, 224, 250, 224],
    );
  });

  it("rounds out to whole pixels", () => {
    const area: Quad = [150.1, 200.1, 249.9, 200.1, 150.1, 223.9, 249.9, 223.9];

    expectRegion(
      blankedRegion(FINE, FINE_PIXELS, FINE_PIXELS, area),
      [150, 200, 250, 200, 150, 224, 250, 224],
    );
  });

  /**
   * An 8 by 8 image stretched to 200 pt, pixels 25 pt across, under a level
   * area 120 by 20: the whole pixels reach 21.2 pt past it (spec 0004).
   */
  it("grows to whole coarse pixels", () => {
    const coarse = [200, 0, 0, 200, 100, 192] as const;
    const area: Quad = [140, 282, 260, 282, 140, 302, 260, 302];

    expectRegion(
      blankedRegion(coarse, 8, 8, area),
      [125, 267, 275, 267, 125, 317, 275, 317],
    );
    expect(imageReach(coarse, 8, 8, area)).toBeCloseTo(Math.hypot(15, 15), 9);
  });

  it("grows with the image's rotation, and holds the area's bounds", () => {
    const angle = Math.PI / 6;
    const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
    const turned = [
      200 * cos,
      200 * sin,
      -200 * sin,
      200 * cos,
      200 - 100 * (cos - sin),
      200 - 100 * (sin + cos),
    ] as const;
    const area: Quad = [150, 190, 250, 190, 150, 210, 250, 210];

    const region = blankedRegion(turned, FINE_PIXELS, FINE_PIXELS, area);
    expect(region).not.toBeNull();
    for (const corner of [
      [150, 190],
      [250, 190],
      [150, 210],
      [250, 210],
    ] as const) {
      expect(containsPoint(region ?? LEVEL, corner)).toBe(true);
    }
    expect(imageReach(turned, FINE_PIXELS, FINE_PIXELS, area)).toBeGreaterThan(20);
  });

  it("is clipped to the image", () => {
    const area: Quad = [250, 200, 350, 200, 250, 224, 350, 224];

    expectRegion(
      blankedRegion(FINE, FINE_PIXELS, FINE_PIXELS, area),
      [250, 200, 300, 200, 250, 224, 300, 224],
    );
  });

  it("is nothing when the area misses the image, which reaches 0", () => {
    const area: Quad = [400, 400, 450, 400, 400, 420, 450, 420];

    expect(blankedRegion(FINE, FINE_PIXELS, FINE_PIXELS, area)).toBeNull();
    expect(imageReach(FINE, FINE_PIXELS, FINE_PIXELS, area)).toBe(0);
  });

  it("fails closed on a placement that cannot be inverted", () => {
    const flat = [200, 0, 0, 0, 100, 100] as const;
    const area: Quad = [150, 200, 250, 200, 150, 224, 250, 224];

    expect(blankedRegion(flat, FINE_PIXELS, FINE_PIXELS, area)?.every(Number.isNaN)).toBe(
      true,
    );
    expect(imageReach(flat, FINE_PIXELS, FINE_PIXELS, area)).toBeNaN();
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
