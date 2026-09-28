# Verify: Document session and privacy guarantee · spec 0002 · updated 2026-09-28

_Steps derived from spec 0002's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`), because the content security policy is looser in development and the prerendered route has to be proved under the real one.

Steps marked **(after feature 5)** needed spec [0004](../0004-redaction-engine/index.md)'s thin Redact, Cancel and Download path. Steps marked **(after feature 6)** start from a changed tick, so they needed spec [0005](../0005-pattern-detection/index.md)'s checklist. Both features are built, and every **(after feature 6)** step is ticked; AC-14's mechanism, a rerun starting from the untouched original, is also proved at the engine by spec 0004's AC-11. Four **(after feature 5)** steps are ticked because tests elsewhere prove them, and each names its test. Three still wait for a run: no leave warning after a download, a cancel keeping a changed tick, and the output released after a download.

## UI / manual

- [x] Drop a PDF on the drop area → counts appear, one session, no console error → AC-1
- [x] With devtools Network open and the cache disabled, open one PDF, then open a second → the second opens without fetching `/engine/mupdf-wasm.wasm` again, and Sources still lists a single `redactnest-engine` worker → AC-1
- [x] Open a PDF, then choose a file that is not a PDF → the error appears, and the first document is gone: the worker holds nothing, so pressing **Start over** and reopening behaves like a fresh document → AC-1
- [x] Open a PDF, press **Start over**, open one again → a new `redactnest-engine` worker appears in Sources, because starting over is still a real release → AC-5b
- [x] **(after feature 6)** With a tick changed, choose a second file → a confirm appears; accepting replaces the session, declining leaves the first one untouched → AC-1
- [x] Open a 4 page PDF as an anonymous visitor → refused with the "more than the 3 page limit" message, not the 50 page one → AC-9
- [x] In devtools, make `GET /api/entitlement` fail, then open a 4 page PDF → still refused at 3 pages, never allowed through → AC-9
- [x] **(after feature 6)** Change a tick, then close the tab → the browser's leave warning appears → AC-13
- [x] Open a file, touch nothing, close the tab → no warning → AC-13
- [ ] **(after feature 5)** Download, then close the tab with nothing else changed → no warning → AC-13
- [x] Navigate away from `/tool` and press Back → the idle drop area, never a checklist pointing at a released session → AC-12
- [x] In devtools, terminate the `redactnest-engine` worker once the counts are on screen, or any time after "Loading the PDF engine" has passed → the session shows the lost message and a **Try again** button; pressing it reopens the same file with no file picker, and the review starts over → AC-11
- [x] In devtools, terminate the worker while "Loading the PDF engine" is still showing → it opens anyway, on a second worker, with no lost message. Do it again at the same moment on the same file → the lost message, because the silent retry is allowed once per job → AC-11
- [x] Choose a file, delete it from disk, then press **Try again** → "could not be read", not "something went wrong" → AC-11
- [x] After choosing a file, inspect the file input in devtools → `files.length` is 0 → AC-2
- [x] Devtools → Application → Storage: local storage, session storage, IndexedDB and Cache Storage are all empty, and no service worker is registered → AC-2
- [x] Devtools → Network on the tool route: the only non asset request is `GET /api/entitlement`, and no request body or URL carries the file name or any text from the document → AC-3
- [x] **(after feature 6)** Redact, download, then change one tick and run again without touching the file picker → a second file downloads, and it matches the new ticks rather than a mix of both runs → AC-14
- [ ] **(after feature 5)** Change a tick, then cancel a redaction in flight → back on the checklist with the document still open and the changed tick intact. Needs a run long enough to catch, on a document with matches: override `GET /api/entitlement` in devtools to return a paid snapshot and use the dense 50 page document `tests/e2e/cancel.spec.ts` builds (`densePdf`, an address and a phone number on every line). Spec 0004's heavy fixture has no text, so it has no checklist and no ticks to keep. The reducer keeps the tick set on a cancel, but no test asserts it yet → AC-10
- [x] **(after feature 5)** Rename the source file on disk to `  spaced out.pdf  `, open and redact it → the download is offered as `spaced out-redacted.pdf`, not `spaced out.pdf-redacted.pdf` → value sourcing: `outputName`. _Proven by `tests/unit/session.test.ts` (`outputNameFor`, the `"  spaced out.pdf  "` case), with `tests/unit/download.test.ts` ("names it as the session decided") and `tests/e2e/engine.spec.ts` ("a redaction in the real worker hands over a file that is really clean", whose download is offered under the session's name) proving the name reaches the browser unchanged._
- [x] **(after feature 5)** Redact a file named `.pdf` → the download is offered as `document-redacted.pdf` → value sourcing: `outputName`. _Proven by `tests/unit/session.test.ts` (`outputNameFor`, the `".pdf"` case), through the same chain to the browser as the step above._
- [ ] **(after feature 5)** Watch memory in the task manager across a download → the output is released as soon as the download is handed over, and the object URL no longer resolves → AC-4

## Commands

- [x] `pnpm test:e2e privacy.spec.ts` → 6 pass, including the canary proving the recording proxies are really installed → AC-2, AC-3
- [x] **(after feature 5)** `pnpm test:e2e privacy.spec.ts` → the redaction leg passes too: open, redact and download with the recording proxies installed, nothing ever written, no request carrying document bytes, extracted text, match text or the file name, and `GET /api/entitlement` still the only request → AC-2, AC-3. _Proven by "a full run, open to download, writes nothing down" and "a full run sends no document, text, match or name anywhere", which cover every part of this step; ticked in spec 0004's `verify.md` (its AC-21)._
- [x] **(after feature 5)** `pnpm test:e2e cancel.spec.ts` → the cancel test asserts its cancel landed during `redacting` and the session went back to review with the document open (Redact and the page count showing, no Download) → AC-10. _Proven by "a run can be cancelled while it is under way, and the tool carries on". The test lives in `cancel.spec.ts`, not `engine.spec.ts`; ticked in spec 0004's `verify.md`._
- [x] `pnpm test:e2e` → the whole browser suite passes under the enforced policy → AC-2, AC-3, AC-12
- [x] `pnpm test:e2e engine.spec.ts` → 8 pass, including the two that count `Worker` constructions: one tab reuses its worker across documents, and starting over builds a new one → AC-1, AC-5a, AC-5b
- [x] `pnpm test` → the reducer's every edge, including the ones that must not exist → AC-1, AC-10, AC-11, AC-13, AC-14
- [x] Add a `string` field to any member of `LoggablePayload`, run `pnpm typecheck` → it fails → AC-8
- [x] Add `localStorage.setItem("x", "1")` anywhere under `src/`, run `pnpm lint` → it fails in every zone, the engine and the worker included → AC-2
- [x] `NEXT_PUBLIC_MATCH_CONTEXT_CHARS=wide pnpm build` → fails at config load, before the browser ever sees it → AC-15
- [x] `NEXT_PUBLIC_MATCH_CONTEXT_CHARS=201 pnpm build` → fails; the ceiling is a privacy limit, not a display one → AC-15
- [x] `NEXT_PUBLIC_MATCH_CONTEXT_CHARS=17 pnpm build`, then open a document → the worker is handed `contextChars: 17` → AC-15, value sourcing: `matches[].before`/`.after`
- [x] `curl -i localhost:3000/api/entitlement` → `{"tier":"free","pageCap":3,...}` with `Cache-Control: private, no-store` → AC-9
- [x] Post a message to the worker after a release → no reply; the worker is gone, not merely idle → AC-5b

## Acceptance-criteria coverage

- AC-1 one session per tab · confirm on replace, reducer edges, worker registry eviction on arrival and on completion, client side retirement of the previous job, worker count held at one across documents
- AC-11a silent retry once per job inside the engine load window · manual kill during `loading-engine`, twice on the same job
- AC-2 nothing written, no FileList · `privacy.spec.ts` recording proxies + end state, lint zone, the redaction leg (after feature 5)
- AC-3 no request carries document data · `privacy.spec.ts` request capture, the redaction leg (after feature 5)
- AC-4 output released on download · download helper revoke ordering, and the real output through spec 0004's Download button (after feature 5)
- AC-5a a session that ended leaves nothing reachable · worker registry eviction on arrival and on completion, client side retirement of the previous job
- AC-5b release terminates the worker · client release test, manual post after release, worker count rising after a start over
- AC-6 bytes never on the main thread · transfer list test, `engine.spec.ts` detachment
- AC-7 no geometry crosses · `ReviewMatch` carries none, redact sends ids only
- AC-8 typed payloads only · `loggable.test.ts` type gate at `pnpm typecheck`
- AC-9 entitlement frozen, fails closed · entitlement tests, 4 page refusal
- AC-10 cancel returns to the previous step · reducer, client cancel, spec 0004's gated worker tests and browser cancel test (after feature 5 end to end)
- AC-11 lost is recoverable from the `File` handle · reducer, manual worker kill
- AC-12 restore shows idle · `pagehide` release and persisted `pageshow` reset
- AC-13 leave warning only when work would be lost · `hasUnsavedWork` cases
- AC-14 retick and rerun · reducer `complete → reviewing`, spec 0004's two run engine test proving each run starts from the untouched original (after feature 5), browser step (after feature 6)
- AC-15 context window from config · config tests, build failure cases
