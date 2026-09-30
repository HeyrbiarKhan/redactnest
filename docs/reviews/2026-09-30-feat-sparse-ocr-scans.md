# Review, feat/sparse-ocr-scans, 2026-09-30

**Reviewed by**: Claude Sonnet 5.5 (author on Claude Opus 5.5)
**Scope**: 20 files, branch vs main (merge base 0323301, 7 commits)
**Verdict**: Changes requested

## Summary

Spec 0008 lets a picture stop counting as bare once three or more readable, purely invisible characters in a row on one line are centred inside its footprint, so sparse and short OCR scans open with the machine read note only. The implementation follows the spec closely, is small, guarded and lazy, and the tests, typecheck and lint pass. Nothing new is retained beyond the page and nothing new can reach a finding, log or error (point B). The headline issue is on the dangerous side (point A): the footprint-only test lets a photo pasted onto an OCR scan lose `bare-picture` whenever a few characters of the scan's own text layer happen to centre inside it. I reproduced that with the real MuPDF, the old code kept the warning, no test covers it and the spec does not record it as a limit.

## Verification I ran

- `pnpm exec vitest run tests/unit/reading.test.ts tests/unit/reading-measures.test.ts tests/unit/page-findings.test.ts`: 183 pass. `tests/unit/cost.test.ts`: 4 of 4 pass. `tests/component/tool-client.test.tsx`: 149 pass. `pnpm typecheck` and `pnpm lint`: clean. Playwright not run, as instructed.
- `node scripts/make-fixture.mjs`, then `git status --porcelain`: no change. The committed fixtures match the script. I changed nothing in the working tree.
- Adversarial harness, outside the repository (my scratchpad, with a copy of the old `inspect.ts` from the merge base beside the new one), running both against about 30 hand built one page PDFs with the real MuPDF. Nothing was written into the repo.
- The four local scans (`redactnest-scans`, read only): `scan-straight.pdf` and `scan-crooked.pdf` are refused `no-readable-text`; both OCR files open with `machine-read-text` only on all three pages (old code: `bare-picture` on 5 of 6). AC-13's engine leg is confirmed independently.

## A. Safety direction: can a picture whose text was NOT read lose its warning?

**Verdict on A: mostly held, with one real hole and two hardening gaps.** The mechanisms the spec names (visible text, clipping glyphs, unmapped fonts, runs split by whitespace or lines, characters outside the footprint, strips, a photo pasted away from the layer, other pictures on the page) all keep their warning, in code and under test. One non crafted input does not: a second picture overlapped by a few characters of another picture's text layer (finding 1 below). Two further inputs clear a warning that the spec's stated invariants say they should not (findings 2 and 3).

How the code decides (`src/engine/inspect.ts`): the search runs only after the coverage test failed (`:317`) and only when the page draws at least 3 invisible glyphs (`:324`). `machineReadRun` (`:396-417`) walks `text.characters`, resets the run on a new `line` (`:405-408`), and counts a character only if `inside(quadCentre(quad)) && qualifies(at)` (`:409`). `qualifies` (`:451-457`) is `isReadable(code)` and an invisible glyph within tolerance and no painted glyph within tolerance and no clipping glyph within tolerance. Each picture is tested with its own footprint, so a run is per picture.

Cases traced. "Old" is the merge base code, "new" is this branch, both run on real MuPDF.

