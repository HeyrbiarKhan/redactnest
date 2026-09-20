import { describe, expect, it } from "vitest";

import {
  ENGINE_ERROR_KINDS,
  EngineError,
  isEngineErrorKind,
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
  it("is exactly the seven kinds the spec fixes", () => {
    expect([...ENGINE_ERROR_KINDS]).toEqual([
      "engine-unavailable",
      "encrypted",
      "password-required",
      "corrupt",
      "unsupported",
      "too-large",
      "too-many-pages",
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
