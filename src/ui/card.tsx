import { cva } from "class-variance-authority";
import { useId, type ComponentPropsWithoutRef, type ReactNode, type Ref } from "react";

import { cx } from "@/lib/cx";

/**
 * `card` is the quiet panel every page uses. `state` is `/tool`'s state card
 * (`ToolStates.dc.html`): 16 pixel corners, 22 pixels in from the edge and a
 * 16 pixel title. `flat` drops the box for a card drawn inside a panel that
 * already has one (`ToolReview.dc.html`'s right column): no edge, fill,
 * shadow or padding, the parts 14 pixels apart, the title at 16 pixels.
 */
export type CardLook = "card" | "state" | "flat";

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
  /** `card` by default. */
  readonly look?: CardLook;
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
   * paddings never compete. The `card` look only.
   */
  readonly spacious?: true;
  /** Layout only. */
  readonly className?: string;
  readonly children: ReactNode;
}

const panel = cva("flex flex-col", {
  variants: {
    look: {
      card: "rounded-card bg-surface shadow-card",
      state: "rounded-panel bg-surface shadow-card",
      flat: "",
    },
    room: {
      default: "gap-4 p-5",
      spacious: "gap-6 p-7",
      state: "gap-4 p-5.5",
      flat: "gap-3.5",
    },
    edge: {
      quiet: "border border-border",
      accent: "border-2 border-accent",
      none: "",
    },
  },
});

const heading = cva("text-ink", {
  variants: {
    look: {
      card: "text-heading",
      state: "text-body font-semibold",
      flat: "text-body font-semibold",
    },
  },
});

/**
 * A white panel with a quiet edge. When it has a title, the section is named
 * by its own heading, so a screen reader lists it as a region with that name.
 */
export function Card({
  title,
  headingLevel = 2,
  headingRef,
  badge,
  look = "card",
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
  const room =
    look === "card"
      ? spacious
        ? "spacious"
        : "default"
      : look === "state"
        ? "state"
        : "flat";
  const edge = look === "flat" ? "none" : accent ? "accent" : "quiet";

  return (
    <section
      {...section}
      aria-labelledby={titled ? headingId : undefined}
      className={cx(panel({ look, room, edge }), className)}
    >
      {titled && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Heading {...focusable} id={headingId} className={heading({ look })}>
            {title}
          </Heading>
          {badge}
        </div>
      )}
      {children}
    </section>
  );
}
