# 0008. Sparse OCR scans

**Date**: 2026-09-30
**Status**: Proposed

## Summary

Today a scan that has been through text recognition (OCR) but holds only a few lines is still named as a picture with no text over it, and a very short one is refused outright. So following RedactNest's own advice to run OCR never clears the warning. From now on a picture counts as read once text recognition left at least three readable characters in a row on it (in practice, one word): such scans open with the machine read note only, and download as `-redacted.pdf`. Visible text over a picture is judged as before, and a scan whose text layer holds only stray marks stays warned. Every OCR note also gains a sentence saying that words the recognition missed stay in the picture.

## Amends specs 0006 and 0007

Applied in place by the build (task 5).

- **Spec 0006.** AC-4's "bare" gains the machine read run (AC-1 to AC-3 here), and so does *Page findings*' preamble. AC-2 gains a sentence: a scan holding a machine read run is not bare, so a short OCR page is not `scanned` (AC-5 here). *Constants* gains `MACHINE_READ_RUN`. *Copy*'s `machine-read-text` line gains AC-9's sentence. *Critical test scenarios* gains the sparse scans. Its *Decision* bullet "Text over a picture means readable lines" gains the machine read run, and its *Value sourcing* rows for the readable character count (the stamp cap) and for a picture's footprint and bareness name it too. Its Follow-up on sparse OCR scans is ticked, met here. In `rationale.md`, the `STAMP_MAX_CHARS` row no longer calls "Signed John Smith" a stamp when it is machine read text: a stamp is visible text, or machine read text with no run.
- **Spec 0007.** Its *Amends* paragraph, which says spec 0006's Follow-up on sparse OCR pages "still stands", now says spec 0008 met it. Its Follow-up on the OCR advice is ticked: `ADVICE` keeps "may" (AC-10 here).

## Requirements

**User stories**:
- As a visitor with a short scanned letter, I want running it through OCR, as RedactNest advises, to let RedactNest read it, so the file is not called partly redacted for pages it can read.
- As a visitor with a one line scanned page, such as a signature page, I want it to open after OCR rather than be refused.
- As a visitor, I want a picture that OCR never read, or read only as stray marks, to stay named, so I never believe its words were checked.
- As a visitor with an OCR scan, I want to be told that words the recognition missed stay in the picture.

**Acceptance criteria**:

*The rule*

- **AC-1**: A picture (an image whose footprint holds at least `PICTURE_MIN_SHARE` of the grid points, spec 0006 AC-4) is not bare when it holds a machine read run. A run is `MACHINE_READ_RUN` (3) or more characters in a row on one line of the ordinary mode read (through `walkCharacters`, so counted in whole code points), each readable (spec 0006, AC-3), purely invisible (AC-2), and centred inside this picture's footprint. "Centred inside" means the centre of the character's quad (the four cornered box around it) passes the same footprint test AC-5 of spec 0006 uses, with the footprint cut to the clip in force. Anything else ends a run: whitespace, a character that is visible, unreadable or centred outside the footprint, and the end of a line. So a word straddling a picture's edge counts only its letters centred inside. A picture with no run is judged by spec 0006's line box coverage exactly as today.
- **AC-2**: A character is purely invisible when the drawing pass drew an invisible glyph (render mode 3, reported through `ignoreText`) at its origin within `POSITION_TOLERANCE`, and no filled, stroked or clipping glyph there. A clipping glyph is any glyph drawn as part of a clip (render modes 4 to 7), whatever was painted inside that clip, so the drawing reader records every one's origin, not only those in clips nothing was painted inside. So text drawn both invisible and visible at one place never counts. A glyph the ordinary read dropped (one a clip hides wholly, spec 0006 AC-7) has no character, so it never counts either.
- **AC-3**: The exemption is per picture. When one picture on a page holds a run and another does not, only the first stops being bare. A photo pasted onto an OCR scan page, where the text layer does not reach it, still makes the page `bare-picture`, beside `machine-read-text`. A scan stored as several strips is judged strip by strip, so a strip holding no run (a blank margin, or two letters of a word straddling the join) stays bare and names the page `bare-picture`: a recorded limit that fails safe.
- **AC-4**: The new exemption comes only from machine read text. Visible text over a picture is judged by spec 0006's line box coverage and `TEXT_OVER_PICTURE_MAX`, unchanged: the pasted ID card, the captioned photo and every slide of `read-slides.pdf` keep their findings.
- **AC-5**: `scanned` follows from bare, since it counts bare pictures. A page whose pictures all hold a run has no bare picture, so it is not `scanned`, whatever its readable character count. A short OCR page ("Signed John Smith", 15 readable characters, all machine read) is `machine-read-text` only, and a document made only of such pages opens rather than being refused `no-readable-text`. A stamped scan whose stamp is visible text (`read-stamped.pdf`) is still `scanned` and still refused. So is a scan whose text layer holds no run of 3 (only stray marks, or only words of one or two characters): it stays `scanned`, beside `machine-read-text`.
- **AC-6**: A tilt does not change the result. The same sparse text layer, written word by word the way Tesseract writes it (a `Tf` and a `Tz` per word), gives the same findings straight, on a baseline turned 1 degree, and on a page with `/Rotate 90`. Measured on the local scans on 2026-09-30: every OCR page holds a run of 13 to 26 characters, straight and crooked alike (`rationale.md`, *Evidence*).
- **AC-7**: A layered scan (a background image and a stencil mask drawn with `fillImageMask`, each over the whole page, with the text layer over both) is `machine-read-text` only, because each picture holds its own run.
- **AC-8**: Following the advice clears the warning. The same scan picture with no text layer is refused `no-readable-text`. With a short text layer holding a run, it opens with the all clear line and the machine read note, `isPartly` is false, detection lists the address in its layer (spec 0006, AC-12), and a cleaned copy is named `{stem}-redacted.pdf`.

