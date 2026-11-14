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
  TermId,
  TermRemoval,
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

/**
 * Why a listed term was not searched in this job. Spec 0017, AC-17:
 * `free-plan`, the job opened on the Free plan, so the kept list was not
 * searched; `search-failed`, the worker answered a review search with an
 * error (AC-20). A closed set; the words live in `TERMS_TEXT`.
 */
export const NOT_SEARCHED_REASONS = Object.freeze([
  "free-plan",
  "search-failed",
] as const);

export type NotSearchedReason = (typeof NOT_SEARCHED_REASONS)[number];

/**
 * One listed term's state in one job. Spec 0017, *State transitions* and
 * INV-3: every term the job knows is searching, searched (with rows, or said
 * not found), not searched with its reason, or set aside with its reason, and
 * says which. The tab's list owns each term's text and order; the job holds
 * only this (INV-7).
 */
export type TermState =
  | { readonly state: "searching" }
  | { readonly state: "searched" }
  | { readonly state: "not-searched"; readonly reason: NotSearchedReason }
  | { readonly state: "set-aside"; readonly reason: NotSearchedReason };

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
  /**
   * Each term's removals in the last run, from the `redacted` reply (spec
   * 0017, AC-22). Set at `redacted` and cleared wherever `outcome` is, and
   * kept beside it, never inside it, so it is never counted or logged (INV-9).
   */
  readonly removedByTerm: readonly TermRemoval[] | null;
  /** True once a download has been handed over. */
  readonly downloaded: boolean;
  /**
   * Each listed term's state in this job, keyed by the tab's ids (spec 0017,
   * *Data model sketch*). Empty with billing off, or with nothing listed.
   */
  readonly terms: ReadonlyMap<TermId, TermState>;
}

export type ToolSession = IdleSession | LiveSession;

/** What every `terms-*` action carries: its job, and its batch's terms. */
interface TermsBatch {
  readonly jobId: string;
  readonly terms: readonly TermId[];
}

