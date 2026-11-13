/**
 * Custom terms through the tool page, with the worker and the plan check at
 * their module boundaries. Spec 0017, AC-2 to AC-6, AC-17 to AC-20 and AC-27.
 *
 * The matcher and the engine are proved in `tests/unit`, and a real browser
 * runs the paid path in `tests/e2e/terms.spec.ts`. These are the page's own
 * rules: the tab's list kept across files, what a Free job does with it, a
 * failed search, a paste's refusals, and Make waiting while any term does.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToolClient } from "@/app/tool/tool-client";
import {
  asMatchId,
  EngineError,
  type DocumentSummary,
  type EntitlementSnapshot,
  type ReviewMatch,
  type TermQuery,
} from "@/worker/protocol";
import type { OpenedSession, TermSearch, TermsFound } from "@/worker/client";
import type { SupportReport } from "@/lib/support";

import { expectNoAxeViolations } from "../setup/component";

const mocks = vi.hoisted(() => ({
  lostListeners: new Set<() => void>(),
  openSession: vi.fn(),
  releaseEngine: vi.fn(),
  getEntitlement: vi.fn(),
  answer: null as EntitlementSnapshot | null,
}));

vi.mock("@/worker/client", () => ({
  warmEngine: vi.fn(),
  releaseEngine: mocks.releaseEngine,
  openSession: mocks.openSession,
  onEngineLost: (listener: () => void) => {
    mocks.lostListeners.add(listener);
    return () => mocks.lostListeners.delete(listener);
  },
}));

vi.mock("@/lib/download", () => ({ offerDownload: vi.fn() }));

vi.mock("@/lib/entitlement", () => ({
  getEntitlement: mocks.getEntitlement,
  askAtLoad: vi.fn(),
  askWhenVisible: vi.fn(),
  askAgain: vi.fn(),
  readEntitlement: () => mocks.answer,
  subscribeEntitlement: () => () => {},
}));

// Billing on: the panel exists only on a build that sells Pro (AC-1, AC-2).
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return { ...actual, config: { ...actual.config, billingEnabled: true } };
});

const SUPPORTED: SupportReport = Object.freeze({ supported: true, missing: [] });
vi.mock("@/lib/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/support")>()),
  getSupport: () => SUPPORTED,
}));

vi.mock("@/lib/document-load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-load")>()),
  loadedAt: () => "/tool",
  currentPath: () => "/tool",
  reloadDocument: vi.fn(),
}));

const PAID: EntitlementSnapshot = Object.freeze({
  tier: "paid",
  pageCap: 50,
  maxFileBytes: 26_214_400,
  account: "signed-in",
});
const UNCONFIRMED: EntitlementSnapshot = Object.freeze({
  tier: "free",
  pageCap: 3,
  maxFileBytes: 26_214_400,
  account: "unknown",
});

const SUMMARY: DocumentSummary = Object.freeze({
  pageCount: 1,
  pages: Object.freeze([Object.freeze({ findings: Object.freeze([]) })]),
});

/** A search that lands with no rows, or that the test settles itself. */
function searching(
  settle: (batch: readonly TermQuery[]) => Promise<TermsFound> = (batch) =>
    Promise.resolve({ terms: batch.map(({ id }) => id), matches: [] }),
) {
  return vi.fn((batch: readonly TermQuery[]): TermSearch => ({
    done: settle(batch),
    cancel: vi.fn(),
  }));
}

function session(
  findTerms = searching(),
  matches: readonly ReviewMatch[] = [],
): OpenedSession {
  return {
    jobId: "job",
    summary: SUMMARY,
    matches,
    redact: vi.fn(),
    findTerms,
    cancel: vi.fn(),
    release: vi.fn(),
  };
}

function pdf(name = "lease.pdf"): File {
  const file = new File(["%PDF-1.7"], name, { type: "application/pdf" });
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.resolve(new ArrayBuffer(8)),
  });
  return file;
}

async function choose(file = pdf()): Promise<void> {
  await userEvent.upload(screen.getByTestId("file-input"), file);
}

const field = () => screen.getByRole("textbox", { name: "Add a name, number or phrase" });

