# Verify: Stack, scaffold & processing boundary · spec 0001 · updated 2026-09-20

_Steps derived from spec 0001. `/check verify` runs these; `/test` locks the durable ones._

Spec 0001 is a decision spec, so it carries no numbered `AC-N`. The references
below point at its two checkable lists instead:

- **SD-n** = the nth bullet of **What the scaffold must demonstrate**.
- **INV-n** = the nth bullet of **Key invariants**.
- **CFG** = the **Configuration required** section.

## Commands

- [x] `pnpm install && pnpm build` → passes; the route table lists `/`, `/_not-found` and `/tool`, and `/tool` is marked `○ (Static)` → SD-1, and the prerendered static tool route
- [x] `pnpm dev` → ready, and `http://localhost:3000/tool` serves 200 → SD-1
- [x] `pnpm typecheck` → clean → SD-1
- [x] `pnpm lint` → clean → SD-1
- [x] `pnpm test` → 16 pass. These are the config module's validation rules → CFG
- [x] `pnpm test:e2e` → 11 pass in a real browser → SD-2, SD-3, SD-4, SD-5
- [x] `NEXT_PUBLIC_SITE_URL= pnpm build` (the variable explicitly empty, and no `.env.local` supplying it) → the build **fails** with `[config] NEXT_PUBLIC_SITE_URL is required in production`. A pass here means a required value can ship unset → CFG
- [x] `NEXT_PUBLIC_FREE_PAGE_CAP=three pnpm build` → the build **fails**. A malformed value must fail exactly as a missing one does, never become `NaN` → CFG
- [x] `NEXT_PUBLIC_FREE_PAGE_CAP=80 NEXT_PUBLIC_MAX_PAGES=50 pnpm build` → the build **fails**: the free cap may not exceed the paid ceiling → CFG
- [x] `grep -rn "SharedArrayBuffer\|pthread" public/engine/*.js` → no matches, so the engine is single threaded and needs no cross origin isolation → SD-7
- [x] `grep -rln "from \"mupdf\"\|/engine/mupdf" src/ | grep -v "^src/engine/"` → no matches outside `src/engine/`. Only the walled module may reach the engine → INV-5, INV-6
- [x] `grep -rn "maxPages\|maxFileBytes\|freePageCap" src/ | grep -v "src/config/"` → every hit reads from `config`, and no page or byte limit appears as a literal → INV-7

## UI / manual

- [x] Build and start production (`pnpm build && pnpm start`), open `/tool`, drop a PDF of two or more pages → the page count appears, and the text layer count reports honestly how many pages carry text → SD-2
- [x] With the network tab open and filtered to `Fetch/XHR`, repeat the drop → **no request carries the document**. The only engine traffic is `GET /engine/mupdf.js`, `/engine/mupdf-wasm.js` and `/engine/mupdf-wasm.wasm`, all same origin → INV-1, INV-3
- [x] Same run, console open → **no content security policy violation** is logged while the page hydrates, the worker starts and the WebAssembly compiles → SD-3
- [x] Drop a file that is not a PDF → an error appears that names the failure kind and **nothing about the file**: no file name, no stack trace, no extracted text → the worker boundary contract's error rule
- [x] `curl -sI http://localhost:3000/tool | grep -i content-security-policy` → exactly **one** `Content-Security-Policy` header, carrying every directive in the spec's tool route block, and **no** `Content-Security-Policy-Report-Only` → SD-4
- [x] In that header, confirm `connect-src 'self'` exactly, with no other origin → INV-1, INV-4
- [x] `curl -sI http://localhost:3000/engine/mupdf-wasm.wasm | grep -i content-type` → `application/wasm`. A wrong media type silently degrades streaming instantiation → SD-5
- [x] `curl -sI http://localhost:3000/ | grep -i content-security-policy` → the standard regime, still `default-src 'none'` and `frame-ancestors 'none'` → SD-4
- [x] In DevTools, Application → Frames → the tool route, confirm no third party script is loaded at all → INV-4
- [x] Open `/tool` with JavaScript's WebAssembly disabled (Chrome: `--js-flags=--noexpose-wasm`, or a policy that blocks it) → a plain explanation appears **instead of** the drop area, not a drop area that fails after a file is chosen → SD-8

## Changing a cap takes a redeploy, not a code change

- [x] Set `NEXT_PUBLIC_MAX_PAGES=2` in `.env.local`, rebuild, then drop a PDF of three or more pages → the run fails with the too many pages message, and the number in the message is the one you set → CFG, INV-7
- [x] Set `NEXT_PUBLIC_MAX_FILE_BYTES=1024`, rebuild, drop any real PDF → the run fails with the too large message, sized from the value you set → CFG, INV-7
- [x] Set `NEXT_PUBLIC_FREE_PAGE_CAP=7`, rebuild, open `/tool` → the drop area's wording quotes 7 pages. Restore your values afterwards → CFG

## Coverage

- SD-1 boots and builds · covered by the four command steps
- SD-2 engine in a real browser worker, page count · covered by `pnpm test:e2e` and the manual drop
- SD-3 hydrates with the policy enforced · covered by the e2e policy violation test and the console check
- SD-4 headers asserted, full directive set · covered by `tests/e2e/headers.spec.ts` and the two `curl` steps
- SD-5 `.wasm` media type · covered by the e2e asset test and the `curl` step
- SD-6 Turbopack gate · **settled during the build, not a step.** The module worker bundles under Turbopack unchanged. The engine is deliberately not bundled: MuPDF's glue carries a Node only `await import("module")` that no browser bundler can resolve, so it is served from `public/` behind an ignored dynamic import. Recorded in `README.md`
- SD-7 cross origin isolation gate · **settled: not required.** Covered by the `grep` step, and proved again by the browser tests passing with no isolation headers set
- SD-8 feature detection · covered by the disabled WebAssembly step. Not covered by an automated test, because the gap has to be created in the browser itself
- INV-1 bytes never reach a socket · covered by the network tab step and the `connect-src` step
- INV-2 bytes only in the worker · covered by the e2e transfer test, which asserts the sender's buffer is detached after posting
- INV-3 own origin engine, correct media type · covered by the e2e origin test and the `curl` step
- INV-4 no third party script on the tool route · covered by the `connect-src` and DevTools steps
- INV-5, INV-6 one parser, walled module · covered by the two `grep` steps. Feature 2 replaces these with a lint rule
- INV-7 every cap from config · covered by the `grep` step and the three cap changing steps
- INV-8 AGPL notices, licence file, source offer · **not covered here.** Feature 18 owns it. The scaffold carries only `NEXT_PUBLIC_SOURCE_URL` and the footer link that reads it
