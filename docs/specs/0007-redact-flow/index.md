# 0007. Redact flow

**Date**: 2026-09-30
**Updated**: 2026-10-02, from spec [0011](../0011-privacy-policy-terms/index.md), wording only: wherever the full drop zone shows (at idle, and under a failed open), spec 0011's terms notice sits directly under it and goes with it once the file bar takes its place (AC-2). No step of the flow changed.
**Status**: Accepted

## Summary

The tool page already works from drop to download, as a thin path the earlier features left for this one to finish. This spec turns it into the product: each step takes over the column in turn (the drop zone shrinks to a file bar once a document opens, and the result card takes the top spot when a run completes), a refused run lands back on the checklist with every tick kept, and the result says plainly what was removed, what stayed in the file and what hidden content was stripped. Every failure gets a title, the likely cause and the next step. A run with nothing ticked is offered as a cleaned copy named `name-cleaned.pdf`, so it can never pass for a redaction. It also pays off everything specs 0001 to 0006 handed to feature 8, including the checklist that freezes on a big document.

## Amends specs 0001 to 0006

Applied to each spec in place by task 17, once the flow is built, so no spec describes behaviour that does not exist yet.

- **Spec 0001.** Two Follow-ups are met: feature 8 writes the treatment of every failure kind (*Failure copy*), and mobile visitors get a deliberate answer: the tool runs everywhere, with no device check (AC-21). The Follow-up on the entitlement in flight is met for the free tier: the drop zone names `config.freePageCap`, and feature 10 owns showing a paid cap.
- **Spec 0002.** The session machine changes (see *State transitions*): `LiveSession` gains `runFailure`; `failed` from `redacting` returns to `reviewing` with the ticks kept instead of ending the document; `failure` now holds only an open failure; two new actions, `ticks-set` and `rerun`; `outputName` is set again at `redacted`, and `outputNameFor` gains the `cleaned` form. `hasUnsavedWork` is also true in `reviewing` while `runFailure` is set. `ReviewMatch` gains `beforeCut` and `afterCut`. The `retireOtherJobs` exception in `src/worker/client.ts` goes (AC-24).
- **Spec 0003.** Its Follow-up for the summary panel is met by `SummaryList` (a definition list primitive) inside the result card. `DropZone` gains a `compact` form, the file bar. `ChecklistItem` shows "…" only where the context was cut, and its row gets `content-visibility: auto`. A group's select all is its first row, as spec 0003 allowed. No new colour pairing enters the contrast contract (INV-6).
- **Spec 0004.** Its Follow-up for feature 8 is met: real copy for every kind, including the causes it lists for `redaction-overreach`, `redaction-incomplete`, `slanted-text` and `unsupported`; the `verifying` phase line; the thin path restyled; a run that removed nothing named and titled so it cannot pass for a redaction; and the `sanitized` list shown, with the `accessibility-tags` loss said as a loss.
- **Spec 0005.** Three Follow-ups are met: the result says what stayed in the file (`resultCounts`), feature 8's final wording of the coverage note, the empty state and the reason lines, and select all per group. The first Follow-up (measure at the paid cap, then decide on virtual scrolling) is met for the checklist by AC-8 and task 13; its open time and slowest read measures stay open there. `contextReader` in `src/engine/find.ts` also returns whether each side was cut, and `FoundMatch` carries it.
- **Spec 0006.** Its Follow-up on final wording and placement is met, and the `unsupported` copy allows for a trim proof that failed away from the edge. `ADVICE` and the `no-readable-text` copy are reworded so no line promises that text recognition clears a warning (its Follow-up on sparse OCR pages, open when this spec was written, is met by spec 0008). The `off-page-content` note gains one line about cut matches, from the 2026-09-29 review, note 3. `PARTLY_REASON` shows only when the file's name really ends in partly redacted. AC-22's outcome card leaves its polite region: focus moves to the result card's heading instead, so the card is not announced twice (AC-11), and the card still sits directly above its own Download.

## Requirements

**User stories**:
- As a visitor, I want to go from dropping a PDF to downloading its redacted copy in one pass, seeing one step at a time.
- As a visitor reviewing a long list, I want to tick or clear a whole kind at once, and I want a tick to respond straight away.
- As a visitor whose run was refused, I want to land back on my checklist with my ticks intact and be told the likely cause, so I can change a tick and run again.
- As a visitor with a finished file, I want to see what was removed, what is still in the file and what hidden content was stripped, before I send it anywhere.
- As a visitor who ticked nothing, I want the file I get to say it is a cleaned copy, never a redacted one.
- As a visitor whose file failed, I want to know what went wrong in plain words and what I can do about it.

**Acceptance criteria**:

*One pass, step by step*

