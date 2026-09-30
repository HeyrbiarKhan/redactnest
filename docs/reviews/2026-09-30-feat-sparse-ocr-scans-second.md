# Review, feat/sparse-ocr-scans (second review), 2026-09-30

**Reviewed by**: Claude Sonnet 5.5 (author on a different model)
**Scope**: 21 files, branch vs main (merge base 0323301, 14 commits). This is the second review, after the fixes to `2026-09-30-feat-sparse-ocr-scans.md`.
**Verdict**: Approve with nits

## Summary

The three new rules (AC-14 letters and numbers only, AC-15 a line beside drawn text is a drawn copy, AC-16 text over two different pictures counts for neither) all do what the spec says, and I could not make any of them let a picture lose its warning when its text was not read. Each rule only ever takes characters out of a run, never adds one, so no page keeps a warning today that it lost under the first build. The one place a picture still loses its warning without a word being read is the older line box coverage test, which this branch leaves alone on purpose. It is partly recorded (page 28) but the spec's summary and user story say more than it delivers, so that is worth fixing in words. There are no blockers and no majors.

## What I ran

- `pnpm exec vitest run --project unit` on `reading.test.ts`, `reading-measures.test.ts`, `page-findings.test.ts`: 222 pass. `cost.test.ts` alone: 5 of 5 pass. `pnpm lint` and `pnpm typecheck`: clean. The working tree stayed clean. I did not run Playwright.
- An adversarial harness in my scratchpad (outside the repo), driving the real MuPDF and the real `inspectPages` over about 90 one page PDFs I wrote for this review. Nothing was written into the repo.

## The central question: can a picture whose text was not read still lose its warning?

**Answer: not through AC-14, AC-15 or AC-16 that I could find. Yes through the older coverage test (finding 1), and through limits the spec already records.**

How the code decides: a picture is only searched after it fails the coverage test (`src/engine/inspect.ts:346-350`) and only when the page draws at least 3 invisible glyphs (`:357`). `machineReadRun` (`:463`) asks, for each character, whether its quad centre is inside the picture and inside no picture of a different footprint (`runAreas`, `:683`), and only then asks its step. A step is `ends` unless the character has an invisible glyph at its origin and its line is no drawn copy (`machineReadTest`, `:515`).

Inputs I traced or ran, and whether the warning survives. "Clears" means the picture stopped being bare.

| Input | Result | Why |
|---|---|---|
| Visible text at the same place as the hidden text (Tr 0, Tr 1 stroke, Tr 2, white fill, zero opacity fill) | Warning stays | Every fill or stroke lands in `drawing.paints`, so the origin is within reach of the character |
| Clipping glyphs, Tr 4 to 7 | Warning stays | Tr 4 also fills, so it is in `paints`. Tr 5 to 7 go through `clipGlyphs` |
| Visible text in a Type 3 font, hidden Helvetica copy on top | Warning stays (`scanned` plus `machine-read-text`) | I measured that MuPDF sends Type 3 text through `fillText` (`text:fill x12`), so its origins are known |
| Hidden copy offset 0.5 pt, drifting with `Tc 0.6`, 4 pt above, 4 pt below, shifted 10 pt sideways | Warning stays | The reach is half the hidden character's quad height, along and across its own direction |
| The same offset and drift copies on `/Rotate 90`, `180`, `270` and on text tilted 1, 3 and 10 degrees | Warning stays | The reach is measured in the line's direction, not in plain x and y |
| Visible line 14.4 pt above the hidden line | Clears, as the spec says | The next line is out of reach on purpose |
| A single visible word on the same baseline but past the end of the hidden line | Clears | Outside the reach of every hidden character. This is a real sparse scan with a stamp beyond its text, so it is right |
| Punctuation only runs (`___`, `...`, `\|\|\|`), one to three lines | Warning stays | `runStep` ends on them |
| Punctuation only lines, six or more | **Clears** | Coverage test, not the run. See finding 1 |
| Two pictures of different footprints, text over both | Both stay bare | `others` veto, including a picture that passed coverage, drawn before or after the text |
| Photo inset 8 pt or 14 pt, or shifted 5 pt, inside a full page scan | Warning stays | Different grid points, so a different footprint |
| Photo placed within about one grid cell of the scan's edges | Clears | Recorded limit (AC-16) |
| Picture under 5% of the visible page | Not a picture | Spec 0006's rule, unchanged. Text over it counts for the picture beneath |
| Picture 60% off the page with three hidden letters over its visible part | Clears | It is read, correctly |
| Picture 100% off the page | Not a picture, no finding | Unchanged |
| Rotated picture (30 degrees), mirrored picture (negative scale) with text over it | Clears | `containsPoint` is sign based, so winding does not matter, and `isDegenerate` uses the absolute area |
| Text layer inside a clip smaller than the picture | Warning stays | Characters outside the clip are not in the footprint, which is cut to the clip |
| Hidden text, then an opaque white page rectangle over a photo | Photo clears, plus `hidden-text` | The photo is invisible under the rectangle, so no harm, and the hidden text is named |
| Huge size (3e38, 1e20), zero `Tm`, flat `Tm` (zero y scale) | Warning stays | Non finite or degenerate quads have a centre that is not inside anything, so the step is never asked. No crash |
| Sheared `Tm`, `Tz 0.0001` (all letters stacked at one point) | Clears | A crafted file. Same family as the recorded "crafted file" limit |
| Hundreds of overlapping pictures with thousands of characters | No slowdown | I timed 150 pictures and 10,800 characters at 540 ms. The veto exits at the first overlapping picture, and a character outside the footprint never reaches it |

