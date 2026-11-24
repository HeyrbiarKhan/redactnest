# 0024. Search pages: verify steps

The steps no test runs. Everything else is in the suites the build plan names.

## Before merge

1. **The claim walk.** On each search page, read every sentence that says what RedactNest does. Each must match a *Claim register* row and carry a source comment naming it. Fail a sentence only when it promises more than its row (spec 0018, AC-5, *What fails a verify*); a limit worded too strongly is a note.
2. **Lighthouse, mobile.** Build with Playwright's environment (`tests/e2e/build-env.ts`) and start it. For each search page, run Lighthouse's mobile preset through `npx lighthouse`, pointed at Playwright's Chromium (`CHROME_PATH`), three runs each, median kept. Record LCP, CLS and TBT per page in the table below, with the machine and Lighthouse's throttling preset above it, so a later rerun is comparable. Pass: LCP at or under 2.5 s, CLS at or under 0.1, TBT at or under 200 ms (AC-15). Measure `/` too, for reference only.
3. **Feature 29 by eye.** At 320 pixels with 200% text, open and shut the header's menu on `/` and each search page, and confirm nothing is clipped and wider screens look as before (AC-14).
4. **Structured data check.** Paste `/`'s `WebSite` block into Schema.org's validator (validator.schema.org, Code snippet, not a URL) and confirm one valid `WebSite` item with no errors (AC-11). Not Google's Rich Results Test: it no longer reports a `WebSite` block on its own ("No items detected"). Paste the block inside a bare page rather than the whole of `/`, so the footer's name does not go to an outside service.
5. **Preview noindex.** On a Vercel preview of this branch, confirm the response carries `X-Robots-Tag: noindex`, so no preview address is indexed beside production.

Measured 2026-11-23 (task 13, before merge), on the production build of 9b686da (only docs changed since), built and served with Playwright's environment on `localhost:3000`.

