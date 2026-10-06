import type { ReactNode } from "react";

import { PageContainer } from "./page-container";

/**
 * The bar across the bottom of every page. Spec 0013, AC-8.
 *
 * A grid: the brand column, then the link groups, then the licence notice
 * across the full width, last, as spec 0009 requires it to end every footer.
 * From `md` the brand column and the groups share one row; below it they
 * stack in page order.
 *
 * It reads nothing itself. The layout passes in the brand, the groups (spec
 * 0011, AC-4) and the notice with its source link (spec 0009, INV-8), because
 * `src/ui` may not import the config those come from (spec 0003, AC-19).
 */
export function SiteFooter({
  brand,
  groups,
  notice,
}: {
  readonly brand: ReactNode;
  /** The footer's `LinkGroup`s, side by side. */
  readonly groups: ReactNode;
  readonly notice: ReactNode;
}) {
  return (
    <footer className="border-t border-border bg-canvas">
      <PageContainer
        width="wide"
        className="grid gap-8 py-10 text-small text-ink-muted md:grid-cols-[minmax(0,1fr)_auto]"
      >
        <div className="flex flex-col gap-3">{brand}</div>
        <div className="flex flex-wrap gap-x-16 gap-y-6">{groups}</div>
        <div className="border-t border-border pt-6 md:col-span-2">{notice}</div>
      </PageContainer>
    </footer>
  );
}
