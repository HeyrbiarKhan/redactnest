# Review, feat/billing-paid-plan, 2026-10-04

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: about 150 files (51 under `src/`, 42 under `tests/`, specs and docs), branch vs main (merge base 2a0d047), plus one uncommitted change to `docs/scope/scope.md`
**Verdict**: Approve with nits

## Summary

Adds Clerk sign in and Polar billing as spec 0012 describes: an `(account)` route group that is the only place Clerk's script loads, a proxy matched to account paths only, a cookie only entitlement route that never calls Clerk, Polar as the only source of Pro, and the pricing, privacy and terms updates. The work is careful and consistent with AGENTS.md: boundaries are narrowed from `unknown`, every failure is a closed kind, `/tool`'s policy takes nothing from `OUTSIDE_SERVICES`, and links into `/tool` stay full page loads. I found no blocker or major. The findings are accessibility of the sign out wait, a production CSP that still carries a development wildcard, a state changing GET, and some small robustness gaps in the sign out and welcome code.

## Verify notes

### 1. Sign out clicked as Account loaded opened Manage billing

**Answer**: Not a pre hydration click. Most likely a layout shift in the button row, or the tool's snapshot reference pointing at a node that was replaced; I could not reproduce it from source alone.

**Evidence**:
- Sign out is a `<button onClick>` inside a client component (`src/app/(account)/sign-out.tsx:142`). It is not a form and has no `action`, so before hydration a click on it does nothing. It cannot navigate anywhere, billing included.
- Manage billing is a plain anchor (`Button href={BILLING_PATH} reload`, `src/app/(account)/account/page.tsx:107-111`). It works the instant it is painted, so it is the only one of the two that can act on a click before hydration.
- The row is `flex flex-wrap gap-3` with the order Get Pro (free only), Manage billing, Sign out (`page.tsx:100-113`). Sign out is last, so anything that changes the width of an earlier sibling moves Sign out under a pointer aimed at its old spot, and Manage billing can end up where Sign out was. The whole row is server rendered in one pass (the plan is awaited before render, `page.tsx:60-64`, no Suspense), so nothing in it renders late. What can change between first paint and the click is the width of the buttons (Inter loads through `next/font`, `src/app/layout.tsx:25`) and the soft refresh Clerk runs after it loads (`window.__internal_onAfterSetActive` calls `router.refresh()`, `@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js`), both of which can reflow or replace nodes.
- A browser driving tool that clicks by a reference taken from an earlier snapshot would hit exactly this.

Filed as a Minor below (low impact, unreproduced). Cheap hardening: give the three controls fixed minimum widths, or put Sign out first in the row.

### 2. Offline, Clerk's signOut leaves an unhandled "TypeError: Failed to fetch"

**Answer**: It is Clerk's own and our code cannot catch it. Production shows it only as a console line (the dev overlay is what turns it into "1 Issue"). Our 10 s limit already covers the user visible effect.

**Evidence**: `@clerk/nextjs/dist/esm/app-router/client/ClerkProvider.js` sets `window.__internal_onBeforeSetActive` to a `new Promise` whose body runs `void invalidateCacheAction().then(() => resolve())` with no `.catch` and no `reject`. The server action is Next's own fetch (`app-router/server-actions.js`). Offline, that fetch rejects with `TypeError: Failed to fetch`. Nothing handles the rejection, and `resolve()` is never called, so the promise Clerk awaits never settles. That is why `signOut` hangs rather than throws, which `leaveAccount` already says in its doc comment (`sign-out.tsx:30-39`) and handles with `withinLimit` (`sign-out.tsx:46-59`). Because `await clerk.signOut()` only ever sees a hang, there is no rejection for our `try/catch` to receive. Only a global `unhandledrejection` listener could touch it, which is the wrong tool (it would hide real errors). One caveat: this provider code skips the server action when Next is 15 or 16 and the intent is `"sign-out"`; whether clerk-js passes that intent is decided by the CDN script, which is not in `node_modules`, so I could not confirm it from source. Report upstream to Clerk if wanted; no change here.

