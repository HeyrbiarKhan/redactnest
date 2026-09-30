/**
 * The layout pieces and the quiet ones: `Card`, `PageContainer`, `SiteHeader`,
 * `SiteFooter`, `SkipLink`, `IconCircle`, `Spinner` and `EmptyState`.
 * Spec 0003, AC-5, AC-14, AC-16 and AC-18.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, Inbox } from "lucide-react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";

import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { CountBadge } from "@/ui/count-badge";
import { EmptyState } from "@/ui/empty-state";
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
  it("is the banner landmark, with the wordmark linking home", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "RedactNest" })).toHaveAttribute("href", "/");
  });

  it("carries the action it is given", () => {
    render(<SiteHeader action={<Button href="/tool">Redact a PDF</Button>} />);

    expect(screen.getByRole("link", { name: "Redact a PDF" })).toHaveAttribute(
      "href",
      "/tool",
    );
  });

  it("is never sticky, so it can never cover what has focus", () => {
    render(<SiteHeader />);

    expect(screen.getByRole("banner").className).not.toMatch(/\b(sticky|fixed)\b/);
  });

  it("passes axe", async () => {
    const { container } = render(
      <SiteHeader action={<Button href="/tool">Redact a PDF</Button>} />,
    );

    await expectNoAxeViolations(container);
  });
});

describe("SiteFooter", () => {
  it("is the content info landmark, holding what the layout passes in", () => {
    render(
      <SiteFooter>
        <a href="https://example.invalid/source">Source code (AGPL 3.0)</a>
      </SiteFooter>,
    );

    expect(screen.getByRole("contentinfo")).toContainElement(
      screen.getByRole("link", { name: "Source code (AGPL 3.0)" }),
    );
  });

  it("passes axe", async () => {
    const { container } = render(
      <SiteFooter>
        <a href="https://example.invalid/source">Source code (AGPL 3.0)</a>
      </SiteFooter>,
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
