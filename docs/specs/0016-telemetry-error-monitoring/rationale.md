# 0016. Telemetry and error monitoring: rationale

The decision record for [index.md](index.md). `/develop` does not read this file.

## Context

Scope feature 11 asks for enough numbers to know whether the funnel works and whether anything is failing silently, without ever touching document content. Today RedactNest counts nothing and reports nothing, and the privacy policy says so (claim C7). Several earlier specs left work waiting on these numbers: spec 0004's error kinds, spec 0005's `replacement-text` refusals, spec 0006's thresholds, and spec 0007's refused item.

The earlier specs fix the shape of any answer:
- Payloads are closed: every log, analytics or error payload holds enumerated kinds and numbers only, held by a typecheck gate over `LoggablePayload` (spec 0002, INV-4).
- `/tool` loads no third party script and connects only to its own origin (spec 0001, non negotiable). Anything it sends goes through our own server.
- No cookie outside the account pages (C6), nothing in browser storage (spec 0002, INV-3), no database of our own (spec 0001).
- Our own code writes no log (C8, spec 0011 AC-15). The policy may claim only what a test or a build check holds (spec 0011, INV-3).
- An upgrade is a count, never an email or an id, and error reports never capture the billing seams' arguments (spec 0012).

Cost is the sharpest force. RedactNest runs on Vercel Pro: $20 a month, which includes $20 of usage credit. Spend management is set to a $20 on demand budget with "Pause Production Deployments" on. When the budget is reached, Vercel returns `503 DEPLOYMENT_PAUSED` for the whole production site until someone unpauses it by hand. So any metered telemetry is also a path to an outage: a flood of events would not just cost money, it would take the product down.

The failures worth an alert are the silent ones. An expired Polar token makes every signed in plan check answer `unknown`, so paying visitors quietly get the free cap. A checkout can complete without the Pro benefit appearing. A deploy can break the engine's load for everyone. One person runs the product, so an alert has to reach them, not wait on a dashboard.

## Options considered

All four options share the parts the constraints force: closed events from every page to our own `/api/telemetry`, checked by a parser. They differ in where the events go.

### Option 1: Vercel's own products

Web Analytics custom events (sent server side with `track` from `@vercel/analytics/server`) for usage, and Observability Plus's Error Anomalies alerts for errors.

**Pros**:
- No new outside service, so no new policy entry and no new DPA. Vercel already receives every request.
- 12 months of history on Pro, and one bill.

**Cons**:
- On Pro, Web Analytics includes no events. Each bills $0.03 per 1,000 from the credit and then from the on demand budget, so a flood draws on the budget that pauses the site.
- 2 properties per custom event on Pro (8 with Web Analytics Plus at $10 a month), against up to 38 on `redaction-completed`.
- Stores location, device and browser per event.
- Error Anomalies alerts need Observability Plus ($1.20 per million events, same budget). They see only 5xx responses, so they miss the plan check's `unknown` (a 200) and browser crashes. Plus also raises log retention from one day to 30, which changes claim C10. It reverses spec 0011's INV-9 twice.

### Option 2: Umami Cloud for usage, Sentry for errors (chosen)

Umami's free Hobby plan for usage, Sentry's free Developer plan for errors, each called with a plain HTTP POST from our server, with no SDK.

**Pros**:
- $0. With no card on file, a quota can only drop events, never bill, and neither service touches the Vercel budget.
- Sentry's alert rules (first seen, frequency) cover the silent failures by email. Its envelope endpoint takes a plain POST, so we send exactly our closed fields.
- Umami is cookieless and built for privacy, which reads well on this product's policy page. 100K events a month is far above the expected volume.

