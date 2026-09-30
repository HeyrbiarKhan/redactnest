# 0007. Redact flow: rationale

## Context

Features 3 to 7 each put the smallest working piece of the tool page in place and left its final form to feature 8. The result works from drop to download, but it reads like a test harness: the full drop zone stays at the top for the whole session, the checklist grows beneath it, and the outcome and Download sit below the checklist, so on a 50 page document the one action that matters is a long scroll away. The outcome is one line, "Removed 3 items and stripped document info", which says nothing about what stayed in the file, and a run that removed nothing reads almost the same as one that did.

Failures are one plain sentence each, written as stand ins. Spec 0004 asked for real copy that names the likely cause of its newest refusals (a stamp across a ticked item, an accent drawn as its own mark, a footnote marker, lines MuPDF cannot rewrite), and those causes need more room than a sentence. Worse, a refused run is terminal today: the session goes to `failed`, and the visitor must choose the file again and tick everything again, even though the worker still holds the untouched original and could run again straight away.

Two measured problems sit on the same page. `ReviewChecklist` renders every row again on each session change, with a new toggle handler per row, so a single tick takes 5 to 6 seconds on a document with thousands of matches. And every row shows "…" either side of its context, even when the context reaches the start or end of the page. Spec 0006 also left two wording problems: the advice after a scan warning says "If you have the original", which confuses people who only have the scan, and it implies text recognition will clear the warning, which spec 0006's open Follow-up shows it does not always do.

The constraints are fixed by earlier specs. The document stays in the worker (spec 0001), the session is a pure reducer with no bytes in it (spec 0002), errors are a closed set of kinds carrying nothing from the document (spec 0002, INV-4), the output is let go at download (spec 0002, AC-4), and the design system is thin on purpose (spec 0003). Mobile is not promised, but spec 0001 asked for a deliberate answer rather than a silent failure. Billing is not built, so the page cap is a limit with no paid way past it yet.

## Options considered

### Option 1: restyle the thin path in place

Keep today's layout (full drop zone on top, everything stacking below) and today's state machine. Write the final copy, add the summary lines under the outcome, fix the checklist's speed and the ellipsis, and leave refusals terminal.

**Pros**:
- The smallest change: no session edges, no new primitive.
- Every existing test keeps its structure.

**Cons**:
- On a long checklist, the result and Download are still far down the page, under hundreds of rows.
- A refused run still throws away the review over a problem one untick would solve.
- The full drop zone above an open document keeps inviting a replacement nobody meant.

### Option 2: steps take over, fixed in place (chosen)

