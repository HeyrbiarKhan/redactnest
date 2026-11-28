import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

/** One question and its answer, every word the caller's. */
export interface QuestionItem {
  readonly question: string;
  readonly answer: ReactNode;
}

/**
 * Questions as the browser's own disclosures (the owner's port of
 * `Main.dc.html`, 2026-11-25): no script, the first open. A small chevron
 * that turns down when open stands where the browser's marker was (hidden as
 * a list marker and, for Safari, as its own); CSS alone. One component for
 * `/` and `/pricing` (the marketing brief of 2026-11-28, item 6), so both
 * ask in the same pattern; the caller gives the heading and the width.
 */
export function QuestionList({ items }: { readonly items: readonly QuestionItem[] }) {
  return (
    <div className="border-t border-border">
      {items.map(({ question, answer }, index) => (
        <details
          key={question}
          open={index === 0}
          className="group border-b border-border py-4.5 wrap-break-word"
        >
          <summary className="flex list-none items-start gap-2.5 rounded-item text-body leading-6 font-semibold text-ink [&::-webkit-details-marker]:hidden">
            <ChevronRight
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 text-ink-subtle transition-transform duration-fast group-open:rotate-90"
              strokeWidth={2.25}
            />
            <span className="min-w-0">{question}</span>
          </summary>
          <p className="mt-2.5 text-copy leading-[1.6] text-ink-muted">{answer}</p>
        </details>
      ))}
    </div>
  );
}
