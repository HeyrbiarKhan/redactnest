/**
 * Clerk's placeholder on sign in and sign up, spec 0013, AC-23 (feature 28):
 * the *Clerk's placeholder* scenario.
 *
 * `useClerk` is faked, because Clerk's script loads from Clerk's host and
 * never runs in a test. When Clerk drops the placeholder for its card is
 * Clerk's own `fallback` behaviour, walked by hand in the sandbox; what is
 * ours, and proved here, is what the placeholder says while it waits, when it
 * gives up, and that it says it in one status node a screen reader already
 * knows.
 *
 * jsdom computes no colour, so the failure's `danger-ink` is proved by the
 * token the line takes, as the spinner's own test does.
 */

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ClerkWait, type ClerkStep } from "@/app/(account)/clerk-wait";

import { expectNoAxeViolations } from "../../setup/component";

type ClerkStatus = "loading" | "ready" | "degraded" | "error";

const mocks = vi.hoisted(() => ({ status: "loading" as ClerkStatus }));

vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ status: mocks.status }),
}));

/**
 * The words AC-23 gives, written out here rather than read from
 * `CLERK_WAIT_TEXT`, so a slip in the words fails this test.
 */
const WORDS: Readonly<Record<ClerkStep, { loading: string; failed: string }>> = {
  "sign-in": {
    loading: "Loading sign in…",
    failed: "Sign in did not load. Check your connection, then reload this page.",
  },
  "sign-up": {
    loading: "Loading sign up…",
    failed: "Sign up did not load. Check your connection, then reload this page.",
  },
};

const STEPS = ["sign-in", "sign-up"] as const satisfies readonly ClerkStep[];

/** 20 seconds of ours, your call on 2026-11-09, longer than Clerk's 15. */
const WAIT_MS = 20_000;

beforeEach(() => {
  mocks.status = "loading";
});

afterEach(() => {
  vi.useRealTimers();
});

describe("ClerkWait", () => {
  describe.each(STEPS)("on %s", (step) => {
    it("holds the card's place with the large spinner over the step's loading line", () => {
      render(<ClerkWait step={step} />);

      const card = screen.getByTestId("clerk-wait");
      const spinner = screen.getByTestId("spinner");
      const line = screen.getByRole("status");
      expect(line).toHaveTextContent(WORDS[step].loading);
      expect(card).toContainElement(spinner);
      expect(card).toContainElement(line);
      expect(spinner).toHaveClass("size-10");
      // Spinner over line.
      expect(
        spinner.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(line).toHaveClass("text-ink");
      expect(line).not.toHaveClass("text-danger-ink");
    });

    /** A screen reader hears the line, not the spinner. */
    it("says only its line, the spinner hidden", () => {
      render(<ClerkWait step={step} />);

      expect(screen.getByTestId("spinner")).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByTestId("clerk-wait").textContent).toBe(WORDS[step].loading);
    });

    it("gives way to the step's failure line in danger-ink, in the same status node, once Clerk reports error", () => {
      const { rerender } = render(<ClerkWait step={step} />);
      const line = screen.getByRole("status");

      mocks.status = "error";
      rerender(<ClerkWait step={step} />);

      expect(screen.getByRole("status")).toBe(line);
      expect(line).toHaveTextContent(WORDS[step].failed);
      expect(line).toHaveClass("text-danger-ink");
      expect(line).not.toHaveClass("text-ink");
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    it("shows the failure line from the first render when Clerk already reports error", () => {
      mocks.status = "error";
      render(<ClerkWait step={step} />);

      expect(screen.getByRole("status")).toHaveTextContent(WORDS[step].failed);
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });
  });

  /**
   * Only `error` ends the wait early (AC-23). `ready` comes a moment before
   * Clerk's card draws and drops this, so the line must not fail then.
   */
  it.each(["loading", "ready", "degraded"] as const satisfies readonly ClerkStatus[])(
    "keeps the loading line while Clerk reports %s",
    (status) => {
      mocks.status = status;
      render(<ClerkWait step="sign-in" />);

      expect(screen.getByRole("status")).toHaveTextContent(WORDS["sign-in"].loading);
      expect(screen.getByTestId("spinner")).toBeInTheDocument();
    },
  );

  /** INV-12: a failure is a line, never a red button. */
  it("offers no control when it fails, only the line", () => {
    mocks.status = "error";
    render(<ClerkWait step="sign-in" />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  /**
   * A start Clerk's servers refuse, or a host that hangs, leaves Clerk at
   * `loading` (feature 28's verify walks), so our timer is what shows the
   * failure.
   */
  describe("when Clerk never says", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it("keeps the loading line just before 20 seconds, and shows the failure line at 20, in the same node", () => {
      render(<ClerkWait step="sign-up" />);
      const line = screen.getByRole("status");

      act(() => {
        vi.advanceTimersByTime(WAIT_MS - 1);
      });
      expect(line).toHaveTextContent(WORDS["sign-up"].loading);
      expect(screen.getByTestId("spinner")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByRole("status")).toBe(line);
      expect(line).toHaveTextContent(WORDS["sign-up"].failed);
      expect(line).toHaveClass("text-danger-ink");
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    /**
     * The timer only ever says it gave up. Clerk coming back to `loading` or
     * `ready` after it does not bring the spinner back: only Clerk's card
     * replacing the whole placeholder ends the failure line.
     */
    it("keeps the failure line once the wait is over, whatever Clerk reports next", () => {
      const { rerender } = render(<ClerkWait step="sign-in" />);
      act(() => {
        vi.advanceTimersByTime(WAIT_MS);
      });

      mocks.status = "ready";
      rerender(<ClerkWait step="sign-in" />);

      expect(screen.getByRole("status")).toHaveTextContent(WORDS["sign-in"].failed);
      expect(screen.queryByTestId("spinner")).not.toBeInTheDocument();
    });

    /** Clerk drops the placeholder once its card draws; nothing of ours outlives it. */
    it("leaves no timer behind once Clerk drops it", () => {
      const { unmount } = render(<ClerkWait step="sign-in" />);
      expect(vi.getTimerCount()).toBe(1);

      unmount();

      expect(vi.getTimerCount()).toBe(0);
    });
  });

  // axe runs on real timers: its own queue never drains under fake ones.
  it("passes axe while it loads", async () => {
    const { container } = render(<ClerkWait step="sign-in" />);

    await expectNoAxeViolations(container);
  });

  it("passes axe once it fails", async () => {
    mocks.status = "error";
    const { container } = render(<ClerkWait step="sign-up" />);

    await expectNoAxeViolations(container);
  });
});
