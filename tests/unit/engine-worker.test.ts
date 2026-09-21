import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  asMatchId,
  type DocumentSummary,
  type ErrorMessage,
  type RequestMessage,
  type ResponseMessage,
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

const { openDocument } = vi.hoisted(() => ({ openDocument: vi.fn() }));

vi.mock("@/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine")>();
  return { ...actual, openDocument };
});

type PhaseCallback = (phase: "loading-engine" | "opening" | "inspecting") => void;

class FakeScope {
  readonly posted: ResponseMessage[] = [];
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>();

  postMessage(message: ResponseMessage): void {
    this.posted.push(message);
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

/** A document handle, with its `close` spied on so releasing can be asserted. */
function fakeDocument() {
  return { summary: SUMMARY, close: vi.fn() };
}

function openRequest(overrides: { id?: string; jobId?: string } = {}): RequestMessage {
  return {
    id: overrides.id ?? "op-1",
    jobId: overrides.jobId ?? "job-1",
    kind: "open",
    bytes: new ArrayBuffer(64),
    limits: { maxBytes: 26_214_400, maxPages: 3 },
    contextChars: 40,
  };
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

  it("passes each phase on as it happens", async () => {
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

    expect(scope.of("progress")).toHaveLength(3);
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

  /**
   * The non-negotiable, asserted. Until feature 5 builds the removal there is
   * nothing that could be taken out, and handing back the document unchanged
   * under a redacted name would be the one failure this product cannot have.
   */
  it("never hands back a file it has not actually redacted", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();
    scope.send({ id: "op-2", jobId: "job-1", kind: "redact", matchIds: [] });

    expect(scope.of("redacted")).toEqual([]);
    expect(scope.of("error").at(-1)).toMatchObject({ errorKind: "unsupported" });
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
    openDocument.mockResolvedValue(doc);
    await startWorker();

    scope.send(openRequest({ id: "op-9" }));
    scope.send({ id: "op-9", jobId: "job-1", kind: "cancel" });
    await settle();

    expect(doc.close).toHaveBeenCalledTimes(1);
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
