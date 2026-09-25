# 0004. Redaction engine: rationale

The decision record for [index.md](index.md). The reasoning, the options weighed and the evidence behind them. A build does not need this file.

## Context

> ⚠️ Premise note: feature 5 lands before feature 6, the only thing that mints targets. Built in scope order, the engine can remove text in a test long before a visitor can tick anything, and a browser run in the meantime can only clean a file, not redact it. That is fine as long as nobody mistakes the one for the other. So removal is proved at the engine's own boundary, with a test helper standing in for detection, and the browser proves the parts it genuinely exercises: the write, the download and the privacy leg. The one browser step that needs a tick (spec 0002's AC-14) waits for feature 6 and says so, rather than being faked with a test detector in the product bundle.

This is the feature the product exists for. Spec 0001 chose MuPDF because it really removes text from a PDF's content stream rather than drawing over it, and spec 0002 fixed where a document lives while it is open: in the worker, as the original bytes plus an open MuPDF document, with the geometry of every match kept in a private map. What neither decided is what happens when somebody presses the button, and every part of that is a place where a file can come out looking redacted when it is not.

The forces are specific. Redaction in MuPDF rewrites the document it runs on, and MuPDF.js has no deep copy, so a second run with different ticks has nowhere clean to start from unless something is kept for it. A PDF carries far more than its visible pages: document info, XMP metadata on the file and on individual images, comments, filled form fields, attachments, bookmarks, layers a viewer hides, JavaScript, page thumbnails that are pictures of the unredacted page, earlier revisions left behind by incremental saves, and replacement text for accessibility that can repeat the very words removed. The scope's contract names most of these, and a reader of the output does not care which ones the contract happened to list. Redaction is geometric, so text split across lines, rotated pages, offset crop boxes, form XObjects and OCR text over a scanned image are exactly where a quad and a glyph can disagree.

Two defects are already in the tree. MuPDF sniffs content rather than trusting the type it is given, so today a PNG sent as `application/pdf` opens as a one page document, and a cleaning run would turn it into a `-redacted.pdf` of a photo. And spec 0002 left `EngineSession.bytes` written at open and never read, holding up to 25 MB that nothing used, while its INV-1 claimed the document existed "in exactly one place" when it already existed twice inside the worker and was about to cross to the main thread as output.

The consequence of getting this wrong is not a bug report. It is a person sending a file they believe is clean, and the product's claim being false in the one place it matters.

Building slice 2 turned up two more forces, both about geometry. A quad from `page.search()` runs from the font's ascent to its descent as MuPDF measures them, between 1.0 and 1.37 em tall depending on the font, so at single spacing it reaches into the lines above and below. MuPDF removes any glyph whose full height box touches a Redact area, which makes that overlap a removal, not just a picture: whole words on the neighbouring lines vanish, and nothing in the first design noticed. Separately, replacement text (`/ActualText`, a string a PDF can attach to a run of glyphs so that copying yields that string instead) survives whole when only some of its glyphs are removed. Ordinary extraction then still returns the ticked match, and MuPDF places those characters just outside the target's quad, where the first design's check was not looking. The opposite failure matters as much as the leak: a redacted contract missing an unticked word can mean something different.

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

### Where text is removed (after slice 2)

**A thin band through each quad, ends pulled in (chosen).** The quad from 0.45 to 0.55 of its height, each end pulled in by 0.1 of its height (first 0.05, widened after the second cross check), capped at a quarter of its width.
- Pros: MuPDF's glyph boxes are full height, so a band through the middle touches every glyph of the match and none of the neighbouring lines, down to lines about three quarters of an em apart. Measured to catch punctuation and to work on rotated text and on a match split across lines. Uses only the quad, which is what detection already hands over.
- Cons: the margins are tuned against a handful of fonts. A neighbour kerned deep into the match is still removed, which the check then refuses.

