import type { ReactNode } from "react";

import { PageContainer, type PageWidth } from "@/ui/page-container";

import { type NavItem, PageHeader } from "../site-nav";

/**
 * The frame every page in the account group shares: the header every page
 * has, with Account current on Account and the pages under it and nothing
 * current on sign in and sign up (spec 0013, AC-7 and AC-24), then one
 * column. Narrow for the account pages; wide where sign in sets a panel
 * beside Clerk's card (AC-23).
 *
 * The header's button is a real page load into the tool (`reload`), never
 * `next/link`, so the tool opens under its own content security policy with
 * none of Clerk's script still running (spec 0003, INV-10; spec 0012, INV-1).
 */
export function AccountShell({
  current,
  width = "narrow",
  children,
}: {
  readonly current?: NavItem;
  readonly width?: PageWidth;
  readonly children: ReactNode;
}) {
  return (
    <>
      <PageHeader current={current} />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex-1 py-10 focus:outline-none sm:py-14">
        <PageContainer width={width} className="flex flex-col items-center gap-6">
          {children}
        </PageContainer>
      </main>
    </>
  );
}

/** A page's own column inside the shell, left aligned, for the account pages. */
export function AccountColumn({ children }: { readonly children: ReactNode }) {
  return <div className="flex w-full flex-col gap-6">{children}</div>;
}
