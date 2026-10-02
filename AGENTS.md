# RedactNest

Truly redact PDFs in the browser. Text is removed from the PDF content stream and metadata is stripped, never covered with a black box. The document never leaves the visitor's machine, so "never stored" is structurally true rather than promised.

## Stack

- **Language / Runtime**: TypeScript (strict), Node >= 22 (`.nvmrc` pins 24.19.0)
- **Framework**: Next.js 16 App Router, React 19, Tailwind CSS v4
- **Key dependencies**: `mupdf` (WebAssembly PDF engine, AGPL 3.0), Vitest, Playwright
- **Package manager**: pnpm 10.13.1
- **Hosting**: Vercel. No database, no object store, no queue, deliberately
- **Licence**: AGPL 3.0 or later, because MuPDF is copyleft and ships to the browser

Decided in [spec 0001](docs/specs/0001-browser-only-redaction-stack/index.md), the source of truth for this section.

## Build approach

**Skateboard**: ship the thinnest usable whole first, then grow it.

## Commands

```bash
pnpm install
pnpm dev          # syncs the engine into public/engine and writes the licence and notices first
pnpm build
pnpm test         # Vitest: the unit project (node) and the component project (jsdom)
pnpm test:e2e     # Playwright, in a real browser
pnpm lint
pnpm typecheck
node scripts/make-fixture.mjs   # rewrites tests/fixtures from code; commit what changes
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`.

## Rules

