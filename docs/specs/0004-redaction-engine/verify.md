# Verify: Redaction engine · spec 0004 · 2026-09-25

_Steps derived from spec 0004's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`), because the content security policy is looser in development and the redaction has to be proved under the real one.

Feature 6 has not been built, so nothing can be ticked in the browser yet. A run from the page cleans the file and removes nothing, and every step below that needs a ticked match is proved at the engine in the Commands section instead. Those browser steps are marked **(after feature 6)**.

Several steps open the output in a second reader. Use at least two of: Acrobat Reader, a browser's built in PDF viewer, and `mutool show` (MuPDF's command line). A reader that is not MuPDF matters here, because the rebuild and `sanitize` are only as good as other software's reading of them.

## UI / manual

- [ ] Open the two page fixture → a **Redact** button appears under the counts → AC-19
- [ ] Press **Redact** → the phases read in order, ending on the self check, then a one line outcome ("Removed 0 items", and what was stripped) and a **Download** button appear → AC-16, AC-19
- [ ] Press **Download** → the file is offered as `two-pages-redacted.pdf`, the button goes, the outcome line stays, and **Start over** still shows → AC-19, AC-20
- [ ] Open the downloaded file in two readers → both pages render as before, with no bookmarks panel, no attachments panel, no comments and no form fields → AC-7, AC-9
- [ ] In the second reader, open document properties → no title, author, subject, keywords, creator, producer or dates carried from the source → AC-7
- [ ] Open the metadata fixture → the counts appear, and the hidden annotation it carries is nowhere in the page text; redact and download, open the output in two readers → form answers and typed comments still show as page content, nothing is fillable or clickable, the hidden annotation never appears, and the text under the Redact mark the fixture already had is still there → AC-7, AC-8, AC-22
- [ ] Choose a PNG renamed to `photo.pdf` → refused with the "not a PDF" line, and devtools Network shows `/engine/mupdf-wasm.wasm` was never fetched if this was the first file → AC-1
- [ ] Choose a `.txt` renamed to `.pdf`, then a `.docx` renamed to `.pdf` → both refused the same way → AC-1
- [ ] Choose the layered fixture → refused with the layers line before any counts appear → AC-3
- [ ] Choose each owner password fixture (RC4, AES-128, AES-256) → each opens without a password prompt; redact and download → each output opens in a second reader with no password and shows no security restrictions in its properties → AC-10
- [ ] With devtools Console open and "All levels" on, open a damaged PDF, then open and redact the metadata fixture → no line from MuPDF appears → AC-24
- [ ] In devtools, override `GET /api/entitlement` to return a paid snapshot, open the heavy 50 page fixture, press **Redact**, then **Cancel** at once → back on the counts with **Redact** showing and no **Download** → AC-17, AC-19
- [ ] With the same override, press **Redact** on the heavy fixture, then choose the two page fixture while it runs → the two page fixture opens, and no outcome or **Download** from the first file ever appears → AC-20, AC-23
- [ ] After a run, press **Start over** before downloading → the idle drop area, and no **Download** anywhere; choose the same file again and the page shows a fresh review, not the old result → AC-20
- [ ] In devtools, terminate the `redactnest-engine` worker while **Download** is showing → the lost message, and after **Try again** no **Download** appears until a new run completes → AC-20
- [ ] **(after feature 6)** Tick a match, redact, download, open the output → a black box where the match was, no wider than the match and no taller than its own line; select all text in the reader and paste it somewhere → the match is absent and its neighbours are present → AC-4, AC-6
- [ ] **(after feature 6)** In a single spaced document, tick a match in the middle of a paragraph and redact → the lines above and below read exactly as before, in the reader and when pasted → AC-4, AC-6
- [ ] **(after feature 6)** Run a real scan through OCRmyPDF, open it, tick a match that has descenders (a name with a g, j, p, q or y), redact and download → in the output, no ink of the match shows around or below the box when the image is viewed on its own (for example after `mutool extract`), and the lines around it are still readable → AC-5, AC-13
- [ ] **(after feature 6)** Redact with two ticks, download, untick one, redact and download again → the second file shows the unticked match in plain text → AC-11

## Commands

