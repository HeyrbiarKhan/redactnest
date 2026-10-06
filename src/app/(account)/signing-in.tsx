"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";

import { ACCOUNT_PATH, SUBSCRIBE_PATH } from "@/lib/routes";
import { Spinner } from "@/ui/spinner";

import type { Landing } from "./landing";

/**
 * What the line says while Clerk finishes, by where Clerk lands. Spec 0013,
 * AC-32. A record over `Landing`, so a third landing fails `pnpm typecheck`
 * until it has words.
 *
 * Subscribe is named as the page, not as checkout, because Subscribe sends a
 * visitor who already holds Pro, or whose payment is settling, to Account or
 * Welcome instead. Neither line claims more than that signing in is under way.
 */
export const SIGNING_IN_TEXT: Readonly<Record<Landing, string>> = Object.freeze({
  [ACCOUNT_PATH]: "Signing you in",
  [SUBSCRIBE_PATH]: "Signing you in, then on to Subscribe",
});

/**
 * Where Clerk's state has been: still loading, loaded and signed out, then
 * finishing once it leaves "loaded and signed out".
 */
type Phase = "loading" | "signed-out" | "finishing";

/**
 * The status line below Clerk's card on sign in and sign up. Spec 0013, AC-32.
 *
 * Clerk's own button and code field show its loading state until it reports
 * the sign in or sign up done; the page then changes a moment later. This
 * covers that moment: once `useAuth()` leaves "loaded and signed out" after
 * having been in it (`isSignedIn` turning true, or `isLoaded` turning false
 * while Clerk moves to the new session, whichever it emits first), it shows
 * the spinner and one line until the page changes.
 *
 * It never shows while Clerk first loads (the state was never signed out), and
 * never after a wrong code (the state stays signed out, and Clerk's own error
 * is the only message). The region is in the page and empty from the first
 * render, so its first words are heard, and nothing here moves focus. It reads
 * only Clerk's state: no request, and nothing from the address or the browser
 * decides its words beyond the landing the server already chose.
 */
export function SigningInStatus({ landing }: { readonly landing: Landing }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [phase, setPhase] = useState<Phase>("loading");

  // Set while rendering, as React advises for state that follows a changing
  // value, so no frame shows the old phase and no effect runs a second render.
  const signedOut = isLoaded && isSignedIn === false;
  if (phase === "loading" && signedOut) setPhase("signed-out");
  if (phase === "signed-out" && !signedOut) setPhase("finishing");

  return (
    <div
      role="status"
      data-testid="signing-in"
      className="flex min-h-6 items-center gap-3 text-ink-muted"
    >
      {phase === "finishing" && (
        <>
          <Spinner />
          {SIGNING_IN_TEXT[landing]}
        </>
      )}
    </div>
  );
}
