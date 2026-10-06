"use client";

import { useClerk } from "@clerk/nextjs";
import { useEffect, useRef, useState } from "react";

import { loadDocument } from "@/lib/document-load";
import { HOME_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";

/** The control's words, beside it, as the account pages keep theirs. */
const SIGN_OUT_LABEL = "Sign out";
/** Exported, so the delete's button says the same once the account is gone. */
export const SIGNING_OUT = "Signing you out";
const SIGN_OUT_FAILED = "We couldn't sign you out. Try again.";

/**
 * Clerk, as far as leaving needs it: `useClerk()` itself, never a copy of
 * `loaded` or `status`, which change as Clerk's script loads or fails to.
 */
export interface LeavingClerk {
  readonly loaded: boolean;
  /** `"error"` once Clerk's script has failed to load, and it never will. */
  readonly status: string;
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
 * `work`'s outcome, or a rejection once `ms` pass without one. `work` gets a
 * signal that aborts at the limit, so it can stop rather than act after it,
 * and let go of whatever it was waiting on.
 */
function withinLimit<T>(
  work: (limit: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const limit = new Promise<never>((_, reject) => {
    controller.signal.addEventListener("abort", () => reject(new Error("time limit")), {
      once: true,
    });
  });
  return Promise.race([work(controller.signal), limit]).finally(() =>
    clearTimeout(timer),
  );
}

/**
 * Settles once Clerk's script has loaded. Until then Clerk's `signOut` only
 * queues the call for that moment and resolves at once, so a page load right
 * after it drops the call and leaves the session signed in.
 *
 * Rejects as soon as Clerk says its script failed to load, rather than
 * leaving the visitor to wait out the limit for a script that is not coming,
 * and stops listening to Clerk once the limit passes.
 */
function clerkLoaded(clerk: LeavingClerk, limit: AbortSignal): Promise<void> {
  if (clerk.loaded) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const stop = () => {
      clerk.off("status", onStatus);
      limit.removeEventListener("abort", onLimit);
    };
    const onStatus = () => {
      if (clerk.loaded) {
        stop();
        resolve();
      } else if (clerk.status === "error") {
        stop();
        reject(new Error("Clerk did not load"));
      }
    };
    const onLimit = () => {
      stop();
      reject(new Error("time limit"));
    };
    limit.addEventListener("abort", onLimit, { once: true });
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
 * settled, within `SIGN_OUT_LIMIT_MS` counts as a `signOut` that threw, and
 * so does Clerk's script failing to load, as soon as Clerk says so.
 *
 * True once the page load has started; false when signing out failed and the
 * visitor should stay to try again, which never happens after deletion.
 */
export async function leaveAccount(
  clerk: LeavingClerk,
  mode: LeaveMode,
): Promise<boolean> {
  try {
    await withinLimit(async (limit) => {
      await clerkLoaded(clerk, limit);
      // Past the limit the visitor has been told it failed, so Clerk turning
      // up later must not end the session behind their back.
      if (limit.aborted) return;
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
 *
 * Leaving can take up to `SIGN_OUT_LIMIT_MS`, so while it runs the button
 * itself says so, busy with a spinner and the working words, and a polite
 * region says it to a screen reader (WCAG 4.1.3). Spec 0013, AC-34 and
 * INV-13. Busy keeps the button focusable, so focus stays where the visitor
 * pressed. On failure the button is enabled again and takes focus, where a
 * press left it in most browsers; Safari's click focuses no button, so this
 * puts it there to try again.
 */
export function SignOutControl() {
  const clerk = useClerk();
  const [state, setState] = useState<"idle" | "leaving" | "failed">("idle");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const leaving = state === "leaving";

  // After the render that enables it, as the tool moves focus (spec 0007,
  // *Focus*), never in the click handler.
  useEffect(() => {
    if (state === "failed") buttonRef.current?.focus();
  }, [state]);

  async function handleClick() {
    setState("leaving");
    const left = await leaveAccount(clerk, "sign-out");
    // A page that is loading keeps the button busy until it goes.
    if (!left) setState("failed");
  }

  // A fragment, so the button sits in its row beside Get Pro. The region is
  // in the page from the first render, empty until leaving starts, so its
  // words are announced as a change rather than mounted with it; it is
  // visually hidden, because the button already shows them. The failure
  // takes a row of its own below every button (`order-last`), while staying
  // next to the button in reading order, and is an alert, because it appears
  // only when there is something to say.
  return (
    <>
      <Button ref={buttonRef} variant="secondary" onClick={handleClick} busy={leaving}>
        {leaving ? SIGNING_OUT : SIGN_OUT_LABEL}
      </Button>
      <p role="status" className="sr-only">
        {leaving ? SIGNING_OUT : ""}
      </p>
      {state === "failed" && (
        <p role="alert" className="order-last w-full text-danger-ink">
          {SIGN_OUT_FAILED}
        </p>
      )}
    </>
  );
}
