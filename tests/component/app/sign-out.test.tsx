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
  type LeavingClerk,
  SIGN_OUT_LIMIT_MS,
  SignOutControl,
} from "@/app/(account)/sign-out";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({
  useClerk: vi.fn<() => LeavingClerk>(),
  signOut: vi.fn<(callback?: () => void) => Promise<unknown>>(),
  loadDocument: vi.fn<(path: string) => void>(),
}));

vi.mock("@clerk/nextjs", () => ({ useClerk: mocks.useClerk }));
vi.mock("@/lib/document-load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-load")>()),
  loadDocument: mocks.loadDocument,
}));

/** Clerk once its script has loaded, with `mocks.signOut` as its `signOut`. */
const loadedClerk = (): LeavingClerk => ({
  loaded: true,
  status: "ready",
  on: () => {},
  off: () => {},
  signOut: mocks.signOut,
});

beforeEach(() => {
  mocks.signOut.mockReset();
  mocks.loadDocument.mockReset();
  mocks.useClerk.mockReset().mockReturnValue(loadedClerk());
});

afterEach(() => {
  vi.useRealTimers();
});

/** Clerk's `signOut` offline: it hangs rather than throws, never settling. */
const hangs = () => new Promise<never>(() => {});

/** Lets every pending promise run, as real time passing would. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Clerk before its script has loaded, as `@clerk/react` 6 behaves: `signOut`
 * only queues the call and resolves at once, and `load()` runs that queue,
 * then tells every `status` listener. `fail()` is the script failing to load
 * instead: the status turns `error` and `loaded` stays false. `ended` records
 * the session really ending, which a page load before `load()` would have
 * thrown away.
 */
