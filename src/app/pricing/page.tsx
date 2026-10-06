import { Check } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { config } from "@/config";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { SUBSCRIBE_PATH, TERMS_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { PageContainer } from "@/ui/page-container";

import { PageHeader } from "../site-nav";

export const metadata: Metadata = {
  title: "Pricing",
  description: `RedactNest Pro is ${PRO_PLAN.priceLine} and handles up to ${config.maxPages} pages a document. The free plan handles up to ${config.freePageCap}.`,
};

/**
 * Pricing. Spec 0012, AC-13 and INV-8.
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

          <div className="grid gap-6 md:grid-cols-2 md:items-start">
            <Card title={FREE_PLAN.name} headingLevel={2}>
              <PlanFeatures items={[`Up to ${config.freePageCap} pages a document`]} />
            </Card>

            <Card title={PRO_PLAN.name} headingLevel={2}>
              <p className="text-heading font-semibold text-ink">{PRO_PLAN.priceLine}</p>
              <PlanFeatures
                items={[
                  `Up to ${config.maxPages} pages a document`,
                  `Everything in ${FREE_PLAN.name}`,
                ]}
              />
              <Button href={SUBSCRIBE_PATH} reload className="self-start">
                Subscribe
              </Button>
              <div className="flex flex-col gap-2 text-ink-muted">
                <p>{LEGAL.merchantLine}</p>
                <p>{LEGAL.taxLine}</p>
                <p>
                  {LEGAL.subscribeNotice.beforeTerms}
                  <a href={TERMS_PATH} className="underline underline-offset-4">
                    {LEGAL.termsLabel}
                  </a>
                  {LEGAL.subscribeNotice.afterTerms}
                </p>
              </div>
            </Card>
          </div>
        </PageContainer>
      </main>
    </>
  );
}

/** A plan's lines, each with a check mark that assistive technology skips. */
function PlanFeatures({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2 text-ink">
          <Check
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-accent"
            strokeWidth={1.75}
          />
          {item}
        </li>
      ))}
    </ul>
  );
}
