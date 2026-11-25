/**
 * The header's links, the header every page shows, and the footer's Product
 * group. Spec 0026, AC-5; spec 0013, AC-7 and AC-8; spec 0012, AC-9, AC-23
 * and INV-10.
 *
 * Plain links on every page, `/tool` included, so nothing prefetches an
 * account page and `/tool` sends no request beyond the entitlement:
 * `next/link` throws here if the nav ever reaches for it. With billing off on
 * this build there is no Pro and no account, so the nav loses Pricing and the
 * header loses Sign in. The browser suite (`tests/e2e/shell.spec.ts`) proves
 * that hovering them requests nothing.
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GuidesNav,
  NAV_TEXT,
  PageHeader,
  ProductNav,
  SignInLink,
  SiteNav,
} from "@/app/site-nav";
import {
  HOW_IT_WORKS_PATH,
  PRICING_PATH,
  SECURITY_PATH,
  SIGN_IN_PATH,
  TOOL_PATH,
} from "@/lib/routes";
import { SEARCH_PAGE_TEXT, SEARCH_PAGES } from "@/lib/search-pages";
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
      howItWorks: "How it works",
      pricing: "Pricing",
      signIn: "Sign in",
      tryFree: "Try it free",
      redactPdf: "Redact a PDF",
      security: "Security",
      menu: "Menu",
    });
    expect(Object.isFrozen(NAV_TEXT)).toBe(true);
  });

  /** covers: spec 0013, AC-30, and spec 0026, AC-5. No nav item names the tool or the guides. */
  it("has no word for a Redact nav item, nor a Guides one", () => {
    expect(NAV_TEXT).not.toHaveProperty("redact");
    expect(NAV_TEXT).not.toHaveProperty("guides");
  });
});

