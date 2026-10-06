/**
 * The account group's frame. Spec 0013, AC-7, AC-23 and AC-24: Account's pages
 * draw the shared header with Account current in the narrow column; sign in
 * and sign up draw it with nothing current, in the wide one.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AccountShell } from "@/app/(account)/account-shell";
import AccountPagesLayout from "@/app/(account)/account/layout";

// Billing on, so the header has an Account link to mark.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return { ...actual, config: { ...actual.config, billingEnabled: true } };
});

function current() {
  return within(screen.getByRole("banner"))
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);
}

describe("Account and the pages under it", () => {
  it("mark Account current, in the narrow column, with the header's button", () => {
    render(
      <AccountPagesLayout params={Promise.resolve({})}>
        <h1>Account</h1>
      </AccountPagesLayout>,
    );

    expect(current()).toEqual(["Account"]);
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Redact a PDF" }),
    ).toHaveAttribute("href", "/tool");
    expect(screen.getByRole("main").firstElementChild).toHaveClass("max-w-narrow");
  });
});

describe("sign in and sign up", () => {
  it("mark nothing current, in the wide column", () => {
    render(
      <AccountShell width="wide">
        <p>Clerk&rsquo;s card</p>
      </AccountShell>,
    );

    expect(current()).toEqual([]);
    expect(screen.getByRole("main").firstElementChild).toHaveClass("max-w-wide");
  });
});
