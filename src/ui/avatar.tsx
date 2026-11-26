import { cva } from "class-variance-authority";
import { User } from "lucide-react";

export type AvatarState = "pending" | "ready";

interface AvatarProps {
  /**
   * What the circle shows: one character the caller has already cut from the
   * visitor's own email (its first grapheme, uppercased), or null for the
   * person icon. Rendered only as React text (spec 0003, INV-7).
   */
  readonly initial: string | null;
  /**
   * `pending` is the plain `muted` circle that holds the place while the plan
   * check is still out (spec 0026, AC-25). It has no content at all.
   */
  readonly state?: AvatarState;
}

/**
 * A 34 pixel circle: `accent` with a 2 pixel `surface` ring and a `border`
 * hairline, the letter in `on-accent` semibold (5.47:1). Decoration only:
 * the button it sits in carries the name ("Your account"), so the letter and
 * the icon are hidden from assistive technology (spec 0026, AC-22).
 */
const circle = cva(
  "inline-flex size-8.5 shrink-0 items-center justify-center rounded-full border border-border ring-2 ring-surface",
  {
    variants: {
      state: {
        ready: "bg-accent text-on-accent",
        pending: "bg-muted",
      },
    },
  },
);

export function Avatar({ initial, state = "ready" }: AvatarProps) {
  return (
    <span aria-hidden="true" className={circle({ state })}>
      {state === "ready" &&
        (initial === null ? (
          <User className="size-5" strokeWidth={1.75} />
        ) : (
          <span className="text-small font-semibold">{initial}</span>
        ))}
    </span>
  );
}
