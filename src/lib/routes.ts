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
 * The security and how it works page (spec 0018, AC-1). The footer's Product
 * group links here (AC-2), and the page lives at this path, so the two cannot
 * drift apart.
 */
export const SECURITY_PATH = "/security";

/**
 * The search pages (spec 0024). Each page's record in
 * `src/lib/search-pages.ts` names its path from here, and the footer's Guides
 * group, the sitemap and the telemetry kinds read it from that record or
 * from here, so a page and every link to it cannot drift apart (INV-5).
 */
export const REDACT_PDF_PATH = "/redact-pdf";
export const REMOVE_TEXT_PATH = "/remove-text-from-pdf";
export const BLACK_BOX_PATH = "/black-box-redaction";

/**
 * The home page, where sign out lands. Spec 0012, AC-12 and INV-13: sign out
 * reaches it as a full page load (`window.location.assign`), so Clerk's
 * script stops with the account pages, and the provider's `afterSignOutUrl`
 * names it too.
 */
export const HOME_PATH = "/";

/**
 * The home page's How it works section: its `id`, and the header's link to it
 * from every page, a plain `a` (spec 0026, AC-5 and AC-8).
 */
export const HOW_IT_WORKS_ID = "how-it-works";
export const HOW_IT_WORKS_PATH = `${HOME_PATH}#${HOW_IT_WORKS_ID}`;

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

/**
 * Where every page posts its counts and failure reports (spec 0016, AC-4).
 * Our own origin, so `/tool`'s `connect-src 'self'` already allows it, and the
 * route passes each event on server to server.
 */
export const TELEMETRY_PATH = "/api/telemetry";

/** The plan check the tool asks of its own server (spec 0012, AC-1). */
export const ENTITLEMENT_PATH = "/api/entitlement";

/**
 * What else `/tool` fetches from its own origin, named for the home page's
 * network band (spec 0026, AC-9), which `tests/e2e/network-list.spec.ts`
 * holds to every request a full run makes: the engine, served from
 * `public/engine` (`scripts/sync-engine.mjs`); Next's own built files, the
 * page's scripts, styles and self hosted font; and the icons `src/app`'s icon
 * files serve.
 */
export const ENGINE_PREFIX = "/engine/";
export const NEXT_FILES_PREFIX = "/_next/";
export const ICON_PATHS = Object.freeze(["/favicon.ico", "/icon.svg", "/apple-icon.png"]);
