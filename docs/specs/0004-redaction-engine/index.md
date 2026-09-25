# 0004. Redaction engine

**Date**: 2026-09-25
**Updated**: 2026-09-25, after an independent cross check: layered files refused outright, one shared prepare step before detection and redaction, a padded image pass, a structural self check, replacement during a run, and slice 1 made safe on its own. Updated again 2026-09-25, after slice 2's two findings: text removed on a thin band through each target so single spaced neighbours survive, the box drawn on the target's own line, pixels and covered line art padded from that line, a self check that compares every page before and after, a match inside wider replacement text refused, and the `setLog(null)` rationale corrected. A second independent cross check then added: pixels and covered line art padded from the full quad rather than the line box, a wider end inset, every page recorded before any page is redacted, targets validated against their own text, a pixel check, and only glyphs on a target's own line counted as ticked
**Status**: In Progress

## Summary

Every redaction works on a fresh copy of the visitor's original file, so ticking a different box and running again always starts clean. The engine removes the ticked text from the page itself, along a thin band through the middle of each match so the lines above and below are never touched, and draws a black box sized to the match's own line. It then builds a brand new file from the redacted pages alone, so nothing it did not choose to carry (metadata, bookmarks, attachments, scripts, old revisions) comes across. Before any file leaves, the engine compares every page of its output with the source: everything ticked must be gone, everything unticked must still be where it was, no scanned ink may remain under a box, and nothing it strips may come back. If any of that fails, the visitor gets no file and a plain reason, never a document that looks redacted and is not, or one that quietly lost words nobody ticked.

## Requirements

**User stories**:

- As someone redacting a document, I want the ticked text genuinely gone from the file, so pasting, searching or opening it in another tool cannot bring it back.
- As someone sending a redacted file, I want the hidden parts of the file stripped too (who wrote it, earlier versions, comments, attachments), so the file says nothing I did not see on the page.
- As someone redacting a single spaced letter, I want only what I ticked removed, so the lines above and below still read exactly as they did.
- As someone who ticked the wrong box, I want to change it and run again and get exactly what I ticked the second time, not a mix of both runs.
- As someone who dropped the wrong file, I want a photo or a Word document refused plainly, rather than turned into a PDF that pretends to be redacted.
- As the person operating RedactNest, I want the engine to refuse to hand back a file it cannot prove is clean, so the one failure the product cannot survive becomes an error message instead.

**Acceptance criteria** (the contract):

- **AC-1**: A file is refused with `not-pdf` unless the whole `%PDF-` marker lies within its first 1024 bytes (it starts at offset 1019 or earlier). The check reads the bytes and never the file name or declared type, and it runs before the engine is fetched and before MuPDF sees anything. A PNG named `scan.pdf` and sent as `application/pdf` is refused, and so are a text file and a Word document.
- **AC-2**: A file that passes the header check but does not open as a PDF document (MuPDF hands back some other kind of document) fails with `corrupt`.
- **AC-3**: A document whose catalog declares optional content (`/OCProperties`, layers a viewer can switch on and off) is refused at open with `hidden-layers`, before a review exists, whatever state each layer is in.
- **AC-4**: Every ticked target is removed from the content stream (the drawing instructions of the page), along its removal band: each of its quads (the four cornered areas that outline the match) shrunk along its own axes to `REMOVAL_BAND_RATIO` (0.1) of its height about its middle, with each end pulled in by `REMOVAL_INSET_RATIO` (0.1) of its height, never more than a quarter of the quad's width. Text extracted from the output finds no character on the target's line whose centre lies inside any of the target's quads on its page. Where the text is in a simple encoding (one byte per character), and for every replacement text string, the target's text appears nowhere in the fully decompressed output, in either PDF string encoding; text in a CID font (glyph numbers, not characters) relies on extraction alone. Every other character survives where it was: beside the target on its own line, and on the lines above and below it, including text set at single spacing (12pt text on 12pt leading).
- **AC-5**: Removal holds at the geometric edges: a target split across two lines, a page rotated 90 degrees, text drawn at 30 degrees, a page whose crop box does not start at the origin, text inside a form XObject (a reusable block of page content), text inside a form XObject listed in a resource dictionary shared with pages that never draw it, a filled form field's value, a visible typed annotation, invisible OCR text (machine read text laid over a scan) lying over an image, a neighbour drawn into the target by ordinary kerning (80 to 150 thousandths of an em, on either side, in a font whose quad is 1.0 em tall and in one whose quad is 1.37 em), and a replacement text span (`/ActualText`) that wraps exactly the match. For OCR text, the image pixels around the target are blanked across its padded area: each quad grown by `TARGET_PADDING_RATIO` (0.25) of its height across the line and by `TARGET_PADDING_ALONG_RATIO` (0.1) of its height along it, so ink the OCR quad misses is blanked too, including descenders under a text layer whose quad sits wholly above the baseline.
- **AC-6**: A solid black box marks every removed target, drawn on the target's line box: each quad clipped along its own axes to between `LINE_BOX_TOP` (0.20) and `LINE_BOX_BOTTOM` (0.93) of its height. It covers the match's own line and not the lines around it: on 12pt text at 14pt leading, no ink of a neighbouring line lies under it.
- **AC-7**: The output carries none of: document info, XMP metadata on any object, annotations (links included), form fields, attachments (embedded and associated files), bookmarks, optional content structure, JavaScript or automatic actions, earlier revisions, page thumbnails, private application data, the structure tree, page labels, or the source's file identifier. Its catalog (the file's root object) holds only `/Type`, `/Pages` and, when the source had one, `/Lang`. Each page holds only the keys on the page allowlist.
- **AC-8**: What was visible stays visible. An unticked filled form value and an unticked visible annotation are page content in the output, so they display and extract as ordinary text.
- **AC-9**: The output opens as a single revision PDF with the source's page count and, page for page, the same page boxes, rotation and transparency group.
- **AC-10**: A document that opens without a password but carries an owner password (editing forbidden) is redacted, and the output is unencrypted with no permission restrictions. This holds for RC4, AES-128 and AES-256 encryption.
- **AC-11**: Every run starts from `EngineSession.bytes`. Two runs on one session with different tick sets each produce output reflecting only their own ticks: text the first run removed and the second run did not tick is present in the second output. No run changes `bytes`, and no run changes the review document. This is the engine leg of spec 0002 AC-14.
- **AC-12**: A run with nothing ticked still produces a cleaned output, with `removedByType` empty and `sanitized` listing what was stripped.
- **AC-13**: Before any output crosses the boundary, the engine reopens it and checks it three ways, failing the whole run and handing back no file if any finds anything (AC-25 names the kind). **Characters**: on every page, the characters extracted from the output are exactly the prepared source's characters that were not ticked: the same character at the same origin, within `POSITION_TOLERANCE` (0.01 pt), with none missing and none extra. A source character is ticked when its centre lies inside a target quad on its page and it sits on that target's line: its direction within `LINE_ANGLE_TOLERANCE` (2 degrees) of the quad's, and its quad's height between `LINE_HEIGHT_MIN` (0.67) and `LINE_HEIGHT_MAX` (1.5) times the target quad's. Whitespace (code points matching `/\s/u`) is left out on both sides, because MuPDF infers spaces from gaps and a removed target leaves one. The comparison runs twice, with ordinary extraction and with replacement text ignored (`ignore-actualtext`). No output character's centre may lie inside a line box (where a black box is drawn), ticked or not, so nothing unticked ends up hidden under a box. **Pixels**: on every page holding a target, every image that meets a target quad is blank in the output (white in every colour channel, or unpainted for an image mask) at every pixel whose centre falls inside that quad, and an image that cannot be decoded for the check counts as not blank. **Structure**: the trailer has no `/Info` or `/Encrypt`, the catalog and every page hold only their allowlisted keys, no object anywhere carries a carrier key or a `/JS` entry, the file is a single revision, and the page count matches the source.
- **AC-14**: All or nothing. Any failure during a run (a page that will not load, MuPDF throwing, the self check) produces no output and exactly one kind from the closed set. A partial file never crosses.
- **AC-15**: The outcome is honest. `pageCount` is the source's page count. `removedByType` counts ticked matches per kind, and only once the self check has passed. `pagesWithoutText` comes from the open summary. `sanitized` lists exactly the kinds the inventory table finds in the source, in `SANITIZED_KINDS` order.
- **AC-16**: A run reports `redacting`, then `writing`, then `verifying`.
- **AC-17**: A cancel is noticed within one page of work, and before a queued run starts. A cancel that lands during the write or the self check lets that call finish and then discards the output. A cancelled run posts nothing, and the session is back at `reviewing` with its document, bytes and targets untouched.
- **AC-18**: One run at a time per session. A run requested while a cancelled one is still finishing starts only after that one has destroyed its working copy, so a session never holds two.
- **AC-19**: The tool page carries a thin working path. `reviewing` shows a Redact button that runs over the current ticks. `redacting` shows the phase and a Cancel button. `complete` shows a one line outcome from `session.outcome` (how many items were removed and what was stripped) and, until the download has been handed over, a Download button. Download hands the file to the browser under `outputName`, releases the output as spec 0002 AC-4 requires, and leaves the session at `complete`. The five new kinds show through the existing alert in plain words.
- **AC-20**: The output held on the main thread for Download is dropped whenever the session stops being `complete` with nothing downloaded: on Download, a tick change, start over, a replacement, a lost worker and leaving the page. A redact reply that belongs to a superseded attempt is dropped rather than shown.
- **AC-21**: The instrumented privacy proof covers a full run: open, redact, download. No storage accessor is ever called, no request carries document bytes, extracted text, match text or the file name, and `GET /api/entitlement` stays the only http or https request the tool route makes. The download's `blob:` URL is local and is not counted as a request.
- **AC-22**: Detection and redaction read the same page. At open, before anything is extracted, the review copy is prepared: annotations a viewer never shows (flagged hidden, no view or invisible) and any Redact marks already in the source are deleted, then forms and visible annotations are flattened into the page. Every working copy is prepared the same way before its targets are applied, so a field whose appearance is regenerated lands where it was reviewed, content nobody saw is never painted in, and nothing is removed that nobody ticked.
- **AC-23**: A replacement that arrives during a run cancels that run, and the new document is not parsed until the run has destroyed its working copy and let go of the old bytes (spec 0002, AC-1 and AC-5a).
- **AC-24**: MuPDF's own warnings and errors never reach the console. Opening a damaged PDF, flattening and redacting print nothing from MuPDF.
- **AC-25**: A failed self check names what it found, most serious first, and only once every page has been compared (it may stop early only when the answer is already `redaction-incomplete`). A structural failure, a pixel that is not blank, a throw while checking, or a character extra with replacement text ignored (a glyph that survived) is `redaction-incomplete`. Otherwise a character extra in ordinary extraction only (replacement text that survived) is `replacement-text`. Otherwise a missing character (unticked text that is gone), or an unticked character left centred under a box (unticked text hidden), is `redaction-overreach`. On a run with nothing ticked, any character difference is `unsupported` instead, since nothing ticked can have leaked or reached too far. Each lands the session in `failed`, as `redaction-incomplete` does.
- **AC-26**: A ticked match inside a replacement text span that wraps more than the match, written inline in the content stream or named in the page's `/Properties`, fails the run with `replacement-text`, and no file is handed back. The engine never edits a content stream to trim the span.
- **AC-27**: Before anything is removed, every target is checked against the prepared working copy, and a target that fails fails the run with `unsupported`. Each quad must be finite, must not cross itself, and must have every side at least `MIN_QUAD_SIDE` (0.5 pt) long. The ordinary extraction characters whose centres lie inside the target's quads, in extraction order with whitespace removed, must contain the target's `text` (whitespace removed) as one unbroken run. A quad in the wrong page space, on the wrong page or around the wrong glyphs is refused rather than redacted.

