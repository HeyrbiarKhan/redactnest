import { cx } from "@/lib/cx";

export type CountBadgeTone = "accent" | "neutral";

export interface CountNoun {
  readonly one: string;
  readonly other: string;
}

interface CountBadgeProps {
  readonly count: number;
  /** A literal pair from the caller, such as `{ one: "item", other: "items" }`. */
  readonly noun: CountNoun;
  readonly tone: CountBadgeTone;
  /** Show only the number. The noun stays for assistive technology. */
  readonly compact?: boolean;
}

/** `accent-strong` on `accent-soft` is 5.66:1 and `ink-muted` on `subtle` 5.51:1. */
const TONE: Readonly<Record<CountBadgeTone, string>> = Object.freeze({
  accent: "bg-accent-soft text-accent-strong",
  neutral: "bg-subtle text-ink-muted",
});

/**
 * A count in a pill. Always announced with its noun, "2 items", never as a bare
 * number that means nothing out of context (AC-10).
 */
export function CountBadge({ count, noun, tone, compact = false }: CountBadgeProps) {
  const word = count === 1 ? noun.one : noun.other;

  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-small font-medium",
        TONE[tone],
      )}
    >
      {count}
      {compact ? <span className="sr-only">{` ${word}`}</span> : ` ${word}`}
    </span>
  );
}
