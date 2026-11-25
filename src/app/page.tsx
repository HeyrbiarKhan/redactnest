import {
  ArrowRight,
  Check,
  FileCheck,
  FileMinus,
  FileUp,
  Info,
  ScanSearch,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";

import { config } from "@/config";
import {
  capLine,
  findsItems,
  HOME_BAND_ID,
  HOME_TEXT,
  NETWORK_ROWS,
  strippedItems,
} from "@/lib/home-text";
import { LEGAL } from "@/lib/legal";
import { sectionId } from "@/lib/policy-sections";
import { HOME_PATH, HOW_IT_WORKS_ID, SECURITY_PATH, TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { CoverFigure } from "@/ui/cover-figure";
import { IconCircle } from "@/ui/icon-circle";
import { PageContainer } from "@/ui/page-container";

import productShot from "./product-review.png";
import { PricingCards } from "./pricing-cards";
import { PageHeader } from "./site-nav";

/**
 * `/`'s own head (spec 0024, AC-11): the site line as its description, the
 * same words as the root layout's fallback, and a canonical to the root of
 * `config.siteUrl` (through the layout's `metadataBase`). The title stays the
 * layout's default, "RedactNest".
 */
export const metadata: Metadata = {
  description: HOME_TEXT.siteLine,
  alternates: { canonical: HOME_PATH },
};

/**
 * The `WebSite` block for search engines (AC-11): the trading name and the
 * site's address, through `JSON.stringify` with every `<` escaped, so no
 * value can close the element. A data block (`application/ld+json`), which
 * the browser never runs, so the standard policy needs no change; the one
 * script element any page in spec 0024 adds.
 */
const WEBSITE_JSON_LD = JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: LEGAL.tradingName,
  url: config.siteUrl,
}).replaceAll("<", "\\u003c");

/** The security page's account of the check, which the black box section links to. */
const CHECK_HREF = `${SECURITY_PATH}#${sectionId("theCheck")}`;

/** The security page's way to check for yourself, which the network band links to. */
const CHECK_IT_HREF = `${SECURITY_PATH}#${sectionId("checkIt")}`;

