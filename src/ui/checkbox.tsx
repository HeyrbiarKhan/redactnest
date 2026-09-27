"use client";

import { Check, Minus } from "lucide-react";
import { useEffect, useRef } from "react";

interface CheckboxProps {
  readonly id: string;
  readonly checked: boolean;
  /** Only the caller sets it, and a click clears it, as a native checkbox does. */
  readonly indeterminate?: boolean;
  /**
   * A native disabled checkbox: the browser keeps it out of the tab order and
   * ignores clicks on it. Spec 0005 disables a row the engine would refuse, and
   * every row while a run is under way.
   */
  readonly disabled?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly "aria-labelledby"?: string;
  readonly "aria-describedby"?: string;
}

/**
 * A native checkbox, drawn by us and operated by the browser (INV-4).
 *
 * `appearance-none` hands the box to our tokens, and a sibling icon draws the
 * tick. In forced colours mode it hands the box straight back to the browser
 * (`appearance-auto`) and hides the drawn tick, because the system's own
 * checkbox is the one the visitor's colours are guaranteed to reach (AC-17).
 *
 * Disabled, it takes the disabled button's look (spec 0003): the `subtle`
 * fill, a `border` edge, and the tick in `ink-muted`, which is 5.51:1 on
 * `subtle`. The accent fill applies only while enabled, so a disabled box can
 * never look like one that still acts.
 */
export function Checkbox({
  id,
  checked,
  indeterminate = false,
  disabled = false,
  onCheckedChange,
  ...aria
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null);

  // `indeterminate` exists only as a DOM property, never as an attribute, so it
  // is set by hand. Rerun on `checked` too, because a click clears the property
  // and the props stay the source of truth for what the box shows.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate, checked]);

  return (
    <span className="relative inline-flex size-6 shrink-0">
      <input
        {...aria}
        ref={ref}
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer size-6 cursor-pointer appearance-none rounded-md border border-border-strong bg-surface transition-[background-color,border-color] duration-150 enabled:checked:border-accent enabled:checked:bg-accent enabled:indeterminate:border-accent enabled:indeterminate:bg-accent disabled:cursor-not-allowed disabled:border-border disabled:bg-subtle motion-reduce:transition-none forced-colors:appearance-auto"
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto hidden size-4 text-on-accent peer-checked:block peer-indeterminate:hidden peer-disabled:text-ink-muted forced-colors:hidden!"
      />
      <Minus
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto hidden size-4 text-on-accent peer-indeterminate:block peer-disabled:text-ink-muted forced-colors:hidden!"
      />
    </span>
  );
}
