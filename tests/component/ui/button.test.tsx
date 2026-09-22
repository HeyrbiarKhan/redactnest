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
import { createElement, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/ui/button";

/**
 * The real `next/link`, counted. With no app router mounted, jsdom's `next/link`
 * leaves a click alone just as a plain `a` does, so the click alone cannot tell
 * the two apart. Whether `Button` went through `next/link` at all can.
 */
const linkRenders = vi.hoisted(() => ({ count: 0 }));

vi.mock("next/link", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/link")>();
  const RealLink = actual.default;
  function CountedLink(props: ComponentProps<typeof RealLink>) {
    linkRenders.count += 1;
    return createElement(RealLink, props);
  }
  return { ...actual, default: CountedLink };
});

beforeEach(() => {
  linkRenders.count = 0;
});

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

  describe("with reload (AC-21)", () => {
    /**
     * Was the click left to the browser?
     *
     * In a browser, `next/link` takes over a navigation by calling
     * `preventDefault` on the click, so an untouched click is what a real page
     * load looks like. The link count above is what separates the two in jsdom.
     * Read on `window`, after React's own root listener has run, and then
     * cancelled, because jsdom cannot navigate.
     */
    async function clickIsLeftToTheBrowser(link: HTMLElement): Promise<boolean> {
      let untouched = false;
      const observe = (event: MouseEvent) => {
        untouched = !event.defaultPrevented;
        event.preventDefault();
      };
      window.addEventListener("click", observe);
      try {
        await userEvent.setup().click(link);
      } finally {
        window.removeEventListener("click", observe);
      }
      return untouched;
    }

    it("renders a plain link whose click is a real page load", async () => {
      render(
        <Button href="/tool" reload>
          Redact a PDF
        </Button>,
      );

      const link = screen.getByRole("link", { name: "Redact a PDF" });
      expect(link).toHaveAttribute("href", "/tool");
      expect(link).not.toHaveAttribute("reload");
      expect(linkRenders.count).toBe(0);
      expect(await clickIsLeftToTheBrowser(link)).toBe(true);
    });

    it("still goes through next/link without it", () => {
      render(<Button href="/tool">Redact a PDF</Button>);

      // The contrast that makes the count above mean something.
      expect(linkRenders.count).toBeGreaterThan(0);
    });

    it("looks exactly like the same button without it", () => {
      render(
        <>
          <Button href="/tool" size="lg">
            Client
          </Button>
          <Button href="/tool" size="lg" reload>
            Page load
          </Button>
        </>,
      );

      expect(screen.getByRole("link", { name: "Page load" }).className).toBe(
        screen.getByRole("link", { name: "Client" }).className,
      );
    });

    it("refuses the props only next/link understands", () => {
      const element = (
        // @ts-expect-error `prefetch` is `next/link`'s, and a page load has no prefetch
        <Button href="/tool" reload prefetch={false}>
          Redact a PDF
        </Button>
      );

      // The proof is the compile time error above; this only keeps it in use.
      expect(element).toBeDefined();
    });
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
