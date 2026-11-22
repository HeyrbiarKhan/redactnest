import { readdirSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  openDocumentWith,
  PIPELINE,
  redactDocumentWith,
  silenceEngineLog,
  type Pipeline,
  type RedactionResult,
  type RedactionTarget,
} from "@/engine";
import type { EngineErrorKind, SanitizedKind } from "@/worker/protocol";

import { GLYPH_TEXT } from "../../scripts/lib/glyph-fixtures.mjs";
import { COLOUR_TEXT, KEPT_TEXT } from "../../scripts/lib/kept-fixtures.mjs";
import { TRIM_CARRY, TRIM_ROTATED } from "../../scripts/lib/reading-fixtures.mjs";
import { fixture } from "./bytes";
import { LIMITS, mupdf, pageRenders } from "./mupdf";
import { findTargets } from "./targets";

/**
 * Nothing drawn changes, and nothing new is refused. Spec 0019, AC-7 and
 * INV-7.
 *
 * The prune only deletes keys; the passes, `sanitize` and the write are
 * unchanged, so it must never remove less than main from what a page draws,
 * and never more. Every committed fixture is held to that here, two ways:
 *
 *  - Against main itself, for what this build cannot swap out: each open's
 *    outcome (the role walk refuses at open now), and with nothing ticked each
 *    run's outcome and `sanitized` (the inventory reports embedded files now).
 *    Those rows were read once from main's code at 5c4e0d7, the commit this
 *    branch started from, and are frozen as literals below. Never regenerate a
 *    row from the current code, or the gate holds nothing: a new fixture's row
 *    is read from 5c4e0d7's code. The eight fixtures the fourth pass adds
 *    (AC-17) were read from that commit's code too, from a `git archive` of
 *    it, on 2026-11-15, and so were spec 0020's six `glyph-*.pdf` fixtures,
 *    on 2026-11-17: main opened and ran all six, so none has a main refusal
 *    or `sanitized` row. So was `trim-carry.pdf`, on 2026-11-18: main opened
 *    it and made a file with nothing ticked, and refused its ticked set with
 *    `redaction-incomplete`, the MuPDF limit it pins. So were feature 30's
 *    `trim-rotated.pdf` and `trim-unplaced.pdf`, the same day: main opened
 *    both, made a file from the first with nothing ticked (each of its first
 *    two pages' addresses ticked alone removed one), and refused the second's
 *    run with `redaction-incomplete`. So was spec 0021's `kept-lang.pdf`, on
 *    2026-11-21: main opened it and made a file with nothing ticked,
 *    reporting nothing. Its pixel check says nothing about `/Lang`: `MAIN`
 *    runs the same `graftPages`, so it leaves `/Lang` out too, and
 *    `tests/unit/redaction-kept.test.ts` is what holds `/Lang`. So was
 *    `kept-cid-strings.pdf`, the same day: main opened it and made a file
 *    with nothing ticked, reporting nothing, and spec 0021 refuses it at open
 *    (`OPEN_NOW`).
 *  - Against the same run with the pipeline's prune and structure check both
 *    swapped out, which writes main's output byte for byte (`MAIN`): the same
 *    outcome, the same `removedByType`, and every page rendered pixel for pixel
 *    the same. Once with nothing ticked, and once with each ticked set the
 *    redaction tests already run on the fixture, since a pass makes new figures
 *    and pictures the prune also walks. Its structure check always answers
 *    clean, so the second write (AC-15) can never run in it, and it keeps
 *    today's carrier sweep, which reads through references (AC-16): measured,
 *    every check here passes the same against main's own resolving sweep.
 *
 * Spec 0020 refuses four of its fixtures at open on purpose (its AC-8), so
 * `OPEN_NOW` holds `unreadable-structure` for them and `openKindNow` reads it
 * wherever main's open row was read: such a fixture runs no further gate test,
 * as a fixture main refused does. Spec 0006's Follow-up on a line box that is
 * not finite (feature 30) refuses `trim-unplaced.pdf` at open the same way,
 * with `unsupported`, where main failed every run on it. `MAIN` swaps the run's glyph rule out too,
 * so its runs write main's output, and the two controls are ticked as
 * `tests/unit/redaction-glyphs.test.ts` ticks them (its AC-10).
 *
 * Two fixtures change on purpose (AC-7). `shared-forms.pdf`, which main
 * refused with `unsupported` when its forms lost their text in the write, now
 * makes a file (`RUN_NOW`). `shared-pictures.pdf`'s pictures, which main wrote
 * blank, now keep their data, so its pages match `MAIN`, which reads through
 * references, and not main's real output; its own test in
 * `tests/unit/redaction-kept.test.ts` compares it with the source.
 *
 * The ticked sets are the redaction suites' own, recorded from a run of them:
 * the needles they search for (`NEEDLES`), and for the fixtures they tick
 * through detection, the targets detection finds, each alone, all together,
 * or both, as each suite ticks them (`DETECTED`). The three sets `text-page.pdf` builds to be refused
 * before any pass (a target on the wrong page, text the page does not hold)
 * are left out: no pass runs, so nothing is drawn either way.
 *
 * About two minutes of work in all, so the fixtures are shared out over four
 * files, `tests/unit/redaction-gate-0.test.ts` to `-3`, each registering every
 * fourth one through `gateFixtures`, and Vitest runs them side by side.
 */