**Cons**:
- Two accounts, two keys, two policy entries, and two entries in feature 17's DPA.
- Short history: Umami's free plan keeps 6 months, Sentry's 30 days, with one user.
- Two small HTTP clients to keep current against APIs that can change, with no SDK to absorb it.
- Sources disagree on Sentry's free quota (5K or 50K errors). An EU region wasn't confirmed for either free plan.
- Settled at sign up on 2 November 2026 (Go live steps 1 and 2): Sentry's free Developer plan shows an error quota of 5,000 a month, and both accounts hold their data in the EU (Umami Cloud in Frankfurt; Sentry's EU data storage location, whose DSN host is `ingest.de.sentry.io`). Neither has a card on file.

### Option 3: PostHog Cloud EU for both

PostHog's free plan for usage and for errors (its error tracking), through the same route.

**Pros**:
- $0 for 1M events and 100K exceptions a month, 1 year of history, EU hosting, and free extras dropped rather than billed.
- One service, one key, one policy entry.

**Cons**:
- Its pricing page looked stale, and free alerting and cookieless server capture weren't confirmed.
- A full product analytics suite (session replay, person profiles) whose name reads as tracking on a privacy policy, even used for server capture only.

### Option 4: Axiom for both

Axiom's free Personal plan as a store for both kinds of event, with its monitors for alerts.

**Pros**:
- $0 for 500 GB a month, email monitors and a query language. One service.

**Cons**:
- 30 days of history, so you can't compare this month's funnel with last quarter's.
- A log store, not analytics: every funnel view is a query you build by hand. Its facts came from search summaries only.

Dropped early:
- Plausible starts at $9 a month for 10K page views, and its events API wasn't confirmed.
- Better Stack is uptime monitoring; its error tracking wasn't confirmed.
- Sentry's own SDK (`@sentry/nextjs`) captures request data, console breadcrumbs and stacks unless each is turned off, which is scrubbing rather than structure (spec 0002).
- Log lines read through a Vercel drain: drains bill, the logs last one day, and C8 would have to change.

## Rationale

The pause on the $20 budget decides Option 1 against. A product whose promise is privacy can't let a burst of analytics events, or a bot posting them, take the tool offline, and Vercel's analytics is the only option that bills per event from that budget. It would also stretch two closed events into many (2 properties per event), store location and device, and reverse spec 0011's INV-9 for alerts that can't see the most important failure, the plan check's `unknown`.

Since the route forwards server to server, every remaining option is equally private on the page. They differ on four forces from Context: a quota that drops rather than bills, alerts that reach one person, how the service reads on the privacy policy, and history. Option 2 is the only one strong on all four that matter now: Sentry's alerting is the most proven, its envelope endpoint takes exactly our closed fields, and Umami is built for cookieless counting. Option 3 is the runner up. It would be one service with longer history, but its free alerting and server capture weren't confirmed, and its name sends the wrong signal to the HR, legal and healthcare buyers feature 16 is written for. Option 4's 30 days can't show a funnel's trend. You picked Option 2's parts one by one in the design conversation.

The cost of Option 2's two services is real but bounded. Two policy entries and two DPA lines are the work of task 14 and feature 17. The short history matches the stage: at this volume, six months of funnel and a month of errors answer every question asked so far.

### Small choices

