# Review, feat/brand-ui-refresh, 2026-10-07

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 113 files (57 under `src/`, config and scripts, 40 under `tests/`, specs and docs), branch vs main (merge base a46f623), clean tree
**Verdict**: Approve with nits

## Summary

Gives RedactNest its brand and the layouts of the four references, as spec 0013 describes: the Nest and bar mark and lockup, a new header and footer, a 404, the landing page with a real product shot and two finds and strips cards, `/tool` as one keyed three area grid with a rail and a sticky action panel, Pricing's two cards, the sign in panel, the legal pages' On this page list, one global cursor rule, red delete buttons and a busy button state, plus `scripts/make-brand.mjs` and a sample fixture. I found no blocker or major. The work follows AGENTS.md closely: words live in `home-text.ts`, `flow-text.ts`, `plans.ts` and `legal.ts`, links into `/tool` and the account group are plain `a` or `Button reload`, colours are tokens with every new pairing in the contrast contract, no new package or origin, and the `/tool` policy is untouched. `pnpm lint` (no errors), `pnpm typecheck` and the whole Vitest suite (87 files, 3074 tests) pass. What is left is small: accessibility semantics Safari drops, a global `:has()` selector that has not been measured on long lists, dead code in the header, and context files that have not caught up.

## Minor

### 🟡 Global `label:has(...)` selectors are not measured against long lists, `src/app/globals.css:182`
**Problem**: The cursor rule (AC-33) runs `label:has(input:is(...):enabled):not(:has(input:is(...):disabled))` and `label:has(...:disabled)` over every label on every page. Every checklist row and select all row is such a label, and `:has()` is one of the costlier selector forms for style recalculation, since each label re-evaluates when its subtree changes (a tick, a disable while redacting).
**Why it matters**: Spec 0007 AC-8 holds the review to a speed budget on long lists (`checklist-speed.spec.ts`, in the `speed` project, which I did not run). A new site wide selector over thousands of rows is the kind of change that budget exists to catch, and the build notes mention no measurement.
**Suggested fix**: Run `pnpm exec playwright test --project=speed --no-deps` on this branch against main and record the result in the spec's verify notes. If the budget is tight, scope the label rule to the checklist (a `data-` marker on the row's label set by `ChecklistItem` and `ChecklistSelectAll`) instead of every label, keeping AC-33's one rule in `globals.css`.

### 🟡 List semantics dropped in Safari for the steps, the trio and the link groups, `src/ui/step-list.tsx:43`
**Problem**: Preflight sets `list-style: none` on every `ul` and `ol`, and Safari with VoiceOver then drops the list role. `src/app/page.tsx` already keeps `role="list"` on the two band lists for exactly this reason (its own comment says so), but `StepList`'s `ol`, `FeatureList`'s `ul` (`feature-list.tsx:32`) and `LinkGroup`'s `ul` (`link-group.tsx:32`) do not.
**Why it matters**: `StepList`'s accessibility argument is that "the `ol` already gives assistive technology the order" (AC-15, and the number circles are `aria-hidden`). In Safari that order and the count are lost, and the numbers are hidden too, so the sequence has no non visual form. The same applies, less severely, to the three feature items and the footer and On this page link lists.
**Suggested fix**: Add `role="list"` to those three elements, as the band lists have, and have a component test assert it for `StepList`.

### 🟡 `SiteHeader`'s `hasEnd` is always true, `src/ui/site-header.tsx:39`
**Problem**: `hasEnd` tests `account` and `action` against `null`, but `PageHeader` always passes `account={<AccountLink />}`, a React element that is never null even when `AccountLink` renders nothing (billing off). So on `/tool` with billing off the wrapper `div` (with `sm:ml-auto`) renders empty, and the test can never be false for the real caller.
**Why it matters**: Harmless today, but the check reads as if it prevents an empty wrapper and does not, and the pattern will mislead whoever adds a conditional slot.
**Suggested fix**: Drop `hasEnd` and always render the wrapper, or have `PageHeader` pass `undefined` when billing is off so the check means what it says.

