import { SignIn } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { billing } from "@/config/billing";
import { ACCOUNT_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";

import { landingAfterSignIn } from "../../landing";

export const metadata: Metadata = {
  title: "Sign in",
};

/**
 * Sign in by emailed code, through Clerk's prebuilt component. Spec 0012,
 * AC-8. The code only and email only rules are the Clerk instance's settings
 * (task 1, Go live step 1); this page decides where Clerk lands afterwards,
 * from `redirect_url` read here on the server, and sends a visitor who is
 * already signed in to Account.
 */
export default async function SignInPage({
  searchParams,
}: PageProps<"/sign-in/[[...sign-in]]">) {
  if (billing === null) return null;

  const { isAuthenticated } = await auth();
  if (isAuthenticated) redirect(ACCOUNT_PATH);

  const landing = landingAfterSignIn((await searchParams).redirect_url);

  return (
    <SignIn
      path={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      forceRedirectUrl={landing}
      signUpForceRedirectUrl={landing}
    />
  );
}
