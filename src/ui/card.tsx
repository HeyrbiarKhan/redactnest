import { useId, type ComponentPropsWithoutRef, type ReactNode, type Ref } from "react";

import { cx } from "@/lib/cx";

interface CardProps extends Omit<ComponentPropsWithoutRef<"section">, "title"> {
  readonly title?: ReactNode;
  readonly headingLevel?: 2 | 3;
  /**
   * Makes the heading a place focus can be moved to, for a card that appears
   * as the result of something the visitor did (spec 0007, *Focus*). It gets
   * `tabIndex={-1}`, so it stays out of the tab order.
   */
  readonly headingRef?: Ref<HTMLHeadingElement>;
  /** Sits at the end of the heading row, usually a `CountBadge`. */
  readonly badge?: ReactNode;
  /**
   * A 2 pixel `accent` edge in place of the quiet one, to mark the card a
   * page recommends (spec 0013, AC-22). Decoration only: whatever it marks is
   * also said in words, so nothing rests on the colour.
   */
  readonly accent?: true;
  /**
   * 28 pixels in from the edge and 24 between its parts, in place of 20 and
   * 16: the home page's finds and strips cards, after your mockup (spec 0013,
   * AC-11). A prop rather than `className`, which is never size, so the two
   * paddings never compete.
   */
  readonly spacious?: true;
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
  headingRef,
  badge,
  accent,
  spacious,
  className,
  children,
  ...section
}: CardProps) {
  const headingId = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const titled = title !== undefined && title !== null;
  const focusable = headingRef ? { ref: headingRef, tabIndex: -1 } : {};

  return (
    <section
      {...section}
      aria-labelledby={titled ? headingId : undefined}
      className={cx(
        "flex flex-col rounded-xl bg-surface shadow-xs",
        spacious ? "gap-6 p-7" : "gap-4 p-5",
        accent ? "border-2 border-accent" : "border border-border",
        className,
      )}
    >
      {titled && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading {...focusable} id={headingId} className="text-heading text-ink">
            {title}
          </Heading>
          {badge}
        </div>
      )}
      {children}
    </section>
  );
}
