import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DeleteOutcome } from "@/billing/delete";
import type { PortalOutcome } from "@/billing/portal";
import type { SubscribeOutcome } from "@/billing/subscribe";
import { billingFailure } from "@/telemetry/events";

/**
 * The account pages' reports. Spec 0016, AC-6, AC-14 and AC-19.
 *
 * Each seam is stood in for with an outcome carrying everything a report must
 * never hold (an email, a Polar id, a checkout address), and `reportServer` is
 * the boundary: what reaches it is all a report could ever say.
 */

const LEAKS = ["jane.doe@example.com", "cus_123", "polar.sh", "user_abc"];

const mocks = vi.hoisted(() => ({
  reportServer: vi.fn(),
  subscribe: vi.fn(),
  openPortal: vi.fn(),
  deleteAccount: vi.fn(),
  requestHeaders: new Headers(),
}));

class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

vi.mock("@/telemetry/server", () => ({ reportServer: mocks.reportServer }));
vi.mock("next/headers", () => ({ headers: () => Promise.resolve(mocks.requestHeaders) }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: "user_abc" }),
  currentUser: () => Promise.resolve(null),
}));
vi.mock("@/config/billing", () => ({ billing: { publishableKey: "pk_test_x" } }));
vi.mock("@/billing/clients", () => ({
  accountSeams: () => ({
    siteUrl: "https://redactnest.test",
    createCustomerSession: vi.fn(),
  }),
}));
vi.mock("@/billing/subscribe", () => ({ subscribe: mocks.subscribe }));
vi.mock("@/billing/portal", () => ({ openPortal: mocks.openPortal }));
vi.mock("@/billing/delete", () => ({ deleteAccount: mocks.deleteAccount }));

const { default: SubscribePage } = await import("@/app/(account)/account/subscribe/page");
const { default: BillingPage } = await import("@/app/(account)/account/billing/page");
const { deleteAccountAction } = await import("@/app/(account)/account/actions");

beforeEach(() => {
  mocks.reportServer.mockClear();
  mocks.requestHeaders = new Headers();
});

/** Run a page that may redirect, as Next.js would. */
const settle = (page: () => Promise<unknown>) =>
  page().then(
    () => undefined,
    (thrown: unknown) => {
      if (!(thrown instanceof Redirected)) throw thrown;
    },
  );

function expectNothingFromTheSeams(): void {
  const sent = JSON.stringify(mocks.reportServer.mock.calls.map(([event]) => event));
  for (const leak of LEAKS) expect(sent).not.toContain(leak);
}

const reported = () => mocks.reportServer.mock.calls.map(([event]) => event as unknown);

describe("Subscribe", () => {
  it.each<SubscribeOutcome["kind"]>([
    "plan-unknown",
    "customer-conflict",
    "other-product",
    "checkout-failed",
  ])("reports billing-failed for %s, by kind alone", async (kind) => {
    mocks.subscribe.mockResolvedValueOnce({
      kind,
      email: "jane.doe@example.com",
      id: "cus_123",
    });
    await settle(() => SubscribePage());
    expect(reported()).toEqual([
      { name: "billing-failed", action: "subscribe", outcome: kind },
    ]);
    expectNothingFromTheSeams();
  });

  it("sends subscribe-started before the redirect to checkout, and nothing of the checkout", async () => {
    mocks.subscribe.mockResolvedValueOnce({
      kind: "checkout",
      url: "https://sandbox.polar.sh/checkout/cus_123?email=jane.doe@example.com",
    });
    await expect(SubscribePage()).rejects.toBeInstanceOf(Redirected);
    expect(reported()).toEqual([{ name: "subscribe-started" }]);
    expect(mocks.reportServer.mock.calls[0]?.[1]).toBe(mocks.requestHeaders);
    expectNothingFromTheSeams();
  });

  it.each<SubscribeOutcome["kind"]>(["sign-in", "already-pro", "settling"])(
    "reports nothing for %s",
    async (kind) => {
      mocks.subscribe.mockResolvedValueOnce({ kind });
      await settle(() => SubscribePage());
      expect(reported()).toEqual([]);
    },
  );
});

describe("Manage billing", () => {
  it("reports billing-failed for portal-failed", async () => {
    mocks.openPortal.mockResolvedValueOnce({
      kind: "portal-failed",
      customerId: "cus_123",
    });
    await settle(() => BillingPage());
    expect(reported()).toEqual([
      { name: "billing-failed", action: "portal", outcome: "portal-failed" },
    ]);
    expectNothingFromTheSeams();
  });

  it.each<PortalOutcome["kind"]>(["sign-in", "no-customer", "portal"])(
    "reports nothing for %s",
    async (kind) => {
      mocks.openPortal.mockResolvedValueOnce({
        kind,
        url: "https://polar.sh/portal/cus_123",
      });
      await settle(() => BillingPage());
      expect(reported()).toEqual([]);
    },
  );
});

describe("Delete account", () => {
  it.each<DeleteOutcome["kind"]>(["billing-failed", "sign-in-kept"])(
    "reports billing-failed for %s, and still answers with the kind",
    async (kind) => {
      mocks.deleteAccount.mockResolvedValueOnce({ kind, email: "jane.doe@example.com" });
      expect(await deleteAccountAction()).toBe(kind);
      expect(reported()).toEqual([
        { name: "billing-failed", action: "delete", outcome: kind },
      ]);
      expectNothingFromTheSeams();
    },
  );

  it.each<DeleteOutcome["kind"]>(["sign-in", "renewing", "other-product", "deleted"])(
    "reports nothing for %s",
    async (kind) => {
      mocks.deleteAccount.mockResolvedValueOnce({ kind });
      await deleteAccountAction();
      expect(reported()).toEqual([]);
    },
  );
});

describe("billingFailure", () => {
  /**
   * Every outcome kind of every seam is named here as a failure or not, so a
   * kind added to a seam fails this test until someone decides which.
   */
  const SUBSCRIBE: Record<SubscribeOutcome["kind"], boolean> = {
    "sign-in": false,
    "already-pro": false,
    settling: false,
    checkout: false,
    "plan-unknown": true,
    "customer-conflict": true,
    "other-product": true,
    "checkout-failed": true,
  };
  const PORTAL: Record<PortalOutcome["kind"], boolean> = {
    "sign-in": false,
    "no-customer": false,
    portal: false,
    "portal-failed": true,
  };
  const DELETE: Record<DeleteOutcome["kind"], boolean> = {
    "sign-in": false,
    renewing: false,
    "other-product": false,
    deleted: false,
    "billing-failed": true,
    "sign-in-kept": true,
  };

  it.each([
    ["subscribe", SUBSCRIBE],
    ["portal", PORTAL],
    ["delete", DELETE],
  ] as const)("names exactly %s's failing kinds", (action, kinds) => {
    for (const [kind, fails] of Object.entries(kinds)) {
      expect(billingFailure(action, kind) !== null).toBe(fails);
    }
  });

  it("knows the welcome page's wait, and nothing it does not name", () => {
    expect(billingFailure("welcome", "still-waiting")).toEqual({
      name: "billing-failed",
      action: "welcome",
      outcome: "still-waiting",
    });
    expect(billingFailure("portal", "still-waiting")).toBeNull();
    expect(billingFailure("subscribe", "portal-failed")).toBeNull();
  });
});
