import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { accountSeams } from "@/billing/clients";
import { readPlan } from "@/billing/plan";
import { billing } from "@/config/billing";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { ACCOUNT_PATH, PRICING_PATH, SIGN_IN_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";
import { Card } from "@/ui/card";
import { SummaryList } from "@/ui/summary-list";

import { AccountColumn } from "../account-shell";
import { SignOutControl } from "../sign-out";

export const metadata: Metadata = {
  title: "Account",
};

/**
 * Account. Spec 0012, AC-10 (the first slice: the email, the plan, Get Pro
 * and Sign out; the renewal date, Manage billing and delete follow in task
 * 11 and 12).
 *
 * Everything shown comes from the verified session: the user from `auth()`,
 * the email from `currentUser()`, and the plan from Polar by that user's id,
 * never from anything in the address (spec 0012, *Security model*). Links to
 * Pricing are plain `a` elements (INV-10).
 */
export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const seams = accountSeams();
  if (billing === null || seams === null) return null;

  const { userId } = await auth();
  if (userId === null) redirect(SIGN_IN_PATH);

  const [user, plan, { notice }] = await Promise.all([
    currentUser(),
    readPlan(userId, seams),
    searchParams,
  ]);
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const planName = plan === null ? null : plan.pro ? PRO_PLAN.name : FREE_PLAN.name;

  return (
    <AccountColumn>
      <h1 className="text-title text-ink">Account</h1>

      {/* AC-14: Subscribe sends a Pro user here rather than to a second checkout. */}
      {notice === "already-pro" && plan?.pro === true && (
        <Callout tone="info" title="You're already on Pro." role="status" />
      )}

      {plan === null && (
        <Callout
          tone="warning"
          title="We couldn't check your plan just now."
          action={
            <Button href={ACCOUNT_PATH} reload variant="secondary">
              Check again
            </Button>
          }
        >
          Your account is fine. Try again in a moment.
        </Callout>
      )}

      <Card title="Your account">
        <SummaryList
          items={[
            { term: "Email", description: email },
            ...(planName === null ? [] : [{ term: "Plan", description: planName }]),
          ]}
        />
        <div className="flex flex-wrap gap-3">
          {plan !== null && !plan.pro && (
            <Button href={PRICING_PATH} reload>
              Get Pro
            </Button>
          )}
          <SignOutControl />
        </div>
      </Card>
    </AccountColumn>
  );
}