**A band from each glyph's origin and size.** Match the target's characters in the page's structured text at run time and build the band from their baselines.
- Pros: independent of how MuPDF sizes a font's quad.
- Cons: a character match per target that can itself go wrong, more code in the walled module, and no measured gain, since the quad's middle already sits inside every glyph box on its line.

**Exact quads, plus a check.** Keep the first design's removal and only detect the damage.
- Pros: no geometry to tune.
- Cons: at 12pt text on 12 or 14pt leading, which covers most letters and reports, the lines above and below lose whole words, so nearly every such run would fail.

### Where the box, the pixels and covered line art go (after slice 2)

**Box on the line box; pixels and covered line art on the whole quad, grown 0.25 of its height across the line and 0.1 along it (chosen, after the second cross check).**
- Pros: the box stays on the match's own line; measured at 80 pixels of neighbouring descender tips at single spacing (4x render) against 1,552 for the exact quad, and none at 14pt leading. The padded area covers a match drawn as outlines whole, descenders and accents included, and covers descender ink under an OCR layer whose quad sits wholly above the baseline. Growing only a little along the line leaves a bullet, icon or cell divider beside the match alone.
- Cons: the line box is a fixed share of a quad whose shape varies by font, so it is close to the em box rather than exact. At single spacing the padding reaches into the neighbouring lines' pixels and can take a neighbour's small vector mark lying wholly inside it.

**Pixels and covered line art on the line box grown 0.25 on every side (the first pick in this round).**
- Pros: reaches less far into the neighbouring lines on born digital text.
- Cons: an OCR text layer's quad can sit wholly above its baseline (measured: 1.000 em above, 0.001 below), so the padding reached only about 0.11 em below the baseline and descender ink under the box would stay in the scan. Growing 0.25 along the line also reached a bullet or cell divider beside the match.

**Everything on the exact quad (the first design).**
- Pros: simplest; covers every outlined glyph.
- Cons: at single spacing the box hides the lower edge and descenders of the line above, which reads as damage and as text under a box.

**Covered line art on the line box.**
- Pros: never touches a neighbour's small marks.
- Cons: MuPDF removes a path only when it is wholly covered, so an outlined glyph with a descender or accent survives whole (measured).

**Pad along the line only.**
- Pros: no whitening of neighbouring scan lines.
- Cons: ink above or below a misaligned OCR line stays legible.

