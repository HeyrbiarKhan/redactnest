import { describe, expect, it } from "vitest";

import {
  IDLE,
  sessionReducer,
  type SessionAction,
  type ToolSession,
} from "@/lib/session";
import { parseTelemetryEvent } from "@/telemetry/events";
import { toolEvents } from "@/telemetry/tool";
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
 * The tool's events, from session transitions. Spec 0016, AC-11 to AC-13 and
 * AC-18. Every session here is built by the real reducer, so each case is a
 * transition the page can actually make, and the batched ones (the silent
 * retry) are folded into one step, as React renders them.
 */

const SUMMARY: DocumentSummary = {
  pageCount: 4,
  pages: [
    { findings: [] },
    { findings: ["scanned"] },
    { findings: ["scanned", "blank"] },
    {
      findings: ["covered-text"],
    },
  ],
};

const OUTCOME: RedactionOutcome = {
  pageCount: 4,
  removedByType: { email: 2 },
  pagesByFinding: { scanned: 2 },
  sanitized: ["xmp-metadata", "annotations", "xmp-metadata"],
};

const FREE: EntitlementSnapshot = {
  tier: "free",
  pageCap: 3,
  maxFileBytes: 26_214_400,
  account: "none",
};
const PAID: EntitlementSnapshot = {
  tier: "paid",
  pageCap: 50,
  maxFileBytes: 26_214_400,
  account: "signed-in",
};

/** A row as the worker sends one. Its text is what must never reach an event. */
const match = (
  id: string,
  type: ReviewMatch["type"],
  blocked: ReviewMatch["blocked"] = null,
): ReviewMatch => ({
  id: asMatchId(id),
  type,
  page: 1,
  text: `secret-${id}@example.com`,
  before: "Dear Jane Doe, ",
  after: " passport",
  beforeCut: false,
  afterCut: false,
  tickedByDefault: blocked === null,
  blocked,
  concealed: null,
  term: null,
  termNotes: [],
});

const MATCHES: readonly ReviewMatch[] = [
  match("a", "email"),
  match("b", "email"),
  match("c", "phone"),
  match("d", "date", "replacement-text"),
];

const FILE = new File(["%PDF-1.7"], "Jane Doe passport.pdf", { type: "application/pdf" });

/** Run actions through the reducer, as each one would render alone. */
const run = (start: ToolSession, ...actions: SessionAction[]): ToolSession =>
  actions.reduce(sessionReducer, start);

const chosen = (entitlement: EntitlementSnapshot = FREE) =>
  run(IDLE, { type: "file-chosen", jobId: "job-1", file: FILE, entitlement, terms: [] });

const reviewing = (entitlement: EntitlementSnapshot = FREE) =>
  run(chosen(entitlement), { type: "opened", summary: SUMMARY, matches: MATCHES });

const redacting = (entitlement: EntitlementSnapshot = FREE) =>
  run(reviewing(entitlement), { type: "redact-started" });

describe("an open", () => {
  it("that succeeds sends document-opened once, in ranges and kinds", () => {
    expect(toolEvents(chosen(), reviewing())).toEqual([
      {
        name: "document-opened",
        pages: "2-5",
        found: { email: "2-5", phone: "1", date: "1" },
        blocked: { "replacement-text": "1" },
        pagesWith: { "covered-text": "1", scanned: "2-5", blank: "1" },
        tier: "free",
        account: "none",
      },
    ]);
  });

  it("carries the job's frozen plan, not the page's", () => {
    const [event] = toolEvents(chosen(PAID), reviewing(PAID));
    expect(event).toMatchObject({ tier: "paid", account: "signed-in" });
  });

  it("that fails sends run-refused with its kind, at the open step", () => {
    const failed = run(chosen(), { type: "failed", failure: "encrypted" });
    expect(toolEvents(chosen(), failed)).toEqual([
      {
        name: "run-refused",
        kind: "encrypted",
        step: "open",
        tier: "free",
        account: "none",
      },
    ]);
  });

  it.each([
    ["too-many-pages", "pages"],
    ["too-large", "size"],
  ] as const)("over a free cap (%s) sends one cap-reached instead", (kind, cap) => {
    const failed = run(chosen(), { type: "failed", failure: kind });
    expect(toolEvents(chosen(), failed)).toEqual([
      { name: "cap-reached", cap, account: "none" },
    ]);
  });

  it("over the paid ceiling is a refusal like any other", () => {
    const failed = run(chosen(PAID), { type: "failed", failure: "too-many-pages" });
    expect(toolEvents(chosen(PAID), failed)).toEqual([
      {
        name: "run-refused",
        kind: "too-many-pages",
        step: "open",
        tier: "paid",
        account: "signed-in",
      },
    ]);
  });

  it("that fails with engine-unavailable also sends the failure report", () => {
    const failed = run(chosen(), { type: "failed", failure: "engine-unavailable" });
    expect(toolEvents(chosen(), failed)).toEqual([
      {
        name: "run-refused",
        kind: "engine-unavailable",
        step: "open",
        tier: "free",
        account: "none",
      },
      { name: "engine-unavailable" },
    ]);
  });
});

