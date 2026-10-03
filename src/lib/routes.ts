/**
 * The tool route's path, in one place.
 *
 * Every link into the tool and the tool page's own load guard compare against
 * this, so the two cannot drift apart (spec 0003, AC-21). `next.config.ts`
 * keeps its own match, because a header rule is a regular expression.
 */
export const TOOL_PATH = "/tool";

/**
 * The licence and the third party notices, served from our own origin
 * (spec 0009, AC-12 and AC-13). `scripts/sync-legal.mjs` writes both into
 * `public/` before every `dev` and `build`.
 */
export const LICENCE_PATH = "/licence.txt";
export const NOTICES_PATH = "/third-party-notices.txt";

/**
 * The privacy policy and the terms (spec 0011, AC-1). The footer's
 * Legal nav and the line under the drop zone link here, and the pages live at
 * these paths, so the links and the routes cannot drift apart.
 */
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";

/**
 * The home page, where sign out lands. Spec 0012, AC-12 and INV-13: sign out
 * reaches it as a full page load (`window.location.assign`), so Clerk's
 * script stops with the account pages, and the provider's `afterSignOutUrl`
 * names it too.
 */
export const HOME_PATH = "/";

/**
 * Pricing and the account pages (spec 0012). Every link to one of these is a
 * plain `a` (`Button`'s `reload`), never `next/link`, so nothing prefetches an
 * account page or the one that starts a checkout, and `/tool` sends no request
 * beyond the entitlement (INV-10). `src/proxy.ts` matches the account group
 * by these same paths, written literally there because a matcher must be.
 */
export const PRICING_PATH = "/pricing";
export const SIGN_IN_PATH = "/sign-in";
export const SIGN_UP_PATH = "/sign-up";
export const ACCOUNT_PATH = "/account";
export const SUBSCRIBE_PATH = "/account/subscribe";
export const BILLING_PATH = "/account/billing";
export const WELCOME_PATH = "/account/welcome";
