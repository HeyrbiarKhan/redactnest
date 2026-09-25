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
- [ ] In the engine suite, the shared form XObject drawn on pages 1 and 3 with only page 1 ticked → either page 3 keeps its text or the run fails with `redaction-overreach`; it never passes with page 3's text gone → AC-13
- [ ] In the engine suite, the combining mark and the form XObject drawn twice on one page → each result is written into spec 0004 as fixed or as an honest limit → AC-5
- [ ] In the engine suite, the refusal tests → a PNG, a text file and a docx are `not-pdf` without the engine loading; a marker starting at offset 1020 is `not-pdf` and one at 1019 opens; the layered fixture is `hidden-layers` → AC-1, AC-2, AC-3
- [ ] In the engine suite, the log test → MuPDF's warnings reach a recording log when one is installed, and nothing reaches `console` with the no op in place → AC-24
- [ ] `pnpm test -- engine-worker` → phases arrive as `redacting`, `writing`, `verifying`; a cancel between pages, during the write, during the self check and while queued each post nothing; a run requested behind a cancelled one starts only after it settles; an `open` mid run cancels the run and waits for it before parsing; any engine throw posts exactly one `error` → AC-14, AC-16, AC-17, AC-18, AC-23
- [ ] `pnpm test -- tool-client` → the buttons and the outcome line follow the states, Download clears the held output and disappears, a tick change, start over, replacement and a lost worker each clear it, and a stale redact reply is ignored → AC-19, AC-20
- [ ] `pnpm test:e2e privacy.spec.ts` → the redaction leg passes: open, redact, download, with nothing written and no http or https request carrying document data → AC-21
- [ ] `pnpm test:e2e engine.spec.ts` → the real engine redacts the metadata fixture in the worker, and the downloaded file opened in Node carries none of the AC-7 kinds; the quiet console check passes; the cancel test asserts its cancel landed during `redacting` → AC-7, AC-17, AC-19, AC-24
- [ ] `mutool show <output>.pdf trailer` and `mutool show <output>.pdf Root` → the trailer has no `/Info` and no `/Encrypt`, and the catalog holds only `/Type`, `/Pages` and `/Lang` → AC-7, AC-13
- [ ] `mutool show <output>.pdf pages`, then each page object → only allowlisted keys, and a page that had `/Group` in the source still has it → AC-7, AC-9
- [ ] `mutool clean -d <output>.pdf plain.pdf`, then search `plain.pdf` for a removed target in plain and UTF-16BE form → no hit → AC-4
- [ ] Add a `string` field to a member of `LoggablePayload`, run `pnpm typecheck` → it still fails, with the five new kinds in the union → spec 0002 AC-8
- [ ] `grep -rn "PDF_HEADER_WINDOW\|TARGET_PADDING_RATIO\|TARGET_PADDING_ALONG_RATIO\|REMOVAL_BAND_RATIO\|REMOVAL_INSET_RATIO\|LINE_BOX_TOP\|LINE_BOX_BOTTOM\|MIN_QUAD_SIDE\|POSITION_TOLERANCE\|LINE_ANGLE_TOLERANCE\|LINE_HEIGHT_MIN\|LINE_HEIGHT_MAX\|EXTRACTION_OPTIONS" src/` → each declared once in `src/engine`, with a comment naming it as a deliberate exception to the caps rule, and read rather than repeated as a literal; `EXTRACTION_OPTIONS` is also what the Vitest target helper imports → value sourcing: header verdict, removal band, line box, padded area, target verdict, ticked characters, match tolerance, extraction options
- [ ] `grep -rn "dehyphenate\|collect-styles\|accurate-bboxes" src/engine` → no hits → value sourcing: extraction options
- [ ] `grep -n "applyRedactions" src/engine/*.ts` → exactly three call sites, each with all four arguments written out → AC-4, AC-6, INV-5
- [ ] In `tests/unit/redaction-matrix.test.ts`, the angled text case → text drawn at 30 degrees is refused with `redaction-overreach` and no file, because MuPDF 1.28.1 removes text inside each redaction quad's axis aligned bounds and the band's bounds reach the lines above and below; the clean removal stays a `todo` until `/architect` settles how a slanted area is handed to MuPDF → AC-5, AC-13
- [ ] In the same file, the combining mark cases → a mark inside the match (`Renée`) is removed with it; a mark drawn at zero width on the match's last letter (`José`) survives past the band's pulled in end, and the run refuses with `redaction-incomplete` → AC-5, AC-13
- [ ] In the same file, the form drawn twice on one page with its first drawing ticked → MuPDF redacts each drawing apart, so the second keeps its text at its own place, and the form drawn on pages 1 and 3 keeps page 3's copy → AC-5, AC-13

