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

### After tasks 11 and 12 (2026-10-04)

Tasks 11 and 12 raised three points. You asked for them to be settled together and nothing else.

**1. A payment being retried, at deletion.** AC-11 asked Delete account to refuse while Polar retries a Pro payment (`past_due`). Task 12 found that the customer state never lists such a subscription (*Slice 3* below), so the refusal had no source. Your call: drop the clause, because Polar's delete ends the retry anyway. That rests on what Polar's delete does to a `past_due` subscription. The SDK's note says only "active subscriptions", and Polar keeps `past_due` out of its active statuses, so the source was read (Polar's `server/polar/subscription/service.py` on `main`, 4 October 2026, by a read only subagent). `cancel_customer` runs when a customer is deleted, selects the customer's billable subscriptions (`list_billable_by_customer`, which includes `past_due`), and cancels each at once. Its docstring says why: "This includes `past_due` subscriptions, whose pending orders would otherwise keep being retried by dunning." Revoking then queues `order.void_pending_orders_for_subscription`, and voiding an order clears its `next_payment_attempt_at` (`server/polar/order/service.py`). So no further charge is tried, and the person loses nothing they paid for: the period being retried was never paid.

Options weighed:
- **Drop the clause (chosen).** No refusal, no new call, and the code already works this way. Cons: someone in a payment retry who deletes loses the Pro access the grace period was still giving them, which is what deletion means anyway.
- **Keep the refusal, read from Polar's subscriptions endpoint** (list the customer's subscriptions, which does show `past_due`). One more call on every delete, and a subscriptions read scope the token deliberately lacks, to refuse something the delete already ends cleanly.

The same blind spot reaches the other product refusal: another product's subscription in a payment retry does not show in the state either, so it does not block deletion, and Polar's delete cancels it. Recorded under Consequences beside the other deletion tradeoffs.

**2. Manage billing's failure line.** AC-17 pointed at AC-14's checkout line, "We couldn't start the checkout", on a page that opens billing, not a checkout. The page as built says "We couldn't open billing. Try again, or write to {contact}.", and you chose to keep it, so AC-17 now quotes it.

**3. The portal token in the welcome address.** After payment Polar adds `customer_session_token` to `success_url` (task 12's walk). Left in place, it would sit in the address bar, ride along as the address of every request the page makes, be readable by Clerk's script, and reach our host's request log again on every reload. You asked for a server redirect that strips it, as the sign in pages strip Clerk's parameters, plus an explicit referrer policy and a test.

Reading the installed `@clerk/backend` 3.22 (`buildRedirectToHandshake`, `handleSessionTokenError`) showed one more path. Clerk's middleware runs before any account page. On a page load (`Sec-Fetch-Dest: document`) whose session token has expired, it first tries a server refresh, which needs a `__refresh` cookie; failing that, it redirects to `https://<Frontend API>/v1/client/handshake` with the full request address as `redirect_url`. Clerk's token lives 60 seconds and no Clerk script runs on Polar's checkout, so a buyer coming back has an expired token nearly every time. A strip inside the welcome page would run only after the token had been to Clerk's host and back.

Options weighed:
- **A 307 from `src/proxy.ts`, before `clerkMiddleware` (chosen).** The proxy already sees every account page request first. Clerk's handshake then only ever carries the clean address. Cons: the proxy gains a job besides Clerk; a request with the token costs one more round trip.
- **A redirect in the welcome page, as the sign in pages do.** Simplest to read beside the existing pattern, but too late whenever Clerk runs its handshake.
- **A `success_url` outside the proxy's matcher** (a route that strips and forwards to Welcome). Clerk never sees the first request, but it is a new route, the matcher test's exact list grows an exception, and the proxy fix does the same with less.

**Can Polar be told not to add it? No, as far as can be checked (4 October 2026).** You asked for this before the commit, so that a switch, if one existed, would become the primary fix with the proxy strip as a backstop. Three sources were checked:
- **The installed SDK's types** (`@polar-sh/sdk` 1.0.2, the `2026-10` module, read directly). `CheckoutCreate` has no field that controls the token: its fields cover the product, prices, customer, discounts, trial, seats, units, metadata, `success_url`, `return_url`, `embed_origin`, `locale` and `currency`. `success_url` documents one placeholder only: "You can add the `checkout_id={CHECKOUT_ID}` query parameter to retrieve the checkout session id." None of the organisation's settings groups has a switch for it (checkout, subscription, customer portal, customer email, features, disputes). The token comes from `CheckoutPublicConfirmed`, "Checkout session data retrieved using the client secret after confirmation. It contains a customer session token to retrieve order information right after the checkout."
- **Polar's docs** (read by a read only subagent). Checked: the checkout session create reference, checkout features, the embedded checkout guide, the confirm from client reference, the customer portal guide and the Next.js guide. None documents a way to turn the token off or control it. The customer portal guide says only that customer session tokens are "short-lived", with no lifetime. The embedded checkout hands the token to the parent page by `postMessage`.
- **Polar's source.** As the subagent read `server/polar/checkout/service.py`, the token is created at confirmation when an internal `generate_customer_session` flag is set, and that flag is not a merchant input. It could not find the code that adds the token to the redirect address (likely in Polar's checkout frontend), so the exact rule for when it is added stays unread. Task 12's walk is the evidence that it is added for our hosted, redirect checkout.

