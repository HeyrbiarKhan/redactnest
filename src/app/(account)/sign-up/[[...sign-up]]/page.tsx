import { SignUp } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { billing } from "@/config/billing";
import { ACCOUNT_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";

import { landingAfterSignIn } from "../../landing";

export const metadata: Metadata = {
  title: "Create an account",
};

/**
 * Sign up with an email address alone, through Clerk's prebuilt component.
 * Spec 0012, AC-8: the same landing rule as sign in, and a visitor who is
 * already signed in goes to Account.
 */
export default async function SignUpPage({
  searchParams,
}: PageProps<"/sign-up/[[...sign-up]]">) {
  if (billing === null) return null;

  const { isAuthenticated } = await auth();
  if (isAuthenticated) redirect(ACCOUNT_PATH);

  const landing = landingAfterSignIn((await searchParams).redirect_url);

  return (
    <SignUp
      path={SIGN_UP_PATH}
      signInUrl={SIGN_IN_PATH}
      forceRedirectUrl={landing}
      signInForceRedirectUrl={landing}
    />
  );
}
