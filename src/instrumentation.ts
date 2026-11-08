/**
 * Server failures, reported to Sentry by kind and place. Spec 0016, AC-15.
 *
 * Next.js calls `onRequestError` when a server request fails: a page
 * rendering, a route handler or a server action. It reports `server-crash`
 * with the route's kind and what Next.js was doing, and reads nothing else:
 * not the error, its message or stack, and not the request, its path, query,
 * headers or cookies. So a failure carrying an email address in its message
 * reports exactly what any other failure on that route reports (claim C15).
 * The stack stays in Vercel's runtime logs, which Next.js writes.
 *
 * It never hears the proxy. In Next.js 16.3.5 the proxy's wrapper
 * (`next/dist/build/templates/middleware.js`) passes a throw to
 * `edgeInstrumentationOnRequestError`, which looks for this module in
 * `globalThis._ENTRIES` (`next/dist/server/web/globals.js`), and only the
 * edge runtime sets that. Our proxy runs on Node, so the lookup finds nothing
 * and the call goes nowhere. `src/proxy.ts` catches and reports its own
 * failures instead (AC-26).
 *
 * Every report goes through `reportCrash`, which sends one an hour for each
 * route and type from each server instance (AC-27). A failed page calls this
 * hook once, and two or three times only when `not-found.tsx` throws as well;
 * the collapse keeps that to one report, and above all keeps a route failing
 * on every request to one report an hour rather than one for each request.
 * There is no answer to wait for here, so it is awaited directly, as
 * Next.js's docs ask, rather than scheduled with `after()` (AC-8).
 */

import type { Instrumentation } from "next";

import { ROUTE_TYPES, type RouteKind, type ServerCrash } from "@/telemetry/events";
import { reportCrash } from "@/telemetry/server";

/**
 * Each route's kind, by its route path once normalised (`routeKindFor`).
 *
 * Next.js 16 reports a route path in two shapes. A page that fails to render
 * reports its plain path, route group and leaf file dropped: `/`, `/pricing`,
 * `/account/subscribe`, `/sign-in/[[...sign-in]]`, `/_not-found`, and a
 * server action the page it runs from. That is `ctx.pagePath` in
 * `next/dist/server/app-render/app-render.js`, and a throw in `/pricing` under
 * `pnpm build && pnpm start` reported `/pricing`. Its definition, group and
 * leaf included (`/pricing/page`, `/(account)/account/subscribe/page`), comes
 * from the page template (`next/dist/build/templates/app-page-runtime.js`)
 * when a stale background revalidation fails, or when a failure escapes the
 * render itself. A route handler reports `/api/entitlement`, or
 * `/api/entitlement/route` when a stale background revalidation fails
 * (`app-route.js`). Read from Next.js 16.3.5 on 2 November 2026.
 * `normaliseRoutePath` reads both shapes as one.
 *
 * The proxy's wrapper would report `/proxy` with `routeType` `proxy`
 * (`middleware.js`), but on Node that call never arrives here (above).
 * `routeKindFor` still maps any `proxy` type to `proxy`, so a later Next.js
 * that does reach this hook from the proxy lands on the kind the proxy's own
 * catch already sends. Its report and the catch's would then be two, since
 * the proxy is a separate bundle with its own memory for AC-27, until the
 * catch comes out (spec 0016, Follow-up).
 */
export const ROUTE_KINDS: Readonly<Record<string, RouteKind>> = Object.freeze({
  "/": "home",
  "/tool": "tool",
  "/pricing": "pricing",
  "/privacy": "privacy",
  "/terms": "terms",
  "/_not-found": "not-found",
  "/api/entitlement": "entitlement",
  "/api/telemetry": "telemetry",
  "/account": "account",
  "/account/subscribe": "subscribe",
  "/account/billing": "billing",
  "/account/welcome": "welcome",
  "/sign-in/[[...sign-in]]": "sign-in",
  "/sign-up/[[...sign-up]]": "sign-up",
});

/** A route path without its route groups (`(account)`) or its leaf file (`page`, `route`). */
export function normaliseRoutePath(routePath: string): string {
  const segments = routePath
    .split("/")
    .filter((segment) => segment !== "" && !/^\(.+\)$/.test(segment));
  const leaf = segments.at(-1);
  if (leaf === "page" || leaf === "route") segments.pop();
  return `/${segments.join("/")}`;
}

/** The kind of route a failure happened on, `proxy` for the proxy, and `other` for the rest. */
export function routeKindFor(routePath: string, routeType: string): RouteKind {
  if (routeType === "proxy") return "proxy";
  const path = normaliseRoutePath(routePath);
  // Own keys only, so a path such as `/constructor` is `other`.
  return (Object.hasOwn(ROUTE_KINDS, path) && ROUTE_KINDS[path]) || "other";
}

/** What a failure reports: its route's kind and what Next.js was doing, nothing more. */
export function crashReport(context: {
  readonly routePath: string;
  readonly routeType: string;
}): ServerCrash {
  const routeType = ROUTE_TYPES.find((type) => type === context.routeType);
  return Object.freeze({
    name: "server-crash",
    route: routeKindFor(context.routePath, context.routeType),
    // A type a later Next.js adds still reports, as `other` (AC-15). Filed as
    // `render` it would share a real render failure's collapse key, and could
    // hide that failure for the hour (AC-27).
    routeType: routeType ?? "other",
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  _error,
  _request,
  context,
) => {
  try {
    await reportCrash(crashReport(context));
  } catch {
    // `reportCrash` never rejects; this guards building the report. A
    // failure to report never becomes a second failure.
  }
};
