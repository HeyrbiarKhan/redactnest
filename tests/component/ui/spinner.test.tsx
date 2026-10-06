/**
 * `Spinner`'s tones, spec 0013, AC-34. That it is hidden and stops under
 * reduced motion is `layout.test.tsx`'s, beside the other small primitives.
 *
 * jsdom computes no colour, so what is proved is which token each part of
 * the drawing takes; the colours themselves are the contrast test's.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Spinner } from "@/ui/spinner";

describe("Spinner", () => {
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
