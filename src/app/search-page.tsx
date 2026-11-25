import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { config } from "@/config";
import { cx } from "@/lib/cx";
import { capLine } from "@/lib/home-text";
import { LEGAL } from "@/lib/legal";
import { PRO_PLAN } from "@/lib/plans";
import { SECURITY_SECTIONS, sectionId } from "@/lib/policy-sections";
import { SECURITY_PATH, TOOL_PATH } from "@/lib/routes";
import {
  CLOSING_LINE,
  CLOSING_TITLE,
  LOOK_OVER_LINE,
  LOOK_OVER_LINK_TEXT,
  MORE_GUIDES_TITLE,
  otherSearchPages,
  removeTextTermsLine,
  SEARCH_PAGE_TEXT,
  type AnswerPart,
  type SearchPageKind,
} from "@/lib/search-pages";
import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";
import { CoverFigure } from "@/ui/cover-figure";
import { IconCircle } from "@/ui/icon-circle";
import { LinkGroup } from "@/ui/link-group";
import { PageContainer } from "@/ui/page-container";

import { FOOTER_LINK_CLASS } from "./footer-link";
import { PageHeader } from "./site-nav";

/**
 * Where every answer section's last link lands: the security page's detection
 * limits, by the section's key, so a reworded heading keeps the link (spec
 * 0024, AC-7; spec 0018, AC-5).
 */
const WHAT_IT_CAN_MISS = `${SECURITY_PATH}#${sectionId(
  "whatItCanMiss" satisfies keyof typeof SECURITY_SECTIONS,
)}`;

/** The 30 pixel heading, `Guide.dc.html`'s answer and closing band. */
const SECTION_HEADING = "text-title font-bold tracking-[-0.02em] wrap-break-word";

/**
 * The answer's words, as `Guide.dc.html` sets its body: 17 pixels, airy,
 * `ink-soft`. A word breaks only where it cannot fit a line alone: at 305
 * pixels with 200% text, "somewhere" is wider than a numbered check (spec
 * 0024, AC-14), and every wider screen sets the words as before.
 */
const ANSWER_TEXT = "text-lede leading-[1.7] text-ink-soft wrap-break-word";

/**
 * A search page's head (spec 0024, AC-2). The title goes through the root
 * template, so the tab reads `<title> · RedactNest`, while `og:title` and
 * `twitter:title` are the bare title. The canonical and `og:url` are the
 * record's path, absolute on the root layout's `metadataBase`
 * (`config.siteUrl`). `og:image`, `twitter:image` and the image's alt come
 * from the segment's own `opengraph-image.png` and `opengraph-image.alt.txt`,
 * which file based metadata puts ahead of this object (INV-4). `openGraph`
 * here replaces the root's whole, so every field it needs is named here.
 */
