import type { NextConfig } from "next";

// Relative paths, never the `@/` alias, which this file cannot resolve. Both
// modules, and the error module they share, import only each other and read
// no environment variable (spec 0011, INV-8).
import { buildPolicies } from "./src/config/csp";
import { OUTSIDE_SERVICES } from "./src/config/privacy";

/**
 * The content security policy is the enforcement point for this product's
 * central claim, not a hardening extra. Spec 0001 fixes two regimes, split by
 * route, and `src/config/csp.ts` builds both, with the notes that matter if
 * you change either.
 *
 * The standard regime's outside origins come from `OUTSIDE_SERVICES` and from
 * nowhere else, the same list the privacy policy renders, so the policy cannot
 * admit a service the privacy policy does not name. The tool regime never
 * reads that list (spec 0011, AC-13 and AC-14).
 */

const isDev = process.env.NODE_ENV !== "production";

const { tool: TOOL_POLICY, standard: STANDARD_POLICY } = buildPolicies({
  services: OUTSIDE_SERVICES,
  dev: isDev,
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
      {
        // The engine's record of what shipped and where its source is (spec
        // 0009, AC-17 and AC-21). It has no extension, so it would otherwise go
        // out as `application/octet-stream` and download instead of being read.
        // A content type only, so the one policy header above stays the one.
        source: "/engine/VERSION",
        headers: [{ key: "Content-Type", value: "text/plain; charset=utf-8" }],
      },
    ];
  },
};

export default nextConfig;
