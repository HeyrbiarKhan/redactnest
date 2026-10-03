# 0012. Billing and the paid plan: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file, apart from the spike and measure results tasks 1 and 16 record at the end.

## Context

Scope feature 10 is the paywall: a visitor at the page cap signs in, subscribes at about $19 a month, and the cap is gone, with no usage counter and no user table of our own. Spec 0001 fixed the shape it must fit: `/tool` loads no third party script, keeps `connect-src 'self'`, and learns the plan from one same origin `GET /api/entitlement` that fails closed to free. AGENTS.md adds that account and subscription data live in Clerk and Polar, and that nothing is stored by us.

Three forces make that harder than it looks:
- **Clerk's session token lives 60 seconds** and is refreshed by Clerk's script in the browser. `/tool` runs no Clerk script, and Clerk refreshes a token on the server only for a page load (a request with `Sec-Fetch-Dest: document`), never for a `fetch`. Read naively, almost every paid visitor's entitlement request carries an expired token and comes back "signed out", which would cap a paying user at 3 pages with no explanation. The `__session` cookie is also a browser session cookie, gone after a restart.
- **No store** means the answer to "is this person on Pro" must come from Clerk or Polar each time, or be carried in something the browser holds.
- **The Polar organisation is EdiventStudio**, which will sell other products, so "has an active subscription" is not the same as "has RedactNest Pro", and the API rate limit is shared.

Compliance scope: UK GDPR and EU GDPR now reach an account email and sign in records (Clerk as our processor), and the sale is a consumer subscription sold by Polar as merchant of record (Polar is the seller of record and handles tax; its privacy policy and DPA make it our processor, keeping tax and fraud records under its own policy; card data never reaches us, so PCI DSS is Polar's and its processor's). The first draft called Polar a controller for the sale; that was corrected after the sandbox walk (below). The full lawyer review is deferred to 100+ users on a tech lawyer's advice (2026-10-03), so the subscriptions terms ship drafted, not cleared.

## Options considered

### Option 1: Polar asked live, Clerk kept off `/tool`, an expired sign in trusted on its signature (chosen)

`/api/entitlement` reads Clerk's cookies itself. A token whose signature verifies is trusted, and an expired one too for 7 days after it was issued, with no call to Clerk. Then Polar's customer state says whether the user holds the Pro benefit. The proxy runs on the account pages only.

**Pros**: no store, no webhook, no cookie of our own; always current on billing; `/tool`'s check never touches Clerk, and its load path never does either; a forged token is refused locally; works however long the tab has been open.
**Cons**: one outbound call per check; a session revoked elsewhere keeps Pro in this browser until its cookie goes; depends on `verifyJwt` checking the signature before expiry (true in `@clerk/backend` 3.x, pinned by a test); a browser restart needs one Sign in again click.

### Option 2: Polar webhooks into Clerk metadata

A signed `POST` webhook from Polar writes the plan onto the Clerk user's metadata; the check reads it (from the session token's claims, or Clerk's API). This is the shape Polar's own setup prompt and the `polar-integration` skill lead with.

**Pros**: no Polar call per check; survives a Polar outage; the usual pattern for apps with a store.
**Cons**: Clerk metadata becomes a synced copy, which is a store by another name, and drifts when a delivery is missed or arrives out of order; a webhook route, a signing secret and idempotent handlers to build; local sandbox tests need a tunnel; and it does nothing for the expired token problem, which still needs Option 1's expired token rule.

### Option 3: Our own signed entitlement cookie

A route on the account pages, where Clerk runs, checks the plan and sets an HMAC signed, short lived cookie (`tier`, `exp`, the user id) that `/api/entitlement` verifies with no outbound call.

**Pros**: the tool's check is local and instant; no Clerk or Polar outage reaches `/tool`.
**Cons**: a cookie and a secret of our own (claim C6 grows); the answer is stale for the cookie's life, so a sign out in another tab or a cancel does not show until it expires; minting it on time needs code on every account page; it reinvents a session beside Clerk's.

### Option 4: Clerk's handshake on `/tool` page loads

