/**
 * `Spinner`'s tones, spec 0013, AC-34, and its sizes, the large one from
 * feature 28 (AC-16, AC-23). That it is hidden and stops under reduced motion
 * is `layout.test.tsx`'s, beside the other small primitives.
 *
 * jsdom computes no colour, so what is proved is which token each part of
 * the drawing takes; the colours themselves are the contrast test's.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Spinner, type SpinnerSize } from "@/ui/spinner";

import { expectNoAxeViolations } from "../../setup/component";

describe("Spinner", () => {
  it.each([
    ["sm", "size-4"],
    ["md", "size-5"],
    ["lg", "size-10"],
  ] as const satisfies readonly (readonly [SpinnerSize, string])[])(
    "draws %s at %s, 16, 20 and 40 pixels",
    (size, sizeClass) => {
      render(<Spinner size={size} />);

      const spinner = screen.getByTestId("spinner");
      expect(spinner).toHaveClass(sizeClass);
      for (const other of ["size-4", "size-5", "size-10"].filter(
        (c) => c !== sizeClass,
      )) {
        expect(spinner).not.toHaveClass(other);
      }
    },
  );

  it("draws md when no size is given, as every spinner beside a line did", () => {
    render(<Spinner />);

    expect(screen.getByTestId("spinner")).toHaveClass("size-5");
  });

  /**
   * The large one holds a place on its own, the line under it, so it is the
   * one most likely to be read as content: it stays hidden, keeps the track
   * and the arc, and stops under reduced motion like the others.
   */
  it("keeps the large one hidden, still under reduced motion, with its track and arc", async () => {
    const { container } = render(<Spinner size="lg" />);

    const spinner = screen.getByTestId("spinner");
    expect(spinner).toHaveAttribute("aria-hidden", "true");
    expect(spinner).toHaveClass("animate-spin", "motion-reduce:animate-none");
    expect(spinner.querySelector("circle")).toHaveClass("stroke-accent-soft");
    expect(spinner.querySelector("path")).toHaveClass("stroke-accent");
    await expectNoAxeViolations(container);
  });

  it("draws a soft track under a teal arc by default, as every spinner did", () => {
    render(<Spinner />);

    const spinner = screen.getByTestId("spinner");
    expect(spinner.querySelector("circle")).toHaveClass("stroke-accent-soft");
    expect(spinner.querySelector("path")).toHaveClass("stroke-accent");
  });

  it("draws the arc alone in the text colour around it in the current tone", () => {
    render(<Spinner size="sm" tone="current" />);

    const spinner = screen.getByTestId("spinner");
    expect(spinner.querySelector("circle")).toBeNull();
    const paths = spinner.querySelectorAll("path");
    expect(paths).toHaveLength(1);
    expect(paths[0]).toHaveClass("stroke-current");
    expect(paths[0]).not.toHaveClass("stroke-accent");
    expect(spinner).toHaveClass("size-4", "animate-spin", "motion-reduce:animate-none");
  });
});
