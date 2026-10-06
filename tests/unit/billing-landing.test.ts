import { isValidElement, type ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  CLERK_REDIRECT_PARAMS,
  landingAfterSignIn,
  pagePath,
  type SearchParams,
} from "@/app/(account)/landing";

/**
 * Where Clerk lands after signing in or up, and the clean redirect that sheds
 * Clerk's other redirect parameters. Spec 0012, AC-8 and INV-13: Subscribe
 * when Subscribe sent the visitor, as a path or as an absolute URL on the
 * site's own origin, Account otherwise, and never anywhere else.
 */

const SITE = "https://redactnest.test";
const SUBSCRIBE = "/account/subscribe";
const ACCOUNT = "/account";

/** What `redirect` throws, so a test can see where a page sent the visitor. */
class Redirected extends Error {
  constructor(readonly to: string) {
    super(`redirect to ${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("@clerk/nextjs", () => ({ SignIn: () => null, SignUp: () => null }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: () => Promise.resolve({ isAuthenticated: false }),
}));
vi.mock("@/config", () => ({ config: { siteUrl: "https://redactnest.test" } }));
vi.mock("@/config/billing", () => ({ billing: { publishableKey: "pk_test_x" } }));

const landing = (params: SearchParams) => landingAfterSignIn(params, SITE).landing;
const clean = (params: SearchParams) => landingAfterSignIn(params, SITE).clean;

describe("the landing", () => {
  it.each([
    ["the Subscribe path", SUBSCRIBE],
    ["Subscribe as an absolute URL on the site's origin", `${SITE}${SUBSCRIBE}`],
  ])("goes on to Subscribe for %s", (_name, value) => {
    expect(landing({ redirect_url: value })).toBe(SUBSCRIBE);
  });

  it.each([
    ["nothing", undefined],
    ["an empty value", ""],
    ["the tool", "/tool"],
    ["the home page", "/"],
    ["another account page", "/account/billing"],
    ["Subscribe on another origin", `https://evil.example${SUBSCRIBE}`],
    ["Subscribe on the site's origin over http", `http://redactnest.test${SUBSCRIBE}`],
    ["Subscribe with a query", `${SUBSCRIBE}?x=1`],
    ["Subscribe with a fragment", `${SUBSCRIBE}#top`],
    ["the absolute form with a query", `${SITE}${SUBSCRIBE}?x=1`],
    ["a protocol relative address", "//elsewhere.example/account/subscribe"],
    ["a repeated parameter", [SUBSCRIBE, "/tool"]],
  ])("goes to Account for %s", (_name, value) => {
    expect(landing({ redirect_url: value })).toBe(ACCOUNT);
  });
});

describe("Clerk's other redirect parameters", () => {
  it("lists exactly the six AC-8 names", () => {
    expect([...CLERK_REDIRECT_PARAMS].sort()).toEqual(
      [
        "after_sign_in_url",
        "after_sign_up_url",
        "sign_in_fallback_redirect_url",
        "sign_in_force_redirect_url",
        "sign_up_fallback_redirect_url",
        "sign_up_force_redirect_url",
      ].sort(),
    );
  });

  const REFUSED: readonly [string, string | string[]][] = [
    ["the tool", "/tool"],
    ["Pricing", "/pricing"],
    ["another origin", `https://evil.example${ACCOUNT}`],
    ["an empty value", ""],
    ["an array", [ACCOUNT, SUBSCRIBE]],
  ];

  for (const name of CLERK_REDIRECT_PARAMS) {
    it.each(REFUSED)(
      `calls for the clean redirect when ${name} holds %s`,
      (_n, value) => {
        expect(clean({ [name]: value })).toBe("");
      },
    );

    it.each([SUBSCRIBE, ACCOUNT, `${SITE}${SUBSCRIBE}`, `${SITE}${ACCOUNT}`])(
      `lets ${name} holding our own landing %s through`,
      (value) => {
        expect(clean({ [name]: value })).toBeNull();
      },
    );
  }

  it("calls for nothing with none of them present", () => {
    expect(clean({})).toBeNull();
    expect(clean({ redirect_url: "/tool", __clerk_db_jwt: "dvb_x" })).toBeNull();
  });

  it("keeps Subscribe as the Subscribe path when redirect_url named it", () => {
    expect(
      landingAfterSignIn(
        { redirect_url: `${SITE}${SUBSCRIBE}`, sign_in_force_redirect_url: "/pricing" },
        SITE,
      ),
    ).toEqual({ landing: SUBSCRIBE, clean: "?redirect_url=%2Faccount%2Fsubscribe" });
  });

  it("drops redirect_url when it named anything else", () => {
    expect(clean({ redirect_url: "/tool", sign_up_force_redirect_url: "/tool" })).toBe(
      "",
    );
  });

  it("keeps every unrelated parameter, repeated ones included", () => {
    expect(
      clean({
        __clerk_db_jwt: "dvb_x",
        after_sign_in_url: "/pricing",
        __clerk_handshake: ["one", "two"],
      }),
    ).toBe("?__clerk_db_jwt=dvb_x&__clerk_handshake=one&__clerk_handshake=two");
  });
});

