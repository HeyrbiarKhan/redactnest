/**
 * The checklist feature 6 places on `/tool`. Spec 0005, AC-3, AC-8, AC-13 and
 * AC-14.
 *
 * Rendered on its own, with the tick set and the toggle handed in exactly as
 * `tool-client` hands them, so the grouping, the order, the blocked rows and
 * the copy are proved here, and the wiring in `tool-client.test.tsx`.
 */

import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ReviewChecklist } from "@/app/tool/review-checklist";
import {
  BLOCKED_REASON_TEXT,
  COVERAGE_NOTE,
  COVERAGE_NOTE_PARTLY,
  NOTHING_FOUND,
  NOTHING_FOUND_PARTLY,
} from "@/lib/detectors";
import { asMatchId, type MatchId, type ReviewMatch } from "@/worker/protocol";

import { expectNoAxeViolations } from "../setup/component";

function match(
  id: string,
  type: ReviewMatch["type"],
  text: string,
  overrides: Partial<ReviewMatch> = {},
): ReviewMatch {
  return {
    id: asMatchId(id),
    type,
    page: 1,
    text,
    before: "Contact ",
    after: " today",
    tickedByDefault: true,
    blocked: null,
    concealed: null,
    ...overrides,
  };
}

/** In the order the worker sends them: by page, then reading order. */
const MATCHES: readonly ReviewMatch[] = Object.freeze([
  match("p1", "phone", "020 7946 0958"),
  match("e1", "email", "jane@example.com"),
  match("e2", "email", "slanted@example.com", {
    page: 2,
    tickedByDefault: false,
    blocked: "slanted-text",
  }),
  match("p2", "phone", "(212) 123 4567", { page: 2, tickedByDefault: false }),
]);

function show(
  overrides: {
    matches?: readonly ReviewMatch[];
    ticked?: readonly MatchId[];
    running?: boolean;
    partly?: boolean;
    onToggle?: (id: MatchId) => void;
  } = {},
) {
  return render(
    <ReviewChecklist
      matches={overrides.matches ?? MATCHES}
      ticked={new Set(overrides.ticked ?? [asMatchId("p1"), asMatchId("e1")])}
      running={overrides.running ?? false}
      partly={overrides.partly ?? false}
      onToggle={overrides.onToggle ?? (() => {})}
    />,
  );
}

function groups(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll("details")];
}

describe("the groups (AC-3, AC-13)", () => {
  it("shows one group per kind with a match, in DETECTOR_KINDS order", () => {
    const { container } = show();

    expect(
      groups(container).map((group) => group.querySelector("summary")?.textContent),
    ).toEqual(["Email addresses2 email addresses", "Phone numbers2 phone numbers"]);
  });

  it("keeps the worker's order inside each group", () => {
    const { container } = show();
    const [emails, phones] = groups(container);

    expect(
      within(emails)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-labelledby")),
    ).toEqual(["match-e1-text", "match-e2-text"]);
    expect(within(phones).getAllByRole("checkbox")).toHaveLength(2);
  });

  it("counts a group of one with the singular noun", () => {
    const { container } = show({ matches: [match("e1", "email", "jane@example.com")] });

    expect(container.querySelector("summary")).toHaveTextContent(
      "Email addresses1 email address",
    );
  });

  it("shows no group for a kind with nothing found", () => {
    const { container } = show({ matches: [match("e1", "email", "jane@example.com")] });

    expect(groups(container)).toHaveLength(1);
    expect(screen.queryByText("Phone numbers")).not.toBeInTheDocument();
  });

  it("binds every checkbox to the tick set", () => {
    show({ ticked: [asMatchId("e1")] });

    expect(screen.getByRole("checkbox", { name: "jane@example.com" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "020 7946 0958" })).not.toBeChecked();
  });

  it("names the match's page and its context in each row", () => {
    show();

    expect(
      screen.getByRole("checkbox", { name: "(212) 123 4567" }),
    ).toHaveAccessibleDescription("Page 2 …Contact (212) 123 4567 today…");
  });
});

describe("ticking", () => {
  it("hands the toggled match's id to the caller", async () => {
    const onToggle = vi.fn();
    show({ onToggle });

    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "020 7946 0958" }));

    expect(onToggle).toHaveBeenCalledWith(asMatchId("p1"));
  });

  it("disables every checkbox while a run is under way", async () => {
    const onToggle = vi.fn();
    show({ running: true, onToggle });

    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
    await userEvent
      .setup()
      .click(screen.getByText("jane@example.com", { selector: "span" }));
    expect(onToggle).not.toHaveBeenCalled();
  });
});

