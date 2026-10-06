"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { config } from "@/config";
import { cx } from "@/lib/cx";
import { resultCounts } from "@/lib/detectors";
import { currentPath, loadedAt, loadGuard, reloadDocument } from "@/lib/document-load";
import { offerDownload } from "@/lib/download";
import {
  askAgain,
  askAtLoad,
  askWhenVisible,
  getEntitlement,
  readEntitlement,
  subscribeEntitlement,
} from "@/lib/entitlement";
import {
  dropZoneHelper,
  failureText,
  IDLE_STEPS,
  isTickCaused,
  LOST_TEXT,
  PHASE_TEXT,
  phaseLine,
  redactLabel,
  RUN_REFUSAL_LEAD,
  runRefusalText,
  tickCountLine,
} from "@/lib/flow-text";
import {
  ADVICE,
  ALL_CLEAR,
  isPartly,
  noteLines,
  OPEN_WARNING_TITLE,
  showsAdvice,
  warningLines,
} from "@/lib/page-findings";
import { TOOL_PATH } from "@/lib/routes";
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
  OperationCancelled,
  type EntitlementSnapshot,
  type MatchId,
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
import { StepList } from "@/ui/step-list";

import { ActionPanel } from "./action-panel";
import { FailureCallout } from "./failure-callout";
import { LockLine } from "./lock-line";
import { NewTabLink, PlanLine } from "./plan-line";
import { ResultCard } from "./result-card";
import { ReviewChecklist } from "./review-checklist";
import { TermsNotice } from "./terms-notice";

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

/** Where focus goes after a step change. Spec 0007, *Focus*. */
type FocusTarget =
  | "choose"
  | "failure"
  | "refusal"
  | "result"
  | "redact"
  | "cancel"
  | "redact-another"
  | "retry";

/**
 * Spec 0007, AC-20. Focus moves only where the focused control has just gone,
 * or where a result or a failure has just appeared, so it never lands on
 * `body`. Judged from the step change alone, so the same change always moves
 * it to the same place; null leaves it where it is.
 *
 * "choose" is the drop zone's button in whichever form is showing: the file
 * bar's Choose another PDF once a file is chosen, and the full zone's button
 * after Start over.
 *
 * Steps can land together in one render (an open that answers at once batches
 * `file-chosen` with `opened`), so a new file is recognised by its job
 * arriving, not by passing through `opening`.
 */
