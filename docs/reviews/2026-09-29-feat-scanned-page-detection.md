# Review, feat/scanned-page-detection, 2026-09-29

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 86 files, branch vs main (merge base 3f979a2, plus the uncommitted `docs/scope/scope.md` tick)
**Verdict**: Approve with nits

## Summary

The branch reads every page once through a callback `Device` pass plus the ordinary text read, turns that into closed per page findings, refuses a document with nothing readable at open, trims text and drawn shapes outside the visible area on both the review copy and every working copy, proves the trim, and adds one self check rule. It names the file partly redacted when any page carries a warning. I found no blocker and no major. Spec 0004's guarantees hold: the trim runs before the character record, so a trimmed character is never expected back; the new self check rule is `redaction-incomplete` whatever is ticked; the run's trim is compared with the open's before any file is posted; pictures are never decoded. The Vitest unit project passes (35 files, 1452 tests). The headline items are the sparse OCR scan classification (a follow up) and a few untested corners of the trim.

## Verdicts on the four verify notes

1. **Sparse OCR scans named `bare-picture` (follow up, Minor).** Confirmed from `src/engine/inspect.ts:287-296`: a picture is bare when the union of readable line boxes covers under 5% of it, and `TEXT_OVER_PICTURE_MAX` is a cliff, so the crooked scan (about 6%) and the straight one (2 to 3%) get different warnings for the same content. It fails safe, and the fixture (`sparse scan fixture expects` it) and spec 0006 AC-4 as written allow it, so it is not a bug against the contract. It is still a real product problem, not just a note. The advice line says "run it through text recognition (OCR) first, then open the result here" (`src/lib/page-findings.ts:255`), and a sparse OCR result then opens with "Words inside a picture can't be found or removed" plus the same advice, and always downloads as `-partly-redacted`. Following the advice can never clear the warning. The page already carries `machine-read-text`, which is the more accurate signal. Take this back to `/architect` after merge: exempt a picture from `bare-picture` when invisible text sits over it (AC-5's signal) or measure text over the picture by word boxes or glyph count instead of a line union. A close cousin is `scanned` for a short OCR page (`STAMP_MAX_CHARS`, `inspect.ts:306`): an OCR scan with under 40 characters is refused outright as `no-readable-text` although OCR read it. It is the same root cause, and it fails safe.
2. **Trim CPU cost noisy, 0.5 to 0.9 s open and 0.4 to 1.1 s run (accept).** `tests/unit/cost.test.ts` asserts the least of three passes under 2 s, and only CPU time, so it will not flake under load. There is 2x headroom at the noisy end. Two things the number does not cover: each open pays two per page `setTimeout(0)` yields (inspect and trim), and browsers clamp nested timers to about 4 ms, so a 50 page open adds roughly 0.4 s of wall time; and the trim runs a full drawing pass on every page in every run, not only trimmed pages (`trim.ts:133`). Neither is worth a change now. Re-measure on a real 50 page file in the browser build before quoting the budget as met.
3. **Cut addresses on a cropped scan show as fragments, `oe@example.com` (accept, Nit).** Detection deliberately reads the trimmed page (spec 0004 INV-9 as reworded, spec 0006 INV-3), so the row shows what is left of the OCR layer. The removed prefix is truly gone from the file, and ticking the fragment removes the rest. The picture still holds the whole address as pixels, which `off-page-picture` already says. Nothing to fix; a line in the copy can wait for feature 8.
4. **Tests import `originIndex`, `polygonArea` and `clipToConvex` from engine internals (Nit).** `tests/` is outside the wall on purpose (`src/engine/AGENTS.md`), and the ESLint zone does not cover tests, so this is allowed. It is the only place tests reach into a sub path (`@/engine/characters`, `@/engine/geometry`) while everything else uses `@/engine`, and `index.ts` already re-exports a wide seam. Either re-export the three from `index.ts` or leave it; no bug either way.

## Minor

### 🟡 Sparse OCR scans are always `bare-picture`, `src/engine/inspect.ts:287`
**Problem**: See note 1. Coverage by line box union against a 5% cliff is a poor proxy for "this picture has a text layer".
**Why it matters**: The recommended fix (run OCR first) never clears the warning, and near threshold scans flip on a 1 degree tilt. Fails safe, but it makes the partly redacted name meaningless on the most common legitimate input.
**Suggested fix**: A follow up spec amend. Treat invisible text over the picture as text over it, or count words or glyphs. Keep the rule and threshold measured against the local scans.

### 🟡 No test of the trim on a `/Rotate` page, `src/engine/trim.ts:121`
**Problem**: No fixture or test in `reading-fixtures.mjs`, `trim.test.ts` or `reading*.test.ts` sets `/Rotate`. `planTrim` builds strips in `page.getBounds()` space, reads the media box with `getBounds("MediaBox")` for the unbounded shade fallback, and the redaction areas are set through annotation quad points, so rotation and crop offset must agree across all three.
**Why it matters**: Rotated scans are common. The proof (`prove`) makes a wrong strip fail closed (`edge-text` or `unsupported`) rather than leak, so this is a refused open and never a bad file, but it would be a regression to files that open today only if they also have off page content.
**Suggested fix**: Add a rotated and cropped fixture with text past the crop and a straddling line to `make-fixture.mjs`, and pin open, run and self check on it.

### 🟡 Non-finite line boxes are skipped by the trim but flagged by the self check, `src/engine/trim.ts:178` and `src/engine/characters.ts` (`compareMode`)
**Problem**: `walkLines` callers ignore a line whose box is not finite, so a page whose only off page character has a NaN quad is not trimmed. The self check counts a NaN centre as outside, so every run on that file fails `redaction-incomplete` after the visitor reviewed and ticked.
**Why it matters**: Fails closed and needs a malformed file, but the failure comes at Redact, not at open, and blames the leak kind.
**Suggested fix**: Have the trim treat a non-finite line box as an off page trigger (or fail the open `unsupported`), so open and run agree.

### 🟡 `disown` reaches into a private MuPDF.js field, `src/engine/device.ts:746`
**Problem**: `object.constructor._finalizer` is an internal name. If a MuPDF.js release renames it, `registry?.unregister` silently does nothing and a collected `Shade` wrapper frees a shading MuPDF still uses (measured: the next page run crashes).
**Why it matters**: Silent, and the failure shows up as a crash on shaded pages after a dependency bump. `tests/unit/device.test.ts:228` and `:279` pin the field, so an upgrade should fail a test first.
**Suggested fix**: Keep the pin. Optionally make `disown` throw when the registry is missing, so an upgrade fails loudly at the first shading rather than only in the test.

## Nits

- ⚪ `src/engine/AGENTS.md:15`, the fixed pipeline order still lists "inventory, prepare, validate targets, ..." with no trim, and the Files list omits `device.ts`, `inspect.ts` and `trim.ts`. `/sync` has not run yet; it should.
- ⚪ `docs/scope/scope.md:121`, the spec 0006 line lists `pixels.ts` among the code, but its net diff against main is empty (added and reverted within the branch). Drop it from the list.
- ⚪ `tests/unit/reading-measures.test.ts:21-22`, the two sub path engine imports (note 4).
- ⚪ `src/engine/trim.ts:177`, a line box includes the inferred space at a line's end, so a trailing space past the edge alone starts a pass and adds the `off-page-content` note; harmless, since the proof skips whitespace.
- ⚪ `src/engine/inspect.ts:314`, `unreadable-text` when glyphs are drawn and no readable character exists overlaps `readsAsNothing`'s `!readable`; consistent, but a one line comment would save a reader the cross check.

## Strengths

- The trim design keeps spec 0004's contract intact: it runs through the same function on both copies, before the record, proves its own text work per page in both extraction modes, and the worker refuses to post a file whose trim disagrees with the summary (`engine.worker.ts` `trimAgrees`), so the download name and the warning always describe the bytes handed over.
- The self check's new rule is `redaction-incomplete` regardless of ticks, and it breaks early, which is the right severity for a leak and does not disturb the existing kind precedence.
- Every MuPDF object a device callback receives is released in a `finally`, no callback can throw into C frames, and the `Shade` special case is pinned by tests. `openDocumentWith` closes the document on every failure path including a cancel.
- Decisions that measurement overturned (blanking pictures, 800 MB and 5x growth) were recorded in the spec and reversed to "keep whole and name", with a byte identical image test on a 50 page scan.
- Privacy holds: findings, concealments and the two new error kinds are closed sets, and `DocumentSummary` and `RedactionOutcome` stay `LoggablePayload`, checked by `loggable.test.ts`.

## Test coverage

Strong and mostly behavioural: `reading.test.ts` (817 lines), `reading-measures.test.ts`, `trim.test.ts`, `device.test.ts` (callback release, heap flat), `cost.test.ts` (CPU budget, byte identical images, cancel within one page), `page-findings.test.ts`, worker queue and cancel tests, component tests for the callouts and checklist, and e2e for the flagged, notes, concealed and refused states. The unit project passes (1452 tests). Gaps: rotated pages, a non-finite line box, and no assertion that following the OCR advice clears a warning (which today it does not, see note 1). Only the four items above are untested corners; I did not run the e2e project.