Each made in the design, with its runner up:
- **No SDK for either service.** Plain HTTP with our own fields, so INV-4 holds by structure. Runner up: Sentry's SDK with its integrations off, which is faster to wire, but every capture it adds later is on by default.
- **Forward inside `after()`.** The route answers at once and the forward runs afterwards, up to the route's maximum duration. Runner up: awaiting the forward, which makes the browser's keepalive request wait on a third party.
- **`204` for every body the route reads**, whether valid, invalid, cross site or with no sinks. Runner up: `400` for invalid, which tells a prober what the parser accepts and helps nobody, since the reporter ignores the answer. `413` stays because it's decided before reading.
- **`cap-reached` replaces `run-refused`** for a free tier cap refusal, so one refusal is one event and the paywall step reads on its own. Runner up: sending both, which double counts refusals.
- **`still-waiting` is a `billing-failed` report** (it alerts). It means a paid checkout that hasn't become Pro after about 30 seconds, which is a support case. Runner up: a usage count, which nobody would see in time.
- **No count of a finished sign in** (decided 2026-11-02, after the verify walk). Clerk's dashboard holds that step; see *Counting a finished sign in* below. Runner up: a watcher in the `(account)` group layout, which counts only sign ins that land on Account. First designed as `sign-in-completed`, sent by `SignInDone` on Clerk's signed in transition, which the walk showed never fires.
- **`subscription-confirmed` comes from the browser**, because the welcome page's check runs in `WelcomePoll` and no server point knows when Pro appears.
- **The console ban stays whole.** The scope expected a narrow lift for "its one reporter", but no reporter here writes a log, so C8 stays true unchanged. Runner up: the scope's log line reporter, which needs a drain that bills.
- **`NEXT_PUBLIC_TELEMETRY_E2E` for the browser proof.** C5 changes, and spec 0011 holds C5 with a browser test, so the proof stays in a browser. Runner up: unit tests only, which can't show what the real page sends. A Vercel build refuses the flag.
- **A new capability folder, `src/telemetry`.** The server forwarder needs a server only wall like billing's, which is clearer as its own zone. Runner up: files in `src/lib`, whose zone would then need exceptions.
- **The Sentry fingerprint is the name plus where**, so each kind in each place is one issue and "first seen" means something new. Runner up: Sentry's default grouping, which with one message per kind would merge every route.
- **No bot filter yet.** Runner up: skipping `navigator.webdriver`, which would also need the e2e flag to keep the privacy proof. Revisit with evidence (Follow-up).
- **A `page-view` is an Umami page view**, not a named event, so Umami's own pages report works. The other events are named events.
- **Same origin by `Sec-Fetch-Site`, with `Origin` as the fallback.** Every current browser sends the first; the fallback covers older ones without letting other sites in.
- **Tool events come from session transitions**, not from actions: the reducer turns a refused run back into `reviewing`, so only the previous and next session together say what happened, and the silent retry never shows `lost`. Runner up: wrapping `dispatch`, which can't tell a refused run from a failed open (found by the cross check).
- **The route forwards only `BROWSER_EVENTS`**, so a script can't forge the server's alerts (found by the cross check). Runner up: any parsed event, which lets anyone trip `plan-check-failed` emails.
- **A 3 second timeout on each forward.** Long enough for a healthy sink, short enough that a hung one can't hold function time.

### Counting a finished sign in (decided 2026-11-02)

**What the verify walk found.** `SignInDone` never sent `sign-in-completed`, for sign in and sign up both, on Clerk's development instance. When a code is accepted, Clerk switches to the new session, moves to the landing (Account) with a client side navigation, and only once that move has finished tells its hooks the visitor is signed in. By then the sign in page, and `SignInDone` with it, has unmounted. `keepalive` never came into it, because nothing was ever sent.

**The Get Pro path is lost to any watcher.** A signed out visitor who chooses Get Pro signs in with Subscribe as the landing. Subscribe's `checkout` case is a server `redirect` to Polar, which the router carries out as a full page load, so Clerk's move never finishes and Clerk never reports signed in on our site. This follows from the order the walk saw and Subscribe's code; it was not walked itself. Those are the sign ins that matter most for Pro.

**The constraints**: no id, no cookie of ours and no state in the address (INV-2, and AC-14 as first written). A miss costs a count, never privacy.

| Option | For | Against |
|---|---|---|
| Drop the event, read Clerk's dashboard (chosen) | Exact, on every path, Get Pro included. Nothing to build, and code comes out. No reliance on the order Clerk reports in. No policy change | The step lives in another dashboard, as daily totals. What it shows is Clerk's to change |
| A watcher in the `(account)` group layout, inside `ClerkProvider`, which stays mounted across the move; `via` from the last sign in or sign up page seen while signed out | Stays in Umami beside the other counts, and uses only `useAuth` | Misses every sign in that lands on Subscribe, so the number means "sign ins not for buying", and a sign up completion rate read from it would be wrong. Runs on every account page |
| The server counts at the landing when the navigation's `Referer` path is a sign in or sign up page | Catches both landings, Get Pro included | Clerk's cache refresh around a sign in can render the landing twice, a double count to measure. It reads the previous page's address, close to the "no state in the address" line, and adds a report to Account's and Subscribe's renders |
| Drop the event as a known miss, naming no other source | The same removal | Leaves a gap in the funnel when an exact figure already exists |

