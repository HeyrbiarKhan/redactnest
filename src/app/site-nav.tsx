import { config } from "@/config";
import { ACCOUNT_PATH, PRICING_PATH } from "@/lib/routes";

/**
 * The header's Pricing and Account links, on every page, `/tool` included.
 * Spec 0012, AC-9, AC-23 and INV-10.
 *
 * Plain links, never `next/link`, so nothing prefetches an account page and
 * `/tool` sends no request beyond the entitlement (spec 0002, AC-3). On `/tool`
 * a plain link is a real page load, so spec 0007's leave warning still guards
 * ticked work. With billing off on this build there is no Pro and no account
 * to show, so there are no links.
 */
export function SiteNav() {
  if (!config.billingEnabled) return null;

  return (
    <nav aria-label="Site">
      <ul className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <li>
          <a href={PRICING_PATH} className={HEADER_LINK_CLASS}>
            Pricing
          </a>
        </li>
        <li>
          <a href={ACCOUNT_PATH} className={HEADER_LINK_CLASS}>
            Account
          </a>
        </li>
      </ul>
    </nav>
  );
}

/** At least 24 pixels tall (WCAG 2.5.8), underlined like every link (spec 0003, INV-8). */
const HEADER_LINK_CLASS =
  "inline-flex min-h-10 items-center rounded-sm text-ink underline underline-offset-4 hover:decoration-2";