describe("a run", () => {
  it("that completes sends redaction-completed from the result card's counts", () => {
    const ticked = run(redacting(), {
      type: "redacted",
      outcome: OUTCOME,
      removedByTerm: [],
    });
    expect(toolEvents(redacting(), ticked)).toEqual([
      {
        name: "redaction-completed",
        removed: { email: "2-5" },
        unticked: {},
        blockedByKind: { date: "1" },
        blockedByReason: { "replacement-text": "1" },
        stripped: ["xmp-metadata", "annotations"],
        // Spec 0017, AC-24: no term searched or set aside in this job.
        terms: "0",
        termsSetAside: "0",
        tier: "free",
        account: "none",
      },
    ]);
  });

  it("counts what was left unticked", () => {
    const start = run(
      reviewing(),
      { type: "tick-toggled", id: asMatchId("c") },
      { type: "redact-started" },
    );
    const [event] = toolEvents(
      start,
      run(start, { type: "redacted", outcome: OUTCOME, removedByTerm: [] }),
    );
    expect(event).toMatchObject({ unticked: { phone: "1" } });
  });

  it("sends again on a rerun", () => {
    const complete = run(redacting(), {
      type: "redacted",
      outcome: OUTCOME,
      removedByTerm: [],
    });
    const rerun = run(complete, { type: "downloaded" }, { type: "rerun" });
    expect(toolEvents(complete, rerun)).toEqual([]);
    const again = run(rerun, { type: "redacted", outcome: OUTCOME, removedByTerm: [] });
    expect(toolEvents(rerun, again)).toHaveLength(1);
  });

  it("that is refused sends run-refused at the redact step", () => {
    const refused = run(redacting(PAID), { type: "failed", failure: "replacement-text" });
    expect(toolEvents(redacting(PAID), refused)).toEqual([
      {
        name: "run-refused",
        kind: "replacement-text",
        step: "redact",
        tier: "paid",
        account: "signed-in",
      },
    ]);
  });

  it("that is cancelled sends nothing", () => {
    const cancelled = run(redacting(), { type: "cancelled" });
    expect(toolEvents(redacting(), cancelled)).toEqual([]);
  });
});

describe("a lost worker", () => {
  it("mid run sends run-refused at the redact step, and the failure report", () => {
    const lost = run(redacting(), { type: "worker-lost" });
    expect(toolEvents(redacting(), lost)).toEqual([
      {
        name: "run-refused",
        kind: "engine-unavailable",
        step: "redact",
        tier: "free",
        account: "none",
      },
      { name: "engine-unavailable" },
    ]);
  });

  it("during the review counts as the open step", () => {
    const lost = run(reviewing(), { type: "worker-lost" });
    expect(toolEvents(reviewing(), lost)[0]).toMatchObject({ step: "open" });
  });

  it("sends nothing on the silent retry, whose two actions land in one render", () => {
    const retried = run(chosen(), { type: "worker-lost" }, { type: "retry", terms: [] });
    expect(retried.state).toBe("opening");
    expect(toolEvents(chosen(), retried)).toEqual([]);
  });

  it("sends once, not again while it stays lost or as it retries", () => {
    const lost = run(reviewing(), { type: "worker-lost" });
    expect(toolEvents(lost, lost)).toEqual([]);
    expect(toolEvents(lost, run(lost, { type: "retry", terms: [] }))).toEqual([]);
  });
});

describe("everything else", () => {
  it.each<[string, () => [ToolSession, ToolSession]]>([
    ["a fresh page", () => [IDLE, IDLE]],
    ["choosing a file", () => [IDLE, chosen()]],
    [
      "a progress phase",
      () => [chosen(), run(chosen(), { type: "progress", phase: "detecting" })],
    ],
    [
      "a tick",
      () => [reviewing(), run(reviewing(), { type: "tick-toggled", id: asMatchId("a") })],
    ],
    ["starting a run", () => [reviewing(), redacting()]],
    [
      "a download",
      () => {
        const complete = run(redacting(), {
          type: "redacted",
          outcome: OUTCOME,
          removedByTerm: [],
        });
        return [complete, run(complete, { type: "downloaded" })];
      },
    ],
    ["starting over", () => [reviewing(), IDLE]],
    [
      "choosing another file mid review",
      () => [
        reviewing(),
        run(reviewing(), {
          type: "file-chosen",
          jobId: "job-2",
          file: FILE,
          entitlement: FREE,
          terms: [],
        }),
      ],
    ],
  ])("sends nothing for %s", (_label, transition) => {
    const [previous, next] = transition();
    expect(toolEvents(previous, next)).toEqual([]);
  });
});

