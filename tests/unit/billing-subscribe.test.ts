import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { type CheckoutRequest, subscribe, type SubscribeDeps } from "@/billing/subscribe";

/**
 * Subscribe. Spec 0012, AC-14 and INV-3.
 *
 * INV-3 first, on the page itself: Polar receives the session's user and that
 * user's email, never anything the request carries, and with no session it
 * receives nothing at all. Then every outcome of the decision behind it.
 */

const USER_A = "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EMAIL_A = "a@redactnest.com";
const USER_B = "user_bbbbbbbbbbbbbbbbbbbbbbbbbbb";
const EMAIL_B = "b@redactnest.com";
const PRO_BENEFIT = "benefit-pro";
const PRO_PRODUCT = "product-pro";
const SITE = "https://redactnest.test";
const CHECKOUT_URL = "https://sandbox.polar.sh/checkout/polar_c_test";

/** What `redirect` throws, so a test can see where a page sent the visitor. */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const session = vi.hoisted(() => ({
  userId: null as string | null,
  email: null as string | null,
}));
const polar = vi.hoisted(() => ({
  stateCalls: [] as string[],
  checkoutCalls: [] as unknown[],
  state: null as unknown,
}));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: session.userId }),
  currentUser: () =>
    Promise.resolve(
      session.email === null
        ? null
        : { primaryEmailAddress: { emailAddress: session.email } },
    ),
}));
vi.mock("@/config/billing", () => ({ billing: { publishableKey: "pk_test_x" } }));
vi.mock("@/billing/clients", () => ({
  accountSeams: () => ({
    proBenefitId: "benefit-pro",
    proProductId: "product-pro",
    siteUrl: "https://redactnest.test",
    getStateExternal: (externalId: string) => {
      polar.stateCalls.push(externalId);
      return polar.state === null
        ? Promise.reject(Object.assign(new Error("not found"), { statusCode: 404 }))
        : Promise.resolve(polar.state);
    },
    createCheckout: (body: unknown) => {
      polar.checkoutCalls.push(body);
      return Promise.resolve({ url: "https://sandbox.polar.sh/checkout/polar_c_test" });
    },
  }),
}));

beforeEach(() => {
  session.userId = null;
  session.email = null;
  polar.stateCalls.length = 0;
  polar.checkoutCalls.length = 0;
  polar.state = null;
});

