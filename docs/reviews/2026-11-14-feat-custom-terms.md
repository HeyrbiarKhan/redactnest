# Review, feat/custom-terms, 2026-11-14

**Reviewed by**: Sonnet 5.5 (author on a different model)
**Scope**: 83 files, branch vs main (merge base 9cbb4c3, 30 commits), working tree clean
**Verdict**: Approve with nits

## Summary

Adds custom terms for Pro as spec 0017 describes. A visitor types names or phrases, a pure matcher in `src/detect/terms.ts` finds them on each page's whole text, the find step turns them into rows through the same checks detector rows pass, and removal is the engine's unchanged path. The worker gets a second request kind (`find-terms`) on the session's run queue, the session reducer gets five `terms-*` actions, and the Found items card gets a panel, term groups and a result card line. I found no blocker and no major. The matcher, the find step, the worker gate and the reducer all hold the spec's invariants as I traced them: nothing derived from a term reaches a telemetry event or an error payload, a ticked row is exact only, a run with an unsearched term cannot start, and stale replies are dropped. What is left is small: a few silent edges in paste handling, a policy entry dated before the ship day, and context files that have not caught up with the new walls.

I ran ten unit files singly and they pass: `detect-terms`, `terms-list`, `session-terms`, `terms-engine`, `engine-worker`, `telemetry-tool`, `worker-client`, `flow-text`, `term-text` and `config`. I did not run Playwright, a build or a server, as asked. The three stopwatch checks of AC-28 (`terms-speed.spec.ts`) are only ever proven in the `speed` project, so I am relying on the recorded runs in `rationale.md` and on CI for those.

## Minor

### 🟡 A paste is dropped or overwrites typed text without a word, `src/app/tool/terms-panel.tsx:127`
**Problem**: `onPaste` prevents the default for any paste that holds a line break, then returns without saying anything when `closed || searching` (line 133). The field is read only while a search runs, but a paste event still fires on a read only input, so the pasted lines vanish with no line in the polite region. Separately, when it does add, `setValue("")` (line 135) clears whatever the visitor had already typed in the field, though that text was never added or refused.
**Why it matters**: Spec 0017 INV-11 says no refused term passes unsaid, and AC-3 says a paste leaves the field empty after each line is a term. A paste during a search is the only path where lines are neither added nor named. It is rare (Add shows busy while the field is read only) but it is silent loss of a visitor's input.
**Suggested fix**: When a paste arrives during a search, either let it fall through to the browser (read only blocks it) so nothing is claimed, or say once in the polite line that the search must finish first. For the overwrite, either prepend the existing field text as the first line or leave it in place and add only the pasted lines.

### 🟡 Privacy policy entry is dated 2026-11-11, not the day it ships, `src/lib/policy-changes.ts:27`
**Problem**: AGENTS.md and spec 0017 AC-25 and spec 0011 INV-3 say the entry's date is a literal written on the day the change ships. The entry carries the day the spec was drafted. Today is 2026-11-14, and the branch is not merged.
**Why it matters**: The change list is the public record of when a claim changed. An earlier date than the real deploy overstates how long the new wording has been true.
**Suggested fix**: Set the date to the merge or deploy day when the branch ships, and note it in the PR so it is not forgotten.

### 🟡 Context files still describe the old walls, `AGENTS.md:51`
**Problem**: The detector wall line says `src/detect` takes "nothing from the worker but types" and is silent on `@/lib`. The branch now lets `src/detect` import exactly one `@/lib` module (`term-text`), adds a lint zone `redactnest/term-text` that bans every import in that file, adds `MatchKind` beside `DetectorKind`, and carries a page's tail into the next page. None of this is in root `AGENTS.md`, `src/engine/AGENTS.md`, `src/ui/AGENTS.md` (the new `Button` `unavailable` state, `TextField`, `Chip`) or `src/telemetry/AGENTS.md`. The spec's own Follow up lists this `/sync` as open.
**Why it matters**: These files are the canonical context for every later change. Until they are updated, the next contributor or agent reading "no `@/lib`" in the detect zone will think the term text import is a violation, and will not know the carried tail is the one exception to the one page rule.
**Suggested fix**: Run the owed `/sync` before merge, as the spec's Follow up says.

