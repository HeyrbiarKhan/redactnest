/**
 * `CoverFigure`, the security page's drawing of a box laid over text next to
 * real removal. Spec 0018, AC-8.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CoverFigure, type CoverPanel } from "@/ui/cover-figure";

import { expectNoAxeViolations } from "../../setup/component";

const LINES = [
  { text: "Offer of employment" },
  { text: "Contact:", boxed: true as const },
  { text: "Role: Office manager" },
];

const PANELS: readonly CoverPanel[] = [
  {
    title: "A box drawn over the text",
    lines: LINES,
    readsLabel: "A copy of the text gives",
    reads: "Contact: jane.doe@example.com",
  },
  {
    title: "Removed, then marked",
    lines: LINES,
    readsLabel: "A copy of the text gives",
    reads: "Contact:",
  },
];

const CAPTION =
  "Both pages look the same. Only the second took the words out of the file.";

function Sample() {
  return <CoverFigure panels={PANELS} caption={CAPTION} className="mt-4" />;
}

describe("CoverFigure", () => {
  /**
   * A browser names a figure by its `figcaption`; jsdom's name calculation
   * does not, so the caption is checked as the figure's own `figcaption`.
   */
  it("is a figure with the caption as its figcaption", () => {
    const { container } = render(<Sample />);

    const figure = screen.getByRole("figure");
    expect(figure.querySelector(":scope > figcaption")).toHaveTextContent(CAPTION);
    expect(container.querySelectorAll("figcaption")).toHaveLength(1);
  });

  /** Each panel's meaning is in words a screen reader hears. */
  it("says each panel's title and what a copy of it gives, in visible words", () => {
    const { container } = render(<Sample />);

    for (const panel of PANELS) {
      expect(screen.getByText(panel.title)).toBeVisible();
    }
    const copies = [...container.querySelectorAll("samp")].map(
      (samp) => samp.textContent,
    );
    expect(copies).toEqual(PANELS.map((panel) => panel.reads));
    expect(screen.getAllByText("A copy of the text gives")).toHaveLength(2);
  });

  /** The drawings are decoration, so nothing is told by the picture alone. */
  it("hides each drawing from assistive technology", () => {
    render(<Sample />);

    const drawings = screen.getAllByTestId("cover-drawing");
    expect(drawings).toHaveLength(PANELS.length);
    for (const drawing of drawings) {
      expect(drawing).toHaveAttribute("aria-hidden", "true");
      expect(within(drawing).getByText("Offer of employment")).toBeInTheDocument();
    }
  });

  /**
   * One box per boxed line, filled with `currentColor` so forced colours keep
   * it, never focusable, and with no word under it.
   */
  it("draws each box as a filled shape in the text's colour, with nothing under it", () => {
    render(<Sample />);

    const boxes = screen.getAllByTestId("cover-box");
    expect(boxes).toHaveLength(PANELS.length);
    for (const box of boxes) {
      expect(box.tagName.toLowerCase()).toBe("svg");
      expect(box).toHaveAttribute("focusable", "false");
      expect(box.querySelector("rect")).toHaveAttribute("fill", "currentColor");
      expect(box.textContent).toBe("");
      expect(box.parentElement).toHaveTextContent(/^Contact:\s*$/);
    }
  });

  /** Only pairings already in the contrast contract (spec 0003, INV-2). */
  it("uses no colour outside the contract's ink, muted ink and surfaces", () => {
    const { container } = render(<Sample />);
    const colours = [...container.querySelectorAll("[class]")]
      .flatMap((element) => element.getAttribute("class")?.split(/\s+/) ?? [])
      .map((name) => name.replace(/^.*:/, ""))
      .filter((name) => /^(text|bg|border)-(?!small|body|heading|\d|\[)/.test(name));

    expect(new Set(colours)).toEqual(
      new Set([
        "text-ink",
        "text-ink-muted",
        "bg-surface",
        "bg-canvas",
        "bg-subtle",
        "border-border",
        // The copy's box, so forced colours draw its edge.
        "border-transparent",
      ]),
    );
  });

  /** Side by side from 40rem of its own width, a container query on the figure. */
  it("pairs the panels by the figure's own width, never the window's", () => {
    render(<Sample />);

    const figure = screen.getByRole("figure");
    expect(figure).toHaveClass("@container", "mt-4");
    expect(figure.firstElementChild).toHaveClass("@min-[40rem]:grid-cols-2");
  });

  it("passes axe", async () => {
    const { container } = render(<Sample />);

    await expectNoAxeViolations(container);
  });
});
