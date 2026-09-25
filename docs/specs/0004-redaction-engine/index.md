# 0004. Redaction engine

**Date**: 2026-09-25
**Updated**: 2026-09-25, after an independent cross check: layered files refused outright, one shared prepare step before detection and redaction, a padded image pass, a structural self check, replacement during a run, and slice 1 made safe on its own
**Status**: In Progress

## Summary

Every redaction works on a fresh copy of the visitor's original file, so ticking a different box and running again always starts clean. The engine removes the ticked text from the page itself and draws a black box where it was. It then builds a brand new file from the redacted pages alone, so nothing it did not choose to carry (metadata, bookmarks, attachments, scripts, old revisions) comes across. Before any file leaves, the engine opens its own output and checks both that nothing survived inside a ticked area and that nothing it strips came back. If either check fails, the visitor gets no file and a plain reason, never a document that looks redacted and is not. Files that are not really PDFs, and PDFs with layers, are refused at the door.

## Requirements

**User stories**:

- As someone redacting a document, I want the ticked text genuinely gone from the file, so pasting, searching or opening it in another tool cannot bring it back.
- As someone sending a redacted file, I want the hidden parts of the file stripped too (who wrote it, earlier versions, comments, attachments), so the file says nothing I did not see on the page.
- As someone who ticked the wrong box, I want to change it and run again and get exactly what I ticked the second time, not a mix of both runs.
- As someone who dropped the wrong file, I want a photo or a Word document refused plainly, rather than turned into a PDF that pretends to be redacted.
- As the person operating RedactNest, I want the engine to refuse to hand back a file it cannot prove is clean, so the one failure the product cannot survive becomes an error message instead.

**Acceptance criteria** (the contract):

- **AC-1**: A file is refused with `not-pdf` unless the whole `%PDF-` marker lies within its first 1024 bytes (it starts at offset 1019 or earlier). The check reads the bytes and never the file name or declared type, and it runs before the engine is fetched and before MuPDF sees anything. A PNG named `scan.pdf` and sent as `application/pdf` is refused, and so are a text file and a Word document.
- **AC-2**: A file that passes the header check but does not open as a PDF document (MuPDF hands back some other kind of document) fails with `corrupt`.
- **AC-3**: A document whose catalog declares optional content (`/OCProperties`, layers a viewer can switch on and off) is refused at open with `hidden-layers`, before a review exists, whatever state each layer is in.
- **AC-4**: Every ticked target is removed from the content stream (the drawing instructions of the page). Text extracted from the output finds no character whose centre lies inside any of the target's quads (the four cornered areas that outline the match) on its page, and the target's text appears nowhere in the fully decompressed output, in either PDF string encoding. Characters beside a target on the same line, outside its quads, survive and never sit under a box.
- **AC-5**: Removal holds at the geometric edges: a target split across two lines, a page rotated 90 degrees, a page whose crop box does not start at the origin, text inside a form XObject (a reusable block of page content), text inside a form XObject listed in a resource dictionary shared with pages that never draw it, a filled form field's value, a visible typed annotation, and invisible OCR text (machine read text laid over a scan) lying over an image. For OCR text, the image pixels under the target are blanked across the target padded by `TARGET_PADDING_RATIO` of its height on every side, so ink the OCR quad misses is blanked too.
- **AC-6**: A solid black box marks every removed target area, drawn at the target's exact quads.
- **AC-7**: The output carries none of: document info, XMP metadata on any object, annotations (links included), form fields, attachments (embedded and associated files), bookmarks, optional content structure, JavaScript or automatic actions, earlier revisions, page thumbnails, private application data, the structure tree, page labels, or the source's file identifier. Its catalog (the file's root object) holds only `/Type`, `/Pages` and, when the source had one, `/Lang`. Each page holds only the keys on the page allowlist.
- **AC-8**: What was visible stays visible. An unticked filled form value and an unticked visible annotation are page content in the output, so they display and extract as ordinary text.
- **AC-9**: The output opens as a single revision PDF with the source's page count and, page for page, the same page boxes, rotation and transparency group.
- **AC-10**: A document that opens without a password but carries an owner password (editing forbidden) is redacted, and the output is unencrypted with no permission restrictions. This holds for RC4, AES-128 and AES-256 encryption.
- **AC-11**: Every run starts from `EngineSession.bytes`. Two runs on one session with different tick sets each produce output reflecting only their own ticks: text the first run removed and the second run did not tick is present in the second output. No run changes `bytes`, and no run changes the review document. This is the engine leg of spec 0002 AC-14.
- **AC-12**: A run with nothing ticked still produces a cleaned output, with `removedByType` empty and `sanitized` listing what was stripped.
- **AC-13**: Before any output crosses the boundary, the engine reopens it and checks it two ways, failing the whole run with `redaction-incomplete` and handing back no file if either finds anything. **Targets**: on every page holding a target, no character's centre lies inside any target quad, checked with ordinary extraction and again with replacement text ignored (`ignore-actualtext`). **Structure**: the trailer has no `/Info` or `/Encrypt`, the catalog and every page hold only their allowlisted keys, no object anywhere carries a carrier key or a `/JS` entry, the file is a single revision, and the page count matches the source.
- **AC-14**: All or nothing. Any failure during a run (a page that will not load, MuPDF throwing, the self check) produces no output and exactly one kind from the closed set. A partial file never crosses.
- **AC-15**: The outcome is honest. `pageCount` is the source's page count. `removedByType` counts ticked matches per kind, and only once the self check has passed. `pagesWithoutText` comes from the open summary. `sanitized` lists exactly the kinds the inventory table finds in the source, in `SANITIZED_KINDS` order.
- **AC-16**: A run reports `redacting`, then `writing`, then `verifying`.
- **AC-17**: A cancel is noticed within one page of work, and before a queued run starts. A cancel that lands during the write or the self check lets that call finish and then discards the output. A cancelled run posts nothing, and the session is back at `reviewing` with its document, bytes and targets untouched.
- **AC-18**: One run at a time per session. A run requested while a cancelled one is still finishing starts only after that one has destroyed its working copy, so a session never holds two.
- **AC-19**: The tool page carries a thin working path. `reviewing` shows a Redact button that runs over the current ticks. `redacting` shows the phase and a Cancel button. `complete` shows a one line outcome from `session.outcome` (how many items were removed and what was stripped) and, until the download has been handed over, a Download button. Download hands the file to the browser under `outputName`, releases the output as spec 0002 AC-4 requires, and leaves the session at `complete`. The three new kinds show through the existing alert in plain words.
- **AC-20**: The output held on the main thread for Download is dropped whenever the session stops being `complete` with nothing downloaded: on Download, a tick change, start over, a replacement, a lost worker and leaving the page. A redact reply that belongs to a superseded attempt is dropped rather than shown.
- **AC-21**: The instrumented privacy proof covers a full run: open, redact, download. No storage accessor is ever called, no request carries document bytes, extracted text, match text or the file name, and `GET /api/entitlement` stays the only http or https request the tool route makes. The download's `blob:` URL is local and is not counted as a request.
- **AC-22**: Detection and redaction read the same page. At open, before anything is extracted, the review copy is prepared: annotations a viewer never shows (flagged hidden, no view or invisible) and any Redact marks already in the source are deleted, then forms and visible annotations are flattened into the page. Every working copy is prepared the same way before its targets are applied, so a field whose appearance is regenerated lands where it was reviewed, content nobody saw is never painted in, and nothing is removed that nobody ticked.
- **AC-23**: A replacement that arrives during a run cancels that run, and the new document is not parsed until the run has destroyed its working copy and let go of the old bytes (spec 0002, AC-1 and AC-5a).
- **AC-24**: MuPDF's own warnings and errors never reach the console. Opening a damaged PDF, flattening and redacting print nothing from MuPDF.

