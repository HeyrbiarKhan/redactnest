/**
 * The header's links, the header every page shows, and the footer's Product
 * group. Spec 0013, AC-7 and AC-8; spec 0012, AC-9, AC-23 and INV-10.
 *
 * Plain links on every page, `/tool` included, so nothing prefetches an
 * account page and `/tool` sends no request beyond the entitlement:
 * `next/link` throws here if the nav ever reaches for it. With billing off on
 * this build there is no Pro and no account, so only Redact and the button
 * remain. The browser suite (`tests/e2e/shell.spec.ts`) proves that hovering
 * them requests nothing.
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountLink, NAV_TEXT, PageHeader, ProductNav, SiteNav } from "@/app/site-nav";
import { ACCOUNT_PATH, PRICING_PATH, TOOL_PATH } from "@/lib/routes";
import { SiteHeader } from "@/ui/site-header";

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
    throw new Error("next/link prefetches. The header's links must be plain (INV-10).");
  },
}));

afterEach(() => {
  mocks.billingEnabled = true;
});

/** Each link in the element, as its words and its path, in page order. */
function linksIn(element: HTMLElement) {
  return within(element)
    .getAllByRole("link")
    .map((link) => [link.textContent, link.getAttribute("href")]);
}

describe("NAV_TEXT", () => {
  it("holds the header's words", () => {
    expect(NAV_TEXT).toEqual({
      redact: "Redact",
      pricing: "Pricing",
      account: "Account",
      redactPdf: "Redact a PDF",
    });
    expect(Object.isFrozen(NAV_TEXT)).toBe(true);
  });
});

describe("with billing on", () => {
  /** covers: AC-7 */
  it("links Redact and Pricing, in that order, in a nav named Site", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Site" });

    expect(linksIn(nav)).toEqual([
      ["Redact", TOOL_PATH],
      ["Pricing", PRICING_PATH],
    ]);
  });

  /** covers: AC-7. Account follows the nav, outside it. */
  it("shows Account as its own link, pointing at /account", () => {
    render(<AccountLink />);

    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      ACCOUNT_PATH,
    );
  });

  /** covers: AC-7. Page order: lockup, nav, Account, then the button. */
  it("puts the lockup, the nav, Account and the button in page order", () => {
    render(<PageHeader />);
    const banner = screen.getByRole("banner");

    expect(linksIn(banner)).toEqual([
      ["RedactNest", "/"],
      ["Redact", TOOL_PATH],
      ["Pricing", PRICING_PATH],
      ["Account", ACCOUNT_PATH],
      ["Redact a PDF", TOOL_PATH],
    ]);
    // Account sits after the nav, never inside it.
    expect(
      within(screen.getByRole("navigation", { name: "Site" })).queryByRole("link", {
        name: "Account",
      }),
    ).not.toBeInTheDocument();
  });

  /** covers: AC-7, INV-4. The button is a real page load into the tool. */
  it("offers Redact a PDF as a plain link everywhere but the tool", () => {
    const { unmount } = render(<PageHeader current="pricing" />);
    const button = screen.getByRole("link", { name: "Redact a PDF" });
    expect(button.tagName).toBe("A");
    expect(button).toHaveAttribute("href", TOOL_PATH);
    unmount();

    render(<PageHeader current="tool" />);
    expect(screen.queryByRole("link", { name: "Redact a PDF" })).not.toBeInTheDocument();
  });

  /** covers: AC-7. `aria-current` on the current page's item, and only there. */
  it.each([
    ["tool", "Redact"],
    ["pricing", "Pricing"],
    ["account", "Account"],
  ] as const)("marks %s's item as the current page", (current, name) => {
    render(<PageHeader current={current} />);

    const marked = within(screen.getByRole("banner"))
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked.map((link) => link.textContent)).toEqual([name]);
    expect(marked[0]).toHaveClass(
      "aria-[current=page]:font-semibold",
      "aria-[current=page]:after:border-accent",
    );
  });

  /** covers: AC-7. Sign in, sign up, home, the legal pages and the 404. */
  it("marks nothing current when the page has no item", () => {
    render(<PageHeader />);

    for (const link of within(screen.getByRole("banner")).getAllByRole("link")) {
      expect(link).not.toHaveAttribute("aria-current");
    }
  });

  /** covers: AC-7. At least 40 pixels tall, and no underline until hovered. */
  it("gives every item a 40 pixel target and no underline at rest", () => {
    render(<PageHeader current="tool" />);

    for (const name of ["Redact", "Pricing", "Account"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveClass("min-h-10", "not-aria-[current=page]:hover:underline");
      expect(link).not.toHaveClass("underline");
    }
  });

  it("passes axe inside the site header, with an item current", async () => {
    const { container } = render(<PageHeader current="tool" />);

    await expectNoAxeViolations(container);
  });
});

describe("with billing off on this build (AC-7; spec 0012, AC-23)", () => {
  it("keeps Redact in the nav and drops Pricing", () => {
    mocks.billingEnabled = false;
    render(<SiteNav />);

    expect(linksIn(screen.getByRole("navigation", { name: "Site" }))).toEqual([
      ["Redact", TOOL_PATH],
    ]);
  });

  it("shows no Account link", () => {
    mocks.billingEnabled = false;
    const { container } = render(<AccountLink />);

    expect(container).toBeEmptyDOMElement();
  });

  it("leaves the header the lockup, Redact and the button", () => {
    mocks.billingEnabled = false;
    render(<PageHeader />);

    expect(linksIn(screen.getByRole("banner"))).toEqual([
      ["RedactNest", "/"],
      ["Redact", TOOL_PATH],
      ["Redact a PDF", TOOL_PATH],
    ]);
  });
});

describe("the footer's Product group (AC-8)", () => {
  it("is a nav labelled Product, holding Redact a PDF and Pricing", () => {
    render(<ProductNav />);

    expect(linksIn(screen.getByRole("navigation", { name: "Product" }))).toEqual([
      ["Redact a PDF", TOOL_PATH],
      ["Pricing", PRICING_PATH],
    ]);
  });

  it("underlines its links like every footer link", () => {
    render(<ProductNav />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("underline", "min-h-6");
    }
  });

  it("drops Pricing with billing off", () => {
    mocks.billingEnabled = false;
    render(<ProductNav />);

    expect(linksIn(screen.getByRole("navigation", { name: "Product" }))).toEqual([
      ["Redact a PDF", TOOL_PATH],
    ]);
  });

  it("passes axe", async () => {
    const { container } = render(<ProductNav />);

    await expectNoAxeViolations(container);
  });
});

describe("SiteHeader with the real nav", () => {
  it("passes axe with every slot filled", async () => {
    const { container } = render(
      <SiteHeader nav={<SiteNav />} account={<AccountLink />} />,
    );

    await expectNoAxeViolations(container);
  });
});
