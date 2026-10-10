/**
 * The tool page's client component, against spec 0002's acceptance criteria.
 *
 * The reducer underneath is tested exhaustively in `tests/unit/session.test.ts`,
 * and the browser suite proves the privacy guarantees for real. What is left,
 * and what this file covers, is the wiring in between: the page cap message
 * reading the job's own frozen snapshot, the page lifecycle listeners, and the
 * retry rules that no pure function can express on its own.
 *
 * Everything outside the component is mocked at the module boundary. The worker
 * client and the entitlement fetch are the two real boundaries here (a worker
 * and the network); `getSupport` is stubbed because jsdom has no `Worker`, so
 * the real detector would correctly refuse to run and the component would render
 * its "cannot run in this browser" panel instead of the tool.
 *
 * Both the replace confirm and the leave warning hang off `hasUnsavedWork`,
 * which is true once a tick has been changed, a redaction is in flight, or a
 * result has not been downloaded. Spec 0004's Redact button made the last two
 * reachable, and they are tested with the redaction path near the end of this
 * file. Spec 0005's checklist made the first reachable, and it is tested with
 * the checklist at the very end.
 */

import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToolClient } from "@/app/tool/tool-client";
import { config } from "@/config";
import { IDLE_STEPS } from "@/lib/flow-text";
import {
  asMatchId,
  EngineError,
  OperationCancelled,
  type DocumentSummary,
  type EntitlementSnapshot,
  type ProgressPhase,
  type RedactionOutcome,
  type ReviewMatch,
} from "@/worker/protocol";
import type { OpenedSession, RedactedOutput } from "@/worker/client";
import type { SupportReport } from "@/lib/support";

import { expectNoAxeViolations } from "../setup/component";

const mocks = vi.hoisted(() => ({
  /** Every listener `onEngineLost` handed back, so a test can fire the event. */
  lostListeners: new Set<() => void>(),
  warmEngine: vi.fn(),
  releaseEngine: vi.fn(),
  openSession: vi.fn(),
  getEntitlement: vi.fn(),
  askAtLoad: vi.fn(),
  askWhenVisible: vi.fn(),
  askAgain: vi.fn(),
  /** The page's answer the plan line reads, and who is listening for it. */
  answer: null as EntitlementSnapshot | null,
  answerListeners: new Set<() => void>(),
  /** `config.billingEnabled`, off unless a test turns it on (spec 0012, AC-23). */
  billingEnabled: false,
  getSupport: vi.fn(),
  loadedAt: vi.fn(),
  currentPath: vi.fn(),
  reloadDocument: vi.fn(),
  offerDownload: vi.fn(),
}));

vi.mock("@/worker/client", () => ({
  warmEngine: mocks.warmEngine,
  releaseEngine: mocks.releaseEngine,
  openSession: mocks.openSession,
  onEngineLost: (listener: () => void) => {
    mocks.lostListeners.add(listener);
    return () => mocks.lostListeners.delete(listener);
  },
}));

// The browser download itself (a blob URL and a click) is proved in a real
// browser by `tests/e2e/engine.spec.ts`. Here it is the boundary.
vi.mock("@/lib/download", () => ({
  offerDownload: mocks.offerDownload,
}));

vi.mock("@/lib/entitlement", () => ({
  getEntitlement: mocks.getEntitlement,
  askAtLoad: mocks.askAtLoad,
  askWhenVisible: mocks.askWhenVisible,
  askAgain: mocks.askAgain,
  readEntitlement: () => mocks.answer,
  subscribeEntitlement: (listener: () => void) => {
    mocks.answerListeners.add(listener);
    return () => mocks.answerListeners.delete(listener);
  },
}));

// Every other value is the real config; whether billing is on is the test's.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get billingEnabled() {
        return mocks.billingEnabled;
      },
    },
  };
});

// The gap wording stays real; only the detection is stubbed.
vi.mock("@/lib/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/support")>()),
  getSupport: mocks.getSupport,
}));

// The navigation entry, the address bar and the reload are the browser's;
// stubbed at the module boundary, because jsdom cannot redefine
// `location.reload`. The decision between them stays real.
vi.mock("@/lib/document-load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-load")>()),
  loadedAt: mocks.loadedAt,
  currentPath: mocks.currentPath,
  reloadDocument: mocks.reloadDocument,
}));

/** Stable across calls, because `useSyncExternalStore` caches on identity. */
const SUPPORTED: SupportReport = Object.freeze({ supported: true, missing: [] });

const FREE: EntitlementSnapshot = Object.freeze({
  tier: "free",
  pageCap: 3,
  maxFileBytes: 20 * 1024 * 1024,
  account: "none",
});

const PAID: EntitlementSnapshot = Object.freeze({
  tier: "paid",
  pageCap: 50,
  maxFileBytes: 100 * 1024 * 1024,
  account: "signed-in",
});

/** Page 1 typed, page 2 blank: quiet, so the plain name and the all clear line. */
const SUMMARY: DocumentSummary = Object.freeze({
  pageCount: 2,
  pages: Object.freeze([
    Object.freeze({ findings: [] }),
    Object.freeze({ findings: ["blank"] }),
  ]) as DocumentSummary["pages"],
});

function pdfFile(name = "report.pdf"): File {
  return new File(["%PDF-1.4"], name, { type: "application/pdf" });
}

/** A file whose bytes cannot be read any more, as if it were deleted on disk. */
function unreadableFile(name = "gone.pdf"): File {
  const file = pdfFile(name);
  Object.defineProperty(file, "arrayBuffer", {
    value: () => Promise.reject(new DOMException("NotFoundError")),
  });
  return file;
}

function openedSession(jobId = "job"): OpenedSession {
  return {
    jobId,
    summary: SUMMARY,
    matches: [],
    redact: vi.fn(),
    cancel: vi.fn(),
    release: vi.fn(),
  };
}

/** A job that reaches `phase` and then hangs, so the test controls what happens next. */
function hangsAt(phase: ProgressPhase | null) {
  return ({ onProgress }: { onProgress?: (phase: ProgressPhase) => void }) => {
    if (phase) onProgress?.(phase);
    return new Promise<OpenedSession>(() => {});
  };
}

/** The caps the worker was told to enforce on the most recent open. */
function lastLimits(): { maxBytes: number; maxPages: number } {
  const call = mocks.openSession.mock.lastCall as
    [{ limits: { maxBytes: number; maxPages: number } }] | undefined;
  if (!call) throw new Error("openSession was never called");
  return call[0].limits;
}

function jobIdsOpened(): string[] {
  return mocks.openSession.mock.calls.map((call) => (call[0] as { jobId: string }).jobId);
}

async function chooseFile(file: File): Promise<void> {
  const user = userEvent.setup();
  await user.upload(screen.getByTestId("file-input"), file);
}

/** The page's answer changed, told to whoever listens, as the real store does. */
function answerWith(answer: EntitlementSnapshot | null): void {
  act(() => {
    mocks.answer = answer;
    for (const listener of mocks.answerListeners) listener();
  });
}

/** The worker died. Fired the way `client.ts` fires it, through the listeners. */
async function fireEngineLost(): Promise<void> {
  await act(async () => {
    for (const listener of mocks.lostListeners) listener();
  });
}

async function firePageHide(): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new Event("pagehide"));
  });
}

async function firePageShow(persisted: boolean): Promise<void> {
  await act(async () => {
    const event = new Event("pageshow");
    Object.defineProperty(event, "persisted", { value: persisted });
    window.dispatchEvent(event);
  });
}

/**
 * Would the browser warn on the way out?
 *
 * `preventDefault` on a cancelable `beforeunload` is exactly what asks for the
 * warning, so the flag is the behavior rather than a proxy for it.
 */
function wouldWarnOnLeave(): boolean {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

beforeEach(() => {
  mocks.lostListeners.clear();
  mocks.answerListeners.clear();
  mocks.answer = null;
  mocks.billingEnabled = false;
  vi.clearAllMocks();
  mocks.getSupport.mockReturnValue(SUPPORTED);
  mocks.loadedAt.mockReturnValue("/tool");
  mocks.currentPath.mockReturnValue("/tool");
  mocks.getEntitlement.mockResolvedValue(FREE);
  mocks.openSession.mockResolvedValue(openedSession());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the page cap (AC-9)", () => {
  it("refuses a document with the cap frozen into this job, not the paid ceiling", async () => {
    mocks.openSession.mockRejectedValue(new EngineError("too-many-pages"));
    render(<ToolClient />);

    await chooseFile(pdfFile());

    const error = await screen.findByRole("alert");
    expect(
      within(error).getByRole("heading", {
        level: 2,
        name: "This PDF has more than 3 pages",
      }),
    ).toBeInTheDocument();
    expect(error).toHaveTextContent("The free limit is 3 pages.");
    expect(error).toHaveTextContent(
      "Split it into parts of 3 pages or fewer in your PDF app, and redact each one.",
    );
    // The bug spec 0002 closed: quoting a limit that was never this visitor's.
    expect(error).not.toHaveTextContent("50");
  });

  it("quotes the paid cap to a paid visitor, so the message follows the job", async () => {
    mocks.getEntitlement.mockResolvedValue(PAID);
    mocks.openSession.mockRejectedValue(new EngineError("too-many-pages"));
    render(<ToolClient />);

    await chooseFile(pdfFile());

    const error = await screen.findByRole("alert");
    expect(error).toHaveTextContent("This PDF has more than 50 pages");
    expect(error).toHaveTextContent("RedactNest handles up to 50 pages.");
    expect(error).not.toHaveTextContent("free");
  });

  it("names the file size cap frozen into this job, in whole megabytes", async () => {
    mocks.openSession.mockRejectedValue(new EngineError("too-large"));
    render(<ToolClient />);

    await chooseFile(pdfFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "RedactNest takes files up to 20 MB.",
    );
  });

  it("hands the worker the snapshot's cap, which is what enforces it at all", async () => {
    render(<ToolClient />);

    await chooseFile(pdfFile());
    await screen.findByTestId("page-count");

    // INV-5. Sending `config.maxPages` here is what left the free cap unenforced.
    expect(lastLimits()).toEqual({ maxBytes: FREE.maxFileBytes, maxPages: FREE.pageCap });
  });

  it("reopens on the cap it started with when entitlement changes mid job", async () => {
    mocks.openSession.mockImplementation(hangsAt("loading-engine"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    // An upgrade lands while the document is open. The retry below has to reuse
    // the snapshot this job froze at open rather than fetching a fresher one,
    // which is the difference between INV-5 holding and merely looking like it.
    mocks.getEntitlement.mockResolvedValue(PAID);
    await fireEngineLost();

    await vi.waitFor(() => expect(mocks.openSession).toHaveBeenCalledTimes(2));
    expect(lastLimits().maxPages).toBe(FREE.pageCap);
    expect(mocks.getEntitlement).toHaveBeenCalledTimes(1);
  });
});

describe("replacing the open document (AC-1)", () => {
  it("replaces it without asking when there is nothing to lose", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<ToolClient />);

    await chooseFile(pdfFile("first.pdf"));
    await screen.findByTestId("page-count");
    await chooseFile(pdfFile("second.pdf"));

    // An untouched checklist has nothing worth a prompt, so none is shown.
    expect(confirm).not.toHaveBeenCalled();
    const [first, second] = jobIdsOpened();
    expect(second).not.toBe(first);
  });

  it("does not release the worker on a replacement, keeping the warm engine", async () => {
    render(<ToolClient />);

    await chooseFile(pdfFile("first.pdf"));
    await screen.findByTestId("page-count");
    await chooseFile(pdfFile("second.pdf"));
    await screen.findByTestId("page-count");

    // INV-6b: a replacement ends the session in place. Terminating would throw
    // away a multi megabyte download on the one action the product exists for.
    expect(mocks.releaseEngine).not.toHaveBeenCalled();
    expect(mocks.openSession).toHaveBeenCalledTimes(2);
  });

  it("keeps no FileList on the input once the file is in hand (AC-2)", async () => {
    render(<ToolClient />);

    await chooseFile(pdfFile());
    await screen.findByTestId("page-count");

    const input = screen.getByTestId<HTMLInputElement>("file-input");
    expect(input.files).toHaveLength(0);
  });

  it("releases the worker when starting over, which is a real ending (AC-5b)", async () => {
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("page-count");

    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await userEvent.setup().click(screen.getByRole("button", { name: "Start over" }));

    // An untouched review has nothing to lose, so it goes without asking.
    expect(confirm).not.toHaveBeenCalled();
    expect(mocks.releaseEngine).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("page-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start over" })).not.toBeInTheDocument();
  });
});

describe("the leave warning (AC-13)", () => {
  it("does not warn when nothing is open", () => {
    render(<ToolClient />);

    expect(wouldWarnOnLeave()).toBe(false);
  });

  it("does not warn about a document nobody has touched", async () => {
    render(<ToolClient />);

    await chooseFile(pdfFile());
    await screen.findByTestId("page-count");

    // A checklist read and left alone has lost nothing. Warning here is the nag
    // AC-13 exists to prevent.
    expect(wouldWarnOnLeave()).toBe(false);
  });

  it("does not warn after a document failed to open", async () => {
    mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
    render(<ToolClient />);

    await chooseFile(pdfFile());
    await screen.findByRole("alert");

    expect(wouldWarnOnLeave()).toBe(false);
  });
});

