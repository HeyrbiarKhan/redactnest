"use client";

import { Ban, EyeOff } from "lucide-react";

import { cx } from "@/lib/cx";

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
  /** Nothing can change for now, such as while a run is under way. */
  readonly disabled?: boolean;
  /**
   * Why this row can never be ticked (spec 0005, AC-8 and AC-13). The row is
   * disabled, and the reason shows under the context and joins the checkbox's
   * description, so a screen reader hears it with the row.
   */
  readonly blockedReason?: string;
  /**
   * How the page keeps this match from view (spec 0006, AC-24), such as
   * "Hidden under a box on the page.". The row stays tickable; the note shows
   * after any blocked reason and joins the checkbox's description.
   */
  readonly concealedNote?: string;
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
  disabled = false,
  blockedReason,
  concealedNote,
  onCheckedChange,
}: ChecklistItemProps) {
  const textId = `${id}-text`;
  const pageId = `${id}-page`;
  const contextId = `${id}-context`;
  const reasonId = `${id}-reason`;
  const noteId = `${id}-concealed`;
  const blocked = blockedReason !== undefined;
  const concealed = concealedNote !== undefined;
  const inactive = disabled || blocked;

  return (
    <li>
      <label
        htmlFor={id}
        className={cx(
          "flex items-start gap-3 rounded-lg px-3 py-3",
          inactive
            ? "cursor-not-allowed"
            : "cursor-pointer transition-colors duration-150 hover:bg-canvas motion-reduce:transition-none",
        )}
      >
        <Checkbox
          id={id}
          checked={checked}
          disabled={inactive}
          onCheckedChange={onCheckedChange}
          aria-labelledby={textId}
          aria-describedby={cx(
            pageId,
            contextId,
            blocked && reasonId,
            concealed && noteId,
          )}
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
          {blocked && (
            <span id={reasonId} className="flex items-start gap-2 text-small text-ink">
              {/* A shape as well as words, so the reason is not told by colour alone. */}
              <Ban
                aria-hidden="true"
                className="size-5 shrink-0 text-ink-muted"
                strokeWidth={1.75}
              />
              <span className="min-w-0">{blockedReason}</span>
            </span>
          )}
          {concealed && (
            <span id={noteId} className="flex items-start gap-2 text-small text-ink">
              {/* A shape as well as words, as the blocked reason has one. */}
              <EyeOff
                aria-hidden="true"
                className="size-5 shrink-0 text-ink-muted"
                strokeWidth={1.75}
              />
              <span className="min-w-0">{concealedNote}</span>
            </span>
          )}
        </span>
      </label>
    </li>
  );
}
