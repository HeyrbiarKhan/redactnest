import { config } from "@/config";
import { SIGN_IN_PANEL } from "@/lib/plans";
import { PRICING_PATH } from "@/lib/routes";
import { BrandLockup } from "@/ui/brand-mark";
import { Button } from "@/ui/button";

/**
 * The panel beside Clerk's card on sign in and sign up. Spec 0013, AC-23.
 *
 * What signing in is for, in our own words: Pro's cap from `config`, and that
 * the account holds an email address and never a document. From `md` the
 * lockup stands where Clerk's logo would, now that Clerk draws none. An `h2`,
 * because Clerk's card holds the page's one `h1`. See pricing is a plain link
 * (`reload`), so nothing prefetches it and Clerk's script ends with this page
 * (spec 0012, INV-10 and INV-13).
 */
export function SignInPanel() {
  return (
    <section
      aria-labelledby="sign-in-panel-title"
      data-testid="sign-in-panel"
      className="flex max-w-md flex-col items-start gap-4"
    >
      {/* Beside Clerk's card only: on a phone the header's lockup is just above. */}
      <div className="hidden md:block">
        <BrandLockup size="lg" />
      </div>
      <h2 id="sign-in-panel-title" className="text-title text-ink">
        {SIGN_IN_PANEL.title}
      </h2>
      <p className="text-lead text-ink-muted">{SIGN_IN_PANEL.line(config.maxPages)}</p>
      <Button href={PRICING_PATH} reload variant="link">
        {SIGN_IN_PANEL.pricing}
      </Button>
    </section>
  );
}
