# Review, feat/telemetry, 2026-11-04

**Reviewed by**: Sonnet 5.5, a fresh read (author on a different model)
**Scope**: 62 files, branch vs main (merge base 9330557)
**Verdict**: Changes requested

## Summary

The change adds closed-kind counts and failure reports. Pages post them to our own `/api/telemetry` route. The route rebuilds each event from fixed lists and passes it to Umami or Sentry from the server, with no visitor header, cookie or id. On privacy the bar holds. I found no path where free text, a message, a stack, a file name, an id or a visitor header reaches either service. Both CSPs are untouched, the lint zones restate their restrictions, and the console ban is not lifted. The one headline issue is the second half of the bar: several report kinds have no collapse, and a script or a flaky page can use up Sentry's key limit and hide a real `server-crash`.

## Major

### 🟠 Uncollapsed report kinds can use up Sentry's hourly limit and hide real failures, `src/telemetry/server.ts:306` (reportServer), `src/app/telemetry-reporter.tsx:48`, `src/app/api/telemetry/route.ts:96`

**Problem**: Only `server-crash` goes through the once a minute collapse (AC-27). Every other error kind forwards one Sentry event per call:
- `browser-crash` is sent for every `unhandledrejection` and every own origin `error`, with no client side dedupe. Rejections from Clerk's code, extensions or a looping timer each send one.
- `engine-unavailable` is sent on every occurrence, so a browser that cannot load the engine sends one on each visit.
- `plan-check-failed` is sent on every `unknown` answer, so a Polar outage sends one for each `/tool` load by a signed in visitor.
- The route also accepts forged `browser-crash`, `engine-unavailable` and `billing-failed` (welcome, still-waiting) from any same origin script, up to about 30 a minute per IP.

All of these share one Sentry client key, and Go live step 3 sets that key's limit to about 60 events an hour.

**Why it matters**: Once the limit is hit, Sentry drops everything for the rest of the hour, including the `server-crash` and `plan-check-failed` events the owner wants an email for. That is a real failure silenced by something other than the stated collapse, and it happens in exactly the scenario the feature exists for (Polar down, Clerk broken). The Security model says a forged event "can never raise a server alert", but it can still starve the real ones.

**Suggested fix**: Pick one or more of these. (a) Send each browser report kind at most once per page load, per kind and page, in `report` or the reporter. (b) Route `plan-check-failed`, `engine-unavailable` and the other non crash reports through the same window logic as `reportCrash`, keyed on the event's closed fields. (c) Give browser originated events their own Sentry client key or project, so a flood cannot touch server events. Record the choice in the spec, since INV-9 only argues about billing, not about this.

## Minor

### 🟡 `unhandledrejection` reports every rejection, whoever caused it, `src/app/telemetry-reporter.tsx:48`
AC-17 filters `error` events by origin but sends every rejection, including ones from extensions and Clerk's cross origin scripts. This makes the flood above easier and makes `browser-crash` counts noisy. Consider a once per page load cap per kind, or noting in the spec that rejections are unfiltered by design.

### 🟡 An unknown `routeType` is reported as `render`, `src/instrumentation.ts` (`crashReport`)
If a later Next.js adds a route type, the report is filed under `render` and also shares the collapse key with real render failures. That can hide a real render failure for a minute. Falling back to `other` plus a closed `routeType` of its own would be safer, but this is low risk today.

### 🟡 The route does not check `Content-Type`, `src/app/api/telemetry/route.ts:77`
A same origin `text/plain` body parses as JSON. Harmless, since the parser rebuilds every event from fixed lists, but a `Content-Type: application/json` requirement is a cheap extra fence.

### 🟡 No test for the flood path
`tests/unit/telemetry-route.test.ts` and `telemetry-client.test.ts` cover the parser, size cap, origin rule and fire and forget. No test shows what happens when the same browser report arrives many times in a row, which is the gap in the Major above. Add one with whichever fix is chosen.

## Nits

- ⚪ `src/telemetry/client.ts:32`, `doNotTrack` is read only as `"1"`. Older Firefox used `"yes"`. The server checks `DNT: 1` as well, so this is covered in practice.
- ⚪ `src/app/(account)/account/subscribe/page.tsx:57`, `subscribe-started` is reported from a Server Component render. A render retried by Next.js would count twice. Unlikely, and prefetching is already banned.

## Strengths

- `parseTelemetryEvent` is strict and rebuilds the event from the lists. It rejects extra and missing keys, prototype keys (`__proto__`, `constructor`), non plain objects, repeated set items, `"0"` in a by kind map and anything outside a bucket. Its output is a fresh object, never the input.
- The route is carefully built: it answers 413 before reading when `Content-Length` is over the limit, caps a body with no length while streaming, uses `Sec-Fetch-Site` with an `Origin` fallback, reads no cookie, and answers one empty 204 for everything else. `isBrowserEvent` keeps a script from posting a server only event.
- The outbound requests are built from the event and a few constants only. No incoming header is read except `Sec-GPC` and `DNT` for the opt out. The Sentry event has none of `exception`, `stacktrace`, `user`, `request` or `server_name`. The DSN host must end in `.sentry.io`.
- `onRequestError` reads only `routePath` and `routeType`. The proxy catch awaits `reportCrash`, which never rejects, and rethrows the same error, so no failure is lost and nothing is masked. The collapse key is only route and type, set before the await, so concurrent repeats are skipped too.
- The CSP files are not touched and `csp.test.ts` now proves the tool policy unchanged with Umami and Sentry in the list. The lint zones each restate their restrictions. The worker and the other four zones ban all of `@/telemetry`, and the console ban is not lifted.
- Telemetry off is a real no op: `report` returns before `fetch` unless `config.telemetryReporting`, and the server returns at once with no sinks. The build gate (`readTelemetryConfig`) is pure and tested case by case.
- Privacy page claims C5, C7 and C14 to C16 are each tied to a component test, `csp.test.ts` or the e2e proof, and the new section is registered in `policy-sections.ts` first.

## Test coverage

Strong. The parser, bucket edges, route limits and origin rules, outbound request shape, config gate, collapse (fixed clock, concurrent starts, failed send still counts, throwing clock), the proxy catch with rethrow, the hook with an email in the error message, the tool's session transitions, the reporter's listeners, billing seams and the e2e request audit (bodies parse, no cookie, GPC) all have tests. The author's reported 16 new tests are in addition. The gaps are the repeated report case above and a route test that a non JSON content type is refused, if that fence is added.
