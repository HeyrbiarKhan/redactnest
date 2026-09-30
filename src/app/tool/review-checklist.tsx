import { SearchCheck } from "lucide-react";
import { memo, useMemo } from "react";

import {
  BLOCKED_REASON_TEXT,
  COVERAGE_NOTE,
  COVERAGE_NOTE_PARTLY,
  DETECTOR_LABELS,
  NOTHING_FOUND,
  NOTHING_FOUND_PARTLY,
} from "@/lib/detectors";
import { CONCEALED_TEXT } from "@/lib/page-findings";
import {
  DETECTOR_KINDS,
  type DetectorKind,
  type MatchId,
  type ReviewMatch,
} from "@/worker/protocol";
import { Callout } from "@/ui/callout";
import { Card } from "@/ui/card";
import { ChecklistGroup } from "@/ui/checklist-group";
import { ChecklistItem } from "@/ui/checklist-item";
import { ChecklistSelectAll, type SelectAllState } from "@/ui/checklist-select-all";
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
  /** Stable across renders, so an unchanged row is never rendered again. */
  readonly onToggle: (id: MatchId) => void;
  /** A group's select all, as one action (spec 0007, AC-7). Stable, likewise. */
  readonly onTicksSet: (ids: readonly MatchId[], on: boolean) => void;
}

interface Group {
  readonly kind: DetectorKind;
  readonly rows: readonly ReviewMatch[];
  /** The rows a tick can reach: every one that is not blocked. */
  readonly tickable: readonly MatchId[];
}

/**
 * The fewest tickable rows that earn a select all (spec 0007, AC-7). A rule
 * about the list's shape, not a cap on the visitor: with one row, the row's own
 * box already does the job.
 */
const SELECT_ALL_MIN = 2;

/** What a group's select all shows, counted once per tick change. */
function selectAllState(
  tickable: readonly MatchId[],
  ticked: ReadonlySet<MatchId>,
): SelectAllState {
  const on = tickable.reduce((count, id) => count + (ticked.has(id) ? 1 : 0), 0);
  if (on === 0) return "clear";
  return on === tickable.length ? "checked" : "mixed";
}

/**
 * What detection found, to tick or leave. Spec 0005, AC-13 and AC-14, and spec
 * 0007, AC-7 to AC-9.
 *
 * One group per kind that has a match, in `DETECTOR_KINDS` order, and one row
 * per match in the order the worker sent them, which is by page, then reading
 * order (AC-3). A blocked row is listed, disabled, with its reason, so nobody
 * believes it is gone. A group with two or more rows a tick can reach starts
 * with a select all row.
 *
 * Built for a long list (INV-7): the groups are built once per `matches`, and
 * each row is memoised on its match, its checked state and whether it is
 * disabled, with one stable toggle handler for all of them, so a tick renders
 * that row and its group's select all again and nothing else.
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
  onTicksSet,
}: ReviewChecklistProps) {
  const groups = useMemo<readonly Group[]>(
    () =>
      DETECTOR_KINDS.flatMap((kind) => {
        const rows = matches.filter((match) => match.type === kind);
        if (rows.length === 0) return [];
        const tickable = rows.filter((row) => row.blocked === null).map((row) => row.id);
        return [{ kind, rows, tickable }];
      }),
    [matches],
  );
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
            {groups.map(({ kind, rows, tickable }) => {
              const { icon, label, noun } = DETECTOR_LABELS[kind];
              return (
                <ChecklistGroup
                  key={kind}
                  icon={icon}
                  label={label}
                  count={rows.length}
                  noun={noun}
                >
                  {tickable.length >= SELECT_ALL_MIN && (
                    <SelectAllRow
                      kind={kind}
                      ids={tickable}
                      noun={noun.other}
                      state={selectAllState(tickable, ticked)}
                      disabled={running}
                      onTicksSet={onTicksSet}
                    />
                  )}
                  {rows.map((match) => (
                    <ReviewRow
                      key={match.id}
                      match={match}
                      checked={ticked.has(match.id)}
                      disabled={running}
                      onToggle={onToggle}
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

/**
 * One match's row, rendered again only when its match, its checked state or
 * whether it is disabled changes (spec 0007, AC-8 and INV-7). The per row
 * closure is made here, inside the memoised row, so the list hands every row
 * the same handler.
 */
const ReviewRow = memo(function ReviewRow({
  match,
  checked,
  disabled,
  onToggle,
}: {
  readonly match: ReviewMatch;
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: (id: MatchId) => void;
}) {
  return (
    <ChecklistItem
      id={`match-${match.id}`}
      text={match.text}
      before={match.before}
      after={match.after}
      beforeCut={match.beforeCut}
      afterCut={match.afterCut}
      page={match.page}
      checked={checked}
      disabled={disabled}
      blockedReason={
        match.blocked === null ? undefined : BLOCKED_REASON_TEXT[match.blocked]
      }
      concealedNote={
        match.concealed === null ? undefined : CONCEALED_TEXT[match.concealed]
      }
      onCheckedChange={() => onToggle(match.id)}
    />
  );
});

/**
 * A group's select all (spec 0007, AC-7): named for how many rows it reaches,
 * checked, clear or mixed by how many of those are ticked, and one `ticks-set`
 * over exactly those rows, so a blocked row never changes. Memoised, so a tick
 * in another group leaves it alone.
 */
const SelectAllRow = memo(function SelectAllRow({
  kind,
  ids,
  noun,
  state,
  disabled,
  onTicksSet,
}: {
  readonly kind: DetectorKind;
  readonly ids: readonly MatchId[];
  readonly noun: string;
  readonly state: SelectAllState;
  readonly disabled: boolean;
  readonly onTicksSet: (ids: readonly MatchId[], on: boolean) => void;
}) {
  return (
    <ChecklistSelectAll
      id={`select-all-${kind}`}
      data-testid={`select-all-${kind}`}
      label={`Select all ${ids.length} ${noun}`}
      state={state}
      disabled={disabled}
      onChange={(on) => onTicksSet(ids, on)}
    />
  );
});
