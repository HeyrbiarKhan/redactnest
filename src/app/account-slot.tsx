"use client";

import { lazy, Suspense, useEffect, useSyncExternalStore } from "react";

import { avatarInitial } from "@/lib/account-email";
import {
  askAtLoad,
  browserSignedIn,
  readEntitlement,
  readIdentity,
  subscribeEntitlement,
} from "@/lib/entitlement";
import { SIGN_IN_PATH, TOOL_PATH } from "@/lib/routes";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";

import type { AccountMenuText } from "./account-menu";

/**
 * The menu, Radix with it, loads only once a sign in is confirmed, as one more
 * file from our own origin, so an anonymous visitor downloads none of it, on
 * `/tool` or anywhere (spec 0026, child 0001, AC-23).
 */
const AccountMenu = lazy(() =>
  import("./account-menu").then((module) => ({ default: module.AccountMenu })),
);

/**
 * Every word the slot shows, passed down by `PageHeader` from `NAV_TEXT` and
 * `ACCOUNT_MENU_PLAN` in `site-nav.tsx`, so the words keep their one home and
 * this island never imports the header's module.
 */
export interface AccountSlotText extends AccountMenuText {
  readonly signIn: string;
  readonly tryFree: string;
  readonly openTool: string;
}

/**
 * Where this part of the slot sits in `SiteHeader` (child 0001, AC-27):
 * - `row`: in the header's row. From `sm` it holds the whole right side (Sign
 *   in and Try it free, or Open the tool and the avatar); below `sm` only Try
 *   it free or the avatar, because the menu holds the rest.
 * - `menu`: inside the header's small screen menu, below `sm` only: Sign in,
 *   or Open the tool.
 * - `whole`: the whole right side at every width, for a header with no menu
 *   (`/tool` with a document open, AC-30).
 */
export type AccountSlotPart = "row" | "menu" | "whole";

/** The cookie never announces a change, so there is nothing to subscribe to. */
const noChange = () => () => {};
const readCookie = () => browserSignedIn(document.cookie);
/** The server knows nothing of the visitor: the slot renders hidden there. */
const unknownOnServer = () => null;
const noAnswerOnServer = () => null;

/** Held while the menu's file loads: the avatar, the trigger's size, no control yet. */
const TRIGGER_BOX = "inline-flex min-h-10 min-w-10 items-center justify-center";

/**
 * The header's account slot: the one client component the shared header
 * carries onto otherwise static pages, and only on a billing on build (spec
 * 0026, child 0001, AC-19 to AC-25).
 *
 * It reads Clerk's `__client_uat` cookie (read only, never written) through
 * `browserSignedIn`. False shows the signed out shape at once and asks
 * nothing. True, on every page but `/tool`, makes the store's one load ask
 * (`askAtLoad`), a same origin `GET /api/entitlement`; on `/tool` the slot
 * asks nothing, because `tool-client` already asks as the page loads, and it
 * shows the same store's answer whenever that lands (AC-19). Until then a
 * plain `muted` circle holds the avatar's place; then the avatar for a
 * confirmed sign in, or the signed out shape for anything else (AC-20).
 *
 * No flash and no shift (AC-25): both reads go through
 * `useSyncExternalStore`, whose server snapshot is `null`, so the server's
 * HTML and the first client render match. That render is an empty slot held
 * at `--spacing-account-slot` from `sm`, with a `noscript` that keeps Sign in
 * and Try it free for a visitor without scripts.
 *
 * The visitor's address is the session token's, read by the server and
 * narrowed by the store; it is shown only here and in the menu, as React
 * text, and nothing here sends, counts or stores it (AC-21). The slot's lint
 * zone bans every telemetry import, so no count can carry it.
 */
