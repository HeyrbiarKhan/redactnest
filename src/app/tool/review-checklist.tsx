import { SearchCheck, TextSearch } from "lucide-react";
import { memo, useMemo, type ReactNode } from "react";

import {
  BLOCKED_REASON_TEXT,
  COVERAGE_NOTE,
  COVERAGE_NOTE_PARTLY,
  coverageNoteWithTerms,
  DETECTOR_LABELS,
  NOTHING_FOUND,
  NOTHING_FOUND_PARTLY,
  TERM_GROUP_NOUN,
  TERM_NOTE_TEXT,
} from "@/lib/detectors";
import { FOUND_ITEMS_NOUN, FOUND_ITEMS_TITLE, TERMS_TEXT } from "@/lib/flow-text";
import { CONCEALED_TEXT } from "@/lib/page-findings";
import type { TermState } from "@/lib/session";
import {
  DETECTOR_KINDS,
  type DetectorKind,
  type MatchId,
  type ReviewMatch,
  type TermId,
} from "@/worker/protocol";
import { Button } from "@/ui/button";
import { Callout } from "@/ui/callout";
import { Card } from "@/ui/card";
import { ChecklistGroup } from "@/ui/checklist-group";
import { ChecklistItem } from "@/ui/checklist-item";
import { ChecklistSelectAll, type SelectAllState } from "@/ui/checklist-select-all";
import { CountBadge } from "@/ui/count-badge";
import { EmptyState } from "@/ui/empty-state";
import { Spinner } from "@/ui/spinner";

/** One term this job knows, in the list's order, as its group shows it. */
export interface TermGroupTerm {
  readonly id: TermId;
  readonly text: string;
  readonly state: TermState;
}

/** What a term's group offers when it was not searched (spec 0017, AC-17). */
export interface TermGroupActions {
  readonly onSetAside: (id: TermId) => void;
  readonly onRemove: (id: TermId) => void;
  readonly onTryAgain: (id: TermId) => void;
  /** Check my plan and open it again, or null where the account offers none (AC-2). */
  readonly onRecheck: (() => void) | null;
  /** A search is under way, so Try again waits (AC-19). */
  readonly searching: boolean;
}

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
  /**
   * The custom terms panel, after the coverage note and before the groups
   * (spec 0017, AC-1), or nothing with billing off.
   */
  readonly panel?: ReactNode;
  /** Every term this job knows, in the list's order (spec 0017, AC-14). */
  readonly terms?: readonly TermGroupTerm[];
  readonly termActions?: TermGroupActions;
}

interface Group {
  readonly kind: DetectorKind;
  readonly rows: readonly ReviewMatch[];
  /** The rows a tick can reach: every one that is not blocked. */
  readonly tickable: readonly MatchId[];
}

