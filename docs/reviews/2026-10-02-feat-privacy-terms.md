# Review, feat/privacy-terms, 2026-10-02

**Reviewed by**: Sonnet 5.5 (fresh review pass)
**Scope**: 48 files, branch vs main
**Verdict**: Approve with nits

## Summary
The change adds the privacy policy and terms pages, a footer Legal nav, a terms line under the drop zone, a services config that feeds both the privacy page and the standard CSP, a log ban in every lint zone, and a production launch gate. The four focus items all hold. The work is careful, well commented, and well tested. The only findings are small gaps in the launch gate's placeholder check, a stored Vercel URL that redirects, and a thin focus test.

## Focus items

**a. /tool CSP as strict as on main: HOLDS.** I compared main's `next.config.ts` with `src/config/csp.ts` directive by directive. The tool policy is the same eleven directives in the same order: default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'. Dev adds only 'unsafe-eval' and ws:/wss: as on main. No nonce or hash. `tests/unit/csp.test.ts` asserts the exact production string for both regimes and passes. Route matching is untouched from main: `/tool` gets the tool policy, and `/((?!tool$).*)` gets the standard one, so exactly one rule matches any path and none falls through. A sub path such as `/tool/x` takes the standard policy, which was also true on main. The `/engine/VERSION` rule sets only Content-Type.

**b. Services never reach /tool: HOLDS.** The only path from `OUTSIDE_SERVICES` into the policy is `buildPolicies`, and the `tool` branch is built with empty `scriptExtra` and `connectExtra` and never reads `services`. The standard branch adds only script and connect origins. The unit test feeds sample origins and asserts none appear anywhere in the tool string, in dev and production. Origins are shape checked at load (https only, no path, no bare wildcard).

**c. Console ban: HOLDS.** `zone()` now adds `no-console` and the three `process.stdout/stderr` selectors, so every zone that uses `zone()` restates them. The wall block globs `src/**/*.{ts,tsx,mts}`, so `src/app/privacy`, `src/app/terms`, `src/config/*` and `src/lib/*` are covered. The detect zone spreads `zone()` and drops its own copy without losing the rule. `redactnest/tool-page` is still last. `tests/unit/engine-wall.test.ts` proves it per zone with the real ESLint instance. Files outside `src` (`next.config.ts`, `scripts/`, tests) are outside the ban, as on main.

**d. Launch gate: HOLDS, with two small gaps (see findings).** `checkLaunchFacts()` runs at module load of `src/config/index.ts`, which the root layout imports, so it runs for every build. A production deploy fails on the placeholder email or a pending Article 27 decision. A blank or whitespace `VERCEL_ENV` is trimmed to undefined by `present()`, so on Vercel it fails closed (tested for missing, blank, `staging`, `PRODUCTION`). A malformed address or representative fails every build. All problems come in one `ConfigError`. `checkLegalFacts` and the config reload cases are tested, and the config test stays true after launch facts are filled in.

**Verify item (i), Vercel URL.** See the first Minor.
**Verify item (ii), focus test.** See the second Minor.

## Minor
### 🟡 Placeholder check is exact match only, `src/lib/legal.ts:~140`
**Problem**: The production gate compares the trimmed email to `privacy@redactnest.invalid` exactly and case sensitively. `Privacy@redactnest.invalid`, or a different `.invalid` or `example.com` address, passes the shape check and ships to production.
**Why it matters**: The gate's purpose (INV-5) is that production never carries a non delivering contact. A hand edit that changes the case defeats it silently, and a privacy contact that bounces is a real compliance gap.
**Suggested fix**: Compare case insensitively and also refuse any address whose host ends in `.invalid` in production. Add a test case for each.

### 🟡 Stored Vercel privacy URL redirects, `src/config/privacy.ts` (Vercel entry `policyUrl`) and spec 0011 line 127
**Problem**: Verify found `https://vercel.com/legal/privacy` redirects to `/legal/privacy-notice`. The comment on the authorities says addresses were checked to resolve, but the Vercel one is stored as the old path.
**Why it matters**: It works today, but a redirect is the vendor's courtesy and may be dropped. A dead link in a privacy policy is a visible defect.
**Suggested fix**: Store the final URL in the config and in the spec table, and say when it was checked.

### 🟡 Focus ring test checks only the first link, `tests/e2e/legal-pages.spec.ts:176`
**Problem**: AC-18 says links show a visible focus ring. The test focuses `main`, tabs once, and rings only `links.first()`. Underline is checked on every link, but focus is not.
**Why it matters**: The ring comes from one global `:focus-visible` rule, so risk is low, but the claim in the test name ("rings it on focus") is wider than the evidence, and a link inside the services list or change list could lose its ring unnoticed.
**Suggested fix**: Tab through every link in `main` and check the ring on each, or at least one from the services section and the contact link.

## Nits
- ⚪ `eslint.config.mjs:~345`, the stream selectors match `process.stdout` by the literal name, so `const p = process; p.stdout.write()` and `globalThis.console.log()` slip through. Fine as a guard against honest mistakes; say so in the comment.
- ⚪ `src/config/index.ts:~275`, the gate only fires on `VERCEL_ENV=production`, so a self hosted production build keeps the placeholder. This is what AC-16 specifies and the placeholder uses a non delivering `.invalid` domain, so just worth knowing when the AGPL source is deployed elsewhere.
- ⚪ `src/ui/prose.tsx`, the nested selector classes are long. Acceptable, and covered by a component test.

## Strengths
- `buildPolicies` is pure, `dev` is passed in, and the test feeds sample origins, so the tool route guarantee is proved even while the real list names no origin.
- The gate reports every problem in one error, fails closed on an unknown `VERCEL_ENV`, and its test adapts once real facts are filled in.
- Each lint zone proves the log ban with the real ESLint instance, including computed and destructured forms.
- `next.config.ts` imports only relative neighbours and the INV-8 reason is written where a later editor will see it.
- Legal words and paths come from `src/lib/legal.ts` and `src/lib/routes.ts`; links use plain `a` so the leave warning still fires.

## Test coverage
Strong. Unit tests cover the CSP builder, the legal facts, the privacy config validation, the policy change dates and the config gate (146 tests passed on the files I ran). Component tests cover the nav, the pages, the services section, the representatives block and Prose. E2E covers headers, cookies, same origin requests for the new pages, axe, and the footer links. The only gap is the focus coverage noted above.