## Decision

**Chosen option**: Option 1: redact a fresh working copy of the retained original, rebuild the output from its pages, and check the result before it leaves.

Each run opens its own working copy from `EngineSession.bytes`, prepares it exactly as the review copy was prepared at open, checks every target against its own text, records every page's characters, removes every ticked target in three passes with explicit MuPDF redaction settings (text on a thin band, then pixels and covered line art on the padded quad, then the box on the line box), grafts the redacted pages into a brand new document that carries only an allowlist, writes it, and reopens the written file to prove that every page holds exactly its source characters less the ticked ones, that no image still shows ink under a target, and that no stripped structure came back. Only then does the output cross to the main thread.

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

**Settled with you after slice 2's findings:**

- **Spec**: 0004 updated in place. Slices 1 and 3 stand as built.
- **Removing text**: on a thin band through the middle of each quad, with its ends pulled in, never on the whole quad.
- **The box**: on the quad clipped to its line box.
- **Scan padding**: first picked as grown from the line box on every side. After the second cross check, grown from the full quad instead, 0.25 of its height across the line and 0.1 along it, because an OCR text layer's quad can sit wholly above the baseline.
- **Covered line art**: removed on the padded area, in the same pass as the pixels, before the box is drawn.
- **The second cross check's 19 fixes**: accepted as recommended. They are folded into the bullets below and into AC-4, AC-5, AC-13, AC-25 and AC-27.
- **Detecting over removal**: the self check compares every page's characters before and after, in both extraction modes, on every page.
- **Over removal**: fails the run with a new `redaction-overreach` kind.
- **A match inside wider replacement text**: fails closed through the check, with no content stream editing.
- **That failure's kind**: a new `replacement-text` kind, so the visitor learns why and the counts show how often it happens.
- **MuPDF's log**: the do nothing function stays, with its rationale corrected (below).

**Settled here** (pick, why, runner up):

- **Where the header check lives**: in `openDocument`, before `loadEngine`, beside the size cap. A PNG then never costs the multi megabyte engine download. Runner up: in the worker before `openDocument`, which fetches the engine for a file it is about to refuse.
- **The 1024 byte window is a named engine constant** (`PDF_HEADER_WINDOW` in `src/engine`), not a config value. It is a rule about the file format, not a cap on the visitor, and an environment variable would let a typo set it to 0 and turn the check off. It and the target geometry constants below are the deliberate exceptions to "every size limit comes from `src/config`", and each constant's comment says so. Runner up: `src/config`.
- **PDF check after opening**: `asPDF()` must return a document, or the open fails with `corrupt`. Redaction needs a PDF document object, and MuPDF picks its handler by sniffing content rather than trusting the type it is given.
- **Layers are refused whenever the catalog has `/OCProperties`**, read through `getTrailer()` to the root. Checking each layer with `isLayerVisible` is not enough: it reports only each layer's on or off state in the default configuration. It cannot see layer membership rules (`AnyOff`, `AllOff`, visibility expressions) that hide content even with every layer on, or layers that show only when printed. Runner up: refusing only files with a layer that `isLayerVisible` reports as off, which lets those two cases through with content nobody reviewed.
- **One shared prepare step** (`prepareDocument` in `src/engine`), run on the review copy at open before inspection and detection, and on every working copy before targets are applied: delete every annotation whose `getFlags()` includes `IS_HIDDEN`, `IS_NO_VIEW` or `IS_INVISIBLE`, delete every `Redact` annotation already in the source, then `bake(true, true)`. Detection then extracts exactly the page content redaction will act on, including any field appearance MuPDF regenerates. The review copy is prepared once, at open; that is part of opening it, not a run, so INV-1 holds. Runner up: flatten only the working copy, which lets a regenerated field value land somewhere other than where it was reviewed, outside the target quads, where the self check cannot see it.
- **Engine API**: a new `redactDocument(bytes, targets, options)` takes the clean bytes and never the review handle, so the type system itself keeps a run off the review document. Both `openDocument` and `redactDocument` have internals that take the loaded MuPDF module as a parameter, and the exported functions pass `loadEngine()`'s result in. That is the seam Vitest uses to run real MuPDF in Node for opening and redacting alike. Runner up: a test only setter on `loadEngine`, which is a mutable hook in the walled module.
- **MuPDF's log is silenced once, right after the engine loads**: `setLog(() => {})`. Its warnings can quote document detail, and left alone MuPDF prints them to the console. `setLog(null)` would also print nothing in 1.28.1, because it switches the callback off (`_wasm_enable_log_callback(false)`). The do nothing function stays anyway: with `null`, silence depends on what MuPDF chooses to do without a callback, and a later version could print again, while a function that throws every line away is silent by construction. This makes the existing "never capture worker console output" rule in `AGENTS.md` a backstop rather than the only line of defence.
- **Target geometry**, derived in the engine from each target quad along its own axes, so rotated text works the same. A quad from `page.search()` runs from the font's ascent to its descent as MuPDF measures them, 1.0 to 1.37 em tall depending on the font, which is taller than the line pitch at single spacing. An OCR text layer can sit wholly above its baseline (measured: 1.000 em above, 0.001 below). The quad is read like this:
  - Its corners `ul`, `ur`, `ll`, `lr` are taken in text orientation (upper left to upper right runs along the line). Its height `h` is the mean of `|ul - ll|` and `|ur - lr|`, and its width `w` the mean of `|ul - ur|` and `|ll - lr|`. A fraction of the height is measured from the edge joining `ul` and `ur`. Every derived point comes from bilinear interpolation between the four corners, extrapolated beyond them for padding. A quad that is not finite, crosses itself, or has a side under `MIN_QUAD_SIDE` (0.5 pt) is refused before any pass (AC-27).
  - **Removal band**: from 0.45 to 0.55 of the height (`REMOVAL_BAND_RATIO` 0.1, centred), each end pulled in by `min(REMOVAL_INSET_RATIO × h, 0.25 × w)` with `REMOVAL_INSET_RATIO` 0.1. MuPDF removes a glyph whose full height box meets the band, so a band through the middle catches every glyph of the match, punctuation included, and none on the lines around it. The inset keeps a neighbour kerned up to 150 thousandths of an em into the match, in both a 1.0 em and a 1.37 em font, while still removing a lone `.` or `i` (measured). Runner up: bands built from each glyph's origin and size, which is font independent but adds a character match the band does not need.
  - **Line box**: from `LINE_BOX_TOP` (0.20) to `LINE_BOX_BOTTOM` (0.93) of the height, about the em box at Helvetica's metrics. Where the box is drawn. Runner up: an em box per glyph from its origin.
  - **Padded area**: the whole quad grown by `TARGET_PADDING_RATIO` (0.25) of its height across the line (above and below) and by `TARGET_PADDING_ALONG_RATIO` (0.1) of its height along it (before and after). Where pixels are blanked and covered line art is removed. Anchored on the full quad, not the line box, so descender ink under an OCR layer that sits above its baseline is still covered; growing only a little along the line keeps a bullet, icon or cell divider beside the match. Runner up: the line box grown on every side (the first pick), which leaves OCR descenders legible.
  - All these values are constants in `src/engine` beside `PDF_HEADER_WINDOW`, with `POSITION_TOLERANCE`, `LINE_ANGLE_TOLERANCE`, `LINE_HEIGHT_MIN`, `LINE_HEIGHT_MAX` and `EXTRACTION_OPTIONS` below: rules about geometry and extraction, not caps on the visitor, and a fixture fails if one is changed carelessly.
