import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { accountSeams } from "@/billing/clients";
import { openPortal } from "@/billing/portal";
import { billing } from "@/config/billing";
import { ACCOUNT_PATH, BILLING_PATH, PRICING_PATH, SIGN_IN_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";

import { AccountColumn } from "../../account-shell";
import { ContactLink } from "../../contact-link";

export const metadata: Metadata = {
  title: "Manage billing",
};

/**
 * Manage billing: Polar's customer portal for the signed in user, or the
 * reason it did not open. Spec 0012, AC-17 and INV-3.
 *
 * A dynamic page that redirects from the server, as Subscribe does, so it
 * works however the visitor arrives and can show an error in place. It takes
 * no props: the customer is the session's, decided in `openPortal` in
 * `src/billing`, and nothing in the address reaches Polar.
 *
 * Signed out, it goes to sign in, and Clerk then lands on Account (AC-8 allows
 * no other landing but Subscribe), where Manage billing is one click away.
 */
export default async function BillingPage() {
  const seams = accountSeams();
  if (billing === null || seams === null) return null;

  const { userId } = await auth();
  const outcome = await openPortal(userId, {
    createCustomerSession: seams.createCustomerSession,
    returnUrl: `${seams.siteUrl}${ACCOUNT_PATH}`,
  });

  switch (outcome.kind) {
    case "sign-in":
      redirect(SIGN_IN_PATH);
    case "no-customer":
      redirect(PRICING_PATH);
    case "portal":
      redirect(outcome.url);
    case "portal-failed":
      return (
        <AccountColumn>
          <h1 className="text-title text-ink">Manage billing</h1>
          <Callout
            tone="danger"
            title="Billing didn't open"
            role="alert"
            action={
              <Button href={BILLING_PATH} reload variant="secondary">
                Try again
              </Button>
            }
          >
            We couldn&rsquo;t open billing. Try again, or write to <ContactLink />.
          </Callout>
        </AccountColumn>
      );
  }
}
