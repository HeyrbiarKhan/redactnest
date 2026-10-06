import type { LucideIcon } from "lucide-react";

import { cx } from "@/lib/cx";

export type IconCircleTone = "accent" | "neutral";
export type IconCircleSize = "sm" | "md" | "lg";
export type IconCircleShape = "circle" | "square";

interface IconCircleProps {
  readonly icon: LucideIcon;
  readonly tone: IconCircleTone;
  readonly size?: IconCircleSize;
  /** `circle` by default; `square` is the rounded tile of the home page's cards (spec 0013, AC-11). */
  readonly shape?: IconCircleShape;
}

/** `accent` on `accent-soft` is 4.18:1 and `ink-muted` on `subtle` 5.51:1, both past 3:1. */
const TONE: Readonly<Record<IconCircleTone, string>> = Object.freeze({
  accent: "bg-accent-soft text-accent",
  neutral: "bg-subtle text-ink-muted",
});

const CIRCLE: Readonly<Record<IconCircleSize, string>> = Object.freeze({
  sm: "size-8",
  md: "size-12",
  lg: "size-16",
});

/**
 * `sm` keeps the site's 20 pixel icon (design.md): at 16 a check in your
 * mockup's circles read thin and faint beside 16 pixel words.
 */
const GLYPH: Readonly<Record<IconCircleSize, string>> = Object.freeze({
  sm: "size-5",
  md: "size-5",
  lg: "size-7",
});

/** The square's corners, no rounder than the `rounded-xl` card it sits in. */
const SQUARE: Readonly<Record<IconCircleSize, string>> = Object.freeze({
  sm: "rounded-lg",
  md: "rounded-xl",
  lg: "rounded-xl",
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
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center",
        shape === "square" ? SQUARE[size] : "rounded-full",
        TONE[tone],
        CIRCLE[size],
      )}
    >
      <Icon className={GLYPH[size]} strokeWidth={1.75} />
    </span>
  );
}