- **AC-1**: An anonymous visitor at `/tool` with a PDF of up to the session's `entitlement.pageCap` pages (free tier: `config.freePageCap`, 3 to start) goes from drop to review to Redact to Download with no other page load, no sign in, and no network request carrying document data (spec 0002's privacy suite stays green).
- **AC-2**: With nothing open, the page shows the full drop zone, whose helper names the page cap from `config.freePageCap`. It is the same after Start over, after Redact another PDF, and under a failed open (AC-15). Directly under the full drop zone sits the terms notice: one `text-small` line in `ink-muted` saying that choosing a PDF is agreeing to the Terms of use, with plain links to the terms and the privacy policy. It sits outside the polite live region and goes once the file bar replaces the drop zone. _Amended by spec [0011](../0011-privacy-policy-terms/index.md), AC-5._
- **AC-3**: In `opening`, `reviewing`, `redacting`, `complete` and `lost`, the drop zone shows in its compact form, the file bar: the file's name (React text only), the page count once `summary` is not null ("3 pages"; nothing before that), a secondary "Choose another PDF" button, and a link button "Start over". In `idle` and `failed` it shows in full. The file bar still takes a dropped file, and shows the drop zone's existing dragging tokens (`border-accent`, `bg-accent-soft`) while a file is over it. Both buttons stay enabled in every state, a run included; choosing another file or pressing Start over while `hasUnsavedWork` is true asks first (spec 0002, AC-1), and a cancelled confirm changes nothing. Start over lives only in the file bar: the old action row beneath the page goes, and the opened document card no longer states the page count.
- **AC-4**: While a document opens or a run works, one phase line with the spinner shows in the polite live region, in the words of *Phase copy* (the strings hold no "…"; `StatusLine` adds it). The `redacting` phase says "Stripping hidden content" when nothing is ticked.
- **AC-5**: While reviewing, the column reads from the top: the file bar; the opened document card (all clear line, or warnings and notes, per spec 0006); the run refusal callout, when there is one (AC-14); the action panel (AC-6); the coverage note; the checklist.
- **AC-6**: The action panel holds a count line and the main action. With some tickable match ticked, the line reads "{n} of {m} found items will be removed" (m counts matches that are not blocked) and the button reads "Redact {n} items" ("Redact 1 item" for one). With nothing ticked, the line reads "Nothing is ticked, so nothing will be removed." and the button reads "Make a cleaned copy". When every found item is blocked (m is 0), the line reads "None of the found items can be removed." When nothing was found at all, the line is left out. While a run works, the panel holds Cancel in the same place. At `complete` the panel is not shown; the result card takes its place (AC-11).

*The checklist*

- **AC-7**: Each group with at least two tickable matches starts with a select all row, the first `li` inside the group's open `details` body: a checkbox named "Select all {count} {noun}" (`noun.other` from `DETECTOR_LABELS`), where count is the group's tickable rows. The group's own count badge keeps counting every found row, blocked ones included. The checkbox is checked when every tickable row is ticked, clear when none is, and mixed (`indeterminate`) otherwise. The component decides the action from what it shows: clear or mixed dispatches `ticks-set` with `on: true`, checked dispatches `on: false`, over the group's tickable ids. Blocked rows never change. It is disabled while a run works. A group with fewer than two tickable rows has no select all row. One activation is one `ticks-set` action and one render.
- **AC-8**: Changing one tick renders again only that row, its group's select all row and the action panel's count line (a component test counts renders). On the dense fixture (task 13), a single tick paints within 200 ms, and the checklist's first render after open takes under 1 s, on a desktop class machine in Chromium. Both are measured and recorded in `rationale.md`; a figure over either line goes back to `/architect` for virtual scrolling before this spec is `Accepted`.
- **AC-9**: A row's context shows "…" before `before` only when `before` is not empty and `beforeCut` is true, and after `after` only when `after` is not empty and `afterCut` is true. In `contextReader`, over the collapsed text, `beforeCut` is `at[start] - reach > 0` and `afterCut` is `at[end] + reach < collapsed.length`; both the ordinary and the replacement text readers set them. A match near the start or end of its page shows no "…" on that side.
- **AC-10**: While a run works, every checkbox is disabled and Cancel returns to review with the document open and the ticks unchanged (spec 0004, AC-17, kept as is).

*The result*

- **AC-11**: When a run completes, the result card takes the action panel's place, above the coverage note and the checklist, and focus moves to its heading (AC-20); the card is not inside a live region, so it is heard once, through focus. Inside the one card, in order: the title; a `SummaryList` with **Removed**, **Left in the file** and **Also stripped**; the off page note when the trim removed content (spec 0006, AC-22); the download warning when the file is partly redacted; then Download as the primary action, so the warning sits directly above it. **Removed** lists `removedByType` ("4 email addresses and 2 phone numbers"), or "Nothing". **Left in the file** is up to two sentences, "{kinds} you left unticked." from `untickedByType` and "{kinds} RedactNest couldn't remove." from `blockedByType`, or "Nothing RedactNest found." when both are empty. **Also stripped** lists `sanitized` in words, or "Nothing else needed stripping." Kinds follow `DETECTOR_KINDS` order with `noun.one` or `noun.other` from `DETECTOR_LABELS`, and sanitized kinds follow `SANITIZED_KINDS` order; each list joins with `Intl.ListFormat("en-GB", { type: "conjunction" })`. `blockedByReason` is not shown (each blocked row already says why). The whole card stays after download. The checklist below stays enabled, and changing a tick returns to review (spec 0002, AC-14, kept as is), with focus staying on that checkbox.
- **AC-12**: A run that removed nothing is titled "Nothing was removed", its Removed line reads "Nothing", and its file is offered as `{stem}-cleaned.pdf`, whatever the pages hold. A run that removed something is titled "Your redacted file is ready" and named `{stem}-redacted.pdf`, or `{stem}-partly-redacted.pdf` when `isPartly(summary)`. The download warning's `PARTLY_REASON` line shows only when the name ends in `partly-redacted`; on a cleaned copy of a partly readable file, the warning's page lines still show and only `PARTLY_REASON` is left out. `outputName` before a run is provisional; only its value at `complete` is ever used.
- **AC-13**: Once Download has handed the file over, Download gives way, inside the result card, to the line "Your browser has the file." (in a small polite region of its own), a primary "Redact another PDF" button and a secondary "Make it again" button. "Redact another PDF" is `handleStartOver` under another label: it releases the session and the worker, back to AC-2. "Make it again" and Redact share one run handler with the same attempt guard: it dispatches `rerun`, then calls `opened.redact` with the same ticks on the untouched original; the output is taken only from a `redacted` reply while the session is still `redacting`, and Download is offered afresh. Cancel during a rerun lands on plain `reviewing`. The output is dropped at download, as today (spec 0002, AC-4), and Download keeps its guard (`complete`, not downloaded, output held).

