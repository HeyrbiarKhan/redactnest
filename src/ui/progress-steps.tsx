import { Check, Circle } from "lucide-react";

/**
 * The turning ring, drawn here rather than through `Spinner`, whose test id
 * the page's own polite region already uses for the spinner beside the phase
 * line. Track `accent-soft`, arc `accent`.
 */
function Ring({ size }: { readonly size: "sm" | "md" }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className={
        size === "md" ? "size-9 shrink-0 animate-spin" : "size-4.5 shrink-0 animate-spin"
      }
    >
      <circle cx="12" cy="12" r="9" strokeWidth="3" className="stroke-accent-soft" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        strokeWidth="3"
        strokeLinecap="round"
        className="stroke-accent"
      />
    </svg>
  );
}

export type ProgressStepState = "done" | "current" | "next";

export interface ProgressStep {
  readonly label: string;
  readonly state: ProgressStepState;
}

interface ProgressStepsProps {
  /** Such as "Redacting…". */
  readonly title: string;
  /** The current step's line, as the polite region also says it. */
  readonly line: string;
  readonly steps: readonly ProgressStep[];
  /** The steps done over the list's length, from 0 to 1. */
  readonly fraction: number;
  /** Each state in words, read after its step's label, so a tick is never the only sign. */
  readonly stateText: Readonly<Record<ProgressStepState, string>>;
  readonly "data-testid"?: string;
}

/**
 * The steps of an open or a run, with a bar that fills step by step (spec
 * 0026, child 0003, AC-31). Presentation only: the caller works out each
 * step's state from the latest phase and passes every word.
 *
 * Not a live region. The page's own polite region keeps announcing the phase
 * line as it always has, so nothing is said twice. The bar is decoration
 * (`aria-hidden`), because the list says the same thing in words. Under
 * reduced motion the ring stops turning and the bar jumps rather than eases,
 * both through the one rule in `globals.css`.
 */
export function ProgressSteps({
  title,
  line,
  steps,
  fraction,
  stateText,
  "data-testid": testId,
}: ProgressStepsProps) {
  const percent = Math.round(Math.min(1, Math.max(0, fraction)) * 100);

  return (
    <div data-testid={testId} className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Ring size="md" />
        <div className="flex min-w-0 flex-col">
          <p className="font-semibold text-ink">{title}</p>
          <p className="text-small text-ink-muted">{line}</p>
        </div>
      </div>

      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-slow"
          style={{ width: `${percent}%` }}
        />
      </div>

      <ol role="list" className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3 text-small">
            <span className="inline-flex size-5 shrink-0 items-center justify-center">
              {step.state === "done" ? (
                <Check
                  aria-hidden="true"
                  className="size-4.5 animate-tick-in text-accent"
                  strokeWidth={2.25}
                />
              ) : step.state === "current" ? (
                <Ring size="sm" />
              ) : (
                <Circle
                  aria-hidden="true"
                  className="size-4.5 text-border-strong"
                  strokeWidth={1.75}
                />
              )}
            </span>
            <span className={step.state === "next" ? "text-ink-muted" : "text-ink"}>
              {step.label}
              <span className="sr-only">{`, ${stateText[step.state]}`}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
