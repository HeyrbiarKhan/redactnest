# 0010. Dense text layers over pictures

**Date**: 2026-10-01
**Status**: Proposed

## Summary

Today a picture loses its warning once any text lines cover 5% of it, whatever those lines hold and whichever picture they belong to. So a photo pasted onto a dense OCR scan (a scan run through text recognition) is cleared by the scan's hidden text layer, and a scan whose only hidden text is junk such as `|||` from table borders is cleared although no word was read. From now on, hidden machine read text clears a picture only through spec 0008's run (a word of 3 or more letters or numbers over that picture alone), and the area test counts only visible lines that hold a letter or number and are drawn where the text says. Both cases are now named, and the warning's words say plainly that RedactNest can't read the picture. A page can only gain a warning or move to a stronger one: nothing named today goes unnamed.

## Amends specs 0006 and 0008

Applied in place by the build (task 5).

- **Spec 0006.** The *Summary* names "a large picture it cannot read" for "a large picture with no text over it". *Page findings*' preamble defines "bare" by this spec's AC-1 and AC-2: the boxes of lines that count (visible lines of words, every readable character drawn where the text says) hold under `TEXT_OVER_PICTURE_MAX` of the picture's points, and the picture holds no machine read run. AC-4's first sentence says "with visible lines of words over less than `TEXT_OVER_PICTURE_MAX` of it" for "with text over less than", and its "an OCR scan whose text layer covers the page is not" becomes "an OCR scan whose layer holds a word over the scan alone is not (spec 0008)". The *Decision* bullet "Text over a picture means readable lines" is rewritten to AC-1 and AC-2 here. The *Constants* row for `TEXT_OVER_PICTURE_MAX` says it judges visible lines of words only. The *Value sourcing* row for a picture's footprint and bareness names `coverageLines`, and the row for readable characters, unreadable runs and line boxes adds that which lines count also reads the drawing pass (`coverageLines`, AC-1 here). *Copy*'s `bare-picture` line takes AC-9's words. *Critical test scenarios*: the sparse OCR line's last clause ("a photo pasted onto a dense OCR layer that covers a third of it is `machine-read-text` only, as before spec 0008 (its recorded limit)") now gives `bare-picture` beside `machine-read-text` (spec 0010), and a line for this spec's pages joins it. In `rationale.md`, the `TEXT_OVER_PICTURE_MAX` row reads "a scan under a full OCR layer, in either order, is not bare because its layer holds words (spec 0008's run), not because of its area (spec 0010)".
- **Spec 0008.** The *Summary*'s sentences on the coverage test's recorded limit say spec 0010 closed it. User story 3's last sentence ("This holds while those lines cover less than …") goes, since it now holds however dense the layer. AC-1's last sentence ("A picture with no run is judged by spec 0006's line box coverage exactly as today") becomes "… by spec 0006's coverage, which since spec 0010 counts only visible lines of words". AC-3's sentences on a layer covering at least `TEXT_OVER_PICTURE_MAX` of the photo say the photo is now named (spec 0010, AC-3). AC-4's "judged by spec 0006's line box coverage and `TEXT_OVER_PICTURE_MAX`, unchanged" gains "which since spec 0010 counts only visible lines of words". The *Decision* bullet "A photo that a dense text layer covers by at least `TEXT_OVER_PICTURE_MAX` …" and the *Critical test scenarios* line "The recorded limit" each say spec 0010 met it and page 28 now gives `bare-picture` beside `machine-read-text`. In *Consequences*, the Positive bullet beginning "Punctuation and format characters" loses its last sentence ("Only a layer dense enough for spec 0006's coverage test still clears a picture (see *Negative*)"), and the Negative bullet beginning "A picture whose text lines cover at least `TEXT_OVER_PICTURE_MAX` of it" says spec 0010 met it. Its third *Follow-up* item is ticked, met by spec 0010.

## Requirements

**User stories**:
- As a visitor with a photo pasted onto an OCR scan, I want the photo named however dense the scan's text layer is, because that layer describes the scan, not the photo, so I never believe the photo's words were checked.
- As a visitor with a scanned form or table that OCR read only as rules and marks, I want it named, because no word on it was read.
- As a visitor with a picture behind rows of typed underscores or dots, I want it named, because those rows say nothing about what the picture holds.
- As a visitor with a dense OCR scan whose layer holds words, I want it to open with the machine read note only, as it does today.

**Acceptance criteria**:

*The rule*

