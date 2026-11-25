import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { config } from "@/config";
import { PRO_PLAN } from "@/lib/plans";
import { PageContainer } from "@/ui/page-container";

import { PricingCards } from "../pricing-cards";
import { PageHeader } from "../site-nav";

export const metadata: Metadata = {
  title: "Pricing",
  description: `RedactNest Pro is ${PRO_PLAN.priceLine} and handles up to ${config.maxPages} pages a document. The free plan handles up to ${config.freePageCap}.`,
};

/**
 * Pricing. Spec 0012, AC-13 and INV-8, laid out as spec 0013 amends it
 * (AC-22): today's title and lead, then the two plans as `PricingCards`, the
 * same cards the home page shows (spec 0026, AC-10).
 *
 * A prerendered static page under the standard policy, with no client
 * component and no outside script. It promises only what Pro does today, and
 * every cap comes from `config`, the price and plan names from
 * `src/lib/plans.ts`, and every seller and agreement word from
 * `src/lib/legal.ts` (INV-9). Subscribe is a plain link, never `next/link`, so
 * nothing prefetches the page that starts a checkout (INV-10).
 *
 * With billing off on this build there is no Pro to sell, so there is no page.
 */
export default function PricingPage() {
  if (!config.billingEnabled) notFound();

  return (
    <>
      <PageHeader current="pricing" />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex-1 py-10 focus:outline-none sm:py-14">
        <PageContainer width="wide" className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h1 className="text-title text-ink">Pricing</h1>
            <p className="max-w-2xl text-lead text-ink-muted">
              Every plan redacts in your own browser, and your document never leaves your
              machine.
            </p>
          </div>

          <PricingCards headingLevel={2} />
        </PageContainer>
      </main>
    </>
  );
}
