# 0008. Sparse OCR scans: rationale

## Context

Spec 0006 names a page `bare-picture` when a picture (an image covering at least 5% of the page) has readable text lines over less than 5% of it (`TEXT_OVER_PICTURE_MAX`), measured as the union of line boxes on a 64 by 64 grid. It names a page `scanned` when fewer than 40 readable characters (`STAMP_MAX_CHARS`) sit over bare pictures holding half the page, and a document whose every page is `scanned` is refused `no-readable-text`.

A scan that has been through text recognition (OCR) carries an invisible text layer. On a dense page that layer covers far more than 5% of the scan, so the page is `machine-read-text` only: a note, and the plain `-redacted.pdf` name. On a sparse page (a short letter, a form, a signature page) it does not. The 2026-09-29 review (`docs/reviews/2026-09-29-feat-scanned-page-detection.md`, note 1) found two failures with one root cause:

- **The warning OCR cannot clear.** The local straight scan's 6 or 7 short lines cover 2 to 3% of each page, so every page stays `bare-picture`, carries the advice to run OCR, and downloads as `-partly-redacted.pdf`, although it already went through OCR. Following the advice can never clear the warning.
- **The cliff.** The same content scanned 1 degree crooked covers about 6% on page 1, because slanted lines have taller boxes, so two scans of one letter get different warnings.
- **The refusal.** An OCR page with under 40 characters over a full page scan is treated as a stamped scan and refused, although OCR read it.

Both fail safe (a warning or a refusal, never a missed leak), but they make the partly redacted name meaningless on the commonest legitimate input, and spec 0007 had to hedge the advice to "may" because of it. The same pages already carry the right signal: `machine-read-text` (spec 0006, AC-5), invisible text over an image.

## Options considered

### Option 1: a machine read run per picture (chosen)

A picture stops being bare once 3 or more readable, purely invisible characters in a row, on one line of the ordinary read, sit inside its footprint. Visible text keeps today's coverage rule.

**Pros**: no area threshold, so a tilt cannot flip it; reuses AC-5's signal, which already says "this is OCR"; fixes `scanned` for free; a stray mark or two cannot clear a warning.
**Cons**: noise forming a run of 3, or one recognised word over a picture full of unread handwriting, clears the warning; a small cliff remains at two character words.

### Option 2: any machine read character over the picture

One readable invisible character in the footprint is enough.

**Pros**: simplest; no threshold at all.
**Cons**: a single `|` that OCR read off a photo clears that photo's warning. The engineer declined it for that reason: favour finding.

### Option 3: count glyphs of any text over the picture

Replace line box coverage with a glyph count, visible or invisible.

