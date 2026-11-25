/**
 * The layout pieces and the quiet ones: `Card`, `PageContainer`, `SiteHeader`,
 * `SiteFooter`, `LinkGroup`, `SkipLink`, `IconCircle`, `Spinner` and
 * `EmptyState`. Spec 0003, AC-5, AC-14, AC-16 and AC-18, and spec 0013, AC-7
 * and AC-8.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, Inbox } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { CountBadge } from "@/ui/count-badge";
import { EmptyState } from "@/ui/empty-state";
import { LinkGroup } from "@/ui/link-group";
import { IconCircle } from "@/ui/icon-circle";
import { PageContainer } from "@/ui/page-container";
import { SiteFooter } from "@/ui/site-footer";
import { SITE_MENU_ID, SiteHeader } from "@/ui/site-header";
import { SkipLink } from "@/ui/skip-link";
import { Spinner } from "@/ui/spinner";
import { SummaryList } from "@/ui/summary-list";

import { expectNoAxeViolations } from "../../setup/component";

describe("Card", () => {
  it("is a region named by its own heading when it has a title", () => {
    render(
      <Card title="Document opened">
        <p>This document has 2 pages.</p>
      </Card>,
    );

    const region = screen.getByRole("region", { name: "Document opened" });
    expect(region.tagName).toBe("SECTION");
    expect(
      screen.getByRole("heading", { level: 2, name: "Document opened" }),
    ).toBeVisible();
  });

  it("uses the heading level asked for, and places the badge in the heading row", () => {
    render(
      <Card
        title="Detected items"
        headingLevel={3}
        badge={
          <CountBadge count={5} noun={{ one: "item", other: "items" }} tone="accent" />
        }
      >
        <p>Body</p>
      </Card>,
    );

    const heading = screen.getByRole("heading", { level: 3, name: "Detected items" });
    expect(heading.parentElement).toHaveTextContent("5 items");
  });

  it("is not a named region without a title", () => {
    render(
      <Card>
        <p>Body</p>
      </Card>,
    );

    expect(screen.queryByRole("region")).not.toBeInTheDocument();
  });

  /** Spec 0007, *Focus*: a result card's heading takes focus when it appears. */
  it("makes its heading focusable by script when given a ref, and only then", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(
      <>
        <Card title="Your redacted file is ready" headingRef={ref}>
          <p>Body</p>
        </Card>
        <Card title="Document opened">
          <p>Body</p>
        </Card>
      </>,
    );

    const heading = screen.getByRole("heading", { name: "Your redacted file is ready" });
    expect(ref.current).toBe(heading);
    expect(heading).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("heading", { name: "Document opened" })).not.toHaveAttribute(
      "tabindex",
    );
    // Still the region's name.
    expect(
      screen.getByRole("region", { name: "Your redacted file is ready" }),
    ).toContainElement(heading);
  });

  /** Spec 0013, AC-11: the home page's cards, after your mockup. */
  it("sits 28 pixels in and 24 between its parts when spacious, 20 and 16 otherwise", () => {
    render(
      <>
        <Card data-testid="plain">
          <p>Body</p>
        </Card>
        <Card data-testid="spacious" spacious>
          <p>Body</p>
        </Card>
      </>,
    );

    expect(screen.getByTestId("plain")).toHaveClass("p-5", "gap-4");
    expect(screen.getByTestId("plain")).not.toHaveClass("p-7", "gap-6");
    expect(screen.getByTestId("spacious")).toHaveClass("p-7", "gap-6", "rounded-card");
    expect(screen.getByTestId("spacious")).not.toHaveClass("p-5", "gap-4");
  });

  it("passes axe", async () => {
    const { container } = render(
      <Card title="Document opened">
        <p>This document has 2 pages.</p>
      </Card>,
    );

    await expectNoAxeViolations(container);
  });
});