So the proxy strip (AC-26) stays the fix, not a backstop, and nothing joins the spec. Embedded checkout is no way round it: it would bring Polar's script and frame onto our pages (set aside in *Options considered*, against claim C7), and whether its redirect also carries the token is unchecked. Worth looking again if Polar's SDK or docs ever add a `success_url` option.

No option keeps the first request out of Vercel's request log: Polar puts the token in the address the browser asks for, and Vercel logs that request before our code runs. The Vercel entry in `OUTSIDE_SERVICES` already says Vercel receives "the page or file asked for" and keeps it a day, so no claim in the privacy policy changes. The redirect makes that line the only one.

On the referrer policy, three values were weighed. Browsers today default to `strict-origin-when-cross-origin`, so with no header nothing leaked across origins in a current browser, but the page relied on that default (older browsers defaulted to `no-referrer-when-downgrade`, which sends the full address to other https origins). `strict-origin-when-cross-origin` (chosen) pins today's behaviour, so nothing that works changes. `strict-origin` also hides the path from requests to our own server, which gains nothing once no address holds a token. `no-referrer` was ruled out by reading Next.js 16's `action-handler.js`: under that policy a browser sends `Origin: null` on a same origin `POST`, Next.js reads `null` as a host that does not match, and aborts the server action as a cross site request, so Delete account would fail. The header goes on every path, `/tool` included, from one `next.config.ts` rule. Its value sits in `src/config/csp.ts`, the security headers module `next.config.ts` already loads (spec 0011, INV-8).

**Cross check of this update.** A read only pass on a different model (Sonnet) found the three decisions sound and raised gaps, all applied on your pick. The clean address is built from `request.nextUrl`, never `config.siteUrl`, with names matched once decoded but case sensitively. The strip covers every method and every page in the matcher. The e2e test sends the request as a page load (Clerk runs its handshake for nothing else, so without those headers the test would prove nothing) and adds a control that reaches Clerk's host. The header test names its rule source, reads the script address from the page, and covers `/engine/VERSION`. Its concern that the proxy would pull in billing code was checked and dropped: `plan.ts` holds only `server-only`. Its point on another product's `past_due` subscription stays the accepted tradeoff recorded under point 1.

### After task 13's walk: claim C6 (2026-10-04)

Task 13's cookie check failed as written (*Task 12a by hand and task 13's walk* below). C6 said Clerk's cookie page lists every cookie Clerk sets, and the check compared the browser against that page. The page lists three: `__session` and `__client_uat` as first party, and Cloudflare's `_cfuvid` as third party. The walk saw ten names (plain and suffixed forms counted apart): those three, plus `__refresh_<suffix>`, `clerk_active_context`, `__clerk_db_jwt` (development only), the suffixed forms of `__session`, `__client_uat` and `__clerk_db_jwt`, and Cloudflare's `__cf_bm` on Clerk's host. "We set none of our own" held: nothing outside Clerk and Cloudflare set a cookie on either host, and `/api/entitlement` set none. What failed was the promise about Clerk's page. You asked for C6 to be true without it, by owner and purpose, and for a go live check on the real domains.