- **AC-1**: A picture's coverage (spec 0006, AC-4) counts only the boxes of lines that count. A line of the ordinary read counts when all three hold: it holds at least one letter or number (`\p{L}` or `\p{N}`, the characters `runStep` answers `"counts"` for, spec 0008 AC-14); every readable character on it (spec 0006, AC-3) has a drawn glyph at its origin within `POSITION_TOLERANCE`; and no readable character on it has an invisible glyph (render mode 3) there. A drawn glyph is spec 0008's: a filled, stroked or clipping glyph. Every other line counts for nothing, visible or hidden: a line of machine read text; a line mixing hidden and drawn characters; text drawn invisible and visible at one place; a line holding a readable character that matches no glyph at all; and a line of only punctuation, symbols, format characters or unreadable characters. Whitespace and unreadable characters are not asked whether they match. `TEXT_OVER_PICTURE_MAX` (0.05), the grid and a line's box (the union of its characters' quads) are unchanged.
- **AC-2**: Machine read text clears a picture only through spec 0008's run (its AC-1 to AC-3 and AC-14 to AC-16), on every page, dense or sparse. Every committed page keeps its findings except page 28 (AC-3). Each dense OCR fixture's layer holds a run over its scan alone, so its scan stays cleared: `ocr-aligned.pdf`, `ocr-misaligned.pdf`, `ocr-bare.pdf`, `read-crooked.pdf` page 1, `read-hidden.pdf` page 10, `trim-edge.pdf` page 1, `trim-ocr.pdf`, and `read-pictures.pdf` pages 5, 6 and 17. Page 23's small scan is now bare too (text over two different pictures clears neither), and its findings are unchanged.
- **AC-3**: A photo pasted onto a dense OCR scan whose layer runs over it is `bare-picture` beside `machine-read-text`, whichever is drawn first. Page 28 (the photo, then the layer) changes from `machine-read-text` only, and page 29 (the layer, then the photo, as an editor appends a pasted photo) gives the same. The scan stays cleared by the words over it alone.
- **AC-4**: A dense hidden layer holding no word no longer clears its scan: six lines of `|` (page 30) and six lines of `|l|I|1` junk, which holds letters and numbers but never 3 in a row (page 31), each covered 6.4% of the scan's grid points and cleared it before this spec, and each is now `bare-picture` beside `machine-read-text`.
- **AC-5**: Visible text keeps clearing a picture by area when its lines hold words and are drawn where the text says. A picture under visible lines that hold no letter or number is bare: six rows of typed underscores over a scan (page 34, 9.4% before this spec) are `bare-picture`, and the same rows each led by "Name" (page 35) clear it, with no finding. `read-slides.pdf`, the ID card, the captioned photo and every other committed page keep their findings.
- **AC-6**: A visible line holding a readable character at no glyph's origin counts for nothing. Measured: MuPDF gives such characters for replacement text (`/ActualText`) wrapped around its own text object when it holds more characters than the glyphs, and for the last character of a column of vertical writing; replacement text the same length as its glyphs, and a ligature whose replacement text sits inside its line's text object, match every character. Hidden layers give them in the same shapes. 24 visible lines whose replacement text adds a word (page 36, 7.8% before this spec) are `bare-picture`; the same lines with replacement text equal to the glyphs (page 37) clear it, with no finding.
- **AC-7**: Three shapes are recorded limits, each failing safe. A dense scan stored as a page background plus smaller pieces, each a picture of its own (one kind of MRC compression), whose words lie over a piece and the background, is `bare-picture` beside `machine-read-text` (page 32), because text over two pictures of different footprints clears neither (spec 0008, AC-16); full page layers share one footprint and stay cleared (spec 0008, AC-7). A dense hidden layer in vertical writing is `bare-picture` beside `machine-read-text` (page 33), because MuPDF reads each vertical character as a line of its own, so no run forms. A photo pasted onto a scan before OCR, whose own words OCR read, is `bare-picture` beside `machine-read-text`, because nothing on the page says whose words they are (AC-12's real scan step shows it; a fixture would be page 28 again).
- **AC-8**: `scanned`'s rule is unchanged: fewer than `STAMP_MAX_CHARS` readable characters over bare pictures holding `SCAN_MIN_SHARE` of the page. A junk layer is readable, so a full page scan under 40 or more junk characters is `bare-picture`, opens, and is named partly redacted; under 40, it is `scanned`. The pin at `reading.test.ts` (*counts punctuation toward the stamp cap*) keeps both sides. Since a picture the area test cleared can now be bare, a page holding fewer than 40 readable characters (a few large junk characters with no word, say) can turn `scanned` where it was clear, or where it was `bare-picture` through a second picture: a stronger warning, never a weaker one. A document made only of such pages is now refused `no-readable-text` where it opened before. A full page scan under a few large hidden junk characters, fewer than 40, whose lines covered more than 5% of it before this spec, is `scanned` beside `machine-read-text`.

*What the visitor sees*

- **AC-9**: The `bare-picture` line says the picture can't be read, true whether or not text lies over it. One page: "{Pages} has a picture RedactNest can't read. Words inside a picture can't be found or removed." Several pages: "{Pages} have pictures RedactNest can't read. Words inside a picture can't be found or removed." `ADVICE` keeps its words. No finding kind is added or removed, and `PAGE_FINDINGS` keeps its order.

*Engine rules*

- **AC-10**: `PAGE_FINDINGS`, `PageReading`, `PageInspection` and every shape that crosses the worker boundary are unchanged (spec 0006, INV-1). No constant is added: the rule is defined by `runStep`, `isReadable` and `POSITION_TOLERANCE`, and `TEXT_OVER_PICTURE_MAX` keeps its value, its comment saying it judges visible lines of words only. The line decision reads the characters `readText` already holds for the page (spec 0006, INV-8) and adds a flag per line, never text. The two lookups it asks, the invisible origin index and the sorted list of drawn glyph origins, are the ones spec 0008's `machineReadTest` already builds, now built once in `inspectPage` and shared, each dropped with the page.
- **AC-11**: A page with no picture (`pictures.length` is 0, so a small logo alone pays nothing) pays nothing new. On a page with a picture, the invisible origin index and the drawn origin list are each built once, after the pictures are gathered, and `machineReadTest` uses the same two. `tests/unit/cost.test.ts` keeps spec 0006's 2 seconds of CPU: its three existing cases still pass (their scans now take the run search, which stops at the first word), and a fourth case takes the slowest path. Each of its 50 pages draws about 2,000 visible Helvetica glyphs in lines of typed text over the top half, as the third case does; a scan over the bottom half (`q 612 0 0 396 0 0 cm`) under a dense hidden layer that forms no run (37 lines in the glyphless font at 9 pt, from x 60, baselines y 380 down to 20 in steps of 10, each reading "No 12 at 45 an if so up to me we go by it on as or is", about 2,000 glyphs); and a 300 by 300 pt photo over the layer (`q 300 0 0 300 156 50 cm`). So every line is judged against both lookups, both pictures fail the area test and are searched to the end, and every character's step is asked. Each page gives `["bare-picture", "machine-read-text"]`. If any case goes over 2 seconds, profile it and bring the measurement to `/architect`; the build never raises the budget.

*Real scans*

- **AC-12**: `/check verify` runs new local dense scans: made up data, kept outside the repository and never committed, made by the same scan maker as the others. `scan-dense-ocr.pdf` (a dense page after OCR) opens with the machine read note only. `scan-dense-photo-after.pdf` (the same, with a photo of a made up card pasted as its own image after OCR) names the photo: `bare-picture` beside the note. `scan-dense-photo-before.pdf` (the photo pasted before OCR, so OCR read its words) names it too, AC-7's limit. `scan-table-ocr.pdf` (a ruled table with words in its cells) opens with the note only. `scan-form-ocr.pdf` (a ruled form with empty cells) is never the note only: `bare-picture`, `scanned` or refused, whatever its layer holds. `verify.md` records, per scan, the pictures, the hidden glyphs, the longest run, the hidden lines holding no letter or number, and the findings; the empty form's actual findings are recorded whatever they are. The dense page's layer holds over 500 hidden glyphs, or a denser source page is used. The four local scans from spec 0008 give what its AC-13 says.

## Decision

**Chosen option**: Option 1: only the run judges machine read text, and the area test counts only visible lines of words drawn where the text says (reasoning and the other options in `rationale.md`).

Coverage stops being a stand in for "OCR read this picture". Hidden text is judged by the one question spec 0008 already asks of it, a word over this picture alone; visible text keeps spec 0006's area test, minus lines with no word and lines whose characters the page does not draw. Settled with the engineer, each against a runner up:

- **A new spec amending 0006 and 0008.** Runner up: update 0008 in place, which mixes two builds in a shipped record.
- **Only the run judges machine read text.** Runners up: AC-16's veto and a letter filter inside the area test, which still lets `|l|I|` junk clear a scan; the veto alone; recording both cases as limits.
- **Visible lines count only when they hold a letter or number.** Runners up: visible lines unchanged; a word of 3 required, which would stop "No 12" counting.
- **A junk only scan is `bare-picture`; the stamp cap is unchanged.** Runners up: the cap counts letters and numbers only, so junk scans are `scanned` and a document of them is refused; hidden junk alone leaves the count.
- **The `bare-picture` line says RedactNest can't read the picture.** Runners up: the words unchanged, now untrue under an OCR or junk layer; "no readable text over it".
- **A line counts only when every readable character on it matches a drawn glyph and none a hidden one** (the engineer's rule, kept because hidden layers do give unmatched characters, measured). Runners up: only a hidden character takes a line out, which counts a hidden layer's unmatched characters as visible text; a line leaves only when all its characters are hidden.
- **MRC pieces and a photo pasted before OCR are recorded limits.** Runner up: a masked or stencil piece inside an opaque picture shares its footprint, which also clears a cut out photo pasted onto a scan.
- **Dense vertical OCR is a recorded limit.** Runners up: count runs down columns of one character lines, which changes spec 0008's run; keep area for hidden vertical lines, which keeps a photo under them cleared.
- **Dense scans are measured on new local scans.** Runners up: fixtures and the cost test only; scans the engineer supplies.

Decided in writing (runner up in brackets):

- **A drawn glyph is spec 0008's: filled, stroked or clipping**, read from `drawing.paints` (which leaves out a soft mask's own content) and `drawing.clipGlyphs`. (Only glyphs that show, by spec 0006 AC-7's `shows`, which would also name a scan under an OCR layer drawn at zero opacity; such a page already carries `hidden-text`, and judging every glyph's paint over a picture costs a backdrop search per character.)
- **The line decision is a pure function, `coverageLines(characters, isDrawn, isHidden)` in `inspect.ts`**, over the characters `readText` already holds, answering the set of line numbers that count, so its edges are unit tested as plain logic as `machineReadRun`'s are. (Deciding inside `readText`, which runs before the drawing reader and cannot see glyphs.)
- **`TextReading.readableLines` gives way to `lineBoxes: ReadonlyMap<number, Rect>`**: each line's box by its line number, finite boxes only, built as today. (Two lists, which `readText` would have to keep in step; or an array with holes.)
- **The two lookups `machineReadTest` builds today are hoisted to `inspectPage` and built once**: the invisible `originIndex` over `drawing.invisible`, and the sorted `DrawnOrigins` list over the origins of `drawing.paints` and `drawing.clipGlyphs` (spec 0008, AC-15). `isDrawn` asks that list for an origin within `POSITION_TOLERANCE` on each axis (a binary search on x, then a check of y), so one structure holds the drawn origins. Both are built after the pictures are gathered, only when `pictures.length > 0`, and passed to `coverageLines`' predicates and to `machineReadTest`. (A third structure, a drawn `originIndex`, beside the sorted list; or building each lookup per use, which builds the invisible one twice on every OCR page.)
- **`TEXT_OVER_PICTURE_MAX` stays 0.05.** Nothing measured asks to move it: the slides sit at about 3% and stay bare, dense visible text sits far above, and the new fixture pages sit at 6.4% to 9.4% before this spec. (Lowering it now that only visible lines count.)
- **The fixture pages are appended to `READ_PICTURES` as pages 29 to 37**, and page 28's expectation changes in place, so every other page keeps its index.
- **The spec amends are a build task**, as specs 0007 and 0008 did them, so the amended words land with the code that makes them true.

No community skill shaped this design.

## Rationale

Reasoning, options and the measurements: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (in memory only, nothing stored or sent):

| Shape | Where | Change |
|---|---|---|
| `PAGE_FINDINGS`, `PageReading`, `DocumentSummary`, `RedactionOutcome` | `src/worker/protocol.ts` | none |
| `PageInspection` | `src/engine/types.ts` | none |
| `TextReading` | `src/engine/inspect.ts`, private | `readableLines: readonly Rect[]` gives way to `lineBoxes: ReadonlyMap<number, Rect>`: each line's box (the union of its characters' quads) by its line number, finite boxes only. `characters` is unchanged. `inspectPage` is the only reader of `readableLines` today |
| `coverageLines` | `src/engine/inspect.ts`, exported through `src/engine/index.ts` for tests | new pure function: `(characters: readonly Pick<Character, "line" \| "code" \| "origin">[], isDrawn: (origin: Point) => boolean, isHidden: (origin: Point) => boolean) => ReadonlySet<number>`, the lines that count (AC-1) |
| the invisible origin index and the drawn origin list | `inspectPage`, private | the `originIndex` over `drawing.invisible` and the sorted `DrawnOrigins` list over `drawing.paints` and `drawing.clipGlyphs`, both built today inside `machineReadTest`, now built once in `inspectPage` after the pictures are gathered, only when `pictures.length > 0`, and passed to `machineReadTest` and to `coverageLines`' predicates |
| `isDrawnAt(drawn, origin)` | `src/engine/inspect.ts`, private | new: is a drawn origin within `POSITION_TOLERANCE` of `origin` on each axis (`firstAtLeast` on x, then a check of y); a non finite origin answers no |
| `TEXT_OVER_PICTURE_MAX` | `src/engine/inspect.ts` | value unchanged; comment rewritten (AC-10) |
| the `bare-picture` line | `src/lib/page-findings.ts` | AC-9's words |

