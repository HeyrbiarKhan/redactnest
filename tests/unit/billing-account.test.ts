import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeleteAccount } from "@/app/(account)/delete-account";

/**
 * Account. Spec 0012, AC-10 and AC-11.
 *
 * The page, called as Next.js would, over a fake session and a fake Polar
 * that answers one customer state and records every call. Each case reads
 * the words the page renders: the plan, the day Pro renews or ends (a British
 * date, read in UTC), Get Pro to Pricing, Manage billing once a customer
 * exists, the plan check's failure said out loud, and Delete account with
 * the day its confirm warns of (the control itself is tested on its own).
 */

/** What `redirect` throws, so a test can see where a page sent the visitor. */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

const fake = vi.hoisted(() => {
  const store = {
    /** The customer state Polar answers, or a status it fails with. */
    state: undefined as unknown,
    status: null as number | null,
    calls: [] as string[],
  };
  const seams = {
    proBenefitId: "benefit-pro",
    proProductId: "product-pro",
    siteUrl: "https://redactnest.test",
    getStateExternal: (externalId: string) => {
      store.calls.push(externalId);
      if (store.status !== null)
        return Promise.reject(
          Object.assign(new Error(`status ${store.status}`), {
            statusCode: store.status,
          }),
        );
      return Promise.resolve(store.state);
    },
  };
  return { store, seams };
});

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ userId: session.userId }),
  currentUser: () =>
    Promise.resolve({
      primaryEmailAddress: {
        emailAddress: "a@redactnest.com",
        verification: { status: "verified" },
      },
    }),
}));
// Sign out renders on the page; it is tested on its own (AC-12).
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut: vi.fn() }) }));
vi.mock("@/config/billing", () => ({ billing: { publishableKey: "pk_test_x" } }));
vi.mock("@/billing/clients", () => ({ accountSeams: () => fake.seams }));

/** The plans' names a case swaps in, or the real ones. */
const plans = vi.hoisted(() => ({
  names: null as { readonly free: string; readonly pro: string } | null,
}));

vi.mock("@/lib/plans", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/plans")>();
  return {
    FREE_PLAN: {
      get name() {
        return plans.names?.free ?? actual.FREE_PLAN.name;
      },
    },
    PRO_PLAN: {
      ...actual.PRO_PLAN,
      get name() {
        return plans.names?.pro ?? actual.PRO_PLAN.name;
      },
    },
  };
});

const { store: polar } = fake;

const USER_A = "user_aaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PRO_GRANT = { benefit_id: "benefit-pro" };
/** As Polar writes it: microseconds, in UTC (task 1's sandbox read). */
const PERIOD_END = "2026-11-03T14:26:19.781686Z";

const proSubscription = (cancels: boolean, endsAt = PERIOD_END) => ({
  product_id: "product-pro",
  current_period_end: endsAt,
  cancel_at_period_end: cancels,
});

/** A customer state with these grants and subscriptions. */
const state = (
  granted_benefits: readonly object[],
  active_subscriptions: readonly object[] = [],
) => ({ id: "cus_a", granted_benefits, active_subscriptions });

beforeEach(() => {
  session.userId = USER_A;
  Object.assign(polar, { state: state([]), status: null, calls: [] });
  plans.names = null;
});

async function openAccount(
  query: Record<string, string> = {},
): Promise<Redirected | ReactElement> {
  const { default: AccountPage } = await import("@/app/(account)/account/page");
  const page = AccountPage as unknown as (props: unknown) => Promise<ReactElement>;
  try {
    return await page({
      params: Promise.resolve({}),
      searchParams: Promise.resolve(query),
    });
  } catch (error) {
    if (error instanceof Redirected) return error;
    throw error;
  }
}

/** The page's markup, as a signed in visitor sees it. */
async function accountText(query?: Record<string, string>): Promise<string> {
  const result = await openAccount(query);
  expect(result).not.toBeInstanceOf(Redirected);
  return renderToStaticMarkup(result as ReactElement);
}

