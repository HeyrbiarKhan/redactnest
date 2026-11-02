# Verify: Telemetry and error monitoring · spec 0016

_Steps derived from spec 0016's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run against the Playwright build (`tests/e2e/build-env.ts`, which sets `NEXT_PUBLIC_TELEMETRY_E2E=1` and no sink values), served with `pnpm start`. In the browser, watch the network log for `POST /api/telemetry` and read each request's body and headers. Fixtures come from `tests/fixtures`, written by `node scripts/make-fixture.mjs`. Server side forwarding has no sinks here, so it is checked through the unit tests that use the fetch seam.

## UI / manual

- [x] Load `/` → one `POST /api/telemetry` with `{"name":"page-view","page":"home"}`; its request has no `Cookie` header; the answer is `204` with no body and `Cache-Control: no-store` → AC-4, AC-7, AC-10
- [x] Click Pricing from the header (a client side navigation) → one `page-view` with `page: "pricing"`; open `/privacy?x=1#y` → `page: "privacy"`, and nothing from the query or hash appears in the body → AC-10
- [x] Open a path that doesn't exist → `page: "not-found"`; open `/licence.txt` → no telemetry request → AC-10
- [x] On `/tool`, open a two page fixture with emails and phones → `page-view` (tool) and one `document-opened` whose `pages` is `"2-5"` and whose `found`, `blocked` and `pagesWith` hold buckets only, with no zero kind and `tier` and `account` from the plan line; tick, redact → one `redaction-completed` with `removed`, `unticked`, `blockedByKind`, `blockedByReason` and `stripped` matching the result card → AC-11, AC-12
- [x] In every telemetry body from that run, search for the file's name, any word of the document and any match's text → none found; the only other request `/tool` made to its own server is `GET /api/entitlement` → AC-23
- [x] Redact the same document again (rerun) → a second `redaction-completed`; cancel a run → no event; kill the worker while the phase is still `loading-engine` (the silent retry) → no event → AC-12, AC-13
- [x] As a free visitor, open a fixture over the free page cap → one `cap-reached` with `cap: "pages"` and no `run-refused`; open `user-password.pdf`, which opens only with its user password → one `run-refused` with `kind: "password-required"`, `step: "open"` → AC-13
- [x] Block `/engine/` in the browser's request blocking and open a fixture → `run-refused` with `engine-unavailable` and the `engine-unavailable` error report → AC-13, AC-18
- [x] With an init script setting `navigator.globalPrivacyControl = true` and the `Sec-GPC: 1` header, repeat the open and redact → no usage event is posted; the blocked engine case still posts `engine-unavailable` → AC-6, AC-23
- [x] Throw from a script file on our own origin (route `/probe-throw.js` with `page.route` to `throw new Error("x")`, then add a `<script src="/probe-throw.js">`) → a `browser-crash` with `kind: "error"` and the page kind; from a second probe file the same way, `Promise.reject(new Error("x"))` with nothing to catch it → `kind: "rejection"`; neither body holds `x`, a filename or a line. A throw typed into the console doesn't count: Chrome gives its error an empty filename, which the origin test rightly ignores → AC-17
- [x] Send `POST /api/telemetry` with a 2049 byte body → `413`; with `Sec-Fetch-Site: cross-site` and a valid event → `204`; with an extra key, a raw number or an unknown kind → `204`; a well formed `server-crash`, `plan-check-failed` or `subscribe-started` → `204` and, in the route test, no forward; `GET /api/telemetry` → `405` → AC-7
- [x] Sign in with a test account on the sign in page, and sign up with a new one (sandbox, throwaway accounts) → the only telemetry either page posts is `page-view` (`sign-in` or `sign-up`, then `account` after Clerk's client side move); no body names `sign-in-completed` → AC-10, AC-14
- [x] Hit `/account/subscribe` with billing seams that answer `checkout` (the sandbox walk, as in spec 0012's task 13) → the server schedules `subscribe-started`; on the welcome page reaching Pro → `subscription-confirmed`; with a plan that never turns Pro → `billing-failed` with `action: "welcome"`, `outcome: "still-waiting"` → AC-14, AC-19

## Code and records

- [x] `tests/unit/loggable.test.ts`'s gate checks `LoggablePayload | TelemetryEvent`; adding a `string` field to any event fails `pnpm typecheck`; `git diff main -- src/worker/protocol.ts` is empty → AC-1
- [x] `sign-in-completed`, `SignInDone`, `SIGN_IN_VIAS` and `SignInCompleted` appear nowhere in `src` or `tests`; the event list test counts twelve; `billing-landing.test.ts` holds the sign in page's order as the panel then Clerk's card → AC-1, AC-14
- [x] The bucket tests cover 0, 1, 2, 5, 6, 20, 21, 50 and 51; the parser tests refuse every shape AC-3 names → AC-2, AC-3
- [x] `tests/unit/telemetry-config.test.ts` fails the build for one value, production with none, preview with either, the e2e flag on Vercel, a bad UUID and a non Sentry DSN, each with its problem named → AC-9
- [x] The forwarder tests, through the fetch seam: the Umami request holds only `website`, `hostname`, `url`, `name` and `data` with flattened buckets; the Sentry envelope's event holds exactly `event_id`, `timestamp`, `level`, `message`, `tags`, `fingerprint`, `environment`, `release` and `platform`; neither carries any header from the incoming request; a sink answering `500` or hanging past 3 seconds is swallowed → AC-8, AC-20, AC-21
- [x] Umami's property limit is recorded beside `UMAMI_SEND_URL` with the date read, and `redaction-completed`'s worst case (38) is under it, or the split is built → AC-21
- [x] The `onRequestError` tests: `ROUTE_KINDS` holds the real `routePath` strings recorded from a local throw in each route; an error whose message holds an email reports only `route` and `routeType` → AC-15
- [x] `/api/entitlement`'s test: an `unknown` answer schedules `plan-check-failed`; `none` and `signed-in` schedule nothing → AC-16
- [x] The billing tests: each failing outcome reports its `action` and `outcome` and nothing from the seams; a `chrome-extension://` error sends nothing → AC-17, AC-19
- [x] `pnpm lint` rejects `@/telemetry/server` or `@/config/telemetry` imported outside *Security model*'s list, `@/telemetry` in `src/engine`, `src/detect`, `src/worker` and `src/ui`, and `console` in `src/telemetry` → AC-24
- [x] `csp.test.ts` and `headers.spec.ts` pass unchanged; `OUTSIDE_SERVICES` has Umami and Sentry with empty origin lists and dated facts; the privacy page has "Counts and error reports" after "What we receive when you visit", C5 and C7 rewritten and C14 to C16; `policy-changes.ts` has the new entry at the top → AC-22
- [x] Specs 0001, 0002, 0004, 0005, 0006, 0007, 0011 and 0012 read as *Amends* says → AC-22

## Go live (your steps, after the merge's deploy)

- [ ] *Go live* steps 1 to 6 done before the merge; the production build passed the gate → AC-9, AC-25
- [ ] Past about 30 requests a minute from one address, `/api/telemetry` answers `429` with no `Set-Cookie` and no challenge page → AC-25
- [ ] A visit to `/` shows in Umami; a deliberate failure shows in Sentry and its email arrives → AC-25
- [ ] Go live step 8: Clerk's dashboard for the production instance shows sign ups by day (and sign ins, if it shows them), recorded with the date in `rationale.md`, *Counting a finished sign in* → AC-14, AC-25

## Added by the build (2026-10-30)

- [x] Under `pnpm build && pnpm start`, throw once in a page (say `/pricing`) and once in a route handler (`/api/telemetry`), and read the `routePath` `onRequestError` receives: it matches a shape `ROUTE_KINDS`'s comment in `src/instrumentation.ts` records (`/pricing`, `/api/telemetry`), and `routeKindFor` names the right kind. The build read its strings from Next.js 16's templates and the build manifest; verify's throw in `/pricing` showed a render reports the plain path, and the comment now records that → AC-15
- [ ] Go live step 7: if the home page visit never shows in Umami, its bot filter refused `TELEMETRY_USER_AGENT` (`Mozilla/5.0 (Server)`, the string Umami's server side guide uses). Swap it for one fixed generic browser string, the same on every event, and send again → AC-21
- [x] The Umami and Sentry entries in `OUTSIDE_SERVICES` state the data region chosen at sign up (Go live steps 1 and 2). The build wrote the EU region for both → AC-22
- [ ] The newest entry in `PRIVACY_CHANGES` (`src/lib/policy-changes.ts`) is dated the day this ships; the build wrote 2026-10-30 → AC-22

## Added by the design update (2026-11-03)

- [ ] On a probe build (`pnpm build && pnpm start` with Playwright's env, so billing is on), make Clerk's middleware throw for `/account`, and again return a rejected promise, with a probe recording what reaches `forward` → the build bundles `@/telemetry/server` into the proxy with no error; each case sends one `server-crash` with `route: "proxy"` and `routeType: "proxy"`, and the answer is the same 500 page Next.js gave before the catch → AC-26
- [ ] On a probe build, throw once in `/pricing` and once in `/account`, logging the `routePath` and `routeType` of every call the hook gets → every call for one throw maps through `routeKindFor` to one `route` with one `routeType` (if not, bring AC-27's key back to `/architect`); `forward` runs once for each throw, though the hook is called two and three times; throw in `/pricing` again inside the minute → no forward; throw in `/api/telemetry` → one forward → AC-15, AC-27
- [ ] `tests/unit/proxy-crash.test.ts`, `tests/unit/proxy-matcher.test.ts` (now awaiting `proxy`), the collapse cases in `tests/unit/telemetry-server.test.ts` and the hook cases in `tests/unit/telemetry-crashes.test.ts` pass; `src/instrumentation.ts` no longer says the hook reports the proxy; `TELEMETRY_SERVER_MESSAGE` names `src/proxy.ts` → AC-15, AC-26, AC-27
- [ ] After the deploy, never by breaking the proxy on purpose: the first `server-crash` with `route: "proxy"` to reach Sentry shows the proxy sees the two values in production. Off Vercel no build has sinks (AC-9), so no probe can show it → AC-26

## Added by the build (2026-11-03)

- [ ] For the two probe steps above (the proxy throwing, and the hook's repeated calls): a probe build has no sinks, so `reportCrash` returns before it reaches `forward`, and a probe that records `forward` sees nothing even when the code is right. Record what reaches `reportCrash` for the proxy step, and for the collapse step give the probe's `TELEMETRY_SEAMS` fake sinks and a recording `fetch`, so a skipped repeat shows as one send rather than none → AC-26, AC-27