Keep the one column, the session reducer and the components, and change what each step shows: the drop zone becomes a compact file bar once a document opens, the action panel sits above the checklist, the result card takes that same spot at `complete`, and a refused run returns to review with the ticks kept. Three session edges change (`failed` from `redacting`, `ticks-set`, `rerun`), and one primitive and one form are added (`SummaryList`, `DropZone`'s compact form).

**Pros**:
- The current step is always at the top of the column, and the result is never buried.
- A refusal costs a tick change, not a whole review.
- Builds on the reducer, the worker session and the primitives already proven, so the risk sits in a few named edges rather than a rewrite.

**Cons**:
- A spec 0002 state machine amendment, with tests for every edge.
- More moving parts on one page (file bar, action panel, result card) and a focus rule for each change between them.

### Option 3: separate screens per step

Drop, review and result each fill the column alone. A "Back to the list" link reopens the checklist from the result.

**Pros**:
- The calmest page: one screen, one job.
- The result screen can use the whole column.

**Cons**:
- Changing a tick after the result takes an extra hop, and the checklist and its result are never seen together.
- Needs a view state beside the session state, or new session states, to say which screen shows, which is exactly the kind of state spec 0002 kept out of the interface.
- Warnings at open, the checklist and the download warning are designed to be read on one page (spec 0006, AC-22); splitting them across screens breaks that.

## Rationale

The product is a single page a small business trusts with its most sensitive file, and the three forces that matter are keeping the current step in view, never losing the visitor's work over a fixable problem, and never letting a file look more redacted than it is. Option 1 fails the first two: the result stays under the list, and a refusal still ends the document. Option 3 meets the first and fails the rest: it needs view state the session was designed to avoid, and it pulls apart the warnings and the download warning spec 0006 placed side by side.

Option 2 changes what the page shows, not how it is built. The worker already keeps the session and the untouched original through any failed run, so returning to review is a reducer edge, not an engine change. The file bar is the drop zone in a smaller form, so the rule that one component owns the file input (spec 0003) still holds. The result card reads counts the main thread already has, so nothing new crosses the worker boundary except two booleans per match.

The checklist's speed is fixed in place first (memoised rows, one stable handler, `content-visibility`) and measured, rather than reaching straight for virtual scrolling. The measured problem is re-rendering every row on each tick, which memoising fixes directly. Virtual scrolling would add a dependency and break find in page and native `details` for rows out of view, for a cost nobody has measured yet. AC-8 sets the lines, and a failed measure sends it back here.

## Decisions taken in the design conversation

Each was put to the engineer with a recommended pick; every recommendation was accepted.

| Decision | Chosen | Runner up | Why |
|---|---|---|---|
| Page shape | Steps take over | One growing column | The result never sits under a long list |
| Refused run | Back on the list, ticks kept | Terminal, as today | The worker still holds the original; a refusal is fixable |
| Nothing ticked | Allow, "Make a cleaned copy", titled and named plainly | Ask first | Keeps the metadata only clean the empty state already promises, and can't pass for a redaction |
| Mobile | Run everywhere, no special case | A gentle note on narrow screens | The support check already stops browsers that can't cope; a size note guesses about the device, not the file |
| Select all | First row of each group | Card header, whole list | Relieves the repeated footer case per kind; a `details` summary can't hold a checkbox |
| Action spot | Above the checklist | Below it | Reachable without scrolling; the download warning stays beside Download |
| Progress | One phase line | A step list | The worker reports phases, not percentages; calmer for screen readers |
| Checklist speed | Memoised rows, then measure | Virtual scrolling now | Fixes the measured cause; no dependency; keeps find in page |
| Result card | Removed, left in the file, also stripped | Removed and stripped only | Spec 0005 asked for what stayed |
| After download | Redact another PDF, plus Make it again | Keep the output for a second save | Spec 0002 lets go of the output at download on purpose |
| Page cap message | Say the limit, suggest splitting | Mention a paid plan is coming | Useful now, promises nothing |
| Failure copy | Title, why, what to do | One line each | Spec 0004's causes need room |
| Passwords | Explain how to unlock, no field | A password field | A password entry is a feature of its own, on the privacy critical page |
| Open failed | Error above the full drop zone | Error with one button | The next file is one drop away |
| References | None | Sources only | The reasoning lives here |

### What the engineer's review added (2026-09-30)

Before accepting the session change, the engineer raised seven points. Each is settled in the spec:

1. **Naming the refused row: out, as a Follow-up.** A `MatchId` is a random UUID minted in the worker, so carrying one would not leak text. But `redaction-incomplete` comes from a comparison of every page before and after, and its known causes often cannot be traced to one target, so a named row would sometimes point at the wrong one. It would also change the error shape spec 0002, INV-4 fixes, and spec 0005 already makes the question depend on feature 11's refusal counts. The copy names the likely cause instead, and the ticks survive for the visitor to change.
2. **`retireOtherJobs`.** `rerun` calls `redact` on the open session, never `open`, and every new file gets a fresh `jobId`, so the new edge does not reach the exception. The fix is included anyway (AC-24), because the scope row lists it as owed here and it closes the trap for good.
3. **Nothing ticked.** The file is named `{stem}-cleaned.pdf`, even when its pages would otherwise make it partly redacted, and `PARTLY_REASON` shows only when the name really says partly redacted (AC-12, INV-2).
4. **The ellipsis.** `checklist-item.tsx` adds "…" whenever a side is not empty. The row cannot tell a cut context from a page that starts exactly 40 characters back, so `contextReader`, which knows, returns `beforeCut` and `afterCut` (AC-9).
5. **Cropped scan fragments.** One sentence joins the `off-page-content` note (AC-19), from the 2026-09-29 review, note 3.
6. **The OCR advice.** No line promises text recognition clears a warning (AC-18), because spec 0006's open Follow-up shows sparse OCR pages still read as `bare-picture`.
7. **Page preview: out.** Page images would be a new kind of document data on the main thread (spec 0002, INV-1), and feature 14 builds page rendering.

Kept as they are, confirmed: Cancel, the details Enter and Space proof, the effect that drops the output when the session stops being `complete` and undownloaded, and the lost callout with Try again (AC-23).

### What the cross check changed (2026-09-30)

An independent read only pass on another model found about twenty places where the spec left the builder to guess. The engineer accepted every recommended fix; none changes a decision above. In short: the refusal's lifetime (kept through tick changes, cleared on every other edge) and a refusal counting as unsaved work; a lost worker named as not a refusal; one run handler for Redact and Make it again; a "Choose another PDF" button on refusals ticks cannot cause; the file bar in every state (Start over moves into it, the page count moves there from the document card); the result card holding its own warning and Download, heard through focus rather than a live region, which changes one line of spec 0006, AC-22; exact list, noun, size and tier rules for the copy; the all blocked count line; the exact cut test for the ellipsis; `ticks-set` returning the same object when nothing changes; select all hidden below two tickable rows; `content-visibility`'s intrinsic size and an off screen keyboard test; the rest of the focus table, moved in effects; and which test ids stay, move or join.

### Settled here without a question

- **The file bar is `DropZone`'s compact form**, not a new component. The drop zone owns the file input and clears its value after every choice (spec 0002, AC-2); a second component with its own input would split that rule. Runner up: a separate `FileBar` primitive holding its own input.
- **`ticks-set` is one action** for a group's select all, so a group of 600 rows changes in one render and one reducer step. Runner up: dispatching `tick-toggled` per row, which renders hundreds of times.
- **`rerun` only from `complete` after download.** Before download, Download is the action; after it, the output is gone and a run is the honest way back. Runner up: allowing it from any `complete`, which offers two buttons that do nearly the same thing.
- **Copy moves to `src/lib/flow-text.ts`** as records over the protocol's closed sets, beside `page-findings.ts` and `detectors.ts`, so a new kind fails the type check without its words. Runner up: keeping the switch in `tool-client.tsx`, which is already 917 lines.
- **Focus moves only where the focused control disappears or a result appears** (the *Focus* table). Runner up: never moving focus and relying on the live regions, which leaves focus on `body` when Redact becomes Cancel and Cancel becomes the result.
- **AC-8's lines are 200 ms for a tick and 1 s for the first render**, on a desktop class machine. 200 ms is the edge of a responsive interaction; 1 s after the open's own phase line is short enough not to read as a hang. Runner up: no numbers, which leaves "fast enough" to taste.

## Measurements

To be recorded by task 13: the dense fixture's page and match counts, the checklist's first render after `opened`, and a single tick's time to paint, in Chromium on the machine used, with the commit.
