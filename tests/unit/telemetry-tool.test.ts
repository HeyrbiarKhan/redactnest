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
  type DocumentSummary,
  type EntitlementSnapshot,
  type RedactionOutcome,
  type ReviewMatch,
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
  run(IDLE, { type: "file-chosen", jobId: "job-1", file: FILE, entitlement });

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
    const ticked = run(redacting(), { type: "redacted", outcome: OUTCOME });
    expect(toolEvents(redacting(), ticked)).toEqual([
      {
        name: "redaction-completed",
        removed: { email: "2-5" },
        unticked: {},
        blockedByKind: { date: "1" },
        blockedByReason: { "replacement-text": "1" },
        stripped: ["xmp-metadata", "annotations"],
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
    const [event] = toolEvents(start, run(start, { type: "redacted", outcome: OUTCOME }));
    expect(event).toMatchObject({ unticked: { phone: "1" } });
  });

  it("sends again on a rerun", () => {
    const complete = run(redacting(), { type: "redacted", outcome: OUTCOME });
    const rerun = run(complete, { type: "downloaded" }, { type: "rerun" });
    expect(toolEvents(complete, rerun)).toEqual([]);
    const again = run(rerun, { type: "redacted", outcome: OUTCOME });
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
    const retried = run(chosen(), { type: "worker-lost" }, { type: "retry" });
    expect(retried.state).toBe("opening");
    expect(toolEvents(chosen(), retried)).toEqual([]);
  });

  it("sends once, not again while it stays lost or as it retries", () => {
    const lost = run(reviewing(), { type: "worker-lost" });
    expect(toolEvents(lost, lost)).toEqual([]);
    expect(toolEvents(lost, run(lost, { type: "retry" }))).toEqual([]);
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
        const complete = run(redacting(), { type: "redacted", outcome: OUTCOME });
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
    const complete = run(redacting(), { type: "redacted", outcome: OUTCOME });
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