**A fourth pass, so covered line art gets its own area** (the second cross check's suggestion).
- Pros: line art could use the line box grown across the line only, while pixels use the full padded area.
- Cons: one more `applyRedactions` per target page for a gain the small growth along the line already gives.

### How the self check finds what went wrong (after slice 2)

**Compare every page's characters before and after, both extraction modes (chosen).**
- Pros: one rule catches a surviving glyph, surviving replacement text and over removal, and tells them apart by which mode saw the difference. Surviving glyphs keep their origins to about 0.00002 pt, so the comparison is exact in practice. Covering every page also catches damage on pages nobody ticked.
- Cons: two more extractions per page on each side, and a record of every page's characters held for the run.

**No character centre inside a target quad (the first design).**
- Pros: cheap, and blind to legitimate duplicates elsewhere.
- Cons: sees nothing outside the target, so it misses over removal entirely and missed the replacement text MuPDF placed just outside the quad.

**Count each target's string on its page.**
- Pros: catches replacement text, and tolerates duplicates by counting.
- Cons: needs each target's text, and still sees nothing of over removal.

### Replacement text wider than a match (after slice 2)

**Fail closed through the check (chosen).**
- Pros: nothing new in the walled module beyond the check; both the inline and the named forms are caught the same way; a span that wraps exactly the match already works, because MuPDF drops a span when every glyph in it goes.
- Cons: a match inside a wider span cannot be redacted at all in this release, and the session is terminal.

**Also clear named `/Properties` replacement text.** An object edit, proved to work.
- Pros: rescues files that use the named form.
- Cons: cleared only in the output, every untouched named span whose text differs from its glyphs fails the comparison; cleared in the prepare step, detection reads the two forms differently.

**Edit content streams ourselves.**
- Pros: the real fix, for every form.
- Cons: a second PDF parser, against spec 0001's rule and `AGENTS.md`, in the exact place correctness matters.

**Redraw affected pages through MuPDF's PDF writer device.**
- Pros: MuPDF's own code, and the device drops marked content.
- Cons: fonts and images are written out afresh, so the page is no longer the reviewed page byte for byte, and it is a second output path to prove before it could be trusted.

## Rationale

The clean original is kept as bytes because the alternative that saves memory, undo, fails in the worst direction. A missed undo does not crash. It produces a file that removed more than the visitor ticked and reports that it removed less. Holding 25 MB is a known, bounded cost that spec 0001's memory ceiling already has to accommodate, and it gives the field spec 0002 left without a reader its one job. Serializing the review copy was the strongest runner up and remains the move if memory measurement forces it.

The rebuild beats subtraction for the same reason the self check beats trusting the library: this product's failure mode is silent. A subtraction list and a trusted library both fail by doing nothing visible, and a person finds out when somebody else reads their file. An allowlist fails loudly instead. A missing page key shows up as a page that renders wrongly in a fixture, not as metadata that quietly survives. The things the rebuild costs (bookmarks, links, tags, fillable fields) are real, and the summary tells the visitor about the one that matters most to somebody else, the accessibility tags.

Flattening before dropping follows from what people redact. Filled forms, HR letters and statements are the audience's core documents, and deleting every filled answer to remove one email address would make the tool unusable on them. Flattening turns those answers into page content, which is exactly what detection already sees and redaction already removes.

Layered files are refused rather than revealed because MuPDF offers no honest middle. It can hide or show a layer, not delete what is in it. Revealing puts content nobody reviewed in front of whoever receives the file, and refusing costs a visitor from a CAD or design export, who is not who this product is for. The refusal covers every layered file, not only those with a layer switched off, because the per layer check cannot see the rules that hide content with every layer on.

Owner password restrictions are removed because refusing them would refuse bank statements, one of the most common documents this audience needs to redact, to protect a restriction that stops nothing: the visitor already has the content on screen.

The proof lives in Node because the fixture matrix is where the confidence comes from, and a matrix that takes minutes per run stops growing. The browser leg stays for what only a browser can show: the engine inside the worker, under the tool route's policy, with nothing written down and nothing sent.

Slice 2's redesign separates two things the first design treated as one: where text is removed and where the removal is shown. MuPDF decides removal by touch, with glyph boxes taller than a line, so the area that removes text has to be much smaller than the area that marks it. A band through the middle of the match is the smallest area that still touches every glyph of it, which is why it removes exactly the match at single spacing. The box gets the match's own line, the pixels and covered line art get the whole quad and a margin, because a scan's ink does not follow the OCR layer's idea of where the baseline is, and the box goes last so nothing can erase it.

The second cross check made the check trust less. The first version of the comparison trusted three things it had no business trusting: that the quads surround the match, that a page recorded mid run still shows its source, and that the pixel pass did its job. Each was a way a real leak could pass a check designed to catch leaks. Validating each target against its own text, recording every page before any page changes, and looking at the output's pixels close all three, at the cost of a field feature 6 must set and some extra decoding.

The check was rebuilt for the same reason the rebuild beats subtraction. The first check looked where the target was and asked whether anything was left. Both findings lived just outside that area: replacement text MuPDF placed beside the quad, and neighbours removed above and below it. Comparing whole pages asks the question the visitor actually cares about, "is this the page I reviewed, minus what I ticked?", and has no outside to miss. It costs extractions and memory, both bounded by the page cap, and that is cheap next to a file that silently says something different.

A match inside wider replacement text is refused because every fix available today is worse than a refusal. The honest repair is to edit the content stream, and doing that ourselves would put a second, weaker PDF parser in the one place this product cannot afford a disagreement about what a page says. The refusal is loud and counted, so if it turns out to be common the counts will say so, and the redraw path or an upstream MuPDF change can be weighed with real numbers.

## What the cross check changed

An independent read only review on a different model (Fable 5.1) found 19 gaps. You accepted every recommended fix. Eight were ways a file could leave looking redacted when it was not, and they reshaped the design:

- **Shared resources.** An unredacted form XObject could survive in a resource dictionary shared with a page that never draws it, carried by the graft and kept by garbage collection because it was still referenced. Fixed by `sanitize` on write, proved by its own fixture.
- **Layers.** The per layer check had two holes (see *Options considered*). Fixed by refusing any file with `/OCProperties`.
- **Flattening could differ from the review.** Hidden annotations could be painted in, Redact marks already in the source would be applied without being counted, and a regenerated field could land outside the reviewed quads. Fixed by one shared prepare step, run on the review copy at open and on every working copy. This went further than the cross check's own suggestion, which deleted annotations only in the working copy: preparing both copies alike is what makes detection and redaction read the same page (INV-9).
- **Scan ink outside the OCR quads.** Fixed by a padded second pass that blanks image pixels only. The cross check's version padded the box too. The spec keeps the box exact (INV-10), because a padded box would sit over neighbouring text that is not removed, which is the pattern redaction checkers flag as a fake redaction.
- **Replacement text.** The self check could miss glyphs behind an ActualText span. Fixed by extracting twice, once with `ignore-actualtext`, and by defining the test as point in convex quad. Slice 2 showed this was not enough: the replacement string itself survives when a span wraps more than the match (see *What slice 2 turned up*).
- **Text only self check.** Fixed by the structural half of AC-13.
- **Slice 1 on its own.** It would have handed back a `-redacted.pdf` with nothing removed and no sign of it, and ignored targets if feature 6 landed first. Fixed by refusing non empty targets until removal and the target check land together, and by the one line outcome before Download.
- **Replacement during a run.** The run's working copy and the old bytes stayed alive while the next file parsed, breaking spec 0002's AC-1 and AC-5a. Fixed by `endSession` cancelling the run and `handleOpen` waiting for it (AC-23).

The other eleven settled what the builder would otherwise have invented: the inventory table, `/Group`, a recursive sweep, the tool page's exits, the `openDocument` seam, cancel yield points, the destroy order, the request filter, MuPDF's log, AES fixtures, and the honest limits for feature 16.

## What the code and MuPDF.js turned up

- **No deep copy.** `new PDFDocument(doc)` in `mupdf.js` calls `_wasm_keep_document` on the same pointer. It is a second reference to one document, not a copy, so it cannot serve as a clean original.
- **Redaction defaults.** `PDFPage.applyRedactions` defaults to black boxes on, `REDACT_IMAGE_PIXELS`, `REDACT_LINE_ART_REMOVE_IF_COVERED` and `REDACT_TEXT_REMOVE`, which is the chosen setting. They are written out anyway (INV-5).
- **Layers.** MuPDF.js exposes `countLayers`, `isLayerVisible` and `setLayerVisible`, and nothing that removes a layer's content. The 1.28.1 binary carries the `AnyOff` and `AllOff` membership rules, so MuPDF evaluates them when it renders and extracts, and `isLayerVisible` does not report them.
- **Logging.** Until `setLog` is called, MuPDF prints its warnings and errors to the console. `setLog(fn)` routes them to `fn`. `setLog(null)` switches the callback off (`_wasm_enable_log_callback(false)` in `mupdf.js`), and in 1.28.1 MuPDF then prints nothing. An earlier draft of this spec said `null` returned MuPDF to printing; that was wrong. The engine keeps the do nothing function regardless, so silence holds by construction rather than by what MuPDF chooses to do without a callback.
- **Annotation flags and extraction options.** `PDFAnnotation` exposes `getFlags()` with `IS_HIDDEN`, `IS_NO_VIEW` and `IS_INVISIBLE`. The binary carries the `ignore-actualtext` structured text option and the `sanitize` write option.
- **Available cleanup calls.** `bake(bakeAnnots, bakeWidgets)`, `countVersions`, `getEmbeddedFiles`, `deleteEmbeddedFile`, `newGraftMap` with `graftPage`, and `subsetFonts` (not used, by decision) all exist in 1.28.1. `applyRedactions` takes its four settings independently, so a pass that blanks pixels without removing text or drawing a box (`REDACT_TEXT_NONE`) is a supported call, not a workaround.
- **Not verifiable here, and so not relied on:** which page keys MuPDF's `graftPage` copies (hence `/Group` is grafted explicitly and the allowlist deletes the rest), whether the writer adds a new file identifier (hence AC-7 asserts only that the source's is gone), and exactly how `sanitize` prunes resources (hence its own fixture).
- **Content sniffing.** `Document.openDocument(bytes, "application/pdf")` still lets MuPDF choose the handler from the content, which is why a PNG opens today. The `PDFDocument` constructor only checks the type of what comes back. Hence the byte check in front and `asPDF()` behind.
- **`EngineSession.bytes`** is written at open in `src/worker/engine.worker.ts` and read nowhere else, confirming what spec 0002's Follow-up recorded.
- **The worker's `redact` handler** currently answers every request with `unsupported`, deliberately, and `tests/unit/engine-worker.test.ts` asserts it. Slice 1 replaces both.
- **Tests sit outside the lint zones** (`eslint.config.mjs`), so a Vitest file may import `mupdf` directly and hand it to the engine's internals without breaching the engine wall, which binds `src/` only.

