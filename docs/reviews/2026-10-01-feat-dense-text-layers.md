# Review, feat/dense-text-layers, 2026-10-01

**Reviewed by**: Sonnet 5.5, fresh model reviewer (author on a different model)
**Scope**: 16 files, branch vs main (merge base 9b6eda0)
**Verdict**: Approve with nits

## Summary

This change stops invisible OCR text and lines of marks from counting toward a picture's coverage, so a photo pasted onto a dense OCR scan now warns instead of being quietly cleared. Only visible lines that hold a word, with every readable character drawn where the text says, count. I checked the `withinReach` rewrite and the new rule with the focus you asked for. I found no blockers and no majors, and one small test gap and one wording nit.

## Minor

### 🟡 The reach equivalence test goes through findings, not the function, `tests/unit/reading.test.ts:1194`
**Problem**: `withinReach` is not exported, so the test checks the rewrite by looking at page findings and comparing them to the frozen `reachBefore`. It does sweep a quarter point inside and outside each corner and edge across seven turn angles, which is good. But it only probes the first, middle and last character of one 10 letter hidden word, and it never puts a glyph exactly on a boundary (a tie).
**Why it matters**: I checked the maths by hand, so this is not a bug today. The four corners are the same two by two set as before, and each value is built from the same operations in the same order, so the results match bit for bit. Ties therefore behave the same. But the test would not catch a future change that moved a bound by a tiny amount.
**Suggested fix**: Optional. Export `withinReach` for tests only (or its bounds step) and compare it directly with `reachBefore` over random characters and glyph lists, including glyphs placed exactly on the edges. The early return for non finite height, width, origin or zero length direction is character for character the same as main, so degenerate boxes are already safe by reading.

## Nits

- ⚪ `scripts/lib/reading-fixtures.mjs:515`, the `readPictures` doc comment now runs past the width of the lines around it ("From page 28, spec 0010, AC-3 to AC-7. One page per picture rule..."). Wrap it so it matches the density of the rest of the file.

## Strengths

- The frozen `reachBefore` really does match main's `withinReach` (I diffed it against `git show 9b6eda0:src/engine/inspect.ts`). The only difference is that `firstAtLeast` is inlined, and the test comment says never to keep it in step.
- The new rule can only make warnings more likely, never fewer. The set of lines that cover a picture is now a strict subset of what it was (visible, word holding, every readable character drawn at its origin, none hidden there). Machine read text clears a picture only through a run, which is spec 0008's existing, already reviewed test. So I could not find a way for the new rule to wrongly clear a page that should warn. Non finite origins match nothing, so they fail safe too.
- `coverageLines` is pure and its edges (whitespace, U+FFFD, mixed hidden and drawn, punctuation only) are pinned in `reading-measures.test.ts`.
- The glyph indexes are built once per page and only on a page with a picture, so a page with none pays nothing new.
- The fixtures cover both limits that spec 0010 records, and each limit fails safe.

## Test coverage

Good. New logic has unit edge tests (`coverageLines`), real page tests per acceptance criterion in `reading.test.ts`, a cost case for the slowest path, and the updated wording in `page-findings.test.ts`. The one gap is the indirect equivalence test above. The `cost.test.ts` stopwatch flake under parallel load is known and I did not count it.

## Follow ups, not blocking

- `scan-dense-photo-before.pdf` (a local OCR scan, outside git) shows the "slightly crooked" line on a straight scan, because the pasted card makes OCR's nearby lines slant. That is spec 0006's rule, it was there before this change, and it fails safe. Do not fix it here.
- Wording: the download step in `docs/specs/0010-dense-text-layers-over-pictures/verify.md` uses a fixture with no matches. Pick one with a match so the step proves something.
- Wording: spec 0010's Value sourcing row cites `outputNameFor` when it means `outputFormFor`.
