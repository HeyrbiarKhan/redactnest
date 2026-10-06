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

describe("MARK_PATHS", () => {
  it("holds the bar and the nest's two bands, frozen", () => {
    expect(MARK_PATHS).toHaveLength(3);
    expect(Object.isFrozen(MARK_PATHS)).toBe(true);
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
