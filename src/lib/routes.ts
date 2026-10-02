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
 * The privacy policy and the terms of use (spec 0011, AC-1). The footer's
 * Legal nav and the line under the drop zone link here, and the pages live at
 * these paths, so the links and the routes cannot drift apart.
 */
export const PRIVACY_PATH = "/privacy";
export const TERMS_PATH = "/terms";
