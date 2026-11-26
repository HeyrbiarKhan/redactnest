# Verify: UI redesign · spec 0026 · updated 2026-11-26
_Steps derived from spec 0026's acceptance criteria for tasks 6 to 12 (commits bdcab84 and d5a2248). `/check verify` runs these; `/test` locks the durable ones. Tasks 13 to 16 add their own steps when built._

## UI / manual
- [ ] `/tool` at 1280 by 720, open `detect-email.pdf` → file bar, document card, plan card, Found items card stack in one centred column no wider than 44rem; the action panel floats at the window's foot over the list and rests under the last row at the end → AC-12
- [ ] Same page, scroll the list's middle into view → Redact and Untick all stay visible at the foot; nothing else on the page is sticky → AC-12
- [ ] Same page, Tab from Start over through the plan card, the panel and two windows of rows → no focused control sits under the panel → AC-12
- [ ] `/tool` at 1280 by 500, at 900 wide, and at 1280 with 200% text → the panel scrolls with the page (static), the column order holds → AC-12
- [ ] `/tool`, press Untick all → every row unticks, the count reads "Nothing is ticked, so nothing will be removed.", Redact reads "Make a cleaned copy", focus stays on Untick all, which goes unavailable → AC-12
- [ ] `/tool`, open a file and run a redaction with a screen reader on → the progress card shows "Opening…" then "Redacting…" with a tick on each finished step; the screen reader hears each phase line once and no step state → AC-31 to AC-34
- [ ] Run with nothing ticked → the first run step reads "Stripping document info and attachments" → AC-32
- [ ] Cancel mid run → the card goes at once, the bar never shows full → AC-35
- [ ] Complete a run → the result card shows the tick tile, three counts (removed, left in, stripped), the detail lines, Download and the file name → AC-12
- [ ] Refuse a run (a slanted text fixture) → the refusal callout ends on "Why RedactNest stops" linking `/security#when-it-stops`; a page cap failure shows no such link → AC-12
- [ ] `/` → hero chip, headline, two buttons and caps line; How it works three cards; black box comparison linking `/security#the-check`; Looks for and Strips; the night network band; the two plan cards; the closing band → AC-8 to AC-10
- [ ] `/` with forced colours on → the network band's words show in system colours, axe clean → AC-9, AC-16
- [ ] `/`, Tab into the network band → the focus ring is `night-accent` → AC-9
- [ ] `/redact-pdf`, `/remove-text-from-pdf`, `/black-box-redaction` → centred hero over a soft glow with "Guides / …" text, three joined cards with filled tiles, On this page beside the body from `lg` (sticky), the look over line in a warning callout, More guides cards, the closing band → AC-11
- [ ] `/`, the three guides and `/pricing` at 320 and 305 pixels with 200% text → no sideways scroll → AC-16
- [ ] Sign in page in the sandbox → Clerk's card takes the new tokens, fields keep their `border-strong` edge → AC-13
- [ ] `/tool` at 1280 by 800, open `detect-email.pdf` → three columns: the rail, page 1 with a box on each tickable find and the zoom bar above it, and the Found items column at 26.25rem; "Redact a PDF" visually hidden; scroll the list → the rail and the page stay in view, the action panel stays at the window's foot → AC-37, AC-38, AC-40, AC-42
- [ ] Same page, Tab from Start over → the plan card, the panel and the list come first, then the rail (one stop; Up, Down, Home and End move, Enter shows), Zoom out, Zoom in and the page region → AC-39, AC-41, AC-44
- [ ] Same page, focus a row's checkbox on another page, then tick a row with a click in Safari or Firefox if available → its page shows, its box scrolls into the page area with the focus ring around it, the window and the focused row do not move → AC-43
- [ ] Same page, untick a row → its box turns to a dashed edge with no fill at once → AC-42
- [ ] Zoom in to 200% and out to 50% → the picture stretches at once and sharpens a moment later; the buttons go unavailable at the ends → AC-44
- [ ] Open a file with a scanned page (`read-scans.pdf` or `ocr-bare.pdf`) → that thumbnail carries the amber mark and "{n} · scan", and showing it puts the scan line above the page → AC-40, AC-41
- [ ] Press Redact, then use the rail and zoom while it runs → no new page is drawn until the run ends; Cancel lands at once → AC-45, AC-48
- [ ] Complete a run, then Start over, then open a second document → the preview goes at `complete` and no canvas is left → AC-37, AC-47
- [ ] `/tool` at 900 wide, at 1280 by 500, and at 1280 with 200% text → no preview, today's one column → AC-37
- [ ] DevTools Network with the preview drawn, zooming and moving pages → no request at all → AC-51, AC-52
- [ ] `/security` and `/privacy` → the new preview paragraph, the line about letting go of the pictures, and C3 naming the pictures, each with a change entry → AC-56

