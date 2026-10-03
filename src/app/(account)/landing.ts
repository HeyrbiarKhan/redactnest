import { ACCOUNT_PATH, SUBSCRIBE_PATH } from "@/lib/routes";

/**
 * Where Clerk lands after signing in or up, and the address that sheds Clerk's
 * other redirect parameters. Spec 0012, AC-8 and INV-13.
 *
 * Subscribe when the page that sent the visitor here was Subscribe itself,
 * so a free visitor who chose Get Pro goes straight on to checkout, and the
 * account page otherwise. Never anywhere else, `/tool` included: the tool must
 * open under its own content security policy on a real page load, and an open
 * redirect would let a link send someone wherever it liked after signing in.
 *
 * `redirect_url` names Subscribe as the path, or as an absolute URL on the
 * site's own origin: Clerk makes every redirect URL absolute on the page's
 * origin before carrying it across, so the switch from sign in to sign up
 * hands the other page the absolute form. Both are exact matches, so a query,
 * a fragment, another origin or a repeated parameter lands on Account. This
 * holds only when the site is opened at `config.siteUrl`, which billing
 * already needs (AC-2 rule 3).
 *
 * Both pages pass the landing as Clerk's `forceRedirectUrl`, and as the other
 * page's force URL, every time, because Clerk follows a `redirect_url` in the
 * address over its fallback, and only a forced value outranks it.
 */

/** The two places Clerk may ever land. */
export type Landing = typeof SUBSCRIBE_PATH | typeof ACCOUNT_PATH;

/** A page's search parameters, as Next.js hands them over. */
export type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/**
 * Clerk's own redirect parameters other than `redirect_url`. Clerk ranks a
 * force or fallback URL in the address above the page's forced landing, so a
 * crafted link could land a new sign in on any page by a client side
 * navigation, with Clerk still running there (claims C7 and C9). The first
 * four are the ones Clerk's `RedirectUrls` reads; the last two this Clerk no
 * longer reads, and are refused in case one ever does again.
 */
export const CLERK_REDIRECT_PARAMS = Object.freeze([
  "sign_in_force_redirect_url",
  "sign_in_fallback_redirect_url",
  "sign_up_force_redirect_url",
  "sign_up_fallback_redirect_url",
  "after_sign_in_url",
  "after_sign_up_url",
] as const);

const REDIRECT_URL = "redirect_url";

/** Whether a parameter's value names `path`, as the path or on the site's origin. */
const names = (value: string | string[] | undefined, path: Landing, siteOrigin: string) =>
  value === path || value === `${siteOrigin}${path}`;

export interface LandingDecision {
  readonly landing: Landing;
  /**
   * The search string (with its `?`, or empty) of the address that drops
   * Clerk's other redirect parameters, or `null` when none calls for it.
   */
  readonly clean: string | null;
}

/**
 * The landing for these search parameters, and whether the page must first
 * redirect to an address without Clerk's other redirect parameters. Clerk's
 * own steps carry only our two landings, so they never call for one.
 *
 * The clean address drops those six, carries `redirect_url` only as the
 * Subscribe path when it named Subscribe, and keeps every other parameter in
 * its order, so Clerk's development and handshake parameters survive.
 */
export function landingAfterSignIn(
  params: SearchParams,
  siteOrigin: string,
): LandingDecision {
  const landing: Landing = names(params[REDIRECT_URL], SUBSCRIBE_PATH, siteOrigin)
    ? SUBSCRIBE_PATH
    : ACCOUNT_PATH;

  const refused = CLERK_REDIRECT_PARAMS.some((name) => {
    const value = params[name];
    return (
      value !== undefined &&
      !names(value, SUBSCRIBE_PATH, siteOrigin) &&
      !names(value, ACCOUNT_PATH, siteOrigin)
    );
  });
  if (!refused) return { landing, clean: null };

  const kept = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value === undefined || name === REDIRECT_URL) continue;
    if ((CLERK_REDIRECT_PARAMS as readonly string[]).includes(name)) continue;
    for (const each of typeof value === "string" ? [value] : value)
      kept.append(name, each);
  }
  if (landing === SUBSCRIBE_PATH) kept.append(REDIRECT_URL, SUBSCRIBE_PATH);

  const search = kept.toString();
  return { landing, clean: search === "" ? "" : `?${search}` };
}

/**
 * The page's own path rebuilt from its catch-all segments, so the clean
 * redirect returns to the step Clerk was on (`/sign-in/factor-one`), each
 * segment encoded again as it was in the address.
 */
export function pagePath(base: string, segments: readonly string[] | undefined): string {
  if (segments === undefined || segments.length === 0) return base;
  return `${base}/${segments.map(encodeURIComponent).join("/")}`;
}
