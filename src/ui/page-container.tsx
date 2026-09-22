import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

export type PageWidth = "narrow" | "wide";

interface PageContainerProps {
  /** `narrow` (44rem) for the tool's one column, `wide` (72rem) for everything else. */
  readonly width: PageWidth;
  /** Layout only, such as the gap between the column's children. */
  readonly className?: string;
  readonly children: ReactNode;
}

const WIDTH: Readonly<Record<PageWidth, string>> = Object.freeze({
  narrow: "max-w-narrow",
  wide: "max-w-wide",
});

/** Gutters and a maximum width, and nothing else. */
export function PageContainer({ width, className, children }: PageContainerProps) {
  return (
    <div className={cx("mx-auto w-full px-4 sm:px-6", WIDTH[width], className)}>
      {children}
    </div>
  );
}