export function searchPageMetadata(kind: SearchPageKind): Metadata {
  const { path, title, description } = SEARCH_PAGE_TEXT[kind];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      type: "website",
      siteName: LEGAL.tradingName,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

/** Each body section's `id`, for the On this page list (spec 0026, AC-11). */
const SECTION_IDS = Object.freeze({
  answer: "answer",
  more: "more-guides",
});

/**
 * One search page. Spec 0024, AC-1 to AC-8, laid out as spec 0026 AC-11 has
 * it and the owner's port of `Guide.dc.html` draws it (2026-11-25): a
 * centred hero over the soft `glow`, the breadcrumb text, the `h1`, the lead
 * and the button with the cap line beside it; the three cards joined in one
 * bordered row with their filled icon tiles; then, past a quiet rule, the
 * body beside an On this page list from `lg` (the answer ending on its
 * warning callout, More guides as cards); then the teal closing band. The
 * cards stand in for the tool's numbered steps, which this page no longer
 * lists (the owner's ruling, 2026-11-25). Every word from
 * `src/lib/search-pages.ts` except the cap line (`capLine`), the plan name in
 * `removeTextTermsLine` (`PRO_PLAN.name`) and the two shared labels in
 * `src/lib/legal.ts` (Guides, On this page) (INV-2).
 *
 * A static server component with no client component and no script element
 * (AC-1, INV-3), so the standard content security policy and the page budget
 * stay as they are. The glow is a CSS gradient on a colour token and the On
 * this page list sticks with CSS alone. Its largest paint is the `h1`.
 *
 * Both buttons into the tool are real page loads (`reload`), never
 * `next/link` (spec 0003, INV-10): a content security policy belongs to the
 * document it arrived with, so a client side navigation would open the tool
 * under this page's policy. The More guides links, the On this page links and
 * the look over link are plain links in the same tab (AC-4).
 *
 * The page's content sits in `search-page`, which the component tests read
 * for the claims and the idea counts (AC-5, AC-6); the header, the footer and
 * the head are outside it.
 */
export function SearchPage({ kind }: { readonly kind: SearchPageKind }) {
  const text = SEARCH_PAGE_TEXT[kind];
  const others = otherSearchPages(kind);
  const contents = [
    { id: SECTION_IDS.answer, title: text.answerTitle },
    ...(others.length > 0 ? [{ id: SECTION_IDS.more, title: MORE_GUIDES_TITLE }] : []),
  ];

  return (
    <>
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main
        id="main"
        tabIndex={-1}
        data-smooth-scroll=""
        className="flex flex-1 flex-col focus:outline-none"
      >
        <div data-testid="search-page" className="flex flex-col">
          {/*
            The hero, centred over the mockup's radial `glow`, gone by 70% of
            its reach, so the cap line sits on white. `min-w-0`, `max-w-full`
            and the headline's word breaking keep a long word inside a phone at
            200% text (spec 0024, AC-13, AC-14), and change nothing wider.
          */}
          <div className="bg-radial-[900px_400px_at_50%_0%] from-glow to-transparent to-70%">
            <PageContainer
              width="wide"
              className="flex min-w-0 flex-col items-center gap-5 py-14 text-center sm:py-18"
            >
              {/*
                Breadcrumb text with no link (AC-11): the guides have no index
                page. Its last part is the page's eyebrow, which the social card
                reads from `search-eyebrow` (spec 0024, AC-16).
              */}
              <p className="max-w-full text-small text-ink-subtle wrap-break-word">
                {LEGAL.guidesNavLabel} /{" "}
                <span data-testid="search-eyebrow">{text.eyebrow}</span>
              </p>
              <h1 className="max-w-190 text-display text-balance text-ink wrap-break-word">
                {text.headline}
              </h1>
              <p className="max-w-155 text-lede leading-[1.7] text-ink-muted">
                {text.lead}
              </p>
              {/*
                The page's way into the tool (AC-4), the cap line beside it
                (AC-8): `capLine` over `config`, so no cap and no price is
                written here as a number. They stack where they cannot sit
                side by side.
              */}
              <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-3">
                <Button href={TOOL_PATH} reload size="lg">
                  {text.primary}
                </Button>
                <p data-testid="search-caps" className="text-small text-ink-subtle">
                  {capLine(config.billingEnabled, config.freePageCap, config.maxPages)}
                </p>
              </div>
            </PageContainer>
          </div>

          {/*
            The three cards, joined in one bordered row from `md`, each its
            icon on a filled 40 pixel tile, its title and its line, the middle
            one on `subtle`, as drawn. A list, so a screen reader hears three
            items.
          */}
          <PageContainer width="wide" className="pb-14 sm:pb-20 lg:pb-24">
            <ul
              role="list"
              data-testid="search-cards"
              className="grid grid-cols-1 overflow-hidden rounded-panel border border-border bg-surface wrap-break-word md:grid-cols-3"
            >
              {text.features.map(({ icon, title, body }) => (
                <li
                  key={title}
                  className="flex flex-col gap-3.5 border-muted p-6 not-last:border-b even:bg-subtle sm:p-8 md:not-last:border-r md:not-last:border-b-0"
                >
                  <IconCircle icon={icon} tone="solid" shape="square" size="sm" />
                  <h2 className="text-subhead text-ink">{title}</h2>
                  <p className="text-copy leading-[1.6] text-ink-muted">{body}</p>
                </li>
              ))}
            </ul>
          </PageContainer>

          {/*
            The body, past a quiet rule across the window: from `lg` (the
            grid's own container query, so 200% text on a wide window counts as
            below it) the On this page list in a 240 pixel column, sticky with
            CSS, 72 pixels from the 680 pixel text; above the text below that.
          */}
          <div className="border-t border-muted">
            <PageContainer width="wide" className="py-14 sm:py-20 lg:pt-22 lg:pb-24">
              <div className="@container">
                <div className="grid grid-cols-1 gap-10 @min-[61rem]:grid-cols-[minmax(0,15rem)_minmax(0,42.5rem)] @min-[61rem]:justify-center @min-[61rem]:gap-x-18">
                  <LinkGroup
                    label={LEGAL.onThisPageLabel}
                    look="contents"
                    className="text-small text-ink-muted @min-[61rem]:sticky @min-[61rem]:top-6 @min-[61rem]:self-start"
                  >
                    {contents.map(({ id, title }) => (
                      <li key={id}>
                        <a href={`#${id}`} className={FOOTER_LINK_CLASS}>
                          {title}
                        </a>
                      </li>
                    ))}
                  </LinkGroup>

                  <div className="flex max-w-170 min-w-0 flex-col gap-11">
                    <section
                      id={SECTION_IDS.answer}
                      aria-labelledby={`${SECTION_IDS.answer}-title`}
                      className="flex scroll-mt-6 flex-col gap-5"
                    >
                      <h2
                        id={`${SECTION_IDS.answer}-title`}
                        className={cx(SECTION_HEADING, "text-ink")}
                      >
                        {text.answerTitle}
                      </h2>
                      {/* The answer's own column: its parts, then the figure where there is one. */}
                      <section className="flex flex-col gap-5">
                        {text.answer.map((part) => (
                          <Answer key={answerKey(part)} part={part} />
                        ))}
                        {/* `/black-box-redaction`'s drawing, after the checks (*Page frames*). */}
                        {text.figure !== null && <CoverFigure {...text.figure} />}
                      </section>
                      {/*
                        AC-7: every answer ends on the look over line and its
                        link, as the warning callout AC-11 draws.
                      */}
                      <Callout tone="warning" data-testid="look-over">
                        <p>
                          {LOOK_OVER_LINE}{" "}
                          <a
                            href={WHAT_IT_CAN_MISS}
                            className="font-medium underline decoration-1 underline-offset-4"
                          >
                            {LOOK_OVER_LINK_TEXT}
                          </a>
                          .
                        </p>
                      </Callout>
                    </section>

                    {others.length > 0 && (
                      <section
                        id={SECTION_IDS.more}
                        aria-labelledby={`${SECTION_IDS.more}-title`}
                        className="flex scroll-mt-6 flex-col gap-5"
                      >
                        <h2
                          id={`${SECTION_IDS.more}-title`}
                          className="text-[1.375rem] leading-[1.3] font-bold text-ink wrap-break-word"
                        >
                          {MORE_GUIDES_TITLE}
                        </h2>
                        <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {others.map((other) => (
                            <li key={other}>
                              {/*
                                The whole card is the link; its name underlined,
                                as every link outside the header's nav is
                                (spec 0003, INV-8), its line in muted ink with
                                the drawn arrow. The space between the two
                                keeps them apart in the link's name.
                              */}
                              <a
                                href={SEARCH_PAGE_TEXT[other].path}
                                className="flex h-full flex-col gap-1.5 rounded-panel border border-border bg-surface p-5 text-ink wrap-break-word transition-[background-color,border-color] duration-fast hover:border-border-strong"
                              >
                                <span className="text-body font-semibold underline decoration-1 underline-offset-4">
                                  {SEARCH_PAGE_TEXT[other].navLabel}
                                </span>{" "}
                                <span className="text-small text-ink-subtle">
                                  {SEARCH_PAGE_TEXT[other].moreLine}
                                  <ArrowRight
                                    aria-hidden="true"
                                    className="ms-1 inline size-3.5 align-[-0.125em]"
                                    strokeWidth={2}
                                  />
                                </span>
                              </a>
                            </li>
                          ))}
                        </ul>
                      </section>
                    )}
                  </div>
                </div>
              </div>
            </PageContainer>
          </div>

          {/*
            The closing band (AC-11, as the owner's port of `Guide.dc.html`
            amends it): a rounded `accent` band, its heading and line in light
            ink on the left, the page's button again in white on the right.
            `data-band` scopes the rule that rings focus in `ink` here, because
            `focus` measures 1.39:1 on `accent` (WCAG 1.4.11).
          */}
          <PageContainer width="wide" className="pb-16 lg:pb-24">
            <section
              aria-labelledby="search-closing"
              data-testid="search-close"
              data-band="accent"
              className="flex flex-col items-start gap-6 rounded-band bg-accent p-6 text-on-accent sm:flex-row sm:items-center sm:justify-between sm:p-10 lg:px-14 lg:py-12"
            >
              <div className="max-w-full min-w-0">
                <h2 id="search-closing" className={cx(SECTION_HEADING, "text-on-accent")}>
                  {CLOSING_TITLE}
                </h2>
                <p className="mt-2 text-body text-accent-soft">{CLOSING_LINE}</p>
              </div>
              <Button
                href={TOOL_PATH}
                reload
                variant="inverse"
                size="lg"
                // A word may break only where none fits (320 pixels, 200% text).
                className="max-w-full shrink-0 wrap-anywhere"
              >
                {text.primary}
              </Button>
            </section>
          </PageContainer>
        </div>
      </main>
    </>
  );
}

/**
 * One part of the answer, as its kind says. The terms line shows only with
 * billing on, naming `PRO_PLAN.name` (AC-8); with billing off it is absent,
 * so no plan is named outside the cap line. A list of checks keeps its
 * numbers (WCAG 1.3.1), set apart by margins, since a list laid out as flex
 * can lose its markers.
 */
function Answer({ part }: { readonly part: AnswerPart }) {
  switch (part.kind) {
    case "paragraph":
      return <p className={ANSWER_TEXT}>{part.text}</p>;
    case "checks":
      return (
        <ol className={cx("list-decimal ps-6 [&>li]:ps-1 [&>li+li]:mt-2", ANSWER_TEXT)}>
          {part.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "terms":
      return config.billingEnabled ? (
        <p className={ANSWER_TEXT}>{removeTextTermsLine(PRO_PLAN.name)}</p>
      ) : null;
  }
}

/** A part's key: its words, or its kind where it holds none of its own. */
function answerKey(part: AnswerPart): string {
  switch (part.kind) {
    case "paragraph":
      return part.text;
    case "checks":
      return part.items.join(" ");
    case "terms":
      return part.kind;
  }
}