/** Spec 0007, AC-11. Spec 0003's summary panel, as a definition list. */
describe("SummaryList", () => {
  const ITEMS = [
    { term: "Removed", description: "4 email addresses and 2 phone numbers" },
    { term: "Left in the file", description: "1 phone number you left unticked." },
  ];

  it("pairs each term with its description in a native definition list", () => {
    render(<SummaryList items={ITEMS} data-testid="summary" />);

    const list = screen.getByTestId("summary");
    expect(list.tagName).toBe("DL");
    const terms = [...list.querySelectorAll("dt")].map((term) => term.textContent);
    const descriptions = [...list.querySelectorAll("dd")].map((d) => d.textContent);
    expect(terms).toEqual(["Removed", "Left in the file"]);
    expect(descriptions).toEqual([
      "4 email addresses and 2 phone numbers",
      "1 phone number you left unticked.",
    ]);
    // Each pair in its own row, term first.
    for (const term of list.querySelectorAll("dt")) {
      expect(term.nextElementSibling?.tagName).toBe("DD");
    }
  });

  it("renders a description as text, never as markup", () => {
    const { container } = render(
      <SummaryList items={[{ term: "Removed", description: "<b>bold</b>" }]} />,
    );

    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText("<b>bold</b>")).toBeInTheDocument();
  });

  it("passes axe", async () => {
    const { container } = render(<SummaryList items={ITEMS} />);

    await expectNoAxeViolations(container);
  });
});

describe("PageContainer", () => {
  it.each([
    ["narrow", "max-w-narrow"],
    ["wide", "max-w-wide"],
  ] as const)("caps the %s width with its own token", (width, token) => {
    render(
      <PageContainer width={width}>
        <p>Content</p>
      </PageContainer>,
    );

    expect(screen.getByText("Content").parentElement).toHaveClass(
      token,
      "px-4",
      "sm:px-6",
    );
  });
});

