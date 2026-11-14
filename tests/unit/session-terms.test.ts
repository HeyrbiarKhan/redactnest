import { describe, expect, it } from "vitest";

import {
  canMake,
  IDLE,
  sessionReducer,
  type LiveSession,
  type SessionAction,
  type ToolSession,
} from "@/lib/session";
import {
  asMatchId,
  asTermId,
  type DocumentSummary,
  type EntitlementSnapshot,
  type RedactionOutcome,
  type ReviewMatch,
  type TermId,
} from "@/worker/protocol";

/**
 * Each custom term's state in one job, and the five `terms-*` edges. Spec
 * 0017, *State transitions*, AC-5, AC-6, AC-17 to AC-20 and INV-3.
 */

const SUMMARY: DocumentSummary = {
  pageCount: 2,
  pages: [{ findings: [] }, { findings: [] }],
};

const PAID: EntitlementSnapshot = {
  tier: "paid",
  pageCap: 50,
  maxFileBytes: 26_214_400,
  account: "signed-in",
};
const FREE: EntitlementSnapshot = {
  tier: "free",
  pageCap: 3,
  maxFileBytes: 26_214_400,
  account: "none",
};

const OUTCOME: RedactionOutcome = {
  pageCount: 2,
  removedByType: { term: 1 },
  pagesByFinding: {},
  sanitized: [],
};

const ACME = asTermId("acme");
const SMITH = asTermId("smith");
const JOB = "job-1";
const FILE = new File([new Uint8Array([1])], "lease.pdf", { type: "application/pdf" });

function row(id: string, term: TermId | null, ticked = true): ReviewMatch {
  return {
    id: asMatchId(id),
    type: term === null ? "email" : "term",
    term,
    termNotes: ticked ? [] : ["spaced"],
    page: 1,
    text: id,
    before: "",
    after: "",
    beforeCut: false,
    afterCut: false,
    tickedByDefault: ticked,
    blocked: null,
    concealed: null,
  };
}

const EMAIL = row("email", null);
const ACME_ROW = row("acme-1", ACME);
const ACME_NOTED = row("acme-2", ACME, false);
const SMITH_ROW = row("smith-1", SMITH);

function drive(...actions: readonly SessionAction[]): ToolSession {
  return actions.reduce(sessionReducer, IDLE as ToolSession);
}

function live(session: ToolSession): LiveSession {
  if (session.state === "idle") throw new Error("expected a live session");
  return session;
}

const chosen = (entitlement: EntitlementSnapshot, terms: readonly TermId[]) =>
  ({ type: "file-chosen", jobId: JOB, file: FILE, entitlement, terms }) as const;

const opened = (matches: readonly ReviewMatch[]) =>
  ({ type: "opened", summary: SUMMARY, matches }) as const;

/** A paid job that opened with `ACME` kept and found once, plus an email. */
const reviewing = () => drive(chosen(PAID, [ACME]), opened([EMAIL, ACME_ROW]));

const states = (session: ToolSession) => Object.fromEntries(live(session).terms);

describe("opening with a kept list (AC-6, AC-9)", () => {
  it("searches every kept term at open on Pro, and marks them searched once opened", () => {
    expect(states(drive(chosen(PAID, [ACME, SMITH])))).toEqual({
      acme: { state: "searching" },
      smith: { state: "searching" },
    });
    const session = live(reviewing());
    expect(states(session)).toEqual({ acme: { state: "searched" } });
    expect([...session.ticked]).toEqual([EMAIL.id, ACME_ROW.id]);
  });

  it("lists the kept terms not searched on a free job (AC-17)", () => {
    const session = drive(chosen(FREE, [ACME]), opened([EMAIL]));
    expect(states(session)).toEqual({
      acme: { state: "not-searched", reason: "free-plan" },
    });
    expect(canMake(live(session))).toBe(false);
  });

  it("drops a row the open lands for a term the job does not hold (AC-5)", () => {
    const session = live(drive(chosen(PAID, []), opened([EMAIL, ACME_ROW])));
    expect(session.matches).toEqual([EMAIL]);
  });
});

