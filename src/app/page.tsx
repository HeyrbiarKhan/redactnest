import { Check, FileMinus, Info, ScanSearch, type LucideIcon } from "lucide-react";
import Image from "next/image";

import { config } from "@/config";
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
            and equal height from `md`, Finds first when stacked. Their
            proportion and spacing follow your mockup,
            `docs/design/references/05-finds-and-strips.png`, read at its true
            scale (it is this page at 1280 pixels, drawn at 1.5x).
          */}
          <section
            aria-labelledby="home-band"
            data-testid="home-band"
            className="flex flex-col gap-7"
          >
            <h2 id="home-band" className="text-title text-ink">
              {HOME_TEXT.band.title}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {/* The query container for the Finds columns below. */}
              <Card data-testid="home-finds" spacious className="@container">
                <BandCardHeader
                  icon={ScanSearch}
                  title={HOME_TEXT.band.finds.title}
                  subtitle={HOME_TEXT.band.finds.subtitle}
                />
                <BandRows items={findsItems()} />
                <BandCardClose>{HOME_TEXT.band.finds.line}</BandCardClose>
              </Card>

              {/* The query container for the Strips columns below. */}
              <Card data-testid="home-strips" spacious className="@container">
                <BandCardHeader
                  icon={FileMinus}
                  title={HOME_TEXT.band.strips.title}
                  subtitle={HOME_TEXT.band.strips.subtitle}
                />
                {/* Each stripped kind on the same row as a detector, a check on its tile. */}
                <BandRows
                  items={strippedItems().map((label) => ({ icon: Check, label }))}
                />
                <BandCardClose>{HOME_TEXT.band.strips.note}</BandCardClose>
              </Card>
            </div>
          </section>
        </PageContainer>
      </main>
    </>
  );
}

/**
 * A band card's opening: the icon on its soft square tile beside the card's
 * `h3` and, under it, the subtitle. The tile is decoration (`IconCircle` hides
 * it), so the heading is the words alone. Each card's list keeps
 * `role="list"` on its `ul` on purpose: Safari drops a list's semantics once
 * its bullets are removed, and the count is part of what the card says
 * (AC-11).
 */
function BandCardHeader({
  icon,
  title,
  subtitle,
}: {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly subtitle: string;
}) {
  return (
    <div className="flex items-center gap-5">
      <IconCircle icon={icon} tone="accent" size="lg" shape="square" />
      <div className="flex flex-col gap-1">
        <h3 className="text-heading text-ink">{title}</h3>
        <p className="text-small text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * A band card's list: each item in its own soft row, its icon on a square
 * tile beside its words. Finds and Strips draw the same row (feature 26), so
 * the two cards read as one pair and, with seven items each, stand the same
 * height. Nothing here acts: no chevron, no link, no tab stop and no hover
 * change, so the cursor rule leaves it the arrow (AC-33). `canvas`, not
 * `subtle`, which is the checklist's hover tint and would make a row look
 * pressable.
 *
 * One list, so a screen reader hears the seven together. Once the card's own
 * content is 26rem wide the rows take two columns 12 pixels apart, the rows'
 * own spacing, read down the first, then the second. The card is the query
 * container, never the window, because from `md` to about 1020 pixels it sits
 * beside the other card and is too narrow for two. The two cards are always
 * the same width, so both lists fold together. A row never splits across the
 * columns, and in rem, so at 200% text the list stays one column.
 */
function BandRows({
  items,
}: {
  readonly items: readonly { readonly icon: LucideIcon; readonly label: string }[];
}) {
  return (
    <ul
      role="list"
      className="flex flex-col gap-3 @min-[26rem]:block @min-[26rem]:columns-2 @min-[26rem]:gap-x-3"
    >
      {items.map(({ icon, label }) => (
        <li
          key={label}
          className="flex break-inside-avoid items-center gap-5 rounded-xl bg-canvas px-3 py-2.5 font-semibold text-ink @min-[26rem]:not-last:mb-3"
        >
          <IconCircle icon={icon} tone="accent" shape="square" />
          {label}
        </li>
      ))}
    </ul>
  );
}

/**
 * A band card's close: a `border` rule across the card, then an `accent` info
 * icon, hidden from assistive technology, beside the card's closing line.
 */
function BandCardClose({ children }: { readonly children: string }) {
  return (
    <div className="flex items-center gap-3 border-t border-border pt-5">
      <Info
        aria-hidden="true"
        className="size-7 shrink-0 text-accent"
        strokeWidth={1.75}
      />
      <p className="text-small text-ink-muted">{children}</p>
    </div>
  );
}