The proxy runs on `/tool` document requests, so Clerk's handshake (a redirect through `clerk.redactnest.com`) refreshes the cookie before the page arrives, and the route uses Clerk's standard `auth()`.

**Pros**: Clerk's documented flow, with no reading of Clerk's cookies by hand; no extra click after a restart.
**Cons**: the page that holds documents now loads through Clerk's domain for every signed in visitor whose token has expired, which is most of them; claim C5 needs a caveat; the token is past its 60 seconds by the time a file is chosen, so a later check needs Option 1's expired token rule anyway.

Also weighed and set aside: the `@polar-sh/nextjs` adapter (its handlers take customer ids from query parameters, while every id here must come from the verified session, and it adds a package for two short pages); Polar license keys with no accounts at all (no Clerk, but a key to paste on every visit with nowhere to keep it, since browser storage is banned); Polar's embedded checkout (a Polar script and frame on Pricing).

## Rationale

Option 1, because the force that decides this feature is the expired token on `/tool`, and only Option 1 answers it without bringing Clerk to the page that holds documents. Options 2 and 4 both still need Option 1's expired token rule for the moment a file is chosen, minutes after the last token refresh, so they are Option 1 plus extra machinery. Option 3 answers it, but by adding a cookie, a secret and a second session, and it trades freshness for speed on a check that runs a few times per visit.

Asking Polar live costs a call per check, at a scale (under 100 users at first, a few checks per visit) far inside Polar's 500 a minute, and buys the one property a paid plan with no store most needs: nothing to fall out of step. You weighed Polar's webhook recommendation against "no database" and chose live. The webhook pattern earns its keep where there is a database to keep in step, and here there is none.

The bar for the entitlement is set by spec 0001: the cap lives in public client code, so the paywall is honesty based and the check cannot be a lock. That frees the design from defending the cap and points it at the failure that would really hurt, a paying user quietly capped. Hence every free answer carries a reason (`account`), the tool says it out loud, a forged token costs nothing because the signature is checked before any call, and a genuine expired token is trusted without asking Clerk, because a Clerk lookup would only add an outage path to every Pro check for a guarantee the cap cannot use.

### Cross check (2026-10-03)

An independent read only pass (a different model) found the core sound and raised gaps, all applied on your pick:
- **Changed from the first draft**: the expired token rule no longer asks Clerk `sessions.getSession` (one call, one outage path and one undocumented status string fewer); a Pro answer confirmed in the last 30 minutes survives a failed age refresh; the firewall rate limit became a required go live step, with a per user memo as the fallback.
- **Your additions after the cross check**: INV-3 (checkout and portal identity from the session only, with its test), INV-11 ("genuine" means signature, issuer and authorized party all verified, only the expiry relaxed, and a failing token always gets "sign in again"; `verifyToken` itself checks no issuer and accepts a missing `azp`, so the route checks both; corrected after task 1: `@clerk/backend` 3.22 refuses a missing `azp` itself, and the route keeps its check as a second guard), and INV-12 (the firewall rule denies with 429, never a challenge, per spec 0011 INV-9).
- **Settled**: the billing off mode and `config.billingEnabled`, with CI building on a fake complete set; Polar's error statuses; the cookie helper; the ask's concurrency, budget and late answers; "open it again" as `file-chosen` on the held `File`; the sign in redirect rule; plan display without an active subscription; the delete flow's confirm, refusals, failure lines and browser sign out; Subscribe refusing on `unknown`; the welcome page's polling; one call for the portal; the exact proxy matcher, noindex and plain links; the gate's consistency, host and PEM rules; AC-21's spike exception; claim C6's wording; the measure's step and machine.

### After the sandbox walk (2026-10-03)

Slice 1 was built, and your walk through the Polar sandbox found two faults; `/develop` sent back six more points. You asked for all eight to be settled together and nothing else.

