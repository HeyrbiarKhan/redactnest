import { CircleAlert } from "lucide-react";
import type { ReactNode, Ref } from "react";

import { REFUSAL_WHY } from "@/lib/flow-text";
import { sectionId } from "@/lib/policy-sections";
import { SECURITY_PATH } from "@/lib/routes";

/** The security page's own account of when RedactNest stops (spec 0018). */
const WHY_HREF = `${SECURITY_PATH}#${sectionId("whenItStops")}`;

interface FailureCalloutProps {
  /** What happened and what to do, from `failureText`, `runRefusalText` or `LOST_TEXT`. */
  readonly title: string;
  readonly body: string;
  readonly next?: string;
  /** A run refusal says what kind of thing this is above its title (AC-14). */
  readonly lead?: string;
  /** Where focus goes when the callout appears (spec 0007, *Focus*). */
  readonly titleRef?: Ref<HTMLHeadingElement>;
  readonly action?: ReactNode;
  /**
   * A row under the next step, for a way forward that takes more than one
   * control: the free cap's new tab link and its "Check my plan and open it
   * again" (spec 0012, AC-6). Its words come from `flow-text.ts` beside the
   * copy they follow.
   */
  readonly actions?: ReactNode;
  /**
   * A refusal, an open or a run RedactNest stopped on purpose, ends with a
   * link to why it stops (spec 0026, AC-12), by `SHOWS_WHY`. A cap or a lost
   * worker is not a refusal, so it has none.
   */
  readonly why?: boolean;
  readonly "data-testid": string;
}

/**
 * A failure, announced once as an alert: its title as a heading focus can move
 * to, what happened, and the next step, so it reads as the thing to do. Spec
 * 0007, AC-14 to AC-16, drawn as `ToolStates.dc.html`'s refused card (spec
 * 0026, AC-12): a `surface` card with a `border` edge, which forced colours
 * keep, a `danger-bg` tile holding the `danger-icon` mark, the title, what
 * happened in `ink-muted`, the next step in `ink` on a `muted` box, then the
 * way on full width and the link to why it stops.
 *
 * Rendered beside the polite region, never inside it, or a screen reader would
 * announce it twice (spec 0003, AC-12). Every word comes from the kind, the
 * frozen entitlement and, for a run refusal, whether anything is ticked
 * (INV-3), never from the document. The hidden "Error" word comes first, as
 * `Callout`'s does, so the tone is never told by colour alone.
 */
export function FailureCallout({
  title,
  body,
  next,
  lead,
  titleRef,
  action,
  actions,
  why,
  "data-testid": testId,
}: FailureCalloutProps) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex flex-col gap-4 rounded-panel border border-border bg-surface p-5.5 shadow-card"
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-danger-bg"
        >
          <CircleAlert className="size-5 text-danger-icon" strokeWidth={2} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="sr-only">Error: </span>
          {lead !== undefined && (
            <p className="text-small font-medium text-ink-muted">{lead}</p>
          )}
          <h2
            ref={titleRef}
            tabIndex={titleRef ? -1 : undefined}
            className="text-body font-semibold text-ink wrap-break-word"
          >
            {title}
          </h2>
        </div>
      </div>
      <p className="text-small text-ink-muted wrap-break-word">{body}</p>
      {next !== undefined && (
        <p className="rounded-control bg-muted p-3 text-small font-medium text-ink wrap-break-word">
          {next}
        </p>
      )}
      {actions !== undefined && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">{actions}</div>
      )}
      {action !== undefined && <div className="flex flex-col">{action}</div>}
      {/*
        A plain link: it leaves `/tool` for a page with its own policy, in
        `accent-strong` on `surface`, a pairing in the contrast contract. On a
        line of its own, so it keeps a 24 pixel target (WCAG 2.5.8).
      */}
      {why && (
        <p className="text-center">
          <a
            href={WHY_HREF}
            data-testid="refusal-why"
            className="inline-flex min-h-6 items-center rounded-item text-small font-medium text-accent-strong underline decoration-1 underline-offset-4"
          >
            {REFUSAL_WHY}
          </a>
        </p>
      )}
    </div>
  );
}
