/**
 * The two primitives spec 0017 adds for the custom terms panel (spec 0003,
 * *Primitives*, as spec 0017 amends it): `TextField`, a labelled one line
 * field, and `Chip`, one item of a list with its state and a remove button.
 * And `Button`'s `unavailable` state, which Make takes while a term waits
 * (spec 0017, AC-18).
 *
 * jsdom computes no colour, so what is proved is which token each part takes;
 * the colours themselves are the contrast test's.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CircleAlert } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { TextField } from "@/ui/text-field";

import { expectNoAxeViolations } from "../../setup/component";

describe("TextField", () => {
  it("is a native text input named by its visible label", async () => {
    const { container } = render(<TextField id="field" label="Add a name" />);

    const input = screen.getByRole("textbox", { name: "Add a name" });
    expect(input).toHaveAttribute("type", "text");
    expect(input).toHaveAttribute("id", "field");
    expect(input).toHaveClass("border-border-strong", "bg-surface", "min-h-10");
    await expectNoAxeViolations(container);
  });

  it("passes every attribute the caller sets to the input", () => {
    render(
      <TextField
        id="field"
        label="Add a name"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        readOnly
      />,
    );

    const input = screen.getByRole("textbox", { name: "Add a name" });
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "off");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("readonly");
    expect(input).not.toHaveAttribute("name");
  });

  it("takes the disabled look every control shares when disabled", () => {
    render(<TextField id="field" label="Add a name" disabled />);

    expect(screen.getByRole("textbox")).toHaveClass(
      "disabled:border-border",
      "disabled:bg-subtle",
      "disabled:text-ink-muted",
    );
    expect(screen.getByRole("textbox")).toBeDisabled();
  });

  it("sets its action beside the field", async () => {
    const { container } = render(
      <TextField id="field" label="Add a name" action={<Button>Add</Button>} />,
    );

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it("hands typing to the caller", async () => {
    const onChange = vi.fn();
    render(<TextField id="field" label="Add a name" onChange={onChange} />);

    await userEvent.type(screen.getByRole("textbox"), "Acme");
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe("Chip", () => {
  function list(chip: React.ReactNode) {
    return render(<ul role="list">{chip}</ul>);
  }

  it("is a list item with its label, its state and a remove button named for it", async () => {
    const onRemove = vi.fn();
    const { container } = list(
      <Chip
        label="Acme Ltd"
        status="3 matches"
        removeLabel="Remove Acme Ltd"
        onRemove={onRemove}
      />,
    );

    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("Acme Ltd");
    expect(item).toHaveTextContent("3 matches");
    expect(item).toHaveClass("bg-accent-soft");

    await userEvent.click(screen.getByRole("button", { name: "Remove Acme Ltd" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });

  it("shows an icon beside a state, hidden from assistive technology", () => {
    list(
      <Chip
        label="Acme Ltd"
        status="Not searched"
        statusIcon={CircleAlert}
        removeLabel="Remove Acme Ltd"
        onRemove={() => {}}
      />,
    );

    const icons = screen
      .getByRole("listitem")
      .querySelectorAll("svg[aria-hidden='true']");
    // The state's icon and the remove button's cross.
    expect(icons).toHaveLength(2);
  });

  it("shows a spinner while busy", () => {
    list(
      <Chip
        label="Acme Ltd"
        busy
        status="Searching"
        removeLabel="Remove Acme Ltd"
        onRemove={() => {}}
      />,
    );

    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(screen.getByRole("listitem")).toHaveTextContent("Searching");
  });

  it("disables its remove button when asked, so a press does nothing", () => {
    const onRemove = vi.fn();
    list(
      <Chip
        label="Acme Ltd"
        removeLabel="Remove Acme Ltd"
        onRemove={onRemove}
        removeDisabled
      />,
    );

    const button = screen.getByRole("button", { name: "Remove Acme Ltd" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("renders the label as text, never as markup", () => {
    list(
      <Chip label="<b>Acme</b>" removeLabel="Remove <b>Acme</b>" onRemove={() => {}} />,
    );

    expect(screen.getByRole("listitem")).toHaveTextContent("<b>Acme</b>");
    expect(screen.getByRole("listitem").querySelector("b")).toBeNull();
  });
});

describe("Button, unavailable (spec 0017, AC-18)", () => {
  it("stays in the tab order, says so, drops every press and takes the disabled look", async () => {
    const onClick = vi.fn();
    const { container } = render(
      <>
        <p id="why">Waiting for the search.</p>
        <Button unavailable aria-describedby="why" onClick={onClick}>
          Make a cleaned copy
        </Button>
      </>,
    );

    const button = screen.getByRole("button", { name: "Make a cleaned copy" });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription("Waiting for the search.");
    expect(button).toHaveClass("bg-subtle", "text-ink-muted");
    expect(button).not.toHaveClass("bg-accent");

    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    await expectNoAxeViolations(container);
  });
});
