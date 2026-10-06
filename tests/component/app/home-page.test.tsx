/**
 * The home page. Spec 0013, AC-10 to AC-13.
 *
 * Every word in its main content comes from `src/lib/home-text.ts`, the caps
 * and the billing state from `config`; `tests/unit/home-text.test.ts` holds the
 * words themselves. This checks what the page draws from them, and that every
 * way into the tool is a plain link: `next/link` throws here if the page ever
 * reaches for it.
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { config } from "@/config";
import { capLine, HOME_TEXT } from "@/lib/home-text";
import { PRICING_PATH, TOOL_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({ billingEnabled: true }));

// Every other value is the real config; whether billing is on is the test's.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get billingEnabled() {
        return mocks.billingEnabled;
      },
    },
  };
});

vi.mock("next/link", () => ({
  default: () => {
    throw new Error("next/link prefetches. The home page's links must be plain.");
  },
}));

afterEach(() => {
  mocks.billingEnabled = true;
});

function main() {
  return within(screen.getByRole("main"));
}

describe("the hero (AC-10)", () => {
  it("says the eyebrow, the one headline and the lead, in that order", () => {
    render(<HomePage />);

    const eyebrow = screen.getByTestId("home-eyebrow");
    const headline = screen.getByRole("heading", { level: 1 });
    expect(eyebrow).toHaveTextContent(HOME_TEXT.eyebrow);
    expect(eyebrow).toHaveClass("eyebrow");
    expect(headline).toHaveTextContent(HOME_TEXT.headline);
    expect(headline).toHaveClass("text-display");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      eyebrow.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(main().getByText(HOME_TEXT.lead)).toHaveClass("text-lead", "text-ink-muted");
  });

  it("offers the tool as a real page load, and pricing beside it with billing on", () => {
    render(<HomePage />);

    const redact = main().getByRole("link", { name: "Redact a PDF" });
    expect(redact).toHaveAttribute("href", TOOL_PATH);
    expect(redact.tagName).toBe("A");
    const pricing = main().getByRole("link", { name: "See pricing" });
    expect(pricing).toHaveAttribute("href", PRICING_PATH);
    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      capLine(true, config.freePageCap, config.maxPages),
    );
  });

  it("drops See pricing and names one cap with billing off", () => {
    mocks.billingEnabled = false;
    render(<HomePage />);

    expect(main().queryByRole("link", { name: "See pricing" })).not.toBeInTheDocument();
    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      `Up to ${config.freePageCap} pages a document.`,
    );
    expect(screen.getByTestId("home-caps")).not.toHaveTextContent(/Free|Pro/);
  });
});

describe("the product shot (AC-12)", () => {
  it("shows the real capture with its alt text, its size known and loaded first", () => {
    render(<HomePage />);

    const shot = screen.getByRole("img", { name: HOME_TEXT.shotAlt });
    expect(shot).toHaveAttribute("width", "2560");
    expect(shot).toHaveAttribute("height", "1600");
    expect(shot).toHaveAttribute("sizes", "(min-width: 64rem) 40rem, calc(100vw - 2rem)");
    expect(shot).toHaveAttribute("loading", "eager");
    expect(shot).toHaveAttribute("fetchpriority", "high");
    // From our own origin: a path, never another host.
    expect(shot.getAttribute("src")).toMatch(/^\//);
  });
});

describe("the trio and the band (AC-10, AC-11)", () => {
  it("lists the three features, each a heading and its line", () => {
    render(<HomePage />);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      ...HOME_TEXT.features.map((feature) => feature.title),
      HOME_TEXT.band.title,
    ]);
    for (const feature of HOME_TEXT.features) {
      expect(main().getByText(feature.body)).toBeInTheDocument();
    }
  });

  it("says what RedactNest finds and strips, under two headings", () => {
    render(<HomePage />);

    const band = screen.getByRole("region", { name: HOME_TEXT.band.title });
    expect(
      within(band)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Finds", "Strips"]);
    expect(band).toHaveTextContent(HOME_TEXT.band.finds);
    expect(band).toHaveTextContent(HOME_TEXT.band.strips);
  });

  it("passes axe", async () => {
    const { container } = render(<HomePage />);

    await expectNoAxeViolations(container);
  });
});
