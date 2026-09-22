import { useId, type ComponentPropsWithoutRef, type ReactNode } from "react";

import { cx } from "@/lib/cx";

interface CardProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  readonly title?: ReactNode;
  readonly headingLevel?: 2 | 3;
  /** Sits at the end of the heading row, usually a `CountBadge`. */
  readonly badge?: ReactNode;
  /** Layout only. */
  readonly className?: string;
  readonly children: ReactNode;
}

/**
 * A white panel with a quiet edge. When it has a title, the section is named
 * by its own heading, so a screen reader lists it as a region with that name.
 */
export function Card({
  title,
  headingLevel = 2,
  badge,
  className,
  children,
  ...section
}: CardProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titled = title !== undefined && title !== null;

  return (
    <section
      {...section}
      aria-labelledby={titled ? headingId : undefined}
      className={cx(
        "flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-xs",
        className,
      )}
    >
      {titled && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading id={headingId} className="text-heading text-ink">
            {title}
          </Heading>
          {badge}
        </div>
      )}
      {children}
    </section>
  );
}
