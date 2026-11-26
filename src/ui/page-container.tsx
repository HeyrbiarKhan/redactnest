import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export type PageWidth = "narrow" | "wide";

interface PageContainerProps {
  /** `narrow` (44rem) for a reading or account column, `wide` (72rem) for everything else. */
  readonly width: PageWidth;
  /** Layout only, such as the gap between the column's children. */
  readonly className?: string;
  /**
   * Marks `/tool`'s container, so the page preview's frame can lift its width
   * cap and gutters with one rule in `globals.css` (spec 0026 child 0002,
   * AC-38). Layout only, as `className` is.
   */
  readonly "data-tool-frame"?: string;
  readonly children: ReactNode;
}

const WIDTH: Readonly<Record<PageWidth, string>> = Object.freeze({
  narrow: "max-w-narrow",
  // The mockups' 32 pixel gutters from `lg` (spec 0026, `Main.dc.html`).
  wide: "max-w-wide lg:px-8",
});

/** Gutters and a maximum width, and nothing else. */
export function PageContainer({
  width,
  className,
  "data-tool-frame": toolFrame,
  children,
}: PageContainerProps) {
  return (
    <div
      data-tool-frame={toolFrame}
      className={cx("mx-auto w-full px-4 sm:px-6", WIDTH[width], className)}
    >
      {children}
    </div>
  );
}
