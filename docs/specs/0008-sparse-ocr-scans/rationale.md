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

## What the review changed (2026-09-30)

The fresh model review (`docs/reviews/2026-09-30-feat-sparse-ocr-scans.md`) traced the rule as first built against about 30 hand built pages on the real MuPDF. It found three ways to clear a warning that the spec had not recorded: one major and two minor. The engineer asked to favour finding on each and to say which of the other minors and nits to fix now. Every change below only takes characters out of a run (INV-5), so none can clear a warning the first build kept.

### Overlapping pictures (the major finding)

A character counted for every picture holding its centre. So when a photo was pasted onto an OCR scan and the end of one line of the scan's own text layer centred over the photo, the photo held a run and lost `bare-picture`. The photo's content was never read; the text belonged to the scan under it. The old coverage rule needed 5% of the photo's area covered; the run needed three characters.

**Option 1: a character over two pictures of different footprints counts for neither (chosen).** Pictures that hold exactly the same grid points (AC-7's layers) share a footprint and each keep the run.
- Pros: one rule closes every overlap, whatever the pictures' sizes or drawing order: a photo wholly inside a scan, a photo across a scan's edge, and a small OCR scan pasted onto a larger photo. It only removes characters, so it fails safe.
- Cons: a photo on a scan stays warned even when OCR did read the photo's own words, since the text over it cannot be told apart. A sparse scan stored as a page background plus smaller text masks, each large enough to be a picture, stays warned too.

**Option 2: a picture wholly inside a strictly larger picture takes no run (the review's fix).**
- Pros: the smallest change; a background with smaller masks inside it keeps its run.
- Cons: a photo that only partly overlaps a scan still takes the scan's words (page 22), and a large photo under a small pasted OCR scan is cleared by the scan's words (page 23). Both are the major finding in another shape.

**Option 3: a character belongs to the picture drawn last at its centre.**
- Pros: matches what the visitor sees, when OCR ran after the photo was pasted.
- Cons: wrong when OCR ran first, which is the usual order when a photo is added to an OCR file later in an editor: the layer then describes the scan hidden under the photo.

**Option 4: accept it and record it**, adding "photos" to the note's list of what OCR may have missed.
- Pros: no code change.
- Cons: it is the direction that misleads, on the case AC-3 set out to keep warned, and the engineer asked to favour finding.

Option 1 asks the only question the page can answer: is this text over one picture, or several? When it is over several, nothing says which one OCR read, so it clears none. Option 2 answers the case the review reproduced and leaves its two neighbours open. "The same footprint" is judged on the grid points, because that is how every footprint in spec 0006 is already measured, and it forgives the rounding in two layers' placements (runner up: placement quads within a tolerance, a second measure of the same thing). The price is that a photo inset less than about one grid cell from a full page scan's edges shares the scan's points and keeps its run; such a photo hides nearly the whole scan, and it is recorded as a limit.

One neighbouring case stays as it was, by the engineer's choice. A photo pasted onto a dense OCR scan whose layer covers at least `TEXT_OVER_PICTURE_MAX` of it is cleared by spec 0006's coverage test before any run is asked; that predates this spec, and closing it means extending the veto to the coverage test, which changes spec 0006's rule on every dense page and runs the character test on every OCR page with a second picture. It is pinned by page 28 and taken up as its own decision (scope feature 20).

### Word characters (minor)

A readable character was anything but whitespace, controls, private use and U+FFFD. So `___`, `...`, `|||` and `---`, which OCR emits for form rules, dotted leaders and table borders, formed runs, and so did three zero width spaces or soft hyphens.

**Option 1: letters and numbers count; a combining mark continues a run without adding to it; anything else ends it (chosen).**
- Pros: the engineer's rule, a run holds letters or digits; the commonest OCR junk never counts. A combining mark belongs to the letter before it, so Hindi or Thai words written with vowel signs still form runs, while one letter carrying two marks does not.
- Cons: a word broken by punctuation counts only its parts (`e.g.`, `12/03`); `lll` and `111` still count; `machineReadRun` takes a three way step instead of a yes or no.

**Option 2: letters, numbers and combining marks all count (the first draft of this update).**
- Pros: a plain two way answer, and scripts with vowel signs still read.
- Cons: one Devanagari syllable such as "किं" (a letter and two marks) is a run of 3, the same as a one letter word clearing a photo. The cross check found it.

**Option 3: a run of readable characters holding at least one letter or number (the review's first suggestion).**
- Pros: keeps words with an inner apostrophe or hyphen whole.
- Cons: `|l|` or `l__` clears a warning, which is exactly the junk the change is for.

**Option 4: letters and numbers only; a combining mark ends a run.**
- Pros: the plainest rule.
- Cons: words written with vowel signs break into pieces of one or two letters, so those scans stay warned, the same misfire this spec exists to fix.

Carrying a mark without counting it keeps a run's length in letters, which is what the engineer's bar of 3 means, and marks alone add nothing. Format characters end a run rather than being skipped: stricter, and a word split by one (a Persian zero width non joiner) still has three letters on one side in practice.

### Drawn copies (minor)

"Purely invisible" meant no drawn glyph within `POSITION_TOLERANCE` (0.01 pt) of the character's origin. A visible sentence with an invisible copy offset by 0.5 pt passed that test, formed runs and cleared the picture. A producer that draws the two copies with different kerning or spacing drifts much further than 0.5 pt.

**Option 1: a line with any character within half a character's height of a drawn glyph counts for nothing (chosen).**
- Pros: catches a copy at any offset, and at any drift along the line, as long as some part of it runs beside the drawn text. The reach scales with the text, so no size needs its own number.
- Cons: a real OCR line that runs beside a visible stamp or a typed value counts for nothing, so a sparse scan whose only words sit there stays warned. A line is MuPDF's, and a layer written one word at a time can split into a line per word (measured by the cross check), so a copy written that way is judged word by word.

**Option 2: the same reach, judged character by character.**
- Pros: only the characters beside drawn text drop out.
- Cons: a copy drawn with wider spacing runs past the visible text's end, and three characters out there form a run (page 27).

**Option 3: a drawn glyph's origin inside the character's own box (the review's suggestion).**
- Pros: no new constant.
- Cons: a copy offset to the left puts the drawn origin just outside the box, so the copy still counts (page 26), and drift along a line escapes it the same way.

**Option 4: a wider fixed tolerance, such as 2 pt.**
- Pros: the smallest change.
- Cons: a number in points is too tight for large text and too loose for small, and drift past it still counts.

**Option 5: a picture takes no run at all when any drawn glyph lies inside its footprint (the cross check's suggestion).**
- Pros: the simplest code, with no reach, no direction and no answers per line; it closes the word by word copy too.
- Cons: any visible stamp, Bates number or page number on a sparse OCR scan brings its warning back. Those are common on legal productions, the documents this spec most wants to clear. The engineer kept Option 1.

Why half the character's height, measured from the baseline: a drawn copy's glyphs sit on the same baseline as the hidden ones, within a fraction of an em. MuPDF makes a quad somewhat taller than an em (1.0 em for Tesseract's glyphless font, about 1.37 em for Helvetica, measured by the cross check), so the reach is half an em to about 0.7 em. Glyph origins along a line are at most about an em apart (the widest letters), and the reach runs before a character's origin and past its end, so it always finds a drawn origin beside a hidden character the copy runs over. Across the line it reaches that far either side of the baseline, while the lines above and below sit a line's spacing away, more than that in ordinary text, so a neighbour never counts as a copy. Measured from the quad instead, whose top sits an em or more above the baseline, the reach would catch the line above. The reach is never under `POSITION_TOLERANCE`, so a character with a flat quad still meets a drawn glyph at its own origin, and a value that is not finite makes a copy, so nothing fails open.

### The other findings

The engineer asked which to fix now. All of them, since each is small and each pins the direction that removes a warning:

- **The test gaps (minor):** every case the review traced by hand becomes a fixture page or an in test case: the overlaps (pages 20 to 23), punctuation and format characters (pages 24 and 25), offset and drifting copies (pages 26 and 27), and copies at one origin drawn stroked, white, at zero opacity, in `5 Tr` and in `6 Tr`.
- **The declaration order (nit):** the answers `machineReadTest` keeps (now `UNASKED`, `COUNTS`, `CONTINUES` and `ENDS`) are declared above it.
- **Spec 0006's Follow-up tense (nit):** put in the past tense by `/architect` on 2026-09-30, since it is wording about the past and waits on no code.
- **This spec's Consequences (nit):** they now record the overlap, the punctuation, the copy reach and their limits.
- **AC-11's wording (the review's note on B):** it now says the rule holds flags, origins and grid points, never text, all dropped with the page.

The review's stamped scan with three hidden letters (its A3b) is the recorded crafted file limit, and stays one.

### What the cross check changed (2026-09-30, after the review)

A read only pass on another model (Sonnet) checked this update against the code and measured the new fixture pages on MuPDF.js 1.28.1. Every page from 20 to 27 separates the first build from the update as intended, and its replica of both rules changed nothing on the fixtures already committed. The engineer took every recommended fix:

- Combining marks continue a run without adding to it (Option 1 above), not count like letters.
- The reach is a share of the character's quad height (`COPY_REACH_RATIO`), never under `POSITION_TOLERANCE`; it spans both sides of the baseline, checks every character on a line (whitespace included, each by its own height), and a value that is not finite makes a copy.
- Every picture can veto a character, one that passed coverage included; the pictures are grouped in a map keyed on their grid points.
- Page 23 draws three lines, so its scan clearly passes coverage; page 25 has its literal text; page 27 drifts with `0.6 Tc` for margin; `modeLine` writes `Tc` on every line.
- A second cost case reaches the new tests, which the first never did (its photo holds no character).
- A pin that the next line is out of reach, upright and on a turned page, fixes the reach to the line's direction.
- INV-5 now states the intended other direction; AC-3 and the user story no longer claim a photo stays named however much of the layer runs over it; the inset photo, the word by word copy and the dense layer are recorded.

## Evidence

Measured on 2026-09-30 with MuPDF.js 1.28.1, by a read only scratch script outside the repository that approximates AC-1: image footprints from `fillImage` and `fillImageMask`, the ordinary read's lines, origins matched within 0.01 pt, and the longest run of readable characters with an invisible glyph and no painted glyph at their origin, centred inside the footprint. The scans are the ones spec 0006's AC-30 used (`detect-email.pdf` rendered at 300 dpi, OCRmyPDF 17.13.0 with Tesseract 5.5.3, the crooked one without `--deskew`), kept outside the repository.

The last column was measured the same day, after the review, by a second read only scratch script: the longest run of letters and numbers (AC-14) along the ordinary read's lines. These pages hold no combining mark, draw no visible glyph and one picture each, so every character is purely invisible and over that picture alone, and AC-15 and AC-16 change nothing on them.

| File | Page | Pictures | Invisible glyphs | Visible glyphs | Readable characters | Longest run | Longest run of letters and numbers |
|---|---|---|---|---|---|---|---|
| `scan-straight.pdf` | 1 to 3 | 1 each | 0 | 0 | 0 | 0 | 0 |
| `scan-straight-ocr.pdf` | 1 | 1 | 259 | 0 | 227 | 26 | 8 |
| | 2 | 1 | 192 | 0 | 157 | 13 | 8 |
| | 3 | 1 | 153 | 0 | 131 | 17 | 7 |
| `scan-crooked.pdf` | 1 to 3 | 1 each | 0 | 0 | 0 | 0 | 0 |
| `scan-crooked-ocr.pdf` | 1 | 1 | 260 | 0 | 228 | 26 | 8 |
| | 2 | 1 | 195 | 0 | 157 | 13 | 7 |
| | 3 | 1 | 153 | 0 | 131 | 17 | 7 |

Every OCR page clears the bar of 3 by at least four times under the first rule and more than twice under AC-14, and straight and crooked agree page for page, where line box coverage gave 2 to 3% and about 6% (spec 0006, `verify.md`). The longer first runs were email addresses (with a label and its colon on page 1), which `@`, `.` and `:` now split. Before OCR there is no character at all, so both scans stay refused.