*What the visitor sees*

- **AC-9**: The `machine-read-text` note line gains a last sentence. One page: "{Pages} is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the picture." Several pages: "{Pages} are scans with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the pictures." Every OCR page carries it, dense or sparse, in its place from spec 0006, AC-21.
- **AC-10**: `ADVICE` keeps its words: "Run this file through text recognition (OCR) first, then open the result here. That may let RedactNest read those pages." `bare-picture` and `scanned` also name photos on which OCR finds no word, so "may" stays true. Its code comment gives that reason in place of pointing at spec 0006's open Follow-up.

*Engine rules*

- **AC-11**: `MACHINE_READ_RUN` is an engine constant in `src/engine/inspect.ts`, beside `UNREADABLE_RUN`, commented as a rule about pages rather than a cap on the visitor (spec 0006, INV-7). `PAGE_FINDINGS`, `PageReading`, `PageInspection` and every shape that crosses the worker boundary are unchanged (spec 0006, INV-1). The run reads the characters `readText` already holds for the page to match glyphs, each with its `line`, so no more of the page's text is held, or held longer, than today (spec 0006, INV-8).
- **AC-12**: The search runs only where it can change a finding. It is skipped for a picture that passes the coverage test, and for a page with fewer than `MACHINE_READ_RUN` invisible glyphs, so a born digital page pays nothing. Whether a character qualifies (readable and purely invisible) does not depend on the picture, so it is decided once per page, the first time a picture needs it. Per picture only the footprint test runs, and the search stops at the first run. `tests/unit/cost.test.ts` keeps spec 0006's 2 seconds (AC-29) and gains a case that takes the search on every page: 50 dense OCR scan pages, each with a photo pasted away from its text layer, within the same 2 seconds of CPU.

*Real scans*

- **AC-13**: `/check verify` runs the engineer's local scans (simulated scans of made up data, kept outside the repository and never committed; `make-scans.py` beside them remakes them). `scan-straight.pdf` and `scan-crooked.pdf`, before OCR, are refused `no-readable-text`. `scan-straight-ocr.pdf` opens with the all clear line and AC-9's note, and no warning. `scan-crooked-ocr.pdf` opens the same, plus the crooked scan line (spec 0006, AC-25). A cleaned copy of each OCR scan is named `-redacted.pdf`.

## Decision

**Chosen option**: Option 1: a machine read run per picture (reasoning and the other options in `rationale.md`).

A picture stops counting as bare once a run of 3 or more readable, purely invisible characters sits inside its footprint on one line of the ordinary read. The same change carries `scanned` with it, so sparse and short OCR scans open with the machine read note, whose line now names what OCR may have missed. Settled with the engineer, each against a runner up:

