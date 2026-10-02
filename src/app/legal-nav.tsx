import { LEGAL } from "@/lib/legal";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/routes";

import { FOOTER_LINK_CLASS } from "./footer-link";

/**
 * The footer's Legal nav, on every page, `/tool` included. Spec 0011, AC-4.
 *
 * Plain links in the same tab, so on `/tool` following one is a real page load
 * and spec 0007's leave warning still guards ticked work. Every word comes from
 * `src/lib/legal.ts` and every path from `src/lib/routes.ts` (INV-4).
 *
 * A list with no separators and no `p`, so the footer's one paragraph is still
 * the licence notice (`shell.spec.ts` reads `footer.locator("p")`). The layout
 * places it before that notice, as one item of the footer's wrapping row.
 */
export function LegalNav() {
  return (
    <nav aria-label={LEGAL.legalNavLabel}>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        <li>
          <a href={PRIVACY_PATH} className={FOOTER_LINK_CLASS}>
            {LEGAL.privacyLabel}
          </a>
        </li>
        <li>
          <a href={TERMS_PATH} className={FOOTER_LINK_CLASS}>
            {LEGAL.termsLabel}
          </a>
        </li>
      </ul>
    </nav>
  );
}