**State transitions**: none. The open's order, the session machine and the refusal point are unchanged (spec 0006, *State transitions*).

**API surface** (module functions; there is no HTTP endpoint and no new message):

| Surface | Kind | Change | Output | Errors |
|---|---|---|---|---|
| `inspectPages(mupdf, pdf, isCancelled?)` | `src/engine/inspect.ts` | coverage counts only the lines AC-1 lets count | the same `PageInspection[]`, with `bare-picture` on the pages AC-3 to AC-7 name | unchanged |
| `coverageLines(characters, isDrawn, isHidden)` | `src/engine/inspect.ts`, new | pure | the set of line numbers that count | none; a character whose origin is not finite matches nothing, so its line does not count |
| `open` worker message | `src/engine/open.ts` via the worker | none in code | `result { summary, matches }` | `no-readable-text`'s rule unchanged; a document made only of pages that now turn `scanned` is refused (AC-8) |
| `noteLines(summary, matches)` | `src/lib/page-findings.ts` | the `bare-picture` line takes AC-9's words | strings | none |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| open | whether a character is a letter or number | `runStep(code) === "counts"` over the code point from `walkCharacters` (spec 0008, AC-14) |
| open | whether a character is readable | `isReadable(code)` (spec 0006, AC-3), unchanged |
| open | whether a character has a drawn glyph at its origin | `isDrawnAt` over the sorted `DrawnOrigins` list (the origins of `drawing.paints` and `drawing.clipGlyphs`), within `POSITION_TOLERANCE` on each axis; the same list `machineReadTest` asks for its reach |
| open | whether a character has an invisible glyph at its origin | `originIndex` over `drawing.invisible` finds one within `POSITION_TOLERANCE`; the same index `machineReadTest` asks |
| open | the lines that count | `coverageLines`: a line holding a letter or number, every readable character on it drawn, none hidden (AC-1); asked only when `pictures.length > 0` |
| open | each counting line's box | `TextReading.lineBoxes.get(line)` for each line `coverageLines` returns: the union of its characters' quads, finite boxes only, as `readText` builds it today |
| open | a picture's coverage | the grid points the picture holds that lie inside a counting line's box, against `TEXT_OVER_PICTURE_MAX` of the points it holds |
| open | whether a picture is bare | coverage under the bar and no machine read run (`machineReadRun`, spec 0008, unchanged); the search still runs only after coverage fails and on a page with at least `MACHINE_READ_RUN` invisible glyphs (spec 0008, AC-12) |
| open | `bare-picture`, `scanned`, the refusal | spec 0006's rules, unchanged, over the new bareness (AC-8) |
| review, download | the `bare-picture` line | `findingLine(summary, "bare-picture")` in `src/lib/page-findings.ts`, AC-9's one and several page forms |
| download | the file name | `outputNameFor(file.name, isPartly(summary))`, unchanged |

