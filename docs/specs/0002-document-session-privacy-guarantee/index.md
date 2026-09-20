# 0002. Document session and privacy guarantee

**Date**: 2026-09-20
**Status**: Proposed

## Summary

A redaction job lives as one session inside a single browser tab, and this spec fixes its exact shape and the rules that keep it there. The document's bytes sit in the Web Worker (a background thread with no access to the page) and nowhere else; the main thread holds only the review checklist, a handle to the file the visitor already has on disk, and counts. Nothing is written to any browser store, nothing document derived may reach a log, and ending a session terminates the worker outright, which is the only thing that actually hands the memory back. The rules are enforced by lint and proved by one browser test rather than promised in prose.

## Amends spec 0001

Spec [0001](../0001-browser-only-redaction-stack/index.md) states that "the main thread otherwise sees counts, match metadata and coordinate quads only". That wording cannot survive contact with feature 6, which requires every match to be shown "with enough surrounding context to judge it". This spec replaces it with two invariants that are both true and both enforceable:

- The match text plus a short context window **does** cross to the main thread (INV-1). It has to, or the checklist is unusable.
- Coordinate quads, page geometry and extraction offsets **never** cross (INV-2), which is stricter than 0001 assumed and costs nothing in release 1.

The guarantee was never carried by which thread a string sits on. It is carried by nothing being stored and nothing being sent.

## Requirements

**User stories**:

- As someone redacting a sensitive document, I want the file to exist only in my own browser's memory while I work on it, so no copy is left anywhere afterwards.
- As someone reviewing what will be removed, I want enough of each match's surrounding text to judge it, without that text being stored or sent anywhere.
- As someone who ticked the wrong box, I want to change it and run again without hunting for the file a second time.
- As the person operating RedactNest, I want the no storage rule enforced by tooling rather than by memory, so a later feature cannot quietly break the claim the product rests on.
- As a buyer evaluating RedactNest, I want the guarantee demonstrated by a test I can read, not only described in a policy.

**Acceptance criteria** (the contract):

- **AC-1**: One tab holds at most one session. Choosing a second file while `hasUnsavedWork` (defined in the data model below) is true asks before replacing it, and replaces it on confirmation.
- **AC-2**: After a complete run, `localStorage`, `sessionStorage`, IndexedDB and the Cache API are all empty for the origin, no service worker is registered, and the file input holds no `FileList`.
- **AC-3**: No network request made from the tool route carries document bytes, extracted text, match text or the file name. The only request that route makes is `GET /api/entitlement`.
- **AC-4**: The output buffer is released as soon as the download is handed to the browser. The object URL is revoked and no reference to the output survives in the session.
- **AC-5**: Ending a session terminates the worker. Afterwards no document bytes, no open MuPDF document and no target map remain anywhere.
- **AC-6**: Document bytes never exist on the main thread. After the handover the main thread's `ArrayBuffer` reports `byteLength` of 0. The main thread holds document **content** only as `matches[].text`, `matches[].before`, `matches[].after` and `outputName`. Everything else it holds about the document is **counts and flags** (`summary`, `outcome`), which carry no content and are the shape feature 11 is allowed to log.
- **AC-7**: Coordinate quads, page geometry and extraction offsets never cross the worker boundary. The main thread names a match only by its opaque id.
- **AC-8**: Every log, analytics and error payload this feature can emit is typed with enumerated kinds and numbers only. No free string field exists in any of those types.
- **AC-9**: A session freezes its entitlement at open, and every cap check for that job reads the frozen snapshot rather than the live value. An anonymous visitor is capped at `config.freePageCap`, not `config.maxPages`.
- **AC-10**: `cancel` aborts the operation in flight and returns the session to the previous step with the document still open. `release` ends the session and frees everything.
- **AC-11**: A worker that dies mid job puts the session into a recoverable `lost` state, retryable from the retained `File` handle without asking for the file again. The retry re-enters at `opening` and the review starts over, because the old `MatchId`s were minted by the dead worker and mean nothing to its replacement. A `File` that can no longer be read fails with `file-unreadable`.
- **AC-12**: A page restored from the back forward cache shows the idle drop area, never a checklist pointing at a released session.
- **AC-13**: Leaving the page while `hasUnsavedWork` is true triggers the browser's warning. Leaving from `idle`, or after a successful download with no further change, does not.
- **AC-14**: A completed job can have a tick changed and be run again without choosing the file a second time.
- **AC-15**: The match context window size comes from `src/config`. No window size is written as a literal anywhere else.