### 3. Only the disabled button shows progress during the 10 s offline wait

**Answer**: No, not enough. See the Minor "Sign out progress is silent". It is a gap against 4.1.3 and, for sighted users, only a greyed button.

**Evidence**: `SignOutControl` (`sign-out.tsx:140-151`) changes state to `leaving` and only sets `disabled`. There is no `aria-busy`, no `role="status"` text and no label change. A disabled button announces nothing as it changes, and in several browsers a focused element that becomes disabled drops focus. The outcome is covered (failure is `role="alert"`, `sign-out.tsx:146`), but progress is not. `DeleteAccount` has the same shape while `deleting` or `leaving` (`delete-account.tsx:150-160`), with a longer wait.

### 4. `__refresh_*` and `__clerk_db_jwt*` cookies stay on localhost after sign out

**Answer**: Dev only for `__clerk_db_jwt`, confirmed in source. `__refresh` is set from Clerk's handshake payload; the source shows the server only reads and forwards it, so I cannot prove from `node_modules` that a production instance never sets it, but the evidence points the same way.

**Evidence**: `@clerk/backend/dist/chunk-EY755YSF.mjs:7611-7615` treat the dev browser token as development only: `authenticateContext.instanceType === "development"` gates both the `DevBrowserSync` and `DevBrowserMissing` handshakes. The dev browser token and its cookie exist because a development instance's Frontend API is on another origin (`*.clerk.accounts.dev`) from localhost. A production instance's Frontend API is `clerk.redactnest.com`, a subdomain of the site, and its cookies live on it (privacy claim C6, spec 0012). The refresh cookie is only ever written by the handshake response (`resolveHandshake`, `chunk-EY755YSF.mjs:7059`, `headers.append("Set-Cookie", x)` for whatever the handshake carries) and read at `:655`. The dev cookie surviving sign out is why `leaveAccount` ends with a full page load of `/` and why `/` renders no Clerk. Both are cleared when the dev instance's own client is torn down. Worth a one line check on the production walk (spec 0012's go live step) that `document.cookie` for `redactnest.com` holds neither after sign out.

### 5. Welcome makes 16 requests in dev (Strict Mode)

**Answer**: Production makes 15. Strict Mode runs the effect, its cleanup and the effect again, so dev gets one extra ask. The cap holds.

**Evidence** (`welcome-poll.tsx:51-89`):
- Dev: the first run starts `tick()`, which increments `asks.current` to 1 and fires fetch 1. Cleanup sets that run's `stopped = true` and clears its timer. The second run resets `asks.current = 0` and fires a fetch of its own. The first fetch's continuation sees `stopped` and returns without scheduling, so it adds one request and nothing else. Total 15 + 1 = 16. In production the effect runs once per `[phase, round]`, so 15.
- Cleanup is complete: timer cleared, listener removed, and the `stopped` flag stops any ask in flight from acting.
- A failed request counts as an ask: `askIsPro` turns every error or non-OK into `false` (`:25-36`), so the 15 cap holds across failures.
- Across remounts: the count is a ref and resets on mount, so a reload gives a fresh round of 15. That is the intended "check again" behaviour and not a bug.
- One gap, filed as a Minor: the fetch has no timeout, so a request that never settles keeps `asking = true` and the page shows "Confirming your payment" forever with no way out.
- The unit test pins 15 and the 2 s spacing in the non Strict case (`tests/component/app/welcome-poll.test.tsx:178-205`) but nothing runs under `StrictMode`.

### 6. Can the sign out fix land on `/` while still signed in?

**Answer**: Not through any path where Clerk is loaded or we have said "failed". The residual case is one we cannot see from here: `signOut` resolving without ending the session. It lands on `/` still signed in, harmlessly.

