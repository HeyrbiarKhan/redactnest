# 0024. Search pages: verify steps

The steps no test runs. Everything else is in the suites the build plan names.

## Before merge

1. **The claim walk.** On each search page, read every sentence that says what RedactNest does. Each must match a *Claim register* row and carry a source comment naming it. Fail a sentence only when it promises more than its row (spec 0018, AC-5, *What fails a verify*); a limit worded too strongly is a note.
2. **Lighthouse, mobile.** Build with Playwright's environment (`tests/e2e/build-env.ts`) and start it. For each search page, run Lighthouse's mobile preset through `npx lighthouse`, pointed at Playwright's Chromium (`CHROME_PATH`), three runs each, median kept. Record LCP, CLS and TBT per page in the table below, with the machine and Lighthouse's throttling preset above it, so a later rerun is comparable. Pass: LCP at or under 2.5 s, CLS at or under 0.1, TBT at or under 200 ms (AC-15). Measure `/` too, for reference only.
3. **Feature 29 by eye.** At 320 pixels with 200% text, open and shut the header's menu on `/` and each search page, and confirm nothing is clipped and wider screens look as before (AC-14).
4. **Rich results check.** Paste `/`'s HTML into Google's Rich Results Test (HTML input, not a URL) and confirm one valid `WebSite` item (AC-11).
5. **Preview noindex.** On a Vercel preview of this branch, confirm the response carries `X-Robots-Tag: noindex`, so no preview address is indexed beside production.

| Page | LCP | CLS | TBT | Pass |
|---|---|---|---|---|
| `/redact-pdf` | | | | |
| `/remove-text-from-pdf` | | | | |
| `/black-box-redaction` | | | | |
| `/` (reference) | | | | n/a |

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
