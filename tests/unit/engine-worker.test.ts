import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { FindOptions, FoundMatch, RedactionTarget } from "@/engine";
import {
  asMatchId,
  type DocumentSummary,
  type ErrorMessage,
  type RedactedMessage,
  type RequestMessage,
  type ResponseMessage,
  type ResultMessage,
} from "@/worker/protocol";

/**
 * The engine worker, tested as the protocol handler and session registry it is.
 *
 * MuPDF is the boundary and is stubbed; everything about the boundary contract
 * is the real module. The rules this file exists to hold:
 *
 *  - The worker never throws across the boundary, and an error payload carries a
 *    kind and nothing derived from the document (spec 0001). That second half is
 *    what makes feature 11's scrubbing requirement achievable rather than
 *    aspirational, so it is asserted against a document carrying text nobody
 *    should ever see again.
 *  - A document is held open across steps and closed when the session ends, one
 *    session at a time (spec 0002, AC-1 and AC-5).
 *  - Geometry never crosses the boundary (INV-2).
 */

const { openDocument, redactDocument } = vi.hoisted(() => ({
  openDocument: vi.fn(),
  redactDocument: vi.fn(),
}));

vi.mock("@/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine")>();
  return { ...actual, openDocument, redactDocument };
});

type PhaseCallback = (phase: "loading-engine" | "opening" | "inspecting") => void;

interface RunHooks {
  onPhase?: (phase: "redacting" | "writing" | "verifying") => void;
  isCancelled?: () => boolean;
}

class FakeScope {
  readonly posted: ResponseMessage[] = [];
  /** The transfer list each message was posted with, in the same order. */
  readonly transferred: (readonly ArrayBuffer[] | undefined)[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  postMessage(message: ResponseMessage, transfer?: readonly ArrayBuffer[]): void {
    this.posted.push(message);
    this.transferred.push(transfer);
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  /** Deliver a request from the main thread. */
  send(request: RequestMessage): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: request });
    }
  }

  /** A rejection that escaped every handler. */
  rejectUnhandled(): { defaultPrevented: boolean } {
    const event = {
      defaultPrevented: false,
      preventDefault(this: { defaultPrevented: boolean }) {
        this.defaultPrevented = true;
      },
    };
    for (const listener of this.listeners.get("unhandledrejection") ?? []) {
      listener(event);
    }
    return event;
  }

  of(kind: ResponseMessage["kind"]): ResponseMessage[] {
    return this.posted.filter((message) => message.kind === kind);
  }
}

const SUMMARY: DocumentSummary = { pageCount: 2, pagesWithText: [true, false] };

/** Text that must never appear on the other side of the boundary. */
const SECRET = "Patient Jane Doe, account 4111-1111-1111-1111";

/**
 * A document handle, with its `close` spied on so releasing can be asserted.
 * Detection finds nothing unless a test hands it matches.
 */
function fakeDocument(found: readonly FoundMatch[] = []) {
  return {
    summary: SUMMARY,
    close: vi.fn(),
    findMatches: vi.fn<(options: FindOptions) => Promise<readonly FoundMatch[]>>(
      async () => found,
    ),
  };
}

function openRequest(
  overrides: { id?: string; jobId?: string; bytes?: ArrayBuffer } = {},
): RequestMessage {
  return {
    id: overrides.id ?? "op-1",
    jobId: overrides.jobId ?? "job-1",
    kind: "open",
    bytes: overrides.bytes ?? new ArrayBuffer(64),
    limits: { maxBytes: 26_214_400, maxPages: 3 },
    contextChars: 40,
  };
}

function redactRequest(overrides: { id?: string; jobId?: string } = {}): RequestMessage {
  return {
    id: overrides.id ?? "op-2",
    jobId: overrides.jobId ?? "job-1",
    kind: "redact",
    matchIds: [],
  };
}

/** What the engine hands back from a run that passed its self check. */
function engineResult() {
  return {
    output: new ArrayBuffer(128),
    removedByType: {},
    sanitized: ["document-info", "annotations"],
  };
}

/** A promise the test settles when it chooses. */
function gate<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settleWith, failWith) => {
    resolve = settleWith;
    reject = failWith;
  });
  return { promise, resolve, reject };
}

