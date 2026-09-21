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
 *    query it reads, and nothing about the document in the answer.
 *  - Failure is closed, never open. An absent, invalid or expired session gets
 *    the free tier. Nothing about a slow or broken network may hand somebody the
 *    paid caps.
 *
 * Feature 10 adds the session cookie read that can answer `paid`. Until it does,
 * there is no session to read and the honest answer is the free tier for
 * everybody, which is also what failing closed would produce.
 */

import { config } from "@/config";
import type { EntitlementSnapshot } from "@/worker/protocol";

/**
 * Route handlers are not cached by default in this version of Next.js, which is
 * what we want. The header is set anyway, because a shared cache in front of the
 * application handing one visitor's tier to another would be a real bug rather
 * than a slow page.
 */
const NO_SHARED_CACHE = "private, no-store";

export async function GET(): Promise<Response> {
  const entitlement: EntitlementSnapshot = {
    tier: "free",
    pageCap: config.freePageCap,
    maxFileBytes: config.maxFileBytes,
  };

  return Response.json(entitlement, {
    headers: { "Cache-Control": NO_SHARED_CACHE },
  });
}
