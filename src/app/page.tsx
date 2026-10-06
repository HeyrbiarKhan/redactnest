import Image from "next/image";

import { config } from "@/config";
import { capLine, HOME_TEXT } from "@/lib/home-text";
import { PRICING_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { FeatureList } from "@/ui/feature-list";
import { PageContainer } from "@/ui/page-container";

import productShot from "./product-review.png";
import { PageHeader } from "./site-nav";

/**
 * The home page. Spec 0013, AC-10 to AC-13: reference 04's hero with a real
 * picture of the tool, the trio, and in place of 04's "Trusted by" row one
 * quiet band saying what RedactNest finds and strips.
 *
 * Every word in the main content comes from `src/lib/home-text.ts`; the caps
 * and whether billing is on come from `config`, read here and passed in. A
 * static server component with no client component of its own, and its
 * metadata is the layout's.
 *
 * Both ways into the tool are real page loads (`reload`), never `next/link`
 * (spec 0003, AC-21): a content security policy belongs to the document it
 * arrived with, so a client side navigation would open the tool under this
 * page's policy (INV-10). It also stops `/` prefetching `/tool`. See pricing
 * is a plain link too, so nothing prefetches it.
 *
 * The product shot is `scripts/make-brand.mjs`'s capture of the real tool on a
 * fictional document (AC-12, INV-2), served through `next/image` from our own
 * origin. A static import, so its size is known and nothing shifts as it
 * loads; eager and high priority, because it is the hero.
 */
export default function HomePage() {
  return (
    <>
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        <PageContainer width="wide" className="flex flex-col gap-16 py-14 sm:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="flex flex-col items-start gap-6">
              <div className="flex flex-col gap-4">
                <p data-testid="home-eyebrow" className="eyebrow">
                  {HOME_TEXT.eyebrow}
                </p>
                <h1 className="text-display text-balance text-ink">
                  {HOME_TEXT.headline}
                </h1>
              </div>
              <p className="max-w-2xl text-lead text-ink-muted">{HOME_TEXT.lead}</p>
              <div className="flex flex-col items-start gap-3">
                <div className="mt-2 flex flex-wrap gap-3">
                  <Button href={TOOL_PATH} reload size="lg">
                    {HOME_TEXT.redact}
                  </Button>
                  {config.billingEnabled && (
                    <Button href={PRICING_PATH} reload variant="secondary" size="lg">
                      {HOME_TEXT.pricing}
                    </Button>
                  )}
                </div>
                <p data-testid="home-caps" className="text-small text-ink-muted">
                  {capLine(config.billingEnabled, config.freePageCap, config.maxPages)}
                </p>
              </div>
            </div>

            {/* The page's one emphasised card, and the one larger shadow on the site. */}
            <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
              <Image
                src={productShot}
                alt={HOME_TEXT.shotAlt}
                sizes="(min-width: 64rem) 40rem, calc(100vw - 2rem)"
                loading="eager"
                fetchPriority="high"
                className="block h-auto w-full"
              />
            </div>
          </div>

          <FeatureList items={HOME_TEXT.features} />
        </PageContainer>

        <section
          aria-labelledby="home-band"
          data-testid="home-band"
          className="border-t border-border bg-surface"
        >
          <PageContainer width="wide" className="flex flex-col gap-6 py-14">
            <h2 id="home-band" className="text-title text-ink">
              {HOME_TEXT.band.title}
            </h2>
            <div className="grid gap-8 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <h3 className="text-heading text-ink">{HOME_TEXT.band.findsTitle}</h3>
                <p className="text-ink-muted">{HOME_TEXT.band.finds}</p>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-heading text-ink">{HOME_TEXT.band.stripsTitle}</h3>
                <p className="text-ink-muted">{HOME_TEXT.band.strips}</p>
              </div>
            </div>
          </PageContainer>
        </section>
      </main>
    </>
  );
}