- **The signal is a machine read run of 3** (the engineer's pick, leaning toward finding). Runner up: any single machine read character, which lets a stray `|` clear a warning.
- **Anything but a qualifying character breaks a run**, so a run is in effect a word of 3 or more. Runner up: spaces do not break it, which lets scattered noise on one line add up.
- **Per picture.** Runner up: per page, which would leave a photo pasted beside an OCR scan unnamed.
- **Short OCR pages follow the same rule and open.** Runners up: open them but keep warning, or keep refusing them.
- **Visible text over a picture is unchanged.** Runner up: runs of visible text also exempt, which would silence slides whose photo was never read.
- **Only purely invisible characters count.** Runner up: any invisible glyph at the origin, which lets a producer that draws text both ways clear the warning.
- **The machine read note gains a sentence for every OCR page** (the engineer's pick). Runner up: the note unchanged.
- **`ADVICE` keeps "may".** Runner up: "RedactNest can then read the words the text recognition finds."

Decided in writing (runner up in brackets):

- **The constant is `MACHINE_READ_RUN = 3` in `inspect.ts`**, a sibling of `UNREADABLE_RUN`, since both count characters in a row on one line. (Reusing `UNREADABLE_RUN`, which ties two unrelated rules to one number.)
- **The run reads the characters `readText` already collects** (each carries its `line`, origin, quad and code point) through `TextReading`, so nothing new is held and the page's text still lives for one page only (spec 0006, INV-8). (A second walk of the page's text for the run.)
- **Invisible origins are looked up through `originIndex` in `characters.ts`**, the index the glyph to character match already uses, so "at its origin" means the same thing in both. (A second tolerance search.)
- **One painted index serves both rules.** `concealedGlyphs` already indexes paints by origin (`byOrigin(drawing.paints)`); it moves up to `inspectPage`, is built at most once per page, and is asked alongside the new clipping glyph origins. (A second painted index.)
- **The drawing reader records every clipping glyph's origin** (`clipGlyphs`), not only those in clips nothing was painted inside (`clipOnly`, which stays for spec 0006's AC-7), so "no clipping glyph there" can be answered. (Recording a render mode 7 glyph beside an invisible one as a limit.)
- **The search is lazy and stops early** (AC-12): skipped when coverage passes or the page has fewer than `MACHINE_READ_RUN` invisible glyphs; each character's qualifying answer computed once per page, on first need; the first run ends the search. (Checking every picture, or deciding per picture.)
- **The run search is a pure function** (`machineReadRun` in `inspect.ts`) over the page's characters in reading order, a qualifying test and a footprint test, so its edges (2 against 3, a line end, a centre outside) are unit tested as plain logic in `tests/unit/reading-measures.test.ts`, reached the way that file already reaches the page measures. (Proving the edges through fixtures alone.)
- **The spec amends are a build task**, as spec 0007's were, so the amended words land with the code that makes them true.

No community skill shaped this design.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (in memory only, nothing stored or sent):

| Shape | Where | Change |
|---|---|---|
| `PAGE_FINDINGS`, `PageReading`, `DocumentSummary`, `RedactionOutcome` | `src/worker/protocol.ts` | none |
| `PageInspection` | `src/engine/types.ts` | none |
| `TextReading` | `src/engine/inspect.ts`, private | hands out the page's `characters` it already collects for glyph matching, in reading order, each with its `line` (no new data held) |
| `DrawingReading` | `src/engine/inspect.ts`, private | gains `clipGlyphs: readonly Point[]`, the origin of every glyph drawn as part of a clip (render modes 4 to 7), whatever was painted inside it; `clipOnly` is unchanged |
| `MACHINE_READ_RUN` | `src/engine/inspect.ts` | new constant, 3 |

**State transitions**: none. The open's order, the session machine and the refusal point are unchanged (spec 0006, *State transitions*).

**API surface** (module functions; there is no HTTP endpoint and no new message):

