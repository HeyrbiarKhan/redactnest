/**
 * The panel beside Clerk's card on sign in and sign up. Spec 0013, AC-23,
 * AC-26 and AC-30. Clerk's card itself loads from Clerk's host and never
 * renders in a test; it is checked by hand in the sandbox walk.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SignInPanel } from "@/app/(account)/sign-in-panel";
import { config } from "@/config";
import { PRICING_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

vi.mock("next/link", () => ({
  default: () => {
    throw new Error("next/link prefetches. See pricing must be a plain link.");
  },
}));

describe("SignInPanel", () => {
  it("heads itself with an h2, leaving the h1 to Clerk's card", () => {
    render(<SignInPanel />);

    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      "Sign in to use Pro",
    );
    expect(screen.queryByRole("heading", { level: 1 })).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Sign in to use Pro" }),
    ).toBeInTheDocument();
  });

  it("says what Pro opens, with the build's cap, and what the account holds", () => {
    render(<SignInPanel />);

    expect(screen.getByTestId("sign-in-panel")).toHaveTextContent(
      `Pro opens documents up to ${config.maxPages} pages. Your account needs only your email address, and your documents never touch it: they stay in your browser.`,
    );
  });

  it("links See pricing as a plain link", () => {
    render(<SignInPanel />);

    const link = screen.getByRole("link", { name: "See pricing" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", PRICING_PATH);
    expect(link).not.toHaveAttribute("target");
  });

  /**
   * AC-23, AC-30: the brand is said once. The header's lockup is the page's
   * brand and its way home, and the footer's the only other.
   */
  it("shows no lockup, and no link or picture named RedactNest", () => {
    render(<SignInPanel />);

    const panel = screen.getByTestId("sign-in-panel");
    expect(panel).not.toHaveTextContent("RedactNest");
    expect(panel.querySelector("svg, img")).toBeNull();
    expect(screen.queryByRole("link", { name: "RedactNest" })).not.toBeInTheDocument();
    // The heading opens the panel.
    expect(panel.firstElementChild).toBe(screen.getByRole("heading", { level: 2 }));
  });

  it("passes axe", async () => {
    const { container } = render(<SignInPanel />);

    await expectNoAxeViolations(container);
  });
});