## Decision

**Chosen option**: Option 1: Stateful worker session with a main thread review model.

The worker keeps the document's bytes and its open MuPDF handle for the session's life, keyed by job id, and keeps the geometry needed to redact in a private map that never crosses the boundary. The main thread keeps a reducer holding the review checklist, the tick set, a frozen entitlement snapshot and a `File` handle (a pointer to a file already on the visitor's disk, not a copy of it). A session ends by terminating the worker.

## Feature design

**Data model sketch**

Main thread, `ToolSession`, held by a reducer, frozen and replaced rather than mutated:

| Field | Type | Required | Note |
|---|---|---|---|
| `state` | `SessionState` | yes | the machine below |
| `jobId` | `string` | yes | `crypto.randomUUID()`, correlates to the worker's session |
| `file` | `File` | yes | the handle, not the bytes. The recovery path for AC-11 |
| `outputName` | `string` | yes | derived from `file.name` at open. Never logged, never sent |
| `entitlement` | `Readonly<EntitlementSnapshot>` | yes | frozen at open, never refreshed mid job |
| `summary` | `DocumentSummary \| null` | null until `reviewing` | `pageCount`, `pagesWithText`. Exists today |
| `matches` | `readonly ReviewMatch[]` | yes, may be empty | empty until feature 6 fills it |
| `ticked` | `ReadonlySet<MatchId>` | yes | seeded from each match's own default |
| `phase` | `ProgressPhase \| null` | null when not working | last phase the worker reported |
| `failure` | `EngineErrorKind \| null` | null unless `failed` or `lost` | a kind from the closed set, nothing more |
| `outcome` | `RedactionOutcome \| null` | null until `complete` | counts only |
| `downloaded` | `boolean` | yes | true once a download has been handed over. Reset to false on leaving `complete` |

**`hasUnsavedWork(session)`**, a derived predicate, not a stored field. AC-1 and AC-13 both hang off it, so it is defined once here rather than described twice in prose:

- `state` is `redacting` → true
- `state` is `complete` and `downloaded` is false → true
- `state` is `reviewing` and `ticked` differs from the set seeded by `tickedByDefault` → true
- otherwise false

The tick comparison is what makes this honest. Someone who opened a file and read the checklist without touching it has lost nothing worth a warning; someone who spent ten minutes ticking has.

| Type | Fields |
|---|---|
| `MatchId` | opaque branded `string`. Minted in the worker, meaningless to the main thread |
| `ReviewMatch` | `id: MatchId` · `type: DetectorKind` · `page: number` (one based, for display) · `text: string` · `before: string` · `after: string` · `tickedByDefault: boolean`. **No quads** |
| `EntitlementSnapshot` | `tier: "free" \| "paid"` · `pageCap: number` · `maxFileBytes: number` |
| `RedactionOutcome` | `pageCount: number` · `removedByType: Readonly<Record<DetectorKind, number>>` · `pagesWithoutText: number` · `sanitized: readonly SanitizedKind[]` |
| `DetectorKind` | declared here as the union feature 6 populates. Feature 3 needs the type to exist and needs `tickedByDefault` to ride on every match; it does not decide the members |

Worker, `EngineSession`, one entry in a `Map<string, EngineSession>` keyed by `jobId`:

| Field | Type | Note |
|---|---|---|
| `bytes` | `ArrayBuffer` | transferred in at open. Never leaves |
| `doc` | MuPDF `Document` | open for the session's life, `destroy()` only on release |
| `targets` | `Map<MatchId, RedactionTarget>` | page, quads, extraction offsets. **Never crosses the boundary** |
| `limits` | `{ maxBytes: number; maxPages: number }` | handed in at open, from the entitlement snapshot |
| `cancelled` | `Set<string>` | operation ids the main thread asked to abort |

**State transitions**

```
idle ──file chosen──▶ opening ──▶ reviewing ──▶ redacting ──▶ complete
                         │           ▲   │          │   │          │
                         │           │   └──tick────┘   │          │
                         │           └─────────────cancel          │
                         │           └──────────────────change a tick
                         ▼                          │
                      failed ◀─────────────────────-┘

any state ──release (new file · start over · pagehide)──▶ idle
any state ──worker error event──▶ lost ──retry, re-read the File──▶ opening
```

- `reviewing → reviewing` on a tick is main thread only. Nothing crosses the boundary until redaction starts.
- `complete → reviewing` is what "keep the source, release the output" buys: change a tick, run again, no second trip to the file picker.
- **A successful download is deliberately not a release trigger.** It frees the output buffer and sets `downloaded`, and the session stays alive at `complete`. Releasing here would terminate the worker and make the edge above impossible. The three release triggers are the three on the diagram and no others.
- `lost` is reachable from any non idle state and is the only recoverable failure. `failed` is terminal for that document. The retry re-enters at `opening`, not at `reviewing`, because the replacement worker has never seen the old `MatchId`s.

**API surface**

This feature's surface is the worker message protocol, not HTTP. Spec 0001 fixed the envelope; this extends it and does not rename what exists.

| Message | Direction | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `open` | main to worker | `id`, `jobId`, `bytes: ArrayBuffer` (transferred), `limits`, `contextChars` | none directly | none | `too-large`, `too-many-pages`, `corrupt`, `password-required`, `engine-unavailable` |
| `redact` | main to worker | `id`, `jobId`, `matchIds: readonly MatchId[]` | none directly | none | `unsupported` (unknown `jobId` or `MatchId`), `engine-unavailable` |
| `cancel` | main to worker | `id`, `jobId` | none | none | none. A cancelled operation reports nothing |
| `result` | worker to main | `id` | `summary: DocumentSummary`, `matches: readonly ReviewMatch[]` | none | n/a |
| `redacted` | worker to main | `id` | `output: ArrayBuffer` (transferred), `outcome: RedactionOutcome` | none | n/a |
| `progress` | worker to main | `id` | `phase: ProgressPhase` | none | n/a |
| `error` | worker to main | `id` | `errorKind: EngineErrorKind` and deliberately nothing else | none | n/a |
| `release` | **main thread only** | none | none | none | none |
| `GET /api/entitlement` | main thread to own origin | none, cookie only | `tier`, caps | session cookie, same origin | any failure returns the free tier |

Notes that matter when building this:

- **`release` is not a message.** It terminates the worker. Terminating is strictly stronger than anything the worker could be asked to do, and it still works when the worker is wedged and would never read a message. This is what makes AC-5 checkable rather than hopeful.
- **`result` keeps its name.** Opening reports `result`, redaction reports a new `redacted`. Slightly asymmetric, deliberately so: renaming a kind 0001 fixed is the redesign 0001 asked us not to do, and a flat kind keeps TypeScript narrowing on one field.
- **`ProgressPhase` gains `checking-entitlement`, `detecting`, `redacting` and `writing`** beside the existing `loading-engine`, `opening` and `inspecting`. Features 5 and 6 report the middle three; feature 8 decides how all of them are shown.
- **`EngineErrorKind` gains `file-unreadable`.** Reading a `File` can reject on its own terms, with the file moved, deleted or permission revoked between choosing it and reading it. That happens on the main thread, before any message is sent, so it is outside the worker protocol, but it belongs in the same closed set so feature 8 writes copy for one list rather than two. It covers the first read as well as the retry after a lost worker, which today would fall through to `unsupported` and tell somebody nothing useful.

**When the entitlement is fetched, decided here rather than left open.** `open` needs `limits` synchronously and `limits.maxPages` must be the snapshot's `pageCap` (INV-5), so the fetch cannot happen after the message is sent, and a paid visitor must not be frozen on free caps for a whole job.

- The fetch starts on the same trigger that already warms the engine in `src/worker/client.ts`: pointer enter, focus, or drag over the drop area. By the time a file has been chosen it has almost always resolved, so the common path pays nothing.
- If it has not resolved when a file is chosen, `open` waits for it and reports the `checking-entitlement` phase while it does. The wait is bounded; on timeout it fails closed to the free tier, as spec 0001 requires of every entitlement failure.
- The tier is never revised mid job. That is INV-5, and the prefetch is what stops it being a penalty on the people who paid.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| open | `jobId` | `crypto.randomUUID()` on the main thread |
| open | `outputName` | derived from `File.name`: strip a trailing `.pdf` case insensitively, trim, fall back to the literal `document` when nothing is left, then append `-redacted.pdf`. Repeated downloads of the same name are left to the browser's own numbering rather than inventing a scheme |
| open | `entitlement.tier`, `entitlement.pageCap` | `GET /api/entitlement`, decided in spec 0001, prefetched on the engine warm trigger, failing closed to the free tier on error or timeout |
| open | `entitlement.maxFileBytes` | `config.maxFileBytes` |
| open | `limits.maxPages` sent to the worker | **the snapshot's `pageCap`**, not `config.maxPages`. See the gap note in `rationale.md` |
| open | `summary.pageCount`, `summary.pagesWithText` | the engine, already built |
| open | `matches[].id` | minted in the worker per match, opaque to the main thread |
| open | `matches[].text`, `.before`, `.after` | the worker's structured text extraction, window size from `config.matchContextChars` |
| open | `matches[].type`, `.tickedByDefault` | declared by the detector that produced the match. Feature 6 owns the set and the defaults |
| open | `matches[].page` | the engine, converted to one based in the worker for display |
| review | the initial `ticked` set | each match's own `tickedByDefault` |
| redact | the target for each ticked id | the worker's private `targets` map. **Never from the main thread**, so a stale or tampered quad cannot cause a wrong removal |
| redact | `outcome.removedByType` | counted in the worker as targets are applied. Feature 5 owns the counting |
| redact | `outcome.sanitized` | the sanitisation steps the engine actually ran. Feature 5 owns the list |
| redact | `outcome.pagesWithoutText` | derived from `summary.pagesWithText` |
| download | the Blob media type | the literal `application/pdf`, the one type this tool produces |
| download | the object URL | `URL.createObjectURL` on the main thread, revoked in the next macrotask after the click |
| download | `downloaded` | set true by the download helper once the anchor click has been dispatched |
| leave or replace | `hasUnsavedWork` | derived from `state`, `downloaded` and `ticked` against the seeded default, per the predicate in the data model. Never stored |
| any failure | `failure` | `ErrorMessage.errorKind` for a worker failure, or `file-unreadable` raised on the main thread when the `File` cannot be read. One closed set either way |

**Key invariants**

- **INV-1**: Document bytes exist in exactly one place, `EngineSession.bytes` in the worker. The main thread holds a `File` handle and never bytes. Match text and its context window do cross, and are the only document derived strings on the main thread beyond `outputName`.
- **INV-2**: Coordinate quads, page geometry and extraction offsets never cross the boundary. The main thread names a match by `MatchId` alone. Feature 14 will need geometry for drawn boxes and must extend this deliberately rather than by accident.
- **INV-3**: Nothing is written to `localStorage`, `sessionStorage`, IndexedDB, the Cache API, OPFS or the file system, and no service worker is registered. Not document content, not metadata, not a draft of the tick set.
- **INV-4**: Every log, analytics and error payload is typed with enumerated kinds and numbers only. No free string field exists in those types, so there is nowhere for a file name or a snippet to be put by accident.
- **INV-5**: A job runs to completion on the entitlement snapshot frozen at open.
- **INV-6**: A session ends by terminating the worker. There is no path that ends a session while leaving the worker alive.
- **INV-7**: The output buffer is released as soon as the download is handed over, the object URL is revoked in the next macrotask, and neither is retained.
- **INV-8**: `cancel` aborts one operation. `release` ends the session. Neither word ever means the other.
- **INV-9**: The match context window comes from `src/config`, like every other cap.

**Security model**

- **No accounts on this path.** The tool route is anonymous. The only authorisation that exists is the entitlement tier, which decides a page cap and nothing else. There is no owner, no role and no tenant, because there is no stored object to own.
- **The threat this design actually addresses** is a copy of the document surviving the visit, or reaching us. The countermeasures are INV-1, INV-3 and INV-6, plus the tool route's `connect-src 'self'` from spec 0001.
- **Compliance scope is GDPR**, inherited from spec 0001. Under this design RedactNest is not a processor of document content: the content never reaches our infrastructure, so there is no processing to describe on that path. Features 9, 16 and 17 should describe that reality rather than standard processor language.
- **Audit logging, stated plainly.** There is deliberately no audit trail of document content or of what anyone redacted, because such a trail would recreate the exact exposure the product exists to remove. This is a conscious position, not an omission. Audit logging does apply to the billing and authentication surfaces, and feature 10 owns it.
- **What this design does not control, stated honestly** so feature 16 does not overclaim: operating system swap and page files, browser process memory and crash dumps, the visitor's own disk where the source file already lives and where the redacted output is saved, and any extension with access to the page. In memory means we write nothing; it does not mean the operating system never pages that memory out.
- **The `File` handle is worth naming.** Retaining it lets the page re-read that one file until the session ends. It stores nothing new, since the file is already on the visitor's disk and they chose it, but the capability exists and the security page should say so rather than leave it to be discovered.

**Configuration required**

- `NEXT_PUBLIC_MATCH_CONTEXT_CHARS`: characters of context shown either side of a match in the review checklist. Default `40`, valid range `0` to `200`. Read through `src/config` and validated at module load like every other cap, so a malformed value fails `next build`.

**Critical test scenarios**

- **Happy path**: drop a PDF, the session opens, the checklist renders, redact, download. The output is released, the session stays alive at `complete`. Verifies **AC-1**, **AC-4**.
- **Retick and rerun**: from `complete`, change one tick, run again, and download a second time without ever touching the file picker. Verifies **AC-14**.
- **The guarantee proof, instrumented rather than sampled**: before the page loads, replace `localStorage`, `sessionStorage`, `indexedDB`, `caches` and `navigator.storage` with recording proxies through Playwright's `addInitScript`. Run a full redaction, then assert nothing was ever called, no service worker was registered, the file input holds no `FileList`, and no captured request carried document bytes, extracted text, match text or the file name. Recording every call beats checking the end state, which a write that is cleared before the run finishes would pass straight through. Verifies **AC-2**, **AC-3**.
- **Containment**: after the handover the main thread's `ArrayBuffer` reports `byteLength` of 0, and no `ReviewMatch` carries a quad or an offset. Verifies **AC-6**, **AC-7**.
- **Release**: ending a session terminates the worker, and a message posted afterwards gets no reply. Verifies **AC-5**.
- **Failure case**: the worker is terminated mid job; the session enters `lost`, retries successfully from the retained `File` handle, and lands back at `opening` with the review starting over. Verifies **AC-11**.
- **Unreadable file**: the chosen `File` cannot be read, at first open and again on a retry after a lost worker. Both report `file-unreadable`, not `unsupported`. Verifies **AC-11**.
- **Restore**: navigate away and back so a persisted `pageshow` fires; the page shows the idle drop area. Verifies **AC-12**.
- **Cancel**: cancel a redaction in flight and land back on the checklist with the document still open. Verifies **AC-10**.
- **Auth and permission**: an anonymous visitor's job is capped at `config.freePageCap`; a document above it is refused with `too-many-pages`. An entitlement fetch that fails returns the free tier rather than the paid caps. Verifies **AC-9**.
- **Typed logging**: a Vitest `expectTypeOf` test over the union of loggable payload types, asserting no member carries a `string` field outside the enumerated unions. A type level gate rather than a prose promise, so feature 11 inherits something that fails a run. Verifies **AC-8**.
- **Leaving**: `hasUnsavedWork` is false on an untouched checklist and after a download, and true while `redacting`, at `complete` before download, and once a tick differs from the seeded default. Verifies **AC-1**, **AC-13**.
- **Config**: a missing or malformed `NEXT_PUBLIC_MATCH_CONTEXT_CHARS` fails the build. Verifies **AC-15**.

## Build plan

Ordered by Skateboard: the first slice is a session that exists, holds a document across steps and is provably contained. That is the thinnest whole that is worth having, and it keeps the tool working exactly as it does today while the containment moves underneath it. The later slices grow the review model and the exit path onto it.

**Slice 1: a session exists and is provably contained**

1. Extend `src/worker/protocol.ts` with the full envelope: `jobId` on every message, the `redact` and `redacted` kinds, the four new `ProgressPhase` values, `file-unreadable` in `ENGINE_ERROR_KINDS`, and the `MatchId`, `ReviewMatch`, `EntitlementSnapshot`, `RedactionOutcome` and `DetectorKind` types. Types only, no behaviour. Satisfies **AC-6**, **AC-7**, **AC-8**, **AC-11**.
2. Add `NEXT_PUBLIC_MATCH_CONTEXT_CHARS` to `src/config`, parsed and range checked like the existing caps. Satisfies **AC-15**.
3. Turn `src/worker/engine.worker.ts` into a session registry: a `Map` keyed by `jobId` holding the bytes, the open document and the private `targets` map. Move `doc.destroy()` out of the per call `finally` and onto release. Satisfies **AC-1**, **AC-5**.
4. Rework `src/worker/client.ts` around a session: `open` returns a handle, `cancel` aborts one operation, `release` terminates the worker. Satisfies **AC-5**, **AC-10**.
5. Add the storage zone to `eslint.config.mjs` beside the engine wall, banning `localStorage`, `sessionStorage`, `indexedDB`, `caches`, `navigator.storage`, `showSaveFilePicker` and OPFS across `src/**`. Satisfies **AC-2**.
6. Write the Playwright proof: install recording proxies over every storage accessor with `addInitScript` before the page loads, run a redaction end to end, then assert nothing was ever called, no service worker is registered, and no captured request carried document data. Satisfies **AC-2**, **AC-3**.

**Slice 2: the session is reviewable and recoverable**

7. Write the session reducer as a pure function over a frozen `ToolSession`, covering every transition in the state machine including `lost`, the retry edge and the `downloaded` flag, plus the `hasUnsavedWork` predicate. Satisfies **AC-1**, **AC-9**, **AC-11**, **AC-13**, **AC-14**.
8. Prefetch the entitlement on the engine warm trigger, freeze it into the session at open, and send the snapshot's `pageCap` to the worker in place of today's `config.maxPages`. Wait behind the `checking-entitlement` phase when it has not resolved, and fail closed to the free tier on error or timeout. Satisfies **AC-9**.
9. Wire `src/app/tool/tool-client.tsx` to the reducer: retain the `File` handle, map a failed read to `file-unreadable`, clear `input.value` after selection, add the `beforeunload` guard driven by `hasUnsavedWork`, and release on `pagehide` with a reset on a persisted `pageshow`. Satisfies **AC-2**, **AC-11**, **AC-12**, **AC-13**.

**Slice 3: the session ends cleanly**

10. Build the download helper: Blob, hidden anchor, revoke in the next macrotask, drop the output reference, set `downloaded`. **It does not release the session**, which is what keeps the retick and rerun edge alive. Unit test the revoke ordering now; feature 5 wires it to real output. Satisfies **AC-4**, **AC-14**.
11. Exhaustively unit test the reducer against the state machine, including every edge that must not exist, and add the `expectTypeOf` gate asserting no loggable payload type carries a free string field. Satisfies **AC-1**, **AC-8**, **AC-10**, **AC-14**.

## Consequences

**Positive**:

- The product's central claim becomes something a test asserts rather than something a policy promises, which is exactly what feature 16 needs to sell to HR, legal and healthcare buyers.
- Features 5, 6, 13 and 14 inherit a decided session shape and a fixed protocol, so none of them has to invent one and then discover the others disagree.
- Terminating the worker at session end is the only mechanism that actually returns the MuPDF WebAssembly heap, so memory does not creep across several documents in one sitting.
- Keeping quads inside the worker is stricter than spec 0001 assumed, and it removes a whole class of bug where a stale or wrong quad on the main thread causes a wrong removal.
- The retained `File` handle turns a crashed worker from "find your file again" into a retry button, for almost no memory.
- The closed payload types make feature 11's scrubbing requirement structural. There is nothing to scrub because there is nowhere to put anything.

**Negative and tradeoffs**:

- **Peak memory is genuinely high.** During redaction the tab holds the source bytes, the parsed MuPDF document and the output at once, so a 25 MB source can mean several times that in practice. This is the ceiling spec 0001 already flagged, and this design does not lower it.
- **Terminating the worker costs a restart.** The next document pays WebAssembly instantiation again, though not a re-download, since the engine comes from the HTTP cache. Someone redacting several documents in a row feels it each time.
- **Holding the document open across user think time** is the whole point and also the cost: an abandoned tab holds a document indefinitely, because you chose no expiry timer.
- **The main thread now holds document derived strings.** That is a deliberate loosening of 0001's wording and it is the right call, but it means feature 11's error reporting has to stay disciplined on a route that now has content to leak.
- **A lint rule only bans the spellings we thought of.** A future storage API, or an indirect access through a library, slips past it. The recording proxies in the Playwright proof are the backstop and they catch a write the lint missed, including one cleared before the run ends, but they too only watch the accessors they were told to wrap. Neither mechanism can see a storage API nobody has thought of yet.
- **A crash costs the review, not just the reopen.** The retained `File` handle saves the trip to the file picker, and nothing more: the old `MatchId`s were minted by the dead worker, so a retry starts the review from scratch. On a document with sixty matches that is a real loss, and calling the `lost` state "recoverable" without saying this would be exactly the unstated fine print this spec exists to avoid.
- **The `File` handle is a retained capability**, not just a memory saving. The page can re-read that file until the session ends, and the security page has to say so.
- **Two ways to end a job, `cancel` and `release`,** means two code paths where a mistake is a privacy bug rather than a glitch. The naming rule in INV-8 exists because this is the likely place to get it wrong.

**Neutral**:

- No audit trail of document content exists, deliberately. Named here so nobody adds one later out of compliance habit; feature 10 owns audit logging for billing and authentication, where it belongs.
- The state machine is small enough to test exhaustively, which is unusual and worth exploiting in slice 3 rather than settling for happy path coverage.
- Several tabs means several independent sessions and several worker heaps against the same browser ceiling. Nothing is shared between them, which follows from INV-3 rather than needing its own rule.
- Prefetching the entitlement on the engine warm trigger means an anonymous visitor who never chooses a file still makes one `GET /api/entitlement` call. It carries no document data and returns the free tier, so it costs a request and tells nobody anything.
- `DetectorKind` is declared here and populated by feature 6. This spec needs the type and the `tickedByDefault` flag to exist; it does not decide the members.

## Follow-up

- [ ] Amend spec 0001's invariant "The main thread otherwise sees counts, match metadata and coordinate quads only" to point at INV-1 and INV-2 here, so the two specs do not contradict each other for the next reader.
- [ ] Close the cap gap found while writing this: `src/worker/client.ts` sends `config.maxPages` (50) while `src/app/tool/tool-client.tsx` tells the visitor `config.freePageCap` (3), so the free cap is currently not enforced at all. Build plan task 8 fixes it; until then the tool route is more permissive than it says.
- [ ] Feature 14 will need coordinate geometry on the main thread to draw and place boxes. It must extend INV-2 deliberately, with its own decision about what crosses and why, rather than quietly widening the payload.
- [ ] Feature 11 inherits INV-4 as a hard constraint. Any analytics or error reporting product it picks must accept a payload of enumerated kinds and numbers, or be wrapped so it only ever receives one.
- [ ] Feature 16's security page should describe the retained `File` handle and the honest limits in the Security model above, rather than claiming more than this design delivers.
- [ ] Spec 0001 left open what a visitor sees during the entitlement fetch. This spec closes it for the tool route: prefetch on the engine warm trigger, wait behind `checking-entitlement` if needed, fail closed to free. Feature 10 should adopt the same rule anywhere else it needs the tier, rather than inventing a second one.
- [ ] Record `NEXT_PUBLIC_MATCH_CONTEXT_CHARS` in root `AGENTS.md` alongside the other caps when this ships, so the "every cap comes from `src/config`" rule keeps its full list.

## Rationale

Reasoning, the premise challenge, the options weighed and what the current code turned up: see [rationale.md](rationale.md).