**Key invariants**:

- **INV-1**: Machine read text never counts toward a picture's coverage. It clears a picture only through spec 0008's run, so one rule judges hidden text on every page, dense or sparse (AC-1, AC-2).
- **INV-2**: This spec only takes lines out of the coverage test, never adds one, so no picture loses a warning it has today. A page can only gain a warning or move from `bare-picture` to `scanned`, the stronger one (AC-8). Measured on every committed fixture, all synthetic, and the local OCR scans (`rationale.md`, *Evidence*).
- **INV-3**: A line counts only when the page draws, where the text says, every readable character on it. A character the ordinary read gives at no glyph's origin cannot make a line count, wherever it came from (AC-1, AC-6).
- **INV-4**: Nothing new crosses the worker boundary, no finding carries text, a position or a count, and no text is held longer than today (spec 0006, INV-1 and INV-8).
- **INV-5**: Spec 0006's safety rules are untouched: the stamp cap, `scanned`, the refusal and the other findings judge by the same rules as before, over the new bareness (AC-8).

**Security model**: unchanged. An anonymous visitor, one tab, no server call, the same for every tier. The rule reads document content inside the worker only. It can only add warnings, the direction that never misleads a visitor into trusting a file.

**Configuration required**: none. The rule adds no constant (spec 0006, INV-7).