One more weakness turned up while rewording. C6 opened "No cookies until you sign in", and nobody checked a visitor who opens the sign in page and leaves. Clerk's script runs as that page loads, and its calls to Clerk's host pass through Cloudflare, so cookies most likely appear before any sign in. The claim's real boundary is the page, which AC-9 already holds: only the account group loads Clerk or runs the proxy.

Options weighed:
- **By owner, purpose and place, naming no cookie (chosen).** Owner: Clerk, and Cloudflare on Clerk's host. Purpose: sign in and its security, strictly necessary. Place: only the sign in and account pages set them, on our site and on `clerk.redactnest.com`. A renamed or added Clerk cookie keeps the claim true as long as Clerk sets it for sign in. Cons: a visitor gets no names; only checks by hand hold the signed in half, since no test can reach a real Clerk instance.
- **List every name in the policy.** The most transparent today. But Clerk changes its cookies between releases (the walk already found six more Clerk names than Clerk documents), so the list would go stale with any upgrade, and each upgrade would change a legal page.
- **Keep the link to Clerk's cookie page, as further reading.** Gives the reader Clerk's own words. But a link beside the cookie words reads as the list, and a reader who compares it with their browser finds seven names missing.

Three smaller choices, all on your pick:
- **Cloudflare is named.** The Clerk entry in `OUTSIDE_SERVICES` already says Clerk is "hosted mainly by Google Cloud and Cloudflare", and Clerk's cookie page names `_cfuvid` as Cloudflare's, so naming it adds no new vendor fact. A visitor who sees `__cf_bm` can match it to a name. Runner up: "the network Clerk uses", never stale if Clerk moves, but vaguer.
- **Polar's pages are said to be Polar's own.** The walk saw Polar, Stripe and Google cookies on their own domains in checkout and the portal. One sentence keeps "nothing else sets a cookie" from reading as covering them.
- **No link to Clerk's cookie page.** Clerk's privacy policy stays linked under Services we use.

**Cloudflare's own words** (its cookie page, read by a read only subagent on 4 October 2026, resolved with no redirect): "All the cookies listed below are strictly necessary to provide the services requested by our customers, unless otherwise stated." `__cf_bm` is for bot protection ("necessary for these bot solutions to function properly") and expires after 30 minutes of inactivity. `_cfuvid` "is only set when a site uses this option in a Rate Limiting Rule, and is only used to allow the Cloudflare WAF to distinguish individual users who share the same IP address"; no lifetime is stated. The page does not say which domain the cookies are scoped to, which is one reason Go live step 6 checks the domains on production.

**Why a go live check.** Everything seen so far came from a development instance: its host is under `*.clerk.accounts.dev`, and it sets `__clerk_db_jwt` on the site where production sets `__client` on Clerk's host. The production list, on `redactnest.com` and `clerk.redactnest.com`, has never been seen. Step 6 takes three lists from the browser's own cookie list (so HttpOnly cookies show): the sign in page left without signing in, signed in after the portal, and after sign out. It judges each cookie by who set it, its purpose and its domain, and records the result here. A Cloudflare cookie scoped to `redactnest.com` itself fails, because C6 places Cloudflare's cookies on Clerk's address. It runs straight after the deploy, before the real purchase, because Clerk's production instance works only on the real domain, so this is the earliest it can run.

The walk's recorded list already meets the new wording, so task 13's check passes on its own evidence and needs no second walk. The Follow-up asks `/sync` to record that a Clerk upgrade reruns the check.

