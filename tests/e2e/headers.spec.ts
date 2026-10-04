import { readFileSync } from "node:fs";

import { type APIResponse, expect, test } from "@playwright/test";

import { BILLING_ENV } from "./build-env";

/**
 * The content security policy is the enforcement point for this product's
 * central claim, so it is asserted directly rather than assumed.
 *
 * Spec 0001 fixes the exact directive set on the tool route. If a later feature
 * adds a third party origin to the wrong regime, this is what should fail.
 */

/** Every directive the tool route must carry, exactly as the spec fixes it. */
const TOOL_DIRECTIVES = [
  "default-src 'none'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "worker-src 'self'",
  "connect-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
];

test("the tool route carries the full policy, enforced", async ({ request }) => {
  const response = await request.get("/tool");
  expect(response.status()).toBe(200);

  const headers = response.headers();

  // Report only would look like it passes while enforcing nothing.
  expect(headers["content-security-policy-report-only"]).toBeUndefined();

  const policy = headers["content-security-policy"];
  expect(policy, "the tool route must send a policy").toBeTruthy();

  for (const directive of TOOL_DIRECTIVES) {
    expect(policy, `missing or altered: ${directive}`).toContain(directive);
  }
});

/** Every value a response sends for one header name, counted, not merged. */
async function valuesOf(response: APIResponse, name: string): Promise<string[]> {
  const all = await response.headersArray();
  return all
    .filter((header) => header.name.toLowerCase() === name)
    .map((header) => header.value);
}

// Two matching header rules would send two policies, and a browser enforces
// all of them at once. That makes the effective policy very hard to reason
// about, so the route matching is arranged to produce exactly one. `/` is
// checked too since spec 0012's referrer rule matches every path beside it.
for (const path of ["/tool", "/"]) {
  test(`exactly one policy header is sent on ${path}`, async ({ request }) => {
    const response = await request.get(path);
    expect(await valuesOf(response, "content-security-policy")).toHaveLength(1);
  });
}

test("the tool route permits no third party origin", async ({ request }) => {
  const response = await request.get("/tool");
  const policy = response.headers()["content-security-policy"] ?? "";

  const connect = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("connect-src"));

  // This is the directive the privacy guarantee actually rests on: nothing on
  // this page may reach an origin that is not our own.
  expect(connect).toBe("connect-src 'self'");
});

test("other routes get the standard regime", async ({ request }) => {
  const response = await request.get("/");
  const policy = response.headers()["content-security-policy"];

  expect(policy).toBeTruthy();
  expect(policy).toContain("default-src 'none'");
  expect(policy).toContain("frame-ancestors 'none'");
});

test("the wasm asset is served as application/wasm from our own origin", async ({
  request,
  baseURL,
}) => {
  const response = await request.get("/engine/mupdf-wasm.wasm");
  expect(response.status()).toBe(200);

  // A wrong media type silently degrades streaming instantiation or fails
  // outright, depending on the loader. Vercel's static handler is expected to
  // set this; this checks rather than assumes.
  expect(response.headers()["content-type"]).toContain("application/wasm");

  // Self hosted, never a content delivery network.
  expect(response.url().startsWith(baseURL!)).toBe(true);
});

/**
 * Spec 0009, AC-12, AC-13 and AC-22. The licence and the third party notices
 * come from our own origin as plain text. The content type is matched without
 * regard to case, since `next start` and Vercel may spell it differently.
 */
test.describe("the licence files", () => {
  for (const path of ["/licence.txt", "/third-party-notices.txt"]) {
    test(`${path} is plain text from our own origin`, async ({ request, baseURL }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(response.url().startsWith(baseURL!)).toBe(true);

      const type = (response.headers()["content-type"] ?? "").toLowerCase();
      expect(type).toContain("text/plain");
      expect(type).toContain("charset=utf-8");
    });
  }

  /** INV-7: byte for byte, so nobody reads a licence we reworded. */
  test("the licence is the repository's LICENSE, byte for byte", async ({ request }) => {
    const response = await request.get("/licence.txt");
    expect((await response.body()).equals(readFileSync("LICENSE"))).toBe(true);
  });

  test("the notices name what the build installed", async ({ request }) => {
    const notices = await (await request.get("/third-party-notices.txt")).text();

    expect(notices).toContain("RedactNest: third party notices");
    expect(notices).toMatch(/^libphonenumber-js \d+\.\d+\.\d+\nLicence: MIT\n/m);
    expect(notices).toMatch(
      /^libphonenumber-js \d+\.\d+\.\d+\nLicence: MIT for the package/m,
    );
    expect(notices).toMatch(/^Inter\nLicence: OFL-1\.1$/m);
    expect(notices).toMatch(/^Carlito\nLicence: OFL-1\.1$/m);
  });
});

