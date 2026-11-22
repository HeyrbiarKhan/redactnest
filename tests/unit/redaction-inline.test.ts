import { beforeAll, describe, expect, it } from "vitest";

import { EngineFailure, openDocumentWith, silenceEngineLog } from "@/engine";

import { INLINE_TEXT } from "../../scripts/lib/inline-fixtures.mjs";
import { stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { fixture } from "../support/bytes";
import { LIMITS, mupdf } from "../support/mupdf";

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
