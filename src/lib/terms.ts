/**
 * The tab's list of custom terms. Spec 0017, *Data model sketch*.
 *
 * One list per tab, outside the job, in `tool-client`'s state, so it carries
 * from one file to the next and ends with the page (INV-7): nothing here is
 * stored, logged or sent (INV-1). These are its operations, pure over frozen
 * values; the panel's handlers change the list and dispatch the session's
 * action in the same handler, so the list owns each term's text and order and
 * the session each term's state.
 */

import {
  foldTerm,
  prepareTerm,
  termRefusal,
  type TermCaps,
  type TermRefusal,
} from "@/lib/term-text";
import type { TermId, TermQuery } from "@/worker/protocol";

/** One listed term: the page's id and the visitor's words, prepared. */
export type CustomTerm = TermQuery;

/** A line that was not added, and why (AC-4). */
export interface RefusedTerm {
  readonly text: string;
  readonly reason: TermRefusal;
  /**
   * For a `duplicate`, the listed term it folds the same as, so its refusal
   * can go once that term does (AC-5); null for every other reason.
   */
  readonly duplicates: TermId | null;
}

/** What one Add or one paste did to the list. */
export interface TermsAdded {
  readonly list: readonly CustomTerm[];
  readonly added: readonly CustomTerm[];
  readonly refused: readonly RefusedTerm[];
}

/**
 * Each non empty line of a paste, in order (AC-3). Any line break a
 * clipboard may carry ends a line.
 */
export function linesOf(text: string): readonly string[] {
  return text.split(/\r\n|[\n\r\u2028\u2029]/u);
}

/**
 * Add each line as a term, in order, until the list is full (AC-3, AC-4).
 * Each is prepared, then judged by `termRefusal` against the list as it
 * grows, so a paste's own repeats are refused too, each naming the listed
 * term it repeats. An empty line is skipped
 * and never named; every other line is added or refused, never dropped, and
 * no added term is cut short.
 */
export function addTerms(
  list: readonly CustomTerm[],
  lines: readonly string[],
  caps: TermCaps,
  mint: () => TermId,
): TermsAdded {
  const folds = new Set(list.map(({ text }) => foldTerm(text)));
  const owners = new Map(list.map(({ id, text }) => [foldTerm(text), id]));
  const added: CustomTerm[] = [];
  const refused: RefusedTerm[] = [];

  for (const line of lines) {
    const text = prepareTerm(line);
    if (text === "") continue;
    const reason = termRefusal(text, folds, caps);
    if (reason !== null) {
      const duplicates =
        reason === "duplicate" ? (owners.get(foldTerm(text)) ?? null) : null;
      refused.push(Object.freeze({ text, reason, duplicates }));
      continue;
    }
    const term = Object.freeze({ id: mint(), text });
    added.push(term);
    folds.add(foldTerm(text));
    owners.set(foldTerm(text), term.id);
  }

  return Object.freeze({
    list: Object.freeze([...list, ...added]),
    added: Object.freeze(added),
    refused: Object.freeze(refused),
  });
}

/** The list without these terms (AC-5). */
export function removeTerms(
  list: readonly CustomTerm[],
  ids: readonly TermId[],
): readonly CustomTerm[] {
  const gone = new Set(ids);
  return Object.freeze(list.filter(({ id }) => !gone.has(id)));
}

/**
 * Where focus goes once a term's chip is gone (AC-5): the next chip's remove
 * button, else the previous one's, else the field (`null`).
 */
export function focusAfterRemoving(
  list: readonly CustomTerm[],
  id: TermId,
): TermId | null {
  const at = list.findIndex((term) => term.id === id);
  if (at < 0) return null;
  return list[at + 1]?.id ?? list[at - 1]?.id ?? null;
}