- [ ] `pnpm test -- redaction` → the engine suite passes against real MuPDF in Node, including every fixture in the geometric matrix, the single spacing pair, the shared resource case and the misaligned OCR case, and every redacting fixture passes its own character comparison → AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-13, AC-15, AC-22
- [ ] In the engine suite, the self check tests → with the text pass skipped, with the padded pass skipped on an OCR page, and with the carrier sweep skipped, each fails with `redaction-incomplete`; removal on the exact quads over the single spacing fixture, the neighbour kerned 300 thousandths into the target, the diagonal watermark and the superscript under a box each fail with `redaction-overreach`; the replacement text fixtures wider than the match (inline, UTF-16, named) each fail with `replacement-text`; a forced difference on a run with no targets fails with `unsupported`; none returns output → AC-13, AC-14, AC-25, AC-26
- [ ] In the engine suite, the target validation tests → a target shifted a line down, one on the wrong page, and one with a crossed or too short quad each fail with `unsupported`, and nothing on the page changed → AC-27
- [ ] In the engine suite, the shared form XObject drawn on pages 1 and 3 with only page 1 ticked → the run passes and page 3 keeps its text, because MuPDF redacts per drawing → AC-5, AC-13
- [ ] In the engine suite, the combining mark and the form XObject drawn twice on one page → the results match what spec 0004 records: `Renée` removed, `José` refused with `redaction-incomplete`, the second drawing kept → AC-5
- [ ] In the engine suite, the refusal tests → a PNG, a text file and a docx are `not-pdf` without the engine loading; a marker starting at offset 1020 is `not-pdf` and one at 1019 opens; the layered fixture is `hidden-layers` → AC-1, AC-2, AC-3
- [ ] In the engine suite, the log test → MuPDF's warnings reach a recording log when one is installed, and nothing reaches `console` with the no op in place → AC-24
- [ ] `pnpm test -- engine-worker` → phases arrive as `redacting`, `writing`, `verifying`; a cancel between pages, during the write, during the self check and while queued each post nothing; a run requested behind a cancelled one starts only after it settles; an `open` mid run cancels the run and waits for it before parsing; any engine throw posts exactly one `error` → AC-14, AC-16, AC-17, AC-18, AC-23
- [ ] `pnpm test -- tool-client` → the buttons and the outcome line follow the states, Download clears the held output and disappears, a tick change, start over, replacement and a lost worker each clear it, and a stale redact reply is ignored → AC-19, AC-20
- [ ] `pnpm test:e2e privacy.spec.ts` → the redaction leg passes: open, redact, download, with nothing written and no http or https request carrying document data → AC-21
- [ ] `pnpm test:e2e engine.spec.ts` → the real engine redacts the metadata fixture in the worker, and the downloaded file opened in Node carries none of the AC-7 kinds; the quiet console check passes; the cancel test asserts its cancel landed during `redacting` → AC-7, AC-17, AC-19, AC-24
- [ ] `mutool show <output>.pdf trailer` and `mutool show <output>.pdf Root` → the trailer has no `/Info` and no `/Encrypt`, and the catalog holds only `/Type`, `/Pages` and `/Lang` → AC-7, AC-13
- [ ] `mutool show <output>.pdf pages`, then each page object → only allowlisted keys, and a page that had `/Group` in the source still has it → AC-7, AC-9
- [ ] `mutool clean -d <output>.pdf plain.pdf`, then search `plain.pdf` for a removed target in plain and UTF-16BE form → no hit → AC-4
- [ ] Add a `string` field to a member of `LoggablePayload`, run `pnpm typecheck` → it still fails, with the six new kinds in the union → spec 0002 AC-8
- [ ] `grep -rn "PDF_HEADER_WINDOW\|TARGET_PADDING_RATIO\|TARGET_PADDING_ALONG_RATIO\|REMOVAL_BAND_RATIO\|REMOVAL_INSET_RATIO\|LINE_BOX_TOP\|LINE_BOX_BOTTOM\|MIN_QUAD_SIDE\|BOUNDS_REACH_RATIO\|POSITION_TOLERANCE\|LINE_ANGLE_TOLERANCE\|LINE_HEIGHT_MIN\|LINE_HEIGHT_MAX\|EXTRACTION_OPTIONS" src/` (which also matches `CHECK_EXTRACTION_OPTIONS` after slice 5) → each declared once in `src/engine`, with a comment naming it as a deliberate exception to the caps rule, and read rather than repeated as a literal; `EXTRACTION_OPTIONS` is also what the Vitest target helper imports → value sourcing: header verdict, removal band, line box, padded area, target verdict, slant verdict, ticked characters, match tolerance, extraction options
- [ ] `grep -rn "dehyphenate\|collect-styles\|accurate-bboxes" src/engine` → no hits → value sourcing: extraction options
- [ ] `grep -n "applyRedactions" src/engine/*.ts` → exactly three call sites, each with all four arguments written out → AC-4, AC-6, INV-5
- [ ] In `tests/unit/redaction-matrix.test.ts`, the angled text case → text drawn at 30 degrees is refused with `slanted-text` before any pass runs, and no `todo` for it remains (after slice 4) → AC-28
- [ ] In the same file, the combining mark cases → a mark inside the match (`Renée`) is removed with it; a mark drawn at zero width on the match's last letter (`José`) survives past the band's pulled in end, and the run refuses with `redaction-incomplete` → AC-5, AC-13
- [ ] In the same file, the form drawn twice on one page with its first drawing ticked → MuPDF redacts each drawing apart, so the second keeps its text at its own place, and the form drawn on pages 1 and 3 keeps page 3's copy → AC-5, AC-13

