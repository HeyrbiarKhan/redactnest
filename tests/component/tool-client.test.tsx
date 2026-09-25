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
 * reachable, and they are tested with the redaction path at the end of this
 * file. A changed tick waits for the checklist features 6 and 8 build.
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToolClient } from "@/app/tool/tool-client";
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
  prefetchEntitlement: vi.fn(),
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
  prefetchEntitlement: mocks.prefetchEntitlement,
}));

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
});

const PAID: EntitlementSnapshot = Object.freeze({
  tier: "paid",
  pageCap: 50,
  maxFileBytes: 100 * 1024 * 1024,
});

const SUMMARY: DocumentSummary = Object.freeze({
  pageCount: 2,
  pagesWithText: Object.freeze([true, false]) as readonly boolean[],
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
    expect(error).toHaveTextContent("This document has more than the 3 page limit.");
    // The bug spec 0002 closed: quoting a limit that was never this visitor's.
    expect(error).not.toHaveTextContent("50");
  });

  it("quotes the paid cap to a paid visitor, so the message follows the job", async () => {
    mocks.getEntitlement.mockResolvedValue(PAID);
    mocks.openSession.mockRejectedValue(new EngineError("too-many-pages"));
    render(<ToolClient />);

    await chooseFile(pdfFile());

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This document has more than the 50 page limit.",
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

    await userEvent.setup().click(screen.getByRole("button", { name: "Start over" }));

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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This file could not be read. It may have been moved, renamed or deleted since you chose it.",
    );
  });

  it("stays terminal after a document failed, because a dead worker cannot fix it", async () => {
    mocks.openSession.mockRejectedValue(new EngineError("corrupt"));
    render(<ToolClient />);
    await chooseFile(pdfFile());
    await screen.findByRole("alert");

    await fireEngineLost();

    expect(screen.queryByTestId("lost")).not.toBeInTheDocument();
    expect(screen.getByTestId("error")).toHaveTextContent(
      "This PDF could not be read. It may be damaged.",
    );
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
    expect(progress).toHaveTextContent("Checking each page…");
  });

  it("holds the opened document card", async () => {
    const { container } = render(<ToolClient />);

    await chooseFile(pdfFile());
    const pageCount = await screen.findByTestId("page-count");

    expect(container.querySelector(POLITE)).toContainElement(pageCount);
    expect(screen.getByRole("region", { name: "Document opened" })).toContainElement(
      pageCount,
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
    expect(mocks.prefetchEntitlement).not.toHaveBeenCalled();
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
    expect(mocks.prefetchEntitlement).not.toHaveBeenCalled();
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
      tickedByDefault: true,
    },
    {
      id: asMatchId("m2"),
      type: "phone",
      page: 1,
      text: "020 7946 0958",
      before: "or ",
      after: ".",
      tickedByDefault: false,
    },
  ]);

  const OUTCOME: RedactionOutcome = Object.freeze<RedactionOutcome>({
    pageCount: 2,
    removedByType: { email: 2, phone: 1 },
    pagesWithoutText: 1,
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
    expect(screen.getByTestId("progress")).toHaveTextContent("Checking your clean file");
  });

  it("shows the one line outcome and a Download button when the run completes", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish();

    expect(screen.getByTestId("outcome")).toHaveTextContent(
      "Removed 3 items and stripped document info, XMP metadata and annotations.",
    );
    expect(screen.getByTestId("download")).toBeInTheDocument();
    expect(screen.queryByTestId("cancel")).not.toBeInTheDocument();
  });

  it.each([
    [
      { ...OUTCOME, removedByType: {}, sanitized: [] },
      "Removed 0 items. There was nothing else to strip.",
    ],
    [
      { ...OUTCOME, removedByType: { email: 1 }, sanitized: ["bookmarks"] },
      "Removed 1 item and stripped bookmarks.",
    ],
    [
      { ...OUTCOME, removedByType: {}, sanitized: ["javascript", "page-thumbnails"] },
      "Removed 0 items and stripped JavaScript and page thumbnails.",
    ],
  ] as const)("words the outcome plainly: %j", async (outcome, expected) => {
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish(new ArrayBuffer(8), outcome as RedactionOutcome);

    expect(screen.getByTestId("outcome")).toHaveTextContent(expected);
  });

  it("hands the output over under the output name, then takes Download away", async () => {
    const output = new ArrayBuffer(32);
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.finish(output);

    await userEvent.setup().click(screen.getByTestId("download"));

    expect(mocks.offerDownload).toHaveBeenCalledTimes(1);
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
    ["not-pdf", "This file is not a PDF."],
    ["hidden-layers", "layers that can be switched on and off"],
  ] as const)(
    "says what %s means when a document is refused at open",
    async (kind, words) => {
      mocks.openSession.mockRejectedValue(new EngineError(kind));
      render(<ToolClient />);
      await chooseFile(pdfFile());

      expect(await screen.findByRole("alert")).toHaveTextContent(words);
    },
  );

  it("says a run could not be proved clean, and offers no file", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);
    await run.fail(new EngineError("redaction-incomplete"));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "could not confirm that everything was removed",
    );
    expect(screen.queryByTestId("download")).not.toBeInTheDocument();
    expect(screen.queryByTestId("outcome")).not.toBeInTheDocument();
  });

  /** Spec 0004, AC-25, with the lines *Settled here* fixes until feature 8. */
  it.each([
    [
      "redaction-overreach",
      "Removing what you ticked would also remove words you did not tick, so no file was made.",
    ],
    [
      "replacement-text",
      "A ticked item sits inside hidden replacement text that cannot be removed safely, so no file was made.",
    ],
  ] as const)(
    "says what %s means after a run, and offers no file",
    async (kind, words) => {
      const run = sessionWithRun();
      await openAndRedact(run);
      await run.fail(new EngineError(kind));

      expect(screen.getByRole("alert")).toHaveTextContent(words);
      expect(screen.queryByTestId("download")).not.toBeInTheDocument();
      expect(screen.queryByTestId("outcome")).not.toBeInTheDocument();
    },
  );

  it("drops a reply that arrives after starting over", async () => {
    const run = sessionWithRun();
    await openAndRedact(run);

    await userEvent.setup().click(screen.getByTestId("start-over"));
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
