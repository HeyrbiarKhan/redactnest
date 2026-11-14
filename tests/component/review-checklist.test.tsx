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

import {
  ReviewChecklist,
  type TermGroupActions,
  type TermGroupTerm,
} from "@/app/tool/review-checklist";
import {
  BLOCKED_REASON_TEXT,
  COVERAGE_NOTE,
  COVERAGE_NOTE_PARTLY,
  coverageNoteWithTerms,
  NOTHING_FOUND,
  NOTHING_FOUND_PARTLY,
  TERM_NOTE_TEXT,
} from "@/lib/detectors";
import { TERMS_TEXT } from "@/lib/flow-text";
import type { TermState } from "@/lib/session";
import {
  asMatchId,
  asTermId,
  type MatchId,
  type ReviewMatch,
  type TermId,
} from "@/worker/protocol";

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
    term: null,
    termNotes: [],
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

  // Spec 0017, as built: one group can list thousands (AC-28), and spec 0007's
  // label (AC-7) names its count the way every terms line does. The fewest rows
  // that show a separator, with room to render them all beside the parallel
  // suite, as the long checklist's own render test has.
  it(
    "writes a count of 1,000 or more with a thousands separator",
    { timeout: 60_000 },
    () => {
      const { container } = show({
        matches: Array.from({ length: 1_000 }, (_, index) =>
          match(`e${index}`, "email", `staff.${index}@example.com`),
        ),
        ticked: [],
      });
      // By its id, since asking for a role by name reads all 1,001 boxes' names.
      expect(container.querySelector("#select-all-email")).toHaveAccessibleName(
        "Select all 1,000 email addresses",
      );
    },
  );

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

/**
 * Spec 0017, AC-14 to AC-17. One group per term this job knows, in the list's
 * order and before the detector groups; a group with no rows says why, with
 * its ways on. The page's wiring of these handlers is proved in
 * `tests/component/terms-flow.test.tsx`.
 */