**Pros**: one measure for every picture; stable under tilt.
**Cons**: visible text over a picture (a slide's title over its background photo) would clear it, though it says nothing about the photo's own words. Changes behaviour the review did not question.

### Option 4: machine read lines only, with a lower coverage threshold

Keep the line box union, count only invisible lines, and lower the bar.

**Pros**: smallest change to the code's shape.
**Cons**: still a cliff by area; a sparser page, or a steeper tilt, flips it again.

## Rationale

The failure is a proxy problem: area coverage stands in for "OCR read this picture", and area is exactly what a sparse page and a tilt disturb. Option 1 asks the question directly, using the signal spec 0006 already trusts for the OCR note, and counts along the read's own lines, so geometry drops out (INV-2). The minimum run of 3 is the engineer's answer to Option 2's weakness, and it matches `UNREADABLE_RUN`, the rule that already judges a font by characters in a row. Counting only purely invisible characters (INV-1) keeps the one direction that can mislead, removing a warning, closed to visible text and to text drawn both ways.

Option 1 also fixes the refusal without touching `STAMP_MAX_CHARS`: `scanned` counts bare pictures, and an OCR scan with a run no longer has one. A stamp is still what spec 0006 meant, a few visible characters over a scan. The cost is honest and small: the run is searched only where coverage failed (AC-12), and the note's new sentence names what any OCR page may still hold.

## Decisions taken in the design conversation

Each was asked with a recommended pick; the answer and the runner up are recorded.

- **A new spec amending 0006**, not an edit in place, so 0006 keeps its shipped history and this change has its own lifecycle. Runner up: update 0006 in place.
- **The signal is a run of 3 readable invisible characters in the picture** (the engineer's pick over the recommended "any single character", to favour finding). Runners up: any character; glyph count of any text; machine read lines with a lower bar.
- **Per picture.** Runner up: per page.
- **Short OCR pages follow the same rule and open.** Runners up: open but warn; keep refusing.
- **Anything but a qualifying character breaks a run.** Runner up: spaces do not break it.
- **Visible text over a picture is unchanged.** Runner up: runs of visible text also exempt.
- **The machine read note gains "Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the picture." for every OCR page** (the engineer's pick over the recommended "note unchanged"), with "pictures" in the several page form.
- **`ADVICE` keeps "may".** Runner up: "RedactNest can then read the words the text recognition finds."
- **Only purely invisible characters count.** Runner up: any invisible glyph at the origin.
- **Proof by code built fixtures, and the real scan step on the engineer's local scans** (before OCR refused, after OCR the note only). Runner up: fixtures only.
- **No References section.**

## What the cross check changed (2026-09-30)

A read only review on another model (Sonnet) traced every AC to the code. The engineer took every recommended fix:

- The layered text fixture draws both copies in one font, size and place, after the scan; with two fonts only the first letters would meet, a run would form, and the fixture would pass for the wrong reason.
- The clipped layer fixture keeps two characters ("Yes" with its last glyph clipped), since a page with no character at all is `unreadable-text` and `scanned` under any rule and proves nothing.
- The drawing reader records every clipping glyph's origin, because `clipOnly` holds only clip glyphs whose clip nothing was painted inside.
- The search is lazy and guarded, and a cost case takes it on every page; the painted index is shared with `concealedGlyphs` rather than built twice.
- A reverse pin, a Tesseract shaped layer (straight, tilted, rotated) and a pure `machineReadRun` with unit tested edges prove in CI what the evidence below only approximated.
- The fixture geometry, the helpers, the stale lines in specs 0006 and 0007, and the e2e file are named.
- A scan stored as strips, replacement text, vertical writing and unmapped fonts are recorded as limits that fail safe.
- INV-1 and AC-4 no longer claim visible text can never clear a picture (spec 0006's coverage rule still can), and INV-2 no longer claims a tilt can never matter.

## Evidence

Measured on 2026-09-30 with MuPDF.js 1.28.1, by a read only scratch script outside the repository that approximates AC-1: image footprints from `fillImage` and `fillImageMask`, the ordinary read's lines, origins matched within 0.01 pt, and the longest run of readable characters with an invisible glyph and no painted glyph at their origin, centred inside the footprint. The scans are the ones spec 0006's AC-30 used (`detect-email.pdf` rendered at 300 dpi, OCRmyPDF 17.13.0 with Tesseract 5.5.3, the crooked one without `--deskew`), kept outside the repository.

| File | Page | Pictures | Invisible glyphs | Visible glyphs | Readable characters | Longest run |
|---|---|---|---|---|---|---|
| `scan-straight.pdf` | 1 to 3 | 1 each | 0 | 0 | 0 | 0 |
| `scan-straight-ocr.pdf` | 1 | 1 | 259 | 0 | 227 | 26 |
| | 2 | 1 | 192 | 0 | 157 | 13 |
| | 3 | 1 | 153 | 0 | 131 | 17 |
| `scan-crooked.pdf` | 1 to 3 | 1 each | 0 | 0 | 0 | 0 |
| `scan-crooked-ocr.pdf` | 1 | 1 | 260 | 0 | 228 | 26 |
| | 2 | 1 | 195 | 0 | 157 | 13 |
| | 3 | 1 | 153 | 0 | 131 | 17 |

Every OCR page clears the bar of 3 by at least four times, and straight and crooked agree page for page, where line box coverage gave 2 to 3% and about 6% (spec 0006, `verify.md`). Before OCR there is no character at all, so both scans stay refused.
