/**
 * Pricing, as rendered. Spec 0012, AC-13, AC-23, INV-8, INV-9 and INV-10.
 *
 * A plain server component, so it renders here as it does at build. Whether
 * billing is on, the two caps and the plans' words are the test's to change,
 * each defaulting to the real value, so a case can prove the page follows
 * `config` and `PRO_PLAN` rather than writing a figure of its own (INV-8).
 * `next/link` throws if anything on the page reaches for it: every link here
 * must be a plain `a`, so nothing prefetches the page that starts a checkout
 * (INV-10). `tests/unit/policy-pages.test.ts` holds that none of its files is
 * a client component. The browser suite proves the same page at 320 pixels and
 * at 200% text, and that it requests nothing from another origin.
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import PricingPage, { metadata } from "@/app/pricing/page";
import { config } from "@/config";
import { LEGAL } from "@/lib/legal";
import { PRO_PLAN } from "@/lib/plans";
import { ACCOUNT_PATH, PRICING_PATH, TERMS_PATH, TOOL_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({
  billingEnabled: true,
  caps: null as { readonly free: number; readonly paid: number } | null,
  plans: null as {
    readonly free: string;
    readonly pro: string;
    readonly price: string;
  } | null,
}));

// Every other value is the real config; billing and the caps are the test's.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get billingEnabled() {
        return mocks.billingEnabled;
      },
      get freePageCap() {
        return mocks.caps?.free ?? actual.config.freePageCap;
      },
      get maxPages() {
        return mocks.caps?.paid ?? actual.config.maxPages;
      },
    },
  };
});

// The real plans unless a case renames them or reprices Pro.
vi.mock("@/lib/plans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plans")>();
  return {
    FREE_PLAN: {
      get name() {
        return mocks.plans?.free ?? actual.FREE_PLAN.name;
      },
    },
    PRO_PLAN: {
      get name() {
        return mocks.plans?.pro ?? actual.PRO_PLAN.name;
      },
      get priceLine() {
        return mocks.plans?.price ?? actual.PRO_PLAN.priceLine;
      },
    },
  };
});

/** What `notFound` throws, so a case can see the page was refused. */
class NotFound extends Error {}

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new NotFound("not found");
  },
}));

vi.mock("next/link", () => ({
  default: () => {
    throw new Error("next/link prefetches. Pricing's links must be plain (INV-10).");
  },
}));

afterEach(() => {
  mocks.billingEnabled = true;
  mocks.caps = null;
  mocks.plans = null;
});

/** One plan's card, named by its heading. */
const card = (name: string) => screen.getByRole("region", { name });

/** The lines a card lists, in order. */
const lines = (name: string) =>
  within(card(name))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

