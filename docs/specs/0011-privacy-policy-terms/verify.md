# Verify: Privacy policy & terms · spec 0011 · updated 2026-10-02
_Steps derived from spec 0011 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run against a production build (`pnpm build && pnpm start` with the Playwright build values from `playwright.config.ts`), never `next dev`, whose policy is looser.

## UI / manual
- [x] Open `/privacy` → the shell (skip link, header with "Redact a PDF", `main#main`, footer), h1 "Privacy policy", "Last updated 2 October 2026" in a `<time dateTime="2026-10-02">`, then the eleven h2s of `PRIVACY_SECTIONS` in order, ending with "Changes" and its dated list → AC-1, AC-2
- [x] Open `/terms` → the same shell, h1 "Terms of use", "Last updated", the eleven h2s of `TERMS_SECTIONS` in order, ending with the dated list → AC-1, AC-2
- [x] Read the tab title on each → "Privacy policy · RedactNest" and "Terms of use · RedactNest"; the page source has a description and no `robots` meta → AC-3
- [x] On `/`, `/tool`, `/privacy` and `/terms`, look at the footer → a "Legal" nav with "Privacy policy" then "Terms of use", before the licence notice, which reads exactly as before → AC-4
- [x] Follow each footer link → it opens its page in the same tab → AC-4
- [x] On `/tool`, open `tests/fixtures/text-page.pdf`, untick the phone number, then click the footer's "Privacy policy" → the browser's leave warning appears; dismiss it and the untick is still there → AC-4
- [x] On `/tool` before choosing a file → under the drop zone, in small muted text: "By choosing a PDF you agree to the Terms of use. The Privacy policy explains what happens to your data.", with both names as links to `/terms` and `/privacy` → AC-5
- [x] Choose a file → the line goes with the drop zone; Start over brings both back; a failed open (a non PDF renamed `.pdf`) shows both under the failure → AC-5
- [x] With a screen reader on `/tool`, choose a file and let it open → the terms line is never announced as news (it sits outside the polite region) → AC-5
- [x] Read "Who we are" → "RedactNest, operated by Heyrbiar Khan, an individual based in Pakistan", what a controller is, and `privacy@redactnest.invalid` as a `mailto:` link; nothing about representatives → AC-6
- [x] Walk the privacy policy against the claims register (C1 to C12) → each claim is stated in plain words, and no other claim about data appears; the comments in `src/app/privacy/page.tsx` name the claim each paragraph makes → AC-7
- [x] Read "Services we use" → one h3 "Vercel" with what it does, what it receives, why, where, the safeguard, "One day", Vercel's own use, and a link to `https://vercel.com/legal/privacy-notice` → AC-8
- [x] Read "What we receive", "Transfers", "Your rights" and "Complaints" → legitimate interests (Article 6(1)(f)), that a page cannot load without the IP address, the transfer safeguards each explained, the six rights, one month, no fee, the ICO and the EDPB list both linked, and no automated decisions or profiling → AC-9
- [x] Read the terms → each outline point in order: checking the result is your job, the licence kept separate, the cap at the greater of 12 months' fees or US$100 with the carve outs, consumer rights kept, Pakistani law and courts with UK and EU consumers keeping their own → AC-10
- [x] Keyboard only on `/privacy` and `/terms` → every link reachable, underlined, with the 2px focus ring; headings run h1, h2, h3 with no level skipped → AC-18
- [x] At 320 CSS pixels wide, and at 200% text on a desktop width, on both pages and on `/tool` → no sideways scrolling, the footer wraps, nothing clipped → AC-4, AC-18
- [x] Read both pages' text → no page or size limit as a number, and no mention of the repository, GitHub or a commit → AC-19

