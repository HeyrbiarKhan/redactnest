# src/billing

Accounts and the paid plan, on the server: the tool's plan check, and what Subscribe, Manage billing and Delete account ask of Clerk and Polar. The decision is [spec 0012](../../docs/specs/0012-billing-paid-plan/index.md), with the sandbox findings and the reasoning in [rationale.md](../../docs/specs/0012-billing-paid-plan/rationale.md). There is no store of our own: Clerk holds the account, Polar holds billing, and the only join is the Clerk user id as Polar's external customer id.

## Files

- Every module starts with `import "server-only"`. The `redactnest/billing` lint zone makes this folder the only home of `@clerk/backend` and `@polar-sh/sdk` (with `@clerk/shared`), and bans `@clerk/nextjs`, which belongs to the `(account)` pages and `src/proxy.ts`. Only `src/app/api/entitlement`, the `(account)` group, `src/proxy.ts` and `src/app/layout.tsx` may import from here.
- `clients.ts` builds the Clerk backend client and the Polar client once, from `billing` in `src/config/billing.ts`, both `null` with billing off. It is the only place the two secrets are read. `entitlementSeams()` and `accountSeams()` hand the real calls to the other modules, which take their seams as arguments, so every branch is tested with fakes.
- `session.ts` (`readSession`): AC-2 rules 2 to 5, who is asking, from Clerk's cookies alone. No network call anywhere in it.
- `plan.ts` (`readPlan`, `planFromState`, `statusOf`): AC-2 rules 6 and 7, Polar's customer state narrowed from `unknown`. It holds no SDK and no config, so `portal.ts`, and through it the proxy, can import it without pulling either in.
- `entitlement.ts` (`resolveEntitlement`): the whole decision table in the spec's order, pure over a clock and one seam. Never throws.
- `customer.ts` (`linkCustomer`): AC-25, the Polar customer found, tied or created before any checkout. Subscribe is its only caller.
- `subscribe.ts`, `portal.ts` and `delete.ts`: Subscribe (AC-14), Manage billing (AC-17) and Delete account (AC-11). `portal.ts` also holds `PORTAL_TOKEN_PARAM` and `withoutPortalToken`, the proxy's check (AC-26).

## Conventions

- The decision table runs in order, and only rule 6 calls out. Billing off: free, `none`. No session token: free, `sign-in-needed` when `__client_uat` holds a positive number, else `none`. A token that is not genuine: free, `sign-in-needed`, with no outbound call. A genuine token names its user. Polar's state: the Pro benefit gives paid, `signed-in`; no benefit, or a 404, gives free, `signed-in`; any other status, a throw, a timeout or an answer it cannot read gives free, `unknown`. AC-2, INV-2, INV-4.
- The expiry order trap. Clerk's session token lives 60 s and `/tool` never loads Clerk's script, so the token is nearly always expired when the tool asks. `verifyJwt` in `@clerk/backend` checks the signature and the authorized party before the expiry, so only a `TokenExpired` verdict proves an expired token genuine, and `readSession` then trusts it for `SESSION_TRUST_MS` (7 days, the session lifetime Clerk's free plan fixes) after its `iat`. Any other `verifyToken` failure is `sign-in-needed`. `verifyToken` checks no issuer, and on an expired token it stops before `nbf` and `iat`, so `checkClaims` checks `iss`, `azp`, `sub`, `nbf` and `iat` on the decoded payload, on both paths. `tests/unit/billing-entitlement.test.ts` pins that order with a locally generated key pair, so a Clerk upgrade that changes it fails a test rather than quietly granting or refusing Pro. INV-11.
- Clerk's cookies are read by the suffixed name first (`getSuffixedCookieName` with `getCookieSuffix` of the publishable key, from `@clerk/shared/keys`), then the plain name, as Clerk itself reads them.
- The plan check's one outbound call is bound to `OUTBOUND_TIMEOUT_MS` (1.5 s; Polar's SDK takes seconds), well inside the tool's 4 s budget. Like `SESSION_TRUST_MS`, it is a rule rather than a cap on the visitor, so it is a named constant here and not config. The account pages' calls keep each SDK's own timeout.
- Pro is holding `POLAR_PRO_BENEFIT_ID`, never "any active subscription", because the Polar organisation (EdiventStudio) sells other products. `planFromState` reads only the benefit list and each active subscription's product, renewal flag and end date, which is what claim C13 in the privacy policy says we learn. Reading more from the state changes that claim first. INV-6.
- Identity comes from the verified session only. The page or server action hands in the user id from `auth()`, and the email from `currentUser()` only when Clerk reports it verified. Nothing the browser sends reaches these modules, and with no session Polar is never called. INV-3.
- `linkCustomer` ties only a live, untied customer whose email matches ignoring case, and never touches one tied to another id (Polar lets an external id be set once and never changed). The checkout is then bound by `customer_id`, with no `external_customer_id` and no `customer_email`, because Polar matched by email over those and a payment landed where the plan check never looked. AC-25.
- Delete reads the state first and refuses while Pro renews or another product's subscription is active. Then it deletes Polar's customer (`anonymize: true`) before Clerk's user, so a failure part way still leaves a sign in to try again with. A 404 from either counts as done. AC-11.
- Polar's answers are narrowed from `unknown`: a shape the code cannot read is `null` here and `unknown` to the visitor. `statusOf` reads the HTTP status off an SDK error, and the fakes in the tests throw the same shape.
- Use `createPolar` from the dated module `@polar-sh/sdk/2026-10`, with snake_case fields. `polar-integration`'s recipes show the older `new Polar({ server })` shape. No webhook, ever (INV-5).

## Tests

- `server-only` throws outside React's server build, so `vitest.config.mts` aliases it to `tests/setup/server-only.ts`. Keep the alias, or every unit test of this folder fails on import.
- `tests/unit/billing-entitlement.test.ts` covers the decision table, INV-11's tokens and the pinned expiry order. Its Clerk backend client fails the test if it is ever called. `billing-subscribe.test.ts` covers INV-3 and the tying, `billing-account.test.ts` the account page, `billing-delete.test.ts` deletion, `billing-config.test.ts` the all or nothing gate, `billing-landing.test.ts` where sign in lands, `proxy-matcher.test.ts` the matcher and the portal token, and `entitlement-route.test.ts` the route's headers.
- In a real browser: `tests/e2e/plan.spec.ts` stubs `/api/entitlement` with `page.route` for every account kind, and `headers.spec.ts` holds the portal token redirect and the referrer policy.
- What no test can reach (a real Clerk instance's cookies, Polar's checkout and portal) is checked by hand in the sandbox and recorded in spec 0012's `rationale.md` and `verify.md`.

_Drafted by /sync from the introducing change, worth a quick human pass._
