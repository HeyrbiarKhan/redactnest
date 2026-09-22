"use client";

import { Checkbox } from "./checkbox";

interface ChecklistItemProps {
  /** The checkbox's id, and the stem of the ids that name and describe it. */
  readonly id: string;
  /** The match itself. */
  readonly text: string;
  /** The characters either side of it, already capped by spec 0002, INV-9. */
  readonly before: string;
  readonly after: string;
  readonly page: number;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}

/**
 * One match to tick or leave: the match, its page, and the text around it.
 *
 * The whole row is the checkbox's label, so it is the click target (AC-7). The
 * checkbox is *named* by the match alone and *described* by the page and the
 * context line, so a screen reader says "alex@example.com, checkbox, checked"
 * first and the detail after (AC-9).
 *
 * Every string here came out of somebody's PDF and is untrusted. It is rendered
 * only as React text, which escapes it (INV-7). Both lines wrap anywhere, so a
 * long unbroken email or file name wraps instead of being cut off.
 */
export function ChecklistItem({
  id,
  text,
  before,
  after,
  page,
  checked,
  onCheckedChange,
}: ChecklistItemProps) {
  const textId = `${id}-text`;
  const pageId = `${id}-page`;
  const contextId = `${id}-context`;

  return (
    <li>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-canvas motion-reduce:transition-none"
      >
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-labelledby={textId}
          aria-describedby={`${pageId} ${contextId}`}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-start justify-between gap-3">
            <span id={textId} className="min-w-0 font-medium text-ink wrap-anywhere">
              {text}
            </span>
            <span id={pageId} className="shrink-0 text-small text-ink-muted">
              Page {page}
            </span>
          </span>
          <span id={contextId} className="text-small text-ink-muted wrap-anywhere">
            {before && `…${before}`}
            {/* Semibold as well as tinted, so the highlight is not colour alone (INV-8). */}
            <mark className="rounded-sm bg-accent-soft px-0.5 font-semibold text-ink">
              {text}
            </mark>
            {after && `${after}…`}
          </span>
        </span>
      </label>
    </li>
  );
}