## Decision

**Chosen option**: Option 1: redact a fresh working copy of the retained original, rebuild the output from its pages, and check the result before it leaves.

Each run opens its own working copy from `EngineSession.bytes`, prepares it exactly as the review copy was prepared at open, removes every ticked target with explicit MuPDF redaction settings, grafts the redacted pages into a brand new document that carries only an allowlist, writes it, and reopens the written file to prove that no character survived inside a target and no stripped structure came back. Only then does the output cross to the main thread.

**Settled with you in the design conversation:**

- **Clean original**: keep `EngineSession.bytes` and open a working copy from it for every run. The review document is never redacted.
- **Marking**: a solid black box over every removed area, drawn after the text is gone.
- **Empty run**: allowed. It cleans the file and reports 0 removed.
- **Self check**: yes, and it fails closed with `redaction-incomplete`.
- **Stripping**: rebuild from pages rather than subtract known keys.
- **Forms and visible annotations**: flatten what shows into the page, then drop every annotation object, links included.
- **Layers**: refused with a new `hidden-layers` kind.
- **Owner password files**: redacted, and the output is unrestricted.
- **Structure tree (accessibility tags)**: not carried across in release 1.
- **Fonts**: left as they are, not subset.
- **`sanitized`**: only the kinds that were actually present.
- **Header window**: `%PDF-` within the first 1024 bytes, refused as the new `not-pdf` kind.
- **Tool page**: a thin Redact, Cancel and Download path, which feature 8 restyles.
- **Spec 0002 AC-14 in the browser**: proved at the engine now. The browser step waits for feature 6.
- **Proof**: Vitest drives real MuPDF in Node over hand written fixtures, plus one Playwright run.
- **Cancel**: noticed between pages, and output that lands late is thrown away.
- **Runs**: one at a time per session.
- **References**: none.
- **The cross check's 19 fixes**: accepted as recommended, with one refinement explained under *Redaction settings* below.

**Settled here** (pick, why, runner up):

