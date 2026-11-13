import { CircleAlert, CircleMinus, SearchX } from "lucide-react";
import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { TERMS_TEXT, type TermsLocked } from "@/lib/flow-text";
import type { TermState } from "@/lib/session";
import { linesOf, type CustomTerm } from "@/lib/terms";
import type { TermId } from "@/worker/protocol";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { TextField } from "@/ui/text-field";

import { NewTabLink } from "./plan-line";

/** One listed term as the panel shows it: its words, its state in this job, its rows. */
export interface TermChip extends CustomTerm {
  readonly state: TermState | undefined;
  readonly rows: number;
}

/**
 * Where focus goes once a term's control has gone with it (AC-5): a term's
 * remove button on its chip, or the field.
 */
export type TermFocus = TermId | "field";

interface TermsPanelProps {
  /** The tab's list, in the order added, each with its state in this job. */
  readonly terms: readonly TermChip[];
  /** On a `free` job, the locked panel's words and way forward (AC-2); else null. */
  readonly locked: TermsLocked | null;
  /** Some page carries a warning, so not found speaks for the readable pages (AC-15). */
  readonly partly: boolean;
  /** A run is under way: the field, Add and every remove button wait (AC-1). */
  readonly running: boolean;
  /** A search is under way: Add is busy and the field read only (AC-19). */
  readonly searching: boolean;
  /** The polite line's words, one paragraph each. */
  readonly status: readonly string[];
  /**
   * Add these lines as terms (AC-3). Answers whether every line was added,
   * so a typed term that was refused stays in the field to be fixed (AC-4).
   */
  readonly onAdd: (lines: readonly string[]) => boolean;
  readonly onRemove: (id: TermId) => void;
  readonly onRemoveAll: () => void;
  /** Check my plan and open it again, where the account offers it (AC-2). */
  readonly onRecheck: () => void;
  /** Where focus goes when the list empties, and after Remove all (AC-5). */
  readonly fieldRef: RefObject<HTMLInputElement | null>;
  /**
   * Where focus goes after the next render (AC-5), set by the handler that
   * takes a control away: a chip's remove or Remove all here, or a term's own
   * Remove or Try again in its group. The panel moves it and clears it.
   */
  readonly focusRef: RefObject<TermFocus | null>;
}

/**
 * The custom terms panel, in the Found items card after the coverage note.
 * Spec 0017, AC-1 to AC-5, AC-19 and AC-23.
 *
 * The field sits in no `form`, has no `name`, and turns off form history,
 * spelling and correction, so the browser keeps no history of a term and
 * sends it to no spelling service (AC-23). Enter or Add adds the field's text
 * as one term; a paste holding a line break adds each line and empties the
 * field (AC-3). The polite line is in the page from the panel's first render,
 * so what a search does and what was refused is heard (AC-1, AC-19); focus
 * never moves when a search lands.
 */
export function TermsPanel({
  terms,
  locked,
  partly,
  running,
  searching,
  status,
  onAdd,
  onRemove,
  onRemoveAll,
  onRecheck,
  fieldRef,
  focusRef,
}: TermsPanelProps) {
  const fieldId = useId();
  const [value, setValue] = useState("");
  const closed = locked !== null || running;

  /**
   * Where focus goes once a term's control is gone (AC-5): the next chip's
   * remove button, else the previous one's, else the field. Moved after the
   * render that drops the control, so it lands on what is on screen. On a
   * locked panel the field is off and cannot hold focus, so the last stop is
   * the locked line's way on, the control just above it, never `body`.
   */
  const removeButtons = useRef(new Map<TermId, HTMLButtonElement>());
  const recheckRef = useRef<HTMLButtonElement>(null);
  const getProRef = useRef<HTMLAnchorElement>(null);
  useLayoutEffect(() => {
    const target = focusRef.current;
    if (target === null) return;
    focusRef.current = null;
    const chip = target === "field" ? undefined : removeButtons.current.get(target);
    if (chip) chip.focus();
    else if (!closed) fieldRef.current?.focus();
    else (recheckRef.current ?? getProRef.current)?.focus();
  });

  const add = () => {
    if (closed || searching) return;
    if (onAdd([value])) setValue("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    add();
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text");
    const lines = linesOf(pasted);
    if (lines.length < 2) return;
    // Spec 0017, AC-3: each line is a term, and the field ends empty.
    event.preventDefault();
    if (closed || searching) return;
    onAdd(lines);
    setValue("");
  };

  return (
    <div
      data-testid="terms-panel"
      className="flex flex-col gap-3 border-b border-border pb-4"
    >
      <h3 className="text-body font-semibold text-ink">{TERMS_TEXT.heading}</h3>

      {locked !== null && (
        <div data-testid="terms-locked" className="flex flex-col items-start gap-3">
          <p className="text-small text-ink">
            {locked.line}{" "}
            {locked.link !== null && (
              <NewTabLink
                link={locked.link}
                className="font-medium"
                linkRef={getProRef}
              />
            )}
          </p>
          {locked.recheck !== null && (
            <Button
              ref={recheckRef}
              variant="secondary"
              data-testid="terms-recheck"
              onClick={onRecheck}
            >
              {locked.recheck}
            </Button>
          )}
        </div>
      )}

      <TextField
        ref={fieldRef}
        id={fieldId}
        label={TERMS_TEXT.label}
        data-testid="terms-field"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        readOnly={searching}
        disabled={closed}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        action={
          <Button
            variant="secondary"
            data-testid="terms-add"
            busy={searching}
            disabled={closed}
            onClick={add}
            className="sm:min-w-24"
          >
            {searching ? TERMS_TEXT.adding : TERMS_TEXT.add}
          </Button>
        }
      />

      {terms.length > 0 && (
        <ul role="list" data-testid="terms-list" className="flex flex-wrap gap-2">
          {terms.map((term) => (
            <Chip
              key={term.id}
              data-testid="term-chip"
              label={term.text}
              {...chipState(term, partly)}
              removeLabel={TERMS_TEXT.remove(term.text)}
              removeDisabled={running}
              onRemove={() => onRemove(term.id)}
              removeRef={(button) => {
                if (button) removeButtons.current.set(term.id, button);
                else removeButtons.current.delete(term.id);
              }}
            />
          ))}
        </ul>
      )}

      {terms.length >= 2 && (
        <Button
          variant="link"
          data-testid="terms-remove-all"
          disabled={running}
          onClick={onRemoveAll}
          className="self-start"
        >
          {TERMS_TEXT.removeAll}
        </Button>
      )}

      <div aria-live="polite" data-testid="terms-status" className="text-small text-ink">
        {status.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}

/** A chip's state, in words, with an icon where a word alone would do (INV-8). */
function chipState(
  { state, rows }: TermChip,
  partly: boolean,
): Pick<Parameters<typeof Chip>[0], "status" | "statusIcon" | "busy"> {
  switch (state?.state) {
    case undefined:
      return {};
    case "searching":
      return { busy: true, status: TERMS_TEXT.searching };
    case "searched":
      return rows > 0
        ? { status: TERMS_TEXT.matches(rows) }
        : {
            status: partly ? TERMS_TEXT.notFoundPartly : TERMS_TEXT.notFound,
            statusIcon: SearchX,
          };
    case "not-searched":
      return { status: TERMS_TEXT.notSearched[state.reason], statusIcon: CircleAlert };
    case "set-aside":
      return { status: TERMS_TEXT.setAsideState, statusIcon: CircleMinus };
  }
}