/** One address found at open, ticked, so an untick is unsaved work. */
const EMAIL: ReviewMatch = Object.freeze({
  id: asMatchId("m1"),
  type: "email",
  page: 1,
  text: "jane@example.com",
  before: "Contact ",
  after: " today",
  beforeCut: true,
  afterCut: true,
  tickedByDefault: true,
  blocked: null,
  concealed: null,
  term: null,
  termNotes: Object.freeze([]),
});

async function type(term: string): Promise<void> {
  await userEvent.type(field(), `${term}{Enter}`);
}

function paste(lines: readonly string[]): void {
  fireEvent.paste(field(), {
    clipboardData: { getData: () => lines.join("\n") },
  });
}

/** What the last open asked the worker to search, and under what limits. */
function lastOpen(): { terms: readonly TermQuery[]; limits: { maxTerms: number } } {
  const call = mocks.openSession.mock.lastCall as
    [{ terms: readonly TermQuery[]; limits: { maxTerms: number } }] | undefined;
  if (!call) throw new Error("never opened");
  return call[0];
}

beforeEach(() => {
  mocks.lostListeners.clear();
  mocks.answer = PAID;
  vi.clearAllMocks();
  mocks.getEntitlement.mockResolvedValue(PAID);
  mocks.openSession.mockResolvedValue(session());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the tab's list (AC-3, AC-6)", () => {
  it("adds a typed term, searches it, and keeps it for the next file", async () => {
    const findTerms = searching();
    mocks.openSession.mockResolvedValue(session(findTerms));
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");

    await type("Acme Ltd");
    expect(findTerms).toHaveBeenCalledTimes(1);
    expect(findTerms.mock.lastCall?.[0].map(({ text }) => text)).toEqual(["Acme Ltd"]);
    expect(await screen.findByTestId("term-chip")).toHaveTextContent(
      "Not found in this document",
    );
    expect(field()).toHaveValue("");

    // AC-6: the next file's open carries the kept list on Pro.
    await choose(pdf("second.pdf"));
    await screen.findByTestId("terms-panel");
    expect(lastOpen().terms.map(({ text }) => text)).toEqual(["Acme Ltd"]);
    expect(lastOpen().limits.maxTerms).toBe(50);
  });

  it("keeps the list through Start over, says so, and Remove all empties it", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");
    paste(["Acme Ltd", "Jane Doe"]);
    expect(await screen.findAllByTestId("term-chip")).toHaveLength(2);

    await userEvent.click(screen.getByTestId("start-over"));
    const kept = await screen.findByTestId("terms-kept");
    expect(kept).toHaveTextContent("2 custom terms are kept for this tab");

    await userEvent.click(within(kept).getByRole("button", { name: "Remove all terms" }));
    expect(screen.queryByTestId("terms-kept")).not.toBeInTheDocument();
  });

  it("adds each pasted line in order until the list is full, and names every refusal (AC-4)", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");

    const lines = [
      ...Array.from({ length: 50 }, (_, index) => `Term number ${index}`),
      "term NUMBER 3",
      "a",
      "x".repeat(101),
      "Two more",
      "",
      "Three more",
    ];
    paste(lines);

    expect(await screen.findAllByTestId("term-chip")).toHaveLength(50);
    const status = screen.getByTestId("terms-status");
    expect(status).toHaveTextContent(
      "“a” not added because it is too short (at least 2 characters).",
    );
    expect(status).toHaveTextContent(
      `“${"x".repeat(60)}…” (101 characters) not added because it is too long (at most 100 characters).`,
    );
    expect(status).toHaveTextContent(
      "“term NUMBER 3” not added because it is already in your list.",
    );
    expect(status).toHaveTextContent(
      "2 not added because your list is full at 50 terms: “Two more” and “Three more”.",
    );
    expect(field()).toHaveValue("");
  });

  it("keeps a refused typed term in the field to be fixed", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");

    await type("a");
    expect(field()).toHaveValue("a");
    expect(screen.getByTestId("terms-status")).toHaveTextContent(
      "“a” not added because it is too short (at least 2 characters).",
    );
  });

  it("gives the field no name, no form, and no history or spelling (AC-23)", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");

    expect(field()).not.toHaveAttribute("name");
    expect((field() as HTMLInputElement).form).toBeNull();
    expect(field()).toHaveAttribute("autocomplete", "off");
    expect(field()).toHaveAttribute("spellcheck", "false");
  });
});