**Cross check of this update.** A read only pass on a different model (Sonnet) found the direction sound and raised gaps, all applied on your pick:
- Step 6 says who owns a cookie (whoever set it, by the response that carried it, or Clerk's script), fails any other owner, counts a cookie on `.redactnest.com` as our site, and takes a third list after sign out, which passes when no new cookie appears. C6 drops "to keep you signed in", because the walk saw some of Clerk's cookies stay after sign out.
- The check moved before the real purchase, so the portal is still open when the signed in list is taken.
- The one line in "What we do not do" is fixed word for word, and the Polar sentence sits with the rest of C6 in "Your account".
- The Polar sentence no longer says what Polar's privacy policy covers, which was never checked for Stripe's and Google's cookies. It now says only that those cookies are not ours, held by the redirects (AC-14, AC-17) and AC-21.
- AC-19 and task 15 add the not found page and `/licence.txt`, so "no page sets a cookie" is held past the five named routes.
- "Strictly necessary" stays (your direction) and joins the deferred lawyer review's questions.
- The scope's "Go live steps 1 to 7" goes to `/scope` as a Follow-up, because it sits on another feature's row.

Its shorter rewording was not taken: it drops "strictly necessary", which you asked for, and "nothing else sets a cookie", which is what makes a Vercel challenge cookie a breach of C6.

### After the fresh model review (2026-10-05)

The fresh model review (`docs/reviews/2026-10-04-feat-billing-paid-plan.md`) and the fixes that followed it (db0f8c9) left points the spec did not yet state. You asked for them to be recorded as wording, with nothing in the build changed.

**1. Why sign out has a 10 s limit.** Two things about `signOut` in `@clerk/nextjs` 7.9.10 came to light while running verify:
- Before Clerk's script has loaded, `signOut` only queues the call for that moment and resolves at once. A page load straight after it drops the queued call, so the visitor landed on `/` still signed in (verify, *Found in the rerun*, 2026-10-04). 2240a58 made the control wait for Clerk to load first.
- Offline, it never settles. Before it ends the session, `@clerk/nextjs` awaits a server action of its own, and when that request fails, the promise it hands Clerk never settles, so neither does `signOut`. Nothing throws, so without a limit the control would wait for ever. The offline rerun shows it: the failure line came at 10.4 s, from the limit.

So one limit, `SIGN_OUT_LIMIT_MS`, runs from the press and covers both waits: Clerk's script loading, then `signOut` settling. Sign out is a few requests, so 10 s leaves a slow connection plenty of time. AC-12 said only "if `signOut` throws", while the failure offline actually produces is one that never settles, so "or has not settled within 10 s" now sits beside it.

**2. A sign out still in flight at the limit.** Past the limit the control never starts a `signOut` (a Clerk that loads late is ignored), but one that started before the limit may still end the session after the failure line shows. The review raised it as a nit. It stays as it is, because it is harmless: Try again then lands on `/` (with no session left, `signOut` resolves at once and the page load follows), and a reload of Account sends the visitor to sign in. Either way they see the true state. Runner up: reword the line to "check whether you are still signed in", which would hedge every failure to cover a rare one.

**3. When Clerk reports its script failed.** Review fixes row 3 asked for the failure line "as soon as Clerk reports its script failed, not after 10 s". The 2026-10-05 run showed when that is. Clerk sets its `error` status only when its own `scriptLoadTimeout` runs out, 15 s after load by default. The script's own failure is rethrown as an unhandled rejection that nothing awaits, so the status is the first signal the control can use. Pressed 1.2 s after load, the line came at 10.1 s, from our limit. Pressed after Clerk had reported, it came in 35 ms. Pressed at 8 s, it came 0.2 s after Clerk reported at 15.9 s. Nothing navigated in any run. The row now says what the run holds: the line comes as soon as Clerk reports, and at the latest 10 s after the press.

Shortening `scriptLoadTimeout` (a `ClerkProvider` prop) was weighed and set aside. It is how long Clerk waits for its script before giving up, so a shorter one would make sign in itself fail on a slow connection, to win a few seconds on a page whose script is already broken.

**4. Subscribe acts on a GET.** The review's Minor: loading `/account/subscribe` ties or creates the Polar customer and creates a checkout, and Clerk's cookies go with a top level navigation from another site, so a link elsewhere, or a prefetch by a browser or an extension, can make a signed in visitor's browser do it. It is deliberate, for AC-8. Clerk's landing after sign in is a navigation, a GET, so for sign in to go straight on to checkout, Subscribe has to do its work as the page loads. The effect is bounded: only for the session's own user and verified email (INV-3), no money moves, and the visitor lands on Polar's checkout, where nothing happens unless they pay. The cost is the one *Consequences* already names for someone who leaves checkout (a Polar customer record with their email and account id), plus an open checkout nobody pays. Our own pages never prefetch it, since every link to it is a plain `a` (INV-10). Runner up: a button on Subscribe that posts a server action, which adds a click between sign in and checkout on every purchase, to stop a stray record for the visitor's own email.

**5. Clerk's development origin in the production policy.** The review's Minor: `https://*.clerk.accounts.dev` sits in the standard policy's `script-src` and `connect-src` in every build, production included, so any tenant of Clerk's shared development domain is an allowed source on every page but `/tool`. It stays, for three reasons:
- `script-src` on those pages already holds `'unsafe-inline'`, which the App Router's inline hydration scripts need on prerendered pages (no nonce, spec 0001). A script injected there already runs without naming any origin, so the wildcard adds almost no risk.
- A production build never loads from it. A Vercel production build refuses any publishable key whose host is not `clerk.redactnest.com` (AC-23).
- `/tool` never holds it, since its policy takes nothing from `OUTSIDE_SERVICES` (INV-1, and spec 0011 INV-2).

Limiting it to builds that are not production would make the Clerk entry differ by build, and that changes three contracts. AC-21: the entry names both origins. AC-23: a development key builds because its host is one of the entry's origins, which is how local runs and the e2e build work. Spec 0011 INV-1: every outside origin in the standard policy comes from `OUTSIDE_SERVICES`, the list the privacy policy renders entry by entry. Runner up: the wildcard only outside production, a small hardening at the price of those three changes.

**Also recorded.** The verify rows that said "Not held" on 2026-10-04 now name the tests 4441c1c added. The types table names `askAgain()`, which replaced `forgetEntitlement`. A Follow-up records the blocked background fetch of Polar's checkout after sign up. Go live step 6 also checks that no `__refresh_*` cookie is left after sign out, which the review suggested (its question 4).

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
- Installed `@clerk/backend` 3.22 (`buildRedirectToHandshake`, `handleSessionTokenError`): the handshake carries the full address as `redirect_url` (AC-26). Installed Next.js 16 `dist/server/app-render/action-handler.js`: an `Origin` of `null` aborts a server action (AC-27)

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
- Polar's subscription service, `cancel_customer` (read 2026-10-04): https://github.com/polarsource/polar/blob/main/server/polar/subscription/service.py
- Polar checkout features, the `{CHECKOUT_ID}` placeholder (read 2026-10-04): https://polar.sh/docs/features/checkout
- Polar customer sessions, "short-lived" (read 2026-10-04): https://polar.sh/docs/features/customer-portal/navigate-customers
- Polar embedded checkout, the token by `postMessage` (read 2026-10-04): https://polar.sh/docs/features/checkout/embed
- Cloudflare cookies, `__cf_bm` and `_cfuvid` "strictly necessary" (read 2026-10-04): https://developers.cloudflare.com/fundamentals/reference/policies-compliances/cloudflare-cookies/

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

### Slice 3 (4 October 2026)

**The portal's scope (task 11).** Polar names it `customer_sessions:write` (the SDK's `Scope` type). The sandbox token already holds it: a scratch script, run against the sandbox only, created a customer session for the `walk-one` customer by its external id, and Polar answered with an `https` portal address on `sandbox.polar.sh` under the EdiventStudio organisation. So the token's least privilege set is `customers:read`, `customers:write`, `checkouts:write` and `customer_sessions:write`, which Go live step 2 gives the production token.

