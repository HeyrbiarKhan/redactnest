import type { LucideIcon } from "lucide-react";

import { IconCircle } from "./icon-circle";

interface EmptyStateProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly helper: string;
}

/** Where a list would be if it had anything in it: a muted icon, a title, one line. */
export function EmptyState({ icon, title, helper }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <IconCircle icon={icon} tone="neutral" size="lg" />
      <p className="text-heading text-ink">{title}</p>
      <p className="max-w-xs text-small text-ink-muted">{helper}</p>
    </div>
  );
}
