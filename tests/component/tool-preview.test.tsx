/**
 * When `/tool` shows the page preview, P (spec 0026 child 0002, AC-37, AC-39
 * and AC-48), decided in `ToolClient`: while the window fits, the browser can
 * show a picture, and the session is reviewing or in a run Redact started.
 *
 * The same module boundaries as `tool-client.test.tsx`, plus two: the fit and
 * the probe (`preview-fit`), which the test sets, and P itself, stubbed to an
 * `aside` that records what `ToolClient` hands it, since P has its own suite
 * (`page-preview.test.tsx`).
 */

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ToolClient } from "@/app/tool/tool-client";
import type { DrawAsk, OpenedSession, RedactedOutput } from "@/worker/client";
import type { SupportReport } from "@/lib/support";
import {
  asMatchId,
  type DocumentSummary,
  type EntitlementSnapshot,
  type PageDrawnMessage,
  type RedactionOutcome,
  type ReviewMatch,
} from "@/worker/protocol";

const mocks = vi.hoisted(() => ({
  warmEngine: vi.fn(),
  releaseEngine: vi.fn(),
  openSession: vi.fn(),
  getEntitlement: vi.fn(),
  getSupport: vi.fn(),
  offerDownload: vi.fn(),
  fits: true,
  can: true,
  fitListeners: new Set<() => void>(),
  previewProps: [] as {
    running: boolean;
    draw: (ask: DrawAsk) => Promise<unknown>;
  }[],
}));

vi.mock("@/worker/client", () => ({
  warmEngine: mocks.warmEngine,
  releaseEngine: mocks.releaseEngine,
  openSession: mocks.openSession,
  onEngineLost: () => () => {},
}));

vi.mock("@/lib/download", () => ({ offerDownload: mocks.offerDownload }));

vi.mock("@/lib/entitlement", () => ({
  getEntitlement: mocks.getEntitlement,
  askAtLoad: vi.fn(),
  askWhenVisible: vi.fn(),
  askAgain: vi.fn(),
  readEntitlement: () => null,
  subscribeEntitlement: () => () => {},
}));

vi.mock("@/lib/support", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/support")>()),
  getSupport: mocks.getSupport,
}));

vi.mock("@/lib/document-load", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/document-load")>()),
  loadedAt: () => "/tool",
  currentPath: () => "/tool",
  reloadDocument: vi.fn(),
}));

vi.mock("@/app/tool/preview-fit", () => ({
  readPreviewFit: () => mocks.fits,
  subscribePreviewFit: (listener: () => void) => {
    mocks.fitListeners.add(listener);
    return () => mocks.fitListeners.delete(listener);
  },
  previewSupported: () => mocks.can,
}));

vi.mock("@/app/tool/page-preview", () => ({
  PagePreview: (props: {
    running: boolean;
    draw: (ask: DrawAsk) => Promise<unknown>;
  }) => {
    mocks.previewProps.push(props);
    return (
      <aside
        aria-label="Page preview"
        data-testid="area-preview"
        data-running={props.running ? "" : undefined}
      />
    );
  },
}));

const SUPPORTED: SupportReport = Object.freeze({ supported: true, missing: [] });

const FREE: EntitlementSnapshot = Object.freeze({
  tier: "free",
  pageCap: 3,
  maxFileBytes: 20 * 1024 * 1024,
  account: "none",
});

const SUMMARY: DocumentSummary = Object.freeze({
  pageCount: 2,
  pages: Object.freeze([
    Object.freeze({ findings: [] }),
    Object.freeze({ findings: [] }),
  ]) as DocumentSummary["pages"],
});

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
    term: null,
    termNotes: [],
  },
]);

const OUTCOME: RedactionOutcome = {
  pageCount: 2,
  removedByType: { email: 1 },
  pagesByFinding: {},
  sanitized: [],
};