**An external id Polar does not know (task 11).** A customer session for an external id with no customer is refused with a 422 (`Customer does not exist.`), not a 404. AC-17 already reads both as "no such customer" and sends the visitor to Pricing, and `tests/unit/billing-subscribe.test.ts` holds both.

**Where a payment being retried appears (task 1's open check, settled by task 12).** It does not appear in the customer state at all. Polar's own source (`server/polar/customer/schemas/state.py` on `main`, read 4 October 2026) types a state subscription's status as `Literal[SubscriptionStatus.active, SubscriptionStatus.trialing]`, and `server/polar/models/subscription.py` keeps `past_due` out of `active_statuses()` (it joins only `billable_statuses()`). So while Polar retries a payment, the state shows the Pro benefit (if the grace period keeps it) and no subscription, exactly like a benefit granted by hand. AC-10's "Pro alone" covers that. AC-11's "a payment being retried included" has no source in the state, so task 12 builds the refusal for every active subscription to Pro set to renew and leaves the retry case open with `/architect` (`tests/unit/billing-delete.test.ts` marks it as a `todo`). (Settled 4 October: the clause is dropped, because Polar's delete cancels a `past_due` subscription too; *After tasks 11 and 12*, point 1.)

**What Polar's customer delete does (task 12).** The SDK's own notes for `customers.deleteExternal` say it "immediately cancels any active subscriptions and revokes any active benefits", so AC-11's refusal while another product's subscription is active is right to rest on that. In the sandbox, with a throwaway account (`delete-one+clerk_test@redactnest.com`, approved by you before each delete): it signed up through Subscribe, paid with the 4242 test card, and Account showed Pro renewing on 4 November 2026. Delete account then refused with "Cancel your subscription in Manage billing first." and deleted nothing. After cancelling in Polar's portal (status "To Be Cancelled"), the confirm read "Your Pro access ends now, not on 4 November 2026.", and deleting landed on `/` as a document load (type `navigate`), with no Clerk resource loaded, both `__client_uat` cookies at `0`, no session cookie, and `/api/entitlement` answering free, `none`. Afterwards Polar answers 404 for the customer by its id and by its old external id, and the email search finds nothing. The token has no subscriptions read scope (least privilege), so the subscription's own status after the delete is read in the Polar dashboard, by hand.