/** The page, called as Next.js would, with user B's details in its query. */
async function openSubscribe(): Promise<Redirected | ReactElement> {
  const { default: SubscribePage } =
    await import("@/app/(account)/account/subscribe/page");
  const page = SubscribePage as unknown as (props: unknown) => Promise<ReactElement>;
  try {
    return await page({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({
        external_customer_id: USER_B,
        customer_id: "customer-b",
        customer_email: EMAIL_B,
      }),
    });
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

describe("INV-3 on /account/subscribe", () => {
  it("gives Polar the session's user and email, whatever the request carries", async () => {
    session.userId = USER_A;
    session.email = EMAIL_A;

    const result = await openSubscribe();

    expect(result).toEqual(new Redirected(CHECKOUT_URL));
    expect(polar.stateCalls).toEqual([USER_A]);
    expect(polar.checkoutCalls).toEqual([
      {
        products: [PRO_PRODUCT],
        external_customer_id: USER_A,
        customer_email: EMAIL_A,
        success_url: `${SITE}/account/welcome`,
        return_url: `${SITE}/pricing`,
      },
    ]);
    expect(JSON.stringify(polar.checkoutCalls)).not.toMatch(
      /bbbb|b@redactnest|customer-b/,
    );
  });

  it("sends a visitor with no session to sign in and back, and calls Polar for nothing", async () => {
    const result = await openSubscribe();

    expect(result).toEqual(
      new Redirected("/sign-in?redirect_url=%2Faccount%2Fsubscribe"),
    );
    expect(polar.stateCalls).toEqual([]);
    expect(polar.checkoutCalls).toEqual([]);
  });
});

describe("the page's other outcomes (AC-14)", () => {
  it("sends a Pro user to Account with the already on Pro notice", async () => {
    session.userId = USER_A;
    polar.state = {
      granted_benefits: [{ benefit_id: PRO_BENEFIT }],
      active_subscriptions: [],
    };

    expect(await openSubscribe()).toEqual(new Redirected("/account?notice=already-pro"));
    expect(polar.checkoutCalls).toEqual([]);
  });

  it("sends a payment still settling to the welcome page", async () => {
    session.userId = USER_A;
    polar.state = {
      granted_benefits: [],
      active_subscriptions: [
        {
          product_id: PRO_PRODUCT,
          current_period_end: "2026-11-03T12:00:00Z",
          cancel_at_period_end: false,
        },
      ],
    };

    expect(await openSubscribe()).toEqual(new Redirected("/account/welcome"));
    expect(polar.checkoutCalls).toEqual([]);
  });

  it("starts no checkout when the plan cannot be checked, and says so", async () => {
    session.userId = USER_A;
    polar.state = "unreadable";

    const result = await openSubscribe();

    expect(result).not.toBeInstanceOf(Redirected);
    expect(renderToStaticMarkup(result as ReactElement)).toContain(
      "We couldn’t check your plan just now, so we didn’t start a checkout. Try again.",
    );
    expect(polar.checkoutCalls).toEqual([]);
  });
});

describe("subscribe, the decision", () => {
  function deps(overrides: Partial<SubscribeDeps> = {}): SubscribeDeps & {
    readonly checkouts: CheckoutRequest[];
  } {
    const checkouts: CheckoutRequest[] = [];
    return {
      checkouts,
      proBenefitId: PRO_BENEFIT,
      proProductId: PRO_PRODUCT,
      successUrl: `${SITE}/account/welcome`,
      returnUrl: `${SITE}/pricing`,
      getStateExternal: () =>
        Promise.reject(Object.assign(new Error("x"), { statusCode: 404 })),
      getEmail: () => Promise.resolve(EMAIL_A),
      createCheckout: (body) => {
        checkouts.push(body);
        return Promise.resolve({ url: CHECKOUT_URL });
      },
      ...overrides,
    };
  }

  it("asks for nothing without a user", async () => {
    const getEmail = vi.fn(() => Promise.resolve(EMAIL_A));
    const d = deps({ getEmail });
    expect(await subscribe(null, d)).toEqual({ kind: "sign-in" });
    expect(getEmail).not.toHaveBeenCalled();
    expect(d.checkouts).toEqual([]);
  });

  it("is a checkout for a user with no Polar customer yet", async () => {
    expect(await subscribe(USER_A, deps())).toEqual({
      kind: "checkout",
      url: CHECKOUT_URL,
    });
  });

  it("leaves the email out when the user has none, rather than inventing one", async () => {
    const d = deps({ getEmail: () => Promise.resolve(null) });
    await subscribe(USER_A, d);
    expect(d.checkouts[0]).not.toHaveProperty("customer_email");
  });

  it.each([401, 429, 500])(
    "is plan-unknown when Polar answers %i, with no checkout",
    async (status) => {
      const d = deps({
        getStateExternal: () =>
          Promise.reject(Object.assign(new Error("x"), { statusCode: status })),
      });
      expect(await subscribe(USER_A, d)).toEqual({ kind: "plan-unknown" });
      expect(d.checkouts).toEqual([]);
    },
  );

  it("is checkout-failed when Polar will not start one", async () => {
    const d = deps({ createCheckout: () => Promise.reject(new Error("422")) });
    expect(await subscribe(USER_A, d)).toEqual({ kind: "checkout-failed" });
  });

  it.each([
    ["no url", {}],
    ["an http url", { url: "http://sandbox.polar.sh/checkout/x" }],
    ["not a url", { url: "checkout" }],
  ])("is checkout-failed when Polar's answer has %s", async (_name, answer) => {
    const d = deps({ createCheckout: () => Promise.resolve(answer) });
    expect(await subscribe(USER_A, d)).toEqual({ kind: "checkout-failed" });
  });
});
