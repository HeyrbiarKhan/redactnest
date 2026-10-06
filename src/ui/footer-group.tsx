import type { ReactNode } from "react";

/**
 * One group of footer links (Product, Legal) under a small label. Spec 0013,
 * AC-8.
 *
 * A `nav` named by `aria-label`, with the same word shown above the list and
 * hidden from assistive technology, so a screen reader hears "Legal,
 * navigation" once rather than the label twice. The label is a `div`, never a
 * heading or a `p`: a heading would join every page's heading walk, and the
 * footer's one paragraph is spec 0009's licence notice, which its test reads
 * as `footer p`.
 */
export function FooterGroup({
  label,
  children,
}: {
  readonly label: string;
  /** The group's `li` items. */
  readonly children: ReactNode;
}) {
  return (
    <nav aria-label={label} className="flex flex-col gap-2">
      <div aria-hidden="true" className="font-semibold text-ink">
        {label}
      </div>
      <ul className="flex flex-col gap-1">{children}</ul>
    </nav>
  );
}