export function AccountSlot({
  part,
  onTool,
  text,
}: {
  readonly part: AccountSlotPart;
  /** On `/tool`: no Try it free or Open the tool, the Pro chip, and no ask of its own. */
  readonly onTool: boolean;
  readonly text: AccountSlotText;
}) {
  const signedIn = useSyncExternalStore(noChange, readCookie, unknownOnServer);
  const identity = useSyncExternalStore(subscribeEntitlement, readIdentity, readIdentity);
  const answer = useSyncExternalStore(
    subscribeEntitlement,
    readEntitlement,
    noAnswerOnServer,
  );

  // One part asks, the one every header has; the store joins any second ask
  // anyway. Never on `/tool`, whose own load ask this waits for (AC-19).
  useEffect(() => {
    if (signedIn === true && !onTool && part !== "menu") askAtLoad();
  }, [signedIn, onTool, part]);

  const view =
    signedIn === null
      ? "hidden"
      : signedIn === false || identity.state === "unconfirmed"
        ? "signed-out"
        : identity.state === "pending" || answer === null
          ? "pending"
          : "signed-in";

  if (part === "menu") {
    // Below `sm` only: from `sm` the row part shows these itself.
    return (
      <div data-account-part="menu" className="flex flex-col items-start gap-1 sm:hidden">
        {view === "hidden" && (
          <noscript>
            <SignIn text={text} />
          </noscript>
        )}
        {view === "signed-out" && <SignIn text={text} />}
        {view === "signed-in" && !onTool && <OpenTool text={text} />}
      </div>
    );
  }

  // In the row, the item the menu holds below `sm` hides there.
  const menuItem = part === "row" ? "max-sm:hidden" : undefined;

  return (
    <div
      data-testid={part === "row" ? "account-slot" : "account-slot-whole"}
      data-view={view}
      className="flex items-center justify-end gap-2.5 sm:min-w-account-slot"
    >
      {view === "hidden" && (
        <noscript>
          <span className="flex items-center gap-2.5">
            <span className={menuItem}>
              <SignIn text={text} />
            </span>
            {!onTool && <TryFree text={text} />}
          </span>
        </noscript>
      )}

      {view === "signed-out" && (
        <>
          <span className={menuItem}>
            <SignIn text={text} />
          </span>
          {!onTool && <TryFree text={text} />}
        </>
      )}

      {view === "pending" && (
        <span data-testid="account-pending" className={TRIGGER_BOX}>
          <Avatar initial={null} state="pending" />
        </span>
      )}

      {view === "signed-in" && answer !== null && (
        <>
          {!onTool && (
            <span className={menuItem}>
              <OpenTool text={text} />
            </span>
          )}
          {/* The plan at a glance on `/tool`, before the avatar (AC-22). */}
          {onTool && answer.tier === "paid" && (
            <span
              data-testid="pro-chip"
              className="rounded-full border border-accent-soft bg-accent-soft px-2.5 py-0.5 text-small font-semibold text-accent-strong"
            >
              {text.proChip}
            </span>
          )}
          <Suspense
            fallback={
              <span className={TRIGGER_BOX}>
                <Avatar initial={avatarInitial(identity.email)} />
              </span>
            }
          >
            <AccountMenu
              email={identity.email}
              answer={answer}
              onTool={onTool}
              text={text}
            />
          </Suspense>
        </>
      )}
    </div>
  );
}

/**
 * Sign in, a plain `a` into the account group, never `next/link`, so nothing
 * prefetches it and the visit is a full page load (spec 0012, INV-10, INV-13).
 */
function SignIn({ text }: { readonly text: AccountSlotText }) {
  return (
    <Button href={SIGN_IN_PATH} reload variant="ghost">
      {text.signIn}
    </Button>
  );
}

/** Try it free, signed out, as a real page load into `/tool` (spec 0003, INV-10). */
function TryFree({ text }: { readonly text: AccountSlotText }) {
  return (
    <Button href={TOOL_PATH} reload>
      {text.tryFree}
    </Button>
  );
}

/** Open the tool, signed in, in Try it free's place (AC-24); never on `/tool`. */
function OpenTool({ text }: { readonly text: AccountSlotText }) {
  return (
    <Button href={TOOL_PATH} reload>
      {text.openTool}
    </Button>
  );
}