/** Let the worker's async handler run to completion. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let scope: FakeScope;

async function startWorker(): Promise<void> {
  scope = new FakeScope();
  vi.stubGlobal("self", scope);
  vi.resetModules();
  await import("@/worker/engine.worker");
}

beforeEach(() => {
  openDocument.mockReset();
  openDocument.mockResolvedValue(fakeDocument());
  redactDocument.mockReset();
  redactDocument.mockResolvedValue(engineResult());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("opening a document", () => {
  /**
   * The caps come from the entitlement snapshot frozen for this job, and the
   * worker applies exactly what it was handed. Sending the paid ceiling here
   * instead is what left the free page cap unenforced before spec 0002.
   */
  it("hands the engine the bytes and the caps it was given", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(openDocument).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { maxBytes: 26_214_400, maxPages: 3 },
      expect.any(Function),
    );
  });

  it("reports the result against the operation and the session that asked", async () => {
    await startWorker();

    scope.send(openRequest({ id: "op-7", jobId: "job-7" }));
    await settle();

    expect(scope.of("result")).toEqual([
      { id: "op-7", jobId: "job-7", kind: "result", summary: SUMMARY, matches: [] },
    ]);
  });

  it("passes each phase on as it happens, detecting last", async () => {
    openDocument.mockImplementation(
      async (_bytes: ArrayBuffer, _limits: unknown, onPhase?: PhaseCallback) => {
        onPhase?.("loading-engine");
        onPhase?.("opening");
        onPhase?.("inspecting");
        return fakeDocument();
      },
    );
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(
      scope.posted.flatMap((message) =>
        message.kind === "progress" ? [message.phase] : [],
      ),
    ).toEqual(["loading-engine", "opening", "inspecting", "detecting"]);
    expect(scope.posted.at(-1)?.kind).toBe("result");
  });

  /**
   * Counts and flags only, plus the review rows. The document itself never
   * leaves the worker, and INV-2 keeps quads, offsets and page geometry out of
   * every message regardless.
   */
  it("sends counts and flags, never the document", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();

    const [result] = scope.of("result");
    expect(Object.keys(result).sort()).toEqual([
      "id",
      "jobId",
      "kind",
      "matches",
      "summary",
    ]);
    expect(JSON.stringify(result)).not.toContain("ArrayBuffer");
  });

  /**
   * Spec 0002. The document stays parsed for the session's life, so changing a
   * tick and running again costs no reparse. Closing it here is what the old per
   * call `finally` used to do, and doing it would make the session pointless.
   */
  it("keeps the document open once the result is reported", async () => {
    const doc = fakeDocument();
    openDocument.mockResolvedValue(doc);
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(doc.close).not.toHaveBeenCalled();
  });
});

/**
 * Spec 0005. Detection runs inside `open`. The worker mints each match's id,
 * keeps only an unblocked match's target in its private map, and sends review
 * rows that carry no geometry (INV-2, INV-4).
 */
