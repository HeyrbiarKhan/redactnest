import type { ReactNode } from "react";

import { PageContainer } from "./page-container";

/**
 * The bar across the top of every page: the wordmark home, an optional nav,
 * and one optional action on the right.
 *
 * Static, never sticky (AC-14). A sticky bar covers whatever a keyboard visitor
 * just tabbed to when the page scrolls it under the header, which WCAG 2.4.11
 * counts as hiding the focus.
 *
 * The wordmark is a plain link, not `next/link`, on purpose. Leaving the tool
 * page has to be a real page load, because `pagehide` is what ends the session
 * and releases the worker (spec 0002, INV-6). A client side navigation fires no
 * `pagehide`, so the document would stay in the worker after the visitor left.
 * It also keeps the tool route from prefetching `/`, which spec 0002's request
 * test rightly counts as a request the tool page did not need.
 *
 * `nav` is the caller's (spec 0012 passes Pricing and Account there), because
 * whether those links exist depends on the build's config, which a primitive
 * never reads (spec 0003, INV-7).
 */
export function SiteHeader({
  nav,
  action,
}: {
  readonly nav?: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <header className="border-b border-border bg-surface">
      <PageContainer
        width="wide"
        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3"
      >
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a real page load, see above */}
        <a
          href="/"
          className="inline-flex min-h-10 items-center rounded-md text-heading font-bold tracking-tight text-ink"
        >
          RedactNest
        </a>
        {(nav !== undefined || action !== undefined) && (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {nav}
            {action}
          </div>
        )}
      </PageContainer>
    </header>
  );
}
