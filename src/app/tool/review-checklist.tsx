import { SearchCheck } from "lucide-react";

import {
  BLOCKED_REASON_TEXT,
  COVERAGE_NOTE,
  COVERAGE_NOTE_PARTLY,
  DETECTOR_LABELS,
  NOTHING_FOUND,
  NOTHING_FOUND_PARTLY,
} from "@/lib/detectors";
import { CONCEALED_TEXT } from "@/lib/page-findings";
import { DETECTOR_KINDS, type MatchId, type ReviewMatch } from "@/worker/protocol";
import { Callout } from "@/ui/callout";
import { Card } from "@/ui/card";
import { ChecklistGroup } from "@/ui/checklist-group";
import { ChecklistItem } from "@/ui/checklist-item";
import { EmptyState } from "@/ui/empty-state";

interface ReviewChecklistProps {
  readonly matches: readonly ReviewMatch[];
  /** The session's tick set (spec 0002). The only source of what is checked. */
  readonly ticked: ReadonlySet<MatchId>;
  /** A run is under way, so no tick may change (AC-13). */
  readonly running: boolean;
  /**
   * Some page carries a warning (spec 0006, AC-26), so the note and the empty
   * state speak only for the pages RedactNest could read.
   */
  readonly partly: boolean;
  readonly onToggle: (id: MatchId) => void;
}

/**
 * What detection found, to tick or leave. Spec 0005, AC-13 and AC-14.
 *
 * The thin checklist feature 6 places on `/tool`: one group per kind that has
 * a match, in `DETECTOR_KINDS` order, and one row per match in the order the
 * worker sent them, which is by page, then reading order (AC-3). A blocked row
 * is listed, disabled, with its reason, so nobody believes it is gone. Feature
 * 8 owns the final layout, select all and the summary.
 *
 * Rendered by `tool-client` outside the polite live region: a list this long
 * read out as it appeared would drown the phase line. The coverage note sits
 * above it always, so a short list, or an empty one, never reads as a
 * complete redaction.
 */
export function ReviewChecklist({
  matches,
  ticked,
  running,
  partly,
  onToggle,
}: ReviewChecklistProps) {
  const groups = DETECTOR_KINDS.map((kind) => ({
    kind,
    rows: matches.filter((match) => match.type === kind),
  })).filter(({ rows }) => rows.length > 0);
  const nothingFound = partly ? NOTHING_FOUND_PARTLY : NOTHING_FOUND;

  return (
    <div data-testid="review" className="flex flex-col gap-4">
      <Callout tone="info" data-testid="coverage">
        {partly ? COVERAGE_NOTE_PARTLY : COVERAGE_NOTE}
      </Callout>

      <Card title="What RedactNest found" data-testid="checklist">
        {groups.length === 0 ? (
          <EmptyState
            icon={SearchCheck}
            title={nothingFound.title}
            helper={nothingFound.helper}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map(({ kind, rows }) => {
              const { icon, label, noun } = DETECTOR_LABELS[kind];
              return (
                <ChecklistGroup
                  key={kind}
                  icon={icon}
                  label={label}
                  count={rows.length}
                  noun={noun}
                >
                  {rows.map((match) => (
                    <ChecklistItem
                      key={match.id}
                      id={`match-${match.id}`}
                      text={match.text}
                      before={match.before}
                      after={match.after}
                      page={match.page}
                      checked={ticked.has(match.id)}
                      disabled={running}
                      blockedReason={
                        match.blocked === null
                          ? undefined
                          : BLOCKED_REASON_TEXT[match.blocked]
                      }
                      concealedNote={
                        match.concealed === null
                          ? undefined
                          : CONCEALED_TEXT[match.concealed]
                      }
                      onCheckedChange={() => onToggle(match.id)}
                    />
                  ))}
                </ChecklistGroup>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
