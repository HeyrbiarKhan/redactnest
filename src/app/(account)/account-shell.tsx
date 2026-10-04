import type { ReactNode } from "react";

import { TOOL_PATH } from "@/lib/routes";
import { Button } from "@/ui/button";
import { PageContainer } from "@/ui/page-container";
import { SiteHeader } from "@/ui/site-header";

import { SiteNav } from "../site-nav";

/**
 * The frame every page in the account group shares: the shell every page
 * has (spec 0003), and one narrow column. The header's button is a real page
 * load into the tool (`reload`), never `next/link`, so the tool opens under its
 * own content security policy with none of Clerk's script still running
 * (spec 0003, INV-10; spec 0012, INV-1).
 */
export function AccountShell({ children }: { readonly children: ReactNode }) {
  return (
    <>
      <SiteHeader
        nav={<SiteNav />}
        action={
          <Button href={TOOL_PATH} reload>
            Redact a PDF
          </Button>
        }
      />
      {/* The skip link's target, allowed to drop its outline (spec 0003, AC-14). */}
      <main id="main" tabIndex={-1} className="flex-1 py-10 focus:outline-none sm:py-14">
        <PageContainer width="narrow" className="flex flex-col items-center gap-6">
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