describe("leaving and coming back (AC-12)", () => {
  it("ends the session when the page is hidden", async () => {
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("page-count");

    await firePageHide();

    // INV-6: leaving ends the session whether or not the page comes back.
    expect(mocks.releaseEngine).toHaveBeenCalledTimes(1);
  });

  it("shows the idle drop area when the page returns from the back forward cache", async () => {
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("page-count");

    await firePageHide();
    await firePageShow(true);

    // The JavaScript state survives that cache but the worker does not, so a
    // checklist here would point at a session that no longer exists.
    expect(screen.queryByTestId("page-count")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start over" })).not.toBeInTheDocument();
    expect(screen.getByTestId("drop-area")).toBeInTheDocument();
  });

  it("leaves the session alone on an ordinary page show", async () => {
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("page-count");

    await firePageShow(false);

    // Not a restore, so nothing to reset.
    expect(screen.getByTestId("page-count")).toBeInTheDocument();
  });
});

describe("a worker that dies (AC-11)", () => {
  it("offers a retry once the engine has finished loading", async () => {
    mocks.openSession.mockImplementation(hangsAt("opening"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    await fireEngineLost();

    expect(await screen.findByTestId("lost")).toHaveTextContent(
      "The PDF engine stopped unexpectedly.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    // The dead worker is dropped so the retry can build a fresh one.
    expect(mocks.releaseEngine).toHaveBeenCalledTimes(1);
  });

  it("reopens the same file from the handle, with no second trip to the picker", async () => {
    const pickerClick = vi.spyOn(HTMLInputElement.prototype, "click");
    mocks.openSession.mockImplementation(hangsAt("opening"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");
    await fireEngineLost();

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    const [first, second] = jobIdsOpened();
    expect(second).toBe(first);
    expect(pickerClick).not.toHaveBeenCalled();
  });

  it("can be retried from the keyboard", async () => {
    mocks.openSession.mockImplementation(hangsAt("opening"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");
    await fireEngineLost();

    const user = userEvent.setup();
    screen.getByRole("button", { name: "Try again" }).focus();
    await user.keyboard("{Enter}");

    expect(mocks.openSession).toHaveBeenCalledTimes(2);
  });

  it("says the file could not be read, rather than something generic", async () => {
    render(<ToolClient />);

    await chooseFile(unreadableFile());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The file couldn't be read");
    expect(alert).toHaveTextContent(
      "It may have been moved, renamed or deleted since you chose it.",
    );
  });

  it("stays terminal after a document failed, because a dead worker cannot fix it", async () => {
    mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByRole("alert");

    await fireEngineLost();

    expect(screen.queryByTestId("lost")).not.toBeInTheDocument();
    expect(screen.getByTestId("error")).toHaveTextContent("This PDF can't be read");
  });

  /** Spec 0007, AC-16: the lost callout keeps its own words. */
  it("titles the lost callout with its own words, not the engine load failure's", async () => {
    mocks.openSession.mockImplementation(hangsAt("opening"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    await fireEngineLost();

    const lost = await screen.findByTestId("lost");
    expect(
      within(lost).getByRole("heading", { level: 2, name: "The PDF engine stopped" }),
    ).toBeInTheDocument();
    expect(lost).not.toHaveTextContent("didn't load");
  });
});

describe("the silent retry inside the engine load window (AC-11a)", () => {
  it("retries once without showing anything when the engine never finished loading", async () => {
    mocks.openSession.mockImplementation(hangsAt("loading-engine"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    await fireEngineLost();

    // A cold start failing on the way up, not a session dying. Worth one quiet
    // second attempt before telling somebody their engine stopped.
    expect(screen.queryByTestId("lost")).not.toBeInTheDocument();
    expect(mocks.openSession).toHaveBeenCalledTimes(2);
    const [first, second] = jobIdsOpened();
    expect(second).toBe(first);
  });

  it("retries silently when the worker dies before any phase was reported", async () => {
    mocks.openSession.mockImplementation(hangsAt(null));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await vi.waitFor(() => expect(mocks.openSession).toHaveBeenCalledTimes(1));

    await fireEngineLost();

    expect(screen.queryByTestId("lost")).not.toBeInTheDocument();
    expect(mocks.openSession).toHaveBeenCalledTimes(2);
  });

  it("reports the second loss for the same job, so the retry cannot loop", async () => {
    mocks.openSession.mockImplementation(hangsAt("loading-engine"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    await fireEngineLost();
    await fireEngineLost();

    expect(await screen.findByTestId("lost")).toBeInTheDocument();
    // Twice, never a third time: once per job is the whole rule.
    expect(mocks.openSession).toHaveBeenCalledTimes(2);
  });

  it("gives a second document its own silent retry", async () => {
    mocks.openSession.mockImplementation(hangsAt("loading-engine"));
    render(<ToolClient />);
    await chooseFile(pdfFile("first.pdf"));
    await screen.findByTestId("progress");
    await fireEngineLost();

    await chooseFile(pdfFile("second.pdf"));
    await vi.waitFor(() => expect(mocks.openSession).toHaveBeenCalledTimes(3));
    await fireEngineLost();

    // Once per job, not once per tab: a fresh job starts with its retry unspent.
    expect(screen.queryByTestId("lost")).not.toBeInTheDocument();
    expect(mocks.openSession).toHaveBeenCalledTimes(4);
  });

  it("reports a loss after the engine loaded, even on a job that never retried", async () => {
    mocks.openSession.mockImplementation(hangsAt("inspecting"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    await fireEngineLost();

    // Past the load window, so this is a real session dying: report it.
    expect(await screen.findByTestId("lost")).toBeInTheDocument();
    expect(mocks.openSession).toHaveBeenCalledTimes(1);
  });
});

/**
 * Spec 0003, AC-12. The polite region holds what is worth hearing as it
 * changes, and a failure is an alert of its own beside it. An alert inside a
 * polite region is announced twice, once for each, which is the bug this pins.
 */
describe("the live regions (spec 0003, AC-12)", () => {
  const POLITE = '[aria-live="polite"]';

  function politeRegions(container: HTMLElement): NodeListOf<Element> {
    return container.querySelectorAll(POLITE);
  }

  function alertsInsidePolite(container: HTMLElement): NodeListOf<Element> {
    return container.querySelectorAll(
      `${POLITE} [role="alert"], ${POLITE}[role="alert"]`,
    );
  }

  it("keeps a failure beside the polite region, not inside it", async () => {
    mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
    const { container } = render(<ToolClient />);

    await chooseFile(pdfFile());
    await screen.findByTestId("error");

    expect(politeRegions(container)).toHaveLength(1);
    expect(alertsInsidePolite(container)).toHaveLength(0);
  });

  it("keeps the lost worker message beside it too", async () => {
    mocks.openSession.mockImplementation(hangsAt("opening"));
    const { container } = render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    await fireEngineLost();
    await screen.findByTestId("lost");

    expect(politeRegions(container)).toHaveLength(1);
    expect(alertsInsidePolite(container)).toHaveLength(0);
  });

  /**
   * No polite region here at all, because there is nothing to report progress
   * on in a browser that cannot open a document. What matters is that the one
   * alert is never nested inside one.
   */
  it("announces the unsupported explanation once, as an alert", () => {
    mocks.getSupport.mockReturnValue(
      Object.freeze({ supported: false, missing: ["webassembly"] }) as SupportReport,
    );
    const { container } = render(<ToolClient />);

    expect(politeRegions(container).length).toBeLessThanOrEqual(1);
    expect(alertsInsidePolite(container)).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/cannot run in this browser/i);
  });

  it("holds the phase text while a document opens", async () => {
    mocks.openSession.mockImplementation(hangsAt("inspecting"));
    const { container } = render(<ToolClient />);

    await chooseFile(pdfFile());
    const progress = await screen.findByTestId("progress");

    expect(container.querySelector(POLITE)).toContainElement(progress);
    expect(progress).toHaveTextContent("Reading each page…");
  });

  it("holds the opened document card", async () => {
    const { container } = render(<ToolClient />);

    await chooseFile(pdfFile());
    const allClear = await screen.findByTestId("all-clear");

    expect(container.querySelector(POLITE)).toContainElement(allClear);
    expect(screen.getByRole("region", { name: "Document opened" })).toContainElement(
      allClear,
    );
  });
});

describe("browsers that cannot run it", () => {
  it("explains the gap instead of showing a drop area it cannot honour", () => {
    mocks.getSupport.mockReturnValue(
      Object.freeze({ supported: false, missing: ["web-workers"] }) as SupportReport,
    );

    render(<ToolClient />);

    expect(screen.getByRole("alert")).toHaveTextContent("Web Workers are unavailable.");
    expect(screen.queryByTestId("drop-area")).not.toBeInTheDocument();
  });

  it("asks for no plan, because no file can be opened here", () => {
    mocks.getSupport.mockReturnValue(
      Object.freeze({ supported: false, missing: ["web-workers"] }) as SupportReport,
    );

    render(<ToolClient />);

    expect(mocks.askAtLoad).not.toHaveBeenCalled();
  });
});

/**
 * Spec 0012, AC-4: the plan is asked for once as the page loads, after the load
 * guard and the support check pass, so the answer is in before a file is
 * chosen. Warming the drop zone no longer asks.
 */
describe("asking which plan applies (spec 0012, AC-4)", () => {
  it("asks once as the page loads", () => {
    render(<ToolClient />);

    expect(mocks.askAtLoad).toHaveBeenCalledOnce();
  });

  it("does not ask again when the drop zone is warmed", async () => {
    const user = userEvent.setup();
    render(<ToolClient />);
    mocks.askAtLoad.mockClear();

    await user.hover(screen.getByTestId("drop-area"));
    await user.tab();

    expect(mocks.warmEngine).toHaveBeenCalled();
    expect(mocks.askAtLoad).not.toHaveBeenCalled();
    expect(mocks.askWhenVisible).not.toHaveBeenCalled();
  });

  /** Whether to ask is the module's rule (never a Pro page); the page only reports the return. */
  it("reports the tab coming back, and only that", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get");
    const { unmount } = render(<ToolClient />);

    visibility.mockReturnValue("hidden");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.askWhenVisible).not.toHaveBeenCalled();

    visibility.mockReturnValue("visible");
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.askWhenVisible).toHaveBeenCalledOnce();

    unmount();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(mocks.askWhenVisible).toHaveBeenCalledOnce();
    visibility.mockRestore();
  });
});

/**
 * Spec 0012, AC-5 and AC-6: the plan line and the helper read the page's
 * answer, and a free cap's callout reads the job's frozen snapshot, by
 * account. Billing is on here unless a test says otherwise.
 */
describe("the plan, said out loud (spec 0012, AC-5 and AC-6)", () => {
  const answer = (
    account: EntitlementSnapshot["account"],
    tier: EntitlementSnapshot["tier"] = "free",
  ): EntitlementSnapshot =>
    Object.freeze({ ...(tier === "paid" ? PAID : FREE), tier, account });

  type Link = readonly [label: string, href: string];

  /** A link's accessible name says it opens a new tab, and it does. */
  function expectNewTabLink(scope: HTMLElement, label: string, href: string) {
    const link = within(scope).getByRole("link", {
      name: `${label} (opens in a new tab)`,
    });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  }

  beforeEach(() => {
    mocks.billingEnabled = true;
  });

  describe("the helper and the plan line (AC-5)", () => {
    it("says it is checking until the first answer, then names the cap and the plan", () => {
      render(<ToolClient />);

      expect(screen.getByTestId("drop-area")).toHaveTextContent("Checking your plan");
      expect(screen.getByRole("status")).toBeEmptyDOMElement();

      answerWith(answer("none"));
      expect(screen.getByTestId("drop-area")).toHaveTextContent("Up to 3 pages on Free");

      answerWith(answer("signed-in", "paid"));
      expect(screen.getByTestId("drop-area")).toHaveTextContent("Up to 50 pages on Pro");
    });

    it.each([
      [
        "anonymous",
        answer("none"),
        "Sign in (opens in a new tab), or see what Pro adds (opens in a new tab).",
        [
          ["Sign in", "/sign-in"],
          ["see what Pro adds", "/pricing"],
        ] as Link[],
      ],
      [
        "signed in on Free",
        answer("signed-in"),
        "Get Pro (opens in a new tab) for up to 50 pages a document.",
        [["Get Pro", "/pricing"]] as Link[],
      ],
      [
        "signed in with Pro",
        answer("signed-in", "paid"),
        "Signed in with Pro.",
        [] as Link[],
      ],
      [
        "signed in, but the sign in has expired",
        answer("sign-in-needed"),
        "Your sign in has expired, so the free limit applies. Sign in again (opens in a new tab) to use Pro.",
        [["Sign in again", "/sign-in"]] as Link[],
      ],
    ])("shows the next step when %s", async (_label, page, words, links) => {
      const { container } = render(<ToolClient />);
      answerWith(page);

      const line = screen.getByRole("status");
      expect(line).toHaveTextContent(words);
      for (const [label, href] of links) expectNewTabLink(line, label, href);
      expect(within(line).queryAllByRole("link")).toHaveLength(links.length);
      expect(screen.queryByTestId("plan-try-again")).not.toBeInTheDocument();
      await expectNoAxeViolations(container);
    });

    it("says the plan could not be checked, and offers to try again", async () => {
      const { container } = render(<ToolClient />);
      answerWith(answer("unknown"));

      expect(screen.getByRole("status")).toHaveTextContent(
        "We couldn't check your plan, so the free limit applies for now.",
      );
      expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
      await expectNoAxeViolations(container);
    });

    it("asks fresh on Try again, says so, and keeps focus there if the answer is the same", async () => {
      let settle: (value: EntitlementSnapshot) => void = () => {};
      mocks.askAgain.mockReturnValue(
        new Promise<EntitlementSnapshot>((resolve) => {
          settle = resolve;
        }),
      );
      const user = userEvent.setup();
      render(<ToolClient />);
      answerWith(answer("unknown"));

      await user.click(screen.getByRole("button", { name: "Try again" }));
      expect(mocks.askAgain).toHaveBeenCalledOnce();
      expect(screen.getByRole("status")).toHaveTextContent("Checking your plan…");

      await act(async () => settle(answer("unknown")));
      expect(screen.getByRole("status")).toHaveTextContent(
        "We couldn't check your plan, so the free limit applies for now.",
      );
      expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus();
    });

    it("moves focus to the plan line when Try again brings an answer, never to the page", async () => {
      mocks.askAgain.mockImplementation(async () => {
        mocks.answer = answer("signed-in", "paid");
        for (const listener of mocks.answerListeners) listener();
        return mocks.answer;
      });
      const user = userEvent.setup();
      render(<ToolClient />);
      answerWith(answer("unknown"));

      await user.click(screen.getByRole("button", { name: "Try again" }));

      expect(screen.queryByTestId("plan-try-again")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Signed in with Pro.");
      expect(screen.getByRole("status")).toHaveFocus();
    });

    /**
     * Spec 0013, AC-15 and AC-16, as spec 0012 AC-5 is amended: the plan card
     * sits in the rail, after the full drop zone, and after the document card
     * once a file opens.
     */
    it("follows the drop zone, and the document card once a file opens", async () => {
      render(<ToolClient />);
      answerWith(answer("none"));

      const follows = (element: HTMLElement) =>
        Boolean(
          element.compareDocumentPosition(screen.getByRole("status")) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      expect(follows(screen.getByTestId("drop-area"))).toBe(true);

      await chooseFile(pdfFile());
      await screen.findByTestId("page-count");
      expect(follows(screen.getByTestId("file-bar"))).toBe(true);
      expect(follows(screen.getByRole("region", { name: "Document opened" }))).toBe(true);
    });

    /**
     * Spec 0013, AC-18. Its own markup in an `info-bg` box, not a callout, so
     * nothing but the plan's words is announced, with its links in
     * `accent-strong`. Hidden, never drawn empty, until the first answer.
     */
    it("is a box of its own words, with no icon and no hidden tone word", () => {
      render(<ToolClient />);
      const card = screen.getByTestId("plan-card");
      expect(card).toHaveClass("sr-only");

      answerWith(answer("none"));

      expect(card).not.toHaveClass("sr-only");
      expect(card).toHaveClass(
        "rounded-xl",
        "border",
        "border-info-border",
        "bg-info-bg",
        "p-5",
      );
      expect(card.querySelector("svg")).toBeNull();
      expect(card.querySelector(".sr-only:not(a .sr-only)")).toBeNull();
      expect(card.textContent).toBe(
        "Sign in (opens in a new tab), or see what Pro adds (opens in a new tab).",
      );
      for (const link of within(card).getAllByRole("link")) {
        expect(link).toHaveClass("text-accent-strong");
      }
    });

    it("shows no plan line with billing off, and names the free cap with no plan", () => {
      mocks.billingEnabled = false;
      render(<ToolClient />);
      answerWith(answer("none"));

      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(screen.getByTestId("drop-area")).toHaveTextContent("Up to 3 pages");
      expect(screen.getByTestId("drop-area")).not.toHaveTextContent("Free");
    });
  });

  describe("a free cap (AC-6)", () => {
    /** Choose a file under `snapshot` and have the engine refuse it for its pages. */
    async function capped(snapshot: EntitlementSnapshot, file = pdfFile()) {
      mocks.getEntitlement.mockResolvedValue(snapshot);
      mocks.openSession.mockRejectedValue(new EngineError("too-many-pages"));
      const view = render(<ToolClient />);
      await chooseFile(file);
      return { ...view, error: await screen.findByRole("alert") };
    }

    it.each([
      [
        "anonymous",
        "none",
        "Sign in and get Pro, then open it again here.",
        ["Get Pro", "/pricing"],
      ],
      [
        "signed in on Free",
        "signed-in",
        "Get Pro, then open it again here.",
        ["Get Pro", "/pricing"],
      ],
      [
        "signed in, but the sign in has expired",
        "sign-in-needed",
        "Sign in again to use Pro, then open it again here.",
        ["Sign in again", "/sign-in"],
      ],
      [
        "unchecked",
        "unknown",
        "We couldn't check your plan. Check it, then open it again.",
        null,
      ],
    ] as const)(
      "points a visitor %s to Pro, never to splitting the file",
      async (_label, account, next, link) => {
        const { container, error } = await capped(answer(account));

        expect(
          within(error).getByRole("heading", {
            level: 2,
            name: "This PDF has more than 3 pages",
          }),
        ).toBeInTheDocument();
        expect(error).toHaveTextContent(
          "The free plan handles up to 3 pages. Pro handles up to 50.",
        );
        expect(error).toHaveTextContent(next);
        expect(error).not.toHaveTextContent("Split");
        if (link === null)
          expect(within(error).queryByRole("link")).not.toBeInTheDocument();
        else expectNewTabLink(error, link[0], link[1]);
        expect(
          within(error).getByRole("button", { name: "Check my plan and open it again" }),
        ).toBeInTheDocument();
        await expectNoAxeViolations(container);
      },
    );

    it("asks fresh and opens the same file again under the new answer, with no file picker", async () => {
      const file = pdfFile("long.pdf");
      const reads = vi.spyOn(file, "arrayBuffer");
      const user = userEvent.setup();
      const { error } = await capped(answer("none"), file);
      const picker = vi.spyOn(HTMLInputElement.prototype, "click");

      mocks.getEntitlement.mockResolvedValue(PAID);
      mocks.openSession.mockResolvedValue(openedSession("again"));
      await user.click(
        within(error).getByRole("button", { name: "Check my plan and open it again" }),
      );

      await screen.findByTestId("page-count");
      expect(mocks.getEntitlement).toHaveBeenLastCalledWith(
        expect.objectContaining({ fresh: true }),
      );
      expect(lastLimits()).toEqual({
        maxBytes: PAID.maxFileBytes,
        maxPages: PAID.pageCap,
      });
      expect(reads).toHaveBeenCalledTimes(2);
      expect(screen.getByTestId("file-bar")).toHaveTextContent("long.pdf");
      expect(picker).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("shows the callout again in the new answer's words when the cap still applies", async () => {
      const user = userEvent.setup();
      const { error } = await capped(answer("none"));

      mocks.getEntitlement.mockResolvedValue(answer("signed-in"));
      await user.click(
        within(error).getByRole("button", { name: "Check my plan and open it again" }),
      );

      await vi.waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent(
          "Get Pro, then open it again here.",
        ),
      );
      expect(screen.getByRole("alert")).not.toHaveTextContent("Sign in and get Pro");
      expect(mocks.openSession).toHaveBeenCalledTimes(2);
      // A new failure, so focus moves to its heading (spec 0007, AC-20).
      expect(
        screen.getByRole("heading", { level: 2, name: "This PDF has more than 3 pages" }),
      ).toHaveFocus();
    });

    it("fails with the file unreadable when the file changed on disk since it was chosen", async () => {
      const file = pdfFile("moved.pdf");
      const original = file.arrayBuffer.bind(file);
      let reads = 0;
      Object.defineProperty(file, "arrayBuffer", {
        value: () => {
          reads += 1;
          return reads === 1
            ? original()
            : Promise.reject(new DOMException("NotReadableError"));
        },
      });
      const user = userEvent.setup();
      const { error } = await capped(answer("none"), file);

      mocks.getEntitlement.mockResolvedValue(PAID);
      await user.click(
        within(error).getByRole("button", { name: "Check my plan and open it again" }),
      );

      await vi.waitFor(() =>
        expect(screen.getByRole("alert")).toHaveTextContent("The file couldn't be read"),
      );
      expect(mocks.openSession).toHaveBeenCalledTimes(1);
    });

    it("keeps the split advice and offers no plan for a paid job", async () => {
      const { error } = await capped(PAID);

      expect(error).toHaveTextContent("RedactNest handles up to 50 pages.");
      expect(error).toHaveTextContent("Split it into parts of 50 pages or fewer");
      expect(within(error).queryByRole("link")).not.toBeInTheDocument();
      expect(within(error).queryByRole("button")).not.toBeInTheDocument();
    });

    it("keeps today's words and offers no plan with billing off, where no Pro exists", async () => {
      mocks.billingEnabled = false;
      const { error } = await capped(answer("none"));

      expect(error).toHaveTextContent("The free limit is 3 pages.");
      expect(error).toHaveTextContent("Split it into parts of 3 pages or fewer");
      expect(within(error).queryByRole("button")).not.toBeInTheDocument();
    });
  });
});

describe("a document not loaded at /tool (spec 0003, AC-21)", () => {
  /** What a client side navigation from the landing page would leave behind. */
  function arrivedFromHome() {
    mocks.loadedAt.mockReturnValue("/");
  }

  it("takes no file, says it is loading, and reloads", async () => {
    arrivedFromHome();
    render(<ToolClient />);

    expect(screen.queryByTestId("file-input")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /choose a pdf/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("progress").closest("[aria-live]")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    expect(screen.getByTestId("progress")).toHaveTextContent("Loading the tool");
    expect(mocks.reloadDocument).toHaveBeenCalledOnce();
  });

  it("warms nothing, because no file can arrive in this document", async () => {
    arrivedFromHome();
    const user = userEvent.setup();
    render(<ToolClient />);

    // Everything a visitor could do to warm the drop zone, with none there.
    await user.tab();
    await user.hover(screen.getByTestId("progress"));

    expect(mocks.warmEngine).not.toHaveBeenCalled();
    expect(mocks.askAtLoad).not.toHaveBeenCalled();
  });

  it("runs before the support check, so nothing here is trusted first", () => {
    arrivedFromHome();
    mocks.getSupport.mockReturnValue(
      Object.freeze({ supported: false, missing: ["webassembly"] }),
    );
    render(<ToolClient />);

    expect(screen.queryByTestId("unsupported")).not.toBeInTheDocument();
    expect(screen.getByTestId("progress")).toHaveTextContent("Loading the tool");
    expect(mocks.reloadDocument).toHaveBeenCalledOnce();
  });

  it("offers the drop zone as usual in a document loaded at /tool", () => {
    render(<ToolClient />);

    expect(screen.getByTestId("file-input")).toBeInTheDocument();
    expect(mocks.reloadDocument).not.toHaveBeenCalled();
  });

  it("works as it always has when the browser does not say", () => {
    mocks.loadedAt.mockReturnValue(null);
    render(<ToolClient />);

    expect(screen.getByTestId("file-input")).toBeInTheDocument();
    expect(mocks.reloadDocument).not.toHaveBeenCalled();
  });
});

describe("the tool rendered at the wrong address (spec 0003, INV-11)", () => {
  /** A document loaded at `/` that still reads `/`: a reload would load it again. */
  function renderedAtHome() {
    mocks.loadedAt.mockReturnValue("/");
    mocks.currentPath.mockReturnValue("/");
  }

  it("never reloads, because the reload would come back here forever", () => {
    renderedAtHome();
    render(<ToolClient />);

    expect(mocks.reloadDocument).not.toHaveBeenCalled();
    expect(screen.queryByTestId("file-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("progress")).not.toBeInTheDocument();
  });

  it("warms nothing and asks for no entitlement", async () => {
    renderedAtHome();
    const user = userEvent.setup();
    render(<ToolClient />);

    await user.tab();
    await user.hover(screen.getByTestId("wrong-url"));

    expect(mocks.warmEngine).not.toHaveBeenCalled();
    expect(mocks.askAtLoad).not.toHaveBeenCalled();
  });

  it("says so, and offers a real page load into the tool", async () => {
    renderedAtHome();
    render(<ToolClient />);

    expect(
      screen.getByRole("heading", { level: 2, name: "This page cannot open a document" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("wrong-url")).toHaveTextContent(
      "The tool only works at its own address.",
    );

    const link = screen.getByRole("link", { name: "Open the tool" });
    expect(link).toHaveAttribute("href", "/tool");

    // `next/link` takes a navigation over by preventing the click's default, so
    // a click nothing prevented by the time it reaches `window` is a real page
    // load. Prevented there, after reading, because jsdom cannot navigate.
    let untouched = false;
    const observe = (event: MouseEvent) => {
      untouched = !event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener("click", observe);
    try {
      await userEvent.setup().click(link);
    } finally {
      window.removeEventListener("click", observe);
    }
    expect(untouched).toBe(true);
  });

  it("is not announced, because nothing the visitor did caused it", () => {
    renderedAtHome();
    render(<ToolClient />);

    expect(screen.getByTestId("wrong-url")).not.toHaveAttribute("role");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("runs before the support check too", () => {
    renderedAtHome();
    mocks.getSupport.mockReturnValue(
      Object.freeze({ supported: false, missing: ["webassembly"] }),
    );
    render(<ToolClient />);

    expect(screen.queryByTestId("unsupported")).not.toBeInTheDocument();
    expect(screen.getByTestId("wrong-url")).toBeInTheDocument();
    expect(mocks.reloadDocument).not.toHaveBeenCalled();
  });
});

/**
 * Spec 0004, AC-19 and AC-20. The thin working path: Redact, Cancel, the one
 * line outcome and Download.
 *
 * The output the page holds between a run and Download lives in a ref, which
 * nothing outside the component can see. So "dropped" is asserted through what
 * it would change: a Download that hands nothing over, or no Download at all.
 */
describe("the redaction path (spec 0004)", () => {
  const MATCHES: readonly ReviewMatch[] = Object.freeze([
    {
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
    },
    {
      id: asMatchId("m2"),
      type: "phone",
      page: 1,
      text: "020 7946 0958",
      before: "or ",
      after: ".",
      beforeCut: true,
      afterCut: true,
      tickedByDefault: false,
      blocked: null,
      concealed: null,
    },
  ]);

  const OUTCOME: RedactionOutcome = Object.freeze<RedactionOutcome>({
    pageCount: 2,
    removedByType: { email: 2, phone: 1 },
    pagesByFinding: { blank: 1 },
    sanitized: ["document-info", "xmp-metadata", "annotations"],
  });

  /** A session whose redaction the test settles when it chooses. */
  function sessionWithRun(matches: readonly ReviewMatch[] = []) {
    let resolve!: (value: RedactedOutput) => void;
    let reject!: (error: unknown) => void;
    const session: OpenedSession = {
      ...openedSession(),
      matches,
      redact: vi.fn(
        () =>
          new Promise<RedactedOutput>((settleWith, failWith) => {
            resolve = settleWith;
            reject = failWith;
          }),
      ),
      cancel: vi.fn(() => reject(new OperationCancelled())),
    };
    return {
      session,
      finish: async (output = new ArrayBuffer(16), outcome = OUTCOME) => {
        await act(async () => resolve({ output, outcome }));
      },
      fail: async (error: unknown) => {
        await act(async () => reject(error));
      },
    };
  }

  async function openAndRedact(run: ReturnType<typeof sessionWithRun>): Promise<void> {
    mocks.openSession.mockResolvedValue(run.session);
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await userEvent.setup().click(await screen.findByTestId("redact"));
  }

  it("offers Redact once the document is open, and nothing before", async () => {
    mocks.openSession.mockImplementation(hangsAt("inspecting"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("progress");

    expect(screen.queryByTestId("redact")).not.toBeInTheDocument();
  });

  it("runs over the current ticks, by id and nothing else", async () => {
    const run = sessionWithRun(MATCHES);
    await openAndRedact(run);

    // The detector's own recommendation seeds the ticks: m1 is, m2 is not.
    expect(run.session.redact).toHaveBeenCalledWith(
      [asMatchId("m1")],
      expect.any(Object),
    );
  });

  it("swaps Redact for Cancel and shows the phase while a run is under way", async () => {
    const run = sessionWithRun();
    mocks.openSession.mockResolvedValue(run.session);
    run.session.redact = vi.fn(
      (_ids, options?: { onProgress?: (phase: ProgressPhase) => void }) => {
        options?.onProgress?.("verifying");
        return new Promise<RedactedOutput>(() => {});
      },
    );
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await userEvent.setup().click(await screen.findByTestId("redact"));

    expect(screen.queryByTestId("redact")).not.toBeInTheDocument();
    expect(screen.getByTestId("cancel")).toBeInTheDocument();
    expect(screen.getByTestId("progress")).toHaveTextContent(
      "Checking every page of your clean file…",
    );
  });

  it("shows what was removed, left and stripped, and a Download button, when the run completes", async () => {
    const run = sessionWithRun(MATCHES);
    await openAndRedact(run);
    await run.finish();

    const outcome = screen.getByTestId("outcome");
    expect(outcome.tagName).toBe("DL");
    const terms = [...outcome.querySelectorAll("dt")].map((term) => term.textContent);
    const descriptions = [...outcome.querySelectorAll("dd")].map((d) => d.textContent);
    expect(terms).toEqual(["Removed", "Left in the file", "Also stripped"]);
    expect(descriptions).toEqual([
      "2 email addresses and 1 phone number",
      "1 phone number you left unticked.",
      "Document info, XMP metadata and annotations",
    ]);
    expect(screen.getByTestId("download")).toBeInTheDocument();
    expect(screen.queryByTestId("cancel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("action-panel")).not.toBeInTheDocument();
  });

  it.each([
    [
      { ...OUTCOME, removedByType: {}, sanitized: [] },
      ["Nothing", "Nothing RedactNest found.", "Nothing else needed stripping."],
    ],
    [
      { ...OUTCOME, removedByType: { email: 1 }, sanitized: ["bookmarks"] },
      ["1 email address", "Nothing RedactNest found.", "Bookmarks"],
    ],
    [
      {
        ...OUTCOME,
        removedByType: {},
        sanitized: ["javascript", "page-thumbnails", "accessibility-tags"],
      },
      [
        "Nothing",
        "Nothing RedactNest found.",
        "JavaScript, page thumbnails and accessibility tags (screen readers will read the clean file less well)",
      ],
    ],
  ] as const)("words the outcome plainly: %j", async (outcome, expected) => {
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish(new ArrayBuffer(8), outcome as RedactionOutcome);

    const descriptions = [...screen.getByTestId("outcome").querySelectorAll("dd")].map(
      (description) => description.textContent,
    );
    expect(descriptions).toEqual(expected);
  });

  it("hands the output over under the output name, then takes Download away", async () => {
    const output = new ArrayBuffer(32);
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish(output);

    await userEvent.setup().click(screen.getByTestId("download"));

    expect(mocks.offerDownload).toHaveBeenCalledTimes(1);
    // The engine reported three items removed, so the file is named as a
    // redaction (spec 0007, AC-12).
    expect(mocks.offerDownload).toHaveBeenCalledWith(output, "report-redacted.pdf");
    expect(screen.queryByTestId("download")).not.toBeInTheDocument();
    // Still complete, so the outcome stays and the document stays open.
    expect(screen.getByTestId("outcome")).toBeInTheDocument();
    expect(run.session.release).not.toHaveBeenCalled();
    expect(mocks.releaseEngine).not.toHaveBeenCalled();
  });

  it("goes back to Redact, with no Download, when the run is cancelled", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);

    await userEvent.setup().click(screen.getByTestId("cancel"));

    expect(run.session.cancel).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("redact")).toBeInTheDocument();
    expect(screen.queryByTestId("download")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    ["not-pdf", "This isn't a PDF"],
    ["hidden-layers", "layers a viewer can switch on and off"],
  ] as const)(
    "says what %s means when a document is refused at open",
    async (kind, words) => {
      mocks.openSession.mockRejectedValue(new EngineError(kind));
      render(<ToolClient />);
      await chooseFile(pdfFile());

      expect(await screen.findByRole("alert")).toHaveTextContent(words);
    },
  );

  /**
   * Spec 0004, AC-25 and AC-28, in the words spec 0007 wrote for them. Each
   * refusal returns to the checklist (spec 0007, AC-14) and says no file was
   * made (INV-5).
   */
  it.each([
    ["redaction-incomplete", "RedactNest couldn't vouch for the clean file"],
    ["redaction-overreach", "Removing what you ticked would remove more"],
    ["replacement-text", "A ticked item can't be removed safely"],
    ["slanted-text", "A ticked item is set at too steep an angle"],
  ] as const)(
    "says what %s means after a run, and offers no file",
    async (kind, title) => {
      const run = sessionWithRun();
      await openAndRedact(run);
      await run.fail(new EngineError(kind));

      const alert = screen.getByRole("alert");
      expect(within(alert).getByRole("heading", { level: 2, name: title })).toBeVisible();
      expect(alert).toHaveTextContent(/made no file|no file was made/);
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("outcome")).not.toBeInTheDocument();
    },
  );

  it("drops a reply that arrives after starting over", async () => {
    // A run in flight is unsaved work, so Start over asks first.
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const run = sessionWithRun();
    await openAndRedact(run);

    await userEvent.setup().click(screen.getByTestId("start-over"));
    expect(confirm).toHaveBeenCalledTimes(1);
    await run.finish();

    expect(screen.queryByTestId("outcome")).not.toBeInTheDocument();
    expect(screen.queryByTestId("download")).not.toBeInTheDocument();
    expect(screen.getByTestId("drop-area")).toBeInTheDocument();
  });

  it("drops a reply that arrives after a different file replaced the document", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const run = sessionWithRun();
    await openAndRedact(run);

    mocks.openSession.mockImplementation(hangsAt("opening"));
    await chooseFile(pdfFile("second.pdf"));
    await run.finish();

    expect(screen.queryByTestId("outcome")).not.toBeInTheDocument();
    expect(screen.queryByTestId("download")).not.toBeInTheDocument();
  });

  it("offers no Download once the worker is lost", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish();

    await fireEngineLost();

    expect(screen.queryByTestId("download")).not.toBeInTheDocument();
    expect(screen.getByTestId("lost")).toBeInTheDocument();
  });

  it("hands nothing over once the page has been left", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish();

    await firePageHide();
    await userEvent.setup().click(screen.getByTestId("download"));

    expect(mocks.offerDownload).not.toHaveBeenCalled();
  });

  /**
   * Spec 0002's two halves that were owed until now. A finished run nobody has
   * downloaded is unsaved work, so leaving warns and replacing asks.
   */
  it("warns on the way out while a finished file has not been downloaded", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish();

    expect(wouldWarnOnLeave()).toBe(true);

    await userEvent.setup().click(screen.getByTestId("download"));

    expect(wouldWarnOnLeave()).toBe(false);
  });

  it("asks before replacing a finished file nobody has downloaded", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish();

    await chooseFile(pdfFile("second.pdf"));

    expect(confirm).toHaveBeenCalledTimes(1);
    // Declined, so the finished file is still on offer.
    expect(screen.getByTestId("download")).toBeInTheDocument();
  });

  /** Spec 0003's bar, held by the new steps too. */
  it("has no accessibility violations while reviewing, running or complete", async () => {
    const run = sessionWithRun();
    mocks.openSession.mockResolvedValue(run.session);
    const { container } = render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("redact");
    await expectNoAxeViolations(container);

    await userEvent.setup().click(screen.getByTestId("redact"));
    await expectNoAxeViolations(container);

    await run.finish();
    await expectNoAxeViolations(container);
  });

  it("warns on the way out while a run is under way", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);

    expect(wouldWarnOnLeave()).toBe(true);
  });
});

/**
 * Spec 0005, AC-13 and AC-14, and the spec 0002 edges a changed tick makes
 * reachable at last: the replace confirm (its AC-1), the leave warning (its
 * AC-13) and the tick and run again from `complete` (its AC-14).
 */
describe("the checklist (spec 0005)", () => {
  const EMAIL = asMatchId("m-email");
  const PHONE = asMatchId("m-phone");
  const BLOCKED = asMatchId("m-blocked");

  const MATCHES: readonly ReviewMatch[] = Object.freeze([
    {
      id: EMAIL,
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
    },
    {
      id: PHONE,
      type: "phone",
      page: 1,
      text: "(212) 123 4567",
      before: "Old number ",
      after: " retired",
      beforeCut: true,
      afterCut: true,
      tickedByDefault: false,
      blocked: null,
      concealed: null,
    },
    {
      id: BLOCKED,
      type: "email",
      page: 2,
      text: "slanted@example.com",
      before: "Write to ",
      after: "",
      beforeCut: true,
      afterCut: true,
      tickedByDefault: false,
      blocked: "slanted-text",
      concealed: null,
    },
  ]);

  function withMatches(matches: readonly ReviewMatch[] = MATCHES): OpenedSession {
    return {
      ...openedSession(),
      matches,
      redact: vi.fn(() => new Promise<RedactedOutput>(() => {})),
    };
  }

  async function openWith(session: OpenedSession) {
    mocks.openSession.mockResolvedValue(session);
    const rendered = render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("review");
    return rendered;
  }

  it("lists what was found once the document is open, with the coverage note above", async () => {
    await openWith(withMatches());

    expect(screen.getByTestId("coverage")).toHaveTextContent(
      "RedactNest looked for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers.",
    );
    expect(screen.getByRole("checkbox", { name: "jane@example.com" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "(212) 123 4567" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "slanted@example.com" })).toBeDisabled();
  });

  it("sits outside the polite live region", async () => {
    const { container } = await openWith(withMatches());

    const region = container.querySelector('[aria-live="polite"]');
    expect(region?.contains(screen.getByTestId("review"))).toBe(false);
  });

  it("shows the empty state when nothing was found", async () => {
    await openWith(withMatches([]));

    expect(screen.getByText("Nothing found to remove")).toBeVisible();
    expect(screen.getByTestId("redact")).toBeInTheDocument();
  });

  it("runs Redact over the ticks as the visitor left them", async () => {
    const session = withMatches();
    await openWith(session);
    const user = userEvent.setup();

    await user.click(screen.getByRole("checkbox", { name: "jane@example.com" }));
    await user.click(screen.getByRole("checkbox", { name: "(212) 123 4567" }));
    await user.click(screen.getByTestId("redact"));

    expect(session.redact).toHaveBeenCalledWith([PHONE], expect.any(Object));
  });

  it("never lets a blocked match into a run", async () => {
    const session = withMatches();
    await openWith(session);
    const user = userEvent.setup();

    await user.click(screen.getByText(/too steep an angle/));
    await user.click(screen.getByTestId("redact"));

    expect(session.redact).toHaveBeenCalledWith([EMAIL], expect.any(Object));
  });

  it("disables every checkbox while a run is under way", async () => {
    await openWith(withMatches());

    await userEvent.setup().click(screen.getByTestId("redact"));

    for (const box of screen.getAllByRole("checkbox")) expect(box).toBeDisabled();
  });

  it("warns on the way out once a tick has changed, and not before (spec 0002, AC-13)", async () => {
    await openWith(withMatches());
    expect(wouldWarnOnLeave()).toBe(false);

    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "(212) 123 4567" }));

    expect(wouldWarnOnLeave()).toBe(true);
  });

  it("asks before a second file replaces changed ticks, and keeps them on no (spec 0002, AC-1)", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openWith(withMatches());
    await userEvent
      .setup()
      .click(screen.getByRole("checkbox", { name: "(212) 123 4567" }));

    await chooseFile(pdfFile("second.pdf"));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mocks.openSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("checkbox", { name: "(212) 123 4567" })).toBeChecked();
  });

  it("goes back to Redact from complete when a tick changes (spec 0002, AC-14)", async () => {
    const run = {
      finish: undefined as undefined | (() => void),
    };
    const session: OpenedSession = {
      ...withMatches(),
      redact: vi.fn(
        () =>
          new Promise<RedactedOutput>((resolve) => {
            run.finish = () =>
              resolve({
                output: new ArrayBuffer(8),
                outcome: {
                  pageCount: 2,
                  removedByType: { email: 1 },
                  pagesByFinding: { blank: 1 },
                  sanitized: [],
                },
              });
          }),
      ),
    };
    await openWith(session);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("redact"));
    await act(async () => run.finish?.());
    await screen.findByTestId("download");

    await user.click(screen.getByRole("checkbox", { name: "(212) 123 4567" }));

    expect(screen.queryByTestId("download")).not.toBeInTheDocument();
    await user.click(screen.getByTestId("redact"));
    expect(session.redact).toHaveBeenLastCalledWith([EMAIL, PHONE], expect.any(Object));
  });

  it("has no accessibility violations with groups and a blocked row", async () => {
    const { container } = await openWith(withMatches());

    await expectNoAxeViolations(container);
  });
});

/**
 * Spec 0006, slice 1. What the page readings say on screen: the all clear line
 * or the warning at open, the warning again above Download, the partly
 * redacted name, and the two refusal lines.
 */
describe("the page readings (spec 0006)", () => {
  /** Page 1 typed, page 2 a scan, page 3 blank, page 4 drawn only. */
  const FLAGGED: DocumentSummary = Object.freeze({
    pageCount: 4,
    pages: Object.freeze([
      Object.freeze({ findings: [] }),
      Object.freeze({ findings: ["scanned"] }),
      Object.freeze({ findings: ["blank"] }),
      Object.freeze({ findings: ["drawn-only"] }),
    ]) as DocumentSummary["pages"],
  });

  // Removed something: a run that removed nothing is a cleaned copy, whatever
  // the pages hold (spec 0007, AC-12), and these cases are about the other two
  // names.
  const OUTCOME: RedactionOutcome = Object.freeze<RedactionOutcome>({
    pageCount: 4,
    removedByType: { email: 1 },
    pagesByFinding: { scanned: 1, "drawn-only": 1, blank: 1 },
    sanitized: [],
  });

  function flagged(summary: DocumentSummary = FLAGGED) {
    let finish!: () => void;
    const session: OpenedSession = {
      ...openedSession(),
      summary,
      redact: vi.fn(
        () =>
          new Promise<RedactedOutput>((resolve) => {
            finish = () => resolve({ output: new ArrayBuffer(8), outcome: OUTCOME });
          }),
      ),
    };
    return { session, finish: () => act(async () => finish()) };
  }

  async function openWith(session: OpenedSession) {
    mocks.openSession.mockResolvedValue(session);
    const rendered = render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("review");
    return rendered;
  }

  it("says every page can be read when no page carries a warning (AC-19)", async () => {
    await openWith(openedSession());

    expect(screen.getByTestId("all-clear")).toHaveTextContent(
      "RedactNest can read the text on every page.",
    );
    expect(screen.queryByTestId("page-warnings")).not.toBeInTheDocument();
    expect(screen.queryByTestId("text-layer-count")).not.toBeInTheDocument();
  });

  it("names each warned page in the opened document card, with the advice (AC-20)", async () => {
    const { container } = await openWith(flagged().session);

    const warning = screen.getByTestId("page-warnings");
    expect(
      within(warning).getByRole("heading", {
        level: 3,
        name: "Some pages can't be fully checked",
      }),
    ).toBeInTheDocument();
    expect(warning).toHaveTextContent(
      "Page 2 is a scanned image. Text in the image can't be found or removed.",
    );
    expect(warning).toHaveTextContent(
      "Page 4 has no text RedactNest can read. Anything on it, such as words in a picture or drawn as shapes, can't be found or removed.",
    );
    expect(within(warning).getByTestId("page-advice")).toHaveTextContent(
      "Run this file through text recognition (OCR) first, then open the result here. That may let RedactNest read those pages.",
    );
    // The blank page is never named.
    expect(warning).not.toHaveTextContent("Page 3");
    expect(screen.queryByTestId("all-clear")).not.toBeInTheDocument();

    // Heard once, with the open: inside the first polite region, in the card.
    expect(container.querySelector('[aria-live="polite"]')).toContainElement(warning);
    expect(screen.getByRole("region", { name: "Document opened" })).toContainElement(
      warning,
    );
    expect(warning).not.toHaveAttribute("role");
    expect(warning).toHaveTextContent(/^Warning:/);
  });

  it("qualifies the coverage note when a page carries a warning (AC-26)", async () => {
    await openWith(flagged().session);

    expect(screen.getByTestId("coverage")).toHaveTextContent(
      "on the pages it could read",
    );
  });

  it("repeats the warning directly above Download, and names the file partly redacted (AC-22, AC-23)", async () => {
    const run = flagged();
    await openWith(run.session);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("redact"));
    await run.finish();

    const card = screen.getByRole("region", { name: "Your redacted file is ready" });
    const warning = within(card).getByTestId("download-warning");
    expect(
      within(warning).getByRole("heading", {
        level: 3,
        name: "Not every page was checked",
      }),
    ).toBeInTheDocument();
    expect(warning).toHaveTextContent("Page 2 is a scanned image.");
    expect(warning).toHaveTextContent("Page 4 has no text RedactNest can read.");
    expect(warning).toHaveTextContent(
      "That is why the file's name ends in partly redacted.",
    );
    // Directly above Download, inside the same card (spec 0007, AC-11, INV-5).
    const download = screen.getByTestId("download");
    expect(warning.nextElementSibling).toContainElement(download);
    expect(card.lastElementChild).toContainElement(download);

    await user.click(download);
    expect(mocks.offerDownload).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "report-partly-redacted.pdf",
    );
    // It stays after the download too.
    expect(screen.getByTestId("download-warning")).toBeInTheDocument();
  });

  it("keeps the plain name and shows no download warning when no page carries one", async () => {
    const session: OpenedSession = {
      ...openedSession(),
      redact: vi.fn(async () => ({ output: new ArrayBuffer(8), outcome: OUTCOME })),
    };
    await openWith(session);
    const user = userEvent.setup();
    await user.click(screen.getByTestId("redact"));
    await user.click(await screen.findByTestId("download"));

    expect(mocks.offerDownload).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "report-redacted.pdf",
    );
    expect(screen.queryByTestId("download-warning")).not.toBeInTheDocument();
  });

  it.each([
    [
      "no-readable-text",
      "RedactNest can't read any text in this PDF",
      "so nothing could be found and no file was made.",
    ],
    [
      "edge-text",
      "Text at a page's edge can't be removed cleanly",
      "so it made no file.",
    ],
  ] as const)(
    "says plainly why no file was made for %s, above the full drop zone (AC-26)",
    async (kind, title, words) => {
      mocks.openSession.mockRejectedValue(new EngineError(kind));
      const { container } = render(<ToolClient />);
      await chooseFile(pdfFile());

      const alert = await screen.findByRole("alert");
      expect(within(alert).getByRole("heading", { level: 2, name: title })).toBeVisible();
      expect(alert).toHaveTextContent(words);
      expect(container.querySelector('[aria-live="polite"]')?.contains(alert)).toBe(
        false,
      );
      expect(screen.queryByTestId("review")).not.toBeInTheDocument();
      expect(screen.queryByTestId("redact")).not.toBeInTheDocument();
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
      // Spec 0007, AC-15: the next file is one drop away.
      expect(screen.getByTestId("drop-area")).toBeInTheDocument();
      expect(screen.queryByTestId("start-over")).not.toBeInTheDocument();
    },
  );

  it("has no accessibility violations with the warning at open and at download (AC-27)", async () => {
    const run = flagged();
    const { container } = await openWith(run.session);
    await expectNoAxeViolations(container);

    await userEvent.setup().click(screen.getByTestId("redact"));
    await run.finish();
    await expectNoAxeViolations(container);
  });

  /**
   * Spec 0006, AC-8, AC-21 and AC-22. What lies outside a page's visible
   * area: a note at open and a note at complete when the trim removed text or
   * drawings there, and a warning with the partly name for a picture reaching
   * outside, which is always kept.
   */
  describe("content outside the visible area", () => {
    const OFF_PAGE: DocumentSummary = Object.freeze({
      pageCount: 3,
      pages: Object.freeze([
        Object.freeze({ findings: ["off-page-content"] }),
        Object.freeze({ findings: ["off-page-picture"] }),
        Object.freeze({ findings: [] }),
      ]) as DocumentSummary["pages"],
    });

    it("notes the removal at open, warns of the picture outside, and names the file partly", async () => {
      const run = flagged(OFF_PAGE);
      await openWith(run.session);

      expect(screen.getByTestId("page-notes")).toHaveTextContent(
        "Page 1 has text or drawings outside its visible area. RedactNest removes them when you redact, since nobody can see them. A found item crossing a page's edge is listed by the part inside the page; the part outside is removed with the rest.",
      );
      expect(screen.getByTestId("page-warnings")).toHaveTextContent(
        "Page 2 has a picture that reaches outside the visible page. RedactNest doesn't clear pictures, so the part outside is still in the file.",
      );

      const user = userEvent.setup();
      await user.click(screen.getByTestId("redact"));
      await run.finish();

      const card = screen.getByRole("region", { name: "Your redacted file is ready" });
      const removed = within(card).getByTestId("off-page-removed");
      expect(removed).toHaveTextContent(
        "Text and drawings outside the visible area of page 1 were removed.",
      );
      expect(removed).toHaveTextContent(/^Note:/);
      // Before the download warning, which stays directly above Download.
      const warning = within(card).getByTestId("download-warning");
      expect(
        removed.compareDocumentPosition(warning) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(warning.nextElementSibling).toContainElement(screen.getByTestId("download"));

      await user.click(screen.getByTestId("download"));
      expect(mocks.offerDownload).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        "report-partly-redacted.pdf",
      );
    });

    it("keeps the plain name when the trim only removed content", async () => {
      const summary: DocumentSummary = {
        pageCount: 1,
        pages: [{ findings: ["off-page-content"] }],
      };
      const run = flagged(summary);
      await openWith(run.session);
      const user = userEvent.setup();
      await user.click(screen.getByTestId("redact"));
      await run.finish();

      expect(screen.getByTestId("off-page-removed")).toBeInTheDocument();
      expect(screen.queryByTestId("download-warning")).not.toBeInTheDocument();
      await user.click(screen.getByTestId("download"));
      expect(mocks.offerDownload).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        "report-redacted.pdf",
      );
    });
  });

  /** Spec 0006, AC-21 and AC-25. What is worth knowing, and changes nothing. */
  describe("the notes", () => {
    const SLANTED: ReviewMatch = Object.freeze<ReviewMatch>({
      id: asMatchId("m-slanted"),
      type: "email",
      page: 2,
      text: "accounts@example.com",
      before: "Write to ",
      after: " today",
      beforeCut: true,
      afterCut: true,
      tickedByDefault: false,
      blocked: "slanted-text",
      concealed: null,
    });

    it("sit in an untitled note after the warnings, with the crooked scan line last", async () => {
      const summary: DocumentSummary = {
        pageCount: 3,
        pages: [
          { findings: ["bare-picture"] },
          { findings: ["machine-read-text"] },
          { findings: [] },
        ],
      };
      await openWith({ ...openedSession(), summary, matches: [SLANTED] });

      const notes = screen.getByTestId("page-notes");
      expect(notes).toHaveTextContent(/^Note:/);
      expect(within(notes).queryByRole("heading")).not.toBeInTheDocument();
      const lines = [...notes.querySelectorAll("p")].map((line) => line.textContent);
      expect(lines).toEqual([
        "Page 2 is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the picture.",
        "Some items on scanned pages can't be removed because the scan is slightly crooked. Straightening the scan before text recognition (OCRmyPDF's --deskew option, for one) usually fixes this.",
      ]);

      // After the warnings, in the same card, and never among them.
      const warnings = screen.getByTestId("page-warnings");
      expect(
        warnings.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(warnings).not.toHaveTextContent("machine read");
      expect(screen.getByRole("region", { name: "Document opened" })).toContainElement(
        notes,
      );
    });

    it("keep the all clear line and the plain name when there are only notes", async () => {
      const summary: DocumentSummary = {
        pageCount: 2,
        pages: [{ findings: ["machine-read-text"] }, { findings: [] }],
      };
      await openWith({ ...openedSession(), summary });

      expect(screen.getByTestId("all-clear")).toBeInTheDocument();
      // Spec 0008, AC-9: the note says what the text recognition may have missed.
      expect(screen.getByTestId("page-notes")).toHaveTextContent(
        "Page 1 is a scan with machine read text. RedactNest reads that text, so it can only find what the text recognition got right. Words it missed, such as handwriting, stamps or tables it couldn't read, stay in the picture.",
      );
      expect(screen.queryByTestId("page-warnings")).not.toBeInTheDocument();
      expect(screen.getByTestId("coverage")).not.toHaveTextContent(
        "on the pages it could read",
      );
    });

    it("leave the crooked scan line out when the slanted match is on a typed page", async () => {
      const summary: DocumentSummary = {
        pageCount: 2,
        pages: [{ findings: ["machine-read-text"] }, { findings: [] }],
      };
      await openWith({ ...openedSession(), summary, matches: [SLANTED] });

      expect(screen.getByTestId("page-notes")).not.toHaveTextContent("crooked");
    });

    it("show no note at all when there is nothing to note", async () => {
      await openWith(openedSession());

      expect(screen.queryByTestId("page-notes")).not.toBeInTheDocument();
    });
  });
});

/**
 * Spec 0007. The flow as one page: each step takes over the column, a refused
 * run keeps the review, the result card says what happened, and focus lands
 * where the step change put something new.
 */
describe("the redact flow (spec 0007)", () => {
  const E1 = asMatchId("f-email-1");
  const E2 = asMatchId("f-email-2");
  const P1 = asMatchId("f-phone-1");
  const B1 = asMatchId("f-blocked");

  function row(
    id: ReturnType<typeof asMatchId>,
    type: ReviewMatch["type"],
    text: string,
    extra: Partial<ReviewMatch> = {},
  ): ReviewMatch {
    return {
      id,
      type,
      page: 1,
      text,
      before: "near ",
      after: " here",
      beforeCut: true,
      afterCut: true,
      tickedByDefault: true,
      blocked: null,
      concealed: null,
      ...extra,
    };
  }

  /** Two emails seeded ticked, a phone number seeded clear, and a blocked email. */
  const FLOW_MATCHES: readonly ReviewMatch[] = Object.freeze([
    row(E1, "email", "ann@example.com"),
    row(E2, "email", "bob@example.com"),
    row(P1, "phone", "020 7946 0958", { tickedByDefault: false }),
    row(B1, "email", "tilted@example.com", {
      tickedByDefault: false,
      blocked: "slanted-text",
    }),
  ]);

  const FLOW_OUTCOME: RedactionOutcome = Object.freeze<RedactionOutcome>({
    pageCount: 2,
    removedByType: { email: 2 },
    pagesByFinding: { blank: 1 },
    sanitized: ["document-info"],
  });

  const NOTHING_REMOVED: RedactionOutcome = Object.freeze<RedactionOutcome>({
    ...FLOW_OUTCOME,
    removedByType: {},
  });

  /** Page 2 a scan: the file is partly readable. */
  const PARTLY: DocumentSummary = Object.freeze({
    pageCount: 2,
    pages: Object.freeze([
      Object.freeze({ findings: [] }),
      Object.freeze({ findings: ["scanned"] }),
    ]) as DocumentSummary["pages"],
  });

  interface Run {
    readonly resolve: (value: RedactedOutput) => void;
    readonly reject: (error: unknown) => void;
    readonly onProgress?: (phase: ProgressPhase) => void;
  }

  /** A session whose every run the test settles, one at a time. */
  function controllable(
    matches: readonly ReviewMatch[] = FLOW_MATCHES,
    summary: DocumentSummary = SUMMARY,
  ) {
    const runs: Run[] = [];
    const latest = () => {
      const run = runs.at(-1);
      if (!run) throw new Error("no run was started");
      return run;
    };
    const session: OpenedSession = {
      ...openedSession(),
      summary,
      matches,
      redact: vi.fn(
        (_ids, options?: { onProgress?: (phase: ProgressPhase) => void }) =>
          new Promise<RedactedOutput>((resolve, reject) => {
            runs.push({ resolve, reject, onProgress: options?.onProgress });
          }),
      ),
      cancel: vi.fn(() => latest().reject(new OperationCancelled())),
    };
    return {
      session,
      finish: (outcome: RedactionOutcome = FLOW_OUTCOME) =>
        act(async () => latest().resolve({ output: new ArrayBuffer(8), outcome })),
      refuse: (kind: EngineError["errorKind"]) =>
        act(async () => latest().reject(new EngineError(kind))),
      progress: (phase: ProgressPhase) => act(async () => latest().onProgress?.(phase)),
    };
  }

  async function openFlow(session: OpenedSession) {
    mocks.openSession.mockResolvedValue(session);
    const rendered = render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByTestId("review");
    return rendered;
  }

  /** `a` comes before `b` in the page. */
  function before(a: Element, b: Element): boolean {
    return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  }

  function box(name: string): HTMLElement {
    return screen.getByRole("checkbox", { name });
  }

  /**
   * A file dropped on the file bar. Drag and drop has no user-event API, so
   * this is the one `fireEvent` here, as in the drop zone's own tests. A drop
   * moves no focus, which is what lets the focus cases see where it was left.
   */
  async function dropOnFileBar(file: File): Promise<void> {
    await act(async () => {
      fireEvent.drop(screen.getByTestId("file-bar"), { dataTransfer: { files: [file] } });
    });
  }

  describe("one step at a time (AC-2 to AC-6)", () => {
    it("shows the full drop zone naming the free page cap while nothing is open (AC-2)", () => {
      render(<ToolClient />);

      expect(screen.getByTestId("drop-area")).toHaveTextContent(
        `Up to ${config.freePageCap} pages`,
      );
      expect(screen.queryByTestId("file-bar")).not.toBeInTheDocument();
    });

    it("names the page cap again after Start over, after Redact another PDF, and under a failed open (AC-2)", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();
      const helper = `Up to ${config.freePageCap} pages`;

      await user.click(screen.getByTestId("start-over"));
      expect(screen.getByTestId("drop-area")).toHaveTextContent(helper);

      await chooseFile(pdfFile());
      await screen.findByTestId("review");
      await user.click(screen.getByTestId("redact"));
      await run.finish();
      await user.click(screen.getByTestId("download"));
      await user.click(screen.getByTestId("redact-another"));
      expect(screen.getByTestId("drop-area")).toHaveTextContent(helper);

      mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
      await chooseFile(pdfFile());
      await screen.findByTestId("error");
      expect(screen.getByTestId("drop-area")).toHaveTextContent(helper);
    });

    it("opens a file dropped on the file bar in place of the one open (AC-3)", async () => {
      await openFlow(controllable().session);
      const bar = screen.getByTestId("file-bar");

      await dropOnFileBar(pdfFile("second.pdf"));

      expect(await within(bar).findByText("second.pdf")).toBeInTheDocument();
      expect(await within(bar).findByTestId("page-count")).toHaveTextContent("2 pages");
      expect(jobIdsOpened()).toHaveLength(2);
      expect(new Set(jobIdsOpened()).size).toBe(2);
      expect(within(bar).queryByText("report.pdf")).not.toBeInTheDocument();
    });

    it("turns the drop zone into the file bar once a file is chosen (AC-3)", async () => {
      mocks.openSession.mockImplementation(hangsAt("opening"));
      render(<ToolClient />);
      await chooseFile(pdfFile("board minutes.pdf"));

      const bar = await screen.findByTestId("file-bar");
      expect(bar).toHaveTextContent("board minutes.pdf");
      // No count before the document is open.
      expect(screen.queryByTestId("page-count")).not.toBeInTheDocument();
      expect(
        within(bar).getByRole("button", { name: "Choose another PDF" }),
      ).toBeEnabled();
      expect(within(bar).getByRole("button", { name: "Start over" })).toBeEnabled();
      expect(screen.queryByTestId("drop-area")).not.toBeInTheDocument();
    });

    it("gives the page count to the file bar, and only to it, once the document is open (AC-3)", async () => {
      await openFlow(controllable().session);

      const bar = screen.getByTestId("file-bar");
      expect(within(bar).getByTestId("page-count")).toHaveTextContent("2 pages");
      expect(
        screen.getByRole("region", { name: "Document opened" }),
      ).not.toHaveTextContent("2 pages");
      // The old action row beneath the page is gone: one Start over, in the bar.
      expect(screen.getAllByTestId("start-over")).toHaveLength(1);
      expect(bar).toContainElement(screen.getByTestId("start-over"));
    });

    it("keeps both file bar buttons enabled through a run (AC-3)", async () => {
      await openFlow(controllable().session);
      await userEvent.setup().click(screen.getByTestId("redact"));

      const bar = screen.getByTestId("file-bar");
      expect(
        within(bar).getByRole("button", { name: "Choose another PDF" }),
      ).toBeEnabled();
      expect(within(bar).getByRole("button", { name: "Start over" })).toBeEnabled();
    });

    it("asks before replacing a running document, and changes nothing on no (AC-3)", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      await openFlow(controllable().session);
      await userEvent.setup().click(screen.getByTestId("redact"));

      await chooseFile(pdfFile("second.pdf"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mocks.openSession).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("cancel")).toBeInTheDocument();
      expect(screen.getByTestId("file-bar")).toHaveTextContent("report.pdf");
    });

    /**
     * Start over sits beside Choose another PDF, so it asks about the same
     * loss the same way, and a no leaves the run, the worker and focus alone.
     */
    it("asks before Start over drops a running document, and changes nothing on no", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      await openFlow(controllable().session);
      const user = userEvent.setup();
      await user.click(screen.getByTestId("redact"));

      await user.click(screen.getByTestId("start-over"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(confirm.mock.calls[0]?.[0]).toMatch(/Starting over will discard it/);
      expect(mocks.releaseEngine).not.toHaveBeenCalled();
      expect(screen.getByTestId("cancel")).toBeInTheDocument();
      expect(screen.getByTestId("start-over")).toHaveFocus();
    });

    it("asks before Start over drops a result nobody has downloaded, and starts over on yes", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();
      await user.click(screen.getByTestId("redact"));
      await run.finish();

      await user.click(screen.getByTestId("start-over"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mocks.releaseEngine).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("file-bar")).not.toBeInTheDocument();
    });

    it("starts over without asking when nothing would be lost, and so does Redact another PDF", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();

      // An untouched review.
      await user.click(screen.getByTestId("start-over"));
      expect(screen.queryByTestId("file-bar")).not.toBeInTheDocument();

      // A result already downloaded.
      await chooseFile(pdfFile());
      await screen.findByTestId("review");
      await user.click(screen.getByTestId("redact"));
      await run.finish();
      await user.click(screen.getByTestId("download"));
      await user.click(screen.getByTestId("start-over"));
      expect(screen.queryByTestId("file-bar")).not.toBeInTheDocument();

      await chooseFile(pdfFile());
      await screen.findByTestId("review");
      await user.click(screen.getByTestId("redact"));
      await run.finish();
      await user.click(screen.getByTestId("download"));
      await user.click(screen.getByTestId("redact-another"));
      expect(screen.queryByTestId("file-bar")).not.toBeInTheDocument();

      expect(confirm).not.toHaveBeenCalled();
    });

    /**
     * AC-5, as spec 0013 AC-16 amends it: the rail comes before the list in
     * the page, and the coverage note is the first thing inside the list.
     */
    it("reads from the top: file bar, document, refusal, action panel, then the found items with the coverage note first (AC-5)", async () => {
      const run = controllable();
      await openFlow(run.session);
      await userEvent.setup().click(screen.getByTestId("redact"));
      await run.refuse("slanted-text");

      const order = [
        screen.getByTestId("file-bar"),
        screen.getByRole("region", { name: "Document opened" }),
        screen.getByTestId("run-refusal"),
        screen.getByTestId("action-panel"),
        screen.getByTestId("checklist"),
        screen.getByTestId("coverage"),
        screen.getByRole("checkbox", { name: "ann@example.com" }),
      ];
      for (let at = 1; at < order.length; at += 1) {
        expect(before(order[at - 1], order[at])).toBe(true);
      }
      expect(screen.getByTestId("checklist")).toContainElement(
        screen.getByTestId("coverage"),
      );
    });

    /**
     * Spec 0013, AC-14 and AC-20 (INV-5). The three areas keep their order
     * and their elements in every step, so neither polite region remounts as
     * a file is chosen and its first announcement is heard.
     */
    it("keeps the three areas in page order, and both polite regions the same nodes, as a file opens", async () => {
      mocks.billingEnabled = true;
      const run = controllable();
      mocks.openSession.mockResolvedValue(run.session);
      render(<ToolClient />);

      const grid = screen.getByTestId("tool-grid");
      const areas = () =>
        [...grid.children].map((area) => area.getAttribute("data-testid"));
      const documentArea = screen.getByTestId("area-document");
      const rail = screen.getByTestId("area-rail");
      const polite = rail.querySelector('[aria-live="polite"]');
      const plan = screen.getByRole("status");
      expect(areas()).toEqual(["area-document", "area-rail"]);
      expect(rail.firstElementChild).toBe(polite);

      await chooseFile(pdfFile());
      await screen.findByTestId("review");

      expect(areas()).toEqual(["area-document", "area-rail", "area-found"]);
      expect(screen.getByTestId("area-document")).toBe(documentArea);
      expect(screen.getByTestId("area-rail")).toBe(rail);
      expect(rail.querySelector('[aria-live="polite"]')).toBe(polite);
      expect(screen.getByRole("status")).toBe(plan);
      expect(screen.getByTestId("area-found")).toContainElement(
        screen.getByTestId("checklist"),
      );
    });

    /** AC-14 and AC-16: one template while nothing is open, the other with a file. */
    it("lays A beside B while nothing is open, then A across the top with C left of B", async () => {
      const run = controllable();
      mocks.openSession.mockResolvedValue(run.session);
      render(<ToolClient />);
      const grid = screen.getByTestId("tool-grid");
      expect(grid).toHaveClass(
        "@min-[61rem]:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]",
        "@min-[61rem]:[grid-template-areas:'a_b']",
      );

      await chooseFile(pdfFile());
      await screen.findByTestId("review");
      expect(grid).toHaveClass("@min-[61rem]:[grid-template-areas:'a_a'_'c_b']");
      expect(grid).not.toHaveClass("@min-[61rem]:[grid-template-areas:'a_b']");
    });

    /** AC-15: the idle rail, in order. */
    it("holds the plan card, the three steps and the lock line in the idle rail", () => {
      mocks.billingEnabled = true;
      render(<ToolClient />);
      answerWith(FREE);

      const rail = screen.getByTestId("area-rail");
      const steps = within(rail).getByRole("list");
      expect(
        within(steps)
          .getAllByRole("listitem")
          .map((item) => item.textContent),
      ).toEqual(["1Open a PDF", "2Tick what to remove", "3Download your new file"]);
      const order = [
        rail.querySelector('[aria-live="polite"]'),
        screen.getByTestId("plan-card"),
        steps,
        screen.getByTestId("lock-line"),
      ];
      for (let at = 1; at < order.length; at += 1) {
        expect(before(order[at - 1] as Element, order[at] as Element)).toBe(true);
      }
      expect(screen.getByTestId("lock-line")).toHaveTextContent(
        "Your file never leaves your browser.",
      );
      expect(rail.lastElementChild).toBe(screen.getByTestId("lock-line"));
    });

    /** AC-15: "Checking your plan" in the rail's polite region, as today. */
    it("says it is checking the plan in the rail's polite region while a chosen file waits", async () => {
      mocks.getEntitlement.mockImplementation(
        ({ onWaiting }: { onWaiting?: () => void }) => {
          onWaiting?.();
          return new Promise<EntitlementSnapshot>(() => {});
        },
      );
      render(<ToolClient />);
      const polite = screen
        .getByTestId("area-rail")
        .querySelector('[aria-live="polite"]');
      expect(polite).toHaveClass("sr-only");

      await chooseFile(pdfFile());

      expect(polite).toHaveTextContent("Checking your plan…");
      expect(polite).not.toHaveClass("sr-only");
    });

    /**
     * AC-16 and AC-17: the lock line rides inside the action panel, the
     * rail's last block, sticky from `lg` only; the result card takes the
     * panel's place, never sticky, with the lock line after it.
     */
    it("carries the lock line in the sticky action panel, and after the result card", async () => {
      const run = controllable();
      await openFlow(run.session);
      const rail = screen.getByTestId("area-rail");
      const panel = screen.getByTestId("action-panel");

      expect(rail.lastElementChild).toBe(panel);
      expect(panel).toContainElement(screen.getByTestId("lock-line"));
      expect(screen.getAllByTestId("lock-line")).toHaveLength(1);
      expect(panel).toHaveClass("@min-[61rem]:sticky", "@min-[61rem]:top-6");
      expect(panel.className).not.toMatch(/(^|\s)(sticky|top-6)(\s|$)/);

      await userEvent.setup().click(screen.getByTestId("redact"));
      await run.finish();

      const result = screen.getByTestId("result");
      expect(result.className).not.toMatch(/sticky/);
      expect(rail.lastElementChild).toBe(screen.getByTestId("lock-line"));
      expect(before(result, screen.getByTestId("lock-line"))).toBe(true);
    });

    /** AC-19: one card, titled Found items, counting every row found. */
    it("titles the found items card and counts every row, blocked ones included", async () => {
      await openFlow(controllable().session);

      const card = screen.getByRole("region", { name: "Found items" });
      expect(card).toBe(screen.getByTestId("checklist"));
      expect(
        within(card).getByRole("heading", { level: 2 }).parentElement,
      ).toHaveTextContent("4 found items");
    });

    /**
     * Spec 0013, AC-16, with billing on, so the plan card takes its place:
     * file bar, document card, plan card, run refusal, action panel, then the
     * list, each in its own area. The test above runs with billing off.
     */
    it("reads file bar, document, plan card, refusal, action panel, then the list, with billing on (AC-16)", async () => {
      mocks.billingEnabled = true;
      const run = controllable();
      await openFlow(run.session);
      answerWith(FREE);
      await userEvent.setup().click(screen.getByTestId("redact"));
      await run.refuse("slanted-text");

      const order = [
        screen.getByTestId("file-bar"),
        screen.getByRole("region", { name: "Document opened" }),
        screen.getByTestId("plan-card"),
        screen.getByTestId("run-refusal"),
        screen.getByTestId("action-panel"),
        screen.getByTestId("checklist"),
      ];
      for (let at = 1; at < order.length; at += 1) {
        expect(before(order[at - 1], order[at])).toBe(true);
      }
      const [fileBar, document, plan, refusal, panel, list] = order;
      expect(screen.getByTestId("area-document")).toContainElement(fileBar);
      const rail = screen.getByTestId("area-rail");
      for (const block of [document, plan, refusal, panel]) {
        expect(rail).toContainElement(block);
      }
      expect(rail.lastElementChild).toBe(panel);
      expect(screen.getByTestId("area-found")).toContainElement(list);
    });

    /** AC-16: the lost callout in the run refusal's place, after the plan card. */
    it("puts the lost callout in the rail after the plan card, with the lock line at its foot (AC-16)", async () => {
      mocks.billingEnabled = true;
      await openFlow(controllable().session);
      answerWith(FREE);

      await fireEngineLost();

      const rail = screen.getByTestId("area-rail");
      const lost = screen.getByTestId("lost");
      expect(rail).toContainElement(lost);
      expect(before(screen.getByTestId("plan-card"), lost)).toBe(true);
      expect(rail.lastElementChild).toBe(screen.getByTestId("lock-line"));
      expect(screen.getAllByTestId("lock-line")).toHaveLength(1);
      // Nothing left to review, so no list and no action panel.
      expect(screen.queryByTestId("area-found")).not.toBeInTheDocument();
      expect(screen.queryByTestId("action-panel")).not.toBeInTheDocument();
    });

    /**
     * AC-15: after a failed open the page is laid out as at idle, A beside B,
     * the failure above the full drop zone in A, and the rail still showing
     * the three steps and the lock line.
     */
    it("lays a failed open out as idle, the failure in the document area (AC-15)", async () => {
      mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
      render(<ToolClient />);
      await chooseFile(pdfFile());

      const error = await screen.findByTestId("error");
      const grid = screen.getByTestId("tool-grid");
      expect(grid).toHaveClass("@min-[61rem]:[grid-template-areas:'a_b']");
      expect([...grid.children].map((area) => area.getAttribute("data-testid"))).toEqual([
        "area-document",
        "area-rail",
      ]);
      expect(screen.getByTestId("area-document")).toContainElement(error);
      const rail = screen.getByTestId("area-rail");
      expect(within(rail).getAllByRole("listitem")).toHaveLength(IDLE_STEPS.length);
      expect(rail.lastElementChild).toBe(screen.getByTestId("lock-line"));
    });

    /** AC-16: while a file opens, the file bar takes A and the list is not there yet. */
    it("lays the page out for a document while it opens, with no list yet (AC-16)", async () => {
      mocks.openSession.mockImplementation(hangsAt("opening"));
      render(<ToolClient />);
      await chooseFile(pdfFile());
      await screen.findByTestId("progress");

      const grid = screen.getByTestId("tool-grid");
      expect(grid).toHaveClass("@min-[61rem]:[grid-template-areas:'a_a'_'c_b']");
      expect(screen.getByTestId("area-document")).toContainElement(
        screen.getByTestId("file-bar"),
      );
      expect(screen.queryByTestId("area-found")).not.toBeInTheDocument();
      expect(within(screen.getByTestId("area-rail")).queryByRole("list")).toBeNull();
    });

    /**
     * Spec 0013, AC-30: on `/tool` the document's privacy is said once, by the
     * lock line in the rail, at idle and in review alike.
     */
    it.each(["idle", "reviewing"] as const)(
      "says the file stays in the browser once, by the lock line, while %s (AC-30)",
      async (step) => {
        mocks.billingEnabled = true;
        if (step === "idle") render(<ToolClient />);
        else await openFlow(controllable().session);
        answerWith(FREE);

        // Every piece of text on the page that speaks of where the file goes.
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const saying: Node[] = [];
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (/\bbrowser\b|never leaves|uploaded/i.test(node.textContent ?? "")) {
            saying.push(node);
          }
        }

        expect(saying).toHaveLength(1);
        expect(screen.getByTestId("lock-line")).toContainElement(saying[0].parentElement);
      },
    );

    it("says what each phase is doing, and that a run with nothing ticked only strips (AC-4)", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();

      await user.click(screen.getByTestId("redact"));
      await run.progress("redacting");
      expect(screen.getByTestId("progress")).toHaveTextContent(
        "Removing what you ticked…",
      );
      await user.click(screen.getByTestId("cancel"));

      await user.click(box("ann@example.com"));
      await user.click(box("bob@example.com"));
      await user.click(screen.getByTestId("redact"));
      await run.progress("redacting");
      expect(screen.getByTestId("progress")).toHaveTextContent(
        "Stripping hidden content…",
      );
      // One phase line, in the polite region.
      expect(screen.getAllByTestId("progress")).toHaveLength(1);
      expect(
        screen.getByTestId("progress").closest('[aria-live="polite"]'),
      ).not.toBeNull();
    });

    it("names what detection looks for while it runs (AC-4)", async () => {
      mocks.openSession.mockImplementation(hangsAt("detecting"));
      render(<ToolClient />);
      await chooseFile(pdfFile());

      expect(await screen.findByTestId("progress")).toHaveTextContent(
        "Looking for email addresses, phone numbers, dates, card numbers, IBANs, Social Security numbers and National Insurance numbers…",
      );
    });

    it("counts what will be removed, and labels the action to match (AC-6)", async () => {
      await openFlow(controllable().session);
      const user = userEvent.setup();
      const line = () => screen.getByTestId("tick-count");
      const action = () => screen.getByTestId("redact");

      // Seeded: both emails ticked, of three that can be.
      expect(line()).toHaveTextContent("2 of 3 found items will be removed.");
      expect(action()).toHaveTextContent("Redact 2 items");

      await user.click(box("ann@example.com"));
      expect(line()).toHaveTextContent("1 of 3 found items will be removed.");
      expect(action()).toHaveTextContent("Redact 1 item");

      await user.click(box("bob@example.com"));
      expect(line()).toHaveTextContent("Nothing is ticked, so nothing will be removed.");
      expect(action()).toHaveTextContent("Make a cleaned copy");
    });

    it("says none can be removed when every found item is blocked (AC-6)", async () => {
      await openFlow(
        controllable([
          row(B1, "email", "tilted@example.com", { blocked: "slanted-text" }),
        ]).session,
      );

      expect(screen.getByTestId("tick-count")).toHaveTextContent(
        "None of the found items can be removed.",
      );
      expect(screen.getByTestId("redact")).toHaveTextContent("Make a cleaned copy");
    });

    it("leaves the count out when nothing was found (AC-6)", async () => {
      await openFlow(controllable([]).session);

      expect(screen.queryByTestId("tick-count")).not.toBeInTheDocument();
      expect(screen.getByTestId("redact")).toHaveTextContent("Make a cleaned copy");
    });

    it("holds Cancel in the action panel while a run works, and keeps the ticks on Cancel (AC-6, AC-10)", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();
      await user.click(box("020 7946 0958"));
      await user.click(screen.getByTestId("redact"));

      const panel = screen.getByTestId("action-panel");
      expect(within(panel).getByTestId("cancel")).toBeInTheDocument();
      expect(within(panel).queryByTestId("redact")).not.toBeInTheDocument();

      await user.click(screen.getByTestId("cancel"));
      expect(await screen.findByTestId("redact")).toHaveTextContent("Redact 3 items");
      expect(box("020 7946 0958")).toBeChecked();
    });

    /**
     * AC-7 through the page's own reducer: the select all the checklist shows
     * is the one the action panel counts and the run sends.
     */
    it("clears and ticks a whole group from its select all, never touching a blocked row (AC-7)", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();
      const selectAll = () => box("Select all 2 email addresses");
      expect(selectAll()).toBeChecked();

      await user.click(selectAll());
      expect(box("ann@example.com")).not.toBeChecked();
      expect(box("bob@example.com")).not.toBeChecked();
      expect(screen.getByTestId("tick-count")).toHaveTextContent(
        "Nothing is ticked, so nothing will be removed.",
      );

      await user.click(selectAll());
      expect(box("ann@example.com")).toBeChecked();
      expect(box("bob@example.com")).toBeChecked();
      expect(box("tilted@example.com")).not.toBeChecked();
      expect(screen.getByTestId("tick-count")).toHaveTextContent(
        "2 of 3 found items will be removed.",
      );

      await user.click(screen.getByTestId("redact"));
      const [ids] = vi.mocked(run.session.redact).mock.calls[0];
      expect([...ids].sort()).toEqual([E1, E2].sort());
    });
  });

  describe("the result (AC-11 to AC-13)", () => {
    async function complete(
      outcome: RedactionOutcome = FLOW_OUTCOME,
      summary: DocumentSummary = SUMMARY,
    ) {
      const run = controllable(FLOW_MATCHES, summary);
      const rendered = await openFlow(run.session);
      await userEvent.setup().click(screen.getByTestId("redact"));
      await run.finish(outcome);
      return { ...rendered, run };
    }

    it("takes the action panel's place, above the checklist, outside every live region (AC-11)", async () => {
      await complete();

      const card = screen.getByTestId("result");
      expect(screen.queryByTestId("action-panel")).not.toBeInTheDocument();
      expect(card.closest("[aria-live]")).toBeNull();
      expect(before(card, screen.getByTestId("coverage"))).toBe(true);
      expect(before(screen.getByRole("region", { name: "Document opened" }), card)).toBe(
        true,
      );
    });

    it("lists what was removed, what is left and what was stripped (AC-11)", async () => {
      await complete();

      const descriptions = [...screen.getByTestId("outcome").querySelectorAll("dd")].map(
        (description) => description.textContent,
      );
      expect(descriptions).toEqual([
        "2 email addresses",
        "1 phone number you left unticked. 1 email address RedactNest couldn't remove.",
        "Document info",
      ]);
    });

    it("is titled and named as a redaction when something was removed (AC-12)", async () => {
      await complete();
      await userEvent.setup().click(screen.getByTestId("download"));

      expect(
        screen.getByRole("heading", { level: 2, name: "Your redacted file is ready" }),
      ).toBeInTheDocument();
      expect(mocks.offerDownload).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        "report-redacted.pdf",
      );
    });

    it("is titled Nothing was removed and named a cleaned copy when nothing was, even on a partly readable file (AC-12)", async () => {
      await complete(NOTHING_REMOVED, PARTLY);

      expect(
        screen.getByRole("heading", { level: 2, name: "Nothing was removed" }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("outcome").querySelector("dd")).toHaveTextContent(
        /^Nothing$/,
      );
      // The page lines still show; only the reason for a partly name goes.
      const warning = screen.getByTestId("download-warning");
      expect(warning).toHaveTextContent("Page 2 is a scanned image.");
      expect(warning).not.toHaveTextContent("partly redacted");

      await userEvent.setup().click(screen.getByTestId("download"));
      expect(mocks.offerDownload).toHaveBeenCalledWith(
        expect.any(ArrayBuffer),
        "report-cleaned.pdf",
      );
    });

    it("keeps the card after the download, with the browser line and two ways on (AC-13)", async () => {
      await complete();
      await userEvent.setup().click(screen.getByTestId("download"));

      const card = screen.getByTestId("result");
      const line = within(card).getByTestId("downloaded");
      expect(line).toHaveTextContent("Your browser has the file.");
      expect(line.closest('[aria-live="polite"]')).not.toBeNull();
      expect(within(card).queryByTestId("download")).not.toBeInTheDocument();
      expect(within(card).getByTestId("redact-another")).toHaveTextContent(
        "Redact another PDF",
      );
      expect(within(card).getByTestId("make-again")).toHaveTextContent("Make it again");
      expect(screen.getByTestId("outcome")).toBeInTheDocument();
      // The checklist below stays enabled.
      expect(box("020 7946 0958")).toBeEnabled();
    });

    it("goes back to the full drop zone and releases the engine on Redact another PDF (AC-13)", async () => {
      await complete();
      const user = userEvent.setup();
      await user.click(screen.getByTestId("download"));

      await user.click(screen.getByTestId("redact-another"));

      expect(mocks.releaseEngine).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("drop-area")).toBeInTheDocument();
      expect(screen.queryByTestId("result")).not.toBeInTheDocument();
    });

    it("runs the same ticks again on Make it again, and offers the same file afresh (AC-13)", async () => {
      const { run } = await complete();
      const user = userEvent.setup();
      await user.click(screen.getByTestId("download"));

      await user.click(screen.getByTestId("make-again"));
      const calls = vi.mocked(run.session.redact).mock.calls;
      expect(calls).toHaveLength(2);
      expect(calls[1][0]).toEqual(calls[0][0]);
      expect(screen.getByTestId("cancel")).toBeInTheDocument();

      await run.finish();
      await user.click(screen.getByTestId("download"));
      expect(mocks.offerDownload).toHaveBeenCalledTimes(2);
      expect(mocks.offerDownload).toHaveBeenLastCalledWith(
        expect.any(ArrayBuffer),
        "report-redacted.pdf",
      );
    });

    it("lands on plain review when Make it again is cancelled (AC-13)", async () => {
      await complete();
      const user = userEvent.setup();
      await user.click(screen.getByTestId("download"));
      await user.click(screen.getByTestId("make-again"));

      await user.click(screen.getByTestId("cancel"));

      expect(await screen.findByTestId("redact")).toBeInTheDocument();
      expect(screen.queryByTestId("result")).not.toBeInTheDocument();
      expect(screen.queryByTestId("run-refusal")).not.toBeInTheDocument();
    });

    it("returns to review when a tick changes after the download, focus staying on it (AC-11)", async () => {
      await complete();
      const user = userEvent.setup();
      await user.click(screen.getByTestId("download"));

      await user.click(box("020 7946 0958"));

      expect(screen.queryByTestId("result")).not.toBeInTheDocument();
      expect(screen.getByTestId("redact")).toHaveTextContent("Redact 3 items");
      expect(box("020 7946 0958")).toHaveFocus();
    });

    /** *Focus*: "a tick or select all changed from `complete`" stays put. */
    it("returns to review when a select all changes before the download, focus staying on it (AC-11, AC-20)", async () => {
      await complete();

      await userEvent.setup().click(box("Select all 2 email addresses"));

      expect(screen.queryByTestId("result")).not.toBeInTheDocument();
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
      expect(screen.getByTestId("redact")).toHaveTextContent("Make a cleaned copy");
      expect(box("Select all 2 email addresses")).toHaveFocus();
    });

    /**
     * A lost worker moves no attempt on, so this late reply passes the attempt
     * guard. It must still land nowhere, because the session has left
     * `redacting`.
     */
    it("drops a Make it again reply that lands after the worker was lost (AC-13)", async () => {
      const { run } = await complete();
      const user = userEvent.setup();
      await user.click(screen.getByTestId("download"));
      await user.click(screen.getByTestId("make-again"));

      await fireEngineLost();
      await run.finish();

      expect(screen.getByTestId("lost")).toBeInTheDocument();
      expect(screen.queryByTestId("result")).not.toBeInTheDocument();
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
      expect(mocks.offerDownload).toHaveBeenCalledTimes(1);
    });

    it("has no accessibility violations before and after the download", async () => {
      const { container } = await complete(NOTHING_REMOVED, PARTLY);
      await expectNoAxeViolations(container);

      await userEvent.setup().click(screen.getByTestId("download"));
      await expectNoAxeViolations(container);
    });
  });

  describe("a refused run (AC-14, AC-23)", () => {
    async function refused(kind: EngineError["errorKind"] = "redaction-overreach") {
      const run = controllable();
      const rendered = await openFlow(run.session);
      const user = userEvent.setup();
      await user.click(box("020 7946 0958"));
      await user.click(screen.getByTestId("redact"));
      await run.refuse(kind);
      return { ...rendered, run, user };
    }

    it("returns to the checklist with every tick kept and says why, as an alert (AC-14)", async () => {
      await refused("redaction-overreach");

      expect(box("ann@example.com")).toBeChecked();
      expect(box("020 7946 0958")).toBeChecked();
      const refusal = screen.getByTestId("run-refusal");
      expect(refusal).toHaveAttribute("role", "alert");
      expect(refusal).toHaveTextContent("Your last run was stopped");
      expect(
        within(refusal).getByRole("heading", {
          level: 2,
          name: "Removing what you ticked would remove more",
        }),
      ).toBeInTheDocument();
      expect(refusal).toHaveTextContent("a stamp such as CONFIDENTIAL or DRAFT");
      expect(refusal).toHaveTextContent("Untick items that sit under a stamp");
      expect(screen.getByTestId("redact")).toBeEnabled();
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
    });

    it.each([
      "redaction-overreach",
      "replacement-text",
      "slanted-text",
      "redaction-incomplete",
    ] as const)(
      "offers no button of its own for %s, which a tick can cause (AC-14)",
      async (kind) => {
        await refused(kind);

        expect(
          within(screen.getByTestId("run-refusal")).queryByRole("button"),
        ).toBeNull();
      },
    );

    it.each(["unsupported", "edge-text"] as const)(
      "offers Choose another PDF for %s, which a tick cannot cause (AC-14)",
      async (kind) => {
        const click = vi
          .spyOn(HTMLInputElement.prototype, "click")
          .mockImplementation(() => {});
        const { user } = await refused(kind);

        await user.click(
          within(screen.getByTestId("run-refusal")).getByRole("button", {
            name: "Choose another PDF",
          }),
        );
        expect(click).toHaveBeenCalledTimes(1);
        click.mockRestore();
      },
    );

    it("stays through a tick change, and clears when the next run starts (AC-14)", async () => {
      const { user } = await refused();

      await user.click(box("ann@example.com"));
      expect(screen.getByTestId("run-refusal")).toBeInTheDocument();

      await user.click(screen.getByTestId("redact"));
      expect(screen.queryByTestId("run-refusal")).not.toBeInTheDocument();
    });

    it("clears when the session is released", async () => {
      // A refusal on screen is unsaved work (AC-23), so Start over asks first.
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      const { user } = await refused();

      await user.click(screen.getByTestId("start-over"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId("run-refusal")).not.toBeInTheDocument();
    });

    it("keeps Redact enabled beside a refusal a tick cannot cause, with no file offered (AC-14)", async () => {
      await refused("edge-text");

      expect(screen.getByTestId("run-refusal")).toHaveTextContent(
        "Changing what's ticked won't help with this file. Printing it to a new PDF",
      );
      expect(screen.getByTestId("redact")).toBeEnabled();
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("result")).not.toBeInTheDocument();
    });

    /** Nothing was ticked, so there is no choice of ticks to advise on. */
    it("says nothing about ticks after a refused run with nothing ticked", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();
      await user.click(box("ann@example.com"));
      await user.click(box("bob@example.com"));
      await user.click(screen.getByRole("button", { name: "Make a cleaned copy" }));
      await run.refuse("unsupported");

      const refusal = screen.getByTestId("run-refusal");
      expect(refusal).toHaveTextContent("Printing it to a new PDF");
      expect(refusal).not.toHaveTextContent(/ticked/);
    });

    it("clears when a new file replaces the document", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
      await refused();

      await chooseFile(pdfFile("second.pdf"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(
        await within(screen.getByTestId("file-bar")).findByText("second.pdf"),
      ).toBeInTheDocument();
      await screen.findByTestId("review");
      expect(screen.queryByTestId("run-refusal")).not.toBeInTheDocument();
    });

    /** A lost worker is not a refusal, and its retry starts the review over. */
    it("clears when the worker is lost, and stays clear through Try again", async () => {
      const { user } = await refused();

      await fireEngineLost();
      expect(screen.getByTestId("lost")).toBeInTheDocument();
      expect(screen.queryByTestId("run-refusal")).not.toBeInTheDocument();

      await user.click(screen.getByTestId("retry"));
      await screen.findByTestId("review");
      expect(screen.queryByTestId("run-refusal")).not.toBeInTheDocument();
      // The seeded ticks again, not the ones changed before the refusal.
      expect(box("020 7946 0958")).not.toBeChecked();
    });

    it("counts as unsaved work: leaving warns and replacing asks (AC-23)", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      const run = controllable();
      await openFlow(run.session);
      // The seeded ticks, untouched, so only the refusal is worth warning about.
      await userEvent.setup().click(screen.getByTestId("redact"));
      await run.refuse("slanted-text");

      expect(wouldWarnOnLeave()).toBe(true);
      await chooseFile(pdfFile("second.pdf"));
      expect(confirm).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("run-refusal")).toBeInTheDocument();
    });

    it("is no refusal when the worker is lost during the run", async () => {
      const run = controllable();
      await openFlow(run.session);
      await userEvent.setup().click(screen.getByTestId("redact"));

      await fireEngineLost();

      expect(screen.getByTestId("lost")).toBeInTheDocument();
      expect(screen.queryByTestId("run-refusal")).not.toBeInTheDocument();
    });

    it("has no accessibility violations", async () => {
      const { container } = await refused("unsupported");

      await expectNoAxeViolations(container);
    });
  });

  describe("an open that fails (AC-15)", () => {
    it("says so above the full drop zone, holding nothing of the document", async () => {
      mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
      const { container } = render(<ToolClient />);
      await chooseFile(pdfFile());

      const error = await screen.findByTestId("error");
      const zone = screen.getByTestId("drop-area");
      expect(before(error, zone)).toBe(true);
      expect(error).toHaveTextContent("This PDF can't be read");
      expect(error).toHaveTextContent("If you have another copy, try that one.");
      expect(screen.queryByTestId("file-bar")).not.toBeInTheDocument();
      expect(screen.queryByTestId("review")).not.toBeInTheDocument();
      await expectNoAxeViolations(container);
    });

    /** No list has been shown, so no failure at the open speaks of ticks. */
    it.each([
      ["unsupported", "RedactNest stopped to be safe"],
      ["edge-text", "Text at a page's edge can't be removed cleanly"],
    ] as const)(
      "says what %s means at the open without a word about ticks",
      async (kind, title) => {
        mocks.openSession.mockRejectedValue(new EngineError(kind));
        render(<ToolClient />);
        await chooseFile(pdfFile());

        const error = await screen.findByTestId("error");
        expect(
          within(error).getByRole("heading", { level: 2, name: title }),
        ).toBeVisible();
        expect(error).toHaveTextContent("Printing it to a new PDF");
        expect(error).not.toHaveTextContent(/ticked/);
      },
    );
  });

  /** AC-20: after every step change, focus lands where *Focus* says. */
  describe("focus", () => {
    it("moves to the file bar's button when a file is chosen, and stays when it opens", async () => {
      await openFlow(controllable().session);

      expect(
        within(screen.getByTestId("file-bar")).getByRole("button", {
          name: "Choose another PDF",
        }),
      ).toHaveFocus();
    });

    /**
     * The checklist the focused box sat in goes while the new file opens, so
     * without the move focus would fall to the page body.
     */
    it("moves to the file bar's button when a replacement is dropped from inside the list", async () => {
      await openFlow(controllable().session);
      act(() => box("ann@example.com").focus());

      await dropOnFileBar(pdfFile("second.pdf"));
      await within(screen.getByTestId("file-bar")).findByText("second.pdf");
      await screen.findByTestId("review");

      expect(
        within(screen.getByTestId("file-bar")).getByRole("button", {
          name: "Choose another PDF",
        }),
      ).toHaveFocus();
    });

    it("stays where it was when a replace confirm is cancelled", async () => {
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      await openFlow(controllable().session);
      await userEvent.setup().click(box("020 7946 0958"));

      await dropOnFileBar(pdfFile("second.pdf"));

      expect(confirm).toHaveBeenCalledTimes(1);
      expect(mocks.openSession).toHaveBeenCalledTimes(1);
      expect(box("020 7946 0958")).toHaveFocus();
      expect(box("020 7946 0958")).toBeChecked();
    });

    it("moves to Cancel on Redact, and back to Redact on Cancel", async () => {
      await openFlow(controllable().session);
      const user = userEvent.setup();

      await user.click(screen.getByTestId("redact"));
      expect(screen.getByTestId("cancel")).toHaveFocus();

      await user.click(screen.getByTestId("cancel"));
      expect(await screen.findByTestId("redact")).toHaveFocus();
    });

    it("moves to the result card's heading when the run completes, then to Redact another PDF on Download", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();
      await user.click(screen.getByTestId("redact"));

      await run.finish();
      expect(
        screen.getByRole("heading", { level: 2, name: "Your redacted file is ready" }),
      ).toHaveFocus();

      await user.click(screen.getByTestId("download"));
      expect(screen.getByTestId("redact-another")).toHaveFocus();
    });

    it("moves to Cancel on Make it again", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();
      await user.click(screen.getByTestId("redact"));
      await run.finish();
      await user.click(screen.getByTestId("download"));

      await user.click(screen.getByTestId("make-again"));

      expect(screen.getByTestId("cancel")).toHaveFocus();
    });

    it("moves to the refusal's heading when a run is refused", async () => {
      const run = controllable();
      await openFlow(run.session);
      await userEvent.setup().click(screen.getByTestId("redact"));

      await run.refuse("slanted-text");

      expect(
        screen.getByRole("heading", {
          level: 2,
          name: "A ticked item is set at too steep an angle",
        }),
      ).toHaveFocus();
    });

    it("moves to the failure's heading when an open fails", async () => {
      mocks.openSession.mockRejectedValue(new EngineError("not-pdf"));
      render(<ToolClient />);
      await chooseFile(pdfFile());

      expect(
        await screen.findByRole("heading", { level: 2, name: "This isn't a PDF" }),
      ).toHaveFocus();
    });

    it("moves to Try again when the worker is lost, then to the file bar on Try again", async () => {
      mocks.openSession.mockImplementation(hangsAt("opening"));
      render(<ToolClient />);
      await chooseFile(pdfFile());
      await screen.findByTestId("progress");

      await fireEngineLost();
      expect(screen.getByTestId("retry")).toHaveFocus();

      await userEvent.setup().click(screen.getByTestId("retry"));
      expect(
        within(screen.getByTestId("file-bar")).getByRole("button", {
          name: "Choose another PDF",
        }),
      ).toHaveFocus();
    });

    it("moves to the full drop zone's button on Start over and on Redact another PDF", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();

      await user.click(screen.getByTestId("start-over"));
      expect(screen.getByRole("button", { name: "Choose a PDF" })).toHaveFocus();

      await chooseFile(pdfFile());
      await screen.findByTestId("review");
      await user.click(screen.getByTestId("redact"));
      await run.finish();
      await user.click(screen.getByTestId("download"));
      await user.click(screen.getByTestId("redact-another"));
      expect(screen.getByRole("button", { name: "Choose a PDF" })).toHaveFocus();
    });

    it("never leaves focus on the page body after a step change", async () => {
      const run = controllable();
      await openFlow(run.session);
      const user = userEvent.setup();

      await user.click(screen.getByTestId("redact"));
      expect(document.activeElement).not.toBe(document.body);
      await run.refuse("unsupported");
      expect(document.activeElement).not.toBe(document.body);
      await user.click(screen.getByTestId("redact"));
      await run.finish();
      expect(document.activeElement).not.toBe(document.body);
    });
  });
});

