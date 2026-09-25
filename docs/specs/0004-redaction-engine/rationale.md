# 0004. Redaction engine: rationale

The decision record for [index.md](index.md). The reasoning, the options weighed and the evidence behind them. A build does not need this file.

## Context

> ⚠️ Premise note: feature 5 lands before feature 6, the only thing that mints targets. Built in scope order, the engine can remove text in a test long before a visitor can tick anything, and a browser run in the meantime can only clean a file, not redact it. That is fine as long as nobody mistakes the one for the other. So removal is proved at the engine's own boundary, with a test helper standing in for detection, and the browser proves the parts it genuinely exercises: the write, the download and the privacy leg. The one browser step that needs a tick (spec 0002's AC-14) waits for feature 6 and says so, rather than being faked with a test detector in the product bundle.

This is the feature the product exists for. Spec 0001 chose MuPDF because it really removes text from a PDF's content stream rather than drawing over it, and spec 0002 fixed where a document lives while it is open: in the worker, as the original bytes plus an open MuPDF document, with the geometry of every match kept in a private map. What neither decided is what happens when somebody presses the button, and every part of that is a place where a file can come out looking redacted when it is not.

The forces are specific. Redaction in MuPDF rewrites the document it runs on, and MuPDF.js has no deep copy, so a second run with different ticks has nowhere clean to start from unless something is kept for it. A PDF carries far more than its visible pages: document info, XMP metadata on the file and on individual images, comments, filled form fields, attachments, bookmarks, layers a viewer hides, JavaScript, page thumbnails that are pictures of the unredacted page, earlier revisions left behind by incremental saves, and replacement text for accessibility that can repeat the very words removed. The scope's contract names most of these, and a reader of the output does not care which ones the contract happened to list. Redaction is geometric, so text split across lines, rotated pages, offset crop boxes, form XObjects and OCR text over a scanned image are exactly where a quad and a glyph can disagree.

Two defects are already in the tree. MuPDF sniffs content rather than trusting the type it is given, so today a PNG sent as `application/pdf` opens as a one page document, and a cleaning run would turn it into a `-redacted.pdf` of a photo. And spec 0002 left `EngineSession.bytes` written at open and never read, holding up to 25 MB that nothing used, while its INV-1 claimed the document existed "in exactly one place" when it already existed twice inside the worker and was about to cross to the main thread as output.

The consequence of getting this wrong is not a bug report. It is a person sending a file they believe is clean, and the product's claim being false in the one place it matters.

## Options considered

The feature is one decision with several load bearing parts. Each part below lists the options weighed; the chosen composite is Option 1 in [index.md](index.md).

### The clean original for a rerun

**Keep `bytes`, open a working copy per run (chosen).** Every run parses a fresh copy from the retained original, redacts that, and destroys it.
- Pros: each run starts from exactly what the visitor chose; nothing depends on an undo being correct; the review document is never touched, which the type system can enforce.
- Cons: holds up to 25 MB for the session's life; one parse per run.

**MuPDF's journal and undo.** Record the run as one operation, write the output, then undo.
- Pros: one parsed copy, no retained bytes, lowest resting memory.
- Cons: redaction is a whole content rewrite, and an undo that misses anything leaves a previous run's removals in place. The rerun would then remove more than was ticked while reporting otherwise, which is a silent correctness failure.

**Serialize the review document at each run.** Drop `bytes`; write the untouched review document to a temporary buffer and open the working copy from that.
- Pros: no retained bytes between runs; geometry is guaranteed identical because it is the same parsed document.
- Cons: an extra full write per run; a repaired or unusual source is round tripped through MuPDF's writer before redaction, which adds a step that can differ from what was reviewed.

**Read the `File` again for each run.** Drop `bytes`; the main thread reads and transfers the file again.
- Pros: the least worker memory.
- Cons: a file moved or deleted after opening fails a rerun partway through a session, and every run repeats a main thread read of the whole document.

### How everything besides the text is stripped

**Rebuild from pages (chosen).** A new document, the redacted pages grafted in, a page key allowlist, and a sweep for carriers below the page.
- Pros: anything nobody thought to list is left behind by default; the source's file identifier, which could link the output back to its source, goes with it.
- Cons: loses document level features people value (bookmarks, page labels, tags); relies on the allowlist being complete enough to render every page correctly.

**Subtract known keys.** Delete a list of carriers from the redacted document and save with garbage collection.
- Pros: keeps more of the document; smaller code.
- Cons: a carrier missing from the list survives, silently, and the list has to track every PDF version's new places to hide data.

### Forms and visible annotations

