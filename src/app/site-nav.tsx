import { config } from "@/config";
import { cx } from "@/lib/cx";
import { LEGAL } from "@/lib/legal";
import {
  HOW_IT_WORKS_PATH,
  PRICING_PATH,
  SECURITY_PATH,
  SIGN_IN_PATH,
  TOOL_PATH,
} from "@/lib/routes";
import { SEARCH_PAGE_TEXT, SEARCH_PAGES } from "@/lib/search-pages";
import { Button } from "@/ui/button";
import { LinkGroup } from "@/ui/link-group";
import { SiteHeader } from "@/ui/site-header";

import { FOOTER_LINK_CLASS } from "./footer-link";

/**
 * The words of the header's links and buttons, and of the footer's Product
 * group, in one place. Spec 0013, AC-7, AC-8 and AC-30; spec 0026, AC-5.
 *
 * Each place that offers the tool names it its own way, so no page says the
 * same thing twice: `tryFree` is the header's button (and the 404's and
 * Pricing's Free card's, which follow it), and `redactPdf` is the footer's
 * Product link, which names the page by its title as the Legal links name
 * theirs. There is no nav item for the tool: the button is the way in.
 * `menu` names the button that holds the nav on a small screen (feature 28).
 * `security` is the header's and the footer's link to the security page,
 * named by its title (spec 0018, AC-2). `howItWorks` is the header's link to
 * the home page's section of that name, and `signIn` the header's way to sign
 * in, a plain link (spec 0026, AC-5).
 */
export const NAV_TEXT = Object.freeze({
  howItWorks: "How it works",
  pricing: "Pricing",
  signIn: "Sign in",
  tryFree: "Try it free",
  redactPdf: "Redact a PDF",
  security: "Security",
  menu: "Menu",
});

/**
 * Which page the visitor is on. `"tool"` names no item (none names the tool),
 * so on `/tool` nothing is marked current, and it hides the button, which
 * would point at the page itself (AC-7), and the How it works link, which
 * `/tool`'s header leaves out (spec 0026, child 0001, AC-30). `"account"`
 * names no item either since the Account link moved into the account menu
 * (child 0001, AC-23).
 */
export type NavItem = "tool" | "pricing" | "security" | "account";

/**
 * A header link: `ink-muted` at rest, underlined on hover, and when it names
 * the current page, semibold `ink` with a 2 pixel `accent` bar beneath. At
 * least 40 pixels tall (AC-7).
 *
 * No underline at rest, the one exception to spec 0003 INV-8 that spec 0013
 * makes: these sit in a labelled nav row, outside running text, so WCAG 1.4.1
 * does not apply, and the current page is marked by the bar, the weight and
 * `aria-current` as well as colour. The bar is a border on a pseudo element, so
 * forced colours mode repaints it in the system's text colour rather than
 * dropping it as it would a background.
 */
const NAV_LINK_CLASS = cx(
  "relative inline-flex min-h-10 items-center rounded-item text-small font-medium text-ink-muted",
  "underline-offset-4 transition-[color] hover:text-ink not-aria-[current=page]:hover:underline",
  "aria-[current=page]:font-semibold aria-[current=page]:text-ink",
  "aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-0 aria-[current=page]:after:bottom-0",
  "aria-[current=page]:after:border-b-2 aria-[current=page]:after:border-accent",
);

/** `aria-current="page"` on the current page's item, and nothing on the rest. */
function currentIf(item: NavItem, current: NavItem | undefined) {
  return item === current ? ({ "aria-current": "page" } as const) : {};
}

/**
 * The header's Site nav: How it works, Security and, with billing on,
 * Pricing (spec 0026, AC-5; spec 0012, AC-9). How it works is the home page's
 * section, so it names no current page; `/tool`'s header leaves it out
 * (child 0001, AC-30). There is no Guides item: the guides are in the footer.
 *
 * Plain links, never `next/link`, so nothing prefetches a page and `/tool`
 * sends no request beyond the entitlement (spec 0002, AC-3).
 *
 * A column below `sm`, where it shows only in the header's menu, and a row
 * from `sm`, in the header's own row (feature 28).
 */
