/**
 * The header's Pricing and Account links. Spec 0012, AC-9, AC-23 and INV-10.
 *
 * Plain links on every page, `/tool` included, so nothing prefetches an
 * account page and `/tool` sends no request beyond the entitlement:
 * `next/link` throws here if the nav ever reaches for it. With billing off on
 * this build there is no Pro and no account, so there is no nav at all. The
 * browser suite (`tests/e2e/shell.spec.ts`) proves that hovering them requests
 * nothing.
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SiteNav } from "@/app/site-nav";
import { ACCOUNT_PATH, PRICING_PATH } from "@/lib/routes";
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

describe("with billing on", () => {
  /** covers: AC-9 */
  it("links Pricing and Account, in that order, in a nav named Site", () => {
    render(<SiteNav />);
    const nav = screen.getByRole("navigation", { name: "Site" });

    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Pricing", PRICING_PATH],
      ["Account", ACCOUNT_PATH],
    ]);
  });

  it("points at /pricing and /account, never straight at Subscribe", () => {
    render(<SiteNav />);

    expect(screen.getByRole("link", { name: "Pricing" })).toHaveAttribute(
      "href",
      "/pricing",
    );
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute(
      "href",
      "/account",
    );
  });

  it("passes axe inside the site header", async () => {
    const { container } = render(<SiteHeader nav={<SiteNav />} />);

    await expectNoAxeViolations(container);
  });
});

describe("with billing off on this build (AC-23)", () => {
  it("renders nothing, so the header offers no Pricing and no Account", () => {
    mocks.billingEnabled = false;
    render(<SiteHeader nav={<SiteNav />} />);

    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Pricing" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Account" })).not.toBeInTheDocument();
  });
});
