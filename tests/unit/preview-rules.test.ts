import { describe, expect, it } from "vitest";

import { PREVIEW_MIN_HEIGHT_PX, previewFits } from "@/app/tool/preview-fit";
import {
  LETTER_SHAPE,
  pageAskWidth,
  PREVIEW_SIDE_MAX,
  THUMB_BOX,
  thumbAsk,
  thumbSize,
  ZOOM_SETTLE_MS,
  ZOOM_START,
  ZOOM_STEPS,
} from "@/app/tool/preview-rules";
import { CANVAS_SIDE_MAX } from "@/engine";

/**
 * The page preview's fit predicate and its layout rules (spec 0026 child
 * 0002, AC-37, AC-44 and AC-45): pure arithmetic, so it is tested here
 * rather than in a browser.
 */
describe("previewFits (AC-37)", () => {
  it("fits 64rem by 36rem at a 16 pixel root, and not a pixel less in either", () => {
    expect(previewFits(1024, 576, 16)).toBe(true);
    expect(previewFits(1023, 576, 16)).toBe(false);
    expect(previewFits(1024, 575, 16)).toBe(false);
  });

  it("needs twice the window at a 32 pixel root, so 200% text keeps the one column", () => {
    expect(previewFits(2048, 1152, 32)).toBe(true);
    expect(previewFits(2047, 1152, 32)).toBe(false);
    expect(previewFits(2048, 1151, 32)).toBe(false);
    expect(previewFits(1280, 800, 32)).toBe(false);
  });

  it("still needs 576 pixels of height at a 12 pixel root", () => {
    expect(PREVIEW_MIN_HEIGHT_PX).toBe(576);
    expect(previewFits(768, 576, 12)).toBe(true);
    expect(previewFits(768, 575, 12)).toBe(false);
    expect(previewFits(767, 576, 12)).toBe(false);
  });
});

describe("the zoom and the asks (AC-44, AC-45)", () => {
  it("steps from 50 to 200%, starting at 100, settling after 150 ms", () => {
    expect(ZOOM_STEPS).toEqual([50, 75, 100, 125, 150, 200]);
    expect(ZOOM_STEPS[ZOOM_START]).toBe(100);
    expect(ZOOM_SETTLE_MS).toBe(150);
  });

  it("asks the page at its width times the zoom times the density, rounded", () => {
    expect(pageAskWidth(600, 100, 2)).toBe(1200);
    expect(pageAskWidth(600, 75, 1.5)).toBe(675);
    expect(pageAskWidth(333.3, 125, 1)).toBe(417);
    expect(pageAskWidth(null, 100, 2)).toBeNull();
    expect(pageAskWidth(0, 100, 2)).toBeNull();
  });

  it("never asks wider than a canvas may be, the engine's own side cap", () => {
    expect(PREVIEW_SIDE_MAX).toBe(CANVAS_SIDE_MAX);
    expect(pageAskWidth(4000, 200, 3)).toBe(CANVAS_SIDE_MAX);
  });

  it("asks a thumbnail 84 pixels across, within its box's area at the density", () => {
    expect(THUMB_BOX).toEqual({ width: 84, height: 112 });
    expect(thumbAsk(2, 8_388_608)).toEqual({ width: 168, maxPixels: 84 * 112 * 4 });
    expect(thumbAsk(1, 8_388_608)).toEqual({ width: 84, maxPixels: 84 * 112 });
    expect(thumbAsk(2, 1_000)).toEqual({ width: 168, maxPixels: 1_000 });
  });

  it("keeps a thumbnail whole inside its box", () => {
    expect(thumbSize(LETTER_SHAPE)).toEqual({ width: 84, height: 84 * LETTER_SHAPE });
    expect(thumbSize(2)).toEqual({ width: 56, height: 112 });
    expect(thumbSize(0.5)).toEqual({ width: 84, height: 42 });
  });
});
