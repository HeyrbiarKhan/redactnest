import { clerkMiddleware } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

import { withoutPortalToken } from "@/billing/portal";
import { config as appConfig } from "@/config";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "@/lib/routes";
import type { ServerCrash } from "@/telemetry/events";
import { reportCrash } from "@/telemetry/server";

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
 *
 * One thing runs before Clerk (spec 0012, AC-26). After a payment Polar adds its portal
 * token to the welcome address, and on a page load whose session token has
 * expired (as it always has after a checkout) Clerk redirects to its own
 * handshake with the full address as `redirect_url`. So a request carrying
 * the token gets a 307 to the same address without it, and Clerk only ever
 * sees the clean one. A 307 keeps the method and body, so it holds for any
 * method, on every page in the matcher.
 *
 * And it reports its own failures (spec 0016, AC-26). In Next.js 16.3.5 a
 * throw here never reaches `onRequestError` on Node (`src/instrumentation.ts`
 * says why), so a broken Clerk setup would show only in Vercel's logs. A
 * throw or rejection reports `PROXY_CRASH`, waits for the report, then
 * rethrows the very same error, so Next.js answers exactly as it would
 * without the catch. Nothing is read from the error or the request. No
 * Next.js control flow throw (its redirect or not found errors) can pass
 * through here to be mistaken for a failure: the proxy gives Clerk no
 * callback and calls neither `redirect()` nor `notFound()`.
 */
const clerk = appConfig.billingEnabled
  ? clerkMiddleware({ signInUrl: SIGN_IN_PATH, signUpUrl: SIGN_UP_PATH })
  : null;

/** The proxy knows where it is, so its report is fixed (spec 0016, *Value sourcing*). */
const PROXY_CRASH: ServerCrash = Object.freeze({
  name: "server-crash",
  route: "proxy",
  routeType: "proxy",
});

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  // Above the `try`: with billing off there is nothing that could fail.
  if (clerk === null) return undefined;
  try {
    const clean = withoutPortalToken(request.nextUrl);
    if (clean !== null) return NextResponse.redirect(clean, 307);
    // Awaited, so a rejection from Clerk lands in the catch too.
    return await clerk(request, event);
  } catch (error) {
    await reportCrash(PROXY_CRASH);
    throw error;
  }
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
