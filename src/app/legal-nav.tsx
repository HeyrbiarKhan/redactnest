import { LEGAL } from "@/lib/legal";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/routes";
import { LinkGroup } from "@/ui/link-group";

import { FOOTER_LINK_CLASS } from "./footer-link";

/**
 * The footer's Legal group, on every page, `/tool` included. Spec 0011, AC-4,
 * laid out as one of spec 0013's footer groups (AC-8).
 *
 * Plain links in the same tab, so on `/tool` following one is a real page load
 * and spec 0007's leave warning still guards ticked work. Every word comes from
 * `src/lib/legal.ts` and every path from `src/lib/routes.ts` (INV-4).
 *
 * A list with no separators and no `p`, so the footer's one paragraph is still
 * the licence notice (`shell.spec.ts` reads `footer.locator("p")`), which the
 * layout places after every group.
 */
export function LegalNav() {
  return (
    <LinkGroup label={LEGAL.legalNavLabel}>
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
    </LinkGroup>
  );
}
