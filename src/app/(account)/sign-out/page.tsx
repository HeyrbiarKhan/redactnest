import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { billing } from "@/config/billing";
import { HOME_PATH } from "@/lib/routes";

import { NAV_TEXT } from "../../site-nav";
import { AccountColumn, AccountShell } from "../account-shell";
import { SignOutNow } from "../sign-out";

/** Never in a search index, as no page in the group is (spec 0012, AC-9). */
export const metadata: Metadata = {
  title: NAV_TEXT.signOut,
  robots: { index: false },
};

/**
 * Sign out, for the header's menu on every page (spec 0026, child 0001,
 * AC-26). The menu's item is a plain link here, so the pages it sits on never
 * load Clerk's script: this page does, as every account page does, inside
 * `src/proxy.ts`'s matcher, and signs out once its script runs.
 *
 * With nobody signed in there is nothing to end, so it goes home at once, a
 * redirect from the server before Clerk's script ever loads.
 */
export default async function SignOutPage() {
  if (billing === null) return null;

  const { isAuthenticated } = await auth();
  if (!isAuthenticated) redirect(HOME_PATH);

  return (
    <AccountShell>
      <AccountColumn>
        <h1 className="sr-only">{NAV_TEXT.signOut}</h1>
        <SignOutNow />
      </AccountColumn>
    </AccountShell>
  );
}
