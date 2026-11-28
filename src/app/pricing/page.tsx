import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { config } from "@/config";
import { LEGAL } from "@/lib/legal";
import { PRO_PLAN, pricingQuestions } from "@/lib/plans";
import { TERMS_PATH } from "@/lib/routes";
import { PageContainer } from "@/ui/page-container";

import { PricingCards } from "../pricing-cards";
import { QuestionList } from "../question-list";
import { PageHeader } from "../site-nav";

export const metadata: Metadata = {
  title: "Pricing",
  description: `RedactNest Pro is ${PRO_PLAN.priceLine} and handles up to ${config.maxPages} pages a document. The free plan handles up to ${config.freePageCap}.`,
};

/**
 * Pricing. Spec 0012, AC-13 and INV-8, laid out as spec 0013 amends it
 * (AC-22): today's title and lead, then the two plans as `PricingCards`, the
 * same cards the home page shows (spec 0026, AC-10), then the questions (the
 * marketing brief of 2026-11-28, item 6).
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

          {/*
            The questions (the marketing brief of 2026-11-28, item 6), below
            the cards and the billing notes under Pro's, in the home page's
            pattern (`QuestionList`): disclosures, the first open. Every cap
            from `config`, every word from `src/lib/plans.ts`, and the refund
            answer's link to the terms by `LEGAL.termsLabel` and `TERMS_PATH`,
            drawn as the notes' own link is.
          */}
          <section
            aria-labelledby="pricing-questions"
            data-testid="pricing-questions"
            className="flex max-w-205 flex-col gap-4"
          >
            <h2 id="pricing-questions" className="text-heading text-ink">
              Questions
            </h2>
            <QuestionList
              items={pricingQuestions(config.freePageCap, config.maxPages).map(
                ({ question, answer, terms }) => ({
                  question,
                  answer:
                    terms === undefined ? (
                      answer
                    ) : (
                      <>
                        {answer} {terms.before}
                        <a href={TERMS_PATH} className="underline underline-offset-4">
                          {LEGAL.termsLabel}
                        </a>
                        {terms.after}
                      </>
                    ),
                }),
              )}
            />
          </section>
        </PageContainer>
      </main>
    </>
  );
}