| Surface | Kind | Change | Output | Errors |
|---|---|---|---|---|
| `inspectPages(mupdf, pdf, isCancelled?)` | `src/engine/inspect.ts` | a picture holding a machine read run is not bare (AC-1 to AC-5) | the same `PageInspection[]`, with fewer `bare-picture` and `scanned` findings on OCR scans | unchanged |
| `open` worker message | `src/engine/open.ts` via the worker | none in code; a short OCR document now opens where it was refused | `result { summary, matches }` | `no-readable-text` no longer for a document whose pages all hold a run |
| `noteLines(summary, matches)` | `src/lib/page-findings.ts` | the `machine-read-text` line gains AC-9's sentence | strings | none |
| `ADVICE` | `src/lib/page-findings.ts` | comment only | unchanged | none |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| open | a character's readable flag | spec 0006, AC-3's definition over the code point from `walkCharacters` |
| open | a character's origin and quad centre | the ordinary mode read (`EXTRACTION_OPTIONS[0]`) through `walkCharacters`, per line |
| open | whether a character is purely invisible | `originIndex` over the drawing pass's invisible glyph origins (`DrawingReading.invisible`) finds one within `POSITION_TOLERANCE`, while the shared painted index (`byOrigin(drawing.paints)`) and the clipping glyph origins (`DrawingReading.clipGlyphs`) find none; computed once per page, on first need |
| open | whether the search runs at all | derived: the picture failed the coverage test, and `drawing.invisible.length` is at least `MACHINE_READ_RUN` |
| open | whether a character sits in a picture | its quad centre through `holds(footprint, centre)`, the footprint cut to the clip in force, as AC-5 of spec 0006 |
| open | whether a picture holds a run | `machineReadRun`: consecutive qualifying characters on one line centred in the footprint, reset by anything else and at each line's end, true at the first `MACHINE_READ_RUN` |
| open | bare, `bare-picture`, `scanned` | spec 0006's rules, with a picture holding a run left out of the bare pictures |
| open | the refusal | spec 0006, AC-10, unchanged, over the new findings |
| review | the machine read note line | `findingLine(summary, "machine-read-text")` in `src/lib/page-findings.ts`, one and several page forms per AC-9 |
| download | the file name | `outputNameFor(file.name, isPartly(summary))`, unchanged; a sparse OCR scan's summary now holds no warning |

**Key invariants**:

- **INV-1**: The new exemption comes only from purely invisible machine read text over the picture. Visible text clears a picture only through spec 0006's coverage rule, as before (AC-2, AC-4).
- **INV-2**: The run is counted along the read's own lines, never by area, so a line height or font size cannot change it, and a tilt changes it only if MuPDF groups a line's characters differently (AC-6).
- **INV-3**: Spec 0006's safety rules are untouched: a page with no readable character is still `scanned` or `drawn-only` or `blank`, and a document with nothing readable is still refused (spec 0006, AC-10, INV-9).
- **INV-4**: Nothing new crosses the worker boundary, and no finding carries text, a position or a count of characters (spec 0006, INV-1).

**Security model**: unchanged. An anonymous visitor, one tab, no server call, the same for every tier. The rule reads document content inside the worker only. It removes a warning on some pages, which is the direction that can mislead, so it counts only purely invisible readable text inside the picture itself, and the note says what OCR may have missed.

**Configuration required**: none. The constant lives in `src/engine` (spec 0006, INV-7).

**Critical test scenarios**:

- Sparse OCR: the sparse scan with one recognised sentence and the one reading "Signed John Smith" are `machine-read-text` only. Verifies **AC-1**, **AC-5**.
- At the threshold: a layer holding one three letter word ("Yes") is `machine-read-text` only; a layer of only one and two character words, and one of stray marks, each under 40 readable characters, stay `scanned` beside `machine-read-text`. Verifies **AC-1**, **AC-5**.
- Run edges, as plain logic: `machineReadRun` finds no run in 2 qualifying characters followed by a space, by a line end, by a visible character or by one centred outside the footprint, and finds one at exactly 3. Verifies **AC-1**, **AC-2**.
- Tesseract shaped and tilted: the sparse sentence written word by word with a `Tf` and a `Tz` each, straight, on a baseline turned 1 degree, and on a `/Rotate 90` page, is `machine-read-text` only on all three. Verifies **AC-1**, **AC-6**.
- Reverse pin: on every new sparse page, each character in a run meets an invisible glyph at its origin within `POSITION_TOLERANCE`. Verifies **AC-2**.
- Layered text: a sentence of 45 readable characters drawn twice in one font, size and place over a scan drawn first, once `Tr 3` and once `Tr 0`, stays `bare-picture`. Verifies **AC-2**.
- Clipped letter: "Yes" whose last glyph a rectangle clip hides wholly leaves a run of 2, so the page stays `scanned` beside `machine-read-text`, once a pin shows the ordinary read drops just that glyph. Verifies **AC-2**.
- Per picture: a photo pasted onto an OCR scan page, away from its text layer, gives `bare-picture` beside `machine-read-text`. Verifies **AC-3**.
- Strips: a scan stored as two strips side by side, its only word straddling the join with 2 letters over the narrower strip, gives `bare-picture` beside `machine-read-text` (the recorded limit, and a straddling word counted only inside). Verifies **AC-1**, **AC-3**.
- Unchanged: the ID card, the captioned photo, `read-slides.pdf` and `read-stamped.pdf` give what they gave before. Verifies **AC-4**, **AC-5**.
- Layered scan: a background image and a full page stencil mask under one text layer give `machine-read-text` only. Verifies **AC-7**.
- The advice works: `read-short-ocr.pdf` opens, its one page `machine-read-text` only, its address listed, `isPartly` false; `read-scans.pdf` is still refused. In a real browser (`tests/e2e/design-system.spec.ts`, beside the notes state), the short OCR file shows the all clear line and AC-9's note with no warning callout. Verifies **AC-5**, **AC-8**, **AC-9**.
- Copy: the note's one and several page forms, and `ADVICE` unchanged. Verifies **AC-9**, **AC-10**.
- Cost: the existing budget holds, and 50 dense OCR scan pages, each with a photo pasted away from its layer, take the search on every page within 2 seconds of CPU. Verifies **AC-12**.
- Real scans: AC-13's manual steps. Verifies **AC-6**, **AC-13**.