describe("a review search (AC-3, AC-9, AC-19)", () => {
  it("adds the batch searching, then its rows and their default ticks, never reseeding", () => {
    const untick = sessionReducer(reviewing(), { type: "tick-toggled", id: EMAIL.id });
    const searching = sessionReducer(untick, {
      type: "terms-searching",
      jobId: JOB,
      terms: [SMITH],
    });
    expect(states(searching)).toEqual({
      acme: { state: "searched" },
      smith: { state: "searching" },
    });
    expect(canMake(live(searching))).toBe(false);

    const found = live(
      sessionReducer(searching, {
        type: "terms-found",
        jobId: JOB,
        terms: [SMITH],
        matches: [SMITH_ROW, row("stray", ACME)],
      }),
    );
    expect(states(found).smith).toEqual({ state: "searched" });
    // Only the batch's own term's rows land; the untick survives.
    expect(found.matches).toEqual([EMAIL, ACME_ROW, SMITH_ROW]);
    expect([...found.ticked]).toEqual([ACME_ROW.id, SMITH_ROW.id]);
    expect(canMake(found)).toBe(true);
  });

  it("adds a noted row unticked", () => {
    const found = live(
      (
        [
          { type: "terms-searching", jobId: JOB, terms: [SMITH] },
          {
            type: "terms-found",
            jobId: JOB,
            terms: [SMITH],
            matches: [row("smith-noted", SMITH, false)],
          },
        ] satisfies SessionAction[]
      ).reduce<ToolSession>(sessionReducer, reviewing()),
    );
    expect(found.ticked.has(asMatchId("smith-noted"))).toBe(false);
  });

  it("returns a complete session to reviewing, dropping the outcome and the made copy", () => {
    const complete = drive(
      chosen(PAID, [ACME]),
      opened([ACME_ROW]),
      { type: "redact-started" },
      { type: "redacted", outcome: OUTCOME, removedByTerm: [{ term: ACME, removed: 1 }] },
    );
    expect(live(complete).removedByTerm).toEqual([{ term: ACME, removed: 1 }]);

    const searching = live(
      sessionReducer(complete, { type: "terms-searching", jobId: JOB, terms: [SMITH] }),
    );
    expect(searching.state).toBe("reviewing");
    expect(searching.outcome).toBeNull();
    expect(searching.removedByTerm).toBeNull();
    expect(searching.downloaded).toBe(false);
  });

  it("never searches on a free job (INV-2)", () => {
    const free = drive(chosen(FREE, []), opened([EMAIL]));
    expect(
      sessionReducer(free, { type: "terms-searching", jobId: JOB, terms: [ACME] }),
    ).toBe(free);
  });

  it("ignores a batch for another job, or outside reviewing and complete", () => {
    const session = reviewing();
    for (const action of [
      { type: "terms-searching", jobId: "job-2", terms: [SMITH] },
      { type: "terms-found", jobId: "job-2", terms: [ACME], matches: [ACME_NOTED] },
      { type: "terms-failed", jobId: "job-2", terms: [ACME] },
      { type: "terms-set-aside", jobId: "job-2", terms: [ACME] },
      { type: "terms-removed", jobId: "job-2", terms: [ACME] },
    ] as const satisfies readonly SessionAction[]) {
      expect(sessionReducer(session, action)).toBe(session);
    }
    const opening = drive(chosen(PAID, [ACME]));
    expect(
      sessionReducer(opening, { type: "terms-removed", jobId: JOB, terms: [ACME] }),
    ).toBe(opening);
  });

  it("lands nothing for a term removed mid search (AC-5)", () => {
    const session = (
      [
        { type: "terms-searching", jobId: JOB, terms: [SMITH] },
        { type: "terms-removed", jobId: JOB, terms: [SMITH] },
        { type: "terms-found", jobId: JOB, terms: [SMITH], matches: [SMITH_ROW] },
      ] satisfies SessionAction[]
    ).reduce<ToolSession>(sessionReducer, reviewing());
    expect(live(session).matches).toEqual([EMAIL, ACME_ROW]);
    expect(states(session)).toEqual({ acme: { state: "searched" } });
  });
});

describe("a failed search, set aside and Try again (AC-17, AC-18, AC-20)", () => {
  const failed = () =>
    (
      [
        { type: "terms-searching", jobId: JOB, terms: [SMITH] },
        { type: "terms-failed", jobId: JOB, terms: [SMITH] },
      ] satisfies SessionAction[]
    ).reduce<ToolSession>(sessionReducer, reviewing());

  it("keeps the review and marks the batch not searched, which holds Make", () => {
    const session = live(failed());
    expect(session.matches).toEqual([EMAIL, ACME_ROW]);
    expect(states(session).smith).toEqual({
      state: "not-searched",
      reason: "search-failed",
    });
    expect(canMake(session)).toBe(false);
    expect(sessionReducer(session, { type: "redact-started" })).toBe(session);
  });

  it("lets the run go ahead once set aside, keeping the reason", () => {
    const session = live(
      sessionReducer(failed(), { type: "terms-set-aside", jobId: JOB, terms: [SMITH] }),
    );
    expect(states(session).smith).toEqual({
      state: "set-aside",
      reason: "search-failed",
    });
    expect(canMake(session)).toBe(true);
    expect(sessionReducer(session, { type: "redact-started" }).state).toBe("redacting");
  });

  it("searches it again on Try again", () => {
    const session = sessionReducer(failed(), {
      type: "terms-searching",
      jobId: JOB,
      terms: [SMITH],
    });
    expect(states(session).smith).toEqual({ state: "searching" });
  });

  it("sets aside only a term that was not searched", () => {
    const session = reviewing();
    expect(
      sessionReducer(session, { type: "terms-set-aside", jobId: JOB, terms: [ACME] }),
    ).toBe(session);
  });
});

