import { describe, expect, it } from "vitest";

import {
  hasUnsavedWork,
  IDLE,
  outputNameFor,
  seededTicks,
  sessionReducer,
  type LiveSession,
  type SessionAction,
  type SessionState,
  type ToolSession,
} from "@/lib/session";
import {
  asMatchId,
  type DocumentSummary,
  type EntitlementSnapshot,
  type RedactionOutcome,
  type ReviewMatch,
} from "@/worker/protocol";

/**
 * The session machine, tested exhaustively rather than sampled.
 *
 * Spec 0002 noted that this machine is small enough to cover completely, which
 * is unusual and worth exploiting. So this file asserts every edge that exists
 * and, just as deliberately, every edge that must not: a machine that quietly
 * accepts an action it should ignore is how a released session comes back to
 * life holding a checklist that points at nothing.
 *
 * Two of the rules here are privacy rules rather than interface ones. A session
 * is frozen and replaced rather than mutated, so no part of the page can change
 * one out from under another part. And `retry` clears the review, because the
 * ids in it were minted by a worker that has died.
 */

const SUMMARY: DocumentSummary = { pageCount: 2, pagesWithText: [true, false] };

const OUTCOME: RedactionOutcome = {
  pageCount: 2,
  removedByType: { email: 2 },
  pagesWithoutText: 1,
  sanitized: ["xmp-metadata", "annotations"],
};

const FREE: EntitlementSnapshot = { tier: "free", pageCap: 3, maxFileBytes: 26_214_400 };
const PAID: EntitlementSnapshot = {
  tier: "paid",
  pageCap: 500,
  maxFileBytes: 26_214_400,
};

const ON = asMatchId("m-on");
const OFF = asMatchId("m-off");

const MATCHES: readonly ReviewMatch[] = [
  {
    id: ON,
    type: "email",
    page: 1,
    text: "jane@example.com",
    before: "contact ",
    after: " for details",
    tickedByDefault: true,
  },
  {
    id: OFF,
    type: "phone",
    page: 2,
    text: "555 0100",
    before: "call ",
    after: " any time",
    tickedByDefault: false,
  },
];

function file(name = "quarterly-report.pdf"): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "application/pdf" });
}

const CHOOSE: SessionAction = {
  type: "file-chosen",
  jobId: "job-1",
  file: file(),
  entitlement: FREE,
};

/** Replay actions from idle, which is how every case builds its starting point. */
function drive(...actions: readonly SessionAction[]): ToolSession {
  return actions.reduce<ToolSession>(sessionReducer, IDLE);
}

/** A session at each step, so the "must not" cases can start from all of them. */
const AT: Record<Exclude<SessionState, "idle">, () => ToolSession> = {
  opening: () => drive(CHOOSE),
  reviewing: () => drive(CHOOSE, { type: "opened", summary: SUMMARY, matches: MATCHES }),
  redacting: () =>
    drive(
      CHOOSE,
      { type: "opened", summary: SUMMARY, matches: MATCHES },
      { type: "redact-started" },
    ),
  complete: () =>
    drive(
      CHOOSE,
      { type: "opened", summary: SUMMARY, matches: MATCHES },
      { type: "redact-started" },
      { type: "redacted", outcome: OUTCOME },
    ),
  failed: () => drive(CHOOSE, { type: "failed", failure: "corrupt" }),
  lost: () => drive(CHOOSE, { type: "worker-lost" }),
};

const EVERY_STATE = Object.keys(AT) as (keyof typeof AT)[];

/** Narrow for the cases that read a live session's fields. */
function live(session: ToolSession): LiveSession {
  if (session.state === "idle") throw new Error("expected a live session");
  return session;
}

