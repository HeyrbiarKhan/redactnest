/**
 * `Button`, spec 0003, AC-5, AC-6 and AC-7.
 *
 * jsdom loads no CSS, so what is proved here is the element, its name and its
 * keyboard behaviour. The ring's computed style and the real box sizes are the
 * browser suite's, in `tests/e2e/design-system.spec.ts`.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Upload } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/ui/button";

import { expectNoAxeViolations } from "../../setup/component";

describe("Button", () => {
  it("renders a native button that submits nothing by default", () => {
    render(<Button>Start over</Button>);

    const button = screen.getByRole("button", { name: "Start over" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("keeps a type the caller asked for", () => {
    render(<Button type="submit">Send</Button>);

    expect(screen.getByRole("button", { name: "Send" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("is reached with Tab and pressed with Enter and Space", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Try again</Button>);

    await user.tab();
    expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it("hides its icon from assistive technology, so the name is the label alone", () => {
    const { container } = render(<Button icon={Upload}>Choose a PDF</Button>);

    expect(screen.getByRole("button")).toHaveAccessibleName("Choose a PDF");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("is a real link, not a button, when it navigates", () => {
    render(<Button href="/tool">Redact a PDF</Button>);

    const link = screen.getByRole("link", { name: "Redact a PDF" });
    expect(link).toHaveAttribute("href", "/tool");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("underlines the link variant, so it is never told apart by colour alone", () => {
    render(<Button variant="link">Upgrade</Button>);

    expect(screen.getByRole("button", { name: "Upgrade" })).toHaveClass("underline");
  });

  it("drops out of the tab order when disabled, as a native button does", async () => {
    const user = userEvent.setup();
    render(
      <>
        <Button disabled>Redact and download</Button>
        <Button>Start over</Button>
      </>,
    );

    await user.tab();

    expect(screen.getByRole("button", { name: "Redact and download" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start over" })).toHaveFocus();
  });

  it.each([
    ["md", "min-h-10"],
    ["lg", "min-h-12"],
  ] as const)("is at least as tall as size %s promises", (size, height) => {
    render(<Button size={size}>Go</Button>);

    // A minimum, never a fixed height, so a text spacing override grows it.
    expect(screen.getByRole("button")).toHaveClass(height);
  });

  it.each(["primary", "secondary", "link"] as const)(
    "passes axe as the %s variant",
    async (variant) => {
      const { container } = render(
        <>
          <Button variant={variant}>As a button</Button>
          <Button variant={variant} href="/tool">
            As a link
          </Button>
        </>,
      );

      await expectNoAxeViolations(container);
    },
  );
});
