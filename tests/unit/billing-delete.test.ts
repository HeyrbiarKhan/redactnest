import { beforeEach, describe, expect, it, vi } from "vitest";

import { deleteAccount, type DeleteDeps } from "@/billing/delete";

/**
 * Delete account. Spec 0012, AC-11, INV-3 and INV-5.
 *
 * Every branch of the decision behind the confirm, over a fake Polar and a
 * fake Clerk that record every call: the refusals read from the customer
 * state, Polar before Clerk, a 404 from either counted as done, and each
 * failure stopping where it should. Then the server action itself, with the
 * same session cases INV-3 asks of Subscribe and Manage billing: Polar and
 * Clerk only ever hear the session's own user, and with no session nothing.
 */

const fake = vi.hoisted(() => {
  const store = {
    /** The customer state Polar answers, or a status its lookup fails with. */
    state: undefined as unknown,
    stateStatus: null as number | null,
    /** Statuses the deletes fail with, Polar's as `statusCode`, Clerk's as `status`. */
    customerStatus: null as number | null,
    userStatus: null as number | null,
    calls: [] as unknown[][],
  };
  const fail = (key: "statusCode" | "status", code: number) =>
    Promise.reject(Object.assign(new Error(`status ${code}`), { [key]: code }));
  const seams = {
    proBenefitId: "benefit-pro",
    proProductId: "product-pro",
    getStateExternal: (externalId: string) => {
      store.calls.push(["getStateExternal", externalId]);
      if (store.stateStatus !== null) return fail("statusCode", store.stateStatus);
      return Promise.resolve(store.state);
    },
    deleteCustomer: (externalId: string, query: { readonly anonymize: boolean }) => {
      store.calls.push(["deleteCustomer", externalId, { ...query }]);
      if (store.customerStatus !== null) return fail("statusCode", store.customerStatus);
      return Promise.resolve(undefined);
    },
    deleteUser: (userId: string) => {
      store.calls.push(["deleteUser", userId]);
      if (store.userStatus !== null) return fail("status", store.userStatus);
      return Promise.resolve({ id: userId, deleted: true });
    },
  };
  return { store, seams };
});

const session = vi.hoisted(() => ({
  userId: null as string | null,
  billingOn: true,
  authCalls: 0,
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: () => {
    session.authCalls += 1;
    return Promise.resolve({ userId: session.userId });
  },
}));
vi.mock("@/billing/clients", () => ({
  accountSeams: () => (session.billingOn ? fake.seams : null),
}));

const { store: world, seams } = fake;

const USER_A = "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PRO_GRANT = { benefit_id: "benefit-pro" };
const PERIOD_END = "2026-11-03T14:26:19.781686Z";

const proSubscription = (cancels: boolean) => ({
  product_id: "product-pro",
  status: "active",
  current_period_end: PERIOD_END,
  cancel_at_period_end: cancels,
});
const otherSubscription = {
  product_id: "product-other",
  status: "active",
  current_period_end: PERIOD_END,
  cancel_at_period_end: false,
};

/** A customer state with these grants and subscriptions. */
const state = (
  granted_benefits: readonly object[],
  active_subscriptions: readonly object[] = [],
) => ({ id: "cus_a", granted_benefits, active_subscriptions });

const DELETES = [
  ["deleteCustomer", USER_A, { anonymize: true }],
  ["deleteUser", USER_A],
];

beforeEach(() => {
  Object.assign(world, {
    state: state([]),
    stateStatus: null,
    customerStatus: null,
    userStatus: null,
    calls: [],
  });
  Object.assign(session, { userId: USER_A, billingOn: true, authCalls: 0 });
});

const run = (userId: string | null = USER_A, deps: DeleteDeps = seams) =>
  deleteAccount(userId, deps);

describe("who can delete", () => {
  it("with no session, asks Polar and Clerk nothing", async () => {
    expect(await run(null)).toEqual({ kind: "sign-in" });
    expect(world.calls).toEqual([]);
  });
});

describe("what deletion removes (AC-11)", () => {
  it("deletes the Polar customer by external id with anonymize, then the Clerk user", async () => {
    expect(await run()).toEqual({ kind: "deleted" });
    expect(world.calls).toEqual([["getStateExternal", USER_A], ...DELETES]);
  });

  it("deletes Pro that is set to end", async () => {
    world.state = state([PRO_GRANT], [proSubscription(true)]);
    expect(await run()).toEqual({ kind: "deleted" });
    expect(world.calls.slice(1)).toEqual(DELETES);
  });

  it("still asks Polar to delete when the state found no customer, and takes its 404 as done", async () => {
    world.stateStatus = 404;
    world.customerStatus = 404;
    expect(await run()).toEqual({ kind: "deleted" });
    expect(world.calls).toEqual([["getStateExternal", USER_A], ...DELETES]);
  });

  it("takes Clerk's 404 as done", async () => {
    world.userStatus = 404;
    expect(await run()).toEqual({ kind: "deleted" });
  });

  it("finishes on a second try after Clerk failed: no customer left, then the user", async () => {
    world.userStatus = 500;
    expect(await run()).toEqual({ kind: "sign-in-kept" });

    // Polar's delete cleared the external id, so the next state is a 404.
    Object.assign(world, { stateStatus: 404, customerStatus: 404, userStatus: null });
    world.calls = [];
    expect(await run()).toEqual({ kind: "deleted" });
    expect(world.calls).toEqual([["getStateExternal", USER_A], ...DELETES]);
  });
});

