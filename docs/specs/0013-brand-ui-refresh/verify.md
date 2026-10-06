# Verify: Brand & UI refresh · spec 0013 · updated 2026-10-06
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open any page in a light browser tab, then a dark one → the favicon is the teal bar in a nest, and on a dark tab bar it turns pale (`accent-soft`) → AC-1, AC-3
- [ ] Zoom the browser tab's favicon at 16 px (or `favicon.ico` in an image viewer) → the bar and both bands stay apart → AC-1
- [ ] On every page, read the header left to right → lockup (home), Redact, Pricing, Account, Redact a PDF; on `/tool` Redact is semibold with a teal bar and there is no Redact a PDF button; on `/pricing` Pricing is current; on `/account` Account is current; on `/sign-in` nothing is current → AC-7
- [ ] Narrow the window to 320 px → the lockup sits alone on the first row, the rest wraps below in page order, nothing scrolls sideways, no menu → AC-7, AC-26
- [ ] Build with billing off → the header shows only the lockup, Redact and the button; the footer has no Pricing; `/pricing` is the 404; `/` shows no See pricing and its cap line names no plan → AC-7, AC-8, AC-9, AC-10
- [ ] Footer on every page → brand column (lockup, not a link, and "PDF redaction in your browser."), Product and Legal groups, then the licence notice unchanged and last → AC-8
- [ ] Visit `/no-such-page` → status 404, "This page doesn't exist", Redact a PDF and Go to the home page, title "Page not found · RedactNest", `noindex` → AC-9
- [ ] Share `/` in a link previewer (or read the head) → the 1200 by 630 card with the lockup, eyebrow and headline, absolute `og:image` and `twitter:image`, `summary_large_image`, the alt text → AC-5
- [ ] `/` at 1280 px → eyebrow, headline, lead naming email addresses and phone numbers, Redact a PDF and See pricing, "Free up to 3 pages a document. Pro goes up to 50.", the product shot on the right, the trio, then "What RedactNest finds and strips" with Finds and Strips → AC-10, AC-11
- [ ] Change `NEXT_PUBLIC_FREE_PAGE_CAP` and `NEXT_PUBLIC_MAX_PAGES` and rebuild → the cap line, Pricing and the sign in panel all follow → AC-10, AC-22, AC-23 (Value sourcing: caps from `config`)
- [ ] Compare the product shot on `/` with `/tool` opened on `tests/fixtures/sample-agreement.pdf` at 1280 by 800 → they match: seven ticked, the all clear line, the plan card for nobody signed in → AC-12
- [ ] `/tool` at idle, 1280 px → drop zone left; rail right with the plan card, the three steps and the lock line → AC-14, AC-15
- [ ] Open `sample-agreement.pdf` → file bar across the top, Found items (7) on the left, the rail on the right: Document opened, plan card, action panel with Redact 7 items and the lock line → AC-16, AC-19
- [ ] Open `tests/fixtures/detect-email.pdf` and scroll the list → Redact stays in view at the top of the rail; at 900 px and at 200% text it scrolls away with the page → AC-17
- [ ] Run a redaction to the result → the result card sits in the panel's place, not sticky, the lock line after it → AC-16, AC-17
- [ ] Keyboard walk at idle on `/tool` → skip link, RedactNest, Redact, Pricing, Account, Choose a PDF, Terms of service, Privacy policy, then the plan card's links → AC-20
- [ ] Screen reader on `/tool` → choosing a file announces the phase lines and the document card once; the plan card announces its words; nothing is announced twice → AC-20
- [ ] `/pricing` → Free and Pro side by side from 768 px, Pro with a 2 px teal edge, Free's Redact a PDF loads `/tool`, Subscribe goes to `/account/subscribe`, the three lines under it unchanged → AC-22
- [ ] Sandbox: `/sign-in` and `/sign-up` → our panel beside Clerk's card from 768 px, Clerk's card shows no logo, See pricing works; Clerk's card passes a hand check with axe and the keyboard → AC-23, AC-26
- [ ] Signed in: `/account`, Welcome, Subscribe and Billing's error lines → shared header with Account current, narrow column, words unchanged → AC-24
- [ ] `/privacy` and `/terms` at 1280 px → On this page on the left, text no wider than 44rem; each link jumps to its heading; at 768 px the list sits above the text → AC-25
- [ ] Forced colours on every page → the mark still shows in the header and footer → AC-26
- [ ] DevTools Network on `/`, `/pricing` and `/tool` (full run) → every request is our own origin; `/tool` adds only the icon files to today's set → AC-21, AC-29
- [ ] Read every word on every changed page, the social card and the sign in panel → each is true of the product today → AC-13, INV-1

## Commands
- [ ] `node scripts/make-brand.mjs` → writes the five files, prints only their paths, leaves no server running on any port → AC-28
- [ ] `node scripts/make-fixture.mjs` → `git status tests/fixtures` clean → AC-12
- [ ] `pnpm test` → the brand files, home text, contrast, policy pages, Clerk appearance and component suites pass → AC-1, AC-3, AC-5, AC-13, AC-23, AC-27, AC-28
- [ ] `pnpm exec playwright test --project=chromium` → shell, design system, legal pages, privacy and review specs pass → AC-4, AC-7 to AC-26, AC-29
- [ ] `pnpm exec vitest run tests/unit/csp.test.ts` → both policies unchanged → AC-4, AC-21

## Acceptance-criteria coverage
- AC-1 to AC-3: favicon, mark and header steps; brand files test · AC-4: head tags and csp test · AC-5, AC-6: social card step, brand files test, spec 0012 Go live step 9 · AC-7, AC-8: header and footer steps · AC-9: 404 step · AC-10 to AC-13: home page steps and word read · AC-14 to AC-20: tool steps and keyboard walk · AC-21, AC-29: network step · AC-22: Pricing step · AC-23, AC-24: sandbox steps · AC-25: legal pages step · AC-26: 320 px, forced colours and axe steps · AC-27: contrast and brand files tests · AC-28: brand script command