/** A session whose runs wait for the test to finish them. */
function sessionWithRuns() {
  let finish!: (value: RedactedOutput) => void;
  const session: OpenedSession = {
    jobId: "job",
    summary: SUMMARY,
    matches: MATCHES,
    redact: vi.fn(
      () =>
        new Promise<RedactedOutput>((resolve) => {
          finish = resolve;
        }),
    ),
    findTerms: vi.fn(),
    draw: vi.fn(async (ask: DrawAsk) => ({
      id: "draw",
      jobId: "job",
      kind: "page-drawn" as const,
      page: ask.page,
      purpose: ask.purpose,
      picture: null,
      boxes: [],
    })),
    cancel: vi.fn(),
    release: vi.fn(),
  };
  return {
    session,
    finish: async () => {
      await act(async () =>
        finish({ output: new ArrayBuffer(8), outcome: OUTCOME, removedByTerm: [] }),
      );
    },
  };
}

async function openReview(): Promise<ReturnType<typeof sessionWithRuns>> {
  const run = sessionWithRuns();
  mocks.openSession.mockResolvedValue(run.session);
  render(<ToolClient />);
  await userEvent
    .setup()
    .upload(
      screen.getByTestId("file-input"),
      new File(["%PDF-1.4"], "report.pdf", { type: "application/pdf" }),
    );
  await screen.findByTestId("area-found");
  return run;
}

function fitsNow(fits: boolean): void {
  act(() => {
    mocks.fits = fits;
    for (const listener of mocks.fitListeners) listener();
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fits = true;
  mocks.can = true;
  mocks.fitListeners.clear();
  mocks.previewProps.length = 0;
  mocks.getSupport.mockReturnValue(SUPPORTED);
  mocks.getEntitlement.mockResolvedValue(FREE);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("when the preview shows (AC-37)", () => {
  it("is not on the page before a document is open", () => {
    render(<ToolClient />);
    expect(screen.queryByTestId("area-preview")).toBeNull();
    expect(screen.getByTestId("tool-grid")).not.toHaveAttribute("data-preview");
  });

  it("shows while reviewing, after the found items in the page, and marks the grid", async () => {
    await openReview();
    const preview = screen.getByTestId("area-preview");
    expect(screen.getByTestId("tool-grid")).toHaveAttribute("data-preview");
    // Reached last: every area comes before it in the page (AC-39).
    for (const id of ["area-document", "area-live", "area-rail", "area-found"]) {
      expect(
        screen.getByTestId(id).compareDocumentPosition(preview) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.getByTestId("tool-grid").style.getPropertyValue("--tool-columns")).toBe(
      "minmax(0, 1fr) 26.25rem",
    );
  });

  it("goes and comes back with the window's fit", async () => {
    await openReview();
    fitsNow(false);
    expect(screen.queryByTestId("area-preview")).toBeNull();
    expect(screen.getByTestId("tool-grid").style.getPropertyValue("--tool-columns")).toBe(
      "minmax(0, 44rem)",
    );
    fitsNow(true);
    expect(screen.getByTestId("area-preview")).toBeInTheDocument();
  });

  it("never shows in a browser that cannot show a transferred picture", async () => {
    mocks.can = false;
    await openReview();
    expect(screen.queryByTestId("area-preview")).toBeNull();
  });

  it("stays through a run Redact started, sending no draw, and goes at complete", async () => {
    const run = await openReview();
    await userEvent.setup().click(screen.getByTestId("redact"));
    expect(screen.getByTestId("area-preview")).toHaveAttribute("data-running");

    await run.finish();
    expect(screen.queryByTestId("area-preview")).toBeNull();
  });

  it("stays off through Make it again from complete", async () => {
    const run = await openReview();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("redact"));
    await run.finish();
    await user.click(screen.getByTestId("download"));
    await user.click(screen.getByTestId("make-again"));

    expect(run.session.redact).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId("area-preview")).toBeNull();
  });
});

describe("the draw the preview is handed (AC-48)", () => {
  it("asks the open session, under its own job", async () => {
    const run = await openReview();
    const { draw } = mocks.previewProps.at(-1) ?? {};
    const ask: DrawAsk = { page: 2, purpose: "page", width: 800, maxPixels: 1_048_576 };
    const reply = (await draw?.(ask)) as PageDrawnMessage | undefined;
    expect(run.session.draw).toHaveBeenCalledWith(ask);
    expect(reply).toMatchObject({ page: 2, picture: null });
  });

  it("is one stable callback across renders", async () => {
    await openReview();
    fitsNow(false);
    fitsNow(true);
    const draws = new Set(mocks.previewProps.map((props) => props.draw));
    expect(draws.size).toBe(1);
  });
});
