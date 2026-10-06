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

  describe("the danger variants (spec 0013, AC-35)", () => {
    it("fills danger with the red and white words, darker under the pointer", () => {
      render(<Button variant="danger">Delete my account for good</Button>);

      // The edge is transparent, as on `primary`, so forced colours draws it.
      expect(screen.getByRole("button")).toHaveClass(
        "bg-danger-ink",
        "text-on-accent",
        "border-transparent",
        "hover:bg-danger-strong",
      );
    });

    it("outlines danger-secondary in the red on white, light red under the pointer", () => {
      render(<Button variant="danger-secondary">Delete account</Button>);

      expect(screen.getByRole("button")).toHaveClass(
        "border-danger-ink",
        "text-danger-ink",
        "bg-surface",
        "hover:bg-danger-bg",
      );
    });

    it.each([
      ["danger", "primary"],
      ["danger-secondary", "secondary"],
    ] as const)("gives %s the box, sizes and disabled look of %s", (danger, plain) => {
      const shared = (classes: string) =>
        classes
          .split(" ")
          .filter((name) =>
            /^(min-h|px|py|text-(small|body)$|font|rounded|disabled:)/.test(name),
          );
      for (const size of ["md", "lg"] as const) {
        const { unmount } = render(
          <>
            <Button variant={danger} size={size}>
              Red
            </Button>
            <Button variant={plain} size={size}>
              Plain
            </Button>
          </>,
        );
        expect(shared(screen.getByRole("button", { name: "Red" }).className)).toEqual(
          shared(screen.getByRole("button", { name: "Plain" }).className),
        );
        unmount();
      }
    });
  });

  describe("busy (spec 0013, AC-34)", () => {
    it("stays a focusable button, aria-disabled and never disabled, named by its words", () => {
      const { container } = render(
        <Button busy variant="danger" icon={Upload}>
          Deleting your account
        </Button>,
      );

      const button = screen.getByRole("button", { name: "Deleting your account" });
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toHaveAttribute("disabled");

      button.focus();
      expect(button).toHaveFocus();

      // The spinner in place of the icon, hidden, in the button's own colour.
      const spinner = screen.getByTestId("spinner");
      expect(button).toContainElement(spinner);
      expect(spinner).toHaveAttribute("aria-hidden", "true");
      expect(container.querySelectorAll("svg")).toHaveLength(1);
      expect(spinner.querySelector("path")).toHaveClass("stroke-current");
    });

    it("drops every press: a click, Enter and Space call no onClick", async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(
        <Button busy onClick={onClick}>
          Signing you out
        </Button>,
      );

      const button = screen.getByRole("button", { name: "Signing you out" });
      await user.click(button);
      await user.keyboard("{Enter}");
      await user.keyboard(" ");

      expect(onClick).not.toHaveBeenCalled();
      expect(button).toHaveFocus();
    });

    it("submits no form it sits in", async () => {
      const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
      const user = userEvent.setup();
      render(
        <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
          <Button busy type="submit">
            Sending
          </Button>
        </form>,
      );

      await user.click(screen.getByRole("button", { name: "Sending" }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it.each(["primary", "secondary", "danger", "danger-secondary"] as const)(
      "keeps the %s rest colours under the pointer",
      (variant) => {
        render(
          <>
            <Button variant={variant}>At rest</Button>
            <Button variant={variant} busy>
              Busy
            </Button>
          </>,
        );

        const rest = screen.getByRole("button", { name: "At rest" });
        const busy = screen.getByRole("button", { name: "Busy" });
        const hover = [...rest.classList].filter((name) => name.startsWith("hover:"));
        expect(hover).toHaveLength(1);
        expect(busy).not.toHaveClass(hover[0] ?? "");
        // Everything else is the same, so it looks exactly as it did at rest.
        expect([...busy.classList]).toEqual(
          [...rest.classList].filter((name) => !name.startsWith("hover:")),
        );
      },
    );

    it("changes nothing without it", async () => {
      const onClick = vi.fn();
      render(
        <Button variant="danger" icon={Upload} onClick={onClick}>
          Delete my account for good
        </Button>,
      );

      const button = screen.getByRole("button");
      expect(button).not.toHaveAttribute("aria-disabled");
      expect(screen.queryByTestId("spinner")).toBeNull();
      await userEvent.click(button);
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("passes axe", async () => {
      const { container } = render(
        <Button busy variant="danger">
          Deleting your account
        </Button>,
      );

      await expectNoAxeViolations(container);
    });
  });

  it.each(["primary", "secondary", "link", "danger", "danger-secondary"] as const)(
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