describe("a job that opened on the Free plan (AC-2, AC-17, AC-18)", () => {
  it("locks the panel, lists the kept terms not searched, and Make waits until set aside", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");
    await type("Acme Ltd");
    await screen.findByTestId("term-not-found");

    mocks.getEntitlement.mockResolvedValue(UNCONFIRMED);
    await choose(pdf("second.pdf"));
    await screen.findByTestId("terms-locked");

    // AC-27: the worker is asked to search nothing, and may search nothing.
    expect(lastOpen().terms).toEqual([]);
    expect(lastOpen().limits.maxTerms).toBe(0);

    expect(screen.getByTestId("terms-locked")).toHaveTextContent(
      "your plan could not be confirmed",
    );
    expect(field()).toBeDisabled();
    expect(screen.getByTestId("term-chip")).toHaveTextContent(
      "Not searched: this file opened on the Free plan",
    );

    const make = screen.getByTestId("redact");
    expect(make).toHaveAttribute("aria-disabled", "true");
    // The ways on for a term not searched on the Free plan: no Try again,
    // and Check my plan because this account offers it (AC-2, AC-17).
    expect(screen.getByTestId("make-waits")).toHaveTextContent(
      "“Acme Ltd” was not searched because this file opened on the Free plan. Set aside or remove it to go ahead, or check your plan and open the file again.",
    );
    expect(screen.getByTestId("term-recheck")).toBeInTheDocument();
    await expectNoAxeViolations(document.body);

    await userEvent.click(screen.getByTestId("term-set-aside"));
    expect(screen.queryByTestId("make-waits")).not.toBeInTheDocument();
    expect(screen.getByTestId("redact")).not.toHaveAttribute("aria-disabled");
    expect(screen.getByTestId("term-chip")).toHaveTextContent(
      "Set aside: not searched in this file",
    );
    expect(screen.getByTestId("term-chip")).not.toHaveTextContent(
      "Set aside for this file",
    );
    expect(
      screen.getByText(
        "Set aside: not searched in this file because it opened on the Free plan.",
      ),
    ).toBeInTheDocument();
  });

  it("asks before Check my plan reopens a file with unsaved work, and a cancelled ask changes nothing", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");
    await type("Acme Ltd");
    await screen.findByTestId("term-not-found");

    mocks.getEntitlement.mockResolvedValue(UNCONFIRMED);
    mocks.openSession.mockResolvedValue(session(searching(), [EMAIL]));
    await choose(pdf("second.pdf"));
    await screen.findByTestId("terms-locked");
    const opens = mocks.openSession.mock.calls.length;

    // An untick is unsaved work (spec 0002, AC-1).
    await userEvent.click(screen.getByRole("checkbox", { name: EMAIL.text }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.click(screen.getByTestId("term-recheck"));

    expect(confirm).toHaveBeenCalledWith(
      "You have unsaved work on the document that is open. Checking your plan opens this file again, which discards your work on it. Continue?",
    );
    expect(mocks.openSession).toHaveBeenCalledTimes(opens);
    expect(screen.getByRole("checkbox", { name: EMAIL.text })).not.toBeChecked();
  });
});

describe("a search that fails (AC-19, AC-20)", () => {
  it("keeps the review, says so, holds Make, and Try again searches the batch again", async () => {
    let fail = true;
    const findTerms = searching((batch) =>
      fail
        ? Promise.reject(new EngineError("unsupported"))
        : Promise.resolve({ terms: batch.map(({ id }) => id), matches: [] }),
    );
    mocks.openSession.mockResolvedValue(session(findTerms));
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");

    await type("Acme Ltd");
    expect(await screen.findByTestId("term-chip")).toHaveTextContent(
      "Not searched: the search could not finish",
    );
    expect(screen.getByTestId("terms-status")).toHaveTextContent(
      "“Acme Ltd” could not be searched.",
    );
    expect(screen.getByTestId("redact")).toHaveAttribute("aria-disabled", "true");

    fail = false;
    await userEvent.click(screen.getByTestId("term-try-again"));
    expect(findTerms).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId("term-not-found")).toBeInTheDocument();
    expect(screen.getByTestId("redact")).not.toHaveAttribute("aria-disabled");
  });

  it("shows Add busy and the field read only while a search runs, then lets go", async () => {
    let land: (found: TermsFound) => void = () => {};
    const findTerms = searching(
      () =>
        new Promise<TermsFound>((resolve) => {
          land = resolve;
        }),
    );
    mocks.openSession.mockResolvedValue(session(findTerms));
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");

    await type("Acme Ltd");
    expect(screen.getByTestId("terms-add")).toHaveAttribute("aria-disabled", "true");
    expect(field()).toHaveAttribute("readonly");
    expect(screen.getByTestId("terms-status")).toHaveTextContent(
      "Searching for “Acme Ltd”…",
    );
    expect(screen.getByTestId("make-waits")).toHaveTextContent("still being searched");

    const [batch] = findTerms.mock.lastCall ?? [[]];
    await act(async () => land({ terms: batch.map(({ id }) => id), matches: [] }));
    expect(screen.getByTestId("terms-add")).not.toHaveAttribute("aria-disabled");
    expect(field()).not.toHaveAttribute("readonly");
  });
});

