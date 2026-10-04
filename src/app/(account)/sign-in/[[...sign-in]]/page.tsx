import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { config } from "@/config";
import { billing } from "@/config/billing";
import { ACCOUNT_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";

import { landingAfterSignIn, pagePath } from "../../landing";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Sign in by emailed code, through Clerk's prebuilt component. Spec 0012,
 * AC-8. The code only and email only rules are the Clerk instance's settings
 * (task 1, Go live step 1); this page decides where Clerk lands afterwards,
 * from `redirect_url` read here on the server, first sheds any of Clerk's
 * other redirect parameters with a redirect to the same step, and sends a
 * visitor who is already signed in to Account.
 */
export default async function SignInPage({
  params,
  searchParams,
}: PageProps<"/sign-in/[[...sign-in]]">) {
  if (billing === null) return null;

  const { isAuthenticated } = await auth();
  if (isAuthenticated) redirect(ACCOUNT_PATH);

  const { landing, clean } = landingAfterSignIn(
    await searchParams,
    new URL(config.siteUrl).origin,
  );
  if (clean !== null) {
    redirect(`${pagePath(SIGN_IN_PATH, (await params)["sign-in"])}${clean}`);
  }

  return (
    <SignIn
      path={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      forceRedirectUrl={landing}
      signUpForceRedirectUrl={landing}
    />
  );
}
