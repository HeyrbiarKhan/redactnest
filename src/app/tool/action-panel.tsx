import { useId, type Ref } from "react";

import { UNTICK_ALL } from "@/lib/flow-text";
import { Button } from "@/ui/button";

import { LockLine } from "./lock-line";

interface ActionPanelProps {
  /** How many will be removed, from `tickCountLine`, or null to leave it out. */
  readonly line: string | null;
  /** The main action's label, from `redactLabel`. */
  readonly label: string;
  /** A run is under way, so Cancel takes the main action's place (AC-10). */
  readonly running: boolean;
  /**
   * Why the main action cannot run yet, or null (spec 0017, AC-18): a custom
   * term still searching, or not searched. The button stays in place, cannot
   * run and is described by this line.
   */
  readonly waiting?: string | null;
  /** Whether anything is ticked, so Untick all has something to do. */
  readonly anyTicked: boolean;
  readonly onRedact: () => void;
  readonly onCancel: () => void;
  readonly onUntickAll: () => void;
  readonly redactRef?: Ref<HTMLButtonElement>;
  readonly cancelRef?: Ref<HTMLButtonElement>;
}

/**
 * The count line with Untick all, the one main action and the lock line
 * beneath them. Spec 0007, AC-5, AC-6 and AC-10, laid out as spec 0026 AC-12
 * has it.
 *
 * In the page it is B's last block, after the plan card and any refusal and
 * before the list, so it is reached before the list at every width. From `lg`
 * with a document on the page, B is `display: contents` and this panel is a
 * grid item of its own, placed in C's area at its end: at the list's end it
 * rests in C's bottom padding (`--tool-panel-room`), under the last row. In a
 * window at least 36rem tall it also sticks to the window's foot, so the count,
 * Untick all, Redact or Cancel and the lock line stay in reach over a long
 * list. An opaque `surface` fill and a `border` edge, no shadow, so a row
 * passing under it never shows through and forced colours keep its edge. Below
 * `lg` (the tool grid's container query, so 200% text counts) and in a short
 * window it scrolls like everything else. A focused control in the column
 * never ends up under it: the column's scroll margin and the tool grid's
 * `focusin` fallback see to that (WCAG 2.2, 2.4.11).
 *
 * Outside every live region on purpose: a button appearing is not news, and a
 * count read out on every tick would talk over the checkbox that changed it.
 * What a run is doing is announced by the phase line instead. At `complete`
 * the result card takes this panel's place (AC-11), and is never sticky.
 */
export function ActionPanel({
  line,
  label,
  running,
  waiting = null,
  anyTicked,
  onRedact,
  onCancel,
  onUntickAll,
  redactRef,
  cancelRef,
}: ActionPanelProps) {
  const waitingId = useId();
  return (
    <div
      data-testid="action-panel"
      className={
        "flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-5 " +
        "@min-[61rem]:z-10 @min-[61rem]:self-end @min-[61rem]:[grid-area:c] " +
        "@min-[61rem]:tall:sticky @min-[61rem]:tall:bottom-0"
      }
    >
      {line !== null && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p data-testid="tick-count" className="text-ink">
            {line}
          </p>
          {/*
            Only beside a count, so never when nothing was found, and gone
            while a run works, when no tick can change. It stays in place and
            cannot run while nothing is ticked, so focus on it is never lost
            once it has done its work.
          */}
          {!running && (
            <Button
              variant="link"
              data-testid="untick-all"
              unavailable={!anyTicked}
              onClick={onUntickAll}
              className="ml-auto"
            >
              {UNTICK_ALL}
            </Button>
          )}
        </div>
      )}
      {waiting !== null && (
        <p id={waitingId} data-testid="make-waits" className="text-small text-ink">
          {waiting}
        </p>
      )}
      {/* Full width on a phone and in the column; its own width between. */}
      {running ? (
        <Button
          ref={cancelRef}
          variant="secondary"
          size="lg"
          data-testid="cancel"
          onClick={onCancel}
          className="w-full sm:w-auto sm:self-start @min-[61rem]:w-full"
        >
          Cancel
        </Button>
      ) : (
        <Button
          ref={redactRef}
          size="lg"
          data-testid="redact"
          unavailable={waiting !== null}
          aria-describedby={waiting !== null ? waitingId : undefined}
          onClick={onRedact}
          className="w-full sm:w-auto sm:self-start @min-[61rem]:w-full"
        >
          {label}
        </Button>
      )}
      <LockLine className="justify-center sm:justify-start @min-[61rem]:justify-center" />
    </div>
  );
}
