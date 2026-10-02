/**
 * `Prose`, the wrapper for long form text. Spec 0011, AC-18.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Prose } from "@/ui/prose";

import { expectNoAxeViolations } from "../../setup/component";

function Sample() {
  return (
    <Prose className="mt-4">
      <section>
        <h2>Your documents</h2>
        <p>
          Read the <a href="/terms">Terms of use</a> first.
        </p>
        <ul>
          <li>One</li>
          <li>Two</li>
        </ul>
      </section>
      <section>
        <h2>Services we use</h2>
        <h3>Vercel</h3>
        <ol>
          <li>First</li>
        </ol>
      </section>
    </Prose>
  );
}

describe("Prose", () => {
  it("renders what it is given, as the native elements", () => {
    render(<Sample />);

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(2);
    expect(screen.getByRole("heading", { level: 3, name: "Vercel" })).toBeVisible();
    expect(screen.getAllByRole("list")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Terms of use" })).toHaveAttribute(
      "href",
      "/terms",
    );
  });

  /** INV-8: links are underlined, and lists keep their markers. */
  it("underlines links and keeps list markers", () => {
    const { container } = render(<Sample />);
    const classes = container.firstElementChild?.className ?? "";

    expect(classes).toContain("[&_a]:underline");
    expect(classes).toContain("[&_ul]:list-disc");
    expect(classes).toContain("[&_ol]:list-decimal");
  });

  /** Only the two text colours already in the contrast contract. */
  it("uses no colour outside ink and ink-muted", () => {
    const { container } = render(<Sample />);
    const colours = (container.firstElementChild?.className ?? "")
      .split(/\s+/)
      .map((name) => name.replace(/^.*:/, ""))
      .filter((name) => /^(text|bg|border|decoration)-(?!body|heading|\d)/.test(name));

    expect(new Set(colours)).toEqual(new Set(["text-ink"]));
  });

  it("takes a class for layout", () => {
    const { container } = render(<Sample />);

    expect(container.firstElementChild).toHaveClass("mt-4");
  });

  /** covers: AC-18 */
  it("passes axe", async () => {
    const { container } = render(<Sample />);

    await expectNoAxeViolations(container);
  });
});