## Acceptance criteria coverage

- AC-1 non PDF refused by bytes · engine refusal tests, manual PNG, text and docx, no engine fetch
- AC-2 not a PDF document after opening · engine refusal tests
- AC-3 layered files refused at open · layered fixture in the engine suite and by hand
- AC-4 targets gone on the removal band, neighbours on every side survive · extraction and decompressed byte checks in the engine suite, the single spacing pair, `mutool clean -d` search, manual paste (after feature 6)
- AC-5 geometric edges · the fixture matrix, including shared resources, misaligned OCR, outlined text, kerning and a span that wraps exactly the match
- AC-6 black box on the line box · engine suite with the 14pt render check, manual (after feature 6)
- AC-7 nothing else carried · engine suite, browser download checked in Node, `mutool show`, two readers
- AC-8 visible content stays visible · engine suite, manual metadata fixture
- AC-9 single revision, same pages and groups · engine suite, `mutool show`, two readers
- AC-10 owner password redacted, output unrestricted · RC4, AES-128 and AES-256 in the engine suite and by hand
- AC-11 every run starts clean · engine two run test, manual (after feature 6)
- AC-12 empty run cleans · engine suite, every browser run until feature 6
- AC-13 self check compares every page's characters, checks the pixels under targets, and checks structure · engine tests with the text pass, the padded pass and the sweep skipped, the shared XObject across pages, the no false alarm sweep over the matrix, the manual OCRmyPDF step, `mutool show`
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
- AC-27 targets validated against their own text before anything is removed · the target validation tests

## Update from /develop · 2026-09-25

_Slices 1 and 3 are built, and slice 2's owner password fixtures. Slice 2's removal (tasks 8 to 11) is not built: it waits on `/architect` (see the two findings below). Until it lands, `redactDocument` still refuses any ticked target with `unsupported`, so no file that was asked to remove text and did not can leave the tool._

### Where the checks live now

- [ ] `pnpm test -- engine.test` → a PNG, a text file, a docx, an empty file and a marker starting at byte 1020 are `not-pdf` with `loading-engine` never reported, and a marker at byte 1019 reaches the engine; the header window boundary cases → AC-1, value sourcing: header verdict
- [ ] `pnpm test -- redaction` → the refusals with real MuPDF (1019 opens, 1020 and a PNG are `not-pdf`, a PNG carrying `%PDF-` in a text chunk is `corrupt`, both layered fixtures are `hidden-layers` before `inspecting`); the prepare step; the cleaning run over the metadata fixture; phases; the untouched original; the structural self check firing with the sweep skipped; cancel checks after open, prepare, every page and the rebuild; the RC4, AES-128 and AES-256 fixtures coming out unencrypted and unrestricted → AC-1, AC-2, AC-3, AC-7, AC-8, AC-9, AC-10, AC-12, AC-13, AC-14, AC-15, AC-16, AC-17, AC-22
- [ ] `pnpm test -- engine-log` → with a spy installed before MuPDF loads: MuPDF prints by default (the canary), a recording log receives the lines from opening, flattening and redacting the damaged fixture, and with the engine's silencer nothing reaches the console → AC-24
- [ ] `pnpm test:e2e cancel.spec.ts` → the browser cancel test lives here, not in `engine.spec.ts`. It builds the heavy 50 page fixture itself (it is not committed), so for the manual cancel steps above, run this test or use any 50 page PDF with a large image on every page → AC-17, AC-18, AC-19
- [ ] `pnpm test:e2e design-system.spec.ts` → the tool page's axe, forced colours, reflow and text spacing checks now include the `complete` state, and the keyboard walk meets Redact before Start over → AC-19, spec 0003 AC-6 and AC-18

### Decided by /architect · 2026-09-25 (slice 2, not built yet)

_The two findings that held slice 2 are resolved in spec 0004. Nothing below can be checked until slice 2 is built._

- [ ] The replacement text case → a match inside a wider `/ActualText` span, inline or named, fails the run with `replacement-text` and no file; a span that wraps exactly the match is removed with it → AC-5, AC-25, AC-26
- [ ] Adjacent lines → at 12pt text on 12 and 14pt leading, text is removed only on the removal band and every character of the lines above and below survives at its origin; removal forced onto the exact quads through the seam fails with `redaction-overreach` → AC-4, AC-13, AC-25
- [ ] Every step marked (after feature 6), the geometric matrix, the self check tests, the two run test and the geometry constants in the `grep` steps wait for slice 2's build → AC-4, AC-5, AC-6, AC-11, AC-13
