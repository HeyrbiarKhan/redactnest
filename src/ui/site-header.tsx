import { Menu } from "lucide-react";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { BrandLockup } from "./brand-mark";
import { Button } from "./button";
import { PageContainer } from "./page-container";

/** The small screen menu's id, which its button names as its `popovertarget`. */
export const SITE_MENU_ID = "site-menu";

/**
 * A header action that leaves the row for the menu on a very narrow row:
 * `ROW_UNLESS_NARROW` on the row's copy, `MENU_WHEN_NARROW` on the menu's.
 * The lockup, Try it free and the menu button need about 282 pixels of row,
 * so a 320 pixel window (a 288 pixel row) kept 5 to spare and a 305 one (320
 * less a classic scrollbar) none, and Linux draws Inter a few pixels wider
 * than Windows, which wrapped the menu button to a second line on CI. Below a
 * 20.5rem row (a 360 pixel window) the action moves into the menu, which
 * leaves the lockup and the menu button about 100 pixels to spare at 305;
 * from 20.5rem the row keeps it, with 46 to spare. The query reads the row's
 * `@container` in rem, as the lockup's does, so larger text moves it too and
 * no viewport unit is read (spec 0003, INV-6; spec 0026, child 0001, AC-27).
 * Classes, not a prop, because which action moves is the caller's: the avatar
 * stays in the row at every width.
 */
