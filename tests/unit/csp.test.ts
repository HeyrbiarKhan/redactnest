import { describe, expect, it } from "vitest";

import { buildPolicies } from "@/config/csp";
import { OUTSIDE_SERVICES, type OutsideService } from "@/config/privacy";

/**
 * The two content security policies. Spec 0001's regimes, and spec 0011,
 * AC-13 and AC-14, INV-1 and INV-2.
 *
 * The real services list names no origin today, so a test of the real list
 * alone would pass whatever the builder did with one. These hand it sample
 * origins instead, and check they reach exactly the two standard directives
 * meant for them, and never anything on the tool route.
 * `tests/e2e/headers.spec.ts` proves the built headers carry the same policies.
 */

/** Every directive, exactly as spec 0001 fixes it for production. */
const FIXED = {
  "default-src": "'none'",
  "script-src": "'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "worker-src": "'self'",
  "connect-src": "'self'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob:",
  "font-src": "'self'",
  "object-src": "'none'",
  "base-uri": "'none'",
  "frame-ancestors": "'none'",
  "form-action": "'self'",
} as const;

const TODAY = Object.entries(FIXED)
  .map(([name, sources]) => `${name} ${sources}`)
  .join("; ");

/** A policy as directive name to sources, in its order. */
function directives(policy: string): Record<string, string> {
  return Object.fromEntries(
    policy.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources.join(" ")];
    }),
  );
}

const SERVICE: OutsideService = {
  name: "Sample",
  role: "Does a thing",
  receives: "Something",
  purpose: "A reason",
  location: "Somewhere",
  safeguard: "A safeguard",
  retention: "A while",
  policyUrl: "https://sample.example/privacy",
  scriptOrigins: [],
  connectOrigins: [],
};

/** The scenario the spec names, plus a second service repeating an origin. */
const SAMPLE: readonly OutsideService[] = [
  { ...SERVICE, name: "A", scriptOrigins: ["https://a.example"] },
  {
    ...SERVICE,
    name: "B",
    scriptOrigins: ["https://a.example"],
    connectOrigins: ["https://*.b.example"],
  },
];

const SAMPLE_ORIGINS = [
  "https://a.example",
  "https://*.b.example",
  "a.example",
  "b.example",
];

describe("the real list", () => {
  /** covers: AC-13, AC-14. Today's exact two policies, which are the same. */
  it("gives today's exact policies in production", () => {
    const { tool, standard } = buildPolicies({ services: OUTSIDE_SERVICES, dev: false });

    expect(tool).toBe(TODAY);
    expect(standard).toBe(TODAY);
  });

  /** `next dev` adds eval and a websocket, to both regimes, and nothing else. */
  it("adds only the development sources under next dev", () => {
    for (const policy of Object.values(
      buildPolicies({ services: OUTSIDE_SERVICES, dev: true }),
    )) {
      expect(directives(policy)).toEqual({
        ...FIXED,
        "script-src": "'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'",
        "connect-src": "'self' ws: wss:",
      });
    }
  });
});

describe("a list holding outside origins", () => {
  /** covers: AC-13. Exactly the union, in script-src and connect-src only. */
  it.each([false, true])(
    "adds them to the standard policy's two directives and no other (dev: %s)",
    (dev) => {
      const { standard } = buildPolicies({ services: SAMPLE, dev });
      const plain = directives(buildPolicies({ services: [], dev }).standard);

      expect(directives(standard)).toEqual({
        ...plain,
        "script-src": `${plain["script-src"]} https://a.example`,
        "connect-src": `${plain["connect-src"]} https://*.b.example`,
      });
    },
  );

  /** covers: AC-13. Each origin once, however many services name it. */
  it("names each origin once", () => {
    const { standard } = buildPolicies({ services: SAMPLE, dev: false });

    expect(standard.split("https://a.example")).toHaveLength(2);
  });

  /** covers: AC-14, INV-2. Not anywhere, in any spelling, whatever the list holds. */
  it.each([false, true])("puts none of them in the tool policy (dev: %s)", (dev) => {
    const { tool } = buildPolicies({ services: SAMPLE, dev });

    for (const origin of SAMPLE_ORIGINS) expect(tool).not.toContain(origin);
    expect(tool).toBe(buildPolicies({ services: [], dev }).tool);
  });

  /** covers: AC-14. The directive the guarantee rests on, exact in production. */
  it("keeps the tool policy's connect-src and script-src exact in production", () => {
    const tool = directives(buildPolicies({ services: SAMPLE, dev: false }).tool);

    expect(tool["connect-src"]).toBe("'self'");
    expect(tool["script-src"]).toBe("'self' 'unsafe-inline' 'wasm-unsafe-eval'");
  });
});