describe("opening a document", () => {
  it("starts at opening with nothing known about it yet", () => {
    const session = live(drive(CHOOSE));

    expect(session).toMatchObject({
      state: "opening",
      jobId: "job-1",
      summary: null,
      matches: [],
      phase: null,
      failure: null,
      outcome: null,
      downloaded: false,
    });
    expect(session.ticked.size).toBe(0);
  });

  /** The handle, not the bytes. This is the whole of INV-1 on the main thread. */
  it("keeps the file handle and never its contents", () => {
    const chosen = file();
    const session = live(drive({ ...CHOOSE, file: chosen }));

    expect(session.file).toBe(chosen);
    expect(Object.keys(session)).not.toContain("bytes");
  });

  /** INV-5. The tier is fixed here and nothing later may revise it. */
  it("freezes the entitlement it was given", () => {
    const session = live(drive({ ...CHOOSE, entitlement: PAID }));

    expect(session.entitlement).toEqual(PAID);
    expect(Object.isFrozen(session.entitlement)).toBe(true);
  });

  it("copies the entitlement rather than holding the caller's object", () => {
    const snapshot = { ...FREE };
    const session = live(drive({ ...CHOOSE, entitlement: snapshot }));

    expect(session.entitlement).not.toBe(snapshot);
  });

  it("records each phase as the worker reports it", () => {
    const session = live(drive(CHOOSE, { type: "progress", phase: "inspecting" }));

    expect(session.phase).toBe("inspecting");
  });

  it("moves to reviewing with the checklist the worker sent", () => {
    const session = live(
      drive(CHOOSE, { type: "opened", summary: SUMMARY, matches: MATCHES }),
    );

    expect(session.state).toBe("reviewing");
    expect(session.summary).toEqual(SUMMARY);
    expect(session.matches).toEqual(MATCHES);
    expect(session.phase).toBeNull();
  });

  it("seeds the ticks from each detector's own recommendation", () => {
    const session = live(
      drive(CHOOSE, { type: "opened", summary: SUMMARY, matches: MATCHES }),
    );

    expect([...session.ticked]).toEqual([ON]);
  });

  /** Choosing a file is itself a release trigger, so it always starts clean. */
  it.each(EVERY_STATE)("replaces a session that was at %s", (state) => {
    const session = live(sessionReducer(AT[state](), { ...CHOOSE, jobId: "job-2" }));

    expect(session.state).toBe("opening");
    expect(session.jobId).toBe("job-2");
    expect(session.matches).toEqual([]);
  });
});

describe("the output name", () => {
  it.each([
    ["quarterly-report.pdf", "quarterly-report-redacted.pdf"],
    ["REPORT.PDF", "REPORT-redacted.pdf"],
    ["no extension", "no extension-redacted.pdf"],
    ["  spaced out.pdf  ", "spaced out-redacted.pdf"],
    ["a.pdf.pdf", "a.pdf-redacted.pdf"],
    // Nothing left after stripping, so the fallback rather than "-redacted.pdf".
    [".pdf", "document-redacted.pdf"],
    ["   ", "document-redacted.pdf"],
  ])("turns %s into %s", (input, expected) => {
    expect(outputNameFor(input)).toBe(expected);
  });

  it("is derived once, at open", () => {
    expect(live(drive(CHOOSE)).outputName).toBe("quarterly-report-redacted.pdf");
  });
});

describe("reviewing", () => {
  it("adds a tick that was off", () => {
    const session = live(
      drive(
        CHOOSE,
        { type: "opened", summary: SUMMARY, matches: MATCHES },
        {
          type: "tick-toggled",
          id: OFF,
        },
      ),
    );

    expect([...session.ticked].sort()).toEqual([OFF, ON].sort());
  });

  it("removes a tick that was on", () => {
    const session = live(
      drive(
        CHOOSE,
        { type: "opened", summary: SUMMARY, matches: MATCHES },
        {
          type: "tick-toggled",
          id: ON,
        },
      ),
    );

    expect([...session.ticked]).toEqual([]);
  });

  /** An id this session never saw names nothing, so it changes nothing. */
  it("ignores an id that is not on the checklist", () => {
    const before = AT.reviewing();
    const after = sessionReducer(before, {
      type: "tick-toggled",
      id: asMatchId("never-minted"),
    });

    expect(after).toBe(before);
  });

  it("does not reach across to the worker, so nothing crosses on a tick", () => {
    const session = live(AT.reviewing());

    expect(session.summary).toEqual(SUMMARY);
    expect(session.state).toBe("reviewing");
  });
});

