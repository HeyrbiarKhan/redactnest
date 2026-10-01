# Verify: dense text layers over pictures · spec 0010 · updated 2026-10-01
_Steps derived from spec 0010 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual
- [x] Open `tests/fixtures/read-pictures.pdf` in `/tool` → the picture line names pages 28 to 34 and 36 in AC-9's words ("… have pictures RedactNest can't read. Words inside a picture can't be found or removed."), the advice line keeps its words, and the machine read note still names the OCR pages → AC-3, AC-4, AC-5, AC-6, AC-9
  - Recorded 2026-10-01 by `/check verify`, on a production build with `NEXT_PUBLIC_FREE_PAGE_CAP=50` (the fixture has 37 pages): "Pages 9, 10, 12, 24 and 25 are scanned images. …", then "Pages 1, 3, 16 to 18, 20 to 23, 26 to 34 and 36 have pictures RedactNest can't read. Words inside a picture can't be found or removed.", then the advice line in its usual words. The note names pages 5 to 33. Page 35 and page 37 are on no line. No console error.
- [x] Redact the local `scan-dense-photo-after.pdf` (`bare-picture` beside the note) with its seeded ticks → the download is offered as `scan-dense-photo-after-partly-redacted.pdf`, with the partly redacted reason under the picture line; `scan-dense-ocr.pdf` (the note only), run the same way, downloads as `scan-dense-ocr-redacted.pdf` → AC-3, AC-9, AC-12 (Value sourcing: the file name)
  - Recorded 2026-10-01 by `/check verify`: `scan-dense-photo-after.pdf` run with its 44 seeded ticks removed 22 email addresses and 22 phone numbers, downloaded as `scan-dense-photo-after-partly-redacted.pdf`, with "That is why the file's name ends in partly redacted." under the picture line. `scan-dense-ocr.pdf`, run the same way, downloaded as `scan-dense-ocr-redacted.pdf`.
  - Step rewritten 2026-10-01 by `/architect`, from the run above. It first asked for `read-pictures.pdf` with nothing ticked to download as `read-pictures-partly-redacted.pdf`, which no run can give: the fixture has no match, so nothing is removed and the download is `read-pictures-cleaned.pdf`, right by spec 0007 AC-12 (a run that removed nothing is `cleaned`, even on a partly readable file).
- [x] Open `tests/fixtures/read-slides.pdf` → both slides still named, now in AC-9's words → AC-5
  - Recorded 2026-10-01: "Pages 1 and 2 have pictures RedactNest can't read. Words inside a picture can't be found or removed.", then the advice line. No note.
- [x] Open the local `scan-dense-ocr.pdf` → the machine read note only → AC-12
  - Recorded 2026-10-01: "RedactNest can read the text on every page." and the note in its one page form. No warning, no advice.
- [x] Open the local `scan-dense-photo-after.pdf` → the picture line beside the note → AC-3, AC-12
  - Recorded 2026-10-01: "Page 1 has a picture RedactNest can't read. Words inside a picture can't be found or removed.", the advice line, and the note.
