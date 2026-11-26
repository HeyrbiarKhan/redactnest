import { afterEach, describe, expect, it, vi } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { config } from "@/config";

/**
 * The sitemap and the robots file. Spec 0024, AC-10: every public page as an
 * absolute address on `config.siteUrl`, Pricing only with billing on, no
 * account page, no `/api` path and no date; every crawler everywhere but
 * `/api/`, the account pages left crawlable so their `noindex` can be read.
 * `config` is mocked for billing, because the Playwright build runs with it on.
 */

const mocks = vi.hoisted(() => ({ billingEnabled: true }));

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

afterEach(() => {
  mocks.billingEnabled = true;
});

const at = (path: string) => new URL(path, config.siteUrl).href;

describe("the sitemap", () => {
  /** covers: AC-10 */
  it("lists every public page, the search pages in order, Pricing last with billing on", () => {
    expect(sitemap()).toEqual(
      [
        "/",
        "/redact-pdf",
        "/remove-text-from-pdf",
        "/black-box-redaction",
        "/tool",
        "/security",
        "/privacy",
        "/terms",
        "/pricing",
      ].map((path) => ({ url: at(path) })),
    );
  });

  /** covers: AC-10. With billing off `/pricing` is a 404, so it is not listed. */
  it("leaves Pricing out with billing off", () => {
    mocks.billingEnabled = false;

    expect(sitemap().map(({ url }) => url)).not.toContain(at("/pricing"));
    expect(sitemap()).toHaveLength(8);
  });

  /** covers: AC-10 */
  it("names no account page, no /api path, and no date, frequency or priority", () => {
    for (const entry of sitemap()) {
      expect(Object.keys(entry)).toEqual(["url"]);
      const { pathname, origin } = new URL(entry.url);
      expect(origin).toBe(new URL(config.siteUrl).origin);
      expect(pathname).not.toMatch(/^\/(account|sign-in|sign-up|sign-out|api)(\/|$)/);
    }
  });
});

describe("the robots file", () => {
  /** covers: AC-10 */
  it("allows every crawler everywhere but /api/ and /sign-out, and names the sitemap's address", () => {
    expect(robots()).toEqual({
      rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/sign-out"] },
      sitemap: at("/sitemap.xml"),
    });
  });

  /** covers: AC-10. The account pages carry `noindex`, which a crawler must be let read. */
  it("never disallows the account pages", () => {
    expect(JSON.stringify(robots().rules)).not.toMatch(/account|sign-in|sign-up/);
  });
});
