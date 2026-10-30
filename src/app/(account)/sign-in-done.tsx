"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

import { report } from "@/telemetry/client";
import type { SignInCompleted } from "@/telemetry/events";

/**
 * Counts a finished sign in or sign up. Spec 0016, AC-14.
 *
 * Rendered by the sign in and sign up pages beside Clerk's card. It sends
 * `sign-in-completed` once, when Clerk's signed in flag turns true while it is
 * mounted: it must first see the visitor signed out, so a page that loads
 * with a session already open (the server sends that visitor to Account
 * anyway) counts nothing. `report` sends with `keepalive`, so Clerk's
 * redirect straight after should not drop it; the sandbox walk checks that.
 * The event says which page, never who.
 */
export function SignInDone({ via }: { readonly via: SignInCompleted["via"] }): null {
  const { isSignedIn } = useAuth();
  const seenSignedOut = useRef(false);
  const reported = useRef(false);

  useEffect(() => {
    if (isSignedIn === false) {
      seenSignedOut.current = true;
    } else if (isSignedIn === true && seenSignedOut.current && !reported.current) {
      reported.current = true;
      report({ name: "sign-in-completed", via });
    }
  }, [isSignedIn, via]);

  return null;
}