/**
 * Main's pipeline: the prune and the structure check both swapped out (AC-7),
 * and spec 0020's glyph rule too (its AC-10).
 */
const MAIN: Pipeline = Object.freeze({
  ...PIPELINE,
  judgeGlyphs: () => "clean" as const,
  pruneToRoles: () => {},
  checkStructure: () => "clean" as const,
});

type Ticked = readonly (readonly [page: number, text: string])[];

/** One set ticking every page's line, as AC-17's colour fixtures are ticked. */
function everyLine(lines: readonly string[]): Ticked {
  return lines.map((text, page) => [page, text] as const);
}

/** Every committed fixture, each with its rows read from main's code at 5c4e0d7. */
const MAIN_FIXTURES: readonly string[] = [
  "actual-text.pdf",
  "angled-text.pdf",
  "bounds-pin.pdf",
  "carlito.pdf",
  "colour-calgray.pdf",
  "colour-calrgb.pdf",
  "colour-icc-alternate.pdf",
  "colour-icc-bare.pdf",
  "colour-inline.pdf",
  "colour-loaded.pdf",
  "combining.pdf",
  "damaged.pdf",
  "detect-blocked.pdf",
  "detect-card.pdf",
  "detect-date-forms.pdf",
  "detect-date.pdf",
  "detect-dense.pdf",
  "detect-email.pdf",
  "detect-iban.pdf",
  "detect-many.pdf",
  "detect-markers.pdf",
  "detect-phone.pdf",
  "detect-stamped.pdf",
  "detect-uk-nino.pdf",
  "detect-unicode.pdf",
  "detect-us-ssn.pdf",
  "detect-wraps.pdf",
  "form-xobject.pdf",
  "glyph-bitmap.pdf",
  "glyph-drawn-form.pdf",
  "glyph-emoji.pdf",
  "glyph-shared-picture.pdf",
  "glyph-text.pdf",
  "glyph-undrawn-form.pdf",
  "header-at-1019.pdf",
  "header-at-1020.pdf",
  "images-under.pdf",
  "inline-indexed.pdf",
  "kept-annotations.pdf",
  "kept-catalog.pdf",
  "kept-cid-strings.pdf",
  "kept-embedded.pdf",
  "kept-figure.pdf",
  "kept-lang.pdf",
  "kept-picture.pdf",
  "kept-program-keys.pdf",
  "kerning.pdf",
  "layers-all-on.pdf",
  "layers-one-off.pdf",
  "lone-glyphs.pdf",
  "marked-descriptions.pdf",
  "metadata.pdf",
  "next-line-0.pdf",
  "next-line-1.pdf",
  "next-line-2.pdf",
  "next-line-3.pdf",
  "next-line-4.pdf",
  "ocr-aligned.pdf",
  "ocr-bare.pdf",
  "ocr-misaligned.pdf",
  "offset-cropbox.pdf",
  "outlined.pdf",
  "owner-aes128.pdf",
  "owner-aes256.pdf",
  "owner-rc4.pdf",
  "reach.pdf",
  "read-blank.pdf",
  "read-concealed.pdf",
  "read-covered.pdf",
  "read-crooked.pdf",
  "read-empty-clip-0.pdf",
  "read-empty-clip-1.pdf",
  "read-empty-clip-2.pdf",
  "read-empty-clip-3.pdf",
  "read-empty-clip-scan.pdf",
  "read-hidden.pdf",
  "read-mixed.pdf",
  "read-pages.pdf",
  "read-pictures.pdf",
  "read-private.pdf",
  "read-refused-mix.pdf",
  "read-scans.pdf",
  "read-short-ocr.pdf",
  "read-slides.pdf",
  "read-stamped.pdf",
  "read-unmapped.pdf",
  "rotated-page.pdf",
  "sample-agreement.pdf",
  "shared-forms.pdf",
  "shared-pictures.pdf",
  "shared-xobject.pdf",
  "single-spacing.pdf",
  "superscript.pdf",
  "terms-dense.pdf",
  "terms.pdf",
  "text-page.pdf",
  "trim-carry.pdf",
  "trim-edge.pdf",
  "trim-kept.pdf",
  "trim-ocr.pdf",
  "trim-quote.pdf",
  "trim-refused.pdf",
  "trim-rotated.pdf",
  "trim-scan.pdf",
  "trim-text.pdf",
  "trim-unplaced.pdf",
  "two-lines.pdf",
  "two-pages.pdf",
  "user-password.pdf",
  "watermark.pdf",
  "xobject-twice.pdf",
  "xobject-two-pages.pdf",
];

