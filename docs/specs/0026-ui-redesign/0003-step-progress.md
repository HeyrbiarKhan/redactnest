# 0026.3. Step progress

Child of [0026. UI redesign](index.md). Status follows the umbrella.

## Summary

While a file opens and while a run works, `/tool` shows a short list of steps with a tick on each finished one and a bar that fills step by step, as `09-tool-states.png` draws it. The steps are the `ProgressPhase` kinds the worker already sends, so nothing changes in `src/worker` or `src/engine`. Each step's words say only what that phase really does, so the first run step names the removal and not "hidden data", which the code cannot promise in every case (spec 0019, AC-12).

## Requirements

**User stories**:
- As a visitor, I want to see which step the work is on and which are done, so that a long file feels like progress, not a hang.

**Acceptance criteria**:

- **AC-31**: One presentation primitive, `ProgressSteps` in `src/ui`, takes a title, the current step's line, an ordered list of steps each with a label and a state (`done`, `current`, `next`), and the fraction done. It renders the title, an `aria-hidden` bar, and an `ol` whose items show a check (`done`), a turning ring (`current`) or an empty circle (`next`), with the state also in visually hidden text. It is not a live region: the existing polite region keeps announcing the phase line exactly as today (spec 0013, AC-20), so nothing is announced twice. Under reduced motion the ring does not turn and the bar does not ease.
- **AC-32**: The run's steps are `RUN_STEPS = ["redacting", "writing", "verifying"]` (in `src/lib/flow-text.ts`), worded in `PHASE_TEXT`: `redacting` "Removing what you ticked", `writing` "Writing your new file", `verifying` "Checking every page". A run with nothing ticked words its first step "Stripping document info and attachments", through `phaseLine(phase, tickedCount)` as today (replacing its `STRIPPING` line, "Stripping hidden content"), the two kinds the home page already names behind the self check's structure part (spec 0019, AC-12). The title is "Redacting…" (draft words, owner's read). No new phase: `PROGRESS_PHASES` and every `onPhase` call stay as they are.
- **AC-33**: The open's steps are `OPEN_STEPS = ["loading-engine", "opening", "inspecting", "detecting"]`, with today's `PHASE_TEXT` words. `checking-entitlement`, which is not in the list, maps to index 0, so the first step shows as current and the plan wait never appears as a step of its own (the plan card's own "Checking your plan" line is unchanged, spec 0013 AC-15). The title is "Opening…" (draft words).
- **AC-34**: A step's state comes from the latest phase received and the list's order alone: steps before it are `done`, it is `current`, steps after it are `next`. A phase that never arrives (the engine already loaded for a second document, so no `loading-engine`) shows `done` once a later phase arrives. Steps only move forward within one open or run. No step is held on screen for a minimum time, and the bar's fraction is the count of `done` steps over the list's length, eased between values by the motion token.
- **AC-35**: Cancel stays where it is today, with its test id, name, focus rules and effect (spec 0007). On cancel, refusal or completion the progress card gives way to the next state as today; the bar never shows full for a run that did not finish.
- **AC-36**: Every word lives in `src/lib/flow-text.ts` as records over `ProgressPhase` (spec 0007, INV-3), and no line carries a page, an item, a count from the document or the file name. The security page is read again for any line that quotes a phase's words (spec 0018).

## Decision

**Chosen option**: three run steps and four open steps over today's phases, a bar by steps done, one primitive for both.

Why, in short: the stripping happens inside the `redacting` phase today (`stripToAllowlist` and `stripPictureDetails` run before `onPhase("writing")` in `src/engine/redact.ts`), so the mockup's separate "Stripping hidden data" step would describe a phase that strips nothing. The owner kept the worker untouched rather than add a `stripping` phase (the runner up: four true steps, one new kind in the protocol). A bar by steps never claims more done than the phases prove; a bar by pages would need a new progress field and a message per page.

## Build plan

1. `RUN_STEPS`, `OPEN_STEPS`, the new `PHASE_TEXT` words and the nothing ticked line in `flow-text.ts`; `flow-text.test.ts` updated, satisfies **AC-32**, **AC-33**, **AC-36**
2. `ProgressSteps` in `src/ui` with component tests (states, hidden text, reduced motion) and axe, satisfies **AC-31**
3. A pure function from the latest phase and a step list to step states and fraction, with tests for a skipped phase and for the plan wait, satisfies **AC-34**
4. `tool-client` shows `ProgressSteps` in the progress card for the open and the run, Cancel unchanged; the component suite's phase line expectations updated to the new words, satisfies **AC-31**, **AC-35**
5. Read `/security` for any quoted phase words, satisfies **AC-36**
