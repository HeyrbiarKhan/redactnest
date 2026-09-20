import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  asMatchId,
  type DocumentSummary,
  type OpenRequest,
  type RedactionOutcome,
  type RequestMessage,
  type ResponseMessage,
} from "@/worker/protocol";

/**
 * The main thread's only way to reach the engine.
 *
 * `Worker` is a genuine environment boundary, so it is the one thing stubbed
 * here. Everything on this side of it is the real module: the pending map, the
 * message routing, the transfer list, the failure mapping, the session.
 *
 * Three invariants are decided in this file and so asserted here rather than
 * left to the browser tests: document bytes live only in the worker (INV-1), the
 * caps that travel come from the entitlement snapshot rather than the paid
 * ceiling (INV-5), and `cancel` and `release` never mean the same thing (INV-8).
 */

interface Posted {
  message: unknown;
  transfer?: unknown[];
}

type Listener = (event: unknown) => void;

class FakeWorker {
  static instances: FakeWorker[] = [];

  readonly posted: Posted[] = [];
  readonly options: unknown;
  readonly url: unknown;
  terminated = false;

  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: unknown, options?: unknown) {
    this.url = url;
    this.options = options;
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown, transfer?: unknown[]): void {
    this.posted.push({ message, transfer });
  }

  addEventListener(type: string, listener: Listener): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  terminate(): void {
    this.terminated = true;
  }

  /** Deliver a message from the worker, as the real one would. */
  reply(message: ResponseMessage): void {
    for (const listener of this.listeners.get("message") ?? []) {
      listener({ data: message });
    }
  }

  /** The worker itself failing to start, or dying mid job. */
  fail(): { defaultPrevented: boolean } {
    const event = {
      defaultPrevented: false,
      preventDefault(this: { defaultPrevented: boolean }) {
        this.defaultPrevented = true;
      },
    };
    for (const listener of this.listeners.get("error") ?? []) listener(event);
    return event;
  }

  /** Every request this worker has been handed, in order. */
  get requests(): RequestMessage[] {
    return this.posted.map((entry) => entry.message as RequestMessage);
  }

  get lastOpen(): OpenRequest {
    const open = [...this.requests].reverse().find((request) => request.kind === "open");
    if (!open) throw new Error("no open request was posted");
    return open;
  }
}

const CONFIG_KEYS = [
  "NEXT_PUBLIC_FREE_PAGE_CAP",
  "NEXT_PUBLIC_MAX_PAGES",
  "NEXT_PUBLIC_MAX_FILE_BYTES",
  "NEXT_PUBLIC_MATCH_CONTEXT_CHARS",
] as const;

const originalEnv = { ...process.env };

async function loadClient(env: Record<string, string> = {}) {
  vi.resetModules();
  for (const key of CONFIG_KEYS) delete process.env[key];
  for (const [key, value] of Object.entries(env)) process.env[key] = value;
  return import("@/worker/client");
}

/** The worker the client started for this test. */
function currentWorker(): FakeWorker {
  const worker = FakeWorker.instances.at(-1);
  if (!worker) throw new Error("no worker was started");
  return worker;
}

const SUMMARY: DocumentSummary = { pageCount: 2, pagesWithText: [true, false] };

const OUTCOME: RedactionOutcome = {
  pageCount: 2,
  removedByType: { email: 3 },
  pagesWithoutText: 1,
  sanitized: ["xmp-metadata"],
};

/** The caps a job runs under, as the entitlement snapshot froze them. */
const LIMITS = { maxBytes: 26_214_400, maxPages: 3 };

/** Open a session and answer it, which is the starting point of most cases. */
async function openedSession(client: typeof import("@/worker/client")) {
  const pending = client.openSession({
    jobId: "job-1",
    bytes: new ArrayBuffer(64),
    limits: LIMITS,
  });
  const worker = currentWorker();
  const { id } = worker.lastOpen;

  worker.reply({ id, jobId: "job-1", kind: "result", summary: SUMMARY, matches: [] });
  return { session: await pending, worker };
}

