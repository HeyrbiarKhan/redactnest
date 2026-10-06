import type { ReactNode } from "react";

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
      <main id="main" tabIndex={-1} className="flex-1 py-10 focus:outline-none sm:py-14">
        <PageContainer
          width="wide"
          className="grid gap-10 lg:grid-cols-[minmax(0,14rem)_minmax(0,44rem)] lg:gap-x-16 lg:[grid-template-areas:'._head'_'nav_text']"
        >
          <div className="flex max-w-narrow flex-col gap-2 border-b border-border pb-8 lg:[grid-area:head]">
            <h1 className="text-title text-ink">{title}</h1>
            <p data-testid="last-updated" className="text-ink-muted">
              Last updated <PolicyDate date={lastUpdated(changes)} />
            </p>
          </div>
          <LinkGroup
            label={LEGAL.onThisPageLabel}
            className="text-small text-ink-muted lg:[grid-area:nav]"
          >
            {Object.entries(sections).map(([key, heading]) => (
              <li key={key}>
                <a href={`#${sectionId(key)}`} className={FOOTER_LINK_CLASS}>
                  {heading}
                </a>
              </li>
            ))}
          </LinkGroup>
          <div className="min-w-0 max-w-narrow lg:[grid-area:text]">
            <Prose>{children}</Prose>
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
  return <h2 id={sectionId(name)}>{sections[name]}</h2>;
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
