import type { ProgressPhase } from "@/worker/protocol";

/**
 * The steps of an open or a run, from the phases the worker already sends
 * (spec 0026, child 0003, AC-34). No new phase and no new message: a step's
 * state comes from the latest phase received and the list's order alone.
 */

export type StepState = "done" | "current" | "next";

export interface StepView {
  readonly phase: ProgressPhase;
  readonly state: StepState;
}

export interface StepsView {
  readonly steps: readonly StepView[];
  /** Steps done over the list's length, so the bar never claims more than the phases prove. */
  readonly fraction: number;
}

/**
 * Steps before the latest phase are `done`, it is `current`, steps after it
 * are `next`. A phase that never arrives (the engine already loaded for a
 * second document, so no `loading-engine`) is `done` once a later one does.
 * No phase yet, or one not in the list (`checking-entitlement` while a file
 * waits for the plan), counts as the first step, so the plan wait never shows
 * as a step of its own (AC-33). The last step is `current` until the work
 * ends, so the bar is never full for work that did not finish (AC-35).
 */
export function stepStates(
  latest: ProgressPhase | null,
  list: readonly ProgressPhase[],
): StepsView {
  const found = latest === null ? -1 : list.indexOf(latest);
  const at = Math.max(found, 0);
  return {
    steps: list.map((phase, index) => ({
      phase,
      state: index < at ? "done" : index === at ? "current" : "next",
    })),
    fraction: list.length === 0 ? 0 : at / list.length,
  };
}
