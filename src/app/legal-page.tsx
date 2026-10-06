import type { ReactNode } from "react";

import { LEGAL } from "@/lib/legal";
import { formatPolicyDate, lastUpdated, type PolicyChanges } from "@/lib/policy-changes";
import { PageContainer } from "@/ui/page-container";
import { Prose } from "@/ui/prose";

import { PageHeader } from "./site-nav";

/**
 * The frame both legal pages share. Spec 0011, AC-1, AC-2 and AC-18.
 *
 * The shell every page has, a narrow reading column, the h1, "Last updated"
 * from the page's own change list, then the page's h2 sections in `Prose`.
 * A server component with no script of its own, so neither page collects
 * anything (INV-7).
 *
 * The header's button is a real page load (`reload`), never `next/link`, so
 * the tool opens under its own content security policy (spec 0003, INV-10).
 * Nothing in the header is current here (spec 0013, AC-7).
 */
export function LegalPage({
  title,
  changes,
  children,
}: {
  readonly title: string;
  readonly changes: PolicyChanges;
  readonly children: ReactNode;
}) {
  return (
    <>
      <PageHeader />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex-1 py-10 focus:outline-none sm:py-14">
        <PageContainer width="narrow" className="flex flex-col gap-10">
          <div className="flex flex-col gap-2 border-b border-border pb-8">
            <h1 className="text-title text-ink">{title}</h1>
            <p data-testid="last-updated" className="text-ink-muted">
              Last updated <PolicyDate date={lastUpdated(changes)} />
            </p>
          </div>
          <Prose>{children}</Prose>
        </PageContainer>
      </main>
    </>
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