### Slanted targets and images blanked too far (spec 0004, slice 4, built)

- [ ] `pnpm test -- redaction-geometry` → the bounds reach is 0 for a rectangle at 0, 90, 180 and 270 degrees, equals the padded area's longer side times `|sin 2θ| / 2` on a rotated rectangle and `0.75 × sin 2s` of the height on a sheared quad (0.305 at a shear of 0.2126); `isTooSlanted` turns true just past `BOUNDS_REACH_RATIO` (0.1) and is true for a quad with a `NaN` corner; `blankedRegion` matches the padded area's bounds on an aligned upright image and grows with rounding and rotation otherwise → AC-28, AC-29, value sourcing: slant verdict, image reach verdict
- [ ] `pnpm test -- redaction-matrix` → in Helvetica, `Jeremy Quigley` drawn at 1 degree (reach 0.092) redacts at 12pt and 14pt leading and passes its own checks; the same at 1.5 degrees (0.138), the 30 degree fixture, and the line set level with a 12 degree shear (0.305) each fail with `slanted-text` with the spy passes never called; the block rotated whole to 90 and to 180 degrees redacts; a level match joined from 12pt then 11pt, as two text objects, redacts → AC-5, AC-28
- [ ] In the same file, precedence → a slanted target on page 1 with a mismatched target on page 2 fails with `unsupported`; a slanted target with a level one over an image drawn at 30 degrees fails with `slanted-text` → AC-27, AC-28, AC-29
- [ ] In the same file, images under a target → a level match over an image drawn at 30 degrees, and over an 8 by 8 image stretched to 200 pt, each fail with `redaction-overreach` before any pass; over an upright image at 4 pixels per point it redacts; `images-under.pdf`, now at 4 pixels per point, still comes out blank under both matches or fails with `redaction-incomplete` → AC-13, AC-29
- [ ] In the same file, the bounds pin over `bounds-pin.pdf` → at 30 degrees every image pixel inside the area's bounds is blanked and none outside; the squares at two bounds corners are removed and the one outside is kept; the bar across two areas is kept in one annotation and in two, and removed by one 100 pt area; after the box pass a render is black at the centre and white at a bounds corner; on the rotated and coarse image pages every blanked pixel lies inside `blankedRegion`'s quad and some lie past the padded area → AC-28, AC-29, INV-15
- [ ] In `tests/unit/redaction-check.test.ts`, a target whose quad is a trapezoid 4 pt wide at the top and 24 pt at the bottom fails with `unsupported` → AC-27
- [ ] `grep -n "isTooSlanted\|imagesWithinReach\|boundsReach\|BOUNDS_REACH_RATIO" src/engine/*.ts` → declared in `geometry.ts` and `pixels.ts`, called in `targets.ts` after the AC-27 checks (slant first, then images), and exported from `index.ts` → AC-28, AC-29
- [ ] `grep -rn "textPass\|paddedPass\|boxPass" src/ --include=*.ts --include=*.tsx` → called only from `src/engine/redact.ts` (declared in `passes.ts`, listed in `index.ts`), so nothing reaches a pass without `validateTargets` → AC-28, AC-29, INV-15
- [ ] `pnpm test -- protocol` → `slanted-text` is the last member of `ENGINE_ERROR_KINDS`, and the ordered list in the test matches → AC-28
- [ ] `pnpm test -- tool-client` → `slanted-text` renders "A ticked item is set at an angle too steep to redact safely, so no file was made." → AC-19, AC-28
- [ ] **(after feature 6)** Run a real scan fed about a degree crooked through OCRmyPDF without `--deskew`. Tick a name and redact → it is removed and passes. Tick a long address or a whole line on the same scan → refused with the slanted text line, or, once feature 6 marks such matches, shown as not redactable during review → AC-28, AC-29

