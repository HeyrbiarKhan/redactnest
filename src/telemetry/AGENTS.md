# src/telemetry

Counts and failure reports, never document content. Pages and server code build closed events here; pages post them to our own `/api/telemetry`, and our server passes them on, server to server: counts to Umami Cloud, failure reports to Sentry, both on free plans with no card. The decision is [spec 0016](../../docs/specs/0016-telemetry-error-monitoring/index.md), with the options, the measurements and the sign up facts in [rationale.md](../../docs/specs/0016-telemetry-error-monitoring/rationale.md). Nothing is stored here: history lives in Umami (6 months) and Sentry (30 days).

## Files

- `events.ts`: the catalog. Twelve events as frozen lists (`USAGE_EVENTS`, `ERROR_EVENTS`, `BROWSER_EVENTS`), `Bucket` and `bucket`, `bucketsByKind`, `PageKind` and `pageKindFor`, `EVENT_FIELDS`, `parseTelemetryEvent`, `reportKey` and `billingFailure`. Plain data and pure functions, shared by the browser, the route and the server, and nothing in it sends. AC-1 to AC-3.
- `client.ts` (`report`): the browser's one `POST` to `TELEMETRY_PATH`, fire and forget, with `credentials: "omit"`. It sends only when `config.telemetryReporting` is on, sends no count when the browser asks for Global Privacy Control or Do Not Track, and sends each failure report once per page load. AC-4 to AC-6, AC-28.
- `tool.ts` (`toolEvents`): pure, the previous session and the next in, the tool's events out. `tool-client.tsx` calls it from one effect, so the session reducer never knows it is counted. AC-11 to AC-13, AC-18.
- `server.ts`: server only. `forward` builds the Umami request or the Sentry envelope from the event alone and sends it with a 3 second timeout. `reportServer` (request code, scheduled in `after()`) and `reportCrash` (the hook and the proxy, awaited) both decide through `admitReport`, the collapse and the page budget. AC-6, AC-8, AC-20, AC-21, AC-27, AC-29.
- Outside the folder: `src/config/telemetry.ts` (the two values and the build gate, imported by the root layout), `src/app/api/telemetry/route.ts` (the route), `src/app/telemetry-reporter.tsx` (page views and browser crashes, mounted once in the root layout), `src/instrumentation.ts` (`onRequestError` and `ROUTE_KINDS`), the catch in `src/proxy.ts` (`PROXY_CRASH`), `/api/entitlement` (`plan-check-failed`), and the account pages and `WelcomePoll` (`billing-failed`, `subscribe-started`, `subscription-confirmed`).

## Conventions