describe("the refusals (AC-11)", () => {
  it.each([
    ["Pro set to renew", state([PRO_GRANT], [proSubscription(false)])],
    [
      "a payment still settling, with no benefit yet",
      state([], [proSubscription(false)]),
    ],
    [
      "a second subscription to Pro that renews behind one set to end",
      state([PRO_GRANT], [proSubscription(true), proSubscription(false)]),
    ],
  ])("refuses for %s, and deletes nothing", async (_name, answer) => {
    world.state = answer;
    expect(await run()).toEqual({ kind: "renewing" });
    expect(world.calls).toEqual([["getStateExternal", USER_A]]);
  });

  it.each([
    ["on its own", state([], [otherSubscription])],
    [
      "beside Pro set to end",
      state([PRO_GRANT], [proSubscription(true), otherSubscription]),
    ],
  ])(
    "refuses while another product's subscription is active, %s",
    async (_name, answer) => {
      world.state = answer;
      expect(await run()).toEqual({ kind: "other-product" });
      expect(world.calls).toEqual([["getStateExternal", USER_A]]);
    },
  );

  it("puts the renewal refusal first when both apply", async () => {
    world.state = state([PRO_GRANT], [proSubscription(false), otherSubscription]);
    expect(await run()).toEqual({ kind: "renewing" });
  });

  // Polar's customer state lists only `active` and `trialing` subscriptions,
  // so a payment being retried (`past_due`) shows as the benefit alone, the
  // same as a benefit granted by hand. AC-11's retry refusal has no source
  // there; task 12 leaves it open with /architect.
  it.todo("refuses while a payment to Pro is being retried");
});

describe("the failures (AC-11)", () => {
  it.each([
    ["a 500", () => (world.stateStatus = 500)],
    ["a 429", () => (world.stateStatus = 429)],
    ["an unreadable answer", () => (world.state = { granted_benefits: "unreadable" })],
    [
      "a subscription to Pro whose renewal cannot be read",
      () =>
        (world.state = state(
          [PRO_GRANT],
          [{ ...proSubscription(true), cancel_at_period_end: "maybe" }],
        )),
    ],
  ])("removes nothing when the state lookup gives %s", async (_name, fail) => {
    fail();
    expect(await run()).toEqual({ kind: "billing-failed" });
    expect(world.calls).toEqual([["getStateExternal", USER_A]]);
  });

  it("removes nothing when Polar's delete fails, and never reaches Clerk", async () => {
    world.customerStatus = 500;
    expect(await run()).toEqual({ kind: "billing-failed" });
    expect(world.calls.map(([name]) => name)).toEqual([
      "getStateExternal",
      "deleteCustomer",
    ]);
  });

  it("says the sign in stayed when Clerk fails after Polar", async () => {
    world.userStatus = 500;
    expect(await run()).toEqual({ kind: "sign-in-kept" });
    expect(world.calls.slice(1)).toEqual(DELETES);
  });

  it("does not read Polar's status field on a Clerk failure as a 404", async () => {
    const deleteUser = () =>
      Promise.reject(Object.assign(new Error("odd"), { statusCode: 404 }));
    expect(await run(USER_A, { ...seams, deleteUser })).toEqual({ kind: "sign-in-kept" });
  });
});

describe("the server action (INV-3)", () => {
  async function action() {
    const { deleteAccountAction } = await import("@/app/(account)/account/actions");
    return deleteAccountAction();
  }

  it("deletes the session's own user, and only that user", async () => {
    expect(await action()).toBe("deleted");
    for (const [, id] of world.calls) expect(id).toBe(USER_A);
    expect(world.calls).toEqual([["getStateExternal", USER_A], ...DELETES]);
  });

  it("with no session, answers sign in and asks Polar and Clerk nothing", async () => {
    session.userId = null;
    expect(await action()).toBe("sign-in");
    expect(world.calls).toEqual([]);
  });

  it("with billing off, removes nothing and asks no session", async () => {
    session.billingOn = false;
    expect(await action()).toBe("billing-failed");
    expect(session.authCalls).toBe(0);
    expect(world.calls).toEqual([]);
  });

  it("passes a refusal through as its kind", async () => {
    world.state = state([PRO_GRANT], [proSubscription(false)]);
    expect(await action()).toBe("renewing");
  });
});
