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
