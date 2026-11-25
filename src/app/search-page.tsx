import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";

import { config } from "@/config";
import { cx } from "@/lib/cx";
import { IDLE_STEPS } from "@/lib/flow-text";
import { capLine } from "@/lib/home-text";
import { LEGAL } from "@/lib/legal";
import { PRO_PLAN } from "@/lib/plans";
import { SECURITY_SECTIONS, sectionId } from "@/lib/policy-sections";
import { SECURITY_PATH, TOOL_PATH } from "@/lib/routes";
import {
  HOW_IT_WORKS_TITLE,
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
import { Prose } from "@/ui/prose";
import { StepList } from "@/ui/step-list";

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

/** The section headings below the trio: the page's own scale for a section. */
const SECTION_HEADING = "text-title text-ink wrap-break-word";

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
  steps: "how-it-works",
  answer: "answer",
  more: "more-guides",
});

/**
 * One search page. Spec 0024, AC-1 to AC-8, laid out as spec 0026 AC-11 has
 * it: a centred hero over a soft accent glow, the three cards with their
 * filled icon tiles, then the body beside an On this page list from `lg`
 * (How it works, the answer ending on its warning, More guides as cards),
 * then the closing band. Every word from `src/lib/search-pages.ts` except the
 * tool's own steps (`IDLE_STEPS`), the cap line (`capLine`), the plan name in
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
    { id: SECTION_IDS.steps, title: HOW_IT_WORKS_TITLE },
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
            The hero, centred over a soft `accent-faint` glow (AC-11), in the
            home page's type. `min-w-0`, `max-w-full` and the headline's word
            breaking keep a long word inside a phone at 200% text (spec 0024,
            AC-13, AC-14), and change nothing wider.
          */}
          <div className="bg-[radial-gradient(ellipse_at_top,var(--color-accent-faint),transparent_70%)]">
            <PageContainer
              width="wide"
              className="flex min-w-0 flex-col items-center gap-6 py-14 text-center sm:py-20"
            >
              <div className="flex max-w-full flex-col gap-4">
                {/* Breadcrumb text with no link (AC-11): the guides have no index page. */}
                <p className="text-small text-ink-muted">
                  {LEGAL.guidesNavLabel} / {text.navLabel}
                </p>
                <p data-testid="search-eyebrow" className="eyebrow">
                  {text.eyebrow}
                </p>
                <h1 className="max-w-4xl text-display text-balance text-ink wrap-break-word">
                  {text.headline}
                </h1>
              </div>
              <p className="max-w-2xl text-lead text-ink-muted">{text.lead}</p>
              <ToolButton label={text.primary} capsTestId="search-caps" centred />
            </PageContainer>
          </div>

          <PageContainer width="wide" className="flex flex-col gap-16 pb-14 sm:pb-20">
            {/*
              The three cards, joined in one bordered row from `md`, each with
              its icon on a filled tile (AC-11). A list, so a screen reader
              hears three items.
            */}
            <ul
              role="list"
              data-testid="search-cards"
              className="grid grid-cols-1 overflow-hidden rounded-card border border-border bg-surface wrap-break-word md:grid-cols-3"
            >
              {text.features.map(({ icon, title, body }) => (
                <li
                  key={title}
                  className="flex flex-col gap-3 border-border p-6 not-last:border-b md:not-last:border-r md:not-last:border-b-0"
                >
                  <IconCircle icon={icon} tone="solid" shape="square" />
                  <h2 className="text-heading text-ink">{title}</h2>
                  <p className="text-ink-muted">{body}</p>
                </li>
              ))}
            </ul>

            <div className="@container">
              <div className="grid grid-cols-1 gap-10 @min-[61rem]:grid-cols-[minmax(0,14rem)_minmax(0,44rem)] @min-[61rem]:justify-center @min-[61rem]:gap-x-16">
                <LinkGroup
                  label={LEGAL.onThisPageLabel}
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

                <div className="flex min-w-0 max-w-narrow flex-col gap-14">
                  <section
                    id={SECTION_IDS.steps}
                    aria-labelledby={`${SECTION_IDS.steps}-title`}
                    className="flex scroll-mt-6 flex-col gap-7"
                  >
                    <h2 id={`${SECTION_IDS.steps}-title`} className={SECTION_HEADING}>
                      {HOW_IT_WORKS_TITLE}
                    </h2>
                    <StepList steps={IDLE_STEPS} />
                  </section>

                  <section
                    id={SECTION_IDS.answer}
                    aria-labelledby={`${SECTION_IDS.answer}-title`}
                    className="flex scroll-mt-6 flex-col gap-7"
                  >
                    <h2 id={`${SECTION_IDS.answer}-title`} className={SECTION_HEADING}>
                      {text.answerTitle}
                    </h2>
                    {/* Prose's section rhythm sets the paragraphs close together. */}
                    <Prose>
                      <section>
                        {text.answer.map((part) => (
                          <Answer key={answerKey(part)} part={part} />
                        ))}
                        {/* `/black-box-redaction`'s drawing, after the checks (*Page frames*). */}
                        {text.figure !== null && <CoverFigure {...text.figure} />}
                      </section>
                    </Prose>
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
                      <h2 id={`${SECTION_IDS.more}-title`} className={SECTION_HEADING}>
                        {MORE_GUIDES_TITLE}
                      </h2>
                      <ul role="list" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {others.map((other) => (
                          <li key={other}>
                            <a
                              href={SEARCH_PAGE_TEXT[other].path}
                              className="flex min-h-full items-center justify-between gap-3 rounded-card border border-border bg-surface p-5 font-semibold text-ink underline decoration-1 underline-offset-4 transition-[background-color,border-color] duration-fast hover:border-border-strong"
                            >
                              <span className="min-w-0 wrap-break-word">
                                {SEARCH_PAGE_TEXT[other].navLabel}
                              </span>
                              <ArrowRight
                                aria-hidden="true"
                                className="size-5 shrink-0 text-accent"
                                strokeWidth={1.75}
                              />
                            </a>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </div>
            </div>

            {/* The closing band: the page's button again (AC-11). */}
            <div
              data-testid="search-close"
              className="flex flex-col items-center gap-4 rounded-card border border-border bg-accent-faint p-8 sm:p-10"
            >
              <ToolButton label={text.primary} centred />
            </div>
          </PageContainer>
        </div>
      </main>
    </>
  );
}

/**
 * The page's way into the tool (AC-4), and in the hero the cap line under it
 * (AC-8): `capLine` over `config`, so no cap and no price is written here as a
 * number.
 */
function ToolButton({
  label,
  capsTestId,
  centred = false,
}: {
  readonly label: string;
  /** Set on the hero's button alone, which carries the cap line. */
  readonly capsTestId?: string;
  readonly centred?: boolean;
}) {
  return (
    <div className={cx("flex flex-col gap-3", centred ? "items-center" : "items-start")}>
      <Button href={TOOL_PATH} reload size="lg">
        {label}
      </Button>
      {capsTestId !== undefined && (
        <p data-testid={capsTestId} className="text-small text-ink-muted">
          {capLine(config.billingEnabled, config.freePageCap, config.maxPages)}
        </p>
      )}
    </div>
  );
}

/**
 * One part of the answer, as its kind says. The terms line shows only with
 * billing on, naming `PRO_PLAN.name` (AC-8); with billing off it is absent,
 * so no plan is named outside the cap line.
 */
function Answer({ part }: { readonly part: AnswerPart }) {
  switch (part.kind) {
    case "paragraph":
      return <p>{part.text}</p>;
    case "checks":
      return (
        <ol>
          {part.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "terms":
      return config.billingEnabled ? <p>{removeTextTermsLine(PRO_PLAN.name)}</p> : null;
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