export const ROW_UNLESS_NARROW = "@max-[20.5rem]:hidden";
export const MENU_WHEN_NARROW = "@min-[20.5rem]:hidden";

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
 * The bar across the top of every page: the lockup home, the caller's nav,
 * then at the right the account part (Sign in, or the account slot) and one
 * action. Spec 0026, AC-5, after `07-header.png`; spec 0013, AC-7.
 *
 * Static unless the page asks for `sticky` (spec 0003, AC-14, as the home
 * page's port of `Main.dc.html` amends it). A sticky bar can cover whatever a
 * keyboard visitor just tabbed to when the page scrolls it under the header,
 * which WCAG 2.4.11 counts as hiding the focus. So `sticky` holds only from
 * `lg`, where the row is always one 4rem line (the media query is in rem, so
 * a larger text setting or zoom drops below it and the bar scrolls away), and
 * `globals.css` gives the page a top scroll padding of that height whenever a
 * sticky header is on it (WCAG technique C43): focus by keyboard, by script or
 * by an in page link stops below the bar. The sticky bar is the mockup's
 * white at 85% over an 8 pixel backdrop blur, the white a layer at 85%
 * opacity rather than an alpha colour (spec 0003, INV-3), on the mockup's
 * lighter `muted` edge.
 *
 * The lockup is a plain link, not `next/link`, on purpose. Leaving the tool
 * page has to be a real page load, because `pagehide` is what ends the session
 * and releases the worker (spec 0002, INV-6). A client side navigation fires no
 * `pagehide`, so the document would stay in the worker after the visitor left.
 * It also keeps the tool route from prefetching `/`, which spec 0002's request
 * test rightly counts as a request the tool page did not need.
 *
 * The row is the lockup's container (`@container`), with nothing between, so
 * the lockup steps down a size when the row is narrower than 10rem. Spec 0024,
 * AC-14, *The lockup at narrow widths*.
 *
 * Below `sm`, with a `nav`, the row holds the lockup, the action and a menu
 * button, and the nav and the account part move into a menu the button opens
 * (spec 0026, child 0001, AC-27; feature 28). The menu is the browser's own
 * popover, not a script of ours, because the static pages carry no client
 * component of their own (spec 0012, AC-13; spec 0013, AC-13). So the browser
 * gives the button its expanded state, closes the menu on Escape or a press
 * outside it, puts focus back on the button when Escape closes it with focus
 * inside, and places the menu's links right after the button in the tab
 * order. It never moves focus by itself. From `sm` the menu has no box of its
 * own (`display: contents`), so the same links sit in the header's row; and
 * if it is still open when the window widens (a phone turned sideways), the
 * button stays until it is closed.
 *
 * Without a `nav` there is no menu: everything sits in the row and wraps
 * beneath the lockup when it must, with no script.
 *
 * `context` takes the nav's place in a header with no menu: `/tool`'s file
 * context while a document is open (spec 0026, child 0001, AC-30). From `sm`
 * it fills the row between the lockup and the right side; below `sm` it takes
 * a second row under the lockup, which keeps the right side beside it.
 *
 * `nav`, `context`, `account` and `action` are the caller's, because what they hold
 * depends on the build's config and on who is signed in, which a primitive
 * never reads (spec 0003, INV-7). So are the menu button's words, `menuLabel`.
 */
export function SiteHeader({
  nav,
  menuLabel,
  context,
  account,
  action,
  sticky = false,
}: {
  readonly account?: ReactNode;
  readonly action?: ReactNode;
  /** Sticky to the window's top from `lg`, over a blur (see above). */
  readonly sticky?: boolean;
} & (
  | {
      readonly nav: ReactNode;
      /** The menu button's name; the button shows its icon alone. */
      readonly menuLabel: string;
      readonly context?: undefined;
    }
  | {
      readonly nav?: undefined;
      readonly menuLabel?: undefined;
      /** In the nav's place, with no menu (see above). */
      readonly context?: ReactNode;
    }
)) {
  const hasAccount = (account ?? null) !== null;
  const hasAction = (action ?? null) !== null;
  const hasMenu = (nav ?? null) !== null;
  const hasContext = (context ?? null) !== null;

  const accountPart = hasAccount && (
    <div
      className={cx(
        "flex items-center gap-x-2 sm:ml-auto",
        // Stacked in the menu below `sm`.
        hasMenu ? "flex-col items-start sm:flex-row sm:items-center" : "flex-wrap",
      )}
    >
      {account}
    </div>
  );

  const actionPart = hasAction && (
    <div
      className={cx(
        "flex items-center",
        // Pushed right: below `sm` always (the menu holds the rest), and from
        // `sm` only when no account part sits before it.
        (hasMenu || hasContext) && "ms-auto",
        hasAccount && "sm:ms-0",
        !hasMenu && !hasAccount && "sm:ms-auto",
      )}
    >
      {action}
    </div>
  );

  return (
    <header
      data-sticky={sticky ? "" : undefined}
      className={cx(
        "group border-b bg-surface [anchor-name:--site-header]",
        sticky
          ? cx(
              "border-muted lg:sticky lg:top-0 lg:z-20 lg:bg-transparent lg:backdrop-blur-sm",
              "lg:before:absolute lg:before:inset-0 lg:before:-z-10 lg:before:bg-surface lg:before:opacity-85",
            )
          : "border-border",
      )}
    >
      {/*
        10 pixels between the parts, Sign in to the action included, and 40
        from the lockup to the nav, as `Main.dc.html` spaces them, from `md`.
        Narrower, the row tightens so it holds on one line: 16 pixels from the
        lockup to the nav between `sm` and `md` (the nav's links 16 apart too),
        so 640 pixels keeps 20 to spare, and 8 between the parts below `sm`,
        so the lockup, Try it free and the menu button fit 320 (spec 0026,
        AC-5 and child 0001, AC-27; feature 28).
      */}
      <PageContainer
        width="wide"
        className="@container flex flex-wrap items-center gap-x-2 gap-y-2 py-3 sm:gap-x-2.5"
      >
        <div
          className={
            hasMenu || hasContext
              ? "sm:me-1.5 md:me-7.5"
              : "w-full sm:me-1.5 sm:w-auto md:me-7.5"
          }
        >
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a real page load, see above */}
          <a href="/" className="inline-flex min-h-10 items-center rounded-item">
            <BrandLockup />
          </a>
        </div>
        {hasMenu ? (
          <>
            <div
              id={SITE_MENU_ID}
              popover="auto"
              className={cx(
                // No box of its own from `sm` while shut: the browser's popover
                // box (fixed, bordered, padded) would otherwise apply.
                "w-full sm:not-open:contents",
                MENU_OPEN,
              )}
            >
              {nav}
              {accountPart}
            </div>
            {actionPart}
            {/*
              Shown only where popovers work, so no browser offers a button that
              does nothing; hidden from `sm` unless the menu is still open.
            */}
            <div
              className={cx(
                "hidden supports-[selector(:popover-open)]:flex",
                !hasAction && "ms-auto",
                "sm:hidden sm:group-has-[:popover-open]:flex",
              )}
            >
              {/*
                Icon only, as the mockup's phone header draws it, so the
                lockup, the action and the button share one row at 320
                pixels; the caller's words stay its name (spec 0026, AC-27).
              */}
              <Button
                variant="secondary"
                size="icon"
                icon={Menu}
                popoverTarget={SITE_MENU_ID}
              >
                <span className="sr-only">{menuLabel}</span>
              </Button>
            </div>
          </>
        ) : (
          <>
            {nav}
            {hasContext && (
              <div className="order-last flex w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
                {context}
              </div>
            )}
            {accountPart}
            {actionPart}
          </>
        )}
      </PageContainer>
    </header>
  );
}
