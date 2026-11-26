# Verify: UI redesign · spec 0026 · updated 2026-11-26
_Steps derived from spec 0026's acceptance criteria for tasks 6 to 12 (commits bdcab84 and d5a2248). `/check verify` runs these; `/test` locks the durable ones. Tasks 13 to 16 add their own steps when built._

## UI / manual
- [x] `/tool` at 1280 by 720, open `detect-email.pdf` → file bar, document card, plan card, Found items card stack in one centred column no wider than 44rem; the action panel floats at the window's foot over the list and rests under the last row at the end → AC-12 _(2026-11-26 verify: at 1280 by 720 the preview shows (child 0002 AC-37), so the column is the frame's right column at 26.25rem; the panel sits at the window's foot and, at the list's true end, rests under the last row covering none; the 44rem centred column shows with no document)_
- [x] Same page, scroll the list's middle into view → Redact and Untick all stay visible at the foot; nothing else on the page is sticky → AC-12 _(2026-11-26 verify: the preview's frame is sticky too, as child 0002 AC-38 has it; nothing else is)_
- [x] Same page, Tab from Start over through the plan card, the panel and two windows of rows → no focused control sits under the panel → AC-12
- [x] `/tool` at 1280 by 500, at 900 wide, and at 1280 with 200% text → the panel scrolls with the page (static), the column order holds → AC-12
- [x] `/tool`, press Untick all → every row unticks, the count reads "Nothing is ticked, so nothing will be removed.", Redact reads "Make a cleaned copy", focus stays on Untick all, which goes unavailable → AC-12
- [x] `/tool`, open a file and run a redaction with a screen reader on → the progress card shows "Opening…" then "Redacting…" with a tick on each finished step; the screen reader hears each phase line once and no step state → AC-31 to AC-34 _(2026-11-26 verify: owed to a person with a screen reader. Seen without one: "Opening…" then "Redacting…", a tick on each finished step, and the card inside the polite region marked `aria-live="off"`. Second verify: the owner with Narrator on the build, `detect-email.pdf`: each phase line heard once, opening and run, no step state spoken on its own)_
- [x] Run with nothing ticked → the first run step reads "Stripping document info and attachments" → AC-32
- [x] Cancel mid run → the card goes at once, the bar never shows full → AC-35 _(2026-11-26 verify: `detect-dense.pdf` as Pro: the card went at once, the bar's fill peaked at 75%)_
- [x] Complete a run → the result card shows the tick tile, three counts (removed, left in, stripped), the detail lines, Download and the file name → AC-12
- [x] Refuse a run (a slanted text fixture) → the refusal callout ends on "Why RedactNest stops" linking `/security#when-it-stops`; a page cap failure shows no such link → AC-12 _(2026-11-26 verify: walked with `next-line-0.pdf`, whose every run stops; the page cap failure (`detect-dense.pdf` as Free) links only to `/pricing`)_
- [x] `/` → hero chip, headline, two buttons and caps line; How it works three cards; black box comparison linking `/security#the-check`; Looks for and Strips; the night network band; the two plan cards; the closing band → AC-8 to AC-10 _(2026-11-26 verify: the visual port's trust strip, drawn window, questions and sticky header seen too; axe clean)_
- [x] `/` with forced colours on → the network band's words show in system colours, axe clean → AC-9, AC-16
- [x] `/`, Tab into the network band → the focus ring is `night-accent` → AC-9
- [x] `/redact-pdf`, `/remove-text-from-pdf`, `/black-box-redaction` → centred hero over a soft glow with "Guides / …" text, three joined cards with filled tiles, On this page beside the body from `lg` (sticky), the look over line in a warning callout, More guides cards, the closing band → AC-11
- [x] `/`, the three guides and `/pricing` at 320 and 305 pixels with 200% text → no sideways scroll → AC-16
- [x] Sign in page in the sandbox → Clerk's card takes the new tokens, fields keep their `border-strong` edge → AC-13 _(2026-11-26 verify: on `pnpm dev`, Clerk's development instance, not signed in)_
- [x] `/tool` at 1280 by 800, open `detect-email.pdf` → three columns: the rail, page 1 with a box on each tickable find and the zoom bar above it, and the Found items column at 26.25rem; "Redact a PDF" visually hidden; scroll the list → the rail and the page stay in view, the action panel stays at the window's foot → AC-37, AC-38, AC-40, AC-42
- [x] Same page, Tab from Start over → the plan card, the panel and the list come first, then the rail (one stop; Up, Down, Home and End move, Enter shows), Zoom out, Zoom in and the page region → AC-39, AC-41, AC-44
- [x] Same page, focus a row's checkbox on another page, then tick a row with a click in Safari or Firefox if available → its page shows, its box scrolls into the page area with the focus ring around it, the window and the focused row do not move → AC-43 _(2026-11-26 verify: Chromium only, this Playwright's Firefox and WebKit builds are not installed; by focus and by click, on `terms.pdf` with a term, as Pro)_
- [x] Same page, untick a row → its box turns to a dashed edge with no fill at once → AC-42
- [x] Zoom in to 200% and out to 50% → the picture stretches at once and sharpens a moment later; the buttons go unavailable at the ends → AC-44
- [x] Open a file with a scanned page (`read-scans.pdf` or `ocr-bare.pdf`) → that thumbnail carries the amber mark and "{n} · scan", and showing it puts the scan line above the page → AC-40, AC-41 _(2026-11-26 verify: `read-mixed.pdf`; `read-scans.pdf` is refused at open, every page a scan)_
- [x] Press Redact, then use the rail and zoom while it runs → no new page is drawn until the run ends; Cancel lands at once → AC-45, AC-48
- [x] Complete a run, then Start over, then open a second document → the preview goes at `complete` and no canvas is left → AC-37, AC-47
- [x] `/tool` at 900 wide, at 1280 by 500, and at 1280 with 200% text → no preview, today's one column → AC-37
- [x] DevTools Network with the preview drawn, zooming and moving pages → no request at all → AC-51, AC-52
- [x] `/security` and `/privacy` → the new preview paragraph, the line about letting go of the pictures, and C3 naming the pictures, each with a change entry → AC-56

