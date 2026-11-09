import { Menu } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { BrandLockup } from "./brand-mark";
import { Button } from "./button";
import { PageContainer } from "./page-container";

/** The small screen menu's id, which its button names as its `popovertarget`. */
export const SITE_MENU_ID = "site-menu";

/**
 * The open menu: a full width panel hanging from the header's bottom edge,
 * in the header's own white with a quiet rule beneath, the links stacked in
 * page order. Every rule sits behind `open:` (`:popover-open`), so none of it
 * applies while the menu is shut, nor in a browser without popovers, which
 * then shows the links in the page beneath the lockup instead.
 *
 * A popover lives in the top layer, where `absolute` places it against the
 * page's top left rather than the header's, so it scrolls with the page. It
 * hangs from the header by anchor (`anchor-name` on the header), and where
 * anchors are not supported, from the height the header has with its row on
 * one line: 0.75rem above and below a 2.5rem row, and its 1 pixel rule. The
 * user agent's own popover box (centred, `fit-content`, a border, a margin)
 * is undone here.
 */
const MENU_OPEN = cx(
  "open:absolute open:inset-x-0 open:bottom-auto open:m-0 open:h-auto open:w-auto",
  "open:top-[calc(4rem+1px)] supports-[top:anchor(bottom)]:open:top-[anchor(--site-header_bottom)]",
  "open:flex open:flex-col open:gap-1 open:px-4 open:pt-2 open:pb-4",
  // Still open once the window widens (a phone turned sideways): one row, as
  // the header's own, until it is closed.
  "sm:open:flex-row sm:open:items-center sm:open:gap-x-8 sm:open:px-6 sm:open:py-3",
  "open:border-0 open:border-b open:border-border open:bg-surface open:text-ink",
);

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
 * the right.
 *
 * Below `sm`, with a `nav`, the lockup and a menu button share one row, and the
 * nav, the account link and the action move into a menu the button opens, in
 * the same page order (feature 28, amending AC-7). The menu is the browser's
 * own popover, not a script of ours, because Pricing and the home page carry
 * no client component (spec 0012, AC-13; spec 0013, AC-13). So the browser
 * gives the button its expanded state, closes the menu on Escape or a press
 * outside it, and puts focus back on the button when Escape closes it with
 * focus inside. It never moves focus by itself: Tab goes from the button into
 * the links. From `sm` the menu has no box of its own (`display: contents`),
 * so the same links sit in the header's row as before; and if it is still open
 * when the window widens (a phone turned sideways), the button stays until it
 * is closed.
 *
 * Without a `nav` (billing off) there is no menu: the lockup takes the first
 * row alone and the rest wraps beneath it in page order, with no script.
 *
 * `nav`, `account` and `action` are the caller's, because whether Pricing and
 * Account exist depends on the build's config, which a primitive never reads
 * (spec 0003, INV-7). So are the menu button's words, `menuLabel`.
 */
export function SiteHeader({
  nav,
  menuLabel,
  account,
  action,
}: {
  readonly account?: ReactNode;
  readonly action?: ReactNode;
} & (
  | {
      readonly nav: ReactNode;
      /** The menu button's name, which it also shows beside its icon. */
      readonly menuLabel: string;
    }
  | { readonly nav?: undefined; readonly menuLabel?: undefined }
)) {
  const hasEnd = (account ?? null) !== null || (action ?? null) !== null;
  const hasMenu = (nav ?? null) !== null;

  const end = hasEnd && (
    <div
      className={cx(
        "flex gap-x-6 sm:ml-auto sm:flex-row sm:flex-wrap sm:items-center",
        // Stacked in the menu below `sm`; wrapping beneath the lockup otherwise.
        hasMenu
          ? "flex-col items-start gap-y-1 sm:gap-y-2"
          : "flex-wrap items-center gap-y-2",
      )}
    >
      {account}
      {action}
    </div>
  );

  return (
    <header className="group border-b border-border bg-surface [anchor-name:--site-header]">
      <PageContainer
        width="wide"
        className="flex flex-wrap items-center gap-x-8 gap-y-2 py-3"
      >
        <div className={hasMenu ? undefined : "w-full sm:w-auto"}>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a real page load, see above */}
          <a href="/" className="inline-flex min-h-10 items-center rounded-md">
            <BrandLockup />
          </a>
        </div>
        {hasMenu ? (
          <>
            {/*
              Shown only where popovers work, so no browser offers a button that
              does nothing; hidden from `sm` unless the menu is still open.
            */}
            <div
              className={cx(
                "ms-auto hidden supports-[selector(:popover-open)]:flex",
                "sm:hidden sm:group-has-[:popover-open]:flex",
              )}
            >
              <Button variant="secondary" icon={Menu} popoverTarget={SITE_MENU_ID}>
                {menuLabel}
              </Button>
            </div>
            <div
              id={SITE_MENU_ID}
              popover="auto"
              className={cx("w-full sm:not-open:contents", MENU_OPEN)}
            >
              {nav}
              {end}
            </div>
          </>
        ) : (
          <>
            {nav}
            {end}
          </>
        )}
      </PageContainer>
    </header>
  );
}
