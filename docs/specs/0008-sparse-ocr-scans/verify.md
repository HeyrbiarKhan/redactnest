# Verify: Sparse OCR scans · spec 0008 · updated 2026-09-30
_Steps derived from spec 0008 acceptance criteria and its Value sourcing table. `/check verify` runs these; `/test` locks the durable ones. Page numbers are one based, as the tool shows them._

## UI / manual
- [x] At `/tool`, open `tests/fixtures/read-short-ocr.pdf` → the all clear line "RedactNest can read the text on every page.", one note "Page 1 is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the picture.", no warning callout, no advice line, and `jo@example.com` listed and tickable → AC-5, AC-8, AC-9 (Value sourcing: bare and `scanned`, the note line)
- [x] Tick `jo@example.com`, redact, download → the file is named `read-short-ocr-redacted.pdf`, with no partly redacted warning above Download → AC-8 (Value sourcing: the file name)
- [x] Open `tests/fixtures/read-scans.pdf`, then `tests/fixtures/read-stamped.pdf` → each refused as having no readable text → AC-5, AC-8, INV-3 (Value sourcing: the refusal)
- [x] Open `tests/fixtures/read-slides.pdf` → both slides named as having a picture with no text over it, as before → AC-4, INV-1
- [x] Open `tests/fixtures/read-pictures.pdf` → the scanned line names pages 9, 10 and 12 (stray marks, one and two character words, the clipped "Yes"); the picture line names pages 1, 3 and 16 to 18 (the ID card, the captioned photo, text drawn invisible and visible at one place, a photo pasted away from the layer, the strips); the note names pages 5 to 19 in its several page form, ending "stay in the pictures." → AC-1 to AC-7, AC-9 (Value sourcing: the readable flag, purely invisible, a character in a picture, a picture holding a run, origin and quad centre per line)
- [x] Real scans, on the engineer's local simulated scans (kept outside the repository, never committed; `make-scans.py` beside them remakes them): `scan-straight.pdf` and `scan-crooked.pdf` refused as having no readable text; `scan-straight-ocr.pdf` opens with the all clear line and the note, and no warning; `scan-crooked-ocr.pdf` opens the same, plus the crooked scan line; a cleaned copy of each OCR scan is named `-redacted.pdf` → AC-6, AC-13
  - Recorded 2026-09-30 by `/check verify`, on a production build: both scans before OCR refused with "RedactNest can't read any text in this PDF". Both OCR scans open with "RedactNest can read the text on every page." and the note for pages 1 to 3 in its several page form, with no warning and no advice, so straight and crooked give the same findings. The crooked one adds the crooked scan line and leaves 5 of its 7 addresses unticked as too steep, or blanking too much of the image, to remove (spec 0006, AC-25). The downloads are `scan-straight-ocr-redacted.pdf` (all 7 addresses gone) and `scan-crooked-ocr-redacted.pdf` (the 2 ticked ones gone), with no partly redacted warning on either.

## Commands
- [x] `pnpm exec vitest run --project unit tests/unit/reading.test.ts tests/unit/reading-measures.test.ts tests/unit/page-findings.test.ts` → all pass → AC-1 to AC-11
- [x] `pnpm exec vitest run --project unit tests/unit/cost.test.ts`, alone → 4 of 4 pass, each budget case under 2 seconds of CPU → AC-12 (Value sourcing: whether the search runs at all)
- [x] `pnpm exec playwright test tests/e2e/design-system.spec.ts -g "short OCR"` → passes → AC-8, AC-9
- [x] `node scripts/make-fixture.mjs`, then `git status tests/fixtures` → clean → AC-1 to AC-8 (the fixtures are the script's)

## Acceptance-criteria coverage
- AC-1 … the `read-pictures.pdf` step, the first command (the table, the run edges, the reverse pin)
- AC-2 … the `read-pictures.pdf` step (pages 12 and 16), the first command (the clipped letter pin)
- AC-3 … the `read-pictures.pdf` step (pages 17 and 18)
- AC-4 … the `read-slides.pdf` step, the `read-pictures.pdf` step (pages 1 and 3)
- AC-5 … the `read-short-ocr.pdf` step, the refusal step, the `read-pictures.pdf` step (pages 9, 10 and 12)
- AC-6 … the `read-pictures.pdf` step (pages 13 to 15), the real scans step
- AC-7 … the `read-pictures.pdf` step (page 19)
- AC-8 … the `read-short-ocr.pdf` and download steps, the refusal step, the browser command
- AC-9 … the `read-short-ocr.pdf` step, the `read-pictures.pdf` step, the browser command
- AC-10 … the first command (`ADVICE` pinned word for word)
- AC-11 … the first command, by review of `src/engine/inspect.ts` (no shape crossing the worker boundary changed)
- AC-12 … the cost command
- AC-13 … the real scans step