- **Where the header check lives**: in `openDocument`, before `loadEngine`, beside the size cap. A PNG then never costs the multi megabyte engine download. Runner up: in the worker before `openDocument`, which fetches the engine for a file it is about to refuse.
- **The 1024 byte window is a named engine constant** (`PDF_HEADER_WINDOW` in `src/engine`), not a config value. It is a rule about the file format, not a cap on the visitor, and an environment variable would let a typo set it to 0 and turn the check off. This is one of two deliberate exceptions to "every size limit comes from `src/config`" (the other is `TARGET_PADDING_RATIO`), and each constant's comment says so. Runner up: `src/config`.
- **PDF check after opening**: `asPDF()` must return a document, or the open fails with `corrupt`. Redaction needs a PDF document object, and MuPDF picks its handler by sniffing content rather than trusting the type it is given.
- **Layers are refused whenever the catalog has `/OCProperties`**, read through `getTrailer()` to the root. Checking each layer with `isLayerVisible` is not enough: it reports only each layer's on or off state in the default configuration. It cannot see layer membership rules (`AnyOff`, `AllOff`, visibility expressions) that hide content even with every layer on, or layers that show only when printed. Runner up: refusing only files with a layer that `isLayerVisible` reports as off, which lets those two cases through with content nobody reviewed.
- **One shared prepare step** (`prepareDocument` in `src/engine`), run on the review copy at open before inspection and detection, and on every working copy before targets are applied: delete every annotation whose `getFlags()` includes `IS_HIDDEN`, `IS_NO_VIEW` or `IS_INVISIBLE`, delete every `Redact` annotation already in the source, then `bake(true, true)`. Detection then extracts exactly the page content redaction will act on, including any field appearance MuPDF regenerates. The review copy is prepared once, at open; that is part of opening it, not a run, so INV-1 holds. Runner up: flatten only the working copy, which lets a regenerated field value land somewhere other than where it was reviewed, outside the target quads, where the self check cannot see it.
- **Engine API**: a new `redactDocument(bytes, targets, options)` takes the clean bytes and never the review handle, so the type system itself keeps a run off the review document. Both `openDocument` and `redactDocument` have internals that take the loaded MuPDF module as a parameter, and the exported functions pass `loadEngine()`'s result in. That is the seam Vitest uses to run real MuPDF in Node for opening and redacting alike. Runner up: a test only setter on `loadEngine`, which is a mutable hook in the walled module.
- **MuPDF's log is silenced once, right after the engine loads**: `setLog(() => {})`. Its warnings can quote document detail, and `setLog(null)` would not help, because it turns MuPDF's default console printing back on. This makes the existing "never capture worker console output" rule in `AGENTS.md` a backstop rather than the only line of defence.
- **Redaction settings are explicit at the call site, in two passes per target page**:
  - **Exact pass**, with Redact annotations on the targets' own quads: `applyRedactions(true, REDACT_IMAGE_PIXELS, REDACT_LINE_ART_REMOVE_IF_COVERED, REDACT_TEXT_REMOVE)`. This removes the text, removes vector marks the target fully covers (an underline, text drawn as outlines) while keeping table borders that only cross it, blanks image pixels under the target, and draws the black box at the exact size.
  - **Padded pass**, with the same quads grown outward by `TARGET_PADDING_RATIO` (0.25) of each quad's height along its own axes: `applyRedactions(false, REDACT_IMAGE_PIXELS, REDACT_LINE_ART_NONE, REDACT_TEXT_NONE)`. This blanks image pixels only, which covers scan ink the OCR quad missed. It removes no text and draws no box.
  - **The refinement to the cross check's fix**: the box stays exact and only the pixel blanking is padded. A padded box would sit over neighbouring text that is not removed, which is the "text under a black box" pattern that redaction checkers flag as a fake redaction, and a buyer may well run one against the output.
  - All eight arguments are written out even where they match MuPDF's defaults, so a library upgrade that changed a default cannot silently change what is removed. Runners up: one pass on exact quads, which leaves stray scan ink legible; one pass on padded quads, which puts neighbours under the box.
- **Rebuild**: one graft map per run, and every page grafted through it. After each `graftPage`, the working page's `/Group` (its transparency settings) is grafted through the same map and set explicitly, because MuPDF's page graft is not relied on to carry it.
- **Page allowlist**: `/Type /Parent /MediaBox /CropBox /BleedBox /TrimBox /ArtBox /Rotate /UserUnit /Resources /Contents /Group`. Every other page key is deleted after grafting, whatever the graft chose to copy.
- **Carrier sweep**: every object in the new document, recursing into its direct sub dictionaries and arrays, loses `/Metadata`, `/PieceInfo`, `/Thumb`, `/AA`, `/AF` and `/LastModified`. The allowlist covers the catalog and pages; the sweep covers what hangs below them (an image's XMP, a form XObject's private data), wherever a producer nested it.
- **Write options**: `garbage=deduplicate,compress,sanitize`. `sanitize` rewrites every page's content through MuPDF's filter, so each page keeps only the resources it actually draws. That is what stops an unredacted form XObject surviving in a resource dictionary shared with a page that never draws it. The shared resource fixture proves it, and if it does not hold, that fixture fails and the build returns to `/architect`. Never `incremental`, never `encrypt`, never `linearize`. Nothing asserts that MuPDF writes a new file identifier; AC-7 only requires that the source's is gone.
- **Destroy order**, which holds the peak at about four copies of the document: the working copy right after the last page is grafted, the rebuilt document right after `saveToBuffer`, MuPDF's output buffer right after it is copied into a fresh `ArrayBuffer`, and only then is the self check document opened. The engine makes the copy, so the bytes it checked are the bytes that cross.
- **Inventory for `sanitized`**: computed in the engine from the working copy before it is prepared, using the rules in the inventory table below.
- **Self check method**: a point in convex quad test on each character's quad centre, against the target's exact quads, run over structured text extracted twice (default options, then `ignore-actualtext`) so glyphs hidden behind replacement text are seen. The black box is a filled path, not text, so it never trips the check. The structural half walks every object once. Runner up: a text search for each target's string, which a legitimate unticked duplicate on the same page would trip.
- **Cancel mechanism**: the worker hands the engine an `isCancelled()` check. The engine yields a macrotask after opening the working copy, after preparing it, after every page (whether or not it holds a target, so an empty run still yields per page), and after the rebuild, and it throws a private `RunCancelled` (never an `EngineFailure`, never posted) when the check is set. The worker checks again when a queued run starts, and after the write and the self check before posting, dropping the output if a cancel has arrived.
- **Run queue and replacement**: the session keeps the tail of its run chain in `runs` and the operation id of the run in flight in `activeRunId`. A failed or cancelled run settles its link rather than breaking the chain. `endSession` adds `activeRunId` to `cancelled` before it closes anything, and `handleOpen` awaits the evicted session's `runs` tail before it parses the new bytes.
- **Slice 1 refuses targets**: until the exact pass and the target self check land together in slice 2, `redactDocument` answers any non empty target list with `unsupported`. No build ever hands back a file that was asked to remove something and did not.
- **An unexpected throw during a run** (including MuPDF failing to allocate memory) maps to `unsupported`. Runner up: a new `out-of-memory` kind, but MuPDF's messages are not a stable contract to detect it by, and a tab killed outright already arrives as `lost`.
- **The tool page**: the output waits in a `useRef` in `tool-client`, never in the reducer, because spec 0002 keeps the output out of `ToolSession` on purpose. The `OpenedSession` handle waits in a ref beside it. One effect drops the output ref whenever the session is not `complete` with `downloaded` false, rather than a drop at each exit. The redact reply is guarded by the same attempt counter `runOpen` uses.
- **The browser cancel test**: fulfils `GET /api/entitlement` with a paid snapshot through Playwright's `page.route`, so the test uses no product seam. It opens a generated 50 page fixture that is deliberately heavy (a large image on every page), so the run lasts long enough, and asserts that the cancel landed while `redacting` was showing. A run that finished first then fails the test rather than passing it without testing anything.
- **Encryption fixtures**: RC4, AES-128 and AES-256 owner password files, all hand written in the fixture script with `node:crypto` (RC4 is a few lines of its own), so none is authored by the engine it tests.
- **Standing in for feature 6 in tests**: a Vitest helper mints targets with MuPDF's `page.search()` on the fixture, which gives quads the same way a detector will.

