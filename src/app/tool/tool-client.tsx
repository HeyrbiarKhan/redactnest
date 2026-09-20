"use client";

import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { config } from "@/config";
import { getEntitlement, prefetchEntitlement } from "@/lib/entitlement";
import {
  hasUnsavedWork,
  IDLE,
  sessionReducer,
  type LiveSession,
  type ToolSession,
} from "@/lib/session";
import { getSupport, SUPPORT_GAP_TEXT, type SupportReport } from "@/lib/support";
import {
  EngineError,
  type EngineErrorKind,
  type EntitlementSnapshot,
  type ProgressPhase,
} from "@/worker/protocol";
import { onEngineLost, openSession, releaseEngine, warmEngine } from "@/worker/client";

/**
 * Plain wording for each failure kind. Feature 8 owns the real treatment.
 *
 * A function of the job's own caps rather than a constant map, because the page
 * cap that applies is the one frozen into this session, not the paid ceiling.
 * Telling somebody they exceeded a limit that was never theirs is the confusion
 * spec 0002 closed.
 */
function errorText(kind: EngineErrorKind, entitlement: EntitlementSnapshot): string {
  switch (kind) {
    case "engine-unavailable":
      return "The PDF engine could not be loaded. Check your connection and try again.";
    case "encrypted":
      return "This PDF is encrypted, so its text cannot be read.";
    case "password-required":
      return "This PDF needs a password before it can be opened.";
    case "corrupt":
      return "This file could not be read as a PDF.";
    case "too-large":
      return `This file is larger than the ${formatBytes(entitlement.maxFileBytes)} limit.`;
    case "too-many-pages":
      return `This document has more than the ${entitlement.pageCap} page limit.`;
    case "file-unreadable":
      return "This file could not be read. It may have been moved, renamed or deleted since you chose it.";
    case "unsupported":
      return "Something went wrong opening this file.";
  }
}

const PHASE_TEXT: Record<ProgressPhase, string> = {
  "checking-entitlement": "Checking your plan",
  "loading-engine": "Loading the PDF engine",
  opening: "Opening your document",
  inspecting: "Checking each page",
  detecting: "Looking for sensitive details",
  redacting: "Removing the text you ticked",
  writing: "Writing your clean file",
};

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Browser support cannot change while the page is open, so there is nothing to
 * subscribe to and nothing to detect on the server. */
const NEVER_CHANGES = () => () => {};
const SERVER_SNAPSHOT = () => null;

const REPLACE_WARNING =
  "You have unsaved work on the document that is open. Opening a different file will discard it. Continue?";

