import { cva } from "class-variance-authority";
import type { LucideIcon } from "lucide-react";

export type IconCircleTone = "accent" | "neutral" | "solid";
export type IconCircleSize = "sm" | "md" | "lg";
export type IconCircleShape = "circle" | "square";

interface IconCircleProps {
  readonly icon: LucideIcon;
  readonly tone: IconCircleTone;
  readonly size?: IconCircleSize;
  /** `circle` by default; `square` is the rounded tile of the cards (spec 0013, AC-11; spec 0026). */
  readonly shape?: IconCircleShape;
}

/**
 * `accent` on `accent-soft` is 4.86:1, `ink-muted` on `muted` 7.03:1 and
 * `on-accent` on `accent` 5.47:1, all past the 3:1 an icon needs. `solid` is
 * the guide pages' filled step tile (spec 0026, AC-11).
 */
const tile = cva("inline-flex shrink-0 items-center justify-center", {
  variants: {
    tone: {
      accent: "bg-accent-soft text-accent",
      neutral: "bg-muted text-ink-muted",
      solid: "bg-accent text-on-accent",
    },
    // `sm` is the guide pages' 40 pixel step tile (`Guide.dc.html`).
    size: { sm: "size-10", md: "size-12", lg: "size-16" },
    // The square's corners stay no rounder than the card it sits in.
    shape: { circle: "rounded-full", square: "rounded-control" },
  },
});

/** `sm` and `md` keep the site's 20 pixel icon (design.md). */
const glyph = cva("", {
  variants: { size: { sm: "size-5", md: "size-5", lg: "size-7" } },
});

/**
 * An icon in a soft circle, or a soft rounded square. Decoration only:
 * whatever it stands beside carries the meaning, so it is hidden from
 * assistive technology.
 */
export function IconCircle({
  icon: Icon,
  tone,
  size = "md",
  shape = "circle",
}: IconCircleProps) {
  return (
    <span aria-hidden="true" className={tile({ tone, size, shape })}>
      <Icon className={glyph({ size })} strokeWidth={1.75} />
    </span>
  );
}
