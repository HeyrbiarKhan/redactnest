# 0012. Billing and the paid plan: rationale

The decision record behind [index.md](index.md). `/develop` does not need this file, apart from the spike and measure results tasks 1 and 16 record at the end.

## Context

Scope feature 10 is the paywall: a visitor at the page cap signs in, subscribes at about $19 a month, and the cap is gone, with no usage counter and no user table of our own. Spec 0001 fixed the shape it must fit: `/tool` loads no third party script, keeps `connect-src 'self'`, and learns the plan from one same origin `GET /api/entitlement` that fails closed to free. AGENTS.md adds that account and subscription data live in Clerk and Polar, and that nothing is stored by us.

Three forces make that harder than it looks:
- **Clerk's session token lives 60 seconds** and is refreshed by Clerk's script in the browser. `/tool` runs no Clerk script, and Clerk refreshes a token on the server only for a page load (a request with `Sec-Fetch-Dest: document`), never for a `fetch`. Read naively, almost every paid visitor's entitlement request carries an expired token and comes back "signed out", which would cap a paying user at 3 pages with no explanation. The `__session` cookie is also a browser session cookie, gone after a restart.
- **No store** means the answer to "is this person on Pro" must come from Clerk or Polar each time, or be carried in something the browser holds.
- **The Polar organisation is EdiventStudio**, which will sell other products, so "has an active subscription" is not the same as "has RedactNest Pro", and the API rate limit is shared.

Compliance scope: UK GDPR and EU GDPR now reach an account email and sign in records (Clerk as our processor), and the sale is a consumer subscription sold by Polar as merchant of record (Polar is the seller of record, handles tax, and is a controller for the sale; card data never reaches us, so PCI DSS is Polar's and its processor's). The full lawyer review is deferred to 100+ users on a tech lawyer's advice (2026-10-03), so the subscriptions terms ship drafted, not cleared.

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
- **Your additions after the cross check**: INV-3 (checkout and portal identity from the session only, with its test), INV-11 ("genuine" means signature, issuer and authorized party all verified, only the expiry relaxed, and a failing token always gets "sign in again"; `verifyToken` itself checks no issuer and accepts a missing `azp`, so the route checks both), and INV-12 (the firewall rule denies with 429, never a challenge, per spec 0011 INV-9).
- **Settled**: the billing off mode and `config.billingEnabled`, with CI building on a fake complete set; Polar's error statuses; the cookie helper; the ask's concurrency, budget and late answers; "open it again" as `file-chosen` on the held `File`; the sign in redirect rule; plan display without an active subscription; the delete flow's confirm, refusals, failure lines and browser sign out; Subscribe refusing on `unknown`; the welcome page's polling; one call for the portal; the exact proxy matcher, noindex and plain links; the gate's consistency, host and PEM rules; AC-21's spike exception; claim C6's wording; the measure's step and machine.

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