/** What each open refused with on main; every other fixture opened. */
const MAIN_OPEN_REFUSALS: Readonly<Record<string, EngineErrorKind>> = {
  "bounds-pin.pdf": "no-readable-text",
  "header-at-1020.pdf": "not-pdf",
  "layers-all-on.pdf": "hidden-layers",
  "layers-one-off.pdf": "hidden-layers",
  "read-blank.pdf": "no-readable-text",
  "read-empty-clip-0.pdf": "unsupported",
  "read-empty-clip-1.pdf": "unsupported",
  "read-empty-clip-2.pdf": "unsupported",
  "read-empty-clip-3.pdf": "unsupported",
  "read-empty-clip-scan.pdf": "no-readable-text",
  "read-private.pdf": "no-readable-text",
  "read-refused-mix.pdf": "no-readable-text",
  "read-scans.pdf": "no-readable-text",
  "read-stamped.pdf": "no-readable-text",
  "read-unmapped.pdf": "no-readable-text",
  "trim-quote.pdf": "unsupported",
  "trim-refused.pdf": "edge-text",
  "user-password.pdf": "password-required",
};

/** What a run with nothing ticked refused with on main; every other run made a file. */
const MAIN_RUN_REFUSALS: Readonly<Record<string, EngineErrorKind>> = {
  "next-line-0.pdf": "redaction-incomplete",
  "next-line-1.pdf": "redaction-incomplete",
  "next-line-3.pdf": "redaction-incomplete",
  "shared-forms.pdf": "unsupported",
  "trim-unplaced.pdf": "redaction-incomplete",
};

/** `sanitized` from a run with nothing ticked on main, where it named any kind. */
const MAIN_SANITIZED: Readonly<Record<string, readonly SanitizedKind[]>> = {
  "kept-annotations.pdf": ["annotations", "attachments"],
  "kept-catalog.pdf": ["accessibility-tags"],
  "metadata.pdf": [
    "document-info",
    "xmp-metadata",
    "annotations",
    "form-fields",
    "attachments",
    "bookmarks",
    "javascript",
    "incremental-versions",
    "page-thumbnails",
    "accessibility-tags",
  ],
  "read-covered.pdf": ["annotations"],
};

