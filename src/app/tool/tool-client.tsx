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
import { currentPath, loadedAt, loadGuard, reloadDocument } from "@/lib/document-load";
import { offerDownload } from "@/lib/download";
import { getEntitlement, prefetchEntitlement } from "@/lib/entitlement";
import { TOOL_PATH } from "@/lib/routes";
import {
  hasUnsavedWork,
  IDLE,
  sessionReducer,
  type LiveSession,
  type ToolSession,
} from "@/lib/session";
import { getSupport, SUPPORT_GAP_TEXT, type SupportReport } from "@/lib/support";
import { Download } from "lucide-react";

import {
  EngineError,
  OperationCancelled,
  type EngineErrorKind,
  type EntitlementSnapshot,
  type ProgressPhase,
  type RedactionOutcome,
  type SanitizedKind,
} from "@/worker/protocol";
import {
  onEngineLost,
  openSession,
  releaseEngine,
  warmEngine,
  type OpenedSession,
} from "@/worker/client";
import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";
import { Card } from "@/ui/card";
import { DropZone } from "@/ui/drop-zone";
import { Spinner } from "@/ui/spinner";

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
      return "This PDF could not be read. It may be damaged.";
    case "too-large":
      return `This file is larger than the ${formatBytes(entitlement.maxFileBytes)} limit.`;
    case "too-many-pages":
      return `This document has more than the ${entitlement.pageCap} page limit.`;
    case "file-unreadable":
      return "This file could not be read. It may have been moved, renamed or deleted since you chose it.";
    case "unsupported":
      return "Something went wrong while working on this file.";
    case "not-pdf":
      return "This file is not a PDF. RedactNest works on PDF documents only.";
    case "hidden-layers":
      return "This PDF has layers that can be switched on and off, and RedactNest cannot redact those yet.";
    case "redaction-incomplete":
      return "RedactNest could not confirm that everything was removed from this PDF, so it did not make a file.";
    // Spec 0004, *Settled here*: the two lines are fixed until feature 8
    // writes the real copy.
    case "redaction-overreach":
      return "Removing what you ticked would also remove words you did not tick, so no file was made.";
    case "replacement-text":
      return "A ticked item sits inside hidden replacement text that cannot be removed safely, so no file was made.";
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
  verifying: "Checking your clean file",
};