**Flatten, then drop every annotation object (chosen).** Bake what shows into the page first, then carry no annotation across.
- Pros: filled answers and typed comments stay visible and become redactable like any other text; links, which can carry a removed email address as a `mailto`, go.
- Cons: the output is no longer fillable, and links stop working.

**Delete them all.** Remove every field and annotation outright.
- Pros: simplest.
- Cons: every filled answer disappears, ticked or not, which destroys the documents people most often need to redact.

### Layers

**Refuse any layered file (chosen, after the cross check).** A new `hidden-layers` kind whenever the catalog has `/OCProperties`, and no file.
- Pros: nothing is guessed; MuPDF.js can switch layers but cannot delete a hidden one's content, so refusing is the only answer that is true, and a rule on one catalog key has no hole in it.
- Cons: refuses files whose layers are all visible, which strictly did not need refusing.

**Refuse only files with a layer that is off (the first draft).** Check each layer with `isLayerVisible` and refuse when one is off.
- Pros: a file whose layers are all on still gets redacted.
- Cons: `isLayerVisible` reports only each layer's on or off state. Layer membership rules (`AnyOff`, `AllOff`, visibility expressions), which MuPDF 1.28.1 does evaluate, can hide content with every layer on, and a layer that shows only when printed has no source at all. Either lets content nobody reviewed into the output, visible.

**Show everything.** Switch every layer on before detection and write the output with no layer structure.
- Pros: every document gets a file, and hidden content becomes reviewable.
- Cons: the output's appearance changes, hidden content no detector matched becomes visible to whoever receives the file, and membership rules can still hide content with every layer on.

### Whether the engine checks its own work

**Reopen and check geometrically, failing closed (chosen).**
- Pros: turns a document shape nobody tested into a refusal instead of a leak; costs one parse.
- Cons: one extra parse per run; a document the check refuses cannot be redacted here at all.

**Trust MuPDF at run time, prove it in tests.**
- Pros: faster runs, simpler engine.
- Cons: the test fixtures are the only line of defence, and real documents are more varied than any fixture set.

### Where removal is proved

**Vitest with real MuPDF in Node (chosen).** The npm package runs in Node, so a module parameter seam lets Vitest drive the real engine over the fixture matrix, and one Playwright run proves the same engine in the worker.
- Pros: fast enough for the matrix to grow with every edge case; the same MuPDF version as the browser.
- Cons: Node is not where the engine ships, so the browser leg remains necessary, and the seam must stay a parameter rather than grow into a hook.

**Browser only.**
- Pros: the truest environment for every case.
- Cons: a slow suite that grows with every fixture, which in practice means fewer fixtures.

## Rationale

The clean original is kept as bytes because the alternative that saves memory, undo, fails in the worst direction. A missed undo does not crash. It produces a file that removed more than the visitor ticked and reports that it removed less. Holding 25 MB is a known, bounded cost that spec 0001's memory ceiling already has to accommodate, and it gives the field spec 0002 left without a reader its one job. Serializing the review copy was the strongest runner up and remains the move if memory measurement forces it.

The rebuild beats subtraction for the same reason the self check beats trusting the library: this product's failure mode is silent. A subtraction list and a trusted library both fail by doing nothing visible, and a person finds out when somebody else reads their file. An allowlist fails loudly instead. A missing page key shows up as a page that renders wrongly in a fixture, not as metadata that quietly survives. The things the rebuild costs (bookmarks, links, tags, fillable fields) are real, and the summary tells the visitor about the one that matters most to somebody else, the accessibility tags.

Flattening before dropping follows from what people redact. Filled forms, HR letters and statements are the audience's core documents, and deleting every filled answer to remove one email address would make the tool unusable on them. Flattening turns those answers into page content, which is exactly what detection already sees and redaction already removes.

Layered files are refused rather than revealed because MuPDF offers no honest middle. It can hide or show a layer, not delete what is in it. Revealing puts content nobody reviewed in front of whoever receives the file, and refusing costs a visitor from a CAD or design export, who is not who this product is for. The refusal covers every layered file, not only those with a layer switched off, because the per layer check cannot see the rules that hide content with every layer on.

Owner password restrictions are removed because refusing them would refuse bank statements, one of the most common documents this audience needs to redact, to protect a restriction that stops nothing: the visitor already has the content on screen.

The proof lives in Node because the fixture matrix is where the confidence comes from, and a matrix that takes minutes per run stops growing. The browser leg stays for what only a browser can show: the engine inside the worker, under the tool route's policy, with nothing written down and nothing sent.

## What the cross check changed

An independent read only review on a different model (Fable 5.1) found 19 gaps. You accepted every recommended fix. Eight were ways a file could leave looking redacted when it was not, and they reshaped the design:

