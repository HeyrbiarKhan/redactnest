import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { linkCustomer } from "@/billing/customer";
import { subscribe, type SubscribeDeps } from "@/billing/subscribe";

/**
 * Subscribe and Manage billing. Spec 0012, AC-14, AC-17, AC-25 and INV-3.
 *
 * INV-3 first, on the page itself: with a fake session for user A and a
 * request carrying user B's details in its query, Polar receives A's id and
 * A's email and nothing else, in every call, and with no session it receives
 * nothing at all. Then every case of tying the customer before checkout, and
 * every outcome of the decision behind the page. Manage billing last, with the
 * same session cases (INV-3) and every outcome of opening the portal.
 *
 * One fake Polar serves both: an organisation's customers in memory, keeping
 * Polar's two rules the fix rests on (one live customer per email, and an
 * external id set once and never changed), and recording every call.
 */

/** What `redirect` throws, so a test can see where a page sent the visitor. */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

interface FakeCustomer {
  id: string;
  email: string;
  external_id: string | null;
  deleted_at: string | null;
  granted_benefits: { benefit_id: string }[];
  active_subscriptions: {
    product_id: string;
    current_period_end: string;
    cancel_at_period_end: boolean;
  }[];
}

const fake = vi.hoisted(() => {
  const SITE = "https://redactnest.test";
  const CHECKOUT_URL = "https://sandbox.polar.sh/checkout/polar_c_test";
  const PORTAL_URL =
    "https://sandbox.polar.sh/redactnest/portal?customer_session_token=x";
  const rejectWith = (statusCode: number) =>
    Promise.reject(Object.assign(new Error(`status ${statusCode}`), { statusCode }));

  const store = {
    customers: [] as FakeCustomer[],
    /** Every call Polar received, in order, with its arguments. */
    calls: [] as unknown[][],
    /** A status step 1's lookup fails with, or a state it answers instead. */
    stateStatus: null as number | null,
    stateAnswer: undefined as unknown,
    listStatus: null as number | null,
    updateStatus: null as number | null,
    /** Statuses the next creates fail with, one each, before the real rule. */
    createStatuses: [] as number[],
    /** Runs as a create arrives, to play another tab winning the race. */
    beforeCreate: null as (() => void) | null,
    createAnswer: undefined as unknown,
    checkoutStatus: null as number | null,
    checkoutAnswer: { url: CHECKOUT_URL } as unknown,
    portalStatus: null as number | null,
    /** An answer the portal gives instead of its address. */
    portalAnswer: undefined as unknown,
    created: 0,
  };

  const live = () => store.customers.filter((c) => c.deleted_at === null);

  const seams = {
    proBenefitId: "benefit-pro",
    proProductId: "product-pro",
    siteUrl: SITE,
    getStateExternal: (externalId: string) => {
      store.calls.push(["getStateExternal", externalId]);
      if (store.stateStatus !== null) return rejectWith(store.stateStatus);
      if (store.stateAnswer !== undefined) return Promise.resolve(store.stateAnswer);
      const customer = live().find((c) => c.external_id === externalId);
      if (customer === undefined) return rejectWith(404);
      return Promise.resolve({
        id: customer.id,
        email: customer.email,
        external_id: customer.external_id,
        granted_benefits: customer.granted_benefits,
        active_subscriptions: customer.active_subscriptions,
      });
    },
    findCustomersByEmail: (email: string) => {
      store.calls.push(["findCustomersByEmail", email]);
      if (store.listStatus !== null) return rejectWith(store.listStatus);
      // Soft deleted customers listed too, so the filter in the code is tested.
      const items = store.customers
        .filter((c) => c.email.toLowerCase() === email.toLowerCase())
        .map(({ id, email: address, external_id, deleted_at }) => ({
          id,
          email: address,
          external_id,
          deleted_at,
        }));
      return Promise.resolve({ items, pagination: { total_count: items.length } });
    },
    setExternalId: (customerId: string, externalId: string) => {
      store.calls.push(["setExternalId", customerId, externalId]);
      if (store.updateStatus !== null) return rejectWith(store.updateStatus);
      const customer = store.customers.find((c) => c.id === customerId);
      if (customer === undefined) return rejectWith(404);
      if (customer.external_id) return rejectWith(422);
      customer.external_id = externalId;
      return Promise.resolve({ ...customer });
    },
    createCustomer: (body: { readonly email: string; readonly external_id: string }) => {
      store.calls.push(["createCustomer", { ...body }]);
      store.beforeCreate?.();
      const status = store.createStatuses.shift();
      if (status !== undefined) return rejectWith(status);
      const email = body.email.toLowerCase();
      if (live().some((c) => c.email.toLowerCase() === email)) return rejectWith(422);
      if (live().some((c) => c.external_id === body.external_id)) return rejectWith(422);
      if (store.createAnswer !== undefined) return Promise.resolve(store.createAnswer);
      store.created += 1;
      const customer: FakeCustomer = {
        id: `cus_new_${store.created}`,
        email: body.email,
        external_id: body.external_id,
        deleted_at: null,
        granted_benefits: [],
        active_subscriptions: [],
      };
      store.customers.push(customer);
      return Promise.resolve({ ...customer });
    },
    createCheckout: (body: unknown) => {
      store.calls.push(["createCheckout", body]);
      if (store.checkoutStatus !== null) return rejectWith(store.checkoutStatus);
      return Promise.resolve(store.checkoutAnswer);
    },
    createCustomerSession: (body: { readonly external_customer_id: string }) => {
      store.calls.push(["createCustomerSession", { ...body }]);
      if (store.portalStatus !== null) return rejectWith(store.portalStatus);
      if (store.portalAnswer !== undefined) return Promise.resolve(store.portalAnswer);
      // Polar finds the customer by external id, as the plan check does.
      const known = live().some((c) => c.external_id === body.external_customer_id);
      return known
        ? Promise.resolve({ customer_portal_url: PORTAL_URL })
        : rejectWith(404);
    },
  };

  return { store, seams, SITE, CHECKOUT_URL, PORTAL_URL };
});

