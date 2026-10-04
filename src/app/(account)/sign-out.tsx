"use client";

import { useClerk } from "@clerk/nextjs";
import { useState } from "react";

import { loadDocument } from "@/lib/document-load";
import { HOME_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";

/** The control's words, beside it, as the account pages keep theirs. */
const SIGN_OUT_LABEL = "Sign out";
const SIGN_OUT_FAILED = "We couldn't sign you out. Try again.";

/**
 * Clerk, as far as leaving needs it: `useClerk()` itself, never a copy of
 * `loaded`, which changes once Clerk's script has loaded.
 */
export interface LeavingClerk {
  readonly loaded: boolean;
  readonly on: (
    event: "status",
    handler: () => void,
    options: { notify: boolean },
  ) => void;
  readonly off: (event: "status", handler: () => void) => void;
  readonly signOut: (callback?: () => void) => Promise<unknown>;
}

/**
 * How long leaving waits for Clerk to load and its `signOut` to settle before
 * treating it as failed.
 *
 * Clerk's `signOut` can hang rather than throw: before it ends the session,
 * `@clerk/nextjs` awaits a server action of its own, and when that request
 * fails (offline, say) the promise it hands Clerk never settles, so neither
 * does `signOut`. Sign out is a few requests, so this leaves a slow connection
 * plenty of time. A rule about this control, not a cap on the visitor, so it
 * is named here for the one place that uses it.
 */
export const SIGN_OUT_LIMIT_MS = 10_000;

/**
 * `work`'s outcome, or a rejection once `ms` pass without one. `work` can ask
 * whether the limit has passed, so it can stop rather than act after it.
 */
function withinLimit<T>(
  work: (late: () => boolean) => Promise<T>,
  ms: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let late = false;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      late = true;
      reject(new Error("time limit"));
    }, ms);
  });
  return Promise.race([work(() => late), limit]).finally(() => clearTimeout(timer));
}

/**
 * Settles once Clerk's script has loaded. Until then Clerk's `signOut` only
 * queues the call for that moment and resolves at once, so a page load right
 * after it drops the call and leaves the session signed in.
 */
function clerkLoaded(clerk: LeavingClerk): Promise<void> {
  if (clerk.loaded) return Promise.resolve();
  return new Promise((resolve) => {
    const onStatus = () => {
      if (!clerk.loaded) return;
      clerk.off("status", onStatus);
      resolve();
    };
    clerk.on("status", onStatus, { notify: true });
  });
}

/**
 * How a failure to end the session is treated. After deletion the user is
 * already gone, so Clerk's `signOut` will likely fail, and the page load that
 * clears Clerk's cookies is what matters (AC-11).
 */
export type LeaveMode = "sign-out" | "after-deletion";

/**
 * End the Clerk session, then load the home page as a new document. Spec
 * 0012, AC-12 and INV-13.
 *
 * `signOut` gets a callback because with one Clerk does not navigate itself,
 * and its own navigation is a client side one that would leave Clerk's script
 * running on `/` (claims C7 and C9). The app router's `ClerkProvider` sets its
 * own router after the props it is given, so that cannot be changed from
 * outside. The page load runs after `signOut` settles whether or not Clerk ran
 * the callback, since Clerk skips it when no session is left.
 *
 * `signOut` waits for Clerk's script, which may still be loading when the
 * visitor clicks. Clerk that has not loaded, or a `signOut` that has not
 * settled, within `SIGN_OUT_LIMIT_MS` counts as a `signOut` that threw.
 *
 * True once the page load has started; false when signing out failed and the
 * visitor should stay to try again, which never happens after deletion.
 */
export async function leaveAccount(
  clerk: LeavingClerk,
  mode: LeaveMode,
): Promise<boolean> {
  try {
    await withinLimit(async (late) => {
      await clerkLoaded(clerk);
      // Past the limit the visitor has been told it failed, so Clerk turning
      // up later must not end the session behind their back.
      if (late()) return;
      await clerk.signOut(() => {});
    }, SIGN_OUT_LIMIT_MS);
  } catch {
    if (mode === "sign-out") return false;
  }
  loadDocument(HOME_PATH);
  return true;
}

/**
 * Account's Sign out: our own control, never Clerk's `SignOutButton`, which
 * lint bans in every zone for the reason `leaveAccount` gives (INV-13).
 */
export function SignOutControl() {
  const clerk = useClerk();
  const [state, setState] = useState<"idle" | "leaving" | "failed">("idle");

  async function handleClick() {
    setState("leaving");
    const left = await leaveAccount(clerk, "sign-out");
    // A page that is loading keeps the control disabled until it goes.
    if (!left) setState("failed");
  }

  // A fragment, so the button sits in its row beside Get Pro, and the failure
  // takes a line of its own below them. An alert, because it appears only
  // when there is something to say.
  return (
    <>
      <Button variant="secondary" onClick={handleClick} disabled={state === "leaving"}>
        {SIGN_OUT_LABEL}
      </Button>
      {state === "failed" && (
        <p role="alert" className="text-danger-ink w-full">
          {SIGN_OUT_FAILED}
        </p>
      )}
    </>
  );
}
