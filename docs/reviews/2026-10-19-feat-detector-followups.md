# Review, feat/detector-followups, 2026-10-19

**Reviewed by**: Sonnet 5.5 (author on another model)
**Scope**: 33 files, branch against main (13 commits, `d9af65c` to `836214e`); the five fixture PDFs judged through `scripts/make-fixture.mjs` and `scripts/lib/detection-fixtures.mjs`
**Verdict**: Changes requested

## Summary
The change does what spec 0014 says. The phone rescue runs last, lists each stranded stretch as an unticked row of its own and keeps every row the two passes chose exactly as before. The date yield in `detect` is a correct single sweep, and the off line boundary in the find step is linear, uses the line number (which is global across blocks), and parts the target quads round a left stretch. I ran the unit tests for the detectors, detection, redaction check and workflows (2,551 tests, all green). I found one real drop in default protection, and it comes from the bare Social Security tolerance (AC-9), which is the owner's standing bar. The rest are wording notes, including the four the verify run left.

## Major
### 🟠 A bare Social Security tolerance takes a phone number's ticked digits, `src/detect/us-ssn.ts:119`
**Problem**: The `separator !== null` condition was dropped, so a bare run after an SSN word now takes one trailing digit and is listed unticked. The first nine digits of a ten digit run are then claimed by the Social Security row, and the phone detector's ticked row is cut to a one digit piece. I ran this through `detect` on the branch: `SSN 123-45-6789 tel 2125550123 ok` gives `us-ssn:123-45-6789 ticked`, `us-ssn:212555012 unticked`, `phone:3 ticked`. On main the bare run with a trailing digit gave no Social Security row, so the phone detector listed `2125550123` whole, ticked. `SSN 2125550123` is the same (the phone piece is unticked there too). The SSN word only has to sit within `KEYWORD_REACH` before the run, which another number on the same line easily satisfies.
**Why it matters**: The default now removes 1 digit of that phone number where it removed 10. That breaks the owner's bar that the default never removes less than today, and the rule that detector changes lean fail safe. The spec's own cost line for AC-9 counts only the extra unticked Social Security rows (89% of random ten digit runs after `SSN `); it does not measure what those rows do to a ticked phone row beside them, and the corpus check (INV-6) did not cover it.
**Suggested fix**: Either keep the unticked Social Security row but let the phone detector's whole ten digit row survive (for example, do not tolerate the digit when a phone window starting at the same place is valid and covers it, or give the Social Security row only the digits no ticked row of main holds), or take the tolerance only where the glued digit is a footnote marker by some other signal. Whichever is chosen, measure the "ticked digits are a superset of main's" bar through `detect` for ten digit runs after an SSN word, add a test for `SSN 123-45-6789 tel 2125550123`, and record the figure in `rationale.md`.

## Minor
### 🟡 Spec 0014 task 12 names steps that were never added, `docs/specs/0014-detector-follow-ups/index.md:159`
**Problem**: Task 12 says "and the new steps in spec 0005's `verify.md`". No such steps were added, and the "Amends spec 0005" list asks for none.
**Why it matters**: A reader of the spec believes a verify step exists that does not, and a later `/check verify` run may look for it.
**Suggested fix**: Drop the words from task 12, or add the steps.

### 🟡 AC-11 says "the pull request's own run" but CI runs on push only, `docs/specs/0014-detector-follow-ups/index.md:44`
**Problem**: `.github/workflows/ci.yml` triggers on push, and the recorded figure (run #181, commit `bd30169`) came from a push. The rationale explains this, but the criterion still says the pull request's own run.
**Why it matters**: The criterion cannot be met as written, and the spec is the source of truth.
**Suggested fix**: Reword to "the run the pull request shows".

## Nits
- ⚪ `docs/specs/0014-detector-follow-ups/rationale.md:507`, the "worst `finishes within its budget`" figure for email is 20 ms, but CI run #181 has the email line join test at 50 ms; 20 ms is right for spec 0005 AC-16's shapes only, so say "on AC-16's shapes".
- ⚪ `docs/specs/0014-detector-follow-ups/index.md:37`, AC-4 says the baseline is "the median", but `src/engine/find.ts:459` (`upperMedian`) takes the upper median for the baseline as well as the height; reword the criterion to "upper median" in both places.

## Strengths
- The rescue's ordering argument is sound and written down: it runs after both passes, only fills units that were free, so every row main lists keeps its start, end and tick, and the new test writes today's rows out as literals rather than reading them from a copy of the old code.
- The reach skip is pinned by an exact parse count (2,000 for 2,000 numbers side by side), so a change that asks at every unit fails a test rather than just getting slower.
- The date yield in `detect` is one forward sweep, strips `rescued` by destructuring so it never leaves `src/detect`, and trims back to the last letter or digit as the spec asks.
- The off line boundary is one rule for every kind, with its constants in `src/engine` commented as page rules, the target quads parted round a left stretch, and tests that redact each marked row and find the marker still in the output.
- The tests do not read as tautologies: the baselines are literals, rejections sit beside every new tolerance, and the stretch caps and gluing guard have their own cases.

## Test coverage
Well covered. `detect-phone.test.ts` pins every AC-1 and AC-2 case with literal baselines and the AC-3 unit rules; `detect.test.ts` covers the AC-15 yield and the stripped `rescued` field; `detection.test.ts` and `redaction-check.test.ts` read `detect-markers.pdf` through the engine and redact each row alone and together; the adversarial file adds the three rescue shapes and the parse count pin; the Finds columns pin (AC-12) is in both the component and browser tests, and no new timing assertion sits in the `chromium` project. The gap is the one in the Major finding: nothing pins a phone number beside an SSN word after the bare tolerance, and the bar "ticked digits are a superset of main's" is not checked for that kind pair.
