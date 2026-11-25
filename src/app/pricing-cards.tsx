import { Check } from "lucide-react";

import { config } from "@/config";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PLAN_BADGE, PRO_PLAN } from "@/lib/plans";
import { PRICING_PATH, SUBSCRIBE_PATH, TERMS_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

import { NAV_TEXT } from "./site-nav";

/**
 * Each plan's lines, every cap from `config` (spec 0012, INV-9). Exported so
 * the home page's words test can read them as the cards say them.
 */
export function planLines(): {
  readonly free: string[];
  readonly pro: string[];
  readonly proSummary: string;
} {
  return {
    free: [`Up to ${config.freePageCap} pages a document`],
    // The home page's one line for Pro (`Main.dc.html`): its two caps, the
    // pages and the terms, each from config.
    proSummary: `Up to ${config.maxPages} pages, plus up to ${config.maxCustomTerms} custom terms`,
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
 *
 * `summary` is the home page's form (the owner's port of `Main.dc.html`,
 * 2026-11-25): two equal cards, each its name, its price large and one line,
 * then a full width button. Free's opens the tool; Pro's reads "Get Pro" and
 * opens Pricing, a plain link, so the seller, tax and terms lines stay on
 * Pricing beside Subscribe (spec 0012, AC-13).
 */
export function PricingCards({
  headingLevel,
  summary = false,
  getPro,
}: {
  readonly headingLevel: 2 | 3;
  readonly summary?: boolean;
  /** The summary Pro card's button, the caller's words. */
  readonly getPro?: string;
}) {
  const lines = planLines();
  if (summary) {
    return <SummaryCards headingLevel={headingLevel} getPro={getPro ?? PRO_PLAN.name} />;
  }
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

/**
 * The home page's two plan cards (`Main.dc.html`): 16 pixel corners, 28 in
 * from the edge, 16 between parts, side by side and equal from `md`. Pro's
 * accent edge and teal shadow only mark it, as its heading names it.
 */
function SummaryCards({
  headingLevel,
  getPro,
}: {
  readonly headingLevel: 2 | 3;
  readonly getPro: string;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const lines = planLines();
  const card = "flex flex-col gap-4 rounded-panel bg-surface p-7";
  return (
    <div
      data-testid="pricing-cards"
      className="grid grid-cols-1 gap-6 wrap-break-word md:grid-cols-2"
    >
      <section className={`${card} border border-border shadow-card`}>
        <Heading className="text-copy font-semibold text-ink">{FREE_PLAN.name}</Heading>
        <p className="text-price text-ink">{FREE_PLAN.price}</p>
        {/* It takes any spare height, so both buttons rest at the foot. */}
        <p className="grow text-copy text-ink-muted">{lines.free[0]}</p>
        <Button
          href={TOOL_PATH}
          reload
          variant="secondary"
          size="md"
          fullWidth
          className="mt-2"
        >
          {NAV_TEXT.tryFree}
        </Button>
      </section>
      <section className={`${card} border-[1.5px] border-accent shadow-plan`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading className="text-copy font-semibold text-ink">{PRO_PLAN.name}</Heading>
          <span className="rounded-full bg-accent-faint px-2.5 py-0.75 text-small font-semibold text-accent-strong">
            {PLAN_BADGE}
          </span>
        </div>
        <p className="text-price text-ink">
          {PRO_PLAN.price}
          <span className="text-copy font-medium tracking-normal text-ink-subtle">
            {" "}
            {PRO_PLAN.per}
          </span>
        </p>
        <p className="grow text-copy text-ink-muted">{lines.proSummary}</p>
        {/* A plain link, so nothing prefetches Pricing (spec 0012, INV-13). */}
        <Button href={PRICING_PATH} reload size="md" fullWidth className="mt-2">
          {getPro}
        </Button>
      </section>
    </div>
  );
}