/** The redaction suites' needles, each set as they tick it. */
const NEEDLES: Readonly<Record<string, readonly Ticked[]>> = {
  "actual-text.pdf": [
    [[0, "SECRET-AT"]],
    [[4, "SECRET-AT"]],
    [[1, "SECRET-AT"]],
    [[2, "SECRET-AT"]],
    [[3, "SECRET-AT"]],
  ],
  "carlito.pdf": [
    [[0, "Jeremy Quigley"]],
    [[1, "Jeremy Quigley"]],
    [[3, "before80"]],
    [[3, "before120"]],
    [[3, "before150"]],
    [[3, "before300"]],
    [[3, "after80"]],
    [[3, "after120"]],
    [[3, "after150"]],
    [[3, "after300"]],
  ],
  // Spec 0019's fourth pass (AC-17): every page's line in one set.
  "colour-calgray.pdf": [everyLine(COLOUR_TEXT.calGray)],
  "colour-calrgb.pdf": [everyLine(COLOUR_TEXT.calRgb)],
  "colour-icc-alternate.pdf": [everyLine(COLOUR_TEXT.iccAlternate)],
  "colour-icc-bare.pdf": [everyLine(COLOUR_TEXT.iccBare)],
  "colour-inline.pdf": [everyLine(COLOUR_TEXT.inline)],
  "colour-loaded.pdf": [everyLine(COLOUR_TEXT.loaded)],
  "combining.pdf": [[[0, "Rene\u0301e"]], [[0, "Jose\u0301"]]],
  "detect-blocked.pdf": [[[0, "slanted@example.com"]], [[0, "image@example.com"]]],
  "detect-date-forms.pdf": [
    [
      [0, "05-Jan-2026"],
      [0, "27/Sep/1980"],
      [0, "Sep-27-2026"],
      [0, "2026-Sep-27"],
      [0, "2026.09.27"],
      [0, "2026/9/7"],
      [0, "2026-9-7"],
      [0, "20260927"],
      [0, "27 Sep 26"],
      [0, "27-SEP-26"],
      [0, "Sep 27, '26"],
      [0, "27 / 09 / 2026"],
      [0, "2026 - 09 - 27"],
      [0, "1st day of May, 2026"],
      [0, "27. September 2026"],
      [0, "15 March,2026"],
      [0, "September, 27 2026"],
      [0, "Sept.27, 2026"],
      [0, "1980.05.12"],
      [0, "27/09/2026"],
      [0, "2nd day of June, 2026"],
    ],
  ],
  "detect-email.pdf": [
    [
      [0, "jane.doe@example.com"],
      [0, "jane.doe@example.com"],
    ],
  ],
  "form-xobject.pdf": [[[0, "SECRET-42"]]],
  // Spec 0020's controls (AC-9); its four other fixtures are refused at open.
  "glyph-bitmap.pdf": [[[0, GLYPH_TEXT.bitmap]]],
  "glyph-emoji.pdf": [[[0, GLYPH_TEXT.emoji]]],
  "images-under.pdf": [
    [
      [0, "12345678"],
      [0, "40-11-22"],
    ],
  ],
  "kept-figure.pdf": [[[0, "SECRET-42"]]],
  // Spec 0021, AC-5: the name the page shows, as the kept test ticks it.
  // `kept-cid-strings.pdf` is refused at open (`OPEN_NOW`), so it has no
  // ticked set here; its ticked run's refusal is held in the kept test.
  "kept-lang.pdf": [[[0, KEPT_TEXT.lang]]],
  "kept-picture.pdf": [
    [
      [0, "12345678"],
      [0, "40-11-22"],
    ],
  ],
  "kerning.pdf": [
    [[0, "before80"]],
    [[0, "before120"]],
    [[0, "before150"]],
    [[0, "before300"]],
    [[0, "after80"]],
    [[0, "after120"]],
    [[0, "after150"]],
    [[0, "after300"]],
  ],
  "lone-glyphs.pdf": [[[0, "."]], [[0, "i"]]],
  "marked-descriptions.pdf": [[[0, "jane.doe@example.com"]]],
  "metadata.pdf": [[[0, "Form field value"]], [[0, "Visible typed note"]]],
  "next-line-0.pdf": [[[0, "Jeremy Quigley"]]],
  "next-line-1.pdf": [[[0, "Jeremy Quigley"]]],
  "next-line-2.pdf": [[[0, "Jeremy Quigley"]]],
  "next-line-3.pdf": [[[0, "Jeremy Quigley"]]],
  "next-line-4.pdf": [[[0, "Jeremy Quigley"]]],
  "ocr-aligned.pdf": [[[0, "Quigley"]]],
  "ocr-misaligned.pdf": [[[0, "Quigley"]]],
  "outlined.pdf": [[[0, "P\u00e9guy"]]],
  "reach.pdf": [
    [[0, "Jeremy Quigley"]],
    [[1, "Jeremy Quigley"]],
    [[4, "Jeremy Quigley"]],
    [[5, "Jeremy Quigley"]],
    [[7, "Jeremy Quigley"]],
    [[8, "Jeremy Quigley"]],
    [[11, "Jeremy Quigley"]],
  ],
  "sample-agreement.pdf": [
    [
      [0, "alex.morgan@example.com"],
      [0, "Morgan"],
      [0, "Morgan"],
      [0, "morgan"],
    ],
  ],
  // Spec 0019's fourth pass (AC-17): the first page's line.
  "shared-pictures.pdf": [[[0, COLOUR_TEXT.sharedPictures[0]]]],
  "shared-xobject.pdf": [[[0, "SECRET-SHARED"]]],
  "single-spacing.pdf": [
    [[0, "Jeremy Quigley"]],
    [[1, "Jeremy Quigley"]],
    [[2, "Jeremy Quigley"]],
    [[3, "Jeremy Quigley"]],
    [
      [0, "Jeremy Quigley"],
      [1, "Jeremy Quigley"],
    ],
  ],
  "superscript.pdf": [[[0, "SECRET-SUP"]]],
  "terms.pdf": [
    [[0, "JOSE"]],
    [[0, "M\u00fcller"]],
    [[0, "Stra\u00dfe"]],
    [[0, "STRASSE"]],
    [[0, "Acme Ltd"]],
    [[0, "Ltd"]],
    [[0, "Smith-son"]],
    [[0, "Smith"]],
    [[0, "Jean-Luc"]],
    [[1, "Smithson"]],
    [[1, "SMITHSON"]],
    [[1, "Smith"]],
    [[3, "Acme Ltd"]],
    [[3, "Ltd"]],
    [[5, "Ltd"]],
    [[6, "Ltd"]],
    [
      [0, "JOSE"],
      [0, "M\u00fcller"],
      [0, "Stra\u00dfe"],
      [0, "STRASSE"],
      [0, "Acme Ltd"],
      [0, "Ltd"],
      [0, "Acme Ltd"],
      [0, "Ltd"],
      [0, "Smith-son"],
      [0, "Smith"],
      [0, "Jean-Luc"],
      [0, "Acme Ltd"],
      [0, "Ltd"],
      [1, "Smithson"],
      [1, "SMITHSON"],
      [1, "Smith"],
      [1, "Smith"],
      [1, "Smith"],
      [3, "Acme Ltd"],
      [3, "Ltd"],
      [5, "Ltd"],
      [6, "Ltd"],
    ],
    [
      [4, "Acme"],
      [5, "Ltd"],
    ],
    [[1, "0958"]],
  ],
  // The recorded MuPDF limit: refused alike here and on main's pipeline.
  "trim-carry.pdf": [[[0, TRIM_CARRY.ticked]]],
  // Not the last page: its shading reads as a picture under every item there
  // to the self check's pixel part, which refused a ticked run on main too.
  "trim-rotated.pdf": [[[0, TRIM_ROTATED.inside[0]]], [[1, TRIM_ROTATED.inside[1]]]],
  "two-lines.pdf": [[[0, "jane.doe@ example.com"]]],
  "watermark.pdf": [[[0, "SECRET-WM"]]],
  "xobject-twice.pdf": [[[0, "SECRET-99"]]],
  "xobject-two-pages.pdf": [[[0, "SECRET-77"]]],
};