**Critical test scenarios**:

- Dense photo: page 28 (photo, then layer) and page 29 (layer, then photo) are `bare-picture` beside `machine-read-text`. Verifies **AC-2**, **AC-3**.
- Dense junk: page 30 (`|`) and page 31 (`|l|I|1`) are `bare-picture` beside `machine-read-text`. Verifies **AC-1**, **AC-4**, **AC-8**.
- Every OCR fixture keeps its findings: the `READ_PICTURES` rows for pages 1 to 27, and the existing tests for `ocr-*.pdf`, `read-crooked.pdf`, `read-hidden.pdf`, `trim-edge.pdf`, `trim-ocr.pdf` and `read-short-ocr.pdf`. Verifies **AC-2**, **AC-5**.
- Visible rows: page 34 (underscores) is `bare-picture`; page 35 (each led by "Name") has no finding. Verifies **AC-1**, **AC-5**.
- Unmatched characters: page 36 is `bare-picture`, page 37 has no finding, and a pin shows the ordinary read gives readable characters at no glyph's origin on every line of page 36 and on none of page 37. Verifies **AC-1**, **AC-6**.
- Limits: page 32 (MRC pieces) and page 33 (vertical layer) are `bare-picture` beside `machine-read-text`, and a pin shows every line of page 33's ordinary read holds one character. Verifies **AC-7**.
- `coverageLines` as plain logic: a line of only punctuation does not count; one drawn letter does; a drawn letter with an unmatched comma does not; a drawn letter with a hidden letter does not; unmatched whitespace and an unmatched U+FFFD leave a line counting; a lone combining mark does not; a line of only format characters does not; a format character matching no glyph on a line with a drawn letter stops the line counting; a digit and a CJK letter do; each line is judged alone. Verifies **AC-1**.
- Stamp cap: the existing pin holds both sides. A full page scan under a few large hidden junk characters, fewer than 40, whose lines covered more than 5% of it before this spec, is `scanned` beside `machine-read-text`. Verifies **AC-8**.
- Copy: the `bare-picture` line's one and several page forms; `ADVICE` unchanged. Verifies **AC-9**.
- Cost: the three existing cases and the fourth within 2 seconds of CPU. Verifies **AC-11**.
- Real scans: AC-12's steps. Verifies **AC-7**, **AC-12**.

