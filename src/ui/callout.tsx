import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AriaRole, ReactNode } from "react";

import { cx } from "@/lib/cx";

export type CalloutTone = "warning" | "info" | "danger";

interface CalloutProps {
  readonly tone: CalloutTone;
  readonly title?: ReactNode;
  /** The title becomes this heading when set, and a plain paragraph otherwise. */
  readonly headingLevel?: 2 | 3;
  readonly children?: ReactNode;
  /** Usually a secondary `Button`. */
  readonly action?: ReactNode;
  /**
   * None by default. The caller passes `alert` when the callout appears because
   * of something the visitor just did, so a callout that is simply part of the
   * page is never announced over whatever they were doing (AC-11).
   */
  readonly role?: AriaRole;
  readonly "data-testid"?: string;
}

interface ToneStyle {
  readonly icon: LucideIcon;
  /** Read first, so the tone is never carried by colour alone (INV-8). */
  readonly word: string;
  readonly box: string;
  readonly glyph: string;
}

const TONE: Readonly<Record<CalloutTone, ToneStyle>> = Object.freeze({
  warning: Object.freeze({
    icon: TriangleAlert,
    word: "Warning",
    box: "border-warning-border bg-warning-bg",
    glyph: "text-warning-icon",
  }),
  info: Object.freeze({
    icon: Info,
    word: "Note",
    box: "border-info-border bg-info-bg",
    glyph: "text-info-icon",
  }),
  danger: Object.freeze({
    icon: CircleAlert,
    word: "Error",
    box: "border-danger-border bg-danger-bg",
    glyph: "text-danger-icon",
  }),
});

/**
 * A tinted card that says something about the page: a warning, a note, or an
 * error. Each tone has its own icon shape and its own hidden word, and its edge
 * is a real border, so it stays outlined in forced colours mode (AC-17).
 */
export function Callout({
  tone,
  title,
  headingLevel,
  children,
  action,
  role,
  "data-testid": testId,
}: CalloutProps) {
  const style = TONE[tone];
  const Icon = style.icon;
  const titled = title !== undefined && title !== null;
  const Title = headingLevel === 3 ? "h3" : headingLevel === 2 ? "h2" : "p";

  return (
    <div
      role={role}
      data-testid={testId}
      className={cx(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start",
        style.box,
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon
          aria-hidden="true"
          className={cx("mt-0.5 size-5 shrink-0", style.glyph)}
          strokeWidth={1.75}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="sr-only">{`${style.word}: `}</span>
          {titled && <Title className="text-body font-semibold text-ink">{title}</Title>}
          {children !== undefined && children !== null && (
            <div
              className={cx(
                "flex flex-col gap-1 wrap-break-word",
                titled ? "text-small text-ink-muted" : "text-body text-ink",
              )}
            >
              {children}
            </div>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