const session = vi.hoisted(() => ({
  userId: null as string | null,
  email: null as string | null,
  verification: "verified" as string,
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
        : {
            primaryEmailAddress: {
              emailAddress: session.email,
              verification: { status: session.verification },
            },
          },
    ),
}));
vi.mock("@/config/billing", () => ({ billing: { publishableKey: "pk_test_x" } }));
vi.mock("@/billing/clients", () => ({ accountSeams: () => fake.seams }));

const { store: polar, seams, SITE, CHECKOUT_URL, PORTAL_URL } = fake;

const USER_A = "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const EMAIL_A = "a@redactnest.com";
const USER_B = "user_bbbbbbbbbbbbbbbbbbbbbbbbbbb";
const EMAIL_B = "b@redactnest.com";
const PRO_BENEFIT = "benefit-pro";
const PRO_PRODUCT = "product-pro";
const OTHER_PRODUCT = "product-other";
const WELCOME_URL = `${SITE}/account/welcome`;
const PRICING_URL = `${SITE}/pricing`;

const PLAN_LINE =
  "We couldn’t check your plan just now, so we didn’t start a checkout. Try again.";
const CONFLICT_LINE =
  "This email is already linked to another account with us, so we didn’t start a checkout.";
const OTHER_PRODUCT_LINE =
  "Your email already has a subscription to another EdiventStudio product, and Polar allows one per person, so we didn’t start a checkout.";
const CHECKOUT_LINE = "We couldn’t start the checkout. Try again, or write to";
const BILLING_LINE = "We couldn’t open billing. Try again, or write to";

const PRO_SUBSCRIPTION = {
  product_id: PRO_PRODUCT,
  current_period_end: "2026-11-03T12:00:00Z",
  cancel_at_period_end: false,
};