### 🟡 AGENTS.md and the scope have not caught up with the change, `AGENTS.md`, `src/ui/AGENTS.md`, `docs/scope/scope.md:254`
**Problem**: New rules now hold in code and lint but appear in no context file: the `cursor-` ban that `zone()` adds (`eslint.config.mjs:293-310`), INV-12 (red only for the two delete buttons, held by `tests/unit/brand-source.test.ts`), the one larger shadow, `PageHeader` and `NAV_TEXT` as the header's source, `home-text.ts` as the landing page's words, `BrandMark` and `MARK_PATHS` being held equal to `icon.svg`, and the container query `lg` of `/tool` and the legal pages. The "Agent skills" list also omits the newly installed `frontend-design` skill. In the scope, two build sub tasks are unticked ("Your read's changes" and "Your read of slice 6") while Verify and Test are ticked, although the code, design.md and spec 0003 already carry what those sub tasks describe.
**Why it matters**: The next change reads AGENTS.md as the bar, and the "Things that will trip you up" section is where a cursor utility or a stray red button would be warned about. A ticked Verify beside unticked build items also misstates where the feature stands.
**Suggested fix**: Run `/sync` after the merge decision. Add one line each for the cursor rule, the danger variants and the shadow rule to AGENTS.md and `src/ui/AGENTS.md`, list `frontend-design`, and tick or reword the two sub tasks to match what remains (the sandbox walk and the owner's read).

### 🟡 `make-brand.mjs` reads the build environment by parsing TypeScript as text, `scripts/make-brand.mjs:159`
**Problem**: `objectNamed`, `valueOf`, `balanced` and `topLevel` are a hand written reader for `BUILD_ENV` and `BILLING_ENV` in `playwright.config.ts` and `tests/e2e/build-env.ts`. It accepts only string literals, known names and `[...].join("...")`, and throws on anything else.
**Why it matters**: It fails loudly, which is the right way to fail, but the script is rerun rarely (spec: "only when the look changes"), so the first person to hit it will be debugging a bespoke parser after someone adds a template literal or a spread of a function call to the build environment. The tradeoff (no TypeScript import, AC-28) is stated and reasonable.
**Suggested fix**: Keep it, but have `tests/unit/brand-files.test.ts` run `readBuildEnv`'s parser (or a copy of its input shapes) against the real two files, so a change to them breaks a unit test now rather than a script run later.

## Nits

- ⚪ `src/ui/card.tsx:24`, `src/app/page.tsx:91`, `src/ui/icon-circle.tsx:28`, `tests/unit/contrast.test.ts:90`, `tests/unit/brand-source.test.ts:15`: comments address the owner ("your mockup", "your call", "needs your read first"). They explain nothing to the next reader once the conversation is gone. Say "the 05 reference" (`docs/design/references/05-finds-and-strips.png`) and name the spec criterion instead.
- ⚪ `src/app/tool/tool-client.tsx:794,850,984`: `key="a"`, `key="b"` and `key="c"` on non list children do nothing (the stable identity comes from position and the unconditional elements, and `c` is conditional). Either drop them, or note that they are documentation, since AC-14 and INV-5 are held by the component test that compares nodes by reference.
- ⚪ `src/lib/home-text.ts:33`: `HomeFeature` is structurally the same as `FeatureItem` in `src/ui/feature-list.tsx`. `src/lib` may not import `src/ui` types, so keep the copy, but a one line comment saying they must stay equal would help.
- ⚪ `src/lib/home-text.ts` `findsItems()` and `strippedItems()` rebuild and freeze their arrays on every render of a static page; they could be module level constants. No effect in production, since `/` is prerendered.
- ⚪ `docs/specs/0013-brand-ui-refresh/index.md` AC-17 and AC-25 say "from `lg`", but the build (rightly, for 200% text) uses a container query of 61rem on `/tool` and the legal pages. The code comments explain it; the spec's criteria should say so too, so a future reader does not "fix" it to a media query.

## Strengths

- Every invariant I traced holds in code: the three tool areas keep their order, identity and live regions across states (held by a component test that compares DOM nodes with `toBe`); the account group exits stay plain `a` or `Button reload`; `/tool` loads nothing new and its policy is unchanged; no `any`, no storage, no log.
- The cursor rule is built to be provable: one unlayered rule, two `!important` declarations, each pointer selector excludes what the `not-allowed` set matches, a lint pattern in `zone()` bans `cursor-` in every zone, and `brand-source.test.ts` parses `globals.css` by brace depth to hold all of it.
- `Button`'s `busy` is `aria-disabled` rather than `disabled`, drops the press before `onClick` (Enter included), keeps its rest colours, and the status regions are in the page from the first render, so announcements work and focus never leaves the pressed button.
- Brand files are checked from their own bytes (PNG and ICO headers, the SVG's two fills against `globals.css`, `MARK_PATHS` against `icon.svg`, the alt text file against `HOME_TEXT.socialAlt`), and the script reads every colour from the CSS, so nothing drifts silently.
- Sizes in AC-11 (68 pixel rows, 48 and 64 pixel tiles, 28 pixel info icon, 12 and 20 pixel gaps) match the Tailwind classes exactly, and the Strips columns follow the card's own width by container query with thresholds in rem.
- The sample fixture and the red button checks show care: reserved addresses and numbers only, and a comment that explains why `07700 900xxx` was left out (the detector would not tick it).

## Test coverage

Strong. New logic is covered at the right level: unit tests for the brand files, the source rules (red buttons, the one shadow, the cursor rule), `home-text`, `plans`, policy sections and pages, Clerk's appearance, the contrast contract (`danger-strong`, `on-accent` on the two reds, `focus` on `surface` at 4.5, `accent-strong` and `focus` on `info-bg`) and the lint patterns for `cursor-`; component tests for every new primitive and page (`BrandMark`, `StepList`, `FeatureList`, `Button` danger and busy, `Spinner` tone, sign out and delete account busy states, the 404, the sign in panel, site nav, the home page's card sizes); and real browser specs for layout, columns, sticky behaviour, keyboard order, axe, forced colours, 200% text and the outside origin check. The full Vitest run passed here. I did not run Playwright, so the e2e and speed projects are unconfirmed by this review, and the speed project is the one that matters for the `:has()` finding above. The only gap I would add is a `role="list"` assertion for `StepList` once that finding is fixed.
