"use client";

import { Check, Minus } from "lucide-react";
import { useEffect, useRef } from "react";

interface CheckboxProps {
  readonly id: string;
  readonly checked: boolean;
  /** Only the caller sets it, and a click clears it, as a native checkbox does. */
  readonly indeterminate?: boolean;
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
 */
export function Checkbox({
  id,
  checked,
  indeterminate = false,
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
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer size-6 cursor-pointer appearance-none rounded-md border border-border-strong bg-surface transition-[background-color,border-color] duration-150 checked:border-accent checked:bg-accent indeterminate:border-accent indeterminate:bg-accent motion-reduce:transition-none forced-colors:appearance-auto"
      />
      <Check
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto hidden size-4 text-on-accent peer-checked:block peer-indeterminate:hidden forced-colors:hidden!"
      />
      <Minus
        aria-hidden="true"
        strokeWidth={3}
        className="pointer-events-none absolute inset-0 m-auto hidden size-4 text-on-accent peer-indeterminate:block forced-colors:hidden!"
      />
    </span>
  );
}
