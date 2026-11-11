import type { ComponentPropsWithRef, ReactNode } from "react";

import { cx } from "@/lib/cx";

interface TextFieldProps extends Omit<
  ComponentPropsWithRef<"input">,
  "className" | "id" | "type" | "size"
> {
  /** The input's id, and the stem of the label's. */
  readonly id: string;
  /** Always shown, above the field, so the field is never named by a placeholder. */
  readonly label: ReactNode;
  /** Sits at the end of the field's row, usually a `Button`. */
  readonly action?: ReactNode;
  /** Layout only (margins, alignment, placement). Never colour or size. */
  readonly className?: string;
}

/**
 * One line of text, labelled. Spec 0003, *Primitives*, as spec 0017 adds it.
 *
 * A native `input` under a visible `label`, so the browser owns typing,
 * pasting and the keyboard, and a screen reader hears the label as the name.
 * The caller passes every attribute the field needs (spec 0017, AC-23 turns
 * off form history and spelling services), and reads and sets its value.
 *
 * The edge is `border-strong`, which holds 3:1 against the card's `surface`,
 * so the field is found without its label (WCAG 1.4.11). Read only keeps the
 * look but takes the `subtle` fill, the same as a disabled control's, with
 * the ink kept, so a field that is waiting still reads; disabled takes the
 * disabled look every control shares (spec 0003, `src/ui/AGENTS.md`). The
 * height is a minimum, never fixed, and the focus ring is the base rule's.
 */
export function TextField({ id, label, action, className, ...input }: TextFieldProps) {
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="text-small font-medium text-ink">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <input
          {...input}
          id={id}
          type="text"
          className={cx(
            "min-h-10 w-full min-w-0 rounded-lg border border-border-strong bg-surface px-3 py-2 text-body text-ink",
            "read-only:bg-subtle",
            "disabled:border-border disabled:bg-subtle disabled:text-ink-muted",
            "transition-[background-color,border-color] duration-150 motion-reduce:transition-none",
            "sm:flex-1",
          )}
        />
        {action}
      </div>
    </div>
  );
}
