# Review, feat/detector-followups, second, 2026-10-19

**Reviewed by**: Sonnet 5.5 (author on another model)
**Scope**: 28 files, branch against main (18 commits, `d9af65c` to `7c2c03d`, plus one uncommitted change to `docs/specs/0014-detector-follow-ups/verify.md`); the fixture PDFs judged through `scripts/make-fixture.mjs` and `scripts/lib/detection-fixtures.mjs`
**Verdict**: Approve with nits

## Summary
The fix for the first review's Major is complete. `us-ssn.ts` and `date.ts` are byte for byte main's again, the two unit rules are gone from `phone.ts` (only the two INV-14 guard comments remain), and the one marker reading left, a National Insurance number written with no space, takes no digit and no tick from any row main lists. I measured this through `detect`, not through one detector, against main's `src/detect` loaded beside the branch's: over 97,000 strings, no digit loses a row, no row loses a tick, and nothing falls below today. The first review's two Minors and two nits are all addressed. What is left is two wording nits in the spec.

## Measurement
Both copies were loaded through jiti and fed the same strings. Three columns per string: lost (a digit in a row on main that sits in no row on the branch), unticked (a ticked row on main not listed on the branch with the same start, end and tick), below today (a digit in a ticked row on main that is in no ticked row on the branch). I also counted any row of main's whose start, end or kind changed, and any `rescued` field that leaked out of `detect`.

| Set | Strings | Lost | Unticked | Below today | Row changed | `rescued` leaked | Strings with added rows |
|---|---|---|---|---|---|---|---|
| Every string literal holding a digit in `tests/unit/detect*.test.ts`, `redaction-check.test.ts` and `scripts/lib/detection-fixtures.mjs` (template literals with `${...}` skipped) | 885 | 0 | 0 | 0 | 0 | 0 | 21 |
| Seeded layouts, three seeds: valid and merely possible US, UK and international phone numbers, dates of every form, SSNs after an SSN word, NI numbers spaced and unspaced, cards, IBANs, emails, plain digit groups, one glued trailing digit or footnote character, plus targeted phone beside SSN, NI beside neighbours, date beside phone and card beside group families | 56,250 | 0 | 0 | 0 | 0 | 0 | 3,381 |
| Seeded NI family, two seeds: `AB123456` or the spaced form, then a glued tail (`1`, `2`, `9`, `0`, `¹`, `12`, and `1` then one of 17 separators then 1 to 10 digits, so a phone number can follow the marker), with a neighbour of 20 shapes before and after | 40,000 | 0 | 0 | 0 | 0 | 0 | 20,101 |

The 21 corpus strings with added rows match the 21 the rationale records. I also checked that the harness would have caught the first Major: pointed at commit `836214e`'s `us-ssn.ts`, `uk-nino.ts`, `phone.ts` and `index.ts`, it reports `SSN 123-45-6789 tel 2125550123 ok` with 1 unticked row and 9 digits below today, the figures the first review found. So a zero here means something.

## Checks on the fix
- **Every marker reading that takes digits is gone.** `git diff main -- src/detect` touches only `index.ts` (the rescue yield), `phone.ts` (the rescue and two comments), `types.ts` (`rescued`) and `uk-nino.ts` (the one tolerance). `date.ts` and `us-ssn.ts` are unchanged, and `detect-date.pdf` and `detect-us-ssn.pdf` are not in the diff. AC-3's date units (`unitAt` and the date mark) are not in `phone.ts`; the tests pin today's rows for `22-04-20137 8`, `Ref 78-1972-01-21 020 3114 8249`, `DOB: 05.12.1980¹ 12 High Street` and the ISO interval through both `detectPhone` and `detect`.
- **The kept National Insurance marker is safe.** `ninoAt` takes the digit only when the six digits end exactly eight code points after the start (`together`), so any space inside the number drops it as on main, and only when exactly one ASCII digit follows with nothing alphanumeric after it. Two letters glued to six digits keep the phone detector out of them, and the 40,000 string family above, which puts every kind of separator and neighbour after the marker, found nothing taken. `NI PX 85 87 420 020` still lists `85 87 420 020` ticked, pinned in `detect.test.ts`.
- **Spec 0005 matches.** Its lines for the dropped rules read as on main (a bare run stays nine digits, one digit after a two digit year is a longer number), its NI line and INV-17 carry the narrowed tolerance, and its Follow-ups are recorded as decided. Spec 0014's AC-3, AC-9, INV-5, the task list, `verify.md` and the rationale all describe the same narrowed build.
- **First review's other findings.** Task 12 now names no spec 0005 verify steps; AC-11 says "the run the pull request shows"; AC-4 says "upper median" (matching `upperMedian` in `find.ts`); the email figure in `rationale.md` is now scoped to "spec 0005's AC-16 shapes" with the 50 ms line join test named as outside them.

## Nits
- ⚪ `docs/specs/0014-detector-follow-ups/index.md:187`, "a National Insurance number with a space in it still list nothing when one follows (`AB 12 34 56¹`)" is true only of the `uk-nino` detector; through `detect` the phone detector lists the digit groups, ticked, as on main (that is the reason the tolerance is dropped for it). Say "no National Insurance row" so a reader does not think the digits have no row.
- ⚪ `docs/specs/0014-detector-follow-ups/index.md:9` and `:34`, the summary and AC-1 say the corpus is 1,258 strings, while the Consequences (`:175`) and `rationale.md:562` say 1,393. The corpus grew with the tests, so the older figure is stale in two places; use one figure, or say which build each was taken on.

## Strengths
- The fix is a removal, not a patch on top: the dropped rules are out of code, tests, fixtures, spec 0005 and the rationale together, and the one kept rule has a stated reason it takes nothing (two glued letters keep every other detector out), which my 40,000 string family confirms.
- The rationale's own corpus count of 21 strings with added rows reproduces exactly under an independent harness, and the owner's three bars are measured in the three columns that matter, with a below today column rather than only a "whole row still ticked" test.
- The rescue still runs last and only gives a row to a unit main leaves bare; `rescued` is stripped by destructuring inside `detect`, and no `rescued` field leaked in any of the 97,000 strings.
- The review's own case is now a test (`SSN 123-45-6789 tel 2125550123 ok` in `detect.test.ts`), with today's rows written as literals beside it, as are the shapes the owner dropped, so the loss cannot come back quietly.

## Test coverage
Well covered. I ran `detect-phone`, `detect`, `detect-uk-nino`, `detect-adversarial`, `detection` and `redaction-check` together: 6 files, 1,740 tests, all green (the adversarial budget cases passed in this run, so no timing note). `pnpm typecheck` is clean. `pnpm lint` has no error; its one warning is in `.playwright-mcp/axe-run.js`, an untracked scratch file outside this branch. New logic is covered: the NI tolerance has its accepted forms, its kept rejections and the spaced forms; the rescue has literal baselines, the reach skip is pinned by a parse count, and the yield to dates has its own cases. No gap worth a finding.
