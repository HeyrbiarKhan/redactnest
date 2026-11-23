import type { MetadataRoute } from "next";

import { config } from "@/config";
import {
  HOME_PATH,
  PRICING_PATH,
  PRIVACY_PATH,
  SECURITY_PATH,
  TERMS_PATH,
  TOOL_PATH,
} from "@/lib/routes";
import { SEARCH_PAGE_TEXT, SEARCH_PAGES } from "@/lib/search-pages";

/**
 * `/sitemap.xml`. Spec 0024, AC-10: every public page as an absolute address
 * on `config.siteUrl`, the search pages in `SEARCH_PAGES` order, and Pricing
 * only with billing on (with billing off `/pricing` is a 404, spec 0012,
 * AC-23). No account page and no `/api` path.
 *
 * Addresses only: no `lastmod`, because a build time date would claim a
 * change that did not happen, and no `changefreq` or `priority`, which Google
 * ignores. Static, built once.
 */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [
    HOME_PATH,
    ...SEARCH_PAGES.map((kind) => SEARCH_PAGE_TEXT[kind].path),
    TOOL_PATH,
    SECURITY_PATH,
    PRIVACY_PATH,
    TERMS_PATH,
    ...(config.billingEnabled ? [PRICING_PATH] : []),
  ];
  return paths.map((path) => ({ url: new URL(path, config.siteUrl).href }));
}