describe("SiteHeader", () => {
  it("is the banner landmark, with the lockup linking home by name", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    const home = screen.getByRole("link", { name: "RedactNest" });
    expect(home).toHaveAttribute("href", "/");
    // A plain link, never `next/link`, so leaving `/tool` fires `pagehide`.
    expect(home.tagName).toBe("A");
    expect(home.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  /**
   * Spec 0024, AC-14, *The lockup at narrow widths*: the row is the lockup's
   * nearest container, so the lockup steps down a size in a row under 10rem.
   */
  it("makes the lockup's row its container", () => {
    render(<SiteHeader />);

    const row = screen.getByRole("link", { name: "RedactNest" }).parentElement
      ?.parentElement;
    expect(row?.parentElement).toBe(screen.getByRole("banner"));
    expect(row).toHaveClass("@container");
  });

  /** Spec 0013, AC-7: lockup, nav, account, then the action. */
  it("renders its slots in page order", () => {
    render(
      <SiteHeader
        nav={
          <nav aria-label="Site">
            <a href="/pricing">Pricing</a>
          </nav>
        }
        menuLabel="Menu"
        account={<a href="/account">Account</a>}
        action={<Button href="/tool">Try it free</Button>}
      />,
    );

    expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
      "RedactNest",
      "Pricing",
      "Account",
      "Try it free",
    ]);
  });

  /**
   * Spec 0013, AC-7: below `sm` the lockup takes the first row alone, and from
   * `sm` the account link and the action sit together at the right.
   */
  it("gives the lockup its own row below sm, and pushes the end group right from sm", () => {
    render(<SiteHeader account={<a href="/account">Account</a>} />);

    const home = screen.getByRole("link", { name: "RedactNest" });
    expect(home.parentElement).toHaveClass("w-full", "sm:w-auto");
    expect(screen.getByRole("link", { name: "Account" }).parentElement).toHaveClass(
      "sm:ml-auto",
    );
  });

  /**
   * Feature 28, as spec 0026 child 0001, AC-27 amends it: with a nav, the nav
   * and the account part sit in the browser's own popover, which the menu
   * button opens, while the action stays in the row at every width; from `sm`
   * the popover has no box, so they sit in the header's row.
   */
  it("puts the nav and the account part in a menu its button opens, the action beside it", () => {
    render(
      <SiteHeader
        nav={
          <nav aria-label="Site">
            <a href="/pricing">Pricing</a>
          </nav>
        }
        menuLabel="Menu"
        account={<a href="/account">Account</a>}
        action={<Button href="/tool">Try it free</Button>}
      />,
    );

    const button = screen.getByRole("button", { name: "Menu" });
    expect(button).toHaveAttribute("popovertarget", SITE_MENU_ID);
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const menu = document.getElementById(SITE_MENU_ID);
    expect(menu).toHaveAttribute("popover", "auto");
    expect(menu).toHaveClass("sm:not-open:contents");
    expect(
      within(menu as HTMLElement)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["Pricing", "Account"]);
    // The action is outside the menu, between it and the button, so from `sm`
    // the row reads lockup, nav, account, action in page order. Below `sm` the
    // browser places an open popover's links right after the button that
    // opened it in the tab order, whatever their place in the page.
    const action = screen.getByRole("link", { name: "Try it free" });
    expect(menu).not.toContainElement(action);
    expect(
      (menu as HTMLElement).compareDocumentPosition(action) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      action.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * Feature 28, amending AC-7: the button is drawn only where the browser has
   * popovers, so no browser offers a button that does nothing (one without
   * them shows the links beneath the lockup instead); and from `sm` only
   * while the menu is still open, so a phone turned sideways can still close
   * it. Every browser the suite drives has popovers, so it can never see the
   * first half; this holds the rule itself, and `shell.spec.ts` the rest.
   */
  it("draws the menu button only where popovers work, and from sm only while the menu is open", () => {
    render(
      <SiteHeader
        nav={
          <nav aria-label="Site">
            <a href="/pricing">Pricing</a>
          </nav>
        }
        menuLabel="Menu"
      />,
    );

    expect(screen.getByRole("button", { name: "Menu" }).parentElement).toHaveClass(
      "hidden",
      "supports-[selector(:popover-open)]:flex",
      "sm:hidden",
      "sm:group-has-[:popover-open]:flex",
    );
    // `group-has` reads the header, so the header has to be the group.
    expect(screen.getByRole("banner")).toHaveClass("group");
  });

  it("has no menu without a nav, as with billing off", () => {
    render(<SiteHeader action={<Button href="/tool">Try it free</Button>} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.getElementById(SITE_MENU_ID)).toBeNull();
    expect(screen.getByRole("link", { name: "RedactNest" }).parentElement).toHaveClass(
      "w-full",
      "sm:w-auto",
    );
  });

  it("leaves out the end group when there is nothing to put in it", () => {
    const { container } = render(<SiteHeader />);

    expect(container.querySelector(".sm\:ml-auto")).toBeNull();
  });

  it("carries the action it is given", () => {
    render(<SiteHeader action={<Button href="/tool">Try it free</Button>} />);

    expect(screen.getByRole("link", { name: "Try it free" })).toHaveAttribute(
      "href",
      "/tool",
    );
  });

  /**
   * By default the bar is static, so it can never cover what has focus (spec
   * 0003, AC-14). The regex's word edges are written as escapes: the line
   * this replaces held two literal backspace characters, so it matched
   * nothing and held nothing.
   */
  it("is static unless the page asks, so by default it can never cover what has focus", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner").className).not.toMatch(/\b(sticky|fixed)\b/);
    expect(screen.getByRole("banner")).not.toHaveAttribute("data-sticky");
  });

  /**
   * The home page's sticky bar (spec 0003, AC-14, as the port of
   * `Main.dc.html` amends it): sticky only from `lg`, where the row is one
   * 4rem line, and marked `data-sticky`, which the scroll padding rule in
   * `globals.css` keys on, so focus always stops below it (WCAG 2.4.11,
   * technique C43). `tests/e2e/design-system.spec.ts` walks the focus.
   */
  it("sticks only from lg when asked, marked for the scroll padding that keeps focus clear", () => {
    render(<SiteHeader sticky />);
    const banner = screen.getByRole("banner");

    expect(banner).toHaveAttribute("data-sticky");
    const positioned = banner.className
      .split(/\s+/)
      .filter((name) => /(^|:)(sticky|fixed)$/.test(name));
    expect(positioned).toEqual(["lg:sticky"]);
    // The scroll padding rule itself is read in `tests/unit/brand-source.test.ts`.
  });

  it("passes axe", async () => {
    const { container } = render(
      <SiteHeader action={<Button href="/tool">Try it free</Button>} />,
    );

    await expectNoAxeViolations(container);
  });
});

/** Spec 0013, AC-8. */
describe("SiteFooter", () => {
  function Footer() {
    return (
      <SiteFooter
        brand={<div>PDF redaction in your browser.</div>}
        groups={
          <LinkGroup label="Legal">
            <li>
              <a href="/privacy">Privacy policy</a>
            </li>
          </LinkGroup>
        }
        notice={
          <p>
            <a href="https://example.invalid/source">Source code for this version</a>
          </p>
        }
      />
    );
  }

  it("is the content info landmark, holding what the layout passes in", () => {
    render(<Footer />);

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("PDF redaction in your browser.");
    expect(footer).toContainElement(screen.getByRole("navigation", { name: "Legal" }));
    expect(footer).toContainElement(
      screen.getByRole("link", { name: "Source code for this version" }),
    );
  });

  it("ends with the notice, across the full width", () => {
    render(<Footer />);

    const footer = screen.getByRole("contentinfo");
    const notice = screen.getByText("Source code for this version").closest("p");
    expect(footer.querySelector("p")).toBe(notice);
    const grid = notice?.parentElement?.parentElement;
    expect(grid?.lastElementChild).toBe(notice?.parentElement);
    expect(notice?.parentElement).toHaveClass("md:col-span-2");
  });

  /**
   * Spec 0024, AC-14, *The lockup at narrow widths*: the grid, never the
   * `footer` element, is the lockup's container. And AC-17, *The footer at
   * 200% text*: from `md` the brand column's floor is its own content, so the
   * groups wrap rather than lie over the word. jsdom computes no layout, so the
   * class is held here and the layout in `tests/e2e/design-system.spec.ts`.
   */
  it("makes the grid the lockup's container, its brand column never narrower than its content", () => {
    render(<Footer />);

    const footer = screen.getByRole("contentinfo");
    const grid = screen.getByText("PDF redaction in your browser.").parentElement
      ?.parentElement;
    expect(grid?.parentElement).toBe(footer);
    expect(grid).toHaveClass(
      "@container",
      "grid",
      "md:grid-cols-[minmax(min-content,1fr)_auto]",
    );
    expect(grid).not.toHaveClass("md:grid-cols-[minmax(0,1fr)_auto]");
    expect(footer).not.toHaveClass("@container");
  });

  it("passes axe", async () => {
    const { container } = render(<Footer />);

    await expectNoAxeViolations(container);
  });
});

/** Spec 0013, AC-8: a footer group's nav, its label and its list. */
describe("LinkGroup", () => {
  it("is a nav named by its label, shown once on screen and hidden from assistive technology", () => {
    const { container } = render(
      <LinkGroup label="Product">
        <li>
          <a href="/tool">Redact a PDF</a>
        </li>
      </LinkGroup>,
    );

    const nav = screen.getByRole("navigation", { name: "Product" });
    const label = nav.firstElementChild;
    expect(label).toHaveTextContent("Product");
    expect(label).toHaveAttribute("aria-hidden", "true");
    // Never a heading and never a paragraph (spec 0009's notice is `footer p`).
    expect(label?.tagName).toBe("DIV");
    expect(container.querySelector("h1, h2, h3, h4, p")).toBeNull();
    expect(within(nav).getByRole("list")).toHaveTextContent("Redact a PDF");
  });

  it("keeps the list role explicit, which Safari drops once the bullets go", () => {
    render(
      <LinkGroup label="Product">
        <li>
          <a href="/tool">Redact a PDF</a>
        </li>
      </LinkGroup>,
    );

    const nav = screen.getByRole("navigation", { name: "Product" });
    expect(within(nav).getByRole("list")).toHaveAttribute("role", "list");
  });

  it("passes axe", async () => {
    const { container } = render(
      <LinkGroup label="Product">
        <li>
          <a href="/tool">Redact a PDF</a>
        </li>
      </LinkGroup>,
    );

    await expectNoAxeViolations(container);
  });
});

describe("SkipLink", () => {
  function Page() {
    return (
      <>
        <SkipLink />
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          <Button>Choose a PDF</Button>
        </main>
      </>
    );
  }

  it("is the first thing Tab reaches, and points at main", async () => {
    render(<Page />);

    await userEvent.setup().tab();

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveFocus();
    expect(skip).toHaveAttribute("href", "#main");
  });

  it("is hidden until focused, and shown on focus", () => {
    render(<SkipLink />);

    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(skip).toHaveClass("sr-only", "focus:not-sr-only");
  });

  it("passes axe", async () => {
    const { container } = render(<Page />);

    await expectNoAxeViolations(container);
  });
});

describe("the decorative pieces", () => {
  it("hides an icon circle from assistive technology", () => {
    const { container } = render(<IconCircle icon={FileText} tone="accent" />);

    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  /** Spec 0013, AC-11: the defaults every existing caller relies on. */
  it("is a 48 pixel circle with a 20 pixel icon by default", () => {
    const { container } = render(<IconCircle icon={FileText} tone="accent" />);

    const circle = container.firstElementChild;
    expect(circle).toHaveClass(
      "size-12",
      "rounded-full",
      "bg-accent-soft",
      "text-accent",
    );
    expect(circle?.querySelector("svg")).toHaveClass("size-5");
  });

  /** Spec 0013, AC-11: the circles and the square tiles of the home page's cards. */
  it.each([
    ["md", "size-12", "size-5", "rounded-control"],
    ["lg", "size-16", "size-7", "rounded-control"],
  ] as const)(
    "at %s is %s with a %s icon, and its square shape is %s",
    (size, box, glyph, square) => {
      const { container } = render(
        <>
          <IconCircle icon={FileText} tone="accent" size={size} />
          <IconCircle icon={FileText} tone="accent" size={size} shape="square" />
        </>,
      );

      const [circle, tile] = [...container.children];
      expect(circle).toHaveClass(box, "rounded-full");
      expect(tile).toHaveClass(box, square);
      expect(tile).not.toHaveClass("rounded-full");
      for (const shape of [circle, tile]) {
        expect(shape?.querySelector("svg")).toHaveClass(glyph);
        expect(shape).toHaveAttribute("aria-hidden", "true");
      }
    },
  );

  it("hides the spinner, and turns it", () => {
    const { container } = render(<Spinner />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    // Reduced motion stops it through the one rule in `globals.css` (spec 0026,
    // AC-2), held by `brand-source.test.ts`; no component opts out on its own.
    expect(svg).toHaveClass("animate-spin");
  });

  it("gives an empty state a muted icon, a title and one helper line", () => {
    const { container } = render(
      <EmptyState
        icon={Inbox}
        title="Nothing found"
        helper="No emails, phone numbers or names were found on these pages."
      />,
    );

    expect(screen.getByText("Nothing found")).toHaveClass("text-heading");
    expect(
      screen.getByText("No emails, phone numbers or names were found on these pages."),
    ).toHaveClass("text-small");
    expect(container.querySelector("[aria-hidden='true'] svg")).not.toBeNull();
  });

  it("passes axe", async () => {
    const { container } = render(
      <>
        <IconCircle icon={FileText} tone="neutral" size="lg" />
        <p>
          <Spinner size="sm" /> Opening your document
        </p>
        <EmptyState icon={Inbox} title="Nothing found" helper="One helper line." />
      </>,
    );

    await expectNoAxeViolations(container);
  });
});