describe("the page's own path", () => {
  it("is the base with no segments", () => {
    expect(pagePath("/sign-in", undefined)).toBe("/sign-in");
    expect(pagePath("/sign-in", [])).toBe("/sign-in");
  });

  it("rebuilds a sub path, each segment encoded again", () => {
    expect(pagePath("/sign-in", ["factor-one"])).toBe("/sign-in/factor-one");
    expect(pagePath("/sign-up", ["verify", "a b"])).toBe("/sign-up/verify/a%20b");
  });
});

describe("the pages", () => {
  type Page = (props: unknown) => Promise<ReactElement<Record<string, unknown>>>;

  async function open(
    which: "sign-in" | "sign-up",
    segments: string[] | undefined,
    params: SearchParams,
  ): Promise<Redirected | ReactElement<Record<string, unknown>>> {
    const loaded =
      which === "sign-in"
        ? await import("@/app/(account)/sign-in/[[...sign-in]]/page")
        : await import("@/app/(account)/sign-up/[[...sign-up]]/page");
    const page = loaded.default as unknown as Page;
    try {
      return await page({
        params: Promise.resolve({ [which]: segments }),
        searchParams: Promise.resolve(params),
      });
    } catch (error) {
      if (error instanceof Redirected) return error;
      throw error;
    }
  }

  /**
   * The props of Clerk's card, wherever the page places it: spec 0013 sets it
   * inside the account shell (AC-23), so the page's own element is the shell.
   */
  function clerkCard(
    element: Redirected | ReactElement<Record<string, unknown>>,
  ): Record<string, unknown> {
    expect(element).not.toBeInstanceOf(Redirected);
    const found = findElement(
      element as ReactElement<Record<string, unknown>>,
      (props) => "forceRedirectUrl" in props,
    );
    expect(found).not.toBeNull();
    return found?.props ?? {};
  }

  it("has sign in force the landing, and sign up's too, every time", async () => {
    for (const [params, expected] of [
      [{ redirect_url: `${SITE}${SUBSCRIBE}` }, SUBSCRIBE],
      [{ redirect_url: "/tool" }, ACCOUNT],
    ] as const) {
      const element = await open("sign-in", undefined, params);
      expect(clerkCard(element)).toMatchObject({
        forceRedirectUrl: expected,
        signUpForceRedirectUrl: expected,
      });
    }
  });

  it("has sign up force the landing, and sign in's too, every time", async () => {
    const element = await open("sign-up", undefined, { redirect_url: SUBSCRIBE });
    expect(clerkCard(element)).toMatchObject({
      forceRedirectUrl: SUBSCRIBE,
      signInForceRedirectUrl: SUBSCRIBE,
    });
  });

  /** Spec 0013, AC-32: the status line under the card names the same landing. */
  it("gives the signing in line the landing Clerk is forced to, on both pages", async () => {
    for (const page of ["sign-in", "sign-up"] as const) {
      for (const [params, expected] of [
        [{ redirect_url: SUBSCRIBE }, SUBSCRIBE],
        [{}, ACCOUNT],
      ] as const) {
        const element = await open(page, undefined, params);
        expect(element).not.toBeInstanceOf(Redirected);
        const status = findElement(element, (props) => "landing" in props);
        expect(status?.props.landing, `${page} ${JSON.stringify(params)}`).toBe(expected);
        expect(clerkCard(element).forceRedirectUrl).toBe(expected);
      }
    }
  });

  it("redirects sign in to the same step without the refused parameter", async () => {
    expect(
      await open("sign-in", ["factor-one"], {
        sign_in_force_redirect_url: "/pricing",
        redirect_url: SUBSCRIBE,
        __clerk_db_jwt: "dvb_x",
      }),
    ).toEqual(
      new Redirected(
        "/sign-in/factor-one?__clerk_db_jwt=dvb_x&redirect_url=%2Faccount%2Fsubscribe",
      ),
    );
  });

  it("redirects sign up to itself without the refused parameter", async () => {
    expect(await open("sign-up", undefined, { after_sign_up_url: "/tool" })).toEqual(
      new Redirected("/sign-up"),
    );
  });
});

/** The first element in a tree whose props pass the test, depth first. */
function findElement(
  node: unknown,
  test: (props: Record<string, unknown>) => boolean,
): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, test);
      if (found !== null) return found;
    }
    return null;
  }
  if (!isValidElement<Record<string, unknown>>(node)) return null;
  if (test(node.props)) return node;
  return findElement(node.props.children, test);
}