/**
 * The fixtures they tick through detection, as they tick them: each target
 * detection finds alone, all of them together, or both.
 */
const DETECTED: Readonly<Record<string, "each" | "all" | "each and all">> = {
  "detect-blocked.pdf": "each",
  "detect-card.pdf": "each and all",
  "detect-date-forms.pdf": "each and all",
  "detect-date.pdf": "each and all",
  "detect-email.pdf": "each and all",
  "detect-iban.pdf": "each and all",
  "detect-many.pdf": "all",
  "detect-markers.pdf": "each and all",
  "detect-phone.pdf": "each and all",
  "detect-stamped.pdf": "each and all",
  "detect-uk-nino.pdf": "each and all",
  "detect-unicode.pdf": "each",
  "detect-us-ssn.pdf": "each and all",
  "detect-wraps.pdf": "all",
  "offset-cropbox.pdf": "each",
  "owner-aes128.pdf": "each",
  "owner-aes256.pdf": "each",
  "owner-rc4.pdf": "each",
  "read-covered.pdf": "each",
  "read-hidden.pdf": "each",
  "read-short-ocr.pdf": "each",
  "rotated-page.pdf": "each",
  "sample-agreement.pdf": "all",
  "text-page.pdf": "each and all",
  "trim-text.pdf": "each",
};