describe("with billing on", () => {
  /** covers: spec 0026, AC-5 */
  it("links How it works, Security and Pricing in a nav named Site", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Site" });

    expect(linksIn(nav)).toEqual([
      ["How it works", HOW_IT_WORKS_PATH],
      ["Security", SECURITY_PATH],
      ["Pricing", PRICING_PATH],
    ]);
    expect(HOW_IT_WORKS_PATH).toBe("/#how-it-works");
  });

  /** covers: child 0001, AC-30. On `/tool` the nav holds Security and Pricing. */
  it("leaves How it works out on the tool", () => {
    render(<SiteNav current="tool" />);

    expect(linksIn(screen.getByRole("navigation", { name: "Site" }))).toEqual([
      ["Security", SECURITY_PATH],
      ["Pricing", PRICING_PATH],
    ]);
  });

  /** covers: AC-5. Sign in is a plain link into the account group. */
  it("shows Sign in as a plain link, pointing at /sign-in", () => {
    render(<SignInLink />);

    const link = screen.getByRole("link", { name: "Sign in" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", SIGN_IN_PATH);
  });

  /** covers: AC-5. Page order: lockup, nav, Sign in, then the button. */
  it("puts the lockup, the nav, Sign in and the button in page order", () => {
    render(<PageHeader />);
    const banner = screen.getByRole("banner");

    expect(linksIn(banner)).toEqual([
      ["RedactNest", "/"],
      ["How it works", HOW_IT_WORKS_PATH],
      ["Security", SECURITY_PATH],
      ["Pricing", PRICING_PATH],
      ["Sign in", SIGN_IN_PATH],
      ["Try it free", TOOL_PATH],
    ]);
    // No link names the tool but the button (spec 0013, AC-30).
    for (const name of ["Redact", "Redact a PDF", "Guides"]) {
      expect(within(banner).queryByRole("link", { name })).toBeNull();
    }
    // Sign in sits after the nav, never inside it.
    expect(
      within(screen.getByRole("navigation", { name: "Site" })).queryByRole("link", {
        name: "Sign in",
      }),
    ).not.toBeInTheDocument();
  });

  /** covers: AC-5, spec 0003 INV-4. The button is a real page load into the tool. */
  it("offers Try it free as a plain link everywhere but the tool", () => {
    const { unmount } = render(<PageHeader current="pricing" />);
    const button = screen.getByRole("link", { name: "Try it free" });
    expect(button.tagName).toBe("A");
    expect(button).toHaveAttribute("href", TOOL_PATH);
    unmount();

    render(<PageHeader current="tool" />);
    expect(screen.queryByRole("link", { name: "Try it free" })).not.toBeInTheDocument();
  });

  /** covers: AC-5. `aria-current` on the current page's item, and only there. */
  it.each([
    ["pricing", "Pricing"],
    ["security", "Security"],
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

  /**
   * covers: AC-5. Home, the legal pages and the 404 pass nothing; the tool
   * passes `"tool"` and the account pages `"account"`, which no item names.
   */
  it.each([undefined, "tool", "account"] as const)(
    "marks nothing current when the page is %s",
    (current) => {
      render(<PageHeader current={current} />);

      for (const link of within(screen.getByRole("banner")).getAllByRole("link")) {
        expect(link).not.toHaveAttribute("aria-current");
      }
    },
  );

  /** covers: spec 0013, AC-7. At least 40 pixels tall, and no underline until hovered. */
  it("gives every nav item a 40 pixel target and no underline at rest", () => {
    render(<PageHeader />);

    for (const name of ["How it works", "Security", "Pricing"]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveClass("min-h-10", "not-aria-[current=page]:hover:underline");
      expect(link).not.toHaveClass("underline");
    }
  });

  it("passes axe inside the site header, with an item current", async () => {
    const { container } = render(<PageHeader current="pricing" />);

    await expectNoAxeViolations(container);
  });
});

describe("with billing off on this build (AC-5; spec 0012, AC-23)", () => {
  it("keeps How it works and Security in the nav, without Pricing", () => {
    mocks.billingEnabled = false;
    render(<SiteNav />);

    expect(linksIn(screen.getByRole("navigation", { name: "Site" }))).toEqual([
      ["How it works", HOW_IT_WORKS_PATH],
      ["Security", SECURITY_PATH],
    ]);
  });

  it("shows no Sign in", () => {
    mocks.billingEnabled = false;
    const { container } = render(<SignInLink />);

    expect(container).toBeEmptyDOMElement();
  });

  it("leaves the header the lockup, the nav and the button", () => {
    mocks.billingEnabled = false;
    render(<PageHeader />);

    expect(linksIn(screen.getByRole("banner"))).toEqual([
      ["RedactNest", "/"],
      ["How it works", HOW_IT_WORKS_PATH],
      ["Security", SECURITY_PATH],
      ["Try it free", TOOL_PATH],
    ]);
  });
});

describe("the footer's Product group (AC-8)", () => {
  /** And spec 0018, AC-2: Security between the two. */
  it("is a nav labelled Product, holding Redact a PDF, Security and Pricing", () => {
    render(<ProductNav />);

    expect(linksIn(screen.getByRole("navigation", { name: "Product" }))).toEqual([
      ["Redact a PDF", TOOL_PATH],
      ["Security", SECURITY_PATH],
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
      ["Security", SECURITY_PATH],
    ]);
  });

  it("passes axe", async () => {
    const { container } = render(<ProductNav />);

    await expectNoAxeViolations(container);
  });
});

/** Spec 0024, AC-9: the search pages, in `SEARCH_PAGES` order, by their `navLabel`. */
describe("the footer's Guides group (spec 0024, AC-9)", () => {
  it("is a nav labelled Guides, holding each search page in order", () => {
    render(<GuidesNav />);

    expect(linksIn(screen.getByRole("navigation", { name: "Guides" }))).toEqual(
      SEARCH_PAGES.map((kind) => [
        SEARCH_PAGE_TEXT[kind].navLabel,
        SEARCH_PAGE_TEXT[kind].path,
      ]),
    );
    expect(linksIn(screen.getByRole("navigation", { name: "Guides" }))).toContainEqual([
      "Redacting a PDF",
      "/redact-pdf",
    ]);
  });

  it("underlines its links like every footer link, and holds no paragraph", () => {
    const { container } = render(<GuidesNav />);

    for (const link of screen.getAllByRole("link")) {
      expect(link).toHaveClass("underline", "min-h-6");
      expect(link).not.toHaveAttribute("target");
    }
    expect(container.querySelector("p")).toBeNull();
  });

  it("passes axe", async () => {
    const { container } = render(<GuidesNav />);

    await expectNoAxeViolations(container);
  });
});

describe("SiteHeader with the real nav", () => {
  it("passes axe with every slot filled", async () => {
    const { container } = render(
      <SiteHeader nav={<SiteNav />} menuLabel={NAV_TEXT.menu} account={<SignInLink />} />,
    );

    await expectNoAxeViolations(container);
  });
});
