"use client";

import { useClerk } from "@clerk/nextjs";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

import { loadDocument } from "@/lib/document-load";
import { LEGAL } from "@/lib/legal";
import { SIGN_IN_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";

import { deleteAccountAction, type DeleteResult } from "./account/actions";
import { ContactLink } from "./contact-link";
import { leaveAccount, SIGNING_OUT } from "./sign-out";

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

type Step = "idle" | "confirming" | "deleting" | "leaving" | "to-sign-in";

/** The steps that wait, with the confirm busy and Cancel disabled. */
type BusyStep = Exclude<Step, "idle" | "confirming">;

/**
 * What the busy confirm says, naming what is happening now (spec 0013,
 * AC-34): once the account is gone it is no longer deleting, and the full
 * sentence is too long for a button, so it says what Sign out says.
 */
const BUSY_LABEL: Readonly<Record<BusyStep, string>> = Object.freeze({
  deleting: "Deleting your account",
  leaving: SIGNING_OUT,
  "to-sign-in": "Taking you to sign in",
});

/**
 * What a waiting step says to a screen reader, in the hidden region, so it
 * hears that something is under way (WCAG 4.1.3): the delete, and leaving
 * can each take seconds.
 */
const BUSY_TEXT: Readonly<Record<BusyStep, string>> = Object.freeze({
  deleting: "Deleting your account",
  leaving: "Your account is deleted. Signing you out",
  "to-sign-in": "Taking you to sign in",
});

/** What takes focus once the step it belongs to has rendered. */
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

  // Focus follows the step, so it is never left on a button that just went.
  // Cancel, not the delete, takes it on opening, so a held Enter key cannot
  // run straight through both steps. While it waits, the busy confirm keeps
  // it, being focusable still (spec 0013, AC-34). After a problem it is put
  // back on the confirm, where a press left it in most browsers; Safari's
  // click focuses no button, so this puts it there to try again.
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
      setStep("to-sign-in");
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

  const busyStep: BusyStep | null =
    step === "idle" || step === "confirming" ? null : step;
  const busy = busyStep !== null;

  // Red only here, for the two buttons that destroy the account (spec 0013,
  // AC-35 and INV-12); Cancel stays the site's own `secondary`.
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4">
      {step === "idle" ? (
        <div>
          <Button ref={deleteRef} variant="danger-secondary" onClick={open}>
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
            <Button ref={confirmRef} variant="danger" onClick={confirm} busy={busy}>
              {busyStep === null ? CONFIRM_LABEL : BUSY_LABEL[busyStep]}
            </Button>
            <Button ref={cancelRef} variant="secondary" onClick={cancel} disabled={busy}>
              {CANCEL_LABEL}
            </Button>
          </div>
        </div>
      )}
      {/* One region from the first render to the page load, empty until the
          delete starts, so its words change in place and are announced as a
          status rather than mounted afresh. Visually hidden, because the
          busy confirm already shows what is happening. */}
      <p role="status" className="sr-only">
        {busyStep === null ? "" : BUSY_TEXT[busyStep]}
      </p>
      {/* An alert, because it appears only when there is something to say. */}
      {problem !== null && (
        <p role="alert" className="text-danger-ink">
          {PROBLEM_TEXT[problem]}
        </p>
      )}
    </div>
  );
}