- **Redaction settings are explicit at the call site, in three passes per target page, in this order.** Each pass creates one `Redact` annotation per target on the page, its areas set with `setQuadPoints` (no interior colour, no overlay text), then makes one `applyRedactions` call. After each call the page must hold no `Redact` annotation, or the run throws.
  - **Text pass**, with Redact annotations on the removal bands: `applyRedactions(false, REDACT_IMAGE_NONE, REDACT_LINE_ART_NONE, REDACT_TEXT_REMOVE)`. Removes the text and nothing else.
  - **Padded pass**, on the padded areas: `applyRedactions(false, REDACT_IMAGE_PIXELS, REDACT_LINE_ART_REMOVE_IF_COVERED, REDACT_TEXT_NONE)`. Blanks image pixels (to white), which covers scan ink the OCR quad missed, and removes vector marks it fully covers: an underline, or the match drawn as outlines over an invisible text layer, whole glyphs with descenders and accents included. Table borders that only cross it stay, and so does a mark beside the match that reaches more than a tenth of the quad's height past its end.
  - **Box pass**, on the line boxes: `applyRedactions(true, REDACT_IMAGE_NONE, REDACT_LINE_ART_NONE, REDACT_TEXT_NONE)`. Draws the black box and removes nothing. It runs last, so the padded pass can never remove a new box as covered line art.
  - **Why the box is not padded**: a padded box would sit over neighbouring text that is not removed, which is the "text under a black box" pattern that redaction checkers flag as a fake redaction, and a buyer may well run one against the output. That was the refinement to the cross check's fix, and slice 2 showed the exact quad has the same fault at single spacing: at 12pt leading it hides the lower edge and descenders of the line above.
  - All twelve arguments are written out even where they match MuPDF's defaults, so a library upgrade that changed a default cannot silently change what is removed. Runners up: two passes on exact quads (the first design), which removes whole words on the lines above and below at single spacing; covered line art on the line box, which leaves an outlined match's descender and accent glyphs whole; a fourth pass so line art gets its own area, which the small growth along the line makes unnecessary.