/**
 * The home page, in spec 0026 AC-8's order: the hero with a real picture of
 * the tool, How it works, the black box comparison, what RedactNest looks for
 * and strips, then a closing band.
 *
 * Every word in the main content comes from `src/lib/home-text.ts`; the caps
 * and whether billing is on come from `config`, read here and passed in. A
 * static server component with no client component of its own, and its
 * title is the layout's.
 *
 * Every way into the tool is a real page load (`reload`), never `next/link`
 * (spec 0003, AC-21): a content security policy belongs to the document it
 * arrived with, so a client side navigation would open the tool under this
 * page's policy (INV-10). It also stops `/` prefetching `/tool`.
 *
 * The product shot is `scripts/make-brand.mjs`'s capture of the real tool on a
 * fictional document (spec 0013, AC-12, INV-2), served through `next/image`
 * from our own origin. A static import, so its size is known and nothing
 * shifts as it loads; eager and high priority, because it is the hero.
 */
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: WEBSITE_JSON_LD }}
      />
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        <PageContainer width="wide" className="py-14 sm:py-20">
          <div
            data-testid="home-hero"
            className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
          >
            {/*
              At 320 pixels with 200% text the headline's longest word is wider
              than the column (spec 0024, AC-14). `min-w-0` and `max-w-full`
              stop that word setting the column's width, and the headline
              breaks it only when it cannot fit a line alone, so every wider
              screen sets the headline as before.
            */}
            <div className="flex min-w-0 flex-col items-start gap-6">
              <div className="flex max-w-full flex-col gap-5">
                {/* The eyebrow chip (spec 0026, AC-8): a check on its tile, then the words. */}
                <p
                  data-testid="home-eyebrow"
                  className="inline-flex max-w-full items-center gap-2 self-start rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-small font-medium text-ink-muted"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
                  >
                    <Check className="size-4" strokeWidth={2.25} />
                  </span>
                  <span className="min-w-0 wrap-break-word">{HOME_TEXT.eyebrow}</span>
                </p>
                <h1 className="text-display text-balance text-ink wrap-break-word">
                  {HOME_TEXT.headline}
                </h1>
              </div>
              <p className="max-w-2xl text-lead text-ink-muted">{HOME_TEXT.lead}</p>
              <div className="flex flex-col items-start gap-3">
                <div className="mt-2 flex flex-wrap gap-3">
                  <Button href={TOOL_PATH} reload size="lg">
                    {HOME_TEXT.primary}
                  </Button>
                  {/* An anchor on this page, so a plain link. */}
                  <Button
                    href={`#${HOW_IT_WORKS_ID}`}
                    reload
                    variant="secondary"
                    size="lg"
                  >
                    {HOME_TEXT.howItWorks}
                  </Button>
                </div>
                <p data-testid="home-caps" className="text-small text-ink-muted">
                  {capLine(config.billingEnabled, config.freePageCap, config.maxPages)}
                </p>
              </div>
            </div>

            {/*
              The product shot in a window frame, the page's one larger shadow,
              with the small card beside it from `lg` (spec 0026, AC-8). Below
              `lg` the card sits under the frame, in the flow.
            */}
            <div className="relative flex flex-col gap-4 lg:pb-8">
              <div className="overflow-hidden rounded-card border border-border bg-surface shadow-window">
                <div
                  aria-hidden="true"
                  className="flex items-center gap-1.5 border-b border-border bg-subtle px-4 py-3"
                >
                  {[0, 1, 2].map((dot) => (
                    <span key={dot} className="size-2.5 rounded-full bg-border" />
                  ))}
                </div>
                <Image
                  src={productShot}
                  alt={HOME_TEXT.shotAlt}
                  sizes="(min-width: 64rem) 40rem, calc(100vw - 2rem)"
                  loading="eager"
                  fetchPriority="high"
                  className="block h-auto w-full"
                />
              </div>
              <p
                data-testid="home-shot-card"
                className="flex max-w-full items-center gap-3 self-start rounded-card border border-border bg-surface px-4 py-3 font-semibold text-ink shadow-card lg:absolute lg:bottom-0 lg:-left-6"
              >
                <IconCircle icon={ShieldCheck} tone="accent" />
                <span className="min-w-0 wrap-break-word">{HOME_TEXT.shotCard}</span>
              </p>
            </div>
          </div>
        </PageContainer>

        <section
          id={HOW_IT_WORKS_ID}
          aria-labelledby={`${HOW_IT_WORKS_ID}-title`}
          data-testid="home-steps"
          className="border-t border-border"
        >
          <PageContainer width="wide" className="flex flex-col gap-10 py-16 sm:py-20">
            <SectionHead
              id={`${HOW_IT_WORKS_ID}-title`}
              eyebrow={HOME_TEXT.steps.eyebrow}
              title={HOME_TEXT.steps.title}
              centred
            />
            <ol
              role="list"
              className="grid grid-cols-1 gap-6 wrap-break-word md:grid-cols-3"
            >
              {HOME_TEXT.steps.items.map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-card"
                >
                  <div
                    aria-hidden="true"
                    className="flex min-h-36 items-center justify-center border-b border-border bg-subtle p-3 sm:p-6"
                  >
                    <StepDrawing index={index} />
                  </div>
                  <div className="flex flex-col gap-2 p-6">
                    <p aria-hidden="true" className="text-small text-ink-muted">
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="text-heading text-ink">{step.title}</h3>
                    <p className="text-ink-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </PageContainer>
        </section>

        <section
          aria-labelledby="home-black-box"
          data-testid="home-black-box"
          className="border-y border-border bg-subtle"
        >
          <PageContainer
            width="wide"
            className="grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]"
          >
            <div className="flex min-w-0 flex-col gap-5">
              <SectionHead
                id="home-black-box"
                eyebrow={HOME_TEXT.blackBox.eyebrow}
                title={HOME_TEXT.blackBox.title}
              />
              <p className="max-w-xl text-ink-muted">{HOME_TEXT.blackBox.body}</p>
              <a
                href={CHECK_HREF}
                className="inline-flex min-h-6 items-center gap-1 self-start rounded-item font-medium text-accent-strong underline decoration-1 underline-offset-4"
              >
                {HOME_TEXT.blackBox.link}
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </a>
            </div>
            <CoverFigure
              panels={HOME_TEXT.blackBox.panels}
              caption={HOME_TEXT.blackBox.caption}
              className="min-w-0"
            />
          </PageContainer>
        </section>

        <PageContainer width="wide" className="flex flex-col gap-16 py-16 sm:py-20">
          {/*
            On the page's own canvas, inside the container, rather than a full
            width white strip: the two cards are the white (AC-11). Side by side
            and equal height from `md`, Looks for first when stacked. Their
            proportion and spacing follow your mockup,
            `docs/design/references/05-finds-and-strips.png`, read at its true
            scale (it is this page at 1280 pixels, drawn at 1.5x).
          */}
          <section
            aria-labelledby={HOME_BAND_ID}
            data-testid="home-band"
            className="flex flex-col gap-7"
          >
            {/* "RedactNest" is wider than a phone at 200% text (spec 0024, AC-14). */}
            <h2 id={HOME_BAND_ID} className="text-headline text-ink wrap-break-word">
              {HOME_TEXT.band.title}
            </h2>
            <div className="grid gap-6 md:grid-cols-2">
              {/* The query container for the Looks for columns below. */}
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

        {/*
          The network band (spec 0026, AC-9): a full width `night` section
          listing what `/tool` fetches, each row with the paths it stands for.
          `tests/e2e/network-list.spec.ts` reads those paths from this list
          and holds a full run's every request to them, so the list cannot
          drift from what the page does. `data-band` scopes the one rule in
          `globals.css` that rings focus in `night-accent` here, because
          `focus` measures 2.62:1 on `night` (WCAG 1.4.11).
        */}
        <section
          aria-labelledby="home-network"
          data-testid="home-network"
          data-band="night"
          className="bg-night text-night-ink"
        >
          <PageContainer
            width="wide"
            className="grid grid-cols-1 items-start gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]"
          >
            <div className="flex min-w-0 flex-col items-start gap-5">
              <div className="flex flex-col gap-3">
                <p className="text-small font-semibold text-night-accent">
                  {HOME_TEXT.network.eyebrow}
                </p>
                <h2
                  id="home-network"
                  className="text-headline text-balance text-night-ink wrap-break-word"
                >
                  {HOME_TEXT.network.title}
                </h2>
              </div>
              <p className="max-w-xl text-night-muted">{HOME_TEXT.network.body}</p>
              <a
                href={CHECK_IT_HREF}
                className="inline-flex min-h-6 items-center gap-1 rounded-item font-medium text-night-accent underline decoration-1 underline-offset-4"
              >
                {HOME_TEXT.network.link}
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={1.75} />
              </a>
            </div>
            <div className="min-w-0 rounded-card border border-night-border p-5">
              <p
                id="home-network-list"
                className="text-small font-semibold text-night-muted"
              >
                {HOME_TEXT.network.listLabel}
              </p>
              <ul
                role="list"
                aria-labelledby="home-network-list"
                className="mt-2 flex flex-col divide-y divide-night-border wrap-break-word"
              >
                {NETWORK_ROWS.map((row) => (
                  <li
                    key={row.label}
                    data-testid="network-row"
                    data-paths={row.paths.join(" ")}
                    className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-night-ink">{row.label}</span>
                      <span className="text-small text-night-muted">{row.what}</span>
                    </span>
                    {row.paths.length > 0 && (
                      <span className="text-small text-night-accent wrap-anywhere sm:text-right">
                        {row.paths.join(", ")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </PageContainer>
        </section>

        {/*
          The two plans (spec 0026, AC-10), the same cards as `/pricing`,
          only on a build that sells Pro.
        */}
        {config.billingEnabled && (
          <PageContainer width="wide" className="py-16 sm:py-20">
            <section
              aria-labelledby="home-pricing"
              data-testid="home-pricing"
              className="flex flex-col gap-10"
            >
              <SectionHead
                id="home-pricing"
                eyebrow={HOME_TEXT.pricing.eyebrow}
                title={HOME_TEXT.pricing.title}
                centred
              />
              <div className="mx-auto w-full max-w-3xl">
                <PricingCards headingLevel={3} />
              </div>
            </section>
          </PageContainer>
        )}

        {/*
          The closing band (spec 0026, AC-8): one heading and the hero's own
          way into the tool, across the page with the page's own gutters, so
          at 320 pixels with 200% text the button has the hero's width.
          `accent-faint` rather than the mockup's filled accent, because the
          focus ring sits on the band and `focus` on `accent` is 1.68:1, under
          the 3:1 a ring needs (WCAG 1.4.11).
        */}
        <section
          aria-labelledby="home-closing"
          data-testid="home-closing"
          className="border-t border-border bg-accent-faint"
        >
          <PageContainer
            width="wide"
            className="flex flex-col gap-6 py-14 sm:flex-row sm:items-center sm:justify-between"
          >
            <h2 id="home-closing" className="text-headline text-ink wrap-break-word">
              {HOME_TEXT.closing}
            </h2>
            <Button href={TOOL_PATH} reload size="lg" className="self-start sm:self-auto">
              {HOME_TEXT.primary}
            </Button>
          </PageContainer>
        </section>
      </main>
    </>
  );
}

/**
 * A section's opening: a short accent eyebrow over its `h2` (spec 0026, AC-8).
 * `centred` for a section whose cards sit in a row under it.
 */
function SectionHead({
  id,
  eyebrow,
  title,
  centred = false,
}: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly centred?: boolean;
}) {
  return (
    <div className={centred ? "flex flex-col gap-3 text-center" : "flex flex-col gap-3"}>
      <p className="text-small font-semibold text-accent">{eyebrow}</p>
      <h2 id={id} className="text-headline text-balance text-ink wrap-break-word">
        {title}
      </h2>
    </div>
  );
}

/**
 * Each How it works card's small drawing, on made up values (spec 0026,
 * AC-8): the drop zone, three found rows with two ticked, and the new file.
 * Decoration, hidden from assistive technology by the caller, so the card's
 * title and line carry its meaning.
 */
function StepDrawing({ index }: { readonly index: number }) {
  if (index === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-control border-2 border-dashed border-border-strong bg-surface px-10 py-5 text-accent">
        <FileUp className="size-6" strokeWidth={1.75} />
      </div>
    );
  }
  if (index === 1) {
    return (
      <ul className="flex w-full max-w-64 flex-col gap-2 rounded-control border border-border bg-surface p-3 text-small text-ink">
        {HOME_TEXT.steps.drawing.rows.map(({ value, ticked }) => (
          <li key={value} className="flex min-w-0 items-start gap-2">
            <span
              className={
                ticked
                  ? "inline-flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] bg-accent text-on-accent"
                  : "size-4 shrink-0 rounded-[0.25rem] border border-border-strong bg-surface"
              }
            >
              {ticked && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span className="min-w-0 wrap-anywhere">{value}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-control border border-border bg-surface px-3 py-3 text-small text-ink sm:px-4">
      <FileCheck className="size-5 shrink-0 text-accent" strokeWidth={1.75} />
      <span className="min-w-0 wrap-anywhere">{HOME_TEXT.steps.drawing.file}</span>
    </div>
  );
}

/**
 * A band card's opening: the icon on its soft square tile beside the card's
 * `h3` and, under it, the subtitle. The tile is decoration (`IconCircle` hides
 * it), so the heading is the words alone. Each card's list keeps
 * `role="list"` on its `ul` on purpose: Safari drops a list's semantics once
 * its bullets are removed, and the count is part of what the card says
 * (AC-11).
 *
 * On a card whose own content is under 12rem the tile sits above the words
 * instead, here, in each row and in the close (spec 0024, AC-14). The card is
 * the query container and the 12rem moves with the text size: at the default
 * size the narrowest card, on a 320 pixel phone, is about 14.4rem, so nothing
 * stacks at any width, while at 200% text on a phone it is about 4.4rem, too
 * narrow for a tile, its gap and a word, which used to spill past the card.
 * Long words break only when they cannot fit a line alone.
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
    <div className="flex flex-col gap-5 @min-[12rem]:flex-row @min-[12rem]:items-center">
      <IconCircle icon={icon} tone="accent" size="lg" shape="square" />
      <div className="flex min-w-0 flex-col gap-1 wrap-break-word">
        <h3 className="text-heading text-ink">{title}</h3>
        <p className="text-small text-ink-muted">{subtitle}</p>
      </div>
    </div>
  );
}

/**
 * A band card's list: each item in its own soft row, its icon on a square
 * tile beside its words. Looks for and Strips draw the same row (feature 26),
 * so the two cards read as one pair, and the grid stands them the same height
 * whatever each list holds (seven detectors; six stripped kinds while XMP
 * metadata waits on feature 32, spec 0019, AC-12). Nothing here acts: no
 * chevron, no link, no tab stop and no hover
 * change, so the cursor rule leaves it the arrow (AC-33). A `border` edge on
 * `surface`, not `subtle`, which is the checklist's hover tint and would make
 * a row look pressable (spec 0026, AC-1 made the card and the page both white).
 *
 * One list, so a screen reader hears its items together. Once the card's own
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
          className="flex break-inside-avoid flex-col gap-5 rounded-card border border-border bg-surface px-2 py-2.5 font-semibold text-ink @min-[12rem]:flex-row @min-[12rem]:items-center @min-[12rem]:px-3 @min-[26rem]:not-last:mb-3"
        >
          <IconCircle icon={icon} tone="accent" shape="square" />
          {/* Its own box, so a word wider than a narrow card can break. */}
          <span className="min-w-0 wrap-break-word">{label}</span>
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
    <div className="flex flex-col gap-3 border-t border-border pt-5 @min-[12rem]:flex-row @min-[12rem]:items-center">
      <Info
        aria-hidden="true"
        className="size-7 shrink-0 text-accent"
        strokeWidth={1.75}
      />
      <p className="min-w-0 text-small text-ink-muted wrap-break-word">{children}</p>
    </div>
  );
}