describe("redacting", () => {
  it("starts from reviewing and clears any earlier outcome", () => {
    const session = live(AT.redacting());

    expect(session.state).toBe("redacting");
    expect(session.outcome).toBeNull();
  });

  it("completes with the counts the worker reported", () => {
    const session = live(AT.complete());

    expect(session.state).toBe("complete");
    expect(session.outcome).toEqual(OUTCOME);
    expect(session.downloaded).toBe(false);
  });

  /** AC-10. Back to the checklist, document still open, nothing lost. */
  it("returns to the checklist on a cancel, with the review intact", () => {
    const session = live(sessionReducer(AT.redacting(), { type: "cancelled" }));

    expect(session.state).toBe("reviewing");
    expect(session.matches).toEqual(MATCHES);
    expect(session.summary).toEqual(SUMMARY);
    expect(session.phase).toBeNull();
  });

  it("fails with a kind from the closed set and nothing else", () => {
    const session = live(
      sessionReducer(AT.redacting(), { type: "failed", failure: "unsupported" }),
    );

    expect(session.state).toBe("failed");
    expect(session.failure).toBe("unsupported");
  });
});

describe("after a download", () => {
  it("records that the file was handed over", () => {
    const session = live(sessionReducer(AT.complete(), { type: "downloaded" }));

    expect(session.downloaded).toBe(true);
  });

  /**
   * AC-14, and the reason a download deliberately is not a release trigger. The
   * document is still open, so correcting a tick costs nothing but the rerun.
   */
  it("lets a tick be changed and the job run again", () => {
    const corrected = live(
      drive(
        CHOOSE,
        { type: "opened", summary: SUMMARY, matches: MATCHES },
        { type: "redact-started" },
        { type: "redacted", outcome: OUTCOME },
        { type: "downloaded" },
        { type: "tick-toggled", id: OFF },
      ),
    );

    expect(corrected.state).toBe("reviewing");
    expect(corrected.file).toBeInstanceOf(File);
    expect([...corrected.ticked].sort()).toEqual([OFF, ON].sort());
  });

  /** The old output is gone, so nothing may still claim it was downloaded. */
  it("forgets the download when the job leaves complete", () => {
    const corrected = live(
      drive(
        CHOOSE,
        { type: "opened", summary: SUMMARY, matches: MATCHES },
        { type: "redact-started" },
        { type: "redacted", outcome: OUTCOME },
        { type: "downloaded" },
        { type: "tick-toggled", id: OFF },
      ),
    );

    expect(corrected.downloaded).toBe(false);
    expect(corrected.outcome).toBeNull();
  });
});

/** AC-11. The one recoverable failure, and honest about what it costs. */
describe("a worker that dies", () => {
  it.each(["opening", "reviewing", "redacting", "complete"] as const)(
    "moves a session at %s to lost",
    (state) => {
      const session = live(sessionReducer(AT[state](), { type: "worker-lost" }));

      expect(session.state).toBe("lost");
      expect(session.failure).toBe("engine-unavailable");
    },
  );

  it("keeps the file handle, so the retry needs no second trip to the picker", () => {
    const chosen = file();
    const session = live(drive({ ...CHOOSE, file: chosen }, { type: "worker-lost" }));

    expect(session.file).toBe(chosen);
  });

  it("keeps the frozen entitlement, so the retry runs on the same terms", () => {
    const session = live(
      drive({ ...CHOOSE, entitlement: PAID }, { type: "worker-lost" }),
    );

    expect(session.entitlement).toEqual(PAID);
  });

  it("re-enters at opening on a retry", () => {
    const session = live(drive(CHOOSE, { type: "worker-lost" }, { type: "retry" }));

    expect(session.state).toBe("opening");
    expect(session.failure).toBeNull();
  });

  /**
   * The honest part. A retry saves the file picker and nothing more: the old
   * ids were minted by the worker that died, so the review starts over. On a
   * document with sixty matches that is a real loss, and a state machine that
   * kept the old checklist would be pointing at ids nothing can resolve.
   */
  it("throws the whole review away, because its ids died with the worker", () => {
    const session = live(
      drive(
        CHOOSE,
        { type: "opened", summary: SUMMARY, matches: MATCHES },
        { type: "tick-toggled", id: OFF },
        { type: "worker-lost" },
        { type: "retry" },
      ),
    );

    expect(session.matches).toEqual([]);
    expect(session.ticked.size).toBe(0);
    expect(session.summary).toBeNull();
  });

  /** `failed` is terminal for that document. A dead worker does not undo it. */
  it("leaves a failed session failed", () => {
    const before = AT.failed();

    expect(sessionReducer(before, { type: "worker-lost" })).toBe(before);
  });
});

