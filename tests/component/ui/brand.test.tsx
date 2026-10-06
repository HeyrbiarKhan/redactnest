/**
 * The mark and the lockup. Spec 0013, AC-1, AC-2 and AC-26.
 *
 * That the paths equal `src/app/icon.svg`'s, and its fills the tokens, is
 * `tests/unit/brand-files.test.ts`'s to prove; this is what the page renders.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BrandLockup, BrandMark, MARK_PATHS } from "@/ui/brand-mark";

import { expectNoAxeViolations } from "../../setup/component";

/** A path's commands, each its letter and its numbers, as `M`, `H`, `A` and `Z` write them. */
function commands(d: string) {
  return [...d.matchAll(/([MHAZ])([^MHAZ]*)/g)].map(([, letter, rest]) => ({
    letter,
    numbers: (rest.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number),
  }));
}

/**
 * A band's two long arcs, each its radius and the centre it turns about. A
 * band is drawn as an outer arc, a round cap, an inner arc back and a second
 * cap, so the long arcs are the first and third. Every chord is level, so the
 * centre sits straight above the chord's middle, the nest opening upward.
 */
function bandArcs(d: string) {
  const [move, outer, cap, inner] = commands(d);
  const arcs = [
    { start: move.numbers, numbers: outer.numbers },
    { start: cap.numbers.slice(-2), numbers: inner.numbers },
  ];
  return arcs.map(({ start: [startX, startY], numbers }) => {
    const [radius, , , , , endX, endY] = numbers;
    expect(endY).toBeCloseTo(startY, 3);
    const half = Math.abs(endX - startX) / 2;
    return {
      radius,
      centre: [(startX + endX) / 2, startY - Math.sqrt(radius ** 2 - half ** 2)],
    };
  });
}

/** Grid units at 16 pixels: the 64 unit grid drawn 16 pixels wide. */
const UNITS_PER_PIXEL_AT_16 = 64 / 16;

describe("MARK_PATHS", () => {
  it("holds the bar and the nest's two bands, frozen", () => {
    expect(MARK_PATHS).toHaveLength(3);
    expect(Object.isFrozen(MARK_PATHS)).toBe(true);
  });

  /** AC-1: at 16 pixels the bar is at least 2 pixels tall, so 8 units. */
  it("draws the bar at least 2 pixels tall at 16 pixels, with fully rounded ends", () => {
    const [move, ...rest] = commands(MARK_PATHS[0]);
    const arcs = rest.filter(({ letter }) => letter === "A");
    const top = move.numbers[1];
    const bottom = arcs[0].numbers[6];

    expect(bottom - top).toBeGreaterThanOrEqual(2 * UNITS_PER_PIXEL_AT_16);
    for (const { numbers } of arcs) expect(numbers[0]).toBe((bottom - top) / 2);
  });

  /** AC-1: every stroke at least 1.5 pixels at 16 pixels, so 6 units. */
  it.each([
    ["outer", MARK_PATHS[1]],
    ["inner", MARK_PATHS[2]],
  ])("draws the %s band at least 1.5 pixels wide at 16 pixels", (_, d) => {
    const [outer, inner] = bandArcs(d);

    expect(outer.radius - inner.radius).toBeGreaterThanOrEqual(
      1.5 * UNITS_PER_PIXEL_AT_16,
    );
  });

  /** AC-1: a shallow nest of two concentric arcs, a pixel apart at 16 pixels. */
  it("turns both bands about one centre, a pixel apart at 16 pixels", () => {
    const [outerBand, innerBand] = [bandArcs(MARK_PATHS[1]), bandArcs(MARK_PATHS[2])];
    const centres = [...outerBand, ...innerBand].map(({ centre }) => centre);

    for (const [x, y] of centres) {
      expect(x).toBeCloseTo(centres[0][0], 2);
      expect(y).toBeCloseTo(centres[0][1], 2);
    }
    expect(outerBand[1].radius - innerBand[0].radius).toBeGreaterThanOrEqual(
      UNITS_PER_PIXEL_AT_16,
    );
  });

  it("keeps every shape inside the 64 unit grid", () => {
    for (const d of MARK_PATHS) {
      for (const value of d.match(/-?\d+(?:\.\d+)?/g) ?? []) {
        expect(Number(value)).toBeGreaterThanOrEqual(0);
        expect(Number(value)).toBeLessThanOrEqual(64);
      }
    }
  });
});

describe("BrandMark", () => {
  it("draws every path in the colour of the text around it", () => {
    const { container } = render(<BrandMark size="32px" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 64 64");
    expect(svg).toHaveAttribute("fill", "currentColor");
    expect(svg).toHaveAttribute("width", "32px");
    expect(svg).toHaveAttribute("height", "32px");
    expect(
      [...container.querySelectorAll("path")].map((path) => path.getAttribute("d")),
    ).toEqual(MARK_PATHS);
    // No fill of its own anywhere, so forced colours can repaint it (AC-26).
    for (const path of container.querySelectorAll("path")) {
      expect(path).not.toHaveAttribute("fill");
    }
  });

  it("is hidden from assistive technology and never takes focus", () => {
    const { container } = render(<BrandMark size="1em" />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveAttribute("focusable", "false");
  });
});

describe("BrandLockup", () => {
  it("is the live word RedactNest after the mark, never an image", () => {
    const { container } = render(<BrandLockup />);

    const lockup = container.firstElementChild;
    expect(lockup).toHaveTextContent(/^RedactNest$/);
    expect(container.querySelector("img")).toBeNull();
    // The mark comes first, in the accent, and says nothing.
    expect(lockup?.firstElementChild).toHaveClass("text-accent");
    expect(lockup?.firstElementChild?.querySelector("svg")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("sets the word in Inter 700 with tight tracking, in ink", () => {
    const { container } = render(<BrandLockup />);

    expect(container.firstElementChild).toHaveClass(
      "font-bold",
      "tracking-[-0.02em]",
      "text-ink",
      "text-heading",
    );
  });

  it("sizes the mark from the text, so the two scale together", () => {
    const { container } = render(<BrandLockup size="lg" />);

    expect(container.firstElementChild).toHaveClass("text-title");
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("width", "1.4em");
    expect(svg).toHaveAttribute("height", "1.4em");
  });

  it("names a link around it RedactNest", () => {
    render(
      <a href="#top">
        <BrandLockup />
      </a>,
    );

    expect(screen.getByRole("link", { name: "RedactNest" })).toBeInTheDocument();
  });

  it("passes axe", async () => {
    const { container } = render(
      <a href="#top">
        <BrandLockup />
      </a>,
    );

    await expectNoAxeViolations(container);
  });
});