## Build plan

Ordered by Skateboard. The fix is small enough that slice 1 is the whole usable change: the rule, its fixtures, the words and the amends land together, because the rule names pages whose old `bare-picture` line ("no text over it") would be untrue there. Slice 2 measures it on real dense scans.

**Slice 1: dense layers judged by their words**

1. Fixtures, through `scripts/lib/reading-fixtures.mjs` and `node scripts/make-fixture.mjs`, which regenerates `read-pictures.pdf`. `glyphlessFont(add, { vertical })` gains an option that writes `/Encoding /Identity-V` in place of `/Identity-H`, with the same `ToUnicode` map; `readPictures` calls it a second time for page 33. In `READ_PICTURES`, page 28 keeps its name ("a photo pasted onto a dense OCR layer"), its findings become `["bare-picture", "machine-read-text"]`, and its comment drops "Accepted, and taken up as scope feature 20" for this spec's AC-3. Append these pages, each over `fullPage("Scan")` unless it says otherwise, so every other page keeps its index. Each page that draws hidden text takes `fonts` (the glyphless `/Fg`); each comment gives the share of the scan's grid points its lines covered before this spec, as measured:
   - 29, "a photo pasted onto a dense OCR layer, drawn after it": resources `/XObject << /Scan … /Photo … >>`; `ocrLayer()`, then the photo `q 300 0 0 300 156 300 cm /Photo Do Q`: `["bare-picture", "machine-read-text"]` (18.6% of the scan, 35.2% of the photo)
   - 30, "a scan whose dense layer is rows of bars": six hidden lines of 70 `|`, `invisibleLine(12, 60, y, …)` for y 700, 668, 636, 604, 572 and 540: `["bare-picture", "machine-read-text"]` (6.4%; three such lines covered 3.2% and were already bare)
   - 31, "a scan whose dense layer is bars, letters and digits with no word": the same six lines of `"|l|I|1".repeat(12).slice(0, 70)`: `["bare-picture", "machine-read-text"]` (6.4%)
   - 32, "a dense scan stored as a background and two pieces": resources `/XObject << /Scan … /Mask … >>` with `stencilScan`; then `0 0 0 rg`, the pieces `q 420 0 0 320 50 436 cm /Mask Do Q` and `q 420 0 0 320 50 116 cm /Mask Do Q`, then `ocrLayer()`, every line of which lies over a piece and the scan: `["bare-picture", "machine-read-text"]` (18.6% of the scan, 31.5% and 35.0% of the pieces)
   - 33, "a scan with a dense layer in vertical writing": fonts `/Fv ${glyphlessFont(add, { vertical: true })} 0 R`; ten columns `BT 3 Tr /Fv 12 Tf x 740 Td <…> Tj ET` for x 80 to 512 in steps of 48, each reading "Recognised words down the page" (260 readable characters): `["bare-picture", "machine-read-text"]` (6.1%)
   - 34, "a scan behind rows of typed underscores": six visible rows `line("F1", 12, 72, y, "_".repeat(70))` for y 700 down to 540 in steps of 32: `["bare-picture"]` (9.4%)
   - 35, "a scan behind rows of typed underscores, each led by a word": the same rows, each `Name ` and 64 underscores: `[]`
   - 36, "a scan behind lines whose replacement text adds a word": 24 lines for y 740 down to 96 in steps of 28, each `/Span << /ActualText (Payment received by) >> BDC\n` + `line("F1", 12, 60, y, "Payment received")` + `EMC\n`: `["bare-picture"]` (7.8%)
   - 37, "a scan behind lines whose replacement text matches its glyphs": the same with `(Payment received)`: `[]`

   Satisfies **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**.
