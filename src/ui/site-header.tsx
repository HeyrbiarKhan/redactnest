import type { ReactNode } from "react";

import { BrandLockup } from "./brand-mark";
import { PageContainer } from "./page-container";

/**
 * The bar across the top of every page: the lockup home, then the caller's
 * nav, Account link and one action, in that page order. Spec 0013, AC-7.
 *
 * Static, never sticky (spec 0003, AC-14). A sticky bar covers whatever a
 * keyboard visitor just tabbed to when the page scrolls it under the header,
 * which WCAG 2.4.11 counts as hiding the focus.
 *
 * The lockup is a plain link, not `next/link`, on purpose. Leaving the tool
 * page has to be a real page load, because `pagehide` is what ends the session
 * and releases the worker (spec 0002, INV-6). A client side navigation fires no
 * `pagehide`, so the document would stay in the worker after the visitor left.
 * It also keeps the tool route from prefetching `/`, which spec 0002's request
 * test rightly counts as a request the tool page did not need.
 *
 * From `sm` everything sits on one row with the account link and the action at
 * the right. Below it the lockup takes the first row alone and the rest wraps
 * onto the rows beneath, still in page order, so focus never moves back up the
 * screen. No menu and no script: a phone gets every link one tap away.
 *
 * `nav`, `account` and `action` are the caller's, because whether Pricing and
 * Account exist depends on the build's config, which a primitive never reads
 * (spec 0003, INV-7).
 */
export function SiteHeader({
  nav,
  account,
  action,
}: {
  readonly nav?: ReactNode;
  readonly account?: ReactNode;
  readonly action?: ReactNode;
}) {
  const hasEnd = (account ?? null) !== null || (action ?? null) !== null;

  return (
    <header className="border-b border-border bg-surface">
      <PageContainer
        width="wide"
        className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3"
      >
        <div className="w-full sm:w-auto">
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a real page load, see above */}
          <a href="/" className="inline-flex min-h-10 items-center rounded-md">
            <BrandLockup />
          </a>
        </div>
        {nav}
        {hasEnd && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 sm:ml-auto">
            {account}
            {action}
          </div>
        )}
      </PageContainer>
    </header>
  );
}