- [x] Open the local `scan-dense-photo-before.pdf` → the picture line beside the note (AC-7's limit) → AC-7, AC-12
  - Recorded 2026-10-01: the same picture line, advice and note as the photo pasted after OCR, plus the crooked scan line: 4 of its matches are blocked `slanted-text` (39 of 43 checkboxes ticked). The scan itself is straight; the card covers the middle of the directory's rows, so OCR's lines beside it come out slanted. Spec 0006 AC-25's rule, untouched by this spec, and failing safe; recorded as a gap in this spec's *Follow-up* and the scope's *Deferred* list.
- [x] Open the local `scan-table-ocr.pdf` → the machine read note only → AC-12
  - Recorded 2026-10-01: "RedactNest can read the text on every page." and the note. No warning. Nothing to tick.
- [x] Open the local `scan-form-ocr.pdf` → never the note only: `bare-picture`, `scanned` or refused; record what it actually gives → AC-12
  - Recorded 2026-10-01: refused, "RedactNest can't read any text in this PDF" (`no-readable-text`). OCR read nothing on the empty form: its page holds no hidden glyph at all.
- [x] For each dense scan, record the pictures, the hidden glyphs, the longest run, the hidden lines holding no letter or number, and the findings; confirm the dense page's layer holds over 500 hidden glyphs → AC-12
  - Recorded 2026-10-01 with a scratch script over the engine's own readers (`walkDrawing`, `walkCharacters`, `runStep`) and `openDocumentWith`, on the ordinary read. Each scan is one page with no visible glyph. The longest run is page wide (letters or numbers in a row on one line, every one hidden).

    | Scan | Pictures (share of the page) | Hidden glyphs | Longest run | Hidden lines with no letter or number | Findings |
    |---|---|---|---|---|---|
    | `scan-dense-ocr.pdf` | 1 (1.0) | 1,072 over 59 lines | 9 | 0 | `machine-read-text` |
    | `scan-dense-photo-after.pdf` | 2 (1.0, and the card 0.077) | 1,072 over 59 lines | 9 | 0 | `bare-picture`, `machine-read-text` |
    | `scan-dense-photo-before.pdf` | 2 (1.0, and the card 0.077) | 1,145 over 63 lines | 9 | 2 | `bare-picture`, `machine-read-text` |
    | `scan-table-ocr.pdf` | 1 (1.0) | 328 over 70 lines | 6 | 0 | `machine-read-text` |
    | `scan-form-ocr.pdf` | 1 (1.0) | 0 | 0 | 0 | refused `no-readable-text` |

    The dense page's layer holds 1,072 hidden glyphs, over the 500 floor.
- [x] Open spec 0008's four local scans → each gives what spec 0008's AC-13 says → AC-12
  - Recorded 2026-10-01: `scan-straight.pdf` and `scan-crooked.pdf` refused with "RedactNest can't read any text in this PDF". `scan-straight-ocr.pdf` opens with the all clear line and the note for pages 1 to 3, no warning, and downloads as `scan-straight-ocr-redacted.pdf` (7 email addresses removed). `scan-crooked-ocr.pdf` opens the same plus the crooked scan line, 5 of its addresses left unticked, and downloads as `scan-crooked-ocr-redacted.pdf` (2 removed, 5 left). No partly redacted warning on either. The same as spec 0008's runs.

## Commands
- [x] `pnpm exec vitest run tests/unit/reading.test.ts` → the 37 page `READ_PICTURES` table passes with only page 28 moved; the pins for page 33 (one character per line) and pages 36 and 37 (unmatched replacement text) pass; the stamp cap case gives `["scanned", "machine-read-text"]` → AC-1 to AC-8
  - Recorded 2026-10-01: passed, run with the next two files (255 tests). Against `main`, the only expectation that moved in `READ_PICTURES` is page 28's; pages 29 to 37 are new. Both pins and *names a scan under a few large hidden bars scanned* pass.
- [x] `pnpm exec vitest run tests/unit/reading-measures.test.ts` → the `coverageLines` edges pass → AC-1
- [x] `pnpm exec vitest run tests/unit/cost.test.ts`, run alone (the full parallel suite inflates CPU time) → all four cases under 2 seconds → AC-11
  - Recorded 2026-10-01: 6 of 6 passed alone, the fourth case (*every line judged and a dense layer searched to the end*) among them.
- [x] `pnpm exec vitest run tests/unit/page-findings.test.ts` → the `bare-picture` line's one and several page forms, `ADVICE` unchanged → AC-9
- [x] `git diff 83bd383 -- src/worker/protocol.ts src/engine/types.ts` → empty: no shape that crosses the worker boundary changed → AC-10
- [x] `node scripts/make-fixture.mjs` then `git status tests/fixtures` → clean

## Value sourcing
- [x] A letter or number (`runStep`): page 34 (rows of underscores) is `bare-picture`; page 35 (each row led by "Name") has no finding → AC-1, AC-5
- [x] A readable character (`isReadable`): unmatched whitespace and an unmatched U+FFFD leave a line counting (measures test) → AC-1
- [x] A drawn glyph at a character's origin (`isDrawnAt`): page 36 is `bare-picture`, page 37 has no finding → AC-1, AC-6
- [x] An invisible glyph at a character's origin (`originIndex`): pages 28 and 29 are `bare-picture` beside `machine-read-text`, while `ocr-aligned.pdf`, `ocr-misaligned.pdf` and `ocr-bare.pdf` stay `machine-read-text` only → AC-1, AC-2, AC-3
- [x] The lines that count, asked only on a page with a picture: `read-pages.pdf`'s typed page keeps no finding → AC-10, AC-11
- [x] Each counting line's box (`lineBoxes`): page 35's rows clear the scan by area → AC-5
- [x] A picture's coverage and whether it is bare: page 23 and every dense OCR fixture named in AC-2 keep their findings → AC-2
  - Recorded 2026-10-01 through `openDocumentWith`: `ocr-aligned.pdf`, `ocr-misaligned.pdf`, `ocr-bare.pdf` and `read-crooked.pdf` page 1 give `machine-read-text` only; `read-hidden.pdf` page 10, `trim-edge.pdf` page 1 and `trim-ocr.pdf` page 1 carry `machine-read-text` and no `bare-picture`; `read-pages.pdf` gives no finding on its typed pages. In the browser, `read-pictures.pdf` pages 5 and 6 are on the note only, and pages 17 and 23 on the picture line, as before.
- [x] `bare-picture`, `scanned` and the refusal: the stamp cap case is `scanned` beside `machine-read-text`; `scan-form-ocr.pdf` is not the note only → AC-8, AC-12
- [x] The `bare-picture` line (`findingLine`): one page and several page forms read as AC-9 says → AC-9

## Acceptance-criteria coverage
- AC-1 · `coverageLines` edges, pages 34 to 37, pages 28 and 29 · AC-2 · the `READ_PICTURES` table and the OCR fixture tests · AC-3 · pages 28 and 29, `scan-dense-photo-after.pdf` · AC-4 · pages 30 and 31 · AC-5 · pages 34 and 35, `read-slides.pdf` · AC-6 · pages 36 and 37 and their pin · AC-7 · pages 32 and 33, the page 33 pin, `scan-dense-photo-before.pdf` · AC-8 · the stamp cap case, `scan-form-ocr.pdf` · AC-9 · the words in the browser and in `page-findings.test.ts` · AC-10 · the protocol diff · AC-11 · `cost.test.ts` run alone · AC-12 · the local dense scans and spec 0008's four
