/**
 * The source link the browser tests build with, defined once.
 *
 * A production build refuses any link that is not one commit's tree (spec
 * 0009, AC-6), so this is a full 40 character commit on a host nothing else
 * would produce. `playwright.config.ts` builds with it and the specs assert
 * it, so a hardcoded repository link anywhere fails the footer test.
 */
export const SOURCE_URL =
  "https://example.invalid/redactnest/tree/0123456789abcdef0123456789abcdef01234567";
