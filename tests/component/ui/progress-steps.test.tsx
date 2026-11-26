/**
 * `ProgressSteps`, spec 0026, child 0003, AC-31: each step's state is said in
 * words as well as drawn, the bar is decoration, and the card is never a live
 * region of its own.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProgressSteps, type ProgressStep } from "@/ui/progress-steps";

import { expectNoAxeViolations } from "../../setup/component";

const STATE_TEXT = { done: "done", current: "in progress", next: "not started" } as const;

const STEPS: readonly ProgressStep[] = [
  { label: "Removing what you ticked", state: "done" },
  { label: "Writing your new file", state: "current" },
  { label: "Checking every page", state: "next" },
];

function renderSteps(fraction = 1 / 3) {
  return render(
    <ProgressSteps
      title="Redacting…"
      line="Writing your new file"
      steps={STEPS}
      fraction={fraction}
      stateText={STATE_TEXT}
      data-testid="progress"
    />,
  );
}

describe("ProgressSteps", () => {
  it("shows the title, the current line and an ordered list of the steps", async () => {
    const { container } = renderSteps();

    expect(screen.getByText("Redacting…")).toBeInTheDocument();
    const list = screen.getByRole("list");
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    await expectNoAxeViolations(container);
  });

  it("says each step's state in words, not only by its icon", () => {
    renderSteps();

    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "Removing what you ticked, done",
      "Writing your new file, in progress",
      "Checking every page, not started",
    ]);
    for (const word of Object.values(STATE_TEXT)) {
      expect(screen.getByText(`, ${word}`)).toHaveClass("sr-only");
    }
  });

  it("is not a live region, so the page's own region is the only one speaking", () => {
    renderSteps();

    const card = screen.getByTestId("progress");
    expect(card).not.toHaveAttribute("aria-live");
    expect(card).not.toHaveAttribute("role");
    expect(card.querySelector("[aria-live], [role='status'], [role='alert']")).toBeNull();
  });

  it("draws the bar as decoration, filled to the fraction done", () => {
    renderSteps(2 / 3);

    const fill = screen.getByTestId("progress").querySelector("[aria-hidden] > div");
    expect(fill).toHaveStyle({ width: "67%" });
  });

  it.each([
    [-1, "0%"],
    [2, "100%"],
  ])("keeps a fraction of %s inside the bar, at %s", (fraction, width) => {
    renderSteps(fraction);

    const fill = screen.getByTestId("progress").querySelector("[aria-hidden] > div");
    expect(fill).toHaveStyle({ width });
  });

  /** The page's polite region holds the one `spinner` test id; this card adds none. */
  it("adds no second spinner test id", () => {
    renderSteps();

    expect(screen.queryByTestId("spinner")).toBeNull();
  });
});
