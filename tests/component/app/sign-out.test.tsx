/**
 * Sign out, our own control. Spec 0012, AC-11, AC-12 and INV-13.
 *
 * Clerk's `signOut` is called with a callback, so Clerk does not navigate
 * itself, and the home page then loads as a new document, so Clerk's script
 * stops with the account pages. Clerk and the page load are stubbed at their
 * module boundaries: jsdom cannot redefine `location.assign`.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  leaveAccount,
  SIGN_OUT_LIMIT_MS,
  SignOutControl,
} from "@/app/(account)/sign-out";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn<(callback?: () => void) => Promise<unknown>>(),
  loadDocument: vi.fn<(path: string) => void>(),
}));

vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: mocks.signOut }) }));
vi.mock("@/lib/document-load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-load")>()),
  loadDocument: mocks.loadDocument,
}));

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.loadDocument.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Clerk's `signOut` offline: it hangs rather than throws, never settling. */
const hangs = () => new Promise<never>(() => {});

describe("SignOutControl", () => {
  /** covers: AC-12, INV-13 */
  it("calls signOut with a function, then loads / as a new document", async () => {
    // Clerk runs the callback when a session ended, as it does in the browser.
    mocks.signOut.mockImplementation(async (callback) => callback?.());
    render(<SignOutControl />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/"));
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    const [callback, ...rest] = mocks.signOut.mock.calls[0];
    expect(typeof callback).toBe("function");
    expect(rest).toEqual([]);
  });

  /** covers: AC-12. Clerk skips the callback when no session is left. */
  it("still loads / when signOut resolves without calling back", async () => {
    mocks.signOut.mockResolvedValue(undefined);
    render(<SignOutControl />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/"));
  });

  /** covers: AC-12 */
  it("stays and says so when signOut throws, and loads nothing", async () => {
    mocks.signOut.mockRejectedValue(new Error("network"));
    const { container } = render(<SignOutControl />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Try again.",
    );
    expect(mocks.loadDocument).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    await expectNoAxeViolations(container);
  });

  /**
   * covers: AC-12. Offline, `@clerk/nextjs` awaits a server action whose
   * failure it never handles, so `signOut` hangs; the button must not.
   */
  it("stays and says so when signOut has not settled within the limit", async () => {
    // `fireEvent` and `getBy`, not `userEvent` and `findBy`: Testing Library's
    // async helpers wait on a `setTimeout` it only advances under Jest, so
    // with Vitest's fake clock they never return.
    vi.useFakeTimers();
    mocks.signOut.mockReturnValue(hangs());
    render(<SignOutControl />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(() => vi.advanceTimersByTimeAsync(SIGN_OUT_LIMIT_MS - 1));

    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
    expect(screen.queryByRole("alert")).toBeNull();

    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled();
    expect(mocks.loadDocument).not.toHaveBeenCalled();
  });

  /** covers: AC-12. A second click while leaving cannot start a second sign out. */
  it("is disabled while signing out", async () => {
    mocks.signOut.mockReturnValue(hangs());
    render(<SignOutControl />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations at rest", async () => {
    const { container } = render(<SignOutControl />);
    expect(screen.queryByRole("alert")).toBeNull();
    await expectNoAxeViolations(container);
  });
});

describe("leaveAccount after deletion", () => {
  /** covers: AC-11. The user is gone, so signOut likely fails; the load matters. */
  it("loads / even when signOut throws", async () => {
    mocks.signOut.mockRejectedValue(new Error("user not found"));

    expect(await leaveAccount(mocks.signOut, "after-deletion")).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
  });

  /** covers: AC-11. A hung signOut must not hold the deleted visitor on Account. */
  it("loads / once the limit passes when signOut never settles", async () => {
    vi.useFakeTimers();
    mocks.signOut.mockReturnValue(hangs());

    const left = leaveAccount(mocks.signOut, "after-deletion");
    await vi.advanceTimersByTimeAsync(SIGN_OUT_LIMIT_MS - 1);
    expect(mocks.loadDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(await left).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
  });

  it("loads / when signOut succeeds", async () => {
    mocks.signOut.mockResolvedValue(undefined);

    expect(await leaveAccount(mocks.signOut, "after-deletion")).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
    expect(typeof mocks.signOut.mock.calls[0][0]).toBe("function");
  });
});
