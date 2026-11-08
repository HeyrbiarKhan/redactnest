/**
 * How a page reports an event. Spec 0016, AC-4 to AC-6 and AC-28, INV-2,
 * INV-3, INV-6 and INV-10.
 *
 * One `POST` to our own `/api/telemetry`, which passes it on. Nothing from
 * anyone else loads on any page, and `/tool`'s `connect-src 'self'` already
 * allows the request (INV-4).
 *
 * Fire and forget: `report` returns nothing, is never awaited, swallows every
 * failure, never retries and keeps no queue, so nothing the visitor does
 * waits on it or changes when it fails (INV-3). It sends no cookie
 * (`credentials: "omit"`), and the event carries no id, so no two events can
 * be tied together or to anyone (INV-2).
 */

import { config } from "@/config";
import { TELEMETRY_PATH } from "@/lib/routes";

import { isUsageEvent, reportKey, type TelemetryEvent } from "./events";

/**
 * The error reports this page load has sent, by `reportKey` (AC-28). A
 * deliberate cache, the module level state `AGENTS.md` allows, and never
 * browser storage: a full page load starts it empty, and a client side
 * navigation keeps it. It holds at most the 24 shapes a page can send
 * (`browser-crash` on 11 page kinds from 2 sources, `engine-unavailable` and
 * `still-waiting`), so it never needs pruning.
 */
const SENT = new Set<string>();

/**
 * The two ways a browser asks not to be tracked. Read through this shape
 * because Global Privacy Control is newer than the DOM types.
 */
export interface PrivacySignals {
  readonly globalPrivacyControl?: unknown;
  readonly doNotTrack?: unknown;
}

/** Whether this browser asked not to be counted: GPC on, or Do Not Track `1` (AC-6). */
export const optedOut = (signals: PrivacySignals): boolean =>
  signals.globalPrivacyControl === true || signals.doNotTrack === "1";

/**
 * Send one event, or nothing (AC-4). Nothing at all unless this build reports
 * (AC-5), and no count when the browser opted out, though a failure report
 * still goes, because it says nothing about the visitor (AC-6, INV-6).
 *
 * A count is never held back: each one counts. A failure report goes at most
 * once per page load (AC-28), whatever code sends it, so a page that throws
 * in a loop sends one report rather than spending Sentry's quota and the
 * visitor's share of the route's rate limit. Its key is remembered only once
 * the request is made, so a report this build or a missing `fetch` stopped
 * leaves nothing behind. `sent` is a seam for tests; callers never pass it.
 */
export function report(event: TelemetryEvent, sent: Set<string> = SENT): void {
  if (!config.telemetryReporting) return;
  try {
    const key = isUsageEvent(event) ? null : reportKey(event);
    if (key === null ? optedOut(navigator) : sent.has(key)) return;
    fetch(TELEMETRY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
      credentials: "omit",
      cache: "no-store",
    }).catch(() => undefined);
    if (key !== null) sent.add(key);
  } catch {
    // No `navigator` or no `fetch` here. Telemetry never breaks its caller.
  }
}