interface TermGroup {
  readonly term: TermGroupTerm;
  readonly rows: readonly ReviewMatch[];
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

const NO_TERMS: readonly TermGroupTerm[] = Object.freeze([]);

/**
 * What detection and the custom terms found, to tick or leave. Spec 0005,
 * AC-13 and AC-14, spec 0007, AC-7 to AC-9, and spec 0017, AC-14 to AC-17.
 *
 * One group per term this job knows, in the list's order, then one per
 * detector kind that has a match, in `DETECTOR_KINDS` order, and one row per
 * match in the order the worker sent them, which is by page, then reading
 * order (AC-3). A blocked row is listed, disabled, with its reason, so nobody
 * believes it is gone. A group with two or more rows a tick can reach starts
 * with a select all row. A term group with no rows says why: still
 * searching, not found, or not searched with its reason and its ways on.
 *
 * Built for a long list (INV-7): the groups are built once per `matches`, and
 * each row is memoised on its match, its checked state and whether it is
 * disabled, with one stable toggle handler for all of them, so a tick renders
 * that row and its group's select all again and nothing else.
 *
 * Rendered by `tool-client` outside the polite live region: a list this long
 * read out as it appeared would drown the phase line. One card, titled Found
 * items with a count of every row found, blocked ones included (spec 0013,
 * AC-19); the coverage note comes first inside it, always, so a short list, or
 * an empty one, never reads as a complete redaction.
 */
export function ReviewChecklist({
  matches,
  ticked,
  running,
  partly,
  onToggle,
  onTicksSet,
  panel,
  terms = NO_TERMS,
  termActions,
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
  const termGroups = useMemo<readonly TermGroup[]>(
    () =>
      terms.map((term) => {
        const rows = matches.filter((match) => match.term === term.id);
        const tickable = rows.filter((row) => row.blocked === null).map((row) => row.id);
        return { term, rows, tickable };
      }),
    [matches, terms],
  );
  const nothingFound = partly ? NOTHING_FOUND_PARTLY : NOTHING_FOUND;
  const searched = terms.filter(({ state }) => state.state === "searched").length;

  return (
    <div data-testid="review">
      <Card
        title={FOUND_ITEMS_TITLE}
        badge={
          <CountBadge count={matches.length} noun={FOUND_ITEMS_NOUN} tone="neutral" />
        }
        data-testid="checklist"
      >
        <Callout tone="info" data-testid="coverage">
          {searched > 0
            ? coverageNoteWithTerms(searched, partly)
            : partly
              ? COVERAGE_NOTE_PARTLY
              : COVERAGE_NOTE}
        </Callout>

        {panel}

        {(termGroups.length > 0 || groups.length > 0) && (
          <div className="flex flex-col gap-2">
            {termGroups.map(({ term, rows, tickable }) => (
              <ChecklistGroup
                key={term.id}
                icon={TextSearch}
                label={term.text}
                count={rows.length}
                noun={TERM_GROUP_NOUN}
              >
                {tickable.length >= SELECT_ALL_MIN && (
                  <SelectAllRow
                    name={`term-${term.id}`}
                    ids={tickable}
                    noun={TERM_GROUP_NOUN.other}
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
                {rows.length === 0 && (
                  <TermStateRow
                    term={term}
                    partly={partly}
                    running={running}
                    actions={termActions}
                  />
                )}
              </ChecklistGroup>
            ))}
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
                      name={kind}
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

        {/* Spec 0017, AC-14: only when no row of any kind exists. */}
        {matches.length === 0 && (
          <EmptyState
            icon={SearchCheck}
            title={nothingFound.title}
            helper={nothingFound.helper}
          />
        )}
      </Card>
    </div>
  );
}

/**
 * A term group with no rows, saying why (spec 0017, AC-15 and AC-17): still
 * searching; searched and not found; or not searched, with its reason, Set
 * aside for this file, Remove, and Try again or Check my plan and open it
 * again; or set aside, with Remove.
 */
function TermStateRow({
  term,
  partly,
  running,
  actions,
}: {
  readonly term: TermGroupTerm;
  readonly partly: boolean;
  readonly running: boolean;
  readonly actions: TermGroupActions | undefined;
}) {
  const { state } = term;
  const line = "flex items-center gap-2 px-3 py-3 text-small";

  if (state.state === "searching") {
    return (
      <li data-testid="term-searching" className={`${line} text-ink-muted`}>
        <Spinner size="sm" />
        <span>{TERMS_TEXT.searching}</span>
      </li>
    );
  }
  if (state.state === "searched") {
    return (
      <li data-testid="term-not-found" className={`${line} text-ink-muted`}>
        {partly ? TERMS_TEXT.notFoundPartly : TERMS_TEXT.notFound}
      </li>
    );
  }

  const notSearched = state.state === "not-searched";
  return (
    <li
      data-testid={notSearched ? "term-not-searched" : "term-set-aside"}
      className="flex flex-col items-start gap-3 px-3 py-3 text-small text-ink"
    >
      <p>
        {TERMS_TEXT.notSearched[state.reason]}
        {notSearched ? "." : `. ${TERMS_TEXT.setAsideState}.`}
      </p>
      {actions && (
        <div className="flex flex-wrap items-center gap-3">
          {notSearched && state.reason === "search-failed" && (
            <Button
              variant="secondary"
              data-testid="term-try-again"
              busy={actions.searching}
              disabled={running}
              onClick={() => actions.onTryAgain(term.id)}
            >
              {TERMS_TEXT.tryAgain}
            </Button>
          )}
          {notSearched && state.reason === "free-plan" && actions.onRecheck !== null && (
            <Button
              variant="secondary"
              data-testid="term-recheck"
              disabled={running}
              onClick={actions.onRecheck}
            >
              {TERMS_TEXT.recheck}
            </Button>
          )}
          {notSearched && (
            <Button
              variant="secondary"
              data-testid="term-set-aside"
              disabled={running}
              onClick={() => actions.onSetAside(term.id)}
            >
              {TERMS_TEXT.setAside}
            </Button>
          )}
          <Button
            variant="link"
            data-testid="term-remove"
            disabled={running}
            onClick={() => actions.onRemove(term.id)}
          >
            {TERMS_TEXT.remove(term.text)}
          </Button>
        </div>
      )}
    </li>
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
      notes={match.termNotes.map((note) => TERM_NOTE_TEXT[note])}
      onCheckedChange={() => onToggle(match.id)}
    />
  );
});

/**
 * A group's select all (spec 0007, AC-7): named for how many rows it reaches,
 * checked, clear or mixed by how many of those are ticked, and one `ticks-set`
 * over exactly those rows, so a blocked row never changes. Memoised, so a tick
 * in another group leaves it alone. `name` is the detector kind, or `term-`
 * and the term's id, so each group's select all has an id of its own.
 */
const SelectAllRow = memo(function SelectAllRow({
  name,
  ids,
  noun,
  state,
  disabled,
  onTicksSet,
}: {
  readonly name: string;
  readonly ids: readonly MatchId[];
  readonly noun: string;
  readonly state: SelectAllState;
  readonly disabled: boolean;
  readonly onTicksSet: (ids: readonly MatchId[], on: boolean) => void;
}) {
  return (
    <ChecklistSelectAll
      id={`select-all-${name}`}
      data-testid={`select-all-${name}`}
      label={`Select all ${ids.length} ${noun}`}
      state={state}
      disabled={disabled}
      onChange={(on) => onTicksSet(ids, on)}
    />
  );
});
