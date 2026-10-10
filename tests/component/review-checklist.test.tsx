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
    beforeCut: true,
    afterCut: true,
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
    onTicksSet?: (ids: readonly MatchId[], on: boolean) => void;
  } = {},
) {
  return render(
    <ReviewChecklist
      matches={overrides.matches ?? MATCHES}
      ticked={new Set(overrides.ticked ?? [asMatchId("p1"), asMatchId("e1")])}
      running={overrides.running ?? false}
      partly={overrides.partly ?? false}
      onToggle={overrides.onToggle ?? (() => {})}
      onTicksSet={overrides.onTicksSet ?? (() => {})}
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
    // Two phone rows, after the group's select all row (spec 0007, AC-7).
    expect(
      within(phones)
        .getAllByRole("checkbox")
        .map((box) => box.getAttribute("aria-labelledby")),
    ).toEqual(["select-all-phone-label", "match-p1-text", "match-p2-text"]);
  });

  it("counts a group of one with the singular noun", () => {
    const { container } = show({ matches: [match("e1", "email", "jane@example.com")] });

    expect(container.querySelector("summary")).toHaveTextContent(
      "Email addresses1 email address",
    );
  });

  /**
   * Spec 0005, AC-24 and *Value sourcing*: every kind feature 12 adds gets
   * its own group, in `DETECTOR_KINDS` order whatever order the pages give,
   * each counted with its own noun ("3 dates", "1 IBAN").
   */
  describe("with all seven kinds found", () => {
    const SEVEN: readonly ReviewMatch[] = Object.freeze([
      match("n1", "uk-nino", "AB 12 34 56 C"),
      match("d1", "date", "27 September 2026", { tickedByDefault: false }),
      match("s1", "us-ssn", "123-45-6789"),
      match("i1", "iban", "GB82 WEST 1234 5698 7654 32"),
      match("c1", "card", "4111 1111 1111 1111"),
      match("p1", "phone", "020 7946 0958"),
      match("e1", "email", "jane@example.com"),
      match("d2", "date", "05.12.1980", { page: 2 }),
      match("s2", "us-ssn", "234 56 7890", { page: 2 }),
      match("d3", "date", "1 May 1990", { page: 2 }),
    ]);

    it("shows a group for each, in DETECTOR_KINDS order, counted with its own noun", () => {
      const { container } = show({ matches: SEVEN, ticked: [] });

      expect(
        groups(container).map((group) => group.querySelector("summary")?.textContent),
      ).toEqual([
        "Email addresses1 email address",
        "Phone numbers1 phone number",
        "Dates3 dates",
        "Card numbers1 card number",
        "Bank account numbers (IBAN)1 IBAN",
        "US Social Security numbers2 Social Security numbers",
        "UK National Insurance numbers1 National Insurance number",
      ]);
    });

    it("keeps the worker's order inside a new kind's group", () => {
      const { container } = show({ matches: SEVEN, ticked: [] });
      const dates = groups(container)[2];

      expect(
        within(dates)
          .getAllByRole("checkbox")
          .map((box) => box.getAttribute("aria-labelledby")),
      ).toEqual([
        "select-all-date-label",
        "match-d1-text",
        "match-d2-text",
        "match-d3-text",
      ]);
    });

    it("passes axe", async () => {
      const { container } = show({ matches: SEVEN, ticked: [asMatchId("c1")] });

      await expectNoAxeViolations(container);
    });
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
      screen.getByRole("checkbox", { name: "Select all 2 phone numbers" }),
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
  /**
   * Spec 0013, AC-19: the first thing inside the Found items card, before
   * any group, so the list never reads as a complete redaction.
   */
  it("always comes first inside the found items card, naming what was looked for", () => {
    const { container } = show();

    const note = screen.getByTestId("coverage");
    expect(note).toHaveTextContent(COVERAGE_NOTE);
    expect(COVERAGE_NOTE).toBe(
      "RedactNest looked for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers. Anything else, such as names and addresses, stays in the file.",
    );
    const card = screen.getByTestId("checklist");
    expect(card).toContainElement(note);
    expect(
      note.compareDocumentPosition(container.querySelector("details") as Element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(container.querySelector("[role]")).toBeNull();
  });

  /** Spec 0013, AC-19: titled Found items, with a neutral count of every row. */
  it("titles the card Found items, with a count of every row found", () => {
    show();

    const card = screen.getByRole("region", { name: "Found items" });
    const badge = within(card).getByText(/found items?$/);
    expect(badge).toHaveClass("bg-subtle", "text-ink-muted");
  });

  it("says nothing was found, and that a cleaned copy is still on offer, when there is nothing", () => {
    show({ matches: [] });

    expect(screen.getByTestId("coverage")).toBeInTheDocument();
    expect(screen.getByText(NOTHING_FOUND.title)).toBeVisible();
    expect(screen.getByText(NOTHING_FOUND.helper)).toBeVisible();
    expect(NOTHING_FOUND.helper).toBe(
      "RedactNest found no email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers or National Insurance numbers. Make a cleaned copy to remove metadata and hidden content.",
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
      "RedactNest looked for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers on the pages it could read. Anything else, such as names and addresses, stays in the file.",
    );
  });

  it("says nothing was found on the pages it could read, when some page carries a warning", () => {
    show({ matches: [], partly: true });

    expect(screen.getByText(NOTHING_FOUND_PARTLY.title)).toBeVisible();
    expect(screen.getByText(NOTHING_FOUND_PARTLY.helper)).toBeVisible();
    expect(NOTHING_FOUND_PARTLY.helper).toBe(
      "RedactNest found no email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers or National Insurance numbers on the pages it could read. Make a cleaned copy to remove metadata and hidden content.",
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

/** Spec 0007, AC-7. A group's select all, as its first row. */
describe("select all", () => {
  const P1 = asMatchId("p1");
  const P2 = asMatchId("p2");

  function selectAll(): HTMLElement {
    return screen.getByRole("checkbox", { name: "Select all 2 phone numbers" });
  }

  it("is the first row of a group with two or more rows a tick can reach", () => {
    const { container } = show();
    const [emails, phones] = groups(container);

    const first = phones.querySelector("ul > li");
    expect(first).toHaveAttribute("data-testid", "select-all-phone");
    expect(first).toContainElement(selectAll());
    // One email can be ticked, the other is blocked, so no select all there.
    expect(within(emails).queryByRole("checkbox", { name: /^Select all/ })).toBeNull();
  });

  it("counts only the rows a tick can reach, while the badge counts every row found", () => {
    const { container } = show({
      matches: [
        match("e1", "email", "a@example.com"),
        match("e2", "email", "b@example.com"),
        match("e3", "email", "c@example.com", {
          blocked: "slanted-text",
          tickedByDefault: false,
        }),
      ],
    });

    expect(
      screen.getByRole("checkbox", { name: "Select all 2 email addresses" }),
    ).toBeInTheDocument();
    expect(container.querySelector("summary")).toHaveTextContent("3 email addresses");
  });

  it.each([
    ["clear", [], false, false],
    ["mixed", [P1], false, true],
    ["checked", [P1, P2], true, false],
  ] as const)(
    "shows %s by how many of its rows are ticked",
    (_, ticked, checked, mixed) => {
      show({ ticked });

      expect(selectAll().matches(":checked")).toBe(checked);
      expect((selectAll() as HTMLInputElement).indeterminate).toBe(mixed);
      if (mixed) expect(selectAll()).toBePartiallyChecked();
    },
  );

  it.each([
    ["clear", [], true],
    ["mixed", [P1], true],
    ["checked", [P1, P2], false],
  ] as const)(
    "sends one action over its own rows when %s: ticked is %s",
    async (_, ticked, on) => {
      const onTicksSet = vi.fn();
      const onToggle = vi.fn();
      show({ ticked, onTicksSet, onToggle });

      await userEvent.setup().click(selectAll());

      expect(onTicksSet).toHaveBeenCalledTimes(1);
      expect(onTicksSet).toHaveBeenCalledWith([P1, P2], on);
      expect(onToggle).not.toHaveBeenCalled();
    },
  );

  it("never names a blocked row", async () => {
    const onTicksSet = vi.fn();
    show({
      matches: [
        match("e1", "email", "a@example.com"),
        match("e2", "email", "b@example.com"),
        match("e3", "email", "c@example.com", {
          blocked: "slanted-text",
          tickedByDefault: false,
        }),
      ],
      ticked: [],
      onTicksSet,
    });

    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "Select all 2 email addresses" }));

    expect(onTicksSet).toHaveBeenCalledWith([asMatchId("e1"), asMatchId("e2")], true);
  });

  it("is disabled while a run is under way", () => {
    show({ running: true });

    expect(selectAll()).toBeDisabled();
  });

  it("works from the keyboard", async () => {
    const onTicksSet = vi.fn();
    show({ ticked: [], onTicksSet });
    const user = userEvent.setup();

    selectAll().focus();
    await user.keyboard(" ");

    expect(onTicksSet).toHaveBeenCalledWith([P1, P2], true);
  });

  it("passes axe in every state", async () => {
    for (const ticked of [[], [P1], [P1, P2]]) {
      const { container, unmount } = show({ ticked });
      await expectNoAxeViolations(container);
      unmount();
    }
  });
});