/** Press a control from the keyboard, as the visitor who would lose their place does. */
async function press(control: HTMLElement): Promise<void> {
  act(() => control.focus());
  await userEvent.keyboard("{Enter}");
}

/** A term's own Remove in its group, not its chip's. */
function groupRemove(text: string): HTMLElement {
  const button = screen
    .getAllByTestId("term-remove")
    .find((each) => each.textContent === `Remove ${text}`);
  if (!button) throw new Error(`no Remove for ${text} in its group`);
  return button;
}

/** A term's chip remove button, not its group's Remove. */
function chipRemove(text: string): HTMLElement {
  const chip = screen
    .getAllByTestId("term-chip")
    .find((each) => within(each).queryByRole("button", { name: `Remove ${text}` }));
  if (!chip) throw new Error(`no chip for ${text}`);
  return within(chip).getByRole("button", { name: `Remove ${text}` });
}

/** Two terms searched and not found on Pro, then a second file opened on the Free plan. */
async function keptOnFree(): Promise<void> {
  render(<ToolClient />);
  await choose();
  await screen.findByTestId("terms-panel");
  paste(["Acme Ltd", "Jane Doe"]);
  expect(await screen.findAllByTestId("term-not-found")).toHaveLength(2);

  mocks.getEntitlement.mockResolvedValue(UNCONFIRMED);
  await choose(pdf("second.pdf"));
  await screen.findByTestId("terms-locked");
}

/** One term whose review search failed, so its group offers Try again, Set aside and Remove. */
async function failedSearch(
  findTerms = searching(() => Promise.reject(new EngineError("unsupported"))),
): Promise<void> {
  mocks.openSession.mockResolvedValue(session(findTerms));
  render(<ToolClient />);
  await choose();
  await screen.findByTestId("terms-panel");
  await type("Acme Ltd");
  await screen.findByTestId("term-try-again");
}