## Acceptance criteria coverage

- AC-1 non PDF refused by bytes · engine refusal tests, manual PNG, text and docx, no engine fetch
- AC-2 not a PDF document after opening · engine refusal tests
- AC-3 layered files refused at open · layered fixture in the engine suite and by hand
- AC-4 targets gone on the removal band, neighbours on every side survive · extraction and decompressed byte checks in the engine suite, the single spacing pair, `mutool clean -d` search, manual paste (after feature 6)
- AC-5 geometric edges · the fixture matrix, including shared resources, misaligned OCR, outlined text, kerning, a span that wraps exactly the match, the combining mark inside a match, the form drawn twice on a page and on two pages, text at 90 and 180 degrees, and the 1 degree Helvetica block
- AC-6 black box on the line box · engine suite with the 14pt render check, manual (after feature 6)
- AC-7 nothing else carried · engine suite, browser download checked in Node, `mutool show`, two readers
- AC-8 visible content stays visible · engine suite, manual metadata fixture
- AC-9 single revision, same pages and groups · engine suite, `mutool show`, two readers
- AC-10 owner password redacted, output unrestricted · RC4, AES-128 and AES-256 in the engine suite and by hand
- AC-11 every run starts clean · engine two run test, manual (after feature 6)
- AC-12 empty run cleans · engine suite, every browser run until feature 6
- AC-13 self check compares every page's characters, checks the pixels under targets, and checks structure · engine tests with the text pass, the padded pass and the sweep skipped, the shared XObject across pages, the no false alarm sweep over the matrix, the `next-line.pdf` cases after slice 5 (a match moved off the page is a survivor), the manual OCRmyPDF step, `mutool show`
- AC-14 all or nothing · engine and worker failure tests
- AC-15 honest outcome · engine suite against the inventory table, worker outcome assembly
- AC-16 phases in order · worker test, manual
- AC-17 cancel within a page, late output dropped · worker gated tests, browser cancel test, manual
- AC-18 one run at a time · worker gated test
- AC-19 thin working path with its outcome line · component test, browser tests, manual
- AC-20 held output dropped on every exit · component test, manual start over, replacement and worker kill
- AC-21 privacy proof covers a full run · `privacy.spec.ts`
- AC-22 detection and redaction read the same prepared page · metadata fixture in the engine suite and by hand
- AC-23 replacement cancels a run and waits for it · worker gated test, manual replacement during a heavy run
- AC-24 MuPDF says nothing to the console · engine log test, browser quiet console check, manual devtools
- AC-25 a failed check names the right kind, leak before overreach · engine self check tests, component test for the two new lines
- AC-26 a match inside wider replacement text is refused · the inline, UTF-16 and named fixtures in the engine suite
- AC-27 targets validated against their own text before anything is removed · the target validation tests, the trapezoid whose padded area crosses itself
- AC-28 a slanted target refused with `slanted-text` before anything is removed · the geometry tests, the slant fixtures, the precedence tests, the bounds pin, the component line, the manual crooked scan (after feature 6)
- AC-29 an image MuPDF would blank too far refused with `redaction-overreach` before anything is removed · the geometry tests, the rotated and coarse image fixtures, the bounds pin's image pages, the regenerated `images-under.pdf`

## Update from /develop · 2026-09-25

_History: this note was written when slices 1 and 3 were built and slice 2's removal was not. Slice 2 has since been built, and `redactDocument` now removes ticked targets. What is still to build is slice 4, in the section at the end._

### Where the checks live now

