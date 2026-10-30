# 0016. Telemetry and error monitoring

**Date**: 2026-10-30
**Status**: Proposed

## Summary

RedactNest starts counting what happens (page visits, documents opened and redacted, refusals, steps toward Pro) and reporting when its code fails, without ever touching a document. Every event is a closed set of kinds and rough ranges (for example `2-5` emails found), carries no id and no cookie, and goes from the page to our own `/api/telemetry` route, which passes it on server to server: usage counts to Umami's free plan, errors to Sentry's free plan with an email alert. Neither service loads a script on any page, `/tool` keeps its `connect-src 'self'`, and the privacy policy changes in the same change. It costs $0 a month in services plus a few cents of Vercel function time, and nothing it does can bill the Vercel budget that pauses the site.

## Amends specs 0001, 0002, 0004, 0005, 0006, 0007, 0011 and 0012

Applied in place by the build (task 17).

| Spec | Section | Change |
|---|---|---|
| 0001 | *Proposed stack*, Observability row | "Deferred to feature 11" becomes "Spec 0016: counts to Umami, errors to Sentry, both forwarded by our own server; nothing from anyone else on `/tool`" |
| 0002 | *Follow-up*, feature 11 inherits INV-4 | Ticked: the gate in `tests/unit/loggable.test.ts` covers `TelemetryEvent` beside `LoggablePayload` (AC-1) |
| 0004 | *Follow-up*, feature 11 counts engine error kinds | Ticked: `run-refused` carries the kind (AC-13) |
| 0005 | *Follow-up*, count `replacement-text` refusals | Note: the counts now arrive (`run-refused`, `blockedByReason`); the item stays open until someone reads a month of them |
| 0006 | *Follow-up*, the three feature 11 items | The `pagesByFinding` item ticked (`pagesWith`, AC-11); the thresholds and `off-page-picture` items note the counts arrive and stay open; the clip only `hidden-text` count stays open (it needs a closed sub kind, not in this catalog) |
| 0007 | *Follow-up*, log `resultCounts` and count refusals | Ticked (AC-12, AC-13) |
| 0011 | Claims register, *Follow-up* | C5 and C7 changed, C14 to C16 added, as *Policy claims* below says; the feature 11 Follow-up ticked, noting the console ban was not lifted because no reporter writes a log |
| 0012 | *Follow-up*, feature 11 | Ticked. "Error reporting stays off `/tool`" is read as "no error reporting script or SDK on `/tool`": `/tool`'s reports go to our own route, like its counts |

## Requirements

**User stories**:
- As the owner, I want a count of each step from a visit to a paid plan, so that I can see where people stop, without ever holding anything about a document.
- As the owner, I want an email when something fails silently (the plan check falling back, the engine failing to load, a paid checkout that never turns into Pro), so that a paying visitor is never capped for days without my knowing.
- As a visitor, I want the site to send only counts that cannot be tied to me, and no counts at all when my browser asks for that, so that the privacy policy holds as written.

