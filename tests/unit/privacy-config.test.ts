import { describe, expect, it } from "vitest";

import {
  checkPrivacyConfig,
  COMPLAINT_AUTHORITIES,
  isPolicyOrigin,
  OUTSIDE_SERVICES,
  type OutsideService,
} from "@/config/privacy";

/**
 * The outside services list and the complaint authorities, validated at load.
 * Spec 0011, AC-8, AC-9 and AC-13.
 *
 * The list feeds the standard content security policy, so an origin that reads
 * one way to a person and another to a browser is refused before it can reach
 * a header.
 */

const SAMPLE: OutsideService = {
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

describe("the real list", () => {
  /** covers: AC-8, AC-9, AC-13 */
  it("validates", () => {
    expect(checkPrivacyConfig(OUTSIDE_SERVICES, COMPLAINT_AUTHORITIES)).toEqual([]);
  });

  /** covers: AC-8. Today, the host only, naming no origin of its own. */
  it("names Vercel, and no origin for the policy", () => {
    expect(OUTSIDE_SERVICES.map((service) => service.name)).toEqual(["Vercel"]);
    for (const service of OUTSIDE_SERVICES) {
      expect(service.scriptOrigins).toEqual([]);
      expect(service.connectOrigins).toEqual([]);
    }
  });

  it("is frozen, entries included", () => {
    expect(Object.isFrozen(OUTSIDE_SERVICES)).toBe(true);
    for (const service of OUTSIDE_SERVICES) expect(Object.isFrozen(service)).toBe(true);
    expect(Object.isFrozen(COMPLAINT_AUTHORITIES)).toBe(true);
  });
});

describe("a policy origin", () => {
  /** covers: AC-13 */
  it.each([
    "https://a.example",
    "https://*.a.example",
    "https://a.example:8443",
    "https://api.a-b.example",
  ])("accepts %s", (origin) => {
    expect(isPolicyOrigin(origin)).toBe(true);
  });

  /** covers: AC-13 */
  it.each([
    ["plain http", "http://a.example"],
    ["a path", "https://a.example/script.js"],
    ["a trailing slash", "https://a.example/"],
    ["a query", "https://a.example?x=1"],
    ["a hash", "https://a.example#x"],
    ["an uppercase host", "https://A.example"],
    ["a bare star", "*"],
    ["a star for a whole scheme", "https://*"],
    ["a bare host", "a.example"],
    ["a star in the middle", "https://a.*.example"],
    ["two stars", "https://*.*.example"],
    ["a keyword", "'self'"],
    ["a space", "https://a.example https://b.example"],
  ])("refuses %s", (_label, origin) => {
    expect(isPolicyOrigin(origin)).toBe(false);
  });
});

describe("a list that must fail", () => {
  /** covers: AC-13. Each bad origin is named, in either directive. */
  it.each([
    ["a path", "https://a.example/x"],
    ["a trailing slash", "https://a.example/"],
    ["a query", "https://a.example?x=1"],
    ["an uppercase host", "https://A.example"],
    ["a bare star", "*"],
    ["a bare host", "a.example"],
  ])("refuses an origin with %s", (_label, origin) => {
    for (const service of [
      { ...SAMPLE, scriptOrigins: [origin] },
      { ...SAMPLE, connectOrigins: [origin] },
    ]) {
      expect(checkPrivacyConfig([service], COMPLAINT_AUTHORITIES)).toEqual([
        expect.stringContaining(JSON.stringify(origin)),
      ]);
    }
  });

  /** covers: AC-8 */
  it("refuses an http policy link", () => {
    expect(
      checkPrivacyConfig(
        [{ ...SAMPLE, policyUrl: "http://sample.example/privacy" }],
        COMPLAINT_AUTHORITIES,
      ),
    ).toEqual([expect.stringMatching(/^Sample's policyUrl must be an https address/)]);
  });

  /** covers: AC-9 */
  it("refuses a complaint link that is not https", () => {
    expect(
      checkPrivacyConfig([], {
        ...COMPLAINT_AUTHORITIES,
        uk: { name: "ICO", url: "ico.org.uk" },
      }),
    ).toEqual([expect.stringMatching(/^COMPLAINT_AUTHORITIES\.uk\.url/)]);
  });

  /** covers: AC-13. Good origins pass beside each other. */
  it("accepts good origins in both directives", () => {
    expect(
      checkPrivacyConfig(
        [
          {
            ...SAMPLE,
            scriptOrigins: ["https://*.a.example"],
            connectOrigins: ["https://a.example:8443"],
          },
        ],
        COMPLAINT_AUTHORITIES,
      ),
    ).toEqual([]);
  });
});
