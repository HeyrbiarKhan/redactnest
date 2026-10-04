# Verify: Billing and the paid plan · spec 0012 · updated 2026-10-04
_Steps derived from spec 0012 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

_Slice 1 (the money path) as built. Locally, billing needs `NEXT_PUBLIC_SITE_URL=http://localhost:3000`, because the plan check accepts a token only from the site's own origin. Sign in on the Clerk development instance with an address containing `+clerk_test` (for example `walk-one+clerk_test@redactnest.com`) and the code `424242`; no email is sent. Pay in the Polar sandbox by hand with the card `4242 4242 4242 4242`, any future date and any CVC, because Stripe's card form runs a bot check that holds an automated browser._

## UI / manual
- [x] Open `/tool` anonymously and watch the network → exactly one request beyond the page's own files, `GET /api/entitlement`, made as the page loads (not on hover), answering `free`, `none` → AC-1, AC-4, AC-20
- [x] Open `/`, `/pricing`, `/privacy`, `/terms` and `/tool` in a fresh browser → no request to any Clerk or Polar origin, no cookie set → AC-9, AC-19
- [x] Header on `/`, `/pricing`, `/privacy`, `/terms`, `/tool` and the account pages → Pricing and Account links, plain `a` elements to `/pricing` and `/account` (no prefetch) → AC-9, INV-10
- [x] Open `/pricing` → h1, Free "Up to 3 pages a document", Pro "$19 a month", "Up to 50 pages a document", "Everything in Free", a Subscribe link to `/account/subscribe`, the EdiventStudio merchant line, "Tax may be added at checkout, depending on where you live.", and the terms line with its link; axe clean at 320 pixels and 200% text → AC-13
- [x] Open `/sign-up?redirect_url=/account/subscribe`, sign up with a `+clerk_test` address and code 424242 → Clerk asks for the email alone, then lands on Polar's sandbox checkout for "RedactNest Pro", $19 monthly, under EdiventStudio, with the email filled in and a required "I agree to RedactNest's Terms of service" tick box → AC-8, AC-14, AC-15
- [x] Open `/sign-in?redirect_url=/tool` and sign in → lands on `/account`, never `/tool` → AC-8
- [x] While signed in, open `/sign-in` or `/sign-up` → sent to `/account` → AC-8
- [x] Sign in and inspect Clerk's card → the button is the accent colour, text is Inter in `ink`, the footer "Sign up" or "Sign in" link is underlined; axe clean; usable by keyboard alone → AC-8
- [x] Open `/account` signed out → sent to `/sign-in` → AC-10
- [x] Open `/account` signed in with no Polar customer → the email, Plan "Free", Get Pro (to `/pricing`) and Sign out → AC-10
- [x] Pay the sandbox checkout → Polar returns to `/account/welcome`, which shows "Confirming your payment", then "You're on Pro. Go back to the tab with your document, or open the tool."; the tool link is a real page load → AC-16
- [x] On `/account/welcome` with no Pro arriving, wait out 15 asks (30 s) → "Your payment is still being confirmed. This can take a few minutes." and "Check again", which starts another round; hiding the tab pauses the asking → AC-16
- [x] Signed in with Pro, open `/account/subscribe` → back to `/account` with "You're already on Pro." and no second checkout → AC-14
- [x] Signed in with Pro, sit on `/tool` for over a minute (Clerk's token expires after 60 s) and ask again → still `paid`, `signed-in`, `pageCap` 50, with no `Set-Cookie` → AC-1, AC-2 rule 5
- [x] Choose a 4 to 50 page PDF on `/tool` as Pro → it opens past the free cap → AC-4
- [x] Sign out from `/account` → lands on `/`, and the next `/api/entitlement` answer is `free`, `none` → AC-12
- [x] Inspect the sign in page's console → the only policy report is Clerk's blocked `blob:` worker, and the session token still refreshes after 60 s → AC-21

## Commands
- [x] `pnpm exec vitest run tests/unit/billing-config.test.ts` → every config gate case passes: off with none, a partial set naming each missing value, mixed keys, live with sandbox, a host no Clerk origin covers, Vercel production on test keys or another host, live keys on a preview, a `\n` escaped JWT key → AC-23
- [x] `pnpm exec vitest run tests/unit/billing-entitlement.test.ts` → the decision table, INV-11's refusals with no outbound call, and the pinned check order pass → AC-1, AC-2, INV-4, INV-6, INV-11
- [x] `pnpm exec vitest run tests/unit/entitlement-route.test.ts tests/unit/entitlement.test.ts` → every account kind passes through whole, never a `Set-Cookie`; a drifted answer reads as free `unknown` → AC-1, AC-3
- [x] `pnpm exec vitest run tests/unit/billing-subscribe.test.ts` → INV-3: Polar receives the session's user and email, never the query's; no session means no Polar call → AC-14, INV-3
- [x] `pnpm exec vitest run tests/unit/proxy-matcher.test.ts` → the proxy covers the account group only, never `/tool` or `/api/entitlement` → AC-9, INV-1
- [x] `pnpm exec vitest run tests/unit/csp.test.ts tests/unit/privacy-config.test.ts` → the tool policy unchanged; the standard policy gains Clerk's script, connect and image origins and nothing else → AC-20, AC-21
- [x] `pnpm exec vitest run tests/unit/engine-wall.test.ts` → Clerk, Polar and the billing modules rejected in every fenced zone, allowed only in their homes → AC-9, AC-20
- [x] `pnpm build` with a valid `NEXT_PUBLIC_SOURCE_URL` → `/pricing` and `/tool` listed as static (○), the account pages and `/api/entitlement` as dynamic (ƒ) → AC-13
- [x] Unset all seven billing values and build → `/pricing` is a 404, the header shows no Pricing or Account link, the account pages say accounts are not set up, `/api/entitlement` answers `none` → AC-23

## Value sourcing
- [ ] Session token and `__client_uat`: set only the suffixed cookie, then only the plain one, then both with different users → the suffixed one wins, the plain one is read when alone → AC-2 rule 2 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-entitlement.test.ts`: "reads the suffixed session cookie before the plain one", "falls back to the plain session cookie when no suffixed one is set" and "reads the suffixed __client_uat before the plain one". Not held: the suffixed `__session` set alone.
- [ ] The expected issuer: a token from another Clerk instance (wrong `iss`) → `sign-in-needed`, no Polar call → INV-11 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-entitlement.test.ts`: "INV-11: a token that is not genuine is refused locally", its "a wrong iss" cases (`sign-in-needed`, no Polar call, no fetch). Not held: that `src/billing/clients.ts` builds the issuer from Clerk's frontend API.
- [ ] The authorized party: browse at an address other than `NEXT_PUBLIC_SITE_URL` → every token answers `sign-in-needed` → INV-11 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-entitlement.test.ts`: the same INV-11 table's "a wrong azp" and "a missing azp" cases, and "reports an expired token from another site as the wrong party, not expired". Not held: browsing at another address (Clerk's sign in does not render at `127.0.0.1` on the development instance), and that the authorized party comes from `NEXT_PUBLIC_SITE_URL`.
- [ ] An expired token's user: a token issued 6 days ago reaches Polar; 8 days ago answers `sign-in-needed` → AC-2 rule 5 · **Closed without a run (2026-10-04):** held in full by `tests/unit/billing-entitlement.test.ts`: "takes an expired token's sub when it was issued 6 days ago", "still trusts a token issued right at the edge of the window", and the INV-11 table's "an iat 8 days ago" cases.
- [ ] Pro or not: a customer holding another product's benefit, or a Pro subscription whose benefit is not granted yet → `free`, `signed-in` → INV-6 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-entitlement.test.ts`: "ignores a benefit from another product (INV-6)" and "is not paid for a Pro subscription whose benefit is not granted yet (INV-6)". Needs a second Polar product (another EdiventStudio product's subscription) to run by hand.
- [ ] The call's timeout: Polar slower than 1.5 s → `free`, `unknown` well inside the tool's 4 s budget → AC-2 rule 7 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-entitlement.test.ts`: "binds Polar's customer state to OUTBOUND_TIMEOUT_MS, in seconds" (1,500 ms, passed as 1.5 s) and "is unknown when the call throws, as a timeout or a dropped connection does". Not held: a real Polar answer slower than 1.5 s being cut off, since the SDK is mocked.
- [x] Caps: change `NEXT_PUBLIC_FREE_PAGE_CAP` and `NEXT_PUBLIC_MAX_PAGES` → Pricing, the plan check's `pageCap` and the metadata all follow → AC-1, AC-13, INV-8
- [ ] "Pro", "Free", "$19 a month": change `PRO_PLAN` in `src/lib/plans.ts` → Pricing and Account follow → AC-13 · **Closed without a run (2026-10-04):** no test holds it: none imports `src/lib/plans.ts` or renders Pricing. Pricing and Account take the name and price from `PRO_PLAN` (`src/app/pricing/page.tsx:62`, `src/app/(account)/account/page.tsx:66`), and you read their words in task 18. A test for `/test`.
- [x] The tax line: compare with a sandbox checkout's tax for a UK and a US address → included in one, added in the other, as the line says → AC-13
- [x] Subscribe's identity: request `/account/subscribe?external_customer_id=user_x&customer_email=x@y.z` signed in → the checkout carries your own id and email → INV-3
- [x] Success and return addresses: the checkout's back link returns to `/pricing` and paying returns to `/account/welcome` on `NEXT_PUBLIC_SITE_URL` → AC-14
- [x] The contact in the error line: make checkout creation fail → "We couldn't start the checkout. Try again, or write to privacy@redactnest.com." → AC-14
- [ ] Billing on or off: `config.billingEnabled` follows `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` alone, in the browser and on the server → AC-23 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-config.test.ts`: "is null, and billingEnabled false, with nothing set" and "loads a complete set, and billingEnabled is true". Not held: the key alone deciding it (only the key set, or the other six without it), on either side.

## Acceptance-criteria coverage
- AC-1 … the first `/tool` step, the expired token step, the route tests · AC-2 … the decision table, value sourcing rows 1 to 6 · AC-3 … the client test · AC-4 … the load time ask and the Pro open (refresh rules follow in slice 2) · AC-8 … the sign up, sign in, theme and signed in redirect steps · AC-9 … the request and header steps, the matcher and wall tests · AC-10 … the two `/account` steps (renewal, Manage billing and the unknown state follow in slice 3) · AC-12 … the sign out step · AC-13 … the Pricing step and build · AC-14 … the checkout, already Pro and identity steps, INV-3 test · AC-15 … the checkout step · AC-16 … the two welcome steps · AC-19 … the public pages step · AC-20 … the request step, the policy and wall tests · AC-21 … the policy test and the console step · AC-23 … the gate test and the billing off build
- Not in slice 1: AC-5, AC-6, AC-7, AC-11, AC-17, AC-18, AC-22, AC-24

# Slice 1b (the walk's fixes) · updated 2026-10-03
_Steps for tasks 7a to 7d. The same local setup as slice 1. Slice 1's command step "live keys on a preview" is replaced by the stricter rule below: every Vercel build but production now refuses any billing value._

## UI / manual
- [x] Your stuck `walk-one+clerk_test@redactnest.com` customer: sign in and open `/account/subscribe` once → Polar's customer now shows your Clerk user id as its External ID, and you land on `/account` with "You're already on Pro." and no checkout → AC-25, AC-14
- [x] An untied sandbox customer holding a `+clerk_test` email, then sign up with that email, Subscribe and pay → the customer gains your Clerk user id as its external id, Welcome reaches "You're on Pro.", and the tool shows Pro → AC-25, AC-14
- [x] Signed out, open Subscribe → Sign in → its "Sign up" link → sign up with a fresh `+clerk_test` address and 424242 → Polar's checkout, never `/account`; then the same from Sign up switching to Sign in, with an existing account → AC-8
- [x] On the checkout Subscribe opened → the email field shows your address and is disabled, so the order can only land on the tied customer → AC-14, AC-25
- [x] Signed out, open `/sign-in/factor-one?sign_in_force_redirect_url=/pricing&redirect_url=/account/subscribe&keep=1` → the address becomes `/sign-in/factor-one?keep=1&redirect_url=%2Faccount%2Fsubscribe` before Clerk shows; sign in from `/sign-in?sign_in_force_redirect_url=/pricing` → lands on `/account` → AC-8, INV-13
- [x] Sign out from `/account` → `/` arrives as a document load (its navigation entry is `/`, type `navigate`), no request to a Clerk origin, `window.Clerk` undefined, and the next `/api/entitlement` answer is `free`, `none` with no `Set-Cookie` → AC-12, INV-13
- [x] Go offline in DevTools, then Sign out → "We couldn't sign you out. Try again." and the page stays → AC-12
- [x] A sandbox customer holding your email but tied to another external id → Subscribe shows "This email is already linked to another account with us, so we didn't start a checkout. Write to privacy@redactnest.com and we'll sort it out." and starts no checkout → AC-25

## Commands
- [x] `pnpm exec vitest run tests/unit/billing-subscribe.test.ts` → INV-3's cases (only A's id and email reach Polar, tie, conflict, soft deleted, case, two matches, 422 on create, other product, unverified email, no session), the tying cases and every Subscribe outcome pass → AC-14, AC-25, INV-3
- [x] `pnpm exec vitest run tests/unit/billing-landing.test.ts` → both forms of Subscribe, every Account case, the six parameters and the clean redirect, both pages forcing both landings → AC-8, INV-13
- [x] `pnpm exec vitest run --project component tests/component/app/sign-out.test.tsx` → `signOut` called with a function then `/` loaded; a throw stays and says so; after deletion a throw still loads `/` → AC-11, AC-12
- [x] `pnpm exec vitest run tests/unit/engine-wall.test.ts` → `SignOutButton` and `UserButton` rejected in every zone and every spelling, the rest of `@clerk/nextjs` still allowed in the account group → INV-13
- [x] `pnpm exec vitest run tests/unit/billing-config.test.ts` → a preview or `vercel dev` with any billing value stops on the billing off rule, naming the values set; a preview with none builds → AC-23

## Value sourcing
- [ ] The email Subscribe uses: a primary email Clerk reports unverified → no email search, no create, the checkout error line → AC-25 step 2 · **Closed without a run (2026-10-04):** held in full by `tests/unit/billing-subscribe.test.ts`: "makes no search, no create and no checkout with an unverified email".
- [ ] The email's case: Clerk holds `a@…` and Polar `A@…` → tied, not a conflict → AC-25 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-subscribe.test.ts`: "ties a customer holding A@REDACTNEST.COM when Clerk says a@redactnest.com" and "lowercases the email it searches by". The test's fake search ignores case, so Polar's own search doing so is assumed.
- [x] The customer a checkout is bound to: after Subscribe, the checkout's customer is the one whose external id is your Clerk user id, never one named in the address → INV-3
- [ ] Another product: a tied customer with an active subscription to another EdiventStudio product → the other product line, no checkout → AC-14 · **Closed without a run (2026-10-04):** Needs a second Polar product (another EdiventStudio product's subscription) to run by hand. Our side is held by `tests/unit/billing-subscribe.test.ts`: "starts no checkout for a customer subscribed to another product, and says why".
- [x] Where Clerk lands: the switch link's absolute `redirect_url` on `NEXT_PUBLIC_SITE_URL`'s origin → Subscribe; the same on another origin → Account → AC-8
- [x] Previews: build with `VERCEL=1 VERCEL_ENV=preview` and any one billing value → the build stops naming the billing off rule → AC-23
- [x] Telemetry: `pnpm dev` with `CLERK_TELEMETRY_DISABLED=1` from `.env.example` → Clerk's proxy prints no telemetry notice → *Decided after the sandbox walk*

## Acceptance-criteria coverage
- AC-8 … the switching, clean redirect and landing steps · AC-11 … the after deletion case of the sign out test (the delete flow follows in task 12) · AC-12 … the two sign out steps · AC-14 … the stuck customer, known email, disabled email and other product steps · AC-23 … the gate test and the preview build · AC-25 … the tying steps, the conflict step and the INV-3 test

# Slice 2 (never silently free) · updated 2026-10-04
_Steps for tasks 8 to 10. The same local setup as slice 1. To show an answer the account cannot reach by hand, block or edit `/api/entitlement` in DevTools._

## UI / manual
- [x] Open `/tool` signed out → the helper reads "Checking your plan", then "Up to 3 pages on Free"; the plan line directly above the zone reads "Sign in, or see what Pro adds.", and both links open a new tab → AC-5
- [x] Signed in on Free, then as `walk-one+clerk_test@redactnest.com` (Pro) → "Get Pro for up to 50 pages a document.", then "Signed in with Pro." with the helper "Up to 50 pages on Pro" → AC-5
- [x] Delete the `__session` cookies but keep `__client_uat`, then reload → "Your sign in has expired, so the free limit applies. Sign in again to use Pro." with a Sign in again link → AC-5, AC-2 rule 2
- [x] Block `/api/entitlement` in DevTools and reload → after 4 s, "We couldn't check your plan, so the free limit applies for now." with Try again; unblock and press Try again → "Checking your plan…", then the real answer, with focus on the plan line → AC-3, AC-4, AC-5
- [x] Signed out, choose a 12 page PDF (`tests/fixtures/read-pages.pdf`) → "This PDF has more than 3 pages", "The free plan handles up to 3 pages. Pro handles up to 50.", "Sign in and get Pro, then open it again here.", a Get Pro link to a new tab, "Check my plan and open it again", and no split advice → AC-6
- [x] AC-7 end to end: at the cap, Get Pro → Pricing in a new tab → Subscribe → sign in → pay with 4242 → back to the tool tab → the plan line shows "Signed in with Pro." while the callout still shows the free words → "Check my plan and open it again" → the same file opens past the free cap, with no file picker → AC-7
- [x] At the cap, rename or edit the file on disk, then "Check my plan and open it again" → "The file couldn't be read" → AC-6
- [x] Pro page: revoke the benefit by hand in Polar, wait over 5 minutes, choose a file → it opens under the free cap, and the callout speaks to a signed in Free account → AC-4
- [x] Pro page: over 5 minutes and under 30 after the last Pro answer, block `/api/entitlement` and choose a 12 page file → it still opens under Pro; past 30 minutes it gets the `unknown` callout → AC-4 (keep paid)
- [x] Free page: switch to another tab and back → one `/api/entitlement` request and the line updates; on a Pro page, switching back makes no request → AC-4

## Commands
- [x] `pnpm exec vitest run tests/unit/entitlement.test.ts` → one ask at a time, the 4 s budget on every ask, late answers, the age and visibility rules, keep paid within 30 minutes only for a refresh for age → AC-3, AC-4
- [x] `pnpm exec vitest run tests/unit/flow-text.test.ts tests/component/tool-client.test.tsx` → `PLAN_TEXT` for every account, the helper, the cap words and links by account, billing off keeping today's words, the open again with no picker, a changed file's `file-unreadable` → AC-5, AC-6
- [x] `pnpm exec playwright test tests/e2e/plan.spec.ts --project=chromium` → every plan line, every cap callout, axe on each, and AC-7 with a new tab and no file chooser → AC-5, AC-6, AC-7

## Value sourcing
- [x] The free cap and the paid figure: change `NEXT_PUBLIC_FREE_PAGE_CAP` and `NEXT_PUBLIC_MAX_PAGES` → the helper, the plan line's "up to N pages a document" and the callout's "Pro handles up to N." all follow → AC-5, AC-6
- [x] Billing on or off: build with none of the seven values → no plan line, the helper "Up to 3 pages", and the cap words with the split advice → AC-5, AC-6, AC-23
- [x] Which words: open a job anonymously at the cap, then sign in in another tab and come back → the plan line changes, the callout keeps the anonymous words until its button is pressed → AC-6
- [x] When to ask again: an open within 5 minutes of the last answer makes no request; one after makes one (`REFRESH_AFTER_MS`) → AC-4
- [x] The file opened again: the session's held `File`, so no file chooser opens and the file bar shows the same name → AC-6

## Acceptance-criteria coverage
- AC-3 … the blocked request step and the entitlement unit test · AC-4 … the revoke, keep paid and tab switching steps, the unit test · AC-5 … the plan line steps for each account, the component and browser tests · AC-6 … the cap callout, changed file and which words steps · AC-7 … the end to end step and the browser test

# Slice 3, task 11 (Account in full and Manage billing) · updated 2026-10-04

_Steps marked "seen" were run once at build time against the sandbox (`walk-one+clerk_test@redactnest.com`, Pro, renewing). `/check verify` runs them all again._

## UI / manual
- [x] Signed out, open `/account` → lands on `/sign-in` → AC-10 (seen)
- [x] Sign in as a Pro account that renews → Email, Plan Pro, "Renews on" with Polar's `current_period_end` as a British date in UTC, Manage billing and Sign out, and no Get Pro → AC-10 (seen: 3 November 2026)
- [x] Cancel in Polar's portal, then come back to Account → "Ends on" with the same date, and still Plan Pro → AC-10, AC-18 (fits task 13's walk)
- [x] A free account that has a Polar customer (one that opened Subscribe and left checkout) → Plan Free, Get Pro goes to `/pricing` (never straight to Subscribe), and Manage billing shows → AC-10
- [x] A new account that never opened Subscribe → Plan Free, Get Pro, and no Manage billing → AC-10
- [x] Manage billing → Polar's portal for this customer only, and its "Back to EdiventStudio" link returns to `/account` → AC-17 (seen)
- [x] Signed out, open `/account/billing` → `/sign-in`, and signing in lands on Account (AC-8 allows no other landing) → AC-17, AC-8
- [x] Signed in with no Polar customer, open `/account/billing` directly → `/pricing` → AC-17

## Commands
- [x] `pnpm exec vitest run tests/unit/billing-account.test.ts` → the renewal and end dates, the day read in UTC whatever the offset, Pro alone (a benefit by hand, another product, an unreadable date), Free while settling, Get Pro to Pricing, Manage billing by customer, and the plan check failure → AC-10
- [x] `pnpm exec vitest run tests/unit/billing-subscribe.test.ts` → Manage billing's INV-3 cases (A's id only, no call signed out, B's details in the query ignored), a 404 or 422 to Pricing, every other failure to the billing line → AC-17, INV-3

## Value sourcing
- [x] Account email: the row shows the signed in account's primary email, and nothing in the address changes it → AC-10
- [ ] "Renews on" or "Ends on" and the date: `cancel_at_period_end` and `current_period_end` of the subscription to `POLAR_PRO_PRODUCT_ID`; a subscription to another product alone shows Pro with no date → AC-10 · **Closed without a run (2026-10-04):** the Pro half was seen by hand in slice 3 (3 November 2026 renewing, 4 November 2026 ending). The other product half: Needs a second Polar product (another EdiventStudio product's subscription) to run by hand. Both are held by `tests/unit/billing-account.test.ts`: "shows Pro that renews, with the day as a British date", "shows Pro set to end, with the day it ends" and "shows Pro alone for %s" (its "only another product's subscription" row).
- [x] Whether Manage billing shows: a Polar customer exists for the account (`hasCustomer`), whether or not it holds Pro → AC-10
- [x] The portal's way back: `config.siteUrl` plus `/account`, so with `NEXT_PUBLIC_SITE_URL=http://localhost:3000` the portal's back link is `http://localhost:3000/account` → AC-17 (seen)
- [x] The billing failure line's contact: `LEGAL.contactEmail`, as a mail link → AC-17

## Acceptance-criteria coverage
- AC-10 … the signed out, Pro renewing, cancelled, free with and without a customer steps, and `billing-account.test.ts` · AC-17 … the Manage billing, signed out and no customer steps, and the portal cases in `billing-subscribe.test.ts` · INV-3 … Manage billing's session cases

# Slice 3, task 12 (Delete account) · updated 2026-10-04

_Steps marked "seen" were run once at build time against the sandbox with throwaway accounts (`delete-one+clerk_test@redactnest.com`, deleted twice with your approval each time; `walk-one` untouched). `/check verify` runs them all again. Use only a new throwaway account for any step that deletes._

## UI / manual
- [x] Signed in, Account → Delete account → the confirm opens in place with "Delete my account for good" and Cancel, and focus lands on Cancel → AC-11 (seen)
- [x] Cancel → back to Delete account, focus on it, nothing deleted → AC-11
- [x] Pro that renews → Delete my account for good → "Cancel your subscription in Manage billing first.", focus back on the confirm, and Polar and Clerk still hold the account → AC-11 (seen)
- [x] Cancel in Polar's portal, back to Account → "Ends on {date}", and the confirm reads "Your Pro access ends now, not on {date}." with the same date → AC-11 (seen: 4 November 2026)
- [x] Delete with Pro set to end → lands on `/` as a document load (navigation type `navigate`), no resource from a Clerk origin, both `__client_uat` cookies `0`, no session cookie, and `/api/entitlement` answers free, `none` → AC-11, AC-12, INV-13 (seen)
- [x] In the Polar sandbox dashboard after that delete → the customer is gone or anonymised, and its RedactNest Pro subscription ended at once rather than at its period end; in Clerk's dashboard, the user is gone → AC-11 (seen: 404 by id and by external id, no email match; in the dashboard, Canceled on 4 October with no renewal date, and the customer anonymised)
- [x] The same email signs up again and opens Subscribe → Polar's checkout, with no conflict line, and a new Polar customer tied to the new user id → AC-11, AC-25 (seen)
- [x] A free account with a Polar customer and no subscription → the confirm shows no warning, and deleting lands on `/` with the tool answering `none` → AC-11 (seen)
- [x] With the plan check failing (for example a wrong `POLAR_ACCESS_TOKEN` locally) → Account says "We couldn't check your plan just now." and shows no Delete account → AC-10, AC-11
- [ ] An account whose customer holds another EdiventStudio product's active subscription (needs a second sandbox product) → "Your email also has a subscription to another EdiventStudio product, so we can't remove your billing details here. Write to privacy@redactnest.com." with a mail link, and nothing deleted → AC-11 · **Closed without a run (2026-10-04):** Needs a second Polar product (another EdiventStudio product's subscription) to run by hand. Our side is held by `tests/unit/billing-delete.test.ts`: "refuses while another product's subscription is active, %s", and `tests/component/app/delete-account.test.tsx`: "says so for %s, stays, and gives focus back to the confirm" (its `other-product` row, the whole sentence). Not held: the mail link on that line.
- [ ] A payment to Pro being retried (`past_due`) is not refused (settled in task 12a): Polar's customer state never lists it, and Polar's delete cancels it and voids its pending orders. If the sandbox can put a subscription into `past_due` (a card that fails on renewal), delete it and check in Polar's dashboard that the subscription is cancelled and no further charge is tried → AC-11 · **Closed without a run (2026-10-04):** needs a renewal that fails (`past_due`) to run by hand. Our side is held by `tests/unit/billing-delete.test.ts`: "does not refuse a payment to Pro being retried, the benefit with no subscription". Leaving it out of the customer state, cancelling it and voiding its orders are Polar's own behaviour.

## Commands
- [x] `pnpm exec vitest run tests/unit/billing-delete.test.ts` → no session calls nothing; Polar by external id with `anonymize: true` before Clerk; a 404 from either counts as done; a second try after Clerk failed finishes; refused while Pro renews, while a payment settles, with a second Pro subscription that renews, and while another product's subscription is active; nothing removed when the state lookup fails or cannot be read, or Polar's delete fails; "sign in kept" when Clerk fails after Polar; the server action acts on the session's user only, and with billing off asks nothing; the Pro benefit with no subscription (a payment being retried) deletes, with no `todo` left (task 12a) → AC-11, INV-3
- [x] `pnpm exec vitest run tests/component/app/delete-account.test.tsx` → the two steps, focus on Cancel and back, the "ends now" warning tied to the confirm, every refusal and failure line with the contact link, a call that never answers, a second try, the sign in case, and leaving through Sign out's after deletion mode even when `signOut` fails; axe clean → AC-11, AC-12, INV-13
- [x] `pnpm exec vitest run tests/unit/billing-account.test.ts` → Delete account shows for a free account, a free customer and Pro, gets the ending day only for Pro set to end, and is absent when the plan cannot be checked → AC-10, AC-11

## Value sourcing
- [ ] "Set to renew": any subscription to `POLAR_PRO_PRODUCT_ID` in the customer state with `cancel_at_period_end` false; a subscription to another product that renews does not count as Pro renewing, but refuses on its own line → AC-11 · **Closed without a run (2026-10-04):** the Pro half is held by `tests/unit/billing-delete.test.ts`: "refuses for %s, and deletes nothing" (Pro set to renew, a second Pro subscription that renews) and "puts the renewal refusal first when both apply". The other product half is held by "refuses while another product's subscription is active, %s" (its "on its own" row). Needs a second Polar product (another EdiventStudio product's subscription) to run by hand.
- [x] "Ends now, not on {date}": the Pro subscription's `current_period_end` as a British date in UTC, only while Pro is held and `cancel_at_period_end` is true; the same day as Account's "Ends on" row → AC-11
- [ ] The account deleted: the session's user from `auth()`, never anything in the request; the action takes no arguments → AC-11, INV-3 · **Closed without a run (2026-10-04):** held by `tests/unit/billing-delete.test.ts`: "deletes the session's own user, and only that user" and "with no session, answers sign in and asks Polar and Clerk nothing". Not held: an argument naming another user being ignored; the action takes none, by its signature only.
- [ ] The failure lines' contact: `LEGAL.contactEmail`, as a mail link; the other product line's seller name: `LEGAL.sellerName` → AC-11 · **Closed without a run (2026-10-04):** Needs a second Polar product (another EdiventStudio product's subscription) to run by hand. `tests/component/app/delete-account.test.tsx` holds both lines' words in "says so for %s, stays, and gives focus back to the confirm", and the billing failure line's mail link in "links the contact address where the words name it". Not held: the mail link on the other product line, and that the words come from `LEGAL.contactEmail` and `LEGAL.sellerName` rather than literals.

## Acceptance-criteria coverage
- AC-11 … the confirm, renewing refusal, "ends now", delete with Pro set to end, dashboard, re-signup, free account, plan check failing and other product steps, `billing-delete.test.ts`, `delete-account.test.tsx` and `billing-account.test.ts`; the retry case is settled in task 12a · AC-12 … the after deletion mode in the delete step and the component test · INV-3 … the server action's session cases · INV-13 … the document load to `/` after deletion

# Slice 3, task 12a (three points after tasks 11 and 12) · updated 2026-10-04

_The same local setup as slice 1. Use only a new throwaway account for any step that pays or deletes._

## UI / manual
- [x] Make Manage billing's call fail (for example a wrong `POLAR_ACCESS_TOKEN` locally), then open `/account/billing` signed in → "Billing didn't open", "We couldn't open billing. Try again, or write to privacy@redactnest.com." with a mail link, and Try again reloads the page; no redirect → AC-17
- [x] Pay the sandbox checkout with a throwaway account, with DevTools' network log kept across pages → the first request to `/account/welcome` carries `customer_session_token`, the next response is a 307 to `/account/welcome` without it, any request to Clerk's `/v1/client/handshake` that follows has a `redirect_url` without it, and Welcome reaches "You're on Pro." with a clean address bar → AC-26 (seen twice, walk-two and walk-three, through a logging relay in place of DevTools: token, then 307 clean, then a handshake whose `redirect_url` was clean)
- [x] Signed in, open `/account?customer_session_token=x&keep=1` → the address becomes `/account?keep=1` before the page shows → AC-26
- [x] On `/account/welcome` after paying, look at the request for Clerk's script and Clerk's API calls → each `Referer` is our origin alone, never a path or query → AC-26, AC-27 (seen: every request to Clerk's host sent `http://localhost:3000/` with `?keep=1` in the address)
- [x] With the header in place, run task 12's "Delete with Pro set to end" step again on a new throwaway account → the delete still lands on `/`, so the server action runs under the new policy → AC-27 (seen: walk-two after its cancel, and walk-three as a free account)

## Commands
- [x] `pnpm exec vitest run tests/unit/proxy-matcher.test.ts` → the matcher unchanged; the token dropped (one value, several, empty, no `=`, encoded name) while `Customer_Session_Token` and every other parameter stay in order; a 307 on the request's own origin; Clerk's middleware never called for a request carrying it, called for one without it; billing off still does nothing → AC-26, AC-23
- [x] `pnpm build`, then `pnpm exec playwright test tests/e2e/headers.spec.ts --project=chromium` → `/`, `/tool`, `/pricing`, `/privacy`, `/terms`, `/engine/VERSION` and a script read from `/`'s HTML each carry exactly one `Referrer-Policy: strict-origin-when-cross-origin`; sent as a page load, `/account/welcome?customer_session_token=x&keep=1` answers 307 to our own origin, `/account/welcome?keep=1`, while the control without the token answers 307 to the Clerk host → AC-26, AC-27
- [x] `pnpm exec vitest run tests/unit/billing-delete.test.ts` → no `todo` left; the Pro benefit with no subscription deletes → AC-11

## Value sourcing
- [x] Which parameter the proxy drops: `PORTAL_TOKEN_PARAM` in `src/billing/portal.ts`, `customer_session_token`, the name Polar added in the walk → AC-26
- [x] The clean address: `request.nextUrl`'s own origin and path, never `config.siteUrl` or a host from the query; locally, open `http://127.0.0.1:3000/account?customer_session_token=x` and the redirect stays on `127.0.0.1` → AC-26
- [x] The referrer policy: `REFERRER_POLICY` in `src/config/csp.ts`, the one source `next.config.ts` sends → AC-27
- [x] The billing failure line: the words in `src/app/(account)/account/billing/page.tsx`, the contact from `LEGAL.contactEmail` → AC-17

## Acceptance-criteria coverage
- AC-11 … the retry case in `billing-delete.test.ts` · AC-17 … the failure step and its value row · AC-26 … the payment, Account and `Referer` steps, the proxy unit test and the e2e case · AC-27 … the header e2e, the `Referer` step and the delete step under the new policy

# Slice 3, task 13 (the sandbox walk) · updated 2026-10-04

_Run once at build time with two throwaway accounts, `walk-two` and `walk-three`. Each was paid by you in your own browser and deleted with your approval; `walk-one` was untouched. Steps marked "seen" were run then (details in `rationale.md`, *Task 12a by hand and task 13's walk*). `/check verify` runs them all again on a new throwaway, paid by hand. The hand revoke is done in Polar's dashboard._

## UI / manual
- [x] At the cap on `/tool`, Get Pro → Pricing → Subscribe → Sign up from the sign in page → pay with 4242 → Welcome "You're on Pro." → back on the tool tab, "Signed in with Pro.", and "Check my plan and open it again" opens the same file past the free cap with no file picker → AC-7, AC-8, AC-16 (seen, with `detect-dense.pdf`)
- [x] On the checkout → "RedactNest Pro", $19 a month, under EdiventStudio, the email greyed out, and the terms tick box with its link; trying to pay with the box unticked is refused → AC-15 (the page seen; the refusal not yet confirmed)
- [x] Cancel in Polar's portal → "To Be Cancelled" with the benefit still granted; Account shows Pro, "Ends on {date}"; `/api/entitlement` still answers paid, signed in → AC-10, AC-18 (seen)
- [x] Hand revoke in Polar's dashboard (a subscription set to end offers only Uncancel, so Uncancel, then Cancel Subscription with the cancellation date set to immediately) → the next answer is free, signed in, `pageCap` 3, with no `Set-Cookie`; Account shows Free, Get Pro to `/pricing` and Manage billing; the tool's plan line reads "Get Pro for up to 50 pages a document." → AC-10, AC-18 (seen)
- [x] Sign out → `/` as a document load (type `navigate`), no resource from Clerk, `window.Clerk` undefined, both `__client_uat` cookies `0`, and the answer free, `none`, with no `Set-Cookie` → AC-12, INV-13 (seen)
- [x] Delete a free account that has a Polar customer → the confirm shows no warning with focus on Cancel; deleting lands on `/`; Clerk and Polar hold nothing for that email → AC-11 (seen)
- [x] Signed in, list every cookie on the site and on Clerk's host from the browser's own cookie list (so HttpOnly cookies show); check `/api/entitlement` sets none → every cookie is Clerk's on the site or Clerk's host, or Cloudflare's on Clerk's host, each serving sign in or its security, and none from the plan check → AC-19, claim C6 (seen; failed against the old wording, which leaned on Clerk's cookie page; the walk's recorded list meets C6 as reworded on 2026-10-04, see `rationale.md`)

## Value sourcing
- [x] "Renews on" and "Ends on": the same day as Polar's `current_period_end` for the Pro subscription, before and after the cancel → AC-10 (seen: 4 November 2026 both times)

## Acceptance-criteria coverage
- AC-7 … the upgrade step · AC-8 … the switch from sign in to sign up on the way to checkout · AC-10 … the cancel, revoke and renewal date steps · AC-11 … the free delete · AC-12 … the sign out step · AC-15 … the checkout step (the refusal open) · AC-16 … Welcome in the upgrade step · AC-18 … the cancel and hand revoke steps · AC-19 … the cookie step (claim C6 reworded 2026-10-04; production is Go live step 6)

# Slice 4, tasks 14 to 17 (the words, the proofs and the measure) · updated 2026-10-04

_Built and run at build time: the component, privacy, shell and legal page tests, the full chromium suite (286 passed) and the speed project. Task 18 is your read of every word, before merge. The AC-15 refusal stays open from task 13: you did not try paying with the box unticked, so `/check verify` does it._

## UI / manual
- [x] Open `/privacy` → h1 "Privacy policy", then the h2s in order: Who we are, Your documents, Your account, Payments, What we receive when you visit, What we do not do, Services we use, Transfers outside the UK and the EU, Your rights, Complaints, Children, Links to other sites, Changes; one change entry, "3 October 2026: First published." → AC-22
- [x] On `/privacy`, Who we are → "RedactNest is sold through EdiventStudio, another trading name of Heyrbiar Khan." → AC-22
- [x] On `/privacy`, Your account → C12 ("Your account holds your email address and nothing else."), the contract as the legal basis (Article 6(1)(b)), deletion at Clerk and at Polar with Polar keeping the tax records, then C6 in full: Clerk's cookies on our site and on `clerk.redactnest.com`, Cloudflare's on that address, all strictly necessary, nothing else, none of our own, and Polar's pages as Polar's own site. No cookie is named and no cookie list is linked → AC-22, claim C6
- [x] On `/privacy`, Payments → the merchant line, "We never see your card", the account id and email sent to Polar before you pay, what we learn from Polar, Polar as our processor, and "Polar’s own privacy policy" linking `https://polar.sh/legal/privacy-policy`. Neither Your account nor Payments calls Polar a controller → AC-22, claim C13
- [x] On `/privacy`, What we do not do → its first item reads, word for word, "No page sets a cookie except the sign in and account pages, and we set none of our own (see Your account)."; C7 names Clerk's script as the only outside one; C9 names the sign in and account pages as the exception; C11 reads "We do not sell your data, share it for advertising, …"; the old "There are no accounts or payments yet" is gone → AC-22
- [x] Open `/terms` → h1 "Terms of service", tab title "Terms of service · RedactNest", Your account and Pro subscriptions after "Checking the result is your job", About these terms naming EdiventStudio, and no price written as a number in Pro subscriptions → AC-22, INV-8
- [x] The footer's Legal nav on every page, the line under the drop zone on `/tool`, and Pricing's "By subscribing you agree to the Terms of service." all say "Terms of service" and link `/terms` → AC-22, AC-13
- [x] In the Polar sandbox checkout, try to pay with the terms box unticked → Polar refuses until it is ticked → AC-15 (open since task 13)
- [x] Task 18: read every word of Pricing, Account (`/account`, Subscribe's and Billing's lines, the delete confirm), the plan line and the cap copy (`PLAN_TEXT` and `too-many-pages` in `src/lib/flow-text.ts`), and both legal pages, and correct anything before merge → AC-5, AC-6, AC-13, AC-22 (done 2026-10-04: one change, the merchant line names the receipt only; everything else approved)
- [x] On `/pricing` and in the privacy policy's Payments → "Payments are handled by Polar, our merchant of record. Your receipt shows EdiventStudio, the studio RedactNest is sold through.", with no mention of a card statement (unverified until Go live step 7) → AC-13, AC-22

## Commands
- [x] `pnpm exec vitest run --project component tests/component/app/legal-pages.test.tsx` → the cookie claim by owner, purpose and place on Clerk's production host, accounts and payments with Polar as our processor, and the terms' account and Pro points all pass → AC-22
- [x] `pnpm build`, then `pnpm exec playwright test tests/e2e/privacy.spec.ts --project=chromium` → no cookie and no `Set-Cookie` after a full `/tool` run and visits to `/`, `/pricing`, `/privacy`, `/terms`, `/no-such-page` (404) and `/licence.txt`; no request to a Clerk host from the five public routes with the header's links hovered; every request on `/pricing` stays on our origin; `/tool` still asks for the entitlement alone with Pricing and Account in its header → AC-9, AC-19, AC-20
- [x] `pnpm exec playwright test tests/e2e/shell.spec.ts --project=chromium` → on `/`, `/tool`, `/pricing`, `/privacy` and `/terms`, Pricing and Account are plain links and hovering them requests nothing under `/pricing`, `/account`, `/sign-in` or `/sign-up` → AC-9, INV-10
- [x] `pnpm exec playwright test tests/e2e/legal-pages.spec.ts --project=chromium` → both pages' headings in order from `policy-sections.ts`, axe clean, no sideways scroll at 320 pixels or at 200% text, no cap as a number → AC-22
- [x] `pnpm exec playwright test --project=speed --no-deps` → the paid cap open at most 10 s and the slowest read at most 1 s (recorded: 2,471 to 2,719 ms, and 8 to 14 ms during detection, 58 to 81 ms during inspection) → AC-24
- [x] `git grep -n -i "terms of use" -- . ':!docs/specs'` → nothing → AC-22

## Value sourcing
- [ ] C6's host: the e2e build's publishable key names a `*.clerk.accounts.dev` host, yet `/privacy` names `clerk.redactnest.com`, from `CLERK_PRODUCTION_ORIGIN`; change that constant in a scratch build and the page follows → AC-22, claim C6 · **Closed without a run (2026-10-04):** held by `tests/component/app/legal-pages.test.tsx`: "states the cookie claim by owner, purpose and place", which builds the expected host from `CLERK_PRODUCTION_ORIGIN`. Not held: `/privacy` still naming `clerk.redactnest.com` in a build whose key names a development host.
- [x] Polar's policy link in Payments comes from `POLAR_SERVICE.policyUrl` in `src/config/privacy.ts`, the same entry Services we use renders → AC-22
- [ ] The seller words: change `LEGAL.sellerName` in a scratch build → Who we are, About these terms, the merchant line and Pro subscriptions all follow → AC-22, INV-9 · **Closed without a run (2026-10-04):** held by `tests/component/app/legal-pages.test.tsx`: "covers accounts and payments, with Polar as our processor" and "makes the account and Pro points the outline names", which check `LEGAL.soldThroughLine` and `LEGAL.merchantLine`. Not held: Pricing's merchant line, and the seller name in the terms' Pro subscriptions.
- [x] The paid cap: the measure ran at `config.maxPages` 50 and the bar held, so the default stays 50 and the sandbox product's "up to 50 pages" matches → AC-24, AC-15

## Acceptance-criteria coverage
- AC-5, AC-6, AC-13 … your read (task 18) · AC-9 … the request, prefetch and `/tool` entitlement steps · AC-15 … the unticked box step (still open) and the cap value row · AC-19 … the cookie command · AC-20 … the `/tool` entitlement step · AC-22 … the page steps, the component test, the rename grep and the value rows · AC-24 … the speed command and the cap value row

# Found in the rerun · 2026-10-04
_Not from `/develop`: a failure `/check verify` met while running slice 1b's sign up switch. Open until `/debug` fixes it._

## UI / manual
- [ ] Click Sign out on `/account` before Clerk's script has loaded (hold `clerk.browser.js` back 5 s) → the session still ends: `/` as a document load, both `__client_uat` cookies `0`, no `__session`, and the answer free, `none` → AC-12, INV-13 (failed 2026-10-04: `/` in 0.2 s with both `__session` cookies kept and the answer `signed-in`. Until Clerk loads, its `signOut` only queues the call and resolves at once, so `leaveAccount` loads `/` and the queued call never runs)
