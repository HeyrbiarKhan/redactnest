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
