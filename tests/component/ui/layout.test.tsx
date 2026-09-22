/**
 * The layout pieces and the quiet ones: `Card`, `PageContainer`, `SiteHeader`,
 * `SiteFooter`, `SkipLink`, `IconCircle`, `Spinner` and `EmptyState`.
 * Spec 0003, AC-5, AC-14, AC-16 and AC-18.
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileText, Inbox } from "lucide-react";
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

  it("passes axe", async () => {
    const { container } = render(
      <Card title="Document opened">
        <p>This document has 2 pages.</p>
      </Card>,
    );

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
