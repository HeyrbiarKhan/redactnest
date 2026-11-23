# 0024. Search pages: verify steps

The steps no test runs. Everything else is in the suites the build plan names.

## Before merge

1. **The claim walk.** On each search page, read every sentence that says what RedactNest does. Each must match a *Claim register* row and carry a source comment naming it. Fail a sentence only when it promises more than its row (spec 0018, AC-5, *What fails a verify*); a limit worded too strongly is a note.
2. **Lighthouse, mobile.** Build with Playwright's environment (`tests/e2e/build-env.ts`) and start it. For each search page, run Lighthouse's mobile preset through `npx lighthouse`, pointed at Playwright's Chromium (`CHROME_PATH`), three runs each, median kept. Record LCP, CLS and TBT per page in the table below, with the machine and Lighthouse's throttling preset above it, so a later rerun is comparable. Pass: LCP at or under 2.5 s, CLS at or under 0.1, TBT at or under 200 ms (AC-15). Measure `/` too, for reference only.
3. **Feature 29 by eye.** At 320 pixels with 200% text, open and shut the header's menu on `/` and each search page, and confirm nothing is clipped and wider screens look as before (AC-14).
4. **Rich results check.** Paste `/`'s HTML into Google's Rich Results Test (HTML input, not a URL) and confirm one valid `WebSite` item (AC-11).

| Page | LCP | CLS | TBT | Pass |
|---|---|---|---|---|
| `/redact-pdf` | | | | |
| `/remove-text-from-pdf` | | | | |
| `/black-box-redaction` | | | | |
| `/` (reference) | | | | n/a |

## After the production deploy

5. **PageSpeed Insights** on each live search page, mobile. Record the lab figures, and the field figures once Google has them (AC-15).
6. **Preview noindex.** On a Vercel preview of this branch, confirm the response carries `X-Robots-Tag: noindex`, so no preview address is indexed beside production.
7. **Search Console.** Submit `https://redactnest.com/sitemap.xml` and confirm it reads without errors.