/** The term and description pair a summary row renders. */
const row = (term: string, description: string) =>
  new RegExp(`<dt[^>]*>${term}</dt><dd[^>]*>${description}</dd>`);

describe("who Account is for", () => {
  it("sends a signed out visitor to sign in, and asks Polar nothing", async () => {
    session.userId = null;
    expect(await openAccount()).toEqual(new Redirected("/sign-in"));
    expect(polar.calls).toEqual([]);
  });

  it("asks Polar about the session's user only, whatever the address holds", async () => {
    await accountText({ external_customer_id: "user_bbbb", customer_id: "cus_b" });
    expect(polar.calls).toEqual([USER_A]);
  });

  it("shows the account's email", async () => {
    expect(await accountText()).toMatch(row("Email", "a@redactnest.com"));
  });
});

describe("the plan and its renewal (AC-10)", () => {
  it("shows Pro that renews, with the day as a British date", async () => {
    polar.state = state([PRO_GRANT], [proSubscription(false)]);
    const text = await accountText();
    expect(text).toMatch(row("Plan", "Pro"));
    expect(text).toMatch(row("Renews on", "3 November 2026"));
    expect(text).not.toContain("Ends on");
  });

  it("shows Pro set to end, with the day it ends", async () => {
    polar.state = state([PRO_GRANT], [proSubscription(true)]);
    const text = await accountText();
    expect(text).toMatch(row("Ends on", "3 November 2026"));
    expect(text).not.toContain("Renews on");
  });

  it.each([
    // 23:30 two hours behind UTC is 01:30 the next day in UTC.
    ["2026-11-03T23:30:00-02:00", "4 November 2026"],
    // Already 4 November east of UTC+4, Pakistan's zone among them.
    ["2026-11-03T20:00:00Z", "3 November 2026"],
  ])("reads %s as the day in UTC, %s, whatever the zone", async (endsAt, day) => {
    polar.state = state([PRO_GRANT], [proSubscription(false, endsAt)]);
    expect(await accountText()).toMatch(row("Renews on", day));
  });

  it.each([
    ["a benefit granted by hand, with no subscription", state([PRO_GRANT])],
    [
      "only another product's subscription",
      state([PRO_GRANT], [{ ...proSubscription(false), product_id: "product-other" }]),
    ],
    [
      "a date Polar wrote that is not a date",
      state([PRO_GRANT], [proSubscription(false, "soon")]),
    ],
  ])("shows Pro alone for %s", async (_name, answer) => {
    polar.state = answer;
    const text = await accountText();
    expect(text).toMatch(row("Plan", "Pro"));
    expect(text).not.toMatch(/Renews on|Ends on|Invalid/);
  });

  it("shows Free with no date while a payment is still settling", async () => {
    polar.state = state([], [proSubscription(false)]);
    const text = await accountText();
    expect(text).toMatch(row("Plan", "Free"));
    expect(text).not.toMatch(/Renews on|Ends on/);
  });

  /** covers: AC-13's value row. Pricing reads the same names (pricing-page.test.tsx). */
  it("names the plan from PRO_PLAN and FREE_PLAN, so Account and Pricing agree", async () => {
    plans.names = { free: "Basic", pro: "Pro Plus" };

    polar.state = state([PRO_GRANT], [proSubscription(false)]);
    expect(await accountText()).toMatch(row("Plan", "Pro Plus"));

    polar.state = state([]);
    expect(await accountText()).toMatch(row("Plan", "Basic"));
  });
});