## Commands
- [x] `pnpm typecheck` and `pnpm lint` → clean → all
- [x] `pnpm exec vitest run tests/unit/tool-layout.test.ts tests/unit/progress.test.ts` → pass → AC-12, AC-34
- [x] `pnpm exec playwright test tests/e2e/network-list.spec.ts --project=chromium` → pass → AC-9, AC-14
- [x] `pnpm exec playwright test tests/e2e/design-system.spec.ts --project=chromium` → pass → AC-12, AC-16
- [x] `pnpm exec vitest run tests/unit/preview-fit.test.ts tests/unit/geometry.test.ts tests/unit/preview-engine.test.ts tests/unit/engine-worker.test.ts` → pass → AC-37, AC-48 to AC-50 _(2026-11-26 verify: as task 17's files below; these two names were never built)_
- [x] `pnpm exec playwright test tests/e2e/preview.spec.ts tests/e2e/network-list.spec.ts tests/e2e/privacy.spec.ts --project=chromium` → pass → AC-38, AC-47, AC-51 to AC-53
- [x] `pnpm exec playwright test --project=speed --no-deps tests/e2e/preview-speed.spec.ts` → pass, run alone → AC-54

## Acceptance-criteria coverage
- AC-8 home steps · AC-9 band, forced colours, ring and network list · AC-10 plan cards · AC-11 guide pages · AC-12 tool column, panel, focus, Untick all, result, refusal · AC-13 Clerk card · AC-14 network list · AC-16 reflow and forced colours · AC-31 to AC-35 progress card
- AC-37 to AC-56 page preview (child 0002, task 17): the steps above once it is built
- Owed later: AC-17 brand rerun (task 15), AC-18 records (task 16), AC-19 to AC-30 signed in header (task 13); the header's narrow shapes (AC-27) keep three `shell.spec.ts` tests red until then.

## Task 17 as built (page preview, child 0002) · added 2026-11-26
_The steps above stand. These add what the build named: the test files as written (the two `preview-fit` and `geometry` commands above were built as `preview-rules.test.ts` and `preview-engine.test.ts`), one step per row of child 0002's Value sourcing table, and the failure line._

### UI / manual
- [x] `/tool` at 1440 by 960, open `read-mixed.pdf` → rail (1 with badge "1", "2 · scan" with the mark, 3), page 1 with one box on the address, the right column at 26.25rem → AC-38, AC-41, AC-42
- [x] Same page, resize the window from 1100 to 1023 wide, and from 600 to 575 tall → the preview goes below 64rem by 36rem and comes back above, with no reload → AC-37 (fit: `window.innerWidth`, `innerHeight`, root size)
- [x] Same page, set the browser's text size to 200% (settings, not zoom) → the preview goes, the one column shows → AC-37 (fit: root size through the 1rem probe) _(2026-11-26 verify: the root size set to 200%, as the browser tests set it)_
- [x] Page bar on page 2 → "Page 2 of 3" from the page on show and `summary.pageCount`, and the warning line is the open card's scan line for page 2 alone → AC-40 (`pageWarningLines`)
- [x] Thumbnail badges on a page with a blocked row (`detect-blocked.pdf`) → the badge counts blocked rows too; the page has no box for them → AC-41, AC-42 (badge: rows with `page === n`; boxes: target map only)
- [x] With a term search landing rows on the page on show (Pro, `terms.pdf`, add a term found on page 1) → the page is drawn again and the new row has a box; remove the term → its box goes at once with no draw → AC-50 (rows version, listed ids)
- [ ] DevTools at device emulation 1x, then 2x → the page redraws sharper a moment later; the canvas's picture is within 8,388,608 pixels → AC-44, AC-45 (`width` times `devicePixelRatio`, `config.previewMaxPixels`) _(2026-11-26 verify: half walked. Opened at scale 1 the page draws 657 by 851, at scale 2 1314 by 1701, and at 200% zoom on scale 2 the largest picture is 8,380,685 pixels. A live switch could not be seen: Chromium's device emulation fires no `resolution` media query change, not even to a control listener, headless or headed, so it needs a person moving the window to a screen with another scale. No test covers the live change)_
- [x] Block the worker's answer for one draw (scratch init script answering `picture: null`) → "RedactNest couldn't show this page. Its items are still listed." centred on a page shaped placeholder, the list untouched; showing the page again asks again → AC-46
- [x] Forced colours on → the boxes lose their fill and keep their edge; axe clean → AC-42

