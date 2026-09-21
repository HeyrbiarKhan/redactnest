import { describe, expect, it } from "vitest";

import {
  asMatchId,
  DETECTOR_KINDS,
  ENGINE_ERROR_KINDS,
  EngineError,
  isEngineErrorKind,
  OperationCancelled,
  SANITIZED_KINDS,
  type EngineErrorKind,
} from "@/worker/protocol";

/**
 * The worker boundary contract, fixed by spec 0001.
 *
 * Two rules here carry the product's privacy claim, so they are asserted rather
 * than trusted: the failure set is closed, and an error payload carries a kind
 * and nothing derived from the document. Feature 11 has to be able to send these
 * to an error reporter without scrubbing them first.
 */

describe("the closed set of failures", () => {
  /**
   * Written out rather than derived from the export on purpose. Widening the set
   * is a contract change, and this is the line that makes it deliberate.
   */
  it("is exactly the eight kinds the specs fix", () => {
    expect([...ENGINE_ERROR_KINDS]).toEqual([
      "engine-unavailable",
      "encrypted",
      "password-required",
      "corrupt",
      "unsupported",
      "too-large",
      "too-many-pages",
      // Added by spec 0002. Raised on the main thread when a retained `File`
      // can no longer be read, and kept in this set so feature 8 writes copy
      // for one list rather than two.
      "file-unreadable",
    ]);
  });

  it.each(ENGINE_ERROR_KINDS)("recognises %s", (kind) => {
    expect(isEngineErrorKind(kind)).toBe(true);
  });

  it.each([
    ["an unknown kind", "exploded"],
    ["a near miss", "too_large"],
    ["a different case", "CORRUPT"],
    ["padding", " corrupt "],
    ["an empty string", ""],
  ])("rejects %s", (_label, value) => {
    expect(isEngineErrorKind(value)).toBe(false);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 3],
    ["an object", { errorKind: "corrupt" }],
    ["an array", ["corrupt"]],
  ])("rejects %s without throwing", (_label, value) => {
    expect(isEngineErrorKind(value)).toBe(false);
  });
});

describe("EngineError", () => {
  it("is a real Error that names itself", () => {
    const error = new EngineError("corrupt");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("EngineError");
  });

  it.each(ENGINE_ERROR_KINDS)("carries the %s kind", (kind) => {
    expect(new EngineError(kind).errorKind).toBe(kind);
  });

  /**
   * The guarantee, stated as an assertion. If someone later attaches the engine's
   * own message, a stack, or a file name to help with debugging, this fails, and
   * that is the point: the whole payload is a kind.
   */
  it("carries no property beyond its kind and its name", () => {
    const error = new EngineError("too-many-pages");

    expect(Object.keys(error).sort()).toEqual(["errorKind", "name"]);
  });

  it("uses the kind itself as its message, so nothing else can ride along", () => {
    const kind: EngineErrorKind = "password-required";

    expect(new EngineError(kind).message).toBe(kind);
  });
});

/**
 * Cancelling is a choice, not a failure, and the two must never be confused
 * (INV-8). `EngineError` has a contract test above; this is the same gate for
 * the class that deliberately is not one of them.
 *
 * If `OperationCancelled` ever became an `EngineErrorKind`, or grew a reason
 * field, somebody who asked to stop would be shown an error about the document
 * they just walked away from, and that error could carry something document
 * derived with it.
 */
describe("OperationCancelled", () => {
  it("is a real Error that names itself", () => {
    const cancelled = new OperationCancelled();

    expect(cancelled).toBeInstanceOf(Error);
    expect(cancelled.name).toBe("OperationCancelled");
  });

  /** covers: AC-10. A cancel leaves the session open; it does not fail it. */
  it("is not an engine failure, so nobody is shown an error for it", () => {
    const cancelled = new OperationCancelled();

    expect(cancelled).not.toBeInstanceOf(EngineError);
    expect(isEngineErrorKind(cancelled.message)).toBe(false);
    expect(isEngineErrorKind(cancelled.name)).toBe(false);
  });

  it("carries no property beyond its name", () => {
    expect(Object.keys(new OperationCancelled())).toEqual(["name"]);
  });

  /**
   * A fixed word, not a description of what was cancelled. Nothing about the
   * document can ride along in it.
   */
  it("says only that it was cancelled", () => {
    expect(new OperationCancelled().message).toBe("cancelled");
  });
});

/**
 * The other two closed sets, gated the same way `ENGINE_ERROR_KINDS` is above.
 *
 * Both are written out rather than derived from the export, so changing either
 * is a deliberate contract change rather than a quiet edit. Feature 6 owns
 * growing the detector set to seven; feature 5 owns reporting the sanitized
 * list. A union only ever grows, so adding a member breaks nothing that already
 * reads one, but losing one silently would let a document be reported clean
 * when something was never stripped from it.
 */
describe("the kinds a detector can find", () => {
  it("is exactly the two release 1 builds", () => {
    expect([...DETECTOR_KINDS]).toEqual(["email", "phone"]);
  });

  it("names each kind once", () => {
    expect(new Set(DETECTOR_KINDS).size).toBe(DETECTOR_KINDS.length);
  });
});

describe("the things a redaction strips besides the targeted text", () => {
  /**
   * Feature 5's contract from the scope, in the order the scope states it. An
   * entry disappearing from here is a promise quietly dropped.
   */
  it("is exactly the nine things the scope promises", () => {
    expect([...SANITIZED_KINDS]).toEqual([
      "document-info",
      "xmp-metadata",
      "annotations",
      "form-fields",
      "attachments",
      "bookmarks",
      "hidden-layers",
      "javascript",
      "incremental-versions",
    ]);
  });

  it("names each kind once", () => {
    expect(new Set(SANITIZED_KINDS).size).toBe(SANITIZED_KINDS.length);
  });

  /**
   * The lists are separate sets on purpose. A failure kind is not something a
   * redaction strips, and vice versa.
   */
  it("shares nothing with the failure set", () => {
    const failures = new Set<string>(ENGINE_ERROR_KINDS);

    expect(SANITIZED_KINDS.filter((kind) => failures.has(kind))).toEqual([]);
  });
});

/**
 * A match's name, minted in the worker and meaningless anywhere else. The main
 * thread echoes these back untouched, so the one thing that matters is that
 * nothing is added to or taken from the value on the way through.
 */
describe("minting a match id", () => {
  it("hands back exactly the string it was given", () => {
    expect(asMatchId("m1")).toBe("m1");
  });

  it.each([
    ["an empty string", ""],
    ["a uuid", "0b7f4a1e-2c3d-4e5f-8a9b-0c1d2e3f4a5b"],
    ["one with punctuation", "page:2/match:11"],
  ])("leaves %s untouched", (_label, value) => {
    expect(asMatchId(value)).toBe(value);
  });
});
