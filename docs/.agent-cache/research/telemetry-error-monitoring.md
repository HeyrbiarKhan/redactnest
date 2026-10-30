Fetched: 2026-10-30

# Telemetry and error monitoring: pricing and limits (research cache)

Budget used: 12 page fetches, 7 searches. Items marked "search snippet" come from a search result summary, not a fetched page. Items marked "not confirmed" were not found in a source read in this run.

Key point for the $20 on-demand budget: on Pro, metered overage (Web Analytics events included) draws from the same on-demand budget as everything else. When the budget is reached with "Pause Production Deployments" on, the whole production deployment pauses (503 DEPLOYMENT_PAUSED), so the app itself stops, not just analytics.

---

## 1. Vercel Web Analytics (Pro)

- Pricing table: Pro "Included Events: None"; "Additional Events: $0.03 per 1K events"; reporting window 12 months; custom events "Included"; properties on custom events: 2 (Plus: 8). Source: https://vercel.com/docs/analytics/limits-and-pricing (last_updated 2026-08-25, read in full; not dated, current).
- Pro billing: "You will be charged $0.03 per 1K events," per billing cycle, subject to the Pro monthly usage credit. Source: same page. Arithmetic from that rate: 1M events = $30 before credit.
- Overage bills on demand, not stop: "Pro and Enterprise teams will be billed per collected event." Source: same page, FAQ "What happens when you reach the maximum number of events?".
- Counts toward spend management: spend management covers "metered usage that goes beyond your Pro plan monthly credit." Source: https://vercel.com/docs/spend-management (last_updated 2026-09-18). That page does not name Web Analytics explicitly; inference from the pricing table that it is metered: not explicitly confirmed.
- Pausing: "Analytics data is not collected while your project is paused." Source: https://vercel.com/docs/analytics/limits-and-pricing.
- Custom events: available on Pro. Source: https://vercel.com/docs/analytics/custom-events (last_updated 2026-06-26): "Custom Events are available on Enterprise and Pro plans." Needs @vercel/analytics 1.1.0 or later.
- Custom event limits (same page, "Limitations"): properties limited by plan (Pro: 2, per limits page above); nested objects not supported; values are strings, numbers, booleans, null; event name, key and value each max 255 characters.
- Server-side track: `import { track } from '@vercel/analytics/server'`, called from API routes or server actions (examples for Next.js, Remix, SvelteKit, Nuxt; no Next.js route-handler example). Source: https://vercel.com/docs/analytics/custom-events. Route handlers are not named explicitly; likely fine, not confirmed by example.
- Client script needed for server track: not stated on the custom events page. Not confirmed.
- Deployment Protection: server track can get 401 on protected deployments; fix is VERCEL_AUTOMATION_BYPASS_SECRET. Source: https://vercel.com/docs/analytics/custom-events.
- Cookies and visitor counting: "without using any third-party cookies, instead end users are identified by a hash created from the incoming request. The lifespan of a visitor session ... is automatically discarded after 24 hours." Source: https://vercel.com/docs/analytics/privacy-policy (last_updated 2026-06-26). Whether a first-party cookie is set: not confirmed.
- Data stored per event includes URL, referrer, query params (filtered), geolocation, device, browser. Source: same privacy page.
- Data retention on Pro: 12 months reporting window. Source: https://vercel.com/docs/analytics/limits-and-pricing.
- Web Analytics Plus: $10/month per team; adds 24-month window, 8 custom-event properties, UTM parameters, reporting window. Source: https://vercel.com/docs/analytics/limits-and-pricing and https://vercel.com/docs/pricing (add-ons table).
- Query API: a REST endpoint "GET /v1/query/web-analytics/events/aggregate" (counts custom events) is linked from the custom events page: https://vercel.com/docs/rest-api/web-analytics/aggregates-custom-events. Not fetched; seen only as a related-link summary. Also https://vercel.com/docs/analytics/web-analytics-api ("Query Web Analytics with the API"), not fetched.
- Alerting on Web Analytics itself: not confirmed (no alert type for it seen). Vercel's alerts are for observability (see section 2).

## 2. Vercel Pro plan, usage and observability

