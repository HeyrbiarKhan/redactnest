/**
 * The account group's layout. Spec 0012, AC-8, AC-9 and AC-23.
 *
 * The one place Clerk's provider renders. Its paths and landing come from
 * `src/lib/routes.ts` as props and its telemetry is off, so no environment
 * variable can turn telemetry on or send sign in to `/tool`. With billing off
 * there is no provider at all, so Clerk's keyless mode can never start, and
 * the group says accounts are not set up. Clerk's provider is the boundary:
 * it records the props it was given and renders its children.
 */

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CLERK_APPEARANCE } from "@/app/(account)/clerk-appearance";
import AccountLayout, { metadata } from "@/app/(account)/layout";
import { ACCOUNT_PATH, HOME_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";

const mocks = vi.hoisted(() => ({
  billingOn: true,
  providerProps: [] as Record<string, unknown>[],
}));

vi.mock("@/config/billing", () => ({
  get billing() {
    return mocks.billingOn ? { publishableKey: "pk_test_fromtheconfig" } : null;
  },
}));
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children, ...props }: { children: ReactNode }) => {
    mocks.providerProps.push(props);
    return <>{children}</>;
  },
}));

afterEach(() => {
  mocks.billingOn = true;
  mocks.providerProps = [];
});

const PAGE = <p>The page inside</p>;

describe("the group's metadata (AC-9)", () => {
  it("keeps every page in the group out of search indexes", () => {
    expect(metadata.robots).toEqual({ index: false });
  });
});

describe("with billing on (AC-8)", () => {
  it("wraps the page in one Clerk provider", () => {
    render(<AccountLayout>{PAGE}</AccountLayout>);

    expect(mocks.providerProps).toHaveLength(1);
    expect(screen.getByText("The page inside")).toBeInTheDocument();
  });

  it("gives Clerk our paths, Account as both landings and / after sign out, as props", () => {
    render(<AccountLayout>{PAGE}</AccountLayout>);

    expect(mocks.providerProps[0]).toEqual({
      publishableKey: "pk_test_fromtheconfig",
      signInUrl: SIGN_IN_PATH,
      signUpUrl: SIGN_UP_PATH,
      signInFallbackRedirectUrl: ACCOUNT_PATH,
      signUpFallbackRedirectUrl: ACCOUNT_PATH,
      afterSignOutUrl: HOME_PATH,
      telemetry: false,
      appearance: CLERK_APPEARANCE,
    });
  });

  it("never lands Clerk on /tool", () => {
    render(<AccountLayout>{PAGE}</AccountLayout>);

    expect(Object.values(mocks.providerProps[0] ?? {})).not.toContain("/tool");
    expect(mocks.providerProps[0]).toMatchObject({
      signInFallbackRedirectUrl: "/account",
      signUpFallbackRedirectUrl: "/account",
    });
  });
});

describe("with billing off on this build (AC-23)", () => {
  it("renders no Clerk provider, so keyless mode can never start", () => {
    mocks.billingOn = false;
    render(<AccountLayout>{PAGE}</AccountLayout>);

    expect(mocks.providerProps).toEqual([]);
  });

  it("says accounts are not set up, in place of the page", () => {
    mocks.billingOn = false;
    render(<AccountLayout>{PAGE}</AccountLayout>);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Accounts are not set up",
    );
    expect(screen.getByRole("main")).toHaveTextContent(
      "This copy of RedactNest runs without accounts or a paid plan, so there is nothing to sign in to. The tool works as it is, up to its free limit.",
    );
    expect(screen.queryByText("The page inside")).not.toBeInTheDocument();
  });
});
