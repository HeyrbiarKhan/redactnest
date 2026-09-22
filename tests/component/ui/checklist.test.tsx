/**
 * The review vocabulary: `Checkbox`, `CountBadge`, `ChecklistGroup` and
 * `ChecklistItem`. Spec 0003, AC-9 and AC-10.
 *
 * None of these is placed on a page yet, so this file is their only proof until
 * feature 8 puts them on `/tool` and extends the browser suite to them. jsdom
 * loads no CSS, so where the spec's promise is a style (wrapping, the forced
 * colours fallback) the class is asserted rather than the computed style.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Mail } from "lucide-react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Checkbox } from "@/ui/checkbox";
import { ChecklistGroup } from "@/ui/checklist-group";
import { ChecklistItem } from "@/ui/checklist-item";
import { CountBadge } from "@/ui/count-badge";

import { expectNoAxeViolations } from "../../setup/component";

const ITEMS = { one: "item", other: "items" } as const;

/** A row the way feature 8 will hold it: the tick set lives in the caller. */
function Row(props: { text: string; before?: string; after?: string; page?: number }) {
  const [checked, setChecked] = useState(true);
  return (
    <ul>
      <ChecklistItem
        id="match-1"
        text={props.text}
        before={props.before ?? ""}
        after={props.after ?? ""}
        page={props.page ?? 1}
        checked={checked}
        onCheckedChange={setChecked}
      />
    </ul>
  );
}