- Pro platform fee: $20/month, includes 1 deploying seat and $20/month usage credit. Source: https://vercel.com/docs/plans/pro-plan (last_updated 2026-09-15) and https://vercel.com/docs/pricing (last_updated 2026-09-14).
- Extra deploying seats: $20/month each. Viewer seats: free. Source: https://vercel.com/docs/plans/pro-plan.
- Credit expires at month end. Notifications at 75% of credit. After the credit, on-demand usage. Source: https://vercel.com/docs/plans/pro-plan.
- Included function invocations on Pro: none listed ("N/A") in the pricing table; billed from credit. Active CPU on Pro: "N/A" included, on-demand "Costs vary by region". Source: https://vercel.com/docs/pricing. Per-unit on-demand rates: not confirmed (regional pricing page not fetched). Fluid compute as a named allowance: not confirmed.
- Firewall rate limiting (WAF): available on all plans. Pro: 40 rules per project; counting window 10 s to 10 min; fixed window; included requests "Usage-based"; price is "Regional". Source: https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting (last_updated 2026-08-28). Price per request: not confirmed.
- Observability (base, included with all teams): data retention Pro 1 day; runtime logs Pro 1 day; build diagnostics Pro 1 day; no p75 latency or path breakdown on function views; no sort by error rate for external APIs. Source: https://vercel.com/docs/observability/observability-plus (last_updated 2026-07-06), "Limitations" table.
- Observability Plus: $1.20 per 1 million events; 30-day retention; query access; latency p75 and path breakdown; max selection window 14 days. Enabled by default for Pro teams created or upgraded on or after 2026-04-03; existing teams enable it. Projects can be excluded. Source: same page, and https://vercel.com/docs/pricing.
- Alerts: "Usage Anomalies" (project usage above a threshold) and "Error Anomalies" (rate of 5xx function invocations above a threshold). Delivered by email, web and push. Source: https://vercel.com/docs/notifications (last_updated 2026-09-14).
- Alerts need Observability Plus: "Alerts for the team or project stop while Observability Plus is disabled." Source: https://vercel.com/docs/observability/observability-plus. The alerts page https://vercel.com/docs/alerts was not fetched, so the exact plan requirement is not fully confirmed.
- On-demand usage notifications: customisable on Pro (owners). Source: https://vercel.com/docs/notifications.
- Spend management: available on Pro at no extra cost. Notifications at 50%, 75%, 100%. Spend is checked "every few minutes", so pausing can lag. Setting the amount does not stop usage on its own; "Pause Production Deployments" must be on. When paused, production returns 503 DEPLOYMENT_PAUSED. Projects must be unpaused manually, and raising the amount does not unpause them. Source: https://vercel.com/docs/spend-management (last_updated 2026-09-18).
- Spend management default: "By default, Vercel enables spend management notifications for new customers at a spend amount of $200 per billing cycle." Source: https://vercel.com/docs/plans/pro-plan.
- Add-on list (Pro): Observability Plus $1.20 per 1M events; Web Analytics Plus $10/month; Speed Insights Plus $10/month per project plus $0.65 per 10,000 events; Password Protection $20/month per project. Source: https://vercel.com/docs/plans/pro-plan.
- Drains: $0.50 per volume unit on Pro (unit not confirmed). Source: https://vercel.com/docs/pricing.

## 3. Sentry

