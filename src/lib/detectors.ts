/**
 * What the checklist says about each kind of match, and the counts feature 11
 * may log. Spec 0005, *Value sourcing* and *Checklist copy*.
 *
 * Typed as records over `DetectorKind` and `BlockedReason`, so a kind or a
 * reason added to the protocol without its words fails `pnpm typecheck`
 * (INV-9, AC-24). Feature 8 owns the final wording; this is the plain first
 * draft the spec wrote.
 */

import { Mail, Phone, type LucideIcon } from "lucide-react";

import {
  DETECTOR_KINDS,
  type BlockedReason,
  type DetectionCounts,
  type DetectorKind,
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

/** Every kind looked for, as plural nouns joined for a sentence. */
function lookedFor(type: "conjunction" | "disjunction"): string {
  return new Intl.ListFormat("en", { type }).format(
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
  helper: `RedactNest found no ${lookedFor("disjunction")}. Redact still makes a cleaned copy, with metadata and hidden content removed.`,
});

/**
 * The same two lines when some page carries a warning (spec 0006, AC-26), so
 * neither claims to speak for a page RedactNest could not read.
 */
export const COVERAGE_NOTE_PARTLY = `RedactNest looked for ${lookedFor("conjunction")} on the pages it could read. Anything else, such as names and addresses, stays in the file.`;

export const NOTHING_FOUND_PARTLY = Object.freeze({
  title: NOTHING_FOUND.title,
  helper: `RedactNest found no ${lookedFor("disjunction")} on the pages it could read. Redact still makes a cleaned copy, with metadata and hidden content removed.`,
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
