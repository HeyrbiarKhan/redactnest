"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useState } from "react";

import { cx } from "@/lib/cx";
import { Card } from "@/ui/card";
import { Spinner } from "@/ui/spinner";

/** Which of Clerk's two forms the wait holds the place of. */
export type ClerkStep = "sign-in" | "sign-up";

/**
 * How long the page waits before it says the form did not load, when Clerk
 * has not said so itself. A start Clerk's servers answer 400 leaves Clerk at
 * `loading`, as a request that hangs does (feature 28's verify walks), so
 * without this the spinner could turn for ever, and this timer is what shows
 * the failure. 20 s is longer than Clerk's own 15 s limit on its script;
 * Clerk's `error`, should it come, ends the wait sooner. A rule about these
 * pages, decided with you on 2026-11-09 (feature 28), not a cap on the
 * visitor.
 */
export const CLERK_WAIT_MS = 20_000;

/**
 * Every word the wait says, by step, here in the account group beside the
 * panel's page rather than in `src/ui` (spec 0003, INV-7).
 */
export const CLERK_WAIT_TEXT: Readonly<
  Record<ClerkStep, Readonly<{ loading: string; failed: string }>>
> = Object.freeze({
  "sign-in": Object.freeze({
    loading: "Loading sign in…",
    failed: "Sign in did not load. Check your connection, then reload this page.",
  }),
  "sign-up": Object.freeze({
    loading: "Loading sign up…",
    failed: "Sign up did not load. Check your connection, then reload this page.",
  }),
});

/**
 * Holds Clerk's card's place on sign in and sign up until the card has drawn.
 * Spec 0013, AC-23, feature 28.
 *
 * Passed as Clerk's own `fallback`, which Clerk shows until it has loaded and
 * its card has children in the page, then drops. So the form replaces this
 * whenever it arrives, even after the failure line has shown on a slow
 * connection, and nothing of ours decides when the card may draw.
 *
 * A white card the size of Clerk's (400 pixels wide from `md`, and 25rem
 * tall, between Clerk's sign in and sign up), so the panel beside it stays
 * where it is when the form takes its place. The line is a polite region from
 * the first render, so a screen reader reads it with the page and hears the
 * failure when it replaces the line; the spinner says nothing. A failure is a
 * `danger-ink` line, never a red button (spec 0013, INV-12).
 */
export function ClerkWait({ step }: { readonly step: ClerkStep }) {
  const { status } = useClerk();
  const [waitedOut, setWaitedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedOut(true), CLERK_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const failed = status === "error" || waitedOut;
  const text = CLERK_WAIT_TEXT[step];

  return (
    <Card
      data-testid="clerk-wait"
      className="min-h-100 w-full max-w-100 items-center justify-center md:w-100"
    >
      {!failed && <Spinner size="lg" />}
      <p
        role="status"
        className={cx("max-w-72 text-center", failed ? "text-danger-ink" : "text-ink")}
      >
        {failed ? text.failed : text.loading}
      </p>
    </Card>
  );
}
