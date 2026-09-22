import type { LucideIcon } from "lucide-react";

import { cx } from "@/lib/cx";

export type IconCircleTone = "accent" | "neutral";
export type IconCircleSize = "md" | "lg";

interface IconCircleProps {
  readonly icon: LucideIcon;
  readonly tone: IconCircleTone;
  readonly size?: IconCircleSize;
}

/** `accent` on `accent-soft` is 4.18:1 and `ink-muted` on `subtle` 5.51:1, both past 3:1. */
const TONE: Readonly<Record<IconCircleTone, string>> = Object.freeze({
  accent: "bg-accent-soft text-accent",
  neutral: "bg-subtle text-ink-muted",
});

const CIRCLE: Readonly<Record<IconCircleSize, string>> = Object.freeze({
  md: "size-12",
  lg: "size-16",
});

const GLYPH: Readonly<Record<IconCircleSize, string>> = Object.freeze({
  md: "size-5",
  lg: "size-7",
});

/**
 * An icon in a soft circle. Decoration only: whatever it stands beside carries
 * the meaning, so it is hidden from assistive technology.
 */
export function IconCircle({ icon: Icon, tone, size = "md" }: IconCircleProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full",
        TONE[tone],
        CIRCLE[size],
      )}
    >
      <Icon className={GLYPH[size]} strokeWidth={1.75} />
    </span>
  );
}