export type SessionAction =
  /**
   * A file was chosen. Implies releasing whatever came before it. `terms` is
   * the tab's kept list (spec 0017, AC-6).
   */
  | {
      readonly type: "file-chosen";
      readonly jobId: string;
      readonly file: File;
      readonly entitlement: EntitlementSnapshot;
      readonly terms: readonly TermId[];
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
  | {
      readonly type: "redacted";
      readonly outcome: RedactionOutcome;
      readonly removedByTerm: readonly TermRemoval[];
    }
  | { readonly type: "downloaded" }
  /** Make it again: the same ticks, run once more after a download. */
  | { readonly type: "rerun" }
  | { readonly type: "cancelled" }
  | { readonly type: "failed"; readonly failure: EngineErrorKind }
  | { readonly type: "worker-lost" }
  /** `terms` is the tab's kept list, searched at the reopen (spec 0017, AC-20). */
  | { readonly type: "retry"; readonly terms: readonly TermId[] }
  | { readonly type: "released" }
  /* Spec 0017, *State transitions*. */
  /** An Add, a paste or a Try again sent its batch to the worker. */
  | ({ readonly type: "terms-searching" } & TermsBatch)
  /** The batch's search landed, with every row its terms found. */
  | ({
      readonly type: "terms-found";
      readonly matches: readonly ReviewMatch[];
    } & TermsBatch)
  /** The worker answered the batch with an error kind (AC-20). */
  | ({ readonly type: "terms-failed" } & TermsBatch)
  /** Set aside for this file (AC-17). */
  | ({ readonly type: "terms-set-aside" } & TermsBatch)
  /** Remove, or Remove all (AC-5). */
  | ({ readonly type: "terms-removed" } & TermsBatch);

export const IDLE: IdleSession = Object.freeze({ state: "idle" });

const SEARCHED: TermState = Object.freeze({ state: "searched" });
const SEARCHING: TermState = Object.freeze({ state: "searching" });

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

/**
 * May Make a cleaned copy run? Spec 0017, AC-18 and INV-3: not while any
 * listed term is still searching, or was not searched and has not been set
 * aside, so no term is ever left unsearched in silence. A set aside term does
 * not hold it.
 */
export function canMake(session: LiveSession): boolean {
  for (const { state } of session.terms.values()) {
    if (state === "searching" || state === "not-searched") return false;
  }
  return true;
}

/**
 * The kept list's states as a job opens (spec 0017, *State transitions*):
 * each term searching on a `paid` job and not searched (`free-plan`) on a
 * `free` one. A term set aside earlier in the same job stays set aside,
 * which only a retry after a lost worker can meet.
 */
function keptStates(
  ids: readonly TermId[],
  entitlement: EntitlementSnapshot,
  earlier: ReadonlyMap<TermId, TermState>,
): ReadonlyMap<TermId, TermState> {
  const opening: TermState =
    entitlement.tier === "paid"
      ? Object.freeze({ state: "searching" })
      : Object.freeze({ state: "not-searched", reason: "free-plan" });
  return new Map(
    ids.map((id) => {
      const before = earlier.get(id);
      return [id, before?.state === "set-aside" ? before : opening];
    }),
  );
}

/**
 * A `terms-*` action belongs to this job and arrives while there is a review
 * to change (spec 0017, *State transitions*). Anything else is a late reply
 * or a stray press, and changes nothing.
 */
function acceptsTerms(session: ToolSession, jobId: string): session is LiveSession {
  return (
    (session.state === "reviewing" || session.state === "complete") &&
    session.jobId === jobId
  );
}

/**
 * Back to `reviewing` from `complete`, as a tick change goes (spec 0017,
 * AC-19; spec 0007, AC-14): the outcome and the made copy are dropped.
 */
function backToReview(session: LiveSession): Partial<LiveSession> {
  return session.state === "complete"
    ? { state: "reviewing", outcome: null, removedByTerm: null, downloaded: false }
    : {};
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
        removedByTerm: null,
        downloaded: false,
        // Spec 0017, AC-6: the kept list, searched at open on Pro.
        terms: keptStates(action.terms, action.entitlement, new Map()),
      });

    case "released":
      return IDLE;

    case "progress":
      if (session.state !== "opening" && session.state !== "redacting") return session;
      return freeze({ ...session, phase: action.phase });

    case "opened": {
      if (session.state !== "opening") return session;
      // Spec 0017, AC-5: a row only for a term the job still holds.
      const matches = action.matches.filter(
        (match) => match.term === null || session.terms.has(match.term),
      );
      return freeze({
        ...session,
        state: "reviewing",
        summary: action.summary,
        // Spec 0006, AC-23 and INV-5: from the same predicate the download
        // warning reads, over the same summary. Still provisional: `redacted`
        // settles it from what the run removed (spec 0007, AC-12).
        outputName: outputNameFor(session.file.name, provisionalForm(action.summary)),
        matches,
        ticked: seededTicks(matches),
        phase: null,
        // The kept list was searched in the same read as detection (AC-9).
        terms: new Map(
          [...session.terms].map(([id, state]) => [
            id,
            state.state === "searching" ? SEARCHED : state,
          ]),
        ),
      });
    }

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
        removedByTerm: null,
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
        removedByTerm: null,
        downloaded: false,
      });
    }

    case "redact-started":
      // `outcome` is already null on every path that reaches `reviewing`, and is
      // cleared here anyway. Counts from the previous run surviving into the
      // next one would be a summary that describes a file nobody downloaded, so
      // this one stays belt and braces rather than relying on the paths above.
      // A new run is a new question, so the last one's refusal goes (AC-14).
      // Never while a term is searching or not searched (spec 0017, AC-18).
      if (session.state !== "reviewing" || !canMake(session)) return session;
      return freeze({
        ...session,
        state: "redacting",
        phase: null,
        outcome: null,
        removedByTerm: null,
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
        removedByTerm: action.removedByTerm,
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
      if (session.state !== "complete" || !session.downloaded || !canMake(session)) {
        return session;
      }
      return freeze({
        ...session,
        state: "redacting",
        phase: null,
        outcome: null,
        removedByTerm: null,
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
        removedByTerm: null,
        downloaded: false,
        // Spec 0017, AC-20: the kept list is searched at the reopen, with the
        // job's own snapshot; a term set aside stays set aside.
        terms: keptStates(action.terms, session.entitlement, session.terms),
      });

    case "terms-searching": {
      // An Add, a paste or a Try again (spec 0017, AC-3, AC-20). Pro only,
      // from the job's frozen snapshot (INV-2).
      if (!acceptsTerms(session, action.jobId)) return session;
      if (session.entitlement.tier !== "paid" || action.terms.length === 0) {
        return session;
      }
      const terms = new Map(session.terms);
      for (const id of action.terms) terms.set(id, SEARCHING);
      return freeze({ ...session, ...backToReview(session), terms });
    }

    case "terms-found": {
      // AC-9 and AC-19. Rows only for a term of the batch the job still holds
      // and is searching, so a term removed mid search lands nothing (AC-5).
      // Each new row's default tick joins the tick set, never reseeding it,
      // so an untick elsewhere survives.
      if (!acceptsTerms(session, action.jobId)) return session;
      const landing = new Set(
        action.terms.filter((id) => session.terms.get(id)?.state === "searching"),
      );
      if (landing.size === 0) return session;

      const rows = action.matches.filter(
        (match) => match.term !== null && landing.has(match.term),
      );
      const terms = new Map(session.terms);
      for (const id of landing) terms.set(id, SEARCHED);
      return freeze({
        ...session,
        ...backToReview(session),
        matches: [...session.matches, ...rows],
        ticked: new Set([...session.ticked, ...seededTicks(rows)]),
        terms,
      });
    }

    case "terms-failed": {
      // AC-20: the review stays, rows and ticks so far kept, and the batch's
      // terms not searched, so Make waits until each is tried again, set
      // aside or removed.
      if (!acceptsTerms(session, action.jobId)) return session;
      const failed = action.terms.filter(
        (id) => session.terms.get(id)?.state === "searching",
      );
      if (failed.length === 0) return session;
      const terms = new Map(session.terms);
      for (const id of failed) {
        terms.set(id, Object.freeze({ state: "not-searched", reason: "search-failed" }));
      }
      return freeze({ ...session, terms });
    }

    case "terms-set-aside": {
      // AC-17: for this job only, keeping its reason for the result card.
      if (!acceptsTerms(session, action.jobId)) return session;
      const terms = new Map(session.terms);
      let changed = false;
      for (const id of action.terms) {
        const state = terms.get(id);
        if (state?.state !== "not-searched") continue;
        terms.set(id, Object.freeze({ state: "set-aside", reason: state.reason }));
        changed = true;
      }
      return changed ? freeze({ ...session, terms }) : session;
    }

    case "terms-removed": {
      // AC-5: each term out of the job, its rows out of the checklist and its
      // rows out of the tick set, from any state.
      if (!acceptsTerms(session, action.jobId)) return session;
      const gone = new Set(action.terms.filter((id) => session.terms.has(id)));
      if (gone.size === 0) return session;

      const matches = session.matches.filter(
        (match) => match.term === null || !gone.has(match.term),
      );
      const kept = new Set(matches.map(({ id }) => id));
      const terms = new Map(session.terms);
      for (const id of gone) terms.delete(id);
      return freeze({
        ...session,
        ...backToReview(session),
        matches,
        ticked: new Set([...session.ticked].filter((id) => kept.has(id))),
        terms,
      });
    }
  }
}

/** Frozen and replaced, never mutated in place. */
function freeze(session: LiveSession): LiveSession {
  return Object.freeze(session);
}
