/**
 * Spec 0007, AC-8 and INV-7. A tick renders again only what it changed.
 *
 * A checklist of 600 rows, driven through the real session reducer exactly as
 * `tool-client` drives it, with one stable handler for every row. The two row
 * primitives are wrapped so each render is counted by the id it was given; the
 * wrapper renders the real primitive, so the page under test is the real one.
 */

import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createElement,
  Profiler,
  useCallback,
  useReducer,
  type ComponentProps,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewChecklist } from "@/app/tool/review-checklist";
import {
  IDLE,
  sessionReducer,
  type SessionAction,
  type ToolSession,
} from "@/lib/session";
import {
  asMatchId,
  type DetectorKind,
  type MatchId,
  type ReviewMatch,
} from "@/worker/protocol";

const renders = vi.hoisted(() => ({
  rows: [] as string[],
  selectAll: [] as string[],
  commits: 0,
}));

vi.mock("@/ui/checklist-item", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ui/checklist-item")>();
  return {
    ChecklistItem: (props: ComponentProps<typeof actual.ChecklistItem>) => {
      renders.rows.push(props.id);
      return createElement(actual.ChecklistItem, props);
    },
  };
});

vi.mock("@/ui/checklist-select-all", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/ui/checklist-select-all")>();
  return {
    ...actual,
    ChecklistSelectAll: (props: ComponentProps<typeof actual.ChecklistSelectAll>) => {
      renders.selectAll.push(props.id);
      return createElement(actual.ChecklistSelectAll, props);
    },
  };
});

const PER_KIND = 300;

function rows(kind: DetectorKind, ticked: boolean): ReviewMatch[] {
  return Array.from({ length: PER_KIND }, (_, index) => ({
    id: asMatchId(`${kind}-${index}`),
    type: kind,
    page: Math.floor(index / 12) + 1,
    text: kind === "email" ? `person${index}@example.com` : `020 7946 ${1000 + index}`,
    before: "Contact ",
    after: " today",
    beforeCut: true,
    afterCut: true,
    tickedByDefault: ticked,
    blocked: null,
    concealed: null,
  }));
}

/** 300 emails, seeded ticked, and 300 phone numbers, seeded clear. */
const MATCHES: readonly ReviewMatch[] = Object.freeze([
  ...rows("email", true),
  ...rows("phone", false),
]);

const OPEN: readonly SessionAction[] = [
  {
    type: "file-chosen",
    jobId: "job",
    file: new File(["%PDF-1.4"], "directory.pdf"),
    entitlement: { tier: "paid", pageCap: 50, maxFileBytes: 26_214_400 },
  },
  { type: "opened", summary: { pageCount: 25, pages: [] }, matches: MATCHES },
];

/** The page's own wiring: the reducer, and one stable handler of each kind. */
function Page() {
  const [session, dispatch] = useReducer(sessionReducer, IDLE, (idle: ToolSession) =>
    OPEN.reduce(sessionReducer, idle),
  );
  const onToggle = useCallback(
    (id: MatchId) => dispatch({ type: "tick-toggled", id }),
    [],
  );
  const onTicksSet = useCallback(
    (ids: readonly MatchId[], on: boolean) => dispatch({ type: "ticks-set", ids, on }),
    [],
  );
  if (session.state === "idle") return null;

  return (
    <Profiler id="checklist" onRender={() => (renders.commits += 1)}>
      <ReviewChecklist
        matches={session.matches}
        ticked={session.ticked}
        running={false}
        partly={false}
        onToggle={onToggle}
        onTicksSet={onTicksSet}
      />
    </Profiler>
  );
}

/**
 * By id: a role query weighs every name in a 600 row list, which is slow
 * enough in jsdom to time out under a full parallel run.
 */
function box(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`no element with id ${id}`);
  return element;
}

function forget(): void {
  renders.rows.length = 0;
  renders.selectAll.length = 0;
  renders.commits = 0;
}

beforeEach(() => {
  forget();
});

// Six hundred rows in jsdom take a few seconds to mount under a full run.
describe("rendering a long checklist (AC-8, INV-7)", { timeout: 30_000 }, () => {
  it("renders every row once on the way in", () => {
    render(<Page />);

    expect(renders.rows).toHaveLength(MATCHES.length);
    expect(renders.selectAll.sort()).toEqual(["select-all-email", "select-all-phone"]);
  });

  it("renders only the ticked row and its group's select all on one tick", async () => {
    render(<Page />);
    const user = userEvent.setup();
    forget();

    await user.click(box("match-email-150"));

    expect(renders.rows).toEqual(["match-email-150"]);
    expect(renders.selectAll).toEqual(["select-all-email"]);
    expect(renders.commits).toBe(1);
  });

  it("renders only the group's rows, in one render, on a select all", async () => {
    render(<Page />);
    const user = userEvent.setup();
    forget();

    const selectAll = box("select-all-phone");
    expect(selectAll).toHaveAccessibleName("Select all 300 phone numbers");
    await user.click(selectAll);

    expect(renders.rows).toHaveLength(PER_KIND);
    expect(renders.rows.every((id) => id.startsWith("match-phone-"))).toBe(true);
    expect(renders.selectAll).toEqual(["select-all-phone"]);
    expect(renders.commits).toBe(1);
  });
});