**The subscription after the delete (task 12, your check in the dashboard, 4 October 2026).** In the Polar sandbox, `delete-one`'s RedactNest Pro subscription shows Canceled on 4 October, the day of the delete, with no renewal date, and its customer is anonymised. So the delete ended a subscription already set to end on 4 November at once, rather than letting it run to its period end, as the SDK's note says and as the "ends now, not on {date}" warning tells the person. AC-11's other product refusal rests on that same behaviour, so it no longer leans on an assumption.

**Signing up again after deletion (task 12).** The same email signed up again as a new Clerk user, and Subscribe went straight to Polar's checkout with no conflict line: Polar created a new customer with that email and the new user id, so the anonymised customer neither matched the email nor kept the old id. That second throwaway account, never paid, was then deleted through Account too (approved by you), which exercised the free account path: the confirm had no warning, and Polar and Clerk hold nothing for that email now. `walk-one` was not touched and still holds Pro.

**A token in the welcome address (task 12, for `/architect` or `/check review`).** After payment, Polar sends the buyer to our `success_url` with a `customer_session_token` added to the query, a token that opens the customer portal. It sits in the browser's history and in the host's request log for `/account/welcome`. No `Referrer-Policy` is set, so browsers fall back to `strict-origin-when-cross-origin` and send other origins (Clerk's script on that page) only our origin, never the query. (Settled 4 October: the proxy drops the token before Clerk runs, and every route sets the policy, AC-26 and AC-27; *After tasks 11 and 12*, point 3.)

### Task 12a by hand and task 13's walk (4 October 2026)

**How the walk was watched.** `next dev` logs the pages it renders but not the proxy's redirects. So a scratch relay, kept outside the repository, listened on port 3000 (the site address the sandbox expects) and forwarded every request to `next dev` on 3001 with its headers untouched. It wrote one line per request: the method, the address, the status and any redirect's `Location`, with the token's value masked. Two throwaway accounts paid with the 4242 test card, each approved by you and paid by you in your own browser: `walk-two+clerk_test@redactnest.com` and `walk-three+clerk_test@redactnest.com`. `walk-one` was not touched and still holds Pro, renewing on 3 November 2026. Times below are UTC.

**The portal token on the way back from Polar (task 12a, AC-26).** Both payments show the same chain. For walk-two, at 11:22:22:
1. `GET /account/welcome?customer_session_token=<53 characters>` answered 307 to `/account/welcome`. That was the proxy, before Clerk ran.
2. `GET /account/welcome` answered 307 to Clerk's `/v1/client/handshake`, with `redirect_url=http://localhost:3000/account/welcome`, which is clean. Clerk gave the reason `session-token-but-no-client-uat`, so this is exactly the handshake AC-26 exists for.
3. The handshake came back with `__clerk_handshake`, answered 307 to the clean address, then 200.

walk-three repeated it step for step at 11:34:21. In each payment the token appeared in one address of ours, the first, and never in a `Location` or a handshake. You saw "You're on Pro." on Welcome with a clean address bar. The only other place the token appeared was Manage billing's redirect to Polar's own portal, where Polar puts it by design.

**The referrer policy (AC-27).** On Welcome, signed in as walk-three, with `?keep=1` in the address, the document carried exactly one `Referrer-Policy: strict-origin-when-cross-origin`. Every request to Clerk's host (its scripts, `/v1/environment`, `/v1/client`) sent `Referer: http://localhost:3000/`, our origin alone. Delete account's server action still runs under the header: your delete of walk-two at 11:24:13, after its cancel in the portal, landed on `/`, and so did walk-three's below.

**The upgrade path (AC-7, AC-8, AC-15, AC-16).** On walk-two, by you:
- On the tool, `tests/fixtures/detect-dense.pdf` (50 pages) gave the cap callout "This PDF has more than 3 pages".
- Get Pro, then Pricing, then Subscribe, then Sign up from the sign in page reached Polar's checkout, so the landing survived the switch (AC-8).
- The checkout showed "RedactNest Pro", $19 a month, under EdiventStudio, with the email filled in and greyed out, and the "I agree to RedactNest's Terms of service" tick box with its link. The billing country was Pakistan.
- Welcome reached "You're on Pro."
- Back on the tool tab, the plan line read "Signed in with Pro.", and "Check my plan and open it again" opened the same 50 page file past the free cap with no file picker.

Whether Polar refuses payment with the box unticked was asked on walk-three, but your note left it open. So that part of AC-15 still rests on task 1's setup, which made the box required. On 4 October 2026 you confirmed it was not tried and left it to `/check verify`.

**Cancel and the hand revoke (AC-10, AC-18).** On walk-three, signed in on the automated browser:
- Account showed Pro, "Renews on 4 November 2026".
- In Polar's portal, Manage subscription, then Cancel Subscription, gave "To Be Cancelled", an expiry date of November 4, 2026, and the benefit still granted. Back on Account it showed Pro, "Ends on 4 November 2026", and `/api/entitlement` still answered paid, signed in.
- You then ended it by hand in the dashboard. A subscription already set to end offers only Uncancel there, so the hand revoke is Uncancel, then Cancel Subscription with the cancellation date set to immediately. It showed Canceled, ended 4 October 2026.
- Polar's state then held no benefit and no subscription. The next answer was free, signed in, `pageCap` 3, with no `Set-Cookie`. Account showed Free, Get Pro (to `/pricing`) and Manage billing. The tool's plan line read "Get Pro for up to 50 pages a document." under the helper "Up to 3 pages on Free".

**Sign out and delete (AC-11, AC-12, INV-13).**
- Sign out from Account: the only request to another origin was Clerk's own sign out call, from the account page. Then `/` arrived as a document load (type `navigate`), with `window.Clerk` undefined and nothing loaded from Clerk. Both `__client_uat` cookies were `0`, and the next answer was free, `none`, with no `Set-Cookie`. The HttpOnly `__refresh_<suffix>` cookie and the development `__clerk_db_jwt` cookies stayed after sign out.
- Signed in again, Delete account opened its confirm in place, with focus on Cancel and no warning (a free account, with a customer and no subscription). With your approval it deleted. `/` arrived as a document load with nothing from Clerk, both `__client_uat` cookies were `0`, the tool answered `none`, and neither Clerk nor Polar holds anything for that email.
- Your own steps on walk-two, as the relay logged them: a first delete at 11:23:42 that did not leave the page, Manage billing, then a delete at 11:24:13 that landed on `/`. After that, two more sign ups went through Subscribe, left checkout, and were deleted at 11:25:34 and 11:27:15. The log shows only requests, so what those pages said is yours to add.

**The cookie check (AC-19, claim C6) does not hold as written.** Signed in as walk-three, after the checkout and the portal, the site held only Clerk's cookies:
- `__session` and `__client_uat`, each plain and suffixed
- `__clerk_db_jwt`, plain and suffixed (development instances only)
- `__refresh_<suffix>`, HttpOnly
- `clerk_active_context`

`/api/entitlement` set none. Clerk's host held two of Cloudflare's cookies, `_cfuvid` and `__cf_bm`. Clerk's cookie page (https://clerk.com/docs/guides/how-clerk-works/cookies, read raw on 4 October 2026) lists only three: `__session` and `__client_uat` as first party, and Cloudflare's `_cfuvid` as third party. `__refresh_<suffix>`, `clerk_active_context`, `__clerk_db_jwt`, the suffixed names and Cloudflare's `__cf_bm` are not on it, so task 13's check ("every cookie set while signed in is one Clerk's cookie page lists") fails. C6's "we set none of our own" still holds: nothing outside Clerk set a cookie on the site. What fails is the promise that Clerk's page lists them. The Cloudflare cookies are a second point: in production they would sit on `clerk.redactnest.com`, our own subdomain (unchecked until go live). Both are for `/architect` before task 14 writes C6. The Polar, Stripe and Google cookies in the browser sit on their own domains, from the portal and the checkout.

### Task 16: the paid cap measure (4 October 2026)

Recorded with `tests/e2e/paid-cap-speed.spec.ts` in the `speed` project (`pnpm exec playwright test --project=speed --no-deps`), against a production build of commit `abcc8c1` with task 14's words on top (nothing in the engine, the worker or the tool's flow changed). Playwright 1.63.0's Chromium, on the machine spec 0007's checklist measure ran on: a 13th Gen Intel Core i5-1335U laptop with 16 GB of memory, running Windows 11. One worker, four runs (the first while the spec was being proved, then three in a row).