- **Rebuild**: one graft map per run, and every page grafted through it. After each `graftPage`, the working page's `/Group` (its transparency settings) is grafted through the same map and set explicitly, because MuPDF's page graft is not relied on to carry it.
- **Page allowlist**: `/Type /Parent /MediaBox /CropBox /BleedBox /TrimBox /ArtBox /Rotate /UserUnit /Resources /Contents /Group`. Every other page key is deleted after grafting, whatever the graft chose to copy.
- **Carrier sweep**: every object in the new document, recursing into its direct sub dictionaries and arrays, loses `/Metadata`, `/PieceInfo`, `/Thumb`, `/AA`, `/AF` and `/LastModified`. The allowlist covers the catalog and pages; the sweep covers what hangs below them (an image's XMP, a form XObject's private data), wherever a producer nested it.
- **Write options**: `garbage=deduplicate,compress,sanitize`. `sanitize` rewrites every page's content through MuPDF's filter, so each page keeps only the resources it actually draws. That is what stops an unredacted form XObject surviving in a resource dictionary shared with a page that never draws it. The shared resource fixture proves it, and if it does not hold, that fixture fails and the build returns to `/architect`. Never `incremental`, never `encrypt`, never `linearize`. Nothing asserts that MuPDF writes a new file identifier; AC-7 only requires that the source's is gone.
- **Destroy order**, which holds the peak at about four copies of the document: the working copy right after the last page is grafted, the rebuilt document right after `saveToBuffer`, MuPDF's output buffer right after it is copied into a fresh `ArrayBuffer`, and only then is the self check document opened. The engine makes the copy, so the bytes it checked are the bytes that cross.
- **Inventory for `sanitized`**: computed in the engine from the working copy before it is prepared, using the rules in the inventory table below.
- **Targets are checked before anything is removed** (AC-27). `RedactionTarget` gains a worker private `text`: the match as detection extracted it. After preparing, the engine extracts each target's page in ordinary mode, takes the characters whose centres lie inside the target's quads in extraction order, removes whitespace, and requires the target's `text` (whitespace removed) as one unbroken run among them; it also refuses a degenerate quad. Without this the check trusts the quads blindly: a quad in the wrong page space removes the wrong glyphs, the real match lies outside it and is recorded as unticked, and the comparison passes a file that still says it. Runner up: trusting the quads, which is what the first design did.
- **Self check method: compare, never sample.** In a first loop over every page, before any page is redacted, the engine extracts the prepared working copy's page with each of the two `EXTRACTION_OPTIONS` (`""`, then `ignore-actualtext`) and records every character that is not whitespace and not ticked (AC-13 defines ticked: centre inside a target quad by a point in convex quad test, where the centre is the mean of the character quad's four corners and a point on an edge counts as inside, and on the target's line). At `verifying` it extracts every page of the reopened output the same two ways and matches the lists: same code point, origins within `POSITION_TOLERANCE`. Surviving glyphs keep their origins to about 0.00002 pt through removal and a sanitize write, so 0.01 pt leaves wide margin with no false matches. An extra character in either mode means something ticked survived; a missing one means something unticked was removed. The black box is a filled path, not text, so it never appears. The structural half walks every object once. Runners up: the first design's test (no character centre inside a target quad), which cannot see over removal and missed replacement text placed just outside the quad; a count of each target's string on its page, which catches replacement text but not over removal.
- **Extraction options are one constant**, `EXTRACTION_OPTIONS` in `src/engine`, shared with the Vitest target helper: MuPDF's defaults (what `page.search()` uses, so character quads and target quads are built alike) and the same plus `ignore-actualtext`. Never `dehyphenate`, `collect-styles`, `segment`, `clip` or `accurate-bboxes`, each of which changes which characters exist or where their quads sit.
- **Only a glyph on the target's own line counts as ticked.** A large diagonal watermark letter that crosses a target has a glyph box the band can meet, and MuPDF would remove it. Exempting everything centred in the quad would let that loss pass unseen. Requiring the direction within `LINE_ANGLE_TOLERANCE` (2 degrees) and the height within `LINE_HEIGHT_MIN` to `LINE_HEIGHT_MAX` (0.67 to 1.5) of the target quad's makes it a reported `redaction-overreach` instead.
- **The character record**: for each page and mode, a `Float64Array` of origins and a `Uint32Array` of code points, never strings, never a whole structured text object. It is taken in its own loop over every page before the redaction loop begins, so damage one page's pass does to a resource shared with a later page cannot be recorded as that page's source. It is dropped when the run returns or fails. Matching buckets each output character into a grid of `POSITION_TOLERANCE` cells by origin, probes the 3 by 3 neighbouring cells for a record entry with the same code point and both coordinates within the tolerance, and uses each record entry once (a multiset, so duplicate glyphs such as fake bold are counted). Pages with no target are recorded and compared too: that catches a shared form XObject redacted in place under a page that never ticked it, and any text the `sanitize` write drops. Runner up: target pages only, which is cheaper and blind to both.
- **The pixel check**: on every page holding a target, the engine walks the reopened output's structured text with images kept, and for each image block whose area meets a target quad it decodes the image, maps each pixel's centre onto the page through the image's transform, and requires every pixel whose centre falls inside a target quad to be blank (white in every colour channel after conversion to RGB, or unpainted for an image mask). A decode that fails counts as not blank. The character check is text only, so without this, scan ink the pixel pass missed would pass while hidden under the box. Runner up: trusting the padded pass, as the first design did.
- **The kind a failed check reports** follows AC-25's order, chosen from three flags gathered over every page (an extra with replacement text ignored, an extra in ordinary extraction, a missing character) plus the structural and pixel verdicts. A leak outranks an overreach, because a run that both leaked and over removed must be reported as the leak. Replacement text is told apart from a surviving glyph by the mode that saw the extra: the two extractions differ only in how they treat replacement text. The counts can misattribute a mixed case (an over removal that also moves an untouched span's replacement text reads as `replacement-text`); both kinds are terminal, so only the counts are affected, and leak first is the safe direction.
- **Replacement text wider than a match is refused, not repaired.** MuPDF drops a replacement text span when every glyph in it is removed, and keeps the span's whole string when only some are. MuPDF.js 1.28.1 offers no way to rewrite a content stream, and writing our own would be a second PDF parser, which `AGENTS.md` forbids. The named form in `/Properties` could be cleared with an object edit, but is not: clearing it only in the output would make every untouched named span whose text differs from its glyphs (a ligature) fail the comparison, and clearing it in the prepare step would change what detection reads for one form and not the other. So both forms fail closed alike, through the comparison. Runners up: editing content streams ourselves (needs the one parser rule changed); redrawing an affected page through MuPDF's PDF writer device, which drops marked content but writes fonts and images out afresh and is a second output path to prove.
- **Cancel mechanism**: the worker hands the engine an `isCancelled()` check. The engine yields a macrotask after opening the working copy, after preparing it, after every page of the recording loop and of the redaction loop (whether or not it holds a target, so an empty run still yields per page), and after the rebuild, and it throws a private `RunCancelled` (never an `EngineFailure`, never posted) when the check is set. The worker checks again when a queued run starts, and after the write and the self check before posting, dropping the output if a cancel has arrived.
- **Run queue and replacement**: the session keeps the tail of its run chain in `runs` and the operation id of the run in flight in `activeRunId`. A failed or cancelled run settles its link rather than breaking the chain. `endSession` adds `activeRunId` to `cancelled` before it closes anything, and `handleOpen` awaits the evicted session's `runs` tail before it parses the new bytes.
- **Slice 1 refuses targets**: until the three passes and the character comparison land together in slice 2, `redactDocument` answers any non empty target list with `unsupported`. No build ever hands back a file that was asked to remove something and did not.
- **The test seam grows by three steps.** `Pipeline` (the frozen parameter `redaction.ts` already has for `sweepCarriers`) gains the text pass, the padded pass and the removal area, so a test can skip the text pass and see `redaction-incomplete`, skip the padded pass on an OCR page and see the pixel check return `redaction-incomplete`, or remove on the exact quads and see `redaction-overreach`. The worker only ever runs the frozen default.
- **A throw while checking the output** (reopening it, extracting a page, decoding an image) is `redaction-incomplete`, as a check that cannot finish vouches for nothing. A throw while validating targets or while a pass runs stays `unsupported`.
- **The thin path's lines for the two new kinds**, until feature 8 writes the real copy: `redaction-overreach` reads "Removing what you ticked would also remove words you did not tick, so no file was made." and `replacement-text` reads "A ticked item sits inside hidden replacement text that cannot be removed safely, so no file was made."
- **An unexpected throw during a run** (including MuPDF failing to allocate memory) maps to `unsupported`. Runner up: a new `out-of-memory` kind, but MuPDF's messages are not a stable contract to detect it by, and a tab killed outright already arrives as `lost`.
- **The tool page**: the output waits in a `useRef` in `tool-client`, never in the reducer, because spec 0002 keeps the output out of `ToolSession` on purpose. The `OpenedSession` handle waits in a ref beside it. One effect drops the output ref whenever the session is not `complete` with `downloaded` false, rather than a drop at each exit. The redact reply is guarded by the same attempt counter `runOpen` uses.
- **The browser cancel test**: fulfils `GET /api/entitlement` with a paid snapshot through Playwright's `page.route`, so the test uses no product seam. It opens a generated 50 page fixture that is deliberately heavy (a large image on every page), so the run lasts long enough, and asserts that the cancel landed while `redacting` was showing. A run that finished first then fails the test rather than passing it without testing anything.
- **Encryption fixtures**: RC4, AES-128 and AES-256 owner password files, all hand written in the fixture script with `node:crypto` (RC4 is a few lines of its own), so none is authored by the engine it tests.
- **Standing in for feature 6 in tests**: a Vitest helper mints targets with MuPDF's `page.search()` on the fixture, which gives quads the same way a detector will, and sets `text` to the needle it searched for (fixtures are written so its case matches the page).
- **Fixture fonts**: MuPDF's built in Helvetica (a 1.37 em quad) and Courier (1.25 em), plus Carlito embedded (a 1.0 em quad, metric compatible with Calibri, under the SIL Open Font License), committed beside the fixture script with its licence. Microsoft's fonts cannot ship in a public AGPL repository. The OCR fixtures write their text layer the way Tesseract does (an invisible font whose quad sits above the baseline), and `verify.md` adds one manual run over a real OCRmyPDF file.
- **How the pixel and ink tests measure**: render at 4 times scale; ink is any pixel with a channel below 128; neighbouring ink is isolated by comparing against a render of the same fixture without the target's line; blanked means every decoded image pixel whose centre lies in the area is white. The misaligned OCR fixture shifts its text layer down by 15% of the quad's height and left by a tenth of an em.

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

Worker only, `RedactionTarget` (in `src/engine`): `page` (zero based) · `quads` · `start` · `end` · **`kind: DetectorKind`** (new, so the worker counts `removedByType` without the main thread naming anything) · **`text: string`** (new after the second cross check: the match exactly as detection extracted it, so the engine can check the quads really surround it, AC-27. Worker private like the rest of the target, never logged).

Per run, in the engine, never stored: working copy (destroyed after grafting) → rebuilt document (destroyed after the write) → MuPDF output buffer (destroyed after the copy) → the output `ArrayBuffer` → self check document (destroyed after the check) → the output, transferred.

Per run, in the engine, beside those: the **character record**, per page and per mode (ordinary extraction and `ignore-actualtext`), a `Float64Array` of origins and a `Uint32Array` of code points for every character that is not whitespace and not ticked (AC-13). Taken from the prepared working copy in a loop over every page before any page is redacted, read once at `verifying`, dropped when the run returns or fails. It never crosses the boundary.

Engine result, `RedactionResult`: `output: ArrayBuffer` · `removedByType: Partial<Record<DetectorKind, number>>` · `sanitized: readonly SanitizedKind[]`. The worker adds `pageCount` and `pagesWithoutText` from the open summary to make the `RedactionOutcome`.

Main thread: `ToolSession` is unchanged. The output waits in a `useRef` in `tool-client` between `redacted` and Download.

Protocol growth (unions only grow):

| Set | Added |
|---|---|
| `ENGINE_ERROR_KINDS` | `not-pdf`, `hidden-layers`, `redaction-incomplete`, and after slice 2's findings `redaction-overreach` and `replacement-text` |
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
   ──▶ inventory ──▶ prepare ──▶ validate targets
   ──▶ page 1 … n: record characters, yield
   ──▶ page 1 … n: text pass, padded pass, box pass, yield
   ──▶ rebuild ──▶ writing ──▶ verifying (structure, characters, pixels) ──▶ posted as `redacted`