- Developer (free) plan, per https://sentry.io/pricing/ (no date on page): errors "5k errors" (the page does not say per month); replays 50; tracing 5M spans; retention 30-day lookback; 1 user; email alerts included.
- Conflict: a search snippet (https://docs.sentry.io/pricing/ area, search only) says the Developer allowance is 50k errors. Not confirmed; the pricing page text says 5k.
- Team plan: $29/month monthly or $26/month annual; 50k errors included. Source: https://sentry.io/pricing/ (no date).
- Quota exceeded: "Events and attachments that exceed your quota will not be accepted." Source: https://docs.sentry.io/pricing/quotas/ (no date on page). Events are dropped, not billed, per that page. Whether the free plan can bill: not confirmed on a fetched page.
- Pay as you go: the quotas page refers to "reserved and pay-as-you-go quotas" without saying it must be enabled. A search snippet says pay-as-you-go is offered only on paid plans. Not confirmed from a fetched page.
- Spike protection: per project; "events start getting dropped, ensuring that you don't get charged for the excess volume." Source: https://docs.sentry.io/pricing/quotas/.
- EU data region on the free plan: pricing page comparison lists "Data Residency: Yes" for Developer and Team, with no regions named. EU availability: not confirmed.
- Envelope endpoint (plain HTTP POST, no SDK): confirmed from https://develop.sentry.dev/sdk/foundations/envelopes/ (fetched via the transport/envelopes URL and redirected or served there). "POST /api/<project_id>/envelope/". Auth: standard HTTP header or query string auth, or an envelope header "dsn" set to the full DSN; both missing gives 403. Content type: application/x-sentry-envelope. Envelope = one JSON header line, then items each with a JSON header and payload. Needs Sentry v20.6.0 or later. Sending a live test event: not done in this run.

## 4. Alternatives

- Umami Cloud (search snippet, https://umami.is/pricing; not fetched): Hobby free, up to 100K events/month, 1 website, 6-month retention. Pro $20/month, 1M events, 2-year retention. Business $200/month, 10M events, 5-year retention. Overage on Hobby: no per-event rate; collection not interrupted per FAQ (https://docs.umami.is/docs/cloud/faq). Server-side /api/send endpoint: not confirmed.
- PostHog Cloud (search snippet, https://posthog.com/pricing; not fetched, page flagged as possibly stale): free monthly: 1M analytics events, 100K exceptions, 5K session replays, 10 GB logs; resets monthly. Free plan: extra events discarded. Pay-as-you-go above the allowance; billing limits available (hard cap not confirmed). Retention: 1 year free, 7 years paid. EU cloud at the same price as standard (source blog https://posthog.com/blog/posthog-cloud-eu, about 4 years old). Server-side capture without cookies: not confirmed.
- Plausible (search snippet, https://plausible.io/docs/billing and https://plausible.io/; sources disagree): Starter $9/month for up to 10k pageviews (one site). Billing counts pageviews plus custom events together. Stats API only on Business (600 requests/hour). Events API for sending: not confirmed. Free trial 30 days, no card.
- Better Stack (search snippet, https://betterstack.com/pricing.md; not fetched): free tier $0 with 10 monitors and heartbeats, 1 status page, Slack and email alerts, for personal projects. Responder seat $34/month ($29 yearly). Reporting add-on $5 per member/month. Error tracking: not confirmed.
- Axiom (search snippet, https://axiom.co/pricing and https://axiom.co/docs/reference/limits; not fetched): Personal free: 500 GB ingest/month, 25 GB storage, 30-day retention, no card. Free notifiers: Email and Discord. Axiom Cloud: $25/month platform fee plus usage; overage $0.12/GB in the 1,000 to 99,999 GB band. Axiom is a log store, not an error tracker.

## Dated or ambiguous pages

- Vercel pages: all read pages have a last_updated date from 2026-06-26 to 2026-09-18; none looked stale. The pricing table on https://vercel.com/docs/analytics/limits-and-pricing says Pro "Included Events: None", which conflicts with the phrase "subject to the Pro monthly usage credit"; read together, Web Analytics on Pro draws from the credit.
- Sentry pricing page has no date; 5k vs 50k errors on the free plan conflict.
- PostHog pricing: search flagged the main page as about 436 days old and the EU post about 1,480 days old.
- Plausible: sources disagree on the Starter price tier for 100k pageviews (one says $19); only the $9 starting price is consistent.
- Umami: one source is a v3.1 announcement about 226 days old; the pricing page was preferred.
- Better Stack: some search summaries claim a 3-minute check interval on free, not confirmed on the official page.

## Not confirmed (summary)

- Web Analytics first-party cookie: not confirmed.
- Server track without client script: not confirmed.
- Route handler example for server track: not shown.
- Price per firewall rate-limit request: not confirmed.
- Active CPU and invocation on-demand rates per unit: not confirmed.
- Fluid compute allowance by name: not confirmed.
- Sentry free plan: 5k vs 50k errors; overage billing on free; EU data region; pay-as-you-go requirement.
- Umami /api/send; PostHog server-side capture without cookies and hard caps; Plausible Events API; Better Stack error tracking.