- **Shared resources.** An unredacted form XObject could survive in a resource dictionary shared with a page that never draws it, carried by the graft and kept by garbage collection because it was still referenced. Fixed by `sanitize` on write, proved by its own fixture.
- **Layers.** The per layer check had two holes (see *Options considered*). Fixed by refusing any file with `/OCProperties`.
- **Flattening could differ from the review.** Hidden annotations could be painted in, Redact marks already in the source would be applied without being counted, and a regenerated field could land outside the reviewed quads. Fixed by one shared prepare step, run on the review copy at open and on every working copy. This went further than the cross check's own suggestion, which deleted annotations only in the working copy: preparing both copies alike is what makes detection and redaction read the same page (INV-9).
- **Scan ink outside the OCR quads.** Fixed by a padded second pass that blanks image pixels only. The cross check's version padded the box too. The spec keeps the box exact (INV-10), because a padded box would sit over neighbouring text that is not removed, which is the pattern redaction checkers flag as a fake redaction.
- **Replacement text.** The self check could miss glyphs behind an ActualText span. Fixed by extracting twice, once with `ignore-actualtext`, and by defining the test as point in convex quad.
- **Text only self check.** Fixed by the structural half of AC-13.
- **Slice 1 on its own.** It would have handed back a `-redacted.pdf` with nothing removed and no sign of it, and ignored targets if feature 6 landed first. Fixed by refusing non empty targets until removal and the target check land together, and by the one line outcome before Download.
- **Replacement during a run.** The run's working copy and the old bytes stayed alive while the next file parsed, breaking spec 0002's AC-1 and AC-5a. Fixed by `endSession` cancelling the run and `handleOpen` waiting for it (AC-23).

The other eleven settled what the builder would otherwise have invented: the inventory table, `/Group`, a recursive sweep, the tool page's exits, the `openDocument` seam, cancel yield points, the destroy order, the request filter, MuPDF's log, AES fixtures, and the honest limits for feature 16.

## What the code and MuPDF.js turned up

- **No deep copy.** `new PDFDocument(doc)` in `mupdf.js` calls `_wasm_keep_document` on the same pointer. It is a second reference to one document, not a copy, so it cannot serve as a clean original.
- **Redaction defaults.** `PDFPage.applyRedactions` defaults to black boxes on, `REDACT_IMAGE_PIXELS`, `REDACT_LINE_ART_REMOVE_IF_COVERED` and `REDACT_TEXT_REMOVE`, which is the chosen setting. They are written out anyway (INV-5).
- **Layers.** MuPDF.js exposes `countLayers`, `isLayerVisible` and `setLayerVisible`, and nothing that removes a layer's content. The 1.28.1 binary carries the `AnyOff` and `AllOff` membership rules, so MuPDF evaluates them when it renders and extracts, and `isLayerVisible` does not report them.
- **Logging.** `setLog(fn)` routes MuPDF's warnings and errors to `fn`; `setLog(null)` disables the callback, which returns MuPDF to printing on its own.
- **Annotation flags and extraction options.** `PDFAnnotation` exposes `getFlags()` with `IS_HIDDEN`, `IS_NO_VIEW` and `IS_INVISIBLE`. The binary carries the `ignore-actualtext` structured text option and the `sanitize` write option.
- **Available cleanup calls.** `bake(bakeAnnots, bakeWidgets)`, `countVersions`, `getEmbeddedFiles`, `deleteEmbeddedFile`, `newGraftMap` with `graftPage`, and `subsetFonts` (not used, by decision) all exist in 1.28.1. `applyRedactions` takes its four settings independently, so a pass that blanks pixels without removing text or drawing a box (`REDACT_TEXT_NONE`) is a supported call, not a workaround.
- **Not verifiable here, and so not relied on:** which page keys MuPDF's `graftPage` copies (hence `/Group` is grafted explicitly and the allowlist deletes the rest), whether the writer adds a new file identifier (hence AC-7 asserts only that the source's is gone), and exactly how `sanitize` prunes resources (hence its own fixture).
- **Content sniffing.** `Document.openDocument(bytes, "application/pdf")` still lets MuPDF choose the handler from the content, which is why a PNG opens today. The `PDFDocument` constructor only checks the type of what comes back. Hence the byte check in front and `asPDF()` behind.
- **`EngineSession.bytes`** is written at open in `src/worker/engine.worker.ts` and read nowhere else, confirming what spec 0002's Follow-up recorded.
- **The worker's `redact` handler** currently answers every request with `unsupported`, deliberately, and `tests/unit/engine-worker.test.ts` asserts it. Slice 1 replaces both.
- **Tests sit outside the lint zones** (`eslint.config.mjs`), so a Vitest file may import `mupdf` directly and hand it to the engine's internals without breaching the engine wall, which binds `src/` only.
