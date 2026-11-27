import { ArrowRight, Check, ChevronRight, FileUp, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Fragment } from "react";

import { config } from "@/config";
import { cx } from "@/lib/cx";
import { DROP_TEXT } from "@/lib/flow-text";
import {
  capLine,
  closingLine,
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
import { CoverFigure } from "@/ui/cover-figure";
import { PageContainer } from "@/ui/page-container";

import { HomeWindow } from "./home-window";
import { PricingCards } from "./pricing-cards";
import { PageHeader } from "./site-nav";

/**
 * `/`'s own head (spec 0024, AC-11): the site line as its description, the
 * same words as the root layout's fallback, and a canonical to the root of
 * `config.siteUrl` (through the layout's `metadataBase`). Its own title, set
 * absolute with the layout's separator (the marketing brief of 2026-11-28,
 * item 1), so the layout's default, "RedactNest", stays every other page's
 * fallback.
 */
export const metadata: Metadata = {
  title: { absolute: `${HOME_TEXT.pageTitle} · ${LEGAL.tradingName}` },
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
 * The home page, in spec 0026 AC-8's order: the hero with a drawing of the
 * tool, How it works, the black box comparison, what RedactNest looks for
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
 * The hero's product window is drawn in HTML (`HomeWindow`), in place of the
 * screenshot `scripts/make-brand.mjs` captures, by the owner's port of
 * `Main.dc.html` (2026-11-25). The sticky header is this page's alone.
 */
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: WEBSITE_JSON_LD }}
      />
      <PageHeader sticky />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {/*
          The hero (spec 0026, AC-8, as the owner's port of `Main.dc.html`
          amends it, 2026-11-25): the words, then from `lg` the drawn product
          window on the right, over the mockup's radial `glow`. The wash is
          centred over the window and gone by 70% of its reach, so the words
          sit on white or the palest edge of it. Full width, so it spans the
          window.
        */}
        <div className="relative overflow-hidden bg-radial-[1000px_500px_at_75%_0%] from-glow to-transparent to-70%">
          <PageContainer width="wide" className="py-14 sm:py-20 lg:pt-22 lg:pb-24">
            <div
              data-testid="home-hero"
              className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:gap-16"
            >
              {/*
                At 320 pixels with 200% text the headline's longest word is
                wider than the column (spec 0024, AC-14). `min-w-0` and
                `max-w-full` stop that word setting the column's width, and the
                headline breaks it only when it cannot fit a line alone, so
                every wider screen sets the headline as before.
              */}
              <div className="flex min-w-0 flex-col items-start gap-6">
                {/* The eyebrow chip (spec 0026, AC-8): a check on its tile, then the words. */}
                <p
                  data-testid="home-eyebrow"
                  className="inline-flex max-w-full items-center gap-2 self-start rounded-full border border-glow-edge bg-surface py-1.5 pr-3 pl-2 text-small font-medium text-ink-soft"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-4.5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
                  >
                    <Check className="size-2.75" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 wrap-break-word">{HOME_TEXT.eyebrow}</span>
                </p>
                <h1 className="max-w-full text-hero text-ink wrap-break-word">
                  {HOME_TEXT.headline}
                </h1>
                <p className="max-w-130 text-intro text-ink-muted">{HOME_TEXT.lead}</p>
                <div className="flex max-w-full flex-wrap gap-3">
                  <Button href={TOOL_PATH} reload size="xl">
                    {/*
                      The arrow inline after the last word, so at 320 pixels
                      with 200% text it wraps with "PDF" rather than widening
                      the button past the column (spec 0024, AC-14).
                    */}
                    <span>
                      {HOME_TEXT.primary}
                      <ArrowRight
                        aria-hidden="true"
                        className="ms-2 inline size-4 align-[-0.1875em]"
                        strokeWidth={2}
                      />
                    </span>
                  </Button>
                  {/* An anchor on this page, so a plain link. */}
                  <Button
                    href={`#${HOW_IT_WORKS_ID}`}
                    reload
                    variant="secondary"
                    size="xl"
                  >
                    {HOME_TEXT.howItWorks}
                  </Button>
                </div>
                <p data-testid="home-caps" className="text-small text-ink-subtle">
                  {capLine(config.billingEnabled, config.freePageCap, config.maxPages)}
                </p>
              </div>

              {/*
                The drawn window, then the small card that hangs off its lower
                left corner from `lg` (36 pixels out, 28 down). Below `lg` the
                card sits under the window, in the flow.
              */}
              <div className="relative flex min-w-0 flex-col gap-4">
                <HomeWindow />
                <div
                  data-testid="home-shot-card"
                  className="flex max-w-full items-center gap-3 self-start rounded-card border border-border bg-surface px-4 py-3 shadow-popover lg:absolute lg:-bottom-7 lg:-left-9"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
                  >
                    <ShieldCheck className="size-4" strokeWidth={2.5} />
                  </span>
                  <p className="flex min-w-0 flex-col text-small wrap-break-word">
                    <span className="font-semibold text-ink">
                      {HOME_TEXT.shotCard.title}
                    </span>
                    <span className="text-ink-subtle">{HOME_TEXT.shotCard.line}</span>
                  </p>
                </div>
              </div>
            </div>
          </PageContainer>
        </div>

        {/*
          The trust strip (the owner's port of `Main.dc.html`, 2026-11-25):
          four short claims across the page on `subtle`, between quiet rules,
          two to a row from `sm` and four from `lg`. Each is said elsewhere on
          the page too, by the owner's read, in the places AC-30's test names.
        */}
        <div data-testid="home-trust" className="border-y border-muted bg-subtle">
          <PageContainer width="wide" className="py-7">
            <ul
              role="list"
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
            >
              {HOME_TEXT.trust.map(({ icon: Icon, text }) => (
                <li
                  key={text}
                  className="flex min-w-0 items-center gap-3 text-small leading-tight font-medium text-ink-soft"
                >
                  <Icon
                    aria-hidden="true"
                    className="size-5 shrink-0 text-accent"
                    strokeWidth={1.75}
                  />
                  <span className="min-w-0 wrap-break-word">{text}</span>
                </li>
              ))}
            </ul>
          </PageContainer>
        </div>

        {/*
          How it works (spec 0026, AC-8, as the owner's port of `Main.dc.html`
          amends it): the head centred with its lead, then three cards side
          by side from `md`, each a drawing on `subtle` over its number,
          title and line.
        */}
        <section
          id={HOW_IT_WORKS_ID}
          aria-labelledby={`${HOW_IT_WORKS_ID}-title`}
          data-testid="home-steps"
        >
          <PageContainer
            width="wide"
            className="flex flex-col gap-14 py-16 sm:py-20 lg:py-28"
          >
            <SectionHead
              id={`${HOW_IT_WORKS_ID}-title`}
              eyebrow={HOME_TEXT.steps.eyebrow}
              title={HOME_TEXT.steps.title}
              lead={HOME_TEXT.steps.lead}
              centred
            />
            <ol
              role="list"
              className="grid grid-cols-1 gap-6 wrap-break-word md:grid-cols-3"
            >
              {HOME_TEXT.steps.items.map((step, index) => (
                <li
                  key={step.title}
                  className="flex flex-col overflow-hidden rounded-panel border border-border bg-surface shadow-card"
                >
                  <div
                    aria-hidden="true"
                    className="flex min-h-45 items-center justify-center border-b border-muted bg-subtle p-3 sm:p-6"
                  >
                    <StepDrawing index={index} />
                  </div>
                  <div className="flex flex-col gap-2 p-6">
                    <p
                      aria-hidden="true"
                      className="text-small leading-tight font-semibold text-ink-subtle"
                    >
                      {String(index + 1).padStart(2, "0")}
                    </p>
                    <h3 className="text-subhead text-ink">{step.title}</h3>
                    <p className="text-copy text-ink-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </PageContainer>
        </section>

        {/*
          The black box comparison (spec 0026, AC-8, as the owner's port of
          `Main.dc.html` amends it): the words on the left, 16 pixels apart,
          and the two panels in `CoverFigure`'s `tinted` look on the right
          from `lg`, on `subtle` between quiet rules.
        */}
        <section
          aria-labelledby="home-black-box"
          data-testid="home-black-box"
          className="border-y border-muted bg-subtle"
        >
          <PageContainer
            width="wide"
            className="grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16 lg:py-26"
          >
            <div className="flex min-w-0 flex-col items-start gap-4">
              <p className="text-small leading-tight font-semibold tracking-[0.02em] text-accent">
                {HOME_TEXT.blackBox.eyebrow}
              </p>
              <h2
                id="home-black-box"
                className="max-w-full text-headline text-ink wrap-break-word"
              >
                {HOME_TEXT.blackBox.title}
              </h2>
              <p className="text-lede text-ink-muted">{HOME_TEXT.blackBox.body}</p>
              <SectionLink href={CHECK_HREF}>{HOME_TEXT.blackBox.link}</SectionLink>
            </div>
            <CoverFigure
              look="tinted"
              panels={HOME_TEXT.blackBox.panels}
              caption={HOME_TEXT.blackBox.caption}
              className="min-w-0"
            />
          </PageContainer>
        </section>

        {/*
          What RedactNest looks for and strips (spec 0013, AC-11, as the
          owner's port of `Main.dc.html` amends it): the head, then two cards
          side by side from `md`, each a title and subtitle over its items as
          chips, closed by a note. The lists still come from `findsItems()` and
          `strippedItems()`, so they name exactly what exists. With billing on,
          the Looks for card ends with Pro's own terms, in the accent.
        */}
        <PageContainer width="wide" className="py-16 sm:py-20 lg:py-28">
          <section
            aria-labelledby={HOME_BAND_ID}
            data-testid="home-band"
            className="flex flex-col gap-12"
          >
            <div className="flex max-w-160 flex-col gap-3.5">
              <p className="text-small leading-tight font-semibold tracking-[0.02em] text-accent">
                {HOME_TEXT.band.eyebrow}
              </p>
              {/* "RedactNest" is wider than a phone at 200% text (spec 0024, AC-14). */}
              <h2 id={HOME_BAND_ID} className="text-headline text-ink wrap-break-word">
                {HOME_TEXT.band.title}
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <BandCard
                testId="home-finds"
                title={HOME_TEXT.band.finds.title}
                subtitle={HOME_TEXT.band.finds.subtitle}
                items={findsItems().map(({ label }) => label)}
                extra={config.billingEnabled ? HOME_TEXT.band.finds.termsChip : undefined}
                note={HOME_TEXT.band.finds.line}
              />
              <BandCard
                testId="home-strips"
                title={HOME_TEXT.band.strips.title}
                subtitle={HOME_TEXT.band.strips.subtitle}
                items={strippedItems()}
                note={HOME_TEXT.band.strips.note}
              />
            </div>
          </section>
        </PageContainer>

        {/*
          The network band (spec 0026, AC-9, as the owner's port of
          `Main.dc.html` amends it): a full width `night` section, the words on
          the left and on the right a table of what `/tool` fetches, set in
          the monospace stack the owner allowed here (`data-mono`), each row
          its name and the paths on our own origin it stands for. A path breaks
          only at a slash, never inside a word, unless one segment alone is
          wider than the table (320 pixels at 200% text).
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
            className="grid grid-cols-1 items-center gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24"
          >
            <div className="flex min-w-0 flex-col items-start gap-4">
              <p className="text-small leading-tight font-semibold tracking-[0.02em] text-night-accent">
                {HOME_TEXT.network.eyebrow}
              </p>
              <h2
                id="home-network"
                className="max-w-full text-headline text-night-ink wrap-break-word"
              >
                {HOME_TEXT.network.title}
              </h2>
              <p className="text-lede text-night-muted">{HOME_TEXT.network.body}</p>
              <SectionLink href={CHECK_IT_HREF} night>
                {HOME_TEXT.network.link}
              </SectionLink>
            </div>
            <div
              data-mono=""
              className="min-w-0 rounded-card border border-night-border bg-night-raised p-4.5 font-mono text-small leading-loose text-night-muted"
            >
              {/* The column heads, which the rows' own words already carry. */}
              <div
                aria-hidden="true"
                className="mb-1.5 flex flex-wrap justify-between gap-x-6 border-b border-night-border pb-2 text-night-faint"
              >
                <span>{HOME_TEXT.network.columns.name}</span>
                <span>{HOME_TEXT.network.columns.path}</span>
              </div>
              {/*
                From `xl`, where the table is 1440's width, each row is a grid
                whose paths take their whole line and whose name takes what is
                left, wrapping between its words rather than pushing the paths
                under it (the page's files). Below `xl` a row wraps as a whole.
              */}
              <ul role="list" aria-label={HOME_TEXT.network.listLabel}>
                {NETWORK_ROWS.map((row) => (
                  <li
                    key={row.label}
                    data-testid="network-row"
                    data-paths={row.paths.join(" ")}
                    className={cx(
                      "flex flex-wrap justify-between gap-x-6 xl:grid xl:grid-cols-[minmax(min-content,1fr)_auto]",
                      row.paths.length === 0 && "text-night-accent",
                    )}
                  >
                    <span className="min-w-0">
                      <span>{row.label}</span>
                    </span>
                    <span className="ms-auto min-w-0 text-right wrap-break-word">
                      {row.paths.length > 0 ? <Paths paths={row.paths} /> : row.what}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </PageContainer>
        </section>

        {/*
          The two plans (spec 0026, AC-10, as the owner's port of
          `Main.dc.html` amends it): `PricingCards`' summary form, two equal
          cards, Pro's button to Pricing. Only on a build that sells Pro.
        */}
        {config.billingEnabled && (
          <PageContainer width="wide" className="pt-16 pb-12 sm:pt-20 lg:pt-28">
            <section
              aria-labelledby="home-pricing"
              data-testid="home-pricing"
              className="flex flex-col gap-12"
            >
              <SectionHead
                id="home-pricing"
                eyebrow={HOME_TEXT.pricing.eyebrow}
                title={HOME_TEXT.pricing.title}
                centred
              />
              <div className="mx-auto w-full max-w-205">
                <PricingCards
                  headingLevel={3}
                  summary
                  getPro={HOME_TEXT.pricing.getPro}
                />
              </div>
            </section>
          </PageContainer>
        )}

        {/*
          The questions (the owner's port of `Main.dc.html`, 2026-11-25): the
          browser's own disclosures, no script, the first open, each answer in
          today's words. 820 pixels across, as drawn. A small chevron that
          turns down when open stands where the browser's marker was (hidden
          as a list marker and, for Safari, as its own); CSS alone.
        */}
        <div className="mx-auto w-full max-w-205 px-4 pt-16 pb-16 sm:px-6 sm:pt-20 lg:px-8 lg:pb-28">
          <section aria-labelledby="home-questions" data-testid="home-questions">
            <h2
              id="home-questions"
              className="mb-6 text-[2rem] leading-[1.1] font-bold tracking-[-0.025em] text-ink wrap-break-word"
            >
              {HOME_TEXT.questions.title}
            </h2>
            <div className="border-t border-border">
              {HOME_TEXT.questions.items.map(({ question, answer, withPro }, index) => (
                <details
                  key={question}
                  open={index === 0}
                  className="group border-b border-border py-4.5 wrap-break-word"
                >
                  <summary className="flex list-none items-start gap-2.5 rounded-item text-body leading-6 font-semibold text-ink [&::-webkit-details-marker]:hidden">
                    <ChevronRight
                      aria-hidden="true"
                      className="mt-1 size-4 shrink-0 text-ink-subtle transition-transform duration-fast group-open:rotate-90"
                      strokeWidth={2.25}
                    />
                    <span className="min-w-0">{question}</span>
                  </summary>
                  <p className="mt-2.5 text-copy leading-[1.6] text-ink-muted">
                    {answer}
                    {withPro !== undefined && config.billingEnabled && ` ${withPro}`}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </div>

        {/*
          The closing card (the owner's port of `Main.dc.html`, 2026-11-25): a
          rounded `accent` card, its wash brightening to `accent-bright` at the
          top right, the heading and the caps line in light ink, and the
          hero's own way into the tool as a white button. `data-band` scopes
          the rule that rings focus in `ink` here (WCAG 1.4.11). The words
          stay on the plain `accent`: the wash is gone by 70% of its reach,
          short of them.
        */}
        <PageContainer width="wide" className="pb-16 lg:pb-24">
          <section
            aria-labelledby="home-closing"
            data-testid="home-closing"
            data-band="accent"
            className="flex flex-col items-start gap-8 rounded-band bg-accent bg-radial-[600px_240px_at_85%_0%] from-accent-bright to-transparent to-70% p-6 text-on-accent sm:flex-row sm:items-center sm:justify-between sm:p-8 lg:p-14"
          >
            <div className="max-w-full min-w-0">
              <h2
                id="home-closing"
                className="text-[2.125rem] leading-[1.1] font-bold tracking-[-0.025em] text-on-accent wrap-break-word"
              >
                {HOME_TEXT.closing}
              </h2>
              <p className="mt-2.5 text-body leading-tight text-accent-soft">
                {closingLine(config.billingEnabled, config.freePageCap)}
              </p>
            </div>
            <Button
              href={TOOL_PATH}
              reload
              variant="inverse"
              size="xl"
              // A word may break only where none fits (320 pixels, 200% text).
              className="max-w-full shrink-0 wrap-anywhere"
            >
              {HOME_TEXT.primary}
            </Button>
          </section>
        </PageContainer>
      </main>
    </>
  );
}

/**
 * A section's opening (spec 0026, AC-8, as the owner's port of
 * `Main.dc.html` amends it): a short accent eyebrow over its `h2`, 14 pixels
 * apart, and a lead under it when the section has one. `centred` for a
 * section whose cards sit in a row under it. The mockup's eyebrow is 13
 * pixels, set at the 14 pixel floor (spec 0003, INV-6).
 */
function SectionHead({
  id,
  eyebrow,
  title,
  lead,
  centred = false,
}: {
  readonly id: string;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead?: string;
  readonly centred?: boolean;
}) {
  return (
    <div
      className={
        centred
          ? "flex flex-col items-center gap-3.5 text-center"
          : "flex flex-col gap-3.5"
      }
    >
      <p className="text-small leading-tight font-semibold tracking-[0.02em] text-accent">
        {eyebrow}
      </p>
      <h2 id={id} className="max-w-full text-headline text-ink wrap-break-word">
        {title}
      </h2>
      {lead !== undefined && <p className="max-w-140 text-lede text-ink-muted">{lead}</p>}
    </div>
  );
}

/**
 * Each How it works card's small drawing, on made up values (spec 0026,
 * AC-8, as `Main.dc.html` draws them): the drop zone in the tool's own words,
 * three found rows with two ticked and the page each is on, and the new
 * file's chip. Decoration, hidden from assistive technology by the caller, so
 * the card's title and line carry its meaning. Every word is at least 14
 * pixels (spec 0003, INV-6), where the mockup draws 9 to 12, and a page
 * number takes `ink-subtle`, where the mockup's grey would fall under 4.5:1.
 * The mockup's boxes are content box sized, so their widths here add the
 * padding and edge it leaves out (the rows card is 230 inside, 252 across).
 */
function StepDrawing({ index }: { readonly index: number }) {
  const { drawing } = HOME_TEXT.steps;
  if (index === 0) {
    return (
      <div className="flex min-h-[7.6875rem] w-[13.9375rem] max-w-full flex-col items-center justify-center gap-2.5 rounded-[0.75rem] border-[1.5px] border-dashed border-border-mid bg-surface p-3 text-center text-small text-ink-muted">
        <FileUp className="size-6.5 text-accent" strokeWidth={1.75} />
        {DROP_TEXT.title}
      </div>
    );
  }
  if (index === 1) {
    return (
      <ul className="flex w-63 max-w-full flex-col gap-1 rounded-panel border border-border bg-surface p-2.5 text-small text-ink shadow-card">
        {drawing.rows.map(({ value, page, ticked }, row) => (
          <li
            key={value}
            className={cx(
              "flex min-w-0 items-center gap-2 rounded-[0.375rem] p-1.5",
              row === 0 && "bg-accent-faint",
            )}
          >
            <span
              className={cx(
                "size-3.25 shrink-0 rounded-[0.25rem]",
                ticked ? "bg-accent" : "border-[1.5px] border-border-soft",
              )}
            />
            <span className="min-w-0 wrap-anywhere">{value}</span>
            <span className="ms-auto shrink-0 text-ink-subtle">{page}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    // Its words drop under the badge where they cannot sit beside it (320
    // pixels at 200% text), and the check sits inline so it wraps with them.
    <div className="flex min-w-0 flex-wrap items-center gap-3 rounded-[0.75rem] border border-border bg-surface px-3.5 py-3 shadow-card">
      <span className="flex min-h-11 w-9 shrink-0 items-center justify-center rounded-[0.375rem] border border-danger-border bg-danger-bg text-small font-bold text-danger-ink">
        {drawing.badge}
      </span>
      <span className="flex min-w-0 flex-col text-small wrap-anywhere">
        <span className="font-semibold text-ink">{drawing.file}</span>
        <span className="text-accent">
          <Check className="me-1 inline size-2.75 align-[-0.0625em]" strokeWidth={3} />
          {drawing.fileNote}
        </span>
      </span>
    </div>
  );
}

/**
 * A section's link onward, as `Main.dc.html` draws it: 15 pixels, semibold,
 * in the accent and underlined like every link outside the header's nav
 * (spec 0003, INV-8), with an arrow after it that assistive technology
 * skips. `night` on the network band, where it takes `night-accent`.
 */
function SectionLink({
  href,
  night = false,
  children,
}: {
  readonly href: string;
  readonly night?: boolean;
  readonly children: string;
}) {
  return (
    <a
      href={href}
      className={cx(
        "mt-1 inline-flex min-h-6 items-center gap-1 rounded-item text-copy font-semibold underline decoration-1 underline-offset-[0.2em]",
        night ? "text-night-accent" : "text-accent",
      )}
    >
      {children}
      <ArrowRight aria-hidden="true" className="size-4 shrink-0" strokeWidth={2} />
    </a>
  );
}

/**
 * A band card (spec 0013, AC-11, as `Main.dc.html` draws it): 16 pixel
 * corners, 28 in from the edge, its title and subtitle, then its items as
 * chips on `muted`, the optional `extra` chip in the accent, and the note
 * that closes it. A chip is words, never a control, so nothing here acts.
 */
function BandCard({
  testId,
  title,
  subtitle,
  items,
  extra,
  note,
}: {
  readonly testId: string;
  readonly title: string;
  readonly subtitle: string;
  readonly items: readonly string[];
  readonly extra?: string;
  readonly note: string;
}) {
  const headingId = `${testId}-title`;
  return (
    <section
      aria-labelledby={headingId}
      data-testid={testId}
      className="flex flex-col gap-4.5 rounded-panel border border-border bg-surface p-7 shadow-card wrap-break-word"
    >
      <div>
        <h3 id={headingId} className="text-lg font-semibold text-ink">
          {title}
        </h3>
        <p className="mt-1.5 text-small text-ink-subtle">{subtitle}</p>
      </div>
      <ul role="list" className="flex flex-wrap gap-2">
        {items.map((item) => (
          <li
            key={item}
            className="flex min-h-9 max-w-full items-center rounded-full bg-muted px-3.5 text-small font-medium text-ink wrap-anywhere"
          >
            {item}
          </li>
        ))}
        {extra !== undefined && (
          <li className="flex min-h-9 max-w-full items-center rounded-full bg-accent-faint px-3.5 text-small font-medium text-accent-strong wrap-anywhere">
            {extra}
          </li>
        )}
      </ul>
      <p className="text-small leading-normal text-ink-subtle">{note}</p>
    </section>
  );
}

/**
 * The paths a network row stands for, joined by commas, each free to break
 * after a slash and nowhere else (`wbr`), so no path splits inside a word.
 */
function Paths({ paths }: { readonly paths: readonly string[] }) {
  return paths.map((path, index) => (
    <Fragment key={path}>
      {index > 0 && ", "}
      {path.split("/").map((part, at) => (
        <Fragment key={at}>
          {at > 0 && (
            <>
              /<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </Fragment>
  ));
}
