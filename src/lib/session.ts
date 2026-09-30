/**
 * The shape of a redaction job while it is alive, and the only rules that move
 * it between steps.
 *
 * Spec 0002 decided this once so features 5, 6, 13 and 14 inherit a session
 * rather than each inventing one. A pure reducer over a frozen value, so the
 * machine can be tested exhaustively rather than sampled, and so no part of the
 * interface can reach in and change a session out from under another part.
 *
 * What is deliberately absent matters as much as what is here. No bytes: the
 * main thread holds a `File` handle, which is a pointer to a file already on the
 * visitor's disk, not a copy of it (INV-1). No quads, no offsets, no page
 * geometry: a match is named by its opaque id and nothing else (INV-2). Nothing
 * is written anywhere: this value lives in memory for one tab and dies with it
 * (INV-3).
 */

import type {
  DocumentSummary,
  EngineErrorKind,
  EntitlementSnapshot,
  MatchId,
  ProgressPhase,
  RedactionOutcome,
  ReviewMatch,
} from "@/worker/protocol";

import { countRemoved } from "@/lib/detectors";
import { isPartly } from "@/lib/page-findings";

/**
 * The steps a job passes through.
 *
 * `failed` is an open that failed, and is terminal for that document. A run
 * that fails is not: it returns to `reviewing` with `runFailure` set and every
 * tick kept (spec 0007, AC-14 and INV-1). `lost` is the one recoverable failure
 * of the worker itself, because the page still holds the `File` handle and can
 * read it again without sending anybody back to the file picker.
 */
export type SessionState =
  "idle" | "opening" | "reviewing" | "redacting" | "complete" | "failed" | "lost";

/** Nothing is open. What a fresh page and a released session both look like. */
export interface IdleSession {
  readonly state: "idle";
}

/** A job in progress, whatever step it has reached. */
export interface LiveSession {
  readonly state: Exclude<SessionState, "idle">;
  /** Correlates to the worker's session. */
  readonly jobId: string;
  /** The handle, not the bytes. The recovery path when a worker dies. */
  readonly file: File;
  /**
   * Derived from the file name. Never logged, never sent. Provisional until a
   * run completes: set again at `redacted` from what the run removed, and only
   * its value at `complete` is ever used (spec 0007, AC-12).
   */
  readonly outputName: string;
  /** Frozen at open and never refreshed mid job (INV-5). */
  readonly entitlement: EntitlementSnapshot;
  /** Counts and flags only. Null until the document is open. */
  readonly summary: DocumentSummary | null;
  /** Empty until feature 6 fills it. */
  readonly matches: readonly ReviewMatch[];
  readonly ticked: ReadonlySet<MatchId>;
  /** The last phase the worker reported. Null when nothing is running. */
  readonly phase: ProgressPhase | null;
  /**
   * Why the open failed, or why the worker was lost: a kind from the closed
   * set, nothing more. Set only in `failed` and `lost`.
   */
  readonly failure: EngineErrorKind | null;
  /**
   * Why the last run was refused, while the review it came from stays open
   * (spec 0007, AC-14). Null except in `reviewing` after a failed run; it
   * survives tick changes, because it says what to untick, and clears on every
   * other edge.
   */
  readonly runFailure: EngineErrorKind | null;
  /** Counts only. Null until the job completes. */
  readonly outcome: RedactionOutcome | null;
  /** True once a download has been handed over. */
  readonly downloaded: boolean;
}

export type ToolSession = IdleSession | LiveSession;