- Functional by default: pure functions and plain data, composition over inheritance, immutable values (`const`, `readonly`, `Object.freeze`) never mutated in place. Classes only where the platform needs one, as `Error` subclasses do. Module level mutable state only for a deliberate singleton or cache, never for shared application state.
- Named exports only. Default exports only where Next.js requires them (`page.tsx`, `layout.tsx`) and in config files.
- Strict types, no `any`. Narrow from `unknown` at every boundary.
- Folders by capability under `src/` (`engine`, `detect`, `worker`, `config`, `lib`, `ui`, `app`), not by layer and not by feature.
- Expected failures are a closed set of kinds, never free text. The worker never throws across the boundary, and an error payload carries a kind and nothing derived from the document: no file name, no stack trace, no extracted text.
- Page findings are a closed set of kinds too: `PAGE_FINDINGS` in `src/worker/protocol.ts`. A finding says which rule held on a page, never what the page holds or where. Their words live in `src/lib/page-findings.ts` as records over `PageFinding`, so a finding added without its words fails `pnpm typecheck`. Spec 0006, AC-28, INV-1.
- Every word the redact flow shows for a step, a failure or a result lives in `src/lib/flow-text.ts`, as records over `EngineErrorKind`, `ProgressPhase` and `SanitizedKind`, so a kind added to the protocol without its words fails `pnpm typecheck`. A failure's words come from its kind and the job's frozen entitlement only, never from the document. Spec 0007, AC-16.
- The footer's licence notice takes every word from `src/lib/legal.ts` and every path from `src/lib/routes.ts` (`LICENCE_PATH`, `NOTICES_PATH`), never a literal in a component. Spec 0009, AC-1.
- The footer's Legal nav and the line under the drop zone follow the same rule: every word from `src/lib/legal.ts`, and `PRIVACY_PATH` and `TERMS_PATH` from `src/lib/routes.ts`. Spec 0011, INV-4.
- The engine wall: only `src/worker/engine.worker.ts` may import `@/engine`, and only `src/engine` may touch `mupdf`. One PDF parser, ever. Document bytes live only inside the worker, so transfer the `ArrayBuffer` rather than copying it. The one exception is the checked output: it crosses to the main thread once, transferred, and waits in a `useRef` in `tool-client` (never in the session reducer) until Download, dropped whenever the session stops being `complete` with nothing downloaded. Spec 0004, INV-8 and AC-20.
- The detector wall: `src/detect` holds the pattern detectors, pure text in and offsets out, with no page, config, network, storage or console, and nothing from the worker but types from `@/worker/protocol` (spec 0005, INV-5). Only `src/engine` may import `@/detect`, and only `src/detect` may import `libphonenumber-js`, so detection and the phone metadata ship in the worker's chunk and never in a page's (INV-8). The `redactnest/detect` zone in `eslint.config.mjs` holds both, and bans `search()` there as in the engine (INV-11).
- `src/ui` holds the design system primitives and is presentation only. Its ESLint zone (`redactnest/ui`) bans imports from `@/worker`, `@/engine`, `@/config`, `@/lib/session` and `@/lib/entitlement`, and bans `dangerouslySetInnerHTML`. The caller reads state and passes what a primitive shows as props. Spec 0003, INV-7.
- Only `src/app/tool/page.tsx` may import `tool-client`. The load guard in `ToolClient` trusts that it runs at `/tool`, and anywhere else it can only show a dead end. Lint enforces this in every zone, `import()` and `typeof import` included. Spec 0003, INV-11.
- Every link into `/tool` uses `Button`'s `reload` prop (or a plain `a`) with `TOOL_PATH` from `src/lib/routes.ts`, never `next/link` or `router.push`. A content security policy belongs to the document it arrived with, so a client side navigation would open the visitor's document under the previous page's looser policy, with its scripts still running. Spec 0003, INV-10.
- Colours are tokens only, defined once in `@theme` in `src/app/globals.css`. Lint rejects an arbitrary colour (`bg-[#1a2b3c]`, `text-[rgb(...)]`) and an alpha modifier on a colour utility (`text-ink/70`) in every zone. A quieter text colour is `ink-muted`, never opacity. A new foreground and background pairing goes into spec 0003's contrast contract and `tests/unit/contrast.test.ts` in the same change. Spec 0003, INV-1 to INV-3.
- Inter is the only font, and nothing renders below 14px: `text-xs` is removed from the theme, and no text size uses viewport units. Spec 0003, INV-6.
- Icons come from `lucide-react`, imported by name only (`import { Mail } from "lucide-react"`). A namespace import pulls in the whole set.
- Design system: build all UI to [`docs/design/design.md`](docs/design/design.md) (art direction and the product bar); token values live in CSS.
- Every cap and every public URL comes from `src/config`, validated at module load. No page or size limit written as a literal anywhere else.
- The engine's file format, geometry and self check constants (`PDF_HEADER_WINDOW`, `BOUNDS_REACH_RATIO` and the rest) are the one exception: they are rules about the file format, not caps on the visitor, so they live in `src/engine` where no environment variable can switch a check off. Spec 0004.
- The detectors' constants (`PHONE_READINGS`, `MAX_WINDOW_DIGITS`, `MAX_PARSES_PER_GROUP`, `EXTENSION_MARKERS`, `PRECEDENCE`, `KEYWORD_REACH` and the rest) follow the same exception: they are rules about a pattern, not caps on the visitor, so they live in `src/detect`, each commented as such. Spec 0005.
- The page reading's thresholds (`STAMP_MAX_CHARS`, `PICTURE_MIN_SHARE`, `PICTURE_REACH_MIN` and the rest) follow the same exception: they are rules about pages, not caps on the visitor, so they live in `src/engine` (`inspect.ts`, `trim.ts`), each commented as such. Spec 0006, INV-7.
- `NEXT_PUBLIC_MATCH_CONTEXT_CHARS` (default 40, ceiling 200) sets how many characters of surrounding text travel with a match. That ceiling is a privacy limit rather than a display one: the text crosses the worker boundary, so a typo must not be able to widen it to a whole page. Spec 0002, INV-9.
- The AGPL source link (`config.sourceUrl`) is the tree of the exact commit that was built. On Vercel it is derived from the Git system variables, and the build fails if `NEXT_PUBLIC_SOURCE_URL` is set there as well. Off Vercel a production build needs `NEXT_PUBLIC_SOURCE_URL` ending in `/tree/` and a full 40 character lowercase commit, so a repository root or branch link fails `pnpm build`. Playwright's value is defined once in `tests/e2e/build-env.ts`. Spec 0009, AC-4 to AC-6.
- Only `.github/workflows/tag-deploy.yml` may write to the repository: one job with `contents: write`, no checkout and no third party action. Every other workflow stays read only, and `tests/unit/workflows.test.ts` reads each workflow as text to hold that. Spec 0009, INV-3.
- Every outside origin in the standard content security policy comes from `OUTSIDE_SERVICES` in `src/config/privacy.ts`, the same list the privacy policy renders entry by entry, and `buildPolicies` in `src/config/csp.ts` builds both regimes from it. A feature that brings in an outside service (auth, analytics, error reporting) adds it there, never to `next.config.ts`. `/tool`'s policy takes nothing from the list, whatever it holds, and `tests/unit/csp.test.ts` fails if a listed origin reaches it. Spec 0011, INV-1 and INV-2.
- The privacy policy makes only claims a test or a build check already holds (spec 0011's claims register). A change that weakens one updates the page and adds an entry at the top of its change list in `src/lib/policy-changes.ts` in the same change, its date a literal written on the day. Each page's h2 headings live in `src/lib/policy-sections.ts`, which the browser test walks in order, so a heading changes there first. Turning on Vercel Observability Plus, a log drain, Web Analytics, Speed Insights or a firewall challenge mode changes the policy first. Spec 0011, INV-3 and INV-9.
- Our own code writes no log: `no-console` and `process.stdout` or `process.stderr` are errors in every zone, because the privacy policy promises there is no log line to carry document detail. Feature 11 lifts this for its one reporter, in the same change as the policy update. Spec 0011, AC-15.
- The privacy and terms pages are static server components with no form, no client component and no script of their own (`tests/unit/policy-pages.test.ts`). Spec 0011, INV-7.
- Comments explain why, and name the spec invariant they uphold. Match the density already in `src/`.
- Accessibility: WCAG 2.2 AA on the core path. Keyboard reachable, visible focus, sufficient contrast.

## Non-negotiables

- A document never leaves the visitor's browser. No code may send document bytes, extracted text, file names or match text over the network. We operate no endpoint that accepts document data.
- The tool route (`src/app/tool`) loads no third-party script: no auth, analytics or error-reporting SDK. Its strict CSP (`connect-src 'self'`) stays. Any third-party call goes through our own origin or lives on another route.
- Redaction is real removal through MuPDF, never a drawn box or overlay. Never produce a file that looks redacted but is not.
- The engine removes first and marks after: the black box is drawn once the text is gone, and no file leaves unless the self check passed on those exact bytes. A run refuses rather than hand back a partial file or remove words nobody ticked. Spec 0004, INV-2.
- Logs, analytics and error reports carry counts and kinds only, never document content.
- Documents are never stored. No database of our own; account and subscription data lives in Clerk and Polar.
- Nothing is written to browser storage: no `localStorage`, `sessionStorage`, IndexedDB, Cache Storage, OPFS or service worker. ESLint `no-restricted-syntax` bans those spellings in every zone, and `tests/e2e/privacy.spec.ts` proves it in a real browser. Spec 0002, INV-3.
- The repository will be public under AGPL. Never commit secrets; `.env*` stays ignored.
- The plan lives in `docs/scope/scope.md` and decisions in `docs/specs/`. Specs override general guidance from installed skills.

## Things that will trip you up

- MuPDF is never bundled. Turbopack fails on its Node-only branch, so `scripts/sync-engine.mjs` copies it to `public/engine` on predev and prebuild, and it loads through a dynamic import marked `turbopackIgnore` and `webpackIgnore`. Do not "fix" this with a normal import.
- `scripts/sync-legal.mjs` runs after `sync-engine.mjs` on predev and prebuild, writing `public/licence.txt` (a byte for byte copy of `LICENSE`) and `public/third-party-notices.txt`, both gitignored. It stops `pnpm dev` and `pnpm build` on purpose in two cases, each needing a person: a shipped package whose licence `LICENCE_ALLOWLIST` in `scripts/lib/notices.mjs` does not satisfy (every GPL variant included), and an installed `mupdf` other than the one `scripts/legal/mupdf.txt` covers. That is why `mupdf` is pinned exact: an upgrade means redoing `mupdf.txt` from that version's source archive, Emscripten and musl included, and `tests/unit/mupdf-notices.test.ts` fails until you do. Spec 0009, AC-14, AC-16.
- No cross-origin isolation (COOP/COEP) is needed. Do not add it; it would break Polar checkout and other embeds.
- The tool page is prerendered static, so its CSP needs `'unsafe-inline'` for scripts. Never add a nonce or hash there: a nonce disables `'unsafe-inline'` and breaks hydration.
- The `.wasm` file must be served as `application/wasm`.
- The tool route gets entitlement only from same-origin `GET /api/entitlement`, which fails closed to the free tier.
- `typecheck` runs `next typegen` before `tsc`. `LayoutProps` and `PageProps` are globals Next.js writes into `.next/types`, and `next-env.d.ts` is generated too; both are gitignored, so a clean checkout has neither and bare `tsc --noEmit` fails with `TS2304: Cannot find name 'LayoutProps'`. It passes on a machine that has run `dev` or `build`, which is why only CI sees it. Do not drop the `typegen` step.
- MuPDF prints parser diagnostics to the console from inside the worker. Those lines can carry document detail, so error reporting (feature 11) must never capture console output from the worker. `src/worker/client.ts` already calls `preventDefault()` on worker errors for the same reason. Since spec 0004, `silenceEngineLog` in `src/engine/load.ts` installs a callback that discards every line as the engine loads (never `setLog(null)`), which makes this rule a backstop rather than the only defence. Keep both.
- Whether a file is a PDF is judged from its bytes (`%PDF-` within the first 1024), never from its name or declared type, because MuPDF sniffs content and opens a PNG as a one page document even when told `application/pdf`. The check runs in the engine before MuPDF loads. Spec 0004, AC-1.
- The phone detector finds its own candidates and asks libphonenumber-js only to judge each window (`parsePhoneNumberFromString` with `extract: false`, `max` metadata). Never bring back `findNumbers`: its matcher misses numbers written side by side. Spec 0005, AC-27.
- Tailwind's default palette is wiped (`--color-*: initial`), so a pasted class such as `text-gray-500` fails silently: it generates no CSS and renders no colour. The alpha modifier lint also rejects the `text-<size>/<leading>` shorthand on purpose, because the type scale sets line height.
- Colour tokens are written `--color-<role>: #RRGGBB;`, hex only. `tests/unit/contrast.test.ts` parses that exact form, so `oklch()` or any other notation breaks it.
- Playwright records a trace without the screencast (`screenshots: false` in `playwright.config.ts`). The spinner turns for the whole engine load, a screencast encodes every frame it paints, and with workers opening documents side by side that starved the 10 MB engine download: a two page open went from about 2 s to 15 to 30 s, past the test timeout. Do not turn the screencast back on. The DOM snapshots in the trace are enough.
- `tests/e2e/checklist-speed.spec.ts` is a stopwatch, so it runs in its own Playwright project, `speed`: one worker, after every other test (`dependencies: ["chromium"]`). Beside the parallel pool it timed the machine, not the page. Put any new timing assertion there, never in `chromium`. To run it alone: `pnpm exec playwright test --project=speed --no-deps`. Spec 0007, AC-8.
- In ESLint flat config, a later block that sets `no-restricted-imports` or `no-restricted-syntax` replaces the rule rather than merging it. So each zone in `eslint.config.mjs` restates every restriction for its files, and `redactnest/tool-page` comes last so it drops only the tool client ban. Build a new zone with `zone()`, which always adds the storage ban, the colour patterns and the log ban.
- A Vercel production deploy fails `pnpm build` on purpose while `LEGAL.contactEmail` in `src/lib/legal.ts` sits on a `.invalid` host (the placeholder `privacy@redactnest.invalid` among them, in any letter case) or `LEGAL.representatives` is still `pending`. Previews, CI and development build with the placeholder. On Vercel the check also needs `VERCEL_ENV`, so keep "Automatically expose System Environment Variables" on. Never set `VERCEL` in Playwright's build environment, or the e2e build meets the same gate. Spec 0011, AC-16, AC-17, INV-5.
- `next.config.ts` does not resolve the `@/` alias. It loads `src/config/csp.ts` and `src/config/privacy.ts`, so those two and `src/config/error.ts` import only each other, by relative path, and read no environment variable. Spec 0011, INV-8.

## Tooling

Chosen here, installed by `/develop tooling` (scope feature 2):

- ESLint (installed, `eslint-config-next`) plus Prettier for formatting
- The engine wall enforced by ESLint `no-restricted-imports` zones, replacing `tests/unit/boundaries.test.ts` as the guard
- Pre commit hook: lint, format, typecheck
- CI on push: lint, typecheck, Vitest, Playwright
- Testing Library (`@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`) on jsdom for component tests, which live in `tests/component/`
- Two Vitest projects in `vitest.config.mts`: `unit` runs `tests/unit/**` in `node`, `component` runs `tests/component/**` in `jsdom` with `tests/setup/component.ts`. Keeping them apart stops a unit test quietly leaning on a `window` it should never have had
- axe for accessibility: `@axe-core/playwright` in `tests/e2e/design-system.spec.ts`, and `expectNoAxeViolations(container)` from `tests/setup/component.ts` in component tests, with `color-contrast` and `target-size` off there because jsdom computes no colour and no layout
- Tests written after the build via `/test`. Vitest for logic, Playwright for anything that must happen in a real browser

## Git

- integration: on
- branch prefix: `feat/`
- commit: per-milestone, conventional commit messages

## Agent skills

Installed for the tools this project uses. Each one loads only when its subject comes up:

- [clerk-setup](.claude/skills/clerk-setup/): `clerk/skills`, adding Clerk auth by the official quickstarts
- [clerk-nextjs-patterns](.claude/skills/clerk-nextjs-patterns/): `clerk/skills`, Clerk with middleware, Server Actions and caching
- [clerk-testing](.claude/skills/clerk-testing/): `clerk/skills`, end to end tests for Clerk auth flows
- [polar-integration](.claude/skills/polar-integration/): `polarsource/skills`, Polar checkout, customer portal and webhook endpoints
- [polar-testing](.claude/skills/polar-testing/): `polarsource/skills`, Polar sandbox, test cards and webhook testing
- [next-best-practices](.claude/skills/next-best-practices/): `vercel-labs/openreview`, Next.js file conventions, RSC boundaries, async APIs and metadata
- [vercel-react-best-practices](.claude/skills/vercel-react-best-practices/): `vercel-labs/agent-skills`, React and Next.js performance patterns

Declined: Testing Library, jsdom, `lucide-react`, `axe-core`, `@axe-core/playwright` (spec 0003); `libphonenumber-js` (spec 0005, 2026-09-27). Nothing else is recorded as declined, so later runs may offer more.

MCP servers: `@playwright/mcp` (connected, configured in `.mcp.json`, drives a real browser for `/check verify` and Playwright work)

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->
- [src/ui/AGENTS.md](src/ui/AGENTS.md): the design system primitives, how to build and test one
- [src/engine/AGENTS.md](src/engine/AGENTS.md): the redaction engine, its rules, the page reading and the trim, the self check, MuPDF's quirks, the test seams and the fixture script

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
