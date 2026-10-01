# Verify: dense text layers over pictures · spec 0010 · updated 2026-10-01
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [ ] Open `tests/fixtures/read-pictures.pdf` in `/tool` → the picture line names pages 28 to 34 and 36 in AC-9's words ("… have pictures RedactNest can't read. Words inside a picture can't be found or removed."), the advice line keeps its words, and the machine read note still names the OCR pages → AC-3, AC-4, AC-5, AC-6, AC-9
- [ ] Redact `read-pictures.pdf` with nothing ticked → the download is offered as `read-pictures-partly-redacted.pdf` → AC-9 (Value sourcing: the file name)
- [ ] Open `tests/fixtures/read-slides.pdf` → both slides still named, now in AC-9's words → AC-5
- [ ] Open the local `scan-dense-ocr.pdf` → the machine read note only → AC-12
- [ ] Open the local `scan-dense-photo-after.pdf` → the picture line beside the note → AC-3, AC-12
- [ ] Open the local `scan-dense-photo-before.pdf` → the picture line beside the note (AC-7's limit) → AC-7, AC-12
- [ ] Open the local `scan-table-ocr.pdf` → the machine read note only → AC-12
- [ ] Open the local `scan-form-ocr.pdf` → never the note only: `bare-picture`, `scanned` or refused; record what it actually gives → AC-12
- [ ] For each dense scan, record the pictures, the hidden glyphs, the longest run, the hidden lines holding no letter or number, and the findings; confirm the dense page's layer holds over 500 hidden glyphs → AC-12
- [ ] Open spec 0008's four local scans → each gives what spec 0008's AC-13 says → AC-12

## Commands
- [ ] `pnpm exec vitest run tests/unit/reading.test.ts` → the 37 page `READ_PICTURES` table passes with only page 28 moved; the pins for page 33 (one character per line) and pages 36 and 37 (unmatched replacement text) pass; the stamp cap case gives `["scanned", "machine-read-text"]` → AC-1 to AC-8
- [ ] `pnpm exec vitest run tests/unit/reading-measures.test.ts` → the `coverageLines` edges pass → AC-1
- [ ] `pnpm exec vitest run tests/unit/cost.test.ts`, run alone (the full parallel suite inflates CPU time) → all four cases under 2 seconds → AC-11
- [ ] `pnpm exec vitest run tests/unit/page-findings.test.ts` → the `bare-picture` line's one and several page forms, `ADVICE` unchanged → AC-9
- [ ] `git diff 83bd383 -- src/worker/protocol.ts src/engine/types.ts` → empty: no shape that crosses the worker boundary changed → AC-10
- [ ] `node scripts/make-fixture.mjs` then `git status tests/fixtures` → clean

## Value sourcing
- [ ] A letter or number (`runStep`): page 34 (rows of underscores) is `bare-picture`; page 35 (each row led by "Name") has no finding → AC-1, AC-5
- [ ] A readable character (`isReadable`): unmatched whitespace and an unmatched U+FFFD leave a line counting (measures test) → AC-1
- [ ] A drawn glyph at a character's origin (`isDrawnAt`): page 36 is `bare-picture`, page 37 has no finding → AC-1, AC-6
- [ ] An invisible glyph at a character's origin (`originIndex`): pages 28 and 29 are `bare-picture` beside `machine-read-text`, while `ocr-aligned.pdf`, `ocr-misaligned.pdf` and `ocr-bare.pdf` stay `machine-read-text` only → AC-1, AC-2, AC-3
- [ ] The lines that count, asked only on a page with a picture: `read-pages.pdf`'s typed page keeps no finding → AC-10, AC-11
- [ ] Each counting line's box (`lineBoxes`): page 35's rows clear the scan by area → AC-5
- [ ] A picture's coverage and whether it is bare: page 23 and every dense OCR fixture named in AC-2 keep their findings → AC-2
- [ ] `bare-picture`, `scanned` and the refusal: the stamp cap case is `scanned` beside `machine-read-text`; `scan-form-ocr.pdf` is not the note only → AC-8, AC-12
- [ ] The `bare-picture` line (`findingLine`): one page and several page forms read as AC-9 says → AC-9

## Acceptance-criteria coverage
- AC-1 · `coverageLines` edges, pages 34 to 37, pages 28 and 29 · AC-2 · the `READ_PICTURES` table and the OCR fixture tests · AC-3 · pages 28 and 29, `scan-dense-photo-after.pdf` · AC-4 · pages 30 and 31 · AC-5 · pages 34 and 35, `read-slides.pdf` · AC-6 · pages 36 and 37 and their pin · AC-7 · pages 32 and 33, the page 33 pin, `scan-dense-photo-before.pdf` · AC-8 · the stamp cap case, `scan-form-ocr.pdf` · AC-9 · the words in the browser and in `page-findings.test.ts` · AC-10 · the protocol diff · AC-11 · `cost.test.ts` run alone · AC-12 · the local dense scans and spec 0008's four
