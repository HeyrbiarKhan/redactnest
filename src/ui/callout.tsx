import { cva } from "class-variance-authority";
import { CircleAlert, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { AriaRole, ReactNode, Ref } from "react";

import { cx } from "@/lib/cx";

export type CalloutTone = "warning" | "info" | "danger";

interface CalloutProps {
  readonly tone: CalloutTone;
  readonly title?: ReactNode;
  /** The title becomes this heading when set, and a plain paragraph otherwise. */
  readonly headingLevel?: 2 | 3;
  /**
   * A short line above the title that says what kind of thing this is, such
   * as "Your last run was stopped", so the title can say what happened.
   */
  readonly lead?: string;
  /**
   * Makes a heading title a place focus can be moved to, for a page that moves
   * focus to a callout it has just shown (spec 0007, *Focus*). It gets
   * `tabIndex={-1}`, so it stays out of the tab order.
   */
  readonly titleRef?: Ref<HTMLHeadingElement>;
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
}

const TONE: Readonly<Record<CalloutTone, ToneStyle>> = Object.freeze({
  warning: Object.freeze({ icon: TriangleAlert, word: "Warning" }),
  info: Object.freeze({ icon: Info, word: "Note" }),
  danger: Object.freeze({ icon: CircleAlert, word: "Error" }),
});

const box = cva(
  "flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-start",
  {
    variants: {
      tone: {
        warning: "border-warning-border bg-warning-bg",
        info: "border-info-border bg-info-bg",
        danger: "border-danger-border bg-danger-bg",
      },
    },
  },
);

const glyph = cva("mt-0.5 size-5 shrink-0", {
  variants: {
    tone: {
      warning: "text-warning-icon",
      info: "text-info-icon",
      danger: "text-danger-icon",
    },
  },
});

/**
 * A warning callout's words are `warning-ink` throughout (8.75:1 on
 * `warning-bg`), as the mockups draw them; the other tones keep `ink` for the
 * title and `ink-muted` under it (spec 0026, AC-1).
 */
const titleInk = cva("text-body font-semibold", {
  variants: {
    tone: { warning: "text-warning-ink", info: "text-ink", danger: "text-ink" },
  },
});

const bodyInk = cva("flex flex-col gap-1 wrap-break-word", {
  variants: {
    tone: { warning: "text-warning-ink", info: "", danger: "" },
    titled: { true: "text-small", false: "text-body" },
  },
  compoundVariants: [
    { tone: ["info", "danger"], titled: true, class: "text-ink-muted" },
    { tone: ["info", "danger"], titled: false, class: "text-ink" },
  ],
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
  lead,
  titleRef,
  children,
  action,
  role,
  "data-testid": testId,
}: CalloutProps) {
  const style = TONE[tone];
  const Icon = style.icon;
  const titled = title !== undefined && title !== null;
  const titleClass = titleInk({ tone });
  const focusable = titleRef ? { ref: titleRef, tabIndex: -1 } : {};
  const heading =
    headingLevel === 3 ? (
      <h3 {...focusable} className={titleClass}>
        {title}
      </h3>
    ) : headingLevel === 2 ? (
      <h2 {...focusable} className={titleClass}>
        {title}
      </h2>
    ) : (
      <p className={titleClass}>{title}</p>
    );

  return (
    <div role={role} data-testid={testId} className={box({ tone })}>
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon aria-hidden="true" className={glyph({ tone })} strokeWidth={1.75} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="sr-only">{`${style.word}: `}</span>
          {lead !== undefined && (
            <p
              className={cx(
                "text-small font-medium",
                tone === "warning" ? "text-warning-ink" : "text-ink-muted",
              )}
            >
              {lead}
            </p>
          )}
          {titled && heading}
          {children !== undefined && children !== null && (
            <div className={bodyInk({ tone, titled })}>{children}</div>
          )}
        </div>
      </div>
      {action && <div className="shrink-0 pl-8 sm:pl-0">{action}</div>}
    </div>
  );
}