- [ ] `pnpm test -- engine.test` → a PNG, a text file, a docx, an empty file and a marker starting at byte 1020 are `not-pdf` with `loading-engine` never reported, and a marker at byte 1019 reaches the engine; the header window boundary cases → AC-1, value sourcing: header verdict
- [ ] `pnpm test -- redaction` → the refusals with real MuPDF (1019 opens, 1020 and a PNG are `not-pdf`, a PNG carrying `%PDF-` in a text chunk is `corrupt`, both layered fixtures are `hidden-layers` before `inspecting`); the prepare step; the cleaning run over the metadata fixture; phases; the untouched original; the structural self check firing with the sweep skipped; cancel checks after open, prepare, every page and the rebuild; the RC4, AES-128 and AES-256 fixtures coming out unencrypted and unrestricted → AC-1, AC-2, AC-3, AC-7, AC-8, AC-9, AC-10, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-22
- [ ] `pnpm test -- engine-log` → with a spy installed before MuPDF loads: MuPDF prints by default (the canary), a recording log receives the lines from opening, flattening and redacting the damaged fixture, and with the engine's silencer nothing reaches the console → AC-24
- [ ] `pnpm test:e2e cancel.spec.ts` → the browser cancel test lives here, not in `engine.spec.ts`. It builds the heavy 50 page fixture itself (it is not committed), so for the manual cancel steps above, run this test or use any 50 page PDF with a large image on every page → AC-17, AC-18, AC-19
- [ ] `pnpm test:e2e design-system.spec.ts` → the tool page's axe, forced colours, reflow and text spacing checks now include the `complete` state, and the keyboard walk meets Redact before Start over → AC-19, spec 0003 AC-6 and AC-18

### Decided by /architect · 2026-09-25 (slice 2, since built)

_The two findings that held slice 2 are resolved in spec 0004. Slice 2 has since been built, so these can be checked now._

- [ ] The replacement text case → a match inside a wider `/ActualText` span, inline or named, fails the run with `replacement-text` and no file; a span that wraps exactly the match is removed with it → AC-5, AC-25, AC-26
- [ ] Adjacent lines → at 12pt text on 12 and 14pt leading, text is removed only on the removal band and every character of the lines above and below survives at its origin; removal forced onto the exact quads through the seam fails with `redaction-overreach` → AC-4, AC-13, AC-25
- [ ] Every step marked (after feature 6), the geometric matrix, the self check tests, the two run test and the geometry constants in the `grep` steps wait for slice 2's build → AC-4, AC-5, AC-6, AC-11, AC-13

## Update from /develop · 2026-09-27

_Slice 4 is built, so the section "Slanted targets and images blanked too far" above can now be run. These steps say where each check lives. The fixtures are `reach.pdf` (pages 0 to 11, listed in `reach()` in `scripts/lib/redaction-fixtures.mjs`) and `bounds-pin.pdf`, whose geometry the pin test imports as `BOUNDS_PIN`._

### Commands