describe("focus after a control takes itself away (AC-5)", () => {
  it("moves to Choose a PDF after Remove all beside the drop zone", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");
    paste(["Acme Ltd", "Jane Doe"]);
    expect(await screen.findAllByTestId("term-chip")).toHaveLength(2);
    await userEvent.click(screen.getByTestId("start-over"));

    const kept = await screen.findByTestId("terms-kept");
    await press(within(kept).getByRole("button", { name: "Remove all terms" }));

    expect(screen.queryByTestId("terms-kept")).not.toBeInTheDocument();
    expect(screen.getByTestId("choose-file")).toHaveFocus();
  });

  it("moves from a not searched term's Remove in its group to the next term's, as a chip's does", async () => {
    await keptOnFree();

    await press(groupRemove("Acme Ltd"));
    expect(screen.getAllByTestId("term-chip")).toHaveLength(1);
    expect(chipRemove("Jane Doe")).toHaveFocus();
  });

  it("moves to the locked line's way on once the last term goes, since the field is off", async () => {
    await keptOnFree();

    await press(groupRemove("Acme Ltd"));
    await press(groupRemove("Jane Doe"));
    expect(screen.queryByTestId("term-chip")).not.toBeInTheDocument();
    expect(screen.getByTestId("terms-recheck")).toHaveFocus();
  });

  it("moves to the locked line's way on after a chip's remove or Remove all empties the list", async () => {
    await keptOnFree();
    await press(chipRemove("Acme Ltd"));
    expect(chipRemove("Jane Doe")).toHaveFocus();
    await press(chipRemove("Jane Doe"));
    expect(screen.getByTestId("terms-recheck")).toHaveFocus();
  });

  it("moves to the locked line's way on after the panel's Remove all on a Free job", async () => {
    await keptOnFree();
    await press(screen.getByTestId("terms-remove-all"));
    expect(screen.queryByTestId("term-chip")).not.toBeInTheDocument();
    expect(screen.getByTestId("terms-recheck")).toHaveFocus();
  });

  it("moves from Set aside to the term's own Remove, and from a set aside term's Remove to the field", async () => {
    await failedSearch();

    await press(screen.getByTestId("term-set-aside"));
    expect(screen.getByTestId("term-chip")).toHaveTextContent(
      "Set aside: not searched in this file",
    );
    expect(groupRemove("Acme Ltd")).toHaveFocus();

    await press(groupRemove("Acme Ltd"));
    expect(screen.queryByTestId("term-chip")).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it("moves from a failed term's Remove in its group to the field", async () => {
    await failedSearch();

    await press(groupRemove("Acme Ltd"));
    expect(screen.queryByTestId("term-chip")).not.toBeInTheDocument();
    expect(field()).toHaveFocus();
  });

  it("moves from Try again to the field while the batch is searched again", async () => {
    let fail = true;
    const findTerms = searching((batch) =>
      fail
        ? Promise.reject(new EngineError("unsupported"))
        : Promise.resolve({ terms: batch.map(({ id }) => id), matches: [] }),
    );
    await failedSearch(findTerms);

    fail = false;
    await press(screen.getByTestId("term-try-again"));
    expect(await screen.findByTestId("term-not-found")).toBeInTheDocument();
    expect(field()).toHaveFocus();
  });
});

describe("the polite line names only listed terms (AC-19)", () => {
  it("is cleared by Remove all, so it never names the terms that went", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");
    paste(["Acme Ltd", "Jane Doe"]);
    const status = screen.getByTestId("terms-status");
    expect(
      await screen.findByText("Not found in this document: “Acme Ltd” and “Jane Doe”."),
    ).toBeInTheDocument();

    await press(screen.getByTestId("terms-remove-all"));
    expect(screen.queryByTestId("term-chip")).not.toBeInTheDocument();
    expect(status).toBeEmptyDOMElement();
    expect(field()).toHaveFocus();
  });

  it("drops a line once a term it names is removed, and keeps one that names none", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");
    const status = screen.getByTestId("terms-status");

    await type("Acme Ltd");
    await type("Jane Doe");
    expect(status).toHaveTextContent("Not found in this document: “Jane Doe”.");

    // The line names Jane Doe alone, so removing Acme Ltd leaves it as it is.
    await press(chipRemove("Acme Ltd"));
    expect(status).toHaveTextContent("Not found in this document: “Jane Doe”.");

    await press(chipRemove("Jane Doe"));
    expect(status).toBeEmptyDOMElement();
  });

  it("drops an already in your list refusal once the term it duplicated is removed, and keeps the rest", async () => {
    render(<ToolClient />);
    await choose();
    await screen.findByTestId("terms-panel");
    const status = screen.getByTestId("terms-status");
    const duplicate = "“acme ltd” not added because it is already in your list.";
    const tooShort = "“a” not added because it is too short (at least 2 characters).";

    await type("Acme Ltd");
    paste(["acme ltd", "a", "Jane Doe"]);
    expect(await screen.findAllByTestId("term-chip")).toHaveLength(2);
    expect(status).toHaveTextContent(duplicate);
    expect(status).toHaveTextContent(tooShort);

    // Jane Doe was added, not duplicated, so both refusals still hold.
    await press(chipRemove("Jane Doe"));
    expect(status).toHaveTextContent(duplicate);
    expect(status).toHaveTextContent(tooShort);

    // Acme Ltd was the term the refused line duplicated: once it goes, that
    // refusal is no longer true, and the too short one still is.
    await press(chipRemove("Acme Ltd"));
    expect(status).not.toHaveTextContent("already in your list");
    expect(status).toHaveTextContent(tooShort);
  });
});
