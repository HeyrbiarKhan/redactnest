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
 *    is read from 5c4e0d7's code.
 *  - Against the same run with the pipeline's prune and structure check both
 *    swapped out, which writes main's output byte for byte (`MAIN`): the same
 *    outcome, the same `removedByType`, and every page rendered pixel for pixel
 *    the same. Once with nothing ticked, and once with each ticked set the
 *    redaction tests already run on the fixture, since a pass makes new figures
 *    and pictures the prune also walks.
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

/** Main's pipeline: the prune and the structure check both swapped out (AC-7). */
const MAIN: Pipeline = Object.freeze({
  ...PIPELINE,
  pruneToRoles: () => {},
  checkStructure: () => "clean" as const,
});

type Ticked = readonly (readonly [page: number, text: string])[];

/** Every committed fixture main's code read, at 5c4e0d7. */
const MAIN_FIXTURES: readonly string[] = [
  "actual-text.pdf",
  "angled-text.pdf",
  "bounds-pin.pdf",
  "carlito.pdf",
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
  "header-at-1019.pdf",
  "header-at-1020.pdf",
  "images-under.pdf",
  "kept-annotations.pdf",
  "kept-catalog.pdf",
  "kept-embedded.pdf",
  "kept-figure.pdf",
  "kept-picture.pdf",
  "kept-program-keys.pdf",
  "kerning.pdf",
  "layers-all-on.pdf",
  "layers-one-off.pdf",
  "lone-glyphs.pdf",
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
  "shared-xobject.pdf",
  "single-spacing.pdf",
  "superscript.pdf",
  "terms-dense.pdf",
  "terms.pdf",
  "text-page.pdf",
  "trim-edge.pdf",
  "trim-kept.pdf",
  "trim-ocr.pdf",
  "trim-quote.pdf",
  "trim-refused.pdf",
  "trim-scan.pdf",
  "trim-text.pdf",
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
  "images-under.pdf": [
    [
      [0, "12345678"],
      [0, "40-11-22"],
    ],
  ],
  "kept-figure.pdf": [[[0, "SECRET-42"]]],
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
    it("cover every committed fixture main's code read, and only those", () => {
      expect(NAMES).toEqual(MAIN_FIXTURES);
    });

    it("tick only fixtures that open and run", () => {
      for (const name of [...Object.keys(NEEDLES), ...Object.keys(DETECTED)]) {
        expect(NAMES, name).toContain(name);
        expect(MAIN_OPEN_REFUSALS[name], name).toBeUndefined();
      }
    });
  });
}

/** Every fixture's three checks. */
function gateFixture(name: string): void {
  describe(name, () => {
    it("opens as it did on main", async () => {
      await expect(openKind(fixture(name))).resolves.toBe(
        MAIN_OPEN_REFUSALS[name] ?? null,
      );
    });

    if (MAIN_OPEN_REFUSALS[name] !== undefined) return;

    it("runs with nothing ticked as it did on main, every page drawn as main drew it", async () => {
      const now = await expectSameAsMain(name, [], "nothing ticked");

      expect(now.kind).toBe(MAIN_RUN_REFUSALS[name] ?? null);
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
