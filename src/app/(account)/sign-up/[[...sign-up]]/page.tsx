import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { config } from "@/config";
import { billing } from "@/config/billing";
import { ACCOUNT_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";

import { AccountShell } from "../../account-shell";
import { landingAfterSignIn, pagePath } from "../../landing";
import { SignInPanel } from "../../sign-in-panel";

export const metadata: Metadata = {
  title: "Create an account",
};

/**
 * Sign up with an email address alone, through Clerk's prebuilt component.
 * Spec 0012, AC-8: the same landing rule as sign in, the same refusal of
 * Clerk's other redirect parameters, and a visitor who is already signed in
 * goes to Account.
 */
export default async function SignUpPage({
  params,
  searchParams,
}: PageProps<"/sign-up/[[...sign-up]]">) {
  if (billing === null) return null;

  const { isAuthenticated } = await auth();
  if (isAuthenticated) redirect(ACCOUNT_PATH);

  const { landing, clean } = landingAfterSignIn(
    await searchParams,
    new URL(config.siteUrl).origin,
  );
  if (clean !== null) {
    redirect(`${pagePath(SIGN_UP_PATH, (await params)["sign-up"])}${clean}`);
  }

  // Nothing is current in the header here (spec 0013, AC-7). Wide, with our
  // panel beside Clerk's card from md and above it below (AC-23).
  return (
    <AccountShell width="wide">
      <div className="grid w-full items-center gap-10 md:grid-cols-[minmax(0,1fr)_auto]">
        <SignInPanel />
        <SignUp
          path={SIGN_UP_PATH}
          signInUrl={SIGN_IN_PATH}
          forceRedirectUrl={landing}
          signInForceRedirectUrl={landing}
        />
      </div>
    </AccountShell>
  );
}
