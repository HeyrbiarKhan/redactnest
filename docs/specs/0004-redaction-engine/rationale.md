# 0004. Redaction engine: rationale

The decision record for [index.md](index.md). The reasoning, the options weighed and the evidence behind them. A build does not need this file.

## Context

> ⚠️ Premise note: feature 5 lands before feature 6, the only thing that mints targets. Built in scope order, the engine can remove text in a test long before a visitor can tick anything, and a browser run in the meantime can only clean a file, not redact it. That is fine as long as nobody mistakes the one for the other. So removal is proved at the engine's own boundary, with a test helper standing in for detection, and the browser proves the parts it genuinely exercises: the write, the download and the privacy leg. The one browser step that needs a tick (spec 0002's AC-14) waits for feature 6 and says so, rather than being faked with a test detector in the product bundle.

This is the feature the product exists for. Spec 0001 chose MuPDF because it really removes text from a PDF's content stream rather than drawing over it, and spec 0002 fixed where a document lives while it is open: in the worker, as the original bytes plus an open MuPDF document, with the geometry of every match kept in a private map. What neither decided is what happens when somebody presses the button, and every part of that is a place where a file can come out looking redacted when it is not.

The forces are specific. Redaction in MuPDF rewrites the document it runs on, and MuPDF.js has no deep copy, so a second run with different ticks has nowhere clean to start from unless something is kept for it. A PDF carries far more than its visible pages: document info, XMP metadata on the file and on individual images, comments, filled form fields, attachments, bookmarks, layers a viewer hides, JavaScript, page thumbnails that are pictures of the unredacted page, earlier revisions left behind by incremental saves, and replacement text for accessibility that can repeat the very words removed. The scope's contract names most of these, and a reader of the output does not care which ones the contract happened to list. Redaction is geometric, so text split across lines, rotated pages, offset crop boxes, form XObjects and OCR text over a scanned image are exactly where a quad and a glyph can disagree.

Two defects are already in the tree. MuPDF sniffs content rather than trusting the type it is given, so today a PNG sent as `application/pdf` opens as a one page document, and a cleaning run would turn it into a `-redacted.pdf` of a photo. And spec 0002 left `EngineSession.bytes` written at open and never read, holding up to 25 MB that nothing used, while its INV-1 claimed the document existed "in exactly one place" when it already existed twice inside the worker and was about to cross to the main thread as output.

The consequence of getting this wrong is not a bug report. It is a person sending a file they believe is clean, and the product's claim being false in the one place it matters.

Building slice 2 turned up two more forces, both about geometry. A quad from `page.search()` runs from the font's ascent to its descent as MuPDF measures them, between 1.0 and 1.37 em tall depending on the font, so at single spacing it reaches into the lines above and below. MuPDF removes any glyph whose full height box touches a Redact area, which makes that overlap a removal, not just a picture: whole words on the neighbouring lines vanish, and nothing in the first design noticed. Separately, replacement text (`/ActualText`, a string a PDF can attach to a run of glyphs so that copying yields that string instead) survives whole when only some of its glyphs are removed. Ordinary extraction then still returns the ticked match, and MuPDF places those characters just outside the target's quad, where the first design's check was not looking. The opposite failure matters as much as the leak: a redacted contract missing an unticked word can mean something different.

Building slice 2 turned up a third force, about slant. MuPDF 1.28.1 does not act on a Redact annotation's quads as drawn. It blanks pixels and judges covered line art over each quad's axis aligned bounding box (the upright rectangle around it), and it removes text whose box meets those bounds. On level text the bounds are the quad, so nothing changes. On text set at an angle they are much larger: at 30 degrees a thin band's bounds take in the lines above and below. Text on a scan fed in crooked is set at a small angle too, because Tesseract writes the scan's skew into its text layer, and synthetic italic (a slant made by the text matrix) gives a slanted quad on a level line. The self check sees what happens to text, and the pixels under the target. It does not see pixels blanked or line art removed beyond the target, which is where the bounds reach.

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
- Pros: MuPDF's glyph boxes are full height, so a band through the middle touches every glyph of the match and none of the neighbouring lines, down to lines about three quarters of an em apart. Measured to catch punctuation and to work on a page rotated 90 degrees and on a match split across lines (text set at other angles is a separate question, settled after slice 2's build). Uses only the quad, which is what detection already hands over.
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

### How a slanted target goes to MuPDF (after slice 2's build)

