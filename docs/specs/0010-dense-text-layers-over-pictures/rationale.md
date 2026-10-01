# 0010. Dense text layers over pictures: rationale

## Context

Spec 0006 names a picture `bare-picture` when the boxes of text lines over it cover under 5% of its grid points (`TEXT_OVER_PICTURE_MAX`). Those lines are any line holding a readable character, visible or hidden, punctuation included, over any picture. Spec 0008 added a second way to clear a picture, the machine read run (a word of 3 or more letters or numbers in hidden text over that picture alone), but only after the area test has failed. On a dense page the area test passes first, so the run's protections never apply there: a character over two pictures still counts for both, and a line of punctuation still counts.

Two cases follow, both found on 2026-09-30, by the cross check of spec 0008's review fixes and by its second review (minor 1). A photo pasted onto a dense OCR scan (a scan run through text recognition) is cleared by the scan's own layer, which describes the scan under the photo, not the photo. Page 28 of `read-pictures.pdf` pins it, its layer over about a third of the photo. And a scan whose only hidden text is junk, such as six lines of `|||` from a ruled table, is cleared although no letter or number was read.

The forces: every change to what clears a warning is the direction that can mislead, so the engineer favours finding, as in spec 0008. The engine is GA, so a rule change needs fixtures that pin it and must leave every other committed page's findings alone or say why. The page reading runs at open on every page within spec 0006's 2 seconds of CPU for 50 pages. The repository is public, so real documents never enter it; real scans are simulated locally.

The scope asks for each answer to be measured on dense OCR scans and for its cost, and for page 28's expectation and a dense punctuation page's to follow.

## Options considered

### Option 1: only the run judges machine read text (chosen)

Hidden lines leave the area test entirely. A picture under machine read text is cleared only by spec 0008's run. Visible lines keep the area test, but only those holding a letter or number and drawn where the text says.

**Pros**: one rule answers both cases, including junk such as `|l|I|1` that holds stray letters and numbers but no word; the area test goes back to judging what it was built for, visible text over a background; the run already carries every protection spec 0008 built (the veto, letters and numbers only, drawn copies).
**Cons**: a dense OCR layer that forms no run loses a clearance it has today: vertical writing (read a character per line), pieces of an MRC scan, a photo pasted before OCR. Every OCR picture now takes the run search.

### Option 2: veto and letter filter inside the area test

Keep counting hidden lines by area, but a grid point over two pictures of different footprints counts for neither, and a line with no letter or number counts for nothing.

**Pros**: a dense OCR layer that forms no run but holds letters still clears its scan by area, so vertical writing keeps today's outcome.
**Cons**: two new rules in the area test, each a second copy of a rule the run already has; `|l|I|1` junk still clears a scan, since `l`, `I` and `1` are letters and numbers. MRC pieces are named anyway, by the veto.

### Option 3: the veto alone

Spec 0008's AC-16 reaches the area test; junk lines keep counting.

**Pros**: the smallest change that closes page 28.
**Cons**: a dense `|||` layer still clears a scan, the second case the scope asks about.

### Option 4: record both as limits

No code change; page 28 and a dense junk page are pinned as they are, and feature 16's page says so.

**Pros**: nothing moves.
**Cons**: both cases are the direction that misleads, on documents a visitor is likely to bring (an ID card pasted onto a scanned form, a scanned table).

## Rationale

The failure is spec 0008's proxy problem one level up: area stands in for "OCR read this picture", and on a dense page area answers before the real question is asked. Spec 0008 replaced the proxy for sparse pages with a direct question, the run, and built every protection into it. Option 1 finishes that job: hidden text is judged only by the run, so the veto, the letter rule and the drawn copy rule apply on every page, and the area test keeps only the case it was designed for, visible text over a background (spec 0006's slides and letterheads). Option 2 would copy two of the run's rules into a second measure and still miss junk that holds letters, which is the common OCR output for table rules.

The cost is honest and measured: across every committed fixture and the local OCR scans, only page 28's photo changes, and every dense OCR fixture is cleared by its run instead of by area. The shapes that lose a clearance (vertical writing, MRC pieces, a photo pasted before OCR) all fail safe and are recorded. One more outcome moves, toward the stronger warning: a page under 40 readable characters that only the area test cleared can now be `scanned`, so a document made only of such pages is refused (index AC-8).

