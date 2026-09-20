import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DocumentSummary,
  ErrorMessage,
  RequestMessage,
  ResponseMessage,
} from "@/worker/protocol";

/**
 * The engine worker, tested as the protocol handler it is.
 *
 * MuPDF is the boundary and is stubbed; everything about the boundary contract
 * is the real module. The rule this file exists to hold is the one spec 0001
 * calls out: the worker never throws across the boundary, and an error payload
 * carries a kind and nothing derived from the document.
 *
 * That second half is what makes feature 11's scrubbing requirement achievable
 * rather than aspirational, so it is asserted against a document that carries
 * text nobody should ever see again.
 */

const { inspectDocument } = vi.hoisted(() => ({ inspectDocument: vi.fn() }));

vi.mock("@/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/engine")>();
  return { ...actual, inspectDocument };
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

function openRequest(id = "job-1"): RequestMessage {
  return {
    id,
    kind: "open",
    bytes: new ArrayBuffer(64),
    maxBytes: 26_214_400,
    maxPages: 50,
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
  inspectDocument.mockReset();
  inspectDocument.mockResolvedValue(SUMMARY);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("opening a document", () => {
  it("hands the engine the bytes and the caps it was given", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(inspectDocument).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      { maxBytes: 26_214_400, maxPages: 50 },
      expect.any(Function),
    );
  });

  it("reports the result against the id that asked for it", async () => {
    await startWorker();

    scope.send(openRequest("job-7"));
    await settle();

    expect(scope.of("result")).toEqual([
      { id: "job-7", kind: "result", summary: SUMMARY },
    ]);
  });

  it("passes each phase on as it happens", async () => {
    inspectDocument.mockImplementation(
      async (_bytes: ArrayBuffer, _limits: unknown, onPhase?: PhaseCallback) => {
        onPhase?.("loading-engine");
        onPhase?.("opening");
        onPhase?.("inspecting");
        return SUMMARY;
      },
    );
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(scope.of("progress").map((message) => message.kind)).toHaveLength(3);
    expect(scope.posted.at(-1)?.kind).toBe("result");
  });

  /**
   * Counts and flags only. The document itself never leaves the worker, so a
   * result must carry nothing beyond the summary the engine produced.
   */
  it("sends counts and flags, never the document", async () => {
    await startWorker();

    scope.send(openRequest());
    await settle();

    const [result] = scope.of("result");
    expect(Object.keys(result).sort()).toEqual(["id", "kind", "summary"]);
    expect(JSON.stringify(result)).not.toContain("ArrayBuffer");
  });
});

describe("when opening fails", () => {
  it("reports a described failure as its own kind", async () => {
    const { EngineFailure } = await import("@/engine");
    inspectDocument.mockRejectedValue(new EngineFailure("password-required"));
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(scope.of("error")).toEqual([
      { id: "job-1", kind: "error", errorKind: "password-required" },
    ]);
  });

  it("reports anything undescribed as unsupported", async () => {
    inspectDocument.mockRejectedValue(new TypeError("cannot read property of null"));
    await startWorker();

    scope.send(openRequest());
    await settle();

    expect(scope.of("error")).toEqual([
      { id: "job-1", kind: "error", errorKind: "unsupported" },
    ]);
  });

  /**
   * The privacy rule, stated as an assertion. Whatever MuPDF said about the
   * document stops at this boundary: no message, no stack, no extracted text.
   */
  it("lets nothing the failure said about the document cross the boundary", async () => {
    inspectDocument.mockRejectedValue(new Error(`failed parsing: ${SECRET}`));
    await startWorker();

    scope.send(openRequest());
    await settle();

    const serialised = JSON.stringify(scope.posted);
    expect(serialised).not.toContain(SECRET);
    expect(serialised).not.toContain("Jane Doe");
    expect(serialised).not.toContain("failed parsing");
  });

  it("sends a kind and nothing else", async () => {
    inspectDocument.mockRejectedValue(new Error(SECRET));
    await startWorker();

    scope.send(openRequest());
    await settle();

    const [error] = scope.of("error") as ErrorMessage[];
    expect(Object.keys(error).sort()).toEqual(["errorKind", "id", "kind"]);
  });

  /**
   * The one rule this file must never break. A throw here would surface as an
   * uncaught worker error carrying a stack trace, which is exactly the payload
   * the contract exists to prevent.
   */
  it("never throws across the boundary", async () => {
    inspectDocument.mockImplementation(() => {
      throw new Error(SECRET);
    });
    await startWorker();

    expect(() => scope.send(openRequest())).not.toThrow();
    await settle();

    expect(scope.of("error")).toHaveLength(1);
  });
});

describe("cancelling", () => {
  it("says nothing at all once a job is cancelled", async () => {
    await startWorker();

    scope.send(openRequest("job-9"));
    scope.send({ id: "job-9", kind: "cancel" });
    await settle();

    expect(scope.posted).toEqual([]);
  });

  it("suppresses progress that arrives after the cancel", async () => {
    inspectDocument.mockImplementation(
      async (_bytes: ArrayBuffer, _limits: unknown, onPhase?: PhaseCallback) => {
        await Promise.resolve();
        onPhase?.("opening");
        return SUMMARY;
      },
    );
    await startWorker();

    scope.send(openRequest("job-9"));
    scope.send({ id: "job-9", kind: "cancel" });
    await settle();

    expect(scope.of("progress")).toEqual([]);
  });

  it("reports no failure for a job that was cancelled", async () => {
    inspectDocument.mockRejectedValue(new Error(SECRET));
    await startWorker();

    scope.send(openRequest("job-9"));
    scope.send({ id: "job-9", kind: "cancel" });
    await settle();

    expect(scope.of("error")).toEqual([]);
  });

  it("cancels only the job it names", async () => {
    await startWorker();

    scope.send(openRequest("job-a"));
    scope.send(openRequest("job-b"));
    scope.send({ id: "job-a", kind: "cancel" });
    await settle();

    expect(scope.of("result")).toEqual([
      { id: "job-b", kind: "result", summary: SUMMARY },
    ]);
  });

  /** The cancelled set is cleared when a job finishes, so an id can be reused. */
  it("forgets the cancellation once the job is over", async () => {
    await startWorker();

    scope.send(openRequest("job-9"));
    scope.send({ id: "job-9", kind: "cancel" });
    await settle();

    scope.send(openRequest("job-9"));
    await settle();

    expect(scope.of("result")).toEqual([
      { id: "job-9", kind: "result", summary: SUMMARY },
    ]);
  });
});

describe("a rejection that escapes every handler", () => {
  it("is swallowed rather than reported with its stack", async () => {
    await startWorker();

    expect(scope.rejectUnhandled().defaultPrevented).toBe(true);
  });
});