describe("releasing", () => {
  it.each(EVERY_STATE)("returns a session at %s to idle", (state) => {
    expect(sessionReducer(AT[state](), { type: "released" })).toEqual(IDLE);
  });

  it("leaves nothing behind for the next document", () => {
    const released = sessionReducer(AT.complete(), { type: "released" });

    expect(Object.keys(released)).toEqual(["state"]);
  });
});

/**
 * The edges that must not exist.
 *
 * Asserted by identity, not by shape: an action that does not belong returns the
 * very same object, so an accidental new state with the same fields would still
 * fail here.
 */
describe("actions that do not belong in a state", () => {
  const CASES: readonly [SessionState, SessionAction][] = [
    // Nothing but choosing a file starts a session.
    ["idle", { type: "opened", summary: SUMMARY, matches: MATCHES }],
    ["idle", { type: "progress", phase: "opening" }],
    ["idle", { type: "redact-started" }],
    ["idle", { type: "redacted", outcome: OUTCOME }],
    ["idle", { type: "downloaded" }],
    ["idle", { type: "cancelled" }],
    ["idle", { type: "failed", failure: "corrupt" }],
    ["idle", { type: "worker-lost" }],
    ["idle", { type: "retry" }],
    ["idle", { type: "tick-toggled", id: ON }],
    // A document that is not open yet cannot be reviewed, redacted or cancelled
    // back to a step that does not exist.
    ["opening", { type: "tick-toggled", id: ON }],
    ["opening", { type: "redact-started" }],
    ["opening", { type: "redacted", outcome: OUTCOME }],
    ["opening", { type: "downloaded" }],
    ["opening", { type: "cancelled" }],
    ["opening", { type: "retry" }],
    // Reviewing is main thread only. Nothing arrives from the worker here.
    ["reviewing", { type: "opened", summary: SUMMARY, matches: MATCHES }],
    ["reviewing", { type: "progress", phase: "redacting" }],
    ["reviewing", { type: "redacted", outcome: OUTCOME }],
    ["reviewing", { type: "downloaded" }],
    ["reviewing", { type: "cancelled" }],
    ["reviewing", { type: "failed", failure: "corrupt" }],
    ["reviewing", { type: "retry" }],
    // A tick cannot be changed while the removal it describes is running.
    ["redacting", { type: "tick-toggled", id: ON }],
    ["redacting", { type: "opened", summary: SUMMARY, matches: MATCHES }],
    ["redacting", { type: "redact-started" }],
    ["redacting", { type: "downloaded" }],
    ["redacting", { type: "retry" }],
    // A finished job does not re-finish, and nothing restarts it in place.
    ["complete", { type: "redacted", outcome: OUTCOME }],
    ["complete", { type: "redact-started" }],
    ["complete", { type: "progress", phase: "writing" }],
    ["complete", { type: "cancelled" }],
    ["complete", { type: "failed", failure: "corrupt" }],
    ["complete", { type: "retry" }],
    // Terminal for that document. Only a new file or a release moves it.
    ["failed", { type: "opened", summary: SUMMARY, matches: MATCHES }],
    ["failed", { type: "progress", phase: "opening" }],
    ["failed", { type: "tick-toggled", id: ON }],
    ["failed", { type: "redact-started" }],
    ["failed", { type: "redacted", outcome: OUTCOME }],
    ["failed", { type: "downloaded" }],
    ["failed", { type: "cancelled" }],
    ["failed", { type: "retry" }],
    // Lost takes a retry or a release, and nothing else.
    ["lost", { type: "opened", summary: SUMMARY, matches: MATCHES }],
    ["lost", { type: "progress", phase: "opening" }],
    ["lost", { type: "tick-toggled", id: ON }],
    ["lost", { type: "redact-started" }],
    ["lost", { type: "redacted", outcome: OUTCOME }],
    ["lost", { type: "downloaded" }],
    ["lost", { type: "cancelled" }],
    ["lost", { type: "failed", failure: "corrupt" }],
    ["lost", { type: "worker-lost" }],
  ];

  it.each(CASES)("leaves a session at %s unchanged by %o", (state, action) => {
    const before = state === "idle" ? IDLE : AT[state]();

    expect(sessionReducer(before, action)).toBe(before);
  });
});

