import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

/**
 * A short group of links under a small label: the footer's Product and Legal
 * groups (spec 0013, AC-8), and the legal pages' On this page list (AC-25).
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
  className,
  children,
}: {
  readonly label: string;
  /** Layout only, such as the grid area it sits in. */
  readonly className?: string;
  /** The group's `li` items. */
  readonly children: ReactNode;
}) {
  return (
    <nav aria-label={label} className={cx("flex flex-col gap-2", className)}>
      <div aria-hidden="true" className="font-semibold text-ink">
        {label}
      </div>
      <ul role="list" className="flex flex-col gap-1">
        {children}
      </ul>
    </nav>
  );
}
