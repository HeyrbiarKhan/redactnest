import { describe, expectTypeOf, it } from "vitest";

import type {
  DetectionCounts,
  DetectorKind,
  DocumentSummary,
  EngineErrorKind,
  LoggablePayload,
  PageReading,
  ProgressPhase,
  RedactionOutcome,
  ReviewMatch,
} from "@/worker/protocol";

/**
 * INV-4, enforced by the compiler rather than by prose.
 *
 * Spec 0002: every log, analytics and error payload is typed with enumerated
 * kinds and numbers only, so there is nowhere for a file name or a snippet of a
 * document to be put by accident. Feature 11 inherits that as a hard constraint,
 * and a constraint nobody can fail is not a constraint, so this is a gate rather
 * than a comment.
 *
 * It runs at `pnpm typecheck`, not at `pnpm test`. The assertions below are
 * erased at runtime; what fails is the compile, which is the point. Widening a
 * loggable type with a free `string` field breaks the build.
 *
 * The distinction this rests on: a string literal union is an enumerated kind
 * and is fine, because the only values it can hold are ones we chose. A bare
 * `string` is a hole, because anything at all fits through it.
 */

/** True only for `string` itself, never for a union of literals. */
type IsBareString<T> = string extends T ? ([T] extends [string] ? true : false) : false;

/**
 * Does this type hold a free `string` anywhere inside it?
 *
 * Distributes over unions first, so each member of `LoggablePayload` is examined
 * on its own rather than collapsed into one comparison that a bare `string`
 * member could hide in.
 */
type FreeStringIn<T> = T extends unknown ? Probe<T> : never;

type Probe<T> =
  IsBareString<T> extends true
    ? true
    : T extends readonly (infer Element)[]
      ? FreeStringIn<Element>
      : T extends object
        ? FreeStringIn<T[keyof T]>
        : false;

type Verdict<T> =
  true extends FreeStringIn<T> ? "carries a free string" : "kinds and numbers only";

describe("what may reach a log", () => {
  /**
   * The gate itself. If this stops compiling, something loggable grew a field
   * that a file name or an extracted snippet would fit into.
   */
  it("carries enumerated kinds and numbers, and no free strings", () => {
    expectTypeOf<Verdict<LoggablePayload>>().toEqualTypeOf<"kinds and numbers only">();
  });

  /**
   * The same verdict for each member on its own, so a union that passed only
   * because one member swallowed the others still fails here. Written out
   * rather than parameterised: the assertions are type level, so a runtime
   * label could not select between them and would only imply an isolation the
   * cases were not getting.
   */
  it("holds for the summary, the outcome, the detection counts, a failure, a phase and a detector", () => {
    expectTypeOf<Verdict<DocumentSummary>>().toEqualTypeOf<"kinds and numbers only">();
    expectTypeOf<Verdict<RedactionOutcome>>().toEqualTypeOf<"kinds and numbers only">();
    // Spec 0005, AC-15: what detection found, by kind and by blocked reason.
    expectTypeOf<Verdict<DetectionCounts>>().toEqualTypeOf<"kinds and numbers only">();
    expectTypeOf<Verdict<EngineErrorKind>>().toEqualTypeOf<"kinds and numbers only">();
    expectTypeOf<Verdict<ProgressPhase>>().toEqualTypeOf<"kinds and numbers only">();
    expectTypeOf<Verdict<DetectorKind>>().toEqualTypeOf<"kinds and numbers only">();
    // Spec 0006, AC-28: the page readings and the pages per finding.
    expectTypeOf<Verdict<PageReading>>().toEqualTypeOf<"kinds and numbers only">();
    expectTypeOf<
      Verdict<RedactionOutcome["pagesByFinding"]>
    >().toEqualTypeOf<"kinds and numbers only">();
  });

  /**
   * The canary. Without it, a `Verdict` that had quietly stopped working would
   * make every assertion above pass for entirely the wrong reason, which is the
   * one way a gate like this is worse than no gate at all.
   */
  it("would catch a free string, a nested one, and one inside an array", () => {
    expectTypeOf<
      Verdict<{ fileName: string }>
    >().toEqualTypeOf<"carries a free string">();
    expectTypeOf<
      Verdict<{ counts: { total: number; label: string } }>
    >().toEqualTypeOf<"carries a free string">();
    expectTypeOf<
      Verdict<{ items: readonly { text: string }[] }>
    >().toEqualTypeOf<"carries a free string">();
    expectTypeOf<Verdict<string>>().toEqualTypeOf<"carries a free string">();
    expectTypeOf<
      Verdict<DocumentSummary | { snippet: string }>
    >().toEqualTypeOf<"carries a free string">();
  });

  /**
   * And the review row, which is exactly the type that must never be loggable.
   * It carries the match text and its surrounding context, which is the one
   * thing spec 0002 lets cross the worker boundary and still forbids storing,
   * sending or logging.
   */
  it("would catch a review match, which is why it is not in the union", () => {
    expectTypeOf<Verdict<ReviewMatch>>().toEqualTypeOf<"carries a free string">();
    expectTypeOf<LoggablePayload>().not.toEqualTypeOf<ReviewMatch>();
  });
});
