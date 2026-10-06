import { config } from "@/config";
import { cx } from "@/lib/cx";
import { LEGAL } from "@/lib/legal";
import { ACCOUNT_PATH, PRICING_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { FooterGroup } from "@/ui/footer-group";
import { SiteHeader } from "@/ui/site-header";

import { FOOTER_LINK_CLASS } from "./footer-link";

/**
 * The words of the header's links and button, and of the footer's Product
 * group, in one place. Spec 0013, AC-7 and AC-8.
 */
export const NAV_TEXT = Object.freeze({
  redact: "Redact",
  pricing: "Pricing",
  account: "Account",
  redactPdf: "Redact a PDF",
});

/** Which header item names the page the visitor is on. */
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
 * The header's Site nav: Redact and, with billing on, Pricing. Spec 0013,
 * AC-7, and spec 0012, AC-9.
 *
 * Plain links, never `next/link`, so nothing prefetches a page and `/tool`
 * sends no request beyond the entitlement (spec 0002, AC-3). Every way into
 * `/tool` is a real page load, so the tool opens under its own content
 * security policy (spec 0003, INV-10); on `/tool` a plain link is a real page
 * load too, so spec 0007's leave warning still guards ticked work.
 */
export function SiteNav({ current }: { readonly current?: NavItem }) {
  return (
    <nav aria-label="Site">
      <ul className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <li>
          <a href={TOOL_PATH} className={NAV_LINK_CLASS} {...currentIf("tool", current)}>
            {NAV_TEXT.redact}
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
 * The primary "Redact a PDF" button is on every page but `/tool`, where it
 * would point at the page itself. It is a real page load (`reload`), never
 * `next/link` (spec 0003, INV-10).
 */
export function PageHeader({ current }: { readonly current?: NavItem }) {
  return (
    <SiteHeader
      nav={<SiteNav current={current} />}
      account={<AccountLink current={current} />}
      action={
        current === "tool" ? undefined : (
          <Button href={TOOL_PATH} reload>
            {NAV_TEXT.redactPdf}
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
    <FooterGroup label={LEGAL.productNavLabel}>
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
    </FooterGroup>
  );
}
