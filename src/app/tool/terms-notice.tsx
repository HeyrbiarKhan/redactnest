import { cx } from "@/lib/cx";
import { LEGAL } from "@/lib/legal";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/routes";

import { FOOTER_LINK_CLASS } from "../footer-link";

/**
 * The line under the full drop zone: choosing a PDF is agreeing to the terms.
 * Spec 0011, AC-5.
 *
 * Plain links in the same tab, sized as the footer's are, so each is a 24
 * pixel target and following one with ticked work still raises spec 0007's
 * leave warning. It sits outside the polite live region, so it is read once
 * with the page and never announced again, and the caller drops it once the
 * file bar replaces the drop zone. Every word comes from `src/lib/legal.ts`
 * and every path from `src/lib/routes.ts` (INV-4).
 */
export function TermsNotice({ className }: { readonly className?: string }) {
  const { beforeTerms, betweenLinks, afterPrivacy } = LEGAL.toolNotice;

  return (
    <p data-testid="terms-notice" className={cx("text-small text-ink-muted", className)}>
      {beforeTerms}
      <a href={TERMS_PATH} className={FOOTER_LINK_CLASS}>
        {LEGAL.termsLabel}
      </a>
      {betweenLinks}
      <a href={PRIVACY_PATH} className={FOOTER_LINK_CLASS}>
        {LEGAL.privacyLabel}
      </a>
      {afterPrivacy}
    </p>
  );
}