describe("the plans (AC-13)", () => {
  it("has one h1, then Free and Pro as its two plans", () => {
    render(<PricingPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Pricing");
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Free", "Pro"]);
  });

  it("shows Pro's price line, $19 a month, in Pro's card and nowhere else", () => {
    render(<PricingPage />);

    expect(within(card("Pro")).getByText("$19 a month")).toBeInTheDocument();
    expect(screen.getAllByText(/\$19 a month/)).toHaveLength(1);
    expect(card("Free")).not.toHaveTextContent("$");
  });

  /** covers: AC-13, INV-8 */
  it("gives each plan its cap from config, and Pro only what it does today", () => {
    render(<PricingPage />);

    expect(lines("Free")).toEqual([`Up to ${config.freePageCap} pages a document`]);
    expect(lines("Pro")).toEqual([
      `Up to ${config.maxPages} pages a document`,
      "Everything in Free",
    ]);
  });

  /** covers: INV-8 */
  it("follows config when the caps change", () => {
    mocks.caps = { free: 4, paid: 40 };
    render(<PricingPage />);

    expect(lines("Free")).toEqual(["Up to 4 pages a document"]);
    expect(lines("Pro")[0]).toBe("Up to 40 pages a document");
  });

  it("follows PRO_PLAN and FREE_PLAN when the price or a name changes", () => {
    mocks.plans = { free: "Basic", pro: "Pro Plus", price: "$23 a month" };
    render(<PricingPage />);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(["Basic", "Pro Plus"]);
    expect(within(card("Pro Plus")).getByText("$23 a month")).toBeInTheDocument();
    expect(lines("Pro Plus")[1]).toBe("Everything in Basic");
    expect(screen.queryByText("$19 a month")).not.toBeInTheDocument();
  });
});

/** Spec 0013, AC-22: the two cards, Pro marked, Free a way into the tool. */
describe("the two cards (spec 0013, AC-22)", () => {
  it("marks Pro's card with the accent edge, and not Free's", () => {
    render(<PricingPage />);

    expect(card("Pro")).toHaveClass("border-2", "border-accent");
    expect(card("Free")).not.toHaveClass("border-accent");
  });

  it("offers the tool from Free's card as a real page load", () => {
    render(<PricingPage />);

    const redact = within(card("Free")).getByRole("link", { name: "Redact a PDF" });
    expect(redact.tagName).toBe("A");
    expect(redact).toHaveAttribute("href", "/tool");
  });

  it("sets the cards side by side from md", () => {
    render(<PricingPage />);

    expect(card("Free").parentElement).toHaveClass("md:grid-cols-2");
    expect(card("Free").parentElement).toBe(card("Pro").parentElement);
  });
});

describe("Subscribe and the lines under it (AC-13)", () => {
  it("makes Subscribe a plain link to /account/subscribe", () => {
    render(<PricingPage />);

    expect(within(card("Pro")).getByRole("link", { name: "Subscribe" })).toHaveAttribute(
      "href",
      "/account/subscribe",
    );
  });

  it("says who takes the payment, the tax, and the terms, after Subscribe", () => {
    render(<PricingPage />);
    const subscribe = screen.getByRole("link", { name: "Subscribe" });
    const merchant = screen.getByText(
      "Payments are handled by Polar, our merchant of record. Your receipt shows EdiventStudio, the studio RedactNest is sold through.",
    );
    const tax = screen.getByText(LEGAL.taxLine);
    const terms = screen.getByText((_, element) =>
      element?.tagName === "P"
        ? element.textContent === "By subscribing you agree to the Terms of service."
        : false,
    );

    expect(merchant).toHaveTextContent(LEGAL.merchantLine);
    expect(tax).toHaveTextContent(
      "Tax may be added at checkout, depending on where you live.",
    );
    expect(within(terms).getByRole("link", { name: "Terms of service" })).toHaveAttribute(
      "href",
      TERMS_PATH,
    );
    for (const line of [merchant, tax, terms]) {
      expect(subscribe.compareDocumentPosition(line)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    }
  });

  /** The sandbox never charges a real card, so the statement is unverified (task 18). */
  it("names the receipt only, never a card statement", () => {
    render(<PricingPage />);

    expect(screen.getByRole("main")).not.toHaveTextContent(/statement|card/i);
  });
});

describe("the header", () => {
  it("links Pricing, Account and the tool as plain page loads", () => {
    render(<PricingPage />);
    const header = within(screen.getByRole("banner"));

    expect(header.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      PRICING_PATH,
    );
    expect(header.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      ACCOUNT_PATH,
    );
    expect(header.getByRole("link", { name: "Redact a PDF" })).toHaveAttribute(
      "href",
      TOOL_PATH,
    );
  });
});

describe("the page's metadata (AC-13)", () => {
  it("has its own title, and a description built from the price and both caps", () => {
    expect(metadata.title).toBe("Pricing");
    expect(metadata.description).toBe(
      `RedactNest Pro is ${PRO_PLAN.priceLine} and handles up to ${config.maxPages} pages a document. The free plan handles up to ${config.freePageCap}.`,
    );
    expect(metadata.description).toContain("$19 a month");
  });

  it("is indexed: nothing tells a search engine to skip it", () => {
    expect(metadata.robots).toBeUndefined();
  });
});

describe("with billing off on this build (AC-23)", () => {
  it("is a 404, because there is no Pro to sell", () => {
    mocks.billingEnabled = false;

    expect(() => PricingPage()).toThrow(NotFound);
  });
});

describe("accessibility", () => {
  it("passes axe", async () => {
    const { container } = render(<PricingPage />);

    await expectNoAxeViolations(container);
  });
});
