import { ACCOUNT_PATH, SUBSCRIBE_PATH } from "@/lib/routes";

/**
 * Where Clerk lands after signing in or up. Spec 0012, AC-8.
 *
 * Subscribe when the page that sent the visitor here was Subscribe itself,
 * so a free visitor who chose Get Pro goes straight on to checkout, and the
 * account page otherwise. Never anywhere else, `/tool` included: the tool must
 * open under its own content security policy on a real page load, and an open
 * redirect would let a link send someone wherever it liked after signing in.
 *
 * Both pages pass the result as Clerk's `forceRedirectUrl` every time, rather
 * than only in the Subscribe case, because Clerk follows a `redirect_url` in
 * the address over its fallback, and only the forced value outranks it.
 */
export function landingAfterSignIn(redirectUrl: unknown): string {
  return redirectUrl === SUBSCRIBE_PATH ? SUBSCRIBE_PATH : ACCOUNT_PATH;
}
