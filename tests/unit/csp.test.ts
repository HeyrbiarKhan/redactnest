import { describe, expect, it } from "vitest";

import { buildPolicies } from "@/config/csp";
import { OUTSIDE_SERVICES, type OutsideService } from "@/config/privacy";

/**
 * The two content security policies. Spec 0001's regimes, and spec 0011,
 * AC-13 and AC-14, INV-1 and INV-2.
 *
 * The real services list names Clerk's origins since spec 0012 (AC-21), and
 * the tests below check the exact policies that gives. They also hand the
 * builder sample origins, and check those reach exactly the standard
 * directives meant for them, and never anything on the tool route.
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
  imageOrigins: [],
};

/** The scenario the spec names, plus a second service repeating an origin. */
const SAMPLE: readonly OutsideService[] = [
  {
    ...SERVICE,
    name: "A",
    scriptOrigins: ["https://a.example"],
    imageOrigins: ["https://img.c.example"],
  },
  {
    ...SERVICE,
    name: "B",
    scriptOrigins: ["https://a.example"],
    connectOrigins: ["https://*.b.example"],
    imageOrigins: [],
  },
];

const SAMPLE_ORIGINS = [
  "https://a.example",
  "https://*.b.example",
  "https://img.c.example",
  "a.example",
  "b.example",
  "c.example",
];

/** Clerk's origins, as spec 0012 AC-21 names them. */
const CLERK = "https://clerk.redactnest.com https://*.clerk.accounts.dev";

describe("the real list", () => {
  /** covers: spec 0011 AC-14, spec 0012 AC-20. The tool's policy, unchanged. */
  it("gives the tool exactly today's policy, Clerk and Polar listed or not", () => {
    const { tool } = buildPolicies({ services: OUTSIDE_SERVICES, dev: false });

    expect(tool).toBe(TODAY);
  });

  /**
   * covers: spec 0012 AC-21. The standard policy gains Clerk's script,
   * connect and image origins, Polar adds none, and no other directive moves.
   */
  it("gives the standard policy Clerk's origins and nothing else", () => {
    const { standard } = buildPolicies({ services: OUTSIDE_SERVICES, dev: false });

    expect(directives(standard)).toEqual({
      ...FIXED,
      "script-src": `${FIXED["script-src"]} ${CLERK}`,
      "connect-src": `${FIXED["connect-src"]} ${CLERK}`,
      "img-src": `${FIXED["img-src"]} https://img.clerk.com`,
    });
  });

  /** `next dev` adds eval and a websocket, to both regimes, and nothing else. */
  it("adds only the development sources under next dev", () => {
    const { tool, standard } = buildPolicies({ services: OUTSIDE_SERVICES, dev: true });
    const devScript = "'self' 'unsafe-inline' 'wasm-unsafe-eval' 'unsafe-eval'";

    expect(directives(tool)).toEqual({
      ...FIXED,
      "script-src": devScript,
      "connect-src": "'self' ws: wss:",
    });
    expect(directives(standard)).toEqual({
      ...FIXED,
      "script-src": `${devScript} ${CLERK}`,
      "connect-src": `'self' ws: wss: ${CLERK}`,
      "img-src": `${FIXED["img-src"]} https://img.clerk.com`,
    });
  });
});

describe("a list holding outside origins", () => {
  /**
   * covers: spec 0011 AC-13, spec 0012 AC-21. Exactly the union, in
   * script-src, connect-src and img-src only.
   */
  it.each([false, true])(
    "adds them to the standard policy's three directives and no other (dev: %s)",
    (dev) => {
      const { standard } = buildPolicies({ services: SAMPLE, dev });
      const plain = directives(buildPolicies({ services: [], dev }).standard);

      expect(directives(standard)).toEqual({
        ...plain,
        "script-src": `${plain["script-src"]} https://a.example`,
        "connect-src": `${plain["connect-src"]} https://*.b.example`,
        "img-src": `${plain["img-src"]} https://img.c.example`,
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
