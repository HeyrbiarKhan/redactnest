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
 * The grid is the lockup's container (`@container`), which steps it down a
 * size when the row is narrower than 10rem. Below `md` the brand column is
 * as wide as the row, so the step reaches it. Spec 0024, AC-14, *The lockup
 * at narrow widths*.
 *
 * From `md` the brand column is never narrower than its own content
 * (`minmax(min-content,1fr)`): the lockup, which never wraps, or the brand
 * line's longest word. So at large text the link groups wrap under each other
 * in their own column rather than lie over "RedactNest". `1fr` alone has the
 * same floor; the `minmax` says it on purpose, so a change back to
 * `minmax(0,1fr)` reads as the change it is. Spec 0024, AC-17, *The footer at
 * 200% text*.
 *
 * From `xl` it follows `Main.dc.html` (the owner's port, 2026-11-25): the
 * brand and three 204 pixel groups, 32 pixels apart, the mockup's `2fr 1fr
 * 1fr 1fr` at 1440 pixels. The groups are basis 12.75rem and grow, so where
 * the text is larger they wrap under each other rather than squeeze. Below
 * `xl` the groups keep their own widths, so from `md` they share the brand's
 * row (spec 0024, AC-17). Its rules are the mockup's lighter `muted`.
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
    <footer className="border-t border-muted bg-canvas">
      <PageContainer
        width="wide"
        className="@container grid gap-x-8 gap-y-10 pt-14 pb-10 text-small text-ink-muted md:grid-cols-[minmax(min-content,1fr)_auto] xl:grid-cols-[minmax(min-content,1fr)_minmax(0,1.657fr)]"
      >
        <div className="flex flex-col gap-2.5">{brand}</div>
        <div className="flex flex-wrap gap-x-8 gap-y-6 xl:[&>*]:grow xl:[&>*]:basis-51">
          {groups}
        </div>
        <div className="border-t border-muted pt-5 text-ink-subtle md:col-span-2">
          {notice}
        </div>
      </PageContainer>
    </footer>
  );
}
