"use client";

import { cx } from "@/lib/cx";

import { Checkbox } from "./checkbox";

/** What the box shows: every row ticked, none, or some. */
export type SelectAllState = "checked" | "clear" | "mixed";

interface ChecklistSelectAllProps {
  /** The checkbox's id, and the stem of the id that names it. */
  readonly id: string;
  /** Its whole name, such as "Select all 3 email addresses". */
  readonly label: string;
  readonly state: SelectAllState;
  /** Nothing can change for now, such as while a run is under way. */
  readonly disabled?: boolean;
  /**
   * Called with what the rows should become: ticked when the box shows clear
   * or mixed, cleared when it shows checked. Decided from what the box shows,
   * never from the event, so a mixed box always ticks the rest.
   */
  readonly onChange: (on: boolean) => void;
  readonly "data-testid"?: string;
}

/**
 * A group's select all, as the group's first row (spec 0003, and spec 0007,
 * AC-7). A native checkbox, mixed through `indeterminate` when some rows are
 * ticked and some are not, so a screen reader says "mixed" rather than
 * guessing. The whole row is its label and its target, as a match row is, and
 * a quiet edge beneath sets it apart from the rows it acts on.
 */
export function ChecklistSelectAll({
  id,
  label,
  state,
  disabled = false,
  onChange,
  "data-testid": testId,
}: ChecklistSelectAllProps) {
  const labelId = `${id}-label`;

  return (
    <li data-testid={testId} className="border-b border-border pb-1">
      <label
        htmlFor={id}
        className={cx(
          "flex items-center gap-3 rounded-lg px-3 py-3",
          // The cursor comes from the one rule in `globals.css` (spec 0013, AC-33).
          !disabled &&
            "transition-colors duration-150 hover:bg-canvas motion-reduce:transition-none",
        )}
      >
        <Checkbox
          id={id}
          checked={state === "checked"}
          indeterminate={state === "mixed"}
          disabled={disabled}
          onCheckedChange={() => onChange(state !== "checked")}
          aria-labelledby={labelId}
        />
        <span id={labelId} className="min-w-0 font-medium text-ink wrap-break-word">
          {label}
        </span>
      </label>
    </li>
  );
}