## Commands
- [ ] `pnpm typecheck` and `pnpm lint` → clean → all
- [ ] `pnpm exec vitest run tests/unit/tool-layout.test.ts tests/unit/progress.test.ts` → pass → AC-12, AC-34
- [ ] `pnpm exec playwright test tests/e2e/network-list.spec.ts --project=chromium` → pass → AC-9, AC-14
- [ ] `pnpm exec playwright test tests/e2e/design-system.spec.ts --project=chromium` → pass → AC-12, AC-16
- [ ] `pnpm exec vitest run tests/unit/preview-fit.test.ts tests/unit/geometry.test.ts tests/unit/preview-engine.test.ts tests/unit/engine-worker.test.ts` → pass → AC-37, AC-48 to AC-50
- [ ] `pnpm exec playwright test tests/e2e/preview.spec.ts tests/e2e/network-list.spec.ts tests/e2e/privacy.spec.ts --project=chromium` → pass → AC-38, AC-47, AC-51 to AC-53
- [ ] `pnpm exec playwright test --project=speed --no-deps tests/e2e/preview-speed.spec.ts` → pass, run alone → AC-54

## Acceptance-criteria coverage
- AC-8 home steps · AC-9 band, forced colours, ring and network list · AC-10 plan cards · AC-11 guide pages · AC-12 tool column, panel, focus, Untick all, result, refusal · AC-13 Clerk card · AC-14 network list · AC-16 reflow and forced colours · AC-31 to AC-35 progress card
- AC-37 to AC-56 page preview (child 0002, task 17): the steps above once it is built
- Owed later: AC-17 brand rerun (task 15), AC-18 records (task 16), AC-19 to AC-30 signed in header (task 13); the header's narrow shapes (AC-27) keep three `shell.spec.ts` tests red until then.

## Task 17 as built (page preview, child 0002) · added 2026-11-26
_The steps above stand. These add what the build named: the test files as written (the two `preview-fit` and `geometry` commands above were built as `preview-rules.test.ts` and `preview-engine.test.ts`), one step per row of child 0002's Value sourcing table, and the failure line._

### UI / manual
- [ ] `/tool` at 1440 by 960, open `read-mixed.pdf` → rail (1 with badge "1", "2 · scan" with the mark, 3), page 1 with one box on the address, the right column at 26.25rem → AC-38, AC-41, AC-42
- [ ] Same page, resize the window from 1100 to 1023 wide, and from 600 to 575 tall → the preview goes below 64rem by 36rem and comes back above, with no reload → AC-37 (fit: `window.innerWidth`, `innerHeight`, root size)
- [ ] Same page, set the browser's text size to 200% (settings, not zoom) → the preview goes, the one column shows → AC-37 (fit: root size through the 1rem probe)
- [ ] Page bar on page 2 → "Page 2 of 3" from the page on show and `summary.pageCount`, and the warning line is the open card's scan line for page 2 alone → AC-40 (`pageWarningLines`)
- [ ] Thumbnail badges on a page with a blocked row (`detect-blocked.pdf`) → the badge counts blocked rows too; the page has no box for them → AC-41, AC-42 (badge: rows with `page === n`; boxes: target map only)
- [ ] With a term search landing rows on the page on show (Pro, `terms.pdf`, add a term found on page 1) → the page is drawn again and the new row has a box; remove the term → its box goes at once with no draw → AC-50 (rows version, listed ids)
- [ ] DevTools at device emulation 1x, then 2x → the page redraws sharper a moment later; the canvas's picture is within 8,388,608 pixels → AC-44, AC-45 (`width` times `devicePixelRatio`, `config.previewMaxPixels`)
- [ ] Block the worker's answer for one draw (scratch init script answering `picture: null`) → "RedactNest couldn't show this page. Its items are still listed." centred on a page shaped placeholder, the list untouched; showing the page again asks again → AC-46
- [ ] Forced colours on → the boxes lose their fill and keep their edge; axe clean → AC-42

