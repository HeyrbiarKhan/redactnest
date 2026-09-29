import { describe, expect, it, vi } from "vitest";

import {
  EngineFailure,
  hasPdfHeader,
  loadEngine,
  openDocument,
  PDF_HEADER_WINDOW,
  RunCancelled,
} from "@/engine";

import { bytesOf, fixture, markerAt, onePixelPng } from "../support/bytes";

/**
 * The walled engine module's policy, tested where MuPDF is not needed.
 *
 * The engine is served from `public/engine/`, which does not exist outside a
 * browser, so `loadEngine` genuinely fails here. That is what makes this file
 * useful: whatever happens before the engine loads can be proved to happen
 * before it, because the first thing the engine reports is `loading-engine`.
 * The real MuPDF runs in Node in `tests/unit/redaction.test.ts`, through the
 * seam the engine gives Vitest.
 */

const LIMITS = { maxBytes: 26_214_400, maxPages: 50 };

describe("the size cap", () => {
  /**
   * The guard runs before `loadEngine`, so an oversized file is refused without
   * fetching the engine at all. `onPhase` never firing is the proof: the first
   * phase the engine reports is `loading-engine`.
   */
  it("refuses an oversized file before the engine is ever fetched", async () => {
    const onPhase = vi.fn();

    await expect(
      openDocument(markerAt(0, 2048), { maxBytes: 1024, maxPages: 50 }, { onPhase }),
    ).rejects.toMatchObject({ errorKind: "too-large" });

    expect(onPhase).not.toHaveBeenCalled();
  });

  it("describes the refusal in the protocol's terms", async () => {
    await expect(
      openDocument(markerAt(0, 2048), { maxBytes: 1024, maxPages: 50 }),
    ).rejects.toBeInstanceOf(EngineFailure);
  });

  /**
   * The boundary is inclusive: a file of exactly the cap is allowed through and
   * fails later for its own reasons, rather than being rejected as too large.
   */
  it("lets a file of exactly the cap through to the engine", async () => {
    const onPhase = vi.fn();

    await expect(
      openDocument(markerAt(0, 1024), { maxBytes: 1024, maxPages: 50 }, { onPhase }),
    ).rejects.not.toMatchObject({ errorKind: "too-large" });

    expect(onPhase).toHaveBeenCalledWith("loading-engine");
  });

  it("allows a document to be opened with no phase reporter at all", async () => {
    await expect(
      openDocument(new ArrayBuffer(8), { maxBytes: 1024, maxPages: 50 }),
    ).rejects.toBeInstanceOf(EngineFailure);
  });
});

/** Spec 0004, AC-1 and INV-4. Judged from the bytes, before the engine loads. */
describe("a file that is not a PDF", () => {
  it.each([
    ["a PNG", onePixelPng()],
    ["a text file", bytesOf("Dear team, the numbers are attached.\n")],
    // A .docx is a zip archive, so it starts with the zip local file header.
    [
      "a Word document",
      bytesOf("PK\u0003\u0004\u0014\u0000\u0006\u0000word/document.xml"),
    ],
    ["an empty file", new ArrayBuffer(0)],
    ["a marker starting at byte 1020", fixture("header-at-1020.pdf")],
  ])("refuses %s as not-pdf without fetching the engine", async (_label, bytes) => {
    const onPhase = vi.fn();

    await expect(openDocument(bytes, LIMITS, { onPhase })).rejects.toMatchObject({
      name: "EngineFailure",
      errorKind: "not-pdf",
    });

    expect(onPhase).not.toHaveBeenCalled();
  });

  /**
   * The file name and the declared type never reach the engine at all, so
   * there is nothing for a PNG named `scan.pdf` to hide behind. What is left to
   * prove is that a real PDF with junk ahead of its marker still gets through.
   */
  it("lets a PDF whose marker starts at byte 1019 through to the engine", async () => {
    const onPhase = vi.fn();

    await expect(
      openDocument(fixture("header-at-1019.pdf"), LIMITS, { onPhase }),
    ).rejects.toMatchObject({ errorKind: "engine-unavailable" });

    expect(onPhase).toHaveBeenCalledWith("loading-engine");
  });

  /** Too large wins over not a PDF: the cheaper check runs first. */
  it("reports an oversized non PDF as too large", async () => {
    await expect(
      openDocument(bytesOf("x".repeat(64)), { maxBytes: 8, maxPages: 50 }),
    ).rejects.toMatchObject({ errorKind: "too-large" });
  });
});

describe("the header window", () => {
  it("is 1024 bytes", () => {
    expect(PDF_HEADER_WINDOW).toBe(1024);
  });

  it.each([
    ["at the very start", 0, true],
    ["starting at byte 1019, the last that fits", 1019, true],
    ["starting at byte 1020, one byte over", 1020, false],
    ["starting well past the window", 4000, false],
  ])("finds a marker %s: %s", (_label, offset, expected) => {
    expect(hasPdfHeader(markerAt(offset))).toBe(expected);
  });

  it("finds a marker in a file shorter than the window", () => {
    expect(hasPdfHeader(bytesOf("%PDF-1.7"))).toBe(true);
  });

  it.each([
    ["an empty buffer", new ArrayBuffer(0)],
    ["a truncated marker", bytesOf("%PDF")],
    ["a marker in lower case", bytesOf("%pdf-1.7")],
  ])("finds nothing in %s", (_label, bytes) => {
    expect(hasPdfHeader(bytes)).toBe(false);
  });

  /** Reading is all it does. The bytes a run starts from must come back intact. */
  it("leaves the bytes it reads untouched", () => {
    const bytes = markerAt(10);
    const before = new Uint8Array(bytes).slice();

    hasPdfHeader(bytes);

    expect(new Uint8Array(bytes)).toEqual(before);
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

/**
 * Spec 0004, AC-17. Stopping is not failing, and the two must never be
 * confused: a cancelled run posts nothing, a failed one posts a kind.
 */
describe("RunCancelled", () => {
  it("is not an engine failure", () => {
    expect(new RunCancelled()).not.toBeInstanceOf(EngineFailure);
    expect(new RunCancelled()).toBeInstanceOf(Error);
  });

  it("carries no kind, and says only that it was cancelled", () => {
    const cancelled = new RunCancelled();

    expect(Object.keys(cancelled)).toEqual(["name"]);
    expect(cancelled.message).toBe("cancelled");
  });
});
