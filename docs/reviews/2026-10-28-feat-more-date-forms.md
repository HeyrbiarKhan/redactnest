# Review, feat/more-date-forms, 2026-10-28

**Reviewed by**: Claude Sonnet 5.5 (author on a different model)
**Scope**: 19 files, branch vs main (merge base d42464b)
**Verdict**: Approve with nits

## Summary
Spec 0015 adds a second date scan that reads new forms (flush written months, year first, unseparated, two digit years, spaced separators, new joints, added labels, other script digits) only over positions the unchanged first scan leaves free. `detect` yields rescued phone stretches to the first scan only and runs precedence over both. I tried to break the "never removes less than main" bar and could not: it holds by construction and by measurement. Remaining findings are minor.

## Bar check (main vs branch, through `detect`)
Main's `src/detect` and the branch's were loaded side by side (jiti, scratchpad) and compared per digit and per row, three columns: lost (in a row on main, in none on the branch), below today (ticked on main, not ticked on the branch), changed (any main row whose start, end, kind or tick differs).

- 500,000 strings, 3 seeds: 0 lost, 0 below today, 0 changed. Half were phone, SSN, card, IBAN, email, NI and date neighbours of every new form, glued or spaced. Half were token soup (digits, separators, month words, `of`, `th`, birth words, other script digits, `¹`, apostrophes, en dashes).
- The harness is live: it shows the new rows (`DOB 2026.09.27` ticked, `Tel 212 918 8665 20260927` and `212 918 8665 2026.09.27 x` keep the ticked phone row and add an unticked date).
- By construction: `FIRST_PASS` threads the same behaviour as main (diff of removed lines shows only parameter threading; `writtenCouldStart` is an exact prefilter, checked against the `iu` regex, `MONTHS` lookup and `\s` handling); `taken` rows are stepped over whole; date is the last kind in `PRECEDENCE`, so added spans only ever get free pieces; `yieldRescued` receives `dates.first` only, so a rescued phone stretch keeps main's extent; the phone detector, `isNumericDate`, card, SSN and `types.ts` are unchanged.

## Minor
### 🟡 The bar is held only by a scratch measurement, not by a committed test
**Problem**: INV-1/INV-2 are verified by `rationale.md` figures and by hand written literals, but no committed test pins "the first scan is main's" over a corpus. A later edit to `FIRST_PASS` (for example moving a word into `DATE_LABELS` or changing `digitAfter`) would pass every literal test and silently change main's rows.
**Why it matters**: the whole safety argument is that the first scan never changes.
**Suggested fix**: a small unit test holding a frozen list of main's rows for a few dozen strings from the date and phone suites through `datePasses(...).first` and `detect`, or at least a test that `DATE_LABELS` and the first scan's end rules are the pre-0015 values.

### 🟡 Spaced dates are not checked after the date for a longer code
**Problem**: `spacedAt` (`src/detect/date.ts:912`) drops only a digit directly after the date. `2026 - 09 - 27 - 01` lists `2026 - 09 - 27`, and `x 12 - 5 - 2026 - 7` lists `12 - 5 - 2026`. The numeric reader drops these (own separator plus digit), and *Consequences* records only the start side (`Ref 1 / 27 / 09 / 2026`).
**Why it matters**: only extra unticked rows, never a lost row, so the bar is safe; it is undocumented noise.
**Suggested fix**: either add the end side to the *Consequences* line, or apply the own separator and digit test after a spaced date, measured through `detect` first as INV-3 requires.

### 🟡 A piece of a new date can start with stray punctuation
**Problem**: `212 918 8665 1119 21. June 2014` lists a date row `. June 2014` (`tests/unit/detect.test.ts`, AC-12 case). The piece rule trims whitespace only.
**Why it matters**: harmless to the bar (it is an extra row over free digits), but a row beginning with a full stop looks odd in the checklist and removes the stray period.
**Suggested fix**: none needed for the bar; consider noting it beside the "free pieces" Consequences line, or trim leading punctuation of a date piece in a later spec.

## Nits
- ⚪ `src/detect/date.ts:1043` `WORD_REACH = 5` is justified for `12-15 May`; a comment line naming the longest case it must cover (`12-15th`) would make a future form easier to check.
- ⚪ `20260927-20260928` and `2026-09-27-20260928` list nothing, because a joiner does not see AC-4 forms beyond it (AC-1, deliberate and matching main). Worth one line in *Consequences* with the other still-missed variants.

## Strengths
- Second scan design makes the bar true by construction, and the `yieldRescued` limitation to `first` fixes a real regression (`1987.12.278`) found in measurement and pinned in `detect.test.ts`.
- Cost is linear: 19 adversarial shapes at about 100,000 characters ran 1.0x to 2.2x main (largest 378 ms for `Sep 1,` repeated), no quadratic growth; the new shapes are in `detect-adversarial.test.ts`.
- Regenerated `tests/fixtures` (run from a scratch directory) are byte identical to the committed ones; 2,766 tests in the six detect suites pass and `eslint src/detect` is clean.
- Rules are threaded as a frozen `DatePassRules` value, no module state, named exports, constants commented as pattern rules.

## Test coverage
Strong. Each AC has literal pins for forms, near misses, markers, labels, other script digits, ticks and the flipped pins with reasons; `detect.test.ts` pins the phone, SSN, card and rescue interactions through `detect` with main's rows; the fixture, `detection.test.ts` and `redaction-check.test.ts` cover the engine path. Gap: the differential bar itself is not a committed test (first finding).
