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