/** Where this spec changes `sanitized` on purpose (AC-4, AC-8). */
const SANITIZED_NOW: Readonly<Record<string, readonly SanitizedKind[]>> = {
  "kept-embedded.pdf": ["attachments"],
};

/**
 * Where this spec changes a run's outcome with nothing ticked on purpose
 * (AC-7, AC-16): `null` for a file made where main refused. Read with `in`,
 * never `??`, which would fall through a `null` to main's refusal.
 */
const RUN_NOW: Readonly<Record<string, EngineErrorKind | null>> = {
  "shared-forms.pdf": null,
};

/** What a run with nothing ticked must do now: `RUN_NOW`'s row wins, even a `null`. */
function runKindNow(name: string): EngineErrorKind | null {
  return name in RUN_NOW ? RUN_NOW[name] : (MAIN_RUN_REFUSALS[name] ?? null);
}

/**
 * Where spec 0020 changes an open's outcome on purpose (its AC-5, AC-8): the
 * four fixtures whose Type 3 glyphs share a drawing or show text. And where
 * spec 0006's Follow-up does (feature 30): a page holding a character MuPDF
 * cannot place, refused at open rather than in every run. And where spec 0021
 * does (its AC-3, AC-5): a CID font whose `/Ordering` is outside the token.
 * And where spec 0022 does (its AC-2, AC-6): an inline picture MuPDF's write
 * would lose, one fixture per place the open's role walk reads.
 * Read with `in`, like `RUN_NOW`.
 */
const OPEN_NOW: Readonly<Record<string, EngineErrorKind | null>> = {
  "glyph-drawn-form.pdf": "unreadable-structure",
  "glyph-shared-picture.pdf": "unreadable-structure",
  "glyph-text.pdf": "unreadable-structure",
  "glyph-undrawn-form.pdf": "unreadable-structure",
  "inline-indexed.pdf": "inline-picture",
  "kept-cid-strings.pdf": "unreadable-structure",
  "trim-unplaced.pdf": "unsupported",
};

/** What an open must do now: `OPEN_NOW`'s row wins, else main's. */
function openKindNow(name: string): EngineErrorKind | null {
  return name in OPEN_NOW ? OPEN_NOW[name] : (MAIN_OPEN_REFUSALS[name] ?? null);
}

