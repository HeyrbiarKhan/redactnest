/**
 * `Avatar` and `DropdownMenu`, spec 0026, AC-4, AC-22 and AC-23: the circle
 * says nothing to assistive technology because its button carries the name,
 * and the menu is Radix's, never modal, with every way out a plain link.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreditCard, LogOut, User } from "lucide-react";
import { describe, expect, it } from "vitest";

import { Avatar } from "@/ui/avatar";
import { DropdownMenu, type DropdownMenuEntry } from "@/ui/dropdown-menu";

import { expectNoAxeViolations } from "../../setup/component";

describe("Avatar", () => {
  it("shows the letter it is given, hidden from assistive technology", async () => {
    const { container } = render(<Avatar initial="A" />);

    const circle = container.firstElementChild;
    expect(circle).toHaveAttribute("aria-hidden", "true");
    expect(circle).toHaveTextContent("A");
    expect(circle).toHaveClass("bg-accent", "text-on-accent", "ring-surface", "size-8.5");
    await expectNoAxeViolations(container);
  });

  it("shows the person icon when there is no letter", () => {
    const { container } = render(<Avatar initial={null} />);

    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.firstElementChild).toHaveTextContent("");
  });

  it("is a plain muted circle with nothing in it while pending", () => {
    const { container } = render(<Avatar initial="A" state="pending" />);

    const circle = container.firstElementChild;
    expect(circle).toHaveClass("bg-muted");
    expect(circle).toBeEmptyDOMElement();
  });
});

const ENTRIES: readonly DropdownMenuEntry[] = [
  { kind: "link", href: "/account", label: "Account", icon: User },
  {
    kind: "link",
    href: "/account/billing",
    label: "Billing",
    icon: CreditCard,
    newTab: "opens in a new tab",
  },
  { kind: "separator" },
  { kind: "link", href: "/sign-out", label: "Sign out", icon: LogOut },
];

/**
 * Radix opens on `pointerdown`, which jsdom does not deliver as a browser
 * does, so these open it from the keyboard; the pointer is the browser
 * suite's to check.
 */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  screen.getByRole("button", { name: "Your account" }).focus();
  await user.keyboard("{Enter}");
  return screen.findByRole("menu");
}

function renderMenu() {
  return render(
    <>
      <p aria-live="polite">Opening your PDF</p>
      <DropdownMenu
        trigger={<Avatar initial="A" />}
        triggerLabel="Your account"
        header={<p>someone@example.com</p>}
        entries={ENTRIES}
        data-testid="account-menu"
      />
    </>,
  );
}

describe("DropdownMenu", () => {
  it("is a button named by the caller's words, shut at first", async () => {
    const { container } = renderMenu();

    const trigger = screen.getByRole("button", { name: "Your account" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("opens from the keyboard, its items plain links in order, the header above them", async () => {
    const user = userEvent.setup();
    renderMenu();

    screen.getByRole("button", { name: "Your account" }).focus();
    await user.keyboard("{Enter}");

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByText("someone@example.com")).toBeInTheDocument();
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.tagName)).toEqual(["A", "A", "A"]);
    expect(items.map((item) => item.getAttribute("href"))).toEqual([
      "/account",
      "/account/billing",
      "/sign-out",
    ]);
    expect(within(menu).getAllByRole("separator")).toHaveLength(2);
  });

  it("opens a new tab item in a new tab and says so after its label", async () => {
    const user = userEvent.setup();
    renderMenu();

    await openMenu(user);
    const billing = screen.getByRole("menuitem", { name: /Billing/ });

    expect(billing).toHaveAttribute("target", "_blank");
    expect(billing).toHaveAttribute("rel", "noopener noreferrer");
    expect(billing).toHaveAccessibleName("Billing (opens in a new tab)");
    expect(screen.getByRole("menuitem", { name: "Account" })).not.toHaveAttribute(
      "target",
    );
  });

  /** `modal={false}`: the page's polite regions stay in the accessibility tree. */
  it("never hides the rest of the page while open", async () => {
    const user = userEvent.setup();
    renderMenu();

    await openMenu(user);

    expect(screen.getByText("Opening your PDF").closest("[aria-hidden]")).toBeNull();
  });

  it("shuts on Escape and gives focus back to its button", async () => {
    const user = userEvent.setup();
    renderMenu();

    const trigger = screen.getByRole("button", { name: "Your account" });
    await openMenu(user);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it("passes axe while open", async () => {
    const user = userEvent.setup();
    renderMenu();

    await openMenu(user);

    await expectNoAxeViolations(document.body);
  });
});
