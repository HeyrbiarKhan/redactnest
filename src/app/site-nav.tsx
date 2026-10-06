import { config } from "@/config";
import { cx } from "@/lib/cx";
import { LEGAL } from "@/lib/legal";
import { ACCOUNT_PATH, PRICING_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { LinkGroup } from "@/ui/link-group";
import { SiteHeader } from "@/ui/site-header";

import { FOOTER_LINK_CLASS } from "./footer-link";

/**
 * The words of the header's links and button, and of the footer's Product
 * group, in one place. Spec 0013, AC-7, AC-8 and AC-30.
 *
 * Each place that offers the tool names it its own way, so no page says the
 * same thing twice: `tryFree` is the header's button (and the 404's and
 * Pricing's Free card's, which follow it), and `redactPdf` is the footer's
 * Product link, which names the page by its title as the Legal links name
 * theirs. There is no nav item for the tool: the button is the way in.
 */
export const NAV_TEXT = Object.freeze({
  pricing: "Pricing",
  account: "Account",
  tryFree: "Try it free",
  redactPdf: "Redact a PDF",
});

/**
 * Which page the visitor is on. `"tool"` names no item (none names the tool),
 * so on `/tool` nothing is marked current, and it hides the button, which
 * would point at the page itself (AC-7).
 */
export type NavItem = "tool" | "pricing" | "account";

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
  "relative inline-flex min-h-10 items-center rounded-sm text-ink-muted",
  "underline-offset-4 not-aria-[current=page]:hover:underline",
  "aria-[current=page]:font-semibold aria-[current=page]:text-ink",
  "aria-[current=page]:after:absolute aria-[current=page]:after:inset-x-0 aria-[current=page]:after:bottom-0",
  "aria-[current=page]:after:border-b-2 aria-[current=page]:after:border-accent",
);

/** `aria-current="page"` on the current page's item, and nothing on the rest. */
function currentIf(item: NavItem, current: NavItem | undefined) {
  return item === current ? ({ "aria-current": "page" } as const) : {};
}

/**
 * The header's Site nav: Pricing, with billing on. Spec 0013, AC-7 and
 * AC-30, and spec 0012, AC-9. With billing off on this build there is nothing
 * to list, so there is no `nav` at all rather than an empty one.
 *
 * Plain links, never `next/link`, so nothing prefetches a page and `/tool`
 * sends no request beyond the entitlement (spec 0002, AC-3).
 */
export function SiteNav({ current }: { readonly current?: NavItem }) {
  if (!config.billingEnabled) return null;

  return (
    <nav aria-label="Site">
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <li>
          <a
            href={PRICING_PATH}
            className={NAV_LINK_CLASS}
            {...currentIf("pricing", current)}
          >
            {NAV_TEXT.pricing}
          </a>
        </li>
      </ul>
    </nav>
  );
}

/**
 * The header's Account link, after the nav (AC-7; spec 0012, AC-9). With
 * billing off on this build there is no account to show, so there is none.
 */
export function AccountLink({ current }: { readonly current?: NavItem }) {
  if (!config.billingEnabled) return null;

  return (
    <a href={ACCOUNT_PATH} className={NAV_LINK_CLASS} {...currentIf("account", current)}>
      {NAV_TEXT.account}
    </a>
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
 */
export function PageHeader({ current }: { readonly current?: NavItem }) {
  return (
    <SiteHeader
      nav={<SiteNav current={current} />}
      account={<AccountLink current={current} />}
      action={
        current === "tool" ? undefined : (
          <Button href={TOOL_PATH} reload>
            {NAV_TEXT.tryFree}
          </Button>
        )
      }
    />
  );
}

/**
 * The footer's Product group: Redact a PDF and, with billing on, Pricing.
 * Spec 0013, AC-8. Plain links in the same tab, underlined like every footer
 * link, so the way into `/tool` is a real page load (INV-4).
 */
export function ProductNav() {
  return (
    <LinkGroup label={LEGAL.productNavLabel}>
      <li>
        <a href={TOOL_PATH} className={FOOTER_LINK_CLASS}>
          {NAV_TEXT.redactPdf}
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
