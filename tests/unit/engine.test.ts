import { describe, expect, it, vi } from "vitest";

import { EngineFailure, loadEngine, openDocument } from "@/engine";

/**
 * The walled engine module, tested only where MuPDF is not needed.
 *
 * Opening a real PDF is proved in a real browser by `tests/e2e/engine.spec.ts`,
 * because a real browser is where the engine lives. What can be proved here is
 * the policy around it: the size cap is applied before a 10 MB payload is
 * fetched, and a load failure is both described in the protocol's terms and left
 * retryable.
 */

describe("the size cap", () => {
  /**
   * The guard runs before `loadEngine`, so an oversized file is refused without
   * fetching the engine at all. `onPhase` never firing is the proof: the first
   * phase the engine reports is `loading-engine`.
   */
  it("refuses an oversized file before the engine is ever fetched", async () => {
    const onPhase = vi.fn();

    await expect(
      openDocument(new ArrayBuffer(2048), { maxBytes: 1024, maxPages: 50 }, onPhase),
    ).rejects.toMatchObject({ errorKind: "too-large" });

    expect(onPhase).not.toHaveBeenCalled();
  });

  it("describes the refusal in the protocol's terms", async () => {
    await expect(
      openDocument(new ArrayBuffer(2048), { maxBytes: 1024, maxPages: 50 }),
    ).rejects.toBeInstanceOf(EngineFailure);
  });

  /**
   * The boundary is inclusive: a file of exactly the cap is allowed through and
   * fails later for its own reasons, rather than being rejected as too large.
   */
  it("lets a file of exactly the cap through to the engine", async () => {
    const onPhase = vi.fn();

    await expect(
      openDocument(new ArrayBuffer(1024), { maxBytes: 1024, maxPages: 50 }, onPhase),
    ).rejects.not.toMatchObject({ errorKind: "too-large" });

    expect(onPhase).toHaveBeenCalledWith("loading-engine");
  });

  it("allows a document to be opened with no phase reporter at all", async () => {
    await expect(
      openDocument(new ArrayBuffer(8), { maxBytes: 1024, maxPages: 50 }),
    ).rejects.toBeInstanceOf(EngineFailure);
  });
});

describe("loading the engine", () => {
  /**
   * The engine is served from `public/engine/`, which does not exist outside a
   * browser. So the load genuinely fails here, and that is the path under test:
   * a fetch that cannot complete has to arrive as a described failure rather
   * than as whatever the loader threw.
   */
  it("reports a load it cannot complete as engine-unavailable", async () => {
    await expect(loadEngine()).rejects.toMatchObject({
      name: "EngineFailure",
      errorKind: "engine-unavailable",
    });
  });

  /**
   * A cached rejection would leave the tool permanently broken after one flaky
   * network moment. Two distinct error instances prove a second attempt really
   * ran rather than the first promise being handed back.
   */
  it("does not cache the failure, so a later attempt tries again", async () => {
    const first = await loadEngine().catch((error: unknown) => error);
    const second = await loadEngine().catch((error: unknown) => error);

    expect(first).toBeInstanceOf(EngineFailure);
    expect(second).toBeInstanceOf(EngineFailure);
    expect(first).not.toBe(second);
  });
});

describe("EngineFailure", () => {
  it("is a real Error that names itself", () => {
    const failure = new EngineFailure("corrupt");

    expect(failure).toBeInstanceOf(Error);
    expect(failure.name).toBe("EngineFailure");
    expect(failure.errorKind).toBe("corrupt");
  });

  /**
   * Anything MuPDF said about the document stops at this class. If a message or
   * a stack is ever attached to help with debugging, this fails.
   */
  it("carries no property beyond its kind and its name", () => {
    expect(Object.keys(new EngineFailure("unsupported")).sort()).toEqual([
      "errorKind",
      "name",
    ]);
  });
});