### Commands
- [x] `pnpm exec vitest run tests/unit/preview-engine.test.ts tests/unit/preview-rules.test.ts tests/unit/engine-worker.test.ts tests/unit/worker-client.test.ts tests/unit/protocol.test.ts tests/unit/loggable.test.ts` → pass → AC-37, AC-44, AC-45, AC-47 to AC-51
- [x] `pnpm exec vitest run tests/component/page-preview.test.tsx tests/component/tool-preview.test.tsx tests/component/checklist-renders.test.tsx` → pass → AC-37, AC-39 to AC-47, AC-50
- [x] `pnpm exec vitest run tests/unit/engine-wall.test.ts tests/unit/config.test.ts tests/unit/contrast.test.ts tests/unit/page-findings.test.ts tests/unit/flow-text.test.ts` → pass → AC-45, AC-51, AC-55
- [x] `pnpm exec vitest run tests/component/app/security-page.test.tsx tests/component/app/legal-pages.test.tsx` → pass → AC-56
- [x] `pnpm exec playwright test tests/e2e/design-system.spec.ts -g "page preview, drawn" --project=chromium` → axe at 1280 and in forced colours, the keyboard walk into P → AC-39, AC-41, AC-44
- [x] `pnpm exec playwright test --project=speed --no-deps tests/e2e/preview-speed.spec.ts` → slowest of three within 1,000 / 500 / 750 / 1,000 / 3,000 ms (2026-11-26: 128 / 132 / 259 / 67 / 144) → AC-54 _(2026-11-26 verify: alone: 171 / 114 / 241 / 69 / 151)_

