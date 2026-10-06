/**
 * The status line below Clerk's card on sign in and sign up. Spec 0013, AC-32.
 *
 * Clerk's state is mocked: this holds when the line shows and what it says.
 * Whether Clerk reaches that state before the page changes, and how long each
 * gap is, is checked in the sandbox (task 27), because Clerk's interface loads
 * from Clerk's servers and never runs in a test.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SIGNING_IN_TEXT, SigningInStatus } from "@/app/(account)/signing-in";
import { ACCOUNT_PATH, SUBSCRIBE_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

interface AuthState {
  readonly isLoaded: boolean;
  readonly isSignedIn: boolean | undefined;
}

const LOADING: AuthState = { isLoaded: false, isSignedIn: undefined };
const SIGNED_OUT: AuthState = { isLoaded: true, isSignedIn: false };
const SIGNED_IN: AuthState = { isLoaded: true, isSignedIn: true };

const mocks = vi.hoisted(() => ({
  auth: { isLoaded: false, isSignedIn: undefined } as {
    isLoaded: boolean;
    isSignedIn: boolean | undefined;
  },
}));

vi.mock("@clerk/nextjs", () => ({
  useAuth: () => mocks.auth,
}));

afterEach(() => {
  mocks.auth = { ...LOADING };
});

/** Render at `first`, then move Clerk through each later state in turn. */
function walk(landing: typeof ACCOUNT_PATH | typeof SUBSCRIBE_PATH, states: AuthState[]) {
  const [first = LOADING, ...rest] = states;
  mocks.auth = { ...first };
  const view = render(<SigningInStatus landing={landing} />);
  for (const state of rest) {
    mocks.auth = { ...state };
    act(() => {
      view.rerender(<SigningInStatus landing={landing} />);
    });
  }
  return view;
}

const status = () => screen.getByRole("status");

describe("SIGNING_IN_TEXT", () => {
  it("has a line for each landing, naming Subscribe as the page", () => {
    expect(SIGNING_IN_TEXT).toEqual({
      [ACCOUNT_PATH]: "Signing you in",
      [SUBSCRIBE_PATH]: "Signing you in, then on to Subscribe",
    });
    expect(Object.isFrozen(SIGNING_IN_TEXT)).toBe(true);
  });
});

describe("SigningInStatus", () => {
  it("is a polite status region, in the page and empty from the first render", () => {
    walk(ACCOUNT_PATH, [LOADING]);

    expect(status()).toBeEmptyDOMElement();
    expect(status()).not.toHaveAttribute("aria-live", "assertive");
  });

  it("stays empty while Clerk loads and while the visitor is signed out", () => {
    walk(ACCOUNT_PATH, [LOADING, SIGNED_OUT]);

    expect(status()).toBeEmptyDOMElement();
  });

  it("stays empty after a wrong code, which leaves Clerk signed out", () => {
    walk(ACCOUNT_PATH, [LOADING, SIGNED_OUT, SIGNED_OUT, SIGNED_OUT]);

    expect(status()).toBeEmptyDOMElement();
  });

  it("shows the spinner and the line once isSignedIn turns true", () => {
    walk(ACCOUNT_PATH, [LOADING, SIGNED_OUT, SIGNED_IN]);

    expect(status()).toHaveTextContent(/^Signing you in$/);
    expect(screen.getByTestId("spinner")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows it once isLoaded turns false after being true, while Clerk moves sessions", () => {
    walk(ACCOUNT_PATH, [LOADING, SIGNED_OUT, LOADING]);

    expect(status()).toHaveTextContent("Signing you in");
  });

  it("keeps showing it until the page changes, whatever Clerk emits next", () => {
    walk(ACCOUNT_PATH, [LOADING, SIGNED_OUT, LOADING, SIGNED_IN]);

    expect(status()).toHaveTextContent("Signing you in");
  });

  it("names Subscribe when that is where Clerk lands", () => {
    walk(SUBSCRIBE_PATH, [LOADING, SIGNED_OUT, SIGNED_IN]);

    expect(status()).toHaveTextContent("Signing you in, then on to Subscribe");
  });

  it("never shows while Clerk first loads, even into a signed in state", () => {
    walk(ACCOUNT_PATH, [LOADING, SIGNED_IN]);

    expect(status()).toBeEmptyDOMElement();
  });

  it("leaves focus where it is", () => {
    const view = walk(ACCOUNT_PATH, [LOADING, SIGNED_OUT]);
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();

    mocks.auth = { ...SIGNED_IN };
    act(() => {
      view.rerender(<SigningInStatus landing={ACCOUNT_PATH} />);
    });

    expect(status()).toHaveTextContent("Signing you in");
    expect(field).toHaveFocus();
    field.remove();
  });

  it("passes axe, empty and showing the line", async () => {
    const view = walk(ACCOUNT_PATH, [LOADING, SIGNED_OUT]);
    await expectNoAxeViolations(view.container);

    mocks.auth = { ...SIGNED_IN };
    act(() => {
      view.rerender(<SigningInStatus landing={ACCOUNT_PATH} />);
    });
    await expectNoAxeViolations(view.container);
  });
});