**Refuse a target whose padded area's bounds reach more than 0.1 of its height past it (chosen).** One area per quad per pass, as on level text, and a measure of how far the bounds reach past the padded area.
- Pros: one measure covers rotation, shear and scan skew alike, and it measures exactly what MuPDF does with line art; covered line art keeps working as it does on level text; the reach no check sees is capped at a tenth of the quad's height, the same size as the growth the padded area already has along the line; a name on a scan about a degree crooked still redacts.
- Cons: text set at an angle cannot be redacted at all in release 1; the allowance shrinks as the match grows, so a whole line tolerates only a third of a degree; up to 0.1 of the height of reach at the corners is still unchecked, and under rotation it points across the line, on top of the 0.25 padding, not along it as the padding's own 0.1 does.

**The same rule at 0.25 of the height.**
- Pros: about two and a half times the tilt, so most matches on an ordinary crooked scan redact.
- Cons: the unchecked reach at a match's ends grows two and a half times, and at single spacing the text pass nears the point where the check refuses for over removal (measured from a band reach of 0.296).

**Refuse any tilt at all.**
- Pros: the simplest statement, with no unchecked reach.
- Cons: Tesseract writes the skew into its text layer, so nearly every match on a crooked scan is refused.

**Short pieces along the line.** Cut the band, the padded area and the line box into pieces a fraction of the quad's height long.
- Pros: text comes out exactly at 30 degrees with pieces about 0.3 of the height long (measured), and pixels are blanked over the pieces together, so their reach shrinks with the piece.
- Cons: MuPDF judges covered line art one area at a time (measured), so an outlined glyph, an underline or a word drawn as one path that straddles a join survives in the file, under the box, where no check looks. That is a leak the product exists to prevent. The end pieces' bounds also reach about 0.65 of the height past the padded area along the line at 30 degrees, whatever their length.

**Pieces for text and pixels, the whole area for line art.**
- Pros: keeps covered line art whole while text and pixels get the pieces' small reach.
- Cons: line art is still judged over the whole area's bounds, which at 30 degrees reach the neighbouring lines unseen; the padded pass becomes two passes that must stay in step.

**Overlapping pieces, each longer than any glyph.**
- Pros: every outlined glyph lies wholly inside some piece.
- Cons: a longer mark (an underline, a word drawn as one path) still straddles; "longer than any glyph" is a guess about fonts; more geometry to prove, for documents release 1's audience rarely has.

**A split measure: across the line at most 0.1, along it more generous.**
- Pros: admits ordinary synthetic italic, whose reach points purely along the line (0.305 at a 12 degree shear).
- Cons: the padded pass would then reach a bullet, icon or cell divider beside the match, the one thing the small growth along the line exists to keep; two limits to state and test instead of one.

**Compare pixels and paths outside the padded areas before and after.**
- Pros: the design's own "compare, never sample" rule applied to the passes' reach, so skew, shear and images would be answered for rather than refused.
- Cons: every source image under a target decoded and held for the run, on top of the character record, and a line art comparison MuPDF.js offers only through its vector extraction, with no stable identity to match paths by.

**Hand the slanted area over as it is (what slice 2 built).**
- Pros: nothing to add.
- Cons: text at 30 degrees is refused through the check for a reason the visitor cannot learn, and on skewed or sheared text the padded pass acts past its area with nothing checking it (0.305 of the height on synthetic italic, and the run passed).

### Images blanked in their own pixel grid (after the third cross check)

**Measure the region MuPDF will blank in each image, and refuse past the same limit (chosen).** Before any pass, the padded area's page bounds are mapped into each image's pixel grid, rounded out to whole pixels, mapped back, and measured against the padded area; past 0.1 of the quad's height the run ends in `redaction-overreach`.
- Pros: INV-15 then holds for pixels as well as line art; it reuses the image walk the pixel check already does and reads only each image's size, never its pixels; the estimate is never smaller than what MuPDF blanks (measured).
- Cons: an image drawn at an angle, or a coarse one, under a ticked item refuses the run, including a flat colour band drawn as a tiny stretched image, where blanking would only have lost colour; on a crooked scan the pixels add to the slant's reach, so the slant allowance shrinks a little.

**Narrow INV-15 and record the reach as a limit.**
- Pros: no new code.
- Cons: the reach has no bound (51.5 pt past the area over an image drawn at 30 degrees, 20.5 pt over an 8 by 8 image stretched to 200 pt) and nothing checks it, so words inside such an image could be blanked that nobody ticked.

**Compare the image pixels outside the padded areas before and after.**
- Pros: answers for the reach instead of refusing it.
- Cons: decodes and holds every source image under a target for the run, which the memory item already worries about.

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