describe("detecting", () => {
  const TARGET: RedactionTarget = Object.freeze<RedactionTarget>({
    page: 0,
    quads: [[72, 80, 180, 80, 72, 96, 180, 96]],
    start: 9,
    end: 25,
    kind: "email",
    text: "jane@example.com",
  });

  const FOUND: readonly FoundMatch[] = Object.freeze([
    {
      page: 0,
      kind: "email",
      text: "jane@example.com",
      before: "Contact: ",
      after: " or call",
      tickedByDefault: true,
      blocked: null,
      target: TARGET,
    },
    {
      page: 1,
      kind: "phone",
      text: "020 7946 0958",
      before: "call ",
      after: ".",
      tickedByDefault: true,
      blocked: "slanted-text",
      target: null,
    },
  ]);

  async function openWith(found: readonly FoundMatch[] = FOUND) {
    const doc = fakeDocument(found);
    openDocument.mockResolvedValue(doc);
    await startWorker();
    scope.send(openRequest());
    await settle();
    return doc;
  }

  function result(): ResultMessage {
    const [message] = scope.of("result");
    if (message?.kind !== "result") throw new Error("expected a result");
    return message;
  }

  it("asks the engine with the context window the open carried", async () => {
    const doc = await openWith();

    expect(doc.findMatches).toHaveBeenCalledWith({
      contextChars: 40,
      isCancelled: expect.any(Function),
    });
  });

  it("sends each match as a review row, one based, and nothing more", async () => {
    await openWith();

    const [email, phone] = result().matches;
    expect(Object.keys(email).sort()).toEqual([
      "after",
      "before",
      "blocked",
      "id",
      "page",
      "text",
      "tickedByDefault",
      "type",
    ]);
    expect(email).toMatchObject({
      type: "email",
      page: 1,
      text: "jane@example.com",
      before: "Contact: ",
      after: " or call",
      tickedByDefault: true,
      blocked: null,
    });
    expect(phone).toMatchObject({ type: "phone", page: 2, blocked: "slanted-text" });
    // INV-2: no quads, no offsets, nothing of the target.
    expect(JSON.stringify(scope.posted)).not.toMatch(/quads|"start"|"end"/);
  });

  it("sends a blocked match unticked, whatever detection recommended", async () => {
    await openWith();

    expect(result().matches[1].tickedByDefault).toBe(false);
  });

  it("mints a fresh id for every match, and new ones for the next document", async () => {
    await openWith();
    const first = result().matches.map((match) => match.id);

    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    await settle();
    const [, second] = scope.of("result") as ResultMessage[];

    expect(new Set(first).size).toBe(2);
    expect(second.matches.map((match) => match.id)).not.toContain(first[0]);
    expect(second.matches.map((match) => match.id)).not.toContain(first[1]);
  });

  it("redacts an unblocked match with the target the engine found", async () => {
    await openWith();
    const [email] = result().matches;

    scope.send({ id: "op-2", jobId: "job-1", kind: "redact", matchIds: [email.id] });
    await settle();

    expect(redactDocument).toHaveBeenCalledTimes(1);
    expect(redactDocument.mock.calls[0][1]).toEqual([TARGET]);
  });

  /** INV-2. A blocked match has no target, so the existing check refuses it. */
  it("refuses a redact naming a blocked match, and runs nothing", async () => {
    await openWith();
    const [email, phone] = result().matches;

    scope.send({
      id: "op-2",
      jobId: "job-1",
      kind: "redact",
      matchIds: [email.id, phone.id],
    });
    await settle();

    expect(redactDocument).not.toHaveBeenCalled();
    expect(scope.of("error")).toEqual([
      { id: "op-2", jobId: "job-1", kind: "error", errorKind: "unsupported" },
    ]);
  });

  /** AC-12. A page with text that cannot be read fails the open, and keeps nothing. */
  it("reports a page detection cannot read as unsupported, and closes the document", async () => {
    const { EngineFailure } = await import("@/engine");
    const doc = fakeDocument();
    doc.findMatches.mockRejectedValue(new EngineFailure("unsupported"));
    openDocument.mockResolvedValue(doc);
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest());

    expect(doc.close).toHaveBeenCalledTimes(1);
    expect(scope.of("result")).toEqual([]);
    expect(scope.of("error").map((message) => message.id)).toEqual(["op-1", "op-2"]);
  });

  it("lets nothing a failed detection said about the document cross the boundary", async () => {
    const doc = fakeDocument();
    doc.findMatches.mockRejectedValue(new Error(`detector choked on ${SECRET}`));
    openDocument.mockResolvedValue(doc);
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(scope.of("error")).toEqual([
      { id: "op-1", jobId: "job-1", kind: "error", errorKind: "unsupported" },
    ]);
    expect(JSON.stringify(scope.posted)).not.toContain("Jane Doe");
  });

  /** AC-11. What the engine reads after each read of each page. */
  it("gives detection a check that turns true once the open is cancelled", async () => {
    const detecting = gate<readonly FoundMatch[]>();
    const doc = fakeDocument();
    doc.findMatches.mockReturnValue(detecting.promise);
    openDocument.mockResolvedValue(doc);
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    await settle();
    const [{ isCancelled }] = doc.findMatches.mock.calls[0];
    expect(isCancelled?.()).toBe(false);

    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    expect(isCancelled?.()).toBe(true);

    detecting.resolve(FOUND);
    await settle();

    expect(scope.of("result")).toEqual([]);
    expect(doc.close).toHaveBeenCalledTimes(1);
  });

  /**
   * AC-11 and spec 0002, AC-1. A second document chosen while the first is
   * still being read: the client cancels the first open and sends the second,
   * in that order. The first stops at its next read, posts nothing, and keeps
   * nothing; the second opens.
   */
  it("gives way to a replacement that arrives while it is detecting", async () => {
    const { RunCancelled } = await import("@/engine");
    const first = fakeDocument();
    const second = fakeDocument();
    const detecting = gate<readonly FoundMatch[]>();
    first.findMatches.mockImplementation(async ({ isCancelled }) => {
      await detecting.promise;
      if (isCancelled?.()) throw new RunCancelled();
      return FOUND;
    });
    openDocument.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await startWorker();

    scope.send(openRequest({ id: "op-1", jobId: "job-1" }));
    await settle();
    scope.send({ id: "op-1", jobId: "job-1", kind: "cancel" });
    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    detecting.resolve([]);
    await settle();

    expect(
      scope.posted.filter(
        (message) => message.id === "op-1" && message.kind !== "progress",
      ),
    ).toEqual([]);
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(scope.of("result").map((message) => message.id)).toEqual(["op-2"]);
    expect(second.close).not.toHaveBeenCalled();
  });

  it("posts nothing when detection stops for a cancel, and closes the document", async () => {
    const { RunCancelled } = await import("@/engine");
    const doc = fakeDocument();
    doc.findMatches.mockRejectedValue(new RunCancelled());
    openDocument.mockResolvedValue(doc);
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    await settle();

    expect(scope.posted.filter((message) => message.kind !== "progress")).toEqual([]);
    expect(doc.close).toHaveBeenCalledTimes(1);
  });
});