beforeEach(() => {
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...originalEnv };
});

describe("starting the engine", () => {
  it("starts exactly one worker however often it is warmed", async () => {
    const { warmEngine } = await loadClient();

    warmEngine();
    warmEngine();
    warmEngine();

    expect(FakeWorker.instances).toHaveLength(1);
  });

  /**
   * The engine is loaded with a dynamic `import`, which a classic worker cannot
   * do. Downgrading this to a classic worker breaks the engine.
   */
  it("starts it as a module worker", async () => {
    const { warmEngine } = await loadClient();

    warmEngine();

    expect(currentWorker().options).toMatchObject({ type: "module" });
  });

  it("starts one on first open when nothing warmed it", async () => {
    const client = await loadClient();

    void client
      .openSession({ jobId: "job-1", bytes: new ArrayBuffer(8), limits: LIMITS })
      .catch(() => {});

    expect(FakeWorker.instances).toHaveLength(1);
  });
});

describe("handing a document over", () => {
  /**
   * INV-1. The transfer list is the line that keeps document content off the
   * main thread. A `postMessage` without it would structured clone the bytes and
   * leave a copy here, which is the guarantee quietly failing.
   *
   * The real detachment is proved in a real browser by `tests/e2e/engine.spec.ts`.
   */
  it("transfers the buffer rather than copying it", async () => {
    const client = await loadClient();
    const bytes = new ArrayBuffer(1024);

    void client.openSession({ jobId: "job-1", bytes, limits: LIMITS }).catch(() => {});

    expect(currentWorker().posted[0].transfer).toEqual([bytes]);
  });

  it("sends the bytes as the open request's payload", async () => {
    const client = await loadClient();
    const bytes = new ArrayBuffer(1024);

    void client.openSession({ jobId: "job-1", bytes, limits: LIMITS }).catch(() => {});

    const open = currentWorker().lastOpen;
    expect(open.kind).toBe("open");
    expect(open.bytes).toBe(bytes);
  });

  it("names the session on every message it sends", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    session.cancel();

    for (const request of worker.requests) {
      expect(request.jobId).toBe("job-1");
    }
  });

  it("gives every operation its own id", async () => {
    const client = await loadClient();

    void client
      .openSession({ jobId: "a", bytes: new ArrayBuffer(8), limits: LIMITS })
      .catch(() => {});
    void client
      .openSession({ jobId: "b", bytes: new ArrayBuffer(8), limits: LIMITS })
      .catch(() => {});

    const [first, second] = currentWorker().requests;
    expect(first.id).not.toBe(second.id);
  });

  /**
   * INV-5, and the gap spec 0002 was written to close. The cap that travels is
   * the snapshot's, so a hardcoded `config.maxPages` here would hand an
   * anonymous visitor the paid ceiling, which is exactly what used to happen.
   */
  it("sends the caps it was given, never the paid ceiling from config", async () => {
    const client = await loadClient({
      NEXT_PUBLIC_MAX_PAGES: "137",
      NEXT_PUBLIC_MAX_FILE_BYTES: "4242",
    });

    void client
      .openSession({
        jobId: "job-1",
        bytes: new ArrayBuffer(8),
        limits: { maxBytes: 999, maxPages: 3 },
      })
      .catch(() => {});

    expect(currentWorker().lastOpen.limits).toEqual({ maxBytes: 999, maxPages: 3 });
  });

  /** INV-9. The context window is a config value like every other cap. */
  it("takes the match context window from the config module", async () => {
    const client = await loadClient({ NEXT_PUBLIC_MATCH_CONTEXT_CHARS: "17" });

    void client
      .openSession({ jobId: "job-1", bytes: new ArrayBuffer(8), limits: LIMITS })
      .catch(() => {});

    expect(currentWorker().lastOpen.contextChars).toBe(17);
  });
});