Slanted text is refused because the one fix that works for text, cutting each area into short pieces, breaks the part of the padded pass no check can see. MuPDF judges covered line art one area at a time, so pieces would leave an outlined glyph that straddles a join in the file, under the box, and nothing in the self check reads line art. Handing the slanted area over whole is no better: the text pass is caught by the comparison, but the padded pass blanks pixels and removes line art over the bounds, which on a slanted line grow with the tilt and with the match's length, and nothing checks there either. So the rule measures that reach directly and refuses anything past a small allowance. The allowance is 0.1 of the quad's height, the same size as the smallest growth the design already accepts, but it is not the same kind of reach: under rotation it points across the line, into the neighbouring lines' corners at the match's two ends, on top of the 0.25 padding. That is accepted as a small, bounded extension of what single spacing already costs, in exchange for redacting a name on a scan a feeder turned by about a degree, and the counts behind `slanted-text` will say whether real scans need more. Synthetic italic falls under the same rule: its reach points along the line, toward whatever sits beside the match, which is the direction the small growth along the line was chosen to protect.

The third cross check showed that pixels answer to a different grid. MuPDF blanks whole pixels of each image, over the area's bounds taken in that image's own grid, so an image drawn at an angle or at a coarse resolution is blanked past the padded area even under level text, by as much as a whole pixel or the image's own tilt allows. Narrowing the invariant would have left that reach unbounded and silent, so the same limit applies to it, measured before any pass from each image's placement and size alone.

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
| Page rotated 90 degrees, band | Clean |

## What slice 2's build turned up

`/develop` found the slant problem while building slice 2, and measured the combining marks and the forms drawn more than once. `/architect` then measured the slant options with throwaway scripts in Node against the same MuPDF 1.28.1, over hand written one page PDFs and through the real engine. Nothing from those scripts is in the repository; the fixtures in slice 4 and the bounds pin are what prove these results for good.

**The text pass at an angle** (`Jeremy Quigley`, 12pt Helvetica, the middle of three lines, its band cut into pieces along the line):

| Tilt | Leading | Whole band | 4 pieces (about 20pt each) | 16 pieces (about 5pt, 0.3 of the height) |
|---|---|---|---|---|
| 30 degrees | 12pt and 14pt | the lines above and below lose characters | the lines above and below lose characters | only the match |
| 5 degrees | 12pt and 14pt | the lines above and below lose characters | only the match | only the match |
| 3 degrees and below | 12pt and 14pt | only the match | only the match | only the match |

With 16 pieces at 30 degrees, the words beside the match on its own line survived too.

**Pixels, line art and the box at 30 degrees** (one Redact area, 120 by 20pt, at 30 degrees):

| What | Inside the area | Outside the area, inside its bounds | Outside the bounds |
|---|---|---|---|
| Pixels of a black image under it (`REDACT_IMAGE_PIXELS`) | 2,402 of 2,402 blanked | 6,490 of 6,490 blanked | none blanked |
| A 2pt filled square (`REDACT_LINE_ART_REMOVE_IF_COVERED`) | removed | removed, at both corners of the bounds | kept |
| The box (`applyRedactions(true, …)`) | drawn as a four point path on the area itself, not its bounds | | |

**Covered is judged one area at a time** (a level bar 60pt long across the join of two 50pt areas, padded pass settings):

| Areas | The bar |
|---|---|
| One annotation holding both areas | kept |
| Two annotations, one area each | kept |
| One 100pt area covering the bar | removed |

**The skew sweep**, through the real engine with its three passes and its self check (12pt Helvetica, the middle of three lines ticked; reach is the padded area's bounds reach as a share of the quad's height):

| Match (width over height) | Tilt | Padded area reach | 12pt leading | 14pt leading |
|---|---|---|---|---|
| `Quigley` (2.5) | 1 degree | 0.047 | redacted | redacted |
| `Quigley` (2.5) | 2 degrees | 0.093 | redacted | redacted |
| `Quigley` (2.5) | 5 degrees | 0.232 | redacted | redacted |
| `Jeremy Quigley` (5.1) | 1 degree | 0.092 | redacted | redacted |
| `Jeremy Quigley` (5.1) | 1.5 degrees | 0.138 | redacted | redacted |
| `Jeremy Quigley` (5.1) | 3 degrees | 0.275 | redacted | redacted |
| `Jeremy Quigley` (5.1) | 5 degrees | 0.456 | `redaction-overreach` | `redaction-overreach` |
| A whole line, 49 characters (17.2) | 0.25 degrees | 0.076 | redacted | redacted |
| A whole line (17.2) | 0.5 degrees | 0.152 | redacted | redacted |
| A whole line (17.2) | 1 degree | 0.303 | `redaction-overreach` | redacted |
| A whole line (17.2) | 1.5 degrees | 0.455 | `redaction-overreach` | `redaction-overreach` |