*Failures*

- **AC-14**: A run that fails, for any `EngineErrorKind`, returns to `reviewing` with the document open and every tick kept, and shows the run refusal callout (`role="alert"`, titled as that kind's title under the lead "Your last run was stopped") with its body and next step from *Failure copy*. It stays through tick changes, because it says what to untick, and clears when the next run starts, a new file is chosen, the worker is lost, a retry starts, or the session is released. For the four kinds a tick can cause (`redaction-overreach`, `replacement-text`, `slanted-text`, `redaction-incomplete`) the callout has no button of its own; for every other kind it also offers "Choose another PDF", and Redact stays enabled. No output exists for a refused run. A worker lost during a run is not a refusal: it goes to `lost` as today, and its retry starts the review over with new match ids, so the ticks do not survive it.
- **AC-15**: An open that fails shows the failure callout (`role="alert"`) with that kind's copy, and the full drop zone directly beneath it, so the next file is one drop away. Nothing of the failed document is held. `lost` keeps its callout and Try again (spec 0002, AC-11, kept as is).
- **AC-16**: Every `EngineErrorKind` has a title, a body and a next step, typed as a record over `EngineErrorKind` in `src/lib/flow-text.ts`, so a kind added without copy fails `pnpm typecheck`. The `lost` callout keeps its own copy and never reads `FAILURE_TEXT`, even though `lost` sets `failure` to `engine-unavailable`. The copy is chosen by the kind, plus, for a run refusal, whether anything is ticked (never how many, and nothing from the document). It reads caps only from the session's frozen entitlement snapshot (spec 0002, INV-5), and no line names a page, an item or the file.
- **AC-17**: The copy meets each obligation earlier specs set: `too-many-pages` names the cap and suggests splitting the file; `encrypted` and `password-required` explain how to save an unlocked copy, and the page never asks for a password; `redaction-overreach` names a stamp such as CONFIDENTIAL or DRAFT across a ticked item, or a picture under it, as the likely cause; `redaction-incomplete` names an accent drawn as its own mark, a footnote marker straight after a ticked item, and lines the file shows in a way RedactNest can't rewrite, and stays true when nothing ticked survived; `slanted-text` suggests straightening a scan before text recognition; `unsupported` allows for those same unrewritable lines and for content near a page's edge the trim could not prove removed; `no-readable-text` suggests text recognition without promising it works.
- **AC-18**: No line anywhere promises that text recognition clears a warning or makes a file readable. `ADVICE` and the `no-readable-text` body say it "may" help.
- **AC-19**: The `off-page-content` note ends with: "A found item crossing a page's edge is listed by the part inside the page; the part outside is removed with the rest."

*Across the flow*

- **AC-20**: After every step change, focus lands where *Focus* says, never on `body`.
- **AC-21**: The tool runs on any browser the support check passes, with no device or screen size check. Every step state reflows at 320px wide with no horizontal scroll.
- **AC-22**: axe finds no violation, and the keyboard walk reaches every control in order, in each step state: idle, opening, reviewing (with and without warnings), a run refusal, redacting, complete, complete and partly redacted, complete with nothing removed, downloaded, and a failed open.
- **AC-23**: The flow keeps what already holds: the beforeunload warning only with unsaved work (now also while a refusal shows), the output dropped whenever the session stops being `complete` with nothing downloaded, `pagehide` releasing the engine, a group's details opening and closing with Enter and Space, and the lost callout's Try again.
- **AC-24**: `retireOtherJobs` settles every pending operation it finds as cancelled, the same `jobId` included, so a same `jobId` open sent while a redact is pending settles that redact rather than leaving it hanging. This is hardening: nothing in the page reaches that path today (every same `jobId` open follows `releaseEngine()`), and the new `rerun` edge sends `redact`, never `open`. The worker keys a cancel on the operation id, so the new open is untouched.
- **AC-25**: `resultCounts(matches, ticked, outcome)` is pure, returns counts and kinds only (a `LoggablePayload`), and is the only source of the result card's Removed and Left in the file lines.
- **AC-26**: Nothing new crosses the worker boundary but the two booleans per match, and nothing new is written, stored or sent.

## Decision

**Chosen option**: Option 2: steps take over, fixed in place on today's session and components.

Finish the existing tool page rather than rebuild it: one column where each step takes over in turn, a run refusal that keeps the review, a result card built from counts the main thread already holds, and every failure's copy in one typed record. Reasoning and the other options: see `rationale.md`.

**Implementation skills**: `vercel-react-best-practices` (`vercel-labs/agent-skills`, `.claude/skills/vercel-react-best-practices/`) for the memoised rows and render counting.

## Rationale

Reasoning, options and the decisions taken in the conversation: see [rationale.md](rationale.md).

## Feature design

**Data model sketch** (in memory only, nothing is stored):

| Where | Field or value | Type | Change |
|---|---|---|---|
| `LiveSession` | `runFailure` | `EngineErrorKind \| null` | new. The last run's refusal. Null except in `reviewing` after a failed run |
| `LiveSession` | `failure` | `EngineErrorKind \| null` | narrowed: an open failure only, set in `failed` and `lost` |
| `LiveSession` | `outputName` | `string` | also set at `redacted`, from the outcome |
| `ReviewMatch`, `FoundMatch` | `beforeCut`, `afterCut` | `boolean` | new. True when the context stopped short of the page's start or end |
| derived | `ResultCounts` | see below | new, in `src/lib/detectors.ts`, never stored |

```ts
interface ResultCounts {
  readonly removedByType: Partial<Record<DetectorKind, number>>;      // from outcome.removedByType
  readonly untickedByType: Partial<Record<DetectorKind, number>>;     // not ticked, not blocked
  readonly blockedByType: Partial<Record<DetectorKind, number>>;      // blocked
  readonly blockedByReason: Partial<Record<BlockedReason, number>>;   // blocked, by reason
  readonly removedTotal: number;                                      // sum of removedByType
  readonly sanitized: readonly SanitizedKind[];                       // outcome.sanitized
}
```

`outputNameFor(fileName, form)` takes `form: "redacted" | "partly-redacted" | "cleaned"` in place of the `partly` boolean.

**State transitions** (spec 0002's machine; changes in bold):

| From | Action | To |
|---|---|---|
| any | `file-chosen` | `opening`, **`runFailure` null** |
| `opening` | `opened` | `reviewing` (ticks seeded, name set, as today) |
| `opening` | `failed` | `failed` (terminal for that document) |
| `reviewing` | `tick-toggled` | `reviewing` |
| `reviewing`, `complete` | **`ticks-set` {ids, on}** | **`reviewing`, the listed unblocked ids ticked or cleared together; from `complete` it drops the outcome as `tick-toggled` does** |
| `reviewing` | `redact-started` | `redacting`, **`runFailure` null** |
| `redacting` | `redacted` | `complete`, **`outputName` set from the outcome** |
| `redacting` | **`failed`** | **`reviewing`, ticks kept, `runFailure` set** (was terminal `failed`) |
| `redacting` | `cancelled` | `reviewing` |
| `complete` | `downloaded` | `complete`, downloaded |
| **`complete`, downloaded** | **`rerun`** | **`redacting`, same ticks, `outcome` null, `downloaded` false** |
| live | `worker-lost` | `lost` |
| `lost` | `retry` | `opening`, **`runFailure` null** |
| any | `released` | `idle` |

`runFailure` survives `tick-toggled` and `ticks-set`, and is null after every other edge but `failed` from `redacting` (`worker-lost`, `retry`, `released` and `file-chosen` all clear it). `hasUnsavedWork` gains one case: `reviewing` with `runFailure` set is unsaved work, so replacing the file after a refusal asks first; `complete` after download stays not unsaved. A `ticks-set` naming a blocked id or an id the session does not hold skips that id, as `tick-toggled` does, and a `ticks-set` that would change no tick returns the same session object, so nothing renders again and a `complete` session keeps its outcome. `redacted`, `failed` and `cancelled` replies are accepted only in `redacting`, so a late reply after Cancel changes nothing (a reducer test pins this for the new `failed` edge).

**Interface surface** (no network endpoint; the worker protocol gains only the two booleans):

| Surface | Change |
|---|---|
| `src/lib/session.ts` | `runFailure`, `ticks-set`, `rerun`, the `failed` edge from `redacting`, `outputNameFor` forms |
| `src/lib/detectors.ts` | `resultCounts`; `lookedFor` exported for the `detecting` phase line; final wording of the coverage note, empty state and reason lines |
| `src/lib/flow-text.ts` (new) | `FAILURE_TEXT` over `EngineErrorKind`, `PHASE_TEXT` over `ProgressPhase`, `SANITIZED_TEXT` over `SanitizedKind`, the action panel and result card lines. Moved out of `tool-client.tsx` |
| `src/lib/page-findings.ts` | `ADVICE` reworded; the `off-page-content` line gains AC-19's sentence; `PARTLY_REASON` unchanged, shown conditionally by the caller |
| `src/worker/protocol.ts`, `src/engine/find.ts` | `beforeCut`, `afterCut` on `ReviewMatch` and `FoundMatch`, from `contextReader` |
| `src/worker/client.ts` | `retireOtherJobs` loses its `jobId` exception |
| `src/ui/drop-zone.tsx` | `compact` form with `fileName`, `pageCount`, and a slot for the Start over link. The input stays owned here (spec 0003, one tab stop per button) |
| `src/ui/checklist-item.tsx` | `beforeCut`, `afterCut` props; `content-visibility: auto` with `contain-intrinsic-size: auto 4.5rem` on the row (a browser without support ignores both) |
| `src/ui/summary-list.tsx` (new) | a definition list: term and description pairs, React text only |
| `src/app/tool/` | `tool-client.tsx` split: `action-panel.tsx`, `result-card.tsx`, `failure-callout.tsx`; one run handler for Redact and Make it again; `review-checklist.tsx` gains the select all rows, groups built once per `matches` (`useMemo`), and a memoised `ReviewRow` taking `match`, `checked`, `disabled` and one stable `onToggle(id)`, so `ChecklistItem`'s per row `onCheckedChange` closure is made inside the memoised row; each group's select all state is counted once per tick change |

**Test ids**: every existing id stays on the element that now does the same job (`redact`, `cancel`, `download`, `start-over`, `error`, `lost`, `retry`, `progress`, `review`, `checklist`, `coverage`, `page-warnings`, `page-notes`, `all-clear`, `download-warning`, `off-page-removed`); `page-count` moves to the file bar; `outcome` names the result card's `SummaryList`. New ids: `file-bar`, `action-panel`, `tick-count`, `run-refusal`, `result`, `select-all-{kind}`, `downloaded`, `redact-another`, `make-again`. Tests that assert old words or old places are updated in the same slice that changes them.

**Value sourcing**:

| Action | Value produced or displayed | Source |
|---|---|---|
| idle | page cap in the drop zone helper | `config.freePageCap` (feature 10 owns a paid figure) |
| file bar | file name | `session.file.name`, rendered as React text |
| file bar | page count | `session.summary.pageCount`, shown once not null |
| action panel | n (ticked) | `session.ticked.size` |
| action panel | m (tickable) | `session.matches` where `blocked === null` |
| action panel | which count line | n above 0; n is 0 and m above 0; m is 0 and matches not empty; matches empty (AC-6) |
| action panel | button label | n: "Redact {n} items", or "Make a cleaned copy" when n is 0 |
| select all row | count, noun | the group's rows where `blocked === null`; `DETECTOR_LABELS[kind].noun` |
| select all row | checked or mixed | how many of those ids are in `session.ticked` |
| phase line | words | `PHASE_TEXT[session.phase]`; for `redacting`, the zero tick form when `session.ticked.size === 0` |
| result card | title | `resultCounts.removedTotal === 0` |
| result card | Removed | `resultCounts.removedByType`, from `outcome.removedByType` |
| result card | Left in the file | `resultCounts.untickedByType` and `blockedByType`, from `session.matches` and `session.ticked` at `complete` (the ticks cannot change while `complete` holds) |
| result card | Also stripped | `outcome.sanitized` through `SANITIZED_TEXT` |
| result card | off page note, download warning | `removedOffPageLine(summary)`, `warningLines(summary)` (spec 0006) |
| result card | `PARTLY_REASON` shown | `session.outputName` ends in `-partly-redacted.pdf` |
| download | file name | `session.outputName`: `outputNameFor(file.name, form)`, form from `removedTotal` then `isPartly(summary)` |
| failure callouts | title, body, next step | `FAILURE_TEXT[kind]`, kind from `session.runFailure` or `session.failure` |
| failure callouts | cap, size | `session.entitlement.pageCap`; `session.entitlement.maxFileBytes` as `Math.max(1, Math.round(bytes / 1_048_576))` MB (today's `formatBytes`, with a floor so it never reads "0 MB"); `session.entitlement.tier`, which is only `"free"` or `"paid"` (spec 0002), for the free or paid wording |
| failure callouts | which button | "Choose another PDF" for an open failure (the drop zone below) and for a run refusal of a kind ticks cannot cause; none for the four tick kinds |
| checklist row | "…" either side | `match.beforeCut`, `match.afterCut`, from `contextReader` |

**Focus** (AC-20; a heading that takes focus has `tabIndex={-1}` and no visible ring change beyond the base rule). Focus moves in an effect that runs after the render that mounts its target, keyed on the step change, never in the event handler. While a file waits for the entitlement, nothing has changed yet, so focus stays on the drop zone's button, which is still mounted.

| Step change | Focus moves to |
|---|---|
| `file-chosen` (picker or drop, from idle or failed) | the file bar's "Choose another PDF" button |
| a replacement chosen from the file bar | stays on "Choose another PDF" |
| a replace confirm cancelled | nothing moves |
| open succeeds | stays where it is |
| open fails | the failure callout's heading |
| Redact or Make it again pressed | Cancel |
| Cancel pressed | the Redact button |
| run completes | the result card's heading |
| run refused | the run refusal callout's heading |
| a tick or select all changed from `complete` | stays on that checkbox |
| Download pressed | "Redact another PDF" |
| worker lost | the lost callout's Try again |
| Try again pressed | the file bar's "Choose another PDF" button |
| Start over or Redact another PDF | the drop zone's button |

**Phase copy**:

| Phase | Line |
|---|---|
| `checking-entitlement` | Checking your plan |
| `loading-engine` | Loading the PDF engine |
| `opening` | Opening your document |
| `inspecting` | Reading each page |
| `detecting` | Looking for email addresses and phone numbers (built with `lookedFor("conjunction")` from `src/lib/detectors.ts`) |
| `redacting` | Removing what you ticked / Stripping hidden content (nothing ticked) |
| `writing` | Writing your clean file |
| `verifying` | Checking every page of your clean file |

**Failure copy** (the starting words; `/develop` may polish them but must keep each obligation in AC-17; `{cap}` is `entitlement.pageCap`, `{size}` is `entitlement.maxFileBytes` in whole MB):

| Kind | Title | Body | Next step |
|---|---|---|---|
| `engine-unavailable` | The PDF engine didn't load | RedactNest downloads its PDF engine once, and that didn't work. | Check your connection, then try again. |
| `encrypted` | This PDF is encrypted | Its text is locked, so RedactNest can't read it. | Open it in your PDF app, save a copy without the encryption, then open that copy here. |
| `password-required` | This PDF needs a password | RedactNest doesn't take passwords. | Open it in your PDF app with its password, save a copy without one, then open that copy here. |
| `corrupt` | This PDF can't be read | It may be damaged, or only partly downloaded. | If you have another copy, try that one. |
| `unsupported` | RedactNest stopped to be safe | This file holds something RedactNest can't handle safely, so it stopped rather than guess, and made no file. Two common causes: lines of text written in a way RedactNest can't rewrite, and content near a page's edge it couldn't prove it removed. | Printing it to a new PDF from your PDF app, then opening that copy here, may help. |
| `too-large` | This file is too big | RedactNest takes files up to {size}. | Save a smaller copy, or split it, and open that. |
| `too-many-pages` | This PDF has more than {cap} pages | Free: The free limit is {cap} pages. Paid: RedactNest handles up to {cap} pages. | Split it into parts of {cap} pages or fewer in your PDF app, and redact each one. |
| `file-unreadable` | The file couldn't be read | It may have been moved, renamed or deleted since you chose it. | Choose it again. |
| `not-pdf` | This isn't a PDF | RedactNest works on PDF files only, and this file's contents aren't a PDF, whatever its name says. | If it's a document or an image, save or export it as a PDF first. |
| `hidden-layers` | This PDF has layers RedactNest can't redact yet | Some of its content sits on layers a viewer can switch on and off, and RedactNest can't be sure it removes text from those. | Save a flattened copy from your PDF app, then open that copy here. |
| `no-readable-text` | RedactNest can't read any text in this PDF | It looks like a scan, or its text is in a form RedactNest can't read, so nothing could be found and no file was made. | Running it through text recognition (OCR) may give RedactNest text to work with. |
| `edge-text` | Text at a page's edge can't be removed cleanly | Some text crosses the edge of a page, and RedactNest can't prove it removes it cleanly, so it made no file. | Printing it to a new PDF from your PDF app, then opening that copy here, may help. |
| `redaction-overreach` | Removing what you ticked would remove more | Something drawn across a ticked item would be cut too: most often a stamp such as CONFIDENTIAL or DRAFT, or a picture under the item. RedactNest stopped and made no file. | Untick items that sit under a stamp or on a picture, then redact again. RedactNest can't say which item it was, so unticking one group at a time can find it. |
| `replacement-text` | A ticked item can't be removed safely | It sits inside hidden replacement text (the words copy and paste gives instead of what's drawn), which can't be removed safely. RedactNest made no file. | RedactNest can't say which item it was. Untick one group at a time to find it, then redact again. |
| `slanted-text` | A ticked item is set at too steep an angle | RedactNest removes text only when it runs close to level, so it made no file. | Untick items on crooked or rotated lines, then redact again. If this is a scan, straightening it before text recognition (OCRmyPDF's --deskew option, for one) usually avoids this. |
| `redaction-incomplete` | RedactNest couldn't vouch for the clean file | Its final check of the new file didn't match what it expected, so it made no file rather than hand you one it can't vouch for. Likely causes: an accent drawn as its own mark at the end of a ticked name, a small footnote marker straight after a ticked item, or lines this file writes in a way RedactNest can't rewrite (then every run on it stops here). | Untick items ending in an accent or followed by a footnote marker, then redact again. |

A run refusal of a kind no tick can cause, while something is ticked, puts "Changing what's ticked won't help with this file." before its next step (`runRefusalText`). An open failure reads the table as it stands and never mentions ticks, because at an open there is no list to have ticked.

The `lost` callout keeps today's words, under the title "The PDF engine stopped".

**Result card copy**: titles "Your redacted file is ready" and "Nothing was removed"; terms "Removed", "Left in the file", "Also stripped"; after download "Your browser has the file."; `SANITIZED_TEXT` keeps today's words except `accessibility-tags`, which reads "accessibility tags (screen readers will read the clean file less well)". Kinds join with `Intl.ListFormat("en-GB")`.

**Checklist copy**: the coverage note, the empty state and the four reason lines keep spec 0005 and 0006's words, reviewed once in slice 4 against the page as built; the empty state's helper now says "Make a cleaned copy" where it said "Redact".

**Key invariants**:
- **INV-1**: No refused run produces output, and a refused run never loses the review: the worker session, the matches and the ticks survive it (AC-14). A lost worker is not a refusal and does not keep the ticks.
- **INV-2**: A file whose run removed nothing is never named or titled as redacted (AC-12).
- **INV-3**: Every word shown for a failure comes from its kind, the frozen entitlement and, for a run refusal, whether anything is ticked, and from nothing else; none carries a page, an item, a count from the document or the file name (spec 0002, INV-4).
- **INV-4**: The result card's counts come from `resultCounts` and `outcome` only, never from matching text.
- **INV-5**: The download warning stays directly above Download, and a refusal always says no file was made (spec 0006).
- **INV-6**: No new colour pairing: the flow uses tokens and `Callout` tones already in the contrast contract. A pairing that turns out to be needed goes into spec 0003's contract and `tests/unit/contrast.test.ts` in the same change.
- **INV-7**: Each checklist row renders again only when its own `checked`, `disabled` or match changes (AC-8).

**Security model**: an anonymous visitor, one tab, no account and no server call; the free and paid tiers behave the same apart from the cap and size in the copy. The file name is shown only in the file bar as React text, never in `document.title`, the URL, a log or a request. The only new data crossing the worker boundary is `beforeCut` and `afterCut`, two booleans per match. `resultCounts` is counts only, so feature 11 may log it.

**Configuration required**: no new environment variables. The cap and size come from the entitlement snapshot, and the free cap from `config.freePageCap`.

**Lint zones**: no change. `src/ui/summary-list.tsx` sits in the `redactnest/ui` zone; `src/lib/flow-text.ts` imports only types from `@/worker/protocol`; `src/app/tool` files other than `page.tsx` do not import `tool-client`.

**Critical test scenarios**:
- Happy path: `detect-email.pdf` dropped, file bar shows the name and pages, select all clears then ticks the emails, Redact, result card lists Removed and Also stripped, Download, "Your browser has the file.", Redact another PDF back to the drop zone. Verifies **AC-1**, **AC-3**, **AC-6**, **AC-7**, **AC-11**, **AC-13**.
- Run refusal: a fixture that ends in `redaction-overreach` or `slanted-text` returns to review with the same ticks and the refusal callout focused; untick and run again succeeds. Verifies **AC-14**, **AC-20**.
- Nothing ticked: clear every tick, the button reads "Make a cleaned copy", the result is titled "Nothing was removed", the download is named `*-cleaned.pdf` even on a partly redacted file, and `PARTLY_REASON` is absent. Verifies **AC-6**, **AC-12**.
- Make it again: after download, Make it again runs, and Download offers the same name again; Cancel during it lands on plain review with no outcome. Verifies **AC-13**.
- Refusal lifetime: a refusal survives a tick change and select all, clears on the next Redact, and replacing the file while it shows asks first. Verifies **AC-14**, **AC-23**.
- Off screen rows: the keyboard walk tabs to a row far below the fold on the dense fixture, and it scrolls into view with its focus ring visible. Verifies **AC-8**, **AC-22**.
- Open failure: a file whose header is `%PDF-1.7` followed by junk, a text file named `.pdf`, `detect-dense.pdf` on the free tier, and `layers-all-on.pdf` each show their copy above the full drop zone, focus on the callout heading. Verifies **AC-15**, **AC-16**, **AC-17**.
- Copy completeness: a unit test walks `ENGINE_ERROR_KINDS` and `PROGRESS_PHASES` and finds non empty copy for each; a scan of `FAILURE_TEXT` finds no "OCR will" or "fixes"; the free and paid forms of `too-many-pages` render. Verifies **AC-16**, **AC-17**, **AC-18**.
- Reducer: every new edge, the unchanged edges asserted unchanged, `ticks-set` skipping blocked and unknown ids, `rerun` refused unless `complete` and downloaded. Verifies **AC-7**, **AC-13**, **AC-14**.
- Render count: toggling one row of 600 renders one row, one select all row and the count line. Verifies **AC-8**.
- Context: a match at a page's first character shows no leading "…"; one mid page shows both. Verifies **AC-9**.
- `retireOtherJobs`: a same `jobId` open while a redact is pending settles the redact as cancelled. Verifies **AC-24**.
- Browser suite: axe, keyboard walk, 320px reflow in each step state. Verifies **AC-21**, **AC-22**.

## Build plan

Skateboard: the flow already works end to end, so each slice leaves a whole, usable page that is better than the last. The session comes first because every later slice builds on its edges; the layout next, because it is what makes the page feel like the product; then the checklist's speed and select all, then the words, then the browser proof.

**Slice 1: the session and the counts**
1. Drop the `jobId` exception from `retireOtherJobs`, with the review's test in `tests/unit/worker-client.test.ts`, before any rerun path exists. Satisfies **AC-24**.
2. `runFailure` and its lifetime, the `failed` edge from `redacting` back to `reviewing`, `ticks-set` (same object when nothing changes), `rerun`, the new `hasUnsavedWork` case, and `outputNameFor`'s three forms, set at `redacted`, in `src/lib/session.ts`; update the comments that call `failed` terminal for a run. Reducer tests for every new and unchanged edge, updating the existing `outputNameFor` tests to the forms. Satisfies **AC-7**, **AC-12**, **AC-13**, **AC-14**, **AC-23**.
3. `resultCounts` beside `detectionCounts`, with unit tests. Satisfies **AC-25**.

**Slice 2: the steps take over**
4. `DropZone`'s `compact` form (the file bar), with component tests: one tab stop per button, drops still accepted, the input still cleared. Satisfies **AC-2**, **AC-3**.
5. Split `tool-client.tsx` into `action-panel.tsx`, `result-card.tsx` and `failure-callout.tsx`; place the file bar, the document card, the refusal callout, the action panel and the checklist in AC-5's order; the result card, outside any live region, in the action panel's place; remove the old action row and the card's page count line; move and add the test ids per *Test ids*, updating the tests that assert old words or places. Satisfies **AC-3**, **AC-5**, **AC-11**.
6. The action panel's count line and labels, including the zero tick form. Satisfies **AC-6**, **AC-10**.
7. `SummaryList` in `src/ui` with its tests, and the result card's three lines from `resultCounts`; the titles and the conditional `PARTLY_REASON`. Satisfies **AC-11**, **AC-12**.
8. Run refusals on the list (with "Choose another PDF" for the kinds ticks cannot cause), open failures above the full drop zone, the after download line with Redact another PDF (`handleStartOver`) and Make it again (the shared run handler). Satisfies **AC-13**, **AC-14**, **AC-15**.
9. Focus after each step change, per *Focus*, with component tests. Satisfies **AC-20**.

**Slice 3: the checklist**
10. Select all rows per group, using `Checkbox`'s existing `indeterminate`, dispatching `ticks-set`. Satisfies **AC-7**.
11. Memoised rows with one stable toggle handler, groups built once per `matches`, `content-visibility: auto` on rows; the render count test. Satisfies **AC-8**.
12. `beforeCut` and `afterCut` from `contextReader` through `FoundMatch` and `ReviewMatch` to `ChecklistItem`, with engine and component tests. Satisfies **AC-9**, **AC-26**.
13. A dense fixture from `scripts/make-fixture.mjs`: 50 pages shaped like a staff directory, at least 2,000 email addresses and phone numbers. Measure the checklist's first render and a single tick in Chromium, noting how much of the first render is `Checkbox`'s mount effect per row; record both in `rationale.md`. Satisfies **AC-8**.

**Slice 4: the words**
14. `src/lib/flow-text.ts` with `FAILURE_TEXT`, `PHASE_TEXT` and `SANITIZED_TEXT` as typed records, wired into the callouts, the phase line and the result card; the copy completeness tests. Satisfies **AC-4**, **AC-16**, **AC-17**.
15. `ADVICE` reworded, the `off-page-content` line's new sentence, and a review of the coverage note, empty state and reason lines as they read on the page. Satisfies **AC-18**, **AC-19**.

**Slice 5: the browser proof**
16. Extend `tests/e2e/design-system.spec.ts` to every step state in AC-22: axe, the keyboard walk, 320px reflow. Extend `review.spec.ts` or a new `flow.spec.ts` to the critical scenarios above. Confirm `privacy.spec.ts`, `cancel.spec.ts` and the lost path still pass unchanged. Satisfies **AC-1**, **AC-21**, **AC-22**, **AC-23**.
17. Apply the amends above to specs 0001 to 0006 and tick their Follow-ups. Satisfies **AC-26** (the record of what crosses the boundary).

## Consequences

**Positive**:
- The page reads as a product: one step in view, the result never buried under the list, and every failure saying what to do next.
- A refused run costs a tick change, not a whole review.
- A cleaned copy can never pass for a redaction, by title or by name.
- The copy for every kind lives in one typed record, so a new kind cannot ship without words.
- Nearly every Follow-up specs 0001 to 0006 addressed to feature 8 closes here.

**Negative / tradeoffs**:
- A refusal still cannot name the item that caused it, so the visitor unticks by guesswork, helped by the likely cause (see Follow-up).
- Make it again costs a whole run to get the same file back, because spec 0002 lets go of the output at download on purpose.
- Memoised rows fix the tick, not the first render of thousands of rows. If AC-8's measure fails, virtual scrolling comes back as a decision, with its cost to find in page and native details.
- Focus moving on its own is a judgement: some screen reader users prefer it to stay put. The table keeps moves to the cases where the focused control disappears or a result appears.
- `tool-client.tsx` is split, so the diff is larger than the behaviour change.

**Neutral**:
- Two booleans join `ReviewMatch`; the protocol tests and spec 0002 record them.
- Mobile gets no special case. A phone that runs out of memory lands on the lost callout, as any browser does.
- Feature 10 adds its sign in path to the `too-many-pages` copy and a paid cap to the drop zone helper.

## Follow-up

- [ ] Name the refused item: a `MatchId` carried with a run refusal, where the engine can trace one. Out of this spec because `redaction-incomplete` often cannot be traced to one target, and the error shape is spec 0002, INV-4. Decide it with spec 0005's Follow-up on `replacement-text` refusals, once feature 11 counts refusals after a clean review.
- [ ] If AC-8's measure fails either line, bring virtual scrolling to `/architect` before this spec is `Accepted`.
- [ ] Page previews are out: page images would be a new kind of document data on the main thread (spec 0002, INV-1). Feature 14 builds page rendering for rectangles; decide there whether review gets a preview too.
- [ ] Feature 10: add the sign in path to the `too-many-pages` copy for the free tier, and show a paid cap in the drop zone helper once the entitlement says so.
- [ ] Feature 11: log `resultCounts` at `complete`, and count run refusals by kind, so the refused item Follow-up above has numbers.
- [x] Spec 0006's open Follow-up on sparse OCR pages still stands; once it is fixed, `ADVICE` may say more than "may". Settled by spec 0008, AC-10: `ADVICE` keeps "may", because `bare-picture` and `scanned` also name photos on which text recognition finds no word.
- [ ] Feature 14: when it ships, the `scanned` and `bare-picture` lines point to rectangles for paid visitors (spec 0006's Follow-up).
- [ ] Give the refused item Follow-up above a trigger that does not wait on feature 11's numbers. A document shaped like `detect-blocked.pdf` (an address inside wider replacement text, listed tickable and ticked by default) is refused on its default ticks, and `replacement-text`'s "untick one group at a time" finds a kind, not an item, so on a long list the only way out is to untick every address of that kind. Bring back to `/architect` a worker side bisect on refusal: run again per target set and return the offending ids as blocked, so the review comes back with that row blocked rather than named. It needs the error shape decision (spec 0002, INV-4), but nothing new crosses the boundary beyond match ids the main thread already holds. From the [redact flow review](../../reviews/2026-09-30-feat-redact-flow.md), Minor 5.
- [ ] In `src/app/tool/result-card.tsx`, `partlyNamed` is read from the end of the output name (`-partly-redacted.pdf`), a string built from the file's own name. It is safe today, because the line shows only inside the partly callout, where the name ends in `partly-redacted` or `cleaned`, but deriving it from the same `OutputForm` that named the file would say what it means. From the same review, nit 2.
- [ ] `src/lib/session.ts` imports `countRemoved` from `src/lib/detectors.ts`, which pulls `lucide-react` into the reducer's module, until now plain data. `countRemoved` reads only a `RedactionOutcome`, so it could live in `session.ts` or beside that type. From the same review, nit 3.
- [ ] `lookedFor` in `src/lib/detectors.ts` formats with `Intl.ListFormat("en")`, while `flow-text.ts` and `page-findings.ts` use `en-GB`. They agree at two kinds and differ (an Oxford comma) from three, so align them before feature 12 adds the release 3 detectors. From the same review, nit 4.