describe("what comes back", () => {
  it("resolves with a session carrying the summary and the checklist", async () => {
    const client = await loadClient();
    const { session } = await openedSession(client);

    expect(session.jobId).toBe("job-1");
    expect(session.summary).toEqual(SUMMARY);
    expect(session.matches).toEqual([]);
  });

  it("reports each phase without settling the operation", async () => {
    const client = await loadClient();
    const phases: string[] = [];
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
      onProgress: (phase) => phases.push(phase),
    });
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    worker.reply({ id, jobId: "job-1", kind: "progress", phase: "loading-engine" });
    worker.reply({ id, jobId: "job-1", kind: "progress", phase: "inspecting" });

    expect(phases).toEqual(["loading-engine", "inspecting"]);

    worker.reply({ id, jobId: "job-1", kind: "result", summary: SUMMARY, matches: [] });
    await expect(pending).resolves.toMatchObject({ jobId: "job-1" });
  });

  it("rejects with the kind the worker reported", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const worker = currentWorker();

    worker.reply({
      id: worker.lastOpen.id,
      jobId: "job-1",
      kind: "error",
      errorKind: "password-required",
    });

    await expect(pending).rejects.toMatchObject({
      name: "EngineError",
      errorKind: "password-required",
    });
  });

  /**
   * A kind outside the closed set means the contract has drifted. It is mapped
   * rather than passed through, so nothing unrecognised reaches the interface.
   */
  it("maps an unrecognised kind to unsupported", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const worker = currentWorker();

    worker.reply({
      id: worker.lastOpen.id,
      jobId: "job-1",
      kind: "error",
      errorKind: "something-new" as never,
    });

    await expect(pending).rejects.toMatchObject({ errorKind: "unsupported" });
  });

  it("ignores a message for an operation it does not know", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const worker = currentWorker();

    expect(() =>
      worker.reply({
        id: "a-stranger",
        jobId: "job-1",
        kind: "result",
        summary: SUMMARY,
        matches: [],
      }),
    ).not.toThrow();

    worker.reply({
      id: worker.lastOpen.id,
      jobId: "job-1",
      kind: "result",
      summary: SUMMARY,
      matches: [],
    });
    await expect(pending).resolves.toMatchObject({ jobId: "job-1" });
  });

  /**
   * A reply belonging to a session that has since been replaced. Dropped rather
   * than handed to whoever holds that operation id now, which is what carrying
   * `jobId` on every message buys.
   */
  it("drops a reply that names a different session", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    worker.reply({
      id,
      jobId: "an-older-job",
      kind: "error",
      errorKind: "corrupt",
    });
    worker.reply({ id, jobId: "job-1", kind: "result", summary: SUMMARY, matches: [] });

    await expect(pending).resolves.toMatchObject({ jobId: "job-1" });
  });

  it("settles an operation once, so a late result after a failure changes nothing", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    worker.reply({ id, jobId: "job-1", kind: "error", errorKind: "corrupt" });
    worker.reply({ id, jobId: "job-1", kind: "result", summary: SUMMARY, matches: [] });

    await expect(pending).rejects.toMatchObject({ errorKind: "corrupt" });
  });

  /** Answering an `open` with something that is not a `result` is drift too. */
  it("refuses a reply of the wrong kind for the operation", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const worker = currentWorker();

    worker.reply({
      id: worker.lastOpen.id,
      jobId: "job-1",
      kind: "redacted",
      output: new ArrayBuffer(8),
      outcome: OUTCOME,
    });

    await expect(pending).rejects.toMatchObject({ errorKind: "unsupported" });
  });
});

describe("redacting through a session", () => {
  it("sends ids and nothing else, so no geometry can travel", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    void session.redact([asMatchId("m1"), asMatchId("m2")]).catch(() => {});

    const request = worker.requests.at(-1);
    expect(request).toMatchObject({
      kind: "redact",
      jobId: "job-1",
      matchIds: ["m1", "m2"],
    });
    expect(Object.keys(request ?? {}).sort()).toEqual([
      "id",
      "jobId",
      "kind",
      "matchIds",
    ]);
  });

  it("hands back the output and the counts", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);
    const output = new ArrayBuffer(16);

    const pending = session.redact([]);
    const redactId = worker.requests.at(-1)?.id ?? "";
    worker.reply({
      id: redactId,
      jobId: "job-1",
      kind: "redacted",
      output,
      outcome: OUTCOME,
    });

    await expect(pending).resolves.toEqual({ output, outcome: OUTCOME });
  });

  it("reports a refusal as the kind the worker gave", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    const pending = session.redact([asMatchId("invented")]);
    const redactId = worker.requests.at(-1)?.id ?? "";
    worker.reply({
      id: redactId,
      jobId: "job-1",
      kind: "error",
      errorKind: "unsupported",
    });

    await expect(pending).rejects.toMatchObject({ errorKind: "unsupported" });
  });
});