"Redacted" means the character comparison passed; it does not see the extra pixels and line art the padded pass reached, which is what the limit is for. The reach is the padded area's longer side times `|sin 2θ| / 2`, so it grows in step with the match's length. The text pass first over removed at a band reach of 0.296 (12pt leading), and never at 0.254 or below.

**Other slants**, `Jeremy Quigley` through the real engine:

| Case | Padded area reach | Result today |
|---|---|---|
| Set level with a 12 degree shear (synthetic italic, text matrix `1 0 0.2126 1`) | 0.305 | redacted, with the padded pass reaching past its area unseen |
| Drawn at 90 degrees | 0 | redacted |
| Drawn at 180 degrees | 0 | redacted |

MuPDF's quad for sheared text is a parallelogram that leans with the glyphs. A real italic font is drawn with an upright text matrix, so its quad stands upright.

**The measured results for AC-5**, pinned in `tests/unit/redaction-matrix.test.ts`:

- A combining mark inside the match (`Renée`, the accent drawn as its own glyph) lies under the band and is removed with the match.
- A combining mark drawn at zero width on the match's last letter (`José`) sits at the match's very end, past the band's pulled in end, and survives the text pass. The character comparison sees the survivor and the run refuses with `redaction-incomplete`. Recorded as an honest limit, not fixed: catching it would mean not pulling in the band's end, which is what keeps a kerned neighbour, or building the band from glyphs, which the slice 2 redesign weighed and set aside.
- A form XObject drawn twice on one page, with its first drawing ticked: MuPDF redacts that drawing alone and the second keeps its text at the same quads. Drawn on pages 1 and 3 and ticked on page 1, page 3 keeps its copy. MuPDF redacts per drawing, so the `redaction-overreach` path the two page test also allowed never happens in 1.28.1.

## What the third cross check turned up

A third independent read only review on a different model (Fable 5.1) found ten gaps and five soundness points in the slant update, and you accepted every recommended fix. It measured with its own throwaway scripts; `/architect` reran the image measurements before writing them in.

**Pixels are blanked in the image's own grid, whole pixels at a time** (a level Redact area 120 by 20 pt, padded pass settings):

| Image under the area | Pixels blanked past the area | Furthest past it | `blankedRegion`'s estimate |
|---|---|---|---|
| 200 by 200 pixels, upright, 200 pt | 0 | 0 pt | 0 pt |
| 200 by 200 pixels, drawn at 1 degree | 528 | 2.5 pt | 3.2 pt |
| 200 by 200 pixels, drawn at 30 degrees | 6,488 | 51.5 pt | 52.3 pt |
| 8 by 8 pixels, upright, stretched to 200 pt | 5,100 | 20.5 pt | 21.2 pt |

The estimate maps the area's page bounds into the image's pixel grid, rounds out to whole pixels (with a tolerance of 0.001 of a pixel, without which an exactly aligned edge rounds a pixel too far), clips to the image, and maps back. It is never smaller than what MuPDF blanked. Line art inside a form drawn at 30 degrees was removed only inside the level area, so the grid effect is the image's alone.

**Fonts differ in how much tilt they allow.** At 1 degree, `Jeremy Quigley` reaches 0.092 in Helvetica and in Carlito, and 0.121 in Courier, whose quad is shorter for a wider match. Courier refuses it from about 0.83 degrees.

**Level text can make a quad that is not a rectangle.** MuPDF joins characters into one search quad when their corners differ by less than about a tenth of the font size. On a level line in Helvetica: 12pt then 11pt reaches 0.093; a run raised 0.5 pt reaches 0.032 and 1 pt reaches 0.063; from 1.2 pt MuPDF gives two quads, each reaching 0. Mixed fonts in one email address (Times then Helvetica at 11 pt) reached 0.068.

**A sound quad can have an unsound padded area.** A trapezoid 4 pt wide at the top and 24 pt at the bottom passes AC-27's original checks, but its padded area, extrapolated beyond the quad, crosses itself, where a point to convex quad distance means nothing. AC-27 now checks the padded area too.

**The rest** settled what the builder would otherwise have invented: that the slant measure fails closed on `NaN`; the fixture font and page for each new case; a precedence test across pages; the exports and where `slanted-text` goes in the kind list; the bounds pin's file, fixture and geometry; the sheared quad's closed form (`0.75 × sin 2s` of the height); page 3's quads and the absent U+0301 in the measured cases; the stale notes in `verify.md`; and wording that overclaimed.