Why the three rules cannot create a new false clear: AC-14 turns "readable" into "letter or number", AC-15 replaces an exact origin match with a wider one that contains it, and AC-16 adds a veto. Each can only remove a character from a run. I checked the widening: the reach is at least `POSITION_TOLERANCE` and always includes the character's own origin (along is 0, across is 0), so nothing the old exact match caught is lost, apart from a rotated 0.01 pt corner case that does not matter.

## Is `withinReach` right? (AC-15, every branch)

Yes, it holds. I read `src/engine/inspect.ts:615-658` line by line.

- **The guard** (`:621-629`). Height, width, origin x and y use `Number.isFinite`, which is false for NaN and both infinities, so none of those rely on a comparison that quietly evaluates false. Direction goes through `length = Math.hypot(dx, dy)` and `!(length > 0 && Number.isFinite(length))`. For NaN, `NaN > 0` is false, so the `&&` is false and the `!` makes it true: a drawn copy, as the spec says. A zero vector, an infinite one and a NaN one all land there too.
- **After the guard** every input is finite, so `ux`, `uy`, `reach`, `before` and `past` are finite and `Math.min` and `Math.max` cannot return NaN. `firstAtLeast` compares against a finite `x0`, the loop's `x > x1` break is safe, and `drawnOrigins` (`:594`) already left out every non finite drawn origin, so the sorted list has no NaN to spoil the order. A non finite drawn origin lying "within reach of no character" is right: MuPDF cannot paint at one.
- **The geometry**. `across = (y - oy) * ux - (x - ox) * uy` is the dot product with the normal `(-uy, ux)`. The four corners used for the bounding box match that frame (`:639-646`). The along range `[-reach, width + reach]` and the across range `[-reach, reach]` are what the spec states. I confirmed it with real pages on all four page rotations and three tilts (table above).
- **Height zero** is fine: the reach is `POSITION_TOLERANCE`, so a copy must sit on the origin.
- **Overflow** cannot happen: MuPDF's numbers are 32 bit floats, so the doubles here never overflow.
- **Reachability**. The height and width checks are effectively unreachable through a real PDF. `machineReadRun` asks `inside(quadCentre(quad))` before it asks the step (`:476`), and a quad with any non finite corner has a non finite centre, which `containsPoint` answers false for (I traced the NaN and the infinity cases). So only a character with a finite quad and a bad origin or direction can reach the guard. That is harmless defence in depth, but it means no PDF test can exercise those branches, which is why it feels untested. See finding 2.

## Is the 28 page `read-pictures.pdf` gap a problem?

No. The unit table (`tests/unit/reading.test.ts`, the `READ_PICTURES` test) reads all 28 pages through the same `inspectPages` and the same MuPDF WebAssembly package the worker uses, so the findings per page are proved exactly. What a browser run adds is only the worker wiring and the page cap, and `read-short-ocr.pdf` covers that path end to end in `design-system.spec.ts`. `verify.md` also records a hand run of all 28 pages on a production build with the page cap raised. I would not spend an e2e test on it. The only thing worth keeping an eye on is that page numbers in `verify.md` and the spec text drift if a page is inserted; the table test compares by index, so it would fail loudly.

## Blockers

None.

## Major

None.

## Minor

### Minor 1. Dense junk text still clears a picture through the coverage test, and the spec says it never does, `src/engine/inspect.ts:346-350`, `docs/specs/0008-sparse-ocr-scans/index.md:8`

