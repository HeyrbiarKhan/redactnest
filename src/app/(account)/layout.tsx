import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { billing } from "@/config/billing";
import { ACCOUNT_PATH, HOME_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";

import { AccountColumn, AccountShell } from "./account-shell";
import { CLERK_APPEARANCE } from "./clerk-appearance";

/** No page in the group belongs in a search index (spec 0012, AC-9). */
export const metadata: Metadata = {
  robots: { index: false },
};

/**
 * The account group: sign in, sign up, Account and everything under it. Spec
 * 0012, AC-8, AC-9 and AC-23.
 *
 * The only place Clerk's script loads (INV-1): `/`, `/pricing`, the legal
 * pages and `/tool` render no provider, so they make no request to Clerk.
 *
 * With billing off on this build there is no provider at all, so Clerk's
 * keyless mode, which would call Clerk and write a `.clerk` folder, can never
 * start, and every page in the group says accounts are not set up. Each page
 * also returns early when billing is off, because Next.js renders a page
 * beside its layout rather than inside it, and a page that reached for Clerk
 * with no provider would throw.
 *
 * The paths and the fallback landing come from `src/lib/routes.ts` as props,
 * never environment variables, and telemetry is off, so no setting can turn
 * telemetry on or send sign in to `/tool`.
 */
export default function AccountLayout({ children }: { readonly children: ReactNode }) {
  if (billing === null) {
    return (
      <AccountShell>
        <AccountColumn>
          <h1 className="text-title text-ink">Accounts are not set up</h1>
          <p className="text-ink-muted">
            This copy of RedactNest runs without accounts or a paid plan, so there is
            nothing to sign in to. The tool works as it is, up to its free limit.
          </p>
        </AccountColumn>
      </AccountShell>
    );
  }

  return (
    <ClerkProvider
      publishableKey={billing.publishableKey}
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      signInFallbackRedirectUrl={ACCOUNT_PATH}
      signUpFallbackRedirectUrl={ACCOUNT_PATH}
      afterSignOutUrl={HOME_PATH}
      telemetry={false}
      appearance={CLERK_APPEARANCE}
    >
      <AccountShell>{children}</AccountShell>
    </ClerkProvider>
  );
}