| Input | Old | New | Keeps warning? | Path |
|---|---|---|---|---|
| Visible text over a picture (any length) | as before | as before | Yes | never qualifies: `painted.at(origin) !== null` (`:454`); visible text still only clears through coverage (`:312-317`) |
| Text `Tr 3` not over the picture | bare | bare | Yes | centre fails `inside` (`:409`); tested (photo away, strips) |
| Text `Tr 3`, only 2 letters centred inside (straddle) | bare | bare | Yes | run resets on the outside character; tested (strips fixture, `machineReadRun` edges) |
| Text on picture A, a different, non overlapping picture B | bare | B stays bare | Yes | per picture footprint; my A2 (halves) and A17 (four quadrants) keep `bare-picture` |
| Glyphs that clip (Tr 7, with or without paint inside) | bare | bare | Yes | `clipGlyphs` (`:934`), `clipping.find` (`:455`); tested |
| Invisible and `Tr 0` at one origin (exact) | bare | bare | Yes | `painted.at` (`:454`); tested |
| Invisible plus a `Tr 1` stroke, white fill, or alpha 0 fill copy at one origin | bare | bare | Yes | all land in `paints`; my B6, B6b, B7 (not pinned by a test) |
| Unmapped font (U+FFFD) | scanned | scanned | Yes | `isReadable` false (`:452`); tested |
| Glyph the ordinary read dropped (clipped "Yes") | scanned | scanned | Yes | no character exists; tested. My B8 (a dropped middle glyph between "Ye" and "!") also does not bridge |
| Whitespace, one and two character words, stacked single glyphs, abutting 2 character words | scanned | scanned | Yes | run resets; my B3, B9, B10 |
| `/ActualText` on one invisible glyph plus two stray glyphs | scanned | scanned | Yes | ActualText characters do not sit at a glyph origin; my A6 (fails safe, as the spec says) |
| Tiny or sub 5% picture with text | not a picture | not a picture | n/a | dropped at `:312` before the search; the text still clears any large picture it sits over, by design (my A13) |
| Rotated picture, `Rotate 90`, 90 degree text | | | n/a | run found, as intended (my A5, B11; `Rotate 90` fixture) |
| **A second picture overlapped by a few characters of another picture's layer** | **bare** | **cleared** | **No** | finding 1 |
| **Visible text plus an invisible copy that drifts by more than 0.01 pt** | **bare** | **cleared** | **No** | finding 2 |
| **A run of punctuation (`___`, `...`, `\|\|\|`, `---`)** | **scanned** or bare | **cleared** | **No** | finding 3 (recorded in part) |

Stamp interplay: `scanned` still needs `readableCount < STAMP_MAX_CHARS` and `bareShare >= SCAN_MIN_SHARE` (`:343`). A visible stamp on a scan still refuses (`read-stamped.pdf`, tested). But a stamped scan that also carries any 3 invisible characters over the picture (my A3b: a 25 character visible caption plus a hidden "alt") flips from `scanned` (refused if it is the only page) to `machine-read-text` only. That is the spec's recorded "crafted file" limit (Consequences), not a new finding. Picture share and reach: `off-page-picture` and the 5% picture rule are untouched.

Test adequacy for the dangerous direction: good. `reading.test.ts` and `READ_PICTURES` put six pages in the "must keep the warning" direction (stray marks, 1 and 2 character words, clipped "Yes", layered invisible and visible, photo away, strips), plus the Tr 7 clip test in both forms and the unmapped font test. The gaps are the three findings below, all untested.

## B. AC-11: does the inspection hold more document text than before?

**Verdict on B: AC-11 holds.** No text is held that was not held before, and nothing new can leave the function. Evidence from `git diff 0323301 -- src/engine/inspect.ts src/engine/index.ts` and the full file:

| Data | Where | Holds | Lifetime | Can it leave? |
|---|---|---|---|---|
| The page's `Character[]` (code point, origin, quad, angle, direction, block, line) | `readText` `:817`, now also exposed as `TextReading.characters` `:191`, `:854` | document text, exactly as before | one `inspectPage` call; was already held by the `characterAt` closure | No. It is the same array, not a copy, and `inspectPage` returns none of it |
| `DrawingReading.clipGlyphs` | new, filled at `:934` | origins of every clip mode glyph (positions only, no text) | one `inspectPage` call. Before, the same origins lived in `open[]` and, for unpainted clips, in `clipOnly` | No |
| `machineReadTest` state | `:434-447` | `answers`: one byte per character (unasked, qualifies, fails); two origin indexes, invisible glyph origins and clip glyph origins mapped to `true` | one `inspectPage` call, built lazily on the first ask | No |
| `painted` (`byOrigin(drawing.paints)`) | hoisted to `:291` from `concealedGlyphs` | painted glyph origins, as before | now to the end of `inspectPage` instead of the end of `concealedGlyphs`; same order of magnitude | No |
| `machineReadRun` locals | `:401-402` | a counter and a line number | stack | No; it returns a boolean that only steers `continue` |
| Return value | `:374-379` | `findings` (closed set), `readable` boolean, `concealed` origins and kinds, `emptyClip` boolean | as before | These are the existing shapes. `PAGE_FINDINGS`, `PageReading`, `PageInspection` untouched |

