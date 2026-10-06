import { Lock } from "lucide-react";

import { cx } from "@/lib/cx";
import { LOCK_LINE } from "@/lib/flow-text";

/**
 * "Your file never leaves your browser.", with the lock. Spec 0013, AC-14 to
 * AC-16: at the foot of the rail, and inside the action panel beneath Redact
 * while one shows, so it is always in view beside the one action that touches
 * the file. Not a live region: it never changes.
 */
export function LockLine({ className }: { readonly className?: string }) {
  return (
    <p
      data-testid="lock-line"
      className={cx("flex items-start gap-2 text-small text-ink-muted", className)}
    >
      <Lock
        aria-hidden="true"
        className="size-5 shrink-0 text-accent"
        strokeWidth={1.75}
      />
      <span>{LOCK_LINE}</span>
    </p>
  );
}
