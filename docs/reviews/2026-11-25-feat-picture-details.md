# Review, feat/picture-details, 2026-11-25

**Reviewed by**: Sonnet 5.5 in a fresh session (author model not stated to me)
**Scope**: 41 files, branch vs main (merge base 91cb119)
**Verdict**: Approve with nits

## Summary
The branch adds spec 0025: a pure reader of JPEG and JPEG 2000 containers (`src/engine/picture-reader.ts`), a strip step in the rebuild, a matching check inside the self check, one new closed kind (`picture-details`), new words, and fixtures built from code. I read the reader line by line against AC-2, AC-3 and AC-4 and found no deviation. The strip, the guard and the self check all use the same reader and the same `pictureFilter`, so they cannot disagree. Unit tests for the reader, the picture redaction tests, the flow text, home text and protocol tests pass (239 tests), and eslint is clean on `src/engine`, `src/lib`, `src/app/security` and `scripts/lib`. Only nits and small minors remain. I did not open any PDF outside `tests/fixtures`, and I did not run the Playwright suite or the stopwatch cost tests.

## Minor
### 🟡 Root and engine AGENTS.md still say there is one named parser exception, `AGENTS.md` (root, "One named exception to one PDF parser")
**Problem**: Spec 0001 now names a second exception (`picture-reader.ts`), but the root AGENTS.md and `src/engine/AGENTS.md` do not mention it, the new strip step, or the pipeline order change (strip after `sweepCarriers`).
**Why it matters**: The next agent will treat `picture-reader.ts` as a rule break, or reorder the run. The spec's own Follow-up already lists this for `/sync`.
**Suggested fix**: Run `/sync` before merge, or note it in the PR as owed.

### 🟡 No cancel checkpoint while many pictures are only read, `src/engine/rebuild.ts:353` (`stripPictureDetails`)
**Problem**: `checkpoint()` runs only after a picture is written. A run with thousands of clean pictures (a typical scan: no writes) reads and copies each one with no yield.
**Why it matters**: A cancel waits for the whole read pass. The spec asks only for a checkpoint after each write, and the cost budget bounds the time, so this matches the spec, but it is the one place a long loop never yields.
**Suggested fix**: Optional: also yield every N pictures, or accept and record it as a known limit.

### 🟡 No fixture with an EXIF orientation tag, `scripts/lib/picture-fixtures.mjs`
**Problem**: The strip drops EXIF, including orientation. The claim "pixels unchanged" rests on MuPDF and PDF viewers ignoring EXIF orientation for a PDF image. The fixtures hold EXIF make and GPS but no orientation value, so the render equality tests cannot show this.
**Why it matters**: Low risk (PDF viewers ignore it), but it is the one EXIF field that could change a drawing, and nothing pins it.
**Suggested fix**: Add an orientation tag (for example 6) to the page 1 EXIF in the fixture and let the existing render equality test cover it.

## Nits
- ⚪ `src/lib/policy-changes.ts:53`, the 2026-11-24 date is a guess at the merge day; the comment already says to move it if merge is later. Do that at merge, and keep the list newest first.
- ⚪ `docs/specs/0025-picture-details/index.md:4`, Status is still "In Progress" though all ten tasks are ticked; set it when verify closes.
- ⚪ `docs/specs/0024-search-pages/index.md` and its `verify.md` are edited in this branch (Status Accepted, task 13 ticked). It is unrelated bookkeeping; fine, but it makes the diff look wider than the feature.
- ⚪ `src/engine/picture-reader.ts:132`, `AS_STORED` and `CLEAN` are frozen shared objects, which is good; the `PicturePart` type could be formatted on one line to match nearby style (prettier passes, so cosmetic only).

## Strengths
- One reader decides for the strip, the guard and the self check; the guard rereads the new bytes and compares every decoding part byte for byte, so a reader bug fails closed with `unsupported` instead of damaging a picture.
- Allowlist design: unknown segments and boxes go by default, every doubtful container answers `as-stored` and is never touched, never refused, never reported.
- Nothing is resolved (`doc.newIndirect`, `readRawStream`, `writeRawStream` through the reference), so the MuPDF dedup quirk is respected; role comes from the walk, not from the object's own `/Subtype`.
- Words and walls hold: the kind is closed and appended last, its words live in `flow-text.ts`, `HOME_STRIPPED` is typed and false with a reasoned comment, the security page line carries a source comment and states the limit by kind, and `SECURITY_CHANGES` gets an entry.
- Fixtures are written from code only; the scripts import no file reads and nothing outside the repo. Spec amendments (0001, 0004, 0006, 0007, 0019, 0021) match what the code does.

## Test coverage
Strong. `picture-reader.test.ts` covers each kept and dropped marker, fill, stuffed and restart bytes, a missing end marker, tails, the JFIF and Adobe rewrites, the ICC branch, every `as-stored` case, extended and zero box lengths, nested header pruning and tile part edges, plus the guard's comparison. `redaction-pictures.test.ts` covers marker absence in raw streams, pixel equality, kinds, the strip skipped (the check fires), the Flate blank path, and every filter form left as stored. The gate swaps the strip for main's rows. An e2e test downloads the file in a real browser and searches the raw streams. Not run by me: Playwright and `cost.test.ts` (stopwatch tests flake in the parallel suite); the cost test's AC-12 budgets should be rerun alone before merge.
