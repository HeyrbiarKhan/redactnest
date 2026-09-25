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
- [ ] **(after feature 6)** Tick a match, redact, download, open the output → a black box where the match was, no wider than the match; select all text in the reader and paste it somewhere → the match is absent and its neighbours are present → AC-4, AC-6
- [ ] **(after feature 6)** Redact with two ticks, download, untick one, redact and download again → the second file shows the unticked match in plain text → AC-11

## Commands

- [ ] `pnpm test -- redaction` → the engine suite passes against real MuPDF in Node, including every fixture in the geometric matrix, the shared resource case and the misaligned OCR case → AC-4, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-12, AC-15, AC-22
- [ ] In the engine suite, the self check tests → with the exact pass skipped, and separately with the carrier sweep skipped, each fails with `redaction-incomplete` and returns no output → AC-13, AC-14
- [ ] In the engine suite, the refusal tests → a PNG, a text file and a docx are `not-pdf` without the engine loading; a marker starting at offset 1020 is `not-pdf` and one at 1019 opens; the layered fixture is `hidden-layers` → AC-1, AC-2, AC-3
- [ ] In the engine suite, the log test → MuPDF's warnings reach a recording log when one is installed, and nothing reaches `console` with the no op in place → AC-24
- [ ] `pnpm test -- engine-worker` → phases arrive as `redacting`, `writing`, `verifying`; a cancel between pages, during the write, during the self check and while queued each post nothing; a run requested behind a cancelled one starts only after it settles; an `open` mid run cancels the run and waits for it before parsing; any engine throw posts exactly one `error` → AC-14, AC-16, AC-17, AC-18, AC-23
- [ ] `pnpm test -- tool-client` → the buttons and the outcome line follow the states, Download clears the held output and disappears, a tick change, start over, replacement and a lost worker each clear it, and a stale redact reply is ignored → AC-19, AC-20
- [ ] `pnpm test:e2e privacy.spec.ts` → the redaction leg passes: open, redact, download, with nothing written and no http or https request carrying document data → AC-21
- [ ] `pnpm test:e2e engine.spec.ts` → the real engine redacts the metadata fixture in the worker, and the downloaded file opened in Node carries none of the AC-7 kinds; the quiet console check passes; the cancel test asserts its cancel landed during `redacting` → AC-7, AC-17, AC-19, AC-24
- [ ] `mutool show <output>.pdf trailer` and `mutool show <output>.pdf Root` → the trailer has no `/Info` and no `/Encrypt`, and the catalog holds only `/Type`, `/Pages` and `/Lang` → AC-7, AC-13
- [ ] `mutool show <output>.pdf pages`, then each page object → only allowlisted keys, and a page that had `/Group` in the source still has it → AC-7, AC-9
- [ ] `mutool clean -d <output>.pdf plain.pdf`, then search `plain.pdf` for a removed target in plain and UTF-16BE form → no hit → AC-4
- [ ] Add a `string` field to a member of `LoggablePayload`, run `pnpm typecheck` → it still fails, with the three new kinds in the union → spec 0002 AC-8
- [ ] `grep -rn "PDF_HEADER_WINDOW\|TARGET_PADDING_RATIO" src/` → each declared once in `src/engine`, with a comment naming it as a deliberate exception to the caps rule, and read rather than repeated as a literal → value sourcing: header verdict, padded quads

## Acceptance criteria coverage

- AC-1 non PDF refused by bytes · engine refusal tests, manual PNG, text and docx, no engine fetch
- AC-2 not a PDF document after opening · engine refusal tests
- AC-3 layered files refused at open · layered fixture in the engine suite and by hand
- AC-4 targets gone from the content stream · extraction and decompressed byte checks in the engine suite, `mutool clean -d` search, manual paste (after feature 6)
- AC-5 geometric edges · the fixture matrix, including shared resources and misaligned OCR
- AC-6 exact black box · engine suite, manual (after feature 6)
- AC-7 nothing else carried · engine suite, browser download checked in Node, `mutool show`, two readers
- AC-8 visible content stays visible · engine suite, manual metadata fixture
- AC-9 single revision, same pages and groups · engine suite, `mutool show`, two readers
- AC-10 owner password redacted, output unrestricted · RC4, AES-128 and AES-256 in the engine suite and by hand
- AC-11 every run starts clean · engine two run test, manual (after feature 6)
- AC-12 empty run cleans · engine suite, every browser run until feature 6
- AC-13 self check fails closed on targets and structure · engine tests with the exact pass and the sweep skipped, `mutool show`
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
