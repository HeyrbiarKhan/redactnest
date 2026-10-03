import { auth, currentUser } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { accountSeams } from "@/billing/clients";
import { subscribe } from "@/billing/subscribe";
import { billing } from "@/config/billing";
import { LEGAL } from "@/lib/legal";
import {
  ACCOUNT_PATH,
  PRICING_PATH,
  SIGN_IN_PATH,
  SUBSCRIBE_PATH,
  WELCOME_PATH,
} from "@/lib/routes";
import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";

import { AccountColumn } from "../../account-shell";

export const metadata: Metadata = {
  title: "Subscribe",
};

/**
 * Subscribe: a checkout for the signed in user, or the reason there is none.
 * Spec 0012, AC-14 and INV-3.
 *
 * A dynamic page that redirects from the server, so it works whether Clerk
 * lands here with a client side navigation or a full load, and it can show an
 * error in place. It takes no props: nothing in the address reaches Polar.
 * The user is the session's and the email is that user's (INV-3), decided in
 * `subscribe` in `src/billing`.
 */
export default async function SubscribePage() {
  const seams = accountSeams();
  if (billing === null || seams === null) return null;

  const { userId } = await auth();
  const outcome = await subscribe(userId, {
    ...seams,
    getEmail: async () =>
      (await currentUser())?.primaryEmailAddress?.emailAddress ?? null,
    successUrl: `${seams.siteUrl}${WELCOME_PATH}`,
    returnUrl: `${seams.siteUrl}${PRICING_PATH}`,
  });

  switch (outcome.kind) {
    case "sign-in":
      redirect(`${SIGN_IN_PATH}?redirect_url=${encodeURIComponent(SUBSCRIBE_PATH)}`);
    case "already-pro":
      redirect(`${ACCOUNT_PATH}?notice=already-pro`);
    case "settling":
      redirect(WELCOME_PATH);
    case "checkout":
      redirect(outcome.url);
    case "plan-unknown":
      return (
        <SubscribeFailed>
          We couldn&rsquo;t check your plan just now, so we didn&rsquo;t start a checkout.
          Try again.
        </SubscribeFailed>
      );
    case "checkout-failed":
      return (
        <SubscribeFailed>
          We couldn&rsquo;t start the checkout. Try again, or write to{" "}
          <a href={`mailto:${LEGAL.contactEmail.trim()}`}>{LEGAL.contactEmail.trim()}</a>.
        </SubscribeFailed>
      );
  }
}

/** The page when no checkout started, with a way to try again. */
function SubscribeFailed({ children }: { readonly children: React.ReactNode }) {
  return (
    <AccountColumn>
      <h1 className="text-title text-ink">Subscribe</h1>
      <Callout
        tone="danger"
        title="No checkout was started"
        role="alert"
        action={
          <Button href={SUBSCRIBE_PATH} reload variant="secondary">
            Try again
          </Button>
        }
      >
        {children}
      </Callout>
    </AccountColumn>
  );
}
