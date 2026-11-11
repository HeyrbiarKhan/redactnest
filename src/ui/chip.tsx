import { X, type LucideIcon } from "lucide-react";
import type { Ref } from "react";

import { Spinner } from "./spinner";

interface ChipProps {
  /** What the chip names, such as a custom term as the visitor typed it. */
  readonly label: string;
  /** A short state after the label, such as "3 matches". */
  readonly status?: string;
  /** Drawn before the status and hidden from assistive technology. */
  readonly statusIcon?: LucideIcon;
  /** Work on this chip keeps the visitor waiting: a spinner before the status. */
  readonly busy?: boolean;
  /** The remove button's accessible name, such as "Remove Acme Ltd". */
  readonly removeLabel: string;
  readonly onRemove: () => void;
  readonly removeDisabled?: boolean;
  readonly removeRef?: Ref<HTMLButtonElement>;
  readonly "data-testid"?: string;
}

/**
 * One item in a list a visitor builds, with its state and a way to take it
 * out. Spec 0003, *Primitives*, as spec 0017 adds it for the custom terms.
 *
 * A list item, so the caller's `ul` (with `role="list"`) gives the count. The
 * label is the visitor's own words and renders only as React text (INV-7).
 * The state is words, with an icon beside them, so nothing rests on colour
 * (INV-8). Everything sits on `accent-soft`: `ink` and `ink-muted` hold 4.5:1
 * there, and so does the focus ring around the remove button, which is a
 * native `button` 32 pixels square, named by `removeLabel` alone because its
 * cross is decoration.
 */
export function Chip({
  label,
  status,
  statusIcon: StatusIcon,
  busy = false,
  removeLabel,
  onRemove,
  removeDisabled = false,
  removeRef,
  "data-testid": testId,
}: ChipProps) {
  return (
    <li
      data-testid={testId}
      className="flex max-w-full items-center gap-2 rounded-lg bg-accent-soft py-1 pr-1 pl-3"
    >
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-small">
        <span className="min-w-0 font-semibold text-ink wrap-anywhere">{label}</span>
        {(status !== undefined || busy) && (
          <span className="flex min-w-0 items-center gap-1.5 text-ink-muted">
            {busy ? (
              <Spinner size="sm" tone="current" />
            ) : (
              StatusIcon && (
                <StatusIcon
                  aria-hidden="true"
                  className="size-4 shrink-0"
                  strokeWidth={1.75}
                />
              )
            )}
            {status !== undefined && <span className="min-w-0">{status}</span>}
          </span>
        )}
      </span>
      <button
        ref={removeRef}
        type="button"
        aria-label={removeLabel}
        disabled={removeDisabled}
        onClick={onRemove}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-ink transition-[background-color] duration-150 enabled:hover:bg-surface disabled:text-ink-muted motion-reduce:transition-none"
      >
        <X aria-hidden="true" className="size-5" strokeWidth={1.75} />
      </button>
    </li>
  );
}