### Acceptance-criteria coverage (task 17)
- AC-37 fit, probe, run origin · AC-38 frame, 26.25rem, panel room 17rem · AC-39 order and no live region · AC-40 bar and warnings · AC-41 rail · AC-42 boxes · AC-43 pick · AC-44 zoom · AC-45 scheduling and caps · AC-46 failure · AC-47 cleanup · AC-48 protocol and client · AC-49 engine draw · AC-50 boxes and rows version · AC-51 lint ban, loggable · AC-52 network walk, export spy, storage · AC-53 memory and frame · AC-54 speed · AC-55 words and contrast · AC-56 security and privacy words

## Task 13 as built (signed in header, child 0001) · added 2026-11-26
_These are the steps the "Owed later" line above names for AC-19 to AC-30; the three `shell.spec.ts` reds it mentions cleared in d7d3fe9. The first group is the AC-29 walk: it needs `pnpm dev` on Clerk's development instance with its real keys (the `email` claim was set there on 2026-11-26) and a sandbox account. The rest run on any build. One step per row of child 0001's Value sourcing table is marked with the value it tests._

### UI / manual (the AC-29 walk, on `pnpm dev`)
- [x] Signed in, open `/`, run `document.cookie` in the console → it shows `__client_uat` (or `__client_uat_<suffix>`) holding a number above 0, so the cookie is not `HttpOnly` → AC-19, AC-29 (value: signed in time, from the cookie)
- [x] Same visit, Network filtered to `entitlement` → exactly one `GET /api/entitlement`, same origin, `Cache-Control: private, no-store`, its body holding `email` → AC-19, AC-21, AC-29
- [x] Same page → the avatar shows the address's first letter, uppercased; open the menu by keyboard → the address, the plan line ("Free · 3 pages a document" or "Pro · 50 pages a document" with this build's caps), then Account, Upgrade to Pro (Free) or Billing (Pro), Redact a PDF, Sign out → AC-22, AC-23 (values: the email claim; tier and account from the same answer; caps from `config` through `countText`; names from `plans.ts`)
- [x] Change the account's primary address in Clerk's dashboard, reload `/` without opening an account page → the header keeps the old letter; open Account, then `/` → the new one → AC-21 (value: the claim is frozen when Clerk issues the token) _(2026-11-26 second verify: the primary swapped through Clerk's Backend API, not the dashboard; "W" on reload and again 65 s later, past the token's 60 s life, each answer still the old address; "M" after `/account`; the primary swapped back after)_
- [x] Sign out, then visit `/` → no request to `/api/entitlement`, Sign in and Try it free → AC-19, AC-29
- [ ] Signed in with a Pro account on `/tool` → one `GET /api/entitlement`, the same count as signed out; the Pro chip before the avatar; no Open the tool; in the menu, Account and Billing open new tabs and there is no Redact a PDF → AC-19, AC-22, AC-23, AC-29 _(2026-11-26 verify: owed, walked on production after the deploy; the sandbox account is Free (the owner's call))_
- [x] On `/tool`, open a PDF, change a tick, open the menu, Sign out → the leave warning first; leave → `/sign-out` shows the spinner and "Signing you out", then lands on `/` signed out, with Sign in in the header and no request → AC-26, AC-29 (value: the landing is `HOME_PATH`)
- [x] `/sign-out` while signed in, axe through `.playwright-mcp/axe-run.js` → no violations, at desktop width, at 320 pixels and in forced colours → AC-16, AC-26 _(desktop and 320 on 2026-11-26's AC-29 walk; forced colours in task 14's walk below)_
- [x] Block `*.clerk.accounts.dev` in DevTools, visit `/sign-out` signed in → "We couldn't sign you out. Check your connection, then reload this page." in `danger-ink`, and Go to the home page as a plain link → AC-26
- [ ] Production, after the deploy: confirm the claim is on the production instance, then repeat the `/` signed in, `/` signed out and `/tool` steps → AC-29

**Walk results, 2026-11-26** (`pnpm dev` on d69903a, Clerk's development instance, new account `walk-2611+clerk_test@redactnest.com`, Free, signed up with code 424242; the only PDF opened was `tests/fixtures/sample-agreement.pdf`):
- Passed: `__client_uat` and `__client_uat_<suffix>` readable, both 1795693677, and the session token carries `email`.
- Passed: signed in on `/`, one `GET /api/entitlement` (200, `private, no-store`, body `free`, `signed-in`, the address); the avatar reads "W"; Open the tool to `/tool`; no Sign in or Try it free; the slot 196 pixels wide. The menu, opened with Enter, reads the address and "Free · 3 pages a document", then Account, Upgrade to Pro, Redact a PDF, Sign out; Escape returns focus to the avatar.
- Passed: signed out on `/`, no request, before signing up and again after signing out.
- Passed, all but the chip: `/tool` asked once signed in and once signed out, as it always has; avatar, no Open the tool, Account and Upgrade to Pro open new tabs, no Redact a PDF, both polite regions outside any `aria-hidden` with the menu open, and opening the PDF asked nothing more. The Pro chip is not checked: the walk account is Free.
- Passed: on `/tool` with one row unticked from the seeded ticks, Sign out brought the leave warning; dismissed, the page and every tick stayed; accepted, the page went through `/sign-out` to `/`, with `__client_uat` 0, no `__session`, and Sign in and Try it free.
- Passed: `/sign-out` with Clerk's script held (only its script requests): title "Sign out · RedactNest", `noindex`, a visually hidden `h1`, the spinner and "Signing you out" in the status region; axe clean (24 passes, no violations). At its 10 second limit the line became "We couldn't sign you out. Check your connection, then reload this page." in `danger-ink` with Go to the home page as a plain `a`, axe clean at 1280 and 320 pixels with no sideways scroll. Clerk's script, released after the failure, loaded and left the session alone, as `leaveAccount` intends. Forced colours not run (axe misreads it there).
- Not walked: changing the address in Clerk's dashboard (the 7 day limit), and the production steps, which wait for the deploy.
- Console: no hydration warning and nothing from our code. Clerk's own `blob:` worker is refused by the account pages' `worker-src 'self'`, as before this change.

### UI / manual (any build)
- [x] `/` at 1280 pixels, signed out, then with a `__client_uat` cookie and a stubbed signed in answer → no layout shift in the header in either, and the slot 196 pixels wide in both → AC-25 (value: `--spacing-account-slot`)
- [x] `/` with scripts turned off → Sign in and Try it free, from the `noscript` → AC-25
- [x] `__client_uat=9999999999` set by hand, with no session → one request, then the signed out shape → AC-19, AC-20 (the cookie decides only whether to ask, never what shows)
- [x] 320 pixels, signed in → the lockup, the avatar and the menu button on one row; the menu holds the nav and Open the tool; at 200% text, no sideways scroll → AC-27
- [x] `/tool`, open a PDF with a long name → the header holds the file icon, the name cut with an ellipsis (whole in the accessibility tree), "· 2 pages", Choose another PDF and Start over, and no nav; the tab title and the address bar never show the name; Start over brings the nav back → AC-30 (values: the session's `file.name` and `summary.pageCount`) _(2026-11-26 verify: `two-pages.pdf`'s bytes under a long name)_
- [x] A build with none of the seven billing values → no account slot, no cookie read, no request on `/`; on `/tool` the header's right side is empty with and without a document → AC-19, AC-30

### Commands
- [x] `pnpm exec vitest run tests/unit/billing-entitlement.test.ts tests/unit/entitlement-route.test.ts tests/unit/entitlement.test.ts` → pass → AC-19, AC-20, AC-21
- [x] `pnpm exec vitest run tests/component/app/account-slot.test.tsx tests/component/app/site-nav.test.tsx tests/component/app/sign-out.test.tsx tests/component/ui/drop-zone.test.tsx tests/component/tool-client.test.tsx` → pass → AC-19 to AC-26, AC-30
- [x] `pnpm exec vitest run tests/unit/policy-pages.test.ts tests/unit/engine-wall.test.ts tests/unit/proxy-matcher.test.ts tests/unit/sitemap.test.ts tests/unit/policy-changes.test.ts` → pass → AC-21, AC-25, AC-26, AC-28
- [x] `pnpm exec playwright test tests/e2e/account-slot.spec.ts --project=chromium` → 16 pass → AC-19, AC-22 to AC-27, AC-30 _(2026-11-26 verify: 20 pass alone; the signed out shift test flakes in the full parallel run)_
- [x] Read `/privacy`, Your documents and Your account, and its 2026-11-26 entry → C5 and C6 as AC-28 lists them, with both limits (up to 7 days old; the token travels with every request) → AC-28

### Acceptance-criteria coverage (task 13)
- AC-19 cookie gate, one ask, none on `/tool` or billing off · AC-20 the three states, fallback never confirmed · AC-21 claim, route, four key snapshot, no report · AC-22 avatar and chip · AC-23 menu, new tabs, lazy load · AC-24 Open the tool · AC-25 held width, `noscript`, no shift, the one island · AC-26 `/sign-out`, matcher, robots, leave warning · AC-27 small screens · AC-28 privacy words and entry · AC-29 the walk above, production after the deploy · AC-30 `/tool`'s file context

## Tasks 14 to 16 as built (the sweep, the brand rerun, the records) · added 2026-11-26
_The accessibility sweep (AC-16), the brand rerun (AC-17) and the records (AC-18). The sweep's checks are browser tests, so most steps below are commands; the `/sign-out` walk needs `pnpm dev` with the development keys and a signed in session, which the test build cannot give._

### UI / manual
- [x] `/sign-out` signed in on `pnpm dev`, Clerk's script requests held (`.playwright-mcp/a11y-sweep/sign-out-walk.mjs`) → while "Signing you out" shows: axe clean in forced colours at 1280, no sideways scroll and nothing clipped at 200% text; at the 10 second failure line: axe clean at 1280, at 320 and in forced colours, every target at least 24 by 24, the Tab walk reaching every control in page order with its ring, Go to the home page ringed in forced colours, and no sideways scroll at 320, at 320 with 200% text and at 1280 with 200% text → AC-16, child 0001 AC-26
- [x] `/privacy` at 320 pixels with 200% text → `clerk.redactnest.com` breaks inside its line, nothing scrolls sideways; each outside service's "privacy policy" link is at least 24 pixels tall → AC-16
- [x] `/security` at 305 pixels (a 320 window less a classic scrollbar) with 200% text → the title "Security" breaks inside the column, nothing scrolls sideways → AC-16
- [x] Signed in on `/`, Tab to the avatar, open the menu with Enter, walk it with the arrow keys, Home, End and a letter, with a screen reader on → it reads "Your account", the address, the plan line, then Account, Upgrade to Pro, Redact a PDF and Sign out; Escape returns to the avatar → AC-16, child 0001 AC-23 _(2026-11-26 verify: owed, a screen reader on `pnpm dev`; the keyboard walk passes in `account-slot.spec.ts`. Second verify: the owner with Narrator on `pnpm dev`, the walk account: "Your account" with the address and the plan line, the four items in order, arrows, Home, End and S worked, Escape back to the avatar)_
- [x] `/tool`, open a PDF and run a redaction with a screen reader on → each step reads its words and its state ("in progress", "not started", "done"); Tab never stops in the progress card → AC-16, child 0003 AC-31 _(2026-11-26 verify: owed, a screen reader; read in Chromium's accessibility tree: each step's state in words, and no Tab stop in the card. Second verify: the owner with Narrator, network and CPU throttled to hold each card: every step read its words and its state, no Tab stop, on the opening and the redacting card)_
- [x] Look at `src/app/opengraph-image.png`, the three guides' cards, `apple-icon.png` and `polar-product.png` → the white ground, the `#0f766e` tile and the home card's new eyebrow; no `product-review.png` anywhere → AC-17
- [x] Read `docs/design/design.md` and the new lines in specs 0003, 0007, 0011, 0012, 0013 and 0024 → each says what spec 0026 changed and points here, and none claims more than the code → AC-18 _(2026-11-26 verify: failed, see the results at the end. Second verify, at f4eaa34: 098af0d's lines hold. Five larger shadows, three type sizes stepping down, strokes 1.75 or heavier and most icons at `size-5`, and the four sticky things (container `61rem` as the tool's and the guides' `lg`) all match the code; spec 0013's AC-17 and INV-6 lines match `action-panel.tsx` and the scroll margin rule in `globals.css`)_

**Walk results, 2026-11-26** (`pnpm dev` on bb3e7cd plus this change, Clerk's development instance, the walk account `walk-2611+clerk_test@redactnest.com`, signed in with code 424242; no PDF opened): every check above passed. At 1280 the controls hidden on purpose were the skip link (until it takes focus), the menu's own Open the tool and the Menu button, as on every other page. The page stayed on "Signing you out" through its checks (about half a second) and showed the failure line at its limit, since only Clerk's script was held; the session stayed signed in.

### Commands
- [x] `pnpm exec playwright test tests/e2e/design-system.spec.ts -g "every control on every page|the progress steps|every page \(spec 0013|320 pixels with 200% text" --project=chromium` → pass → AC-16
- [x] `pnpm exec playwright test tests/e2e/design-system.spec.ts -g "320 CSS pixels in the" --project=chromium` → every tool state passes axe at 320 → AC-16
- [x] `pnpm exec playwright test tests/e2e/account-slot.spec.ts -g "the account menu by keyboard" --project=chromium` → pass → AC-16, child 0001 AC-23
- [x] `pnpm exec playwright test tests/e2e/legal-pages.spec.ts --project=chromium` → pass, with the prose and title changes → AC-16
- [x] `pnpm exec vitest run tests/unit/brand-files.test.ts tests/unit/brand-source.test.ts` → pass, the social alt text included → AC-17

### Acceptance-criteria coverage (tasks 14 to 16)
- AC-16 every page's axe, reflow, 200% text, Tab walk and targets; the tool's states at 320; the menu and steps walks; `/sign-out` on `pnpm dev` · AC-17 the rerun and the dropped shot · AC-18 `design.md` and the amendment lines

## The review and states port (d67ff4d) and task 18 · added 2026-11-26
_The `/tool` steps above predate d67ff4d (spec 0026 Follow-up). These walk what AC-12's "The look, as built in d67ff4d" bullet and task 18 changed: the empty state's one column with no steps, "What to do" opening the advice, the flat foot beside P, and the coverage note on open. The steps above that name the old look (the plan card, the coverage note) are read through these._

### UI / manual
- [x] `/tool` with no document, at 1280 by 800, at 900 wide and at 320 → one centred column: the drop zone card alone ("Drop a PDF to start", "or", the primary "Choose a PDF", the caps and device line) with the terms line under it, then the plan strip (billing on) and the lock line centred under the column; no idle steps anywhere (no `StepList`, no numbered list) → AC-12 (spec 0013 AC-15 amended)
- [x] `/tool`, open a warned file (`read-mixed.pdf`, page 2 a scan) → the warning box reads each finding as one line, its title "Some pages can't be fully checked" an `h3` that is visually hidden; "What to do" closes the last line, a button with `aria-expanded="false"` and `aria-controls` naming the advice; the advice (`page-advice`) is in the page but hidden, so the open's polite region does not read it. Press "What to do" → the advice shows, `aria-expanded="true"`, focus stays on the button with its ring on `warning-bg`; press it again → hidden again. A file with no advised finding (`detect-email.pdf`) shows the all clear line and no "What to do" → AC-12 (spec 0006 AC-20 amended)
- [x] `/tool` at 1280 by 800, open `detect-email.pdf` (P shows) → the action panel is the right column's flat foot: a `border` edge on its top and left only, no corner, flush to the column's sides and foot, the Found items card `flat` (no edge, fill or shadow); at 900 wide (no P) the panel keeps its full `border` edge and card radius → AC-12, child 0002 AC-38
- [x] `/tool`, open `detect-email.pdf` → on the first render the coverage note (`coverage`) is visible, first inside the Found items card, before the custom terms panel and the groups, reading `COVERAGE_NOTE`; no "What it looks for" control and no `coverage-toggle` anywhere. A partly read file with rows (`read-mixed.pdf`) reads `COVERAGE_NOTE_PARTLY`; a file that lists no rows (`angled-text.pdf`) shows the note above the empty state; with Pro, a term searched on `terms.pdf` turns it into `coverageNoteWithTerms` → AC-12, spec 0005 AC-14, spec 0013 AC-19

### Acceptance-criteria coverage (the port and task 18)
- AC-12 the empty state's column, the advice disclosure, the flat foot, the coverage note on open

## Verify results · 2026-11-26
_`/check verify` on feat/ui-redesign at de8a9c8: FAIL. Builds: Playwright's env (billing on, fake keys) on 3000; a billing off build for that one step; `pnpm dev` with Clerk's development keys on 3100 for the sign in card only, never signed in. Only PDFs from `tests/fixtures` were opened, some as Pro through a routed plan answer, one under a long name._
- Failed: `pnpm test:e2e` has four reds, all `shell.spec.ts:717` ("the head tags … link the icons and the social card" on `/`, `/tool`, `/pricing` and `/privacy`). The test still pins the old social alt, "RedactNest. PDF redaction in your browser. …", while task 15 (1c83de2) made `src/app/opengraph-image.alt.txt` equal `HOME_TEXT.socialAlt`, "RedactNest. Runs in your browser. Never uploaded. …", as AC-17 says. The page is right; the test is stale. The speed project, which waits on chromium, passed alone.
- Failed, AC-18: spec 0013's AC-16, AC-17 and INV-6 carry no line of their own (only the spec's top line points here), and AC-17 ("sticky 1.5rem from the top") and INV-6 ("only the action panel sticks") now read wrong. `design.md` claims more than the code in four lines: only `/`'s header and the action panel stick (the preview's frame is sticky too, `page-preview.tsx:537`); the larger shadows appear in four places only (the preview's page has `shadow-sheet`, `page-preview.tsx:630`); each larger type size steps down below `sm` (only `hero`, `display` and `headline` do); icons are 20px with a 1.75 stroke (nine places use 2, some at 16px).
- Flaky, passing alone: `account-slot.spec.ts:114` (a 0.00007 shift) in the full parallel run, 6 of 6 alone; `cost.test.ts` and `detect-adversarial.test.ts` in the full Vitest run, 11 of 11 and 1,570 of 1,570 alone.
- Blocked: the live device scale switch (task 17's 1x then 2x step).
- Owed: three screen reader steps, the address change in Clerk's dashboard, the Pro chip on `/tool` and the production steps, after the deploy.
- Notes for `/check review`: the "What to do" ring, a 40 pixel box, crosses the warning line above it and the advice's first line below (on purpose, `notice-box.tsx`); `tool-client.tsx`'s grid comment still says "A beside B while nothing is open", which d67ff4d replaced with one column.

## Second verify · 2026-11-26
_`/check verify` on feat/ui-redesign at f4eaa34, only the open steps and what changed since de8a9c8. Builds: Playwright's env on 3000, then on 3200; `pnpm dev` with Clerk's development keys on 3000 for the address step. No PDF was opened by the checks; the Narrator steps open only `tests/fixtures`._
- Fixed: `shell.spec.ts` 59 of 59 pass, the four head tag tests included (41e5bdd). The full chromium project: 578 of 579, the one red the known `account-slot.spec.ts:114` shift (0.00007), 10 of 10 alone with one worker, 2 of 10 red with workers side by side.
- Fixed, AC-18: 098af0d's records match the code (the step above).
- Passed: the address change step (child 0001 AC-21), above. The walk account keeps a second address, `mwalk-2611+clerk_test`, no longer primary.
- Passed: the three Narrator steps, walked by the owner (steps above).
- Verdict: PASS for every step that can run before the deploy. Owed: the live device scale switch (the owner's call, still blocked in Chromium's emulation), the Pro chip on `/tool` and the production steps, after the deploy.
