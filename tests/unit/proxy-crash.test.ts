import { type NextFetchEvent, NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ServerCrash } from "@/telemetry/events";

/**
 * The proxy reports its own failures. Spec 0016, AC-26.
 *
 * In Next.js 16.3.5 a throw in the Node proxy never reaches `onRequestError`,
 * so the proxy catches it, reports `server-crash` for the proxy through
 * `reportCrash`, waits for that, and rethrows the very same error. Clerk's
 * middleware and `reportCrash` are spies here, so what reaches the report and
 * what Next.js gets back are both read, not assumed. `reportCrash` itself is
 * covered in `telemetry-server.test.ts`.
 */

const mocks = vi.hoisted(() => ({
  billingEnabled: true,
  clerk: vi.fn<(request: NextRequest, event: NextFetchEvent) => unknown>(),
  reportCrash: vi.fn<(crash: ServerCrash) => Promise<void>>(),
}));

// Every other value is the real config; whether billing is on is the test's.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get billingEnabled() {
        return mocks.billingEnabled;
      },
    },
  };
});

vi.mock("@clerk/nextjs/server", () => ({ clerkMiddleware: () => mocks.clerk }));
vi.mock("@/telemetry/server", () => ({ reportCrash: mocks.reportCrash }));

const PROXY_CRASH: ServerCrash = {
  name: "server-crash",
  route: "proxy",
  routeType: "proxy",
};

const event = {} as NextFetchEvent;

/** A message a report must never carry, as a real failure's might. */
const failure = new Error("No Clerk key for jane.doe@example.com on /account?x=1");

/** A fresh proxy, so the billing flag is read again as the module loads. */
async function loadProxy() {
  vi.resetModules();
  return (await import("@/proxy")).default;
}

async function send(url = "http://localhost:3000/account"): Promise<unknown> {
  const proxy = await loadProxy();
  return await proxy(new NextRequest(url), event);
}

beforeEach(() => {
  mocks.billingEnabled = true;
  mocks.clerk.mockReset().mockImplementation(() => "clerk ran");
  mocks.reportCrash.mockReset().mockImplementation(() => Promise.resolve());
});

describe("a failure in the proxy", () => {
  it("reports the proxy's crash once, then rethrows the very same error, when Clerk throws", async () => {
    mocks.clerk.mockImplementation(() => {
      throw failure;
    });

    await expect(send()).rejects.toBe(failure);
    expect(mocks.reportCrash).toHaveBeenCalledTimes(1);
    expect(mocks.reportCrash).toHaveBeenCalledWith(PROXY_CRASH);
  });

  it("does the same when Clerk returns a rejected promise", async () => {
    mocks.clerk.mockImplementation(() => Promise.reject(failure));

    await expect(send()).rejects.toBe(failure);
    expect(mocks.reportCrash).toHaveBeenCalledTimes(1);
    expect(mocks.reportCrash).toHaveBeenCalledWith(PROXY_CRASH);
  });

  it("reports a throw before Clerk runs, while reading the address", async () => {
    const proxy = await loadProxy();
    const request = {
      get nextUrl(): never {
        throw failure;
      },
    } as unknown as NextRequest;

    await expect(proxy(request, event)).rejects.toBe(failure);
    expect(mocks.reportCrash).toHaveBeenCalledWith(PROXY_CRASH);
    expect(mocks.clerk).not.toHaveBeenCalled();
  });

  it("waits for the report before it rethrows", async () => {
    const report = Promise.withResolvers<void>();
    mocks.reportCrash.mockImplementation(() => report.promise);
    mocks.clerk.mockImplementation(() => {
      throw failure;
    });

    let settled = false;
    const sending = send().catch((error: unknown) => {
      settled = true;
      return error;
    });
    await vi.waitFor(() => {
      expect(mocks.reportCrash).toHaveBeenCalledTimes(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(settled).toBe(false);

    report.resolve();
    expect(await sending).toBe(failure);
  });
});

describe("a proxy that works", () => {
  it("answers the portal token with its 307 and reports nothing", async () => {
    const response = (await send(
      "http://localhost:3000/account/welcome?customer_session_token=x",
    )) as Response;

    expect(response.status).toBe(307);
    expect(mocks.clerk).not.toHaveBeenCalled();
    expect(mocks.reportCrash).not.toHaveBeenCalled();
  });

  it("hands back Clerk's answer and reports nothing", async () => {
    expect(await send()).toBe("clerk ran");
    expect(mocks.reportCrash).not.toHaveBeenCalled();
  });

  it("with billing off calls neither Clerk nor the report, whatever Clerk would do", async () => {
    mocks.billingEnabled = false;
    mocks.clerk.mockImplementation(() => {
      throw failure;
    });

    expect(await send()).toBeUndefined();
    expect(mocks.clerk).not.toHaveBeenCalled();
    expect(mocks.reportCrash).not.toHaveBeenCalled();
  });
});