The engineer added one rule to the recommendation: a visible line counts only when every readable character on it matches a drawn glyph, not merely when none is hidden. Their condition was to keep the looser rule only if unmatched characters can never come from a hidden OCR layer. The probes show they can (vertical writing and longer replacement text), and that such characters can form lines of their own that the looser rule would count as visible text. So the stricter rule stands, and the measurement shows it costs nothing on any committed page or probe of visible text except the one built to pin it.

## Decisions taken in the design conversation

Each was asked with a recommended pick; the answer and the runners up are recorded.

- **A new spec amending 0006 and 0008** (recommended). Runners up: update 0008 in place; supersede 0008.
- **Only the run judges machine read text** (recommended). Runners up: Options 2, 3 and 4 above.
- **Visible lines count only when they hold a letter or number** (recommended). Runners up: visible lines unchanged; a word of 3 required.
- **A junk only scan is `bare-picture` and the stamp cap is unchanged** (recommended). Runners up: the cap counts letters and numbers, so junk scans are `scanned` and a document of them is refused, which also moves the cap for visible stamps; hidden characters count toward the cap only when letters or numbers, a second way of counting.
- **The `bare-picture` line says "has a picture RedactNest can't read"** (recommended). Runners up: the words unchanged, untrue under an OCR or junk layer; "has a picture with no readable text over it", arguable on page 28, whose words belong to the scan.
- **Which lines leave the area test: any readable character hidden, plus any readable character matching no glyph** (the engineer's rule over the recommended "any readable character hidden", on the condition above). Runners up: every readable character hidden; only lines holding a visibly drawn letter or number.
- **MRC pieces and a photo pasted before OCR are recorded limits** (recommended). Runner up: a stencil or masked image wholly inside an opaque picture shares its footprint, for the run and the area test, which clears piecewise MRC but also a cut out photo or a logo with transparency pasted onto a scan, and changes spec 0008's AC-16.
- **Dense vertical OCR is a recorded limit** (recommended, asked after the measurement found it). Runners up: count runs down columns of one character lines in vertical mode, which changes spec 0008's "on one line"; keep area for hidden vertical lines, which leaves a photo under them cleared.
- **Dense scans measured on new local scans** made by the existing scan maker (recommended). Runners up: fixtures and the cost test only; scans the engineer supplies.
- **No References section** (recommended), as specs 0006 and 0008.

## What the cross check changed (2026-10-01)

A read only pass on another model (Sonnet) read the spec against the code, built a scratch copy of the engine with the rule patched in (no repository edits), and ran the unit suite and every committed fixture through old and new `inspectPages`. Only page 28's findings changed across 238 committed pages and the local scans' 12 pages; no e2e or component test depends on the old words or on dense layers. It tried Type3 fonts, render modes 2, 4 and 7, `TJ` kerning with `Tc`, `Tw`, `Ts` and `Tz`, a turned baseline, a form and a shading fill: every readable character matched a drawn glyph. The engineer took every recommended fix:

- The nine new pages have names, and page 33's font, page 32's mask and page 29's photo are wired into their resources.
- `lineBoxes` is a `ReadonlyMap<number, Rect>`.
- `inspectPage` gathers the pictures, then, only when there is one, builds the invisible index and the drawn origin list (hoisted from `machineReadTest`, so drawn origins live in one structure), runs `coverageLines`, and judges.
- "Holds a picture" means `pictures.length > 0`, so a page with only a small logo pays nothing.
- The new cost case is the fourth, and the true worst case: typed text over the top half, and a scan and a photo under a dense layer with no word over the bottom half. Its scratch timing on a patched copy was tight (0.6 to 1.6 seconds for inspection alone, noisy), so the build measures it on the real code and stops at `/architect` if any case passes 2 seconds.
- The amends name spec 0008's AC-1 last sentence, its Positive bullet on punctuation and its Negative bullet on dense layers, and spec 0006's *Value sourcing* row for line boxes; the Follow-up names the `src/engine/AGENTS.md` line `/sync` touches.
- The real scan step names its tools (PyMuPDF's `insert_image`, Pillow, 300 dpi) and a floor of 500 hidden glyphs for the dense page.
- `coverageLines` gains two edge tests on format characters.
- INV-2, AC-8, the Summary and the API row now say a page can move from `bare-picture`, or from clear, to `scanned`, and that a document made only of such pages is refused. It fails safe, and a test pins it.

## Evidence

Every committed fixture is synthetic. Real producer fonts, real ligature fonts and real vertical documents are untested here; the Follow-up covers them.

Measured on 2026-10-01 with MuPDF.js 1.28.1 by a read only scratch script outside the repository. It loaded the engine's own `walkDrawing`, `walkCharacters`, `originIndex`, `machineReadRun` and `runStep` (through `jiti`), built probe pages with the fixture script's own `document()` writer, and judged each picture three ways: today's area test; the recommended rule (lines with a letter or number and no hidden character); and the chosen rule (the same, and every readable character matching a drawn glyph). It then applied spec 0008's run with its veto, leaving out only the drawn copy reach, which no measured page needs. A character "matches" a glyph when the drawing reader drew one at its origin within `POSITION_TOLERANCE`: hidden for render mode 3, drawn for a fill, a stroke (outside a soft mask's own content) or a clip.

### Where unmatched characters come from

Each probe is one line of text over a full page picture. "Unmatched" counts readable characters with no glyph of either kind at their origin.

| Probe | Readable | Unmatched | Where |
|---|---|---|---|
| hidden: plain line; replacement text per word, the whole line, or fewer characters than glyphs; ligature glyph mapped to two code points; text rise; inside a form; word by word with `Tz` (Tesseract's shape); glyph by glyph | 6 to 32 | 0 | none |
| hidden: vertical writing (`Identity-V`) | 32 | 1 | a line of its own (the column's last character) |
| hidden: replacement text with more characters than glyphs ("Signed by" over "Signed") | 8 | 2 | on the hidden line |
| visible: the same shapes as the first hidden row, plus a ligature whose replacement text sits inside its line's text object | 6 to 1104 | 0 | none |
| visible: vertical writing | 32 | 1 | a line of its own |
| visible: replacement text wrapped around its own text object, more characters than glyphs | 1272 and 1160 (24 dense lines) | 48 and 16 | on drawn lines, which MuPDF splits from the rest of the row |

MuPDF reads vertical writing one character per line (39 lines for a 39 character column), so a vertical layer never forms a run.

### Every committed fixture and the local OCR scans

244 pages, 71 pictures (every PDF in `tests/fixtures`, and the two local OCR scans).

- 14 pictures pass today's area test and fail the new one: the scans of `ocr-aligned.pdf`, `ocr-bare.pdf`, `ocr-misaligned.pdf`, `read-crooked.pdf` page 1, `read-hidden.pdf` page 10, `read-pictures.pdf` pages 5, 6, 17 and 28, `trim-edge.pdf` page 1, `trim-ocr.pdf` page 1 and the crooked local OCR scan's page 1, each of which holds a run; and two that do not, page 23's small scan and page 28's photo.
- So 2 pictures change from cleared to bare: page 23's scan (the page was already `bare-picture` beside `machine-read-text` through its photo, so its findings are unchanged) and page 28's photo (the intended change).
- 0 pictures differ between the recommended rule and the chosen one, and 0 pages hold an unmatched readable character.

### The planned fixture pages

Each page draws a full page scan first. "Before" is the share of the picture's grid points under today's counted lines.

| Page | Before | Today | This spec |
|---|---|---|---|
| 28, photo then the full layer | scan 18.6%, photo 35.2% | both cleared | scan cleared by its run, photo bare |
| 29, the full layer then the photo | the same | both cleared | the same |
| 30, six hidden lines of `\|` | 6.4% | cleared | bare (three lines: 3.2%, bare either way) |
| 31, six hidden lines of `\|l\|I\|1` | 6.4% | cleared | bare |
| 32, MRC: two stencil pieces under the full layer | 18.6%, 31.5%, 35.0% | all cleared | all bare |
| 33, ten hidden vertical columns | 6.1% | cleared | bare |
| 34, six visible rows of underscores | 9.4% | cleared | bare |
| 35, the same rows each led by "Name" | 9.4% | cleared | cleared |
| 36, 24 visible lines, replacement text adding a word | 7.8% | cleared (and under the recommended rule) | bare |
| 37, the same, replacement text equal to the glyphs | 7.8% | cleared | cleared |

Visible text with ligatures over a background (24 dense lines, a replacement text ligature on every line or one in three, written either way) and a three line slide whose title holds one stay as they are today under every rule.
