/**
 * Server failures, reported to Sentry by kind and place. Spec 0016, AC-15.
 *
 * Next.js calls `onRequestError` when a server request fails: a page
 * rendering, a route handler, a server action or the proxy. It reports
 * `server-crash` with the route's kind and what Next.js was doing, and reads
 * nothing else: not the error, its message or stack, and not the request, its
 * path, query, headers or cookies. So a failure carrying an email address in
 * its message reports exactly what any other failure on that route reports
 * (claim C15). The stack stays in Vercel's runtime logs, which Next.js writes.
 *
 * There is no answer to wait for here, so the send is awaited directly, as
 * Next.js's docs ask, rather than scheduled with `after()` (AC-8).
 */

import type { Instrumentation } from "next";

import { ROUTE_TYPES, type RouteKind, type ServerCrash } from "@/telemetry/events";
import { forward } from "@/telemetry/server";

/**
 * Each route's kind, by its route path once normalised (`routeKindFor`).
 *
 * Next.js 16 reports a route path in two shapes, read from its own templates
 * (`next/dist/build/templates/app-page-runtime.js`, `app-route.js` and
 * `middleware.js`) and this build's `.next/server/app-paths-manifest.json` on
 * 30 October 2026. A page reports its definition, route group and leaf file
 * included: `/page`, `/tool/page`, `/(account)/account/subscribe/page`,
 * `/(account)/sign-in/[[...sign-in]]/page`, `/_not-found/page`, and a server
 * action the page it runs from. A route handler reports `/api/entitlement`,
 * or `/api/entitlement/route` when a stale background revalidation fails. The
 * proxy reports `/proxy` with `routeType` `proxy`.
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
    // A type a later Next.js adds still reports, as the one every page has.
    routeType: routeType ?? "render",
  });
}

export const onRequestError: Instrumentation.onRequestError = async (
  _error,
  _request,
  context,
) => {
  try {
    await forward(crashReport(context));
  } catch {
    // `forward` never rejects; this guards the report itself. A failure to
    // report never becomes a second failure.
  }
};