**Problem**: The line box coverage test runs before any run is asked, and it counts any readable line, visible or invisible, punctuation included. I built a scan whose only text layer is six lines of `|||||…` (hidden). The result is `["machine-read-text"]`: no warning at all, although no letter or number was read. One to three such lines stay bare, six clear it. The spec's Summary and its third user story say "stray marks and punctuation ... never clear a warning" and "a picture that OCR never read, or read only as stray marks or punctuation, to stay named". AC-1 does say a picture with no run is judged by the coverage test "exactly as today", and page 28 records the photo version of this, but nothing records that the junk AC-14 was written to stop still clears a scan once it is dense enough. Ruled forms and tables, the commonest source of `|` and `_` junk, are the natural victims.
**Why it matters**: This is the one route I found where a picture whose words were not read loses its warning, and the new copy ("Words it missed ... stay in the picture") does not cover it. It is not new (the old code did the same), so I do not call it major, but the spec reads as if AC-14 closed the door.
**Suggested fix**: Say it in words now: change the Summary and user story 3 to "judged by the coverage test, as before, when the layer covers enough of the picture", add dense punctuation layers to the Negative tradeoffs, and widen feature 20 and the Follow-up so it covers "any readable line, not only a dense OCR layer over a photo". Optionally add a fixture page for six punctuation lines with the accepted expectation, so a future change to the coverage test shows up.

### Minor 2. The copy rule is proved on upright pages and for "next line out of reach" only; its other branches have no test, `tests/unit/reading.test.ts:716-760`, `src/engine/inspect.ts:621`

**Problem**: Pages 26 and 27 prove an offset and a drifting copy upright, and the rotated page test only proves the neighbouring line is not caught. Nothing pins that a copy is caught on a turned page or a tilted line (I checked by hand on `/Rotate 90`, `180`, `270` and tilts of 1, 3 and 10 degrees, and all keep the warning, so the code is right today). A sign error in `across` or `along` that under detects would pass every current test. The non finite guard (`:621-629`) is private and, as shown above, cannot be reached through a PDF, so it has no test at all.
**Why it matters**: This is the rule that stops a hidden duplicate from clearing a picture. A later refactor of the direction maths should fail a test before it can clear a picture.
**Suggested fix**: Add two rotated pages to the existing `it.each` of copies (an offset copy and a drifting copy, each on `/Rotate 90`), expecting `bare-picture`. For the guard, either export `withinReach` through `src/engine/index.ts` like `machineReadRun` and unit test it with a NaN height, an infinite width, a zero direction and a NaN origin, or drop the height and width checks as dead and keep only origin and direction, with a comment saying why.

## Nits

- `docs/scope/scope.md:159`, feature 19's "Done when" still says "a run of three readable, purely invisible characters", which is the first build's rule. After AC-14 to AC-16 it is letters and numbers, on a line with no drawn text beside it, over one picture.
- `src/engine/inspect.ts:85-98`, the comment on `MACHINE_READ_RUN` names AC-1 and AC-14 but not the drawn copy rule (AC-15), which decides as much as the number does. Add a half sentence pointing at `COPY_REACH_RATIO`.
- `src/engine/inspect.ts:615`, the `withinReach` comment says a character whose height or width cannot be measured "answers yes ... and fails safe". True, but the caller never asks such a character; one clause saying so would save the next reader the trace I did.

## Strengths

- Every new rule is monotone (it can only take characters out of a run), which the spec states as INV-5 and I confirmed in code: a run is never made easier to form.
- The copy rule is judged per line with the reach in the line's own direction, and the spec explains why with a measured page (27, where judging character by character would have cleared the scan). I could not break it with rotation, tilt, offset, drift or a Type 3 visible copy.
- `machineReadRun` and `runStep` are pure and exported, with their edges (2 against 3, marks, line ends, centres outside) tested as plain logic, and the cost test now reaches every new branch on 50 pages within the 2 second budget.
- Failures go the safe way throughout: a degenerate footprint holds no point, a non finite centre is inside nothing, and `others` includes a picture that passed the coverage test.
- Fixtures are reproducible from code, the new pages are pinned by index with comments naming the AC and the measured reason, and the recorded limits (page 28, footprints within a grid cell) each have a page that would show a change.

## Test coverage

Covered: every new page of `read-pictures.pdf` (20 to 28) through the table test, `runStep` and `machineReadRun` edges, the five kinds of copy at one origin, the next line pin upright and turned, the format character pin, the clipped letter pin, the reverse pin on the run pages, the stamp cap staying with punctuation, the small logo against a larger picture, `read-short-ocr.pdf` end to end (unit and Playwright), and three cost cases.
Not covered: a copy caught on a turned or tilted page, the non finite guard in `withinReach`, and a dense punctuation layer clearing a scan through the coverage test (minor findings 2 and 1). The Playwright suite was not run for this review.