export type SessionAction =
  /** A file was chosen. Implies releasing whatever came before it. */
  | {
      readonly type: "file-chosen";
      readonly jobId: string;
      readonly file: File;
      readonly entitlement: EntitlementSnapshot;
    }
  | { readonly type: "progress"; readonly phase: ProgressPhase }
  | {
      readonly type: "opened";
      readonly summary: DocumentSummary;
      readonly matches: readonly ReviewMatch[];
    }
  | { readonly type: "tick-toggled"; readonly id: MatchId }
  /** A group's select all: every listed id ticked, or every one cleared. */
  | {
      readonly type: "ticks-set";
      readonly ids: readonly MatchId[];
      readonly on: boolean;
    }
  | { readonly type: "redact-started" }
  | { readonly type: "redacted"; readonly outcome: RedactionOutcome }
  | { readonly type: "downloaded" }
  /** Make it again: the same ticks, run once more after a download. */
  | { readonly type: "rerun" }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly failure: EngineErrorKind }
  | { readonly type: "worker-lost" }
  | { readonly type: "retry" }
  | { readonly type: "released" };

export const IDLE: IdleSession = Object.freeze({ state: "idle" });

/**
 * What the file's name says it is. Spec 0007, AC-12 and INV-2.
 *
 * `cleaned` is a run that removed nothing, whatever the pages hold, so it can
 * never pass for a redaction. `partly-redacted` is a run that removed something
 * from a file where some page carries a warning (spec 0006, AC-23).
 */
export type OutputForm = "redacted" | "partly-redacted" | "cleaned";

/**
 * The name the output is offered under.
 *
 * Strips a trailing `.pdf` case insensitively, trims, and falls back to the
 * literal `document` when nothing is left, so a file named `.pdf` or `   ` still
 * produces something sensible. Repeated downloads of the same name are left to
 * the browser's own numbering rather than inventing a scheme for it.
 *
 * Trimmed before the extension is stripped as well as after. A name with
 * trailing whitespace is legal on some file systems, and stripping first would
 * leave the `.pdf` attached to it and hand somebody `report.pdf-redacted.pdf`.
 */
export function outputNameFor(fileName: string, form: OutputForm): string {
  const stem = fileName
    .trim()
    .replace(/\.pdf$/i, "")
    .trim();
  return `${stem === "" ? "document" : stem}-${form}.pdf`;
}

/**
 * The form a finished run's file takes. Spec 0007, *Value sourcing*: from what
 * the run removed first, then from the readings, so a run that removed nothing
 * is `cleaned` even on a partly readable file (AC-12).
 */
export function outputFormFor(
  summary: DocumentSummary | null,
  outcome: RedactionOutcome,
): OutputForm {
  if (countRemoved(outcome) === 0) return "cleaned";
  return summary !== null && isPartly(summary) ? "partly-redacted" : "redacted";
}

/**
 * The provisional form before any run: what the name would say if the run
 * removed something. Spec 0006, AC-23.
 */
function provisionalForm(summary: DocumentSummary | null): OutputForm {
  return summary !== null && isPartly(summary) ? "partly-redacted" : "redacted";
}

/**
 * The tick set a fresh checklist starts from: each detector's own
 * recommendation.
 *
 * Derived rather than stored, so `hasUnsavedWork` can compare against it without
 * a second field that could drift from the matches it describes.
 *
 * A blocked match is left out whatever its `tickedByDefault` says (spec 0005,
 * AC-8 and INV-2). The worker holds no target for it, so a tick on it would
 * only ever fail the run.
 */
export function seededTicks(matches: readonly ReviewMatch[]): ReadonlySet<MatchId> {
  return new Set(
    matches
      .filter((match) => match.tickedByDefault && match.blocked === null)
      .map((match) => match.id),
  );
}

/**
 * Would leaving now lose something worth warning about?
 *
 * AC-1 and AC-13 both hang off this, so it is defined once rather than described
 * twice. The tick comparison is what makes it honest: somebody who opened a file
 * and read the checklist without touching it has lost nothing, while somebody
 * who spent ten minutes ticking has.
 *
 * A refusal on screen counts too (spec 0007, AC-23): it tells somebody what to
 * untick, and replacing the file would throw that away with the review.
 */
