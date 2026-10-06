/**
 * The 404 page. Spec 0013, AC-7, AC-9 and AC-26.
 *
 * Every address that is not a page, and `/pricing` with billing off. The
 * browser suite (`tests/e2e/shell.spec.ts`) proves the status, the `noindex`
 * and the title Next.js gives it; this checks what the page itself draws: the
 * shell's header with nothing current, the two ways on as plain links, and its
 * own words. `next/link` throws here if the page ever reaches for it, because
 * a client side move into `/tool` would open it under this page's policy
 * (spec 0003, INV-10).
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import NotFound, { metadata } from "@/app/not-found";
import { NAV_TEXT } from "@/app/site-nav";
import { HOME_PATH, TOOL_PATH } from "@/lib/routes";

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
    throw new Error("next/link prefetches. The 404's links must be plain (INV-10).");
  },
}));

afterEach(() => {
  mocks.billingEnabled = true;
});

describe("the 404 page (AC-9)", () => {
  it("says the page doesn't exist, and why it might not", () => {
    render(<NotFound />);

    const main = within(screen.getByRole("main"));
    expect(main.getByRole("heading", { level: 1 })).toHaveTextContent(
      "This page doesn’t exist",
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      main.getByText("The address may be mistyped, or the page may have moved."),
    ).toBeInTheDocument();
  });

  it("offers the tool first, then home, each a plain link", () => {
    render(<NotFound />);

    const links = within(screen.getByRole("main")).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      [NAV_TEXT.tryFree, TOOL_PATH],
      ["Go to the home page", HOME_PATH],
    ]);
    for (const link of links) {
      expect(link.tagName).toBe("A");
      expect(link).not.toHaveAttribute("target");
    }
  });

  it("is the skip link's target", () => {
    render(<NotFound />);

    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toHaveAttribute("tabindex", "-1");
  });

  it("is titled Page not found, which the layout's template finishes", () => {
    expect(metadata.title).toBe("Page not found");
  });

  it("passes axe", async () => {
    const { container } = render(<NotFound />);

    await expectNoAxeViolations(container);
  });
});

/** AC-7: the shell every page has, with nothing marked current on the 404. */
describe("the 404's header (AC-7)", () => {
  it("marks no item current, and keeps Try it free in the header", () => {
    render(<NotFound />);

    const header = within(screen.getByRole("banner"));
    expect(
      header.getAllByRole("link").filter((link) => link.hasAttribute("aria-current")),
    ).toEqual([]);
    expect(header.getByRole("link", { name: NAV_TEXT.tryFree })).toHaveAttribute(
      "href",
      TOOL_PATH,
    );
    expect(header.getByRole("link", { name: "RedactNest" })).toHaveAttribute(
      "href",
      HOME_PATH,
    );
  });

  it("holds the lockup and the button only with billing off", () => {
    mocks.billingEnabled = false;
    render(<NotFound />);

    const banner = screen.getByRole("banner");
    expect(within(banner).queryByRole("navigation")).not.toBeInTheDocument();
    expect(
      within(banner)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["RedactNest", NAV_TEXT.tryFree]);
  });
});