**Acceptance criteria**:
- **AC-1**: `TelemetryEvent` in `src/telemetry/events.ts` is a union of exactly the thirteen events in *Data model sketch*. Every field is a closed kind from `src/worker/protocol.ts`, a closed list in `src/telemetry/events.ts`, or a `Bucket`, and no field holds a raw number. The gate in `tests/unit/loggable.test.ts` checks `LoggablePayload | TelemetryEvent`, so `pnpm typecheck` fails if any event gains a free string. `src/worker/protocol.ts` is unchanged, because the worker zone may not import `@/telemetry` (AC-24).
- **AC-2**: `bucket(n)` returns `"0"` for 0, `"1"` for 1, `"2-5"`, `"6-20"`, `"21-50"`, and `"51+"` for anything above 50. A map by kind (`bucketsByKind`) leaves out every kind whose count is 0 or absent, so `"0"` appears only where a field is a single count.
- **AC-3**: `parseTelemetryEvent(value: unknown)` returns a `TelemetryEvent` only when the name is one of the thirteen and every key and value is one that event allows. Anything else returns `null`: an unknown key, a value outside its list, a number, an object where a kind belongs, a repeated item in `stripped`. The reporter and the parser read the same lists, so they cannot disagree.
- **AC-4**: `report(event)` in `src/telemetry/client.ts` sends one event as JSON in a `POST` to `TELEMETRY_PATH` (`/api/telemetry`, in `src/lib/routes.ts`) with `keepalive: true`, `credentials: "omit"` and `cache: "no-store"`. It returns nothing, is never awaited, swallows every failure, never retries and keeps no queue, so nothing the visitor does waits on it or changes when it fails.
- **AC-5**: The reporter sends only when `config.telemetryReporting` is true: `NEXT_PUBLIC_VERCEL_ENV === "production" || NEXT_PUBLIC_TELEMETRY_E2E === "1"`, both read literally in `RAW` in `src/config/index.ts` (`NEXT_PUBLIC_VERCEL_ENV` is added there; only `VERCEL_ENV` is read today). That is a Vercel production build or the Playwright build. Previews, `next dev` and every other build send nothing.
- **AC-6**: In a browser where `navigator.globalPrivacyControl` is `true` or `navigator.doNotTrack` is `"1"`, no usage event is sent (the eight in *Usage events*); error reports still go. On the server, no usage event is sent for a request carrying `Sec-GPC: 1` or `DNT: 1`.
- **AC-7**: `POST /api/telemetry` reads no cookie and sets none. It answers `413` without reading the body when `Content-Length` is over 2048, and stops reading a body that runs past 2048 bytes without one, dropping it with a `204`. Every other request it answers `204` with no body and `Cache-Control: no-store`, forwarding the event only when (a) `Sec-Fetch-Site` is `same-origin`, or that header is absent and `Origin` equals `config.siteUrl`'s origin, (b) `parseTelemetryEvent` accepts it and `isBrowserEvent` does too (`BROWSER_EVENTS`, *Data model sketch*), so a script can't post a server only event such as `server-crash` or `plan-check-failed`, and (c) sinks are configured. Otherwise the event is dropped with the same `204`.
- **AC-8**: An accepted event is forwarded after the answer, inside `after()` (`onRequestError` has no answer to wait for, so it calls `forward` directly and awaits it, as Next.js's docs require): a usage event to Umami's send endpoint, an error event to Sentry's envelope endpoint, each with a 3 second timeout, every failure swallowed and never retried. The outbound request holds only what *Value sourcing* names for that sink and a fixed `User-Agent`. It never holds the visitor's IP address, `User-Agent`, cookie, referrer or any other header of the incoming request.
- **AC-9**: `UMAMI_WEBSITE_ID` and `SENTRY_DSN` are both set or both absent. Each of these fails the build, with every problem in one error as the launch gate does: a build with one value; a Vercel production build with neither; a Vercel build that is not production with either; a Vercel build with `NEXT_PUBLIC_TELEMETRY_E2E` set; a website id that is not a UUID; a DSN that is not `https://<key>@<host>/<project>` on a host ending `.sentry.io`. Off Vercel, sinks are never configured.
- **AC-10**: A reporter mounted once in the root layout sends `page-view` with the page's `PageKind` on every page load and on every client side pathname change. It reads the pathname only, never the query or the hash. A pathname no kind names is `not-found`; files such as `/licence.txt` send nothing.
- **AC-11**: The tool's events come from session transitions: an effect in `tool-client.tsx` compares the previous session with the next. When an open succeeds (the session leaves `opening` for `reviewing`), the tool sends `document-opened` once: `pages` from `summary.pageCount`, `found` and `blocked` from `detectionCounts`, `pagesWith` from `countPagesByFinding(summary.pages)`, and `tier` and `account` from the job's frozen entitlement.
- **AC-12**: When a run completes (the session leaves `redacting` for `complete`), the tool sends `redaction-completed` once, built from `resultCounts` (`removed`, `unticked`, `blockedByKind`, `blockedByReason`, `stripped`) with `tier` and `account`. A rerun sends again.
- **AC-13**: The tool sends `run-refused` when an open fails (`opening` to `failed`, the kind from the new `failure`), when a run is refused (`redacting` back to `reviewing` with a new `runFailure`, which is its kind), and when the session reaches `lost` (kind `engine-unavailable`). `step` is `redact` when the previous state was `redacting`, and `open` otherwise. A free tier `too-many-pages` or `too-large` sends `cap-reached` instead (`cap` is `pages` or `size`, with `account`), so one refusal is one event. A cancel sends nothing. Neither does the silent retry while the engine was still loading (spec 0002, AC-11a): its `worker-lost` and `retry` land in one render, so the session never shows `lost`.
- **AC-14**: `sign-in-completed` is sent by `SignInDone` (`src/app/(account)/sign-in-done.tsx`), a small client component the sign in and sign up pages each render with its `via` prop, when Clerk's `useAuth().isSignedIn` turns true while it is mounted. If the sandbox walk shows Clerk's redirect drops the event, that is recorded here as a known miss and brought back to `/architect`, rather than adding state to the address. `subscribe-started` is sent by the server when Subscribe's outcome is `checkout`, scheduled before the redirect. `subscription-confirmed` is sent when `WelcomePoll` first reaches `pro`, once per page load.
- **AC-15**: `onRequestError` in `src/instrumentation.ts` reports `server-crash` with `route` (`context.routePath` mapped through `ROUTE_KINDS`, or `other`) and `routeType`, and reads nothing else from the error or the request.
- **AC-16**: `/api/entitlement` reports `plan-check-failed`, after its answer, each time it answers `account: "unknown"`.
- **AC-17**: The root layout reporter listens for `error` and `unhandledrejection` on `window`. An `error` event whose `filename` is on the page's own origin sends `browser-crash` with the page kind and `kind: "error"`; every `unhandledrejection` sends it with `kind: "rejection"`; an `error` from another origin (a browser extension) sends nothing. The message, filename, line and stack are read only for that origin test and never sent.
- **AC-18**: When the session records `engine-unavailable` (an open failing with it, or the session reaching `lost`), the tool sends the `engine-unavailable` error report too, once per occurrence. A silently retried loss sends nothing (AC-13).
- **AC-19**: Subscribe reports `billing-failed` with `action: "subscribe"` and its outcome for `plan-unknown`, `customer-conflict`, `other-product` and `checkout-failed`. Manage billing reports `action: "portal"` for `portal-failed`. Delete account reports `action: "delete"` for `billing-failed` and `sign-in-kept`, from `deleteAccountAction` in `src/app/(account)/account/actions.ts`. `WelcomePoll` reports `action: "welcome"` with `still-waiting` when a round ends without Pro. No argument, email, id or message from a billing seam is read into a report.
- **AC-20**: Each error event becomes one Sentry event. Its message is the event's name, its tags are its fields, and its fingerprint is the name plus its `route`, `page` or `action`. It carries `level: "error"`, `platform: "node"`, `environment: "production"`, `release` set to the commit this build came from, a fresh random `event_id` and the server's time. The envelope's header is `{ event_id, sent_at, dsn }` and its one item header is `{ type: "event" }`; the `dsn` header is the authentication. It carries no `exception`, `stacktrace`, `breadcrumbs`, `user`, `request`, `contexts`, `extra` or `server_name`.
- **AC-21**: A `page-view` becomes an Umami page view for the page's path (*Value sourcing*). Every other usage event becomes an Umami event named as in the catalog, with its fields flattened (`found_email: "2-5"`) and the hostname from `config.siteUrl`. `stripped` becomes one `true` property per kind present (`stripped_annotations: true`), and a by kind map with nothing in it adds no property. It carries no referrer, language, screen or title. Its `User-Agent` is the fixed string Umami's docs give for server sends; if Umami's bot filter refuses that, one fixed generic browser string, the same on every event and never the visitor's. The worst case event (every kind present) fits Umami's property limit, read from Umami's docs at build. If the limit is lower, `redaction-completed` splits as *Data model sketch* says.
- **AC-22**: The privacy policy changes as *Policy claims* says. `src/lib/policy-sections.ts` gains the h2 "Counts and error reports" after "What we receive when you visit". `OUTSIDE_SERVICES` gains Umami and Sentry with no origin, every fact read from each service's own pages on the day. `src/lib/policy-changes.ts` gains an entry at the top dated the day it ships. Both content security policies stay byte for byte as they are today.
- **AC-23**: `tests/e2e/privacy.spec.ts` shows, on a real open and run, that `/tool` asks its own server only for the entitlement and posts only to `/api/telemetry`. Every telemetry body parses with `parseTelemetryEvent` and holds neither the file's name, nor any text of the document, nor any match. No telemetry request carries a `Cookie` header. With GPC on, no usage event is posted.
- **AC-24**: `src/telemetry/server.ts` and `src/config/telemetry.ts` import `server-only`, and the two values are read only in `src/config/telemetry.ts`. Lint lets only the importers *Security model* names reach `@/telemetry/server` or `@/config/telemetry`, and keeps all of `@/telemetry` out of `src/engine`, `src/detect`, `src/worker` and `src/ui`. The console ban stays whole in every zone (spec 0011, AC-15), so claim C8 stays true.
- **AC-25**: Before the merge that ships this, *Go live* steps 1 to 6 are done: the Umami website and the Sentry project exist, the two values are set for Production only, the separate firewall rule is in place, Sentry's alert rules, key limit and IP setting are set, and Vercel's metered analytics are confirmed off. After the deploy, step 7's visit and test error each arrive.

## Decision

**Chosen option**: Option 2, our own route forwarding to Umami Cloud (usage) and Sentry (errors), both on free plans, both called by plain HTTP with no SDK.

Every page reports closed events to `/api/telemetry`. The route checks and forwards them server to server, so no outside script, cookie or origin reaches any page. Options and reasoning: [rationale.md](rationale.md).

Decisions made in the design (each with its runner up in [rationale.md](rationale.md), *Small choices*): no SDK for either service; forward inside `after()`; `204` for every read body; `cap-reached` instead of `run-refused`; `still-waiting` as a billing failure; `sign-in-completed` on Clerk's signed in transition; the console ban not lifted; an e2e build flag for the browser proof; a new capability folder `src/telemetry`; no bot filter.

## Rationale

Reasoning, options and costs: see [rationale.md](rationale.md).

## Feature design

**Data model sketch**: no persistence. The events are the model, and we store none of them; history lives in Umami (6 months) and Sentry (30 days).

`Bucket` = `"0" | "1" | "2-5" | "6-20" | "21-50" | "51+"`. `PageKind` = `home | tool | pricing | privacy | terms | sign-in | sign-up | account | billing | welcome | not-found` (any path under `/account` that the list doesn't name, such as Subscribe's failure page, is `account`). `Tier` = `free | paid`; `account` is `EntitlementAccount`.

*Usage events* (to Umami; not sent under GPC or DNT):

| Event | Sent by | Fields (all required unless marked) |
|---|---|---|
| `page-view` | browser, root layout reporter | `page: PageKind` |
| `document-opened` | `/tool` | `pages: Bucket`, `found: Partial<Record<DetectorKind, Bucket>>`, `blocked: Partial<Record<BlockedReason, Bucket>>`, `pagesWith: Partial<Record<PageFinding, Bucket>>`, `tier`, `account` |
| `redaction-completed` | `/tool` | `removed`, `unticked`, `blockedByKind: Partial<Record<DetectorKind, Bucket>>`, `blockedByReason: Partial<Record<BlockedReason, Bucket>>`, `stripped: readonly SanitizedKind[]` (no repeats), `tier`, `account` |
| `run-refused` | `/tool` | `kind: EngineErrorKind`, `step: "open" \| "redact"`, `tier`, `account` |
| `cap-reached` | `/tool` | `cap: "pages" \| "size"`, `account` |
| `sign-in-completed` | browser, `SignInDone` | `via: "sign-in" \| "sign-up"` |
| `subscribe-started` | server, Subscribe | none |
| `subscription-confirmed` | browser, `WelcomePoll` | none |

*Error reports* (to Sentry; always sent):

| Event | Sent by | Fields |
|---|---|---|
| `server-crash` | server, `onRequestError` | `route: RouteKind`, `routeType: "render" \| "route" \| "action" \| "proxy"` |
| `plan-check-failed` | server, `/api/entitlement` | none |
| `browser-crash` | browser, root layout reporter | `page: PageKind`, `kind: "error" \| "rejection"` |
| `engine-unavailable` | `/tool` | none |
| `billing-failed` | server (Subscribe, Manage billing, Delete account); browser (`WelcomePoll`) | `action: "subscribe" \| "portal" \| "delete" \| "welcome"`, `outcome: "plan-unknown" \| "customer-conflict" \| "other-product" \| "checkout-failed" \| "portal-failed" \| "billing-failed" \| "sign-in-kept" \| "still-waiting"` |

`RouteKind` = `home | tool | pricing | privacy | terms | not-found | entitlement | telemetry | account | subscribe | billing | welcome | sign-in | sign-up | proxy | other`. `ROUTE_KINDS` maps each route file's `routePath`, as Next.js 16 reports it, to a kind. The build reads the real strings by throwing once in each route locally and records them in the map's comment; `routeType: "proxy"` maps to `proxy` whatever the path.

`BROWSER_EVENTS`, the only events `/api/telemetry` forwards (AC-7): `page-view`, `document-opened`, `redaction-completed`, `run-refused`, `cap-reached`, `sign-in-completed`, `subscription-confirmed`, `browser-crash`, `engine-unavailable`, and `billing-failed` only with `action: "welcome"` and `outcome: "still-waiting"`. Everything else (`subscribe-started`, `server-crash`, `plan-check-failed` and the server's `billing-failed`) is sent by server code alone.

Relationships: none, on purpose. No id, no session, no timestamp from the browser, no join key: the funnel is read from totals. Sentry's `event_id` is made fresh on the server for each report and links nothing.

Split, only if Umami's property limit is below `redaction-completed`'s worst case (38 properties: 7 removed, 7 unticked and 7 blocked detector kinds, 4 blocked reasons, 11 stripped kinds, plus `tier` and `account`): it becomes `redaction-completed` (`removed`, `stripped`, `tier`, `account`) and `redaction-left` (`unticked`, `blockedByKind`, `blockedByReason`), both sent at the same moment.

**State transitions**: none of its own. Events fire on transitions that already exist: the session leaving `opening` or `redacting`, or reaching `lost` (AC-11 to AC-13); Clerk's signed in flag turning true under `SignInDone`; `WelcomePoll`'s phase reaching `pro` or `still-waiting`; Subscribe's, Manage billing's and Delete account's outcome kinds; `/api/entitlement`'s `unknown` answer; a server request erroring.

**API surface**:

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `/api/telemetry` | POST | JSON body: one `TelemetryEvent`, at most 2048 bytes; `Sec-Fetch-Site` or `Origin` | `204`, no body, `Cache-Control: no-store` | none; cookies never read (sent with `credentials: "omit"`) | `413` body over 2048; `405` any other method; anything invalid is a silent `204` |
| Umami send (outbound) | POST | `{ type: "event", payload: { website, hostname, url, name?, data? } }` | ignored | the website id | any failure swallowed |
| Sentry envelope (outbound) | POST `/api/<project>/envelope/` | an envelope header with `dsn`, one `event` item (AC-20) | ignored | the DSN's public key | `429`, `403` or a timeout swallowed |
| `onRequestError` (hook) | none | `error`, `request`, `context` | none | none | never throws |

The exact Umami endpoint (the region chosen at sign up) and the `User-Agent` it accepts are read from Umami's docs at build and written as `UMAMI_SEND_URL` and `TELEMETRY_USER_AGENT` in `src/telemetry/server.ts`, each with the date read, like the facts in `src/config/privacy.ts`. They are rules about a service, not caps on the visitor.

**Value sourcing**:

| Action | Value | Source |
|---|---|---|
| any browser event | whether to send | `config.telemetryReporting` (AC-5), then GPC and DNT for usage events (AC-6) |
| `page-view`, `browser-crash` | `page` | `usePathname()` mapped by `pageKindFor` against the paths in `src/lib/routes.ts` |
| `document-opened` | `pages` | `bucket(summary.pageCount)` |
| `document-opened` | `found`, `blocked` | `bucketsByKind` over `detectionCounts(session.matches)` (`src/lib/detectors.ts`) |
| `document-opened` | `pagesWith` | `bucketsByKind` over `countPagesByFinding(summary.pages)` |
| tool events | `tier`, `account` | the job's frozen `EntitlementSnapshot` (spec 0002) |
| `redaction-completed` | `removed`, `unticked`, `blockedByKind`, `blockedByReason`, `stripped` | `resultCounts(...)` (spec 0007): `removedByType`, `untickedByType`, `blockedByType`, `blockedByReason`, `sanitized` |
| `run-refused` | `kind`, `step` | the next session's new `failure` (an open) or `runFailure` (a run), or `engine-unavailable` on reaching `lost`; `step` from the previous session's state (`redacting` is `redact`, anything else `open`) |
| `cap-reached` | `cap` | `too-many-pages` is `pages`, `too-large` is `size`, only when the snapshot's tier is `free` |
| `sign-in-completed` | `via` | the `via` prop the sign in page (`"sign-in"`) or sign up page (`"sign-up"`) passes to `SignInDone` |
| `server-crash` | `route`, `routeType` | `context.routePath` through `ROUTE_KINDS`; `context.routeType` |
| `billing-failed` | `action`, `outcome` | the page or action that ran (Subscribe's page, Manage billing's page, `deleteAccountAction`), and its outcome `kind` (`src/billing/subscribe.ts`, `portal.ts`, `delete.ts`), or `WelcomePoll`'s `still-waiting` phase |
| server usage events | GPC or DNT | the request's `Sec-GPC` and `DNT` headers, through `headers()` |
| Umami | `website` | `UMAMI_WEBSITE_ID` |
| Umami | `hostname` | the host of `config.siteUrl` |
| Umami | `url` | the page path for `page-view` (`TOOL_PATH` and the rest from `src/lib/routes.ts`, `/404` for `not-found`); for other events, the path of the page that sent it (`TOOL_PATH` for tool events, `SIGN_IN_PATH` or `SIGN_UP_PATH`, `SUBSCRIBE_PATH`, `WELCOME_PATH`) |
| Sentry | the ingest address, project and key | parsed from `SENTRY_DSN` |
| Sentry | `release` | `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, the commit `config.sourceUrl` is built from |
| Sentry | `event_id`, `timestamp` | `crypto.randomUUID()` without dashes, and the server clock, at forward time |
| Sentry | `environment` | the constant `"production"` (only production forwards, AC-9) |

**Key invariants**:
- **INV-1**: Counts and kinds only. Every event is closed (AC-1, AC-3), and no raw count leaves the browser or the server, only buckets.
- **INV-2**: Nothing ties two events to each other or to a person. There's no id and no cookie (`credentials: "omit"`, and the route reads none), and no visitor detail is forwarded (AC-8).
- **INV-3**: Telemetry never changes what a visitor sees or waits for. It is never awaited, never throws into a caller and never retries (AC-4, AC-8).
- **INV-4**: Nothing from anyone else on any page, and no new origin anywhere. No Umami or Sentry script or SDK exists in the bundle; forwarding is server to server; their `OUTSIDE_SERVICES` entries name no origin; `/tool`'s policy is unchanged (spec 0001, spec 0011 INV-2).
- **INV-5**: No metered Vercel product. Web Analytics, Speed Insights, Observability Plus and drains stay off (spec 0011, INV-9, unchanged). The only Vercel cost is function time for `/api/telemetry`, held down by the firewall rule.
- **INV-6**: An opt out stops usage counts, never error reports (AC-6).
- **INV-7**: Our own code still writes no log (claim C8, spec 0011 AC-15).
- **INV-8**: Production only (AC-5, AC-9).
- **INV-9**: A quota can only drop events, never bill. Both services are on free plans with no card on file (*Go live*), so a flood costs data, never money.

**Security model**: anonymous throughout. The browser sends events with no cookie; the route trusts nothing it receives and forwards only what the parser rebuilds from closed lists, so a forged event can skew the counts but can't carry text anywhere, and it can never be a server only event (`BROWSER_EVENTS`), so a script can't trigger the server alerts. Same origin requests only (AC-7) stop other sites using their visitors' browsers; a script calling the route directly is held to about 30 a minute per IP by the firewall rule. The two values are server only, never `NEXT_PUBLIC_`: the website id and the DSN never reach a browser, so nobody can post to our Umami or Sentry projects directly from a page. Importers: `@/config/telemetry` is imported only by `src/telemetry/server.ts` and `src/app/layout.tsx` (for the build gate). `@/telemetry/server` is imported only by `src/app/api/telemetry/route.ts`, `src/app/api/entitlement/route.ts`, `src/instrumentation.ts` and the `(account)` group. `@/telemetry/client` and `@/telemetry/events` are imported by `src/app` and `src/lib`. Billing seams are never handed to telemetry: a page passes its outcome `kind`, never the outcome object. **Compliance scope**: UK GDPR and EU GDPR. The events hold no identifier and no IP, so they are meant to be anonymous. The policy still names both services, their location, safeguard and retention, and the legal basis (legitimate interests: keeping the service working and improving it). Global Privacy Control is honoured for usage counts (AC-6). **Audit**: none of our own, by design (spec 0001).

**Policy claims** (spec 0011's register; the words are the owner's to read before merge, each claim holding only what the named tests hold):

| # | The claim, in meaning | Held by |
|---|---|---|
| C5 (changed by spec 0016) | Apart from loading the page and its own files, the tool page asks our server which plan applies, and tells it counts of what happened (C14). The plan question carries your sign in cookie if you have one; the counts carry no cookie, and nothing about your document | AC-4, AC-7, AC-23; spec 0012's AC-1 tests as before |
| C7 (changed by spec 0016) | No advertising, no tracking across sites and no cookies for analytics. We count what happens on the site and report when our code fails (C14, C15). The only script from anyone else is Clerk's, on the sign in and account pages | INV-4, `csp.test.ts` and `headers.spec.ts` unchanged, AC-22 |
| C8 (kept) | Our own code keeps no logs | AC-24, spec 0011 AC-15 |
| C14 (new) | We count page visits, documents opened and redacted, refusals and steps toward Pro, by kind and in ranges (for example 2 to 5 email addresses found). Never your document, its name, its words or what was found in it. A count carries no id and no cookie, so no two counts can be tied together or to you. Our server passes them to Umami, which never receives your IP address or browser details, and keeps them for the time its entry states | AC-1 to AC-4, AC-8, AC-21, AC-23 |
| C15 (new) | When something breaks, our server tells Sentry what kind of failure happened and where, never an error message, your document or anything about you. Sentry keeps it for the time its entry states | AC-8, AC-15 to AC-20 |
| C16 (new) | If your browser sends Global Privacy Control or Do Not Track, it sends no counts and our server counts nothing for it. Failure reports still go, because they say nothing about you | AC-6, AC-23 |

**Configuration required**:
- `UMAMI_WEBSITE_ID`: the Umami Cloud website id (a UUID). Server only, Production only.
- `SENTRY_DSN`: the Sentry project's DSN (data source name: the address and public key events are sent to). Server only, Production only.
- `NEXT_PUBLIC_TELEMETRY_E2E`: `1` only in `tests/e2e/build-env.ts`, so the Playwright build's browser sends events the privacy test can read. A Vercel build refuses it (AC-9).
- `NEXT_PUBLIC_VERCEL_ENV`: Vercel's own, already exposed ("Automatically expose System Environment Variables" stays on) but not read yet; task 2 adds it to `RAW` literally.
- `.env.example` lists the two values, commented as Production only.

**Critical test scenarios**:
- Happy path: open and redact a fixture on the Playwright build, collecting every request: one `page-view` (tool), one `document-opened` and one `redaction-completed`, each parsing, with no cookie and no document text, alongside the entitlement request, verifies **AC-4**, **AC-11**, **AC-12**, **AC-23**.
- Closed lists: `parseTelemetryEvent` refuses an extra key, a free string, a raw number, an unknown kind and a repeated stripped kind; `pnpm typecheck` fails on a string field added to an event, verifies **AC-1**, **AC-3**.
- Opt out: with `navigator.globalPrivacyControl` true, the same run posts no usage event; a forced worker crash still posts `engine-unavailable`; the server skips `subscribe-started` for `Sec-GPC: 1`, verifies **AC-6**.
- Route: a body of 2049 bytes gets `413`; a cross site `Sec-Fetch-Site`, a bad event, a well formed `server-crash` or `plan-check-failed`, and a missing sink each get `204` with no forward; a request with a cookie is answered identically and the cookie is never read, verifies **AC-7**.
- Forwarding: through a fetch seam, the Umami and Sentry requests hold only the allowed fields, carry no header from the incoming request, and a sink that hangs past 3 seconds or answers `500` changes nothing, verifies **AC-8**, **AC-20**, **AC-21**.
- Gate: one value set, production with none, preview with one, the e2e flag on Vercel, a bad UUID and a non Sentry DSN each fail with one listed problem, verifies **AC-9**.
- Cap: a free visitor opening a 4 page fixture sends one `cap-reached` and no `run-refused`; a paid visitor over the paid cap sends `run-refused`, verifies **AC-13**.
- Crashes: an `error` event from our origin sends `browser-crash`; one with an extension's `chrome-extension://` filename sends nothing; a thrown route handler sends `server-crash` with its kind and nothing from the message, verifies **AC-15**, **AC-17**.

## Build plan

Skateboard: slice 1 is the thinnest whole that works (the tool's counts reach Umami through the route, gated and walled). Slices 2 and 3 grow it, and slice 4 makes it publishable. All four ship in one merge, because the policy must change in the same change as the first production event. *Go live* comes before the merge, because the gate fails a production build without the values.

*Slice 1: the tool's counts reach Umami*
1. `src/telemetry/events.ts`: the catalog as frozen lists, `TelemetryEvent`, `Bucket`, `bucket`, `bucketsByKind`, `PageKind`, `pageKindFor`, `parseTelemetryEvent`, `BROWSER_EVENTS` and `isBrowserEvent`; `TelemetryEvent` added to the gate in `tests/unit/loggable.test.ts` (never to `src/worker/protocol.ts`); unit tests for the bucket edges (0, 1, 2, 5, 6, 20, 21, 50, 51), `pageKindFor` and every parser refusal, satisfies **AC-1**, **AC-2**, **AC-3**, **AC-10**.
2. `src/config/telemetry.ts` (server only, beside `billing.ts`): reads and checks the two values per AC-9 and exports `telemetrySinks` (null, or the website id, the parsed DSN and `release`); `NEXT_PUBLIC_VERCEL_ENV` and `NEXT_PUBLIC_TELEMETRY_E2E` read literally in `RAW` and `config.telemetryReporting` in `src/config/index.ts` (AC-5); `NEXT_PUBLIC_TELEMETRY_E2E` set in `tests/e2e/build-env.ts`; `.env.example`; the layout imports the gate; `tests/unit/telemetry-config.test.ts` with every case, satisfies **AC-5**, **AC-9**.
3. `src/telemetry/server.ts`: `forward(event, seams)` with the Umami builder, `UMAMI_SEND_URL`, `TELEMETRY_USER_AGENT`, the 3 second timeout and a fetch seam; `reportServer(event, requestHeaders)` that applies AC-6's header rule to usage events and schedules `forward` in `after()` (request code only; `onRequestError` calls `forward` itself); unit tests on the outbound request, satisfies **AC-6**, **AC-8**, **AC-21**.
4. `src/app/api/telemetry/route.ts` and `TELEMETRY_PATH` in `src/lib/routes.ts`: AC-7 in order (length, origin, parse, `isBrowserEvent`), then `reportServer(event, request.headers)`, which drops it when no sinks are configured or GPC or DNT is set; `204` throughout; route tests, satisfies **AC-7**, **AC-8**.
5. `src/telemetry/client.ts` (`report`, the GPC and DNT check, the gate) and `src/app/telemetry-reporter.tsx` in the root layout sending `page-view` on load and pathname change; unit and component tests, satisfies **AC-4**, **AC-5**, **AC-6**, **AC-10**.
6. Tool events: a pure `toolEvents(previous, next)` in `src/telemetry/tool.ts` turning a session transition into its events (opened, completed, refused, cap reached), called from an effect in `tool-client.tsx` that keeps the previous session in a ref; unit tests for each transition, including the free cap, cancel and silent retry (`worker-lost` then `retry` in one batch, no event) cases, satisfies **AC-11**, **AC-12**, **AC-13**.
7. The `redactnest/telemetry` zone in `eslint.config.mjs` through `zone()`, passing `BILLING_IMPORTS` and `BILLING_SYNTAX`; the importer walls for `@/telemetry/server` and `@/config/telemetry`; `@/telemetry` banned in the engine, detect, worker and ui zones; lint sample tests, satisfies **AC-24**.

*Slice 2: errors reach Sentry and alert*
8. The Sentry envelope builder in `server.ts` (AC-20's fields only, the fingerprint, `release`); tests that list the event's keys exactly, satisfies **AC-20**.
9. `src/instrumentation.ts` with `onRequestError` (calling `forward` directly and awaiting it, AC-8) and `ROUTE_KINDS` (the real `routePath` strings read locally and recorded); tests with sample contexts and an error carrying an email in its message, satisfies **AC-15**.
10. `/api/entitlement` reports `plan-check-failed` through `reportServer` for `unknown`, satisfies **AC-16**.
11. The `error` and `unhandledrejection` listeners in the root layout reporter with the origin test; `engine-unavailable` from `toolEvents` beside `run-refused`; tests, satisfies **AC-17**, **AC-18**.
12. `billing-failed` from Subscribe's page, Manage billing's page and `deleteAccountAction` (server, passing only the outcome `kind`) and from `WelcomePoll`'s `still-waiting` (browser); tests that no seam argument reaches a report, satisfies **AC-19**.

*Slice 3: the funnel outside the tool*
13. `SignInDone` (`src/app/(account)/sign-in-done.tsx`, a client component) rendered by the sign in and sign up pages with `via`, sending `sign-in-completed` when `useAuth().isSignedIn` turns true, and checked on the sandbox walk; `subscribe-started` in Subscribe's `checkout` case through `reportServer`, with the GPC header test; `subscription-confirmed` in `WelcomePoll` on reaching `pro`, satisfies **AC-6**, **AC-14**.

*Slice 4: the policy, the proof and the amends*
14. Umami and Sentry entries in `OUTSIDE_SERVICES` (no origins), every fact read from each service's privacy policy, DPA and retention docs on the day and commented with that date, as the Polar entry is; `csp.test.ts` proves both policies unchanged, satisfies **AC-22**.
15. Claims: `policy-sections.ts` first, then the privacy page (C5 and C7 rewritten, the new section with C14 to C16), the change entry in `policy-changes.ts`, and `legal-pages.test.tsx` cases, satisfies **AC-22**.
16. `tests/e2e/privacy.spec.ts`: the tool's request test rewritten to allow `/api/telemetry` and check every body, plus a GPC case (an init script setting `navigator.globalPrivacyControl` and the `Sec-GPC` header), satisfies **AC-23**.
17. Specs 0001, 0002, 0004, 0005, 0006, 0007, 0011 and 0012 amended as *Amends* says; your read of every word of the policy change before merge, satisfies **AC-22**.

## Go live

Your steps, before the merge (steps 1 to 6) and after the deploy (step 7). Satisfies **AC-25**.

1. Umami Cloud: a free Hobby account with no card, in the EU region if offered; one website for `redactnest.com`. Record its retention and region in the Umami entry (task 14).
2. Sentry: a free Developer organisation with no card, in the EU data region if offered (it is chosen at creation and cannot move); one project. Record the error quota you see (sources disagree on 5K and 50K) and the retention in `rationale.md` and the Sentry entry.
3. Sentry settings: an alert on a new issue, and on any issue seen more than 10 times in an hour, both by email; a rate limit on the DSN's client key of about 60 events an hour; spike protection on; "Prevent Storing of IP Addresses" on.
4. Vercel: `UMAMI_WEBSITE_ID` and `SENTRY_DSN` for Production only, never Preview or "All Environments" (AC-9 fails a preview build that has either).
5. Vercel firewall: a second, separate rate limit rule for `/api/telemetry` only, about 30 a minute per IP, action deny with a 429, never a challenge (spec 0012, INV-12). `/api/entitlement`'s rule stays as it is. Check it: past the limit from one address, the route answers 429 with no `Set-Cookie` and no challenge page.
6. Vercel: confirm Observability Plus, Web Analytics, Speed Insights and drains are off (spec 0011, INV-9). Observability Plus is on by default for Pro teams created or upgraded from 3 April 2026, and it bills $1.20 per million events from the same budget.
7. After the deploy: visit the home page and see the visit in Umami. Trigger one error with a request that makes the route fail, or the plan check fall back with a revoked token on a test account, and see the email arrive.

## Consequences

**Positive**:
- The funnel is visible end to end (visit, open, complete, cap, sign in, subscribe, confirmed), and the silent failures spec 0012 worried about (the plan check, a paid checkout without Pro) now email you.
- Specs 0004 to 0007 get the refusal and finding counts their Follow-ups wait on.
- The privacy story stays structural: closed types and a parser, not a scrubber. There is nothing to scrub because there is nowhere to put anything (spec 0002).
- $0 a month in services, and no path from a flood of events to the budget that pauses the site.

**Negative / tradeoffs**:
- No per visitor funnel: conversion is read from totals, so a visitor who opens three documents and one who opens one look the same.
- Debugging is slower: a report says only kind and where. The stack is in Vercel's runtime logs, which Next.js writes and Vercel keeps for one day.
- Two more outside services in the policy, and in feature 17's DPA, each with free terms that can change. A change to billing would break INV-9 and must come back here.
- History is short: Umami's free plan keeps 6 months, Sentry's 30 days.
- Counts are approximate: GPC and DNT browsers send none, bots that run scripts are counted, anyone can post forged but well formed browser events within the firewall limit, and visitors sharing one address (an office network) lose events past about 30 a minute.
- Umami's visitor, session and country panels mean nothing here: every event reaches Umami from Vercel's servers with one fixed `User-Agent`, so it sees one visitor in the function's region. Read Umami for event and page totals only.
- Every event costs a Vercel function call. That's a few cents a month at expected volumes, but it's no longer zero, and the per unit rates weren't confirmed.
- One more place a production build can fail (AC-9). It fails safe: the last deploy stays live.

**Neutral**:
- A new capability folder, `src/telemetry`, with its own lint zone. `AGENTS.md`'s folder list and walls need it (`/sync`).
- `/tool` posts to a second same origin path. `connect-src 'self'` already allows it, so neither policy changes.
- The scope's note that "the console ban lifts narrowly for its one reporter" no longer applies. No reporter writes a log.

## Follow-up

- [ ] Agent Skills and MCP servers for Umami and Sentry (deferred by you, 2026-10-30): a Sentry MCP server would let the agent read issues directly while debugging, and a Sentry or Umami skill would carry their API conventions. Offer again when errors start arriving.
- [ ] Read a month of counts, then bring back to `/architect` what they settle: spec 0006's thresholds (`bare-picture`, `hidden-text`) and `off-page-picture`, spec 0005's `replacement-text` refusals, and spec 0007's named refused item.
- [ ] If page visits look inflated by automated browsers, measure and consider skipping `navigator.webdriver` (it would also need the e2e flag to keep the privacy proof).
- [ ] Feature 17 (DPA) lists Umami and Sentry; feature 16 (security page) explains what the counts hold, linking claims C14 to C16 rather than restating them.
- [ ] `/sync`: the scope's feature 11 "Also owed" line about lifting the console ban, `AGENTS.md`'s capability folders and its telemetry wall rule.
- [ ] Revisit if either free plan starts to bill, drops its quota below the month's volume, or changes what it records about a sender.