describe("Get Pro and Manage billing (AC-10, AC-17)", () => {
  const GET_PRO = /<a [^>]*href="\/pricing"[^>]*>Get Pro<\/a>/;
  const MANAGE_BILLING = /<a [^>]*href="\/account\/billing"[^>]*>Manage billing<\/a>/;

  it("offers Get Pro, by way of Pricing, and no Manage billing with no Polar customer", async () => {
    polar.status = 404;
    const text = await accountText();
    expect(text).toMatch(row("Plan", "Free"));
    expect(text).toMatch(GET_PRO);
    expect(text).not.toContain("/account/subscribe");
    expect(text).not.toContain("Manage billing");
  });

  it("offers Manage billing to a free account that has a Polar customer", async () => {
    const text = await accountText();
    expect(text).toMatch(GET_PRO);
    expect(text).toMatch(MANAGE_BILLING);
  });

  it("offers Manage billing and no Get Pro on Pro", async () => {
    polar.state = state([PRO_GRANT], [proSubscription(false)]);
    const text = await accountText();
    expect(text).toMatch(MANAGE_BILLING);
    expect(text).not.toContain("Get Pro");
  });

  /**
   * Review 2026-10-04: Sign out first, so no sibling changing width as the
   * page loads can slide Manage billing, a working link before hydration,
   * under a pointer aimed at Sign out.
   */
  it("puts Sign out first in the action row, ahead of Get Pro and Manage billing", async () => {
    const text = await accountText();
    const signOut = text.search(/<button [^>]*>Sign out<\/button>/);
    const getPro = text.search(GET_PRO);
    const manageBilling = text.search(MANAGE_BILLING);
    expect(signOut).toBeGreaterThanOrEqual(0);
    expect(signOut).toBeLessThan(getPro);
    expect(getPro).toBeLessThan(manageBilling);
  });

  it("says when Subscribe found the account already on Pro", async () => {
    polar.state = state([PRO_GRANT]);
    expect(await accountText({ notice: "already-pro" })).toContain(
      "You&#x27;re already on Pro.",
    );
  });
});

describe("when the plan cannot be checked (AC-10)", () => {
  it.each([
    ["a 500", () => (polar.status = 500)],
    ["an unreadable answer", () => (polar.state = { granted_benefits: "unreadable" })],
  ])("says so on %s, offers to check again, and claims no plan", async (_name, fail) => {
    fail();
    const text = await accountText();
    expect(text).toContain("We couldn&#x27;t check your plan just now.");
    expect(text).toMatch(/<a [^>]*href="\/account"[^>]*>Check again<\/a>/);
    expect(text).toMatch(row("Email", "a@redactnest.com"));
    expect(text).not.toMatch(
      /Plan<\/dt>|Get Pro|Manage billing|Renews on|Ends on|Delete account/,
    );
    expect(deleteProps(await openAccount())).toBeNull();
  });
});

/** The props the page hands Delete account, or `null` when it renders none. */
function deleteProps(node: unknown): { readonly endsOn: string | null } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = deleteProps(child);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isValidElement<{ children?: unknown }>(node)) return null;
  if (node.type === DeleteAccount) return node.props as { endsOn: string | null };
  return deleteProps(node.props.children);
}

describe("Delete account (AC-11)", () => {
  const DELETE_BUTTON = /<button[^>]*>Delete account<\/button>/;

  it.each([
    ["no Polar customer", () => (polar.status = 404)],
    ["a free customer", () => (polar.state = state([]))],
    [
      "Pro that renews",
      () => (polar.state = state([PRO_GRANT], [proSubscription(false)])),
    ],
  ])("offers it for %s, with no ending day to warn of", async (_name, arrange) => {
    arrange();
    expect(await accountText()).toMatch(DELETE_BUTTON);
    expect(deleteProps(await openAccount())).toEqual({ endsOn: null });
  });

  it("hands the confirm the day Pro was set to end", async () => {
    polar.state = state([PRO_GRANT], [proSubscription(true)]);
    expect(deleteProps(await openAccount())).toEqual({ endsOn: "3 November 2026" });
  });

  it("asks nothing more of Polar to show it: the deletion checks again itself", async () => {
    polar.state = state([PRO_GRANT], [proSubscription(true)]);
    await accountText();
    expect(polar.calls).toEqual([USER_A]);
  });
});
