import { Fragment, type Ref } from "react";

import { cx } from "@/lib/cx";
import { NEW_TAB, PHASE_TEXT, planLine, type PlanLink } from "@/lib/flow-text";
import { Button } from "@/ui/button";
import type { EntitlementSnapshot } from "@/worker/protocol";

import { FOOTER_LINK_CLASS } from "../footer-link";

/**
 * A plan link: a plain `a` to a new tab, so the tool keeps the visitor's file
 * while they sign in or pay (spec 0012, AC-5 and AC-6), and never `next/link`,
 * so nothing prefetches an account page (INV-10). Sized as the terms line's
 * links are, a 24 pixel target, and underlined, so it is never told apart by
 * colour alone. The new tab is said to assistive technology after the label,
 * with the space outside the hidden words, because a name computed from a
 * hidden element's text trims its leading space.
 */
export function NewTabLink({
  link,
  className,
}: {
  readonly link: PlanLink;
  /** Colour and weight for where it sits; it inherits the text's otherwise. */
  readonly className?: string;
}) {
  return (
    <a
      href={link.href}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(FOOTER_LINK_CLASS, className)}
    >
      {link.label} <span className="sr-only">{`(${NEW_TAB})`}</span>
    </a>
  );
}

interface PlanLineProps {
  /** The page's answer, or null until the first one. */
  readonly answer: EntitlementSnapshot | null;
  /** While Try again's ask is out, so pressing it visibly does something. */
  readonly checking: boolean;
  readonly onTryAgain: () => void;
  /** Where focus goes when Try again leaves with the line it belonged to. */
  readonly lineRef?: Ref<HTMLParagraphElement>;
}

/**
 * The plan line directly above the drop zone: the account's next step, from
 * the page's answer rather than any job's snapshot (spec 0012, AC-5).
 *
 * Its own polite status region, in the page from the start (empty until the
 * first answer) so its first announcement is heard. Try again sits outside the
 * region, so a change of words is heard without the button read into it.
 */
export function PlanLine({ answer, checking, onTryAgain, lineRef }: PlanLineProps) {
  const line = answer === null ? null : planLine(answer);

  return (
    <div className="flex min-h-6 flex-wrap items-center gap-x-3">
      <p
        ref={lineRef}
        // A place Try again can hand focus to, once there are words to land
        // on: an empty line is no target at all (spec 0003, AC-7).
        tabIndex={line === null ? undefined : -1}
        role="status"
        data-testid="plan-line"
        className="text-small text-ink-muted"
      >
        {line !== null &&
          (checking
            ? `${PHASE_TEXT["checking-entitlement"]}…`
            : line.parts.map((part, index) =>
                typeof part === "string" ? (
                  <Fragment key={index}>{part}</Fragment>
                ) : (
                  <NewTabLink key={index} link={part} />
                ),
              ))}
      </p>
      {line?.tryAgain !== undefined && (
        <Button variant="link" data-testid="plan-try-again" onClick={onTryAgain}>
          {line.tryAgain}
        </Button>
      )}
    </div>
  );
}
