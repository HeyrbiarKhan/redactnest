import { describe, expect, it } from "vitest";

import { coversFocus, PANEL_ROOM, type Box } from "@/app/tool/panel-room";
import { toolGridAreas, type ToolAreas } from "@/app/tool/tool-grid";

/**
 * Spec 0026, AC-12: the tool's column template and the rule that keeps a
 * focused control out from under the floating action panel. The boxes are
 * measured in `tests/e2e/design-system.spec.ts`; these hold the arithmetic.
 */

describe("coversFocus (spec 0026, AC-12, *Focus never hidden*)", () => {
  const PANEL: Box = { top: 500, bottom: 700, left: 100, right: 800 };

  it("is true when the boxes overlap", () => {
    expect(coversFocus({ top: 480, bottom: 520, left: 120, right: 300 }, PANEL)).toBe(
      true,
    );
    expect(coversFocus({ top: 600, bottom: 640, left: 120, right: 300 }, PANEL)).toBe(
      true,
    );
    expect(coversFocus({ top: 680, bottom: 720, left: 120, right: 300 }, PANEL)).toBe(
      true,
    );
    expect(coversFocus({ top: 600, bottom: 640, left: 50, right: 120 }, PANEL)).toBe(
      true,
    );
    expect(coversFocus({ top: 600, bottom: 640, left: 790, right: 900 }, PANEL)).toBe(
      true,
    );
    // A control larger than the panel on every side.
    expect(coversFocus({ top: 0, bottom: 900, left: 0, right: 900 }, PANEL)).toBe(true);
  });

  it("is false when the boxes only touch, on every side", () => {
    expect(coversFocus({ top: 460, bottom: 500, left: 120, right: 300 }, PANEL)).toBe(
      false,
    );
    expect(coversFocus({ top: 700, bottom: 740, left: 120, right: 300 }, PANEL)).toBe(
      false,
    );
    expect(coversFocus({ top: 600, bottom: 640, left: 60, right: 100 }, PANEL)).toBe(
      false,
    );
    expect(coversFocus({ top: 600, bottom: 640, left: 800, right: 860 }, PANEL)).toBe(
      false,
    );
  });

  it("is false when the boxes are apart, on every side", () => {
    expect(coversFocus({ top: 100, bottom: 140, left: 120, right: 300 }, PANEL)).toBe(
      false,
    );
    expect(coversFocus({ top: 760, bottom: 800, left: 120, right: 300 }, PANEL)).toBe(
      false,
    );
    expect(coversFocus({ top: 600, bottom: 640, left: 0, right: 40 }, PANEL)).toBe(false);
    expect(coversFocus({ top: 600, bottom: 640, left: 860, right: 900 }, PANEL)).toBe(
      false,
    );
  });

  it("states the panel's room in rem, so 200% text scales it with the panel", () => {
    expect(PANEL_ROOM).toMatch(/^\d+(\.\d+)?rem$/);
  });
});

describe("toolGridAreas (spec 0026, AC-12, *Rows*)", () => {
  const holds = (over: Partial<ToolAreas>): ToolAreas => ({
    document: true,
    live: true,
    head: true,
    found: false,
    ...over,
  });
  const IDLE = "minmax(0, 1fr) minmax(20rem, 24rem)";
  const COLUMN = "minmax(0, 44rem)";

  it("keeps A beside B while nothing is open, with L over B only while it speaks", () => {
    expect(toolGridAreas(false, holds({ live: false }))).toEqual({
      columns: IDLE,
      rows: "none",
      areas: "'a b'",
    });
    expect(toolGridAreas(false, holds({}))).toEqual({
      columns: IDLE,
      rows: "auto 1fr",
      areas: "'a l' 'a b'",
    });
  });

  // Each state with a document on the page, as `tool-client` fills the
  // record, billing on (the plan card keeps the head full) and off.
  const STATES: readonly {
    readonly state: string;
    readonly on: Partial<ToolAreas>;
    readonly off: Partial<ToolAreas>;
    readonly areasOn: string;
    readonly areasOff: string;
  }[] = [
    {
      state: "opening, with a phase line",
      on: {},
      off: {},
      areasOn: "'a' 'l' 'h'",
      areasOff: "'a' 'l' 'h'",
    },
    {
      state: "opening, before its first phase",
      on: { live: false },
      off: { live: false },
      areasOn: "'a' 'h'",
      areasOff: "'a' 'h'",
    },
    {
      state: "lost",
      on: { live: false },
      off: { live: false },
      areasOn: "'a' 'h'",
      areasOff: "'a' 'h'",
    },
    {
      state: "reviewing",
      on: { found: true },
      off: { found: true, head: false },
      areasOn: "'a' 'l' 'h' 'c'",
      areasOff: "'a' 'l' 'c'",
    },
    {
      state: "redacting",
      on: { found: true },
      off: { found: true, head: false },
      areasOn: "'a' 'l' 'h' 'c'",
      areasOff: "'a' 'l' 'c'",
    },
    {
      state: "complete",
      on: { found: true },
      off: { found: true },
      areasOn: "'a' 'l' 'h' 'c'",
      areasOff: "'a' 'l' 'h' 'c'",
    },
  ];

  it.each(STATES)(
    "stacks only the areas that hold something while $state",
    ({ on, off, areasOn, areasOff }) => {
      expect(toolGridAreas(true, holds(on))).toEqual({
        columns: COLUMN,
        rows: "none",
        areas: areasOn,
      });
      expect(toolGridAreas(true, holds(off)).areas).toBe(areasOff);
    },
  );

  it("leaves out an empty A, once the file bar's buttons move to the header", () => {
    expect(toolGridAreas(true, holds({ document: false, found: true })).areas).toBe(
      "'l' 'h' 'c'",
    );
  });
});

/**
 * Spec 0026 child 0002, AC-38: the frame. While the preview shows, P sits on
 * the left beside every row and the right column is 26.25rem, its areas in
 * page order, one `auto` row each and the last taking the slack.
 */
describe("toolGridAreas with the preview (child 0002, AC-38)", () => {
  const holds = (over: Partial<ToolAreas>): ToolAreas => ({
    document: true,
    live: true,
    head: true,
    found: true,
    preview: true,
    ...over,
  });
  const FRAME = "minmax(0, 1fr) 26.25rem";

  it("puts P beside each right column area, billing on", () => {
    expect(toolGridAreas(true, holds({}))).toEqual({
      columns: FRAME,
      rows: "auto auto auto minmax(0, 1fr)",
      areas: "'p a' 'p l' 'p h' 'p c'",
    });
  });

  it("leaves out B's head when it holds nothing, billing off", () => {
    expect(toolGridAreas(true, holds({ head: false }))).toEqual({
      columns: FRAME,
      rows: "auto auto minmax(0, 1fr)",
      areas: "'p a' 'p l' 'p c'",
    });
  });

  it("gives the slack to whichever area comes last", () => {
    expect(
      toolGridAreas(true, holds({ document: false, live: false, head: false })),
    ).toEqual({
      columns: FRAME,
      rows: "minmax(0, 1fr)",
      areas: "'p c'",
    });
  });

  it("is AC-12's column whenever the preview is off", () => {
    expect(toolGridAreas(true, holds({ preview: false })).columns).toBe(
      "minmax(0, 44rem)",
    );
    expect(toolGridAreas(false, holds({})).columns).toBe(
      "minmax(0, 1fr) minmax(20rem, 24rem)",
    );
  });
});
