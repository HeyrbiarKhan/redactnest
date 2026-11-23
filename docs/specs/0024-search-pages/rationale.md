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

### The lockup at narrow widths (2026-11-23)

CI (Ubuntu, headless Chromium, run 45146529620) failed AC-14's case on all four `REFLOW_PAGES` pages: `scrollWidth` 323 in a 320 window, menu shut, at `design-system.spec.ts:2453`. The same build passes on Windows. You asked for the cause to be measured first, then for a fit with room to spare on any machine, ideally also closing the 15 pixel Follow-up, keeping spec 0013's brand rules and not loosening the test.

Measured on the Playwright build on Windows with scratch Playwright scripts that read every box near the window's edge, the lockups' widths and font sizes, and the row's content edge, at 320 pixels with 200% text:

| Run | Page width / window | Header lockup | Footer lockup |
|---|---|---|---|
| Headless, as built | 320 / 320 | 287.7 wide, ends at 319.7 | 287.7, ends at 319.7 |
| Headless, `--disable-font-subpixel-positioning` | 320 / 320 | 287.7, unchanged | 287.7 |
| Headed (classic scrollbar), as built | 320 / 305 | 287.7, ends at 319.7, the only box past 305 | 287.7 |
| Headless, step to `text-body` below 10rem | 320 / 320 | 230.2, ends at 262.2 | 230 of ink in a 256 box |
| Headed, step to `text-body` below 10rem | 305 / 305 | 230.2, ends at 262.2 (row ends at 272.8) | 230 of ink in a 241 box |
| Headed, step to `text-small` below 10rem | 305 / 305 | 201.4, ends at 233.4 | as above |
| Headless 305, step to `text-body` | 305 / 305 | fits; only the hidden skip link's words reach 308 | |

The lockup ends 0.3 pixels inside the window on Windows, so CI's 3 pixels are Linux drawing the word wider. That could not be reproduced here: there is no Linux browser on this machine, and turning off subpixel positioning changes nothing on Windows. Every other box reaching the edge is a full width container. With the step, `/`, the three search pages, `/security`, `/terms`, `/tool` and the 404 page pass at 320 headless and with a classic scrollbar, menu shut and open. Unchanged to the tenth of a pixel: 320 pixels at default text, 384 and 400 pixels at 200% text, and 1280 pixels at both sizes.

Options weighed (your picks, 2026-11-23):
- **Step down in a narrow row** (chosen): the header and footer rows become containers, and the lockup drops one type step when its row is under 10rem. It changes only big text on narrow windows; phones at default text and every desktop stay as they are. Cost: the lockup is one step smaller than the visitor's text would make it in that one case, and two rows gain size containment.
- **Fluid size from the row**: `min(1.25rem, about 12.5cqi)`, always about 10% spare. Smooth, but text sized by a container unit is close to the viewport unit text spec 0003's INV-6 bans, it can fall below the 14 pixel floor in a narrow row, and a fluid size is harder to hold in a test.
- **Smaller lockup on every phone**: below `sm` at every text size. One media query, but it shrinks the brand on every phone at default text, where it fits today with room.
- **Mark above the word**: keeps the word large (about 230 pixels at 200% text), but changes the lockup's shape, which spec 0013's AC-2 describes as the mark before the word.
- **Narrower gutters**: not enough. 16 pixel gutters still leave 16 + 288 + 16 = 320, so no room to spare.

The step's size (your pick): `text-body`, the largest step that still fits inside the row with a classic scrollbar (11 pixels on Windows, about 8 on Linux). `text-small` would leave 39 pixels in the row but shrinks the brand further; `text-lead` (about 259 pixels) spills 18 pixels into the row's right gutter with a scrollbar.

The guard (your pick): `REFLOW_PAGES` also at 305 pixels, which is the layout a 15 pixel classic scrollbar leaves at 320, so headless Chromium sees it. It fails on the build as it stands, so it guards the Follow-up. The alternatives were a spare room assertion on the lockup alone (narrower: another wide element could slip past with a scrollbar) and no new guard. Running it showed one artifact: the skip link is `sr-only` (a 1 pixel clipped box, no scroll), but a text range reports its unclipped words, 309 pixels at 200% text, which end at 308, past 305. Your first pick was that at 305 only, the text walk passes over text whose element box is at most 1 pixel wide. The cross check (another model) noted that this would also excuse any later hidden element, so at your call it narrowed to the skip link's own words (`closest('a[href="#main"]')`), at 305 only. At 320 the walk keeps every node, as today, so the existing case is not loosened. The other choices were to drop the text walk at 305 (weaker), or to use the lockup assertion instead.

The cross check's other gaps were closed as recommended, at your call: it named the real component test files, settled the helper's signature and the width loop, accepted that a 305 window differs from a scrollbar only for `vw` lengths, added a read of the built CSS, and explained the footer's single column below `md`. Two of its points were not taken. It said container queries make the rows containing blocks, but `container-type: inline-size` adds style and inline size containment, not layout containment, and the open menu sits in the top layer either way. It also suggested holding the header and footer rows in the 1280 record test, but a `w-full` row cannot change size from containment, and 1280 was measured unchanged.

Why a smaller size and not letting the word break: "RedactNest" is one word and the wordmark, so `break-all` or wrapping would split the brand mid word, and spec 0013's AC-2 reads it as the word it is.

Recorded as an update to this spec rather than a new one (your pick), since the case, the pages and the Follow-up are this spec's; spec 0013's AC-2 gains a one line note.
