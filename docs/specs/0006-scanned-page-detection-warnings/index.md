# 0006. Scanned page detection and warnings

**Date**: 2026-09-28
**Status**: In Progress

## Summary

Before review, RedactNest now reads every page and says plainly where it cannot see: a scanned page, text in a font it cannot read, a large picture with no text over it, and text a viewer never shows (under a box drawn on top, the same colour as the page, clipped away). It names those pages when the document opens and again at download, and a file with any of them is offered as `name-partly-redacted.pdf`. A document with no page RedactNest can read is refused at open, so it never produces a file. Text and pictures outside a page's visible area are now removed in every run, because nobody can see them and they have no reason to stay in a redacted file.

## Amends specs 0002, 0003, 0004 and 0005

- **Spec 0002.** `DocumentSummary.pagesWithText` is replaced by `pages`, one `PageReading` per page. `RedactionOutcome.pagesWithoutText` is replaced by `pagesByFinding`. `ReviewMatch` gains `concealed`. `ENGINE_ERROR_KINDS` gains `no-readable-text` and `edge-text`. `outputName` is set again at `opened`, because the name now depends on what the pages hold (`outputNameFor` gains a `partly` argument).
- **Spec 0003.** The opened document card's line "N of M have a text layer" is replaced by an all clear line or by the warnings and notes below; its Value sourcing row changes to `session.summary.pages`, and its `verify.md` step that expects "1 of 2 have a text layer" is rewritten. `ChecklistItem` gains `concealedNote`. The warnings use `Callout`'s existing `warning` and `info` tones, so no new colour pairing enters the contrast contract.
- **Spec 0004.** Two new engine steps: `inspectPages` (open only) and `trimToVisibleArea` (open and every run). The fixed pipeline order becomes: inventory, prepare, **trim**, validate targets, slant, images, record every page, the three passes page by page, rebuild, write, self check. The self check gains two rules (no character centred outside the visible area survives; no ink in image pixels wholly outside it on a page trimmed in pixel mode), both `redaction-incomplete` whatever is ticked. `Pipeline` gains `trim`, so a test can skip it. `openDocumentWith` becomes async and takes `isCancelled`. A third extraction setting joins the two that are never mixed: `IMAGE_CHECK_OPTIONS` (`preserve-images,clip=no`), used only by the self check's outside pixel rule. Three rules are reworded: **INV-9** "Detection and redaction read the same prepared and trimmed page. Anything that changes what a page shows, or removes what lies outside its visible area, runs on both copies, never on one alone." **INV-11** "Inside the visible area, text is removed only on removal bands. Outside it, the trim removes all of it (spec 0006)." **INV-1** keeps its letter (the trim runs once, at open, as part of preparing the review copy), and the worker's comment that the review copy is "never redacted" becomes "never redacted inside its visible area". Its Follow-ups on text a viewer does not show, on the document with no text layer and on the crooked scan are met here, and its two **(after feature 7)** verify steps run under AC-30; their entries in its `verify.md` now read **(after feature 7, spec 0006 AC-30)**.
- **Spec 0005.** AC-12 now reads "a page that holds a readable character" where it said "a page that reported a text layer" (a stamped scan's stamp is still searched). `FoundMatch` gains `concealed`. The coverage note and the empty state gain "on the pages it could read" whenever a page carries a warning. Its two **(after feature 7)** verify steps run under AC-30; their entries in its `verify.md` now read **(after feature 7, spec 0006 AC-30)**.

## Requirements

**User stories**:
- As a visitor, I want to be told which pages RedactNest cannot read, so I never believe a scanned page was checked.
- As a visitor, I want to hear about text I cannot see on the page, so a fake redaction I received does not travel on in a file I send.
- As a visitor, I want a document RedactNest cannot read at all refused with a reason, rather than handed back looking redacted.
- As a visitor, I want text outside the visible page removed, since nobody can see it and it has no reason to stay.
- As a visitor downloading, I want the warning repeated, and the file named so it says it is only partly redacted.

**Acceptance criteria**:

*Reading the pages*

- **AC-1**: At open, after `prepareDocument` and before detection, the engine reads every page once, under the existing `inspecting` phase, and gives it zero or more findings from `PAGE_FINDINGS` by the rules in *Page findings*. The summary carries `pages`, one `PageReading` per page in page order; each `findings` list holds no repeats and follows `PAGE_FINDINGS` order. A page with readable text and nothing else to say has an empty list.
- **AC-2**: A page with no readable character and pictures covering at least `SCAN_MIN_SHARE` of it is `scanned`. So is a page holding fewer than `STAMP_MAX_CHARS` (40) readable characters (a page number, a Bates number) over bare pictures that together cover at least `SCAN_MIN_SHARE`. A slide with a full bleed background photo and a title and bullets over it holds more than that, so it is `bare-picture`, not `scanned`. A page with no glyph of any kind that is neither `scanned` nor `blank` (words drawn as outlines, a diagram, a lone logo) is `drawn-only`. A page is `blank` when it draws no glyph, no image of any size, and no path or shading whose colour contrasts with white paper above `HIDDEN_CONTRAST_MAX` (a path or shading whose colour cannot be judged counts as contrasting), so the white background rectangle Word and Chrome paint on every page leaves an empty page `blank`.
- **AC-3**: A readable character is one that is not whitespace, not U+FFFD, not a control character (Cc) and not a private use character (Co). A page is `unreadable-text` when a line holds a run of `UNREADABLE_RUN` (3) or more characters that are U+FFFD or private use, or when it draws glyphs and holds no readable character. A lone unmapped bullet on a page that also holds readable text is not.
- **AC-4**: A page that is not `scanned`, holding a picture of at least `PICTURE_MIN_SHARE` of the page with text over less than `TEXT_OVER_PICTURE_MAX` of it, is `bare-picture`. A pasted ID card on a typed page is; a small logo is not; an OCR scan whose text layer covers the page is not. A picture's footprint is its placement bounds cut to the bounds of the clip in force, so a headshot cropped by a small frame from a large photo counts at the frame's size.
- **AC-5**: A page drawing invisible text (render mode 3) whose centre lies over an image, drawn before or after the text, is `machine-read-text`, which is a note and never a warning. Such glyphs are never judged by AC-6 or AC-7, so a scan whose producer writes the text layer under the image (ABBYY's "text under image") reads the same as one that writes it over (Tesseract, OCRmyPDF).
- **AC-6**: A page is `covered-text` when a glyph centred inside the visible area has at least `COVER_MIN_OVERLAP` (0.8) of its box inside an opaque cover drawn after it. A cover is a filled path that is one axis aligned rectangle in page space (a closed subpath of four corners, or five points whose last equals its first, each edge level or upright within `POSITION_TOLERANCE`), or an image drawn by `fillImage` whose `getMask()` is null. Opaque means alpha 1, not inside a soft mask, and not inside a group with a soft mask, an alpha below 1 or a blend other than `Normal` (a plain group of normal blend and full alpha, which Chrome and Word wrap content in, does not stop a cover). The cover counts only as far as the bounds of the clip in force. Any colour counts. A black box drawn over text in the source, a white box over text, a cover wrapped in a plain group, and a black Square annotation baked in by `prepareDocument` each make it so; a strikethrough bar, an underline, a translucent highlight, a rotated rectangle (a recorded limit) and a table cell's background drawn before its text do not.
- **AC-7**: A page is `hidden-text` when a glyph centred inside the visible area, not already covered and not machine read text, is one a viewer does not show: invisible text with no image under or over its centre; text at zero opacity; text used only as a clip (render mode 7) when nothing is painted inside that clip before it is popped; text whose centre lies outside the bounds of the clip in force; text whose em height (the length of the text matrix times the transform applied to the unit upright vector) is below `TINY_TEXT_MAX` (1 pt); or visible text whose every paint (fill, stroke, or both) is in a colour space whose `getType()` is Gray, RGB or CMYK and has a contrast ratio below `HIDDEN_CONTRAST_MAX` (1.1) against what is directly under its centre. What is under it is the last opaque rectangle drawn before it under its centre, when that rectangle's own colour is judged, or white paper when nothing is drawn there. Text over an image, a shading, a tile, a group, or a rectangle in any other colour space is not judged for colour.
- **AC-8**: A page is `off-page-content` when the trim ran on it for a character or a path (AC-14), or for an image on a page blanked in pixel mode; and `off-page-picture` when the trim left its pictures alone (AC-15). Both are decided from the triggers, never from what a pass reports, so both copies reach them the same way. The first is a note, the second a warning.
- **AC-9**: Every measure in AC-2 to AC-7 is made from one callback `Device` pass in drawing order (`page.run(device, Matrix.identity)`, so its coordinates are the structured text's page space) plus the ordinary mode structured text read, on the prepared page. A glyph's box is the quad of the extracted character whose origin lies within `POSITION_TOLERANCE` of the glyph's origin; a glyph with no such character is not judged by AC-6 or AC-7. Every `Path`, `Text`, `StrokeState` and `ColorSpace` a callback receives is destroyed before the callback returns (MuPDF.js 1.28.1 hands them over with a reference kept), and no `Image` or `Shade` is held past its callback (they arrive without one). Findings, the per page readable flag and the concealed glyph origins stay inside the engine, held by the review document's handle and dropped with it.

*Refusing what cannot be read*

- **AC-10**: A page counts toward "nothing readable" when it is `scanned`, `drawn-only` or `blank`, or holds no readable character (AC-3). When every page counts, the open fails with `no-readable-text`, after inspection and before trim and detection, and no session exists, so no run can start. All scans, all blank pages, a stamped scan, a document set wholly in an unmapped font, and any mix of those are refused; a document with one readable page opens.
- **AC-11**: A page that throws while being inspected fails the open with `unsupported`. This replaces today's rule that counted such a page as having no text layer.

*Detection*

- **AC-12**: Detection reads every page that holds a readable character, a `scanned` page's stamp included, and no other page.
- **AC-13**: A match with a character whose origin lies within `POSITION_TOLERANCE` of a glyph counted as covered (AC-6) carries `concealed: "covered"`; otherwise one within reach of a glyph counted as hidden (AC-7) carries `"hidden"`; otherwise `null`. A concealed match is listed and tickable like any other, ticked by its detector's rule, and its row says so in its description (AC-24).

*Removing what lies outside the visible area*

- **AC-14**: `trimToVisibleArea` runs on the review copy at open (after the AC-10 check, before detection) and on every working copy (after `prepareDocument`, before target validation), with nothing ticked as well. The visible area is the page's bounds as MuPDF gives them (crop box within media box). A page is trimmed when, by the trim's own reads, it draws a character whose quad (from the ordinary mode read with `clip=no`) reaches outside the visible area, an image whose footprint (its placement from `fillImage` or `fillImageMask`, cut to the clip in force) reaches outside it, or a path wholly outside it (`Path.getBounds(null, ctm)`); every other page is left untouched. On a trimmed page, four Redact areas cover everything outside the visible area out to the bounds of everything the page draws, grown by 1 pt: a left and a right strip each spanning the full grown height, and a top and a bottom strip between them. A shading's bounds come from `Shade.getBounds()` through its transform, cut to the clip in force, or to the media box when that is still unbounded; a tile counts as its area. The areas are applied with no box, text removed, line art removed when covered, and pixels blanked or not per AC-15. A glyph straddling the edge is removed whole. Vector art outside goes when MuPDF judges one area covers it; a shape spanning two strips (around a corner) stays, a recorded limit, and only text and pixels are proved.
- **AC-15**: Before anything is removed, the trim works out, for every image placement from its device pass that crosses the visible area's edge, how far into the visible area MuPDF would blank for each strip it meets, by calling spec 0004's AC-29 reach computation on the placement directly (never through a clipped structured text read, which does not see an image wholly outside the page). When every such reach on the page is at most `TRIM_PIXEL_REACH` (1 pt), pixels outside the visible area are blanked, images wholly outside included. Otherwise that page's pictures are left untouched (no pixel is blanked on it) and the page gains `off-page-picture`. A cropped upright scan at 150 pixels per inch or finer is blanked; a colour band stretched from a few pixels into the bleed, and a picture drawn at an angle across the edge, are kept and warned about.
- **AC-16**: The trim proves its text work on every page it touches, reading both `CHECK_EXTRACTION_OPTIONS` modes before the pass and again on the page loaded afresh after it, and matching the two as `comparePage` does (within `POSITION_TOLERANCE`, whitespace skipped, each entry matched once): every character whose quad lay wholly inside the visible area is still there at its place, and no character whose centre lay outside it remains. A character straddling the edge may go or stay. When every character the proof finds wrong sits on a text line that crosses the visible area's edge, the failure is `edge-text`; any other failure is `unsupported` (so a file with lines shown by `'` or `"`, which spec 0004 already cannot redact, is not blamed on the edge). At open it fails the open, in a run it fails the run. Pixels are not proved here; the self check proves them once, on the output (AC-17).
- **AC-17**: The self check gains two rules, both `redaction-incomplete` whatever is ticked (a leak is a leak, so the nothing ticked path that turns other differences into `unsupported` does not apply to them): no character centred outside the visible area survives in the output in either extraction mode, and on a page the run trimmed in pixel mode no image pixel wholly outside the visible area shows ink, read through `IMAGE_CHECK_OPTIONS` (`preserve-images,clip=no`), so an image wholly outside is seen. The character record is taken after the trim, so a trimmed character is never expected back; the first rule is what catches a trim that silently did nothing, since the text would then sit in the record and the output alike.
- **AC-18**: A run's trim reaches the same decisions, page by page, as the open's (which pages had something removed, which kept their pictures). When they differ, the worker drops the output and posts `unsupported`, so the summary always describes the file that is downloaded.

*What the visitor sees*

- **AC-19**: When no page carries a warning finding, the opened document card reads "RedactNest can read the text on every page." in place of today's text layer line.
- **AC-20**: When any page carries a warning finding, a `warning` callout titled "Some pages can't be fully checked" (heading level 3, since the card's own title is the `h2`) sits in the opened document card, inside the polite live region, with one line per warning finding present in `PAGE_FINDINGS` order, each naming its pages (*Page lists*), then the advice line when `scanned`, `drawn-only`, `unreadable-text` or `bare-picture` is among them. A page carrying two warnings is named in both lines. Copy under *Copy*.
- **AC-21**: When any page carries a note finding, or the crooked scan rule holds (AC-25), an untitled `info` callout sits after the warnings in the same card, with one line per note finding in `PAGE_FINDINGS` order and the crooked scan line last. A note never appears inside the warning callout.
- **AC-22**: At `complete`, when any page carries a warning finding, a `warning` callout titled "Not every page was checked" (heading level 3) is the last thing in the outcome card, so it sits directly above the action row that holds Download, repeating the warning lines and saying why the name ends in partly redacted. When any page is `off-page-content`, an untitled `info` callout in the outcome card, before the warning, says that content outside those pages' visible area was removed. Both stay while the session is `complete`, before and after the download.
- **AC-23**: The download is named `{stem}-partly-redacted.pdf` when any page carries a warning finding, and `{stem}-redacted.pdf` otherwise. `blank`, `machine-read-text` and `off-page-content` never change the name. The name and the download warning come from one predicate, `isPartly`, over the same summary.
- **AC-24**: A concealed row shows "Hidden under a box on the page." (`covered`) or "Not visible on the page." (`hidden`) in its description line; a row that is both blocked and concealed shows its blocked reason first. Both join the row's accessible description.
- **AC-25**: The crooked scan line appears when at least one match is blocked `slanted-text` on a page that is `machine-read-text`, and never otherwise.
- **AC-26**: A refusal says plainly why no file was made. `no-readable-text` and `edge-text` each have a line in `errorText` (*Copy*) that names the cause and says no file was made (and, for `no-readable-text`, what to do next), shown in the existing failure callout (`danger`, `role="alert"`, outside the live region). The session is `failed`: no checklist, no Redact and no Download are offered, only Start over. These two lines are built here and fixed until feature 8 writes the final copy and treatment for every failure kind. A trim proof that fails away from the edge is `unsupported` (AC-16) and shows today's generic `unsupported` line until feature 8's copy for that kind allows for it. When any page carries a warning finding, the coverage note reads "RedactNest looked for {nouns} on the pages it could read. …" and the empty state's helper "RedactNest found no {nouns} on the pages it could read. …"; otherwise both keep spec 0005's wording.
- **AC-27**: The warning and note callouts carry their tone's icon and hidden tone word, and the review state with a flagged document passes axe, the keyboard walk and forced colours in a real browser (WCAG 2.2 AA). Page lists are plain text, so a screen reader reads "Pages 2 and 5".

*Privacy, cost and real scans*

- **AC-28**: Only closed kinds cross the boundary: `PageFinding`, `Concealment` and the two error kinds. No finding carries text, a position or a colour. `DocumentSummary` and `RedactionOutcome` stay `LoggablePayload`s, held by the type gate in `tests/unit/loggable.test.ts`, and `pagesByFinding` counts pages per finding and nothing else.
- **AC-29**: `openDocumentWith` becomes async and takes `isCancelled` beside `onPhase`, and the worker passes `() => cancelled.has(id)`. Inspection and the trim yield a macrotask and check for a cancel after each page, so a cancel or a replacement open is noticed within one page, and a cancelled open posts nothing and keeps nothing. On the 50 page text heavy document, inspection plus trim adds at most 2 seconds of CPU time to the open in the unit project. On a 50 page cropped scan at 300 pixels per inch, the open's cost, a run's cost, the output's size against the source's and the run's peak memory are measured too. All are recorded in `rationale.md`; a cost past the 2 seconds, or a peak past spec 0004's four copies of the document, returns to `/architect` before this ships.
- **AC-30**: This feature closes the two real scan steps specs 0004 and 0005 left marked **(after feature 7)** (spec 0005, AC-18). `/check verify` for this feature runs them on scans made locally (one of our own fixtures printed, scanned once straight and once about a degree crooked, each run through OCRmyPDF, the crooked one without `--deskew`, and kept out of git):
  - **Descenders under a box** (spec 0004's AC-5 and AC-13): on the straight scan, tick a match with descenders (a name with a g, j, p, q or y), redact and download; with the image viewed on its own (for example after `mutool extract`), no ink of the match shows around or below the box, and the lines around it still read.
  - **A scan about a degree crooked** (spec 0004's AC-28 and AC-29): on the crooked scan, a ticked name is removed and the run passes, and a long address or a whole line is shown blocked `slanted-text` during review, so it cannot be ticked.

  Each is ticked in spec 0004's `verify.md` and in spec 0005's, whose entries read **(after feature 7, spec 0006 AC-30)** and point here. The same run also checks this feature's own real scan steps: the machine read note on the straight scan; the crooked scan line on the crooked one (AC-25); and a crop of the straight scan in a PDF editor, which opens with the off page note and downloads with the cropped away region blank when the image is extracted.

## Decision

**Chosen option**: Option 2: a per page reading from one drawing order pass, a refusal at open for a document with nothing readable, and a trim of everything outside the visible area on both copies.

The engine reads each prepared page once through a MuPDF callback `Device` (which reports every glyph, image, path and clip in the order the page draws them) plus the ordinary structured text read, and turns what it sees into closed findings per page. The tool names the pages, repeats the warning at download and names the file partly redacted. Content outside the visible area is removed by a new step that runs wherever `prepareDocument` runs and proves its own work.

Decided within it (the runner up in brackets):

- **One `Device` pass, not a render.** MuPDF.js 1.28.1's callback `Device` gives draw order, fill colour and alpha, `ignoreText` for invisible text, clips, groups with their blend mode, image placements and `Image.getMask()`. That answers every rule without decoding a pixel. (Rendering each page at low resolution and comparing, which costs a raster per page and still cannot say what is text.)
- **Covers are axis aligned rectangles and opaque images only** (AC-6). A filled path counts as a cover only when it is one level rectangle in page space; an image counts only when `getMask()` is null. Curved shapes, rotated rectangles and translucent images are not counted (recorded limits). A plain group (normal blend, full alpha, no soft mask) does not stop a cover, because Chrome and Word wrap ordinary content in one. (Path bounds for every fill, which flags text beside a curved logo.)
- **Machine read text in either order** (AC-5). Invisible glyphs with an image under or over their centre are OCR, whichever the producer drew first, and are never judged as covered or hidden, so ABBYY's text under image output is not called a fake redaction.
- **A stamp is under `STAMP_MAX_CHARS` (40) readable characters** (AC-2). The share rule alone would call a slide deck with full bleed background photos a scan, and refuse it. The cap keeps the Bates stamped scan (a number of about ten characters) refused and lets a slide with a title and bullets open as `bare-picture`. (A cap on the refusal only, which fixes the refusal and leaves the slide's line saying "scanned image".)
- **Callback objects are freed in the callback** (AC-9). MuPDF.js 1.28.1 wraps `Path`, `Text`, `StrokeState` and `ColorSpace` with a kept reference before a device callback sees them, so each is destroyed before the callback returns, or thousands pile up per page until garbage collection. `Image` and `Shade` arrive without one and are never held past the callback; a repeated run test pins the heap staying flat.
- **Coverage is sampled on a grid.** Each share (a picture's size, the text over it, the bare pictures' part of the page) is counted over `READING_GRID` (64 by 64) points spread over the visible area, never computed as exact unions. Cheap, deterministic, and exact enough for thresholds that are themselves judgements. (Polygon union areas, which cost more code than the thresholds deserve.)
- **Text over a picture means readable lines.** A picture's coverage counts the boxes of structured text lines holding at least one readable character, visible or invisible, so an OCR layer counts and an unmapped font does not.
- **Glyphs meet characters by origin, and take the character's quad as their box.** A glyph from the device pass and a character from extraction are the same when their page space origins lie within the engine's existing `POSITION_TOLERANCE` (0.01 pt). The device pass gives an origin and an advance but no ascent or descent (MuPDF.js's `Font` exposes none), so the matched character's quad is the glyph's box, and a glyph with no match is not judged. Both origins come from MuPDF multiplying the same text matrix by the same transform, and slice 3 pins that they agree on the fixtures, and that a glyph mapped to several code points gives extra glyph calls at the same origin; if they do not agree, the tolerance is measured and recorded here rather than widened by guess. (Matching by index, which breaks on ligatures and replacement text.)
- **Colour is judged only where `ColorSpace.getType()` says Gray, RGB or CMYK** (an ICC based space reports its base type), converted to sRGB by fixed formulas, with contrast by the WCAG relative luminance formula. A glyph is low contrast only when every paint of it (fill, stroke, or both) is. Separation, DeviceN, Indexed and Lab colours, and anything drawn over an image, a shading, a tile or a group, are not judged (recorded limits), because a wrong guess there would warn on every print PDF. (Converting every space through MuPDF, which MuPDF.js does not expose for single colours.)
- **Clip only text is hidden only when nothing fills it** (AC-7). Render mode 7 is how a heading is filled with a photo or a gradient, so it counts as hidden only when nothing is painted inside that clip before it is popped.
- **Only what the visitor could see is judged** (AC-6, AC-7): covered and hidden text are judged for glyphs centred inside the visible area. A slug line in the bleed is the trim's business, not a warning.
- **The trim is a prepare like step, not a fourth pass.** It runs right after `prepareDocument` on both copies, so detection and target validation already see the trimmed page (spec 0004, INV-9), and the self check's record, taken after it, never expects a trimmed character back. It proves its text work at once (AC-16), because a record taken after the trim cannot see visible text the trim moved or lost; the self check's off page rule (AC-17) then catches a trim that did nothing at all. (A fourth pass after the three, with the self check allowing the off page characters as a second kind of expected loss, which leaves detection offering matches that hold a straddling glyph the run then removes.)
- **MuPDF redacts outside the page** (measured 2026-09-28, *Evidence* in `rationale.md`): Redact areas placed outside the crop box, below the media box and left of the page removed every glyph there, and a straddling line went whole. Slice 4's first task pins it; if an upgrade stops it, the trim cannot work and this decision returns to `/architect`.
- **Strips reach to what the page draws.** The four Redact areas extend to the bounds of everything the page draws, grown by 1 pt, so no magic coordinate is needed; the side strips span the full height so the corners are covered twice rather than not at all.
- **The trim reads its own page.** Its triggers and image placements come from its own device pass and its own `clip=no` read, never from `inspectPages` (which runs only on the review copy) or from spec 0004's image code (which reads clipped structured text and cannot see an image wholly outside the page). So a working copy decides exactly as the review copy did (AC-18).
- **A straddling glyph goes whole** (the engineer's choice), by MuPDF's own rule that a glyph whose full height box touches an area is removed. Measured 2026-09-28: at the top, bottom and right crop edges, in Helvetica, Courier and Times at 12 pt, a glyph whose extracted quad ends 0.1 pt inside the edge survived, so MuPDF's removal box does not reach past the extracted quad for them. Slice 4 pins it at 0 and 0.5 pt inside the edge, with embedded Carlito added; if a font's box does reach further, the trim refuses rather than guessing, and an inset constant comes back to `/architect` with the measurement.
- **Pictures across the edge: blank within 1 pt, else keep and warn** (the engineer's choice). The reach is computed before anything is removed, per placement, with spec 0004's AC-29 reach computation called on the placement directly.
- **Pixels are proved once, on the output.** The trim at open proves text only, so opening a 50 page cropped scan does not decode every page image twice; the self check's outside pixel rule proves the run's blanking on the bytes that leave.
- **Refusal at open**, in the engine, right after inspection, with the new kind `no-readable-text`. No session means no run, so no second check is needed in the worker. (Opening without Redact, which needs a new reviewing variant and a refusal in the worker too.)
- **A page that throws while inspected fails the open** with `unsupported`, matching spec 0005's AC-12, since a run on that file would fail its self check anyway.
- **`edge-text`** is the kind for a trim whose proof fails only on lines that cross the visible area's edge, at open or in a run, so feature 8 can say what went wrong; any other proof failure is `unsupported` (AC-16). The distinction keeps the copy true: a file whose lines are shown with `'` or `"` is broken by MuPDF's content filter anywhere on the page, and was already refused in every run by spec 0004. (One kind for every trim failure, whose copy would then blame the edge for a filter limit.)
- **The open becomes async and cancellable** (AC-29): `openDocumentWith` takes `{ onPhase, isCancelled }` and returns a promise, because inspection and the trim now read every page and must notice a cancel within one, as detection already does.
- **Findings per page, sets not a single kind** (the engineer's choice), with tone and precedence applied on the main thread by pure helpers in `src/lib/page-findings.ts`.
- **The run's trim must agree with the open's** (AC-18), compared in the worker, because the download note and the file name are derived from the summary.
- **Placement**: warnings and notes live in the opened document card, inside the polite live region, so they are heard once with the open; the download repeat lives in the outcome card. The refusal uses the existing failure callout. (A callout outside the live region with `role="alert"`, which spec 0003 keeps for things the visitor just did wrong.)
- **The thresholds are engine constants** in `src/engine/inspect.ts` and `src/engine/trim.ts`, each commented as a rule about pages rather than a cap on the visitor, the same exception `BOUNDS_REACH_RATIO` and the detector constants take. Their starting values are measured against fixtures and the local scans in the build, and the final values are written into this spec.

No community skill shaped this design.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (in memory only, nothing is stored):

Crosses the boundary, in `src/worker/protocol.ts`:

| Shape | Fields | Change |
|---|---|---|
| `PAGE_FINDINGS` / `PageFinding` | `covered-text`, `hidden-text`, `scanned`, `drawn-only`, `unreadable-text`, `bare-picture`, `off-page-picture`, `machine-read-text`, `off-page-content`, `blank`. The array's order is the display order | new, closed, frozen `as const` |
| `PageReading` | `findings: readonly PageFinding[]` (no repeats, in `PAGE_FINDINGS` order) | new |
| `DocumentSummary` | `pageCount: number` · **`pages: readonly PageReading[]`** (index is page number less one) | `pagesWithText` replaced |
| `CONCEALMENTS` / `Concealment` | `covered`, `hidden` | new, closed, frozen `as const` |
| `ReviewMatch` | as spec 0005, plus **`concealed: Concealment \| null`** | gains `concealed` |
| `RedactionOutcome` | `pageCount` · `removedByType` · **`pagesByFinding: Readonly<Partial<Record<PageFinding, number>>>`** · `sanitized` | `pagesWithoutText` replaced |
| `ENGINE_ERROR_KINDS` | adds `no-readable-text`, `edge-text` | grows |
| `countPagesByFinding(pages)` | pure: `readonly PageReading[]` to `pagesByFinding` | new helper beside `isEngineErrorKind` |

Stays in the worker, in `src/engine/types.ts`:

| Shape | Fields | Change |
|---|---|---|
| `PageInspection` | `findings: readonly PageFinding[]` (before the trim adds its two) · `readable: boolean` (holds a readable character) · `concealed: readonly ConcealedGlyph[]` | new, private to the engine |
| `ConcealedGlyph` | `origin: Point` (page space) · `kind: Concealment` | new |
| `TrimOutcome` | `removed: boolean` (a character or path trigger, or an image trigger on a pixel mode page; AC-8) · `picturesKept: boolean` (AC-15's fallback) · `pixelMode: boolean` (this page's pixels were blanked, which the self check's outside pixel rule reads) | new |
| `FoundMatch` | as spec 0005, plus `concealed: Concealment \| null` | gains `concealed` |
| `RedactionResult` | as spec 0004, plus `trim: readonly TrimOutcome[]`, one per page | gains `trim` |

On the main thread, `src/lib/session.ts`: `LiveSession.outputName` is set at `file-chosen` to `outputNameFor(name, false)` and again at `opened` to `outputNameFor(name, isPartly(summary))`; `retry` goes back to the first. No new field.

Relationships: a document has one `PageReading` per page; a reading has zero or more findings (a set); a `ReviewMatch` names its page, which is how the crooked scan line reads that page's findings; `pagesByFinding` is derived from `summary.pages`; a run's `trim` must equal what the summary's `off-page-content` and `off-page-picture` say, page by page.

**Page findings** (the rules; every share is counted on the `READING_GRID` points of the visible area; an image's footprint is its placement from `fillImage` or `fillImageMask` cut to the bounds of the clip in force; "a picture" is an image whose footprint holds at least `PICTURE_MIN_SHARE` of those points; "bare" means the boxes of text lines holding a readable character, visible or invisible, hold under `TEXT_OVER_PICTURE_MAX` of the picture's points; "readable" is AC-3's definition; covered and hidden are judged only for glyphs centred inside the visible area):

| Finding | Rule | Tone | Toward "nothing readable" | Name partly |
|---|---|---|---|---|
| `covered-text` | a glyph (fill or stroke) with at least `COVER_MIN_OVERLAP` of its box inside an opaque cover drawn after it (AC-6) | warning | no | yes |
| `hidden-text` | a glyph a viewer does not show, not covered, not machine read (AC-7) | warning | no | yes |
| `scanned` | no readable character and pictures holding at least `SCAN_MIN_SHARE` of the points; or fewer than `STAMP_MAX_CHARS` readable characters and bare pictures holding at least `SCAN_MIN_SHARE` | warning | yes | yes |
| `drawn-only` | no glyph of any kind, not `scanned`, not `blank` | warning | yes | yes |
| `unreadable-text` | a line with `UNREADABLE_RUN` or more U+FFFD or private use characters in a row, or glyphs drawn and no readable character | warning | when no readable character | yes |
| `bare-picture` | not `scanned`, and a bare picture | warning | no | yes |
| `off-page-picture` | the trim kept this page's pictures (AC-15) | warning | no | yes |
| `machine-read-text` | invisible text with its centre over an image drawn before or after it (AC-5) | note | no | no |
| `off-page-content` | the trim ran here for a character, a path, or an image on a pixel mode page (AC-8) | note | no | no |
| `blank` | draws no glyph, no image, and no path or shading contrasting with white paper (AC-2) | quiet | yes | no |

**Constants** (engine rules about pages, not caps; starting values, measured and recorded in the build):

| Constant | File | Starting value |
|---|---|---|
| `READING_GRID` | `inspect.ts` | 64 points a side |
| `PICTURE_MIN_SHARE` | `inspect.ts` | 0.05 of the visible area |
| `TEXT_OVER_PICTURE_MAX` | `inspect.ts` | 0.05 of the picture |
| `SCAN_MIN_SHARE` | `inspect.ts` | 0.5 of the visible area |
| `STAMP_MAX_CHARS` | `inspect.ts` | 40 readable characters |
| `UNREADABLE_RUN` | `inspect.ts` | 3 characters |
| `COVER_MIN_OVERLAP` | `inspect.ts` | 0.8 of the glyph's box |
| `HIDDEN_CONTRAST_MAX` | `inspect.ts` | 1.1 (WCAG contrast ratio) |
| `TINY_TEXT_MAX` | `inspect.ts` | 1 pt of em height after the text matrix |
| `TRIM_PIXEL_REACH` | `trim.ts` | 1 pt into the visible area |
| `IMAGE_CHECK_OPTIONS` | `pixels.ts` | `preserve-images,clip=no`, the self check's outside pixel read only; a third extraction setting beside the two that are never mixed |

**State transitions**: spec 0002's session machine is unchanged. `opened` also sets `outputName`. The open's phases are unchanged (`inspecting` now covers the reading and the trim). `failed` gains two kinds. The engine's open, now async and cancellable, becomes: door, open, password, page cap, layers, `prepareDocument`, `inspectPages`, the AC-10 refusal, `trimToVisibleArea`, detection. A run becomes: inventory, `prepareDocument`, `trimToVisibleArea`, validate targets, slant, images, record every page, the three passes, rebuild, write, self check.

**API surface** (messages and module functions; there is no HTTP endpoint):

| Surface | Kind | Key inputs | Key outputs | Access | Key errors |
|---|---|---|---|---|---|
| `open` (exists) | worker message | unchanged | `progress` (unchanged phases), then `result { summary, matches }` with `summary.pages` and `matches[].concealed` | the tool page, anonymous | adds `no-readable-text` (AC-10), `edge-text` (AC-16), `unsupported` for a page that throws while inspected (AC-11) |
| `redact` (exists) | worker message | unchanged | `redacted { output, outcome }` with `outcome.pagesByFinding` | the tool page | adds `edge-text`, `redaction-incomplete` from the new self check rules, `unsupported` when the trims disagree (AC-18) |
| `openDocumentWith(mupdf, bytes, limits, { onPhase?, isCancelled? })` | `src/engine/open.ts`, becomes async | adds `isCancelled` | `Promise<OpenDocument>` | the worker (through `openDocument`) and tests | adds `no-readable-text`, `edge-text`, `unsupported` (AC-11), `RunCancelled`; every test caller moves to `await` |
| `inspectPages(mupdf, pdf, isCancelled?)` | `src/engine/inspect.ts`, async | the prepared review copy | `readonly PageInspection[]` | `openDocumentWith` only | throws `EngineFailure("unsupported")` (AC-11), `RunCancelled` |
| `trimToVisibleArea(mupdf, pdf, isCancelled?)` | `src/engine/trim.ts`, async | a prepared copy | `readonly TrimOutcome[]` | `openDocumentWith` and `redactDocumentWith` | throws `EngineFailure("edge-text")` or `EngineFailure("unsupported")` by AC-16's rule, `EngineFailure("unsupported")` for a throw while the pass runs, `RunCancelled` |
| the AC-29 reach computation | `src/engine/pixels.ts` and `geometry.ts`, exported for the trim | one image's placement matrix, its pixel width and height, and one strip | the region MuPDF would blank and its reach into the visible area | `trim.ts` and the existing callers | none; a placement that cannot be inverted counts as reaching too far |
| `findMatchesIn(doc, pages, options)` | `src/engine/find.ts`, grows | the readable flags and concealed glyphs from `PageInspection` | `FoundMatch[]` with `concealed` | the engine | unchanged |
| `checkOutput(mupdf, output, record, targets, trim)` | `src/engine/self-check.ts`, grows | adds the run's `TrimOutcome[]` | unchanged | the engine | adds the two AC-17 rules |
| `Pipeline.trim` | `src/engine/redact.ts`, grows | default `trimToVisibleArea` | | tests only swap it | |
| `countPagesByFinding(pages)` | `src/worker/protocol.ts`, pure | `readonly PageReading[]` | `pagesByFinding` | the worker | none |
| `isPartly`, `pagesWith`, `pageList`, `warningLines`, `noteLines`, `showsCrookedLine` | `src/lib/page-findings.ts`, pure | the summary, and the matches for the last | booleans, page numbers, strings | the main thread | none |
| `outputNameFor(fileName, partly)` | `src/lib/session.ts`, grows | adds `partly: boolean` | the download name | the reducer | none |
| `ChecklistItem` | `src/ui`, grows | `concealedNote?: string` | the line in the row's description, the checkbox still enabled | callers | none |

**Value sourcing**:

| Action | Value produced / displayed | Source |
|---|---|---|
| open | each page's `findings` | `inspectPages` on the prepared review copy by the *Page findings* rules, plus `off-page-content` and `off-page-picture` from the review copy's `TrimOutcome` |
| open | the visible area | `page.getBounds()` on the prepared page (crop box within media box, page space) |
| open | glyph origin, colour, colour space, alpha, blend, clip, draw order | the callback `Device` pass (`fillText`, `strokeText`, `ignoreText`, `clipText`, `clipStrokeText`, `fillPath`, `strokePath`, `fillImage`, `fillImageMask`, `fillShade`, `clipPath`, `clipStrokePath`, `clipImageMask`, `popClip`, `beginGroup`, `endGroup`, `beginMask`, `endMask`, `beginTile`, `endTile`), run with `page.run(device, Matrix.identity)`; each glyph's origin from `Text.walk`'s `showGlyph` text matrix times the transform |
| open | a glyph's box | the quad of the ordinary mode character whose origin is within `POSITION_TOLERANCE` of the glyph's (AC-9) |
| open | a glyph's em height | the length of (text matrix times transform) applied to the unit upright vector |
| open | a cover's shape | `Path.walk`: one closed subpath of four corners, or five points whose last equals the first, level or upright in page space within `POSITION_TOLERANCE` |
| open | an image's opacity | `alpha` from `fillImage`, `Image.getMask()` returning null, no soft mask or restricting group open |
| open | an image's footprint | the unit square through `fillImage`'s or `fillImageMask`'s transform, cut to the bounds of the clip in force (the intersection of the open clips' bounds) |
| open | a colour's contrast | `ColorSpace.getType()` Gray, RGB or CMYK, converted to sRGB by fixed formulas, WCAG relative luminance |
| open | readable characters, unreadable runs, line boxes | the ordinary mode structured text read (`EXTRACTION_OPTIONS[0]`) through `walkCharacters` |
| open | `readable` per page | derived: the page holds a character that is not whitespace, not U+FFFD, not Cc and not Co (AC-3) |
| open | readable character count (the stamp cap) | derived: the count of readable characters on the page |
| open | `no-readable-text` | derived: every page is `scanned`, `drawn-only` or `blank`, or not `readable` |
| open | `matches[].concealed` | the match's character origins against `PageInspection.concealed`, within `POSITION_TOLERANCE` |
| open, run | whether a page is trimmed | the trim's own reads (AC-14): character quads from the ordinary mode read with `clip=no`, image footprints from its own device pass, path bounds from `Path.getBounds(null, ctm)` |
| open, run | the strips | the visible area and the bounds of everything the page draws (characters, footprints, paths, shadings through `Shade.getBounds()` and their transform, tiles by their area), grown by 1 pt, from the trim's own reads |
| open, run | pixel mode or kept | the AC-29 reach computation called on each crossing placement from the trim's device pass, against `TRIM_PIXEL_REACH` |
| open, run | the trim's proof | both `CHECK_EXTRACTION_OPTIONS` reads before the pass and on the page loaded afresh after it, matched as `comparePage` matches |
| run | the outside pixel rule | image blocks read through `IMAGE_CHECK_OPTIONS` on the reopened output, for pages whose `TrimOutcome.pixelMode` is true |
| run | `outcome.pagesByFinding` | `countPagesByFinding(session summary pages)` in the worker, after AC-18's comparison |
| run | the trim agreement | `result.trim[i]` against page `i`'s `off-page-content` and `off-page-picture` in the session's summary |
| review | the all clear line, warning lines, note lines, advice line | `src/lib/page-findings.ts`, copy under *Copy*, over `session.summary.pages` |
| review | page numbers in a line | the indexes of pages carrying that finding, plus one, formatted by `pageList` |
| review | the crooked scan line | derived: some match with `blocked === "slanted-text"` whose `page` reading holds `machine-read-text` |
| review | a row's concealed line | `CONCEALED_TEXT[match.concealed]` in `src/lib/page-findings.ts` |
| review | the coverage note and empty state wording | `isPartly(summary)` choosing between spec 0005's two lines and the qualified ones |
| complete | the download warning | the same warning lines, from the same summary |
| complete | the removed off page line | pages carrying `off-page-content` |
| download | the file name | `session.outputName`, from `outputNameFor(file.name, isPartly(summary))` at `opened` |
| failure | the refusal lines | `errorText` in `tool-client.tsx`, copy under *Copy* |
| feature 11 | page counts per finding | `outcome.pagesByFinding` |

**Page lists** (`pageList`): page numbers ascending; three or more consecutive pages become a range; parts joined with `Intl.ListFormat("en", { type: "conjunction" })`. One page reads "Page 2"; several read "Pages 2 and 5", "Pages 3 to 9" or "Pages 1, 3 to 9 and 12". Two consecutive pages stay a pair ("Pages 2 and 3").

**Copy** (plain; feature 8 may restyle it). `{Pages}` is a page list; each line has a one page and a many page form:

- All clear: "RedactNest can read the text on every page."
- Warning title at open: "Some pages can't be fully checked".
- `covered-text`: "{Pages} has text hidden under a box or shape drawn over it. It may look redacted, but the text is still in the file." / "{Pages} have text hidden under …"
- `hidden-text`: "{Pages} has text you can't see, such as text the same colour as the page. It is still in the file." / "{Pages} have text …"
- `scanned`: "{Pages} is a scanned image. Text in the image can't be found or removed." / "{Pages} are scanned images. Text in the images can't be found or removed."
- `drawn-only`: "{Pages} has no text RedactNest can read. Anything on it, such as words in a picture or drawn as shapes, can't be found or removed." / "{Pages} have no text RedactNest can read. Anything on them, …"
- `unreadable-text`: "{Pages} has text in a font RedactNest can't read, so that text can't be found or removed." / "{Pages} have text …"
- `bare-picture`: "{Pages} has a picture with no text over it. Words inside a picture can't be found or removed." / "{Pages} have pictures with no text over them. …"
- `off-page-picture`: "Part of a picture on {pages} lies outside the visible page and couldn't be cleared, so it is still in the file." (the list lowercased after "on")
- Advice: "If you have the original, run it through text recognition (OCR) first, then open the result here."
- `machine-read-text`: "{Pages} is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right." / "{Pages} are scans with machine read text. …"
- `off-page-content` at open: "{Pages} has content outside its visible area. RedactNest removes it when you redact, since nobody can see it." / "{Pages} have content outside their visible area. …"
- Crooked scan: "Some items on scanned pages can't be removed because the scan is slightly crooked. Straightening the scan before text recognition (OCRmyPDF's `--deskew` option, for one) usually fixes this."
- Download warning title: "Not every page was checked"; its body is the warning lines, then: "That is why the file's name ends in partly redacted."
- `off-page-content` at complete: "Content outside the visible area of {pages} was removed."
- Row, `covered`: "Hidden under a box on the page." Row, `hidden`: "Not visible on the page."
- Coverage note, qualified: "RedactNest looked for {nouns} on the pages it could read. Anything else, such as names and addresses, stays in the file."
- Empty state helper, qualified: "RedactNest found no {nouns} on the pages it could read. Redact still makes a cleaned copy, with metadata and hidden content removed."
- `no-readable-text`: "RedactNest can't read any text in this PDF. It looks like a scan, or its text is in a form RedactNest can't read, so nothing could be found and no file was made. If you have the original, run it through text recognition (OCR) first, then open the result here."
- `edge-text`: "This PDF has text at the edge of a page that RedactNest can't remove cleanly, so it can't be redacted and no file was made."

**Key invariants**:

- **INV-1**: Only closed kinds cross the boundary for this feature. No finding carries text, a position, a colour or a count of characters (spec 0002, INV-2 and INV-4).
- **INV-2**: Every opened document has a reading for every page, and the refusal is decided from those readings before anything else happens. An inspection that cannot finish fails the open; it never reports fewer findings.
- **INV-3**: The trim runs on both copies through the same function, right after `prepareDocument`, so detection, target validation and the record all read the same trimmed page (spec 0004, INV-9).
- **INV-4**: The trim never removes a character whose quad lies wholly inside the visible area and never leaves one centred outside it. It proves both on every page it touches before any later step runs, and the self check proves the second again on the output, with the outside pixels, whatever is ticked.
- **INV-10**: Every MuPDF object a device callback receives with a kept reference is destroyed before the callback returns, and nothing a callback receives is held past it (spec 0004's rule that garbage collection never reclaims MuPDF's native memory).
- **INV-5**: The file name, the download warning, the coverage note's qualifier and `pagesByFinding` all come from the same summary through pure helpers, so none can contradict another.
- **INV-6**: A run's trim decisions equal the open's, or the run hands back no file (AC-18).
- **INV-7**: The thresholds are engine constants, never config, each commented as a rule about pages. An environment variable could switch a warning off.
- **INV-8**: Inspection holds document text inside the engine only, for one page at a time, and keeps nothing past the open but findings, readable flags and concealed glyph origins, all dropped with the review document.
- **INV-9**: The heuristic findings (`bare-picture`, `hidden-text`'s colour rule, `covered-text`'s cover shapes) may miss a case, and each miss is a recorded limit. The safety rules (`no-readable-text`, the trim's proof, the self check) fail closed: a measure that cannot be made refuses.

**Security model**: an anonymous visitor, one tab, no account and no server call; the same for the free and paid tiers. Everything this feature reads is document content, and none of it leaves the device or the worker except as closed kinds. Findings help the visitor avoid forwarding a file that still holds text they cannot see, which is the fake redaction case the product exists to prevent. Every string shown is React text (spec 0003, INV-7).

**Configuration required**: no new environment variables. The constants live in `src/engine` (INV-7).

**Lint zones**: no change. `src/lib/page-findings.ts` sits in the existing lib zone and imports only types from `@/worker/protocol`.

**Critical test scenarios**:

- Happy path: a document with a typed page, a scanned page and a page with a pasted ID card opens; the card names page 2 as scanned and page 3 as having a picture, with the advice line; the visitor ticks, redacts and downloads `name-partly-redacted.pdf`, and the outcome card repeats both lines above Download. Verifies **AC-2**, **AC-4**, **AC-20**, **AC-22**, **AC-23**.
- All clear: a typed document opens with "RedactNest can read the text on every page." and downloads as `name-redacted.pdf`. Verifies **AC-19**, **AC-23**.
- Refusal: all scans, all blank, a stamped scan, a document wholly in an unmapped font, a document wholly in a private use font, and a mix of those each fail the open with `no-readable-text`; a stamped scan with one typed page opens; a slide deck whose every slide is a full bleed photo with a title and bullets opens, each slide `bare-picture`. Verifies **AC-2**, **AC-3**, **AC-10**.
- Word's blank page: a page holding only a white rectangle over the whole page is `blank`, with no warning and the plain name; a page holding only a small logo is `drawn-only`. Verifies **AC-2**.
- Cropped picture: a headshot clipped to a frame of 3% of the page from a photo placed at full page size is not a picture. Verifies **AC-4**.
- OCR in either order: an OCR page whose invisible text is drawn before its scan image, and one drawn after, are both `machine-read-text` and neither is `covered-text` or `hidden-text`. Verifies **AC-5**.
- Refusal on screen: opening `read-scans.pdf`, and a document the trim refuses with `edge-text`, each shows its `errorText` line in the failure callout, announced once as an alert, with no checklist, no Redact and no Download, and Start over still working. Verifies **AC-26**.
- Page throws: a page MuPDF cannot load fails the open with `unsupported`. Verifies **AC-11**.
- Each finding: one fixture page per rule and per near miss (*Build plan*, fixtures) gives exactly the expected findings. Verifies **AC-1** to **AC-8**.
- Fake redaction: a black rectangle drawn over an email, a white rectangle over a phone number, a black rectangle inside a plain group (normal blend, full alpha) over a name, and a baked Square annotation over a name each give `covered-text`; the email and phone rows carry `concealed: "covered"`, tick, redact and are gone from the output; a strikethrough, an underline, a translucent highlight, a rectangle rotated 10 degrees (the recorded limit), a cover inside a group at alpha 0.5 and a cell background drawn first give nothing. Verifies **AC-6**, **AC-13**, **AC-24**.
- Hidden text: white text on white, invisible text with no image, zero opacity text, clip only text with nothing painted inside it, text clipped away inside a cell, and 0.5 pt text each give `hidden-text`, with the email among them carrying `concealed: "hidden"`; white text on a dark rectangle drawn first, a heading in clip mode filled with a gradient, grey text in a spot colour (not judged), OCR text over a scan, and a slug line outside the crop box give nothing of the kind. Verifies **AC-7**, **AC-13**.
- Device memory: inspecting the same 50 page document ten times leaves MuPDF's heap within a fixed margin of where it started. Verifies **AC-9**, **INV-10**.
- Trim foundation pins: Redact areas outside the crop box, below the media box and left of the page remove every glyph there; glyphs whose extracted quad ends 0 and 0.5 pt inside each edge survive, in Helvetica, Courier, Times and embedded Carlito. Verifies **AC-14**, **AC-16**.
- Trim, text: a page cropped to its top half with an email below the crop, a line below the media box, and a glyph straddling the crop edge opens with `off-page-content`; the email is never a row; with nothing ticked, the output extracted with `clip=no` holds none of the off page text and every glyph wholly inside at its place. Verifies **AC-14**, **AC-16**, **AC-17**.
- Trim, pictures: a cropped upright scan at 150 pixels per inch is blanked outside the crop, including an image placed wholly outside the page, and the self check's outside pixel rule sees both; a 4 by 4 pixel colour band stretched into the bleed and a picture drawn at 30 degrees across the edge are kept, with `off-page-picture` and the partly name. Verifies **AC-15**, **AC-17**, **AC-23**.
- Trim refuses: a line crossing the crop edge with a size change (`Tf`) between its outside and inside glyphs fails the open with `edge-text` (MuPDF moves the text after removed glyphs, spec 0004's recorded quirk); a trimmed page that also shows a line with `'` inside the visible area fails with `unsupported`. Verifies **AC-16**.
- Self check sees it: the pipeline with `trim` skipped, over the cropped page, fails the run with `redaction-incomplete`, with nothing ticked as well as with a tick. Verifies **AC-17**.
- Agreement: a run whose trim is swapped to report a different outcome is posted as `unsupported` and its output dropped. Verifies **AC-18**.
- Crooked line: a match blocked `slanted-text` on a `machine-read-text` page shows the crooked line; the same block on a born digital page does not. Verifies **AC-25**.
- Accessibility: the review state with warnings and notes passes axe, the keyboard walk and forced colours; the callouts read their tone words. Verifies **AC-27**.
- Privacy: the instrumented browser run from spec 0002 over a flagged document finds no text, finding detail or page content in any request, store or log; the loggable gate holds the new shapes. Verifies **AC-28**.
- Cancel and cost: a cancel during inspection of the 50 page document posts nothing within one page; inspection plus trim on it stays within 2 seconds of CPU in the unit project; the 50 page cropped scan's open cost, run cost, output size and peak are recorded. Verifies **AC-29**.
- Real scans: AC-30's manual steps. Verifies **AC-30**.

## Build plan

Ordered by Skateboard. Slice 1 is the thinnest usable whole and is exactly the scope's "done when": scans are named at open and at download, the file says partly redacted, and a document with nothing readable is refused. It replaces `pagesWithText` in one move, so no second shape lives beside it. Slice 2 names the partial blind spots. Slice 3 names text a viewer never shows, which is where a fake redaction hides. Slice 4 changes the GA engine's pipeline and so comes after the reading is settled. Slice 5 runs the real scans.

**Slice 1: scans named, and no file for a document with nothing readable**

1. Grow `src/worker/protocol.ts`: `PAGE_FINDINGS` (all ten members, so the union is whole from the start), `PageReading`, `DocumentSummary.pages` replacing `pagesWithText`, `RedactionOutcome.pagesByFinding` replacing `pagesWithoutText`, `countPagesByFinding`, the two error kinds, and the loggable gate. Satisfies **AC-1**, **AC-28**.
2. `src/engine/inspect.ts` with `inspectPages`: the callback `Device` pass (run with `Matrix.identity`, every kept object destroyed in its callback) and the ordinary mode read per page, the grid, image footprints cut to the clip in force, readable characters by AC-3's definition, the stamp count, and the `scanned`, `drawn-only`, `blank` (with its contrast test for paths and shadings) and `unreadable-text` rules; a yield and cancel check per page; a throw on a page is `unsupported`. Pin in a test that MuPDF.js 1.28.1 reports invisible text through `ignoreText`, image placements through `fillImage`'s transform, U+FFFD for an unmapped glyph in the ordinary read, and that ten inspections of one document leave the heap flat. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**, **AC-11**, **AC-29**, **INV-10**.
3. Make `openDocumentWith` async with `{ onPhase, isCancelled }`, and have the worker pass `() => cancelled.has(id)`; move every test caller to `await`. Wire the open: inspect after `prepareDocument`, refuse with `no-readable-text` per AC-10, keep the inspections in the handle, and read only readable pages in `findMatchesIn`. Remove `pageHasText`. Satisfies **AC-10**, **AC-12**, **AC-29**.
4. The worker: `outcome.pagesByFinding` through `countPagesByFinding`. Update `engine-worker.test.ts` and `worker-client.test.ts`. Satisfies **AC-28**.
5. `src/lib/page-findings.ts` (tones, `isPartly`, `pagesWith`, `pageList`, the copy for all findings) with unit tests, and `outputNameFor(fileName, partly)` set at `opened`, with the reducer tests. Satisfies **AC-20**, **AC-23**.
6. `tool-client.tsx`: the all clear line or the warning callout in the opened document card, the download warning in the outcome card above Download, the two `errorText` lines, and the coverage note and empty state qualifier in `review-checklist.tsx` and `src/lib/detectors.ts`. Update `tool-client.test.tsx`, `engine.spec.ts` and spec 0003's `verify.md` step that expects the text layer line. Satisfies **AC-19**, **AC-20**, **AC-22**, **AC-26**, **AC-27**.
7. Fixtures through `scripts/make-fixture.mjs` (`scripts/lib/reading-fixtures.mjs`), each page small: an image only page, a stamped scan (a full page image and a Bates number), a page of outlined shapes, a page holding only a lone small logo, a blank page, a page holding only a white rectangle over the whole page (the way Word and Chrome draw one), a page in an unmapped font, a page in a private use font, a page with one unmapped bullet among typed text, and the documents `read-scans.pdf` (all scans), `read-blank.pdf`, `read-stamped.pdf`, `read-unmapped.pdf`, `read-mixed.pdf` (a typed page, a scan, a blank page). Engine tests for each rule and for the refusal. Satisfies **AC-2**, **AC-3**, **AC-10**.
8. Browser: `design-system.spec.ts` over `read-mixed.pdf` (axe, keyboard, forced colours), and `privacy.spec.ts` over it. Satisfies **AC-27**, **AC-28**.

**Slice 2: pictures, OCR and the crooked scan**

9. The `bare-picture` and `machine-read-text` rules, the stamped scan's share rule measured against the fixtures, and the note callout. Satisfies **AC-4**, **AC-5**, **AC-21**.
10. The crooked scan line (`showsCrookedLine`). Satisfies **AC-25**.
11. Fixtures: a pasted ID card on a typed page, a small logo, a large photo, a headshot clipped to a small frame from a full page photo, a slide deck whose every slide is a full bleed photo with a title and bullets, an OCR scan written the way Tesseract writes its layer (the existing OCR fixture pattern), the same written text first and image second (ABBYY's order), a sparse OCR page, and a slanted OCR match beside a slanted born digital match. Record the measured values of `PICTURE_MIN_SHARE`, `TEXT_OVER_PICTURE_MAX`, `SCAN_MIN_SHARE` and `STAMP_MAX_CHARS` in this spec. Satisfies **AC-2**, **AC-4**, **AC-5**, **AC-10**, **AC-25**.

**Slice 3: text a viewer never shows**

12. `CONCEALMENTS`, `ReviewMatch.concealed`, `FoundMatch.concealed`, and the covered and hidden rules in `inspect.ts`: the draw order stack of covers, groups (a plain one passes a cover through), soft masks and clips; the rectangle test; the glyph box from the matched character's quad and the em height from the text matrix; colour judged by `ColorSpace.getType()` with every paint counted; clip only text judged against what is painted inside its clip; only glyphs centred inside the visible area. Pin that a glyph mapped to several code points gives extra `showGlyph` calls at the same origin, and that device and extraction origins agree within `POSITION_TOLERANCE`. Satisfies **AC-6**, **AC-7**, **AC-9**, **AC-13**, **AC-28**.
13. `concealedNote` on `ChecklistItem` with component and axe tests, and the row lines in `review-checklist.tsx`. Satisfies **AC-24**, **AC-27**.
14. Fixtures `read-covered.pdf` and `read-hidden.pdf`, with every case and near miss in the critical scenarios (the plain group cover, the rotated rectangle, the half alpha group, the gradient filled clip heading, the spot colour grey text, the slug line outside the crop box among them); engine tests including a concealed match that redacts and passes the self check. Record `COVER_MIN_OVERLAP`, `HIDDEN_CONTRAST_MAX` and `TINY_TEXT_MAX` as measured. Satisfies **AC-6**, **AC-7**, **AC-13**.

**Slice 4: nothing outside the visible area survives**

15. First, the foundation pins in `tests/unit/trim.test.ts`: MuPDF.js 1.28.1's default read drops characters outside the crop box; Redact areas outside the crop box, below the media box and left of the page remove every glyph there; a straddling glyph goes; glyphs whose extracted quad ends 0 and 0.5 pt inside each edge survive in Helvetica, Courier, Times and embedded Carlito. If any pin fails, stop and bring the measurement back to `/architect`. Then `src/engine/trim.ts` with `trimToVisibleArea`: its own device pass (objects freed as in AC-9) and `clip=no` read for the triggers and placements, the four strips with full height sides, the AC-29 reach computation exported from `pixels.ts` and `geometry.ts` and called per placement, the pixel or kept choice, the pass with all four `applyRedactions` arguments written out and no Redact annotation left after it, and the text proof on the page loaded afresh, with `edge-text` or `unsupported` by AC-16's rule. Satisfies **AC-14**, **AC-15**, **AC-16**, **INV-4**, **INV-10**.
16. Wire it: into `openDocumentWith` after the refusal (adding `off-page-content` and `off-page-picture` to the summary), into `redactDocumentWith` after `prepareDocument` through `Pipeline.trim`, `RedactionResult.trim`, `IMAGE_CHECK_OPTIONS` and the two self check rules in `checkOutput` (both `redaction-incomplete` whatever is ticked), and the worker's agreement check. Update the pipeline order comments in `redact.ts`, the worker's "never redacted" comment, and the INV-9 and INV-11 wording in spec 0004 and `src/engine/AGENTS.md` as *Amends* says. Satisfies **AC-8**, **AC-14**, **AC-17**, **AC-18**, **INV-3**, **INV-6**.
17. The off page note at open and the removed line at `complete`, the `off-page-picture` warning line, and a component test that an `edge-text` open shows its refusal line with no Redact or Download. Satisfies **AC-21**, **AC-22**, **AC-23**, **AC-26**.
18. Fixtures `trim-text.pdf` (crop to the top half, an email below it, a line below the media box, a straddling glyph), `trim-scan.pdf` (a cropped upright scan at 150 pixels per inch, and an image placed wholly outside the page), `trim-kept.pdf` (a stretched colour band in the bleed and a picture at 30 degrees across the edge), `trim-refused.pdf` (the `Tf` change across the edge, and a trimmed page with a `'` line inside the visible area). Engine tests for each, the pipeline with the trim skipped (ticked and not), and the swapped trim for AC-18. Measure the 50 page text document and a 50 page cropped scan at 300 pixels per inch, both built inside the test rather than committed, and record the costs, output size and peak. Record `TRIM_PIXEL_REACH` as measured. Satisfies **AC-14** to **AC-18**, **AC-29**.

**Slice 5: real scans**

19. Make the scans AC-30 describes, keep them out of git, and run `/check verify` for this feature, ticking specs 0004's and 0005's **(after feature 7)** steps in their `verify.md`. Satisfies **AC-30**.

## Consequences

**Positive**:
- A scan, a stamped scan and a document with nothing readable can no longer leave as a file that looks redacted and is not; the first two are named on every screen and in the file name, the last is refused.
- A fake redaction a visitor received is named before they forward it, and an email under the fake box is listed, marked, and removable.
- Text and scan pixels hidden by a crop no longer ride along in a redacted file.
- The file name carries the caveat wherever the file goes.
- `pagesByFinding` tells feature 11 which blind spot is common, without a word of content.

**Negative / tradeoffs**:
- Every open reads each page twice more (one device pass, one ordinary read), and a page with anything outside its visible area pays a pass and two unclipped reads at open and again in every run. AC-29 bounds the total.
- The heuristic findings will misfire sometimes: a brochure photo is a `bare-picture`, a photo book whose captions are each under 40 characters is refused as `scanned`, and a born digital page with a 0.5 pt legal line is `hidden-text`. Each errs toward saying too much.
- Some hidden text is missed: covers that are not rectangles or are rotated, images with transparency, spot colour, Indexed and Lab text, text over a picture, a shading or a group in the picture's own colour, clips judged by their bounds, and a vector shape outside the page that spans two strips. Recorded limits (INV-9).
- Blanking a cropped scan encodes its page image afresh in every run, with nothing ticked too, so the output of a cropped scan can be several times the source's size and a run's peak memory rises. AC-29 measures both at the paid cap before this ships.
- A file whose lines are shown with `'` or `"` now fails at open, as `unsupported`, when one of its pages is trimmed, where before it opened and failed at Redact. Same outcome, reached sooner.
- A glyph straddling the crop edge is removed whole, so a character cut by the edge disappears from the visible page even when nobody ticked it.
- A page where blanking would reach more than 1 pt into the visible area keeps all its pictures, including hidden parts that may hold content; it is warned about and named partly, not cleaned.
- The trim touches a GA engine: a new step in a fixed pipeline, two self check rules, and a new refusal (`edge-text`). A file with a size change across the crop edge, which ran before, is now refused.
- "Partly redacted" in a file name may alarm a recipient of a document that was, in the visible pages, fully redacted.

**Neutral**:
- `pagesWithText` and `pagesWithoutText` leave the protocol; every reader moves in slice 1.
- `DocumentSummary` stays loggable; `ReviewMatch` stays out of `LoggablePayload`.
- The thresholds start as judgements and become measured values, the same path spec 0004's geometry took.

## Follow-up

- [ ] Record the measured values of every constant in the *Constants* table, with the fixtures and scans behind them, in `rationale.md`, and update the table (slices 2 to 4).
- [ ] When built, tick spec 0004's Follow-ups on text a viewer does not show, on the document with no text layer and on the crooked scan, noting that they are met by this spec; and reword spec 0005's AC-12 and spec 0003's opened card Value sourcing row as *Amends* says.
- [ ] Record for root `AGENTS.md` and `src/engine/AGENTS.md` (owned by `/sync`): the pipeline order with the trim, the trim running wherever `prepareDocument` runs, `inspect.ts` and `trim.ts` and their constants as rules rather than caps, the two new error kinds, the third extraction setting `IMAGE_CHECK_OPTIONS` beside the two that are never mixed, the device callback ownership rule (INV-10), the reworded INV-9 and INV-11, and the pins added in slices 1, 3 and 4.
- [ ] Measure whether inspection's ordinary mode read can be kept for detection on pages the trim did not touch, which would save one read per page at open. It needs INV-8 to allow a page's characters to live until detection reads them; bring it to `/architect` with the numbers if AC-29's cost is close to its limit.
- [ ] Feature 8 owns the final wording and placement of the warnings, notes, download repeat, row lines and the two refusal lines (`no-readable-text`, `edge-text`), and must keep the download warning beside the Download action and keep each refusal saying why no file was made. Its `unsupported` copy must also allow for a trim proof that failed away from the edge (AC-16), beside the causes spec 0004's Follow-up already lists for it.
- [ ] Feature 14 (manual rectangles) is the answer for a scanned page's content; when it ships, the `scanned` and `bare-picture` lines should point to it for paid visitors.
- [ ] Feature 16's security page describes the trim, the fake redaction warning and the limits in INV-9 accurately.
- [ ] Feature 11 logs `pagesByFinding`; count `no-readable-text` and `edge-text` refusals, and bring the thresholds back to `/architect` if `bare-picture` or `hidden-text` fire on most documents.
- [ ] Revisit clearing pictures that cross the edge on a page that keeps them (AC-15's fallback), once feature 11 shows how often it happens: a per image pixel edit would need a decision against spec 0004's INV-13.
