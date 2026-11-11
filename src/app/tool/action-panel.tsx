import { useId, type Ref } from "react";

import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

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
  readonly onRedact: () => void;
  readonly onCancel: () => void;
  readonly redactRef?: Ref<HTMLButtonElement>;
  readonly cancelRef?: Ref<HTMLButtonElement>;
}

/**
 * The count line, the one main action and the lock line beneath them, the
 * rail's last block. Spec 0007, AC-5, AC-6 and AC-10, and spec 0013, AC-16
 * and AC-17.
 *
 * From `lg` it sticks 1.5rem from the top, so Redact and Cancel stay in reach
 * beside a long list. It can never cover anything: nothing follows it in the
 * rail, and the list is in the other column. Below `lg` the page is one column
 * and it scrolls like everything else, so at a narrow window or a large text
 * size it never sits over what has focus (WCAG 2.4.11, INV-6). `lg` is the
 * tool grid's container query, so doubling the text turns it off as well.
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
  onRedact,
  onCancel,
  redactRef,
  cancelRef,
}: ActionPanelProps) {
  const waitingId = useId();
  return (
    <Card data-testid="action-panel" className="@min-[61rem]:sticky @min-[61rem]:top-6">
      {line !== null && (
        <p data-testid="tick-count" className="text-ink">
          {line}
        </p>
      )}
      {waiting !== null && (
        <p id={waitingId} data-testid="make-waits" className="text-small text-ink">
          {waiting}
        </p>
      )}
      {/* Full width on a phone and in the rail; its own width between. */}
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
    </Card>
  );
}
