/**
 * `POST /api/telemetry`: where pages report what happened. Spec 0016, AC-7
 * and AC-8, INV-2 and INV-3.
 *
 * It trusts nothing it receives. An event is forwarded only when it comes
 * from one of our own pages, parses against the catalog's closed lists, and is
 * one a page may send at all (`isBrowserEvent`), so a forged body can skew a
 * count but can never carry text anywhere, nor raise a server only alert. What
 * goes on is the parser's rebuilt copy, never the body that arrived.
 *
 * Every answer but one is the same empty `204`, whatever happened, so the
 * answer says nothing about what was accepted. The exception is a body that
 * declares itself too large, refused with `413` before it is read. Cookies are
 * never read and none is set; pages send with `credentials: "omit"` anyway.
 * Any other method is Next.js's own `405`.
 */

import { config } from "@/config";
import { isBrowserEvent, MAX_EVENT_BYTES, parseTelemetryEvent } from "@/telemetry/events";
import { reportServer } from "@/telemetry/server";

const NO_STORE = Object.freeze({ "Cache-Control": "no-store" });

/** Our own origin, which a browser that does not send `Sec-Fetch-Site` must name. */
const SITE_ORIGIN = new URL(config.siteUrl).origin;

const done = (): Response => new Response(null, { status: 204, headers: NO_STORE });

/**
 * From one of our own pages (AC-7, a): the browser's own `Sec-Fetch-Site`
 * when it sends one, which a page cannot set, else an `Origin` naming us.
 * Another site's page using its visitors' browsers fails either way.
 */
function fromOurPages(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site");
  if (site !== null) return site === "same-origin";
  return headers.get("origin") === SITE_ORIGIN;
}

/**
 * The body as text, or `null` the moment it runs past the limit, without
 * reading the rest. A body with no `Content-Length` is held to the same limit
 * as one that declares it.
 */
async function readCapped(request: Request, limit: number): Promise<string | null> {
  if (request.body === null) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request): Promise<Response> {
  const declared = Number(request.headers.get("content-length"));
  if (declared > MAX_EVENT_BYTES) {
    return new Response(null, { status: 413, headers: NO_STORE });
  }
  if (!fromOurPages(request.headers)) return done();

  let text: string | null;
  try {
    text = await readCapped(request, MAX_EVENT_BYTES);
  } catch {
    return done();
  }
  if (text === null) return done();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return done();
  }

  const event = parseTelemetryEvent(body);
  if (event === null || !isBrowserEvent(event)) return done();

  // Drops the event when this build forwards nothing, or when the request
  // carries Global Privacy Control or Do Not Track and it is a count (AC-6).
  reportServer(event, request.headers);
  return done();
}