describe("when the worker dies", () => {
  it("fails every operation in flight with engine-unavailable", async () => {
    const client = await loadClient();
    const first = client.openSession({
      jobId: "a",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const second = client.openSession({
      jobId: "b",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });

    currentWorker().fail();

    await expect(first).rejects.toMatchObject({ errorKind: "engine-unavailable" });
    await expect(second).rejects.toMatchObject({ errorKind: "engine-unavailable" });
  });

  /**
   * Left to bubble, this surfaces as an uncaught worker error carrying a stack.
   * Feature 11 must never see one.
   */
  it("prevents the browser's default error handling", async () => {
    const client = await loadClient();
    void client
      .openSession({ jobId: "a", bytes: new ArrayBuffer(8), limits: LIMITS })
      .catch(() => {});

    expect(currentWorker().fail().defaultPrevented).toBe(true);
  });

  /** AC-11. The page has to learn, so the session can go to `lost` and retry. */
  it("tells anybody listening, so the session can recover", async () => {
    const client = await loadClient();
    const heard = vi.fn();
    client.onEngineLost(heard);

    client.warmEngine();
    currentWorker().fail();

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("stops telling a listener that unsubscribed", async () => {
    const client = await loadClient();
    const heard = vi.fn();
    const stop = client.onEngineLost(heard);

    stop();
    client.warmEngine();
    currentWorker().fail();

    expect(heard).not.toHaveBeenCalled();
  });
});

/** INV-8. One aborts an operation; the other ends the session. Never both. */
describe("cancelling an operation", () => {
  it("tells the worker to stop", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    worker.reply({ id, jobId: "job-1", kind: "result", summary: SUMMARY, matches: [] });
    const session = await pending;
    void session.redact([]).catch(() => {});
    const redactId = worker.requests.at(-1)?.id;

    session.cancel();

    expect(worker.requests.at(-1)).toEqual({
      id: redactId,
      jobId: "job-1",
      kind: "cancel",
    });
  });

  /**
   * Cancelling is a choice, not a failure, so it is not one of the closed set of
   * kinds. Showing somebody an error for something they asked for would be the
   * wrong answer, and there is no kind that could say it honestly.
   */
  it("reports the cancellation as a cancellation, not as a failure", async () => {
    const client = await loadClient();
    const { session } = await openedSession(client);

    const redacting = session.redact([]);
    session.cancel();

    await expect(redacting).rejects.toMatchObject({ name: "OperationCancelled" });
  });

  it("leaves the worker running, so the document stays open", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    void session.redact([]).catch(() => {});
    session.cancel();

    expect(worker.terminated).toBe(false);
  });

  it("ignores a result that arrives after the cancel", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    const redacting = session.redact([]);
    const redactId = worker.requests.at(-1)?.id ?? "";
    session.cancel();
    worker.reply({
      id: redactId,
      jobId: "job-1",
      kind: "redacted",
      output: new ArrayBuffer(8),
      outcome: OUTCOME,
    });

    await expect(redacting).rejects.toMatchObject({ name: "OperationCancelled" });
  });

  it("does nothing when there is nothing in flight", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);
    const before = worker.requests.length;

    session.cancel();
    session.cancel();

    expect(worker.requests).toHaveLength(before);
  });
});

