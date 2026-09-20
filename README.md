# RedactNest

A web tool that truly redacts PDFs. Text is removed from the content stream and
metadata is stripped, never covered with a black box. The document is opened in
the visitor's own browser and is never uploaded.

Architecture and the reasoning behind it:
[spec 0001](docs/specs/0001-browser-only-redaction-stack/index.md).

## Licence

AGPL 3.0 or later. The PDF engine is [MuPDF](https://mupdf.com/) by Artifex
Software, which is copyleft, so RedactNest itself is AGPL and its source is
published. Feature 18 finishes that obligation: the licence file, third party
notices, and a source offer link that resolves to the exact deployed commit
rather than the repository root.

## Getting started

You need Node 24 (see `.nvmrc`) and pnpm.

```bash
pnpm install
cp .env.example .env.local   # then edit if you want non-default caps
pnpm dev                     # http://localhost:3000
```

`pnpm dev` and `pnpm build` both run `scripts/sync-engine.mjs` first, which
copies the MuPDF engine out of `node_modules` into `public/engine/`. That folder
is generated and gitignored, so the engine can never drift from the version
pinned in `package.json`.

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` | Production build. Fails if configuration is missing or malformed |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:e2e` | Browser tests (Playwright), against a production build |

Browser tests need Chromium once: `pnpm exec playwright install chromium`.

## How the pieces fit

```
src/app/tool/          the tool route. Prerendered static, strict policy
  page.tsx             server component, no dynamic APIs
  tool-client.tsx      the client island: drop area, progress, results

src/worker/
  protocol.ts          the message envelope. The boundary contract
  client.ts            main thread side. Owns the worker, transfers buffers
  engine.worker.ts     the worker. The only place a document's bytes exist

src/engine/index.ts    WALLED. The only module that imports mupdf
src/config/index.ts    every cap and public URL, validated at module load
src/lib/support.ts     WebAssembly / Worker / File API detection
```

The rules that carry the privacy claim:

- **Document bytes never reach a network socket.** The tool route's `connect-src`
  names this application's own origin and nothing else.
- **Document bytes live only in the worker.** The file is handed over by
  transferring its `ArrayBuffer`, which detaches the main thread's view rather
  than copying it. The main thread sees counts and metadata only.
- **The worker never throws across the boundary.** Every failure returns an
  `error` message carrying one of a closed set of kinds, and nothing derived
  from the document: no file name, no stack trace, no extracted text.
- **One PDF parser only.** Nothing else in the codebase parses or renders a PDF.
- **Only the worker may import `src/engine`.** Discipline for now; feature 2
  installs the lint rule.
- **Every cap comes from `src/config`.** No page or size limit is written as a
  literal anywhere else.

## Two things spec 0001 left open, and what the build found

The spec deliberately recorded these as facts to settle by observation rather
than guess at. Both are now settled.

### Does Turbopack bundle the module worker and the WASM asset?

**The module worker: yes.** `new Worker(new URL("./engine.worker.ts",
import.meta.url), { type: "module" })` bundles and runs under Turbopack with no
extra configuration. No fallback to webpack was needed.

**The engine: it must not be bundled at all.** MuPDF's WebAssembly glue contains
a Node branch that does `await import("module")`. The branch never runs in a
browser, but a bundler resolves specifiers statically and fails on it regardless:

```
Module not found: Can't resolve 'module'
  ./node_modules/mupdf/dist/mupdf-wasm.js
```

The fix is what the spec had already chosen for other reasons: serve the engine
from `public/`. `scripts/sync-engine.mjs` copies it there, and
`src/engine/index.ts` loads it through a dynamic import carrying both
`/* turbopackIgnore: true */` and `/* webpackIgnore: true */`, so no bundler ever
looks inside it. Both comments are present so this survives a switch to webpack.

This is also why `src/engine/index.ts` imports MuPDF's types with
`typeof import("mupdf")` rather than a value import. A type-only reference is
erased at compile time and never reaches the bundler.

### Does MuPDF's browser build need cross origin isolation?

**No.** The shipped `mupdf.js` and `mupdf-wasm.js` contain no reference to
`SharedArrayBuffer`, no pthreads and no `Atomics.wait`. The browser build is
single threaded, so no COOP or COEP headers are required, and the header posture
in the spec stands unchanged. Features 10 and 11 pay nothing for this.

The browser tests prove it from the other direction too: they load the engine,
compile the WebAssembly and open a PDF with no isolation headers set anywhere.

## Configuration

Every value is read and validated by `src/config/index.ts` at module load, which
the root layout imports. A missing or malformed value fails `next build` rather
than becoming `undefined` at runtime, which on a cap would mean no cap at all.

See `.env.example`. `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_SOURCE_URL` are
required in production and must be https.

## The content security policy

Two regimes, split by route, configured in `next.config.ts`.

The **tool route** allows no third party origin at all. The **standard regime**,
for every other route, is the same shape plus the auth and analytics origins
features 10 and 11 will need. Those lists live in exactly one place in
`next.config.ts`; adding an origin to the wrong one would quietly weaken the
guarantee, and `tests/e2e/headers.spec.ts` is what should fail if that happens.

`'unsafe-inline'` in `script-src` on the tool route is deliberate. The App Router
injects inline hydration scripts, and the nonce alternative requires dynamic
rendering, which is exactly what the prerendered static tool route rules out. The
guarantee rests on `connect-src` and the other fetch directives, which stay
strict.

The development policy additionally allows `'unsafe-eval'` and websockets,
because Fast Refresh needs both. This is why the browser tests run against a
production build rather than `next dev`.

## Browser support

Last two major versions of Chrome, Edge, Firefox and Safari on desktop. Mobile
works where it works and is not promised: iOS Safari enforces per tab memory
limits that will kill a tab holding a document.

`src/lib/support.ts` checks WebAssembly, Web Workers and the File API at load and
shows a plain explanation instead of a drop area when something is missing.
Workplace policy disabling WebAssembly is a real case, not a theoretical one, so
the check compiles an empty module rather than trusting that the global exists.
