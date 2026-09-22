import type { NextConfig } from "next";

/**
 * The content security policy is the enforcement point for this product's
 * central claim, not a hardening extra. Spec 0001 fixes two regimes, split by
 * route.
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
 */

const isDev = process.env.NODE_ENV !== "production";

/**
 * Origins features 10 (auth) and 11 (analytics) will need.
 *
 * They belong on the standard regime only. Adding one to the tool route would
 * quietly weaken the guarantee, which is why this list is applied in exactly one
 * place below.
 */
const THIRD_PARTY_SCRIPT_ORIGINS: string[] = [];
const THIRD_PARTY_CONNECT_ORIGINS: string[] = [];

/**
 * `next dev` needs `eval` for React Fast Refresh and a websocket for hot
 * reloading. Production gets neither. The header assertion test runs against a
 * production build for this reason.
 */
const DEV_SCRIPT_SRC = isDev ? ["'unsafe-eval'"] : [];
const DEV_CONNECT_SRC = isDev ? ["ws:", "wss:"] : [];

function buildPolicy(options: {
  scriptExtra?: string[];
  connectExtra?: string[];
}): string {
  const scriptSrc = [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    ...DEV_SCRIPT_SRC,
    ...(options.scriptExtra ?? []),
  ];
  const connectSrc = ["'self'", ...DEV_CONNECT_SRC, ...(options.connectExtra ?? [])];

  return [
    "default-src 'none'",
    `script-src ${scriptSrc.join(" ")}`,
    "worker-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
  ].join("; ");
}

/** The page that holds a document. Nothing third party may load here. */
const TOOL_POLICY = buildPolicy({});

/** Every other route. Same shape, plus the origins later features need. */
const STANDARD_POLICY = buildPolicy({
  scriptExtra: THIRD_PARTY_SCRIPT_ORIGINS,
  connectExtra: THIRD_PARTY_CONNECT_ORIGINS,
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // `TOOL_PATH` in `src/lib/routes.ts`. Kept literal here because the
        // `source` below is a regular expression built around it.
        source: "/tool",
        headers: [{ key: "Content-Security-Policy", value: TOOL_POLICY }],
      },
      {
        // Everything except the tool route. The negative lookahead keeps exactly
        // one rule matching any given path: two matching rules would send two
        // Content-Security-Policy headers, and a browser enforces all of them at
        // once, which makes the effective policy very hard to reason about.
        source: "/((?!tool$).*)",
        headers: [{ key: "Content-Security-Policy", value: STANDARD_POLICY }],
      },
    ];
  },
};

export default nextConfig;
