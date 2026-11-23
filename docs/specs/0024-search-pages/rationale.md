# 0024. Search pages: rationale

## Context

RedactNest is live, Pro has two things worth paying for, and visitors are what is missing (scope, Release 5). Search is the acquisition channel for a self serve tool at this price, and today the site has one page that can rank for the product's job: the home page. Nothing tells a search engine which pages exist (no sitemap, no robots file), and every page shares one social card.

The pages are claims. Feature 16's verifies failed twice on exact claims the code contradicted, so spec 0018 set one rule (AC-5): a claim holds on every file it covers or says what can happen, and an absolute sits only behind a gate every file passes. Every engine change since (specs 0019 to 0023) has had to reread the home page and the security page. Each new page that states engine behaviour adds to that cost and to the chance of a false claim. The owner's brief for this feature: claim outcomes, link to `/security` for engine detail, as few engine claims as possible.

Two lines already on the site miss that rule: the root description says text is "removed from the file, not covered with a black box", which spec 0004's Follow-up rules out (a run draws a box once the text is gone) and which is wider than the self check reads. Search results show it under the home page.

The pages must also hold the rest of the house rules: the standard content security policy unchanged and `/tool`'s untouched (spec 0011), static server pages with no client component, WCAG 2.2 AA, tokens only (spec 0003), real page loads into `/tool` (spec 0003, INV-10), caps from `config` and only what Pro does today (spec 0012, INV-8), and the brand raster files made only by `make-brand.mjs` (spec 0013, AC-28). Feature 29, built on the same branch, adds the first browser test that holds 320 pixels and 200% text together; the search pages must join it rather than start another.

## Options considered

### Option 1: Thin landing pages

Each page is a hero, the trio and a button, with words written straight into each page file.

**Pros**:
- Fewest sentences, so the fewest claims.
- Fastest to build.

**Cons**:
- Search engines tend to treat a page with little unique text as thin and rank it low, so the feature may not reach its goal.
- Words in page files break the project's rule that words live in `src/lib` records, and nothing makes a fourth page carry the same parts.

### Option 2: One shared template over typed records, with a claim register

A shared server component renders a closed set of page records; each page has a hero, a trio, the tool's steps, a short answer section and a close. Every engine claim is a row of a short register backed by a gate; detail links to `/security`.

**Pros**:
- Enough page specific text to answer the search, with few engine claims, each one already proved by a gate.
- A page added without its words fails `pnpm typecheck`, as `PAGE_FINDINGS` and `flow-text.ts` do.
- An engine change rereads a short register, not every sentence.

**Cons**:
- Three pages share one shape, so they read alike.
- The register is one more list to keep true.

### Option 3: Long article guides

Each page is a full guide with several prose sections, written for informational searches.

**Pros**:
- Ranks best on how to searches, which reward depth.
- Room to answer related questions on one page.

**Cons**:
- Many more sentences to hold to AC-5, each one a place a verify can fail.
- Most of the depth would restate `/security`, which spec 0018's AC-6 rules against for that page and which this feature's brief rules out here.

## Rationale

Option 2 is the only one that serves both forces at once: search wants pages with real answers, and the claim history wants few engine sentences. The answer section gives each page its own substance without stating engine detail, because the detail is one link away on `/security`, which already holds it to AC-5. Option 3 would rank better on informational searches, but each extra engine sentence is a place a future engine change can make a page false, and the last eight weeks show that happens. Option 1 is the cheaper failure: safe, but unlikely to rank.

The register is the load bearing piece. Every row is a sentence the home page or the security page already makes behind a gate (the self check, `/tool`'s policy), so no new claim enters the site; and rows G1 and L1 are "can" sentences by construction. The banned phrase test moves to one shared list so the security page and the search pages cannot drift.

Smaller calls, each made in the conversation:
- **Three core pages** over audience pages (more claims to hold; a healthcare page invites a compliance reading) and over a metadata page (details inside pictures can stay until feature 32, so the page would promise less than its search).
- **Flat paths**, short and holding the search words, beside `/security`.
- **Per page cards from `make-brand.mjs`**, the path spec 0013 already proves, over a second drawing path (`next/og`) that could drift from the site's look; the cost is a rerun when a headline changes.
- **`WebSite` JSON-LD on `/` only**: Google cut FAQ and HowTo rich results back in 2023, and a software rich result needs ratings RedactNest does not have; the site name is the one thing JSON-LD still buys.
- **Every public page in the sitemap, no `lastmod`**: a build time date would be false, and the other fields are ignored.
- **A footer Guides group** for a crawl path from every page, header unchanged.
- **Lighthouse in verify, PageSpeed Insights after the deploy**, over a stopwatch test, since the project's stopwatches already flake beside the parallel pool and field data needs weeks of visits.
- **No manifest**, as spec 0013 decided: no search value, and both policies would change.
- **Feature 29 as slice 1**, so the combined test exists before any search page joins it.
- **The security page's miscounted views** wait for a follow up, your call.

### CoverFigure at narrow widths (2026-11-23)

AC-14's stop rule held on `/black-box-redaction`, so this one call came back to `/architect`. Measured on the build at 320 pixels with 200% text, with a scratch Playwright script that read each element's box, its `scrollWidth` against its `clientWidth`, and each word's width:

| Variant | `/black-box-redaction` | `/security` |
|---|---|---|
| As built | page 333 wide, panel 301 in a 256 figure | page 482 wide, panel 450 |
| Box hidden | unchanged, 333 | unchanged, 482 |
| Column floor only (`minmax(0, 1fr)`) | no page scroll, but "Outpatients" overflows its line (153 in 108) | not run |
| Column floor, panel padding 1rem and drawing side padding 0.75rem | still overflows its line (153 in 140) | not run |
| Column floor and `wrap-anywhere` (chosen) | no scroll, nothing overflows, box 108 | no scroll, nothing overflows, box 108 |
| Chosen, at 1280 pixels, default text | unchanged: panels 344, box 128 | unchanged: panels 344, box 128 |

So the box was never the cause; the longest word and the rem padding were. Options weighed:
- **Column floor and break anywhere** (chosen): two classes (`wrap-anywhere` once on each panel after the cross check, so the title and label are covered too, where the measurement put it on the lines and the copy), fixes every figure whatever its words, and adds no rule a later figure's author has to know. Cost: a word can break with no hyphen at 200% text on a phone.
- **Column floor and `hyphens-auto`**: neater breaks, but they depend on each browser's hyphenation dictionary, so the reflow test could pass in Chromium and fail elsewhere, and an address must never gain a hyphen, so the copy would still need `wrap-anywhere`.
- **Shorter drawing words**: fixes `/black-box-redaction` only, leaves `/security`'s address spilling, and leaves an unwritten word length rule for the next figure.
- **Tighter padding when narrow**: measured as not enough on its own.
- **Break anywhere without the column floor**: not measured. It would likely shrink the automatic column on its own, but `grid-cols-1` costs nothing and holds the floor whatever the words, so both stay.
- **Text sized to the container** (container units): rejected without measuring. Spec 0003's INV-6 bars viewport units for text and any text below 14 pixels, and text sized to a 256 pixel figure would fall below that.
