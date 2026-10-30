/**
 * The tool's events, from the session's own transitions. Spec 0016, AC-11 to
 * AC-13 and AC-18.
 *
 * Pure: the previous session and the next in, the events that change means
 * out. `tool-client.tsx` calls it from an effect after each render, so an
 * event fires exactly when the visitor's screen changes, and the reducer
 * stays plain data with no idea it is counted (spec 0002).
 *
 * Each value comes from what the session already holds and the visitor was
 * already shown: the summary, the detection and result counts the checklist
 * and the result card read, and the job's frozen entitlement. Only ranges and
 * kinds come out, never the matches, the ticks or the file.
 */

import { detectionCounts, resultCounts } from "@/lib/detectors";
import type { LiveSession, ToolSession } from "@/lib/session";
import {
  BLOCKED_REASONS,
  countPagesByFinding,
  DETECTOR_KINDS,
  type EngineErrorKind,
  PAGE_FINDINGS,
  SANITIZED_KINDS,
} from "@/worker/protocol";

import { bucket, bucketsByKind, type TelemetryEvent } from "./events";

const NONE: readonly TelemetryEvent[] = Object.freeze([]);

/** An open that succeeded (AC-11). */
function opened(session: LiveSession): readonly TelemetryEvent[] {
  if (session.summary === null) return NONE;
  const { foundByType, blockedByReason } = detectionCounts(session.matches);
  return [
    Object.freeze({
      name: "document-opened",
      pages: bucket(session.summary.pageCount),
      found: bucketsByKind(DETECTOR_KINDS, foundByType),
      blocked: bucketsByKind(BLOCKED_REASONS, blockedByReason),
      pagesWith: bucketsByKind(PAGE_FINDINGS, countPagesByFinding(session.summary.pages)),
      tier: session.entitlement.tier,
      account: session.entitlement.account,
    }),
  ];
}

/** A run that completed (AC-12), from the same counts the result card shows. */
function completed(session: LiveSession): readonly TelemetryEvent[] {
  if (session.outcome === null) return NONE;
  const counts = resultCounts(session.matches, session.ticked, session.outcome);
  return [
    Object.freeze({
      name: "redaction-completed",
      removed: bucketsByKind(DETECTOR_KINDS, counts.removedByType),
      unticked: bucketsByKind(DETECTOR_KINDS, counts.untickedByType),
      blockedByKind: bucketsByKind(DETECTOR_KINDS, counts.blockedByType),
      blockedByReason: bucketsByKind(BLOCKED_REASONS, counts.blockedByReason),
      // From the list, so no kind appears twice whatever the outcome held.
      stripped: Object.freeze(
        SANITIZED_KINDS.filter((kind) => counts.sanitized.includes(kind)),
      ),
      tier: session.entitlement.tier,
      account: session.entitlement.account,
    }),
  ];
}

/**
 * A refusal (AC-13). A free visitor meeting the page or size cap is one
 * `cap-reached` instead, so one refusal is one event; a paid visitor over the
 * paid ceiling is a refusal like any other. An engine that would not load is
 * also a failure report, beside the count (AC-18).
 */
function refused(
  kind: EngineErrorKind,
  step: "open" | "redact",
  session: LiveSession,
): readonly TelemetryEvent[] {
  const { tier, account } = session.entitlement;
  if (tier === "free" && (kind === "too-many-pages" || kind === "too-large")) {
    return [
      Object.freeze({
        name: "cap-reached",
        cap: kind === "too-many-pages" ? "pages" : "size",
        account,
      }),
    ];
  }
  const refusal: TelemetryEvent = Object.freeze({
    name: "run-refused",
    kind,
    step,
    tier,
    account,
  });
  return kind === "engine-unavailable"
    ? [refusal, Object.freeze({ name: "engine-unavailable" })]
    : [refusal];
}

/**
 * What a session transition means, as events. Nothing for a change that is
 * not one of the four: a cancel goes from `redacting` to `reviewing` with no
 * refusal, so it sends nothing, and the silent retry while the engine was
 * still loading lands `worker-lost` and `retry` in one render, so the session
 * goes from `opening` to `opening` and never shows `lost` (AC-13).
 */
export function toolEvents(
  previous: ToolSession,
  next: ToolSession,
): readonly TelemetryEvent[] {
  if (previous === next || previous.state === "idle" || next.state === "idle")
    return NONE;

  if (next.state === "lost") {
    if (previous.state === "lost") return NONE;
    return refused(
      "engine-unavailable",
      previous.state === "redacting" ? "redact" : "open",
      next,
    );
  }

  if (previous.state === "opening") {
    if (next.state === "reviewing") return opened(next);
    if (next.state === "failed" && next.failure !== null) {
      return refused(next.failure, "open", next);
    }
    return NONE;
  }

  if (previous.state === "redacting") {
    if (next.state === "complete") return completed(next);
    if (next.state === "reviewing" && next.runFailure !== null) {
      return refused(next.runFailure, "redact", next);
    }
  }

  return NONE;
}
