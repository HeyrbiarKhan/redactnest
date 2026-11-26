"use client";

import { CreditCard, FileText, LogOut, Sparkles, UserRound } from "lucide-react";

import { avatarInitial } from "@/lib/account-email";
import {
  ACCOUNT_PATH,
  BILLING_PATH,
  PRICING_PATH,
  SIGN_OUT_PATH,
  TOOL_PATH,
} from "@/lib/routes";
import { Avatar } from "@/ui/avatar";
import { DropdownMenu, type DropdownMenuEntry } from "@/ui/dropdown-menu";
import type { EntitlementSnapshot } from "@/worker/protocol";

/**
 * Which plan line the menu shows (spec 0026, child 0001, AC-23): `unknown`
 * for an `unknown` answer (a genuine token whose plan check failed), else the
 * tier.
 */
export type AccountMenuPlan = "paid" | "free" | "unknown";

/** The menu's words, every one from `site-nav.tsx` through `PageHeader`. */
export interface AccountMenuText {
  readonly yourAccount: string;
  readonly account: string;
  readonly billing: string;
  readonly upgrade: string;
  readonly redactPdf: string;
  readonly signOut: string;
  /** Read after an item that opens a new tab, as `/tool`'s plan card reads it. */
  readonly newTab: string;
  /** The chip on `/tool` for a Pro answer (AC-22). */
  readonly proChip: string;
  readonly plan: Readonly<Record<AccountMenuPlan, string>>;
}

/**
 * The account menu, behind the avatar (spec 0026, child 0001, AC-22 and
 * AC-23). Loaded with `import()` by `AccountSlot` only once a sign in is
 * confirmed, so Radix ships to signed in visitors alone.
 *
 * `DropdownMenu` renders it with `modal={false}`, so `/tool`'s polite regions
 * keep announcing while it is open, and owns the keyboard. In order: who is
 * signed in and on what plan, Account, Billing for Pro or Upgrade to Pro
 * otherwise (Pricing, so the price is read before a checkout opens), Redact a
 * PDF (not on `/tool`), and Sign out. Every item is a plain `a`, never
 * `next/link`, so nothing prefetches an account page (spec 0012, INV-13). On
 * `/tool` the account items open a new tab so the visitor's document stays
 * open; Sign out stays in the tab, where spec 0007's leave warning guards
 * ticked work.
 */
export function AccountMenu({
  email,
  answer,
  onTool,
  text,
}: {
  readonly email: string | null;
  readonly answer: EntitlementSnapshot;
  readonly onTool: boolean;
  readonly text: AccountMenuText;
}) {
  const paid = answer.tier === "paid";
  const plan: AccountMenuPlan = answer.account === "unknown" ? "unknown" : answer.tier;
  const newTab = onTool ? { newTab: text.newTab } : {};
  const initial = avatarInitial(email);

  const entries: readonly DropdownMenuEntry[] = [
    {
      kind: "link",
      href: ACCOUNT_PATH,
      label: text.account,
      icon: UserRound,
      "data-testid": "menu-account",
      ...newTab,
    },
    paid
      ? {
          kind: "link",
          href: BILLING_PATH,
          label: text.billing,
          icon: CreditCard,
          "data-testid": "menu-billing",
          ...newTab,
        }
      : {
          kind: "link",
          href: PRICING_PATH,
          label: text.upgrade,
          icon: Sparkles,
          "data-testid": "menu-upgrade",
          ...newTab,
        },
    ...(onTool
      ? []
      : [
          {
            kind: "link",
            href: TOOL_PATH,
            label: text.redactPdf,
            icon: FileText,
            "data-testid": "menu-tool",
          } as const,
        ]),
    { kind: "separator" },
    {
      kind: "link",
      href: SIGN_OUT_PATH,
      label: text.signOut,
      icon: LogOut,
      "data-testid": "menu-sign-out",
    },
  ];

  return (
    <DropdownMenu
      data-testid="account-menu"
      trigger={<Avatar initial={initial} />}
      triggerLabel={text.yourAccount}
      header={
        <div className="flex min-w-0 items-center gap-3">
          <Avatar initial={initial} />
          <div className="flex min-w-0 flex-col">
            {email !== null && (
              <p
                data-testid="menu-email"
                className="truncate text-small font-semibold text-ink"
              >
                {email}
              </p>
            )}
            <p data-testid="menu-plan" className="text-small text-ink-muted">
              {text.plan[plan]}
            </p>
          </div>
        </div>
      }
      entries={entries}
    />
  );
}
