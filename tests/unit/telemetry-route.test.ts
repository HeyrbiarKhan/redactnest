import { beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/telemetry/route";
import { config } from "@/config";
import { MAX_EVENT_BYTES } from "@/telemetry/events";

/**
 * `POST /api/telemetry`, spec 0016 AC-7. What it forwards is read off the one
 * call it makes, `reportServer`, which `telemetry-server.test.ts` covers from
 * there on (the opt out headers, the sinks, the send).
 */

const reportServer = vi.hoisted(() => vi.fn());
vi.mock("@/telemetry/server", () => ({ reportServer }));

const URL_ = `${config.siteUrl}/api/telemetry`;
const SAME_ORIGIN = Object.freeze({ "sec-fetch-site": "same-origin" });

function post(body: unknown, headers: Record<string, string> = SAME_ORIGIN): Request {
  return new Request(URL_, {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Every answer but the oversized one is this, whatever happened. */
async function expectQuietAnswer(response: Response): Promise<void> {
  expect(response.status).toBe(204);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).toBe("");
}

beforeEach(() => {
  reportServer.mockClear();
});

describe("what the route forwards", () => {
  it("passes on a well formed page event, as the parser rebuilt it", async () => {
    const response = await POST(post({ name: "page-view", page: "tool" }));
    await expectQuietAnswer(response);
    expect(reportServer).toHaveBeenCalledTimes(1);
    const [event, headers] = reportServer.mock.calls[0] as [unknown, Headers];
    expect(event).toEqual({ name: "page-view", page: "tool" });
    expect(Object.isFrozen(event)).toBe(true);
    expect(headers).toBeInstanceOf(Headers);
  });

  it("passes on the welcome page's still-waiting report", async () => {
    await POST(
      post({ name: "billing-failed", action: "welcome", outcome: "still-waiting" }),
    );
    expect(reportServer).toHaveBeenCalledTimes(1);
  });

  it("accepts a browser that sends no Sec-Fetch-Site but names our origin", async () => {
    const origin = new URL(config.siteUrl).origin;
    await POST(post({ name: "page-view", page: "home" }, { origin }));
    expect(reportServer).toHaveBeenCalledTimes(1);
  });
});

describe("what the route drops, with the same empty answer", () => {
  it.each([
    ["another site's page", { "sec-fetch-site": "cross-site" }],
    ["a sibling subdomain", { "sec-fetch-site": "same-site" }],
    ["a typed address", { "sec-fetch-site": "none" }],
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["no Sec-Fetch-Site and no Origin", {}],
    [
      "Sec-Fetch-Site cross-site with our Origin",
      {
        "sec-fetch-site": "cross-site",
        origin: new URL(config.siteUrl).origin,
      },
    ],
  ])("drops an event from %s", async (_label, headers) => {
    await expectQuietAnswer(
      await POST(post({ name: "page-view", page: "home" }, headers)),
    );
    expect(reportServer).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that is not JSON", "page-view"],
    ["an empty body", ""],
    ["an extra key", { name: "page-view", page: "home", file: "passport.pdf" }],
    ["a raw number", { name: "cap-reached", cap: 3, account: "none" }],
    [
      "an unknown kind",
      {
        name: "run-refused",
        kind: "on-fire",
        step: "open",
        tier: "free",
        account: "none",
      },
    ],
    [
      "a server crash, which only the server reports",
      { name: "server-crash", route: "entitlement", routeType: "route" },
    ],
    [
      "a plan check failure, which only the server reports",
      { name: "plan-check-failed" },
    ],
    ["subscribe-started, which only the server sends", { name: "subscribe-started" }],
    [
      "a server side billing failure",
      { name: "billing-failed", action: "subscribe", outcome: "checkout-failed" },
    ],
  ])("drops %s", async (_label, body) => {
    await expectQuietAnswer(await POST(post(body)));
    expect(reportServer).not.toHaveBeenCalled();
  });

  it("drops a body that runs past the limit with no Content-Length, unread past it", async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        if (pulled > 100) controller.close();
        else controller.enqueue(new Uint8Array(1024).fill(32));
      },
    });
    const request = new Request(URL_, {
      method: "POST",
      headers: SAME_ORIGIN,
      body: stream,
      duplex: "half",
    } as RequestInit);
    await expectQuietAnswer(await POST(request));
    expect(reportServer).not.toHaveBeenCalled();
    expect(pulled).toBeLessThan(10);
  });

  it("answers a cookie exactly as it answers none", async () => {
    const withCookie = await POST(
      post(
        { name: "page-view", page: "home" },
        {
          ...SAME_ORIGIN,
          cookie: "__session=eyJhbGciOi; __client_uat=1",
        },
      ),
    );
    await expectQuietAnswer(withCookie);
  });
});

describe("the size limit", () => {
  it("refuses a declared body over 2048 bytes with 413, before reading it", async () => {
    const body = JSON.stringify({
      name: "page-view",
      page: "home",
      pad: "x".repeat(2049),
    });
    const request = new Request(URL_, {
      method: "POST",
      headers: { ...SAME_ORIGIN, "content-length": String(MAX_EVENT_BYTES + 1) },
      body,
    });
    const response = await POST(request);
    expect(response.status).toBe(413);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(request.bodyUsed).toBe(false);
    expect(reportServer).not.toHaveBeenCalled();
  });

  it("reads a body of exactly 2048 bytes", async () => {
    const event = JSON.stringify({ name: "page-view", page: "home" });
    const body = event + " ".repeat(MAX_EVENT_BYTES - event.length);
    expect(new TextEncoder().encode(body).byteLength).toBe(MAX_EVENT_BYTES);
    await POST(post(body));
    expect(reportServer).toHaveBeenCalledTimes(1);
  });
});