### 🟡 Rows for the first part of a page break match are appended after the page's hidden rows, `src/engine/find.ts:244`
**Problem**: The first part of a match across a break is checked on the page before and pushed onto that page's list after its ordinary and hidden rows are already there. Spec 0005 AC-3 gives "by page, then in reading order".
**Why it matters**: Only the display order of an unticked row is affected. The row still sits in the right page and group, and the term group lists by term anyway, so the impact is cosmetic. It would matter if a later feature (13) relied on reading order inside a page.
**Suggested fix**: Either note in the doc comment that these rows come last on their page, or sort a page's rows by start offset once the carried parts are added.

### 🟡 A two code point term can fold to one letter, `src/lib/term-text.ts:162`
**Problem**: `termRefusal` judges `too-short` on the prepared text's code points (2 or more). `a` plus a combining accent is 2 code points but folds to the single letter `a`, as does `a` plus a soft hyphen or a zero width joiner. Such a term passes the gate and lists every whole word `a`.
**Why it matters**: The reason for the two character floor (spec 0017, Matching rules) is that a one character whole word floods the list. The fold defeats it. All such rows are listed, never dropped, and exact ones are ticked, so it is noisy rather than unsafe. The tick for each is still a whole word match the visitor typed.
**Suggested fix**: Judge the minimum on the folded length as well (or instead), still from the one `termRefusal` so the page and the worker agree. Add the case to `tests/unit/term-text.test.ts`.

## Nits

- ⚪ `src/app/tool/terms-panel.tsx:234`, the polite lines are keyed by their own text, so two identical lines would warn about a duplicate key. The refusal lines are grouped by reason so it is unlikely, but a key from the index plus text is cheap.
- ⚪ `docs/specs/0017-custom-terms/index.md:4`, the `**Updated**` line is one paragraph of about 2,500 words. Each date's change would read better as its own short entry, as spec 0012 does.
- ⚪ `src/engine/find.ts:355`, `termPlaces` and `tailOf` carry the tail of the page immediately before only. A match across three pages (a near empty middle page) is not found. It is the recorded miss (a page between the parts keeps them apart), so no change, but the doc comment on `Carry` could say "one page" outright.

## Strengths

- The matcher is careful and well explained. One fold with a position map, three plain readings, a Shift And matcher that is linear per term with no `RegExp` built from a term, and every edge case (hyphen readings, marks outside Latin, Greek and Cyrillic, glued edges by case, digits and unspaced scripts) is decided in code with a comment that names its acceptance criterion. `covered` stops the spaced reading from listing a place the exact reading already read.
- The worker gate is judged per request against the job's own frozen limits, narrows from `unknown`, rejects a prepared text it would change, and refuses every `find-terms` on a free job. `endSession` now closes the review copy only after the run queue settles, which closes the race between a replacement and a search still reading that copy.
- The reducer is strict about stale work: each `terms-*` action carries a `jobId`, is ignored outside reviewing and complete, drops rows for a term the job no longer holds, merges ticks without reseeding, and `canMake` guards both `redact-started` and `rerun`. The tool client mirrors it by checking `searchRef` identity before every late reply.
- Privacy holds: a term and its id never enter a telemetry field (only `terms` and `termsSetAside` buckets and `term` as one more `MatchKind`), the result per term travels beside the outcome and never inside it, the field turns off history and spelling, and the 38 to 43 property count in spec 0016 checks out.
- Lint is extended in the same change (the `term-text` zone and the regex that lets exactly one `@/lib` module into `src/detect`), so the new wall is enforced rather than promised.

## Test coverage

Coverage is broad and matches the risk. Unit tests cover the matcher (`detect-terms`, the adversarial budget in `detect-adversarial`), the list (`terms-list`), the term text rules, the reducer (`session-terms`, 396 lines over the edges), the worker gate and queue (`engine-worker`), the client (`worker-client`), the real engine through MuPDF on `terms.pdf` including overlapping targets and the Straße fold (`terms-engine`), telemetry, words (`flow-text`) and config. Component tests cover the panel, groups, result card and the new primitives with axe. Playwright covers the flow, privacy (a typed term reaching no request, store or console) and the three timed cases in the `speed` project. The gaps are small: no test pins a two code point term that folds to one letter (the Minor above), and nothing exercises a paste during a running search. A real browser or speed run is not something I could do here, and the stopwatch cases are best confirmed by CI on the `speed` project.
