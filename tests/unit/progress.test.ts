import { describe, expect, it } from "vitest";

import { stepStates } from "@/lib/progress";

/** Spec 0026, child 0003, AC-33 to AC-35: steps from the latest phase alone. */
describe("stepStates", () => {
  const OPEN = ["loading-engine", "opening", "inspecting", "detecting"] as const;
  const RUN = ["redacting", "writing", "verifying"] as const;
  const states = (view: ReturnType<typeof stepStates>) =>
    view.steps.map(({ state }) => state);

  it("marks the steps before the latest phase done, it current and the rest next", () => {
    const view = stepStates("inspecting", OPEN);
    expect(states(view)).toEqual(["done", "done", "current", "next"]);
    expect(view.steps.map(({ phase }) => phase)).toEqual(OPEN);
    expect(view.fraction).toBe(2 / 4);
  });

  it("shows a phase that never arrives as done once a later one does", () => {
    // The engine was already loaded, so `loading-engine` never came.
    expect(states(stepStates("opening", OPEN))).toEqual([
      "done",
      "current",
      "next",
      "next",
    ]);
  });

  it("counts the plan wait as the open's first step, never a step of its own", () => {
    const view = stepStates("checking-entitlement", OPEN);
    expect(states(view)).toEqual(["current", "next", "next", "next"]);
    expect(view.steps).toHaveLength(OPEN.length);
    expect(view.fraction).toBe(0);
  });

  it("starts at the first step before any phase has arrived", () => {
    expect(states(stepStates(null, RUN))).toEqual(["current", "next", "next"]);
  });

  it("never fills the bar while the last step still works", () => {
    const view = stepStates("verifying", RUN);
    expect(states(view)).toEqual(["done", "done", "current"]);
    expect(view.fraction).toBeLessThan(1);
    expect(view.fraction).toBe(2 / 3);
  });

  it("fills the bar a step at a time as phases arrive in order", () => {
    expect(RUN.map((phase) => stepStates(phase, RUN).fraction)).toEqual([
      0,
      1 / 3,
      2 / 3,
    ]);
  });
});
