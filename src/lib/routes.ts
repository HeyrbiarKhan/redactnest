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