### Commands
- [ ] `pnpm exec vitest run tests/unit/preview-engine.test.ts tests/unit/preview-rules.test.ts tests/unit/engine-worker.test.ts tests/unit/worker-client.test.ts tests/unit/protocol.test.ts tests/unit/loggable.test.ts` → pass → AC-37, AC-44, AC-45, AC-47 to AC-51
- [ ] `pnpm exec vitest run tests/component/page-preview.test.tsx tests/component/tool-preview.test.tsx tests/component/checklist-renders.test.tsx` → pass → AC-37, AC-39 to AC-47, AC-50
- [ ] `pnpm exec vitest run tests/unit/engine-wall.test.ts tests/unit/config.test.ts tests/unit/contrast.test.ts tests/unit/page-findings.test.ts tests/unit/flow-text.test.ts` → pass → AC-45, AC-51, AC-55
- [ ] `pnpm exec vitest run tests/component/app/security-page.test.tsx tests/component/app/legal-pages.test.tsx` → pass → AC-56
- [ ] `pnpm exec playwright test tests/e2e/design-system.spec.ts -g "page preview, drawn" --project=chromium` → axe at 1280 and in forced colours, the keyboard walk into P → AC-39, AC-41, AC-44
- [ ] `pnpm exec playwright test --project=speed --no-deps tests/e2e/preview-speed.spec.ts` → slowest of three within 1,000 / 500 / 750 / 1,000 / 3,000 ms (2026-11-26: 128 / 132 / 259 / 67 / 144) → AC-54

### Acceptance-criteria coverage (task 17)
- AC-37 fit, probe, run origin · AC-38 frame, 26.25rem, panel room 17rem · AC-39 order and no live region · AC-40 bar and warnings · AC-41 rail · AC-42 boxes · AC-43 pick · AC-44 zoom · AC-45 scheduling and caps · AC-46 failure · AC-47 cleanup · AC-48 protocol and client · AC-49 engine draw · AC-50 boxes and rows version · AC-51 lint ban, loggable · AC-52 network walk, export spy, storage · AC-53 memory and frame · AC-54 speed · AC-55 words and contrast · AC-56 security and privacy words

## Task 13 as built (signed in header, child 0001) · added 2026-11-26
_These are the steps the "Owed later" line above names for AC-19 to AC-30; the three `shell.spec.ts` reds it mentions cleared in d7d3fe9. The first group is the AC-29 walk: it needs `pnpm dev` on Clerk's development instance with its real keys (the `email` claim was set there on 2026-11-26) and a sandbox account. The rest run on any build. One step per row of child 0001's Value sourcing table is marked with the value it tests._