/** AC-8: listed, so nobody believes it is gone, and never tickable. */
describe("a blocked match", () => {
  it("shows a disabled row with its reason", async () => {
    const onToggle = vi.fn();
    show({ onToggle });

    const box = screen.getByRole("checkbox", { name: "slanted@example.com" });
    expect(box).toBeDisabled();
    expect(box).toHaveAccessibleDescription(
      `Page 2 …Contact slanted@example.com today… ${BLOCKED_REASON_TEXT["slanted-text"]}`,
    );

    await userEvent.setup().click(screen.getByText(BLOCKED_REASON_TEXT["slanted-text"]));
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("leaves the rows around it enabled", () => {
    show();

    expect(screen.getByRole("checkbox", { name: "jane@example.com" })).toBeEnabled();
  });

  /** AC-13: Tab goes each group's summary, then each checkbox that is not blocked. */
  it("is passed over by Tab, while every other row is reached in order", async () => {
    const user = userEvent.setup();
    const { container } = show();
    const [emails, phones] = container.querySelectorAll("summary");

    for (const stop of [
      emails,
      screen.getByRole("checkbox", { name: "jane@example.com" }),
      phones,
      screen.getByRole("checkbox", { name: "020 7946 0958" }),
      screen.getByRole("checkbox", { name: "(212) 123 4567" }),
    ]) {
      await user.tab();
      expect(stop).toHaveFocus();
    }
  });
});

/** AC-14: what was looked for, always; nothing found, when so. */
describe("the coverage note and the empty state", () => {
  it("always sits above the checklist, naming what was looked for", () => {
    const { container } = show();

    const note = screen.getByTestId("coverage");
    expect(note).toHaveTextContent(COVERAGE_NOTE);
    expect(COVERAGE_NOTE).toBe(
      "RedactNest looked for email addresses and phone numbers. Anything else, such as names and addresses, stays in the file.",
    );
    expect(
      note.compareDocumentPosition(screen.getByTestId("checklist")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector("[role]")).toBeNull();
  });

  it("says nothing was found, and that a cleaned copy is still on offer, when there is nothing", () => {
    show({ matches: [] });

    expect(screen.getByTestId("coverage")).toBeInTheDocument();
    expect(screen.getByText(NOTHING_FOUND.title)).toBeVisible();
    expect(screen.getByText(NOTHING_FOUND.helper)).toBeVisible();
    expect(NOTHING_FOUND.helper).toBe(
      "RedactNest found no email addresses or phone numbers. Make a cleaned copy to remove metadata and hidden content.",
    );
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  /**
   * Spec 0006, AC-26. When a page carries a warning, neither line speaks for
   * a page RedactNest could not read.
   */
  it("speaks only for the pages RedactNest could read when some page carries a warning", () => {
    show({ partly: true });

    expect(screen.getByTestId("coverage")).toHaveTextContent(COVERAGE_NOTE_PARTLY);
    expect(COVERAGE_NOTE_PARTLY).toBe(
      "RedactNest looked for email addresses and phone numbers on the pages it could read. Anything else, such as names and addresses, stays in the file.",
    );
  });

  it("says nothing was found on the pages it could read, when some page carries a warning", () => {
    show({ matches: [], partly: true });

    expect(screen.getByText(NOTHING_FOUND_PARTLY.title)).toBeVisible();
    expect(screen.getByText(NOTHING_FOUND_PARTLY.helper)).toBeVisible();
    expect(NOTHING_FOUND_PARTLY.helper).toBe(
      "RedactNest found no email addresses or phone numbers on the pages it could read. Make a cleaned copy to remove metadata and hidden content.",
    );
    expect(screen.queryByText(NOTHING_FOUND.helper)).not.toBeInTheDocument();
  });
});

describe("document text", () => {
  it("renders as text, never as markup", () => {
    const { container } = show({
      matches: [match("e1", "email", "<b>x</b>@example.com", { before: "<img src=x>" })],
    });

    expect(container.querySelector("b, img")).toBeNull();
  });
});

describe("accessibility", () => {
  it("passes axe with groups, a blocked row and a run under way", async () => {
    const { container } = show({ running: true });

    await expectNoAxeViolations(container);
  });

  it("passes axe when nothing was found", async () => {
    const { container } = show({ matches: [] });

    await expectNoAxeViolations(container);
  });
});

/** Spec 0006, AC-24. The rows a fake redaction or hidden text keeps from view. */
describe("concealed rows", () => {
  it("says a covered row is under a box, and a hidden one is not visible, and both can be ticked", () => {
    show({
      matches: [
        match("c1", "email", "board.minutes@example.com", { concealed: "covered" }),
        match("h1", "email", "white.ink@example.com", { concealed: "hidden" }),
        match("p1", "email", "plain@example.com"),
      ],
      ticked: [],
    });

    const covered = screen.getByRole("checkbox", { name: "board.minutes@example.com" });
    const hidden = screen.getByRole("checkbox", { name: "white.ink@example.com" });
    const plain = screen.getByRole("checkbox", { name: "plain@example.com" });

    expect(covered).toHaveAccessibleDescription(/Hidden under a box on the page\.$/);
    expect(hidden).toHaveAccessibleDescription(/Not visible on the page\.$/);
    expect(plain).not.toHaveAccessibleDescription(/on the page\.$/);
    expect(covered).toBeEnabled();
    expect(hidden).toBeEnabled();
  });
});