/** AC-1. One tab holds at most one session, enforced on this side too. */
describe("a second document in the same worker", () => {
  it("closes the first, so two are never held at once", async () => {
    const first = fakeDocument();
    const second = fakeDocument();
    openDocument.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    await startWorker();

    scope.send(openRequest({ id: "op-1", jobId: "job-1" }));
    await settle();
    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    await settle();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(second.close).not.toHaveBeenCalled();
  });

  /**
   * The previous document goes when the next one arrives, not when it parses.
   *
   * This is what a replacement gives up by not terminating the worker, so it is
   * the thing that has to be asserted: choosing a second file gets rid of the
   * first document even when the second one turns out to be unopenable, rather
   * than leaving it held open for as long as somebody keeps picking bad files.
   */
  it("closes the first even when the second never opens", async () => {
    const first = fakeDocument();
    openDocument
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("unreadable"));
    await startWorker();

    scope.send(openRequest({ id: "op-1", jobId: "job-1" }));
    await settle();
    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    await settle();

    expect(first.close).toHaveBeenCalledTimes(1);
    expect(scope.of("error")).toHaveLength(1);
  });

  it("leaves the newer session usable", async () => {
    await startWorker();

    scope.send(openRequest({ id: "op-1", jobId: "job-1" }));
    await settle();
    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    await settle();

    expect(scope.of("result").map((message) => message.jobId)).toEqual([
      "job-1",
      "job-2",
    ]);
  });
});

