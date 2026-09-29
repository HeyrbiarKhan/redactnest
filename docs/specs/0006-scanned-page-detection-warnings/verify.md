# Verify: Scanned page detection & warnings · spec 0006 · updated 2026-09-29

_Steps derived from spec 0006's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`), because the content security policy is looser in development. The fixtures are `tests/fixtures/read-*.pdf` and `tests/fixtures/trim-*.pdf`, written by `node scripts/make-fixture.mjs`. Those over the free cap of 3 pages (`read-pages.pdf`, `read-pictures.pdf`, `read-covered.pdf`, `read-hidden.pdf`, `read-refused-mix.pdf`) need a paid entitlement, or are checked through `pnpm test` instead; `read-concealed.pdf` is the browser's three page sample of the covered and hidden cases. Slice 4b added `trim-ocr.pdf` (a scan with Tesseract's text layer, cropped through its lines), `trim-edge.pdf`, `read-empty-clip-0.pdf` to `read-empty-clip-3.pdf`, and `read-empty-clip-scan.pdf` (a scan with nothing readable that also draws under an empty clip).

Built: slices 1 to 4 and slice 4b of the build plan (what the build sent back, settled 2026-09-29: pictures outside the visible area kept and named, text a clip hides wholly named, text under an empty clip refused). Slice 5 is the real scan run below (AC-30).

## UI / manual

- [ ] Open `two-pages.pdf` → the card reads "This document has 2 pages." and "RedactNest can read the text on every page."; no warning callout; redact and download → the file is `two-pages-redacted.pdf` → AC-1, AC-19, AC-23
- [ ] Open `read-mixed.pdf` → the card holds a warning titled "Some pages can't be fully checked" (a level 3 heading) reading "Page 2 is a scanned image. Text in the image can't be found or removed." then the advice line; page 3 (blank) is named nowhere → AC-2, AC-20
- [ ] In `read-mixed.pdf` → the coverage note reads "RedactNest looked for email addresses and phone numbers on the pages it could read. …", and the one row is `jane.doe@example.com` on page 1 → AC-12, AC-26
- [ ] Redact `read-mixed.pdf` → the outcome card ends with a warning titled "Not every page was checked" repeating the page 2 line and "That is why the file's name ends in partly redacted.", directly above the row holding Download; download → the file is `read-mixed-partly-redacted.pdf`, and the warning stays after the download → AC-22, AC-23
- [ ] Open `read-scans.pdf`, `read-blank.pdf`, `read-stamped.pdf`, `read-unmapped.pdf` and `read-private.pdf` in turn → each shows the danger callout "RedactNest can't read any text in this PDF. … so nothing could be found and no file was made. If you have the original, run it through text recognition (OCR) first, then open the result here.", announced once as an alert; no checklist, no Redact, no Download; Start over clears it → AC-10, AC-26
- [ ] Open `trim-refused.pdf` → the danger callout "This PDF has text at the edge of a page that RedactNest can't remove cleanly, so it can't be redacted and no file was made.", with only Start over → AC-16, AC-26
- [ ] Open `trim-quote.pdf` → today's generic `unsupported` line ("Something went wrong while working on this file."), not the edge line → AC-16, AC-26
- [ ] Open `read-crooked.pdf` → the card keeps the all clear line, then an untitled note: "Page 1 is a scan with machine read text. …" and last the crooked scan line naming OCRmyPDF's `--deskew`; both addresses are listed blocked with the steep angle reason → AC-5, AC-21, AC-25
- [ ] Open `read-concealed.pdf` → the warning names "Pages 1 and 2 have text hidden under a box or shape drawn over it. …" and "Page 3 has text you can't see, …"; the covered email and phone rows read "Hidden under a box on the page.", the white one "Not visible on the page.", and every one is ticked and tickable → AC-6, AC-7, AC-13, AC-20, AC-24
- [ ] Redact `read-concealed.pdf` and paste each page's text from the download → `board.minutes@example.com`, `020 7946 0321` and `white.ink@example.com` are gone; the file is `read-concealed-partly-redacted.pdf` → AC-13, AC-23
- [ ] Open `trim-text.pdf` → an untitled note "Page 1 has text or drawings outside its visible area. RedactNest removes them when you redact, since nobody can see them."; the only row is `visible.person@example.com`, never `offpage.person@example.com` → AC-8, AC-12, AC-14, AC-21
- [ ] Redact `trim-text.pdf` with nothing ticked → the outcome card holds the note "Text and drawings outside the visible area of page 1 were removed." and no warning; the file is `trim-text-redacted.pdf`; `mutool draw -F txt` with no crop (or a reader showing the media box) finds neither the address below the crop, "Below the media box" nor "Edge" → AC-14, AC-17, AC-22, AC-23
- [ ] Open `trim-kept.pdf` → a warning "Pages 1 and 2 have pictures that reach outside the visible page. RedactNest doesn't clear pictures, so the part outside is still in the file."; redact and download → `trim-kept-partly-redacted.pdf` → AC-8, AC-15, AC-23
- [ ] Open `trim-scan.pdf` → the same picture warning, naming the cropped scan's page and the page whose picture lies wholly outside, and no off page note for them; redact and download → `trim-scan-partly-redacted.pdf`; `mutool extract` the images → each is exactly the source's, the cropped scan's margins included → AC-8, AC-15, AC-23, INV-11
- [ ] Open `trim-edge.pdf` → the picture warning names only the page with a picture reaching outside beside an email below the crop, and the off page note names that page too; the scan placed 0.28 pt past its page's edge and the soft mask image are named nowhere → AC-8, AC-15
- [ ] Open `read-empty-clip-0.pdf` (and each of `-1` to `-3` through `pnpm test`) → today's generic `unsupported` line ("Something went wrong while working on this file."), with only Start over → AC-11
- [ ] Keyboard only, on `read-mixed.pdf` and `read-concealed.pdf` → the warnings and notes add no tab stop: Choose a PDF, the group summary, each checkbox, Redact, Start over → AC-27
- [ ] Screen reader → the opened card is read once with its warning ("Warning:" then the title and lines) and note ("Note:"); a page list reads "Pages 1 and 2"; a concealed row adds its line after the page and context → AC-24, AC-27
- [ ] Forced colours (Windows High Contrast) → the warning, the note and the download warning keep their border and icon → AC-27
- [ ] At 320 CSS pixels → the warnings wrap with no sideways scroll → AC-27

## The steps other specs left for feature 7 (AC-30)

Make the scans locally and keep them out of git: print `detect-email.pdf` (or any fixture with a name holding a g, j, p, q or y), scan it once straight and once about a degree crooked, and run each through OCRmyPDF, the crooked one without `--deskew`. Tick each step here and in its own spec's `verify.md`.

- [ ] Spec 0004 (its AC-5, AC-13): on the straight scan, tick a match with descenders, redact and download; with the image viewed on its own (`mutool extract`), no ink of the match shows around or below the box, and the lines around it still read
- [ ] Spec 0004 (its AC-28, AC-29): on the crooked scan, a ticked name is removed and the run passes, and a long address or a whole line is shown blocked `slanted-text` during review
- [ ] Spec 0006 (AC-5): the straight scan opens with the machine read note and no warning of its own for the text layer
- [ ] Spec 0006 (AC-25): the crooked scan opens with the crooked scan line
- [ ] Spec 0006 (AC-14, AC-15, AC-23): crop the straight scan in a PDF editor through lines of text, open it → the off page picture warning and the off page note, not the edge refusal (if it refuses, bring the file's shape to `/architect`); redact and download → the name ends in `-partly-redacted.pdf`; `mutool extract` the image → exactly the scan's, the cropped away region included

## Value sourcing

- [ ] Each page's `findings` → `tests/unit/reading.test.ts` reads every page of `read-pages.pdf`, `read-pictures.pdf`, `read-covered.pdf` and `read-hidden.pdf` as each fixture's table says → `inspectPages` on the prepared review copy, plus the trim's two
- [ ] The visible area → `offset-cropbox.pdf` and `trim-text.pdf` judge from the crop box, and MuPDF's own crop clip pin passes → `page.getBounds()`, MuPDF's crop clip left out of the clip in force
- [ ] Glyph origin, colour, alpha, blend, clip, draw order → the covered and hidden near misses (half alpha group, translucent highlight, cell background drawn first) give nothing → the drawing reader (`device.ts`)
- [ ] A glyph's box → the pin "finds an extracted character at the origin of every glyph it can judge" passes → the matched ordinary mode character's quad
- [ ] A glyph's em height → "Tiny print" at 0.5 pt is `hidden-text` → text matrix times transform on the unit upright vector
- [ ] A cover's shape → the box turned 10 degrees gives nothing (the recorded limit) → `Path.walk`, level within `POSITION_TOLERANCE`
- [ ] An image's opacity → an unmasked image over text covers it; the half alpha group does not → `alpha`, `Image.getMask()`, the groups open
- [ ] An image's footprint → the headshot clipped to a 120 pt frame is no picture → the unit square through the placement, cut to the clip in force
- [ ] A colour's contrast → white on white is hidden, white on a dark box is not, pale spot colour text is not judged → `ColorSpace.getType()`, WCAG luminance
- [ ] Readable characters, unreadable runs, line boxes → the unmapped and private use pages are `unreadable-text` and unreadable; one unmapped bullet among typed text is nothing → the ordinary mode read through `walkCharacters`
- [ ] `readable` per page → detection finds the stamp's address on a scanned page and reads no unreadable page → AC-3's definition
- [ ] The stamp count → `read-stamped.pdf` is refused, `read-slides.pdf` opens with each slide `bare-picture` → `STAMP_MAX_CHARS`
- [ ] `no-readable-text` → the six refusal fixtures, and `read-mixed.pdf` opens → every page `scanned`, `drawn-only`, `blank` or unreadable
- [ ] `matches[].concealed` → `read-concealed.pdf`'s rows → the match's character origins against the page's concealed glyphs
- [ ] Whether a page is trimmed → `trim-text.pdf` trimmed for text; `trim-scan.pdf` and `trim-kept.pdf` never trimmed for their pictures; `text-page.pdf` untouched → the trim's own drawing pass for paths and line boxes of the unclipped read
- [ ] A picture reaching outside → every page of `trim-scan.pdf` and `trim-kept.pdf` is `off-page-picture`; in `trim-edge.pdf` the scan 0.28 pt past its edge and the soft mask image give nothing, and the page with a picture reaching outside and an email below the crop gives both findings and loses the email → image footprints from the trim's drawing pass, cut to the clip in force, against the visible area past `PICTURE_REACH_MIN` (1 pt)
- [ ] A cropped OCR scan → the Tesseract shaped pin in `trim.test.ts` opens with `off-page-content`, `off-page-picture` and `machine-read-text`, not `edge-text`, and its run passes → the trim's proof over per word `Tf` and `Tz`
- [ ] The strips → the foundation pin: glyphs 0 and 0.5 pt inside every edge survive in four fonts, and everything outside goes → the visible area and what the page draws, grown by 1 pt
- [ ] The trim's proof → `trim-refused.pdf` is `edge-text`, `trim-quote.pdf` is `unsupported` → both unclipped modes before and after, matched as the self check matches
- [ ] The off page character rule → the pipeline with the trim skipped fails `redaction-incomplete` over `trim-text.pdf`, ticked or not → both unclipped reads of the output against `page.getBounds()`
- [ ] A glyph a clip hides wholly → the rectangle clip and `/BBox` pages of `read-hidden.pdf` are `hidden-text` with no row, and the email is still in a run's output read with `clip=no` (the recorded limit); text drawn inside its clip and trailing spaces past a cell's clip give nothing; the extended origin pin passes → an unmatched glyph's origin against the visible area and the clip in force
- [ ] The empty clip refusal → each of `read-empty-clip-0.pdf` to `-3.pdf` fails the open with `unsupported`, the pins show each glyph reported by the drawing pass and gone after a `WRITE_OPTIONS` save, and a scan with nothing readable that also holds one is refused as `no-readable-text` → `PageInspection.emptyClip`, applied after AC-10
- [ ] `outcome.pagesByFinding` → the worker test "assembles the outcome from the run and the open summary" → `countPagesByFinding(summary.pages)`
- [ ] The trim agreement → the worker tests "posts unsupported, and no output, for a run whose trim …" → `result.trim` against the summary
- [ ] The lines, page lists and advice → `tests/unit/page-findings.test.ts` ("Pages 1, 3 to 9 and 12", one page and many page forms) → `src/lib/page-findings.ts`
- [ ] The crooked scan line → shown for `read-crooked.pdf`'s scan page only → a `slanted-text` match on a `machine-read-text` page
- [ ] A row's concealed line, the coverage wording, the download warning, the removed line, the file name, the refusal lines → the component tests in `tool-client.test.tsx`, `review-checklist.test.tsx` and `ui/checklist.test.tsx` → `CONCEALED_TEXT`, `isPartly`, `removedOffPageLine`, `outputNameFor`, `errorText`
- [ ] Feature 11's counts → `tests/unit/loggable.test.ts` holds `PageReading` and `pagesByFinding` to kinds and numbers → `outcome.pagesByFinding`

## Commands

- [ ] `pnpm test` → all pass, including `reading`, `trim`, `device`, `cost`, `page-findings`, `protocol`, `session`, `engine-worker`, `redaction-matrix`, `tool-client` and `review-checklist` → AC-1 to AC-29
- [ ] `pnpm typecheck` → passes, with the `PageReading` gate in `loggable.test.ts` → AC-28
- [ ] `pnpm lint` → passes → INV-7, spec 0003 zones
- [ ] `pnpm test:e2e` → all pass: the flagged, notes, concealed and refused states in `design-system.spec.ts`, the flagged run in `engine.spec.ts`, the flagged document in `privacy.spec.ts`, and `cancel.spec.ts` → AC-19 to AC-28
- [ ] `node scripts/make-fixture.mjs && git status tests/fixtures` → nothing changes

## Measured (AC-29)

On the build machine, the unit project, MuPDF.js 1.28.1:

- 50 page text heavy document (60 dense lines a page, every glyph inside a clip): inspection plus trim took 700 to 970 ms of CPU across three passes, against the 2 second budget. `tests/unit/cost.test.ts` holds the budget (the least of three passes, since CPU time roughly doubles when the whole suite shares the cores).
- With pixel blanking, as slice 4 built it (2026-09-28 and 29): on a 50 page cropped scan at 300 pixels per inch with a distinct JPEG per page, a run peaked at 814 MB (grey) and 1,804 MB (colour) of MuPDF heap, took 33 s and 80 s of CPU, and wrote 4.8 and 6.2 times the source; the colour scan failed to open. The full table is in `rationale.md`, *What the build sent back*. This is why AC-15 now keeps pictures whole.
- [ ] After slice 4b: `cost.test.ts` shows a run over the cropped scan leaving every page image's filter and bytes as the source has them → AC-29, INV-11
- [ ] After slice 4b, once, outside CI: the open's and a run's peak heap on the 50 page cropped scan, grey and colour, a distinct JPEG per page, each beside the same scan uncropped, in a fresh engine per figure. Record them here and in `rationale.md`; a cropped peak more than 5% above its twin returns to `/architect` → AC-29
- Measured after slice 4b (2026-09-29), by `/develop`, with a scratch probe run once and deleted: 50 US Letter pages at 300 pixels per inch (2550 by 3300 pixels), a distinct JPEG per page made by MuPDF at quality 75 (about 430 KB grey and 500 KB colour; files of 21.9 MB and 25.1 MB, under the 25 MB cap), an invisible text layer on each page and a header line in its top margin, cropped half an inch on every side or not at all. The cropped header puts every cropped page through the trim's text pass, and every cropped page's scan reaches outside. Each figure is MuPDF's WebAssembly memory in a fresh engine, which starts at 23 MB and only grows, in steps:

  | 50 page scan, 300 dpi | Heap after the open | Peak over a run alone | Run CPU | Output against source |
  |---|---|---|---|---|
  | grey, not cropped | 60 MB | 105 MB | 1.1 s | 0.99 times |
  | grey, cropped | 60 MB | 105 MB | 1.6 s | 0.99 times |
  | colour, not cropped | 66 MB | 115 MB | 1.1 s | 0.99 times |
  | colour, cropped | 66 MB | 115 MB | 1.5 s | 0.99 times |

  Every cropped peak equals its uncropped twin, 0% above against the 5% limit, so nothing returns to `/architect`. The trim adds 0.3 to 0.5 s of CPU across the 50 pages, at open and in a run. Recorded in `rationale.md`, *What the build sent back*, on 2026-09-29.

## Acceptance-criteria coverage

- AC-1 · every fixture page's findings, in order, no repeats; `reading.test.ts`
- AC-2 · scans, stamped scans, slides, drawn only and blank pages; `read-pages.pdf`, `read-pictures.pdf`, `read-slides.pdf`
- AC-3 · unmapped, private use and the lone bullet; the U+FFFD pin
- AC-4 · ID card, logo, photo, clipped headshot, sparse scans; `read-pictures.pdf`
- AC-5 · Tesseract and ABBYY order, the redaction matrix's OCR scans
- AC-6 · `read-covered.pdf`, the plain group and the baked Square annotation, and every near miss
- AC-7 · `read-hidden.pdf`, the straddling cell glyph, the rectangle clip and `/BBox` pages, and every near miss
- AC-8 · the off page note and picture warning from the trim's triggers
- AC-9 · the heap pins in `device.test.ts`, the origin and ligature pins
- AC-10 · the six refusal fixtures, and `read-mixed.pdf` opening
- AC-11 · a page that cannot be loaded or drawn fails with `unsupported`; `read-empty-clip-0.pdf` to `-3.pdf`, their pins, and the order after AC-10
- AC-12 · the stamp's address is found; unreadable pages are never read
- AC-13 · concealed rows, and a covered and a hidden match that redact and pass the self check
- AC-14 · `trim-text.pdf`, the foundation pins, the pipeline order
- AC-15 · `trim-scan.pdf`, `trim-kept.pdf` and `trim-edge.pdf`, their image streams unchanged by a run; the cropped OCR scan pin
- AC-16 · `trim-refused.pdf` (`edge-text`), `trim-quote.pdf` (`unsupported`)
- AC-17 · a skipped trim fails `redaction-incomplete`, ticked or not
- AC-18 · the worker's agreement tests
- AC-19 to AC-24 · the UI steps above; `tool-client.test.tsx`, `review-checklist.test.tsx`, `ui/checklist.test.tsx`, `page-findings.test.ts`, `session.test.ts`
- AC-25 · `read-crooked.pdf`
- AC-26 · the refusal lines and the qualified coverage wording
- AC-27 · axe, keyboard, forced colours and 320px in `design-system.spec.ts`; the component axe tests
- AC-28 · the loggable gate, the privacy run over `read-mixed.pdf`, the worker's key lists
- AC-29 · `cost.test.ts` (the CPU budget and the unchanged image streams), the cancel tests in `reading.test.ts`, `trim.test.ts` and `engine-worker.test.ts`, and *Measured*
- AC-30 · the real scan steps above
