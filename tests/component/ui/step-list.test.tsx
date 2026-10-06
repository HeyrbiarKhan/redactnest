/**
 * The numbered steps in the tool's idle rail. Spec 0013, AC-15.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StepList } from "@/ui/step-list";

import { expectNoAxeViolations } from "../../setup/component";

const STEPS = ["Open a PDF", "Tick what to remove", "Download your new file"];

describe("StepList", () => {
  it("is an ordered list with one item per step, in order", () => {
    render(<StepList steps={STEPS} />);

    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(3);
    items.forEach((item, index) => {
      expect(item).toHaveTextContent(`${index + 1}${STEPS[index]}`);
    });
  });

  it("hides the drawn numbers, so the list's own count is not read twice", () => {
    render(<StepList steps={STEPS} />);

    for (const [index, item] of screen.getAllByRole("listitem").entries()) {
      const number = item.firstElementChild;
      expect(number).toHaveAttribute("aria-hidden", "true");
      expect(number).toHaveTextContent(String(index + 1));
      // `accent-strong` on `accent-soft`, a pairing in the contrast contract.
      expect(number).toHaveClass("bg-accent-soft", "text-accent-strong", "rounded-full");
    }
  });

  /**
   * AC-15: the line from one circle to the next. jsdom draws no pseudo
   * element, so this holds the rule's shape and `tool-layout` in the browser
   * suite measures it: on every step but the last, as a 2 pixel
   * `border-strong` left border (never a background, so forced colours keep
   * it), centred under the circle and 0.25rem clear of each.
   */
  it("joins each step to the next with a border line, none after the last", () => {
    render(<StepList steps={STEPS} />);

    for (const item of screen.getAllByRole("listitem")) {
      expect(item).toHaveClass(
        "relative",
        "not-last:after:absolute",
        "not-last:after:left-[calc(0.875rem_-_1px)]",
        "not-last:after:top-8",
        "not-last:after:-bottom-2",
        "not-last:after:border-l-2",
        "not-last:after:border-border-strong",
      );
      expect(item.className).not.toMatch(/after:bg-/);
      // A pseudo element has no words, so the `ol` alone tells the order.
      expect(item.children).toHaveLength(2);
    }
  });

  it("renders a step as text, never as markup", () => {
    const { container } = render(<StepList steps={["<b>bold</b>"]} />);

    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
  });

  it("passes axe", async () => {
    const { container } = render(<StepList steps={STEPS} />);

    await expectNoAxeViolations(container);
  });
});