describe("when opening fails", () => {
  it("reports a described failure as its own kind", async () => {
    const { EngineFailure } = await import("@/engine");
    openDocument.mockRejectedValue(new EngineFailure("password-required"));
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(scope.of("error")).toEqual([
      { id: "op-1", jobId: "job-1", kind: "error", errorKind: "password-required" },
    ]);
  });

  it("reports anything undescribed as unsupported", async () => {
    openDocument.mockRejectedValue(new TypeError("cannot read property of null"));
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(scope.of("error")).toEqual([
      { id: "op-1", jobId: "job-1", kind: "error", errorKind: "unsupported" },
    ]);
  });

  /**
   * The privacy rule, stated as an assertion. Whatever MuPDF said about the
   * document stops at this boundary: no message, no stack, no extracted text.
   */
  it("lets nothing the failure said about the document cross the boundary", async () => {
    openDocument.mockRejectedValue(new Error(`failed parsing: ${SECRET}`));
    await startWorker();

    scope.send(openRequest());
    await settle();

    const serialised = JSON.stringify(scope.posted);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain("Jane Doe");
    expect(serialised).not.toContain("failed parsing");
  });

  it("sends a kind and nothing else", async () => {
    openDocument.mockRejectedValue(new Error(SECRET));
    await startWorker();

    scope.send(openRequest());
    await settle();

    const [error] = scope.of("error") as ErrorMessage[];
    expect(Object.keys(error).sort()).toEqual(["errorKind", "id", "jobId", "kind"]);
  });

  /**
   * The one rule this file must never break. A throw here would surface as an
   * uncaught worker error carrying a stack trace, which is exactly the payload
   * the contract exists to prevent.
   */
  it("never throws across the boundary", async () => {
    openDocument.mockImplementation(() => {
      throw new Error(SECRET);
    });
    await startWorker();

    expect(() => scope.send(openRequest())).not.toThrow();
    await settle();

    expect(scope.of("error")).toHaveLength(1);
  });

  it("leaves no session behind for a document that never opened", async () => {
    openDocument.mockRejectedValue(new Error(SECRET));
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send({ id: "op-2", jobId: "job-1", kind: "redact", matchIds: [] });

    expect(scope.of("error").at(-1)).toMatchObject({ errorKind: "unsupported" });
  });
});

/**
 * Feature 5 owns the removal itself. What belongs to the session, and is tested
 * here, is that an id this worker never minted is refused rather than acted on.
 */
describe("redacting", () => {
  it("refuses a session it has never heard of", async () => {
    await startWorker();

    scope.send({ id: "op-9", jobId: "nobody", kind: "redact", matchIds: [] });

    expect(scope.of("error")).toEqual([
      { id: "op-9", jobId: "nobody", kind: "error", errorKind: "unsupported" },
    ]);
  });

  /**
   * INV-2 from the other direction. The main thread sends ids, and an id that
   * does not resolve against this worker's own target map is refused, so a stale
   * or tampered one can never pick out something to remove.
   */
  it("refuses an id it never minted", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send({
      id: "op-2",
      jobId: "job-1",
      kind: "redact",
      matchIds: [asMatchId("invented-by-the-page")],
    });

    expect(scope.of("error").at(-1)).toMatchObject({
      id: "op-2",
      errorKind: "unsupported",
    });
  });
});

/**
 * Spec 0004. A run, from the worker's side: resolve the ticks, run the engine
 * on the clean original, relay its phases, and post either the output or one
 * kind. The engine itself is mocked here; `tests/unit/redaction.test.ts` runs
 * the real one.
 */
