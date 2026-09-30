import type { Ref } from "react";

import { Button } from "@/ui/button";
import { Card } from "@/ui/card";

interface ActionPanelProps {
  /** How many will be removed, from `tickCountLine`, or null to leave it out. */
  readonly line: string | null;
  /** The main action's label, from `redactLabel`. */
  readonly label: string;
  /** A run is under way, so Cancel takes the main action's place (AC-10). */
  readonly running: boolean;
  readonly onRedact: () => void;
  readonly onCancel: () => void;
  readonly redactRef?: Ref<HTMLButtonElement>;
  readonly cancelRef?: Ref<HTMLButtonElement>;
}

/**
 * The count line and the one main action, above the checklist. Spec 0007,
 * AC-5, AC-6 and AC-10.
 *
 * Outside every live region on purpose: a button appearing is not news, and a
 * count read out on every tick would talk over the checkbox that changed it.
 * What a run is doing is announced by the phase line instead. At `complete`
 * the result card takes this panel's place (AC-11).
 */
export function ActionPanel({
  line,
  label,
  running,
  onRedact,
  onCancel,
  redactRef,
  cancelRef,
}: ActionPanelProps) {
  return (
    <Card
      data-testid="action-panel"
      className="sm:flex-row sm:items-center sm:justify-between"
    >
      {line !== null && (
        <p data-testid="tick-count" className="text-ink">
          {line}
        </p>
      )}
      <div className="flex shrink-0 flex-wrap gap-3 sm:ml-auto">
        {running ? (
          <Button
            ref={cancelRef}
            variant="secondary"
            size="lg"
            data-testid="cancel"
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : (
          <Button ref={redactRef} size="lg" data-testid="redact" onClick={onRedact}>
            {label}
          </Button>
        )}
      </div>
    </Card>
  );
}