function focusAfter(previous: ToolSession, next: ToolSession): FocusTarget | null {
  if (next.state === "idle") return previous.state === "idle" ? null : "choose";
  if (next.state === "failed") {
    return previous.state === "failed" && previous.jobId === next.jobId
      ? null
      : "failure";
  }
  if (next.state === "lost") return previous.state === "lost" ? null : "retry";

  // A new file, or a retry: the file bar has just replaced the full zone or
  // the lost callout. The same job reopening in place, the silent retry,
  // changes nothing visible.
  const arrived =
    previous.state === "idle" ||
    previous.state === "failed" ||
    previous.state === "lost" ||
    previous.jobId !== next.jobId;
  if (arrived) return "choose";

  switch (next.state) {
    case "opening":
      return null;
    case "redacting":
      return previous.state === "redacting" ? null : "cancel";
    case "reviewing":
      // Out of a run: Cancel went, so Redact; or the run was refused. An open
      // that succeeds, or a tick changed from `complete`, leaves focus alone.
      if (previous.state !== "redacting") return null;
      return next.runFailure === null ? "redact" : "refusal";
    case "complete":
      if (previous.state !== "complete") return "result";
      return !previous.downloaded && next.downloaded ? "redact-another" : null;
  }
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

const START_OVER_WARNING =
  "You have unsaved work on the document that is open. Starting over will discard it. Continue?";

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
   * The page's answer to which plan applies, for the helper and the plan line
   * (spec 0012, AC-5). Never a job's: each job froze its own snapshot at open.
   * None on the server, so the prerendered page says it is checking.
   */
  const planAnswer = useSyncExternalStore<EntitlementSnapshot | null>(
    subscribeEntitlement,
    readEntitlement,
    SERVER_SNAPSHOT,
  );

  /** While the plan line's Try again is asking, so the press visibly does something. */
  const [planChecking, setPlanChecking] = useState(false);
  const planLineRef = useRef<HTMLParagraphElement>(null);

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

  /**
   * Ask which plan applies once the page has loaded, rather than on the warm
   * trigger, so the answer is in before anyone chooses a file, and again each
   * time the tab comes back, so an upgrade made in another tab shows here
   * (spec 0012, AC-4; `askWhenVisible` never asks a Pro page). Only after the
   * load guard and the support check pass: a page that is about to reload,
   * sits at the wrong address, or cannot run the tool has no use for the
   * answer, and asking would be a request it did not need.
   */
  const supported = support?.supported === true;
  useEffect(() => {
    if (guard !== "ok" || !supported) return;
    askAtLoad();

    const onVisibility = () => {
      if (document.visibilityState === "visible") askWhenVisible();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [guard, supported]);

  /** Warm what a chosen file will need: the engine. */
  const warm = useCallback(() => {
    warmEngine();
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
   * The places focus can be sent after a step change (spec 0007, *Focus*).
   * Each points at an element only while its step shows it.
   */
  const chooseRef = useRef<HTMLButtonElement>(null);
  const failureRef = useRef<HTMLHeadingElement>(null);
  const refusalRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const redactRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const redactAnotherRef = useRef<HTMLButtonElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);

  /**
   * AC-20. Focus moves in an effect after the render that mounts its target,
   * keyed on the step change, never in the event handler, so the element it
   * moves to is the one on screen. The session is replaced on every change and
   * a no-op returns the same object, so this runs once per real change.
   *
   * A layout effect, so it runs before the browser paints whatever the update's
   * priority. A step change dispatched from a promise (a run finishing or
   * refused, Cancel landing, an open failing) would otherwise paint once with
   * the old control gone and focus on `body`.
   */
  const shownRef = useRef<ToolSession>(IDLE);
  useLayoutEffect(() => {
    const previous = shownRef.current;
    shownRef.current = session;
    const target = focusAfter(previous, session);
    if (target === null) return;

    const targets: Readonly<Record<FocusTarget, RefObject<HTMLElement | null>>> = {
      choose: chooseRef,
      failure: failureRef,
      refusal: refusalRef,
      result: resultRef,
      redact: redactRef,
      cancel: cancelRef,
      "redact-another": redactAnotherRef,
      retry: retryRef,
    };
    targets[target].current?.focus();
  }, [session]);

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
        // being chosen and being read. Its own kind, so the page can say
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

  /**
   * Freeze the plan into a new job and open the file under it. `fresh` asks
   * the server again whatever the page's answer's age (spec 0012, AC-6);
   * otherwise the page's answer serves unless it is more than 5 minutes old
   * (AC-4).
   */
  const openFile = useCallback(
    async (file: File, fresh: boolean) => {
      setCheckingEntitlement(false);
      const entitlement = await getEntitlement({
        fresh,
        onWaiting: () => setCheckingEntitlement(true),
      });
      setCheckingEntitlement(false);

      const jobId = crypto.randomUUID();
      dispatch({ type: "file-chosen", jobId, file, entitlement });
      await runOpen({ jobId, file, entitlement });
    },
    [runOpen],
  );

  const handleFile = useCallback(
    async (file: File) => {
      // AC-1: one tab, one session. Replacing one with work in it asks first,
      // and a cancelled confirm changes nothing (spec 0007, AC-3).
      if (hasUnsavedWork(sessionRef.current) && !window.confirm(REPLACE_WARNING)) {
        return;
      }

      // Deliberately no `releaseEngine()` here. The worker `warm()` started is
      // most likely mid download of the engine, and terminating it would throw
      // that away and pay for it again on the one action the product exists
      // for. Replacing a session does not need a new worker: `openSession`
      // retires the previous job on this side, and the worker ends it on the
      // other, which is what AC-1 actually asks for.
      await openFile(file, false);
    },
    [openFile],
  );

  /**
   * Spec 0012, AC-6: "Check my plan and open it again". Asks fresh, then opens
   * the file the failed job held as a new job under the new answer, with no
   * file picker and no reload. A file changed or gone on disk fails that open
   * with `file-unreadable`, and a cap the new answer still sets shows the
   * callout again in that answer's words.
   */
  const handleRecheck = useCallback(() => {
    const failed = sessionRef.current;
    if (failed.state !== "failed") return;
    void openFile(failed.file, true);
  }, [openFile]);

  /**
   * Spec 0012, AC-5: the plan line's Try again. Its button goes with the line
   * it belongs to, so when the answer changes, focus moves to the line that
   * replaced it rather than falling to the page (spec 0007, AC-20).
   */
  const handleTryAgain = useCallback(async () => {
    setPlanChecking(true);
    const answer = await askAgain();
    setPlanChecking(false);
    if (answer.account !== "unknown") planLineRef.current?.focus();
  }, []);

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

  /** Start over, and Redact another PDF under another label (spec 0007, AC-13). */
  const handleStartOver = useCallback(() => {
    // It sits beside Choose another PDF in the file bar (AC-3), so it asks
    // before throwing work away just as a replacement does (spec 0002, AC-1),
    // and a cancelled confirm changes nothing. Redact another PDF shows only
    // after a download, when nothing is unsaved, so it never asks.
    if (hasUnsavedWork(sessionRef.current) && !window.confirm(START_OVER_WARNING)) {
      return;
    }

    // A genuine release trigger, so the worker goes. The attempt is superseded
    // with it, because a reply for the document just abandoned must not land on
    // whatever is opened next.
    attemptRef.current += 1;
    openedRef.current = null;
    releaseEngine();
    dispatch({ type: "released" });
  }, []);

  /**
   * Spec 0004, AC-19, and spec 0007, AC-13. Run a redaction over the current
   * ticks: Redact from review, or Make it again after a download, which is the
   * same run over the same ticks on the untouched original.
   *
   * Guarded by the same attempt counter `runOpen` uses, without moving it: a
   * new file, a start over or a retry supersedes the document this run belongs
   * to, and a reply for it must then be dropped rather than shown (AC-20). The
   * output is taken only from a `redacted` reply while the session is still
   * `redacting`, so a reply after Cancel changes nothing.
   */
  const runRedaction = useCallback(async (start: "redact-started" | "rerun") => {
    const live = sessionRef.current;
    const opened = openedRef.current;
    if (!opened || live.state === "idle") return;
    if (start === "redact-started" && live.state !== "reviewing") return;
    if (start === "rerun" && !(live.state === "complete" && live.downloaded)) return;

    const attempt = attemptRef.current;
    const current = () => attemptRef.current === attempt;

    dispatch({ type: start });

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
        // Spec 0007, AC-14: back to the checklist with every tick kept, and
        // the refusal said above it. No output exists for it.
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

  /** One stable handler for every row, so a row renders again only when it changes. */
  const handleToggle = useCallback((id: MatchId) => {
    dispatch({ type: "tick-toggled", id });
  }, []);

  /** A group's select all, as one action and one render (spec 0007, AC-7). */
  const handleTicksSet = useCallback((ids: readonly MatchId[], on: boolean) => {
    dispatch({ type: "ticks-set", ids, on });
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

  /**
   * The result card's counts (spec 0007, AC-25). The ticks cannot change while
   * a session is `complete`, so they describe the run that made the file.
   */
  const counts = useMemo(
    () =>
      session.state === "complete" && session.outcome
        ? resultCounts(session.matches, session.ticked, session.outcome)
        : null,
    [session],
  );

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

  const live = session.state === "idle" ? null : session;
  // Spec 0007, AC-3: the file bar in every step with a file on the page, and
  // the full zone when nothing is open, including under a failed open (AC-15).
  const compact = live !== null && live.state !== "failed";
  const reviewable =
    session.state === "reviewing" ||
    session.state === "redacting" ||
    session.state === "complete";
  const acting = session.state === "reviewing" || session.state === "redacting";
  const phaseText = checkingEntitlement
    ? PHASE_TEXT["checking-entitlement"]
    : (session.state === "opening" || session.state === "redacting") &&
        session.phase !== null
      ? phaseLine(session.phase, session.ticked.size)
      : null;

  /*
   * Spec 0013, AC-14 to AC-17. One grid of three areas, always rendered in the
   * same order with the same keys, so no live region remounts when a file is
   * chosen and a phone reads them top to bottom: A, the document (the full
   * drop zone, or the file bar); B, the rail; C, the found items, from
   * `reviewing` on. Only the area template changes from `lg`: A beside B
   * while nothing is open, then A across the top with C left of B.
   *
   * `lg` here is a container query, 61rem of this column, which is a 1024
   * pixel window less the page's gutters at the default text size. A media
   * query reads `rem` as the browser's default size, so it would keep two
   * columns and a sticky panel at 200% text; a container query reads the
   * page's own root size, so enlarged text gets one column and nothing sticky
   * (AC-17, INV-6; WCAG 1.4.4 and 1.4.10).
   */
  return (
    <div className="@container">
      <div
        data-testid="tool-grid"
        className={cx(
          "grid gap-6 @min-[61rem]:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)]",
          compact
            ? "@min-[61rem]:[grid-template-areas:'a_a'_'c_b']"
            : "@min-[61rem]:[grid-template-areas:'a_b']",
        )}
      >
        <div
          key="a"
          data-testid="area-document"
          className="flex min-w-0 flex-col gap-6 @min-[61rem]:[grid-area:a]"
        >
          {/*
          Spec 0007, AC-15. An open that failed says so above the full drop
          zone, so the next file is one drop away. Nothing of the failed
          document is held beyond its name and its frozen caps.
        */}
          {session.state === "failed" && (
            <OpenFailure
              session={session}
              titleRef={failureRef}
              onRecheck={handleRecheck}
            />
          )}

          {live !== null && compact ? (
            <DropZone
              compact
              fileName={live.file.name}
              pageCount={live.summary?.pageCount ?? null}
              buttonLabel="Choose another PDF"
              accept="application/pdf"
              onFile={(file) => void handleFile(file)}
              onWarm={warm}
              buttonRef={chooseRef}
              action={
                <Button variant="link" data-testid="start-over" onClick={handleStartOver}>
                  Start over
                </Button>
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              <DropZone
                title="Drop a PDF here, or choose one"
                helper={dropZoneHelper(planAnswer)}
                buttonLabel="Choose a PDF"
                accept="application/pdf"
                onFile={(file) => void handleFile(file)}
                onWarm={warm}
                buttonRef={chooseRef}
              />
              {/*
              Spec 0011, AC-5. Choosing a PDF is agreeing to the terms, so the
              line sits under the full drop zone and goes with it once the file
              bar takes its place. Outside the polite region, so it is never
              announced as news.
            */}
              <TermsNotice />
            </div>
          )}
        </div>

        <div
          key="b"
          data-testid="area-rail"
          className="flex min-w-0 flex-col gap-6 @min-[61rem]:[grid-area:b]"
        >
          {/*
          Spec 0003, AC-12, and spec 0007, AC-4. The polite region holds only
          what is worth hearing as it changes: the opened document card, heard
          once with the open and then left alone, and the one phase line while
          a document opens or a run works. A failure is an alert of its own
          and renders beside this, never inside it, or a screen reader would
          announce it twice. First in the rail and in the page from the start,
          so its first announcement is heard; visually hidden while it has
          nothing to say, so it takes no room (spec 0013, AC-15 and AC-16).
        */}
          <div
            aria-live="polite"
            className={cx(
              "flex flex-col gap-6",
              !reviewable && phaseText === null && "sr-only",
            )}
          >
            {reviewable && <OpenedDocument session={session} />}
            {phaseText !== null && <StatusLine text={phaseText} />}
          </div>

          {/*
          Spec 0012, AC-5, as spec 0013 places it (AC-18): the plan card, after
          the drop zone and after the document card, and only on a build that
          sells Pro.
        */}
          {config.billingEnabled && (
            <PlanLine
              answer={planAnswer}
              checking={planChecking}
              onTryAgain={() => void handleTryAgain()}
              lineRef={planLineRef}
            />
          )}

          {/* AC-15: while nothing is open, what happens next, in three steps. */}
          {!compact && <StepList steps={IDLE_STEPS} />}

          {session.state === "lost" && (
            <FailureCallout
              data-testid="lost"
              title={LOST_TEXT.title}
              body={LOST_TEXT.body}
              action={
                <Button
                  ref={retryRef}
                  variant="secondary"
                  data-testid="retry"
                  onClick={handleRetry}
                >
                  Try again
                </Button>
              }
            />
          )}

          {/*
          Spec 0007, AC-14. A refused run keeps the review, so the refusal sits
          before the action it asks to change, and stays through tick changes.
        */}
          {session.state === "reviewing" && session.runFailure !== null && (
            <FailureCallout
              data-testid="run-refusal"
              lead={RUN_REFUSAL_LEAD}
              titleRef={refusalRef}
              {...runRefusalText(
                session.runFailure,
                session.entitlement,
                session.ticked.size,
              )}
              action={
                isTickCaused(session.runFailure) ? undefined : (
                  <Button
                    variant="secondary"
                    data-testid="refusal-choose"
                    onClick={() => chooseRef.current?.click()}
                  >
                    Choose another PDF
                  </Button>
                )
              }
            />
          )}

          {/*
          AC-16 and AC-17: the rail's last block, carrying the lock line, and
          sticky from `lg` so it stays in reach beside a long list.
        */}
          {acting && (
            <ActionPanel
              line={tickCountLine(
                session.ticked.size,
                session.matches.filter((match) => match.blocked === null).length,
                session.matches.length,
              )}
              label={redactLabel(session.ticked.size)}
              running={session.state === "redacting"}
              onRedact={() => void runRedaction("redact-started")}
              onCancel={handleCancel}
              redactRef={redactRef}
              cancelRef={cancelRef}
            />
          )}

          {session.state === "complete" && counts !== null && (
            <ResultCard
              counts={counts}
              summary={session.summary}
              outputName={session.outputName}
              downloaded={session.downloaded}
              onDownload={handleDownload}
              onRedactAnother={handleStartOver}
              onMakeAgain={() => void runRedaction("rerun")}
              headingRef={resultRef}
              redactAnotherRef={redactAnotherRef}
            />
          )}

          {/* Inside the action panel while it shows; at the rail's foot otherwise. */}
          {!acting && <LockLine />}
        </div>

        {/*
        Spec 0005, AC-13, and spec 0013, AC-19. The found items, outside the
        live region for the same reason the failure is: a list read out as it
        appears would drown the phase line. Shown for every step that has a
        document open to review.
      */}
        {reviewable && (
          <div
            key="c"
            data-testid="area-found"
            className="min-w-0 @min-[61rem]:[grid-area:c]"
          >
            <ReviewChecklist
              matches={session.matches}
              ticked={session.ticked}
              running={session.state === "redacting"}
              partly={session.summary !== null && isPartly(session.summary)}
              onToggle={handleToggle}
              onTicksSet={handleTicksSet}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * An open that failed (spec 0007, AC-15), in its kind's words for the job's
 * frozen snapshot. A free cap with billing on also carries its way forward
 * (spec 0012, AC-6): the account's new tab link, and "Check my plan and open
 * it again", which opens the file this job held under a fresh answer.
 */
function OpenFailure({
  session,
  titleRef,
  onRecheck,
}: {
  readonly session: LiveSession;
  readonly titleRef: RefObject<HTMLHeadingElement | null>;
  readonly onRecheck: () => void;
}) {
  const { plan, ...text } = failureText(
    session.failure ?? "unsupported",
    session.entitlement,
  );

  return (
    <FailureCallout
      data-testid="error"
      titleRef={titleRef}
      {...text}
      actions={
        plan && (
          <>
            {plan.link !== null && (
              // Ink rather than the accent, a pairing the contrast contract
              // already holds on the danger tint (spec 0003, INV-1 to INV-3).
              <NewTabLink link={plan.link} className="font-medium text-ink" />
            )}
            <Button variant="secondary" data-testid="recheck" onClick={onRecheck}>
              {plan.recheck}
            </Button>
          </>
        )
      }
    />
  );
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

/**
 * The opened document card. Spec 0006, AC-19 to AC-21: the all clear line
 * when no page carries a warning, otherwise the warning callout naming each
 * page RedactNest cannot fully check; then, after the warnings, an untitled
 * note callout for what is worth knowing but changes nothing. Inside the
 * polite live region, so all of it is heard once, with the open, and it stays
 * mounted through the run so it is not heard again. The page count is the file
 * bar's (spec 0007, AC-3). The words come from `src/lib/page-findings`, the
 * same helpers the name and the download warning read (INV-5).
 */
function OpenedDocument({ session }: { session: LiveSession }) {
  const { summary } = session;
  if (!summary) return null;

  const partly = isPartly(summary);
  const notes = noteLines(summary, session.matches);

  return (
    <Card title="Document opened">
      {!partly && (
        <p data-testid="all-clear" className="text-ink-muted">
          {ALL_CLEAR}
        </p>
      )}
      {partly && (
        <Callout
          tone="warning"
          title={OPEN_WARNING_TITLE}
          headingLevel={3}
          data-testid="page-warnings"
        >
          {warningLines(summary).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {showsAdvice(summary) && <p data-testid="page-advice">{ADVICE}</p>}
        </Callout>
      )}
      {notes.length > 0 && (
        <Callout tone="info" data-testid="page-notes">
          {notes.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </Callout>
      )}
    </Card>
  );
}
