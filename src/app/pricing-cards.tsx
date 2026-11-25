import { Check } from "lucide-react";

import { config } from "@/config";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PLAN_BADGE, PRO_PLAN } from "@/lib/plans";
import { SUBSCRIBE_PATH, TERMS_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

import { NAV_TEXT } from "./site-nav";

/**
 * Each plan's lines, every cap from `config` (spec 0012, INV-9). Exported so
 * the home page's words test can read them as the cards say them.
 */
export function planLines(): { readonly free: string[]; readonly pro: string[] } {
  return {
    free: [`Up to ${config.freePageCap} pages a document`],
    pro: [
      `Up to ${config.maxPages} pages a document`,
      // Spec 0017, AC-26: Pro does this now, its cap from config.
      `Custom terms: up to ${config.maxCustomTerms} names, numbers or phrases, found wherever they appear`,
      `Everything in ${FREE_PLAN.name}`,
    ],
  };
}

/**
 * The two plans as cards, side by side from `md`: one component for `/` and
 * `/pricing` (spec 0026, AC-10; spec 0013, AC-22). Free offers the tool, a
 * real page load (`reload`, spec 0003, INV-10). Pro carries the "Most useful"
 * badge and the accent edge, which only mark it: Pro is named in its heading,
 * so nothing rests on the colour. Subscribe is a plain link, never
 * `next/link`, so nothing prefetches the page that starts a checkout (spec
 * 0012, INV-10), with who takes the payment, the tax and the terms under it.
 *
 * Every cap comes from `config`, the price and plan names from
 * `src/lib/plans.ts`, and every seller and agreement word from
 * `src/lib/legal.ts`, so no number is written here. The caller shows it only
 * with billing on.
 */
export function PricingCards({ headingLevel }: { readonly headingLevel: 2 | 3 }) {
  const lines = planLines();
  return (
    // `grid-cols-1` (a `minmax(0, 1fr)` column), never the implicit `auto`
    // one, which grows to the widest card's content and scrolled `/pricing`
    // sideways at 320 pixels with 200% text (spec 0026, Follow-up).
    <div
      data-testid="pricing-cards"
      className="grid grid-cols-1 gap-6 wrap-break-word md:grid-cols-2 md:items-start"
    >
      <Card title={FREE_PLAN.name} headingLevel={headingLevel}>
        <PlanFeatures items={lines.free} />
        <Button href={TOOL_PATH} reload variant="secondary" className="self-start">
          {NAV_TEXT.tryFree}
        </Button>
      </Card>
      <Card
        title={PRO_PLAN.name}
        headingLevel={headingLevel}
        accent
        badge={
          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-small font-medium text-accent-strong">
            {PLAN_BADGE}
          </span>
        }
      >
        <p className="text-title text-ink">{PRO_PLAN.priceLine}</p>
        <PlanFeatures items={lines.pro} />
        {/* A one word label may break, only where it cannot fit (320 pixels, 200% text). */}
        <Button href={SUBSCRIBE_PATH} reload className="self-start wrap-anywhere">
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
          {/* Its own box, so a word wider than a narrow card can break. */}
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ul>
  );
}
