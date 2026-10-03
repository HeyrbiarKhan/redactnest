import { clerkMiddleware } from "@clerk/nextjs/server";
import type { NextFetchEvent, NextRequest } from "next/server";

import { config as appConfig } from "@/config";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";

/**
 * Clerk's proxy, on the account group and nowhere else. Spec 0012, AC-9,
 * AC-23 and INV-1.
 *
 * `clerk-nextjs-patterns` suggests a matcher covering every route and `/api`.
 * This one deliberately matches the account pages only, so Clerk never runs
 * on `/tool`, on `/api/entitlement` (which reads Clerk's cookie itself, with
 * no call to Clerk), or on the public pages, which then set no cookie and
 * make no request to Clerk. `tests/unit/proxy-matcher.test.ts` holds that.
 *
 * With billing off on this build it does nothing, so Clerk's keyless mode can
 * never start. It reads `config.billingEnabled` rather than the server only
 * billing module, which is the same switch: the root layout's gate fails any
 * build where the two could disagree.
 */
const clerk = appConfig.billingEnabled
  ? clerkMiddleware({ signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH })
  : null;

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  return clerk === null ? undefined : clerk(request, event);
}

// Literal paths, because a matcher must be a constant Next.js can read at
// build. They are `SIGN_IN_PATH`, `SIGN_UP_PATH` and `ACCOUNT_PATH` from
// `src/lib/routes.ts`, each with everything under it.
export const config = {
  matcher: [
    "/sign-in",
    "/sign-in/(.*)",
    "/sign-up",
    "/sign-up/(.*)",
    "/account",
    "/account/(.*)",
  ],
};