/** A customer already in the organisation, untied unless the test says. */
function customer(overrides: Partial<FakeCustomer> = {}): FakeCustomer {
  const made: FakeCustomer = {
    id: "cus_old",
    email: EMAIL_A,
    external_id: null,
    deleted_at: null,
    granted_benefits: [],
    active_subscriptions: [],
    ...overrides,
  };
  polar.customers.push(made);
  return made;
}

const checkoutFor = (customerId: string) => [
  "createCheckout",
  {
    products: [PRO_PRODUCT],
    customer_id: customerId,
    success_url: WELCOME_URL,
    return_url: PRICING_URL,
  },
];

const writes = () =>
  polar.calls.filter(([op]) => op === "setExternalId" || op === "createCustomer");

beforeEach(() => {
  session.userId = null;
  session.email = null;
  session.verification = "verified";
  Object.assign(polar, {
    customers: [],
    calls: [],
    stateStatus: null,
    stateAnswer: undefined,
    listStatus: null,
    updateStatus: null,
    createStatuses: [],
    beforeCreate: null,
    createAnswer: undefined,
    checkoutStatus: null,
    checkoutAnswer: { url: CHECKOUT_URL },
    portalStatus: null,
    portalAnswer: undefined,
    created: 0,
  });
});

/** Signed in as user A, with A's email verified. */
function signInAsA(): void {
  session.userId = USER_A;
  session.email = EMAIL_A;
}

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
        customer_id: "cus_b",
        customer_email: EMAIL_B,
      }),
    });
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

/** The words of a page that started no checkout. */
async function failureText(): Promise<string> {
  const result = await openSubscribe();
  expect(result).not.toBeInstanceOf(Redirected);
  return renderToStaticMarkup(result as ReactElement);
}