## Commands
- [x] `pnpm exec playwright test tests/e2e/legal-pages.spec.ts --project=chromium` → passes: shell, headings, dates, metadata, footer nav on all four routes, the notice, axe, reflow, 200% text, leave warning → AC-1 to AC-5, AC-18, AC-19
- [x] `pnpm exec playwright test tests/e2e/privacy.spec.ts --project=chromium -g "cookie"` → no `Set-Cookie` on any response after a full run on `/tool` and visits to `/`, `/privacy`, `/terms`, and an empty cookie jar; the control sees a script set cookie → AC-11
- [x] `pnpm exec playwright test tests/e2e/privacy.spec.ts --project=chromium -g "fonts included"` → every request on all four routes, fonts included, stays on our own origin → AC-12
- [x] `pnpm vitest run tests/unit/csp.test.ts` → sample origins land only in the standard policy's `script-src` and `connect-src`, never anywhere in the tool policy, whose `connect-src` stays exactly `'self'` → AC-13, AC-14
- [x] `pnpm exec playwright test tests/e2e/headers.spec.ts --project=chromium` → the built headers still carry spec 0001's exact policies → AC-13, AC-14
- [x] Add `export const x = () => console.log("x");` to any file under `src`, then `pnpm lint` → fails with `no-console`; the same with `process.stdout.write("x")` fails with "writes no log"; remove both → AC-15
- [x] `pnpm vitest run tests/unit/engine-wall.test.ts -t "writing a log"` → the log ban holds in every zone → AC-15
- [x] `VERCEL=1 VERCEL_ENV=production` plus the Vercel Git variables, then `pnpm build` → fails with one `ConfigError` naming `LEGAL.contactEmail` (set the real address) and `LEGAL.representatives` → AC-16, AC-17
- [x] The same with `VERCEL_ENV=preview` → builds and shows the placeholder address; with `VERCEL_ENV` unset or `staging` → fails naming `VERCEL_ENV` → AC-16
- [x] `pnpm build` off Vercel (the Playwright build values, no `VERCEL`) → builds with the placeholder → AC-16
- [x] `pnpm vitest run tests/unit/legal.test.ts tests/unit/config.test.ts` → every gate case: the placeholder in any letter case, any other `.invalid` host, lookalike hosts that pass, pending, malformed address, blank representative field, each environment → AC-16, AC-17
- [x] `pnpm vitest run tests/unit/policy-changes.test.ts` → both lists hold an entry, real dates (`2026-02-30` refused), strictly newest first, British format → AC-2
- [x] `pnpm vitest run tests/unit/policy-pages.test.ts` → no `"use client"` in either page or what they render → AC-19

## Value sourcing
- [x] Change `LEGAL.legalNavLabel`, `privacyLabel` or `termsLabel` in `src/lib/legal.ts` → the footer and the notice change with it, nowhere else needs editing → Footer, Tool notice rows
- [x] Change `PRIVACY_PATH` in `src/lib/routes.ts` (and move the folder to match) → the footer and notice links follow → Footer row
- [x] Set `LEGAL.contactEmail` to a test address → both pages show it as their `mailto:` link → Contact row
- [x] Set `LEGAL.representatives` to `decided` with an EU representative only → "Who we are" names them with postal address and email link, no UK line; back to `pending` → nothing → Representatives row
- [x] Add a newer entry at the top of `PRIVACY_CHANGES` → "Last updated" on `/privacy` moves to it and the list shows it first; `/terms` is unchanged → Last updated, change list rows
- [x] Add an older entry above a newer one, or `2026-02-30` → `pnpm test` fails → change list row
- [x] Rename one heading in `PRIVACY_SECTIONS` → the page and `legal-pages.spec.ts` both follow it → h2 headings row
- [x] Add a sample entry to `OUTSIDE_SERVICES` with a `connectOrigins` origin → it appears as an h3 on `/privacy`, its origin reaches the standard policy's `connect-src` and not `/tool`'s; remove it → Services row, AC-13, AC-14
- [x] Check Vercel's entry reads "One day" and its safeguard text, and both complaint links resolve (ICO make a complaint; EDPB members) → Vercel retention, safeguard, complaint links rows
- [x] Read the terms → the cap reads "US$100", the free tier reads "the limits shown in the tool" with no number, the law reads Pakistan from `LEGAL.country` → Terms rows
- [ ] On a Vercel preview deploy, read `/privacy` → the placeholder address shows; a production deploy refuses to build → Gate row

## Acceptance-criteria coverage
- AC-1 … shell, h1, Last updated, h2s, change list: UI 1, 2; Commands 1
- AC-2 … British dates in `<time>`, list rules: UI 1, 2; Commands 1, 12; Value sourcing 5, 6
- AC-3 … titles, descriptions, indexable: UI 3; Commands 1
- AC-4 … Legal nav everywhere, same tab, targets, 320px, leave warning: UI 4, 5, 6, 16; Commands 1
- AC-5 … the notice under the drop zone: UI 7, 8, 9; Commands 1
- AC-6 … operator, controller, contact, representatives: UI 10; Value sourcing 3, 4
- AC-7 … the claims register, nothing else: UI 11
- AC-8 … services rendered from the list: UI 12; Value sourcing 8
- AC-9 … Article 13 items: UI 13
- AC-10 … the terms' points: UI 14; Value sourcing 10
- AC-11 … no cookie: Commands 2
- AC-12 … same origin requests on both pages: Commands 3
- AC-13 … the list is the only source of outside origins: Commands 4, 5; Value sourcing 8
- AC-14 … the tool policy never takes from the list: Commands 4, 5; Value sourcing 8
- AC-15 … console and streams banned: Commands 6, 7
- AC-16 … `.invalid` contact gate: Commands 8, 9, 10, 11; Value sourcing 11
- AC-17 … Article 27 gate: Commands 8, 11
- AC-18 … WCAG 2.2 AA on both pages: UI 15, 16; Commands 1
- AC-19 … no numbers, no repository, no script: UI 17; Commands 1, 13
