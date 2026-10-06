# Verify: Brand & UI refresh · spec 0013 · updated 2026-10-06 (after slice 6's report: AC-15, AC-32)
_Steps derived from spec 0013 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open any page in a light browser tab, then a dark one → the favicon is the teal bar in a nest, and on a dark tab bar it turns pale (`accent-soft`) → AC-1, AC-3
- [ ] Zoom the browser tab's favicon at 16 px (or `favicon.ico` in an image viewer) → the bar and both bands stay apart → AC-1
- [ ] On every page, read the header left to right → lockup (home), Pricing, Account, Try it free; no Redact item anywhere; on `/tool` nothing is current and there is no Try it free button; on `/pricing` Pricing is current; on `/account` Account is current; on `/sign-in` nothing is current → AC-7, AC-30
- [ ] Narrow the window to 320 px → the lockup sits alone on the first row, the rest wraps below in page order, nothing scrolls sideways, no menu → AC-7, AC-26
- [ ] Build with billing off → the header shows only the lockup and Try it free, with no `nav` element; the footer has no Pricing; `/pricing` is the 404; `/` shows no See pricing and its cap line names no plan → AC-7, AC-8, AC-9, AC-10
- [ ] Footer on every page → brand column (lockup, not a link, and "PDF redaction in your browser."), Product and Legal groups, then the licence notice unchanged and last → AC-8
- [ ] Visit `/no-such-page` → status 404, "This page doesn't exist", Try it free and Go to the home page, title "Page not found · RedactNest", `noindex` → AC-9
- [ ] Share `/` in a link previewer (or read the head) → the 1200 by 630 card with the lockup, eyebrow and headline, absolute `og:image` and `twitter:image`, `summary_large_image`, the alt text → AC-5
- [ ] `/` at 1280 px → eyebrow, headline, lead naming email addresses and phone numbers and ending at "out of the file itself.", Remove text from a PDF and See pricing, "Free up to 3 pages a document. Pro goes up to 50.", the product shot on the right, the trio with "Never uploaded to us or to anyone else, and nothing is stored." first, then "What RedactNest finds and strips" as two white cards on the page background → AC-10, AC-11
- [ ] The two cards on `/` → Finds: an icon circle, "Finds", Email addresses (mail icon) and Phone numbers (phone icon), then "Nothing is removed until you tick it."; Strips: an icon circle, "Strips", "Whenever a file carries them:", seven ticked items in two columns, a divider, then the note on comments and form fields; at 768 px they sit side by side at equal height, below that Finds comes first → AC-11
- [ ] Read `/` top to bottom (footer aside) → "in your browser" only in the eyebrow, "never uploaded" only in the first card; the footer's "PDF redaction in your browser." is the one repeat, by choice → AC-30
- [ ] Change `NEXT_PUBLIC_FREE_PAGE_CAP` and `NEXT_PUBLIC_MAX_PAGES` and rebuild → the cap line, Pricing and the sign in panel all follow → AC-10, AC-22, AC-23 (Value sourcing: caps from `config`)
- [ ] Compare the product shot on `/` with `/tool` opened on `tests/fixtures/sample-agreement.pdf` at 1280 by 800 → they match: seven ticked, the all clear line, the plan card for nobody signed in → AC-12
- [ ] `/tool` at idle, 1280 px → drop zone left; rail right with the plan card, the three steps joined by a grey line between their circles (none after the last), clearly a join and not a tick: about 1rem long, with a small gap at each circle; and the lock line; the line stays in forced colours and stretches at 200% text → AC-14, AC-15
- [ ] Open `sample-agreement.pdf` → file bar across the top, Found items (7) on the left, the rail on the right: Document opened, plan card, action panel with Redact 7 items and the lock line → AC-16, AC-19
- [ ] Open `tests/fixtures/detect-email.pdf` and scroll the list → Redact stays in view at the top of the rail; at 900 px and at 200% text it scrolls away with the page → AC-17
- [ ] Run a redaction to the result → the result card sits in the panel's place, not sticky, the lock line after it → AC-16, AC-17
- [ ] Keyboard walk at idle on `/tool` → skip link, RedactNest, Pricing, Account, Choose a PDF, Terms of service, Privacy policy, then the plan card's links → AC-20
- [ ] Screen reader on `/tool` → choosing a file announces the phase lines and the document card once; the plan card announces its words; nothing is announced twice → AC-20
- [ ] `/pricing` → Free and Pro side by side from 768 px, Pro with a 2 px teal edge, Free's Try it free loads `/tool`, Subscribe goes to `/account/subscribe`, the three lines under it unchanged → AC-22
- [ ] Sandbox: `/sign-in` and `/sign-up` → our panel beside Clerk's card from 768 px, with no lockup in the panel and no logo in Clerk's card, See pricing works; Clerk's card passes a hand check with axe and the keyboard → AC-23, AC-26
- [ ] Sandbox: on every Clerk screen (email step, code step, sign up's code step) → each field and code box has a clear grey edge at rest, the focus ring when focused, and Clerk's red edge after a wrong code → AC-31
- [ ] Sandbox: sign in from `/sign-in` to Account, then sign up from Subscribe → after the last Continue, Clerk's own spinner, then a spinner and "Signing you in" (or "Signing you in, then on to Subscribe") below the card until the next page shows, with no moment between where neither shows (task 35's three timed walks of each flow, each with the line no later than 100 ms after Clerk's spinner ends; showing before it ends also passes), and the sign up from Subscribe ends where Subscribe sends it; a wrong code shows only Clerk's error; a screen reader hears the line once; the Network panel shows no new request → AC-32
- [ ] Sandbox: hover Clerk's Continue, the edit pencil, Resend and the footer link → the hand; Resend while it counts down → not allowed; the email field and code boxes → the text cursor → AC-33
- [ ] Signed in: `/account`, Welcome, Subscribe and Billing's error lines → shared header with Account current, narrow column, words unchanged → AC-24
- [ ] `/privacy` and `/terms` at 1280 px → On this page on the left, text no wider than 44rem; scroll to the end and the list stays in view 1.5rem from the top; each link glides to its heading, which lands just below the top edge; with reduced motion on, it jumps instead; at 768 px and at 200% text the list sits above the text and scrolls away → AC-25
- [ ] Hover every kind of control on `/`, `/tool` (idle and reviewing `detect-blocked.pdf`) and `/pricing` → links, buttons, checklist rows, select all rows and group headings show the hand; a blocked row shows not allowed; nothing shows the arrow where it can be clicked → AC-33
- [ ] Forced colours on every page → the mark still shows in the header and footer → AC-26
- [ ] DevTools Network on `/`, `/pricing` and `/tool` (full run) → every request is our own origin; `/tool` adds only the icon files to today's set → AC-21, AC-29
- [ ] Read every word on every changed page, the social card and the sign in panel → each is true of the product today → AC-13, INV-1

## Commands
- [ ] `node scripts/make-brand.mjs` → writes the five files, prints only their paths, leaves no server running on any port → AC-28
- [ ] `node scripts/make-fixture.mjs` → `git status tests/fixtures` clean → AC-12
- [ ] `pnpm test` → the brand files, home text, contrast, policy pages, Clerk appearance, signing in, engine wall (the `cursor-` pattern) and component suites pass → AC-1, AC-3, AC-5, AC-13, AC-23, AC-27, AC-28, AC-30 to AC-33
- [ ] `pnpm lint` with a `cursor-pointer` class added to any component → fails with the cursor message; remove it → AC-33
- [ ] `pnpm exec playwright test --project=chromium` → shell, design system, legal pages, privacy and review specs pass → AC-4, AC-7 to AC-26, AC-29
- [ ] `pnpm exec vitest run tests/unit/csp.test.ts` → both policies unchanged → AC-4, AC-21

## Acceptance-criteria coverage
- AC-30: header, `/` read and home text test · AC-31, AC-32: sandbox steps, Clerk appearance and signing in tests · AC-33: hover steps, cursor e2e and lint · AC-1 to AC-3: favicon, mark and header steps; brand files test · AC-4: head tags and csp test · AC-5, AC-6: social card step, brand files test, spec 0012 Go live step 9 · AC-7, AC-8: header and footer steps · AC-9: 404 step · AC-10 to AC-13: home page steps and word read · AC-14 to AC-20: tool steps and keyboard walk · AC-21, AC-29: network step · AC-22: Pricing step · AC-23, AC-24: sandbox steps · AC-25: legal pages step · AC-26: 320 px, forced colours and axe steps · AC-27: contrast and brand files tests · AC-28: brand script command
