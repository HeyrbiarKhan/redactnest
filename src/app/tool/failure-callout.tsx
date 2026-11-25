import type { ReactNode, Ref } from "react";

import { REFUSAL_WHY } from "@/lib/flow-text";
import { sectionId } from "@/lib/policy-sections";
import { SECURITY_PATH } from "@/lib/routes";
import { Callout } from "@/ui/callout";

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
 * to, what happened, and the next step in full ink so it reads as the thing to
 * do. Spec 0007, AC-14 to AC-16.
 *
 * Rendered beside the polite region, never inside it, or a screen reader would
 * announce it twice (spec 0003, AC-12). Every word comes from the kind, the
 * frozen entitlement and, for a run refusal, whether anything is ticked
 * (INV-3), never from the document.
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
    <Callout
      tone="danger"
      role="alert"
      data-testid={testId}
      title={title}
      headingLevel={2}
      lead={lead}
      titleRef={titleRef}
      action={action}
    >
      <p>{body}</p>
      {next !== undefined && <p className="font-medium text-ink">{next}</p>}
      {actions !== undefined && (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">{actions}</div>
      )}
      {/*
        A plain link: it leaves `/tool` for a page with its own policy, and
        ink rather than the accent, a pairing the contrast contract already
        holds on the danger tint (spec 0003, INV-1 to INV-3). On a line of
        its own, so it keeps a 24 pixel target (WCAG 2.5.8).
      */}
      {why && (
        <p>
          <a
            href={WHY_HREF}
            data-testid="refusal-why"
            className="inline-flex min-h-6 items-center rounded-item font-medium text-ink underline decoration-1 underline-offset-4"
          >
            {REFUSAL_WHY}
          </a>
        </p>
      )}
    </Callout>
  );
}
