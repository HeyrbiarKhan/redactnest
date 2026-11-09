import type { LucideIcon } from "lucide-react";

import { IconCircle } from "./icon-circle";

export interface FeatureItem {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly body: string;
}

/**
 * A short list of what the product does, each with an accent line icon, a
 * title and one line. Spec 0013, AC-10: the home page's trio, and feature 15's
 * search pages after it.
 *
 * A real `ul`, three columns from `md` and one below, with `role="list"` kept
 * on it because Safari drops a list's semantics once its bullets are removed.
 * The icon sits above the words while the columns are narrow and beside them
 * from `lg`. The icon is decoration, so it is hidden from assistive
 * technology; the title is a heading at the level the caller's outline needs,
 * so a screen reader can jump between them.
 *
 * Below `md`, where the items stack in one column, each is centred, the icon
 * over its title and line, so the stack reads as three equal points rather
 * than a list hugging the left edge. Side by side they line up at the start
 * again. Every caller gets this, feature 15's search pages included (spec
 * 0013, AC-10, as feature 28 builds it).
 */
export function FeatureList({
  items,
  headingLevel = 2,
}: {
  readonly items: readonly FeatureItem[];
  readonly headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <ul role="list" className="grid gap-8 md:grid-cols-3">
      {items.map(({ icon, title, body }) => (
        <li
          key={title}
          className="flex flex-col items-center gap-3 text-center md:items-start md:text-start lg:flex-row lg:gap-4"
        >
          <IconCircle icon={icon} tone="accent" />
          <div className="flex flex-col gap-1">
            <Heading className="text-heading text-ink">{title}</Heading>
            <p className="text-small text-ink-muted">{body}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
