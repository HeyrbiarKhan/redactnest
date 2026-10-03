/**
 * What the visitor in front of us is allowed to do.
 *
 * Spec 0001 decided this shape so the tool route never has to load a third party
 * auth script: the page calls exactly one same origin endpoint, and that is the
 * only thing `connect-src 'self'` has to permit there.
 *
 * Two rules this endpoint exists to keep:
 *
 *  - It accepts no document data and returns none. There is no request body, no
 *    query it reads, and nothing about the document in the answer. The only
 *    thing it reads is Clerk's sign in cookie.
 *  - Failure is closed, never open, and never silent. An absent, forged or
 *    stale sign in, or a check that fails, gets the free tier with the reason
 *    in `account` (spec 0012, INV-2). Nothing about a slow or broken network
 *    may hand somebody the paid caps.
 *
 * Spec 0012, AC-1 and AC-2: the decision itself is `resolveEntitlement` in
 * `src/billing`, which reads the cookie locally and asks Polar only for a user
 * a genuine token names. Clerk's proxy never runs here (INV-1), and this route
 * never sets a cookie of its own (INV-5).
 */

import { cookies } from "next/headers";

import { entitlementSeams } from "@/billing/clients";
import { resolveEntitlement } from "@/billing/entitlement";
import { config } from "@/config";

/**
 * Route handlers are not cached by default in this version of Next.js, which is
 * what we want. The header is set anyway, because a shared cache in front of the
 * application handing one visitor's tier to another would be a real bug rather
 * than a slow page.
 */
const NO_SHARED_CACHE = "private, no-store";

export async function GET(): Promise<Response> {
  const jar = await cookies();
  const entitlement = await resolveEntitlement((name) => jar.get(name)?.value, {
    caps: config,
    billing: entitlementSeams(),
  });

  return Response.json(entitlement, {
    headers: { "Cache-Control": NO_SHARED_CACHE },
  });
}
