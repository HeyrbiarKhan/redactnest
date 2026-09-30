# 0008. Sparse OCR scans

**Date**: 2026-09-30
**Status**: In Progress

## Summary

Today a scan that has been through text recognition (OCR) but holds only a few lines is still named as a picture with no text over it, and a very short one is refused, so following RedactNest's own advice never clears the warning. From now on a picture counts as read once OCR left a word of three or more letters or digits in hidden text over that picture alone, with no drawn text beside it: such scans open with the machine read note only, and download as `-redacted.pdf`. Visible text, stray marks and punctuation, a photo pasted over a scan's text layer, and a hidden copy of visible text never clear a warning. Every OCR note also gains a sentence saying that words the recognition missed stay in the picture.

## Amends specs 0006 and 0007

Applied in place by the build (task 5, and task 10 for the review's changes).

- **Spec 0006.** AC-4's "bare" gains the machine read run (AC-1 to AC-3 here), and so does *Page findings*' preamble. AC-2 gains a sentence: a scan holding a machine read run is not bare, so a short OCR page is not `scanned` (AC-5 here). *Constants* gains `MACHINE_READ_RUN`. *Copy*'s `machine-read-text` line gains AC-9's sentence. *Critical test scenarios* gains the sparse scans. Its *Decision* bullet "Text over a picture means readable lines" gains the machine read run, and its *Value sourcing* rows for the readable character count (the stamp cap) and for a picture's footprint and bareness name it too. Its Follow-up on sparse OCR scans is ticked, met here. In `rationale.md`, the `STAMP_MAX_CHARS` row no longer calls "Signed John Smith" a stamp when it is machine read text: a stamp is visible text, or machine read text with no run.
- **Spec 0007.** Its *Amends* paragraph, which says spec 0006's Follow-up on sparse OCR pages "still stands", now says spec 0008 met it. Its Follow-up on the OCR advice is ticked: `ADVICE` keeps "may" (AC-10 here).
- **Since the 2026-09-30 review (task 10).** Spec 0006 restates the run in three places, and each takes AC-14 to AC-16: AC-4's sentence ("`MACHINE_READ_RUN` (3) or more readable, purely invisible characters in a row on one line centred inside it") becomes three or more letters or numbers in a row on one line, purely invisible, on a line that is no drawn copy, centred inside the picture and inside no picture of a different footprint; the *Constants* row for `MACHINE_READ_RUN` says the same, and a row for `COPY_REACH_RATIO` (0.5) joins it; and the sparse OCR line in *Critical test scenarios* gains the review's pages (a photo over a layer, punctuation and format character layers, drawn copies). Its Follow-up on sparse OCR pages was already put in the past tense by `/architect` on 2026-09-30 (the review's second nit), so the build leaves that line alone.

## Requirements

**User stories**:
- As a visitor with a short scanned letter, I want running it through OCR, as RedactNest advises, to let RedactNest read it, so the file is not called partly redacted for pages it can read.
- As a visitor with a one line scanned page, such as a signature page, I want it to open after OCR rather than be refused.
- As a visitor, I want a picture that OCR never read, or read only as stray marks or punctuation, to stay named, even when a line of a scan's text layer runs over it or a hidden copy of visible text sits on it, so I never believe its words were checked.
- As a visitor with an OCR scan, I want to be told that words the recognition missed stay in the picture.

**Acceptance criteria**:

*The rule*

- **AC-1**: A picture (an image whose footprint holds at least `PICTURE_MIN_SHARE` of the grid points, spec 0006 AC-4) is not bare when it holds a machine read run. A run is `MACHINE_READ_RUN` (3) or more letters or numbers in a row on one line of the ordinary mode read (through `walkCharacters`, so counted in whole code points), each purely invisible (AC-2) and centred inside this picture's footprint and inside no picture of a different footprint (AC-16); a combining mark among them continues the run without adding to it (AC-14). "Centred inside" means the centre of the character's quad (the four cornered box around it) passes the same footprint test AC-5 of spec 0006 uses, with the footprint cut to the clip in force. Anything else ends a run: whitespace, punctuation and every other character that is neither a letter, a number nor a combining mark; a character that is not purely invisible; one centred outside the footprint or inside a picture of a different footprint; and the end of a line. So a word straddling a picture's edge counts only its letters centred inside. A picture with no run is judged by spec 0006's line box coverage exactly as today.
- **AC-2**: A character is purely invisible when the drawing pass drew an invisible glyph (render mode 3, reported through `ignoreText`) at its origin within `POSITION_TOLERANCE`, and its line is no drawn copy (AC-15). A drawn glyph is a filled, stroked or clipping glyph. A clipping glyph is any glyph drawn as part of a clip (render modes 4 to 7), whatever was painted inside that clip, so the drawing reader records every one's origin, not only those in clips nothing was painted inside. So text drawn both invisible and visible, at one place or near it, never counts. A glyph the ordinary read dropped (one a clip hides wholly, spec 0006 AC-7) has no character, so it never counts either.
- **AC-3**: The exemption is per picture. When one picture on a page holds a run and another does not, only the first stops being bare. A photo pasted onto an OCR scan page still makes the page `bare-picture`, beside `machine-read-text`, whether the text layer stays away from it or runs over less than `TEXT_OVER_PICTURE_MAX` of it (AC-16). A layer that covers at least that much of the photo clears it through spec 0006's coverage test, before any run is asked, as it did before this spec: a recorded limit, pinned by a fixture (task 7, page 28). A scan stored as several strips is judged strip by strip, so a strip holding no run (a blank margin, or two letters of a word straddling the join) stays bare and names the page `bare-picture`: a recorded limit that fails safe.
- **AC-4**: The new exemption comes only from machine read text. Visible text over a picture is judged by spec 0006's line box coverage and `TEXT_OVER_PICTURE_MAX`, unchanged: the pasted ID card, the captioned photo and every slide of `read-slides.pdf` keep their findings.
- **AC-5**: `scanned` follows from bare, since it counts bare pictures. A page whose pictures all hold a run has no bare picture, so it is not `scanned`, whatever its readable character count. A short OCR page ("Signed John Smith", 15 readable characters, all machine read) is `machine-read-text` only, and a document made only of such pages opens rather than being refused `no-readable-text`. A stamped scan whose stamp is visible text (`read-stamped.pdf`) is still `scanned` and still refused. So is a scan whose text layer holds no run of 3 (only stray marks, punctuation or format characters, or only words of one or two characters): it stays `scanned`, beside `machine-read-text`.
- **AC-6**: A tilt does not change the result. The same sparse text layer, written word by word the way Tesseract writes it (a `Tf` and a `Tz` per word), gives the same findings straight, on a baseline turned 1 degree, and on a page with `/Rotate 90`. Measured on the local scans on 2026-09-30: every OCR page's longest run is 7 or 8 letters and numbers (13 to 26 readable characters as first counted, before AC-14), straight and crooked alike (`rationale.md`, *Evidence*).
- **AC-7**: A layered scan (a background image and a stencil mask drawn with `fillImageMask`, each over the whole page, with the text layer over both) is `machine-read-text` only, because the two share one footprint (AC-16) and each holds its own run.
- **AC-8**: Following the advice clears the warning. The same scan picture with no text layer is refused `no-readable-text`. With a short text layer holding a run, it opens with the all clear line and the machine read note, `isPartly` is false, detection lists the address in its layer (spec 0006, AC-12), and a cleaned copy is named `{stem}-redacted.pdf`.

*What the visitor sees*

- **AC-9**: The `machine-read-text` note line gains a last sentence. One page: "{Pages} is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the picture." Several pages: "{Pages} are scans with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the pictures." Every OCR page carries it, dense or sparse, in its place from spec 0006, AC-21.
- **AC-10**: `ADVICE` keeps its words: "Run this file through text recognition (OCR) first, then open the result here. That may let RedactNest read those pages." `bare-picture` and `scanned` also name photos on which OCR finds no word, so "may" stays true. Its code comment gives that reason in place of pointing at spec 0006's open Follow-up.

*Engine rules*

- **AC-11**: `MACHINE_READ_RUN` and `COPY_REACH_RATIO` are engine constants in `src/engine/inspect.ts`, beside `UNREADABLE_RUN`, each commented as a rule about pages rather than a cap on the visitor (spec 0006, INV-7). `PAGE_FINDINGS`, `PageReading`, `PageInspection` and every shape that crosses the worker boundary are unchanged (spec 0006, INV-1). The run reads the characters `readText` already holds for the page to match glyphs, each with its `line`, so no more of the page's text is held, or held longer, than today (spec 0006, INV-8). What the rule adds is flags per character and per line, glyph origins and grid points, never text, and each is dropped with the page.
- **AC-12**: The search runs only where it can change a finding. It is skipped for a picture that passes the coverage test, and for a page with fewer than `MACHINE_READ_RUN` invisible glyphs, so a born digital page pays nothing. A character's step in a run (it counts, continues or ends one) does not depend on the picture, so it is decided once per page, the first time a picture needs it; whether a line is a drawn copy is decided once per line, the same way; and which pictures share a footprint is decided once per page, when the first search runs. Per picture only the footprint tests run, and the search stops at the first run. `tests/unit/cost.test.ts` keeps spec 0006's 2 seconds (AC-29) and gains a case that takes the search on every page: 50 dense OCR scan pages, each with a photo pasted away from its text layer, within the same 2 seconds of CPU. It gains a second that reaches every new test: 50 pages, each with about 2,000 visible glyphs of typed text and a photo carrying its own sparse invisible layer that forms no run, so each character over the photo is asked its step, each of its lines is asked whether it is a drawn copy against the page's drawn glyph origins, and the pictures are grouped, within the same 2 seconds.

*Real scans*

- **AC-13**: `/check verify` runs the engineer's local scans (simulated scans of made up data, kept outside the repository and never committed; `make-scans.py` beside them remakes them). `scan-straight.pdf` and `scan-crooked.pdf`, before OCR, are refused `no-readable-text`. `scan-straight-ocr.pdf` opens with the all clear line and AC-9's note, and no warning. `scan-crooked-ocr.pdf` opens the same, plus the crooked scan line (spec 0006, AC-25). A cleaned copy of each OCR scan is named `-redacted.pdf`.

*After the 2026-09-30 review*

- **AC-14**: Only letters and numbers (Unicode `\p{L}` and `\p{N}`) count toward a run. A combining mark (`\p{M}`) continues a run without adding to it, since it is part of the letter before it: a word written with vowel signs (Devanagari, Thai) still forms a run, while one letter carrying two marks (a Devanagari syllable such as "किं") does not, and marks alone never do. Any other character ends a run, readable or not: punctuation (`___`, `...`, `---`), symbols (`|||`, `~~~`), and format characters such as the zero width space (U+200B), the zero width joiner (U+200D) and the soft hyphen (U+00AD). The readable character count (spec 0006, AC-3) is unchanged: a punctuation mark is still readable, so it still counts toward the stamp cap.
- **AC-15**: A line of the ordinary read is a drawn copy when a drawn glyph's origin lies within reach of any character on it, whitespace included. A character's reach is `COPY_REACH_RATIO` (0.5) times its own height (`quadHeight` of its quad), and never less than `POSITION_TOLERANCE`. It is measured from the character's baseline along its `direction`: up to the reach on either side of the baseline, and along the line from the reach before the character's origin to the reach past its end (its origin plus its quad's width). A character whose height, width, direction or origin is not a finite number makes its line a drawn copy. No character on a drawn copy counts toward a run. So a hidden copy of visible text never clears a picture, whether it sits at the same place, is offset by half a point in any direction, or drifts along the line with different spacing. MuPDF makes a quad somewhat taller than an em (1.0 em for Tesseract's glyphless font, about 1.37 em for Helvetica, measured), so the reach is half an em to about 0.7 em, while a neighbouring line's baseline sits a line's spacing away, more than that in ordinary text: the next line is out of reach. A line is MuPDF's own: a layer written one word at a time can split into several lines, so a copy written that way is judged word by word. A line of text recognition that runs within reach of drawn text, such as a visible stamp on its baseline, counts for nothing either, which fails safe.
- **AC-16**: A character counts toward a picture's run only when no picture of a different footprint also holds its centre. Every picture on the page can take a character out this way, one that passed the coverage test included. Two pictures share a footprint when they hold exactly the same `READING_GRID` points, as the layers of AC-7 do; such pictures each keep the run. So a photo pasted over a line of an OCR scan's text layer stays bare, wholly inside the scan or across its edge, whichever is drawn first; a small OCR scan pasted onto a larger photo leaves the photo bare; and text over the overlap of two different pictures clears neither. "Picture" is spec 0006's: an image under `PICTURE_MIN_SHARE`, such as a small logo, is no picture, so text over it still counts for the picture beneath. A photo placed within about one grid cell of a full page scan's edges holds the same points as the scan, so it shares the scan's footprint and keeps the run: a recorded limit.

## Decision

**Chosen option**: Option 1: a machine read run per picture (reasoning and the other options in `rationale.md`).

A picture stops counting as bare once a run of 3 or more letters or numbers, purely invisible, on one line of the ordinary read, sits inside its footprint and no other picture's. The same change carries `scanned` with it, so sparse and short OCR scans open with the machine read note, whose line now names what OCR may have missed. Settled with the engineer, each against a runner up:

- **The signal is a machine read run of 3** (the engineer's pick, leaning toward finding). Runner up: any single machine read character, which lets a stray `|` clear a warning.
- **Anything but a qualifying character breaks a run**, so a run is in effect a word of 3 or more. Runner up: spaces do not break it, which lets scattered noise on one line add up.
- **Per picture.** Runner up: per page, which would leave a photo pasted beside an OCR scan unnamed.
- **Short OCR pages follow the same rule and open.** Runners up: open them but keep warning, or keep refusing them.
- **Visible text over a picture is unchanged.** Runner up: runs of visible text also exempt, which would silence slides whose photo was never read.
- **Only purely invisible characters count.** Runner up: any invisible glyph at the origin, which lets a producer that draws text both ways clear the warning.
- **The machine read note gains a sentence for every OCR page** (the engineer's pick). Runner up: the note unchanged.
- **`ADVICE` keeps "may".** Runner up: "RedactNest can then read the words the text recognition finds."

Settled after the 2026-09-30 review, the engineer asking to favour finding on each (reasoning in `rationale.md`, *What the review changed*):

- **Only letters and numbers count toward a run, and a combining mark continues one** (AC-14; the engineer's rule, with marks carried so scripts written with vowel signs still read). Runners up: marks counting like letters, which lets one letter with two marks form a run; and a run of readable characters holding at least one letter or number, which lets `|l|` clear a warning.
- **A line within half a character's height of drawn text counts for nothing** (AC-15; the engineer kept it over the cross check's picture wide rule). Runners up: the same reach judged character by character, which lets a copy that drifts past the visible text's end count there; and any drawn glyph inside a picture voiding its run, which is simpler but brings the warning back on every sparse OCR scan carrying a visible stamp, Bates number or page number.
- **A character over two pictures of different footprints counts for neither** (AC-16). Runner up: the review's fix, a picture wholly inside a larger one takes no run, which still clears a photo across a scan's edge and a large photo under a small pasted scan.
- **A photo that a dense text layer covers by at least `TEXT_OVER_PICTURE_MAX` stays cleared by spec 0006's coverage test**, as before this spec: recorded, pinned by page 28, and taken up as a separate decision (the engineer's pick). Runner up: extending AC-16's veto to the coverage test now, which changes spec 0006's rule on dense pages and runs the character test on every OCR page with a second picture.
- **Every minor and nit is fixed now**: the three test gaps (task 7 and task 9), the declaration order in `inspect.ts` (task 8), spec 0006's Follow-up tense (done by `/architect`), this spec's Consequences, and AC-11's wording. Nothing is deferred.

Decided in writing (runner up in brackets):

- **The constant is `MACHINE_READ_RUN = 3` in `inspect.ts`**, a sibling of `UNREADABLE_RUN`, since both count characters in a row on one line. (Reusing `UNREADABLE_RUN`, which ties two unrelated rules to one number.)
- **The run reads the characters `readText` already collects** (each carries its `line`, origin, direction, quad and code point) through `TextReading`, so nothing new is held and the page's text still lives for one page only (spec 0006, INV-8). (A second walk of the page's text for the run.)
- **Invisible origins are looked up through `originIndex` in `characters.ts`**, the index the glyph to character match already uses, so "at its origin" means the same thing in both. (A second tolerance search.)
- **The drawing reader records every clipping glyph's origin** (`clipGlyphs`), not only those in clips nothing was painted inside (`clipOnly`, which stays for spec 0006's AC-7), so a clipping glyph can make a line a drawn copy. (Recording a render mode 7 glyph beside an invisible one as a limit.)
- **`runStep(code)` is a pure function beside `isReadable`**, answering `"counts"` for a letter or number, `"continues"` for a combining mark and `"ends"` for anything else, with ASCII `[A-Za-z0-9]` answered without the pattern. `isReadable` stays as it is for the readable count. (Changing `isReadable`, which would move the stamp cap too.)
- **The reach is `COPY_REACH_RATIO = 0.5`, a share of the character's own quad height**, as `TARGET_PADDING_RATIO` is a share of a target's. (A reach in ems, which MuPDF's quad heights make wrong by a third for Helvetica.)
- **Drawn glyph origins sit in one list sorted by x**: the origins of `drawing.paints` and `drawing.clipGlyphs`, built on first need, asked with the bounds of a character's reach (a binary search on x, then a check of y), and AC-15's test runs exactly, in the character's `direction`, on what the bounds return. (`originIndex`, whose 0.01 pt cells cannot answer an area; or a grid of fixed cells, which needs a cell size that suits no text size in particular.) Since the run no longer asks the painted index, `byOrigin(drawing.paints)` returns to `concealedGlyphs`, its one user, and the clipping `originIndex` in `machineReadTest` goes.
- **"The same footprint" means the same grid points**: once per page, when the first search runs, the pictures are grouped in a `Map` keyed on the bytes of their `held` points, so equal footprints meet in one group without a compare per pair. (Placement quads within a tolerance, which is a second way of measuring a footprint.)
- **The picture loop runs in two passes**: every picture with its footprint and grid points first, then the judging, so a search can ask which other pictures hold a centre. (Judging each picture as it is met, which cannot see pictures drawn later.)
- **The search is lazy and stops early** (AC-12): skipped when coverage passes or the page has fewer than `MACHINE_READ_RUN` invisible glyphs; each character's step, each line's copy answer and the footprint groups computed once per page, on first need; the first run ends the search. (Checking every picture, or deciding per picture.)
- **The run search is a pure function** (`machineReadRun` in `inspect.ts`) over the page's characters in reading order, a step test and a footprint test, so its edges (2 against 3, a line end, a centre outside, a mark) are unit tested as plain logic in `tests/unit/reading-measures.test.ts`, reached the way that file already reaches the page measures. AC-14 turns its qualifying test into a step test (`(at) => RunStep`, where `RunStep` is `"counts" | "continues" | "ends"`); AC-15 and AC-16 change only the two tests it is handed. (A second predicate for marks beside the first, which splits one answer in two.)
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
| `COPY_REACH_RATIO` | `src/engine/inspect.ts`, exported through `src/engine/index.ts` for tests | new constant, 0.5 (AC-15) |
| `RunStep`, `runStep(code)` | `src/engine/inspect.ts`, exported through `src/engine/index.ts` for tests | new type `"counts" \| "continues" \| "ends"` and pure function: `\p{L}` or `\p{N}` counts, `\p{M}` continues, anything else ends (AC-14) |
| `machineReadRun` | `src/engine/inspect.ts` | its second parameter becomes `step: (at: number) => RunStep` (AC-14) |
| the page's pictures | `inspectPage`, private | each picture's footprint and grid points, gathered before any is judged, and on the first search grouped in a `Map` keyed on their grid points (AC-16) |
| the drawn glyph origins | `machineReadTest`, private | the origins of `drawing.paints` and `drawing.clipGlyphs`, in one list sorted by x, built on first need; one copy answer per line (AC-15) |

**State transitions**: none. The open's order, the session machine and the refusal point are unchanged (spec 0006, *State transitions*).

**API surface** (module functions; there is no HTTP endpoint and no new message):

| Surface | Kind | Change | Output | Errors |
|---|---|---|---|---|
| `inspectPages(mupdf, pdf, isCancelled?)` | `src/engine/inspect.ts` | a picture holding a machine read run is not bare (AC-1 to AC-5, AC-14 to AC-16) | the same `PageInspection[]`, with fewer `bare-picture` and `scanned` findings on OCR scans | unchanged |
| `open` worker message | `src/engine/open.ts` via the worker | none in code; a short OCR document now opens where it was refused | `result { summary, matches }` | `no-readable-text` no longer for a document whose pages all hold a run |
| `noteLines(summary, matches)` | `src/lib/page-findings.ts` | the `machine-read-text` line gains AC-9's sentence | strings | none |
| `ADVICE` | `src/lib/page-findings.ts` | comment only | unchanged | none |

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| open | a character's step in a run (counts, continues or ends) | `runStep` over the code point from `walkCharacters` (AC-14) when the character is purely invisible; `"ends"` when it is not |
| open | a character's origin, quad, quad centre and direction | the ordinary mode read (`EXTRACTION_OPTIONS[0]`) through `walkCharacters`, per line |
| open | whether a character is purely invisible | `originIndex` over the drawing pass's invisible glyph origins (`DrawingReading.invisible`) finds one within `POSITION_TOLERANCE`, and its line is no drawn copy; computed once per page, on first need |
| open | whether a line is a drawn copy | derived: some drawn glyph origin (from `drawing.paints` and `drawing.clipGlyphs`) lies within reach of the baseline of some character on the line, whitespace included, the reach the larger of `COPY_REACH_RATIO` times that character's `quadHeight` and `POSITION_TOLERANCE`, along and across its `direction` from its origin; or a character on the line has a height, width, direction or origin that is not finite (AC-15); computed once per line, the first time any character on it is asked |
| open | whether the search runs at all | derived: the picture failed the coverage test, and `drawing.invisible.length` is at least `MACHINE_READ_RUN` |
| open | which pictures share a footprint | their grid points (the `held` points each picture's footprint marks on `READING_GRID`), equal point for point over the whole grid; grouped in a `Map` keyed on those points, once per page, when the first search runs (AC-16) |
| open | whether a character sits in a picture | its quad centre through `holds(footprint, centre)`, the footprint cut to the clip in force, as AC-5 of spec 0006, while `holds` of every picture outside this picture's group is false, whether or not that picture passed the coverage test (AC-16) |
| open | whether a picture holds a run | `machineReadRun`: on one line, characters centred in the footprint, each `"counts"` adding one and each `"continues"` adding nothing; reset by an `"ends"`, a character centred outside and each line's end; true at the first `MACHINE_READ_RUN` |
| open | bare, `bare-picture`, `scanned` | spec 0006's rules, with a picture holding a run left out of the bare pictures |
| open | the refusal | spec 0006, AC-10, unchanged, over the new findings |
| review | the machine read note line | `findingLine(summary, "machine-read-text")` in `src/lib/page-findings.ts`, one and several page forms per AC-9 |
| download | the file name | `outputNameFor(file.name, isPartly(summary))`, unchanged; a sparse OCR scan's summary now holds no warning |

**Key invariants**:

- **INV-1**: The new exemption comes only from purely invisible machine read text over the picture, on a line no drawn text runs beside. Visible text clears a picture only through spec 0006's coverage rule, as before (AC-2, AC-4, AC-15).
- **INV-2**: The run is counted along the read's own lines, never by area, so a line height or font size cannot change it, and a tilt changes it only if MuPDF groups a line's characters differently (AC-6).
- **INV-3**: Spec 0006's safety rules are untouched: a page with no readable character is still `scanned` or `drawn-only` or `blank`, and a document with nothing readable is still refused (spec 0006, AC-10, INV-9).
- **INV-4**: Nothing new crosses the worker boundary, and no finding carries text, a position or a count of characters (spec 0006, INV-1).
- **INV-5**: AC-14 to AC-16 only ever take characters out of a run or stop them adding to it, never add one, so no page loses a warning it kept under AC-1 to AC-3 as first built. A value AC-15 cannot judge (a height, width, direction or origin that is not finite) makes a drawn copy, so it fails safe too. The other direction is intended: a page the first build opened can now be `scanned` (a short scan whose layer is only punctuation), and a document made only of such pages is refused.

**Security model**: unchanged. An anonymous visitor, one tab, no server call, the same for every tier. The rule reads document content inside the worker only. It removes a warning on some pages, which is the direction that can mislead, so it counts only letters and numbers of purely invisible text over one picture, on lines no drawn text runs beside, and the note says what OCR may have missed.

**Configuration required**: none. The constants live in `src/engine` (spec 0006, INV-7).

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
- Layered scan: a background image and a full page stencil mask under one text layer give `machine-read-text` only. Verifies **AC-7**, **AC-16**.
- The advice works: `read-short-ocr.pdf` opens, its one page `machine-read-text` only, its address listed, `isPartly` false; `read-scans.pdf` is still refused. In a real browser (`tests/e2e/design-system.spec.ts`, beside the notes state), the short OCR file shows the all clear line and AC-9's note with no warning callout. Verifies **AC-5**, **AC-8**, **AC-9**.
- Copy: the note's one and several page forms, and `ADVICE` unchanged. Verifies **AC-9**, **AC-10**.
- Cost: the existing budget holds, and 50 dense OCR scan pages, each with a photo pasted away from its layer, take the search on every page within 2 seconds of CPU; so do 50 pages of about 2,000 visible glyphs, each with a photo carrying its own sparse layer that forms no run. Verifies **AC-12**.
- Real scans: AC-13's manual steps. Verifies **AC-6**, **AC-13**.
- Overlapping pictures: a photo over an OCR line, drawn after it and drawn before it; a photo across the edge of a half page scan; and a small OCR scan, whose layer clearly passes the coverage test, on a full page photo each give `bare-picture` beside `machine-read-text`. The last two are the pages the review's own fix would clear. Verifies **AC-3**, **AC-16**.
- The recorded limit: a photo pasted onto a dense OCR layer that covers more than `TEXT_OVER_PICTURE_MAX` of it gives `machine-read-text` only, as before this spec. Verifies **AC-3**.
- Letters, numbers and marks: a layer of punctuation runs and one of format character runs stay `scanned` beside `machine-read-text`; `runStep`, as plain logic, counts letters and digits, continues on a combining mark, and ends on punctuation, symbols and format characters; `machineReadRun` finds a run in letter, mark, letter, letter, and none in one letter with two marks or in marks alone. Verifies **AC-1**, **AC-5**, **AC-14**.
- Drawn copies: an invisible copy offset half a point left and down of a visible sentence, and one drifting ahead of it with `0.6 Tc`, stay `bare-picture`; so do copies at one origin drawn stroked, filled white, filled at zero opacity, in `5 Tr` and in `6 Tr`. The drifting page is the one a character by character reach would clear. Verifies **AC-2**, **AC-15**.
- The next line is out of reach: an invisible line with visible words one line spacing (14.4 pt) above it still clears the scan, upright and on a `/Rotate 90` page. On the turned page a reach measured in plain x and y would catch the neighbour, so this pins the reach to the line's direction. Verifies **AC-15**.

## Build plan

Ordered by Skateboard. The fix is small enough that slice 1 is the whole usable change: the rule, its fixtures, the note and the amends land together, because a rule without its words would show the old note on newly exempted pages. Slice 2 proves it on real scans. Slice 3 takes the review's changes as one change, since each only takes characters out of a run (INV-5), and proves them the same way.

**Slice 1: sparse OCR scans read as read** (built)

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

**Slice 2: real scans** (verified)

6. Run `/check verify` for this spec on the local scans, per AC-13, and record the findings in this spec's `verify.md`. Satisfies **AC-6**, **AC-13**.

**Slice 3: the review's fixes**

7. Fixtures. Append these pages to `READ_PICTURES`, so every existing page keeps its index and its findings (if any existing page's findings change, stop and bring it back to `/architect`). Each is over a full page scan unless it says otherwise. `SPARSE_SENTENCE` is 55 characters, 45 of them readable, and the glyphless font advances 6 pt a glyph at 12 pt, so from x 60 the words "by its director" start at x 300. A new photo helper is not needed: `photo` from `readPictures` serves.
   - 20, a photo drawn after an OCR line that runs over it: `invisibleLine(12, 60, 400, SPARSE_SENTENCE)`, then `q 300 0 0 300 300 250 cm /Photo Do Q`. "by its director" centres over the photo and the scan, the words before it over the scan alone, and the line covers under 3% of the photo's grid points: `["bare-picture", "machine-read-text"]`
   - 21, the same with the photo drawn before the line: `["bare-picture", "machine-read-text"]`
   - 22, a photo across the edge of a half page scan, the review's own fix clearing it: the scan `q 612 0 0 396 0 396 cm` (the top half), the photo `q 300 0 0 200 300 250 cm` (146 pt of it below the scan), and `invisibleLine(12, 60, 420, SPARSE_SENTENCE)`, whose words before "by" lie over the scan alone and whose last three over both: `["bare-picture", "machine-read-text"]`
   - 23, a small OCR scan on a full page photo, the review's own fix clearing the photo: `fullPage("Photo")`, then the scan `q 300 0 0 200 156 300 cm`, then `invisibleLine(10, 166, y, SPARSE_SENTENCE)` for y 446, 410 and 372, all wholly inside the scan (at 10 pt the line runs from x 166 to 441). Each baseline is chosen so its 10 pt line box holds one row of grid points, so the three lines cover about 17% of the scan, clearly passing the coverage test, and about 2% of the photo. The page pins a veto from a picture that passed coverage: `["bare-picture", "machine-read-text"]`
   - 24, a layer of punctuation runs, `invisibleLine(12, 72, 120, "___ ... ||| --- ~~~")` (15 readable characters): `["scanned", "machine-read-text"]`
   - 25, a layer of format character runs, `invisibleLine(12, 72, 120, "​​​ ‍‍‍ ­­­")` (9 readable characters; the cross check measured that the ordinary read keeps all nine): `["scanned", "machine-read-text"]`
   - 26, a visible sentence and its invisible copy offset half a point left and down: `modeLine(0, 12, 72, 120, SPARSE_SENTENCE) + modeLine(3, 12, 71.5, 119.5, SPARSE_SENTENCE)`: `["bare-picture", "machine-read-text"]`
   - 27, a visible sentence and an invisible copy from the same start drawn with `0.6 Tc`, which drifts about 32 pt ahead by the line's end, so its last letters lie out of reach of every visible glyph: `["bare-picture", "machine-read-text"]`. `modeLine` gains a character spacing option and writes `Tc` on every line (0 by default), since text state outlasts the text object as `Tr` does. The page proves the per line rule only if the letters out of reach number at least `MACHINE_READ_RUN`, so the comment gives the measured count, and if it is under 3, raise the spacing until it is not
   - 28, the recorded limit: `fullPage("Scan")`, the photo `q 300 0 0 300 156 300 cm`, then the full `ocrLayer()`, whose lines cover about a third of the photo, so spec 0006's coverage test clears it before any run is asked: `["machine-read-text"]`, with a comment that this is accepted (AC-3) and taken up separately (*Follow-up*)

   Satisfies **AC-3**, **AC-5**, **AC-14**, **AC-15**, **AC-16**.
8. The rules in `src/engine/inspect.ts`:
   - `RunStep` and `runStep(code)`, pure: `"counts"` for `\p{L}` or `\p{N}`, `"continues"` for `\p{M}`, `"ends"` for anything else, with ASCII `[A-Za-z0-9]` answered without the pattern (so `_` ends a run). `isReadable` stays as it is for the readable count (AC-14)
   - `machineReadRun` takes `step: (at) => RunStep` in place of `qualifies`: for a character centred inside, `"counts"` adds one, `"continues"` adds nothing and `"ends"` resets; a character centred outside resets, as does a new line
   - `machineReadTest` becomes the step test: `"ends"` unless an invisible glyph sits at the character's origin (through `originIndex`, as now) and its line is no drawn copy, else `runStep(code)`. Its answers become `UNASKED`, `COUNTS`, `CONTINUES` and `ENDS`, declared above it, so the file reads top down (the review's first nit)
   - `COPY_REACH_RATIO` with its comment, beside `MACHINE_READ_RUN`
   - in `machineReadTest`, the drawn glyph origins (`drawing.paints` and `drawing.clipGlyphs`) in one list sorted by x, built on first need, and a copy answer per line, decided the first time any character on the line is asked, over every character on it, whitespace included (a line's characters are contiguous in reading order). Each character's reach is the larger of `COPY_REACH_RATIO` times its `quadHeight` and `POSITION_TOLERANCE`; the list is asked with the bounds of that reach, and AC-15's test runs exactly, in the character's `direction`, on what it returns. A character with a height, width, direction or origin that is not finite makes its line a copy. The clipping `originIndex` goes, and `byOrigin(drawing.paints)` returns to `concealedGlyphs`
   - the picture loop in two passes: first every picture (every footprint holding at least `PICTURE_MIN_SHARE` of the grid) with its footprint and grid points, then the judging. On the first search the pictures are grouped in a `Map` keyed on the bytes of their `held` points, and each search's `inside` becomes `holds(footprint, centre)` while no picture outside its group holds the centre, whether or not that picture passed the coverage test (AC-16)
   - `src/engine/index.ts` exports `RunStep`, `runStep` and `COPY_REACH_RATIO` beside `machineReadRun`, for the tests

   Comments name AC-14 to AC-16 beside AC-1 and AC-2, and the comment on `COPY_REACH_RATIO` gives AC-15's reason for half the character's height. Satisfies **AC-1**, **AC-2**, **AC-11**, **AC-12**, **AC-14**, **AC-15**, **AC-16**.
9. Tests.
   - `tests/unit/reading.test.ts`: first, a pin that the ordinary read keeps each format character on page 25 as one character; the `READ_PICTURES` table with the new pages; beside the `7 Tr` test, an `it.each` of copies drawn at the invisible line's origin through `scanUnder` (its resources gain an ExtGState with `/ca 0`): stroked (`1 Tr`), filled white (`1 g`), filled at zero opacity, in `5 Tr` and in `6 Tr` (each clip inside `q … Q`). Each keeps `bare-picture` beside `machine-read-text`, where the invisible line alone clears the scan. Its comment names the drawing reader branch MuPDF sends `5 Tr` and `6 Tr` through (`clip` or `clip-stroke`), as measured. And the next line pin: through `scanUnder` (which gains page keys for `/Rotate 90`), the invisible sentence at y 120 and the same words drawn visible at y 134.4, one line spacing above, give `["machine-read-text"]` upright and turned.
   - `tests/unit/reading-measures.test.ts`: `runStep` counts Latin and CJK letters and digits, continues on a Devanagari vowel sign (U+093F) and a combining acute (U+0301), and ends on `_ . | - ~ *`, U+200B, U+200D, U+00AD, U+2060, a space, U+FFFD and a private use code point. `machineReadRun` finds a run in counts, continues, counts, counts, and none in counts, continues, continues, in continues alone, or with an ends between. `COPY_REACH_RATIO` is 0.5.
   - `tests/unit/cost.test.ts`: the second case from AC-12, built in the test and measured as the others are: 50 pages, each about 2,000 visible Helvetica glyphs in lines of typed text over the top half, and a photo of about a fifth of the page in the bottom half carrying one invisible line of two letter words across it (covering under `TEXT_OVER_PICTURE_MAX` of it, no run). Run alone, every case stays within 2 seconds of CPU.

   Satisfies **AC-2**, **AC-3**, **AC-5**, **AC-12**, **AC-14**, **AC-15**, **AC-16**.
10. The amends to spec 0006 since the review, as *Amends* says. Satisfies **AC-14**, **AC-15**, **AC-16**.
11. Run `/check verify` again. `read-pictures.pdf` now names pages 9, 10, 12, 24 and 25 on the scanned line; pages 1, 3, 16 to 18, 20 to 23, 26 and 27 on the picture line; and pages 5 to 28 in the note. AC-13's real scans run again too, since the rule changed. Satisfies **AC-6**, **AC-13**, **AC-14**, **AC-15**, **AC-16**.

## Consequences

**Positive**:
- Following the OCR advice now clears the warning whenever recognition reads a word on each picture, so the advice line finally does what it suggests.
- Sparse and short OCR scans open with a note and download as `-redacted.pdf`, like dense ones. A signature page after OCR is no longer refused.
- A tilt no longer flips a scan between two different warnings for the same content.
- One rule fixes both the `bare-picture` and the `scanned` misfire, with no new finding, no protocol change and no new cost on pages without pictures.
- A photo pasted onto an OCR scan stays named when a line of the scan's text layer runs over it, and so does a large photo under a small pasted scan.
- Punctuation and format characters, the commonest OCR junk on photos, form rules and table borders, never clear a warning, and neither does one letter carrying marks.
- A hidden copy of visible text never clears a warning, whatever its offset or its drift along the line.

**Negative / tradeoffs**:
- OCR noise that happens to form a run of 3 letters or digits on a photo (`lll`, `111`) clears that photo's warning. The note still says only recognised text is found.
- One recognised word over a picture full of words OCR missed, such as handwriting, clears `bare-picture` for it. The note's new sentence is the whole answer, and the file is named `-redacted.pdf`.
- A crafted file can clear a photo's warning by drawing invisible text over it, away from any drawn text. This is a recorded limit, in the same family as spec 0006, INV-9. So can a hidden copy that sits a line or more away from its visible text, and one written a word at a time whose words each sit beyond the reach of their visible twins, since MuPDF may make each word its own line.
- A photo pasted onto a dense OCR scan, whose text layer covers at least `TEXT_OVER_PICTURE_MAX` of the photo, is still cleared by spec 0006's coverage test, as it was before this spec. Page 28 pins it, and *Follow-up* takes it up.
- A photo placed within about one grid cell of a full page scan's edges shares the scan's footprint (AC-16), so the scan's run clears it too.
- A photo pasted onto an OCR scan stays warned even when OCR did read the photo's own words, since text over two different pictures cannot be told apart. So does a sparse scan stored as a page background plus smaller text masks, each at least `PICTURE_MIN_SHARE`, whose words lie over both.
- A line of OCR text that runs within half a character's height of drawn text (a visible stamp, or a typed value on its baseline) counts for nothing, so a sparse scan whose only words sit beside such text stays warned.
- A word broken by punctuation counts only its parts: `e.g.` and `12/03` form no run, while `jo@example.com` does (`example`). A word split by a format character, such as a Persian zero width non joiner, counts each side alone.
- Spec 0006's recorded choice that a short OCR page is a stamp is reversed: such a page now opens, where it was refused.
- Some real sparse layers still never form a run and stay warned, all failing safe: a scan stored as strips needs a run on each strip (AC-3); characters that come from replacement text (`/ActualText`) or vertical writing may not sit at a glyph's origin; and words in an unmapped font are unreadable. Only Tesseract's layer shape is pinned, straight, tilted and rotated.
- The note grows by a sentence on every OCR page, dense ones included.

**Neutral**:
- `pagesByFinding` will count fewer `bare-picture` and `scanned` pages and the same `machine-read-text` pages. No kind is added or removed.
- Two expectations in `READ_PICTURES` changed, and the fixture set grew by eleven pages and one document in slice 1 and grows by nine pages in slice 3.
- The drawing reader gained one list (`clipGlyphs`). After slice 3, `concealedGlyphs` builds its painted index again, the picture loop runs in two passes, `machineReadRun` takes a three way step instead of a yes or no, and `machineReadTest` holds a sorted list of drawn glyph origins instead of two origin indexes.

## Follow-up

- [ ] Record for `/sync`: `MACHINE_READ_RUN` and `COPY_REACH_RATIO` among the page reading's thresholds in `src/engine/AGENTS.md`, and the rule that the machine read exemption counts only letters and numbers of purely invisible text over one picture, on lines no drawn text runs beside.
- [ ] Feature 16's security page says that a picture counts as read once OCR left a word of 3 or more letters or digits on it, over that picture alone, and that words OCR missed stay in the picture.
- [ ] Decide whether AC-16's veto should reach spec 0006's coverage test for machine read lines, so a photo pasted onto a dense OCR scan stays named (page 28 pins today's outcome). Enrolled on the scope as feature 20.
