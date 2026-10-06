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
import { SiteHeader } from "@/ui/site-header";
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
    expect(screen.getByTestId("spacious")).toHaveClass("p-7", "gap-6", "rounded-xl");
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

  /** Spec 0013, AC-7: lockup, nav, account, then the action. */
  it("renders its slots in page order", () => {
    render(
      <SiteHeader
        nav={
          <nav aria-label="Site">
            <a href="/pricing">Pricing</a>
          </nav>
        }
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

  it("is never sticky, so it can never cover what has focus", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner").className).not.toMatch(/(sticky|fixed)/);
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

  /** Spec 0013, AC-11: the small check circle and the square tiles of the home page's cards. */
  it.each([
    ["sm", "size-8", "size-5", "rounded-lg"],
    ["md", "size-12", "size-5", "rounded-xl"],
    ["lg", "size-16", "size-7", "rounded-xl"],
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

  it("hides the spinner, and stops it under reduced motion", () => {
    const { container } = render(<Spinner />);

    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).toHaveClass("animate-spin", "motion-reduce:animate-none");
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
