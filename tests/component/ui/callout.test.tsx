/**
 * `Callout`, spec 0003, AC-11 and INV-8. The tone is never carried by colour
 * alone, and a callout is never announced unless the caller asks for it.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";

import { expectNoAxeViolations } from "../../setup/component";

describe("Callout", () => {
  it.each([
    ["warning", "Warning"],
    ["info", "Note"],
    ["danger", "Error"],
  ] as const)("begins a %s callout with the word %s", (tone, word) => {
    render(
      <Callout tone={tone} data-testid="callout">
        Page 2 is a scanned image.
      </Callout>,
    );

    const callout = screen.getByTestId("callout");
    expect(callout.textContent?.startsWith(word)).toBe(true);
    // Hidden from sight, not from assistive technology.
    expect(screen.getByText(`${word}:`, { exact: false })).toHaveClass("sr-only");
  });

  it("gives each tone its own icon shape, hidden from assistive technology", () => {
    const { container } = render(
      <>
        <Callout tone="warning">One</Callout>
        <Callout tone="info">Two</Callout>
        <Callout tone="danger">Three</Callout>
      </>,
    );

    const icons = [...container.querySelectorAll("svg")];
    expect(icons).toHaveLength(3);
    expect(new Set(icons.map((icon) => icon.getAttribute("class"))).size).toBe(3);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
  });

  it("sets no live region of its own", () => {
    const { container } = render(<Callout tone="warning">Part of the page.</Callout>);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(container.querySelector("[aria-live]")).toBeNull();
  });

  it("is an alert when the caller says it answers something the visitor did", () => {
    render(
      <Callout tone="danger" role="alert">
        This file could not be read as a PDF.
      </Callout>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "This file could not be read as a PDF.",
    );
  });

  it("makes its title a heading at the level asked for", () => {
    render(
      <Callout
        tone="danger"
        title="RedactNest cannot run in this browser"
        headingLevel={2}
      >
        WebAssembly is unavailable.
      </Callout>,
    );

    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "RedactNest cannot run in this browser",
      }),
    ).toBeInTheDocument();
  });

  it("keeps its title a plain paragraph when no level is given", () => {
    render(
      <Callout tone="info" title="Free plan covers the first 3 pages.">
        Upgrade to redact the rest.
      </Callout>,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Free plan covers the first 3 pages.").tagName).toBe("P");
  });

  it("offers its action as a real, reachable button", () => {
    render(
      <Callout tone="danger" action={<Button variant="secondary">Try again</Button>}>
        The PDF engine stopped unexpectedly.
      </Callout>,
    );

    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  /** Spec 0007, AC-14: a run refusal says what kind of thing it is first. */
  it("puts its lead above the title, outside the heading", () => {
    render(
      <Callout
        tone="danger"
        lead="Your last run was stopped"
        title="A ticked item is set at too steep an angle"
        headingLevel={2}
        data-testid="callout"
      >
        RedactNest made no file.
      </Callout>,
    );

    const heading = screen.getByRole("heading", {
      level: 2,
      name: "A ticked item is set at too steep an angle",
    });
    const lead = screen.getByText("Your last run was stopped");
    expect(
      lead.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(heading).not.toContainElement(lead);
  });

  /** Spec 0007, *Focus*: a heading a page can move focus to, out of the tab order. */
  it("makes a heading title focusable by script when given a ref, and only then", async () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <>
        <Callout tone="danger" title="Focused" headingLevel={2} titleRef={ref} />
        <Callout tone="danger" title="Plain" headingLevel={2} />
      </>,
    );

    const focused = screen.getByRole("heading", { name: "Focused" });
    expect(ref.current).toBe(focused);
    expect(focused).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("heading", { name: "Plain" })).not.toHaveAttribute(
      "tabindex",
    );

    focused.focus();
    expect(focused).toHaveFocus();
    await userEvent.setup().tab();
    expect(focused).not.toHaveFocus();
  });

  it.each(["warning", "info", "danger"] as const)(
    "passes axe in the %s tone",
    async (tone) => {
      const { container } = render(
        <Callout
          tone={tone}
          title="A title"
          headingLevel={2}
          role="alert"
          action={<Button variant="secondary">Act</Button>}
        >
          A body.
        </Callout>,
      );

      await expectNoAxeViolations(container);
    },
  );
});
