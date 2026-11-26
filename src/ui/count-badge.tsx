import { cva } from "class-variance-authority";

import { countText } from "@/lib/count-text";

export type CountBadgeTone = "accent" | "neutral" | "quiet";

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

/**
 * `accent-strong` on `accent-soft` is 6.73:1 and `ink-muted` on `muted` 7.03:1.
 * `quiet` is the bare number beside `/tool`'s Found items heading
 * (`ToolReview.dc.html`): no pill, `ink-subtle` at the heading's size, so it
 * sits on `surface` only, where it measures 4.83:1.
 */
const badge = cva("inline-flex shrink-0 items-center font-medium", {
  variants: {
    tone: {
      accent: "rounded-full bg-accent-soft px-2 py-0.5 text-small text-accent-strong",
      neutral: "rounded-full bg-muted px-2 py-0.5 text-small text-ink-muted",
      quiet: "text-body text-ink-subtle",
    },
  },
});

/**
 * A count in a pill. Always announced with its noun, "2 items", never as a bare
 * number that means nothing out of context (AC-10). Written as every count on
 * the page is, `3,000` from 1,000 (`countText`; spec 0017, as built).
 */
export function CountBadge({ count, noun, tone, compact = false }: CountBadgeProps) {
  const word = count === 1 ? noun.one : noun.other;

  return (
    <span className={badge({ tone })}>
      {countText(count)}
      {compact ? <span className="sr-only">{` ${word}`}</span> : ` ${word}`}
    </span>
  );
}