describe("releasing the session", () => {
  it("terminates the worker, which is what actually frees the engine", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    session.release();

    expect(worker.terminated).toBe(true);
  });

  it("can be called with no session at all", async () => {
    const { releaseEngine } = await loadClient();

    expect(() => releaseEngine()).not.toThrow();
  });

  /**
   * Abandoned, not failed. Somebody who chose a different file should not be
   * shown an error about the document they just walked away from.
   */
  it("reports anything in flight as cancelled rather than broken", async () => {
    const client = await loadClient();
    const pending = client.openSession({
      jobId: "job-1",
      bytes: new ArrayBuffer(8),
      limits: LIMITS,
    });

    client.releaseEngine();

    await expect(pending).rejects.toMatchObject({ name: "OperationCancelled" });
  });

  it("starts a fresh worker for the next document", async () => {
    const client = await loadClient();
    const { session } = await openedSession(client);

    session.release();
    void client
      .openSession({ jobId: "job-2", bytes: new ArrayBuffer(8), limits: LIMITS })
      .catch(() => {});

    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[1].terminated).toBe(false);
  });
});

/**
 * AC-10 and INV-8, on the client side. The reducer half of this is covered in
 * `session.test.ts`; what was missing is the half that makes the promise true
 * in practice.
 *
 * "Back on the checklist with the document still open" is only worth anything
 * if the session that survives a cancel can actually be used again. A cancel
 * that left the session wedged, or that let the abandoned operation settle the
 * next one, would satisfy every existing test here and still strand somebody.
 */
describe("a session that was cancelled and used again", () => {
  /** covers: AC-10 */
  it("redacts again after a cancel, on the same open document", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    await expect(cancelARedaction(session)).rejects.toMatchObject({
      name: "OperationCancelled",
    });

    const second = session.redact([]);
    const secondId = worker.requests.at(-1)?.id ?? "";
    worker.reply({
      id: secondId,
      jobId: "job-1",
      kind: "redacted",
      output: new ArrayBuffer(8),
      outcome: OUTCOME,
    });

    await expect(second).resolves.toMatchObject({ outcome: OUTCOME });
  });

  /** A fresh operation id, so the abandoned reply cannot settle the new one. */
  it("gives the second attempt an id of its own", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    const redacting = session.redact([]);
    const firstId = worker.requests.at(-1)?.id;
    session.cancel();
    await expect(redacting).rejects.toThrow();

    void session.redact([]).catch(() => {});

    expect(worker.requests.at(-1)?.id).not.toBe(firstId);
  });

  /**
   * The cancelled operation's reply arrives late, as a worker that was already
   * mid job will do. It names an id nobody is waiting for any more, so it has
   * to be dropped rather than delivered to whoever holds the next one.
   */
  it("is not settled by the abandoned operation's late reply", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    const first = session.redact([]);
    const firstId = worker.requests.at(-1)?.id ?? "";
    session.cancel();
    await expect(first).rejects.toThrow();

    const second = session.redact([]);
    const secondId = worker.requests.at(-1)?.id ?? "";

    // The cancelled one answers first, and late.
    worker.reply({
      id: firstId,
      jobId: "job-1",
      kind: "redacted",
      output: new ArrayBuffer(8),
      outcome: OUTCOME,
    });
    worker.reply({
      id: secondId,
      jobId: "job-1",
      kind: "error",
      errorKind: "corrupt",
    });

    await expect(second).rejects.toMatchObject({ errorKind: "corrupt" });
  });

  it("keeps the same session, so nobody is sent back to the file picker", async () => {
    const client = await loadClient();
    const { session, worker } = await openedSession(client);

    await expect(cancelARedaction(session)).rejects.toThrow();

    expect(session.jobId).toBe("job-1");
    expect(session.summary).toEqual(SUMMARY);
    expect(FakeWorker.instances).toHaveLength(1);
    expect(worker.terminated).toBe(false);
  });
});

/** Start a redaction and cancel it. Returns the rejected promise to assert on. */
function cancelARedaction(
  session: Awaited<ReturnType<typeof openedSession>>["session"],
): Promise<unknown> {
  const redacting = session.redact([]);
  session.cancel();
  return redacting;
}
