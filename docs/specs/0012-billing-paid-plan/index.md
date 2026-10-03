# 0012. Billing and the paid plan

**Date**: 2026-10-03
**Status**: Proposed

## Summary

RedactNest gets one paid plan, Pro, at $19 a month: it lifts the page cap from the free plan's 3 pages to 50, and nothing else changes. People sign in with an emailed code through Clerk, and pay on Polar's own checkout page, where Polar acts as the merchant of record (the seller who handles tax and receipts; it trades as EdiventStudio). There is still no database: when the tool asks which plan applies, our server checks the sign in cookie itself and asks Polar whether the person holds Pro. The tool page still loads nothing from Clerk or Polar, and whenever it cannot confirm a plan it says so out loud instead of quietly dropping a paying user to the free cap.

## Requirements

**User stories**:
- As a free visitor whose PDF is over the cap, I want to get Pro in another tab and open the same file again here, so the paywall does not cost me the file I chose.
- As a Pro user, I want the tool to recognise my plan every time, and to tell me plainly when it cannot, so I never wonder why I am capped at 3 pages.
- As a Pro user, I want to cancel, change my card and download invoices myself, and to delete my account, without writing to anyone.
- As a visitor, I want the pricing page to tell me what Pro does today, what it costs, and that the charge shows as EdiventStudio, so nothing on my statement surprises me.
- As the operator, I want billing to need no store of my own, and a production deploy that can never run on test keys or the Polar sandbox.

**Acceptance criteria** (the contract):

