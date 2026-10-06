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
 * The plan card in the tool's rail: the account's next step, from the page's
 * answer rather than any job's snapshot (spec 0012, AC-5; spec 0013, AC-18).
 *
 * Its own markup in a box, never a `Callout`, so no icon and no hidden tone
 * word join what is announced: an `info-bg` fill, an `info-border` edge. Its
 * links and Try again are `accent-strong` on that fill, a pairing in the
 * contrast contract (6.14:1). It never says the free plan covers part of a
 * document, because a document over the cap is refused whole (spec 0012,
 * AC-6).
 *
 * Its own polite status region, in the page from the start (empty until the
 * first answer) so its first announcement is heard. Until then the card is
 * visually hidden rather than drawn empty, which also keeps it out of the
 * rail's spacing; it stays in the accessibility tree either way. Try again
 * sits outside the region, so a change of words is heard without the button
 * read into it.
 */
export function PlanLine({ answer, checking, onTryAgain, lineRef }: PlanLineProps) {
  const line = answer === null ? null : planLine(answer);

  return (
    <div
      data-testid="plan-card"
      className={cx(
        "flex flex-wrap items-center gap-x-3 gap-y-1",
        line === null ? "sr-only" : "rounded-xl border border-info-border bg-info-bg p-5",
      )}
    >
      <p
        ref={lineRef}
        // A place Try again can hand focus to, once there are words to land
        // on: an empty line is no target at all (spec 0003, AC-7).
        tabIndex={line === null ? undefined : -1}
        role="status"
        data-testid="plan-line"
        className="text-ink"
      >
        {line !== null &&
          (checking
            ? `${PHASE_TEXT["checking-entitlement"]}…`
            : line.parts.map((part, index) =>
                typeof part === "string" ? (
                  <Fragment key={index}>{part}</Fragment>
                ) : (
                  <NewTabLink
                    key={index}
                    link={part}
                    className="font-medium text-accent-strong"
                  />
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
