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