## Build plan

Ordered by Skateboard. The fix is small enough that slice 1 is the whole usable change: the rule, its fixtures, the note and the amends land together, because a rule without its words would show the old note on newly exempted pages. Slice 2 proves it on real scans.

**Slice 1: sparse OCR scans read as read**

1. Fixtures, through `scripts/lib/reading-fixtures.mjs` and `node scripts/make-fixture.mjs`, which regenerates `read-pictures.pdf`. Helpers first: `invisibleLine` gains options for its render mode and a text matrix (`Tm`), or gets siblings that do; `tesseractLayer` takes its lines as parameters instead of its fixed 20 rows; fonts join a page through the `fonts:` field, so no page carries two `/Font` keys. In `READ_PICTURES`, the sparse scan with one recognised sentence and the one with "Signed John Smith" now expect `["machine-read-text"]`. Append these pages, each over a full page scan unless it says otherwise, so every existing page keeps its index:
   - stray marks only (`| . ~ ,`, spaced), under 40 readable characters: `["scanned", "machine-read-text"]`
   - one and two character words only ("No 12 at 45"), under 40: `["scanned", "machine-read-text"]`
   - the one word "Yes": `["machine-read-text"]`
   - "Yes" under a rectangle clip that hides its last glyph wholly, so the ordinary read keeps two characters: `["scanned", "machine-read-text"]`
   - the sparse sentence through `tesseractLayer` (a `Tf` and a `Tz` per word), straight: `["machine-read-text"]`
   - the same on a baseline turned 1 degree: `["machine-read-text"]`
   - the same on a page with `/Rotate 90` (add rotation to the page helper if it takes none): `["machine-read-text"]`
   - layered text: "Signed for and on behalf of the company by its director" (45 readable characters) drawn after the scan, twice in `F1` at one size and one `Td`, first `Tr 3` then `Tr 0`: `["bare-picture", "machine-read-text"]`. If the ordinary read reports two characters at one origin, say so in the comment; the expectation holds either way
   - a photo pasted onto a scan under the full `ocrLayer()`, placed `q 300 0 0 100 156 10 cm` (6.2% of the page, below the layer's lowest line at y 132): `["bare-picture", "machine-read-text"]`
   - a scan stored as two strips side by side (200 pt and 412 pt wide, full height), its only layer word "Signed" placed so its first two letters centre over the left strip: `["bare-picture", "machine-read-text"]`
   - a layered scan: a full page `scanImage` background and a full page `stencilScan` mask under the sparse sentence: `["machine-read-text"]`

   Add `read-short-ocr.pdf` with its own builder and `make-fixture.mjs` entry: one page, a full page scan whose only layer is "Signed jo@example.com" (20 readable characters, under `STAMP_MAX_CHARS`). Satisfies **AC-1** to **AC-8**.
2. The rule in `src/engine/inspect.ts`:
   - `MACHINE_READ_RUN` with its comment
   - `TextReading` hands out the characters `readText` already collects, each with its `line`
   - the drawing reader records `clipGlyphs`, every clipping glyph's origin
   - `byOrigin(drawing.paints)` moves up from `concealedGlyphs` to `inspectPage`, built once and shared
   - invisible origins through `originIndex`
   - `machineReadRun`, pure and exported, over the characters, a qualifying test and a footprint test
   - in the picture loop, a picture that fails the coverage test is searched before it counts as bare, with AC-12's guard, the per page qualifying answers computed on first need, and an early stop

   Comments name this spec's ACs beside spec 0006's AC-2 and AC-4. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-11**, **AC-12**.
3. Tests.
   - `tests/unit/reading.test.ts`: first, the pin that the ordinary read drops only the clipped "s" (if it drops more or less, choose a clip that leaves exactly two characters and say why in the fixture); the `READ_PICTURES` table; the reverse pin (every character in a run on the new sparse pages meets an invisible glyph); `read-short-ocr.pdf` opens through `openDocumentWith` with `machine-read-text` only, its address found, and `isPartly` false on its summary; `read-scans.pdf`, `read-stamped.pdf` and `read-slides.pdf` unchanged.
   - `tests/unit/reading-measures.test.ts`: `machineReadRun` at its edges.
   - `tests/unit/cost.test.ts`: the new case, built in the test, least of three passes as the existing case measures.
   - `tests/e2e/design-system.spec.ts`, beside the notes state: `read-short-ocr.pdf` shows the all clear line and AC-9's note, and no warning callout.

   Satisfies **AC-1** to **AC-8**, **AC-12**.
4. The words in `src/lib/page-findings.ts`: both forms of the `machine-read-text` line, and the `ADVICE` comment. Update `tests/unit/page-findings.test.ts` and `tests/component/tool-client.test.tsx`. Satisfies **AC-9**, **AC-10**.
5. The amends to specs 0006 and 0007, as *Amends* says. Satisfies **AC-1**, **AC-5**, **AC-9**, **AC-10**.

**Slice 2: real scans**

6. Run `/check verify` for this spec on the local scans, per AC-13, and record the findings in this spec's `verify.md`. Satisfies **AC-6**, **AC-13**.

## Consequences

**Positive**:
- Following the OCR advice now clears the warning whenever recognition reads a word on each picture, so the advice line finally does what it suggests.
- Sparse and short OCR scans open with a note and download as `-redacted.pdf`, like dense ones. A signature page after OCR is no longer refused.
- A tilt no longer flips a scan between two different warnings for the same content.
- One rule fixes both the `bare-picture` and the `scanned` misfire, with no new finding, no protocol change and no new cost on pages without pictures.

**Negative / tradeoffs**:
- OCR noise that happens to form a run of 3 on a photo (`lll`, `~~~`) clears that photo's warning. The note still says only recognised text is found.
- One recognised word over a picture full of words OCR missed, such as handwriting, clears `bare-picture` for it. The note's new sentence is the whole answer, and the file is named `-redacted.pdf`.
- A crafted file can clear a photo's warning by drawing invisible text over it. This is a recorded limit, in the same family as spec 0006, INV-9.
- Spec 0006's recorded choice that a short OCR page is a stamp is reversed: such a page now opens, where it was refused.
- Some real sparse layers still never form a run and stay warned, all failing safe: a scan stored as strips needs a run on each strip (AC-3); characters that come from replacement text (`/ActualText`) or vertical writing may not sit at a glyph's origin; and words in an unmapped font are unreadable. Only Tesseract's layer shape is pinned, straight, tilted and rotated.
- The note grows by a sentence on every OCR page, dense ones included.

**Neutral**:
- `pagesByFinding` will count fewer `bare-picture` and `scanned` pages and the same `machine-read-text` pages. No kind is added or removed.
- Two expectations in `READ_PICTURES` change, and the fixture set grows by eleven pages and one document.
- The drawing reader gains one list (`clipGlyphs`), and `concealedGlyphs` now receives its painted index instead of building it.

## Follow-up

- [ ] Record for `/sync`: `MACHINE_READ_RUN` among the page reading's thresholds in `src/engine/AGENTS.md`, and the rule that the machine read exemption counts only purely invisible text over the picture.
- [ ] Feature 16's security page says that a picture counts as read once OCR left a word of 3 or more on it, and that words OCR missed stay in the picture.
