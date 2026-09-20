/**
 * What the pre commit hook runs over the files you actually staged.
 *
 * ESLint first so its `--fix` pass happens before Prettier has the last word on
 * layout. Markdown is absent on purpose: `.prettierignore` leaves it alone.
 *
 * @type {import("lint-staged").Configuration}
 */
const config = {
  // `--no-warn-ignored` keeps a staged but deliberately unlinted file (anything
  // under `public/engine`, say) from failing the whole commit.
  "*.{ts,tsx,mts,mjs}": ["eslint --fix --no-warn-ignored", "prettier --write"],
  "*.{json,css,yaml,yml}": ["prettier --write"],
};

export default config;