- Counts and kinds only (INV-1). Every field is a kind from a list here or in `src/worker/protocol.ts`, or a `Bucket`: never a free string, a raw number, an id or a time from the browser. `EVENT_FIELDS` is typed over every event, so an event that gains a field cannot be sent until its list is named, and the gate in `tests/unit/loggable.test.ts` fails `pnpm typecheck` on a string field. `/api/telemetry` forwards only what `parseTelemetryEvent` rebuilds from the same lists.
- A new event goes into its type, `EVENT_FIELDS`, `USAGE_EVENTS` or `ERROR_EVENTS`, `BROWSER_EVENTS` only if a page sends it, and `umamiUrl` in `server.ts` for a count; the catalog test counts twelve today. One that counts something claim C14 does not name changes the privacy policy first (spec 0011, INV-3). No value in any list may hold a space, because `reportKey` joins values with spaces.
- Usage events and error reports differ in two ways. An opt out (GPC or DNT in the browser, `Sec-GPC: 1` or `DNT: 1` on the server) stops counts, never failure reports (INV-6). And only error reports meet the limits: a report with the same `reportKey` goes at most once an hour from each server instance (`REPORT_WINDOW_MS`), page error reports share 20 a UTC day (`PAGE_REPORTS_PER_DAY`), and in the browser each goes once per page load. Counts are never held back.
- `still-waiting` (a paying customer who never got Pro) never draws on the page budget; the hourly collapse alone holds it (`drawsOnPageBudget`, AC-29).
- Server code never sends a page error report's shape (`browser-crash`, `engine-unavailable`, or `billing-failed` as `welcome` with `still-waiting`). The page budget rests on that: it is why a forged report can spend nothing but the budget. AC-29.
- Billing seams are never handed to telemetry. A page or action passes its outcome's `kind` to `billingFailure`, never the outcome, so no email, id or address can reach a report. AC-19.
- Telemetry never changes what a visitor sees or waits for (INV-3): `report` and `reportServer` return nothing and never throw, and `forward` swallows every failure and never retries. The one wait is `reportCrash`, on a server failure already under way: at most 3 seconds, and only the first in an hour for each report.
- `onRequestError` and the proxy read nothing from the error or the request, only the route kind and route type, or the frozen `PROXY_CRASH`. A stack stays in Vercel's one day runtime logs.
- `UMAMI_SEND_URL`, `TELEMETRY_USER_AGENT` and `UMAMI_MAX_PROPERTIES` are rules about a service, each commented with the docs page and the day it was read. `REPORT_WINDOW_MS`, `PAGE_REPORTS_PER_DAY` and `SINK_TIMEOUT_MS` are rules about reporting. None is a cap on the visitor, so all of them live here, not in `src/config`, as the engine's constants do.
- Two pieces of module level state, both deliberate caches: `REPORT_MEMORY` in `server.ts` (at most 136 keys and one day) and `SENT` in `client.ts` (at most 24 keys, never browser storage). Each bundle holds its own memory (the proxy's, the hook's and the route's apart), and a cold start begins empty.
- No `console` here either: the log ban stays whole in every zone (AC-24, claim C8).

## Production setup (outside the repo)

What no code holds, set by hand before the merge. Spec 0016's *Go live* holds the steps.

- Umami Cloud Hobby in the EU (Frankfurt), and Sentry Developer in its EU data region (the DSN host is `ingest.de.sentry.io`). No card on either, so a quota can only drop events (INV-9).
- `UMAMI_WEBSITE_ID` and `SENTRY_DSN` on Vercel for Production only, never Preview or All Environments.
- Sentry: two issue alerts by email, "An issue is created" and "A resolved issue regresses", and "Prevent Storing of IP Addresses" on. No key rate limit (a Business or Enterprise feature) and no alert on how often an issue is seen, because a repeat waits an hour. Mark an issue resolved once you have read it, so its return emails you.
- Vercel firewall: `rate-limit-telemetry`, a rule of its own for `/api/telemetry`, 30 a minute per IP, deny with a 429, never a challenge. `/api/entitlement` keeps its own rule.
- Vercel Web Analytics, Speed Insights, drains and Observability Plus stay off (spec 0011, INV-9). Turning one on changes the privacy policy first.

## Things that will trip you up

- In Next.js 16.3.5 a throw in `src/proxy.ts` never reaches `onRequestError` (the Node proxy looks for the hook in a global only the edge runtime sets), so the proxy catches, reports through `reportCrash` and rethrows (AC-26). On every Next.js upgrade, reread `next/dist/build/templates/middleware.js` and `next/dist/server/web/globals.js`: if the hook starts hearing the proxy, take the catch out, or one throw reports twice. Recount the hook's calls for a failed page too, and check the `routePath` strings in `ROUTE_KINDS`, which were read from real throws.
- The Playwright build sets `NEXT_PUBLIC_TELEMETRY_E2E=1`, so pages post and `tests/e2e/privacy.spec.ts` reads every body, but off Vercel there are no sinks, so the route forwards nothing. A probe build that must see a forward gives `TELEMETRY_SEAMS` fake sinks and a recording `fetch`; without them `reportCrash` and `reportServer` return before `forward`.
- If a visit to `/` never shows in Umami after a deploy, its bot filter refused `TELEMETRY_USER_AGENT`. Swap it for one fixed generic browser string, the same on every event (AC-21).
- Umami's visitor, session and country panels mean nothing: every event arrives from Vercel's servers with one fixed `User-Agent`. Read Umami for event and page totals only.
- `browser-crash` with `kind: "rejection"` is unfiltered by design (AC-17), so it includes Clerk's and extensions' rejections, and those alone can spend a day's page budget. A quiet Sentry day for page reports is no proof that pages worked.

## Tests

- `server-only` throws outside React's server build, so `vitest.config.mts` aliases it, as for `src/billing`.
- `tests/unit/telemetry-events.test.ts` (buckets, `pageKindFor`, every parser refusal, `reportKey`), `telemetry-config.test.ts` (every gate case), `telemetry-server.test.ts` (the outbound requests, the collapse, the page budget and the floods, through the fetch seam), `telemetry-route.test.ts`, `telemetry-client.test.ts`, `telemetry-tool.test.ts`, `telemetry-crashes.test.ts` (the hook), `telemetry-billing.test.ts`, `proxy-crash.test.ts`, and the type gate in `loggable.test.ts`. `tests/component/app/telemetry-reporter.test.tsx` covers the reporter.
- Tests hand `reportServer` and `reportCrash` a fresh `ReportMemory`, and `report` a fresh module or its own `Set`, so no test touches a module's default memory.
- In a real browser: `tests/e2e/privacy.spec.ts` shows `/tool` asks its own server only for the entitlement and posts only to `/api/telemetry`, every body parses and holds no file name, document text or cookie, and GPC stops every count.

_Drafted by /sync from the introducing change, worth a quick human pass._