## What the second cross check changed

After the slice 2 redesign, a second independent read only review on a different model (Fable 5.1) found 19 more gaps, and you accepted every recommended fix. Five changed the design:

- **Recording before redacting.** The record was taken page by page just before each page's passes, so a pass that changed a form XObject shared with a later page would have changed that page's record too, and the lost words would have passed. Every page is now recorded before any page is redacted.
- **Trusting the quads.** Anything centred in a target quad was exempt, so a quad in the wrong place would remove the wrong glyphs while the real match, recorded as unticked, survived and matched. Every target now carries its `text` and is validated before anything is removed.
- **Trusting the pixel pass.** The check was text only, so scan ink the pixel pass skipped would pass while hidden under the box. The output's images under each target are now checked.
- **Exempting too much.** A large watermark glyph centred inside a quad would have vanished unseen. Only glyphs on the target's own line now count as ticked.
- **Geometry fitted to Helvetica.** The pixel area was anchored on the line box, which leaves OCR descenders legible, and the 0.05 inset lost ordinary kerning in a 1.0 em font. Both were measured and changed.

The other fourteen settled what the builder would otherwise have invented: the matching grid and multiset, one annotation per target per pass with a leftover check, the exact quad reading, the extraction options, the kind across pages and on a throw, the empty run case, fixture fonts that can ship under the AGPL, the test measurements, where the byte search proves something, the thin path's lines for the two new kinds, and three follow ups (feature 6 detecting in both modes, feature 11 counting kinds, and measuring the pixel pass). Writing them in turned up one more gap, closed the same way: a character the band cannot reach, centred inside a box but not on the target's line, would have survived hidden under it, so any character centred inside a box now fails the run.