describe("what an event can hold", () => {
  it("parses, and holds no file name, no document text and no match", () => {
    const complete = run(redacting(), {
      type: "redacted",
      outcome: OUTCOME,
      removedByTerm: [],
    });
    const events = [
      ...toolEvents(chosen(), reviewing()),
      ...toolEvents(redacting(), complete),
      ...toolEvents(redacting(), run(redacting(), { type: "worker-lost" })),
    ];
    expect(events).toHaveLength(4);
    for (const event of events) {
      expect(parseTelemetryEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
      const text = JSON.stringify(event);
      for (const leak of ["Jane", "passport", "secret-", "example.com", "Doe"]) {
        expect(text).not.toContain(leak);
      }
    }
  });
});

/**
 * Spec 0017, AC-24. `term` is one more kind in the by kind fields, and
 * `redaction-completed` counts the terms searched and set aside, each a
 * `Bucket`: never a term, a `TermId` or a per term count.
 */
describe("custom terms (spec 0017)", () => {
  // Ids a leak would show, unlike anything an event may hold.
  const ACME = asTermId("term-id-acme-7f3a");
  const JANE = asTermId("term-id-jane-91c2");
  const ZED = asTermId("term-id-zed-0b44");

  const termRow = (id: string, term: TermId): ReviewMatch => ({
    ...match(id, "term"),
    term,
  });

  const TERM_OUTCOME: RedactionOutcome = {
    pageCount: 4,
    removedByType: { email: 1, term: 3 },
    pagesByFinding: {},
    sanitized: [],
  };

  /** A paid job that opened with two kept terms found, then one search failed and was set aside. */
  const withTerms = () =>
    run(IDLE, {
      type: "file-chosen",
      jobId: "job-1",
      file: FILE,
      entitlement: PAID,
      terms: [ACME, JANE],
    });
  const openedWithTerms = () =>
    run(withTerms(), {
      type: "opened",
      summary: SUMMARY,
      matches: [
        match("e", "email"),
        termRow("a1", ACME),
        termRow("a2", ACME),
        termRow("j1", JANE),
      ],
    });
  const setAside = () =>
    run(
      openedWithTerms(),
      { type: "terms-searching", jobId: "job-1", terms: [ZED] },
      { type: "terms-failed", jobId: "job-1", terms: [ZED] },
      { type: "terms-set-aside", jobId: "job-1", terms: [ZED] },
    );

  it("counts the kept list's rows found at open under term", () => {
    const [event] = toolEvents(withTerms(), openedWithTerms());
    expect(event).toMatchObject({
      name: "document-opened",
      found: { email: "1", term: "2-5" },
    });
  });

  it("sends nothing when a review search lands, since document-opened counts only the open", () => {
    const searching = run(openedWithTerms(), {
      type: "terms-searching",
      jobId: "job-1",
      terms: [ZED],
    });
    const found = run(searching, {
      type: "terms-found",
      jobId: "job-1",
      terms: [ZED],
      matches: [termRow("z1", ZED)],
    });
    expect(toolEvents(openedWithTerms(), searching)).toEqual([]);
    expect(toolEvents(searching, found)).toEqual([]);
  });

  it("counts what was removed and left under term, and the terms searched and set aside", () => {
    const start = run(
      setAside(),
      { type: "tick-toggled", id: asMatchId("a2") },
      { type: "redact-started" },
    );
    const complete = run(start, {
      type: "redacted",
      outcome: TERM_OUTCOME,
      removedByTerm: [
        { term: ACME, removed: 1 },
        { term: JANE, removed: 1 },
      ],
    });

    expect(toolEvents(start, complete)).toEqual([
      {
        name: "redaction-completed",
        removed: { email: "1", term: "2-5" },
        unticked: { term: "1" },
        blockedByKind: {},
        blockedByReason: {},
        stripped: [],
        terms: "2-5",
        termsSetAside: "1",
        tier: "paid",
        account: "signed-in",
      },
    ]);
  });

  it("parses, and holds no term id and no per term count", () => {
    const start = run(setAside(), { type: "redact-started" });
    const complete = run(start, {
      type: "redacted",
      outcome: TERM_OUTCOME,
      removedByTerm: [{ term: ACME, removed: 2 }],
    });
    const events = [
      ...toolEvents(withTerms(), openedWithTerms()),
      ...toolEvents(start, complete),
    ];

    expect(events).toHaveLength(2);
    for (const event of events) {
      expect(parseTelemetryEvent(JSON.parse(JSON.stringify(event)))).toEqual(event);
      const text = JSON.stringify(event);
      for (const leak of ["term-id-", "secret-", "removedByTerm"]) {
        expect(text).not.toContain(leak);
      }
    }
  });
});