*The plan check (the tool's one question)*
- **AC-1**: `GET /api/entitlement` reads no body and no query, and answers `{ tier, pageCap, maxFileBytes, account }` with `Cache-Control: private, no-store` and never a `Set-Cookie`. `tier` is `free` or `paid`. `account` is one of `ENTITLEMENT_ACCOUNTS` in `src/worker/protocol.ts`: `none` (not signed in, or billing is off on this build), `signed-in`, `sign-in-needed` (a sign in existed but cannot be confirmed now) or `unknown` (the check itself failed). Paid caps are `config.maxPages` and `config.maxFileBytes`; free caps are `config.freePageCap` and `config.maxFileBytes`.
- **AC-2**: The route decides in this order, and only rule 6 makes an outbound call:
  1. Billing off on this build: free, `none`.
  2. It reads Clerk's session token and `__client_uat` cookies by the suffixed name first (`getSuffixedCookieName` with `getCookieSuffix` of the publishable key, from `@clerk/shared/keys`), then the plain name, as Clerk itself does. No token: free, `sign-in-needed` when `__client_uat` holds a positive number, otherwise `none`.
  3. A token is genuine only when all of these hold (INV-11): its signature verifies against `CLERK_JWT_KEY` (Clerk's `verifyToken`); its `iss` equals `https://` plus the Frontend API host parsed from the publishable key; its `azp` is present and equals the origin of `config.siteUrl`; and its `nbf` and `iat` are not in the future (Clerk's 5 s skew). Only the expiry is relaxed (rule 5). A token that fails any check gives free, `sign-in-needed` (the "sign in again" plan line), whatever `__client_uat` holds, with no outbound call.
  4. A genuine token that has not expired: its `sub` is the user.
  5. A genuine token whose only fault is expiry: its `sub` is the user when its `iat` is at most 30 days ago, the Clerk session lifetime (`SESSION_TRUST_MS`); older gives free, `sign-in-needed`. No call to Clerk.
  6. For a user, ask Polar for the customer state by external id (the Clerk user id). A granted benefit whose id is `POLAR_PRO_BENEFIT_ID` gives paid, `signed-in`; no such benefit, or a 404 (no customer), gives free, `signed-in`.
  7. Any other Polar status (401, 403, 422, 429, 5xx), a thrown error, a call over 1.5 s, or an answer it cannot read: free, `unknown`.
- **AC-3**: The tool turns every failed, unreadable or late answer (the existing 4 s wait budget) into free with `account: "unknown"`, never into free with `none`. An answer whose `account` is outside the closed set, or whose tier and account disagree (`paid` with anything but `signed-in`), is read as free, `unknown`.
- **AC-4**: `/tool` asks once as it loads, after the load guard and the support check pass, instead of on the engine warm trigger. It asks again when the tab becomes visible and the last answer is not `paid`, and at each open (a file chosen, or AC-6's button) when the last answer is more than 5 minutes old; AC-6's button always asks fresh. One ask is in flight at a time, and a trigger during it joins it. Every ask, the load time one included, has the 4 s budget; past it the page's answer becomes free, `unknown`, and an answer that lands later replaces the page's answer (helper and plan line) but never a job's frozen snapshot. When an ask made for age comes back `unknown` and the page holds a `paid` answer confirmed in the last 30 minutes (`KEEP_PAID_MS`), the page keeps that paid answer; every other failed ask gives free, `unknown`. A job still freezes its snapshot at open and runs on it to the end (spec 0002, INV-5); `EntitlementSnapshot` gains `account`.
- **AC-5**: While the full drop zone shows, its helper reads "Checking your plan" until the first answer, then "Up to {pageCap} pages on {Free|Pro}". A plan line directly above the drop zone, in its own polite status region, shows the account's next step: `none` "Sign in, or see what Pro adds." · `signed-in` free "Get Pro for up to {paid} pages a document." · `signed-in` paid "Signed in with Pro." · `sign-in-needed` "Your sign in has expired, so the free limit applies. Sign in again to use Pro." · `unknown` "We couldn't check your plan, so the free limit applies for now." with a "Try again" button that asks fresh. Its links (Sign in and Sign in again to `SIGN_IN_PATH`; see what Pro adds and Get Pro to `PRICING_PATH`) open in a new tab and say so to assistive technology. Every word lives in `PLAN_TEXT` in `src/lib/flow-text.ts`, a record over the account kinds and the tier, so a kind added without words fails `pnpm typecheck`. With billing off on this build (`config.billingEnabled` false, AC-23), the helper reads "Up to {pageCap} pages" and no plan line shows.
- **AC-6**: `too-many-pages` for a free snapshot reads: title "This PDF has more than {cap} pages"; body "The free plan handles up to {cap} pages. Pro handles up to {paid}."; next step by account: `none` "Sign in and get Pro, then open it again here." · `signed-in` "Get Pro, then open it again here." · `sign-in-needed` "Sign in again to use Pro, then open it again here." · `unknown` "We couldn't check your plan. Check it, then open it again." It never suggests splitting the file. The callout carries the matching new tab link (Get Pro to `PRICING_PATH`, or Sign in to `SIGN_IN_PATH`) and a "Check my plan and open it again" button, with no file picker and no reload: it asks fresh, then dispatches `file-chosen` with the session's held `File`, which ends the failed job and opens a new one under the new snapshot. A file changed or gone on disk fails that open with the existing `file-unreadable`. If the new answer still caps it, the callout shows again with the new snapshot's words. The plan line may show Pro while the callout still shows the free job until the button is used; that is intended. `FailureCallout` gains an actions slot, whose words and targets live in `flow-text.ts` beside the copy. A paid snapshot keeps today's body and split advice, and so does a free one with billing off, where no Pro exists.
- **AC-7**: A free visitor at the cap follows Get Pro to a new tab, signs in, pays in the Polar sandbox, and comes back: the plan line shows Pro after the tab becomes visible, and "Check my plan and open it again" opens the same file past the free cap.

*Accounts*
- **AC-8**: `/sign-in` and `/sign-up` show Clerk's `<SignIn>` and `<SignUp>`, signing in by emailed code only (no password, no social sign in), and sign up asks for the email alone. `ClerkProvider` takes `signInUrl`, `signUpUrl` and both fallback redirects (`/account`) from `routes.ts`. Each page reads `redirect_url` on the server and passes `forceRedirectUrl` only when it is exactly `/account/subscribe`, so after sign in Clerk lands on `/account` or `/account/subscribe` and never anywhere else, `/tool` included. A signed in visitor opening either page goes to `/account`. They are themed from our tokens through `appearance.variables` as CSS variables (`var(--color-…)`), or through `appearance.elements` with token classes if Clerk rejects variables (task 1 says which), light only (spec 0003). Both pages pass axe and work by keyboard.
- **AC-9**: Clerk's script loads only in the `(account)` route group: `/sign-in`, `/sign-up`, `/account` and everything under it. `/`, `/pricing`, `/privacy`, `/terms` and `/tool` make no request to a Clerk origin. `src/proxy.ts`'s matcher is exactly `/sign-in`, `/sign-in/(.*)`, `/sign-up`, `/sign-up/(.*)`, `/account` and `/account/(.*)`, so it never covers `/tool`, `/api/entitlement`, `/`, `/pricing`, `/privacy` or `/terms`. Every link to Pricing, Account, Subscribe, Manage billing or sign in is a plain `a` (never `next/link`), so nothing prefetches an account page and `/tool` sends no request beyond the entitlement. The group's layout sets `robots: { index: false }` for every page in it.
- **AC-10**: `/account` sends a signed out visitor to sign in. Signed in, it shows the account's email; the plan, Free or Pro, and for Pro with an active subscription to the Pro product "Renews on {date}" or "Ends on {date}" (Pro alone otherwise, as during a payment retry or a benefit granted by hand), the date in UTC as a British date; "Get Pro" when free; "Manage billing" once a Polar customer exists; "Sign out"; and "Delete account". When the plan cannot be checked it says so and offers to check again.
- **AC-11**: Delete account is a two step confirm in place: "Delete account", then "Delete my account for good" or Cancel, and when Pro is set to end the confirm adds "Your Pro access ends now, not on {date}." It refuses with "Cancel your subscription in Manage billing first." while any subscription to the Pro product has `cancel_at_period_end` false, a payment being retried included. Otherwise it deletes the Polar customer by external id with `anonymize: true`, then the Clerk user (a 404 from either counts as done), then Clerk's `signOut` runs in the browser and lands on `/`, which clears Clerk's cookies so the tool answers `none`. If Polar fails: "We couldn't delete your account. Nothing was removed. Try again, or write to {contact}." If Clerk fails after Polar: "Your billing details were removed, but your sign in wasn't. Try again to finish." Polar keeps the records tax law requires, which the privacy policy says.
- **AC-12**: Sign out ends the Clerk session and lands on `/`, and the tool's next answer is `none`.

*Paying*
- **AC-13**: `/pricing` is a prerendered static page under the standard policy, with no client component and no outside script. It shows an h1, Free ("Up to {free} pages a document") and Pro ("$19 a month", "Up to {paid} pages a document", "Everything in Free"), and only what Pro does today. Subscribe is a plain link to `/account/subscribe`. Under it: "Payments are handled by Polar, our merchant of record. Your receipt and card statement show EdiventStudio, the studio RedactNest is sold through.", a tax line set by task 1's sandbox check, and "By subscribing you agree to the Terms of service." with its link. It is indexed, with its own title and description, and passes axe at 320 pixels and 200% text.
- **AC-14**: `/account/subscribe` sends a signed out visitor to sign in and back. A Pro user goes to `/account` with "You're already on Pro." A customer with an active subscription to the Pro product but no benefit yet (a payment still settling) goes to `/account/welcome`. If the plan check fails, no checkout starts: "We couldn't check your plan just now, so we didn't start a checkout. Try again." Anyone else gets a Polar checkout for `POLAR_PRO_PRODUCT_ID` with `external_customer_id` set to their Clerk user id, `customer_email` set to their primary email, `success_url` set to `/account/welcome` and `return_url` set to `/pricing` (both on `config.siteUrl`), and is redirected there. If Polar fails, the page says "We couldn't start the checkout. Try again, or write to {contact}." and redirects nowhere.
- **AC-15**: Polar's hosted checkout (set up by hand, checked in the sandbox) shows the product "RedactNest Pro" at $19 monthly under EdiventStudio, with a required tick box "I agree to RedactNest's Terms of service at redactnest.com/terms". The organisation blocks a second subscription for one customer.
- **AC-16**: `/account/welcome` asks `/api/entitlement` every 2 s while the tab is visible, up to 15 asks, showing "Confirming your payment" (an `unknown` or `sign-in-needed` answer keeps it asking), then "You're on Pro. Go back to the tab with your document, or open the tool." (the tool link a real page load). After the 15th ask with no Pro it shows "Your payment is still being confirmed. This can take a few minutes." with a "Check again" button that starts another 15. It names no amount and no card.
- **AC-17**: `/account/billing` sends a signed out visitor to sign in. Otherwise it makes one call, creating a customer session by external id with `return_url` set to `/account`, and redirects to its `customer_portal_url`. A 404 or 422 (no such customer) sends the visitor to `/pricing`; any other failure shows AC-14's error line.
- **AC-18**: Cancelling in Polar's portal keeps Pro until the end of the paid month. Once Polar revokes the benefit (period end, a refund, or a failed renewal after the grace period), the next answer is free, `signed-in`. Checked in the sandbox, a hand revoked subscription included.

*Privacy, policy and configuration*
- **AC-19**: After an anonymous full run on `/tool` and visits to `/`, `/pricing`, `/privacy` and `/terms`, the browser holds no cookie and no response carried `Set-Cookie` (spec 0011 AC-11, now stated for anonymous visitors). Signed in, the only cookies are Clerk's, and `/api/entitlement` never sets one.
- **AC-20**: `/tool`'s policy is unchanged: `connect-src` exactly `'self'`, `script-src` exactly `'self' 'unsafe-inline' 'wasm-unsafe-eval'`, nothing from `OUTSIDE_SERVICES`. Lint rejects any import of `@clerk/*`, `@polar-sh/*`, `@/billing` or `@/config/billing` under `src/app/tool`, `src/lib`, `src/ui`, `src/worker`, `src/engine` and `src/detect`, and the entitlement request carries no document data (spec 0002 AC-3 stays green).
- **AC-21**: `OutsideService` gains `imageOrigins`, which `buildPolicies` adds to the standard policy's `img-src` and never to the tool's. `OUTSIDE_SERVICES` gains Clerk (`scriptOrigins` and `connectOrigins`: `https://clerk.redactnest.com` and `https://*.clerk.accounts.dev`; `imageOrigins`: `https://img.clerk.com`) and Polar (no origin). No other directive takes an outside origin, unless task 1 records a source Clerk cannot work without, which then joins the standard policy only (*Decided while writing*).
- **AC-22**: The privacy policy and the terms change as *Policy and terms changes* below describe: the claims register's C5, C6, C7, C9, C11 and C12 change and C13 is new, two sections join the privacy policy, two join the terms, and the terms are renamed "Terms of service" at the same `/terms` path everywhere their name appears. Both change lists stay one `First published.` entry, with no new entry.
- **AC-23**: Billing configuration is all or nothing. Set all seven values (*Configuration required*), or none. With none, billing is off: `config.billingEnabled` (in `src/config/index.ts`, true exactly when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set, so the browser and the server agree) is false, the tool answers `none` and shows no Pro, sign in or plan line (AC-5, AC-6), the header shows no Pricing or Account link, `/pricing` is a 404, the account pages say accounts are not set up on this build, `src/proxy.ts` does nothing, and no Clerk provider renders (so Clerk's keyless mode never starts). A partial set fails the build, naming every missing value. A complete set must be consistent: the publishable and secret keys both test or both live; live keys with `POLAR_ENVIRONMENT=production` and test keys with `sandbox`; the publishable key parses (`parsePublishableKey`) and its host is one of the Clerk entry's origins; `CLERK_JWT_KEY` is a PEM public key once any `\n` escapes become newlines. A Vercel production build needs a complete set with live keys and a publishable key host of exactly `clerk.redactnest.com`; any other Vercel build refuses live keys. Off Vercel, any complete and consistent set builds. `src/app/layout.tsx` imports `@/config/billing`, so every build and every server start runs these checks; every problem goes into one `ConfigError`.
- **AC-24**: The paid cap measure spec 0005 still owes: open time with detection and the slowest single read on `tests/fixtures/detect-dense.pdf` in Chromium, in the `speed` project on the machine that ran spec 0007's checklist measure, recorded in `rationale.md`. Pro ships at 50 pages only if the open takes at most 10 s and no single read more than 1 s; otherwise the default of `NEXT_PUBLIC_MAX_PAGES` in `src/config/index.ts` drops 10 pages at a time until both hold, and the new cap is recorded.

## Decision

**Chosen option**: Option 1: Polar asked live, Clerk kept off `/tool`, and an expired sign in trusted on its signature.

Clerk holds accounts and Polar holds billing, joined only by the Clerk user id as Polar's external customer id. `/api/entitlement` reads the sign in itself from Clerk's cookie, trusting a genuine token for up to 30 days after it was issued even once Clerk's 60 second expiry has passed, and asks Polar for the Pro benefit on every check. So there is no webhook, no synced copy, no cookie of our own, no store, and no call to Clerk from the tool's one request.

**Implementation skills**: `clerk-setup` (`clerk/skills`, `.claude/skills/clerk-setup/`) · `clerk-nextjs-patterns` (`clerk/skills`, `.claude/skills/clerk-nextjs-patterns/`) · `polar-integration` (`polarsource/skills`, `.claude/skills/polar-integration/`) · `polar-testing` (`polarsource/skills`, `.claude/skills/polar-testing/`) · `next-best-practices` (`vercel-labs/openreview`, `.claude/skills/next-best-practices/`). Two departures: `clerk-nextjs-patterns` suggests a matcher covering every route and `/api`, and this spec deliberately matches the account group only (INV-1). `polar-integration`'s recipes use the older SDK shape (`new Polar({ server })`, camelCase fields); `@polar-sh/sdk` 1.x uses `createPolar` from `@polar-sh/sdk/2026-10` with `environment: "sandbox"` and snake_case fields, so follow the SDK where they differ. Its webhook recipe is not used.

What was settled with you:

| Question | Decision |
|---|---|
| Model | One subscription, $19 a month only, free plan kept. Polar as merchant of record under EdiventStudio. Sandbox first, production on go live day |
| Trial | None. The free plan is the trial, because a trial would hand one off users the paid cap |
| Operator | EdiventStudio is your trading name, so the operator stays "Heyrbiar Khan, an individual based in Pakistan". Pricing and both legal pages say RedactNest is sold through EdiventStudio |
| Plan name | Pro in the app, "RedactNest Pro" in Polar |
| The paywall | Get Pro opens a new tab; the tool keeps the `File` and opens it again on Pro |
| Cap copy | Free: Pro, and the sign in path, never the split advice. Pro over 50 pages keeps the split advice |
| A plan that cannot be confirmed | Free limit, said out loud with the reason and a way forward |
| Source of truth | Polar asked live on each check. No webhook |
| Marker of Pro | Holding the "RedactNest Pro" feature flag benefit, never "any subscription" |
| Clerk and `/tool` | `proxy.ts` never runs on `/tool` or `/api/entitlement`. The route trusts a genuine expired token for up to 30 days after issue, with no call to Clerk (changed after the cross check from a Clerk session lookup, 2026-10-03) |
| A refresh that fails | A Pro answer confirmed in the last 30 minutes survives a failed refresh for age; anything else fails closed, out loud (added after the cross check) |
| Rate limit | A Vercel firewall rate limit rule is a required go live step; if Pro offers none, a 10 s per user memo in the route instead (added after the cross check) |
| Clerk's script | The `(account)` group only. Header shows plain Pricing and Account links on every page, `/tool` included |
| Checkout and portal | Polar's hosted pages, by redirect |
| Agreeing to the terms | A required tick box on the product in Polar, so Polar records it per order, plus a line on Pricing |
| Refunds | Cancel any time, Pro to the end of the paid month, no refunds for part months, legal rights kept. You may still refund by hand in Polar |
| Failed renewal | Pro holds while Polar retries, through the benefit revocation grace period |
| Deletion | In Account, once nothing renews. Polar customer deleted with `anonymize`, then the Clerk user |
| Sign in | Emailed code only. Sessions last 30 days. Bot protection off. Clerk's prebuilt components, themed |
| Clerk domain | `clerk.redactnest.com` by DNS, Clerk's standard production setup |
| Pricing | A public static `/pricing`, stating only what Pro does today |
| Scan memory limit | Stays parked in Deferred; the risk is named (Consequences) |
| Spec 0011 and feature 21 | Money may be taken before the full lawyer review, which waits until RedactNest has 100+ users (a tech lawyer's advice, 2026-10-03). The three Artifex lines are fixed. Billing's policy changes fold into the existing `First published.` entries, dated on go live day |

Decided while writing (runner up in brackets):
- **"Terms of use" becomes "Terms of service"**, at the same `/terms` path. Nothing is live, so the rename is cheap now, and with money involved the page is a service agreement. (Keep "Terms of use": a rename later means a change entry and broken expectations.)
- **Checkout and portal are dynamic pages, `/account/subscribe` and `/account/billing`, that redirect from the server.** A page's redirect works whether Clerk lands on it with a client side navigation or a full load, and a page can show an error. (Route handlers under `/api/billing`: after sign in, Clerk may reach them with a client side navigation that cannot follow a route handler's redirect.)
- **The route reads Clerk's cookies itself and calls `verifyToken`, not `authenticateRequest`.** In `@clerk/backend` 3.x, `verifyJwt` checks the signature and the authorized party before expiry, so an expired verdict proves the token is genuine. A forged cookie is refused locally, with no call to Clerk or Polar, and anonymous traffic can never spend the shared Polar rate limit. `verifyToken` checks no issuer, lets a token with no `azp` pass, and on an expired token stops at the expiry before `nbf` and `iat`, so the route itself checks `iss`, that `azp` is present, and `nbf` and `iat` on the decoded payload (`decodeJwt`), on both the fresh and the expired path. The cookie helpers come from `@clerk/shared/keys`, added as a direct dependency at the version `@clerk/nextjs` uses (pnpm is strict). (`authenticateRequest`: it may try a server side refresh and return cookies we must then drop, and it reports an expired token as plainly signed out.)
- **A genuine expired token is trusted for 30 days after its `iat`, with no Clerk call** (changed after the cross check). The entitlement grants nothing a visitor could not take (spec 0001), so asking Clerk whether the session is still `active` bought little: it added a Clerk outage to every Pro check on `/tool`, a status string the docs do not list, and a second call. Signing out in this browser clears the cookie, so the only loss is that a session revoked from another device keeps Pro here until the cookie goes. (Ask Clerk `sessions.getSession` for every expired token: the first draft.)
- **The one outbound call times out at 1.5 s** (`OUTBOUND_TIMEOUT_MS`; Polar's SDK takes seconds, so it gets `OUTBOUND_TIMEOUT_MS / 1000`), well inside the tool's 4 s budget, cold start included. A rule about responsiveness, not a cap, so it is a named constant in `src/billing`. (No timeout: a hung call would land on the client's budget as `unknown` anyway, but later and less clearly.)
- **A recent Pro answer survives a failed refresh** (added after the cross check): a Polar blip at an open should not cap someone confirmed Pro minutes ago. Bounded at 30 minutes and only for the age refresh, so it never turns a failure into Pro for anyone not confirmed on this page. (Fail closed on every failure: a short Polar outage caps paying users mid session.)
- **The answer is asked for at load, not on the engine warm trigger**, so the plan line can say what applies before anyone chooses a file. (Warm trigger: the plan line would sit on "Checking your plan" until a hover.)
- **Refresh rules**: visible again and not paid (catches an upgrade in another tab, never polls a paid user); older than 5 minutes at an open (a cancel or lapse shows within one open after Polar revokes); always on AC-6's button. (A timer: polling for nothing.)
- **`account` joins `EntitlementSnapshot`**, because the `too-many-pages` words depend on it and a failure's words come only from its kind and the frozen snapshot (spec 0007, INV-3). Spec 0007's INV-3 is amended to also allow `config` caps, for the paid figure. (A second snapshot for display: two answers to keep in step.)
- **Server code lives in a new capability folder, `src/billing`, server only (`import "server-only"`)**, with its config in `src/config/billing.ts`. A lint zone lets only `src/billing` import `@clerk/backend` and `@polar-sh/sdk`; only the `(account)` group and `src/proxy.ts` import `@clerk/nextjs`; only `src/app/api/entitlement`, the `(account)` group, `src/proxy.ts` and `src/app/layout.tsx` (for the gate, AC-23) import `@/billing` or `@/config/billing`. The `@clerk/*` and `@polar-sh/*` bans hold in every zone of `src`, the shared layout, header and home page included, except those named here. (Code beside each route: the Polar and Clerk calls would spread across files the lint cannot fence.)
- **Billing off is a real mode, not an error**, so a self hosted AGPL copy builds with no keys and shows no Pro it cannot sell, and Clerk's keyless mode (which would call Clerk and write a `.clerk` folder) can never start, because without keys no provider renders and the proxy does nothing. CI and Playwright build with billing on, from a fake but complete and consistent set in `tests/e2e/build-env.ts` (a test publishable key naming a `*.clerk.accounts.dev` host, sandbox values that are never called), so the e2e suite sees the real shape; anonymous visitors make no outbound call (INV-4), so nothing reaches Clerk or Polar. (Require real keys everywhere: CI would need Clerk and Polar secrets.)
- **`ClerkProvider` gets `telemetry={false}` and the paths from `src/lib/routes.ts` as props**, not environment variables, so no setting can turn telemetry on or send sign in to `/tool`.
- **The welcome page polls `/api/entitlement`, the same answer the tool gets**, every 2 s for 30 s: Polar can take a few seconds to grant the benefit after payment. (Trust the checkout's success redirect: it can arrive before the benefit.)
- **The price line "$19 a month" and the plan name live in `PRO_PLAN` in `src/lib/plans.ts`**, the one source for Pricing, the plan line and the account page, checked by hand against Polar's product at each go live. (Fetch the price from Polar at build: the build would need Polar's token, and CI has none.)
- **Seller words in `src/lib/legal.ts`**: `LEGAL.sellerName` ("EdiventStudio"), the merchant line and the subscribe notice, beside the operator facts.
- **The paid cap measure's bar**: an open of at most 10 s (the phase line shows progress throughout) and a single read of at most 1 s (a cancel is noticed within a second, spec 0005 AC-11). (No bar: the measure would record a number nothing acts on.)
- **Price changes**: the terms promise at least 30 days' notice by email, effective from the next renewal. (No notice: unfair under consumer law in the UK and the EU.)
- **Audit trail**: Polar's records (orders, subscriptions, refunds, the terms tick box per order) and Clerk's (sign ins, deletions) are the audit trail for billing and accounts. We keep none, consistent with no store and the console ban (spec 0011, AC-15). (A log of our own: a store this product is designed not to have.)
- **No CSP source beyond AC-21 unless sign in breaks.** If task 1's spike shows a violation that stops Clerk working, the standard policy gains exactly the source Clerk documents for it, never on `/tool`, recorded in `rationale.md`. A violation that breaks nothing stays blocked.

## Feature design

**Data model sketch**: no store of our own. Every record lives with Clerk or Polar, joined by one id.

| Record | Lives in | Key fields | Relates to |
|---|---|---|---|
| User | Clerk | `id` (`user_…`, primary key), primary email (the only personal field; no name, no password) | 1 user : 0..1 Polar customer |
| Session | Clerk | `id` (`sess_…`, primary key), `user_id`, 30 day maximum lifetime. The tool's check never asks for it; it trusts a genuine token's `iat` instead. The account pages use Clerk's own checks | N sessions : 1 user |
| Customer | Polar (EdiventStudio) | `id`, `external_id` = Clerk `user.id` (the join, unique), email, the billing details Polar collects for tax | 1 customer : N subscriptions |
| Product | Polar | "RedactNest Pro", $19, monthly, the required terms tick box, the attached benefit | 1 product : 1 attached benefit |
| Benefit | Polar | "RedactNest Pro", type `feature_flag`, its id is `POLAR_PRO_BENEFIT_ID` | granted to a customer while a subscription is active |
| Subscription | Polar | `status`, `current_period_end`, `cancel_at_period_end`, `product_id`. A second one per customer is blocked | N : 1 customer |
| Entitlement answer | nowhere (built per request) | `tier`, `pageCap`, `maxFileBytes`, `account` | derived from the session and the customer state |

Cookies: only Clerk's own, and only once someone signs in (`__session` and `__client_uat` on redactnest.com, possibly with a suffix derived from the publishable key; `__client` on clerk.redactnest.com). We set none.

**Types and modules**:

| Module | Holds |
|---|---|
| `src/worker/protocol.ts` | `ENTITLEMENT_ACCOUNTS = ["none", "signed-in", "sign-in-needed", "unknown"] as const`, `EntitlementAccount`, and `EntitlementSnapshot` gaining `account: EntitlementAccount`. Types only |
| `src/config/index.ts` (changed) | `config.billingEnabled`: true exactly when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set (read literally, inlined), for the browser's billing off choices |
| `src/config/billing.ts` (new, server only) | Reads and validates the seven values (AC-23) at module load, imported by the root layout so every build runs it. Exports `billing: BillingConfig \| null` (`null` is billing off), with `CLERK_JWT_KEY` normalised. Reuses `ConfigError` |
| `src/billing/session.ts` (new) | `readSession(cookies, deps)`: AC-2 rules 2 to 5, returning `{ kind: "none" } \| { kind: "sign-in-needed" } \| { kind: "user"; userId }`. No network. Reads the session token and `__client_uat` by the suffixed name first, then the plain one (`@clerk/shared/keys`) |
| `src/billing/plan.ts` (new) | `readPlan(userId, deps)`: AC-2 rule 6, returning `{ pro: boolean; hasCustomer: boolean; renewal: { endsAt: string; renews: boolean } \| null }` from the customer state. Reads only the benefit list and the subscription to `POLAR_PRO_PRODUCT_ID` |
| `src/billing/entitlement.ts` (new) | `resolveEntitlement(cookies, deps)`: the whole of AC-2, pure over a clock and one seam (`polar.getStateExternal`), so every branch is unit tested with fakes |
| `src/billing/clients.ts` (new) | Builds the Clerk backend client (`createClerkClient`, for the account pages' user deletion) and the Polar client (`createPolar` from `@polar-sh/sdk/2026-10`) from `billing`. The only place the secrets are read |
| `src/lib/entitlement.ts` (changed) | Ask at load, one ask in flight, the answer's time, the refresh and keep paid rules (AC-4), `readSnapshot` narrowing `account` (AC-3), `FREE_ENTITLEMENT` with `account: "unknown"` for every client side failure, and `forgetEntitlement` for a fresh ask |
| `src/lib/plans.ts` (new) | `PRO_PLAN = { name: "Pro", priceLine: "$19 a month" }` and `FREE_PLAN = { name: "Free" }` |
| `src/lib/flow-text.ts` (changed) | `PLAN_TEXT` (AC-5) and the `too-many-pages` entry by tier and account (AC-6) |
| `src/lib/legal.ts` (changed) | `termsLabel: "Terms of service"`, `sellerName: "EdiventStudio"`, `merchantLine`, `subscribeNotice` |
| `src/lib/routes.ts` (changed) | `PRICING_PATH`, `SIGN_IN_PATH`, `SIGN_UP_PATH`, `ACCOUNT_PATH`, `SUBSCRIBE_PATH`, `BILLING_PATH`, `WELCOME_PATH` |
| `src/config/privacy.ts`, `src/config/csp.ts` (changed) | `imageOrigins`, the Clerk and Polar entries, `img-src` in the standard policy only (AC-21) |

**State transitions**:
- Polar's subscription, as this product sees it: none → active (benefit granted) → set to end (`cancel_at_period_end`, still Pro) → revoked (benefit gone) · active → payment failing (still Pro within the grace period) → active or revoked · active → revoked at once (a refund, or a hand revoke). Pro means "holds the benefit", whatever the state.
- The tool page's answer: checking → answered (one account kind) → asked again on AC-4's triggers. A job's snapshot never changes after open.

**API surface**:

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/entitlement` | Route handler, `GET`, dynamic | Clerk's cookies only | `{ tier, pageCap, maxFileBytes, account }` | Public; works out the visitor itself (AC-2) | Never an error status: every failure is a free answer with its reason (AC-2 rule 7) |
| `/pricing` | Static page | none | AC-13 | Public | none at runtime |
| `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]` | Pages in `(account)`, Clerk components | Clerk's own `redirect_url`, limited to `/account` and `/account/subscribe` | a session | Public | Clerk's own messages |
| `/account` | Dynamic page in `(account)` | the session (`auth()`), `currentUser()` | AC-10 | Signed in, otherwise sign in | Plan cannot be checked: says so (AC-10) |
| `deleteAccount` | Server action on `/account` | the session only | redirect to `/`, or a message | Signed in; own account only | Renewing: refused (AC-11). Polar or Clerk failure: message, account kept |
| `/account/subscribe` | Dynamic page, redirect only | the session, `currentUser()` | 303 to Polar's checkout, or to `/account` | Signed in, otherwise sign in and back | Polar failure: error line (AC-14) |
| `/account/billing` | Dynamic page, redirect only | the session | 303 to Polar's portal, or to `/pricing` | Signed in, otherwise sign in and back | Polar failure: error line (AC-17) |
| `/account/welcome` | Dynamic page, polling client component | none | AC-16 | Signed in | 30 s with no Pro: "still being confirmed" |
| `src/proxy.ts` | `clerkMiddleware()` | requests to the account group only | Clerk's handshake on those pages | n/a | Billing off: returns without running Clerk |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| Entitlement | session token, `__client_uat` | Clerk's cookies: `getSuffixedCookieName(name, await getCookieSuffix(publishableKey))` first, then the plain name (`@clerk/shared/keys`) |
| Entitlement | token verdict | `verifyToken` with `CLERK_JWT_KEY` and `authorizedParties: [new URL(config.siteUrl).origin]`, then the route's own checks on the decoded payload (INV-11) |
| Entitlement | the expected issuer | `https://` plus `parsePublishableKey(NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY).frontendApi` (`@clerk/shared/keys`); task 1 confirms it equals a real token's `iss` |
| Entitlement | the user of an expired token | its `sub`, when its `iat` is within `SESSION_TRUST_MS = 30 * 86_400_000` of now (the Clerk session lifetime, decided here) |
| Entitlement | Pro or not | Polar `customers.getStateExternal(userId)`, its `granted_benefits[].benefit_id` against `POLAR_PRO_BENEFIT_ID`; a 404 is "no customer"; any other status is `unknown` |
| Entitlement | `pageCap`, `maxFileBytes` | `config.maxPages` or `config.freePageCap`; `config.maxFileBytes` |
| Entitlement | the call's timeout | `OUTBOUND_TIMEOUT_MS = 1_500` in `src/billing` (decided here), passed to Polar's SDK in seconds |
| Entitlement (fallback only) | a per user memo | `ENTITLEMENT_MEMO_MS = 10_000` per server instance, keyed by user id, built only if Go live step 3 finds no Vercel rate limit rule |
| Tool | when to ask again | `REFRESH_AFTER_MS = 300_000` in `src/lib/entitlement.ts`, plus visibility and the button (AC-4) |
| Tool | whether a failed age refresh keeps Pro | `KEEP_PAID_MS = 1_800_000` against the time of the page's last `paid` answer, both in `src/lib/entitlement.ts` |
| Tool, header, Pricing | billing on or off | `config.billingEnabled` (AC-23) |
| Tool, plan line and cap copy | free cap | the answer's or the frozen snapshot's `pageCap` |
| Tool, plan line and cap copy | paid figure | `config.maxPages` (spec 0007 INV-3 amended) |
| Tool, plan line and cap copy | which words | the answer's or the snapshot's `account` and `tier`, through `PLAN_TEXT` and `FAILURE_TEXT` |
| Tool, cap callout | the file opened again | the session's `File` handle (spec 0002), kept in `failed` |
| Pricing | caps | `config.freePageCap`, `config.maxPages` |
| Pricing, plan line, account | "Pro", "Free", "$19 a month" | `PRO_PLAN`, `FREE_PLAN` in `src/lib/plans.ts` |
| Pricing | merchant line, subscribe notice, "EdiventStudio" | `LEGAL.merchantLine`, `LEGAL.subscribeNotice`, `LEGAL.sellerName` |
| Pricing | tax line | `LEGAL.taxLine`, worded by task 1's sandbox check: "Tax may be added at checkout, depending on where you live." if Polar adds it, "Prices include any tax that applies." if it does not |
| Account | email | `currentUser()`'s primary email address |
| Account | "Renews on" or "Ends on", the date | `readPlan`'s `renewal`, from the subscription's `cancel_at_period_end` and `current_period_end`, as a British date (`formatPolicyDate`'s format) |
| Account | whether Manage billing shows | `readPlan`'s `hasCustomer` |
| Delete | "set to renew" | any subscription to `POLAR_PRO_PRODUCT_ID` in the customer state with `cancel_at_period_end` false, a payment being retried included |
| Delete | "ends now, not on {date}" | `readPlan`'s `renewal.endsAt` when `renews` is false |
| Subscribe | "payment still settling" | an active subscription to `POLAR_PRO_PRODUCT_ID` while the benefit is not yet granted |
| Subscribe | product, external id, email | `POLAR_PRO_PRODUCT_ID`; the session's `userId` (never a parameter); `currentUser()`'s primary email |
| Subscribe, billing | success, return URLs | `config.siteUrl` plus `WELCOME_PATH`, `PRICING_PATH`, `ACCOUNT_PATH` |
| Subscribe, billing | checkout and portal addresses | Polar's responses (`url`, `customer_portal_url`) |
| Subscribe, billing | the contact in the error line | `LEGAL.contactEmail` |
| Welcome | interval, asks per round | `POLL_MS = 2_000`, `ASKS_PER_ROUND = 15` in the page module (decided here) |
| Sign in, sign up | where Clerk lands | `forceRedirectUrl` = `SUBSCRIBE_PATH` only when `redirect_url` equals it, else the fallback `ACCOUNT_PATH` |
| Header | Pricing and Account links | `PRICING_PATH`, `ACCOUNT_PATH`, labels written in `layout.tsx` and passed to `SiteHeader` |
| Polar product | name, price, tick box label, grace period, one subscription | your sandbox and production setup (task 1, Go live), from this spec |
| Clerk instance | email code only, no bot protection, 30 days | your Clerk setup (task 1, Go live), from this spec |
| Policy | Clerk and Polar facts (location, safeguard, retention, policy link) | `/develop` reads each from the vendor's privacy policy and DPA when writing the entry, and records the date, as spec 0011 did for Vercel |

**Key invariants**:
- **INV-1**: `/tool` never runs, loads or imports anything from Clerk or Polar: no `@clerk/*` or `@polar-sh/*` import reachable from it (lint), no proxy on its path or on `/api/entitlement` (matcher test), and its policy takes nothing from `OUTSIDE_SERVICES` (spec 0011, INV-2).
- **INV-2**: Fail closed, never silently. Every free answer says why (`account`), and only `signed-in` may be paid.
- **INV-3**: Checkout and the billing portal set Polar's external customer id (and checkout's email) on the server from the verified Clerk session (`auth()` and `currentUser()`), never from anything the browser sends: no query parameter, no body field, no header. A checkout or portal request without a valid session redirects to sign in first (and back), and Polar is never called. Held by `tests/unit/billing-subscribe.test.ts`: with a fake session for user A and a request carrying `external_customer_id`, `customer_id` and `customer_email` for user B in its query and body, the fake Polar receives only A's id and A's email; with no session, the response is a redirect to `/sign-in` returning to the same page, and the fake Polar records no call. The same two cases cover `/account/billing`.
- **INV-4**: A visitor with no genuine Clerk token causes no outbound call. A forged or malformed token is refused locally.
- **INV-5**: No store, no cookie of our own, no webhook, no metadata written to Clerk. Polar is the only source of Pro.
- **INV-6**: Pro is holding the RedactNest Pro benefit, never "any active subscription", because the Polar organisation will sell other products.
- **INV-7**: A Vercel production deploy runs only on live Clerk keys and Polar production, and nothing else runs on them (AC-23).
- **INV-8**: Pricing and the legal pages promise only what Pro does today, and take every cap from `config`. The terms state no cap and no price as a number ("the price shown on Pricing when you subscribe").
- **INV-9**: Every word on `/tool` comes from `src/lib/flow-text.ts`, from a kind, the answer or frozen snapshot, and `config`. Every seller and agreement word comes from `src/lib/legal.ts`.
- **INV-10**: Every link to Pricing, an account page, Subscribe or Manage billing is a plain `a`, never `next/link`, so nothing prefetches a page that creates a checkout and `/tool` sends no request but the entitlement (spec 0002, AC-3).
- **INV-11**: "Genuine" means the signature, the issuer and the authorized party are all verified, and `nbf` and `iat` are not in the future. Only the expiry is relaxed, and only up to 30 days from `iat`. A token that fails any check gets the free limit with the "sign in again" plan line (`sign-in-needed`), and there is no Clerk server call on any path. Held by `tests/unit/billing-entitlement.test.ts`, signing tokens with a locally generated key pair: a bad signature, a wrong `iss`, a missing `azp`, a wrong `azp`, an `nbf` or `iat` in the future, and an `iat` 31 days ago, each on a fresh and on an expired token where it applies, all give free `sign-in-needed` with `__client_uat` both positive and absent, and the fake Polar records no call; a genuine expired token issued 29 days ago reaches Polar with its `sub`; and the test's Clerk backend client is a fake that fails the test if it is ever called.
- **INV-12**: The Vercel firewall rate limit rule's action is deny with a 429, never a challenge. A challenge sets Vercel's own cookie and, under spec 0011 INV-9, any firewall challenge mode changes the privacy policy first (claim C6). Held at go live (step 3's check): past the limit from one address, `/api/entitlement` answers 429 with no `Set-Cookie` and no challenge page.

**Security model**: accounts are an email and a session at Clerk; billing is Polar's. Signed in, a person acts on their own account only: every account page and action reads the user from Clerk's session (`auth()` through the proxy), never from a parameter. The tool's check trusts a token only when it is genuine (INV-11), and an expired one only within 30 days of issue. Secrets (`CLERK_SECRET_KEY`, `POLAR_ACCESS_TOKEN`) live in server only modules, are never `NEXT_PUBLIC_`, and are read only in `src/billing/clients.ts`. The entitlement grants nothing a visitor could not already take (spec 0001: the cap lives in code anyone can read and change), so its bar is "an honest visitor always gets the right answer, and nothing leaks", not "nobody can cheat". Card data never touches us: Polar's hosted checkout takes it (PCI DSS is Polar's and its processor's). **Compliance scope**: UK GDPR and EU GDPR for the account email and the sign in records (legal basis: the contract), with Clerk as our processor and Polar as a controller for the sale; consumer law on subscriptions (cancellation, notice of price changes, the right to withdraw), with Polar selling as merchant of record. **Audit**: Polar's and Clerk's records are the audit trail; we keep none (Decision). **Rate limits**: anonymous and forged traffic makes no outbound call (INV-4). A signed in abuser could spend the shared Polar limit (500 a minute) for every EdiventStudio product, so a Vercel firewall rate limit rule (deny with 429, never challenge, INV-12) on `/api/entitlement` and `/account/subscribe` is a required go live step, with the 10 s per user memo as the fallback if Pro offers no such rule.

**Configuration required**:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`: Clerk's publishable key (`pk_test_` for the development instance, `pk_live_` in production). It also names the Clerk domain.
- `CLERK_SECRET_KEY`: server only. Clerk's proxy and `auth()` on the account pages, and deleting a user.
- `CLERK_JWT_KEY`: the instance's public key (PEM), for checking tokens without a network call.
- `POLAR_ACCESS_TOKEN`: server only. An EdiventStudio organisation access token; sandbox and production tokens are separate.
- `POLAR_ENVIRONMENT`: `sandbox` or `production`.
- `POLAR_PRO_PRODUCT_ID`: the RedactNest Pro product, for checkout and the renewal date.
- `POLAR_PRO_BENEFIT_ID`: the RedactNest Pro feature flag benefit, the marker of Pro.
- Prerequisites set by hand: a Clerk development instance and the Polar sandbox objects (task 1); their production twins on go live day. `.env.example` lists all seven, with no values.

**Critical test scenarios**:
- Happy path (sandbox, by hand): free visitor at the cap, Get Pro in a new tab, sign in by code, pay with a test card, back to the tool: Pro on the plan line, the same file opens past the cap, verifies **AC-7**, **AC-8**, **AC-14**, **AC-15**, **AC-16**.
- The decision table (unit, fakes): billing off; no cookies; `__client_uat` only, positive and zero; suffixed and plain cookies both present (suffixed wins); every failing token of INV-11 (no outbound call, asserted on the fakes); a fresh token; an expired token issued 29 and 31 days ago; a customer with the benefit, without it, a 404, and a benefit from another product; Polar answering 401, 429 and 500, throwing, and timing out; never a `Set-Cookie`, verifies **AC-1**, **AC-2**, **INV-4**, **INV-6**.
- Expired means genuine (unit, pinned): with a locally generated key pair, an expired token with a bad signature is reported invalid, not expired, so rule 5 never runs for it; the rest of INV-11's cases as listed there, verifies **AC-2**, **INV-4**, **INV-11**.
- Checkout identity (unit, fakes): INV-3's two cases on `/account/subscribe` and `/account/billing`, verifies **AC-14**, **AC-17**, **INV-3**.
- Firewall action (go live, by hand): INV-12's check, verifies **INV-12**.
- Client narrowing and timing (unit, fake clock): a network error, a timeout, `paid` with `none`, an unknown account value, each read as free `unknown`; a late answer updates the page but not a frozen snapshot; two triggers share one ask; the refresh rules on visibility, age and the button; a failed age refresh within 30 minutes of a paid answer keeps paid, and after 30 minutes gives `unknown`, verifies **AC-3**, **AC-4**.
- Tool states (e2e, `/api/entitlement` stubbed with `page.route`): each account kind's helper and plan line, the new tab links, Try again; the free cap callout per account with no split advice, and "Check my plan and open it again" opening the same file with a stubbed Pro answer and no file chooser; axe on each, verifies **AC-5**, **AC-6**, **AC-7**.
- Walls (unit and e2e): the proxy matcher never matches `/tool`, `/api/entitlement`, `/`, `/pricing`, `/privacy`, `/terms`; lint rejects a Clerk or Polar import in each fenced zone; no request to a Clerk origin from `/`, `/pricing`, `/privacy`, `/terms` or `/tool`; `/tool`'s policy unchanged with Clerk and Polar in the list, verifies **AC-9**, **AC-20**, **AC-21**.
- Cookies (e2e): AC-19's anonymous run and visits leave no cookie and no `Set-Cookie`, verifies **AC-19**.
- Config gate (unit): none set (off, and `billingEnabled` false); a partial set (one error naming each missing value); test and live keys mixed; live keys with `sandbox`; a publishable key whose host is not a Clerk entry origin; a Vercel production build with test keys, or with a host other than `clerk.redactnest.com`; a preview with live keys; a JWT key with `\n` escapes (accepted); a complete off Vercel set, verifies **AC-23**.
- Billing off (component and unit): no plan line, the old helper and cap words with the split advice, no header links, `/pricing` not found, no provider in the account layout, verifies **AC-5**, **AC-6**, **AC-23**.
- Account (unit over fakes, then sandbox by hand): the renewal date or Pro alone; Manage billing to the portal, and a 404 to Pricing; Subscribe refusing on `unknown` and sending a settling payment to welcome; cancel keeps Pro, then a hand revoke drops it on the next answer; delete refused while renewing or retrying, the "ends now" warning, each failure line, then allowed and signed out with the tool answering `none`; sign out gives `none`, verifies **AC-10**, **AC-11**, **AC-12**, **AC-14**, **AC-17**, **AC-18**.
- Pricing and legal (e2e and unit): `/pricing` static with no client component, its lines and links, indexable, axe at 320 pixels and 200%; both legal pages' new headings in order from `policy-sections.ts`, "Terms of service" everywhere, one change entry each, verifies **AC-13**, **AC-22**.

**Policy and terms changes** (written in task 14, every word reviewed by you):

The claims register (spec 0011, AC-7):

| # | Claim | Held by |
|---|---|---|
| C5 (changed) | Apart from loading the page and its own files, the tool page asks our server one question only, which plan applies. The request carries your sign in cookie if you have one, and nothing about your document. To answer it, our server checks your sign in cookie itself and asks Polar whether you hold Pro, sending your account id and nothing else | Spec 0002 AC-3, `privacy.spec.ts`, AC-1, the decision table tests (only the user id reaches the Polar seam) |
| C6 (changed) | No cookies, except on the sign in and account pages, where Clerk sets the strictly necessary cookies that keep you signed in. Nothing else sets a cookie | AC-19, AC-9's matcher test, Launch readiness step 5 (no challenge mode) |
| C7 (changed) | No analytics, advertising, tracking or error reporting. The only script from anyone else is Clerk's, on the sign in and account pages | AC-9, AC-20, AC-21, `csp.test.ts`, `headers.spec.ts` |
| C9 (changed) | Fonts and files come from our own site, so loading a page tells no one else you visited. The sign in and account pages are the exception: they load Clerk's sign in | Spec 0003 AC-20, AC-9's request check |
| C11 (changed) | We do not sell your data, share it for advertising, combine it with anything, or make automated decisions about you | True by absence, held by C6 to C8 |
| C12 (replaced) | Your account holds your email address and nothing else. Clerk keeps it for us until you delete the account, which you can do in Account | Clerk set to email code only (task 1, Go live), AC-11 |
| C13 (new) | Payments go through Polar, our merchant of record. We never see your card. From Polar we learn only whether you hold Pro and when your subscription renews or ends | AC-14, AC-21 (no Polar script or origin), `readPlan`'s unit test (it reads the benefit list and the dates only) |

Privacy policy outline: "Your account" (C12, the cookies of C6, legal basis the contract, kept until deleted, deletion in Account) and "Payments" (C13, Polar as a controller for the sale and its processor for cards, the EdiventStudio name on receipts, tax records Polar keeps by law) join after "Your documents". `OUTSIDE_SERVICES` renders the Clerk and Polar entries in "Services we use" (AC-8 of spec 0011), and "Transfers" and "Your rights" cover them. Who we are adds that RedactNest is sold through EdiventStudio.

Terms outline: "Your account" (one person per account, keep your email secure, delete any time in Account once nothing renews) and "Pro subscriptions" (monthly at the price shown on Pricing when you subscribe; renews until cancelled; cancel any time in Manage billing; Pro lasts to the end of the paid month; no refunds for part months, and your legal rights, any right to withdraw included, stay; a failed renewal keeps Pro while payment is retried, then the free limit applies; Polar is the merchant of record that sells Pro to you, and its buyer terms also apply to the purchase; at least 30 days' notice by email of a price change, from the next renewal) join after "Checking the result is your job". About these terms adds that RedactNest is sold through EdiventStudio. The liability cap's "what you paid us" now has real payments behind it, unchanged in wording.

## Build plan

Ordered by Skateboard: slice 1 is the thinnest whole that takes money (sign in, pay, Pro on the tool). Slice 2 makes Pro impossible to lose in silence, slice 3 lets people manage it, and slice 4 puts the words, the proofs and the measure in place. Nothing goes live before all four (go live is feature 21's).

**Slice 1: the money path**
1. Spike and setup. Your steps first: a Clerk development instance (emailed code only, bot protection off, 30 day sessions) and, in the Polar sandbox under EdiventStudio, the benefit, the product with its required tick box, one subscription per customer and the grace period (*Go live* steps 1 and 2, in sandbox); fill `.env.local`. Then: `pnpm add @clerk/nextjs @polar-sh/sdk` (both MIT across their closure, checked 2026-10-03) and confirm `pnpm dev` passes `sync-legal`. Under `pnpm dev` with sandbox keys, confirm and record in `rationale.md`: Clerk's sign in works under the standard policy with AC-21's sources (any violation handled per *Decided while writing*), and whether its theme takes our CSS variables (AC-8); after sign in with `redirect_url=/account/subscribe`, the page's server redirect reaches Polar's checkout; the suffixed cookie names `getCookieSuffix` gives match the ones Clerk sets, an expired token gives `token-expired` from `verifyToken`, and a real token's `iss` and `azp` equal the expected issuer and the site's origin; the customer state's shape for a subscriber, and where a payment being retried appears in it; what Polar does at checkout when a customer with that email already exists with no external id; whether Polar adds tax on top of $19 (sets `LEGAL.taxLine`). Satisfies **AC-2**, **AC-8**, **AC-13**, **AC-14**, **AC-15**, **AC-21**.
2. `config.billingEnabled` in `src/config/index.ts`; `src/config/billing.ts` and the gate, imported by `src/app/layout.tsx`, with `tests/unit/billing-config.test.ts` (every case in *Critical test scenarios*). `.env.example` gains the seven names; `tests/e2e/build-env.ts` gains the fake complete set. Satisfies **AC-23**.
3. `src/billing` (`clients.ts`, `session.ts`, `plan.ts`, `entitlement.ts`), with `@clerk/shared` added as a direct dependency at the version `@clerk/nextjs` uses, and `tests/unit/billing-entitlement.test.ts` (the decision table, the pinned expiry order and INV-11's cases); `/api/entitlement` calls `resolveEntitlement` and keeps its headers; `tests/unit/entitlement-route.test.ts` updated (no `Set-Cookie`, every account kind). `ENTITLEMENT_ACCOUNTS` and `account` in `src/worker/protocol.ts`. Satisfies **AC-1**, **AC-2**.
4. `imageOrigins`, the Clerk and Polar entries, and `img-src` in `buildPolicies`; `tests/unit/csp.test.ts` and `tests/unit/privacy-config.test.ts` extended (an image origin lands in the standard `img-src` only; the tool policy unchanged). Satisfies **AC-20**, **AC-21**.
5. The `(account)` group: `layout.tsx` rendering `ClerkProvider` (themed, `telemetry={false}`, paths and fallback redirects from `routes.ts`) only when billing is on, else the "not set up on this build" message, and `robots: { index: false }`; the sign in and sign up pages with the `redirect_url` rule and the signed in redirect; a first `/account` (email, plan, Get Pro, Sign out); `/account/subscribe` (with the `unknown` refusal and the settling payment case) and `tests/unit/billing-subscribe.test.ts` (INV-3); `/account/welcome`. `src/proxy.ts` with AC-9's exact matcher, doing nothing when billing is off, and `tests/unit/proxy-matcher.test.ts`. The new paths in `routes.ts`. Satisfies **AC-8**, **AC-9**, **AC-10**, **AC-14**, **AC-16**.
6. Lint: the `redactnest/billing` zone and the bans of AC-20 in every listed zone, built with `zone()`, and `tests/unit/engine-wall.test.ts` cases for each. Satisfies **AC-9**, **AC-20**.
7. `/pricing` (static, `PRO_PLAN`, the legal lines, not found with billing off), the header's Pricing and Account links on every page as plain `a` elements (hidden with billing off), and `src/lib/plans.ts`. `/tool` asks at load and freezes paid caps from a paid answer. Satisfies **AC-13**, **AC-4**, **AC-9**.

**Slice 2: never silently free**
8. `src/lib/entitlement.ts`: ask at load, one ask in flight, the budget on every ask, late answers, the refresh and keep paid rules, `account` narrowing, `FREE_ENTITLEMENT` as `unknown`, with unit tests on a fake clock. Satisfies **AC-3**, **AC-4**.
9. `PLAN_TEXT` and the drop zone helper; the plan line above the drop zone with its new tab links and Try again; the `too-many-pages` words by tier, account and billing off; `FailureCallout`'s actions slot with the link and "Check my plan and open it again" (a fresh ask, then `file-chosen` with the held `File`). Component tests in `tests/component/tool-client.test.tsx`, a changed file's `file-unreadable` included. Satisfies **AC-5**, **AC-6**.
10. `tests/e2e/plan.spec.ts`: every state with `/api/entitlement` stubbed, the cap callout per account, the open again with a stubbed Pro answer and no file chooser, axe on each. Satisfies **AC-5**, **AC-6**, **AC-7**.

**Slice 3: managing it**
11. `/account` in full: "Renews on" or "Ends on", Manage billing, the plan cannot be checked state; `/account/billing`. Satisfies **AC-10**, **AC-17**.
12. `deleteAccount` and its two step confirm (a small client component in the `(account)` group): the "ends now" warning, the renewal and retry refusal, Polar then Clerk, each failure line, then Clerk's `signOut` in the browser to `/`. Unit tests over fakes for each branch. Satisfies **AC-11**, **AC-12**.
13. The sandbox walk by hand, recorded for `/check verify`: the full upgrade path from a capped file, cancel, a hand revoke, delete, sign out. Satisfies **AC-7**, **AC-15**, **AC-16**, **AC-18**.

**Slice 4: the words, the proofs and the measure**
14. Both legal pages per *Policy and terms changes*: the rename everywhere (`LEGAL.termsLabel`, h1, metadata, footer, the tool notice, `policy-sections.ts`), the new sections in `policy-sections.ts` first, the claims, the services rendered. No new change entry. `tests/e2e/legal-pages.spec.ts` and the AC-19 text scan follow the new headings. Satisfies **AC-22**.
15. `tests/e2e/privacy.spec.ts` and `shell.spec.ts`: the cookie check extended to `/pricing`, no request to a Clerk origin from the five public routes, the same origin check on `/pricing`, and `/tool` still asking for the entitlement alone with the header's new links in place. Satisfies **AC-9**, **AC-19**, **AC-20**.
16. The paid cap measure on `tests/fixtures/detect-dense.pdf`, in the `speed` Playwright project, recorded in `rationale.md`, with the default of `NEXT_PUBLIC_MAX_PAGES` lowered 10 pages at a time if the bar fails. Satisfies **AC-24**.
17. Amend, each with an `**Updated**` line naming spec 0012: spec 0001 (auth is Clerk, off `/tool`; the entitlement path built; the honesty based paywall Follow-up met); spec 0002 (asked at load, `account` in the snapshot, the refresh rules; the billing audit trail is the providers'); spec 0003 (its Follow-up on the shared layout met by the `(account)` group; the header's links); spec 0005 (its paid cap measure met, with the numbers); spec 0007 (AC-2's helper, the `too-many-pages` copy and actions, INV-3 allowing `config` caps, the plan line); spec 0009 (the allowlist held for Clerk and Polar, no change); spec 0011 (the claims and outlines as built, the rename, AC-11 for anonymous visitors, AC-13's `img-src`, its Follow-up for feature 10 met). Satisfies **AC-20**, **AC-22**.
18. You read every word of Pricing, Account, the plan line, the cap copy and both legal pages before merge. Satisfies **AC-5**, **AC-6**, **AC-13**, **AC-22**.

## Go live

Your steps, run on go live day as part of feature 21 (Launch readiness), after this feature is merged. Steps 1 and 2 are first done in the sandbox for task 1.
1. Clerk production instance for redactnest.com: the DNS records for `clerk.redactnest.com` and Clerk's email sending, emailed code only, no name fields, bot protection off, session lifetime 30 days, sign in and sign up paths, allowed redirects to redactnest.com only.
2. Polar production, EdiventStudio: the "RedactNest Pro" feature flag benefit; the "RedactNest Pro" product, $19 monthly, with the benefit attached and the required tick box "I agree to RedactNest's Terms of service at redactnest.com/terms"; one subscription per customer; a benefit revocation grace period that covers Polar's payment retries; an organisation access token. Check the checkout shows EdiventStudio and the product name, and that `PRO_PLAN.priceLine` and `LEGAL.taxLine` match it.
3. Vercel: the project on Pro with spec 0011's settings (steps 5 and 6); the seven values for production (live) and for previews (test and sandbox); spend management with an on demand budget you choose and production paused when it is reached; a firewall rate limit rule on `/api/entitlement` and `/account/subscribe` (per IP, for example 60 a minute) whose action is deny with a 429, never a challenge (INV-12). A challenge sets Vercel's own cookie, and spec 0011 INV-9 says turning on any firewall challenge mode changes the privacy policy first, so a challenge here would make claim C6 false. Check it: past the limit from one address, `/api/entitlement` answers 429 with no `Set-Cookie` and no challenge page. If Pro offers no such rule, build the `ENTITLEMENT_MEMO_MS` memo in the route before go live.
4. Set both pages' `First published.` date in `src/lib/policy-changes.ts` to go live day.
5. Deploy, then feature 18's going public steps and the first tagged deploy check.
6. Buy Pro once with a real card: the tool shows Pro, the portal works, then refund it in Polar and see the free limit return.
7. Submit Polar's account review (up to 14 days, before the first payout), now that the site and checkout are live.

## Consequences

**Positive**:
- Billing with no store: nothing to back up, migrate or breach, and "documents are never stored" stays structurally true.
- Pro is always current: a cancel, a refund or a lapse shows on the next answer, with no webhook to miss and no copy to drift. Sandbox testing needs no tunnel.
- `/tool` stays sealed: no Clerk or Polar code, no proxy, no new origin, the same single same origin request.
- A paying user is never quietly capped: every free answer carries its reason and a way forward.
- No new cookie, no outside script and no outside origin on the public pages, so most of the privacy policy's claims hold as they did.

**Negative / tradeoffs**:
- Every signed in check costs one Polar call, about a second at worst. A Polar outage shows Pro users "couldn't check your plan" and the free limit, except for 30 minutes after a confirmed Pro answer on the same page.
- The Polar rate limit (500 a minute) is shared with EdiventStudio's future products; the go live rate limit rule is what stops one abusive signed in account spending it for everyone.
- After a browser restart Clerk's session cookie is gone, so a Pro user going straight to `/tool` must click Sign in again once (the tab then picks it up on return).
- A session revoked from another device, or by you in Clerk's dashboard, keeps Pro in this browser until its cookie goes (at most 30 days), because the tool's check never asks Clerk. Harmless while the cap is honesty based; revisit if Pro ever unlocks something server side.
- The route reads Clerk's cookies itself and relies on `verifyJwt` checking the signature before expiry. A Clerk change to either breaks rule 5 quietly to `sign-in-needed`; the pinned unit test catches the order, the decision table the cookie names.
- The paywall stays unenforceable (spec 0001): the cap lives in public code. Pro sells convenience and support, not a lock.
- Money is taken before the full lawyer review (deferred to 100+ users on a lawyer's advice). The subscriptions terms, refunds and withdrawal rights are drafted, not cleared.
- **Scan memory**: Pro lets a 50 page scan through, and blanking one match on every page of a 50 page grey scan measured 917 MB (scope Deferred). A tab that runs out of memory lands on the existing `lost` callout with nothing half written, so it fails safe, but a Pro user can meet it.
- Account deletion removes the whole Polar customer, which is right while RedactNest is EdiventStudio's only product with accounts, and wrong once one person buys two.
- Clerk's prebuilt components bring Clerk's own markup to the account pages; their accessibility is Clerk's, checked by axe but not ours to fix.

**Neutral**:
- New dependencies `@clerk/nextjs` 7 and `@polar-sh/sdk` 1 (MIT), a new capability folder `src/billing`, a `src/proxy.ts`, an `(account)` route group, seven new configuration values and a billing off mode.
- The terms are renamed "Terms of service". Specs 0001, 0002, 0003, 0005, 0007, 0009 and 0011 are amended (task 17).
- The audit trail for billing and accounts lives in Polar's and Clerk's records, by design.

## Follow-up

- [ ] Before EdiventStudio sells a second product with accounts, decide customer identity across products: one Polar customer per email per organisation, one external id each, and account deletion removing the whole customer.
- [ ] Optional: Clerk testing tokens (the `clerk-testing` skill) to run the sign in path in CI against a development instance, if the hand walk in task 13 proves fragile.
- [ ] Feature 11 (telemetry and error monitoring): an upgrade event is a count, never an email or an id; error reporting stays off `/tool` and never captures the billing seams' arguments.
- [ ] Feature 16 (security page) explains the plan check (C5) and why the cap is honesty based. Feature 17 (DPA) lists Clerk as a processor and Polar as a controller for the sale.
- [ ] The scan memory limit (scope Deferred) gains urgency now that Pro opens 50 page scans; decide it before raising the cap above 50.
- [ ] `/sync`: add to root `AGENTS.md`: `src/billing` is server only and the only home of `@clerk/backend` and `@polar-sh/sdk`; `@clerk/nextjs` lives only in the `(account)` group and `src/proxy.ts`, whose matcher never covers `/tool` or `/api/entitlement`; Pro is the RedactNest Pro benefit, asked of Polar live, never a store or a webhook; billing is all or nothing, and off means no keys; plan words live in `PLAN_TEXT` in `src/lib/flow-text.ts`; `polar-integration`'s recipes predate `@polar-sh/sdk` 1.x, so follow the SDK's dated module. Consider a nested `src/billing/AGENTS.md` for the decision table and the expiry order trap.

## Rationale

Reasoning, the options weighed, today's research and references: see [rationale.md](rationale.md).