**1. A payment that the plan check could not find.** A sandbox customer already held your email with no external id (task 1's spike made it). You signed up and paid: the subscription went active and the benefit was granted, but Polar put the order on that older customer and left its external id empty, although the checkout carried `external_customer_id`. The plan check looks customers up by external id, so it never found you, and Welcome sat on "still being confirmed". In production, anyone whose email already belonged to an EdiventStudio customer would pay and stay on the free plan. Polar's own docs describe `external_customer_id` as matching an existing customer by that id and otherwise creating one with it set; what the walk shows is that when no customer has the id but one has the email, the email wins and the id is dropped. The installed SDK's types add the two facts the fix rests on: a customer's email is unique within the organisation, and its external id can be set once and never changed.

Options weighed:
- **Tie or create before checkout, bind the checkout by `customer_id` (chosen).** The customer always carries the account's id before any money moves, so there is one path and nothing to repair after payment. Tying an untied customer found by email is safe because Clerk has proved the person owns that email with an emailed code, which is also how Polar's own portal signs people in. Once tied, the customer's state is read again, so a person who already paid (your stuck sandbox customer, or anyone caught before this fix) goes to "You're already on Pro." and is never charged twice. Cons: a Polar customer record for anyone who leaves checkout; up to four Polar calls on Subscribe; an email tied to another id needs you by hand.
- **Tie only, let checkout create new customers.** No record for people who leave checkout. But a buyer who edits the email in Polar's form to one an untied customer holds would hit the same fault again.
- **Repair after payment on Welcome.** Leaves checkout alone, but fixes the fault only after money has moved, needs the checkout id from the address, and must refuse to tie a customer whose email differs from the verified one, so some payments would still be stranded.

Because tying can bring in a customer who existed before RedactNest, AC-11 now also refuses deletion while another product's subscription is active: deleting the Polar customer would end it.

**2. Polar's role in law.** Polar's privacy policy says it is a processor for what it handles to provide its services, its DPA names the merchant the controller and Polar the processor, and its buyer terms make it "merchant of record and authorized reseller". The first draft called Polar a controller for the sale, the way Paddle describes itself. Chosen: our processor, as Polar's documents say, with its fraud, security and tax record work described as its own use under its own policy, the pattern spec 0011 uses for Vercel's `ownUse`. Runners up: keep "controller" (no document of Polar's backs it, and spec 0011 takes vendor facts from the vendor); name no role (GDPR expects the policy to say who processes data and in what role). Whether that own use makes Polar a controller in law goes to the deferred lawyer review.

**3. Clerk's cookies.** Task 1 found five names on the site, not two (`__session`, `__client_uat`, `__refresh_<suffix>`, `clerk_active_context`, and `__clerk_db_jwt` on development instances), each possibly suffixed. C6 now speaks of Clerk's sign in cookies by owner and purpose, with a link to Clerk's cookie page, so a renamed cookie in a later Clerk does not make the claim false.

**4. Previews.** The token check accepts one site address (`azp`), and every preview has another, so a signed in visitor there always saw "sign in again". Chosen: billing off on every Vercel build that is not production, enforced by the gate. Runners up: the deployment's own address on previews (two addresses per preview, Clerk's allowed origins, more gate rules, for checks a local sandbox run already gives); leave it and document it (a preview that looks broken). There is no Vercel project until go live, so nothing is lost today.

**5. A missing `azp`.** Task 1 found that `verifyToken` in `@clerk/backend` 3.22 refuses a token with no `azp` whenever `authorizedParties` is set. The wording was corrected; the route's own check stays as a second guard, and the outcome is unchanged.

**6. Sign out.** Clerk's `SignOutButton` lands on `/` with a client side navigation, so Clerk's script kept running on the home page, against C7 and C9. The app router's `ClerkProvider` sets its own `routerPush` and `routerReplace` after the props it is given (read in the installed `@clerk/nextjs` 7.9.10), so Clerk's navigation cannot be made a full load from outside. Chosen: our own control calls `signOut` with a callback, which stops Clerk navigating (the `SignOut` type in `@clerk/shared` 4.38 takes one), then `window.location.assign("/")`. INV-13 states the rule for every way out of the account group.

**7. The Subscribe destination lost on the switch.** Reading `RedirectUrls` in the installed `@clerk/shared` points to the cause (read from the code, not yet watched in a browser; task 7b confirms it): Clerk turns every redirect URL into an absolute one on the page's origin before carrying it across, so the sign up page most likely received `redirect_url=http://localhost:3000/account/subscribe`, which the exact match on `/account/subscribe` rejected, and the forced Account landing won. The landing now accepts the path or an absolute URL on the site's own origin. The same code shows Clerk ranking a `*_force_redirect_url` or `*_fallback_redirect_url` in the address above the page's forced value, so a crafted link could land a new sign in on any page of the site by a client side navigation. The tool's load guard already reloads `/tool` reached that way (spec 0003, AC-21), but elsewhere Clerk would keep running, so the pages now refuse those parameters with a clean redirect. This goes past the eight points, and is included because recording "both pages force the landing" (point 8) would otherwise be untrue.

**8. Small choices recorded.** Both pages always force the landing; the account redirects are 307s from `redirect()`; the header's words live in `src/app/site-nav.tsx`; the tick box label is a markdown link; the product description's page figure is checked against `config.maxPages` by hand at go live; `CLERK_TELEMETRY_DISABLED=1` for development and the e2e build; Get Pro on Account goes to Pricing first.

**Cross check of this update.** A read only pass on a different model (Sonnet) confirmed in the SDK types that `customer_id` binds a checkout apart from `external_customer_id` and `customer_email`, so the fix closes the fault, and raised twelve points, all applied on your pick:
- Tying: soft deleted customers ignored, untied defined as a null, missing or empty id, several live matches treated as a conflict, the email lowercased, and one more list after a 422.
- A customer who already subscribes to another EdiventStudio product gets a line of their own instead of a checkout that always fails, since the one subscription rule covers the whole organisation.
- `planFromState` avoids a fifth Polar call.
- The landing function's shape is stated, and the clean redirect keeps Clerk's own parameters.
- Sign out after deletion ignores a failure.
- Re-signup after deletion is checked in the sandbox.
- C13 says the email is sent when you start to subscribe.
- Small notes on AC-23 and the Preview environment.

Its suggestion to search customers by a free text query when the email filter misses was not taken, because it would read other people's records.

## Research findings

A web pass on 2026-10-03 (full notes in `docs/.agent-cache/research/billing-clerk.md` and `billing-polar.md`), plus a scratch install of the packages, read directly.

**Clerk** (`@clerk/nextjs` 7.9.10, `@clerk/backend` 3.22.0):
- The session token lives 60 seconds by default, with claims `sid`, `sub`, `exp`, `azp`, `iss`. `__session` is a browser session cookie on the app's domain; `__client` lives on the Clerk domain. High confidence (Clerk docs).
- The handshake runs only for `GET` requests with `Sec-Fetch-Dest: document` or `iframe` (or an `Accept: text/html` with no `Sec-Fetch-Dest`). For anything else an expired token returns signed out with `session-token-expired` (`isRequestEligibleForHandshake` and `handleMaybeHandshakeStatus` in the installed `@clerk/backend`). A server side refresh exists only when a `__refresh` cookie is present, which this design does not rely on.
- `verifyJwt` checks the header, then the signature, then `sub`, `aud`, `azp`, `exp`, `nbf`, `iat`, in that order (installed source). So an expired verdict means the signature and the authorized party were good.
- Clerk 7 supports Next.js 16 and `proxy.ts`. Its browser scripts (`clerk-js`, `@clerk/ui`) load from the Frontend API host the publishable key names. Its documented CSP: the Frontend API host in `script-src` and `connect-src`, `img.clerk.com` in `img-src`, and Cloudflare and `*.protect.clerk.com` only for bot protection (off here). Telemetry turns off by the `telemetry` prop or `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED`; keyless mode by `NEXT_PUBLIC_CLERK_KEYLESS_DISABLED`.
- `@clerk/shared/keys` exports `getCookieSuffix`, `getSuffixedCookieName` and `parsePublishableKey` (installed types).
- Not found: session statuses and backend rate limits in the docs (the SDK types `status` as a string, one reason the tool's check does not ask for it), Clerk's data location and transfer safeguard (`/develop` reads them from Clerk's DPA when writing the services entry). The session lifetime is fixed at 7 days on Clerk's free plan (https://clerk.com/docs/guides/secure/session-options).

**Polar** (`@polar-sh/sdk` 1.0.2):
- The SDK is versioned by API date: `createPolar` from `@polar-sh/sdk/2026-10`, `environment: "sandbox"`, timeouts in seconds, snake_case fields. `customers.getStateExternal(externalId)` returns `active_subscriptions` (trialing included) and `granted_benefits`; benefit types include `feature_flag`. High confidence (SDK types and Polar docs).
- Rate limits: 500 requests a minute in production, 100 in the sandbox. Checkout sessions take `external_customer_id`, `customer_email`, `success_url`; organisation settings include `allow_multiple_subscriptions` and `benefit_revocation_grace_period`; custom fields include a required checkbox; `customers.deleteExternal` takes `anonymize`. Fees from 5% plus $0.50 (Starter).
- Not found: whether prices are tax inclusive, what the card statement shows, Polar's legal entity and data location, and the account review's content. Task 1 settles tax in the sandbox; the services entry's facts come from Polar's own policy at write time.

**Licences**: the whole closure of `@clerk/nextjs` and `@polar-sh/sdk` (with `next` 16.3.5 and React 19.2.8) is MIT, ISC, BSD, Apache 2.0, 0BSD, Unlicense or CC BY 4.0, all in `LICENCE_ALLOWLIST`; the one `AND` expression is `sharp`'s, already shipped. `sync-legal` will not stop the build.

## References

**Project sources**:
- `AGENTS.md`: the non negotiables (no document leaves the browser, no store, no browser storage, `/tool` loads no third party script), the engine and detector walls as the model for the billing zone, `OUTSIDE_SERVICES` as the one list of outside origins, the console ban
- Spec 0001: the entitlement path, the two policy regimes, the honesty based paywall
- Spec 0002: the frozen snapshot (INV-5), the `File` handle kept in `failed`, the 4 s wait, the only request `/tool` makes (AC-3)
- Spec 0003: the load guard (AC-21) and its Follow-up on providers in the shared layout
- Spec 0005: the paid cap measure still owed
- Spec 0007: the failure words (INV-3), the drop zone helper, the `too-many-pages` copy
- Spec 0009: the licence allowlist
- Spec 0011: the claims register, `OUTSIDE_SERVICES`, `buildPolicies`, the launch gate as the model for the billing gate
- Installed skills: `clerk-setup`, `clerk-nextjs-patterns`, `polar-integration`, `polar-testing`, `next-best-practices`

**Practices & standards**:
- Fail closed, and fail loud for the paying user
- Verify a token's signature before trusting any claim, and before any outbound call
- One source of truth over a synced copy (no webhook into a second store)
- Entitlement by benefit, not by product, so pricing can change without code
- GDPR Article 6(1)(b) (contract) for the account; consumer rules on subscriptions (cancellation, notice of price changes, the right to withdraw)

**Links** (web verified on 2026-10-03):
- Clerk cookies: https://clerk.com/docs/guides/how-clerk-works/cookies
- Clerk session tokens: https://clerk.com/docs/guides/sessions/session-tokens
- Clerk `clerkMiddleware()`: https://clerk.com/docs/reference/nextjs/clerk-middleware
- Clerk CSP headers: https://clerk.com/docs/guides/secure/best-practices/csp-headers
- Polar customer state by external id: https://polar.sh/docs/api-reference/customers/state-external
- Polar feature flag benefits: https://polar.sh/docs/features/benefits/feature-flags
- Polar create checkout session: https://polar.sh/docs/api-reference/checkouts/create-session
- Polar customer portal: https://polar.sh/docs/features/customer-portal
- Polar custom fields: https://polar.sh/docs/features/custom-fields
- Polar merchant of record: https://polar.sh/docs/merchant-of-record/introduction
- Polar fees: https://polar.sh/docs/merchant-of-record/fees
- Polar sandbox: https://polar.sh/docs/integrate/sandbox
- `@polar-sh/sdk` on npm: https://www.npmjs.com/package/@polar-sh/sdk
- Vercel spend management: none verified, cited by name

## Spike and measure results

_Filled in by `/develop`: task 1's spike findings and task 16's paid cap measure._

### Task 1 spike (3 October 2026)

Run under `pnpm dev` against the Clerk development instance and the Polar sandbox, with `@clerk/nextjs` 7.9.10 (which resolves `@clerk/backend` 3.22.0 and `@clerk/shared` 4.38.0, and loads clerk-js 6.36.0 and `@clerk/ui` 1.38.0) and `@polar-sh/sdk` 1.0.2 through its `2026-10` module.

**Install.** Both packages are pinned exactly, as `next`, `react` and `mupdf` are, because the plan check relies on Clerk's check order. `@clerk/shared`, `@clerk/backend` and `server-only` are direct dependencies at the versions `@clerk/nextjs` resolves, since pnpm is strict and `src/billing` imports all three. `pnpm dev` passes `sync-legal` with them.

**Sign in under the standard policy.** Clerk's script and calls come from the development host under `*.clerk.accounts.dev` (the clerk-js and `@clerk/ui` bundles, `/v1/environment`, `/v1/client`). Sign up and sign in by emailed code both work. One violation shows: clerk-js tries to start a timer worker from a `blob:` address, which `worker-src 'self'` blocks. It breaks nothing: on `/account` the session token was refreshed 88 seconds later without it. So it stays blocked and the policy gains no source.

**Theme.** Clerk takes CSS variables in `appearance.variables`: the primary button computes to the accent (`rgb(31, 122, 122)`) with white text, all text is Inter, and body text is `ink`. Clerk's footer link ("Sign up") was told apart by colour alone, so `appearance.elements` underlines it (spec 0003, INV-8).

**Landing after sign in.** Sign up with `redirect_url=/account/subscribe` went on to Polar's sandbox checkout, with the signed in email filled in. Sign in with `redirect_url=/tool` landed on `/account`. Both pages pass `forceRedirectUrl` every time (Subscribe or Account), because Clerk follows a `redirect_url` in the address over its fallback, and only the forced value outranks it.

**Cookies.** Clerk set these on the site: `__session` and `__client_uat`, each both plain and suffixed with `_Yx6ZP9zS`, which is exactly what `getCookieSuffix` gives for the publishable key (the plain and suffixed session cookies hold the same token); `__clerk_db_jwt`, plain and suffixed, which development instances use in place of the `__client` cookie; `clerk_active_context`, a session cookie; and `__refresh_<suffix>`, HttpOnly, after a handshake. The spec's data model names only `__session` and `__client_uat`, so the cookie words of claim C6 (task 14) should be written to cover the rest.

**The token.** It lives 60 seconds, its `nbf` sits 10 seconds before `iat`, and it carries `azp`, `exp`, `fva`, `iat`, `iss`, `nbf`, `sid`, `sts`, `sub` and `v`. Its `iss` equals `https://` plus the Frontend API host parsed from the publishable key, and its `azp` equals the site's origin. Once 60 seconds had passed, `verifyToken` reported the real token as `token-expired`, and `/api/entitlement` on `/tool` (no Clerk script) still answered `signed-in` from it, with no `Set-Cookie`.

**`verifyToken` and a missing `azp`.** In `@clerk/backend` 3.22, `verifyToken` refuses a token with no `azp` whenever `authorizedParties` is set (`assertAuthorizedPartiesClaim` checks `!azp`), and it does so before the expiry. *Decided while writing* says it lets such a token through, which is out of date for this version. The route's own presence check stays as a second guard, so the outcome is unchanged.

**The site address.** The route checks `azp` against `config.siteUrl`, so billing works only where `NEXT_PUBLIC_SITE_URL` equals the address the site is opened at. With `.env.local` naming another host, every real token answered `sign-in-needed` and checkout's `success_url` pointed at that host. Locally that means `NEXT_PUBLIC_SITE_URL=http://localhost:3000`. On Vercel, a preview whose address differs from `NEXT_PUBLIC_SITE_URL` would show every signed in visitor "sign in again", which go live should settle.

**Sign out.** Clerk's sign out ends the session and lands on `/` with a client side navigation, so its script stays in memory until the next page load. The next answer is `none`, and every way into `/tool` is a real page load, so the tool's policy is untouched.

**Clerk's server telemetry.** Clerk's proxy prints that it collects telemetry on development instances. `telemetry={false}` on the provider covers the browser only; the server reads just the `CLERK_TELEMETRY_DISABLED` and `NEXT_PUBLIC_CLERK_TELEMETRY_DISABLED` variables. Its collector switches itself off for production instances, so a live deploy sends none.

**Polar's product.** "RedactNest Pro", $19 a month in US dollars, with the "RedactNest Pro" feature flag benefit attached and a required "Terms" tick box. The tick box label is a link, "I agree to RedactNest's [Terms of service](https://redactnest.com/terms)" (with three leading spaces), and renders as "I agree to RedactNest's Terms of service" linking to the terms, under EdiventStudio. The product description says "up to 50 pages", a cap written outside `config`, so it changes by hand if task 16 lowers the cap. The organisation settings (one subscription per customer, the grace period) could not be read back: the access token has no organisation read scope, which is the least privilege it should have, so those rest on the setup steps.

**No customer.** `customers.getStateExternal` for an unknown external id throws `ResourceNotFound` with `statusCode` 404.

**Tax.** Polar's tax depends on the buyer's country. With a billing address in the United Kingdom it is taken out of the $19 ($3.17, the total stays $19), in Germany likewise ($3.03), in Pakistan it is nothing, and in Texas it is added on top ($1.22, a total of $20.22). Polar adds tax in some places, so `LEGAL.taxLine` is "Tax may be added at checkout, depending on where you live."

**Emails Polar refuses.** Polar rejects a `customer_email` whose domain accepts no mail (`example.com`) with a 422, so the spike used addresses at redactnest.com.

**An email that already belongs to a customer with no external id.** Creating the checkout succeeds, and it is not linked to that customer at creation. What Polar does once it is paid is still open (below).

**Polar's role in law.** Polar's privacy policy says "Under the GDPR, we are designated as a Processor with respect to information collected or processed to provide the Services", its DPA names the merchant the controller and Polar the processor, and its buyer terms make Polar "merchant of record and authorized reseller". None of them calls Polar a controller for the sale, as *Policy and terms changes* assumes, so task 14's wording needs settling first. The Polar entry in `OUTSIDE_SERVICES` states only what those documents say.

**Paying in the sandbox.** Stripe's card form runs an invisible hCaptcha that holds an automated browser, so sandbox payments are made by hand.

**Still open.** Two checks need a completed sandbox payment, made by hand: the customer state's shape for a subscriber and where a payment being retried appears in it, and what Polar does on payment when the email already belongs to a customer with no external id. (Your walk answered the second: the order lands on that customer and the external id is dropped. See *After the sandbox walk*.)

### Slice 1 walk and slice 1b (3 October 2026)

**Your walk, for task 1's records.** You signed up as `walk-one+clerk_test@redactnest.com` and paid with Stripe's 4242 test card. The subscription went Active and the RedactNest Pro benefit was Granted, but Polar put the payment on the existing customer with the same email and left its External ID empty, so `/account/welcome` stayed on "still being confirmed". That answers task 1's open check: when a customer with that email already exists with no external id, the order lands on it and the checkout's external id is dropped (*After the sandbox walk*, point 1). The customer's billing country shows Pakistan, where Polar adds no tax (task 1's tax check). Switching from Sign in to "Sign up" lost the Subscribe destination and landed on `/account`, while Get Pro, then Pricing, then Subscribe reached checkout. The `walk-one` customer is left exactly as it is, so opening Subscribe once can show it tied.

**Polar's email search and the rules tying rests on (task 7a).** Checked against the sandbox with a scratch script and one throwaway customer, deleted afterwards:
- `customers.list({ email })` ignores case. A customer made as `CaseCheck-7a@RedactNest.com` is found by the lowercase, mixed case and upper case forms. Polar keeps the local part as written and lowercases the domain (`CaseCheck-7a@redactnest.com`).
- Its uniqueness ignores case too: creating `casecheck-7a@redactnest.com` beside it is refused with a 422 ("A customer with this email address already exists."). So AC-25 holds as written.
- An external id is set once: a second `customers.update` with another id is refused with a 422 ("Customer external ID cannot be updated.").
- A deleted customer (a plain `customers.delete`, no `anonymize`) drops out of the email search, its external id answers 404, and a new customer can then be created with the same email and the same external id. Task 12's re-signup check, which deletes with `anonymize`, can lean on this.

**The token's scopes.** The sandbox token reads and writes customers (the search, a create, an update and a delete above) and writes checkouts (slice 1). In Polar's names, from the SDK's own notes: `customers:read`, `customers:write` and `checkouts:write`. The portal (task 11) needs the customer sessions write scope, which the SDK's types do not name, so task 11 records its exact name when it first runs. The token has no organisation read scope (task 1), as least privilege wants.

**The switch between sign in and sign up (task 7b), watched in a browser.** Clerk's "Sign up" link on the sign in card carries the destination in the fragment, not the query: `/sign-up#/?redirect_url=http%3A%2F%2Flocalhost%3A3000%2Faccount%2Fsubscribe`, absolute on the page's origin. A server never sees a fragment, so the first render of sign up has no `redirect_url` and lands on Account. Clerk's router then moves it into the query, and Next.js asks the server again for `/sign-up?redirect_url=http%3A%2F%2Flocalhost%3A3000%2Faccount%2Fsubscribe`. Slice 1 read that absolute form as Account, which is what lost the destination; the landing now reads it as Subscribe, and that second render's forced landing is the one Clerk uses. With 7b in place, a new account (`walk-1b+clerk_test@redactnest.com`) went Subscribe, Sign in, Sign up, the emailed code, then straight to Polar's checkout, and its Polar customer was created with the Clerk user id as its external id. Opening `/sign-in/factor-one?sign_in_force_redirect_url=/pricing&redirect_url=<Subscribe, absolute>&keep=1` signed out was redirected to `/sign-in/factor-one?keep=1&redirect_url=%2Faccount%2Fsubscribe` before Clerk showed.

**A checkout bound by `customer_id`.** Polar's form shows the bound customer's email in a disabled field, so the buyer cannot change it, and the order can only land on the tied customer (7a's last question).

**Sign out (task 7c).** From Account, signed in as `spike-one+clerk_test@redactnest.com`: after Sign out, `/`'s navigation entry is `http://localhost:3000/` with type `navigate`, no resource from a Clerk origin loaded, `window.Clerk` is undefined, both `__client_uat` cookies are `0`, and `/api/entitlement` answers free, `none`, with no `Set-Cookie`.

**Your stuck customer, repaired (task 7a, by hand).** Signed in as `walk-one+clerk_test@redactnest.com`, opening Subscribe once landed on `/account` with "You're already on Pro." and Plan Pro, and no checkout started. Polar's `walk-one` customer now shows the Clerk user id as its External ID. `/tool` then opened `tests/fixtures/detect-dense.pdf` (50 pages) past the free cap, so the plan check finds the tied customer's benefit and the tool freezes the paid cap. The drop zone still read "Up to 3 pages for now" with no plan line, which is slice 2's job (AC-5). With the first walk's payment, this closes slice 1's loop: sign in, pay, Pro on the tool.

**A subscriber's customer state (task 1's open check).** Read from the sandbox for the same customer, ids masked. `granted_benefits` holds one `feature_flag` grant whose `benefit_id` is `POLAR_PRO_BENEFIT_ID`. `active_subscriptions` holds one subscription to `POLAR_PRO_PRODUCT_ID`, with `status` `active`, `cancel_at_period_end` false and `current_period_end` as an ISO string with microseconds (`2026-11-03T14:26:19.781686Z`), the form task 11's renewal date has to read. These are exactly the fields `planFromState` reads. Where a payment being retried appears is still open, for task 12 or task 13's walk.

**Still to do by hand.** The "email Polar already knows" scenario through to a fresh payment: an untied customer with no Pro, then sign up, Subscribe and pay through the bound checkout, until Welcome shows "You're on Pro". It moves to task 13's walk, and slice 1b's verify step for it stays open for `/check verify`.
