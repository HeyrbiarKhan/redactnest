import { cx } from "@/lib/cx";

export interface SummaryItem {
  /** The label, such as "Removed". */
  readonly term: string;
  readonly description: string;
}

interface SummaryListProps {
  readonly items: readonly SummaryItem[];
  readonly "data-testid"?: string;
  /** Layout only. */
  readonly className?: string;
}

/**
 * Term and description pairs, as a native definition list, so a screen reader
 * hears each label with what it names. Spec 0003's summary panel, first placed
 * by the result card (spec 0007, AC-11).
 *
 * Plain text only, rendered as React text, so a description built from
 * anything a document holds is escaped rather than parsed (INV-7). A term sits
 * beside its description from `sm` up and above it below that, and a long
 * description wraps rather than widening the page.
 */
export function SummaryList({
  items,
  "data-testid": testId,
  className,
}: SummaryListProps) {
  return (
    <dl
      data-testid={testId}
      className={cx("flex flex-col divide-y divide-border", className)}
    >
      {items.map(({ term, description }) => (
        <div
          key={term}
          className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-4"
        >
          <dt className="shrink-0 text-small font-medium text-ink-muted sm:w-36 sm:pt-0.5">
            {term}
          </dt>
          <dd className="min-w-0 text-ink wrap-break-word">{description}</dd>
        </div>
      ))}
    </dl>
  );
}