## What slice 2 turned up

`/develop` found both problems while building slice 2. `/architect` then reproduced them and measured every option above with a throwaway script in Node against the same MuPDF 1.28.1, over hand written one page PDFs. Nothing from that script is in the repository; the fixtures in the build plan are what prove these results for good.

**Quad shape by font** (a character's quad from structured text, against its baseline):

| Font | Above the baseline | Below | Height | Baseline at |
|---|---|---|---|---|
| Helvetica (base 14) | 1.075 em | 0.299 em | 1.374 em | 0.782 |
| Times-Roman (base 14) | 1.053 em | 0.281 em | 1.334 em | 0.789 |
| Courier (base 14) | 0.932 em | 0.317 em | 1.249 em | 0.746 |
| Arial | 0.905 em | 0.211 em | 1.116 em | 0.811 |
| Times New Roman | 0.891 em | 0.216 em | 1.107 em | 0.805 |
| Calibri | 0.750 em | 0.250 em | 1.000 em | 0.750 |
| Segoe UI | 1.079 em | 0.250 em | 1.329 em | 0.812 |
| Consolas | 0.742 em | 0.257 em | 0.999 em | 0.743 |
| Georgia | 0.916 em | 0.219 em | 1.135 em | 0.807 |

**Removal on the exact quad** (12pt Helvetica, target on the middle of three lines): at 12, 13 and 14pt leading, the line above lost "bravo charlie" and the line below lost everything after "foxtro". At 16 and 18pt leading nothing else was lost.

**Removal on a band**: a band as thin as 2% of the quad's height, centred anywhere from 0.4 to 0.62 of it, removed every glyph of `j.doe_1@x.co` and `555-12.34`, punctuation included, and nothing on either neighbouring line at 12pt leading.

**Kerning**: with the band not pulled in, a neighbour kerned 80 thousandths of an em into the target was removed. With the inset, measured on both sides of the match:

| Font (quad height) | Kern | Inset 0.05 | Inset 0.1 |
|---|---|---|---|
| Helvetica (1.37 em) | 80 | kept | kept |
| Helvetica (1.37 em) | 120 | kept | kept |
| Helvetica (1.37 em) | 150 | left neighbour lost | kept |
| Calibri (1.0 em) | 80 | kept | kept |
| Calibri (1.0 em) | 120 | left neighbour lost | kept |
| Calibri (1.0 em) | 150 | both lost | kept |

At 300 both neighbours are lost at either inset, which the comparison reports. At an inset of 0.1, capped at a quarter of the quad's width, `i.e.`, `l1l`, `'ij'`, `(5)`, `fill.`, a lone `i` and a lone `.` were all removed cleanly in both fonts. MuPDF evidently does not remove a neighbour whose advance box only just overlaps the band's end, which is why the inset holds a little more kerning than its width alone suggests; the fixtures, not this explanation, are the proof.

**An OCR style text layer**: a non embedded font whose descriptor claims an ascent of 1000 and a descent of 1, drawn invisible, gives a quad 1.000 em above the baseline and 0.001 em below it.

**Positions after removal**: every surviving glyph kept its origin to within 0.0000153 pt through removal and a `sanitize` write.

**The box at single spacing** (pixels of the neighbouring lines' ink under the box, 4x render): exact quad 1,552 at 12pt leading and 502 at 14pt; line box (0.20 to 0.93) 80 at 12pt, all descender tips, and 0 at 14pt.

**Pixel blanking** turns pixels white, not black, so the padded margin on a scan reads as missing ink, never as a box.

**Covered line art**: a filled path standing in for an outlined "g", reaching 0.21 em below the baseline under an invisible text layer, survived removal on the line box and was removed on the padded area.

**Replacement text** after removal and a `sanitize` write:

| Span | Replacement string in the output | Ordinary extraction |
|---|---|---|
| Wraps exactly the match | Gone; MuPDF dropped the whole span | Match absent |
| Wraps more than the match, inline | Kept whole | Match present, placed outside the target quad |
| Wraps more, inline, UTF-16 | Kept whole | Match present |
| Wraps more, named in `/Properties` | Kept whole; deleting the key by object edit clears it | Match present |

**The comparison**, before against after with whitespace left out, matched at 0.01 pt:

| Case | Result |
|---|---|
| Single spacing, exact quads | 25 characters missing in both modes: over removal |
| Single spacing, band | Clean |
| Match split across two lines, band | Clean |
| Replacement text wider than the match | 8 extra in ordinary extraction only: replacement text |
| Replacement text equal to the match | Clean |
| Untouched ligature span beside a target | Clean |
| Kerned 80 thousandths into the target | Clean |
| Kerned 300 thousandths into the target | 2 missing in both modes: over removal |
| Rotated text, band | Clean |