/**
 * Spec 0009, AC-15 and AC-17. MuPDF's source is offered beside the engine
 * itself (AGPL section 6(d)) and in the notices, with the archive's checksum.
 */
test.describe("MuPDF's source offer", () => {
  const ARCHIVE = "https://mupdf.com/downloads/archive/mupdf-1.28.1-source.tar.gz";

  test("the engine's VERSION file names the source archive and the tagged tree", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get("/engine/VERSION");
    expect(response.status()).toBe(200);
    expect(response.url().startsWith(baseURL!)).toBe(true);

    // No extension, so a header rule makes it text rather than a download.
    const type = (response.headers()["content-type"] ?? "").toLowerCase();
    expect(type).toContain("text/plain");
    expect(type).toContain("charset=utf-8");

    const lines = (await response.text()).trimEnd().split("\n");
    expect(lines).toEqual([
      "mupdf 1.28.1",
      "AGPL-3.0-or-later",
      "Copyright (C) 2004-2026 Artifex Software, Inc.",
      `Source: ${ARCHIVE}`,
      "Browse: https://github.com/ArtifexSoftware/mupdf/tree/1.28.1",
    ]);
  });

  test("the notices carry what is compiled into the engine", async ({ request }) => {
    const notices = await (await request.get("/third-party-notices.txt")).text();

    expect(notices).toContain(ARCHIVE);
    expect(notices).toContain(
      "dc94c60b2537e2ac9a2d379dd3801545f84a3a302d15c9da358362a1270707c3",
    );
    expect(notices).toContain("Independent JPEG Group");
    expect(notices).toContain("Emscripten");
  });
});

/**
 * Spec 0012, AC-27. Every page and file carries exactly one referrer policy,
 * so another origin (Clerk, Polar, GitHub) learns at most our origin, never a
 * path or a query. The value is written out here rather than imported, so a
 * change to `REFERRER_POLICY` has to change this test too.
 */
test.describe("the referrer policy", () => {
  const POLICY = ["strict-origin-when-cross-origin"];

  // `/engine/VERSION` already has a header rule of its own, the content type.
  for (const path of [
    "/",
    "/tool",
    "/pricing",
    "/privacy",
    "/terms",
    "/engine/VERSION",
  ]) {
    test(`${path} carries exactly one`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      expect(await valuesOf(response, "referrer-policy")).toEqual(POLICY);
    });
  }

  test("a script the home page loads carries exactly one", async ({ request }) => {
    // Its name changes with every build, so it is read from the page.
    const html = await (await request.get("/")).text();
    const src = html.match(/<script[^>]+src="(\/_next\/static\/[^"]+\.js)"/)?.[1];
    expect(src, "the home page loads a script of its own").toBeTruthy();

    const response = await request.get(src!);
    expect(response.status()).toBe(200);
    expect(await valuesOf(response, "referrer-policy")).toEqual(POLICY);
  });
});

/**
 * Spec 0012, AC-26. After a payment Polar adds its portal token to the
 * welcome address. The proxy answers with a 307 to the same address without
 * it, before Clerk runs, so Clerk's handshake never carries the token.
 *
 * Sent as a page load, because Clerk runs its handshake for nothing else, so
 * without these headers the control below would prove nothing.
 */
test.describe("the portal token", () => {
  const PAGE_LOAD = { "Sec-Fetch-Dest": "document", Accept: "text/html" };

  /** The Frontend API host the fake publishable key names, as Clerk reads it. */
  const CLERK_HOST = Buffer.from(
    BILLING_ENV.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.replace(/^pk_test_/, ""),
    "base64",
  )
    .toString("utf8")
    .replace(/\$$/, "");

  test("is dropped with a 307 to the same address on our own origin", async ({
    request,
    baseURL,
  }) => {
    const response = await request.get(
      "/account/welcome?customer_session_token=x&keep=1",
      { headers: PAGE_LOAD, maxRedirects: 0 },
    );
    expect(response.status()).toBe(307);

    const location = response.headers()["location"] ?? "";
    expect(location).not.toContain("customer_session_token");
    const target = new URL(location, baseURL);
    // The request's own origin, never `NEXT_PUBLIC_SITE_URL`, which the
    // browser tests set to another host.
    expect(target.origin).toBe(new URL(baseURL!).origin);
    expect(target.pathname).toBe("/account/welcome");
    expect(target.search).toBe("?keep=1");
  });

  test("without it, the same request goes to Clerk's handshake, so the strip runs first", async ({
    request,
  }) => {
    const response = await request.get("/account/welcome?keep=1", {
      headers: PAGE_LOAD,
      maxRedirects: 0,
    });
    expect(response.status()).toBe(307);
    expect(new URL(response.headers()["location"] ?? "").host).toBe(CLERK_HOST);
  });
});
