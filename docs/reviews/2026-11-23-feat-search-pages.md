# Review, feat/search-pages, 2026-11-23

**Reviewed by**: Sonnet 5.5 (author on Sonnet 5.5)
**Scope**: 47 files, branch vs main
**Verdict**: Approve with nits

## Summary
Adds three static search pages over one typed record (`src/lib/search-pages.ts`) and a shared template, a Guides footer group, sitemap and robots, per page page-view kinds, a site line, a `WebSite` JSON-LD block on `/`, narrow width fixes (CoverFigure, home), and per page social cards from `make-brand.mjs`. The change follows AGENTS.md closely: words in lib text modules, `Button reload` with `TOOL_PATH`, closed telemetry kinds held by `satisfies readonly PageKind[]`, claims sourced to register rows, caps from `config`. ESLint is clean on the changed source. Only stale comments and small tidy-ups remain.

## Minor
### 🟡 Stale page kind counts in the client report cache comment, `src/telemetry/client.ts:25`
**Problem**: The comment says the set holds at most 26 shapes, with `browser-crash` on 12 page kinds. `PAGE_KINDS` now has 14 entries (10 old + 3 search + `not-found`), so the figure is 14 kinds and 30 shapes. `src/telemetry/server.ts` was updated correctly (14 kinds, 142), so the two comments now disagree.
**Why it matters**: The comment justifies "never needs pruning"; a wrong bound misleads the next person who adds a kind.
**Suggested fix**: Change to 14 page kinds and 30 shapes (the 2 crash sources give 28, plus `engine-unavailable` and `still-waiting`).

### 🟡 `HomePage`'s doc comment is detached from its function, `src/app/page.tsx:~45-75`
**Problem**: The `metadata` export and `WEBSITE_JSON_LD` were inserted between `HomePage`'s long JSDoc (reload buttons, product shot) and `export default function HomePage`, so that JSDoc now sits above the `metadata` doc comment and `HomePage` has none.
**Why it matters**: Tooling and readers attach the wrong comment to the wrong symbol.
**Suggested fix**: Move the new `metadata` and `WEBSITE_JSON_LD` blocks above the existing JSDoc.

## Nits
- ⚪ `src/lib/search-pages.ts:~43` imports types from `@/ui/cover-figure` and `@/telemetry/events` into `src/lib`; type only so no wall breaks, but it is a lib to ui dependency. Consider noting it as intentional.
- ⚪ `AGENTS.md` gained only the raster files line; the rule that search page words live in `src/lib/search-pages.ts` (and the sitemap and robots rules) is not recorded. Leave to /sync.
- ⚪ `src/app/search-page.tsx` `answerKey` uses paragraph text as a React key; fine while texts are unique per page, a duplicate would warn.

## Strengths
- One closed record per page with every sentence carrying its claim register row and spec source, plus tests that ban outcome phrases and count ideas.
- Page kinds, footer, sitemap and card alt text all derive from `SEARCH_PAGES` and are held by typecheck or tests, so a page cannot drift from its links or telemetry.
- `make-brand.mjs` discovers search pages from the built sitemap and fails when a card's text overflows 1200 by 630.
- JSON-LD is escaped (`<` to `\u003c`) and confined to `/`; robots rationale (leave noindex pages crawlable) is documented.

## Test coverage
Strong: component tests for the pages, nav and CoverFigure; unit tests for sitemap, telemetry kinds, brand files and policy pages; e2e for heads, headers and CSP, privacy (same origin), reflow at 320 px and 200% text, and axe. `verify.md` records a full walk with Lighthouse figures. No untested branching logic found; the only unrun step is the card words variation (covered by `brand-files.test.ts`).