/**
 * Spec 0011, AC-5. Choosing a PDF is agreeing to the terms, so the line saying
 * so sits under the full drop zone whenever it shows, outside the polite live
 * region, and goes once the file bar replaces the zone.
 */
describe("the terms notice (spec 0011, AC-5)", () => {
  const NOTICE =
    "By choosing a PDF you agree to the Terms of service. The Privacy policy explains what happens to your data.";

  it("reads in full under the drop zone while nothing is open, with its two links", async () => {
    const { container } = render(<ToolClient />);

    const notice = screen.getByTestId("terms-notice");
    expect(notice).toHaveTextContent(NOTICE);
    expect(notice.previousElementSibling).toBe(screen.getByTestId("drop-area"));
    expect(
      within(notice)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Terms of service", "/terms"],
      ["Privacy policy", "/privacy"],
    ]);
    for (const link of within(notice).getAllByRole("link")) {
      expect(link).not.toHaveAttribute("target");
    }
    expect(notice.closest("[aria-live]")).toBeNull();
    expect(notice).toHaveClass("text-small", "text-ink-muted");
    await expectNoAxeViolations(container);
  });

  it("goes once a file is chosen and the file bar takes the zone's place", async () => {
    mocks.openSession.mockImplementation(hangsAt("opening"));
    render(<ToolClient />);
    await chooseFile(pdfFile());

    await screen.findByTestId("file-bar");
    expect(screen.queryByTestId("terms-notice")).not.toBeInTheDocument();
  });

  it("stays gone once the document is open", async () => {
    render(<ToolClient />);
    await chooseFile(pdfFile());

    await within(await screen.findByTestId("file-bar")).findByTestId("page-count");
    expect(screen.queryByTestId("terms-notice")).not.toBeInTheDocument();
  });

  it("comes back with the full drop zone after Start over and under a failed open", async () => {
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await within(await screen.findByTestId("file-bar")).findByTestId("page-count");

    await userEvent.setup().click(screen.getByTestId("start-over"));
    expect(screen.getByTestId("terms-notice")).toHaveTextContent(NOTICE);

    mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
    await chooseFile(pdfFile());
    await screen.findByTestId("error");
    expect(screen.getByTestId("terms-notice").previousElementSibling).toBe(
      screen.getByTestId("drop-area"),
    );
  });
});