/** Manage billing, called as Next.js would, with user B's details in its query. */
async function openBilling(): Promise<Redirected | ReactElement> {
  const { default: BillingPage } = await import("@/app/(account)/account/billing/page");
  const page = BillingPage as unknown as (props: unknown) => Promise<ReactElement>;
  try {
    return await page({
      params: Promise.resolve({}),
      searchParams: Promise.resolve({
        external_customer_id: USER_B,
        customer_id: "cus_b",
      }),
    });
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

/** The words of a Manage billing page that opened no portal. */
async function billingFailureText(): Promise<string> {
  const result = await openBilling();
  expect(result).not.toBeInstanceOf(Redirected);
  return renderToStaticMarkup(result as ReactElement);
}

describe("INV-3 on /account/subscribe", () => {
  it("gives Polar only A's id and A's email when it creates the customer", async () => {
    signInAsA();

    expect(await openSubscribe()).toEqual(new Redirected(CHECKOUT_URL));
    expect(polar.calls).toEqual([
      ["getStateExternal", USER_A],
      ["findCustomersByEmail", EMAIL_A],
      ["createCustomer", { email: EMAIL_A, external_id: USER_A }],
      checkoutFor("cus_new_1"),
    ]);
    expect(JSON.stringify(polar.calls)).not.toMatch(/bbbb|b@redactnest|cus_b/);
  });

  it("ties an untied customer with A's email to A, and binds the checkout to it", async () => {
    signInAsA();
    customer();

    expect(await openSubscribe()).toEqual(new Redirected(CHECKOUT_URL));
    expect(polar.calls).toEqual([
      ["getStateExternal", USER_A],
      ["findCustomersByEmail", EMAIL_A],
      ["setExternalId", "cus_old", USER_A],
      ["getStateExternal", USER_A],
      checkoutFor("cus_old"),
    ]);
    expect(JSON.stringify(polar.calls)).not.toMatch(/bbbb|b@redactnest|cus_b/);
  });

  it("ties an untied customer that already holds Pro, then sends A to Account with no checkout", async () => {
    signInAsA();
    customer({
      granted_benefits: [{ benefit_id: PRO_BENEFIT }],
      active_subscriptions: [PRO_SUBSCRIPTION],
    });

    expect(await openSubscribe()).toEqual(new Redirected("/account?notice=already-pro"));
    expect(polar.customers[0].external_id).toBe(USER_A);
    expect(polar.calls.map(([op]) => op)).not.toContain("createCheckout");
  });

  it("leaves a customer with A's email tied to B alone, and shows the conflict line", async () => {
    signInAsA();
    customer({ external_id: USER_B });

    expect(await failureText()).toContain(CONFLICT_LINE);
    expect(writes()).toEqual([]);
    expect(polar.calls.map(([op]) => op)).not.toContain("createCheckout");
    expect(polar.customers[0].external_id).toBe(USER_B);
  });

  it("ignores a soft deleted customer with A's email, and creates one", async () => {
    signInAsA();
    customer({ id: "cus_gone", deleted_at: "2026-09-01T00:00:00Z" });

    expect(await openSubscribe()).toEqual(new Redirected(CHECKOUT_URL));
    expect(writes()).toEqual([
      ["createCustomer", { email: EMAIL_A, external_id: USER_A }],
    ]);
    expect(polar.calls.at(-1)).toEqual(checkoutFor("cus_new_1"));
  });

  it("ties a customer holding A@REDACTNEST.COM when Clerk says a@redactnest.com", async () => {
    signInAsA();
    customer({ email: "A@REDACTNEST.COM" });

    expect(await openSubscribe()).toEqual(new Redirected(CHECKOUT_URL));
    expect(writes()).toEqual([["setExternalId", "cus_old", USER_A]]);
  });

  it("lowercases the email it searches by", async () => {
    signInAsA();
    session.email = "A@RedactNest.com";

    await openSubscribe();
    expect(polar.calls[1]).toEqual(["findCustomersByEmail", EMAIL_A]);
  });

  it("treats two live matches as a conflict, with no write", async () => {
    signInAsA();
    customer({ id: "cus_one" });
    customer({ id: "cus_two", email: "A@redactnest.com" });

    expect(await failureText()).toContain(CONFLICT_LINE);
    expect(writes()).toEqual([]);
  });

  it("lists once more after a 422 on create, and ties what it finds", async () => {
    signInAsA();
    // Another tab creates the customer just as this one tries to.
    polar.beforeCreate = () => {
      polar.beforeCreate = null;
      customer({ id: "cus_other_tab" });
    };

    expect(await openSubscribe()).toEqual(new Redirected(CHECKOUT_URL));
    expect(polar.calls.map(([op]) => op)).toEqual([
      "getStateExternal",
      "findCustomersByEmail",
      "createCustomer",
      "findCustomersByEmail",
      "setExternalId",
      "getStateExternal",
      "createCheckout",
    ]);
    expect(polar.calls.at(-1)).toEqual(checkoutFor("cus_other_tab"));
  });

  it("gives the checkout error line on a second 422", async () => {
    signInAsA();
    polar.createStatuses = [422, 422];

    expect(await failureText()).toContain(CHECKOUT_LINE);
    expect(polar.calls.filter(([op]) => op === "createCustomer")).toHaveLength(2);
    expect(polar.calls.map(([op]) => op)).not.toContain("createCheckout");
  });

  it("starts no checkout for a customer subscribed to another product, and says why", async () => {
    signInAsA();
    customer({
      external_id: USER_A,
      active_subscriptions: [{ ...PRO_SUBSCRIPTION, product_id: OTHER_PRODUCT }],
    });

    expect(await failureText()).toContain(OTHER_PRODUCT_LINE);
    expect(polar.calls).toEqual([["getStateExternal", USER_A]]);
  });

  it("makes no search, no create and no checkout with an unverified email", async () => {
    signInAsA();
    session.verification = "unverified";

    expect(await failureText()).toContain(CHECKOUT_LINE);
    expect(polar.calls).toEqual([["getStateExternal", USER_A]]);
  });

  it("sends a visitor with no session to sign in and back, and calls Polar for nothing", async () => {
    expect(await openSubscribe()).toEqual(
      new Redirected("/sign-in?redirect_url=%2Faccount%2Fsubscribe"),
    );
    expect(polar.calls).toEqual([]);
  });
});

describe("the page's other outcomes (AC-14)", () => {
  it("sends a Pro user to Account with the already on Pro notice", async () => {
    signInAsA();
    customer({
      external_id: USER_A,
      granted_benefits: [{ benefit_id: PRO_BENEFIT }],
    });

    expect(await openSubscribe()).toEqual(new Redirected("/account?notice=already-pro"));
    expect(polar.calls).toEqual([["getStateExternal", USER_A]]);
  });

  it("sends a payment still settling to the welcome page", async () => {
    signInAsA();
    customer({ external_id: USER_A, active_subscriptions: [PRO_SUBSCRIPTION] });

    expect(await openSubscribe()).toEqual(new Redirected("/account/welcome"));
    expect(polar.calls.map(([op]) => op)).not.toContain("createCheckout");
  });

  it("starts no checkout when the plan cannot be read, and says so", async () => {
    signInAsA();
    polar.stateAnswer = { id: "cus_old", granted_benefits: "unreadable" };

    expect(await failureText()).toContain(PLAN_LINE);
    expect(polar.calls.map(([op]) => op)).not.toContain("createCheckout");
  });

  it("starts no checkout when the email search fails, with the plan line", async () => {
    signInAsA();
    polar.listStatus = 500;

    expect(await failureText()).toContain(PLAN_LINE);
    expect(writes()).toEqual([]);
  });

  it("gives the checkout error line on a 422 when tying", async () => {
    signInAsA();
    customer();
    polar.updateStatus = 422;

    expect(await failureText()).toContain(CHECKOUT_LINE);
    expect(polar.calls.map(([op]) => op)).not.toContain("createCheckout");
  });

  it("names the contact address in every line that asks the visitor to write", async () => {
    signInAsA();
    customer({ external_id: USER_B });
    expect(await failureText()).toContain('href="mailto:privacy@redactnest.com"');
  });
});

describe("tying the customer (AC-25)", () => {
  /** The real fake, with the session's verified email handed in. */
  const link = (email: string | null = EMAIL_A) =>
    linkCustomer(USER_A, () => Promise.resolve(email), seams);

  it("is linked at once when the account already has its customer", async () => {
    customer({ external_id: USER_A });

    expect(await link()).toMatchObject({ kind: "linked", customerId: "cus_old" });
    expect(polar.calls).toEqual([["getStateExternal", USER_A]]);
  });

  it("is linked with no write when the match is already tied to A (a race with step 1)", async () => {
    customer({ external_id: USER_A });
    // Step 1 lost the race: another tab tied it just after Polar answered.
    const getStateExternal = vi
      .fn(seams.getStateExternal)
      .mockImplementationOnce(() =>
        Promise.reject(Object.assign(new Error("x"), { statusCode: 404 })),
      );

    const outcome = await linkCustomer(USER_A, () => Promise.resolve(EMAIL_A), {
      ...seams,
      getStateExternal,
    });

    expect(outcome).toMatchObject({ kind: "linked", customerId: "cus_old" });
    expect(writes()).toEqual([]);
  });

  it.each([401, 429, 500])(
    "is lookup-failed when step 1 answers %i, with no search",
    async (status) => {
      polar.stateStatus = status;
      expect(await link()).toEqual({ kind: "lookup-failed" });
      expect(polar.calls).toEqual([["getStateExternal", USER_A]]);
    },
  );

  it("is lookup-failed when the state has no customer id", async () => {
    polar.stateAnswer = { granted_benefits: [], active_subscriptions: [] };
    expect(await link()).toEqual({ kind: "lookup-failed" });
  });

  it.each([
    ["no items", { pagination: {} }],
    ["an item with no id", { items: [{ email: EMAIL_A }] }],
    [
      "an item with a numeric external id",
      { items: [{ id: "c", email: EMAIL_A, external_id: 7 }] },
    ],
  ])("is lookup-failed when the search answers with %s", async (_name, answer) => {
    const outcome = await linkCustomer(USER_A, () => Promise.resolve(EMAIL_A), {
      ...seams,
      findCustomersByEmail: () => Promise.resolve(answer),
    });
    expect(outcome).toEqual({ kind: "lookup-failed" });
    expect(writes()).toEqual([]);
  });

  it("treats an empty external id as untied", async () => {
    customer({ external_id: "" });
    expect(await link()).toMatchObject({ kind: "linked", customerId: "cus_old" });
    expect(writes()).toEqual([["setExternalId", "cus_old", USER_A]]);
  });

  it("is no-email when Clerk has no verified email, or asking it throws", async () => {
    expect(await link(null)).toEqual({ kind: "no-email" });
    expect(await link("  ")).toEqual({ kind: "no-email" });
    expect(
      await linkCustomer(USER_A, () => Promise.reject(new Error("clerk")), seams),
    ).toEqual({ kind: "no-email" });
    expect(polar.calls.map(([op]) => op)).not.toContain("findCustomersByEmail");
  });

  it("is write-failed when a create fails for another reason, with no second search", async () => {
    polar.createStatuses = [500];
    expect(await link()).toEqual({ kind: "write-failed" });
    expect(polar.calls.filter(([op]) => op === "findCustomersByEmail")).toHaveLength(1);
  });

  it("is write-failed when a create answers with no customer id", async () => {
    polar.createAnswer = { email: EMAIL_A };
    expect(await link()).toEqual({ kind: "write-failed" });
  });

  it("is lookup-failed when the state read after tying fails", async () => {
    customer();
    const getStateExternal = vi
      .fn(seams.getStateExternal)
      .mockImplementationOnce(() =>
        Promise.reject(Object.assign(new Error("x"), { statusCode: 404 })),
      )
      .mockImplementationOnce(() =>
        Promise.reject(Object.assign(new Error("x"), { statusCode: 500 })),
      );

    const outcome = await linkCustomer(USER_A, () => Promise.resolve(EMAIL_A), {
      ...seams,
      getStateExternal,
    });

    expect(outcome).toEqual({ kind: "lookup-failed" });
  });
});

describe("subscribe, the decision", () => {
  function deps(overrides: Partial<SubscribeDeps> = {}): SubscribeDeps {
    return {
      ...seams,
      successUrl: WELCOME_URL,
      returnUrl: PRICING_URL,
      getVerifiedEmail: () => Promise.resolve(EMAIL_A),
      ...overrides,
    };
  }

  it("asks for nothing without a user", async () => {
    const getVerifiedEmail = vi.fn(() => Promise.resolve(EMAIL_A));
    expect(await subscribe(null, deps({ getVerifiedEmail }))).toEqual({
      kind: "sign-in",
    });
    expect(getVerifiedEmail).not.toHaveBeenCalled();
    expect(polar.calls).toEqual([]);
  });

  it("is a checkout for a user with no Polar customer yet", async () => {
    expect(await subscribe(USER_A, deps())).toEqual({
      kind: "checkout",
      url: CHECKOUT_URL,
    });
  });

  it("never sends external_customer_id or customer_email with the checkout", async () => {
    await subscribe(USER_A, deps());
    const [, body] = polar.calls.at(-1) ?? [];
    expect(body).not.toHaveProperty("external_customer_id");
    expect(body).not.toHaveProperty("customer_email");
  });

  it("is checkout-failed when Polar will not start one", async () => {
    polar.checkoutStatus = 422;
    expect(await subscribe(USER_A, deps())).toEqual({ kind: "checkout-failed" });
  });

  it.each([
    ["no url", {}],
    ["an http url", { url: "http://sandbox.polar.sh/checkout/x" }],
    ["not a url", { url: "checkout" }],
  ])("is checkout-failed when Polar's answer has %s", async (_name, answer) => {
    polar.checkoutAnswer = answer;
    expect(await subscribe(USER_A, deps())).toEqual({ kind: "checkout-failed" });
  });

  it("checks Pro before a payment settling, and both before another product", async () => {
    customer({
      external_id: USER_A,
      granted_benefits: [{ benefit_id: PRO_BENEFIT }],
      active_subscriptions: [
        PRO_SUBSCRIPTION,
        { ...PRO_SUBSCRIPTION, product_id: OTHER_PRODUCT },
      ],
    });
    expect(await subscribe(USER_A, deps())).toEqual({ kind: "already-pro" });

    polar.customers[0].granted_benefits = [];
    expect(await subscribe(USER_A, deps())).toEqual({ kind: "settling" });
  });
});

describe("INV-3 on /account/billing (AC-17)", () => {
  const sessionFor = (userId: string) => [
    "createCustomerSession",
    { external_customer_id: userId, return_url: `${SITE}/account` },
  ];

  it("opens the portal for A's own customer, with the way back to Account", async () => {
    signInAsA();
    customer({ external_id: USER_A });
    customer({ id: "cus_b", email: EMAIL_B, external_id: USER_B });

    expect(await openBilling()).toEqual(new Redirected(PORTAL_URL));
    expect(polar.calls).toEqual([sessionFor(USER_A)]);
    expect(JSON.stringify(polar.calls)).not.toMatch(/bbbb|b@redactnest|cus_b/);
  });

  it("sends a visitor with no session to sign in, and calls Polar for nothing", async () => {
    customer({ id: "cus_b", email: EMAIL_B, external_id: USER_B });

    expect(await openBilling()).toEqual(new Redirected("/sign-in"));
    expect(polar.calls).toEqual([]);
  });

  it("sends A to Pricing when Polar holds no customer for A, even with B's in the query", async () => {
    signInAsA();
    customer({ id: "cus_b", email: EMAIL_B, external_id: USER_B });

    expect(await openBilling()).toEqual(new Redirected("/pricing"));
    expect(polar.calls).toEqual([sessionFor(USER_A)]);
  });

  it("never ties, creates or checks out, whatever Polar holds", async () => {
    signInAsA();
    customer();

    expect(await openBilling()).toEqual(new Redirected("/pricing"));
    expect(writes()).toEqual([]);
    expect(polar.calls.map(([op]) => op)).toEqual(["createCustomerSession"]);
  });
});

describe("the portal's other outcomes (AC-17)", () => {
  beforeEach(() => {
    signInAsA();
    customer({ external_id: USER_A });
  });

  it("sends A to Pricing on a 422", async () => {
    polar.portalStatus = 422;
    expect(await openBilling()).toEqual(new Redirected("/pricing"));
  });

  it.each([401, 403, 429, 500])(
    "says billing did not open on a %i, with Try again and the contact",
    async (status) => {
      polar.portalStatus = status;
      const text = await billingFailureText();
      expect(text).toContain(BILLING_LINE);
      expect(text).toContain('href="mailto:privacy@redactnest.com"');
      expect(text).toContain('href="/account/billing"');
      expect(text).not.toContain("checkout");
    },
  );

  it("says billing did not open when the call throws with no status", async () => {
    vi.spyOn(seams, "createCustomerSession").mockRejectedValueOnce(
      new Error("socket hang up"),
    );
    expect(await billingFailureText()).toContain(BILLING_LINE);
  });

  it.each([
    ["no url", {}],
    ["an http url", { customer_portal_url: "http://sandbox.polar.sh/portal" }],
    ["not a url", { customer_portal_url: "portal" }],
    ["nothing at all", null],
  ])("says billing did not open when Polar's answer has %s", async (_name, answer) => {
    polar.portalAnswer = answer;
    expect(await billingFailureText()).toContain(BILLING_LINE);
  });
});
