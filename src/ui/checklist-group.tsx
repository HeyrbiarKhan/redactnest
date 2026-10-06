import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { CountBadge, type CountNoun } from "./count-badge";

interface ChecklistGroupProps {
  readonly icon: LucideIcon;
  readonly label: string;
  /** Derived by the caller from the matches of this kind. */
  readonly count: number;
  readonly noun: CountNoun;
  /** `ChecklistItem` rows. */
  readonly children: ReactNode;
}

/**
 * One kind of match, collapsible, open on first render.
 *
 * A native `details`, so the browser owns opening and closing, the keyboard
 * (Enter and Space on the summary) and the expanded state a screen reader
 * hears. Nothing remembers whether it was open (INV-9).
 *
 * The summary holds no interactive element, because a control inside one is
 * unreachable in some browsers and doubly announced in others. A "select all"
 * for the group belongs in the card header or as the group's first row.
 */
export function ChecklistGroup({
  icon: Icon,
  label,
  count,
  noun,
  children,
}: ChecklistGroupProps) {
  return (
    <details open className="group">
      <summary className="flex min-h-12 list-none items-center gap-3 rounded-lg px-3 py-2 transition-[background-color] duration-150 hover:bg-canvas motion-reduce:transition-none [&::-webkit-details-marker]:hidden">
        <Icon
          aria-hidden="true"
          className="size-5 shrink-0 text-accent"
          strokeWidth={1.75}
        />
        <span className="min-w-0 font-semibold text-ink wrap-break-word">{label}</span>
        <CountBadge count={count} noun={noun} tone="neutral" compact />
        <ChevronDown
          aria-hidden="true"
          strokeWidth={1.75}
          className="ml-auto size-5 shrink-0 text-ink-muted transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <ul className="flex flex-col">{children}</ul>
    </details>
  );
}