function formatBytes(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/** Plain words for each thing a run strips. Feature 8 owns the real treatment. */
const SANITIZED_TEXT: Record<SanitizedKind, string> = {
  "document-info": "document info",
  "xmp-metadata": "XMP metadata",
  annotations: "annotations",
  "form-fields": "form fields",
  attachments: "attachments",
  bookmarks: "bookmarks",
  "hidden-layers": "hidden layers",
  javascript: "JavaScript",
  "incremental-versions": "earlier versions",
  "page-thumbnails": "page thumbnails",
  "accessibility-tags": "accessibility tags",
};

/** `a`, `a and b`, `a, b and c`. */
function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/**
 * Spec 0004, AC-19. The one line outcome: how many items were removed and what
 * was stripped. Counts and kinds only, because that is all `outcome` carries.
 * Feature 8 restyles this, and makes a run with nothing removed impossible to
 * mistake for a redaction.
 */
function outcomeText(outcome: RedactionOutcome): string {
  const removed = Object.values(outcome.removedByType).reduce<number>(
    (total, count) => total + (count ?? 0),
    0,
  );
  const items = `${removed} ${removed === 1 ? "item" : "items"}`;

  if (outcome.sanitized.length === 0) {
    return `Removed ${items}. There was nothing else to strip.`;
  }
  return `Removed ${items} and stripped ${listOf(
    outcome.sanitized.map((kind) => SANITIZED_TEXT[kind]),
  )}.`;
}

/**
 * Did this session lose its worker before the engine had finished loading?
 *
 * `loading-engine` is the engine's own download and compile, and a null phase is
 * the moment before even that has been reported. A worker lost in that window
 * never opened anything, so reading the file again costs a visitor a slower open
 * rather than an error they can do nothing with. Anything later is a session
 * that was really running, and that is the failure AC-11 asks us to report and
 * offer a retry on.
 */
function loadNeverFinished(session: ToolSession): session is LiveSession {
  return (
    session.state === "opening" &&
    (session.phase === null || session.phase === "loading-engine")
  );
}

/** Browser support cannot change while the page is open, so there is nothing to
 * subscribe to and nothing to detect on the server. */
const NEVER_CHANGES = () => () => {};
const SERVER_SNAPSHOT = () => null;

/**
 * The prerendered HTML is only ever used by a document the browser loaded at
 * `/tool`, so that is the honest server answer for both the load and the
 * address bar, and hydration agrees with it.
 */
const TOOL_PATH_SERVER_SNAPSHOT = () => TOOL_PATH;

const REPLACE_WARNING =
  "You have unsaved work on the document that is open. Opening a different file will discard it. Continue?";

export function ToolClient() {
  /**
   * Spec 0003, AC-21 and INV-10. Was this document loaded at `/tool`?
   *
   * A content security policy belongs to the document it arrived with. If a
   * stray `next/link`, a `router.push` or a sign in library's redirect moved
   * this page here on the client, it is still running under the policy, and
   * with the scripts, of wherever it came from. So it takes no file at all and
   * reloads, which gives the tool its own document. `null` means the browser
   * did not say, and the page works as it always has.
   *
   * INV-11: it reloads only when the address bar reads `/tool`, so the load it
   * asks for is one that passes. Anywhere else it waits for a click, and lint
   * keeps every page but `src/app/tool/page.tsx` from rendering it at all.
   */
  const loadPath = useSyncExternalStore<string | null>(
    NEVER_CHANGES,
    loadedAt,
    TOOL_PATH_SERVER_SNAPSHOT,
  );
  const addressPath = useSyncExternalStore<string>(
    NEVER_CHANGES,
    currentPath,
    TOOL_PATH_SERVER_SNAPSHOT,
  );
  const guard = loadGuard(loadPath, addressPath);
  useEffect(() => {
    if (guard === "reload") reloadDocument();
  }, [guard]);

  // The server snapshot is null, so the prerendered HTML shows the drop area for
  // everyone and hydration has nothing to disagree about. The real answer
  // arrives on the client, right after.
  const support = useSyncExternalStore<SupportReport | null>(
    NEVER_CHANGES,
    getSupport,
    SERVER_SNAPSHOT,
  );

  const [session, dispatch] = useReducer(sessionReducer, IDLE as ToolSession);

  /**
   * The one window the session cannot describe: after a file is chosen and
   * before the job exists, while a prefetch that has not landed is waited for.
   * The entitlement is frozen into the session at open, so there is nothing to
   * hang a phase on until it resolves.
   */
  const [checkingEntitlement, setCheckingEntitlement] = useState(false);

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
   * Which open attempt the interface belongs to.
   *
   * An attempt outlives nothing: choosing a second file, starting over or
   * retrying supersedes the one before it, and a reply from a superseded
   * attempt must not land on the session that replaced it. The worker drops
   * replies for a job it no longer holds, but an attempt on the *same* job (a
   * retry) has no such marker, so the counter is kept here too.
   */
  const attemptRef = useRef(0);

  /** The one job an engine load failure has already been retried for. */
  const retriedJobRef = useRef<string | null>(null);

  /**
   * The open session's handle, so Redact and Cancel can reach the worker.
   *
   * A ref beside the reducer rather than inside it: the handle holds functions
   * and a worker, and `ToolSession` stays plain data (spec 0004).
   */
  const openedRef = useRef<OpenedSession | null>(null);

  /**
   * The redacted output, from the `redacted` reply until Download hands it over.
   *
   * Spec 0002 keeps the output out of `ToolSession` on purpose, so it waits here
   * (spec 0004, AC-20). This is the one document the main thread ever holds.
   */
  const outputRef = useRef<ArrayBuffer | null>(null);

  /**
   * Open a document, from a fresh choice or from a retry after a lost worker.
   *
   * The `File` is a handle to a file already on the visitor's disk, not a copy
   * of it, so this reads it each time rather than holding its bytes.
   */
  const runOpen = useCallback(
    async (job: { jobId: string; file: File; entitlement: EntitlementSnapshot }) => {
      const attempt = (attemptRef.current += 1);
      const current = () => attemptRef.current === attempt;
      openedRef.current = null;

      let bytes: ArrayBuffer;
      try {
        bytes = await job.file.arrayBuffer();
      } catch {
        // The file moved, was deleted, or had its permission revoked between
        // being chosen and being read. Its own kind, so feature 8 can say
        // something useful rather than falling through to `unsupported`.
        if (current()) dispatch({ type: "failed", failure: "file-unreadable" });
        return;
      }

      // Superseded while the file was being read. The bytes are dropped here
      // rather than handed over: transferring them would open a document for a
      // session that no longer exists, and the worker would hold it.
      if (!current()) return;

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
          onProgress: (phase) => {
            if (current()) dispatch({ type: "progress", phase });
          },
        });

        if (!current()) return;
        openedRef.current = opened;
        dispatch({
          type: "opened",
          summary: opened.summary,
          matches: opened.matches,
        });
      } catch (error) {
        if (!current()) return;
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

      // Deliberately no `releaseEngine()` here. The worker `warm()` started is
      // most likely mid download of the engine, and terminating it would throw
      // that away and pay for it again on the one action the product exists
      // for. Replacing a session does not need a new worker: `openSession`
      // retires the previous job on this side, and the worker ends it on the
      // other, which is what AC-1 actually asks for.

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
    // A genuine release trigger, so the worker goes. The attempt is superseded
    // with it, because a reply for the document just abandoned must not land on
    // whatever is opened next.
    attemptRef.current += 1;
    openedRef.current = null;
    releaseEngine();
    dispatch({ type: "released" });
  }, []);

  /**
   * Spec 0004, AC-19. Run a redaction over the current ticks.
   *
   * Guarded by the same attempt counter `runOpen` uses, without moving it: a
   * new file, a start over or a retry supersedes the document this run belongs
   * to, and a reply for it must then be dropped rather than shown (AC-20).
   */
  const handleRedact = useCallback(async () => {
    const live = sessionRef.current;
    const opened = openedRef.current;
    if (live.state !== "reviewing" || !opened) return;

    const attempt = attemptRef.current;
    const current = () => attemptRef.current === attempt;

    dispatch({ type: "redact-started" });

    try {
      const { output, outcome } = await opened.redact([...live.ticked], {
        onProgress: (phase) => {
          if (current()) dispatch({ type: "progress", phase });
        },
      });

      // Only a run that is still the one on screen gets to hand over a file.
      if (!current() || sessionRef.current.state !== "redacting") return;
      outputRef.current = output;
      dispatch({ type: "redacted", outcome });
    } catch (error) {
      if (!current()) return;
      if (error instanceof OperationCancelled) {
        // AC-17: back to the checklist, document still open.
        dispatch({ type: "cancelled" });
      } else if (error instanceof EngineError) {
        dispatch({ type: "failed", failure: error.errorKind });
      }
    }
  }, []);

  /** AC-17. The worker notices within a page; the checklist comes back now. */
  const handleCancel = useCallback(() => {
    openedRef.current?.cancel();
  }, []);

  /**
   * AC-19 and spec 0002, AC-4. Hand the file to the browser and let go of it.
   * The session stays at `complete`, so a tick can still be changed and run
   * again.
   */
  const handleDownload = useCallback(() => {
    const live = sessionRef.current;
    const output = outputRef.current;
    if (live.state !== "complete" || live.downloaded || !output) return;

    outputRef.current = null;
    offerDownload(output, live.outputName);
    dispatch({ type: "downloaded" });
  }, []);

  /**
   * AC-20. The output is dropped whenever the session stops being `complete`
   * with nothing downloaded: a tick change, start over, a replacement, a lost
   * worker. One effect watching that one fact, rather than a drop at each exit,
   * so an exit added later cannot forget it.
   */
  const holdsOutput = session.state === "complete" && !session.downloaded;
  useEffect(() => {
    if (!holdsOutput) outputRef.current = null;
  }, [holdsOutput]);

  /**
   * A worker that dies mid job is the one recoverable failure (AC-11).
   *
   * The dead worker is dropped here so the retry starts a fresh one, and the
   * session moves to `lost` rather than to a dead end.
   *
   * One exception, and only one: a worker that died before the engine had
   * finished loading never got as far as the document. That is a cold start
   * failing on the way up rather than a session dying, and it is worth one
   * silent second attempt before telling somebody their engine stopped. A
   * second failure for the same job is reported, so a real fault still surfaces
   * and the retry cannot loop.
   */
  useEffect(() => {
    return onEngineLost(() => {
      releaseEngine();
      openedRef.current = null;

      const live = sessionRef.current;
      if (loadNeverFinished(live) && retriedJobRef.current !== live.jobId) {
        retriedJobRef.current = live.jobId;

        // Both land in one render, so nobody sees the lost message flash past.
        dispatch({ type: "worker-lost" });
        dispatch({ type: "retry" });
        void runOpen({
          jobId: live.jobId,
          file: live.file,
          // INV-5: the same job, so the same frozen snapshot it started on.
          entitlement: live.entitlement,
        });
        return;
      }

      dispatch({ type: "worker-lost" });
    });
  }, [runOpen]);

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
    const release = () => {
      // The one exit that changes nothing in the session, so the effect above
      // cannot see it. A page kept in the back forward cache would otherwise
      // hold the output, frozen, for as long as it is kept.
      outputRef.current = null;
      releaseEngine();
    };
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

  // Ahead of the support check, so nothing about this document is trusted
  // before it is known to be the tool's own. No drop zone also means nothing
  // warms the engine or asks for the entitlement.
  if (guard === "reload") {
    return (
      <div aria-live="polite" className="flex flex-col gap-6">
        <StatusLine text="Loading the tool" />
      </div>
    );
  }

  // No `role`: nothing the visitor did caused this, and nothing moves them on
  // automatically, because a reload here would load this same wrong URL again.
  if (guard === "wrong-url") {
    return (
      <Callout
        tone="danger"
        data-testid="wrong-url"
        title="This page cannot open a document"
        headingLevel={2}
        action={
          <Button variant="secondary" href={TOOL_PATH} reload>
            Open the tool
          </Button>
        }
      >
        <p>The tool only works at its own address.</p>
      </Callout>
    );
  }

  if (support && !support.supported) {
    return (
      <Callout
        tone="danger"
        role="alert"
        data-testid="unsupported"
        title="RedactNest cannot run in this browser"
        headingLevel={2}
      >
        {support.missing.map((gap) => (
          <p key={gap}>{SUPPORT_GAP_TEXT[gap]}</p>
        ))}
      </Callout>
    );
  }

  return (
    <div className="flex flex-col">
      <DropZone
        title="Drop a PDF here, or choose one"
        helper={`Up to ${config.freePageCap} pages for now.`}
        buttonLabel="Choose a PDF"
        accept="application/pdf"
        onFile={(file) => void handleFile(file)}
        onWarm={warm}
      />

      {/*
        Spec 0003, AC-12. The polite region holds only what is worth hearing
        as it changes: the phase text and the opened document. A failure is an
        alert of its own and renders beside this, never inside it, or a screen
        reader would announce it twice. The margin appears only once there is
        something in here, because the region itself has to stay in the page
        from the start for its first announcement to be heard.
      */}
      <div aria-live="polite" className="flex flex-col gap-6 not-empty:mt-6">
        {checkingEntitlement ? (
          <StatusLine text={PHASE_TEXT["checking-entitlement"]} />
        ) : (
          <SessionStatus session={session} />
        )}
      </div>

      <SessionAlert session={session} onRetry={handleRetry} />

      {session.state !== "idle" && (
        <div className="mt-6 flex flex-wrap gap-3">
          <SessionAction
            session={session}
            onRedact={() => void handleRedact()}
            onCancel={handleCancel}
            onDownload={handleDownload}
          />
          <Button variant="secondary" data-testid="start-over" onClick={handleStartOver}>
            Start over
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Spec 0004, AC-19. The one action the current step offers: Redact while
 * reviewing, Cancel while a run is under way, Download until the file has been
 * handed over. The thin working path; feature 8 restyles it.
 *
 * Outside the live region on purpose, so a button appearing is not read out as
 * news. What the run is doing is announced by the phase line instead.
 */
function SessionAction({
  session,
  onRedact,
  onCancel,
  onDownload,
}: {
  session: LiveSession;
  onRedact: () => void;
  onCancel: () => void;
  onDownload: () => void;
}) {
  switch (session.state) {
    case "reviewing":
      return (
        <Button data-testid="redact" onClick={onRedact}>
          Redact
        </Button>
      );

    case "redacting":
      return (
        <Button variant="secondary" data-testid="cancel" onClick={onCancel}>
          Cancel
        </Button>
      );

    case "complete":
      return session.downloaded ? null : (
        <Button data-testid="download" icon={Download} onClick={onDownload}>
          Download
        </Button>
      );

    case "opening":
    case "failed":
    case "lost":
      return null;
  }
}

/**
 * What the current step looks like, for the polite live region.
 *
 * The checklist itself belongs to features 6 and 8. This reports the session
 * honestly in the meantime, which is what the browser tests read.
 */
function SessionStatus({ session }: { session: ToolSession }) {
  switch (session.state) {
    case "opening":
    case "redacting":
      return session.phase ? <StatusLine text={PHASE_TEXT[session.phase]} /> : null;

    case "reviewing":
      return <OpenedDocument session={session} />;

    case "complete":
      return (
        <>
          <OpenedDocument session={session} />
          {session.outcome && (
            <Card title="Your clean file is ready">
              <p data-testid="outcome" className="text-ink">
                {outcomeText(session.outcome)}
              </p>
            </Card>
          )}
        </>
      );

    case "idle":
    case "failed":
    case "lost":
      return null;
  }
}

/** The phase text, with a spinner that carries no meaning of its own. */
function StatusLine({ text }: { text: string }) {
  return (
    <p data-testid="progress" className="flex items-center gap-3 text-ink">
      <Spinner />
      <span>{text}…</span>
    </p>
  );
}

/** A failure, announced once as an alert and kept out of the live region. */
function SessionAlert({
  session,
  onRetry,
}: {
  session: ToolSession;
  onRetry: () => void;
}) {
  switch (session.state) {
    case "failed":
      return (
        <div className="mt-6">
          <Callout tone="danger" role="alert" data-testid="error">
            {errorText(session.failure ?? "unsupported", session.entitlement)}
          </Callout>
        </div>
      );

    case "lost":
      return (
        <div className="mt-6">
          <Callout
            tone="danger"
            role="alert"
            data-testid="lost"
            action={
              <Button variant="secondary" data-testid="retry" onClick={onRetry}>
                Try again
              </Button>
            }
          >
            The PDF engine stopped unexpectedly. Your file is still on your machine, so
            you can try again without choosing it a second time.
          </Callout>
        </div>
      );

    case "idle":
    case "opening":
    case "reviewing":
    case "redacting":
    case "complete":
      return null;
  }
}

function OpenedDocument({ session }: { session: LiveSession }) {
  const { summary } = session;
  if (!summary) return null;

  const withText = summary.pagesWithText.filter(Boolean).length;

  return (
    <Card title="Document opened">
      <div className="flex flex-col gap-1">
        <p data-testid="page-count" className="text-ink">
          This document has {summary.pageCount}{" "}
          {summary.pageCount === 1 ? "page" : "pages"}.
        </p>
        <p data-testid="text-layer-count" className="text-small text-ink-muted">
          {withText} of {summary.pageCount} have a text layer.
        </p>
      </div>
    </Card>
  );
}