describe("a redaction run", () => {
  it("runs the engine over the bytes the session was opened with", async () => {
    const bytes = new ArrayBuffer(64);
    await startWorker();

    scope.send(openRequest({ bytes }));
    await settle();
    scope.send(redactRequest());
    await settle();

    // The same buffer, not a copy of it: the clean original (spec 0004, INV-1).
    expect(redactDocument).toHaveBeenCalledTimes(1);
    expect(redactDocument.mock.calls[0][0]).toBe(bytes);
    expect(redactDocument.mock.calls[0][1]).toEqual([]);
  });

  /** AC-16. Relayed as they happen, then the result. */
  it("passes on redacting, writing and verifying, then posts the output", async () => {
    redactDocument.mockImplementation(
      async (_bytes: ArrayBuffer, _targets: unknown, hooks: RunHooks) => {
        hooks.onPhase?.("redacting");
        hooks.onPhase?.("writing");
        hooks.onPhase?.("verifying");
        return engineResult();
      },
    );
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest({ id: "op-5" }));
    await settle();

    const forRun = scope.posted.filter((message) => message.id === "op-5");
    expect(forRun.map((message) => message.kind)).toEqual([
      "progress",
      "progress",
      "progress",
      "redacted",
    ]);
    expect(
      forRun.flatMap((message) => (message.kind === "progress" ? [message.phase] : [])),
    ).toEqual(["redacting", "writing", "verifying"]);
  });

  /** AC-15. The outcome is the engine's counts plus the open summary's. */
  it("assembles the outcome from the run and the open summary", async () => {
    redactDocument.mockResolvedValue({
      ...engineResult(),
      removedByType: { email: 2 },
      sanitized: ["xmp-metadata"],
    });
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest());
    await settle();

    const [redacted] = scope.of("redacted") as RedactedMessage[];
    expect(redacted.outcome).toEqual({
      pageCount: 2,
      removedByType: { email: 2 },
      pagesWithoutText: 1,
      sanitized: ["xmp-metadata"],
    });
  });

  /**
   * INV-8. The engine made the copy, so its buffer crosses as it is, once, in
   * the transfer list rather than cloned.
   */
  it("transfers the engine's output rather than copying it", async () => {
    const result = engineResult();
    redactDocument.mockResolvedValue(result);
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest());
    await settle();

    const index = scope.posted.findIndex((message) => message.kind === "redacted");
    const redacted = scope.posted[index] as RedactedMessage;
    expect(redacted.output).toBe(result.output);
    expect(scope.transferred[index]).toEqual([result.output]);
  });

  it("sends the output, the outcome and nothing else", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest());
    await settle();

    const [redacted] = scope.of("redacted");
    expect(Object.keys(redacted).sort()).toEqual([
      "id",
      "jobId",
      "kind",
      "outcome",
      "output",
    ]);
  });

  /** AC-12. Nothing ticked is still a run: it cleans the file. */
  it("accepts an empty tick set", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest());
    await settle();

    expect(scope.of("redacted")).toHaveLength(1);
    expect(scope.of("error")).toEqual([]);
  });

  /** AC-14. All or nothing: one kind, and no output. */
  it.each([
    [
      "a described failure keeps its kind",
      "redaction-incomplete",
      "redaction-incomplete",
    ],
    ["an undescribed failure becomes unsupported", null, "unsupported"],
  ] as const)("%s", async (_label, kind, expected) => {
    const { EngineFailure } = await import("@/engine");
    redactDocument.mockRejectedValue(
      kind === null ? new TypeError(SECRET) : new EngineFailure(kind),
    );
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest({ id: "op-3" }));
    await settle();

    expect(scope.of("redacted")).toEqual([]);
    expect(scope.of("error")).toEqual([
      { id: "op-3", jobId: "job-1", kind: "error", errorKind: expected },
    ]);
  });

  it("lets nothing a failed run said about the document cross the boundary", async () => {
    redactDocument.mockRejectedValue(new Error(`self check found: ${SECRET}`));
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest());
    await settle();

    expect(JSON.stringify(scope.posted)).not.toContain("Jane Doe");
  });

  /** AC-17. A cancel that lands while the run is finishing throws its output away. */
  it("posts nothing for a run cancelled before it finished", async () => {
    const run = gate<ReturnType<typeof engineResult>>();
    redactDocument.mockReturnValue(run.promise);
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest({ id: "op-4" }));
    scope.send({ id: "op-4", jobId: "job-1", kind: "cancel" });
    run.resolve(engineResult());
    await settle();

    expect(scope.posted.filter((message) => message.id === "op-4")).toEqual([]);
  });

  it("posts nothing when the engine reports it stopped", async () => {
    const { RunCancelled } = await import("@/engine");
    redactDocument.mockRejectedValue(new RunCancelled());
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest({ id: "op-4" }));
    await settle();

    expect(scope.posted.filter((message) => message.id === "op-4")).toEqual([]);
  });

  /** A run leaves the session open, so a changed tick can run again (AC-14). */
  it("keeps the document open after a run", async () => {
    const doc = fakeDocument();
    openDocument.mockResolvedValue(doc);
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send(redactRequest());
    await settle();

    expect(doc.close).not.toHaveBeenCalled();
  });
});

/**
 * Spec 0004, AC-17, AC-18 and AC-23. Stopping a run, one run at a time, and a
 * new document arriving while a run is under way.
 *
 * The engine is gated here: each run waits on a promise the test settles, and
 * hands back the hooks the worker gave it, so the test can see what the engine
 * would see between pages.
 */