**Paths** (`sign-out.tsx:103-120`):
- Clerk loads in time and `signOut` resolves: lands on `/` after the session ended (Clerk updates its cookies before `signOut` resolves; the verify run saw both `__client_uat` at `0` and no `__session`).
- Clerk loads in time and `signOut` rejects: `catch`, mode is `sign-out`, returns `false`, the visitor stays and sees the alert. No navigation.
- Clerk never loads, or `status` goes to `"error"`: `clerkLoaded` never resolves (the isomorphic client emits `error` and leaves `loaded` false, `@clerk/react` `ClerkProvider-CI-Fzmk2.mjs:1394-1402`), the 10 s limit rejects, returns `false`. No navigation. Late arrival of Clerk is blocked by `late()` (`:112`), so the page never signs the visitor out behind a failure message.
- `signOut` hangs (the server action case): the same 10 s rejection.
- `signOut` resolves but the cookie is still set: the code trusts resolution. This was never observed; clerk-js is not in `node_modules` so I could not read its `signOut`. It is also harmless on arrival: `/` is outside the proxy matcher (`src/proxy.ts:46-54`), renders no Clerk and has no auth check, so it neither redirects nor loops, and `/tool`'s entitlement would simply still say what the cookie says.
- Redirect target is `HOME_PATH` through `location.assign`, a new document (`src/lib/document-load.ts:94-96`).
- After deletion mode deliberately lands on `/` on every failure (`:116`), so the cookies can outlive the user; the entitlement route then reads Polar, finds no customer (404 counted as no customer, `plan.ts`) and answers free.
- One mismatch worth knowing: if `signOut` has started at 9.9 s and the limit fires while it is in flight, the visitor is told it failed while the session may then end anyway. Not a signed in landing; filed as a Nit.

## Blockers

None.

## Major

None.

## Minor

### 🟡 Sign out progress is silent, `src/app/(account)/sign-out.tsx:140-151`
**Problem**: During the up to 10 s wait the only change is the button going `disabled`. No text, `aria-busy` or status region says that signing out is in progress. `DeleteAccount` does the same while `deleting` and `leaving` (`src/app/(account)/delete-account.tsx:150-160`), and its focus handling only runs on `step`/`problem` changes, so focus is left on the button that was just disabled.
**Why it matters**: WCAG 2.2 4.1.3 (Status Messages): a screen reader user gets no announcement that anything is happening, then an alert after 10 s on failure. Sighted users see only a greyed button.
**Suggested fix**: While `leaving`, change the label to "Signing out" and add a visually present `role="status"` line (or `aria-busy` plus `aria-disabled` instead of `disabled`, which keeps focus). Do the same for the deleting step. Add the words to the same file that holds the other account strings, and a component test for the announcement.

### 🟡 Production policy ships the development Clerk wildcard, `src/config/privacy.ts` (`CLERK_ORIGINS`) and `src/config/csp.ts`
**Problem**: The standard policy's `script-src` and `connect-src` include `https://*.clerk.accounts.dev` in every build, production included, because `CLERK_ORIGINS` is one list. Any tenant on Clerk's multi tenant dev domain can then be a script or connect target on every non tool page.
**Why it matters**: A Vercel production build already refuses any publishable key whose host is not `clerk.redactnest.com` (`billing.ts`, AC-23), so the wildcard is never used in production and only widens the allow list, in a multi tenant namespace. `'unsafe-inline'` is already present on these pages so this is hardening, not an open hole. Spec 0012 AC-21 chose the list as written.
**Suggested fix**: Add the wildcard to the standard policy only outside production (the same `dev`/build flag `buildPolicies` already takes), or keep it and record the reason beside `CLERK_ORIGINS`. If changed, `tests/unit/csp.test.ts` needs a case for the production shape.