2. The rule in `src/engine/inspect.ts`:
   - `coverageLines`, pure and exported, beside `machineReadRun`: walks the characters in reading order (a line's characters are contiguous), and keeps a line when it holds a character `runStep` counts, and every character `isReadable` accepts is drawn and none hidden
   - `readText` builds `lineBoxes: ReadonlyMap<number, Rect>`, finite boxes only, in place of `readableLines`
   - `isDrawnAt`, private, beside `withinReach`: a drawn origin within `POSITION_TOLERANCE` on each axis, through `firstAtLeast` on x and a check of y
   - `inspectPage`, in this order: gather the pictures, as now. When `pictures.length > 0`, build the invisible `originIndex` and the `DrawnOrigins` list (hoisted from `machineReadTest`), call `coverageLines(text.characters, (origin) => isDrawnAt(drawn, origin), (origin) => invisible.find(origin) !== null)`, and mark `underText` from `text.lineBoxes` for each line it returns; then make `machineReadTest` with the two lookups and judge each picture as now. A page with no picture skips all of it
   - `machineReadTest` takes the invisible index and the `DrawnOrigins` list from `inspectPage` instead of building them
   - `TEXT_OVER_PICTURE_MAX`'s comment says it judges visible lines of words only, and machine read text clears a picture only through a run
   - `src/engine/index.ts` exports `coverageLines` for the tests

   Comments name this spec's AC-1 and AC-2 beside spec 0006's AC-4 and spec 0008's AC-1. Satisfies **AC-1**, **AC-2**, **AC-8**, **AC-10**, **AC-11**.
3. Tests.
   - `tests/unit/reading.test.ts`: the `READ_PICTURES` table with page 28 changed and pages 29 to 37; a pin that on page 36 every line of the ordinary read holds a readable character with no drawn or invisible glyph at its origin, and on page 37 none does (if MuPDF places them otherwise, choose replacement text that leaves characters unmatched and say so in the fixture); a pin that every line of page 33's ordinary read holds one character; beside the stamp cap pin, a full page scan under three hidden lines of 13 `|` at 60 pt, built in the test through `scanUnder` (39 readable characters; if its lines cover under 5% of the scan, raise the size until they do not and say so), gives `["scanned", "machine-read-text"]` (AC-8). The existing tests for `ocr-*.pdf`, `read-crooked.pdf`, `read-hidden.pdf`, `trim-edge.pdf`, `trim-ocr.pdf`, `read-short-ocr.pdf`, `read-slides.pdf` and the stamp cap pass unchanged.
   - `tests/unit/reading-measures.test.ts`: `coverageLines` at its edges, as *Critical test scenarios* lists them.
   - `tests/unit/cost.test.ts`: the fourth case from AC-11, built in the test with the third case's typed text helper and measured as the others are (least of three passes); every case within 2 seconds, or the build stops and brings the measurement to `/architect`.

   Run the whole Vitest suite. If any committed page's findings change other than page 28's, stop and take it to `/architect`. Satisfies **AC-1** to **AC-8**, **AC-11**.
4. The words in `src/lib/page-findings.ts`: both forms of the `bare-picture` line. Update `tests/unit/page-findings.test.ts`. Satisfies **AC-9**.
5. The amends to specs 0006 and 0008, as *Amends* says. Satisfies **AC-1**, **AC-2**, **AC-3**, **AC-9**.

**Slice 2: real dense scans**

6. Extend the local scan maker beside the existing scans (outside the repository, never committed; ask the engineer where they live, and keep the path out of the repository), in the same environment: render a dense page (the first page of `tests/fixtures/detect-dense.pdf`, or a denser one if its layer holds 500 hidden glyphs or fewer) at 300 dpi with the existing softening and noise; draw a made up card image holding printed made up words with Pillow and paste it as its own image with PyMuPDF's `insert_image`, onto the image only PDF before OCR and onto the OCR output after it; draw a ruled table with short made up words in its cells, and a ruled form with empty cells, with PyMuPDF, then render them the same way. OCR each with OCRmyPDF as the others were. Satisfies **AC-12**.
7. Run `/check verify` for this spec: the fixture pages in a real browser (the `bare-picture` words, the partly redacted name) and AC-12's real scans, recorded in this spec's `verify.md`. If a real scan contradicts an expectation, record the measurement and take it to `/architect`. Satisfies **AC-7**, **AC-9**, **AC-12**.

## Consequences

**Positive**:
- A photo pasted onto a dense OCR scan is named, whatever the density of the layer and whichever is drawn first, closing the case spec 0008 left open.
- A scan whose OCR layer is only rules, borders and marks is named, including junk that holds stray letters and numbers (`|l|I|1`), which a letter filter would have let through.
- One rule judges hidden text on every page, so dense and sparse OCR scans can no longer disagree about what clears a picture.
- A picture behind rows of typed underscores, dots or borders is named.
- The `bare-picture` line is true in every case it shows.
- Measured on every committed fixture (all synthetic) and the local OCR scans: no other finding changes, and no picture that is named today loses its warning. The cross check reached the same result with the rule patched into a scratch copy of the engine.

**Negative / tradeoffs**:
- A dense scan stored as a background plus smaller pieces, each a picture (one kind of MRC compression), is named although OCR read it. Full page layers, the usual shape, are not.
- A dense OCR layer in vertical writing is named, because MuPDF reads it a character per line and no run forms. Sparse ones already were.
- A photo pasted onto a scan before OCR, whose own words OCR read, is named, since nothing on the page says whose words lie over it.
- A visible line whose replacement text holds more characters than its glyphs (when written around its own text object) counts for nothing, so a picture behind enough such lines is named. Ligatures written the usual way, inside the line's text object, are not affected (measured).
- A page holding fewer than 40 readable characters that the area test cleared, such as a few large junk characters with no word, can now be `scanned`, and a document made only of such pages is refused where it opened before. Rare, and the stronger warning.
- Every OCR picture now takes the run search, which used to be skipped once coverage passed. It stops at the first word, so a dense page pays a few characters; the slowest path, a dense layer with no word, is held to the cost budget (AC-11).
- A scan whose OCR layer is drawn at zero opacity instead of invisible still clears by area, since its glyphs are drawn; such a page already carries `hidden-text`.
- The advice line still shows beside `bare-picture` on a page that was already through OCR; "may" keeps it true (spec 0008, AC-10).

**Neutral**:
- `pagesByFinding` will count more `bare-picture` pages and the same `machine-read-text` pages. No kind is added or removed.
- One expectation in `READ_PICTURES` changes, and the fixture set grows by nine pages. `TextReading` swaps one list for a map, and `machineReadTest` takes its two lookups from its caller.

## Follow-up

- [ ] Record for `/sync`: in `src/engine/AGENTS.md`, that the coverage test counts only visible lines of words drawn where the text says (`coverageLines`), that machine read text clears a picture only through the run (the *Conventions* line saying `machineReadRun` is searched only after a picture fails the coverage test stays true, and now reaches every OCR picture), that `inspectPage` builds the invisible index and the drawn origin list once and shares them, and two MuPDF quirks pinned in `reading.test.ts`: vertical writing reads a character per line, and replacement text wrapped around its own text object with more characters than its glyphs leaves the extra characters at no glyph's origin.
- [ ] Feature 16's security page names this spec's limits: a scan stored as several pieces, OCR in vertical writing, and a photo pasted before OCR are named although OCR may have read them; and the `bare-picture` line means RedactNest can't read the picture, whatever text lies over it.
- [ ] If a real MRC scan, a real vertical OCR scan or a real document with longer replacement text is named where it should not be, bring the file's measurement (never the file) to `/architect`. The two runners up recorded in `rationale.md` (masked pieces sharing a footprint, runs down vertical columns) are the starting points.
