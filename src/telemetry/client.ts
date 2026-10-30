/**
 * How a page reports an event. Spec 0016, AC-4 to AC-6, INV-2, INV-3 and
 * INV-6.
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

import { isUsageEvent, type TelemetryEvent } from "./events";

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
 */
export function report(event: TelemetryEvent): void {
  if (!config.telemetryReporting) return;
  try {
    if (isUsageEvent(event) && optedOut(navigator)) return;
    fetch(TELEMETRY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
      credentials: "omit",
      cache: "no-store",
    }).catch(() => undefined);
  } catch {
    // No `navigator` or no `fetch` here. Telemetry never breaks its caller.
  }
}
