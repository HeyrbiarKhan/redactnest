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
pnpm dev          # syncs the engine into public/engine first
pnpm build
pnpm test         # Vitest, unit
pnpm test:e2e     # Playwright, in a real browser
pnpm lint
pnpm typecheck
```

## Specs

Stored in `docs/specs/`. Format: `docs/specs/NNNN-title/index.md`.

## Rules

- Functional by default: pure functions and plain data, composition over inheritance, immutable values (`const`, `readonly`, `Object.freeze`) never mutated in place. Classes only where the platform needs one, as `Error` subclasses do. Module level mutable state only for a deliberate singleton or cache, never for shared application state.
- Named exports only. Default exports only where Next.js requires them (`page.tsx`, `layout.tsx`) and in config files.
- Strict types, no `any`. Narrow from `unknown` at every boundary.
- Folders by capability under `src/` (`engine`, `worker`, `config`, `lib`, `app`), not by layer and not by feature.
- Expected failures are a closed set of kinds, never free text. The worker never throws across the boundary, and an error payload carries a kind and nothing derived from the document: no file name, no stack trace, no extracted text.
- The engine wall: only `src/worker/engine.worker.ts` may import `@/engine`, and only `src/engine` may touch `mupdf`. One PDF parser, ever. Document bytes live only inside the worker, so transfer the `ArrayBuffer` rather than copying it.
- Every cap and every public URL comes from `src/config`, validated at module load. No page or size limit written as a literal anywhere else.
- Comments explain why, and name the spec invariant they uphold. Match the density already in `src/`.
- Accessibility: WCAG 2.2 AA on the core path. Keyboard reachable, visible focus, sufficient contrast.

## Non-negotiables

- A document never leaves the visitor's browser. No code may send document bytes, extracted text, file names or match text over the network. We operate no endpoint that accepts document data.
- The tool route (`src/app/tool`) loads no third-party script: no auth, analytics or error-reporting SDK. Its strict CSP (`connect-src 'self'`) stays. Any third-party call goes through our own origin or lives on another route.
- Redaction is real removal through MuPDF, never a drawn box or overlay. Never produce a file that looks redacted but is not.
- Logs, analytics and error reports carry counts and kinds only, never document content.
- Documents are never stored. No database of our own; account and subscription data lives in Clerk and Polar.
- The repository will be public under AGPL. Never commit secrets; `.env*` stays ignored.
- The plan lives in `docs/scope/scope.md` and decisions in `docs/specs/`. Specs override general guidance from installed skills.

## Things that will trip you up

- MuPDF is never bundled. Turbopack fails on its Node-only branch, so `scripts/sync-engine.mjs` copies it to `public/engine` on predev and prebuild, and it loads through a dynamic import marked `turbopackIgnore` and `webpackIgnore`. Do not "fix" this with a normal import.
- No cross-origin isolation (COOP/COEP) is needed. Do not add it; it would break Polar checkout and other embeds.
- The tool page is prerendered static, so its CSP needs `'unsafe-inline'` for scripts. Never add a nonce or hash there: a nonce disables `'unsafe-inline'` and breaks hydration.
- The `.wasm` file must be served as `application/wasm`.
- The tool route gets entitlement only from same-origin `GET /api/entitlement`, which fails closed to the free tier.
- `typecheck` runs `next typegen` before `tsc`. `LayoutProps` and `PageProps` are globals Next.js writes into `.next/types`, and `next-env.d.ts` is generated too; both are gitignored, so a clean checkout has neither and bare `tsc --noEmit` fails with `TS2304: Cannot find name 'LayoutProps'`. It passes on a machine that has run `dev` or `build`, which is why only CI sees it. Do not drop the `typegen` step.

## Tooling

Chosen here, installed by `/develop tooling` (scope feature 2):

- ESLint (installed, `eslint-config-next`) plus Prettier for formatting
- The engine wall enforced by ESLint `no-restricted-imports` zones, replacing `tests/unit/boundaries.test.ts` as the guard
- Pre commit hook: lint, format, typecheck
- CI on push: lint, typecheck, Vitest, Playwright
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

Nothing is recorded as declined, so later runs may offer more.

MCP servers: `@playwright/mcp` (connected, configured in `.mcp.json`, drives a real browser for `/check verify` and Playwright work)

## Context files

<!-- Nested AGENTS.md files are listed here as they are created -->

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