There is no `console`, no logging, no new error path (a throw in `inspectOne` is still `EngineFailure("unsupported")` with a kind only, `:166-168`), and no new MuPDF object. New derived data is flags and positions, never code points or strings, so the finding still says which rule held and never what the page holds or where. The new exports on `src/engine/index.ts:114-115` are for tests; the wall is unaffected. A note for accuracy: AC-11 says "no more of the page's text is held". Strictly, new per character flags and clip origins are held, but they are not text and they die with the page.

## Blockers

None.

## Major

### 🟠 A photo overlapped by a few characters of a scan's text layer loses `bare-picture`, `src/engine/inspect.ts:323-328` and `:409`

**Problem**: The run is tested against each picture's footprint alone (`holds(footprint, centre)`), and a character is attributed to every picture whose footprint contains its centre. When a photo or ID card is pasted onto an OCR scan and three or more characters of one line of the scan's own layer centre inside the photo, the photo is judged "read". Reproduced with the real MuPDF: a full page scan, a 300 by 300 pt photo drawn after it, one invisible 55 character line (coverage about 1% of the photo, under `TEXT_OVER_PICTURE_MAX`). Old code: `["bare-picture", "machine-read-text"]`. New code: `["machine-read-text"]`. The same result with the layer drawn before the photo, which is the usual order when a photo is added to an OCR file later in an editor (the photo then hides those characters). Two full page pictures with one run over both clear both, which is the AC-7 layered case and fine; the fault is the photo that sits inside a larger picture whose text it merely overlaps.

**Why it matters**: This is the case the spec's own AC-3 sets out to keep warned ("a photo pasted onto an OCR scan page"), but its fixture only tests a photo the layer does not reach. The old coverage rule already treated a large overlap as read; this rule moves the threshold from 5% of the photo's area to three characters, so a photo overlapped by a line end now loses the one line that tells the visitor its words cannot be found or removed. The file then downloads as `-redacted.pdf`. The photo's content was never read. The machine read note's new sentence names "handwriting, stamps or tables" and not photos, so it does not cover this. Spec Consequences record noise, one word over handwriting and crafted files, not this.

**Suggested fix**: Decide it in the spec, then pin it. Preferred: a run counts for a picture only if the picture is not wholly inside a strictly larger picture's footprint that holds the same characters; equal footprints (AC-7 layers, two full page pictures) stay exempt, and this fails safe. Add a fixture page for it in `READ_PICTURES` (scan plus layer plus a photo overlapped by a line end, drawn both before and after the layer), expecting `bare-picture`. If the author prefers to accept the behaviour, record it under Consequences, add the fixture with the accepted expectation so a future change is visible, and add "photos" to the note's list of what OCR may have missed.

## Minor

### 🟡 "Purely invisible" holds only to 0.01 pt, so a drifting hidden duplicate of visible text clears the warning, `src/engine/inspect.ts:454`

**Problem**: `painted.at(origin) === null` uses `POSITION_TOLERANCE` (0.01 pt). A page with a visible sentence over a photo and an invisible copy of it offset by 0.5 pt (my A4) gives old `["bare-picture", "machine-read-text"]` and new `["machine-read-text"]`, because the invisible characters no longer meet a painted glyph and form a run. A producer that draws hidden and visible copies with different kerning or `TJ` adjustments drifts far more than 0.01 pt.
**Why it matters**: INV-1 and AC-4 say visible text never clears a picture through the new rule, and the rationale lists "a producer that draws text both ways" as the reason for the purely invisible test. The defence is exact to the point of being brittle. It sits in the same family as the recorded "crafted file" limit, which is why this is not Major.
**Suggested fix**: Reject a character when any painted glyph origin lies inside the character's own quad (or within a fraction of an em), not only within 0.01 pt. Add a fixture for the offset duplicate.

### 🟡 A run of punctuation or format characters counts as a word, `src/engine/inspect.ts:409` and `isReadable` `:787-791`

