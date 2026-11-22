import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it } from "vitest";

import {
  EngineFailure,
  openDocumentWith,
  PIPELINE,
  redactDocumentWith,
  RunCancelled,
  silenceEngineLog,
  structureIsClean,
  type Pipeline,
  type RedactionTarget,
  type StructureVerdict,
} from "@/engine";

import { INLINE_TEXT } from "../../scripts/lib/inline-fixtures.mjs";
import { UNREADABLE_PROFILE } from "../../scripts/lib/kept-fixtures.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { fixture } from "../support/bytes";
import { LIMITS, mupdf, pageContent, render } from "../support/mupdf";
import { findTarget } from "../support/targets";

/**
 * An inline picture MuPDF's write would lose. Spec 0022.
 *
 * MuPDF 1.28.1's write can carry an inline picture's colour space only as the
 * name written under `/CS`. A palette written inline leaves as `/CS/`, an
 * empty name, so the cleaned copy draws nothing there and the check passes
 * with nothing ticked (measured, `rationale.md`). Each fixture holds that
 * picture in one place the open's role walk reads; each failed here first,
 * opening on the code before this spec (AC-6).
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

/** One fixture per place the open's role walk reads (AC-6). */
const PLACES = ["inline-indexed.pdf"] as const;

/** The kind an open refuses with, or `null` if it opened. */
async function openKind(bytes: ArrayBuffer): Promise<string | null> {
  try {
    const doc = await openDocumentWith(mupdf, bytes, LIMITS);
    doc.close();
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

/** The kind a run fails with, or `null` if it made a file. */
async function runKind(
  bytes: ArrayBuffer,
  targets: readonly RedactionTarget[],
  pipeline: Pipeline = PIPELINE,
): Promise<string | null> {
  try {
    await redactDocumentWith(mupdf, bytes, targets, {}, pipeline);
    return null;
  } catch (failure) {
    if (failure instanceof EngineFailure) return failure.errorKind;
    throw failure;
  }
}

/** A pipeline whose text pass and trim count their calls and do as the real ones do. */
function countedPasses() {
  const calls = { textPass: 0, trim: 0 };
  const pipeline: Pipeline = {
    ...PIPELINE,
    textPass: (engine, page, areas) => {
      calls.textPass += 1;
      PIPELINE.textPass(engine, page, areas);
    },
    trim: (engine, pdf, isCancelled) => {
      calls.trim += 1;
      return PIPELINE.trim(engine, pdf, isCancelled);
    },
  };
  return { pipeline, calls };
}

/** A palette written inline: the picture MuPDF's write loses (AC-1). */
const LOST = `BI /W 1 /H 1 /BPC 8 /CS [/I /RGB 0 <FF0000>] ID ${String.fromCharCode(0)} EI`;

/**
 * One page drawing a line of Helvetica and `contents`, beside a form `/Fm0`
 * with no resources of its own drawing `form`. Built here with the fixture
 * script's serialiser.
 */
function withForm(contents: string, form: string): ArrayBuffer {
  const { bytes } = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        "/Resources << /Font << /F1 5 0 R >> /XObject << /Fm0 6 0 R >> >> /Contents 4 0 R >>",
      stream("", `BT /F1 18 Tf 72 700 Td (${INLINE_TEXT}) Tj ET\n/Fm0 Do\n${contents}`),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream("/Type /XObject /Subtype /Form /BBox [0 0 100 100]", form),
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

describe("the open refuses (AC-2, AC-6)", () => {
  it.each(PLACES)("refuses %s at open with inline-picture", async (name) => {
    await expect(openKind(fixture(name))).resolves.toBe("inline-picture");
  });

  it("reads every drawing on the page, so a lost picture after one the scan cannot read is still refused", async () => {
    await expect(
      openKind(withForm("q ] Q", `q 100 0 0 100 0 0 cm ${LOST} Q`)),
    ).resolves.toBe("inline-picture");
  });

  /** INV-4's one exception: a drawing the scan cannot read keeps today's warning. */
  it("warns, and does not refuse, when the only lost picture sits in a drawing the scan cannot read", async () => {
    const doc = await openDocumentWith(
      mupdf,
      withForm(`q 100 0 0 100 72 500 cm ${LOST} Q q ] Q`, "0 0 10 10 re f"),
      LIMITS,
    );
    try {
      expect(doc.summary.pages.map(({ findings }) => findings)).toEqual([
        ["marked-descriptions"],
      ]);
    } finally {
      doc.close();
    }
  });

  it("opens the same page with its picture written under a device name", async () => {
    await expect(
      openKind(withForm("", "q 100 0 0 100 0 0 cm BI /W 1 /H 1 /BPC 8 /CS /G ID x EI Q")),
    ).resolves.toBeNull();
  });
});

/**
 * AC-3: a run asks the same rule on its own prepared copy, before anything is
 * removed, so bytes handed to a run with no open never come back without the
 * picture. The worker only ever runs the default.
 */
describe("a run refuses before anything is removed (AC-3)", () => {
  it("refuses inline-indexed.pdf with nothing ticked", async () => {
    await expect(runKind(fixture("inline-indexed.pdf"), [])).resolves.toBe(
      "inline-picture",
    );
  });

  it("refuses it with its line ticked before the trim or any pass runs", async () => {
    const bytes = fixture("inline-indexed.pdf");
    const { pipeline, calls } = countedPasses();

    await expect(
      runKind(bytes, [findTarget(bytes, 0, INLINE_TEXT)], pipeline),
    ).resolves.toBe("inline-picture");
    expect(calls).toEqual({ textPass: 0, trim: 0 });
  });

  it("gives unsupported when the rule throws", async () => {
    const throwing: Pipeline = {
      ...PIPELINE,
      judgeInlinePictures: () => {
        throw new Error("the scan failed");
      },
    };
    await expect(runKind(fixture("text-page.pdf"), [], throwing)).resolves.toBe(
      "unsupported",
    );
  });

  it("gives unreadable-structure when the rule's walk names a problem", async () => {
    const problem: Pipeline = { ...PIPELINE, judgeInlinePictures: () => "problem" };
    await expect(runKind(fixture("text-page.pdf"), [], problem)).resolves.toBe(
      "unreadable-structure",
    );
  });

  it("hears a cancel made during the rule before the trim starts", async () => {
    const { pipeline, calls } = countedPasses();
    let judged = false;
    const judging: Pipeline = {
      ...pipeline,
      judgeInlinePictures: () => {
        judged = true;
        return "kept";
      },
    };

    await expect(
      redactDocumentWith(
        mupdf,
        fixture("text-page.pdf"),
        [],
        { isCancelled: () => judged },
        judging,
      ),
    ).rejects.toBeInstanceOf(RunCancelled);
    expect(calls.trim).toBe(0);
  });

  it("makes a file from a document whose pictures all come through, as today", async () => {
    await expect(runKind(fixture("colour-inline.pdf"), [])).resolves.toBeNull();
    await expect(runKind(fixture("glyph-bitmap.pdf"), [])).resolves.toBeNull();
  });
});

/** The run with the inline picture rule swapped out, so only the check can see a lost picture. */
const SKIP_RULE: Pipeline = { ...PIPELINE, judgeInlinePictures: () => "kept" };

/** Is any pixel inside the 100 point picture at 72, 500 ink, on page 1? */
function drawsPicture(bytes: ArrayBuffer): boolean {
  const page = render(bytes, 0, 2);
  for (let y = 505; y < 595; y += 10) {
    for (let x = 77; x < 167; x += 10) {
      const [column, row] = page.pixelAt(x, 792 - y);
      if (page.isInk(column, row)) return true;
    }
  }
  return false;
}

/**
 * AC-4: the check's backstop, for a scan that missed. With the run's rule
 * swapped out, a picture the write turned into `/CS/` fails the check on a
 * page with nothing ticked. On a page with a target the redaction pass and the
 * write are two filter passes, so the picture leaves whole and nothing in the
 * bytes shows it: that limit is pinned here, and only the refusals hold it.
 */
describe("the check's backstop, with the rule skipped (AC-4)", () => {
  it("fails inline-indexed.pdf with nothing ticked with unsupported, and makes no file", async () => {
    await expect(runKind(fixture("inline-indexed.pdf"), [], SKIP_RULE)).resolves.toBe(
      "unsupported",
    );
  });

  it("makes a file from it with its line ticked that passes the check and draws no picture", async () => {
    const bytes = fixture("inline-indexed.pdf");
    expect(drawsPicture(bytes)).toBe(true);

    const { output } = await redactDocumentWith(
      mupdf,
      bytes,
      [findTarget(bytes, 0, INLINE_TEXT)],
      {},
      SKIP_RULE,
    );

    expect(drawsPicture(output)).toBe(false);
    expect(pageContent(output, 0)).not.toMatch(/\bBI\b/);
  });
});

/**
 * One page drawing `contents`, with `resources` as its `/Resources` entries,
 * or no `/Resources` key at all when `null`.
 */
function onePage(resources: string | null, contents: string): ArrayBuffer {
  const { bytes } = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
        (resources === null ? "" : `/Resources << ${resources} >> `) +
        "/Contents 4 0 R >>",
      stream("", contents),
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

/** The structure part's verdict on bytes built here, as written. */
function verdictOf(bytes: ArrayBuffer): StructureVerdict {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    return structureIsClean(doc.asPDF() as PDFDocument, 1);
  } finally {
    doc.destroy();
  }
}

/** A picture whose dictionary holds `space` as its colour space. */
const pictureIn = (space: string) =>
  `q 10 0 0 10 0 0 cm BI /W 1 /H 1 /BPC 8 ${space} ID x EI Q`;

const CS1 = "/ColorSpace << /Cs1 [/CalRGB << /WhitePoint [0.9505 1 1.089] >>] >>";

describe("structureIsClean and a lost inline picture (AC-4)", () => {
  it("answers lost-picture for an inline /CS/, as MuPDF writes a lost one", () => {
    expect(verdictOf(onePage("", pictureIn("/CS/")))).toBe("lost-picture");
  });

  it("answers lost-picture for /CS /Cs9 with no /Cs9 entry", () => {
    expect(verdictOf(onePage("", pictureIn("/CS /Cs9")))).toBe("lost-picture");
  });

  it("answers clean for /CS /Cs1 with its entry", () => {
    expect(verdictOf(onePage(CS1, pictureIn("/CS /Cs1")))).toBe("clean");
  });

  it("answers lost-picture for a /CS/ on a page with no /Resources at all", () => {
    expect(verdictOf(onePage(null, pictureIn("/CS/")))).toBe("lost-picture");
  });

  it("answers lost-picture for /CS /Cs1 on a page with no /Resources, which resource use never reads", () => {
    expect(verdictOf(onePage(null, pictureIn("/CS /Cs1")))).toBe("lost-picture");
  });

  it("answers clean for a page with no /Resources whose picture is a device one", () => {
    expect(verdictOf(onePage(null, pictureIn("/CS /G")))).toBe("clean");
  });

  it("answers unreadable for a page with no /Resources whose contents the scan cannot read", () => {
    expect(verdictOf(onePage(null, `${pictureIn("/CS/")} q ] Q`))).toBe("unreadable");
  });

  it("ranks a lost picture above an unused colour space entry beside it", () => {
    expect(verdictOf(onePage(CS1, ""))).toBe("unused-colour-space");
    expect(verdictOf(onePage(CS1, pictureIn("/CS/")))).toBe("lost-picture");
  });
});

/**
 * A page painting through an unreadable profile, which leaves a colour space
 * entry nothing names after the first write (spec 0019, AC-15), beside a line
 * of Helvetica and, when `lost` is set, a palette picture written inline.
 */
function unloadableBeside(lost: boolean): ArrayBuffer {
  const picture = lost ? `q 100 0 0 100 72 500 cm ${LOST} Q ` : "";
  const { bytes } = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << " +
        "/Font << /F1 5 0 R >> /ColorSpace << /CS0 [/ICCBased 6 0 R] >> >> /Contents 4 0 R >>",
      stream(
        "",
        `${picture}q /CS0 cs 0.2 0.4 0.6 sc 300 500 100 100 re f Q ` +
          `BT /F1 18 Tf 72 700 Td (${INLINE_TEXT}) Tj ET`,
      ),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      stream("/N 3", UNREADABLE_PROFILE),
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

/** A structure check and a second write that record what they were asked. */
function counted() {
  const verdicts: StructureVerdict[] = [];
  const calls = { rewrite: 0 };
  const pipeline: Pipeline = {
    ...SKIP_RULE,
    checkStructure: (check, count) => {
      const verdict = structureIsClean(check, count);
      verdicts.push(verdict);
      return verdict;
    },
    rewrite: (engine, bytes) => {
      calls.rewrite += 1;
      return PIPELINE.rewrite(engine, bytes);
    },
  };
  return { pipeline, verdicts, calls };
}

/**
 * AC-4: a lost picture never leads to a second write, which is a second filter
 * pass that would drop a `/CS/` picture whole and hide the loss from the check.
 */
describe("a lost picture beside an unused colour space entry (AC-4)", () => {
  it("writes the same page with no lost picture a second time, as spec 0019 does", async () => {
    const { pipeline, verdicts, calls } = counted();

    await expect(runKind(unloadableBeside(false), [], pipeline)).resolves.toBeNull();
    expect(verdicts).toEqual(["unused-colour-space", "clean"]);
    expect(calls.rewrite).toBe(1);
  });

  it("fails the page with a lost picture with unsupported, and never writes it twice", async () => {
    const { pipeline, verdicts, calls } = counted();

    await expect(runKind(unloadableBeside(true), [], pipeline)).resolves.toBe(
      "unsupported",
    );
    expect(verdicts).toEqual(["lost-picture"]);
    expect(calls.rewrite).toBe(0);
  });
});