any step ──cancel noticed (a cancel, or a replacement)──▶ discarded, posts nothing
any step ──failure──▶ discarded, posts one `error` kind
```

- `redaction-incomplete`, `replacement-text` and `redaction-overreach` land the session in `failed`, which is terminal for that document. That is right for the first two: a document the engine cannot prove clean should not be offered another run. For `redaction-overreach` it is stricter than it has to be, since a different tick set might pass, and it keeps spec 0002's session machine unchanged.
- The pipeline order is fixed. The inventory comes before preparing, or flattened annotations would no longer be found. Preparing comes before the Redact annotations are added, or the flatten would bake the redaction markers into the page. Targets are validated on the prepared copy, the page detection read. Every page is recorded before any page is redacted, or a pass that changes a resource shared with a later page would change that page's record too. The text pass comes first, so text is removed before anything else changes the page. The box pass comes last, so the padded pass can never take a new box for covered line art.

**API surface**

| Surface | Kind | Key inputs | Key outputs | Auth | Key errors |
|---|---|---|---|---|---|
| `openDocument` | engine function | `bytes`, `limits`, `onPhase` | `OpenDocument`, prepared | worker only, by lint | `not-pdf`, `corrupt`, `hidden-layers`, `password-required`, `too-large`, `too-many-pages`, `engine-unavailable` |
| `redactDocument` | engine function | `bytes` (the clean original), `targets: readonly RedactionTarget[]`, `onPhase`, `isCancelled` | `RedactionResult` | worker only, by lint | `redaction-incomplete`, `replacement-text`, `redaction-overreach`, `corrupt`, `unsupported`, `engine-unavailable`, private `RunCancelled` |
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
| redact | each target's page, quads, kind and text | the worker's private `targets` map, resolved from the ticked `matchIds`. Feature 6 fills it |
| redact | the target verdict | the prepared working copy's ordinary extraction of the target's page, the characters centred in its quads in extraction order, against the target's `text`, both with whitespace removed; and each quad against `MIN_QUAD_SIDE` (0.5 pt) |
| redact | redaction settings for the three passes | constants at the three `applyRedactions` call sites in `src/engine` |
| redact | each removal band | the target quad read as *Target geometry* sets out, from 0.45 to 0.55 of its height (`REMOVAL_BAND_RATIO`), each end pulled in by `min(REMOVAL_INSET_RATIO × h, 0.25 × w)`. Constants in `src/engine` |
| redact | each line box | the target quad, from `LINE_BOX_TOP` to `LINE_BOX_BOTTOM` of its height. Constants in `src/engine` |
| redact | each padded area | the whole target quad grown by `TARGET_PADDING_RATIO` (0.25) of its height across the line and `TARGET_PADDING_ALONG_RATIO` (0.1) of its height along it. Constants in `src/engine` |
| redact | the extraction options | `EXTRACTION_OPTIONS` in `src/engine`: MuPDF's defaults, and the same plus `ignore-actualtext`. Shared with the Vitest target helper |
| redact | whether a source character is ticked | its quad centre (the mean of its four corners) inside a target quad on its page, its direction within `LINE_ANGLE_TOLERANCE` (2 degrees) of the quad's, and its quad height between `LINE_HEIGHT_MIN` (0.67) and `LINE_HEIGHT_MAX` (1.5) times the target quad's |
| redact | the character record | the prepared working copy's structured text, every page, in a loop before any page is redacted, in both extraction modes, keeping characters that are not whitespace (`/\s/u`) and not ticked |
| verify | the characters to compare against | the reopened output's structured text, every page, both modes, whitespace left out |
| verify | the match tolerance | `POSITION_TOLERANCE` (0.01 pt), a constant in `src/engine`, applied to both coordinates through a grid of cells that size with the 3 by 3 neighbours probed |
| verify | the pixel verdict | each image block the output's structured text reports on a target page, decoded, its pixel centres mapped onto the page through the block's transform, and every pixel centred inside a target quad tested for white (or unpainted, for an image mask) |
| verify | the failure kind | AC-25's order over flags gathered from every page: structure, pixels, a throw, or an extra with replacement text ignored; then an extra in ordinary extraction only; then a missing character. `unsupported` for any character difference on a run with no targets |
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
| any failure | the alert text | `errorText` in `tool-client`, one plain line per kind until feature 8 writes the real copy. The lines for `redaction-overreach` and `replacement-text` are fixed in *Settled here* |

**Key invariants**

- **INV-1**: A run never touches the review document or `bytes`. It works on a copy it opened itself and destroys it before returning. The review copy is prepared once, at open, and never again.
- **INV-2**: No output crosses the boundary unless all three parts of the self check (characters, pixels, structure) passed on those exact bytes. All or nothing.
- **INV-3**: The output carries nothing from the source that the rebuild did not choose to carry: an allowlist at the catalog and the page, a recursive sweep for known carriers below them, and a write that keeps only the resources each page draws.
- **INV-4**: The non PDF check reads bytes before MuPDF sees them. The name and the declared type are never consulted anywhere in the engine.
- **INV-5**: Redaction settings are written out at all three call sites, never left to MuPDF's defaults.
- **INV-6**: Targets come only from the worker's private map (spec 0002, INV-2). The main thread sends ids and nothing else.
- **INV-7**: At most one working copy exists per session at any moment, and none survives into the next session.
- **INV-8**: The output crosses exactly once, transferred, and the worker keeps no reference to it.
- **INV-9**: Detection and redaction read the same prepared page. Anything that changes what a page shows is part of the one shared prepare step, never applied to one copy alone.
- **INV-10**: No surviving character's centre lies inside a black box. The box is drawn only by the box pass, on the target's line box, and the self check fails any run whose output has a character centred inside one, ticked or not.
- **INV-11**: Text is removed only on removal bands. No pass that removes text ever uses a line box, a padded area or a raw quad, because MuPDF takes out every glyph whose full height box touches the area.
- **INV-12**: The self check compares whole pages rather than sampling targets. Every page's characters in the output equal the source's characters less the ticked ones, in both extraction modes, so a leak and an over removal are caught by the same rule. Every page is recorded before any page is redacted.
- **INV-13**: The engine never edits a content stream itself. Anything MuPDF cannot remove is refused, not patched (spec 0001's one parser rule).
- **INV-14**: Nothing is removed on a target the engine could not match to its own text. A quad is trusted only after the characters inside it are shown to spell the match.

**Security model**

- **No new authorisation.** The tool route stays anonymous, and the page cap frozen at open (spec 0002, INV-5) already bounds what a run can touch.
- **What this feature defends against**: residue in the file's structure (the rebuild, the sweep and the structural self check), residue in the page content and in replacement text (the character comparison, in both extraction modes), residue in scanned images under a target (the padded pass, then the pixel check), residue in shared resources (`sanitize` on write), a non PDF passed off as one (the header check), content a viewer hides (the layer refusal and the prepare step), a target whose quads do not surround its match (target validation), and unticked text silently lost or hidden around a target or anywhere else in the file (the character comparison, on every page).
- **The character record holds document text** (code points and positions) for the length of a run. It lives only in the engine inside the worker, never crosses the boundary, is never logged, and is dropped when the run returns or fails, like the working copy.
- **The output now crosses to the main thread**, once and briefly. Spec 0002's INV-1 and AC-6 are reworded in place to say so rather than claim the main thread never holds a document.
- **Owner password restrictions are removed on purpose** (AC-10). The visitor already holds the content, and the restriction protects nothing from them. Feature 16 should say so.
- **MuPDF's diagnostics are silenced** (AC-24), so nothing it says about a document reaches the console, where feature 11 could otherwise pick it up.
- **What this design does not remove, stated honestly** so feature 16 does not overclaim:
  - Embedded fonts keep the shapes of removed characters. That is an inventory of which characters existed, never their order.
  - Text drawn as vector outlines, or shown only as pixels with no text layer, is never detected. Features 7 and 14 own those.
  - Text that no detector matched passes through as it is, including text a viewer does not show: outside the crop box, white on white, or under a black rectangle the source already had. That last one is a fake redaction the visitor received and may not know about.
  - Scan ink further from the OCR text than the padding reaches stays legible. The padding covers ordinary misalignment, not an OCR layer that is badly wrong.
  - A ticked match inside wider replacement text cannot be redacted in this release. The run refuses with `replacement-text` rather than hand back a file that still says the match to any reader that honours `/ActualText` (Acrobat, pdf.js and MuPDF all do).
  - The line box is a fixed share of MuPDF's quad, and fonts put their baseline at 0.74 to 0.81 of that quad, so the box is close to the em box rather than exact. On single spaced text it can cover the tips of the line above's descenders. Over an OCR layer whose quad sits wholly above its baseline, the box sits high and the white padding shows beneath it. No character's centre is ever under it (INV-10).
  - Covered line art is removed across the padded area, so at single spacing a small vector mark lying wholly inside it (an underline on the line above) goes with the target. The first design's exact quads reached about as far.
  - The pixel check sees the images structured text reports. An image drawn only through a tiling pattern, or used only as a soft mask, is not checked; whether the pixel pass reaches one is whatever MuPDF does.
  - A text watermark that crosses a target (a large diagonal "COPY" or "CONFIDENTIAL") is touched by the band, so the run refuses with `redaction-overreach` rather than take a letter out of it.
  - Removed text in a CID font leaves no readable bytes to search for, so for those fonts the byte level proof is extraction alone.
  - XFA form data (an older XML form format) is dropped with the form, but its contents were never shown for review.
  - A working copy freed after a run is unreachable, not erased. The same caveat spec 0002 gives for replacement applies.
- **Compliance scope is GDPR**, inherited from spec 0001. Nothing in this feature reaches RedactNest's infrastructure.
- **Logging**: the outcome is counts and enumerated kinds, and the five new error kinds carry nothing else (spec 0002, INV-4). In particular `replacement-text` and `redaction-overreach` say nothing about which characters, which page or how many.

**Configuration required**

None. `PDF_HEADER_WINDOW`, the target geometry values (`REMOVAL_BAND_RATIO`, `REMOVAL_INSET_RATIO`, `LINE_BOX_TOP`, `LINE_BOX_BOTTOM`, `TARGET_PADDING_RATIO`, `TARGET_PADDING_ALONG_RATIO`, `MIN_QUAD_SIDE`) and the check's values (`POSITION_TOLERANCE`, `LINE_ANGLE_TOLERANCE`, `LINE_HEIGHT_MIN`, `LINE_HEIGHT_MAX`, `EXTRACTION_OPTIONS`) are deliberately engine constants, not environment variables (see *Settled here*).

**Critical test scenarios**

Engine, Vitest with real MuPDF in Node (`tests/unit/redaction.test.ts`), over hand written fixtures in Helvetica, Courier and embedded Carlito (see *Fixture fonts*), measured as *How the pixel and ink tests measure* sets out:

- **Happy path**: a ticked email and phone on a text page are gone by extraction and from the decompressed bytes, the neighbouring words survive, a black box covers each line box, and the outcome counts both. Verifies **AC-4**, **AC-6**, **AC-15**.
- **Single spacing**: three lines of 12pt text at 12pt leading and again at 14pt, with a target on the middle line, in each fixture font. Every character of the lines above and below survives at its source origin, in both extraction modes, and the run passes its own check. At 14pt, a render of the output shows no ink of the neighbouring lines under the box. Verifies **AC-4**, **AC-6**.
- **Geometric edges**: one fixture per case in AC-5, including the shared resource case (the unredacted XObject is absent from the output bytes), text at 30 degrees through all three passes, a misaligned OCR page written the way Tesseract writes its text layer where every image pixel in the padded area is white (descenders included) and the neighbouring OCR words survive, a match drawn as vector outlines over an invisible text layer where every outlined glyph (descenders and accents included) is gone, neighbours kerned 80, 120 and 150 thousandths of an em into the match on each side in Helvetica and Carlito that survive, a lone `.` and a lone `i` as whole targets, and a replacement text span that wraps exactly the match, gone from extraction and from the bytes. The byte search applies to fixtures in a simple encoding and to replacement text strings only. Verifies **AC-5**.
- **Recorded before redacted**: a form XObject holding a target, drawn on page 1 and on page 3, with the target ticked on page 1 only. Either MuPDF redacts each drawing separately and page 3 keeps its copy, or the run fails with `redaction-overreach`; it never passes with page 3's text silently gone. Verifies **AC-13**.
- **Targets validated**: a target whose quads are shifted a line down, one on the wrong page, and one with a quad that crosses itself or has a side under 0.5 pt each fail with `unsupported` before anything is removed. Verifies **AC-27**.
- **Pixels checked**: the aligned OCR fixture run through the seam with the padded pass skipped fails with `redaction-incomplete`, and an inline image and a 1 bit image mask under a target come out blank or fail the run. Verifies **AC-13**, **AC-25**.
- **Watermark and hidden glyphs**: a large diagonal text watermark crossing a target fails with `redaction-overreach`; a small superscript centred inside a target's line box that the band does not reach fails with `redaction-overreach` too, rather than survive under the box. Verifies **AC-13**, **AC-25**.
- **Measured, then recorded**: a match with a combining mark (a zero width glyph) and a form XObject drawn twice on one page with the match in one drawing. Each result is written into this spec as either fixed or an honest limit. Verifies **AC-5**.
- **Replacement text wider than the match**: the match inside an inline `/ActualText` span, again in UTF-16 form, and again named in `/Properties`, each fails with `replacement-text` and returns no output. A replacement text span elsewhere on the page whose text differs from its glyphs (a ligature), with a target beside it, redacts and passes. Verifies **AC-13**, **AC-25**, **AC-26**.
- **Over removal**: a neighbour kerned 300 thousandths of an em into the target, and the single spacing fixture run through the seam with removal on the exact quads, each fail with `redaction-overreach` and return no output. A run with no targets whose output differs in its characters (forced through the seam) fails with `unsupported`, not `redaction-overreach`. Verifies **AC-13**, **AC-25**.
- **Everything else stripped**: a fixture carrying every kind in AC-7 comes out with none of them, the catalog holds only `/Type`, `/Pages` and `/Lang`, every page holds only allowlisted keys, and `sanitized` matches the inventory table case by case. Verifies **AC-7**, **AC-15**.
- **Prepared alike**: in the same fixture, a hidden annotation never shows up in the review or the output, a Redact mark already in the source removes nothing, and a field set to regenerate its appearance is redacted where the review found it. Verifies **AC-22**.
- **Flattened, still visible**: an unticked form value and an unticked typed annotation extract as page text from the output. Verifies **AC-8**.
- **Structure**: the output is one revision with the source's page count, boxes, rotation and transparency group. Verifies **AC-9**.
- **Owner password**: the RC4, AES-128 and AES-256 fixtures redact, and each output needs no password and carries no restrictions. Verifies **AC-10**.
- **Two runs, one original**: run with targets A and B, then with A only, from the same `bytes`. The second output still holds B, and `bytes` is byte for byte unchanged. Verifies **AC-11**.
- **Empty run**: no targets yields a cleaned file, empty `removedByType`, and a populated `sanitized`. Verifies **AC-12**.
- **The self check fires**: run the internal pipeline with the text pass skipped, and separately with the carrier sweep skipped; each must fail with `redaction-incomplete` and return no output. A run that both leaves a glyph and over removes reports `redaction-incomplete`, even when the over removal is on an earlier page than the leak. After every pass, the page holds no `Redact` annotation. Verifies **AC-13**, **AC-14**, **AC-25**.
- **Refusals**: a PNG named `.pdf`, a text file, a docx and a PDF whose marker starts at offset 1020 are `not-pdf`; the same PDF with its marker at offset 1019 opens. A layered fixture is `hidden-layers` whatever its layers' states. The engine is never loaded for a `not-pdf` file. Verifies **AC-1**, **AC-2**, **AC-3**.
- **Silence**: with a recording log installed in place of the no op, opening a damaged fixture, flattening and redacting reach MuPDF's log callback, and with the no op installed nothing reaches `console`. Verifies **AC-24**.
- **No false alarm**: every fixture in the matrix that is expected to redact passes its own character and pixel checks, with no page reporting a missing or extra character. Verifies **AC-13**.
- **Geometry**: the removal band, line box and padded area of a plain quad and of a quad at 30 degrees land where *Target geometry* says, the inset is capped at a quarter of the width on a narrow quad, and a quad that is not finite, crosses itself, or has a short side is refused. Verifies **AC-4**, **AC-6**, **AC-27**.

Worker, Vitest with the engine mocked (`tests/unit/engine-worker.test.ts`):

- **Failure case, cancel**: a gated engine lets the test cancel between pages, during the write, during the self check, and while a run waits in the queue. Each posts nothing, and a following run starts only after the cancelled one settles. Verifies **AC-17**, **AC-18**.
- **Replacement mid run**: an `open` for a new job arrives while a run is gated. The run is cancelled, and the new document's `openDocument` is not called until the run has settled. Verifies **AC-23**.
- **Phases and outcome**: `redacting`, `writing`, `verifying` in order; the outcome is assembled from the result plus the summary; the engine's buffer is transferred as it is. Verifies **AC-15**, **AC-16**.
- **All or nothing**: an engine throw of any kind posts exactly one `error` and no `redacted`. Verifies **AC-14**.

Tool page, component test (`tests/component/tool-client.test.tsx`):

- The buttons follow the states; `complete` shows the one line outcome; Download calls the helper with `outputName` and then disappears; the held output is dropped on a tick change, start over, replacement and a lost worker; a redact reply from a superseded attempt is ignored; each new kind renders its line, `redaction-overreach` and `replacement-text` included. Verifies **AC-19**, **AC-20**, **AC-25**.

Browser, Playwright:

- **Privacy proof, redaction leg**: in `privacy.spec.ts`, open, redact and download with the recording proxies installed. Nothing is ever written, no http or https request carries document data, and the entitlement call stays the only such request. Verifies **AC-21**.
- **The real engine in the real worker**: in `engine.spec.ts`, redact the metadata fixture and catch the download. Node then opens the downloaded file with MuPDF and finds it cleaned. Verifies **AC-7**, **AC-19**.
- **Quiet console**: open a damaged fixture and run a redaction while recording console messages. Nothing from MuPDF appears. Verifies **AC-24**.
- **Cancel in a real browser**: a paid snapshot through `page.route`, the heavy 50 page fixture, and a cancel asserted to land during `redacting`. Back on the checklist, with no Download offered. Verifies **AC-17**, **AC-19**.
- **Auth and permission**: there is no new permission. An anonymous visitor's 4 page document is still refused at open with `too-many-pages` before any run can start (spec 0002, AC-9), so no run ever exceeds the frozen cap.

## Build plan

Ordered by Skateboard. Slice 1 is the thinnest whole that is safe to ship on its own: a real PDF goes in, a cleaned and structurally checked PDF comes out through the page, the outcome says plainly that nothing was removed, and nothing that is not a PDF or cannot be cleaned gets through. The refusals and the prepare step sit in slice 1 on purpose, because without them a cleaning run could turn a PNG into a `-redacted.pdf` or paint in content nobody saw. Slice 2 lands real removal and the character comparison together, never one without the other. Slice 3 makes a run stop cleanly, including when a new file replaces it. Slices 1 and 3 and task 12 are built; slice 2's other tasks were rewritten after its two findings and are not.

**Slice 1: a clean file leaves the tool, and only from a real PDF**

1. Grow the protocol: the three error kinds, `verifying`, the two sanitized kinds, and `kind` on `RedactionTarget`. Add a plain line for each new kind to `errorText` and each new phase to `PHASE_TEXT` in `tool-client`, reword the `corrupt` and `unsupported` lines so they read true after a failed run as well as a failed open, and keep the `LoggablePayload` gate green. Satisfies **AC-1**, **AC-3**, **AC-13**, **AC-16**, **AC-19**.
2. Rework `openDocument` behind the module parameter seam: the `PDF_HEADER_WINDOW` check before `loadEngine`, `setLog` silenced once the engine loads, the `asPDF()` check, the `/OCProperties` refusal, and `prepareDocument` on the review copy before inspection. Update the existing `not-really.pdf` browser test to expect `not-pdf`, and add a PNG named `.pdf`. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-22**, **AC-24**.
3. Grow `scripts/make-fixture.mjs` with hand written fixtures: the metadata fixture (every AC-7 kind across two revisions, plus a hidden annotation, a Redact mark already in place and a form set to regenerate its appearances), a layered fixture, and the offset 1019 and 1020 header pair. Satisfies **AC-1**, **AC-3**, **AC-7**, **AC-22**.
4. Build `redactDocument` without removal: working copy from `bytes`, inventory by the table, `prepareDocument`, rebuild (one graft map, `/Group`, page allowlist, recursive carrier sweep, `/Lang`), the destroy order, write with the fixed options, the engine's own output copy, and the structural half of the self check. It answers any non empty target list with `unsupported`. Add a Vitest suite that drives real MuPDF in Node through the seam. Satisfies **AC-7**, **AC-8**, **AC-9**, **AC-12**, **AC-13**, **AC-14**, **AC-15**, **AC-22**.
5. Wire `handleRedact` in the worker: resolve ids against `targets` (an empty set is allowed), run, report phases, assemble the outcome, transfer the engine's output buffer as it is (the engine made the copy, so the bytes it checked are the bytes that cross), and map every failure to one kind. Rewrite the worker test that asserts redaction is `unsupported`. Satisfies **AC-12**, **AC-14**, **AC-15**, **AC-16**.
6. The thin path in `tool-client`: Redact, the one line outcome and Download from existing primitives, the `OpenedSession` and output refs, the single effect that drops the output, and the attempt guard on the redact reply. Satisfies **AC-19**, **AC-20**.
7. The browser legs: the privacy proof's redaction leg in `privacy.spec.ts` with its filter narrowed to http and https requests, the real engine redaction in `engine.spec.ts` with the downloaded file checked in Node, and the quiet console check. Satisfies **AC-7**, **AC-21**, **AC-24**.

**Slice 2: targets are really removed, and the engine checks its own work**

8. The target geometry, target validation and the three passes. In `src/engine`: the quad reading, removal band, line box and padded area exactly as *Target geometry* sets out, with every constant named there and in the self check bullets, each commented as a deliberate exception to the caps rule, and unit tests on plain and 30 degree quads, the inset cap on a narrow quad, and degenerate quads. Add `text` to `RedactionTarget` and validate every target after preparing (AC-27). Then a recording loop over every page in both `EXTRACTION_OPTIONS`, keeping only characters that are not whitespace and not ticked, then a redaction loop over every page: the text pass on the removal bands, the padded pass on the padded areas, the box pass on the line boxes, each with one annotation per target, its written out settings and the no leftover `Redact` assertion. Each loop yields after every page, with or without a target. Grow `Pipeline` with the text pass, the padded pass and the removal area. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-17**, **AC-27**.
9. The self check's character and pixel parts, in the same change as task 8 and lifting task 4's refusal of non empty targets: extract every page of the reopened output both ways, match against the record through the grid index, fail any character centred inside a line box, check the images under every target, gather the flags over every page, and name the kind by AC-25's order, under the `verifying` phase. A throw while checking is `redaction-incomplete`. Add `redaction-overreach` and `replacement-text` to `ENGINE_ERROR_KINDS` with the lines fixed in *Settled here* in `errorText`, and keep the `LoggablePayload` gate green. Prove each kind fires: the text pass skipped gives `redaction-incomplete`, the padded pass skipped on an OCR page gives `redaction-incomplete` through the pixel check, removal on the exact quads over the single spacing fixture gives `redaction-overreach`, the wide replacement text fixture gives `replacement-text`, a forced difference on a run with no targets gives `unsupported`, and the sweep skipped still gives `redaction-incomplete`. Satisfies **AC-13**, **AC-14**, **AC-16**, **AC-19**, **AC-25**, **AC-26** (built).
10. The fixture matrix and the Vitest target helper built on `page.search()` (setting `text` from its needle), in Helvetica, Courier and Carlito, with Carlito and its licence committed beside `scripts/make-fixture.mjs`: single spacing at 12pt and 14pt leading, two lines, rotated page, text at 30 degrees, offset crop box, form XObject, shared resource XObject, a form XObject drawn on two pages, filled field, typed annotation, aligned and misaligned OCR over an image with a text layer written the way Tesseract writes it, an inline image and a 1 bit image mask under a target, a match drawn as outlines over invisible text, kerning at 80, 120, 150 and 300 thousandths of an em on each side, a lone `.` and `i`, a diagonal text watermark, a superscript under a box, a combining mark, a form XObject drawn twice on one page, wrong and degenerate target quads, and replacement text spans (wrapping exactly the match; wider, inline, in UTF-16 and named in `/Properties`; and a differing span near a target). Each redacting case is checked by extraction, in the decompressed bytes where the encoding allows, and by its own character and pixel checks. Write the results of the combining mark and the twice drawn form into this spec as fixed or an honest limit. This is also the proof that `sanitize` on write keeps only what each page draws. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-8**, **AC-13**, **AC-26**, **AC-27**.
11. Two runs on one session with different targets, asserting the second output and the unchanged `bytes`. Satisfies **AC-11** (built).
12. The RC4, AES-128 and AES-256 owner password fixtures, hand written with `node:crypto`, each redacted into an unrestricted output (built). Satisfies **AC-10**.

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
- Single spaced text, the most common setting there is, redacts cleanly: the lines around a match keep every character and are not hidden by its box.
- The self check now catches both ways a redaction can be wrong. A leak and an over removal are the same rule seen from two sides, and every page is held to it, so damage on a page nobody ticked, including anything the `sanitize` write drops, is caught too.
- The first design's weak spot, replacement text around a match, is closed. A survivor there now stops the run with a plain reason rather than relying on a byte search that only a test ran.
- A detection bug can no longer turn into a silent leak. A quad that does not surround its match is refused before anything is removed, and scan ink under a target is checked in the output's own pixels rather than trusted to the pass that blanked it.
- Feature 14 gets most of its mechanism: a drawn rectangle is another target, the padded and box passes already handle images, and the character comparison holds it to the same rule. It still decides how a drawn area removes text (see Follow-up).

**Negative and tradeoffs**:

- **Peak memory rises.** With the destroy order, a run peaks at about four copies of the document: `bytes`, the review document, and two of the working copy, the rebuilt document, the output and the self check copy at any one moment. MuPDF's WebAssembly heap keeps its high point until a release. The memory measurement item in spec 0001's Follow-up now has to measure this.
- **The output is plainer than the source, by design.** No bookmarks, no links, no fillable fields, no tags, no page labels, no attachments. Somebody redacting a long report loses its navigation, and a screen reader user loses its structure. The summary tells them about the tags through `accessibility-tags`, and the rest is the price of the rebuild.
- **Every layered PDF is refused**, including those whose layers are all visible. That is broader than it strictly needs to be, and it is the only rule MuPDF.js lets us state truthfully. They are rare in this audience, but a visitor who has one gets no file.
- **`sanitize` rewrites every content stream on the way out.** It is what keeps shared resources honest, and it adds a small rendering risk on unusual files. The fixtures and the two reader checks in `verify.md` are the guard.
- **The padded pass leaves a margin of blanked (white) pixels around boxes on scanned pages.** That looks heavier than the text, and it is the cost of covering ink the OCR text missed. Because the padding grows from the whole quad, on a single spaced page it reaches into the neighbouring lines' pixels: on a scan their ink is clipped while their OCR text survives, and born digital text drawn over a background image gets a white halo around its box.
- **A match inside wider replacement text cannot be redacted here.** The visitor gets `replacement-text` and no file, and because `failed` is terminal they cannot untick that match and try again on the same document. How often this happens is unknown until the counts come in.
- **Over removal is terminal too.** A match whose neighbour is kerned deep into it, or text whose lines sit closer than about three quarters of an em (at Helvetica's metrics), fails with `redaction-overreach` rather than producing a file missing words. That is the right trade for documents whose meaning matters, and it will occasionally refuse a file a looser tool would have handed back.
- **The self check costs more.** Every page is extracted twice more during the run and twice more at `verifying`, each target is matched against its page once more, and every image under a target is decoded again at the check. The character record for 50 pages of dense text can reach around ten megabytes on top of the four copies, and decoding a full page scan for the pixel pass and again for the check costs tens of megabytes while it lasts. The memory measurement item in Follow-up now includes both.
- **A text watermark crossing a target refuses the run.** Statements and letters stamped "COPY" or "CONFIDENTIAL" in large diagonal text will sometimes hit this, and the visitor gets `redaction-overreach` rather than a file with a letter missing from the stamp.
- **Feature 6 owes one more field.** Every target must carry the `text` it matched, or it is refused. That is a small contract, and it is what lets the engine prove the quads are right.
- **Carlito is committed to the repository** as a test fixture font, under its own open font licence.
- **The line box is approximate.** It is a fixed share of MuPDF's quad, and fonts place their baseline differently within that quad, so the box sits close to the em box rather than exactly on it: a touch short on fonts like Calibri, and over the line above's descender tips at single spacing.
- **The review copy is flattened at open.** Detection sees form values and typed comments as page text, which is what we want, and the review copy is no longer byte for byte what MuPDF first parsed. Nothing reads it for any other purpose.
- **`redaction-incomplete` is terminal for that document.** If MuPDF cannot remove something, the visitor cannot redact that file here at all. That is the right answer, and it will occasionally feel like a dead end.
- **A replacement now waits for a run in flight** to notice its cancel, which can take up to one page or one write. That delay is what keeps two documents from being open at once.
- **MuPDF's own diagnostics are gone from the console**, which makes an engine problem harder to debug from a visitor's report. The closed error kinds are what is left, by design.
- **Owner restrictions are removed.** That is deliberate and defensible, and it needs saying plainly on the security page so it does not read as a bypass.
- **The black box needs careful wording.** The product line "never covered with a black box" means "never only covered". Features 15 and 16 should say "removed, then marked" so a buyer who sees black boxes does not conclude the opposite.
- **Cancel is only as quick as one page.** A single very heavy page, or the final write, cannot be interrupted, only discarded afterwards.
- **One extra parse per run** for the self check, which the `verifying` phase makes visible rather than hides.

**Neutral**:

- The session state machine does not change. Three of its edges simply become reachable.
- `hidden-layers` sits in `SANITIZED_KINDS` and is never reported in release 1. The union only grows, and the kind will mean something if a later decision cleans layers rather than refusing them.
- `EngineErrorKind` grows to thirteen members, and feature 8 writes copy for all of them.
- The allowlists, the carrier keys, the write options, the header constant and the target geometry constants live in `src/engine`, so changing any of them is a reviewed code change with a failing fixture as the proof.
- The target geometry contract does not change. Feature 6 still hands over `page.search()` shaped quads, and the engine derives the band, the line box and the padded area from them. The only addition is `text`.

## Follow-up

- [ ] Feature 6 must set `kind` and `text` (the match exactly as extracted) on every `RedactionTarget` it mints, give quads in the same page space `page.search()` uses, extract with `EXTRACTION_OPTIONS` from `src/engine`, and leave `start` and `end` for features 6 and 13.
- [ ] Feature 6 should detect in both extraction modes, and mark a match whose quad reads differently with replacement text ignored (a match inside wider replacement text) as not redactable during review, so the visitor never loses a session to `replacement-text`. Detecting in both modes also finds glyphs hidden behind unrelated replacement text, which ordinary extraction never offers.
- [ ] Feature 11 counts engine error kinds (counts and kinds only), which is where the numbers the next item waits on come from. With feature 6 built, spec 0002's AC-14 browser step closes; whichever of features 5 and 6 lands second ticks it in 0002's `verify.md`.
- [ ] Features 6 and 7: flag text a viewer does not show, so a visitor learns about it before sending the file. The cases are characters under an opaque fill (a fake redaction already in the source, findable with MuPDF's structured text vector option), text outside the crop box, and text the same colour as its background.
- [ ] Feature 7 decides whether a document with no text layer on any page is refused at open or at redact time. This engine produces a cleaned file for it today, because nothing is ticked.
- [ ] Feature 8 writes the real copy for `not-pdf`, `hidden-layers`, `redaction-incomplete`, `redaction-overreach`, `replacement-text` and `verifying`, restyles the thin path and its one line outcome, makes a run with 0 removed impossible to mistake for a redaction, and shows the `sanitized` list, including the `accessibility-tags` loss. The `redaction-overreach` copy must explain the watermark case clearly: a stamp such as "CONFIDENTIAL" or "DRAFT" drawn across a ticked item is the likeliest cause, and the engine refused rather than cut a letter out of it. The kind carries no page or item (spec 0002, INV-4), so the copy names the likely cause, not the place.
- [ ] Measure how often a text watermark ("CONFIDENTIAL", "DRAFT", "COPY") causes a `redaction-overreach` refusal on real HR and legal documents: run a local set of such documents (never committed, since the repository is public and the documents are private) through the engine in Node with targets ticked the way feature 6 would, and count refusals by cause. The kind alone cannot tell a watermark from other over removal, so this has to be a corpus test, not the counts from feature 11. If it is common, bring it back to `/architect`: the options include telling the visitor during review that a match lies under a watermark, and letting such a run return to `reviewing` rather than end in `failed`.
- [ ] Feature 14 reuses `redactDocument` with rectangle targets, and must widen spec 0002's INV-2 deliberately to get geometry onto the main thread. It must also decide how a drawn area removes text: the removal band assumes a quad shaped like one line of text, as `page.search()` gives, and shrinking a drawn rectangle to its middle would miss every line but one.
- [ ] Report to MuPDF upstream (Artifex) that its redaction filter keeps a replacement text span's whole `/ActualText`, inline or named, when it removes only some of the glyphs in the span. If a later MuPDF trims or drops the span, `replacement-text` stops firing for those files and the fixture that expects it must change to expect a clean redaction.
- [ ] If the counts show `replacement-text` or `redaction-overreach` firing often, bring it back to `/architect`: the options are redrawing affected pages through MuPDF's PDF writer device, glyph derived geometry, or letting a failed run return to `reviewing` (a change to spec 0002's session machine).
- [ ] Feature 16's security page: the black box is drawn after removal, fonts keep a character inventory, tags and navigation are dropped, owner restrictions are removed on purpose, scan ink beyond the padding can survive, images drawn only through a pattern or soft mask are not pixel checked, text no detector matched passes through, a match inside wider replacement text is refused rather than redacted, a text watermark crossing a match refuses the run, the engine refuses rather than removes words nobody ticked, and freed working copies are unreachable rather than erased.
- [ ] Features 15 and 16: reword "never covered with a black box" to "removed, then marked" wherever a box now appears.
- [ ] Measure peak memory on a 50 page, 25 MB document on the support target, extending the item in spec 0001's Follow-up now that a run holds about four copies at its peak plus the character record. On the heavy 50 page fixture with one target per page, measure too the peak heap of the pixel pass and the pixel check, and the output size once the pixel pass has rewritten each image (a scan saved again in a different encoding can grow). Set a limit from the numbers.
- [ ] Revisit after release 1, with real documents: keeping and scrubbing the structure tree, subsetting fonts, tuning `TARGET_PADDING_RATIO`, `TARGET_PADDING_ALONG_RATIO`, `REMOVAL_BAND_RATIO`, `REMOVAL_INSET_RATIO` and the line box against real OCR layers, and cleaning layers instead of refusing them.
- [ ] Root `AGENTS.md` should record, when this ships: the `not-pdf` byte rule, the engine constants that are deliberate exceptions to the caps rule, the rebuild approach and the shared prepare step, the three passes and why text is removed only on a band, the silenced MuPDF log (which updates the existing console output note: MuPDF prints by default, `setLog(null)` prints nothing in 1.28.1, and the engine installs a do nothing function anyway), the module parameter seam that lets Vitest run real MuPDF in Node, and the grown fixture script.
- [x] Spec 0002 amended in place for items 2 to 4 carried in from earlier features: INV-1 and AC-6 reworded, `EngineSession.bytes` given its reader, and `verify.md` brought up to date.

## Rationale

Reasoning, the options weighed for each decision, what the cross check changed, what the code and MuPDF.js turned up, and the measurements behind slice 2's redesign: see [rationale.md](rationale.md).
