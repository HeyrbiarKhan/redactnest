import { describe, expectTypeOf, it } from "vitest";

import type { TelemetryEvent } from "@/telemetry/events";
import type {
  DetectionCounts,
  DetectorKind,
  DocumentSummary,
  EngineErrorKind,
  LoggablePayload,
  PageReading,
  ProgressPhase,
  RedactionOutcome,
  ResultCounts,
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

/**
 * Does this type hold a raw number anywhere inside it? Spec 0016, AC-1: a
 * telemetry event carries ranges (`Bucket`), never a count, so it is held to
 * this as well as to the free string gate. Same walk as `FreeStringIn`.
 */
type NumberIn<T> = T extends unknown ? NumberProbe<T> : never;

type NumberProbe<T> = [T] extends [number]
  ? true
  : T extends readonly (infer Element)[]
    ? NumberIn<Element>
    : T extends object
      ? NumberIn<T[keyof T]>
      : false;

type RangeVerdict<T> = true extends NumberIn<T> ? "carries a number" : "no numbers";

describe("what may reach a log", () => {
  /**
   * The gate itself. If this stops compiling, something loggable grew a field
   * that a file name or an extracted snippet would fit into. Spec 0016, AC-1
   * puts every telemetry event under it too, beside spec 0002's payloads.
   */
  it("carries enumerated kinds and numbers, and no free strings", () => {
    expectTypeOf<
      Verdict<LoggablePayload | TelemetryEvent>
    >().toEqualTypeOf<"kinds and numbers only">();
  });

  /**
   * Spec 0016, AC-1. A telemetry event carries ranges, never the count itself,
   * so an exact page count or a number of matches cannot leave a page.
   */
  it("holds every telemetry event to kinds and ranges, with no raw number", () => {
    expectTypeOf<Verdict<TelemetryEvent>>().toEqualTypeOf<"kinds and numbers only">();
    expectTypeOf<RangeVerdict<TelemetryEvent>>().toEqualTypeOf<"no numbers">();
  });

  /** The number probe's canary, for the same reason as the one below. */
  it("would catch a raw number, a nested one, and one inside an array", () => {
    expectTypeOf<RangeVerdict<{ pages: number }>>().toEqualTypeOf<"carries a number">();
    expectTypeOf<
      RangeVerdict<{ found: Partial<Record<"email", number>> }>
    >().toEqualTypeOf<"carries a number">();
    expectTypeOf<
      RangeVerdict<{ items: readonly { count: number }[] }>
    >().toEqualTypeOf<"carries a number">();
    expectTypeOf<
      RangeVerdict<TelemetryEvent | { removedTotal: number }>
    >().toEqualTypeOf<"carries a number">();
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
    // Spec 0007, AC-25: what a finished run removed and left in the file.
    expectTypeOf<Verdict<ResultCounts>>().toEqualTypeOf<"kinds and numbers only">();
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