**The fixture.** `tests/fixtures/detect-dense.pdf`, 50 pages and 2,200 matches, with the entitlement routed to the paid tier so all 50 pages open.

**How a read is timed.** The product exposes no checkpoint and should not, so the test serves Turbopack's worker bootstrap with a probe in front of it. The probe wraps the worker's `setTimeout` and `postMessage`: it notes when each zero delay timeout is asked for (a checkpoint's yield) and when it fires (the next read starts), and when each message leaves the worker. A read is the stretch from one checkpoint's return to the next checkpoint, so it holds everything the worker does without stopping, the detectors included. A control holds the probe to what it claims: it must see at least one checkpoint per page during inspection and three per page during detection. It saw 100 (two a page) and 150, so each phase timed 101 and 151 reads, the extra one being the stretch before the first checkpoint.

**The open**, from the file input's `change` to the checklist's rows committed to the page, the engine's 10 MB load included: 2,719, 2,471, 2,548 and 2,484 ms. Split by the worker's phases: loading the engine 447 to 580 ms, opening 4 to 8 ms, inspecting 731 to 841 ms, detecting 978 to 1,077 ms. The slowest is 27% of the 10 s bar.

**The slowest single read.** During detection: 14, 8, 8 and 14 ms. During inspection, which the spec's bar does not name but which also decides how soon a cancel is noticed (spec 0006, AC-29): 63, 58, 81 and 58 ms. Both under the 1 s bar by more than ten times. A cancel during inspection or detection of this document is noticed within a tenth of a second. The engine's load is one stretch with no checkpoint, but it is the same for every document and so plays no part in the cap.

**The decision.** Both halves of AC-24's bar hold, so Pro ships at 50 pages. The default of `NEXT_PUBLIC_MAX_PAGES` stays 50, and the sandbox product description's "up to 50 pages" already matches `config.maxPages`. The test keeps asserting both lines on every speed run, so a regression fails `pnpm test:e2e` rather than going unnoticed.

**What it does not cover.** A crafted page can still hold one detection read longer: the phone detector's budget is 2 s per 100,000 characters (spec 0005, *Consequences*). That is a worst case built on purpose, not a dense document, and it is unchanged by the cap. The scan memory limit (scope Deferred) is about memory, not time, and this measure says nothing about it.