### UI / manual (the AC-29 walk, on `pnpm dev`)
- [ ] Signed in, open `/`, run `document.cookie` in the console → it shows `__client_uat` (or `__client_uat_<suffix>`) holding a number above 0, so the cookie is not `HttpOnly` → AC-19, AC-29 (value: signed in time, from the cookie)
- [ ] Same visit, Network filtered to `entitlement` → exactly one `GET /api/entitlement`, same origin, `Cache-Control: private, no-store`, its body holding `email` → AC-19, AC-21, AC-29
- [ ] Same page → the avatar shows the address's first letter, uppercased; open the menu by keyboard → the address, the plan line ("Free · 3 pages a document" or "Pro · 50 pages a document" with this build's caps), then Account, Upgrade to Pro (Free) or Billing (Pro), Redact a PDF, Sign out → AC-22, AC-23 (values: the email claim; tier and account from the same answer; caps from `config` through `countText`; names from `plans.ts`)
- [ ] Change the account's primary address in Clerk's dashboard, reload `/` without opening an account page → the header keeps the old letter; open Account, then `/` → the new one → AC-21 (value: the claim is frozen when Clerk issues the token)
- [ ] Sign out, then visit `/` → no request to `/api/entitlement`, Sign in and Try it free → AC-19, AC-29
- [ ] Signed in with a Pro account on `/tool` → one `GET /api/entitlement`, the same count as signed out; the Pro chip before the avatar; no Open the tool; in the menu, Account and Billing open new tabs and there is no Redact a PDF → AC-19, AC-22, AC-23, AC-29
- [ ] On `/tool`, open a PDF, change a tick, open the menu, Sign out → the leave warning first; leave → `/sign-out` shows the spinner and "Signing you out", then lands on `/` signed out, with Sign in in the header and no request → AC-26, AC-29 (value: the landing is `HOME_PATH`)
- [ ] `/sign-out` while signed in, axe through `.playwright-mcp/axe-run.js` → no violations, at desktop width, at 320 pixels and in forced colours → AC-16, AC-26
- [ ] Block `*.clerk.accounts.dev` in DevTools, visit `/sign-out` signed in → "We couldn't sign you out. Check your connection, then reload this page." in `danger-ink`, and Go to the home page as a plain link → AC-26
- [ ] Production, after the deploy: confirm the claim is on the production instance, then repeat the `/` signed in, `/` signed out and `/tool` steps → AC-29

### UI / manual (any build)
- [ ] `/` at 1280 pixels, signed out, then with a `__client_uat` cookie and a stubbed signed in answer → no layout shift in the header in either, and the slot 196 pixels wide in both → AC-25 (value: `--spacing-account-slot`)
- [ ] `/` with scripts turned off → Sign in and Try it free, from the `noscript` → AC-25
- [ ] `__client_uat=9999999999` set by hand, with no session → one request, then the signed out shape → AC-19, AC-20 (the cookie decides only whether to ask, never what shows)
- [ ] 320 pixels, signed in → the lockup, the avatar and the menu button on one row; the menu holds the nav and Open the tool; at 200% text, no sideways scroll → AC-27
- [ ] `/tool`, open a PDF with a long name → the header holds the file icon, the name cut with an ellipsis (whole in the accessibility tree), "· 2 pages", Choose another PDF and Start over, and no nav; the tab title and the address bar never show the name; Start over brings the nav back → AC-30 (values: the session's `file.name` and `summary.pageCount`)
- [ ] A build with none of the seven billing values → no account slot, no cookie read, no request on `/`; on `/tool` the header's right side is empty with and without a document → AC-19, AC-30

### Commands
- [ ] `pnpm exec vitest run tests/unit/billing-entitlement.test.ts tests/unit/entitlement-route.test.ts tests/unit/entitlement.test.ts` → pass → AC-19, AC-20, AC-21
- [ ] `pnpm exec vitest run tests/component/app/account-slot.test.tsx tests/component/app/site-nav.test.tsx tests/component/app/sign-out.test.tsx tests/component/ui/drop-zone.test.tsx tests/component/tool-client.test.tsx` → pass → AC-19 to AC-26, AC-30
- [ ] `pnpm exec vitest run tests/unit/policy-pages.test.ts tests/unit/engine-wall.test.ts tests/unit/proxy-matcher.test.ts tests/unit/sitemap.test.ts tests/unit/policy-changes.test.ts` → pass → AC-21, AC-25, AC-26, AC-28
- [ ] `pnpm exec playwright test tests/e2e/account-slot.spec.ts --project=chromium` → 16 pass → AC-19, AC-22 to AC-27, AC-30
- [ ] Read `/privacy`, Your documents and Your account, and its 2026-11-26 entry → C5 and C6 as AC-28 lists them, with both limits (up to 7 days old; the token travels with every request) → AC-28

### Acceptance-criteria coverage (task 13)
- AC-19 cookie gate, one ask, none on `/tool` or billing off · AC-20 the three states, fallback never confirmed · AC-21 claim, route, four key snapshot, no report · AC-22 avatar and chip · AC-23 menu, new tabs, lazy load · AC-24 Open the tool · AC-25 held width, `noscript`, no shift, the one island · AC-26 `/sign-out`, matcher, robots, leave warning · AC-27 small screens · AC-28 privacy words and entry · AC-29 the walk above, production after the deploy · AC-30 `/tool`'s file context
