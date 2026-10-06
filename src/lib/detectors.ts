/**
 * What the checklist says about each kind of match, and the counts feature 11
 * may log. Spec 0005, *Value sourcing* and *Checklist copy*.
 *
 * Typed as records over `DetectorKind` and `BlockedReason`, so a kind or a
 * reason added to the protocol without its words fails `pnpm typecheck`
 * (INV-9, AC-24). Spec 0007 reviewed the wording as it reads on the page; the
 * empty state now points at Make a cleaned copy, the action its button names.
 */

import { Mail, Phone, type LucideIcon } from "lucide-react";

import {
  DETECTOR_KINDS,
  type BlockedReason,
  type DetectionCounts,
  type DetectorKind,
  type MatchId,
  type RedactionOutcome,
  type ResultCounts,
  type ReviewMatch,
} from "@/worker/protocol";

export interface DetectorLabel {
  readonly icon: LucideIcon;
  /** The group's heading. */
  readonly label: string;
  /** For the group's count and for the coverage note, in lower case. */
  readonly noun: { readonly one: string; readonly other: string };
}

export const DETECTOR_LABELS: Readonly<Record<DetectorKind, DetectorLabel>> =
  Object.freeze({
    email: Object.freeze({
      icon: Mail,
      label: "Email addresses",
      noun: Object.freeze({ one: "email address", other: "email addresses" }),
    }),
    phone: Object.freeze({
      icon: Phone,
      label: "Phone numbers",
      noun: Object.freeze({ one: "phone number", other: "phone numbers" }),
    }),
  });

/**
 * Why a row cannot be ticked, in words (AC-8, AC-13). Each says plainly that
 * the value stays in the file, so nobody reads a listed row as removed.
 */
export const BLOCKED_REASON_TEXT: Readonly<Record<BlockedReason, string>> = Object.freeze(
  {
    "unsound-outline":
      "RedactNest cannot outline this text precisely enough to remove it, so it will stay in the file.",
    "replacement-text":
      "Hidden replacement text covers this, so it cannot be removed safely and will stay in the file.",
    "slanted-text":
      "This is set at too steep an angle to remove safely, so it will stay in the file.",
    "image-overreach":
      "Removing this would blank too much of the image under it, so it will stay in the file.",
  },
);

/**
 * Every kind looked for, as plural nouns joined for a sentence. Also the
 * `detecting` phase line (spec 0007, *Phase copy*), so it names exactly what
 * the coverage note does, and the home page's lead and band (spec 0013,
 * AC-13), so the page names exactly the detectors that exist.
 *
 * British, like every list in `flow-text.ts`: no comma before the last part
 * once feature 12 makes it three or more (spec 0007, Follow-up nit 4).
 */
export function lookedFor(type: "conjunction" | "disjunction"): string {
  return new Intl.ListFormat("en-GB", { type }).format(
    DETECTOR_KINDS.map((kind) => DETECTOR_LABELS[kind].noun.other),
  );
}

/**
 * The note above the checklist (AC-14). Built from `DETECTOR_KINDS`, so it
 * names exactly what was looked for, and says that everything else stays, so
 * a short list never reads as a complete redaction.
 */
export const COVERAGE_NOTE = `RedactNest looked for ${lookedFor("conjunction")}. Anything else, such as names and addresses, stays in the file.`;

/** The empty state, when detection found nothing at all (AC-14). */
export const NOTHING_FOUND = Object.freeze({
  title: "Nothing found to remove",
  helper: `RedactNest found no ${lookedFor("disjunction")}. Make a cleaned copy to remove metadata and hidden content.`,
});

/**
 * The same two lines when some page carries a warning (spec 0006, AC-26), so
 * neither claims to speak for a page RedactNest could not read.
 */
export const COVERAGE_NOTE_PARTLY = `RedactNest looked for ${lookedFor("conjunction")} on the pages it could read. Anything else, such as names and addresses, stays in the file.`;

export const NOTHING_FOUND_PARTLY = Object.freeze({
  title: NOTHING_FOUND.title,
  helper: `RedactNest found no ${lookedFor("disjunction")} on the pages it could read. Make a cleaned copy to remove metadata and hidden content.`,
});

/**
 * What detection found, as counts only (AC-15): every match by kind, blocked
 * ones included, and the blocked ones by reason. A `LoggablePayload`, so it
 * carries no text at all.
 */
export function detectionCounts(matches: readonly ReviewMatch[]): DetectionCounts {
  const foundByType: Partial<Record<DetectorKind, number>> = {};
  const blockedByReason: Partial<Record<BlockedReason, number>> = {};

  for (const match of matches) {
    foundByType[match.type] = (foundByType[match.type] ?? 0) + 1;
    if (match.blocked !== null) {
      blockedByReason[match.blocked] = (blockedByReason[match.blocked] ?? 0) + 1;
    }
  }
  return Object.freeze({
    foundByType: Object.freeze(foundByType),
    blockedByReason: Object.freeze(blockedByReason),
  });
}

/**
 * Counts by kind as words, in `DETECTOR_KINDS` order, each with its own noun:
 * `["4 email addresses", "1 phone number"]`. A kind with no count is left out.
 * The result card joins these into a sentence (spec 0007, AC-11).
 */
export function countedKinds(
  byType: Readonly<Partial<Record<DetectorKind, number>>>,
): readonly string[] {
  return DETECTOR_KINDS.flatMap((kind) => {
    const count = byType[kind] ?? 0;
    if (count === 0) return [];
    const { noun } = DETECTOR_LABELS[kind];
    return [`${count} ${count === 1 ? noun.one : noun.other}`];
  });
}

/**
 * How many items a run removed, over every kind. The one sum behind the result
 * card's title and the file's name (spec 0007, AC-12 and INV-2).
 */
export function countRemoved(outcome: RedactionOutcome): number {
  return DETECTOR_KINDS.reduce(
    (total, kind) => total + (outcome.removedByType[kind] ?? 0),
    0,
  );
}

/**
 * What a finished run removed and what it left in the file. Spec 0007, AC-25
 * and INV-4.
 *
 * Pure, and the only source of the result card's Removed and Left in the file
 * lines. Removed comes from what the engine reports, never from the ticks, so
 * the card cannot claim a removal the run did not make. Left in the file is
 * every tickable match left unticked and every blocked one, by kind. The ticks
 * cannot change while a session is `complete`, so they describe this run.
 * Counts and kinds only, a `LoggablePayload`, so feature 11 may log it.
 */
export function resultCounts(
  matches: readonly ReviewMatch[],
  ticked: ReadonlySet<MatchId>,
  outcome: RedactionOutcome,
): ResultCounts {
  const untickedByType: Partial<Record<DetectorKind, number>> = {};
  const blockedByType: Partial<Record<DetectorKind, number>> = {};
  const blockedByReason: Partial<Record<BlockedReason, number>> = {};

  for (const match of matches) {
    if (match.blocked !== null) {
      blockedByType[match.type] = (blockedByType[match.type] ?? 0) + 1;
      blockedByReason[match.blocked] = (blockedByReason[match.blocked] ?? 0) + 1;
    } else if (!ticked.has(match.id)) {
      untickedByType[match.type] = (untickedByType[match.type] ?? 0) + 1;
    }
  }

  return Object.freeze({
    removedByType: Object.freeze({ ...outcome.removedByType }),
    untickedByType: Object.freeze(untickedByType),
    blockedByType: Object.freeze(blockedByType),
    blockedByReason: Object.freeze(blockedByReason),
    removedTotal: countRemoved(outcome),
    sanitized: Object.freeze([...outcome.sanitized]),
  });
}