Also ruled out without a full row. Reading `useSignIn()` or `useSignUp()` for a `complete` status before the move, or Clerk's in between state while it switches sessions: both lean on clerk-js internals, which load from Clerk's servers and can change with no package bump here (`AGENTS.md`, the note on Clerk's interface). The session's age on the server (`factorVerificationAge`): it counts reloads, and Clerk's own refresh, within the minute. A Clerk webhook: it would bring each user's record to an endpoint of ours for one count, a data path this project keeps out everywhere (spec 0012 has no webhook either).

**Why the first.** The funnel is already read from totals, because nothing joins one step to the next (INV-2), so a total from Clerk sits beside Umami's totals with nothing lost. Clerk sees every completed sign in, whatever page it lands on, so its figure is exact where any figure of ours would be partial, and taking the event out removes code rather than adding it. The layout watcher is the better pick only if the step must live in Umami, and even then it is blind to Get Pro.

**Privacy.** Nothing new is processed. Clerk already records each sign in to run accounts (the policy's *Your account* and *Services we use*), and you read a daily total on Clerk's dashboard. No count of ours is sent, so claim C16 (GPC and DNT) is untouched, and C14's "steps toward Pro" stays true through `subscribe-started` and `subscription-confirmed`.

**What Clerk's dashboard shows** (Go live step 8): not yet recorded.

### Server failures: the proxy and repeated reports (decided 2026-11-03)

**What the verify walk found.** Two things the design read wrong from Next.js 16.3.5.

1. *The proxy never reaches `onRequestError`.* `src/proxy.ts` runs on Node: Next.js 16 runs every proxy there, and throws if a proxy file sets `runtime`. Its compiled wrapper (`errorHandledHandler` in `next/dist/build/templates/middleware.js`) does catch a throw, but hands it to `edgeInstrumentationOnRequestError` (`next/dist/server/web/globals.js`), which looks for the hook in `_ENTRIES.middleware_instrumentation`, a global only the edge wrapper fills. On Node it finds nothing, so nothing reports. The server's own catch around the proxy (`next/dist/server/next-server.js`) then logs the error and renders the 500 page, with no call to the hook. The proxy stands in front of sign in, sign up and every account page, so a broken Clerk setup would lock out every paying visitor with nothing but a line in Vercel's one day logs.
2. *One failed render calls the hook more than once.* React's server component handler calls it (`createErrorContext` in `next/dist/server/app-render/app-render.js`, with `renderSource` and the plain path), and the page template's outer catch calls it again for the failure that escapes the render (`next/dist/build/templates/app-page-runtime.js`, with the definition path, group and leaf included). The walk saw two reports for a page and three for an account page; route handlers and server actions send one. Each report counted toward Sentry's 60 an hour key limit and the more than 10 an hour alert.

**The constraints.** A report holds only closed kinds (INV-1), and the hook reads nothing from the error or the request (AC-15, claim C15). Telemetry never breaks its caller (INV-3).

*The proxy's own failures*

| Option | For | Against |
|---|---|---|
| Catch in the proxy and report through `reportCrash` (chosen) | Hears every throw before Next.js does, whatever the runtime. Mirrors Next.js's own edge wrapper: report, await, rethrow. Lint already allows the import (the proxy shares the account zone). About ten lines | Rests on a reading of compiled code that an upgrade may change: if the hook starts hearing the proxy, one throw reports twice until the catch comes out, because the two run in separate bundles. The first failure each minute waits up to 3 seconds for its send |
| Record the gap | No code | Sign in and the account pages can fail for everyone with no email, the silent failure this spec exists to catch |

Also ruled out: moving the proxy to the edge runtime, where the hook does work, because Next.js 16 refuses a `runtime` option in a proxy file (`proxy.md`, *Runtime*). Setting `_ENTRIES.middleware_instrumentation` ourselves: it writes into Next.js internals and would break with no warning on an upgrade.

*Repeated reports*

| Option | For | Against |
|---|---|---|
| At most once a minute for each `route` and `routeType`, in `reportCrash` (chosen) | Reads nothing from the error or the request. Holds however many times, and from wherever, Next.js calls the hook, and the proxy's catch uses it too. A route failing on every request sends one report a minute from each server instance, so it can't spend the key limit alone. Never hides an issue, because its key is finer than the fingerprint (name plus `route`) | Sentry counts minutes with a failure, not failures. Kept per server instance and per bundle, so the hook and the proxy don't share it. Assumes a render's repeated calls map to one `route` and `routeType`, which verify measures. One small piece of module level state |
| Skip a repeated error object (a `WeakSet`) | Exactly one per failure, where it works | Assumes every call carries the same object, which nobody checked: React rebuilds the error for the HTML render, and an account page's third call may be a second real throw as the error page renders the layout again. Reads the error's identity, a widening of AC-15 |
| Keep the repeats, raise the limits | No code | The repeats are uneven (one, two or three by route), so no single threshold means the same thing everywhere, and a burst of page failures still crowds `plan-check-failed` and `billing-failed` out of the shared key limit |

Also ruled out: keeping only the calls that carry a `renderSource`. It ties the count to which call site Next.js uses, and the account pages' third call was never traced to its source.

**Why these.** The proxy is the door to the account pages, so its failure is exactly the kind spec 0016 promised to email about, and catching it in our own code is the only way that works on Node today. The collapse answers the duplicates without asking anything of the error or of Next.js's internals, so it stays right through an upgrade that adds, removes or moves a call. Its cost, a count of minutes rather than failures, matches how the alerts are read: a new issue says something broke, and the hourly alert says it keeps breaking.

**Four smaller choices.**
- **The key is `route` and `routeType`**, finer than the fingerprint, so a render failure and an action failure on one page each report. Runner up: `route` alone, which matches the fingerprint exactly and would also absorb a repeat whose `routeType` differed, at the cost of the second failure's tag. The walk saw no such repeat, and slice 6's verify step on an account page would show one.
- **A minute.** Longer than any one request, so every repeat of one failure lands inside it, and short enough that a failure coming back through an hour shows as many reports. Runner up: a few seconds, closer to one report per failure but at the mercy of a slow render's length.
- **The proxy awaits its report** before rethrowing, as Next.js's own wrapper does. Runner up: `event.waitUntil`, which adds no wait for the visitor, but `next/dist/server/web/adapter.js` hands that work to the platform only when the handler returns (its `waitUntil` result, line 423); a throw skips it, so the report could be dropped.
- **A failed send still counts.** The time is recorded before the send, so a sink that fails or times out still holds back that route's next report for the minute. Runner up: taking the time back on failure, which turns a sink outage into a retry on every failing request, the burst the key limit exists to stop.

**Privacy.** No new value leaves. The proxy's report is a constant, and the collapse sends less, never more. Claim C15 holds as written, so no policy word or change entry moves.

### Costs

Read on 2026-10-30 (see References). Volume assumed: about 2,000 visitors a month at about 5 usage events each, so about 10K usage events a month.

| Item | Monthly cost | Notes |
|---|---|---|
| Umami Cloud, Hobby (chosen) | $0 | 100K events a month, 6 months of history, 1 website. Pro is $20 a month for 1M events and 2 years. EU region (Frankfurt), chosen at sign up on 2 November 2026 |
| Sentry, Developer (chosen) | $0 | 5K errors a month, as the account shows it at sign up on 2 November 2026 (one source said 50K), 30 days, 1 user, email alerts. Events past quota are dropped, not billed. Team is $29 a month, $26 billed yearly |
| `/api/telemetry` function time (chosen) | a few cents, from the $20 credit | Pro includes no invocations or CPU of its own; per unit rates not confirmed |
| Vercel firewall rule (chosen) | usage based | 40 rules per project on Pro; the per request price ("regional") wasn't confirmed, the same as the entitlement rule today |
| Vercel Web Analytics (not chosen) | about $0.30 at 10K events | $0.03 per 1,000 from the credit and then the on demand budget, with no cap of its own. Web Analytics Plus is $10 a month |
| Observability Plus (not chosen) | $1.20 per million events | Needed for Error Anomalies alerts. On by default for Pro teams created or upgraded from 3 April 2026 |
| PostHog Cloud (not chosen) | $0 | Up to 1M events and 100K exceptions a month; pricing page possibly stale |
| Axiom (not chosen) | $0 | Up to 500 GB a month, 30 days; Cloud is $25 a month plus usage |
| Plausible (not chosen) | from $9 | 10K page views a month |

At normal volume, Option 1's analytics would cost cents too. The case against it is the flood, not the base rate.

## References

**Project sources**:
- `AGENTS.md`: the non negotiables (nothing third party on `/tool`, counts only, no storage), the billing wall pattern, the console ban, and `zone()`
- Spec 0001 (the two policy regimes, error payloads carry a kind), spec 0002 (INV-4 and `LoggablePayload`), spec 0011 (the claims register, INV-3, INV-9, AC-15), spec 0012 (the entitlement route, the outcome kinds, INV-12's deny only rule, the spending cap)
- `node_modules/next/dist/docs`: `instrumentation.md` (`onRequestError` and its `context`) and `after.md` (route handlers, server components, after a `redirect`)
- `docs/.agent-cache/research/telemetry-error-monitoring.md`: the full price and limit findings, 2026-10-30
- The verify walk of 2026-11-02 on Clerk's development instance, and Subscribe's server redirect to Polar in `src/app/(account)/account/subscribe/page.tsx`: the sign in count decision
- The verify walk's server failure findings, and Next.js 16.3.5's compiled code read on 2026-11-03: `build/templates/middleware.js` (`errorHandledHandler`), `server/web/globals.js` (`edgeInstrumentationOnRequestError`), `server/next-server.js` (the catch around the proxy), `server/app-render/app-render.js` (`createErrorContext`), `build/templates/app-page-runtime.js` (the outer catch), `server/web/adapter.js` (`waitUntil` returned only on success) and `docs/01-app/03-api-reference/03-file-conventions/proxy.md` (*Runtime*): the proxy and repeated reports decision

**Practices & standards**:
- Structure over scrubbing: closed types and a strict parser instead of filtering free text
- Fail closed on configuration: a partial or missing production setting fails the build
- Rate limit every public endpoint, and never let a free tier's overage reach a hard budget
- Global Privacy Control as an opt out signal

**Links** (web verified on 2026-10-30):
- Vercel Web Analytics limits and pricing: https://vercel.com/docs/analytics/limits-and-pricing
- Vercel custom events: https://vercel.com/docs/analytics/custom-events
- Vercel Web Analytics privacy: https://vercel.com/docs/analytics/privacy-policy
- Vercel Pro plan: https://vercel.com/docs/plans/pro-plan
- Vercel pricing: https://vercel.com/docs/pricing
- Vercel spend management: https://vercel.com/docs/spend-management
- Vercel WAF rate limiting: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
- Vercel Observability Plus: https://vercel.com/docs/observability/observability-plus
- Vercel notifications and alerts: https://vercel.com/docs/notifications
- Sentry pricing: https://sentry.io/pricing/
- Sentry quotas: https://docs.sentry.io/pricing/quotas/
- Sentry envelopes: https://develop.sentry.dev/sdk/foundations/envelopes/
- Umami Cloud pricing, PostHog pricing, Plausible billing, Better Stack pricing and Axiom pricing: read from search summaries only, so no link is given
