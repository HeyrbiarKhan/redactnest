"use client";

import { useClerk } from "@clerk/nextjs";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { loadDocument } from "@/lib/document-load";
import { LEGAL } from "@/lib/legal";
import { SIGN_IN_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";

import { deleteAccountAction, type DeleteResult } from "./account/actions";
import { ContactLink } from "./contact-link";
import { leaveAccount } from "./sign-out";

/** The control's words, beside it, as the account pages keep theirs (AC-11). */
const DELETE_LABEL = "Delete account";
const CONFIRM_LABEL = "Delete my account for good";
const CANCEL_LABEL = "Cancel";
const endsNow = (date: string) => `Your Pro access ends now, not on ${date}.`;

/** Every outcome that keeps the visitor here, plus a call that never answered. */
type Problem = Exclude<DeleteResult, "deleted" | "sign-in"> | "no-answer";

const PROBLEM_TEXT: Readonly<Record<Problem, ReactNode>> = Object.freeze({
  renewing: <>Cancel your subscription in Manage billing first.</>,
  "other-product": (
    <>
      Your email also has a subscription to another {LEGAL.sellerName} product, so we
      can&rsquo;t remove your billing details here. Write to <ContactLink />.
    </>
  ),
  "billing-failed": (
    <>
      We couldn&rsquo;t delete your account. Nothing was removed. Try again, or write to{" "}
      <ContactLink />.
    </>
  ),
  "sign-in-kept": (
    <>
      Your billing details were removed, but your sign in wasn&rsquo;t. Try again to
      finish.
    </>
  ),
  // The request may or may not have reached the server, so this claims
  // neither. A reload shows which: Account again, or sign in once the user is gone.
  "no-answer": (
    <>
      We didn&rsquo;t hear back, so we can&rsquo;t tell whether your account was deleted.
      Reload the page to check.
    </>
  ),
});

type Step = "idle" | "confirming" | "deleting" | "leaving";

/** Which button takes focus once the step it belongs to has rendered. */
type FocusTarget = "delete" | "confirm" | "cancel";

/**
 * Delete account, a two step confirm in place. Spec 0012, AC-11 and INV-13.
 *
 * The server action decides everything (the refusals, Polar then Clerk) from
 * the session alone; this only asks it and says what came back. Once the
 * account is gone it leaves with Sign out's control in its after deletion
 * mode, so the home page loads as a new document whatever Clerk's `signOut`
 * does with a user that no longer exists, and Clerk's cookies go with it.
 *
 * `endsOn` is the day Pro was set to end, from the page's plan check, so the
 * confirm can say that deleting ends it now instead.
 */
export function DeleteAccount({ endsOn }: { readonly endsOn: string | null }) {
  const clerk = useClerk();
  const [step, setStep] = useState<Step>("idle");
  const [problem, setProblem] = useState<Problem | null>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<FocusTarget | null>(null);
  const warningId = useId();

  // Focus follows the step, so it is never left on a button that just went or
  // was disabled. Cancel, not the delete, takes it on opening, so a held Enter
  // key cannot run straight through both steps; after a problem it goes back
  // to the button that was pressed.
  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    const refs = { delete: deleteRef, confirm: confirmRef, cancel: cancelRef };
    refs[target].current?.focus();
  }, [step, problem]);

  function open() {
    focusNext.current = "cancel";
    setStep("confirming");
  }

  function stay(next: Problem) {
    focusNext.current = "confirm";
    setProblem(next);
    setStep("confirming");
  }

  async function confirm() {
    setProblem(null);
    setStep("deleting");
    let result: DeleteResult;
    try {
      result = await deleteAccountAction();
    } catch {
      stay("no-answer");
      return;
    }
    if (result === "deleted") {
      setStep("leaving");
      await leaveAccount(clerk, "after-deletion");
      return;
    }
    if (result === "sign-in") {
      // The session ended in the meantime. Sign in is inside the account
      // group, but a page load keeps every way through here alike.
      setStep("leaving");
      loadDocument(SIGN_IN_PATH);
      return;
    }
    stay(result);
  }

  function cancel() {
    focusNext.current = "delete";
    setProblem(null);
    setStep("idle");
  }

  const busy = step === "deleting" || step === "leaving";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {step === "idle" ? (
        <div>
          <Button ref={deleteRef} variant="secondary" onClick={open}>
            {DELETE_LABEL}
          </Button>
        </div>
      ) : (
        <div
          role="group"
          aria-label={DELETE_LABEL}
          aria-describedby={endsOn === null ? undefined : warningId}
          className="flex flex-col gap-3"
        >
          {endsOn !== null && (
            <p id={warningId} className="text-body text-ink">
              {endsNow(endsOn)}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button ref={confirmRef} onClick={confirm} disabled={busy}>
              {CONFIRM_LABEL}
            </Button>
            <Button ref={cancelRef} variant="secondary" onClick={cancel} disabled={busy}>
              {CANCEL_LABEL}
            </Button>
          </div>
        </div>
      )}
      {/* An alert, because it appears only when there is something to say. */}
      {problem !== null && (
        <p role="alert" className="text-danger-ink">
          {PROBLEM_TEXT[problem]}
        </p>
      )}
    </div>
  );
}
