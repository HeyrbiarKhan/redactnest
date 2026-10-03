# Verify: Billing and the paid plan · spec 0012 · updated 2026-10-03
_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

_Slice 1 (the money path) as built. Locally, billing needs `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, because the plan check accepts a token only from the site's own origin. Sign in on the Clerk development instance with an address containing `+clerk_test` (for example `walk-one+clerk_test@redactnest.com`) and the code `424242`; no email is sent. Pay in the Polar sandbox by hand with the card `4242 4242 4242 4242`, any future date and any CVC, because Stripe's card form runs a bot check that holds an automated browser._

## UI / manual
- [ ] Open `/tool` anonymously and watch the network → exactly one request beyond the page's own files, `GET /api/entitlement`, made as the page loads (not on hover), answering `free`, `none` → AC-1, AC-4, AC-20
- [ ] Open `/`, `/pricing`, `/privacy`, `/terms` and `/tool` in a fresh browser → no request to any Clerk or Polar origin, no cookie set → AC-9, AC-19
- [ ] Header on `/`, `/pricing`, `/privacy`, `/terms`, `/tool` and the account pages → Pricing and Account links, plain `a` elements to `/pricing` and `/account` (no prefetch) → AC-9, INV-10
- [ ] Open `/pricing` → h1, Free "Up to 3 pages a document", Pro "$19 a month", "Up to 50 pages a document", "Everything in Free", a Subscribe link to `/account/subscribe`, the EdiventStudio merchant line, "Tax may be added at checkout, depending on where you live.", and the terms line with its link; axe clean at 320 pixels and 200% text → AC-13
- [ ] Open `/sign-up?redirect_url=/account/subscribe`, sign up with a `+clerk_test` address and code 424242 → Clerk asks for the email alone, then lands on Polar's sandbox checkout for "RedactNest Pro", $19 monthly, under EdiventStudio, with the email filled in and a required "I agree to RedactNest's Terms of service" tick box → AC-8, AC-14, AC-15
- [ ] Open `/sign-in?redirect_url=/tool` and sign in → lands on `/account`, never `/tool` → AC-8
- [ ] While signed in, open `/sign-in` or `/sign-up` → sent to `/account` → AC-8
- [ ] Sign in and inspect Clerk's card → the button is the accent colour, text is Inter in `ink`, the footer "Sign up" or "Sign in" link is underlined; axe clean; usable by keyboard alone → AC-8
- [ ] Open `/account` signed out → sent to `/sign-in` → AC-10
- [ ] Open `/account` signed in with no Polar customer → the email, Plan "Free", Get Pro (to `/pricing`) and Sign out → AC-10
- [ ] Pay the sandbox checkout → Polar returns to `/account/welcome`, which shows "Confirming your payment", then "You're on Pro. Go back to the tab with your document, or open the tool."; the tool link is a real page load → AC-16
- [ ] On `/account/welcome` with no Pro arriving, wait out 15 asks (30 s) → "Your payment is still being confirmed. This can take a few minutes." and "Check again", which starts another round; hiding the tab pauses the asking → AC-16
- [ ] Signed in with Pro, open `/account/subscribe` → back to `/account` with "You're already on Pro." and no second checkout → AC-14
- [ ] Signed in with Pro, sit on `/tool` for over a minute (Clerk's token expires after 60 s) and ask again → still `paid`, `signed-in`, `pageCap` 50, with no `Set-Cookie` → AC-1, AC-2 rule 5
- [ ] Choose a 4 to 50 page PDF on `/tool` as Pro → it opens past the free cap → AC-4
- [ ] Sign out from `/account` → lands on `/`, and the next `/api/entitlement` answer is `free`, `none` → AC-12
- [ ] Inspect the sign in page's console → the only policy report is Clerk's blocked `blob:` worker, and the session token still refreshes after 60 s → AC-21

## Commands
- [ ] `pnpm exec vitest run tests/unit/billing-config.test.ts` → every config gate case passes: off with none, a partial set naming each missing value, mixed keys, live with sandbox, a host no Clerk origin covers, Vercel production on test keys or another host, live keys on a preview, a `\n` escaped JWT key → AC-23
- [ ] `pnpm exec vitest run tests/unit/billing-entitlement.test.ts` → the decision table, INV-11's refusals with no outbound call, and the pinned check order pass → AC-1, AC-2, INV-4, INV-6, INV-11
- [ ] `pnpm exec vitest run tests/unit/entitlement-route.test.ts tests/unit/entitlement.test.ts` → every account kind passes through whole, never a `Set-Cookie`; a drifted answer reads as free `unknown` → AC-1, AC-3
- [ ] `pnpm exec vitest run tests/unit/billing-subscribe.test.ts` → INV-3: Polar receives the session's user and email, never the query's; no session means no Polar call → AC-14, INV-3
- [ ] `pnpm exec vitest run tests/unit/proxy-matcher.test.ts` → the proxy covers the account group only, never `/tool` or `/api/entitlement` → AC-9, INV-1
- [ ] `pnpm exec vitest run tests/unit/csp.test.ts tests/unit/privacy-config.test.ts` → the tool policy unchanged; the standard policy gains Clerk's script, connect and image origins and nothing else → AC-20, AC-21
- [ ] `pnpm exec vitest run tests/unit/engine-wall.test.ts` → Clerk, Polar and the billing modules rejected in every fenced zone, allowed only in their homes → AC-9, AC-20
- [ ] `pnpm build` with a valid `NEXT_PUBLIC_SOURCE_URL` → `/pricing` and `/tool` listed as static (○), the account pages and `/api/entitlement` as dynamic (ƒ) → AC-13
- [ ] Unset all seven billing values and build → `/pricing` is a 404, the header shows no Pricing or Account link, the account pages say accounts are not set up, `/api/entitlement` answers `none` → AC-23

## Value sourcing
- [ ] Session token and `__client_uat`: set only the suffixed cookie, then only the plain one, then both with different users → the suffixed one wins, the plain one is read when alone → AC-2 rule 2
- [ ] The expected issuer: a token from another Clerk instance (wrong `iss`) → `sign-in-needed`, no Polar call → INV-11
- [ ] The authorized party: browse at an address other than `NEXT_PUBLIC_SITE_URL` → every token answers `sign-in-needed` → INV-11
- [ ] An expired token's user: a token issued 6 days ago reaches Polar; 8 days ago answers `sign-in-needed` → AC-2 rule 5
- [ ] Pro or not: a customer holding another product's benefit, or a Pro subscription whose benefit is not granted yet → `free`, `signed-in` → INV-6
- [ ] The call's timeout: Polar slower than 1.5 s → `free`, `unknown` well inside the tool's 4 s budget → AC-2 rule 7
- [ ] Caps: change `NEXT_PUBLIC_FREE_PAGE_CAP` and `NEXT_PUBLIC_MAX_PAGES` → Pricing, the plan check's `pageCap` and the metadata all follow → AC-1, AC-13, INV-8
- [ ] "Pro", "Free", "$19 a month": change `PRO_PLAN` in `src/lib/plans.ts` → Pricing and Account follow → AC-13
- [ ] The tax line: compare with a sandbox checkout's tax for a UK and a US address → included in one, added in the other, as the line says → AC-13
- [ ] Subscribe's identity: request `/account/subscribe?external_customer_id=user_x&customer_email=x@y.z` signed in → the checkout carries your own id and email → INV-3
- [ ] Success and return addresses: the checkout's back link returns to `/pricing` and paying returns to `/account/welcome` on `NEXT_PUBLIC_SITE_URL` → AC-14
- [ ] The contact in the error line: make checkout creation fail → "We couldn't start the checkout. Try again, or write to privacy@redactnest.com." → AC-14
- [ ] Billing on or off: `config.billingEnabled` follows `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` alone, in the browser and on the server → AC-23

## Acceptance-criteria coverage
- AC-1 … the first `/tool` step, the expired token step, the route tests · AC-2 … the decision table, value sourcing rows 1 to 6 · AC-3 … the client test · AC-4 … the load time ask and the Pro open (refresh rules follow in slice 2) · AC-8 … the sign up, sign in, theme and signed in redirect steps · AC-9 … the request and header steps, the matcher and wall tests · AC-10 … the two `/account` steps (renewal, Manage billing and the unknown state follow in slice 3) · AC-12 … the sign out step · AC-13 … the Pricing step and build · AC-14 … the checkout, already Pro and identity steps, INV-3 test · AC-15 … the checkout step · AC-16 … the two welcome steps · AC-19 … the public pages step · AC-20 … the request step, the policy and wall tests · AC-21 … the policy test and the console step · AC-23 … the gate test and the billing off build
- Not in slice 1: AC-5, AC-6, AC-7, AC-11, AC-17, AC-18, AC-22, AC-24

# Slice 1b (the walk's fixes) · updated 2026-10-03
_Steps for tasks 7a to 7d. The same local setup as slice 1. Slice 1's command step "live keys on a preview" is replaced by the stricter rule below: every Vercel build but production now refuses any billing value._

## UI / manual
- [ ] Your stuck `walk-one+clerk_test@redactnest.com` customer: sign in and open `/account/subscribe` once → Polar's customer now shows your Clerk user id as its External ID, and you land on `/account` with "You're already on Pro." and no checkout → AC-25, AC-14
- [ ] An untied sandbox customer holding a `+clerk_test` email, then sign up with that email, Subscribe and pay → the customer gains your Clerk user id as its external id, Welcome reaches "You're on Pro.", and the tool shows Pro → AC-25, AC-14
- [ ] Signed out, open Subscribe → Sign in → its "Sign up" link → sign up with a fresh `+clerk_test` address and 424242 → Polar's checkout, never `/account`; then the same from Sign up switching to Sign in, with an existing account → AC-8
- [ ] On the checkout Subscribe opened → the email field shows your address and is disabled, so the order can only land on the tied customer → AC-14, AC-25
- [ ] Signed out, open `/sign-in/factor-one?sign_in_force_redirect_url=/pricing&redirect_url=/account/subscribe&keep=1` → the address becomes `/sign-in/factor-one?keep=1&redirect_url=%2Faccount%2Fsubscribe` before Clerk shows; sign in from `/sign-in?sign_in_force_redirect_url=/pricing` → lands on `/account` → AC-8, INV-13
- [ ] Sign out from `/account` → `/` arrives as a document load (its navigation entry is `/`, type `navigate`), no request to a Clerk origin, `window.Clerk` undefined, and the next `/api/entitlement` answer is `free`, `none` with no `Set-Cookie` → AC-12, INV-13
- [ ] Go offline in DevTools, then Sign out → "We couldn't sign you out. Try again." and the page stays → AC-12
- [ ] A sandbox customer holding your email but tied to another external id → Subscribe shows "This email is already linked to another account with us, so we didn't start a checkout. Write to privacy@redactnest.com and we'll sort it out." and starts no checkout → AC-25

## Commands
- [ ] `pnpm exec vitest run tests/unit/billing-subscribe.test.ts` → INV-3's cases (only A's id and email reach Polar, tie, conflict, soft deleted, case, two matches, 422 on create, other product, unverified email, no session), the tying cases and every Subscribe outcome pass → AC-14, AC-25, INV-3
- [ ] `pnpm exec vitest run tests/unit/billing-landing.test.ts` → both forms of Subscribe, every Account case, the six parameters and the clean redirect, both pages forcing both landings → AC-8, INV-13
- [ ] `pnpm exec vitest run --project component tests/component/app/sign-out.test.tsx` → `signOut` called with a function then `/` loaded; a throw stays and says so; after deletion a throw still loads `/` → AC-11, AC-12
- [ ] `pnpm exec vitest run tests/unit/engine-wall.test.ts` → `SignOutButton` and `UserButton` rejected in every zone and every spelling, the rest of `@clerk/nextjs` still allowed in the account group → INV-13
- [ ] `pnpm exec vitest run tests/unit/billing-config.test.ts` → a preview or `vercel dev` with any billing value stops on the billing off rule, naming the values set; a preview with none builds → AC-23

## Value sourcing
- [ ] The email Subscribe uses: a primary email Clerk reports unverified → no email search, no create, the checkout error line → AC-25 step 2
- [ ] The email's case: Clerk holds `a@…` and Polar `A@…` → tied, not a conflict → AC-25
- [ ] The customer a checkout is bound to: after Subscribe, the checkout's customer is the one whose external id is your Clerk user id, never one named in the address → INV-3
- [ ] Another product: a tied customer with an active subscription to another EdiventStudio product → the other product line, no checkout → AC-14
- [ ] Where Clerk lands: the switch link's absolute `redirect_url` on `NEXT_PUBLIC_SITE_URL`'s origin → Subscribe; the same on another origin → Account → AC-8
- [ ] Previews: build with `VERCEL=1 VERCEL_ENV=preview` and any one billing value → the build stops naming the billing off rule → AC-23
- [ ] Telemetry: `pnpm dev` with `CLERK_TELEMETRY_DISABLED=1` from `.env.example` → Clerk's proxy prints no telemetry notice → *Decided after the sandbox walk*

## Acceptance-criteria coverage
- AC-8 … the switching, clean redirect and landing steps · AC-11 … the after deletion case of the sign out test (the delete flow follows in task 12) · AC-12 … the two sign out steps · AC-14 … the stuck customer, known email, disabled email and other product steps · AC-23 … the gate test and the preview build · AC-25 … the tying steps, the conflict step and the INV-3 test

# Slice 2 (never silently free) · updated 2026-10-04
_Steps for tasks 8 to 10. The same local setup as slice 1. To show an answer the account cannot reach by hand, block or edit `/api/entitlement` in DevTools._

## UI / manual
- [ ] Open `/tool` signed out → the helper reads "Checking your plan", then "Up to 3 pages on Free"; the plan line directly above the zone reads "Sign in, or see what Pro adds.", and both links open a new tab → AC-5
- [ ] Signed in on Free, then as `walk-one+clerk_test@redactnest.com` (Pro) → "Get Pro for up to 50 pages a document.", then "Signed in with Pro." with the helper "Up to 50 pages on Pro" → AC-5
- [ ] Delete the `__session` cookies but keep `__client_uat`, then reload → "Your sign in has expired, so the free limit applies. Sign in again to use Pro." with a Sign in again link → AC-5, AC-2 rule 2
- [ ] Block `/api/entitlement` in DevTools and reload → after 4 s, "We couldn't check your plan, so the free limit applies for now." with Try again; unblock and press Try again → "Checking your plan…", then the real answer, with focus on the plan line → AC-3, AC-4, AC-5
- [ ] Signed out, choose a 12 page PDF (`tests/fixtures/read-pages.pdf`) → "This PDF has more than 3 pages", "The free plan handles up to 3 pages. Pro handles up to 50.", "Sign in and get Pro, then open it again here.", a Get Pro link to a new tab, "Check my plan and open it again", and no split advice → AC-6
- [ ] AC-7 end to end: at the cap, Get Pro → Pricing in a new tab → Subscribe → sign in → pay with 4242 → back to the tool tab → the plan line shows "Signed in with Pro." while the callout still shows the free words → "Check my plan and open it again" → the same file opens past the free cap, with no file picker → AC-7
- [ ] At the cap, rename or edit the file on disk, then "Check my plan and open it again" → "The file couldn't be read" → AC-6
- [ ] Pro page: revoke the benefit by hand in Polar, wait over 5 minutes, choose a file → it opens under the free cap, and the callout speaks to a signed in Free account → AC-4
- [ ] Pro page: over 5 minutes and under 30 after the last Pro answer, block `/api/entitlement` and choose a 12 page file → it still opens under Pro; past 30 minutes it gets the `unknown` callout → AC-4 (keep paid)
- [ ] Free page: switch to another tab and back → one `/api/entitlement` request and the line updates; on a Pro page, switching back makes no request → AC-4

## Commands
- [ ] `pnpm exec vitest run tests/unit/entitlement.test.ts` → one ask at a time, the 4 s budget on every ask, late answers, the age and visibility rules, keep paid within 30 minutes only for a refresh for age → AC-3, AC-4
- [ ] `pnpm exec vitest run tests/unit/flow-text.test.ts tests/component/tool-client.test.tsx` → `PLAN_TEXT` for every account, the helper, the cap words and links by account, billing off keeping today's words, the open again with no picker, a changed file's `file-unreadable` → AC-5, AC-6
- [ ] `pnpm exec playwright test tests/e2e/plan.spec.ts --project=chromium` → every plan line, every cap callout, axe on each, and AC-7 with a new tab and no file chooser → AC-5, AC-6, AC-7

## Value sourcing
- [ ] The free cap and the paid figure: change `NEXT_PUBLIC_FREE_PAGE_CAP` and `NEXT_PUBLIC_MAX_PAGES` → the helper, the plan line's "up to N pages a document" and the callout's "Pro handles up to N." all follow → AC-5, AC-6
- [ ] Billing on or off: build with none of the seven values → no plan line, the helper "Up to 3 pages", and the cap words with the split advice → AC-5, AC-6, AC-23
- [ ] Which words: open a job anonymously at the cap, then sign in in another tab and come back → the plan line changes, the callout keeps the anonymous words until its button is pressed → AC-6
- [ ] When to ask again: an open within 5 minutes of the last answer makes no request; one after makes one (`REFRESH_AFTER_MS`) → AC-4
- [ ] The file opened again: the session's held `File`, so no file chooser opens and the file bar shows the same name → AC-6

## Acceptance-criteria coverage
- AC-3 … the blocked request step and the entitlement unit test · AC-4 … the revoke, keep paid and tab switching steps, the unit test · AC-5 … the plan line steps for each account, the component and browser tests · AC-6 … the cap callout, changed file and which words steps · AC-7 … the end to end step and the browser test
