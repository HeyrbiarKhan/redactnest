import type { Metadata } from "next";

import { config } from "@/config";
import { IDLE_STEPS } from "@/lib/flow-text";
import { capLine } from "@/lib/home-text";
import { LEGAL } from "@/lib/legal";
import { SECURITY_SECTIONS, sectionId } from "@/lib/policy-sections";
import { SECURITY_PATH, TOOL_PATH } from "@/lib/routes";
import {
  HOW_IT_WORKS_TITLE,
  LOOK_OVER_LINE,
  LOOK_OVER_LINK_TEXT,
  MORE_GUIDES_TITLE,
  otherSearchPages,
  SEARCH_PAGE_TEXT,
  type AnswerPart,
  type SearchPageKind,
} from "@/lib/search-pages";
import { Button } from "@/ui/button";
import { FeatureList } from "@/ui/feature-list";
import { PageContainer } from "@/ui/page-container";
import { Prose } from "@/ui/prose";
import { StepList } from "@/ui/step-list";

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

/**
 * One search page. Spec 0024, AC-1 to AC-8: the hero, the trio, How it works,
 * the answer, then the close, every word from `src/lib/search-pages.ts`
 * except the tool's own steps (`IDLE_STEPS`), the cap line (`capLine`) and
 * the plan names inside it (INV-2).
 *
 * A static server component with no client component and no script element
 * (AC-1, INV-3), so the standard content security policy and the page budget
 * stay as they are. Its largest paint is the `h1`: the hero is words only.
 *
 * Both buttons into the tool are real page loads (`reload`), never
 * `next/link` (spec 0003, INV-10): a content security policy belongs to the
 * document it arrived with, so a client side navigation would open the tool
 * under this page's policy. The More guides links and the look over link are
 * plain links in the same tab (AC-4).
 *
 * The page's content sits in `search-page`, which the component tests read
 * for the claims and the idea counts (AC-5, AC-6); the header, the footer and
 * the head are outside it.
 */
export function SearchPage({ kind }: { readonly kind: SearchPageKind }) {
  const text = SEARCH_PAGE_TEXT[kind];
  const others = otherSearchPages(kind);

  return (
    <>
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        <PageContainer width="wide" className="py-14 sm:py-20">
          <div data-testid="search-page" className="flex flex-col gap-16">
            {/*
              The hero, in the home page's type. `min-w-0`, `max-w-full` and
              the headline's word breaking keep a long word inside a phone at
              200% text (AC-13, AC-14), and change nothing wider.
            */}
            <div className="flex min-w-0 flex-col items-start gap-6">
              <div className="flex max-w-full flex-col gap-4">
                <p data-testid="search-eyebrow" className="eyebrow">
                  {text.eyebrow}
                </p>
                <h1 className="max-w-4xl text-display text-balance text-ink wrap-break-word">
                  {text.headline}
                </h1>
              </div>
              <p className="max-w-2xl text-lead text-ink-muted">{text.lead}</p>
              <ToolButton label={text.primary} capsTestId="search-caps" />
            </div>

            <FeatureList items={text.features} />

            <section className="flex flex-col gap-7">
              <h2 className={SECTION_HEADING}>{HOW_IT_WORKS_TITLE}</h2>
              <StepList steps={IDLE_STEPS} />
            </section>

            <section className="flex max-w-narrow flex-col gap-7">
              <h2 className={SECTION_HEADING}>{text.answerTitle}</h2>
              {/* Prose's section rhythm sets the paragraphs close together. */}
              <Prose>
                <section>
                  {text.answer.map((part) => (
                    <Answer key={part.text} part={part} />
                  ))}
                  {/* AC-7: every answer ends on the look over line and its link. */}
                  <p>
                    {LOOK_OVER_LINE} <a href={WHAT_IT_CAN_MISS}>{LOOK_OVER_LINK_TEXT}</a>.
                  </p>
                </section>
              </Prose>
            </section>

            {/* The close: the page's button again, then the other guides. */}
            <div className="flex flex-col gap-16">
              <ToolButton label={text.primary} />
              {others.length > 0 && (
                <section className="flex flex-col gap-4">
                  <h2 className={SECTION_HEADING}>{MORE_GUIDES_TITLE}</h2>
                  <Prose>
                    <ul>
                      {others.map((other) => (
                        <li key={other}>
                          <a href={SEARCH_PAGE_TEXT[other].path}>
                            {SEARCH_PAGE_TEXT[other].navLabel}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </Prose>
                </section>
              )}
            </div>
          </div>
        </PageContainer>
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
}: {
  readonly label: string;
  /** Set on the hero's button alone, which carries the cap line. */
  readonly capsTestId?: string;
}) {
  return (
    <div className="flex flex-col items-start gap-3">
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

/** One part of the answer, as its kind says. */
function Answer({ part }: { readonly part: AnswerPart }) {
  return <p>{part.text}</p>;
}
