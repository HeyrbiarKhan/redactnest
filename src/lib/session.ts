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

/**
 * The steps a job passes through.
 *
 * `failed` is terminal for that document. `lost` is the one recoverable
 * failure, because the page still holds the `File` handle and can read it again
 * without sending anybody back to the file picker.
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
  /** Derived from the file name at open. Never logged, never sent. */
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
  /** A kind from the closed set, nothing more. */
  readonly failure: EngineErrorKind | null;
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
  | { readonly type: "redact-started" }
  | { readonly type: "redacted"; readonly outcome: RedactionOutcome }
  | { readonly type: "downloaded" }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly failure: EngineErrorKind }
  | { readonly type: "worker-lost" }
  | { readonly type: "retry" }
  | { readonly type: "released" };

export const IDLE: IdleSession = Object.freeze({ state: "idle" });

/**
 * The name the redacted file is offered under.
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
export function outputNameFor(fileName: string): string {
  const stem = fileName
    .trim()
    .replace(/\.pdf$/i, "")
    .trim();
  return `${stem === "" ? "document" : stem}-redacted.pdf`;
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
 */
export function hasUnsavedWork(session: ToolSession): boolean {
  if (session.state === "redacting") return true;
  if (session.state === "complete") return !session.downloaded;
  if (session.state === "reviewing") {
    return !sameTicks(session.ticked, seededTicks(session.matches));
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
        outputName: outputNameFor(action.file.name),
        entitlement: Object.freeze({ ...action.entitlement }),
        summary: null,
        matches: [],
        ticked: new Set<MatchId>(),
        phase: null,
        failure: null,
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
      if (session.state !== "reviewing") return session;
      return freeze({ ...session, state: "redacting", phase: null, outcome: null });

    case "redacted":
      if (session.state !== "redacting") return session;
      return freeze({
        ...session,
        state: "complete",
        outcome: action.outcome,
        phase: null,
        downloaded: false,
      });

    case "downloaded":
      // Deliberately not a release trigger. The output buffer is freed by the
      // download helper, and the session stays alive at `complete` so the tick
      // and rerun edge above is still reachable.
      if (session.state !== "complete") return session;
      return freeze({ ...session, downloaded: true });

    case "cancelled":
      // AC-10: back to the checklist, document still open. There is no such edge
      // out of `opening`, where no document is open yet to go back to.
      if (session.state !== "redacting") return session;
      return freeze({ ...session, state: "reviewing", phase: null });

    case "failed":
      if (session.state !== "opening" && session.state !== "redacting") return session;
      return freeze({
        ...session,
        state: "failed",
        failure: action.failure,
        phase: null,
      });

    case "worker-lost":
      // Reachable from any live step except the two that are already over.
      // `failed` stays terminal: a dead worker does not make a corrupt document
      // openable.
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
        summary: null,
        matches: [],
        ticked: new Set<MatchId>(),
        phase: null,
        failure: null,
        outcome: null,
        downloaded: false,
      });
  }
}

/** Frozen and replaced, never mutated in place. */
function freeze(session: LiveSession): LiveSession {
  return Object.freeze(session);
}
