import type { ReactNode } from "react";

import { PageContainer } from "./page-container";

/**
 * The bar across the bottom of every page.
 *
 * It reads nothing itself. The layout passes the licence notice and its links
 * in (spec 0009, INV-8), because `src/ui` may not import the config the source
 * link comes from (AC-19).
 */
export function SiteFooter({ children }: { readonly children: ReactNode }) {
  return (
    <footer className="border-t border-border">
      <PageContainer
        width="wide"
        className="flex flex-wrap items-center gap-4 py-6 text-small text-ink-muted"
      >
        {children}
      </PageContainer>
    </footer>
  );
}
