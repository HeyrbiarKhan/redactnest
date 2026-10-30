/**
 * `SignInDone`, the count of a finished sign in. Spec 0016, AC-14.
 *
 * Clerk's `useAuth` and the reporter are the boundaries. A sign in counts
 * once, when the flag turns true under the component, and only after it was
 * seen false, so a page that loads with a session already open counts
 * nothing.
 */

import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInDone } from "@/app/(account)/sign-in-done";

const mocks = vi.hoisted(() => ({
  isSignedIn: undefined as boolean | undefined,
  report: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({ isSignedIn: mocks.isSignedIn }) }));
vi.mock("@/telemetry/client", () => ({ report: mocks.report }));

beforeEach(() => {
  mocks.isSignedIn = undefined;
  mocks.report.mockClear();
});

/** Render, then walk Clerk's flag through each value in turn. */
function walk(via: "sign-in" | "sign-up", ...states: (boolean | undefined)[]) {
  const view = render(<SignInDone via={via} />);
  for (const state of states) {
    mocks.isSignedIn = state;
    view.rerender(<SignInDone via={via} />);
  }
  return view;
}

describe("SignInDone", () => {
  it("counts a sign in when Clerk's flag turns true, naming the page", () => {
    walk("sign-in", false, true);
    expect(mocks.report.mock.calls).toEqual([
      [{ name: "sign-in-completed", via: "sign-in" }],
    ]);
  });

  it("counts a sign up the same way", () => {
    walk("sign-up", false, true);
    expect(mocks.report.mock.calls).toEqual([
      [{ name: "sign-in-completed", via: "sign-up" }],
    ]);
  });

  it("counts nothing while Clerk loads or the visitor is signed out", () => {
    const { container } = walk("sign-in", undefined, false, false);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("counts nothing for a session that was already open when the page loaded", () => {
    walk("sign-in", true);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it("counts once, whatever Clerk does after", () => {
    walk("sign-in", false, true, false, true, true);
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });
});
