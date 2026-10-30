# Verify: Telemetry and error monitoring · spec 0016

_Steps derived from spec 0016's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run against the Playwright build (`tests/e2e/build-env.ts`, which sets `NEXT_PUBLIC_TELEMETRY_E2E=1` and no sink values), served with `pnpm start`. In the browser, watch the network log for `POST /api/telemetry` and read each request's body and headers. Fixtures come from `tests/fixtures`, written by `node scripts/make-fixture.mjs`. Server side forwarding has no sinks here, so it is checked through the unit tests that use the fetch seam.

## UI / manual

- [ ] Load `/` → one `POST /api/telemetry` with `{"name":"page-view","page":"home"}`; its request has no `Cookie` header; the answer is `204` with no body and `Cache-Control: no-store` → AC-4, AC-7, AC-10
- [ ] Click Pricing from the header (a client side navigation) → one `page-view` with `page: "pricing"`; open `/privacy?x=1#y` → `page: "privacy"`, and nothing from the query or hash appears in the body → AC-10
- [ ] Open a path that doesn't exist → `page: "not-found"`; open `/licence.txt` → no telemetry request → AC-10
- [ ] On `/tool`, open a two page fixture with emails and phones → `page-view` (tool) and one `document-opened` whose `pages` is `"2-5"` and whose `found`, `blocked` and `pagesWith` hold buckets only, with no zero kind and `tier` and `account` from the plan line; tick, redact → one `redaction-completed` with `removed`, `unticked`, `blockedByKind`, `blockedByReason` and `stripped` matching the result card → AC-11, AC-12
- [ ] In every telemetry body from that run, search for the file's name, any word of the document and any match's text → none found; the only other request `/tool` made to its own server is `GET /api/entitlement` → AC-23
- [ ] Redact the same document again (rerun) → a second `redaction-completed`; cancel a run → no event; kill the worker while the phase is still `loading-engine` (the silent retry) → no event → AC-12, AC-13
- [ ] As a free visitor, open a fixture over the free page cap → one `cap-reached` with `cap: "pages"` and no `run-refused`; open an encrypted fixture → one `run-refused` with `kind: "encrypted"`, `step: "open"` → AC-13
- [ ] Block `/engine/` in the browser's request blocking and open a fixture → `run-refused` with `engine-unavailable` and the `engine-unavailable` error report → AC-13, AC-18
- [ ] With an init script setting `navigator.globalPrivacyControl = true` and the `Sec-GPC: 1` header, repeat the open and redact → no usage event is posted; the blocked engine case still posts `engine-unavailable` → AC-6, AC-23
- [ ] In the console, run `setTimeout(() => { throw new Error("x") })` → a `browser-crash` with `kind: "error"` and the page kind; run `Promise.reject(new Error("x"))` → `kind: "rejection"`; neither body holds `x`, a filename or a line → AC-17
- [ ] Send `POST /api/telemetry` with a 2049 byte body → `413`; with `Sec-Fetch-Site: cross-site` and a valid event → `204`; with an extra key, a raw number or an unknown kind → `204`; a well formed `server-crash`, `plan-check-failed` or `subscribe-started` → `204` and, in the route test, no forward; `GET /api/telemetry` → `405` → AC-7
- [ ] Sign in with a test account on the sign in page → `SignInDone` posts `sign-in-completed` with `via: "sign-in"` before Clerk's redirect (and `via: "sign-up"` for a new account); if Clerk's redirect drops it, record the miss in the spec and bring it to `/architect` → AC-14
- [ ] Hit `/account/subscribe` with billing seams that answer `checkout` (the sandbox walk, as in spec 0012's task 13) → the server schedules `subscribe-started`; on the welcome page reaching Pro → `subscription-confirmed`; with a plan that never turns Pro → `billing-failed` with `action: "welcome"`, `outcome: "still-waiting"` → AC-14, AC-19

## Code and records

- [ ] `tests/unit/loggable.test.ts`'s gate checks `LoggablePayload | TelemetryEvent`; adding a `string` field to any event fails `pnpm typecheck`; `git diff main -- src/worker/protocol.ts` is empty → AC-1
- [ ] The bucket tests cover 0, 1, 2, 5, 6, 20, 21, 50 and 51; the parser tests refuse every shape AC-3 names → AC-2, AC-3
- [ ] `tests/unit/telemetry-config.test.ts` fails the build for one value, production with none, preview with either, the e2e flag on Vercel, a bad UUID and a non Sentry DSN, each with its problem named → AC-9
- [ ] The forwarder tests, through the fetch seam: the Umami request holds only `website`, `hostname`, `url`, `name` and `data` with flattened buckets; the Sentry envelope's event holds exactly `event_id`, `timestamp`, `level`, `message`, `tags`, `fingerprint`, `environment`, `release` and `platform`; neither carries any header from the incoming request; a sink answering `500` or hanging past 3 seconds is swallowed → AC-8, AC-20, AC-21
- [ ] Umami's property limit is recorded beside `UMAMI_SEND_URL` with the date read, and `redaction-completed`'s worst case (38) is under it, or the split is built → AC-21
- [ ] The `onRequestError` tests: `ROUTE_KINDS` holds the real `routePath` strings recorded from a local throw in each route; an error whose message holds an email reports only `route` and `routeType` → AC-15
- [ ] `/api/entitlement`'s test: an `unknown` answer schedules `plan-check-failed`; `none` and `signed-in` schedule nothing → AC-16
- [ ] The billing tests: each failing outcome reports its `action` and `outcome` and nothing from the seams; a `chrome-extension://` error sends nothing → AC-17, AC-19
- [ ] `pnpm lint` rejects `@/telemetry/server` or `@/config/telemetry` imported outside *Security model*'s list, `@/telemetry` in `src/engine`, `src/detect`, `src/worker` and `src/ui`, and `console` in `src/telemetry` → AC-24
- [ ] `csp.test.ts` and `headers.spec.ts` pass unchanged; `OUTSIDE_SERVICES` has Umami and Sentry with empty origin lists and dated facts; the privacy page has "Counts and error reports" after "What we receive when you visit", C5 and C7 rewritten and C14 to C16; `policy-changes.ts` has the new entry at the top → AC-22
- [ ] Specs 0001, 0002, 0004, 0005, 0006, 0007, 0011 and 0012 read as *Amends* says → AC-22

## Go live (your steps, after the merge's deploy)

- [ ] *Go live* steps 1 to 6 done before the merge; the production build passed the gate → AC-9, AC-25
- [ ] Past about 30 requests a minute from one address, `/api/telemetry` answers `429` with no `Set-Cookie` and no challenge page → AC-25
- [ ] A visit to `/` shows in Umami; a deliberate failure shows in Sentry and its email arrives → AC-25