function clerkNotLoadedYet() {
  let loaded = false;
  let status = "loading";
  let queued: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const ended = vi.fn<() => void>();
  const clerk = {
    get loaded() {
      return loaded;
    },
    get status() {
      return status;
    },
    on: (_event: "status", handler: () => void, options: { notify: boolean }) => {
      listeners.add(handler);
      if (options.notify) handler();
    },
    off: (_event: "status", handler: () => void) => {
      listeners.delete(handler);
    },
    signOut: vi.fn(async (callback?: () => void) => {
      const run = () => {
        ended();
        callback?.();
      };
      if (loaded) run();
      else queued = run;
    }),
  } satisfies LeavingClerk;
  const load = () => {
    loaded = true;
    status = "ready";
    queued?.();
    listeners.forEach((handler) => handler());
  };
  const fail = () => {
    status = "error";
    listeners.forEach((handler) => handler());
  };
  return { clerk, ended, load, fail, listeners };
}

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
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    expect(screen.queryByRole("status")).toBeNull();
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
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
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

  /**
   * WCAG 4.1.3. The wait can last the whole limit, so a screen reader hears
   * that it is under way, and focus is not dropped by the disabled button.
   */
  it("says it is signing you out in a status line, which takes focus", async () => {
    mocks.signOut.mockReturnValue(hangs());
    const { container } = render(<SignOutControl />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Signing you out");
    expect(status).toHaveFocus();
    expect(screen.queryByRole("alert")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("has no axe violations at rest", async () => {
    const { container } = render(<SignOutControl />);
    expect(screen.queryByRole("alert")).toBeNull();
    await expectNoAxeViolations(container);
  });
});

describe("SignOutControl before Clerk's script has loaded", () => {
  /**
   * covers: AC-12, INV-13. Found in verify's rerun: a page load straight
   * after Clerk's queued `signOut` threw the call away, so the visitor landed
   * on / still signed in.
   */
  it("waits for Clerk, ends the session, and only then loads /", async () => {
    const stub = clerkNotLoadedYet();
    mocks.useClerk.mockReturnValue(stub.clerk);
    render(<SignOutControl />);

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(settle);

    expect(screen.getByRole("button", { name: "Sign out" })).toBeDisabled();
    expect(stub.clerk.signOut).not.toHaveBeenCalled();
    expect(mocks.loadDocument).not.toHaveBeenCalled();

    act(stub.load);

    await waitFor(() => expect(mocks.loadDocument).toHaveBeenCalledWith("/"));
    expect(stub.ended).toHaveBeenCalledOnce();
    expect(stub.ended).toHaveBeenCalledBefore(mocks.loadDocument);
    expect(typeof stub.clerk.signOut.mock.calls[0][0]).toBe("function");
  });

  /**
   * covers: AC-12. The limit counts the wait for Clerk too, and once the
   * visitor has been told it failed, Clerk arriving later signs nobody out.
   */
  it("stays and says so when Clerk has not loaded within the limit", async () => {
    vi.useFakeTimers();
    const stub = clerkNotLoadedYet();
    mocks.useClerk.mockReturnValue(stub.clerk);
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

    // It stopped listening at the limit, so nothing is left to hear Clerk.
    expect(stub.listeners.size).toBe(0);

    await act(async () => {
      stub.load();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(stub.clerk.signOut).not.toHaveBeenCalled();
    expect(stub.ended).not.toHaveBeenCalled();
    expect(mocks.loadDocument).not.toHaveBeenCalled();
  });

  /**
   * covers: AC-12. Clerk's script failing to load is a sign out that failed,
   * said as soon as Clerk reports it rather than after the whole limit.
   */
  it("stays and says so at once when Clerk's script fails to load", async () => {
    vi.useFakeTimers();
    const stub = clerkNotLoadedYet();
    mocks.useClerk.mockReturnValue(stub.clerk);
    render(<SignOutControl />);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(screen.queryByRole("alert")).toBeNull();

    await act(async () => {
      stub.fail();
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "We couldn't sign you out. Try again.",
    );
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveFocus();
    expect(stub.listeners.size).toBe(0);
    expect(stub.clerk.signOut).not.toHaveBeenCalled();
    expect(mocks.loadDocument).not.toHaveBeenCalled();
  });
});

describe("leaveAccount after deletion", () => {
  /** covers: AC-11. The user is gone, so signOut likely fails; the load matters. */
  it("loads / even when signOut throws", async () => {
    mocks.signOut.mockRejectedValue(new Error("user not found"));

    expect(await leaveAccount(loadedClerk(), "after-deletion")).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
  });

  /** covers: AC-11. A hung signOut must not hold the deleted visitor on Account. */
  it("loads / once the limit passes when signOut never settles", async () => {
    vi.useFakeTimers();
    mocks.signOut.mockReturnValue(hangs());

    const left = leaveAccount(loadedClerk(), "after-deletion");
    await vi.advanceTimersByTimeAsync(SIGN_OUT_LIMIT_MS - 1);
    expect(mocks.loadDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(await left).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
  });

  it("loads / when signOut succeeds", async () => {
    mocks.signOut.mockResolvedValue(undefined);

    expect(await leaveAccount(loadedClerk(), "after-deletion")).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
    expect(typeof mocks.signOut.mock.calls[0][0]).toBe("function");
  });

  /** covers: AC-11, INV-13. The same wait as Sign out's, before the load. */
  it("waits for Clerk's script before signing out", async () => {
    const stub = clerkNotLoadedYet();

    const left = leaveAccount(stub.clerk, "after-deletion");
    await settle();
    expect(stub.clerk.signOut).not.toHaveBeenCalled();
    expect(mocks.loadDocument).not.toHaveBeenCalled();

    stub.load();

    expect(await left).toBe(true);
    expect(stub.ended).toHaveBeenCalledOnce();
    expect(stub.ended).toHaveBeenCalledBefore(mocks.loadDocument);
  });

  /** covers: AC-11. Clerk that never loads must not hold the deleted visitor either. */
  it("loads / once the limit passes when Clerk never loads", async () => {
    vi.useFakeTimers();
    const stub = clerkNotLoadedYet();

    const left = leaveAccount(stub.clerk, "after-deletion");
    await vi.advanceTimersByTimeAsync(SIGN_OUT_LIMIT_MS - 1);
    expect(mocks.loadDocument).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(await left).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
    expect(stub.clerk.signOut).not.toHaveBeenCalled();
  });

  /** covers: AC-11. A script that failed to load is not waited out either. */
  it("loads / at once when Clerk's script fails to load", async () => {
    const stub = clerkNotLoadedYet();

    const left = leaveAccount(stub.clerk, "after-deletion");
    await settle();
    expect(mocks.loadDocument).not.toHaveBeenCalled();

    stub.fail();

    expect(await left).toBe(true);
    expect(mocks.loadDocument).toHaveBeenCalledWith("/");
    expect(stub.clerk.signOut).not.toHaveBeenCalled();
  });
});