## Feature design

**Data model sketch**

Worker, `EngineSession` (spec 0002's shape, amended here and in 0002):

| Field | Type | Note |
|---|---|---|
| `bytes` | `ArrayBuffer` | The clean original. Read by every run, never changed, never leaves the worker |
| `doc` | `OpenDocument` | The review copy, prepared once at open. Detection and page facts only, never redacted |
| `targets` | `Map<MatchId, RedactionTarget>` | Filled by feature 6. Never crosses the boundary |
| `limits`, `contextChars` | as today | Unchanged |
| `runs` | `Promise<void>` | **New.** Tail of the run queue, one run at a time (AC-18) |
| `activeRunId` | `string \| null` | **New.** The run in flight, so a replacement can cancel it (AC-23) |

`runs` and `activeRunId` are the session's only mutable fields; a `Map` beside the registry holding them is equally fine.

Worker only, `RedactionTarget` (in `src/engine`): `page` (zero based) · `quads` · `start` · `end` · **`kind: DetectorKind`** (new, so the worker counts `removedByType` without the main thread naming anything).

Per run, in the engine, never stored: working copy (destroyed after grafting) → rebuilt document (destroyed after the write) → MuPDF output buffer (destroyed after the copy) → the output `ArrayBuffer` → self check document (destroyed after the check) → the output, transferred.

Engine result, `RedactionResult`: `output: ArrayBuffer` · `removedByType: Partial<Record<DetectorKind, number>>` · `sanitized: readonly SanitizedKind[]`. The worker adds `pageCount` and `pagesWithoutText` from the open summary to make the `RedactionOutcome`.

Main thread: `ToolSession` is unchanged. The output waits in a `useRef` in `tool-client` between `redacted` and Download.

Protocol growth (unions only grow):

| Set | Added |
|---|---|
| `ENGINE_ERROR_KINDS` | `not-pdf`, `hidden-layers`, `redaction-incomplete` |
| `ProgressPhase` | `verifying` |
| `SANITIZED_KINDS` | `page-thumbnails`, `accessibility-tags` |

**Inventory table** (how the engine decides each `sanitized` kind was present, read from the working copy before it is prepared):

| Kind | Present when |
|---|---|
| `document-info` | the trailer's `/Info` is a dictionary with at least one entry |
| `xmp-metadata` | any object carries `/Metadata` |
| `annotations` | any page's `/Annots` holds an annotation whose subtype is not `Widget`. Links and popups count |
| `form-fields` | the catalog's `/AcroForm` has a non empty `/Fields` or an `/XFA`, or any page holds a `Widget` |
| `attachments` | `/Names/EmbeddedFiles` is non empty, any `FileAttachment` annotation exists, or any object carries `/AF` |
| `bookmarks` | the catalog's `/Outlines` has a `/First` |
| `hidden-layers` | never in release 1. A layered file is refused at open |
| `javascript` | any object carries `/JS`, or the catalog's `/Names` has a `/JavaScript` tree. Automatic actions that are not scripts (`/OpenAction` to a page, `/Launch`, `/URI`) are stripped with everything else and not reported |
| `incremental-versions` | `countVersions()` is greater than 1. A file MuPDF had to repair reports what MuPDF can count, and the rebuild drops earlier revisions either way |
| `page-thumbnails` | any page carries `/Thumb` |
| `accessibility-tags` | the catalog carries `/StructTreeRoot` |

Stripped and never reported, because they would only confuse a summary (feature 16 documents them): private application data (`/PieceInfo`), page labels, viewer preferences, automatic actions that are not scripts, and the file identifier.

**State transitions**

The session machine is spec 0002's and does not change. This feature makes three of its edges real: `redacting → complete`, `redacting → reviewing` (cancel) and `redacting → failed`.

A run, inside the worker:

```
queued ──(previous run settled, not cancelled)──▶ working copy opened from bytes
   ──▶ inventory ──▶ prepare ──▶ page 1 … n: exact pass, padded pass, yield
   ──▶ rebuild ──▶ writing ──▶ verifying (targets, then structure) ──▶ posted as `redacted`

any step ──cancel noticed (a cancel, or a replacement)──▶ discarded, posts nothing
any step ──failure──▶ discarded, posts one `error` kind
```

- `redaction-incomplete` lands the session in `failed`, which is terminal for that document. That is right: a document the engine cannot prove clean should not be offered another run.
- The pipeline order is fixed. The inventory comes before preparing, or flattened annotations would no longer be found. Preparing comes before the Redact annotations are added, or the flatten would bake the redaction markers into the page. The exact pass comes before the padded pass, so text is removed on the target's own outline.

**API surface**

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `openDocument` | engine function | `bytes`, `limits`, `onPhase` | `OpenDocument`, prepared | worker only, by lint | `not-pdf`, `corrupt`, `hidden-layers`, `password-required`, `too-large`, `too-many-pages`, `engine-unavailable` |
| `redactDocument` | engine function | `bytes` (the clean original), `targets: readonly RedactionTarget[]`, `onPhase`, `isCancelled` | `RedactionResult` | worker only, by lint | `redaction-incomplete`, `corrupt`, `unsupported`, `engine-unavailable`, private `RunCancelled` |
| `redact` | main to worker | `id`, `jobId`, `matchIds` | a `redacted` or an `error` | none | `unsupported` (unknown job or id) plus the above |
| `redacted` | worker to main | `id` | `output` (transferred), `outcome` | none | n/a |
| `progress` | worker to main | `id` | `redacting`, `writing`, `verifying` | none | n/a |
| `cancel` | main to worker | `id`, `jobId` | nothing | none | none |
| Redact button | tool page | `session.ticked` | `redact-started`, then `redacted`, `cancelled` or `failed` | none | as above |
| Cancel button | tool page | the active operation | `cancelled` | none | none |
| Download button | tool page | the held output, `outputName` | `downloaded` | none | none |

No message is added or renamed. The envelope is spec 0001's, extended by 0002; this feature only grows its unions.

**Value sourcing**

| Action | Value produced or displayed | Source |
|---|---|---|
| open | the header verdict | the first `PDF_HEADER_WINDOW` (1024) bytes of `bytes`, a constant in `src/engine` |
| open | the layer verdict | whether the catalog, reached through `getTrailer()`, carries `/OCProperties` |
| open, redact | which annotations the prepare step deletes | each annotation's `getFlags()` against `IS_HIDDEN`, `IS_NO_VIEW` and `IS_INVISIBLE`, and its type `Redact` |
| open | MuPDF's log sink | a function that does nothing, installed with `setLog` once the engine loads |
| redact | the clean original | `EngineSession.bytes` |
| redact | each target's page, quads and kind | the worker's private `targets` map, resolved from the ticked `matchIds`. Feature 6 fills it |
| redact | redaction settings for both passes | constants at the two `applyRedactions` call sites in `src/engine` |
| redact | the padded quads | each target quad grown along its own axes by `TARGET_PADDING_RATIO` (0.25) of its height, a constant in `src/engine` |
| redact | the page allowlist, the carrier keys and the write options | constants in `src/engine`, listed in *Settled here* |
| redact | each output page's `/Group` | the working copy's page `/Group`, grafted through the run's graft map |
| redact | `/Lang` in the output | the source catalog's `/Lang`, when present |
| redact | the output file identifier | whatever MuPDF writes for the new document. Nothing is carried from the source, and nothing asserts that one is present |
| redact | `outcome.pageCount` | the open summary's `pageCount`, checked against the output by the self check |
| redact | `outcome.removedByType` | ticked targets counted by `kind`, after the self check passes |
| redact | `outcome.pagesWithoutText` | the open summary's `pagesWithText`, counting `false` |
| redact | `outcome.sanitized` | the inventory table, applied to the working copy before it is prepared, ordered by `SANITIZED_KINDS` |
| redact | `output` | the written bytes copied by the engine into a fresh `ArrayBuffer`, with MuPDF's buffer destroyed at once, then transferred by the worker |
| redact | progress phases | the engine's `onPhase`, relayed by the worker |
| redact | the cancel verdict | the module `cancelled` set, fed by a `cancel` message or by `endSession` through `activeRunId` |
| review | the set Redact runs over | `session.ticked` from the reducer (spec 0002) |
| complete | the one line outcome | `session.outcome`: the sum of `removedByType` and the `sanitized` list |
| download | the file name | `session.outputName` (spec 0002) |
| download | the bytes | the output ref in `tool-client`, dropped as it is handed over |
| any failure | the alert text | `errorText` in `tool-client`, one plain line per kind until feature 8 writes the real copy |

**Key invariants**

- **INV-1**: A run never touches the review document or `bytes`. It works on a copy it opened itself and destroys it before returning. The review copy is prepared once, at open, and never again.
- **INV-2**: No output crosses the boundary unless both halves of the self check passed on those exact bytes. All or nothing.
- **INV-3**: The output carries nothing from the source that the rebuild did not choose to carry: an allowlist at the catalog and the page, a recursive sweep for known carriers below them, and a write that keeps only the resources each page draws.
- **INV-4**: The non PDF check reads bytes before MuPDF sees them. The name and the declared type are never consulted anywhere in the engine.
- **INV-5**: Redaction settings are written out at both call sites, never left to MuPDF's defaults.
- **INV-6**: Targets come only from the worker's private map (spec 0002, INV-2). The main thread sends ids and nothing else.
- **INV-7**: At most one working copy exists per session at any moment, and none survives into the next session.
- **INV-8**: The output crosses exactly once, transferred, and the worker keeps no reference to it.
- **INV-9**: Detection and redaction read the same prepared page. Anything that changes what a page shows is part of the one shared prepare step, never applied to one copy alone.
- **INV-10**: No black box ever sits over text that was not removed. The box is drawn only by the exact pass, on the target's own quads.

**Security model**

- **No new authorisation.** The tool route stays anonymous, and the page cap frozen at open (spec 0002, INV-5) already bounds what a run can touch.
- **What this feature defends against**: residue in the file's structure (the rebuild, the sweep and the structural self check), residue in the page content (the target self check), residue in shared resources (`sanitize` on write), a non PDF passed off as one (the header check), content a viewer hides (the layer refusal and the prepare step), and scan ink the OCR text misses (the padded pass).
- **The output now crosses to the main thread**, once and briefly. Spec 0002's INV-1 and AC-6 are reworded in place to say so rather than claim the main thread never holds a document.
- **Owner password restrictions are removed on purpose** (AC-10). The visitor already holds the content, and the restriction protects nothing from them. Feature 16 should say so.
- **MuPDF's diagnostics are silenced** (AC-24), so nothing it says about a document reaches the console, where feature 11 could otherwise pick it up.
- **What this design does not remove, stated honestly** so feature 16 does not overclaim:
  - Embedded fonts keep the shapes of removed characters. That is an inventory of which characters existed, never their order.
  - Text drawn as vector outlines, or shown only as pixels with no text layer, is never detected. Features 7 and 14 own those.
  - Text that no detector matched passes through as it is, including text a viewer does not show: outside the crop box, white on white, or under a black rectangle the source already had. That last one is a fake redaction the visitor received and may not know about.
  - Scan ink further from the OCR text than the padding reaches stays legible. The padding covers ordinary misalignment, not an OCR layer that is badly wrong.
  - XFA form data (an older XML form format) is dropped with the form, but its contents were never shown for review.
  - A working copy freed after a run is unreachable, not erased. The same caveat spec 0002 gives for replacement applies.
- **Compliance scope is GDPR**, inherited from spec 0001. Nothing in this feature reaches RedactNest's infrastructure.
- **Logging**: the outcome is counts and enumerated kinds, and the three new error kinds carry nothing else (spec 0002, INV-4).

**Configuration required**

None. `PDF_HEADER_WINDOW` and `TARGET_PADDING_RATIO` are deliberately engine constants, not environment variables (see *Settled here*).

**Critical test scenarios**

Engine, Vitest with real MuPDF in Node (`tests/unit/redaction.test.ts`), over hand written fixtures:

- **Happy path**: a ticked email and phone on a text page are gone by extraction and from the decompressed bytes, the neighbouring words survive and sit under no box, a black box covers each exact area, and the outcome counts both. Verifies **AC-4**, **AC-6**, **AC-15**.
- **Geometric edges**: one fixture per case in AC-5, including the shared resource case (the unredacted XObject is absent from the output bytes) and a misaligned OCR page where the image pixels in the padded margin are blanked and the neighbouring OCR words survive. Verifies **AC-5**.
- **Everything else stripped**: a fixture carrying every kind in AC-7 comes out with none of them, the catalog holds only `/Type`, `/Pages` and `/Lang`, every page holds only allowlisted keys, and `sanitized` matches the inventory table case by case. Verifies **AC-7**, **AC-15**.
- **Prepared alike**: in the same fixture, a hidden annotation never shows up in the review or the output, a Redact mark already in the source removes nothing, and a field set to regenerate its appearance is redacted where the review found it. Verifies **AC-22**.
- **Flattened, still visible**: an unticked form value and an unticked typed annotation extract as page text from the output. Verifies **AC-8**.
- **Structure**: the output is one revision with the source's page count, boxes, rotation and transparency group. Verifies **AC-9**.
- **Owner password**: the RC4, AES-128 and AES-256 fixtures redact, and each output needs no password and carries no restrictions. Verifies **AC-10**.
- **Two runs, one original**: run with targets A and B, then with A only, from the same `bytes`. The second output still holds B, and `bytes` is byte for byte unchanged. Verifies **AC-11**.
- **Empty run**: no targets yields a cleaned file, empty `removedByType`, and a populated `sanitized`. Verifies **AC-12**.
- **The self check fires**: run the internal pipeline with the exact pass skipped, and separately with the carrier sweep skipped; each must fail with `redaction-incomplete` and return no output. Verifies **AC-13**, **AC-14**.
- **Refusals**: a PNG named `.pdf`, a text file, a docx and a PDF whose marker starts at offset 1020 are `not-pdf`; the same PDF with its marker at offset 1019 opens. A layered fixture is `hidden-layers` whatever its layers' states. The engine is never loaded for a `not-pdf` file. Verifies **AC-1**, **AC-2**, **AC-3**.
- **Silence**: with a recording log installed in place of the no op, opening a damaged fixture, flattening and redacting reach MuPDF's log callback, and with the no op installed nothing reaches `console`. Verifies **AC-24**.

Worker, Vitest with the engine mocked (`tests/unit/engine-worker.test.ts`):

- **Failure case, cancel**: a gated engine lets the test cancel between pages, during the write, during the self check, and while a run waits in the queue. Each posts nothing, and a following run starts only after the cancelled one settles. Verifies **AC-17**, **AC-18**.
- **Replacement mid run**: an `open` for a new job arrives while a run is gated. The run is cancelled, and the new document's `openDocument` is not called until the run has settled. Verifies **AC-23**.
- **Phases and outcome**: `redacting`, `writing`, `verifying` in order; the outcome is assembled from the result plus the summary; the engine's buffer is transferred as it is. Verifies **AC-15**, **AC-16**.
- **All or nothing**: an engine throw of any kind posts exactly one `error` and no `redacted`. Verifies **AC-14**.

Tool page, component test (`tests/component/tool-client.test.tsx`):

- The buttons follow the states; `complete` shows the one line outcome; Download calls the helper with `outputName` and then disappears; the held output is dropped on a tick change, start over, replacement and a lost worker; a redact reply from a superseded attempt is ignored; each new kind renders its line. Verifies **AC-19**, **AC-20**.

Browser, Playwright:

- **Privacy proof, redaction leg**: in `privacy.spec.ts`, open, redact and download with the recording proxies installed. Nothing is ever written, no http or https request carries document data, and the entitlement call stays the only such request. Verifies **AC-21**.
- **The real engine in the real worker**: in `engine.spec.ts`, redact the metadata fixture and catch the download. Node then opens the downloaded file with MuPDF and finds it cleaned. Verifies **AC-7**, **AC-19**.
- **Quiet console**: open a damaged fixture and run a redaction while recording console messages. Nothing from MuPDF appears. Verifies **AC-24**.
- **Cancel in a real browser**: a paid snapshot through `page.route`, the heavy 50 page fixture, and a cancel asserted to land during `redacting`. Back on the checklist, with no Download offered. Verifies **AC-17**, **AC-19**.
- **Auth and permission**: there is no new permission. An anonymous visitor's 4 page document is still refused at open with `too-many-pages` before any run can start (spec 0002, AC-9), so no run ever exceeds the frozen cap.

## Build plan

Ordered by Skateboard. Slice 1 is the thinnest whole that is safe to ship on its own: a real PDF goes in, a cleaned and structurally checked PDF comes out through the page, the outcome says plainly that nothing was removed, and nothing that is not a PDF or cannot be cleaned gets through. The refusals and the prepare step sit in slice 1 on purpose, because without them a cleaning run could turn a PNG into a `-redacted.pdf` or paint in content nobody saw. Slice 2 lands real removal and the target self check together, never one without the other. Slice 3 makes a run stop cleanly, including when a new file replaces it.

**Slice 1: a clean file leaves the tool, and only from a real PDF**

1. Grow the protocol: the three error kinds, `verifying`, the two sanitized kinds, and `kind` on `RedactionTarget`. Add a plain line for each new kind to `errorText` and each new phase to `PHASE_TEXT` in `tool-client`, reword the `corrupt` and `unsupported` lines so they read true after a failed run as well as a failed open, and keep the `LoggablePayload` gate green. Satisfies **AC-1**, **AC-3**, **AC-13**, **AC-16**, **AC-19**.
2. Rework `openDocument` behind the module parameter seam: the `PDF_HEADER_WINDOW` check before `loadEngine`, `setLog` silenced once the engine loads, the `asPDF()` check, the `/OCProperties` refusal, and `prepareDocument` on the review copy before inspection. Update the existing `not-really.pdf` browser test to expect `not-pdf`, and add a PNG named `.pdf`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-22**, **AC-24**.
3. Grow `scripts/make-fixture.mjs` with hand written fixtures: the metadata fixture (every AC-7 kind across two revisions, plus a hidden annotation, a Redact mark already in place and a form set to regenerate its appearances), a layered fixture, and the offset 1019 and 1020 header pair. Satisfies **AC-1**, **AC-3**, **AC-7**, **AC-22**.
4. Build `redactDocument` without removal: working copy from `bytes`, inventory by the table, `prepareDocument`, rebuild (one graft map, `/Group`, page allowlist, recursive carrier sweep, `/Lang`), the destroy order, write with the fixed options, the engine's own output copy, and the structural half of the self check. It answers any non empty target list with `unsupported`. Add a Vitest suite that drives real MuPDF in Node through the seam. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-22**.
5. Wire `handleRedact` in the worker: resolve ids against `targets` (an empty set is allowed), run, report phases, assemble the outcome, transfer the engine's output buffer as it is (the engine made the copy, so the bytes it checked are the bytes that cross), and map every failure to one kind. Rewrite the worker test that asserts redaction is `unsupported`. Satisfies **AC-12**, **AC-14**, **AC-15**, **AC-16**.
6. The thin path in `tool-client`: Redact, the one line outcome and Download from existing primitives, the `OpenedSession` and output refs, the single effect that drops the output, and the attempt guard on the redact reply. Satisfies **AC-19**, **AC-20**.
7. The browser legs: the privacy proof's redaction leg in `privacy.spec.ts` with its filter narrowed to http and https requests, the real engine redaction in `engine.spec.ts` with the downloaded file checked in Node, and the quiet console check. Satisfies **AC-7**, **AC-21**, **AC-24**.

**Slice 2: targets are really removed, and the engine checks its own work**

8. Per page on the working copy: the exact pass (Redact annotations on the targets' quads, `applyRedactions` with the exact settings), then the padded pass (quads grown by `TARGET_PADDING_RATIO`, `applyRedactions` with the padded settings), then a yield. Every page is visited, with or without a target. Satisfies **AC-4**, **AC-5**, **AC-6**.
9. The target half of the self check, in the same change as task 8 and lifting task 4's refusal of non empty targets: point in quad on character centres, extracted twice, with the `verifying` phase and `redaction-incomplete`. Prove it fires with the exact pass skipped, and prove the structural half fires with the sweep skipped. Satisfies **AC-13**, **AC-14**, **AC-16**.
10. The geometric fixture matrix and the Vitest target helper built on `page.search()`: two lines, rotated page, offset crop box, form XObject, shared resource XObject, filled field, typed annotation, aligned and misaligned OCR over an image, an ActualText span (replacement text wrapped around a match), and neighbours that survive outside any box. Each is checked by extraction and in the decompressed bytes. This is also the proof that `sanitize` on write keeps only what each page draws. Satisfies **AC-4**, **AC-5**, **AC-8**.
11. Two runs on one session with different targets, asserting the second output and the unchanged `bytes`. Satisfies **AC-11**.
12. The RC4, AES-128 and AES-256 owner password fixtures, hand written with `node:crypto`, each redacted into an unrestricted output. Satisfies **AC-10**.

**Slice 3: a run stops cleanly**

13. Cancel through `isCancelled()`: the yields after opening, preparing, every page and the rebuild, the check when a queued run starts, a private `RunCancelled`, and a check before posting that drops late output. Add the Cancel button. Satisfies **AC-17**, **AC-19**.
14. The per session run queue in `runs`, `activeRunId`, and replacement: `endSession` cancels the run in flight and `handleOpen` awaits its settling before parsing. Gated engine tests for a run requested behind a cancelled one and for an `open` arriving mid run. Satisfies **AC-18**, **AC-23**.
15. The browser cancel test: a paid snapshot through `page.route`, the heavy 50 page fixture generated at test time, and the cancel asserted during `redacting`. Satisfies **AC-17**.

## Consequences

**Positive**:

- The product's one unforgivable failure becomes a refusal. A document shape nobody foresaw produces an error, not a quietly unredacted file, and the structural check extends that to the file's hidden parts.
- A rerun is exact. Every run starts from the same bytes, so the output always matches the current ticks and never carries a previous run's removals.
- The rebuild strips what nobody thought to list. A future PDF feature that hides data somewhere new is left behind by default rather than carried across until somebody notices.
- Detection and redaction cannot disagree about what a page shows, because both read the one prepared page.
- Spec 0002's `EngineSession.bytes` now has a reader, which answers the question 0002 left open and keeps the retained memory honest.
- The refusals are plain. A photo, a Word file or a layered drawing gets a sentence saying why, not a fake PDF.
- The removal is proved in seconds against real MuPDF in Node, so the fixture matrix can grow as fast as the edge cases do.
- Feature 14 gets its mechanism for free: a drawn rectangle is another target with quads, and both passes already handle images.

**Negative and tradeoffs**:

- **Peak memory rises.** With the destroy order, a run peaks at about four copies of the document: `bytes`, the review document, and two of the working copy, the rebuilt document, the output and the self check copy at any one moment. MuPDF's WebAssembly heap keeps its high point until a release. The memory measurement item in spec 0001's Follow-up now has to measure this.
- **The output is plainer than the source, by design.** No bookmarks, no links, no fillable fields, no tags, no page labels, no attachments. Somebody redacting a long report loses its navigation, and a screen reader user loses its structure. The summary tells them about the tags through `accessibility-tags`, and the rest is the price of the rebuild.
- **Every layered PDF is refused**, including those whose layers are all visible. That is broader than it strictly needs to be, and it is the only rule MuPDF.js lets us state truthfully. They are rare in this audience, but a visitor who has one gets no file.
- **`sanitize` rewrites every content stream on the way out.** It is what keeps shared resources honest, and it adds a small rendering risk on unusual files. The fixtures and the two reader checks in `verify.md` are the guard.
- **The padded pass leaves a margin of blanked pixels around boxes on scanned pages.** That looks slightly heavier than the text, and it is the cost of covering ink the OCR text missed.
- **The review copy is flattened at open.** Detection sees form values and typed comments as page text, which is what we want, and the review copy is no longer byte for byte what MuPDF first parsed. Nothing reads it for any other purpose.
- **`redaction-incomplete` is terminal for that document.** If MuPDF cannot remove something, the visitor cannot redact that file here at all. That is the right answer, and it will occasionally feel like a dead end.
- **Replacement text wrapped around a match (an ActualText span) is still the likeliest place for a survivor.** The second extraction pass sees the glyphs behind it, and the byte level fixture test is what proves the replacement string itself does not survive. A failure there routes back through `/architect` rather than into a quick fix.
- **A replacement now waits for a run in flight** to notice its cancel, which can take up to one page or one write. That delay is what keeps two documents from being open at once.
- **MuPDF's own diagnostics are gone from the console**, which makes an engine problem harder to debug from a visitor's report. The closed error kinds are what is left, by design.
- **Owner restrictions are removed.** That is deliberate and defensible, and it needs saying plainly on the security page so it does not read as a bypass.
- **The black box needs careful wording.** The product line "never covered with a black box" means "never only covered". Features 15 and 16 should say "removed, then marked" so a buyer who sees black boxes does not conclude the opposite.
- **Cancel is only as quick as one page.** A single very heavy page, or the final write, cannot be interrupted, only discarded afterwards.
- **One extra parse per run** for the self check, which the `verifying` phase makes visible rather than hides.

**Neutral**:

- The session state machine does not change. Three of its edges simply become reachable.
- `hidden-layers` sits in `SANITIZED_KINDS` and is never reported in release 1. The union only grows, and the kind will mean something if a later decision cleans layers rather than refusing them.
- `EngineErrorKind` grows to eleven members, and feature 8 writes copy for all of them.
- The allowlists, the carrier keys, the write options and both padding and header constants live in `src/engine`, so changing any of them is a reviewed code change with a failing fixture as the proof.

## Follow-up

- [ ] Feature 6 must set `kind` on every `RedactionTarget` it mints, give quads in the same page space `page.search()` uses, and leave `start` and `end` for features 6 and 13. With feature 6 built, spec 0002's AC-14 browser step closes; whichever of features 5 and 6 lands second ticks it in 0002's `verify.md`.
- [ ] Features 6 and 7: flag text a viewer does not show, so a visitor learns about it before sending the file. The cases are characters under an opaque fill (a fake redaction already in the source, findable with MuPDF's structured text vector option), text outside the crop box, and text the same colour as its background.
- [ ] Feature 7 decides whether a document with no text layer on any page is refused at open or at redact time. This engine produces a cleaned file for it today, because nothing is ticked.
- [ ] Feature 8 writes the real copy for `not-pdf`, `hidden-layers`, `redaction-incomplete` and `verifying`, restyles the thin path and its one line outcome, makes a run with 0 removed impossible to mistake for a redaction, and shows the `sanitized` list, including the `accessibility-tags` loss.
- [ ] Feature 14 reuses `redactDocument` with rectangle targets, and must widen spec 0002's INV-2 deliberately to get geometry onto the main thread.
- [ ] Feature 16's security page: the black box is drawn after removal, fonts keep a character inventory, tags and navigation are dropped, owner restrictions are removed on purpose, scan ink beyond the padding can survive, text no detector matched passes through, and freed working copies are unreachable rather than erased.
- [ ] Features 15 and 16: reword "never covered with a black box" to "removed, then marked" wherever a box now appears.
- [ ] Measure peak memory on a 50 page, 25 MB document on the support target, extending the item in spec 0001's Follow-up now that a run holds about four copies at its peak.
- [ ] Revisit after release 1, with real documents: keeping and scrubbing the structure tree, subsetting fonts, tuning `TARGET_PADDING_RATIO`, and cleaning layers instead of refusing them.
- [ ] Root `AGENTS.md` should record, when this ships: the `not-pdf` byte rule, the two engine constants that are deliberate exceptions to the caps rule, the rebuild approach and the shared prepare step, the silenced MuPDF log (which updates the existing console output note), the module parameter seam that lets Vitest run real MuPDF in Node, and the grown fixture script.
- [x] Spec 0002 amended in place for items 2 to 4 carried in from earlier features: INV-1 and AC-6 reworded, `EngineSession.bytes` given its reader, and `verify.md` brought up to date.

## Rationale

Reasoning, the options weighed for each decision, what the cross check changed, and what the code and MuPDF.js turned up: see [rationale.md](rationale.md).