export function hasUnsavedWork(session: ToolSession): boolean {
  if (session.state === "redacting") return true;
  if (session.state === "complete") return !session.downloaded;
  if (session.state === "reviewing") {
    return (
      session.runFailure !== null ||
      !sameTicks(session.ticked, seededTicks(session.matches))
    );
  }
  return false;
}

function sameTicks(a: ReadonlySet<MatchId>, b: ReadonlySet<MatchId>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/**
 * The state machine, as one pure function.
 *
 * An action that does not belong in the current state returns the session
 * unchanged rather than throwing. Two reasons: a late reply from an operation
 * that was already cancelled is normal rather than exceptional, and a reducer
 * that throws would take the interface down with it over something harmless.
 * The edges that must not exist are the ones tested, so "unchanged" is asserted
 * rather than assumed.
 */
export function sessionReducer(session: ToolSession, action: SessionAction): ToolSession {
  switch (action.type) {
    case "file-chosen":
      // Accepted from any state: choosing a file is itself a release trigger,
      // so this always starts a clean job. The caller releases the worker first.
      return freeze({
        state: "opening",
        jobId: action.jobId,
        file: action.file,
        // What the pages hold is not known yet, so the plain name for now;
        // `opened` sets it again from the readings (spec 0006, AC-23).
        outputName: outputNameFor(action.file.name, provisionalForm(null)),
        entitlement: Object.freeze({ ...action.entitlement }),
        summary: null,
        matches: [],
        ticked: new Set<MatchId>(),
        phase: null,
        failure: null,
        runFailure: null,
        outcome: null,
        downloaded: false,
      });

    case "released":
      return IDLE;

    case "progress":
      if (session.state !== "opening" && session.state !== "redacting") return session;
      return freeze({ ...session, phase: action.phase });

    case "opened":
      if (session.state !== "opening") return session;
      return freeze({
        ...session,
        state: "reviewing",
        summary: action.summary,
        // Spec 0006, AC-23 and INV-5: from the same predicate the download
        // warning reads, over the same summary. Still provisional: `redacted`
        // settles it from what the run removed (spec 0007, AC-12).
        outputName: outputNameFor(session.file.name, provisionalForm(action.summary)),
        matches: action.matches,
        ticked: seededTicks(action.matches),
        phase: null,
      });

    case "tick-toggled": {
      // From `complete`, changing a tick is the edge that lets somebody correct
      // a mistake and run again without hunting for the file a second time
      // (AC-14). The output is already gone; the document is still open.
      if (session.state !== "reviewing" && session.state !== "complete") return session;
      // Only a match this session holds, and never a blocked one (spec 0005,
      // AC-8): the engine would refuse it, so the tick is not offered at all.
      const match = session.matches.find((candidate) => candidate.id === action.id);
      if (!match || match.blocked !== null) return session;

      const ticked = new Set(session.ticked);
      if (!ticked.delete(action.id)) ticked.add(action.id);

      // `runFailure` survives: the refusal says what to untick, so it stays
      // on screen while somebody does (spec 0007, AC-14).
      return freeze({
        ...session,
        state: "reviewing",
        ticked,
        outcome: null,
        downloaded: false,
      });
    }

    case "ticks-set": {
      // Spec 0007, AC-7. A group's select all, as one action and one render.
      // The same rules as a single tick: only from `reviewing` or `complete`,
      // and only for an id this session holds that is not blocked.
      if (session.state !== "reviewing" && session.state !== "complete") return session;
      const tickable = new Set(
        session.matches
          .filter((match) => match.blocked === null)
          .map((match) => match.id),
      );

      const ticked = new Set(session.ticked);
      let changed = false;
      for (const id of action.ids) {
        if (!tickable.has(id) || ticked.has(id) === action.on) continue;
        if (action.on) ticked.add(id);
        else ticked.delete(id);
        changed = true;
      }

      // Nothing to change is the same session, so nothing renders again and a
      // `complete` session keeps its outcome.
      if (!changed) return session;
      return freeze({
        ...session,
        state: "reviewing",
        ticked,
        outcome: null,
        downloaded: false,
      });
    }

    case "redact-started":
      // `outcome` is already null on every path that reaches `reviewing`, and is
      // cleared here anyway. Counts from the previous run surviving into the
      // next one would be a summary that describes a file nobody downloaded, so
      // this one stays belt and braces rather than relying on the paths above.
      // A new run is a new question, so the last one's refusal goes (AC-14).
      if (session.state !== "reviewing") return session;
      return freeze({
        ...session,
        state: "redacting",
        phase: null,
        outcome: null,
        runFailure: null,
      });

    case "redacted":
      if (session.state !== "redacting") return session;
      return freeze({
        ...session,
        state: "complete",
        // Spec 0007, AC-12 and INV-2: the name the file is offered under is
        // settled here, from what this run removed, so a run that removed
        // nothing is never named as a redaction.
        outputName: outputNameFor(
          session.file.name,
          outputFormFor(session.summary, action.outcome),
        ),
        outcome: action.outcome,
        phase: null,
        downloaded: false,
      });

    case "downloaded":
      // Deliberately not a release trigger. The output buffer is freed by the
      // download helper, and the session stays alive at `complete` so the tick
      // and rerun edges are still reachable.
      if (session.state !== "complete") return session;
      return freeze({ ...session, downloaded: true });

    case "rerun":
      // Spec 0007, AC-13. Make it again: the output was let go at download on
      // purpose (spec 0002, AC-4), so getting the same file back costs a run
      // over the same ticks on the untouched original. Only once the file has
      // been handed over; before that, Download still holds it.
      if (session.state !== "complete" || !session.downloaded) return session;
      return freeze({
        ...session,
        state: "redacting",
        phase: null,
        outcome: null,
        runFailure: null,
        downloaded: false,
      });

    case "cancelled":
      // AC-10: back to the checklist, document still open. There is no such edge
      // out of `opening`, where no document is open yet to go back to.
      if (session.state !== "redacting") return session;
      return freeze({ ...session, state: "reviewing", phase: null });

    case "failed":
      // Spec 0007, AC-14 and INV-1. A refused run keeps the review: the
      // document stays open in the worker, and the matches and ticks stay here,
      // so a refusal costs a tick change rather than the whole review. No
      // output exists for it.
      if (session.state === "redacting") {
        return freeze({
          ...session,
          state: "reviewing",
          runFailure: action.failure,
          phase: null,
        });
      }
      // An open that failed is terminal for that document.
      if (session.state !== "opening") return session;
      return freeze({
        ...session,
        state: "failed",
        failure: action.failure,
        phase: null,
      });

    case "worker-lost":
      // Reachable from any live step except the two that are already over.
      // `failed` stays terminal: a dead worker does not make a corrupt document
      // openable. A lost worker is not a refusal, so no refusal survives it.
      if (
        session.state === "idle" ||
        session.state === "failed" ||
        session.state === "lost"
      ) {
        return session;
      }
      return freeze({
        ...session,
        state: "lost",
        failure: "engine-unavailable",
        runFailure: null,
        phase: null,
      });

    case "retry":
      // Re-enters at `opening`, not at `reviewing`. The old `MatchId`s were
      // minted by the worker that died and mean nothing to its replacement, so
      // the review genuinely starts over. Only the trip to the file picker is
      // saved, and saying otherwise would be the unstated fine print spec 0002
      // exists to avoid.
      if (session.state !== "lost") return session;
      return freeze({
        ...session,
        state: "opening",
        // Back to the plain name until the new worker has read the pages.
        outputName: outputNameFor(session.file.name, provisionalForm(null)),
        summary: null,
        matches: [],
        ticked: new Set<MatchId>(),
        phase: null,
        failure: null,
        runFailure: null,
        outcome: null,
        downloaded: false,
      });
  }
}

/** Frozen and replaced, never mutated in place. */
function freeze(session: LiveSession): LiveSession {
  return Object.freeze(session);
}