describe("a session is frozen and replaced, never changed in place", () => {
  it.each(EVERY_STATE)("freezes a session at %s", (state) => {
    expect(Object.isFrozen(AT[state]())).toBe(true);
  });

  it("leaves the previous session untouched when it moves on", () => {
    const reviewing = live(AT.reviewing());
    const redacting = sessionReducer(reviewing, { type: "redact-started" });

    expect(reviewing.state).toBe("reviewing");
    expect(redacting).not.toBe(reviewing);
  });

  it("builds a new tick set rather than changing the old one", () => {
    const reviewing = live(AT.reviewing());
    const toggled = live(sessionReducer(reviewing, { type: "tick-toggled", id: OFF }));

    expect(toggled.ticked).not.toBe(reviewing.ticked);
    expect(reviewing.ticked.size).toBe(1);
  });
});

/**
 * AC-1 and AC-13 both hang off this one predicate, which is why spec 0002
 * defines it once rather than describing it twice.
 */
describe("whether there is work worth warning about", () => {
  it("says no on an untouched page", () => {
    expect(hasUnsavedWork(IDLE)).toBe(false);
  });

  it("says no while a document is still opening", () => {
    expect(hasUnsavedWork(AT.opening())).toBe(false);
  });

  /** Reading a checklist without touching it has cost nobody anything. */
  it("says no on a checklist nobody has touched", () => {
    expect(hasUnsavedWork(AT.reviewing())).toBe(false);
  });

  it("says yes once a tick differs from the seeded default", () => {
    const touched = sessionReducer(AT.reviewing(), { type: "tick-toggled", id: OFF });

    expect(hasUnsavedWork(touched)).toBe(true);
  });

  /** Ticking and unticking the same box is back where it started. */
  it("says no again when the ticks are put back as they were", () => {
    const there = sessionReducer(AT.reviewing(), { type: "tick-toggled", id: OFF });
    const back = sessionReducer(there, { type: "tick-toggled", id: OFF });

    expect(hasUnsavedWork(back)).toBe(false);
  });

  it("says yes while a redaction is running", () => {
    expect(hasUnsavedWork(AT.redacting())).toBe(true);
  });

  it("says yes on a finished job nobody has downloaded", () => {
    expect(hasUnsavedWork(AT.complete())).toBe(true);
  });

  it("says no once the file has been handed over", () => {
    const downloaded = sessionReducer(AT.complete(), { type: "downloaded" });

    expect(hasUnsavedWork(downloaded)).toBe(false);
  });

  it("says no on a failed or lost job, which has nothing left to lose", () => {
    expect(hasUnsavedWork(AT.failed())).toBe(false);
    expect(hasUnsavedWork(AT.lost())).toBe(false);
  });
});

describe("the seeded tick set", () => {
  it("holds exactly the matches each detector recommended", () => {
    expect([...seededTicks(MATCHES)]).toEqual([ON]);
  });

  it("is empty when there is nothing to review", () => {
    expect(seededTicks([]).size).toBe(0);
  });
});
