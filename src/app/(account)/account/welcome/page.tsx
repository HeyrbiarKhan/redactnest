import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { billing } from "@/config/billing";
import { SIGN_IN_PATH } from "@/lib/routes";

import { AccountColumn } from "../../account-shell";
import { WelcomePoll } from "./welcome-poll";

export const metadata: Metadata = {
  title: "Welcome to Pro",
};

/**
 * Where Polar's checkout sends the buyer after paying. Spec 0012, AC-16. The
 * page itself only checks there is a session; the confirming is the client
 * component's, asking the same `/api/entitlement` the tool asks.
 */
export default async function WelcomePage() {
  if (billing === null) return null;

  const { userId } = await auth();
  if (userId === null) redirect(SIGN_IN_PATH);

  return (
    <AccountColumn>
      <h1 className="text-title text-ink">Thank you</h1>
      <WelcomePoll />
    </AccountColumn>
  );
}
