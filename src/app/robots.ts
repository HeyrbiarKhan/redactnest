import type { MetadataRoute } from "next";

import { config } from "@/config";
import { SIGN_OUT_PATH } from "@/lib/routes";

/**
 * `/robots.txt`. Spec 0024, AC-10: every crawler may read every page but
 * `/api/`, and the file names the sitemap's absolute address.
 *
 * The account pages are left crawlable on purpose: each carries `noindex`,
 * and a crawler can only read that on a page it may fetch. Disallowing them
 * here would let a linked account page be indexed by its address alone, so
 * never add them. Static, built once.
 *
 * The one exception is `/sign-out` (spec 0026, child 0001, AC-26), which is
 * an action rather than a page: it holds nothing to index, and a crawler has
 * no business running it, so it is disallowed as well as `noindex`.
 */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", SIGN_OUT_PATH] },
    sitemap: new URL("/sitemap.xml", config.siteUrl).href,
  };
}