/** The kind an open refuses with, or `null` if it opened. */
async function openKind(bytes: ArrayBuffer): Promise<EngineErrorKind | null> {
  try {
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    doc.close();
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

interface Outcome {
  readonly kind: EngineErrorKind | null;
  readonly result: RedactionResult | null;
}

async function outcomeOf(
  bytes: ArrayBuffer,
  targets: readonly RedactionTarget[],
  pipeline: Pipeline,
): Promise<Outcome> {
  try {
    return {
      kind: null,
      result: await redactDocumentWith(mupdf, bytes, targets, {}, pipeline),
    };
  } catch (failure) {
    if (failure instanceof EngineFailure)
      return { kind: failure.errorKind, result: null };
    throw failure;
  }
}

/**
 * One run through this build and through main's pipeline: the same outcome,
 * the same counts, and every page drawn the same.
 */
async function expectSameAsMain(
  name: string,
  targets: readonly RedactionTarget[],
  label: string,
): Promise<Outcome> {
  const now = await outcomeOf(fixture(name), targets, PIPELINE);
  const main = await outcomeOf(fixture(name), targets, MAIN);

  expect(now.kind, label).toBe(main.kind);
  if (now.result && main.result) {
    expect(now.result.removedByType, label).toEqual(main.result.removedByType);
    expect(pageRenders(now.result.output), label).toEqual(
      pageRenders(main.result.output),
    );
  }
  return now;
}

/** The ticked sets for one fixture, each with a label for a failure's message. */
async function tickedSets(
  name: string,
): Promise<{ readonly label: string; readonly targets: readonly RedactionTarget[] }[]> {
  const bytes = fixture(name);
  const sets: { label: string; targets: readonly RedactionTarget[] }[] = [];

  for (const needles of NEEDLES[name] ?? []) {
    // A needle listed twice ticks its second occurrence the second time.
    const used = new Map<string, number>();
    const targets = needles.map(([page, text]) => {
      const key = `${page} ${text}`;
      const occurrence = used.get(key) ?? 0;
      used.set(key, occurrence + 1);
      const found = findTargets(bytes, page, text)[occurrence];
      if (!found) throw new Error(`${name}: "${text}" not found on page ${page + 1}`);
      return found;
    });
    const label = needles
      .map(([page, text]) => `"${text}" on page ${page + 1}`)
      .join(", ");
    sets.push({ label, targets });
  }

  const detected = DETECTED[name];
  if (detected !== undefined) {
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    let targets: RedactionTarget[];
    try {
      const found = await doc.findMatches({ contextChars: 40 });
      targets = found.flatMap((match) => (match.target ? [match.target] : []));
    } finally {
      doc.close();
    }
    if (detected !== "all") {
      targets.forEach((target, index) => {
        sets.push({
          label: `detected target ${index + 1}, page ${target.page + 1}`,
          targets: [target],
        });
      });
    }
    if (detected === "all" || (detected === "each and all" && targets.length > 1)) {
      sets.push({ label: "every detected target", targets });
    }
  }

  return sets;
}

/** Every committed fixture, in the order `MAIN_FIXTURES` lists them. */
const NAMES = readdirSync(new URL("../fixtures/", import.meta.url))
  .filter((name) => name.endsWith(".pdf"))
  .sort();

/** The gate's own tables, held to the fixtures they describe. */
function gateTables(): void {
  describe("the gate's tables", () => {
    it("cover every committed fixture, each with rows read from main's code, and only those", () => {
      expect(NAMES).toEqual(MAIN_FIXTURES);
    });

    it("change a run's outcome only for fixtures main read", () => {
      for (const name of Object.keys(RUN_NOW))
        expect(MAIN_FIXTURES, name).toContain(name);
    });

    it("change an open's outcome only for fixtures main read", () => {
      for (const name of Object.keys(OPEN_NOW))
        expect(MAIN_FIXTURES, name).toContain(name);
    });

    it("tick only fixtures that open and run", () => {
      for (const name of [...Object.keys(NEEDLES), ...Object.keys(DETECTED)]) {
        expect(NAMES, name).toContain(name);
        expect(openKindNow(name), name).toBeNull();
      }
    });
  });
}

/** Every fixture's three checks. */
function gateFixture(name: string): void {
  describe(name, () => {
    it("opens as it did on main, or as OPEN_NOW refuses it", async () => {
      await expect(openKind(fixture(name))).resolves.toBe(openKindNow(name));
    });

    if (openKindNow(name) !== null) return;

    it("runs with nothing ticked as it did on main, every page drawn as main drew it", async () => {
      const now = await expectSameAsMain(name, [], "nothing ticked");

      expect(now.kind).toBe(runKindNow(name));
      if (now.result) {
        expect(now.result.sanitized).toEqual(
          SANITIZED_NOW[name] ?? MAIN_SANITIZED[name] ?? [],
        );
      }
    }, 120_000);

    if (NEEDLES[name] === undefined && DETECTED[name] === undefined) return;

    it("draws every page as main drew it, with each ticked set the redaction tests use", async () => {
      const sets = await tickedSets(name);
      expect(sets.length).toBeGreaterThan(0);
      for (const { label, targets } of sets) await expectSameAsMain(name, targets, label);
    }, 300_000);
  });
}

/**
 * Register part `part` of `parts`: every fixture whose place in the list
 * leaves that remainder, and the tables' own checks in part 0.
 */
export function gateFixtures(part: number, parts: number): void {
  beforeAll(() => {
    silenceEngineLog(mupdf);
  });
  if (part === 0) gateTables();
  NAMES.forEach((name, index) => {
    if (index % parts === part) gateFixture(name);
  });
}