- **Machine**: Dell Inspiron 15 3530, Intel Core i5-1335U (10 cores, 12 threads), 16 GB RAM, Windows 11 Home. Lighthouse's benchmark index across the 12 runs: 3,086 to 3,211.
- **Tool**: Lighthouse 13.6.0 CLI, default config (the mobile preset), `--only-categories=performance`, Chrome for Testing 153.0.8010.12 headless (Playwright 1.63.0's `chromium-1243`, through `CHROME_PATH`).
- **Preset**: form factor mobile, screen 412 by 823 at 1.75 device pixel ratio, simulated throttling: 150 ms round trip, 1,638.4 Kbps throughput, CPU slowed 4 times.
- **Method**: three runs per page, the median of each figure kept separately.

| Page | LCP | CLS | TBT | Pass |
|---|---|---|---|---|
| `/redact-pdf` | 0.76 s (0.77, 0.76, 0.76) | 0 | 69 ms (82, 35, 69) | yes |
| `/remove-text-from-pdf` | 0.76 s (0.76, 0.76, 0.76) | 0 | 63 ms (33, 63, 65) | yes |
| `/black-box-redaction` | 0.76 s (0.76, 0.76, 0.76) | 0 | 70 ms (70, 123, 59) | yes |
| `/` (reference) | 2.57 s (2.59, 2.57, 2.57) | 0 | 70 ms (63, 107, 70) | n/a |

On each search page the largest paint is text, so it lands with the first paint (0.76 s). On `/` it is the product shot image, which puts `/` just over 2.5 s. `/` is outside AC-15, so this is a note for later, not a failure.

### Verified 2026-11-23 (`/check verify marketing site`, on 9b686da)

Every before merge step passed, on a build with Playwright's environment served on 3000, plus one variant build. Lighthouse (step 2) was not rerun: no code changed since the figures above.

- [x] 1. Claim walk: every sentence on the three pages, the figure and the site line matches its register row and carries its source comment. Nothing promises more than its row.
- [x] 3. At 320 pixels with 200% text, menu shut and open, on `/` and the three pages: nothing past the window in `main`, nothing clipped. Screenshots in `.playwright-mcp/search-verify/`.
- [x] 4. One valid `WebSite` item (0 errors, 0 warnings), in Schema.org's validator (validator.schema.org), from `/`'s block in a bare page. Google's Rich Results Test answers "No items detected" for it, because `WebSite` alone is no longer a Google rich result type, so step 4 now names Schema.org's validator.
- [x] 5. The preview at 9b686da answers anonymous requests with Vercel's sign in redirect and `X-Robots-Tag: noindex`, on `/`, `/redact-pdf` and `/black-box-redaction`.
- [x] 10 to 14 (slice 2), over all three pages: frames in order, one `h1`, More guides on each; both buttons load `/tool` as a new document; the look over link lands on `/security`'s "What it can miss" heading; the footer shows Product, Guides, Legal, links 24 pixels tall, one paragraph; each card shows its eyebrow and headline, served 200, alt files as specced.
- [x] 15. Vitest: 8 files, 397 tests passed (the five named, plus `cover-figure`, `telemetry-events` and `security-page`).
- [x] 16. `○` for the three pages, their cards, `/sitemap.xml` and `/robots.txt`.
- [x] 17. Each page's head: canonical, `og:url` and `og:image` absolute, alt words as specced, no JSON-LD.
- [x] 18. The five suites: 434 passed in 2.8 minutes.
- [x] 19 and 20. Variant build with billing off, `NEXT_PUBLIC_FREE_PAGE_CAP=7` and `NEXT_PUBLIC_SITE_URL=https://example.test`: each page reads "Up to 7 pages a document.", no Free or Pro, no terms line, `/pricing` gone from the sitemap and 404; every address, the robots line and the `WebSite` `url` on `example.test`.
- [x] 21. Each lead names the same seven detectors (held by the component test).
- [x] 23. Page views post `redact-pdf`, `remove-text` and `black-box`.
- [ ] 22. Not run: the card words were not varied in a scratch copy. `brand-files.test.ts` (step 15) holds each alt file equal to its record.

Note, older than this branch: with a classic (non overlay) scrollbar, as in a headed Chromium on Windows, every page at 320 pixels with 200% text scrolls 15 pixels sideways, the 404 page included. The header and footer wordmark is 288 pixels wide there, which with its gutter fills 320 exactly. The suite's headless browser has overlay scrollbars, so it cannot see this. Recorded in the spec's Follow-up and the scope's Deferred list.

## After the production deploy

6. **PageSpeed Insights** on each live search page, mobile. Record the lab figures, and the field figures once Google has them (AC-15).
7. **Search Console.** Submit `https://redactnest.com/sitemap.xml` and confirm it reads without errors.

## Feature 29, as built (2026-11-23, tasks 1 and 2)

What step 3 looks at, made concrete by the build. The wide pieces were the headline's longest word ("Redaction", 381 pixels in a 256 pixel column), the band's heading ("RedactNest"), and each band card's tile, gap and padding, wider than the card.

8. **The combined test.** `pnpm exec playwright test --project=chromium tests/e2e/design-system.spec.ts --grep "spec 0024"` against a build with Playwright's environment: both cases pass, the 320 pixel and 200% text case over `REFLOW_PAGES` (menu shut and open) and `/`'s boxes at 1280 pixels (AC-14).
9. **At 320 pixels with 200% text on `/`.** The headline breaks "Redaction" inside its column; in both band cards the tile sits above the heading, above each row's words and above the closing line, and no word reaches past its card. Open the menu: the same (AC-14).
10. **At 200% text from `lg`.** At 1024, 1100 and 1280 pixels the headline stays inside its own column and never reaches the product shot. Before this build it ran 25 to 60 pixels into the shot at 1024 and 1100; at 1280 "Redaction" now breaks inside its column where it used to run into the gap (AC-14, wider screens).
11. **At the default text size.** At 390, 600, 960 and 1280 pixels the hero and both band cards look as before, each tile beside its words (AC-14: nothing stacks above 12rem of card content).

## Slice 2, `/redact-pdf` as built (2026-11-23, tasks 3 to 9)

What the build added for one whole search page. Run against a build with Playwright's environment, served on port 3000 (the build and the browser suites can share it).

### UI / manual

10. **The frame.** Open `/redact-pdf`: the eyebrow "Redact a PDF", the one `h1` "Redact a PDF without uploading it", the lead naming every detector, "Redact a PDF now", the cap line; the trio (Stays in your browser, You choose from a list, Checked before you download); How it works with the tool's three steps; "What redacting a PDF should do" with three paragraphs and the look over line; "Redact a PDF now" again. No More guides yet: it appears once task 10 adds the other two pages (AC-3).
11. **Into the tool.** Press each "Redact a PDF now": `/tool` loads as a new document, never a client side move (AC-4).
12. **The look over link.** Follow "What it can miss": it lands on `/security#what-it-can-miss`, on that heading (AC-7).
13. **The footer.** On `/`, `/tool` and `/redact-pdf`, the footer shows Product, then Guides ("Redacting a PDF", to `/redact-pdf`), then Legal, and one paragraph, the licence notice (AC-9).
14. **The card.** Share `https://<preview>/redact-pdf` in a card preview tool, or open its `og:image`: the lockup, "REDACT A PDF" and the headline, in the home card's composition (AC-2, AC-16).

### Commands

15. `pnpm exec vitest run tests/component/app/search-pages.test.tsx tests/unit/sitemap.test.ts tests/unit/policy-pages.test.ts tests/component/app/site-nav.test.tsx tests/unit/brand-files.test.ts` → all pass (AC-1 to AC-3, AC-5 to AC-10, AC-16).
16. `pnpm build` → `○ /redact-pdf`, `○ /redact-pdf/opengraph-image.png`, `○ /sitemap.xml` and `○ /robots.txt` in the route table (AC-1, AC-10).
17. `curl -s localhost:3000/redact-pdf` → the canonical, `og:url` and `og:image` are absolute on `NEXT_PUBLIC_SITE_URL`, `og:image:alt` reads "RedactNest. Redact a PDF. Redact a PDF without uploading it.", and there is no `<script type="application/ld+json">` (AC-1, AC-2).
18. `pnpm exec playwright test --project=chromium tests/e2e/shell.spec.ts tests/e2e/headers.spec.ts tests/e2e/privacy.spec.ts tests/e2e/design-system.spec.ts tests/e2e/legal-pages.spec.ts` → all pass: the head per page, the buttons, the sitemap and robots, the same standard policy as `/`, same origin requests, the `redact-pdf` page view, axe at desktop, 320 pixels and forced colours, 200% text, `REFLOW_PAGES`, and every focus ring (AC-1, AC-2, AC-4, AC-7, AC-10, AC-12 to AC-14).

### Value sourcing (vary the source, check the output)

19. **Cap line and plan names.** Build with billing off (none of the seven billing values): the cap line reads "Up to 3 pages a document.", no "Free" or "Pro" on the page, and `/sitemap.xml` drops `/pricing`. Build with `NEXT_PUBLIC_FREE_PAGE_CAP=7`: the line follows (AC-8, AC-10).
20. **Site address.** Build with another `NEXT_PUBLIC_SITE_URL` (say `https://example.test`): the canonical, `og:url`, `og:image`, every sitemap address, the robots `Sitemap:` line and `/`'s `WebSite` `url` all follow it (AC-2, AC-10, AC-11).
21. **Detectors in the lead.** The lead's list equals `lookedFor("conjunction")`, so it matches the tool's coverage note word for word (row M4).
22. **Card words.** Change the eyebrow or headline in a scratch copy and rerun `scripts/make-brand.mjs`: the card and its alt file follow, and `brand-files.test.ts` fails until the record's `socialAlt` agrees (AC-16).
23. **Page kind.** Visit `/redact-pdf` on the Playwright build: the page view posts `{ "name": "page-view", "page": "redact-pdf" }`, never `not-found` (AC-12).

### Acceptance criteria coverage (this slice)

AC-1: 15, 16, 17, 18 · AC-2: 14, 17, 18, 20 · AC-3: 10, 15 · AC-4: 11, 18 · AC-5 and AC-6: 15, step 1 · AC-7: 12, 18 · AC-8: 15, 19 · AC-9: 13, 15 · AC-10: 15, 16, 18, 19, 20 · AC-11: 20, step 4 · AC-12: 18, 23 · AC-13: 18 · AC-14: 18 · AC-15: step 2 · AC-16: 14, 15, 22.

## The lockup and the footer at large text (2026-11-24, tasks 14 to 17)

What changed since 4416531: the header and footer lockup steps down a size in a narrow row (tasks 14 and 15, AC-14), and the footer's brand column never shrinks below its own content from `md` (tasks 16 and 17, AC-17). Run against a build with Playwright's environment, served on port 3000. Everything verified earlier stays as recorded above.

- [x] 24. **The footer at 200% text.** Open `/` at 1280, 1024 and 768 pixels with 200% text: "RedactNest" and the brand line stay inside their column, and the link groups wrap to its right (AC-17).
- [x] 25. **The footer at default text.** At the same widths with default text the footer looks as before: the brand and the three groups in one row (AC-17).

### Verified 2026-11-24 (`/check verify marketing site`, on 8249559)

Built with Playwright's environment and served on 3000. Scripts and footer shots in `.playwright-mcp/verify-1124/`.

- Step 24: at 1280, 1024 and 768 with 200% text, the brand column's words end inside it (48 to 336 in a column 48 to 336), and every group starts at 400, right of it. The groups wrap: Product and Guides side by side at 1280, all three stacked at 1024 and 768. No footer word past the window.
- Step 25: at the same widths with default text, the brand and the three groups share one row and the groups one line, as before.
- The lockup (tasks 14 and 15): 20 pixels at default text and 40 at 1280 with 200% text; at 320 and 305 with 200% text it steps down to 32 in both header and footer and ends inside the window (footer at 288 and 273). No sideways scroll at either width.
- `design-system.spec.ts`, the footer case, `REFLOW_PAGES` and the 320 cases: 65 passed.
- Note, already in the spec's Follow-up: `/` at 1024 with 200% text still scrolls 3 pixels sideways from the trio card, not the footer.
