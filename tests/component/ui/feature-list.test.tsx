/**
 * The feature trio and the accent card. Spec 0013, AC-10 and AC-22.
 */

import { render, screen, within } from "@testing-library/react";
import { Eraser, Laptop } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Card } from "@/ui/card";
import { FeatureList } from "@/ui/feature-list";

import { expectNoAxeViolations } from "../../setup/component";

const ITEMS = [
  { icon: Laptop, title: "Stays on your device", body: "Never uploaded." },
  { icon: Eraser, title: "Removed, not covered", body: "Taken out of the page." },
];

describe("FeatureList", () => {
  it("is a list of items, each a heading and one line, in order", () => {
    render(<FeatureList items={ITEMS} />);

    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Stays on your device", "Removed, not covered"]);
    expect(items[0]).toHaveTextContent("Never uploaded.");
  });

  it("keeps the list role explicit, which Safari drops once the bullets go", () => {
    render(<FeatureList items={ITEMS} />);

    expect(screen.getByRole("list")).toHaveAttribute("role", "list");
  });

  it("uses the heading level asked for", () => {
    render(<FeatureList items={ITEMS} headingLevel={3} />);

    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
  });

  it("hides each icon from assistive technology, in the accent", () => {
    render(<FeatureList items={ITEMS} />);

    for (const item of screen.getAllByRole("listitem")) {
      const circle = item.firstElementChild;
      expect(circle).toHaveAttribute("aria-hidden", "true");
      expect(circle).toHaveClass("text-accent");
      expect(circle?.querySelector("svg")).not.toBeNull();
    }
  });

  it("sets three columns from md, one below", () => {
    render(<FeatureList items={ITEMS} />);

    expect(screen.getByRole("list")).toHaveClass("grid", "md:grid-cols-3");
  });

  /**
   * AC-10, as feature 28 builds it: where the items stack (below `md`) each is
   * centred, the icon over its title and line; side by side (from `md`) they
   * line up at the start again. jsdom lays nothing out, so this holds the
   * classes and `design-system.spec.ts` measures the boxes in a real browser.
   * The rule lives in the primitive, so every caller gets it, the h3 callers
   * (feature 15's search pages) as much as the home page's h2s.
   */
  for (const headingLevel of [2, 3] as const) {
    it(`centres each item while they stack and lines it up at the start from md, with h${headingLevel} titles`, () => {
      render(<FeatureList items={ITEMS} headingLevel={headingLevel} />);

      for (const item of screen.getAllByRole("listitem")) {
        expect(item).toHaveClass(
          "flex-col",
          "items-center",
          "text-center",
          "md:items-start",
          "md:text-start",
        );
        // The icon comes first, so stacked it sits above the words.
        expect(item.firstElementChild).toHaveAttribute("aria-hidden", "true");
        expect(item.lastElementChild).toContainElement(
          within(item).getByRole("heading", { level: headingLevel }),
        );
      }
    });
  }

  it("passes axe", async () => {
    const { container } = render(<FeatureList items={ITEMS} />);

    await expectNoAxeViolations(container);
  });
});

describe("Card with accent", () => {
  it("draws a 2 pixel accent edge in place of the quiet one", () => {
    render(
      <>
        <Card title="Pro" accent>
          <p>Body</p>
        </Card>
        <Card title="Free">
          <p>Body</p>
        </Card>
      </>,
    );

    const pro = screen.getByRole("region", { name: "Pro" });
    expect(pro).toHaveClass("border-2", "border-accent");
    expect(pro).not.toHaveClass("border-border");
    const free = screen.getByRole("region", { name: "Free" });
    expect(free).toHaveClass("border", "border-border");
    expect(free).not.toHaveClass("border-accent");
  });

  it("passes axe", async () => {
    const { container } = render(
      <Card title="Pro" accent>
        <p>Body</p>
      </Card>,
    );

    await expectNoAxeViolations(container);
  });
});