describe("stopping a run, and one run at a time", () => {
  /** An engine that waits, run by run, for the test to let it finish. */
  function gatedEngine() {
    const runs: {
      hooks: RunHooks;
      gate: ReturnType<typeof gate<ReturnType<typeof engineResult>>>;
    }[] = [];
    redactDocument.mockImplementation(
      (_bytes: ArrayBuffer, _targets: unknown, hooks: RunHooks) => {
        const run = { hooks, gate: gate<ReturnType<typeof engineResult>>() };
        runs.push(run);
        return run.gate.promise;
      },
    );
    return runs;
  }

  async function openSession(): Promise<void> {
    await startWorker();
    scope.send(openRequest());
    await settle();
  }

  it("gives the engine a check that turns true once the run is cancelled", async () => {
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-a" }));
    await settle();
    expect(runs[0].hooks.isCancelled?.()).toBe(false);

    scope.send({ id: "op-a", jobId: "job-1", kind: "cancel" });

    // What the engine reads after its next page.
    expect(runs[0].hooks.isCancelled?.()).toBe(true);
  });

  it("starts a second run only once the first has settled", async () => {
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-a" }));
    scope.send(redactRequest({ id: "op-b" }));
    await settle();
    expect(redactDocument).toHaveBeenCalledTimes(1);

    runs[0].gate.resolve(engineResult());
    await settle();

    expect(redactDocument).toHaveBeenCalledTimes(2);
  });

  /** AC-18. The cancelled run still holds its working copy until it settles. */
  it("holds a run requested behind a cancelled one until the cancelled one settles", async () => {
    const { RunCancelled } = await import("@/engine");
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-a" }));
    await settle();
    scope.send({ id: "op-a", jobId: "job-1", kind: "cancel" });
    scope.send(redactRequest({ id: "op-b" }));
    await settle();
    expect(redactDocument).toHaveBeenCalledTimes(1);

    runs[0].gate.reject(new RunCancelled());
    await settle();
    expect(redactDocument).toHaveBeenCalledTimes(2);

    runs[1].gate.resolve(engineResult());
    await settle();

    expect(scope.posted.filter((message) => message.id === "op-a")).toEqual([]);
    expect(scope.of("redacted").map((message) => message.id)).toEqual(["op-b"]);
  });

  /** AC-17. Noticed before a queued run starts, so it never costs a working copy. */
  it("never starts a run that was cancelled while it waited", async () => {
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-a" }));
    scope.send(redactRequest({ id: "op-b" }));
    scope.send({ id: "op-b", jobId: "job-1", kind: "cancel" });
    await settle();

    runs[0].gate.resolve(engineResult());
    await settle();

    expect(redactDocument).toHaveBeenCalledTimes(1);
    expect(scope.posted.filter((message) => message.id === "op-b")).toEqual([]);
  });

  it("keeps the queue going after a run fails", async () => {
    const { EngineFailure } = await import("@/engine");
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-a" }));
    scope.send(redactRequest({ id: "op-b" }));
    await settle();
    runs[0].gate.reject(new EngineFailure("redaction-incomplete"));
    await settle();
    runs[1].gate.resolve(engineResult());
    await settle();

    expect(scope.of("error").map((message) => message.id)).toEqual(["op-a"]);
    expect(scope.of("redacted").map((message) => message.id)).toEqual(["op-b"]);
  });

  /**
   * AC-23. A new document cancels the run in flight, and is not parsed until
   * that run has destroyed its working copy and let go of the old bytes.
   */
  it("cancels the run in flight when a new document arrives, and waits for it", async () => {
    const { RunCancelled } = await import("@/engine");
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-r" }));
    await settle();
    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    await settle();

    // Told to stop, and nothing new parsed while it has not.
    expect(runs[0].hooks.isCancelled?.()).toBe(true);
    expect(openDocument).toHaveBeenCalledTimes(1);

    runs[0].gate.reject(new RunCancelled());
    await settle();

    expect(openDocument).toHaveBeenCalledTimes(2);
    expect(scope.posted.filter((message) => message.id === "op-r")).toEqual([]);
    expect(scope.of("result").map((message) => message.jobId)).toEqual([
      "job-1",
      "job-2",
    ]);
  });

  /**
   * AC-23 again, for an open that reuses the running job's own id. That session
   * is over just the same, so the new document still waits for its run.
   */
  it("waits for the run in flight when the new document reuses its job id", async () => {
    const { RunCancelled } = await import("@/engine");
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-r" }));
    await settle();
    scope.send(openRequest({ id: "op-2", jobId: "job-1" }));
    await settle();

    expect(runs[0].hooks.isCancelled?.()).toBe(true);
    expect(openDocument).toHaveBeenCalledTimes(1);

    runs[0].gate.reject(new RunCancelled());
    await settle();

    expect(openDocument).toHaveBeenCalledTimes(2);
    expect(scope.posted.filter((message) => message.id === "op-r")).toEqual([]);
    expect(scope.of("result").map((message) => message.id)).toEqual(["op-1", "op-2"]);
  });

  it("never starts a run queued behind the one a new document cancelled", async () => {
    const { RunCancelled } = await import("@/engine");
    const runs = gatedEngine();
    await openSession();

    scope.send(redactRequest({ id: "op-a" }));
    scope.send(redactRequest({ id: "op-b" }));
    await settle();
    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    runs[0].gate.reject(new RunCancelled());
    await settle();

    expect(redactDocument).toHaveBeenCalledTimes(1);
    expect(scope.posted.filter((message) => message.id === "op-b")).toEqual([]);
  });

  it("parses a new document straight away when no run is in flight", async () => {
    await openSession();

    scope.send(openRequest({ id: "op-2", jobId: "job-2" }));
    await settle();

    expect(openDocument).toHaveBeenCalledTimes(2);
  });
});