export function SiteNav({ current }: { readonly current?: NavItem }) {
  return (
    <nav aria-label="Site">
      <ul className="flex flex-col items-start gap-x-4 gap-y-1 sm:flex-row sm:flex-wrap sm:items-center md:gap-x-7">
        {current !== "tool" && (
          <li>
            <a href={HOW_IT_WORKS_PATH} className={NAV_LINK_CLASS}>
              {NAV_TEXT.howItWorks}
            </a>
          </li>
        )}
        <li>
          <a
            href={SECURITY_PATH}
            className={NAV_LINK_CLASS}
            {...currentIf("security", current)}
          >
            {NAV_TEXT.security}
          </a>
        </li>
        {config.billingEnabled && (
          <li>
            <a
              href={PRICING_PATH}
              className={NAV_LINK_CLASS}
              {...currentIf("pricing", current)}
            >
              {NAV_TEXT.pricing}
            </a>
          </li>
        )}
      </ul>
    </nav>
  );
}

/**
 * The header's Sign in, signed out with billing on (spec 0026, AC-5). A
 * `ghost` button drawn as a plain `a` (`reload`), never `next/link`, so
 * nothing prefetches an account page and every way into the `(account)` group
 * is a full page load (spec 0012, INV-10 and INV-13). With billing off there
 * is no account to sign in to, so there is none.
 */
export function SignInLink() {
  if (!config.billingEnabled) return null;

  return (
    <Button href={SIGN_IN_PATH} reload variant="ghost">
      {NAV_TEXT.signIn}
    </Button>
  );
}

/**
 * The header every page shows, with `current` naming the page's own item.
 *
 * The primary "Try it free" button is on every page but `/tool`, where it
 * would point at the page itself and the page's own `h1` names the tool. It is
 * a real page load (`reload`), never `next/link`, so the tool opens under its
 * own content security policy (spec 0003, INV-10); on `/tool` every header
 * link is a real page load too, so spec 0007's leave warning still guards
 * ticked work.
 *
 * The nav is on every build, so on a small screen the header always folds it
 * into a menu (feature 28), with Sign in beside it there when billing is on
 * (spec 0026, child 0001, AC-27).
 *
 * `sticky` is the home page's: the bar stays at the window's top from `lg`,
 * as `Main.dc.html` draws it (`SiteHeader` says how focus stays clear of it).
 * Never on `/tool`, where nothing but the action panel is sticky (spec 0026,
 * AC-12).
 */
export function PageHeader({
  current,
  sticky = false,
}: {
  readonly current?: NavItem;
  readonly sticky?: boolean;
}) {
  const action =
    current === "tool" ? undefined : (
      <Button href={TOOL_PATH} reload>
        {NAV_TEXT.tryFree}
      </Button>
    );

  return (
    <SiteHeader
      nav={<SiteNav current={current} />}
      menuLabel={NAV_TEXT.menu}
      account={config.billingEnabled ? <SignInLink /> : undefined}
      action={action}
      sticky={sticky}
    />
  );
}

/**
 * The footer's Product group: Redact a PDF, Security and, with billing on,
 * Pricing. Spec 0013, AC-8, with the security page spec 0018 adds (AC-2).
 * Plain links in the same tab, underlined like every footer link, so the way
 * into `/tool` is a real page load (INV-4), and on `/tool` following one is a
 * real page load too, so spec 0007's leave warning still guards ticked work.
 */
export function ProductNav() {
  return (
    <LinkGroup label={LEGAL.productNavLabel}>
      <li>
        <a href={TOOL_PATH} className={FOOTER_LINK_CLASS}>
          {NAV_TEXT.redactPdf}
        </a>
      </li>
      <li>
        <a href={SECURITY_PATH} className={FOOTER_LINK_CLASS}>
          {NAV_TEXT.security}
        </a>
      </li>
      {config.billingEnabled && (
        <li>
          <a href={PRICING_PATH} className={FOOTER_LINK_CLASS}>
            {NAV_TEXT.pricing}
          </a>
        </li>
      )}
    </LinkGroup>
  );
}

/**
 * The footer's Guides group: the search pages, in `SEARCH_PAGES` order, each
 * by its `navLabel`. Spec 0024, AC-9, amending spec 0013's AC-8: on every
 * page, `/tool` included, between Product and Legal. Plain links in the same
 * tab, underlined and at least 24 pixels tall like every footer link
 * (`FOOTER_LINK_CLASS`), so on `/tool` following one is a real page load and
 * spec 0007's leave warning still guards ticked work. A list with no `p`, so
 * the footer's one paragraph is still the licence notice.
 */
export function GuidesNav() {
  return (
    <LinkGroup label={LEGAL.guidesNavLabel}>
      {SEARCH_PAGES.map((kind) => (
        <li key={kind}>
          <a href={SEARCH_PAGE_TEXT[kind].path} className={FOOTER_LINK_CLASS}>
            {SEARCH_PAGE_TEXT[kind].navLabel}
          </a>
        </li>
      ))}
    </LinkGroup>
  );
}
