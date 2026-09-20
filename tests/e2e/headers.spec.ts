import { expect, test } from "@playwright/test";

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

test("exactly one policy header is sent", async ({ request }) => {
  const response = await request.get("/tool");

  // Two matching header rules would send two policies, and a browser enforces
  // all of them at once. That makes the effective policy very hard to reason
  // about, so the route matching is arranged to produce exactly one.
  const all = await response.headersArray();
  const policies = all.filter(
    (header) => header.name.toLowerCase() === "content-security-policy",
  );
  expect(policies).toHaveLength(1);
});

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
