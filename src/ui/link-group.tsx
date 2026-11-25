import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

/**
 * How a group looks. `group` is the footer's groups and the legal pages' On
 * this page list: the label in `ink`, semibold. `contents` is the guide
 * pages' On this page list (spec 0026, AC-11, `Guide.dc.html`): the label in
 * small capitals in `ink-subtle`, and the links on a quiet rail of their own.
 * The mockup marks one link as the reader's place; that needs a script to
 * follow the scroll, so no link is marked, and the rail stands where the mark
 * would be.
 */
export type LinkGroupLook = "group" | "contents";

interface LookClasses {
  readonly nav: string;
  readonly label: string;
  readonly list: string;
}

const LOOK: Readonly<Record<LinkGroupLook, LookClasses>> = Object.freeze({
  group: Object.freeze({
    nav: "gap-1",
    label: "font-semibold text-ink",
    // 27 pixels from line to line, `Main.dc.html`'s footer rhythm.
    list: "gap-0.75",
  }),
  contents: Object.freeze({
    nav: "gap-2.5",
    // The mockup's 12 pixel label, at the 14 pixel floor (spec 0003, INV-6).
    label: "text-small font-semibold tracking-[0.06em] text-ink-subtle uppercase",
    // Each item's words 14 pixels in from the rail, as drawn.
    list: "gap-1 border-s-2 border-muted ps-3",
  }),
});

/**
 * A short group of links under a small label: the footer's Product and Legal
 * groups (spec 0013, AC-8), and the legal pages' and guide pages' On this
 * page lists (AC-25; spec 0026, AC-11).
 *
 * A `nav` named by `aria-label`, with the same word shown above the list and
 * hidden from assistive technology, so a screen reader hears "Legal,
 * navigation" once rather than the label twice. The label is a `div`, never a
 * heading or a `p`: a heading would join the page's heading walk, and the
 * footer's one paragraph is spec 0009's licence notice, which its test reads
 * as `footer p`. The `ul` keeps `role="list"` because Safari drops a list's
 * semantics once its bullets are removed, and the count tells how many links
 * the group holds.
 */
export function LinkGroup({
  label,
  look = "group",
  className,
  children,
}: {
  readonly label: string;
  readonly look?: LinkGroupLook;
  /** Layout only, such as the grid area it sits in. */
  readonly className?: string;
  /** The group's `li` items. */
  readonly children: ReactNode;
}) {
  const classes = LOOK[look];
  return (
    <nav aria-label={label} className={cx("flex flex-col", classes.nav, className)}>
      <div aria-hidden="true" className={classes.label}>
        {label}
      </div>
      <ul role="list" className={cx("flex flex-col", classes.list)}>
        {children}
      </ul>
    </nav>
  );
}
