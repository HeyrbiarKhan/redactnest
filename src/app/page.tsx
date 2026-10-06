import { Check, FileMinus, ScanSearch, type LucideIcon } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";

import { config } from "@/config";
import { cx } from "@/lib/cx";
import { capLine, findsItems, HOME_TEXT, strippedItems } from "@/lib/home-text";
import { PRICING_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { FeatureList } from "@/ui/feature-list";
import { IconCircle } from "@/ui/icon-circle";
import { PageContainer } from "@/ui/page-container";

import productShot from "./product-review.png";
import { PageHeader } from "./site-nav";

/**
 * The home page. Spec 0013, AC-10 to AC-13 and AC-30: reference 04's hero
 * with a real picture of the tool, the trio, and in place of 04's "Trusted by"
 * row two cards saying what RedactNest finds and strips.
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
                    {HOME_TEXT.primary}
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

          {/*
            On the page's own canvas, inside the container, rather than a full
            width white strip: the two cards are the white (AC-11). Side by side
            and equal height from `md`, Finds first when stacked.
          */}
          <section
            aria-labelledby="home-band"
            data-testid="home-band"
            className="flex flex-col gap-6"
          >
            <h2 id="home-band" className="text-title text-ink">
              {HOME_TEXT.band.title}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              <Card data-testid="home-finds">
                <BandCardHeading icon={ScanSearch}>
                  {HOME_TEXT.band.finds.title}
                </BandCardHeading>
                <IconList>
                  {findsItems().map(({ icon: Icon, label }) => (
                    <IconListItem key={label} icon={Icon}>
                      {label}
                    </IconListItem>
                  ))}
                </IconList>
                <p className="text-ink-muted">{HOME_TEXT.band.finds.line}</p>
              </Card>

              <Card data-testid="home-strips">
                <BandCardHeading icon={FileMinus}>
                  {HOME_TEXT.band.strips.title}
                </BandCardHeading>
                <p className="text-ink-muted">{HOME_TEXT.band.strips.lead}</p>
                <IconList className="sm:grid-cols-2">
                  {strippedItems().map((item) => (
                    <IconListItem key={item} icon={Check}>
                      {item}
                    </IconListItem>
                  ))}
                </IconList>
                <p className="border-t border-border pt-4 text-small text-ink-muted">
                  {HOME_TEXT.band.strips.note}
                </p>
              </Card>
            </div>
          </section>
        </PageContainer>
      </main>
    </>
  );
}

/**
 * A band card's opening: the icon in its soft circle beside the card's `h3`,
 * as reference 01 sets each group's icon beside its name. The circle is
 * decoration (`IconCircle` hides it), so the heading is the words alone.
 */
function BandCardHeading({
  icon,
  children,
}: {
  readonly icon: LucideIcon;
  readonly children: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <IconCircle icon={icon} tone="accent" />
      <h3 className="text-heading text-ink">{children}</h3>
    </div>
  );
}

/**
 * A real list with an icon on every item. `role="list"` stays on the `ul` on
 * purpose: Safari drops a list's semantics once its bullets are removed, and
 * the count is part of what the card says (AC-11).
 */
function IconList({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <ul role="list" className={cx("grid gap-3", className)}>
      {children}
    </ul>
  );
}

/** One item: an `accent` line icon, hidden from assistive technology, then its words in `ink`. */
function IconListItem({
  icon: Icon,
  children,
}: {
  readonly icon: LucideIcon;
  readonly children: string;
}) {
  return (
    <li className="flex items-start gap-3 text-ink">
      <Icon
        aria-hidden="true"
        className="mt-0.5 size-5 shrink-0 text-accent"
        strokeWidth={1.75}
      />
      {children}
    </li>
  );
}