- [ ] `pnpm test -- redaction-geometry` → `BOUNDS_REACH_RATIO` is 0.1 in the constants list; the bounds reach is 0 at 0, 90, 180 and 270 degrees, equals the longer side times `|sin 2θ| / 2` at 1, 1.5, 10, 30, 60 and −20 degrees, and is 0.305 of the height on a 12 degree shear; `isTooSlanted` is false at 0.99 of the limit angle and true at 1.01, and true for a `NaN` or infinite corner; the trapezoid 4 pt wide at the top and 24 pt at the bottom is sound and its padded area is not; `blankedRegion` equals the area on an aligned 4 pixel per point image, keeps an edge a hair past a pixel boundary on it, rounds out to whole pixels, grows to the 25 pt pixels of the coarse image (reach 21.2 pt), holds the area's bounds under a 30 degree image, clips to the image, is `null` off the image, and is all `NaN` for a placement that cannot be inverted → AC-27, AC-28, AC-29, value sourcing: slant verdict, image reach verdict
- [ ] `pnpm test -- redaction-matrix` → `reach.pdf` pages 0 and 1 (1 degree, 12pt and 14pt leading, reach 0.092), 4 and 5 (turned whole to 90 and 180 degrees, reach 0), 7 (level, joined from 12pt then 11pt as two text objects, reach 0.093) and 8 (a level match over an upright image at 4 pixels per point) redact and pass their own checks; pages 2 and 3 (1.5 degrees, 0.138), 6 (12 degree shear, 0.305) and `angled-text.pdf` fail with `slanted-text`, and pages 9 (image at 30 degrees) and 10 (8 by 8 pixels at 200 pt) with `redaction-overreach`, each with the spy text and padded passes never called → AC-5, AC-28, AC-29
- [ ] In the same file, precedence → page 2 ticked with a page 7 target naming other text fails with `unsupported`; page 9 ticked before page 2 fails with `slanted-text` → AC-27, AC-28, AC-29
- [ ] In the same file, the bounds pin → on `bounds-pin.pdf` page 1 every black image pixel centred inside the 30 degree area's bounds turns white and none outside does, over a thousand of them past the area; two of the three red squares go and the one outside the bounds stays; the blue bar stays with both halves in one annotation and in two, and goes under one 100 pt area; after the box pass the render is black at the area's centre and not ink at a bounds corner that was black before; on pages 2 and 3 every blanked pixel lies inside `blankedRegion`'s quad and some lie past the level area → AC-28, AC-29, INV-15
- [ ] In the same file, the measured cases → `reach.pdf` page 11 (page 7's line as one text object, its size changed by `Tf` between the runs) fails with `redaction-incomplete`, because MuPDF moves the text after the match; `Renée`'s line loses U+0301 and reads `Name:here`; the form drawn on pages 1 and 3 keeps page 3's quads exactly → AC-5, AC-13, AC-25
- [ ] `pnpm test -- redaction-check` → the trapezoid target fails with `unsupported`, only `redacting` is reported, and the original bytes are unchanged → AC-27
- [ ] `node scripts/make-fixture.mjs`, then `git status tests/fixtures` → nothing changed, so the committed fixtures are exactly what the script writes, and `angled-text.pdf` is byte for byte what slice 2 committed → fixtures reviewable as code

### Recorded by /architect · 2026-09-27

_The size change finding is now an honest limit in spec 0004's *Security model*, with its measurements in the rationale's *What slice 4's build turned up*, and it joins the upstream MuPDF report in Follow-up. Horizontal scaling (`Tz`) was measured to do the same; only the `Tf` case is pinned. Measuring beside it found lines shown with `'` or `"` lost by MuPDF's filter, and a leak through them, which slice 5 closes._

- [ ] The page 11 case in the measured cases above still fails with `redaction-incomplete`, and page 7 (the same line as two text objects) still redacts. If page 11 ever redacts cleanly, confirm it with the direct pin below before concluding MuPDF fixed the filter; then change the test to expect a clean redaction and mark the upstream item done → AC-13, the size change limit in *Security model*

### Slice 5: the self check sees text drawn off the page (not built yet)

- [ ] `pnpm test -- redaction-geometry` → `CHECK_EXTRACTION_OPTIONS` is `["clip=no", "ignore-actualtext,clip=no"]` and `EXTRACTION_OPTIONS` is unchanged → AC-13, value sourcing: extraction options
- [ ] `grep -rn "CHECK_EXTRACTION_OPTIONS\|EXTRACTION_OPTIONS" src/engine` → the record and the self check walk `CHECK_EXTRACTION_OPTIONS`; `targets.ts` still walks `EXTRACTION_OPTIONS[0]` → AC-13, AC-27
- [ ] `pnpm test -- redaction-matrix` → `next-line.pdf` pages 0 and 1 (a match alone on a `'` or `"` line) fail with `redaction-incomplete`, and neither returns a file; page 2 (the `T*` control) redacts, with the match absent from the decompressed bytes; page 3 fails with `redaction-incomplete` ticked and `unsupported` with nothing ticked; page 4 (text outside the media box) yields a cleaned file with nothing ticked and redacts with the match ticked → AC-4, AC-13, AC-25
- [ ] In the same file, the direct pin → page 0 written through `sanitize` with nothing removed leaves `Jeremy Quigley` out of default extraction and keeps it under `clip=no`. If this ever fails because the line stays on the page, MuPDF has fixed the `'` fault: mark that upstream item done → AC-13
- [ ] The comment on the page 11 case no longer says the finding is "not yet recorded in spec 0004" → spec hygiene

### Owed to /test

- [ ] A direct pin on `reach.pdf` page 11, driving MuPDF as the bounds pin does, with the removal band as the engine builds it: no ticked character survives in unclipped extraction, and every character of ` here` moves 3.556 pt back (within 0.01). The engine test asserts only the kind, which a surviving glyph or a self check regression would also satisfy → AC-13, the size change limit in *Security model*