describe("Checkbox", () => {
  function Labelled(props: { indeterminate?: boolean; onChange?: (v: boolean) => void }) {
    const [checked, setChecked] = useState(false);
    return (
      <>
        <span id="name">Emails</span>
        <Checkbox
          id="box"
          checked={checked}
          indeterminate={props.indeterminate}
          onCheckedChange={(next) => {
            setChecked(next);
            props.onChange?.(next);
          }}
          aria-labelledby="name"
        />
      </>
    );
  }

  it("is a native checkbox, named by what the caller points it at", () => {
    render(<Labelled />);

    const box = screen.getByRole("checkbox", { name: "Emails" });
    expect(box.tagName).toBe("INPUT");
    expect(box).not.toBeChecked();
  });

  it("toggles with a click and with Space, reporting the new state", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Labelled onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Emails" });

    await user.click(box);
    expect(box).toBeChecked();

    await user.tab();
    await user.tab({ shift: true });
    await user.keyboard(" ");
    expect(box).not.toBeChecked();
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it("sets the indeterminate property, which exists only in the DOM", () => {
    render(<Labelled indeterminate />);

    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "Emails" });
    expect(box.indeterminate).toBe(true);
    expect(box).toBePartiallyChecked();
  });

  it("hands the box back to the browser in forced colours and hides the drawn tick", () => {
    const { container } = render(<Labelled />);

    expect(screen.getByRole("checkbox")).toHaveClass("forced-colors:appearance-auto");
    for (const tick of container.querySelectorAll("svg")) {
      expect(tick).toHaveClass("forced-colors:hidden!");
      expect(tick).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("passes axe checked, unchecked and indeterminate", async () => {
    const { container } = render(
      <>
        <span id="a">One</span>
        <Checkbox id="one" checked onCheckedChange={() => {}} aria-labelledby="a" />
        <span id="b">Two</span>
        <Checkbox
          id="two"
          checked={false}
          onCheckedChange={() => {}}
          aria-labelledby="b"
        />
        <span id="c">Three</span>
        <Checkbox
          id="three"
          checked={false}
          indeterminate
          onCheckedChange={() => {}}
          aria-labelledby="c"
        />
      </>,
    );

    await expectNoAxeViolations(container);
  });
});

describe("CountBadge", () => {
  it("announces the count with its noun", () => {
    const { container } = render(<CountBadge count={2} noun={ITEMS} tone="accent" />);

    expect(container).toHaveTextContent("2 items");
  });

  it("uses the singular for one", () => {
    const { container } = render(<CountBadge count={1} noun={ITEMS} tone="neutral" />);

    expect(container).toHaveTextContent("1 item");
    expect(container).not.toHaveTextContent("items");
  });

  it("shows only the number when compact, and still says the noun", () => {
    const { container } = render(
      <CountBadge count={2} noun={ITEMS} tone="neutral" compact />,
    );

    // The whole of what a screen reader reads, never a bare "2".
    expect(container).toHaveTextContent("2 items");
    expect(screen.getByText("items", { exact: false })).toHaveClass("sr-only");
  });

  it("passes axe in both tones", async () => {
    const { container } = render(
      <>
        <CountBadge count={5} noun={ITEMS} tone="accent" />
        <CountBadge count={3} noun={ITEMS} tone="neutral" compact />
      </>,
    );

    await expectNoAxeViolations(container);
  });
});

describe("ChecklistGroup", () => {
  function Group() {
    return (
      <ChecklistGroup
        icon={Mail}
        label="Email addresses"
        count={2}
        noun={{ one: "email address", other: "email addresses" }}
      >
        <li>alex@example.com</li>
        <li>hr@example.com</li>
      </ChecklistGroup>
    );
  }

  it("is open on first render", () => {
    const { container } = render(<Group />);

    expect(container.querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("alex@example.com")).toBeVisible();
  });

  /**
   * A browser turns Enter and Space on a focused summary into its activation,
   * which is a click, and that click toggles the group. jsdom runs the click's
   * toggle but not the key mapping, so the toggle is driven by the click here
   * and the keys themselves get their proof when feature 8 places a group on
   * `/tool` and extends the browser suite to it.
   */
  it("is reached with Tab, and closes and opens again from its summary", async () => {
    const user = userEvent.setup();
    const { container } = render(<Group />);
    const details = container.querySelector("details");
    const summary = container.querySelector("summary");
    if (!summary) throw new Error("no summary rendered");

    await user.tab();
    expect(summary).toHaveFocus();

    await user.click(summary);
    expect(details).not.toHaveAttribute("open");

    await user.click(summary);
    expect(details).toHaveAttribute("open");
  });

  it("names the group with its count and noun, never a bare number", () => {
    const { container } = render(<Group />);

    expect(container.querySelector("summary")).toHaveTextContent(
      "Email addresses2 email addresses",
    );
  });

  it("holds no interactive element in its summary", () => {
    const { container } = render(<Group />);

    expect(
      container.querySelector(
        "summary :is(a, button, input, select, textarea, [tabindex])",
      ),
    ).toBeNull();
  });

  it("hides its icon and its chevron, and turns the chevron with the group", () => {
    const { container } = render(<Group />);

    const icons = [...container.querySelectorAll("summary svg")];
    expect(icons).toHaveLength(2);
    for (const icon of icons) expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icons.at(-1)).toHaveClass("group-open:rotate-180");
  });

  it("passes axe", async () => {
    const { container } = render(<Group />);

    await expectNoAxeViolations(container);
  });
});

describe("ChecklistItem", () => {
  it("is named by the match alone", () => {
    render(<Row text="alex@example.com" before="Email: " after=" (work)" />);

    expect(screen.getByRole("checkbox", { name: "alex@example.com" })).toBeChecked();
  });

  it("is described by its page and the text around the match", () => {
    render(<Row text="alex@example.com" before="Email: " after=" (work)" page={3} />);

    expect(screen.getByRole("checkbox")).toHaveAccessibleDescription(
      "Page 3 …Email: alex@example.com (work)…",
    );
  });

  it("wraps the match in a mark, so the highlight is an element and not only a colour", () => {
    const { container } = render(<Row text="alex@example.com" before="Email: " />);

    const mark = container.querySelector("mark");
    expect(mark).toHaveTextContent("alex@example.com");
    expect(mark).toHaveClass("font-semibold");
  });

  it("shows an ellipsis only on a side that has context", () => {
    const { container } = render(<Row text="alex@example.com" after=" is my email" />);

    const context = container.querySelector("mark")?.parentElement;
    expect(context?.textContent).toBe("alex@example.com is my email…");
  });

  it("lets both lines wrap anywhere, so a long unbroken value is never cut off", () => {
    const long = "a.very.long.unbroken.address.that.goes.on@example-company.co.uk";
    const { container } = render(<Row text={long} />);

    const name = screen.getByText(long, { selector: "span" });
    const context = container.querySelector("mark")?.parentElement;
    expect(name).toHaveClass("wrap-anywhere");
    expect(context).toHaveClass("wrap-anywhere");
  });

  it("is toggled by a click anywhere on the row, through its label", async () => {
    const user = userEvent.setup();
    render(<Row text="alex@example.com" page={2} />);

    await user.click(screen.getByText("Page 2"));

    expect(screen.getByRole("checkbox", { name: "alex@example.com" })).not.toBeChecked();
  });

  it("renders document text as text, never as markup", () => {
    const { container } = render(<Row text="<b>bold</b>" before="<img src=x>" />);

    expect(container.querySelector("b, img")).toBeNull();
    expect(screen.getByRole("checkbox", { name: "<b>bold</b>" })).toBeInTheDocument();
  });

  it("passes axe", async () => {
    const { container } = render(
      <Row text="alex@example.com" before="Email: " after=" (work)" />,
    );

    await expectNoAxeViolations(container);
  });
});
