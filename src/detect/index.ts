/**
 * Pattern detection. Spec 0005.
 *
 * Pure functions from one text block to the spans it holds, one detector per
 * kind, each with its own validator. No MuPDF, no page, no network, no storage
 * and no console: this folder sees text and hands back offsets, nothing else
 * (INV-5). The engine's find step (`src/engine/find.ts`) turns the offsets into
 * characters, quads and review rows.
 *
 * WALLED BY LINT. Only `src/engine` imports this folder, and only this folder
 * imports `libphonenumber-js` (INV-8), so the phone metadata ships in the
 * worker's chunk and never in a page's. The `redactnest/detect` zone in
 * `eslint.config.mjs` holds both, and bans `search()` here as in the engine
 * (INV-11).
 *
 * Every detector is linear in its input (INV-7): each file says why.
 */

import { detectCard } from "./card";
import { detectDate } from "./date";
import { detectEmail } from "./email";
import { detectIban } from "./iban";
import { detectPhone } from "./phone";
import type { Detector, DetectInput, Span } from "./types";
import { detectUkNino } from "./uk-nino";
import { detectUsSsn } from "./us-ssn";
import type { DetectorKind } from "@/worker/protocol";

export { CARD_BRANDS, type CardBrand } from "./card";
export { BIRTH_WORDS, MONTHS } from "./date";
export { IBAN_LENGTHS } from "./iban";
export { KEYWORD_REACH } from "./text";
export { NI_PREFIX_RULES } from "./uk-nino";
export { SSN_WORDS } from "./us-ssn";
export {
  EXTENSION_MARKERS,
  MAX_PARSES_PER_GROUP,
  MAX_WINDOW_DIGITS,
  PHONE_READINGS,
  PHONE_REGIONS,
  PHONE_WORDS,
  type PhoneReading,
} from "./phone";
export type { Detector, DetectInput, Span } from "./types";

/**
 * Every kind's detector. A record over `DetectorKind`, so a kind added to the
 * protocol without a detector fails `pnpm typecheck` (INV-9, AC-24).
 */
export const DETECTORS: Readonly<Record<DetectorKind, Detector>> = Object.freeze({
  email: detectEmail,
  phone: detectPhone,
  date: detectDate,
  card: detectCard,
  iban: detectIban,
  "us-ssn": detectUsSsn,
  "uk-nino": detectUkNino,
});

/**
 * Which kind keeps a place two kinds both claim, highest first. Spec 0005,
 * *Decided within it*: a kind with a checksum or a unique marker outranks a
 * looser digit shape, so an IBAN's digits never list as a phone number. A
 * rule about patterns, not a cap on the visitor. `date` comes last, but no
 * numeric date is ever lost to `phone` for it: the phone detector never reads
 * one (INV-14). `tests/unit/detect.test.ts` fails `pnpm typecheck` when a kind
 * has no place here (AC-24).
 */
export const PRECEDENCE = Object.freeze([
  "email",
  "iban",
  "card",
  "us-ssn",
  "uk-nino",
  "phone",
  "date",
] as const);

/**
 * Every span in one block, in order of `start`, with no position claimed by
 * two. Spec 0005, AC-3.
 *
 * Kinds are taken in `PRECEDENCE` order, and a span that meets a position a
 * higher kind already holds is dropped whole, never trimmed. Positions are
 * marked as they are claimed, so this costs the length of what was found.
 */
export function detect(input: DetectInput): readonly Span[] {
  const claimed = new Uint8Array(Array.from(input.text).length);
  const kept: Span[] = [];

  for (const kind of PRECEDENCE) {
    for (const span of DETECTORS[kind](input)) {
      if (claimed.subarray(span.start, span.end).includes(1)) continue;
      claimed.fill(1, span.start, span.end);
      kept.push(span);
    }
  }
  return kept.sort((a, b) => a.start - b.start);
}

/**
 * Does a match of this kind read a line join as nothing at all? Spec 0005,
 * AC-4.
 *
 * An email never holds a space, so a join inside an email span is one the
 * rejoin read as invisible: the address wrapped right after `@` or `.`. Its
 * display text and its target's `text` leave that join out. Every other kind
 * reads a join as the one space it stands for.
 */
export function readsJoinAsNothing(kind: DetectorKind): boolean {
  return kind === "email";
}