export function ToolClient() {
  // The server snapshot is null, so the prerendered HTML shows the drop area for
  // everyone and hydration has nothing to disagree about. The real answer
  // arrives on the client, right after.
  const support = useSyncExternalStore<SupportReport | null>(
    NEVER_CHANGES,
    getSupport,
    SERVER_SNAPSHOT,
  );

  const [session, dispatch] = useReducer(sessionReducer, IDLE as ToolSession);
  const [dragging, setDragging] = useState(false);

  /**
   * The one window the session cannot describe: after a file is chosen and
   * before the job exists, while a prefetch that has not landed is waited for.
   * The entitlement is frozen into the session at open, so there is nothing to
   * hang a phase on until it resolves.
   */
  const [checkingEntitlement, setCheckingEntitlement] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Read the whole session without re-subscribing every render.
   *
   * The page level listeners below are attached once and have to see the current
   * session when they fire, not the one that existed when they were attached.
   */
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /** Warm what a chosen file will need: the engine, and the caps that apply. */
  const warm = useCallback(() => {
    warmEngine();
    prefetchEntitlement();
  }, []);

  /**
   * Open a document, from a fresh choice or from a retry after a lost worker.
   *
   * The `File` is a handle to a file already on the visitor's disk, not a copy
   * of it, so this reads it each time rather than holding its bytes.
   */
  const runOpen = useCallback(
    async (job: { jobId: string; file: File; entitlement: EntitlementSnapshot }) => {
      let bytes: ArrayBuffer;
      try {
        bytes = await job.file.arrayBuffer();
      } catch {
        // The file moved, was deleted, or had its permission revoked between
        // being chosen and being read. Its own kind, so feature 8 can say
        // something useful rather than falling through to `unsupported`.
        dispatch({ type: "failed", failure: "file-unreadable" });
        return;
      }

      try {
        const opened = await openSession({
          jobId: job.jobId,
          bytes,
          // The snapshot's cap, never `config.maxPages`. This line is the free
          // page cap being enforced at all (INV-5).
          limits: {
            maxBytes: job.entitlement.maxFileBytes,
            maxPages: job.entitlement.pageCap,
          },
          onProgress: (phase) => dispatch({ type: "progress", phase }),
        });

        dispatch({
          type: "opened",
          summary: opened.summary,
          matches: opened.matches,
        });
      } catch (error) {
        if (!(error instanceof EngineError)) {
          // A cancel or a release, not a failure. The reducer already moved on.
          return;
        }
        dispatch({ type: "failed", failure: error.errorKind });
      }
    },
    [],
  );

  const handleFile = useCallback(
    async (file: File) => {
      // AC-1: one tab, one session. Replacing one with work in it asks first.
      if (hasUnsavedWork(sessionRef.current) && !window.confirm(REPLACE_WARNING)) {
        return;
      }

      // Choosing a file is a release trigger. The previous worker, and
      // everything it held, goes before the next document arrives.
      releaseEngine();

      setCheckingEntitlement(false);
      const entitlement = await getEntitlement({
        onWaiting: () => setCheckingEntitlement(true),
      });
      setCheckingEntitlement(false);

      const jobId = crypto.randomUUID();
      dispatch({ type: "file-chosen", jobId, file, entitlement });
      await runOpen({ jobId, file, entitlement });
    },
    [runOpen],
  );

  /** AC-11: retry from the handle we kept, with no second trip to the picker. */
  const handleRetry = useCallback(() => {
    const current = sessionRef.current;
    if (current.state !== "lost") return;

    dispatch({ type: "retry" });
    void runOpen({
      jobId: current.jobId,
      file: current.file,
      // INV-5: the same job, so the same frozen snapshot it started on.
      entitlement: current.entitlement,
    });
  }, [runOpen]);

  const handleStartOver = useCallback(() => {
    releaseEngine();
    dispatch({ type: "released" });
  }, []);

  /**
   * A worker that dies mid job is the one recoverable failure (AC-11).
   *
   * The dead worker is dropped here so the retry starts a fresh one, and the
   * session moves to `lost` rather than to a dead end.
   */
  useEffect(() => {
    return onEngineLost(() => {
      releaseEngine();
      dispatch({ type: "worker-lost" });
    });
  }, []);

  /**
   * AC-13. The browser's own warning, and only when there is something to lose.
   *
   * Attached only while `hasUnsavedWork` is true, because a page that registers
   * this listener unconditionally is a page that nags on the way out of an
   * untouched checklist.
   */
  const unsaved = hasUnsavedWork(session);
  useEffect(() => {
    if (!unsaved) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  /**
   * AC-12 and INV-6. Leaving the page ends the session, whether or not the page
   * is coming back.
   *
   * `pagehide` rather than `unload`, which a page kept for the back forward
   * cache never fires. A page restored from that cache resumes with its
   * JavaScript state intact but its worker gone, so the reset on the way back in
   * is what stops somebody seeing a checklist that points at nothing.
   */
  useEffect(() => {
    const release = () => releaseEngine();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) dispatch({ type: "released" });
    };

    window.addEventListener("pagehide", release);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", release);
      window.removeEventListener("pageshow", restore);
    };
  }, []);

  if (support && !support.supported) {
    return (
      <section
        data-testid="unsupported"
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-current/20 p-6"
      >
        <h2 className="font-medium">RedactNest cannot run in this browser</h2>
        {support.missing.map((gap) => (
          <p key={gap} className="text-sm opacity-80">
            {SUPPORT_GAP_TEXT[gap]}
          </p>
        ))}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <div
        data-testid="drop-area"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
          warm();
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void handleFile(file);
        }}
        onPointerEnter={warm}
        className={`rounded-lg border-2 border-dashed p-10 text-center transition-colors ${
          dragging ? "border-current" : "border-current/30"
        }`}
      >
        <p className="text-sm opacity-80">
          Drop a PDF here, or choose one. Up to {config.freePageCap} pages for now.
        </p>

        <input
          ref={inputRef}
          data-testid="file-input"
          type="file"
          accept="application/pdf"
          className="sr-only"
          onFocus={warm}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // AC-2: the input keeps no `FileList` once the file is in hand.
            // Clearing it also makes choosing the same file twice in a row fire
            // a change event, which it otherwise would not.
            event.target.value = "";
            if (file) void handleFile(file);
          }}
        />

        <button
          type="button"
          data-testid="choose-file"
          onFocus={warm}
          onClick={() => inputRef.current?.click()}
          className="mt-4 rounded-md border border-current/40 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Choose a PDF
        </button>
      </div>

      <div aria-live="polite" className="min-h-6 text-sm">
        {checkingEntitlement && (
          <p data-testid="progress">{PHASE_TEXT["checking-entitlement"]}…</p>
        )}

        {!checkingEntitlement && (
          <SessionStatus session={session} onRetry={handleRetry} />
        )}
      </div>

      {session.state !== "idle" && (
        <div>
          <button
            type="button"
            data-testid="start-over"
            onClick={handleStartOver}
            className="rounded-md border border-current/40 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Start over
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * What the current step looks like.
 *
 * The checklist itself belongs to features 6 and 8. This reports the session
 * honestly in the meantime, which is what the browser tests read.
 */
function SessionStatus({
  session,
  onRetry,
}: {
  session: ToolSession;
  onRetry: () => void;
}) {
  if (session.state === "idle") return null;

  switch (session.state) {
    case "opening":
    case "redacting":
      return session.phase ? (
        <p data-testid="progress">{PHASE_TEXT[session.phase]}…</p>
      ) : null;

    case "failed":
      return (
        <p data-testid="error" role="alert">
          {errorText(session.failure ?? "unsupported", session.entitlement)}
        </p>
      );

    case "lost":
      return (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p data-testid="lost">
            The PDF engine stopped unexpectedly. Your file is still on your machine, so
            you can try again without choosing it a second time.
          </p>
          <button
            type="button"
            data-testid="retry"
            onClick={onRetry}
            className="rounded-md border border-current/40 px-4 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Try again
          </button>
        </div>
      );

    case "reviewing":
    case "complete":
      return <OpenedDocument session={session} />;
  }
}

function OpenedDocument({ session }: { session: LiveSession }) {
  const { summary } = session;
  if (!summary) return null;

  const withText = summary.pagesWithText.filter(Boolean).length;

  return (
    <div className="flex flex-col gap-1">
      <p data-testid="page-count">
        Opened. {summary.pageCount} {summary.pageCount === 1 ? "page" : "pages"}.
      </p>
      <p data-testid="text-layer-count" className="opacity-80">
        {withText} of {summary.pageCount} have a text layer.
      </p>
    </div>
  );
}