describe("custom term groups (spec 0017)", () => {
  const ACME = asTermId("acme");
  const JANE = asTermId("jane");

  const SEARCHED: TermState = { state: "searched" };

  function termRow(
    id: string,
    term: TermId,
    text: string,
    overrides: Partial<ReviewMatch> = {},
  ): ReviewMatch {
    return match(id, "term", text, { term, ...overrides });
  }

  function actions(overrides: Partial<TermGroupActions> = {}): TermGroupActions {
    return {
      onSetAside: vi.fn(),
      onRemove: vi.fn(),
      onTryAgain: vi.fn(),
      onRecheck: vi.fn(),
      searching: false,
      ...overrides,
    };
  }

  function showTerms(options: {
    terms: readonly TermGroupTerm[];
    matches?: readonly ReviewMatch[];
    ticked?: readonly MatchId[];
    running?: boolean;
    partly?: boolean;
    termActions?: TermGroupActions;
  }) {
    const matches = options.matches ?? [];
    return render(
      <ReviewChecklist
        matches={matches}
        ticked={new Set(options.ticked ?? matches.map(({ id }) => id))}
        running={options.running ?? false}
        partly={options.partly ?? false}
        onToggle={() => {}}
        onTicksSet={() => {}}
        terms={options.terms}
        termActions={options.termActions}
      />,
    );
  }

  const summaries = (container: HTMLElement) =>
    groups(container).map((group) => group.querySelector("summary")?.textContent);

  it("lists each term's group in the list's order, before the detector groups, headed as typed (AC-14)", () => {
    const { container } = showTerms({
      terms: [
        { id: JANE, text: "Jane Doe", state: SEARCHED },
        { id: ACME, text: "Acme Ltd", state: SEARCHED },
      ],
      matches: [
        match("e1", "email", "jane@example.com"),
        termRow("a1", ACME, "Acme Ltd"),
        termRow("j1", JANE, "Jane Doe"),
        termRow("a2", ACME, "ACME LTD", { page: 2 }),
      ],
    });

    expect(summaries(container)).toEqual([
      "Jane Doe1 match",
      "Acme Ltd2 matches",
      "Email addresses1 email address",
    ]);
  });

  it("counts a blocked row in its group, and offers select all only once two rows can be ticked (AC-14)", () => {
    const blocked = termRow("a2", ACME, "Acme Ltd", {
      blocked: "replacement-text",
      tickedByDefault: false,
    });
    const terms = [{ id: ACME, text: "Acme Ltd", state: SEARCHED }];
    const { container, unmount } = showTerms({
      terms,
      matches: [termRow("a1", ACME, "Acme Ltd"), blocked],
    });

    expect(summaries(container)).toEqual(["Acme Ltd2 matches"]);
    expect(screen.queryByRole("checkbox", { name: /^Select all/ })).toBeNull();
    unmount();

    showTerms({
      terms,
      matches: [
        termRow("a1", ACME, "Acme Ltd"),
        blocked,
        termRow("a3", ACME, "Acme Ltd", { page: 3 }),
      ],
    });
    expect(
      screen.getByRole("checkbox", { name: "Select all 2 matches" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId(`select-all-term-${ACME}`)).toBeInTheDocument();
  });

  it("describes a noted row by each of its notes, in TERM_NOTE_TEXT's words (AC-11, AC-14)", () => {
    showTerms({
      terms: [{ id: ACME, text: "Acme Ltd", state: SEARCHED }],
      matches: [
        termRow("a1", ACME, "AcmeLtd", {
          tickedByDefault: false,
          termNotes: ["joined", "page-break"],
        }),
      ],
      ticked: [],
    });

    const box = screen.getByRole("checkbox", { name: "AcmeLtd" });
    expect(box).not.toBeChecked();
    expect(box).toHaveAccessibleDescription(
      expect.stringContaining(TERM_NOTE_TEXT.joined),
    );
    expect(box).toHaveAccessibleDescription(
      expect.stringContaining(TERM_NOTE_TEXT["page-break"]),
    );
  });

  it("says a searched term with no rows was not found in this document (AC-15)", () => {
    showTerms({ terms: [{ id: ACME, text: "Acme Ltd", state: SEARCHED }] });

    expect(screen.getByTestId("term-not-found")).toHaveTextContent(
      "Not found in this document",
    );
  });

  it("speaks only for the pages RedactNest could read when some page carries a warning (AC-15)", () => {
    showTerms({ terms: [{ id: ACME, text: "Acme Ltd", state: SEARCHED }], partly: true });

    expect(screen.getByTestId("term-not-found")).toHaveTextContent(
      "Not found on the pages RedactNest could read",
    );
  });

  it("says a term is still being searched", () => {
    showTerms({ terms: [{ id: ACME, text: "Acme Ltd", state: { state: "searching" } }] });

    expect(screen.getByTestId("term-searching")).toHaveTextContent(TERMS_TEXT.searching);
    expect(screen.queryByTestId("term-not-found")).toBeNull();
  });

  it("offers Try again, Set aside and Remove for a failed search, each handed the term (AC-17)", async () => {
    const ways = actions();
    showTerms({
      terms: [
        {
          id: ACME,
          text: "Acme Ltd",
          state: { state: "not-searched", reason: "search-failed" },
        },
      ],
      termActions: ways,
    });
    const user = userEvent.setup();

    expect(screen.getByTestId("term-not-searched")).toHaveTextContent(
      "Not searched: the search could not finish.",
    );
    expect(screen.queryByTestId("term-recheck")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    await user.click(screen.getByRole("button", { name: "Set aside for this file" }));
    await user.click(screen.getByRole("button", { name: "Remove Acme Ltd" }));

    expect(ways.onTryAgain).toHaveBeenCalledWith(ACME);
    expect(ways.onSetAside).toHaveBeenCalledWith(ACME);
    expect(ways.onRemove).toHaveBeenCalledWith(ACME);
  });

  it("offers Check my plan for a Free plan term only where the account offers it, and never Try again (AC-2, AC-17)", async () => {
    const terms = [
      {
        id: ACME,
        text: "Acme Ltd",
        state: { state: "not-searched", reason: "free-plan" } as const,
      },
    ];
    const ways = actions();
    const { unmount } = showTerms({ terms, termActions: ways });

    expect(screen.getByTestId("term-not-searched")).toHaveTextContent(
      "Not searched: this file opened on the Free plan.",
    );
    expect(screen.queryByTestId("term-try-again")).toBeNull();
    await userEvent.setup().click(screen.getByTestId("term-recheck"));
    expect(ways.onRecheck).toHaveBeenCalledTimes(1);
    unmount();

    showTerms({ terms, termActions: actions({ onRecheck: null }) });
    expect(screen.queryByTestId("term-recheck")).toBeNull();
    expect(screen.getByTestId("term-set-aside")).toBeInTheDocument();
  });

  it("holds Try again busy while another search runs, so one search runs at a time (AC-19)", async () => {
    const ways = actions({ searching: true });
    showTerms({
      terms: [
        {
          id: ACME,
          text: "Acme Ltd",
          state: { state: "not-searched", reason: "search-failed" },
        },
      ],
      termActions: ways,
    });

    const tryAgain = screen.getByTestId("term-try-again");
    expect(tryAgain).toHaveAttribute("aria-disabled", "true");
    await userEvent.setup().click(tryAgain);
    expect(ways.onTryAgain).not.toHaveBeenCalled();
    // Remove stays live while a search runs (AC-19).
    expect(screen.getByRole("button", { name: "Remove Acme Ltd" })).toBeEnabled();
  });

  it("says a set aside term was not searched and why, and offers only Remove (AC-17)", () => {
    showTerms({
      terms: [
        {
          id: ACME,
          text: "Acme Ltd",
          state: { state: "set-aside", reason: "search-failed" },
        },
      ],
      termActions: actions(),
    });

    expect(screen.getByTestId("term-set-aside")).toHaveTextContent(
      "Set aside: not searched in this file because the search could not finish.",
    );
    expect(screen.getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Remove Acme Ltd",
    ]);
  });

  it("disables every way on while a run is under way (AC-1)", () => {
    showTerms({
      terms: [
        {
          id: ACME,
          text: "Acme Ltd",
          state: { state: "not-searched", reason: "search-failed" },
        },
        {
          id: JANE,
          text: "Jane Doe",
          state: { state: "not-searched", reason: "free-plan" },
        },
      ],
      termActions: actions(),
      running: true,
    });

    for (const button of screen.getAllByRole("button")) expect(button).toBeDisabled();
  });

  it("shows Nothing found only when no row of any kind exists (AC-14)", () => {
    const { unmount } = showTerms({
      terms: [{ id: ACME, text: "Acme Ltd", state: SEARCHED }],
      matches: [termRow("a1", ACME, "Acme Ltd")],
    });
    expect(screen.queryByText(NOTHING_FOUND.title)).toBeNull();
    unmount();

    showTerms({ terms: [{ id: ACME, text: "Acme Ltd", state: SEARCHED }] });
    expect(screen.getByText(NOTHING_FOUND.title)).toBeInTheDocument();
    expect(screen.getByTestId("term-not-found")).toBeInTheDocument();
  });

  describe("the coverage note (AC-16)", () => {
    const coverage = () => screen.getByTestId("coverage");

    it("names one searched term without a count", () => {
      showTerms({ terms: [{ id: ACME, text: "Acme Ltd", state: SEARCHED }] });

      expect(coverage()).toHaveTextContent(coverageNoteWithTerms(1, false));
      expect(coverage()).toHaveTextContent(/and your custom term\. Anything else/);
    });

    it("names the searched terms by count, and counts only those searched", () => {
      showTerms({
        terms: [
          { id: ACME, text: "Acme Ltd", state: SEARCHED },
          { id: JANE, text: "Jane Doe", state: SEARCHED },
          {
            id: asTermId("zed"),
            text: "Zed Corp",
            state: { state: "set-aside", reason: "search-failed" },
          },
        ],
      });

      expect(coverage()).toHaveTextContent(coverageNoteWithTerms(2, false));
      expect(coverage()).toHaveTextContent("your 2 custom terms");
    });

    it("speaks only for the pages it could read when some page carries a warning", () => {
      showTerms({
        terms: [{ id: ACME, text: "Acme Ltd", state: SEARCHED }],
        partly: true,
      });

      expect(coverage()).toHaveTextContent(coverageNoteWithTerms(1, true));
    });

    it("stays the detectors' note while no term has been searched", () => {
      const { unmount } = showTerms({
        terms: [{ id: ACME, text: "Acme Ltd", state: { state: "searching" } }],
      });
      expect(coverage()).toHaveTextContent(COVERAGE_NOTE);
      unmount();

      showTerms({
        terms: [
          {
            id: ACME,
            text: "Acme Ltd",
            state: { state: "not-searched", reason: "free-plan" },
          },
        ],
        partly: true,
      });
      expect(coverage()).toHaveTextContent(COVERAGE_NOTE_PARTLY);
    });
  });

  it("passes axe with a term's rows, a note, and each state a group with no rows takes", async () => {
    const { container } = showTerms({
      terms: [
        { id: ACME, text: "Acme Ltd", state: SEARCHED },
        { id: JANE, text: "Jane Doe", state: SEARCHED },
        { id: asTermId("s"), text: "Searching", state: { state: "searching" } },
        {
          id: asTermId("f"),
          text: "Failed",
          state: { state: "not-searched", reason: "search-failed" },
        },
        {
          id: asTermId("p"),
          text: "Free",
          state: { state: "not-searched", reason: "free-plan" },
        },
        {
          id: asTermId("a"),
          text: "Aside",
          state: { state: "set-aside", reason: "free-plan" },
        },
      ],
      matches: [
        termRow("a1", ACME, "Acme Ltd"),
        termRow("a2", ACME, "AcmeLtd", { tickedByDefault: false, termNotes: ["joined"] }),
      ],
      ticked: [asMatchId("a1")],
      termActions: actions(),
    });

    await expectNoAxeViolations(container);
  });
});