**Problem**: A "readable" character is anything not whitespace, Cc, Co, Cs or U+FFFD. So `___`, `...`, `|||` and `---` (what OCR emits for form rules, dotted leaders and table borders) form a run and clear a picture (my A9, A9b: old `scanned`, new `machine-read-text` only), and so would three zero width or soft hyphen characters (U+200B, U+200D and U+00AD are all "readable" by that pattern; checked). The spec accepts `lll` and `~~~`, but its third user story is "a picture that OCR never read, or read only as stray marks, stays named", and the stray marks fixture only passes because its marks are spaced apart.
**Why it matters**: This is the direction that removes a warning, and rules and underscores are the commonest junk on photos, handwriting and forms.
**Suggested fix**: Require at least one letter or number (`\p{L}` or `\p{N}`) in a run, or exclude punctuation, symbols and format characters from qualifying. Keep `isReadable` as it is for the readable count. Add a `___` and a `|||` page to the fixture set.

### 🟡 Dangerous direction test gaps, `tests/unit/reading.test.ts` and `scripts/lib/reading-fixtures.mjs`

**Problem**: The tests prove the named cases but not: a photo overlapped by the layer (major finding above); an offset invisible duplicate; a punctuation only run; a `Tr 5` or `Tr 6` clip (the `clip-stroke` branch at `inspect.ts:929`, which now also pushes `clipGlyphs`, is only reached by `Tr 7` in the tests); and a stroked, white or zero alpha copy at the same origin (these hold today through `paints`, but nothing pins them, and the layered fixture covers only a `Tr 0` fill).
**Why it matters**: The change removes warnings, so a later refactor of `byOrigin` or `clipGlyphs` should fail a test before it can silently widen the exemption.
**Suggested fix**: Add a page per gap to `READ_PICTURES`, each expecting the warning to stay (or, for the accepted overlap, its recorded outcome).

## Nits

- ⚪ `src/engine/inspect.ts:463-466`, `UNASKED`, `QUALIFIES` and `FAILS` are declared after `machineReadTest` uses them; move them above it so the file reads top down.
- ⚪ `docs/specs/0006-scanned-page-detection-warnings/index.md` (Follow-up, sparse OCR pages): the ticked line now begins "Met by spec 0008" and then goes on in the present tense as if the problem still stood ("Sparse OCR scans are named `bare-picture`, because ..."). Put the old description in the past tense.
- ⚪ `docs/specs/0008-sparse-ocr-scans/index.md`, Consequences: it does not record the overlap case (major finding) or the punctuation run beyond `lll`/`~~~`; add them whichever way the author decides.

## Strengths

- The rule is a pure function with unit tested edges (`machineReadRun`, `tests/unit/reading-measures.test.ts`), fed a lazily built, cached per character test, so a born digital page pays nothing and the cost case (50 pages, search on every page) holds under 2 s of CPU.
- The reverse pin (`reading.test.ts`, "finds an invisible glyph at the origin of every character in a run") uses MuPDF's own readers, not the rule, so "at its origin" is proved independently. The clipped "Yes" pin and the Tesseract shaped straight, tilted and rotated pages prove the tilt story on real geometry.
- Painted and clipping glyph origins are shared with the concealment rules rather than duplicated (`painted` hoisted once per page), and nothing about the worker boundary, `PAGE_FINDINGS` or any shape changed.
- The fixtures are reproducible (`make-fixture.mjs` leaves no diff), the copy is the spec's exact words in both forms with matching unit, component and e2e assertions, and the real scan step was recorded in `verify.md`; my own run of the four local scans agrees with it.

## Test coverage

Covered: each finding in `READ_PICTURES` (11 new pages), the clipped letter pin, the reverse pin, the refusal versus open for `read-short-ocr.pdf` including the address found, `isPartly` false and the `-redacted.pdf` name, the Tr 7 clip in both forms, an unmapped font, `machineReadRun` edges, the cost case, both forms of the copy at unit, component and browser level.
Not covered: the overlap case, the drifting duplicate, punctuation only runs, `Tr 5` and `Tr 6`, and non fill copies at one origin (all in the minor test gap finding). I did not run Playwright.