### 🟡 Subscribe changes Polar state on a GET, `src/app/(account)/account/subscribe/page.tsx:34-48`
**Problem**: Loading `/account/subscribe` ties or creates a Polar customer and then creates a checkout. Clerk's cookies are sent on a cross site top level navigation, so a link on any other site can make a signed in visitor do this.
**Why it matters**: No money moves and the visitor lands on Polar's own checkout, so the harm is a stray customer record and checkout session for the visitor's own email. It is low, but it is the kind of effect a GET should not have, and it also happens on any prefetch a browser or extension makes.
**Suggested fix**: Either accept and say so in the spec's security model (the behaviour is deliberate: sign in lands straight on checkout, AC-8), or put the work behind a POST (a server action from a button) and keep the page a plain redirect target. Do not change without `/architect`, since AC-8 depends on it.

### 🟡 Welcome poll has no request timeout, `src/app/(account)/account/welcome/welcome-poll.tsx:25-36`
**Problem**: `fetch` has no timeout or `AbortController`. A request that neither succeeds nor fails keeps `asking` true (`:55-66`), so no further ask happens and the page stays on "Confirming your payment" with no way to the "still waiting" state or Check again.
**Why it matters**: A buyer who has just paid is looking at a spinner with no exit. The server side is bounded (Polar timeout 1.5 s), so it needs a stalled connection, but the cost is a confusing dead end at the most important moment.
**Suggested fix**: Give each ask a budget (for example the tool's 4 s `WAIT_BUDGET_MS` idea, as a named constant for this page) with `AbortSignal.timeout`, counted as a failed ask. Add a test with a fetch that never resolves.

### 🟡 Account's action row can shift under the pointer, `src/app/(account)/account/page.tsx:100-113`
**Problem**: See verify note 1. Sign out is the last item in a wrapping row whose earlier items can change width (font load) or be replaced (Clerk's `router.refresh()`), and the item that takes its old place is a working link (Manage billing).
**Why it matters**: A click aimed at Sign out can open the billing portal, which creates a Polar customer session. Unreproduced, low impact.
**Suggested fix**: Fixed minimum widths on the three controls, or order Sign out first, so its place never depends on its siblings.

## Nits

- ⚪ `src/app/(account)/sign-out.tsx:66-76`, `clerkLoaded` never removes its status listener when the limit wins, and does not fail early when Clerk's status is `error`. The late resolve is harmless (`late()` guards it) but a failed script load costs the full 10 s before the message.
- ⚪ `src/app/(account)/sign-out.tsx:108-114`, a `signOut` already in flight when the limit fires reports failure while the session may still end. Consider having the failure line say "check whether you are still signed in" or letting `late` also stop acting on the result.
- ⚪ `tests/component/app/welcome-poll.test.tsx`, no `StrictMode` case; the 16 request dev observation is correct but unpinned.
- ⚪ `src/app/(account)/account/actions.ts:21-26`, an unconditional string "billing-failed" is returned when seams are null; fine, but a code comment saying why it is not "sign-in" would save the next reader a look.

## Strengths

- Entitlement from cookies alone with no Clerk network call, and a full claim check on top of `verifyToken` that pins its order in `tests/unit/billing-entitlement.test.ts`, so a Clerk change fails a test rather than quietly granting Pro.
- The server side stays identity safe by construction: every Polar and Clerk call takes the session's own user id from `auth()`, nothing from the address or body (INV-3), and delete order (Polar before Clerk, refuse while renewing) is thought through and tested.
- `/tool`'s policy and Clerk scoping are held by tests (`proxy-matcher`, `csp`, `privacy-config`), and the referrer policy decision is documented with the failure it avoids.
- `leaveAccount` and `WelcomePoll` are written for the awkward paths (hidden tab, late Clerk, stopped effect, remount) and the tests cover each with fake timers.

## Test coverage

Strong. Each new `src/billing` module has a unit file (account, delete, entitlement, subscribe, landing, config, session), the account components have component tests with axe, and the browser specs cover plan, paid cap, privacy and headers. Gaps: no `StrictMode` welcome poll case, no test for a fetch that never settles, no component test that anything announces sign out progress (it does not), no case for Clerk status `error` in `leaveAccount`, and nothing exercising the production CSP shape without the Clerk development wildcard.
