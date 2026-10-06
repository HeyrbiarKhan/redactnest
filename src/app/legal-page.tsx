import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import { LEGAL } from "@/lib/legal";
import { formatPolicyDate, lastUpdated, type PolicyChanges } from "@/lib/policy-changes";
import { sectionId, type PolicySections } from "@/lib/policy-sections";
import { LinkGroup } from "@/ui/link-group";
import { PageContainer } from "@/ui/page-container";
import { Prose } from "@/ui/prose";

import { FOOTER_LINK_CLASS } from "./footer-link";
import { PageHeader } from "./site-nav";

/**
 * The frame both legal pages share. Spec 0011, AC-1, AC-2 and AC-18, laid out
 * as spec 0013 amends it (AC-25).
 *
 * The shell every page has, the h1 and "Last updated" from the page's own
 * change list, an On this page list of plain links to every h2, then the
 * page's h2 sections in `Prose`, the text held to the narrow 44rem reading
 * column. From `lg` the list sits beside the text in a column of its own;
 * below it, above the text. In the page it always comes after the title and
 * before the text, so a keyboard meets it in reading order.
 *
 * From `lg` the list stays in view while the text scrolls (AC-25): sticky
 * 1.5rem from the top, `self-start` so it can move within its grid row, and,
 * when it is taller than the window less 3rem, scrolling inside itself. Its
 * 0.5rem of inner padding (taken back by an equal negative margin, so nothing
 * moves) and the same scroll padding (so a link that focus scrolls into view
 * stops short of the edge) keep every link's focus ring, 2 pixels offset by 2,
 * inside that scroll box rather than clipped by it. It has its own column, so
 * it never covers the text or anything focused (WCAG 2.2, 2.4.11). Below `lg`,
 * where a 1280 pixel window at 200% text also lands, it sits above the text
 * and does not stick.
 *
 * `lg` here is a container query, 61rem of the page's column, as on the tool
 * page: a 1024 pixel window less the page's gutters at the default text size.
 * A media query reads `rem` as the browser's default size, so it would keep
 * two columns and a sticky list at 200% text; a container query reads the
 * page's own root size, so enlarged text gets one column and nothing sticky
 * (WCAG 1.4.4 and 1.4.10).
 *
 * `data-smooth-scroll` on `main` turns on smooth scrolling for these two
 * pages alone, from one rule in `globals.css`, and only for a visitor who has
 * not asked for reduced motion. Each section heading has a 1.5rem scroll
 * margin, so a link lands it just below the top edge rather than against it.
 * All of it is CSS: no script, so the pages stay static (spec 0011, INV-7).
 *
 * A server component with no script of its own, so neither page collects
 * anything (INV-7). The header's button is a real page load (`reload`), never
 * `next/link`, so the tool opens under its own content security policy (spec
 * 0003, INV-10). Nothing in the header is current here (spec 0013, AC-7).
 */
export function LegalPage({
  title,
  changes,
  sections,
  children,
}: {
  readonly title: string;
  readonly changes: PolicyChanges;
  /** The page's section record, which its h2s and the list both read. */
  readonly sections: PolicySections;
  readonly children: ReactNode;
}) {
  return (
    <>
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main
        id="main"
        tabIndex={-1}
        data-smooth-scroll=""
        className="flex-1 py-10 focus:outline-none sm:py-14"
      >
        <PageContainer width="wide" className="@container">
          <div className="grid gap-10 @min-[61rem]:grid-cols-[minmax(0,14rem)_minmax(0,44rem)] @min-[61rem]:gap-x-16 @min-[61rem]:[grid-template-areas:'._head'_'nav_text']">
            <div className="flex max-w-narrow flex-col gap-2 border-b border-border pb-8 @min-[61rem]:[grid-area:head]">
              <h1 className="text-title text-ink">{title}</h1>
              <p data-testid="last-updated" className="text-ink-muted">
                Last updated <PolicyDate date={lastUpdated(changes)} />
              </p>
            </div>
            <LinkGroup
              label={LEGAL.onThisPageLabel}
              className={cx(
                "text-small text-ink-muted @min-[61rem]:[grid-area:nav]",
                "@min-[61rem]:sticky @min-[61rem]:top-6 @min-[61rem]:-m-2 @min-[61rem]:max-h-[calc(100dvh_-_3rem)]",
                "@min-[61rem]:self-start @min-[61rem]:overflow-y-auto @min-[61rem]:scroll-py-2 @min-[61rem]:p-2",
              )}
            >
              {Object.entries(sections).map(([key, heading]) => (
                <li key={key}>
                  <a href={`#${sectionId(key)}`} className={FOOTER_LINK_CLASS}>
                    {heading}
                  </a>
                </li>
              ))}
            </LinkGroup>
            <div className="min-w-0 max-w-narrow @min-[61rem]:[grid-area:text]">
              <Prose>{children}</Prose>
            </div>
          </div>
        </PageContainer>
      </main>
    </>
  );
}

/**
 * One section's h2, its words from the page's section record and its `id`
 * from the key, so the On this page list can link to it (spec 0013, AC-25).
 */
export function SectionHeading<Sections extends PolicySections>({
  sections,
  name,
}: {
  readonly sections: Sections;
  readonly name: keyof Sections & string;
}) {
  return (
    <h2 id={sectionId(name)} className="scroll-mt-6">
      {sections[name]}
    </h2>
  );
}

/** A change list's date, British on screen and `YYYY-MM-DD` to a machine (AC-2). */
function PolicyDate({ date }: { readonly date: string }) {
  return <time dateTime={date}>{formatPolicyDate(date)}</time>;
}

/** The dated entries under each page's last heading, newest first (AC-1, AC-2). */
export function ChangeList({ changes }: { readonly changes: PolicyChanges }) {
  return (
    <ul data-testid="changes">
      {changes.map((change) => (
        <li key={change.date}>
          <PolicyDate date={change.date} />: {change.summary}
        </li>
      ))}
    </ul>
  );
}

/**
 * The contact address as a `mailto:` link (AC-6, AC-10). A production deploy
 * refuses one on a `.invalid` host, the placeholder among them (AC-16).
 */
export function ContactLink() {
  const email = LEGAL.contactEmail.trim();
  return <a href={`mailto:${email}`}>{email}</a>;
}
