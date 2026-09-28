# Verify: Scanned page detection & warnings · spec 0006 · updated 2026-09-28

_Steps derived from spec 0006's acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones._

Run the tool at `/tool` against a production build (`pnpm build && pnpm start`), because the content security policy is looser in development. The fixtures are `tests/fixtures/read-*.pdf` and `tests/fixtures/trim-*.pdf`, written by `node scripts/make-fixture.mjs`. Those over the free cap of 3 pages (`read-pages.pdf`, `read-pictures.pdf`, `read-covered.pdf`, `read-hidden.pdf`, `read-refused-mix.pdf`) need a paid entitlement, or are checked through `pnpm test` instead; `read-concealed.pdf` is the browser's three page sample of the covered and hidden cases.

Built: slices 1 to 4 of the build plan. Slice 5 is the real scan run below (AC-30). Open: the peak memory of the 300 pixels per inch cropped scan run (see *Measured*), which AC-29 sends back to `/architect` before this ships.

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
- [ ] Open `trim-text.pdf` → an untitled note "Page 1 has content outside its visible area. RedactNest removes it when you redact, since nobody can see it."; the only row is `visible.person@example.com`, never `offpage.person@example.com` → AC-8, AC-12, AC-14, AC-21
- [ ] Redact `trim-text.pdf` with nothing ticked → the outcome card holds the note "Content outside the visible area of page 1 was removed." and no warning; the file is `trim-text-redacted.pdf`; `mutool draw -F txt` with no crop (or a reader showing the media box) finds neither the address below the crop, "Below the media box" nor "Edge" → AC-14, AC-17, AC-22, AC-23
- [ ] Open `trim-kept.pdf` → a warning "Part of a picture on page 1 lies outside the visible page and couldn't be cleared, so it is still in the file." naming both pages; redact and download → `trim-kept-partly-redacted.pdf` → AC-8, AC-15, AC-23
- [ ] Open `trim-scan.pdf` → the off page note for both pages; redact, download, `mutool extract` the images → page 1's scan is white outside the crop box and banded inside it; page 2's picture off the page is white → AC-15, AC-17
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
- [ ] Spec 0006 (AC-14, AC-15): crop the straight scan in a PDF editor, open it → the off page note; redact and download; `mutool extract` the image → the cropped away region is white

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
- [ ] Whether a page is trimmed → `trim-text.pdf` for text, `trim-scan.pdf` for pictures, `text-page.pdf` untouched → the trim's own drawing pass and line boxes of the unclipped read
- [ ] The strips → the foundation pin: glyphs 0 and 0.5 pt inside every edge survive in four fonts, and everything outside goes → the visible area and what the page draws, grown by 1 pt
- [ ] Pixel mode or kept → `trim-scan.pdf` blanked, `trim-kept.pdf` kept → `imageReach` per crossing placement against `TRIM_PIXEL_REACH`
- [ ] The trim's proof → `trim-refused.pdf` is `edge-text`, `trim-quote.pdf` is `unsupported` → both unclipped modes before and after, matched as the self check matches
- [ ] The outside pixel rule → a trim that claims pixel mode and blanks nothing fails `redaction-incomplete` on either page of `trim-scan.pdf` → `IMAGE_CHECK_OPTIONS` on the output
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
- 50 page cropped scan, one 2550 by 3300 grey image (300 pixels per inch, Flate) shared by every page, half an inch cropped on each side: open 1.3 s of CPU (2.4 s wall), most of it the trim blanking each page's pixels on the review copy; a run with nothing ticked 2.2 s of CPU (4.0 s wall) against 46 ms with the trim skipped; output 1.57 times the source (32 KB to 50 KB); MuPDF's heap 23 MB before, 33 MB after the open, 59 MB after the run. The source image is synthetic and compresses well, so a real JPEG scan will grow far more when its blanked pages are written again.
- The peak is past spec 0004's four copies of the document by that measure (a 32 KB file), because each page image is decoded to blank it and again to check it. AC-29 returns this to `/architect` before the feature ships.

## Acceptance-criteria coverage

- AC-1 · every fixture page's findings, in order, no repeats; `reading.test.ts`
- AC-2 · scans, stamped scans, slides, drawn only and blank pages; `read-pages.pdf`, `read-pictures.pdf`, `read-slides.pdf`
- AC-3 · unmapped, private use and the lone bullet; the U+FFFD pin
- AC-4 · ID card, logo, photo, clipped headshot, sparse scans; `read-pictures.pdf`
- AC-5 · Tesseract and ABBYY order, the redaction matrix's OCR scans
- AC-6 · `read-covered.pdf`, the plain group and the baked Square annotation, and every near miss
- AC-7 · `read-hidden.pdf`, the straddling cell glyph, and every near miss
- AC-8 · the off page note and picture warning from the trim's triggers
- AC-9 · the heap pins in `device.test.ts`, the origin and ligature pins
- AC-10 · the six refusal fixtures, and `read-mixed.pdf` opening
- AC-11 · a page that cannot be loaded or drawn fails with `unsupported`
- AC-12 · the stamp's address is found; unreadable pages are never read
- AC-13 · concealed rows, and a covered and a hidden match that redact and pass the self check
- AC-14 · `trim-text.pdf`, the foundation pins, the pipeline order
- AC-15 · `trim-scan.pdf` blanked, `trim-kept.pdf` kept
- AC-16 · `trim-refused.pdf` (`edge-text`), `trim-quote.pdf` (`unsupported`)
- AC-17 · a skipped trim and a pretended pixel mode both fail `redaction-incomplete`
- AC-18 · the worker's agreement tests
- AC-19 to AC-24 · the UI steps above; `tool-client.test.tsx`, `review-checklist.test.tsx`, `ui/checklist.test.tsx`, `page-findings.test.ts`, `session.test.ts`
- AC-25 · `read-crooked.pdf`
- AC-26 · the refusal lines and the qualified coverage wording
- AC-27 · axe, keyboard, forced colours and 320px in `design-system.spec.ts`; the component axe tests
- AC-28 · the loggable gate, the privacy run over `read-mixed.pdf`, the worker's key lists
- AC-29 · `cost.test.ts`, the cancel tests in `reading.test.ts`, `trim.test.ts` and `engine-worker.test.ts`, and *Measured*
- AC-30 · the real scan steps above
