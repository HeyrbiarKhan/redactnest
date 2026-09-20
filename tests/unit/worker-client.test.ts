import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  DocumentSummary,
  OpenRequest,
  RequestMessage,
  ResponseMessage,
} from "@/worker/protocol";

/**
 * The main thread's only way to reach the engine.
 *
 * `Worker` is a genuine environment boundary, so it is the one thing stubbed
 * here. Everything on this side of it is the real module: the pending job map,
 * the message routing, the transfer list, the failure mapping.
 *
 * INV-2 (document bytes live only in the worker) and INV-7 (every cap comes from
 * the typed config module) are both decided in this file, so both are asserted
 * here rather than left to the browser tests.
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

  /** The worker itself failing to start: a blocked script, a missing chunk. */
  failToStart(): { defaultPrevented: boolean } {
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
    const open = this.requests.find((request) => request.kind === "open");
    if (!open) throw new Error("no open request was posted");
    return open;
  }
}

const CONFIG_KEYS = [
  "NEXT_PUBLIC_FREE_PAGE_CAP",
  "NEXT_PUBLIC_MAX_PAGES",
  "NEXT_PUBLIC_MAX_FILE_BYTES",
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

  it("starts one on first inspect when nothing warmed it", async () => {
    const { inspect } = await loadClient();

    void inspect(new ArrayBuffer(8)).catch(() => {});

    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("reuses the same worker across jobs", async () => {
    const { inspect } = await loadClient();

    void inspect(new ArrayBuffer(8)).catch(() => {});
    void inspect(new ArrayBuffer(8)).catch(() => {});

    expect(FakeWorker.instances).toHaveLength(1);
    expect(currentWorker().requests).toHaveLength(2);
  });
});

describe("handing a document over", () => {
  /**
   * INV-2. The transfer list is the line that keeps document content off the
   * main thread. A `postMessage` without it would structured clone the bytes and
   * leave a copy here, which is the guarantee quietly failing.
   *
   * The real detachment is proved in a real browser by `tests/e2e/engine.spec.ts`.
   */
  it("transfers the buffer rather than copying it", async () => {
    const { inspect } = await loadClient();
    const bytes = new ArrayBuffer(1024);

    void inspect(bytes).catch(() => {});

    expect(currentWorker().posted[0].transfer).toEqual([bytes]);
  });

  it("sends the bytes as the open request's payload", async () => {
    const { inspect } = await loadClient();
    const bytes = new ArrayBuffer(1024);

    void inspect(bytes).catch(() => {});

    const open = currentWorker().lastOpen;
    expect(open.kind).toBe("open");
    expect(open.bytes).toBe(bytes);
  });

  it("gives every job its own id", async () => {
    const { inspect } = await loadClient();

    void inspect(new ArrayBuffer(8)).catch(() => {});
    void inspect(new ArrayBuffer(8)).catch(() => {});

    const [first, second] = currentWorker().requests;
    expect(first.id).not.toBe(second.id);
  });

  /**
   * INV-7. The caps travel with the request and come from the typed config
   * module. Setting them to values nothing else would produce is what makes a
   * hardcoded literal in the client fail here.
   */
  it("takes both caps from the config module, never a literal", async () => {
    const { inspect } = await loadClient({
      NEXT_PUBLIC_MAX_PAGES: "137",
      NEXT_PUBLIC_MAX_FILE_BYTES: "4242",
    });

    void inspect(new ArrayBuffer(8)).catch(() => {});

    const open = currentWorker().lastOpen;
    expect(open.maxPages).toBe(137);
    expect(open.maxBytes).toBe(4242);
  });
});

describe("what comes back", () => {
  it("resolves with the summary the worker reported", async () => {
    const { inspect } = await loadClient();
    const job = inspect(new ArrayBuffer(8));
    const worker = currentWorker();

    worker.reply({ id: worker.lastOpen.id, kind: "result", summary: SUMMARY });

    await expect(job).resolves.toEqual(SUMMARY);
  });

  it("reports each phase without settling the job", async () => {
    const { inspect } = await loadClient();
    const phases: string[] = [];
    const job = inspect(new ArrayBuffer(8), {
      onProgress: (phase) => phases.push(phase),
    });
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    worker.reply({ id, kind: "progress", phase: "loading-engine" });
    worker.reply({ id, kind: "progress", phase: "opening" });
    worker.reply({ id, kind: "progress", phase: "inspecting" });

    expect(phases).toEqual(["loading-engine", "opening", "inspecting"]);

    worker.reply({ id, kind: "result", summary: SUMMARY });
    await expect(job).resolves.toEqual(SUMMARY);
  });

  it("survives a job that asked for no progress", async () => {
    const { inspect } = await loadClient();
    const job = inspect(new ArrayBuffer(8));
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    expect(() => worker.reply({ id, kind: "progress", phase: "opening" })).not.toThrow();

    worker.reply({ id, kind: "result", summary: SUMMARY });
    await expect(job).resolves.toEqual(SUMMARY);
  });

  it("rejects with the kind the worker reported", async () => {
    const { inspect } = await loadClient();
    const job = inspect(new ArrayBuffer(8));
    const worker = currentWorker();

    worker.reply({
      id: worker.lastOpen.id,
      kind: "error",
      errorKind: "password-required",
    });

    await expect(job).rejects.toMatchObject({
      name: "EngineError",
      errorKind: "password-required",
    });
  });

  /**
   * A kind outside the closed set means the contract has drifted. It is mapped
   * rather than passed through, so nothing unrecognised reaches the interface.
   */
  it("maps an unrecognised kind to unsupported", async () => {
    const { inspect } = await loadClient();
    const job = inspect(new ArrayBuffer(8));
    const worker = currentWorker();

    worker.reply({
      id: worker.lastOpen.id,
      kind: "error",
      errorKind: "something-new" as never,
    });

    await expect(job).rejects.toMatchObject({ errorKind: "unsupported" });
  });

  it("ignores a message for a job it does not know", async () => {
    const { inspect } = await loadClient();
    const job = inspect(new ArrayBuffer(8));
    const worker = currentWorker();

    expect(() =>
      worker.reply({ id: "a-stranger", kind: "result", summary: SUMMARY }),
    ).not.toThrow();

    worker.reply({ id: worker.lastOpen.id, kind: "result", summary: SUMMARY });
    await expect(job).resolves.toEqual(SUMMARY);
  });

  it("settles a job once, so a late result after a failure changes nothing", async () => {
    const { inspect } = await loadClient();
    const job = inspect(new ArrayBuffer(8));
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    worker.reply({ id, kind: "error", errorKind: "corrupt" });
    worker.reply({ id, kind: "result", summary: SUMMARY });

    await expect(job).rejects.toMatchObject({ errorKind: "corrupt" });
  });

  it("routes each job's answer to that job only", async () => {
    const { inspect } = await loadClient();
    const first = inspect(new ArrayBuffer(8));
    const second = inspect(new ArrayBuffer(8));
    const worker = currentWorker();
    const [openFirst, openSecond] = worker.requests;

    worker.reply({ id: openSecond.id, kind: "error", errorKind: "too-large" });
    worker.reply({ id: openFirst.id, kind: "result", summary: SUMMARY });

    await expect(first).resolves.toEqual(SUMMARY);
    await expect(second).rejects.toMatchObject({ errorKind: "too-large" });
  });
});

describe("when the worker itself will not start", () => {
  it("fails every job in flight with engine-unavailable", async () => {
    const { inspect } = await loadClient();
    const first = inspect(new ArrayBuffer(8));
    const second = inspect(new ArrayBuffer(8));

    currentWorker().failToStart();

    await expect(first).rejects.toMatchObject({ errorKind: "engine-unavailable" });
    await expect(second).rejects.toMatchObject({ errorKind: "engine-unavailable" });
  });

  /**
   * Left to bubble, this surfaces as an uncaught worker error carrying a stack.
   * Feature 11 must never see one.
   */
  it("prevents the browser's default error handling", async () => {
    const { inspect } = await loadClient();
    void inspect(new ArrayBuffer(8)).catch(() => {});

    expect(currentWorker().failToStart().defaultPrevented).toBe(true);
  });
});

describe("cancelling", () => {
  it("tells the worker to stop and drops the job", async () => {
    const { inspect } = await loadClient();
    const controller = new AbortController();
    const job = inspect(new ArrayBuffer(8), { signal: controller.signal });
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    controller.abort();

    expect(worker.requests.at(-1)).toEqual({ id, kind: "cancel" });
    await expect(job).rejects.toBeInstanceOf(Error);
  });

  /**
   * There is no "cancelled" kind in the closed set, so a deliberate cancel
   * arrives as `unsupported`. Recorded here as the current contract; feature 8
   * owns what the visitor is actually told.
   */
  it("reports the cancellation within the closed set of kinds", async () => {
    const { inspect } = await loadClient();
    const controller = new AbortController();
    const job = inspect(new ArrayBuffer(8), { signal: controller.signal });

    controller.abort();

    await expect(job).rejects.toMatchObject({ errorKind: "unsupported" });
  });

  it("ignores a result that arrives after the cancel", async () => {
    const { inspect } = await loadClient();
    const controller = new AbortController();
    const job = inspect(new ArrayBuffer(8), { signal: controller.signal });
    const worker = currentWorker();
    const { id } = worker.lastOpen;

    controller.abort();
    worker.reply({ id, kind: "result", summary: SUMMARY });

    await expect(job).rejects.toMatchObject({ errorKind: "unsupported" });
  });

  it("leaves other jobs alone", async () => {
    const { inspect } = await loadClient();
    const controller = new AbortController();
    const cancelled = inspect(new ArrayBuffer(8), { signal: controller.signal });
    const kept = inspect(new ArrayBuffer(8));
    const worker = currentWorker();
    const keptId = worker.requests[1].id;

    controller.abort();
    worker.reply({ id: keptId, kind: "result", summary: SUMMARY });

    await expect(cancelled).rejects.toBeInstanceOf(Error);
    await expect(kept).resolves.toEqual(SUMMARY);
  });
});

describe("releasing the engine", () => {
  it("terminates the worker", async () => {
    const { releaseEngine, warmEngine } = await loadClient();
    warmEngine();
    const worker = currentWorker();

    releaseEngine();

    expect(worker.terminated).toBe(true);
  });

  it("fails anything still in flight rather than leaving it hanging", async () => {
    const { inspect, releaseEngine } = await loadClient();
    const job = inspect(new ArrayBuffer(8));

    releaseEngine();

    await expect(job).rejects.toMatchObject({ errorKind: "engine-unavailable" });
  });

  it("starts a fresh worker for the next job", async () => {
    const { inspect, releaseEngine } = await loadClient();
    void inspect(new ArrayBuffer(8)).catch(() => {});

    releaseEngine();
    void inspect(new ArrayBuffer(8)).catch(() => {});

    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[1].terminated).toBe(false);
  });
});
