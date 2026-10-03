/**
 * The two content security policies, built from one rule. Spec 0001's two
 * regimes, and spec 0011, AC-13 and AC-14, INV-1 and INV-2.
 *
 * The content security policy is the enforcement point for this product's
 * central claim, not a hardening extra. Spec 0001 fixes two regimes, split by
 * route: the tool route's, and the standard one every other page gets.
 *
 * Notes that matter if you change anything here:
 *
 *  - `'unsafe-inline'` in `script-src` on the tool route is deliberate. The App
 *    Router injects inline hydration scripts, and the nonce alternative requires
 *    dynamic rendering, which is exactly what the prerendered static tool route
 *    rules out. The privacy guarantee rests on `connect-src` and the other fetch
 *    directives, which stay strict, not on `script-src`.
 *  - Never mix `'unsafe-inline'` with a nonce or a hash. A browser that sees a
 *    nonce ignores `'unsafe-inline'` entirely, which breaks hydration.
 *  - `'wasm-unsafe-eval'` is required, including where streaming instantiation
 *    would seem to avoid it.
 *  - `worker-src`, not `script-src`, governs worker creation under a strict
 *    policy. Omit it and the worker fails with a confusing error.
 *
 * What `connect-src 'self'` actually buys: it stops anything on the tool route
 * reaching a third party origin, which is the exfiltration path that matters. It
 * does not stop a same origin request. So the claim is "no third party ever
 * receives your document", enforced by the browser, plus "we operate no endpoint
 * that accepts one", enforced by us.
 *
 * Pure, so a test can hand it sample origins: the real list names none today,
 * so a test of the real list alone would pass whatever this did. `dev` is
 * passed in rather than read, because `next.config.ts` loads this file and it
 * reads no environment variable and imports only its neighbours (INV-8).
 */

import type { OutsideService } from "./privacy";

/**
 * `next dev` needs `eval` for React Fast Refresh and a websocket for hot
 * reloading. Production gets neither. The header assertion test runs against a
 * production build for this reason.
 */
const DEV_SCRIPT_SRC: readonly string[] = ["'unsafe-eval'"];
const DEV_CONNECT_SRC: readonly string[] = ["ws:", "wss:"];

/** Each origin once, in the order the services name them. */
const union = (origins: readonly string[]): readonly string[] => [...new Set(origins)];

function buildPolicy(options: {
  readonly dev: boolean;
  readonly scriptExtra: readonly string[];
  readonly connectExtra: readonly string[];
  readonly imageExtra: readonly string[];
}): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    ...(options.dev ? DEV_SCRIPT_SRC : []),
    ...options.scriptExtra,
  ];
  const connectSrc = [
    "'self'",
    ...(options.dev ? DEV_CONNECT_SRC : []),
    ...options.connectExtra,
  ];

  const imgSrc = ["'self'", "data:", "blob:", ...options.imageExtra];

  // Every other directive holds its fixed sources only. Whether a service may
  // name frames or styles is a later feature's decision (AC-13), and
  // `default-src 'none'` blocks whatever this does not name.
  return [
    "default-src 'none'",
    `script-src ${scriptSrc.join(" ")}`,
    "worker-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSrc.join(" ")}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

export function buildPolicies({
  services,
  dev,
}: {
  readonly services: readonly OutsideService[];
  readonly dev: boolean;
}): { readonly tool: string; readonly standard: string } {
  return {
    // The page that holds a document. Nothing third party may load here, so
    // this never reads `services`, whatever later features add to it (INV-2).
    tool: buildPolicy({ dev, scriptExtra: [], connectExtra: [], imageExtra: [] }),
    // Every other route. Same shape, plus exactly the origins the services
    // list names, and nothing it does not (INV-1).
    standard: buildPolicy({
      dev,
      scriptExtra: union(services.flatMap((service) => service.scriptOrigins)),
      connectExtra: union(services.flatMap((service) => service.connectOrigins)),
      // Spec 0012, AC-21: images too, and on the standard policy only.
      imageExtra: union(services.flatMap((service) => service.imageOrigins)),
    }),
  };
}
