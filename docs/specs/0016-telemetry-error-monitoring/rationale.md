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
- **`sign-in-completed` fires on Clerk's signed in transition**, in `SignInDone`, a client component each sign in page renders beside the server side panel. Runner up: counting arrival at the landing page, which would also count reloads and direct visits.
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

### Costs

Read on 2026-10-30 (see References). Volume assumed: about 2,000 visitors a month at about 5 usage events each, so about 10K usage events a month.

| Item | Monthly cost | Notes |
|---|---|---|
| Umami Cloud, Hobby (chosen) | $0 | 100K events a month, 6 months of history, 1 website. Pro is $20 a month for 1M events and 2 years. EU region not confirmed |
| Sentry, Developer (chosen) | $0 | 5K errors (one source says 50K), 30 days, 1 user, email alerts. Events past quota are dropped, not billed. Team is $29 a month, $26 billed yearly |
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