describe("cancelling", () => {
  it("says nothing at all once an operation is cancelled", async () => {
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    await settle();

    expect(scope.posted).toEqual([]);
  });

  it("suppresses progress that arrives after the cancel", async () => {
    openDocument.mockImplementation(
      async (_bytes: ArrayBuffer, _limits: unknown, onPhase?: PhaseCallback) => {
        await Promise.resolve();
        onPhase?.("opening");
        return fakeDocument();
      },
    );
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    await settle();

    expect(scope.of("progress")).toEqual([]);
  });

  it("reports no failure for an operation that was cancelled", async () => {
    openDocument.mockRejectedValue(new Error(SECRET));
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    await settle();

    expect(scope.of("error")).toEqual([]);
  });

  /**
   * A document opened for an operation nobody is waiting for is closed rather
   * than left parsed. Cancelling frees memory; it does not quietly keep it.
   */
  it("closes a document that arrives after its open was cancelled", async () => {
    const doc = fakeDocument();
    const parsing = gate<ReturnType<typeof fakeDocument>>();
    openDocument.mockReturnValue(parsing.promise);
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    await settle();
    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    parsing.resolve(doc);
    await settle();

    expect(doc.close).toHaveBeenCalledTimes(1);
  });

  /** Cheaper still: cancelled before parsing began, so nothing is parsed at all. */
  it("never parses a document whose open was cancelled straight away", async () => {
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    await settle();

    expect(openDocument).not.toHaveBeenCalled();
    expect(scope.posted).toEqual([]);
  });

  it("cancels only the operation it names", async () => {
    await startWorker();

    scope.send(openRequest({ id: "op-a", jobId: "job-a" }));
    scope.send(openRequest({ id: "op-b", jobId: "job-b" }));
    scope.send({ id: "op-a", jobId: "job-a", kind: "cancel" });
    await settle();

    expect(scope.of("result")).toEqual([
      { id: "op-b", jobId: "job-b", kind: "result", summary: SUMMARY, matches: [] },
    ]);
  });

  /** The cancelled set is cleared when an operation ends, so an id can be reused. */
  it("forgets the cancellation once the operation is over", async () => {
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    await settle();

    scope.send(openRequest({ id: "op-9" }));
    await settle();

    expect(scope.of("result")).toHaveLength(1);
  });
});

describe("a rejection that escapes every handler", () => {
  it("is swallowed rather than reported with its stack", async () => {
    await startWorker();

    expect(scope.rejectUnhandled().defaultPrevented).toBe(true);
  });
});