describe("removing terms (AC-5)", () => {
  it("takes the term, its rows and its ticks out, from complete back to reviewing", () => {
    const complete = drive(
      chosen(PAID, [ACME]),
      opened([EMAIL, ACME_ROW]),
      { type: "redact-started" },
      { type: "redacted", outcome: OUTCOME, removedByTerm: [] },
    );
    const session = live(
      sessionReducer(complete, { type: "terms-removed", jobId: JOB, terms: [ACME] }),
    );
    expect(session.state).toBe("reviewing");
    expect(session.matches).toEqual([EMAIL]);
    expect([...session.ticked]).toEqual([EMAIL.id]);
    expect(session.terms.size).toBe(0);
  });
});

describe("Make waits only while it must (AC-5, AC-18, INV-3)", () => {
  it("lets Make run once the only term being searched is removed", () => {
    const searching = sessionReducer(reviewing(), {
      type: "terms-searching",
      jobId: JOB,
      terms: [SMITH],
    });
    expect(canMake(live(searching))).toBe(false);

    const removed = live(
      sessionReducer(searching, { type: "terms-removed", jobId: JOB, terms: [SMITH] }),
    );
    expect(canMake(removed)).toBe(true);
    expect(sessionReducer(removed, { type: "redact-started" }).state).toBe("redacting");
  });

  it("lets Make run once a term not searched on the Free plan is removed", () => {
    const free = drive(chosen(FREE, [ACME]), opened([EMAIL]));
    const removed = live(
      sessionReducer(free, { type: "terms-removed", jobId: JOB, terms: [ACME] }),
    );
    expect(removed.terms.size).toBe(0);
    expect(canMake(removed)).toBe(true);
  });

  it("keeps a Free plan term's reason when it is set aside (AC-17)", () => {
    const free = drive(chosen(FREE, [ACME]), opened([EMAIL]));
    const session = live(
      sessionReducer(free, { type: "terms-set-aside", jobId: JOB, terms: [ACME] }),
    );
    expect(states(session)).toEqual({
      acme: { state: "set-aside", reason: "free-plan" },
    });
    expect(canMake(session)).toBe(true);
  });

  it("keeps ticks working while a term is being searched", () => {
    const searching = sessionReducer(reviewing(), {
      type: "terms-searching",
      jobId: JOB,
      terms: [SMITH],
    });
    const unticked = live(
      sessionReducer(searching, { type: "tick-toggled", id: ACME_ROW.id }),
    );
    expect(unticked.ticked.has(ACME_ROW.id)).toBe(false);
    expect(states(unticked).smith).toEqual({ state: "searching" });
  });
});

describe("a Try again that fails again (AC-20)", () => {
  it("leaves its terms not searched for the same reason, and Make still waits", () => {
    const session = live(
      (
        [
          { type: "terms-searching", jobId: JOB, terms: [SMITH] },
          { type: "terms-failed", jobId: JOB, terms: [SMITH] },
          { type: "terms-searching", jobId: JOB, terms: [SMITH] },
          { type: "terms-failed", jobId: JOB, terms: [SMITH] },
        ] satisfies SessionAction[]
      ).reduce<ToolSession>(sessionReducer, reviewing()),
    );
    expect(states(session).smith).toEqual({
      state: "not-searched",
      reason: "search-failed",
    });
    expect(session.matches).toEqual([EMAIL, ACME_ROW]);
    expect(canMake(session)).toBe(false);
  });
});

describe("the per term removals (AC-22, INV-9)", () => {
  it("are dropped with the outcome when a tick change returns a complete session to reviewing", () => {
    const complete = drive(
      chosen(PAID, [ACME]),
      opened([EMAIL, ACME_ROW]),
      { type: "redact-started" },
      { type: "redacted", outcome: OUTCOME, removedByTerm: [{ term: ACME, removed: 1 }] },
    );
    const session = live(
      sessionReducer(complete, { type: "tick-toggled", id: EMAIL.id }),
    );
    expect(session.state).toBe("reviewing");
    expect(session.outcome).toBeNull();
    expect(session.removedByTerm).toBeNull();
  });
});

describe("a retry after a lost worker (AC-20)", () => {
  it("keeps a set aside term set aside and searches the rest at the reopen", () => {
    const session = (
      [
        { type: "terms-searching", jobId: JOB, terms: [SMITH] },
        { type: "terms-failed", jobId: JOB, terms: [SMITH] },
        { type: "terms-set-aside", jobId: JOB, terms: [SMITH] },
        { type: "worker-lost" },
        { type: "retry", terms: [ACME, SMITH] },
      ] satisfies SessionAction[]
    ).reduce<ToolSession>(sessionReducer, reviewing() as ToolSession);
    expect(states(session)).toEqual({
      acme: { state: "searching" },
      smith: { state: "set-aside", reason: "search-failed" },
    });
  });
});
