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
  WRITE_OPTIONS,
  type Pipeline,
  type RedactionTarget,
  type StructureVerdict,
} from "@/engine";

import { INLINE_TEXT } from "../../scripts/lib/inline-fixtures.mjs";
import { UNREADABLE_PROFILE } from "../../scripts/lib/kept-fixtures.mjs";
import { latin1, stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { fixture } from "../support/bytes";
import {
  inspect,
  keysOf,
  LIMITS,
  mupdf,
  pageContent,
  pageText,
  render,
} from "../support/mupdf";
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
const PLACES = [
  "inline-indexed.pdf",
  "inline-indexed-form.pdf",
  "inline-indexed-pattern.pdf",
  "inline-indexed-glyph.pdf",
] as const;

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
  it.each(PLACES)("refuses %s with nothing ticked", async (name) => {
    await expect(runKind(fixture(name), [])).resolves.toBe("inline-picture");
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
    checkStructure: (check, count, ticked) => {
      const verdict = structureIsClean(check, count, ticked);
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

/** The pin's lines: one above its picture, one below. */
const ABOVE = "Before the picture";
const BELOW = "After the picture";

const PALETTE = "<FF0000 00FF00 0000FF FFFF00>";
const INDEXED = `[/I /RGB 3 ${PALETTE}]`;
const WHITE = "<< /WhitePoint [0.9505 1 1.089] >>";
const TINT = "<< /FunctionType 2 /Domain [0 1] /C0 [0 0 0 0] /C1 [1 0 0 0] /N 1 >>";

/** Data that fills a 2 by 2 picture in each space MuPDF may load, as task 8 wrote it. */
const DATA = {
  index: [0, 1, 2, 3],
  pair: [0, 1, 1, 0],
  rgb: [255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0],
  cmyk: [0, 255, 255, 0, 255, 0, 255, 0, 255, 255, 0, 0, 0, 0, 255, 0],
  gray: [0, 85, 170, 200],
  mask: [0x40, 0x80],
} as const;

type Data = keyof typeof DATA;

/** A mask's data is 1 bit deep, anything else 8. */
const depthOf = (data: Data) => (data === "mask" ? 1 : 8);

/**
 * The pin's page, as task 8 built it (`rationale.md`, *Task 8's
 * measurements*): a line of Helvetica above and below one 2 by 2 picture,
 * drawn 100 points square at 72, 500, whose dictionary holds `dict`, with
 * `/Cs1` and `/Cs2` (indexed spaces over RGB) and `/Cs3` (calibrated RGB) in
 * the page's resources. Task 8 wrote the indexed resources with the inline
 * abbreviations, which only MuPDF alone accepts; here they take their full
 * names, so a run's role walk reads the page too.
 */
function pinPage(dict: string, data: Data, bpc: number): ArrayBuffer {
  const contents = Uint8Array.from([
    ...latin1(
      `BT /F1 18 Tf 72 700 Td (${ABOVE}) Tj ET\n` +
        `q 100 0 0 100 72 500 cm BI /W 2 /H 2 /BPC ${bpc} ${dict} ID `,
    ),
    ...DATA[data],
    ...latin1(` EI Q\nBT /F1 18 Tf 72 300 Td (${BELOW}) Tj ET`),
  ]);
  const { bytes } = writePdf({
    objects: [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << " +
        `/Font << /F1 5 0 R >> /ColorSpace << /Cs1 [/Indexed /DeviceRGB 3 ${PALETTE}] ` +
        "/Cs2 [/Indexed /DeviceRGB 3 <00FFFF FF00FF FFFF00 000000>] " +
        `/Cs3 [/CalRGB ${WHITE}] >> >> /Contents 4 0 R >>`,
      stream("", contents),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ],
    trailer: "/Root 1 0 R",
  });
  return bytes.slice().buffer;
}

/**
 * A dictionary holding two keys, written in both orders. Every such row in
 * the pin is the key order's tripwire: a release that reads the long key
 * first fails one of them, and AC-1 then goes back to `/architect` (AC-6).
 */
const bothOrders = (one: string, other: string): readonly string[] => [
  `${one} ${other}`,
  `${other} ${one}`,
];

/** One case: a short title, the dictionary, its data and its depth. */
type Row = readonly [title: string, dict: string, data: Data, bpc: number];

function row(dict: string, data: Data, bpc = depthOf(data)): Row {
  const title =
    dict === "" ? "no colour space and no mask" : dict.replaceAll(PALETTE, "<...>");
  return [title, dict, data, bpc];
}

/** MuPDF alone: `bytes` opened and saved with the engine's write options. */
function writtenByMuPdf(bytes: ArrayBuffer): ArrayBuffer {
  return inspect(bytes, (doc) => {
    const buffer = doc.saveToBuffer(WRITE_OPTIONS);
    try {
      return buffer.asUint8Array().slice().buffer;
    } finally {
      buffer.destroy();
    }
  });
}

/** One token of a dictionary written in a content stream. */
const TOKEN = /\/[^\s/[\]<>(){}%]*|<<|>>|<[\dA-Fa-f\s]*>|[[\]]|[^\s/[\]<>(){}%]+/g;

/**
 * What page 1's inline picture says after a write: `/CS` and the name it
 * holds (`/CS/` for the empty name), else `/IM` and its value, or `null` when
 * no `BI` is left.
 */
function pictureWritten(output: ArrayBuffer): string | null {
  const dict = /\bBI\b([\s\S]*?)\bID\b/.exec(pageContent(output, 0));
  if (dict === null) return null;
  const tokens: readonly string[] = dict[1].match(TOKEN) ?? [];
  const after = (key: string) => {
    const at = tokens.indexOf(key);
    return at < 0 ? null : (tokens[at + 1] ?? "");
  };
  const space = after("/CS");
  if (space !== null) return `/CS${space}`;
  const mask = after("/IM");
  return mask === null ? "" : `/IM ${mask}`;
}

/** The keys of page 1's `/ColorSpace` resources. */
function colourSpaceEntries(bytes: ArrayBuffer): readonly string[] {
  return inspect(bytes, (doc) => {
    const resources = doc.findPage(0).get("Resources");
    if (!resources.isDictionary()) return [];
    const spaces = resources.get("ColorSpace");
    return spaces.isDictionary() ? keysOf(spaces) : [];
  });
}

/** Page 1's extracted text. */
const textOf = (bytes: ArrayBuffer) => inspect(bytes, (doc) => pageText(doc, 0));

/**
 * The colour at the centre of each of the picture's four cells, row by row
 * from the top, as hex.
 */
function cellsOf(bytes: ArrayBuffer): readonly string[] {
  const page = render(bytes, 0, 2);
  const stride = page.pixels.length / page.height;
  return [0, 1].flatMap((cellRow) =>
    [0, 1].map((cellColumn) => {
      const [column, pixelRow] = page.pixelAt(
        97 + 50 * cellColumn,
        792 - (575 - 50 * cellRow),
      );
      const at = pixelRow * stride + column * 3;
      return [...page.pixels.slice(at, at + 3)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
    }),
  );
}

const BLANK = ["ffffff", "ffffff", "ffffff", "ffffff"];

/** A kept case and what MuPDF writes for it. */
const kept = (dict: string, data: Data, written: string) =>
  [...row(dict, data), written] as const;

/**
 * AC-6: the MuPDF pin. Each case is opened and saved by MuPDF 1.28.1 alone
 * with `WRITE_OPTIONS`, and the test holds what the write did, row by row, as
 * task 8 measured it (`rationale.md`). A lost picture leaves in one of four
 * ways; a kept one is written under the space MuPDF loads and drawn as the
 * source draws it. The rows marked *measured in the build* were measured in
 * task 8 of the build, on the corrected rule, before they were pinned.
 */
describe("MuPDF 1.28.1's write and an inline picture (the pin, AC-6)", () => {
  it.each([
    // The upgrade tripwire: a release carrying upstream's a9e17fa86c writes
    // `/CS[/I/RGB ...]` here, and the rule then narrows by a reviewed change.
    row(`/CS ${INDEXED}`, "index"),
    row(`/CS [/Indexed /DeviceRGB 3 ${PALETTE}]`, "index"),
    row(`/CS [/CalRGB ${WHITE}]`, "rgb"),
    row(`/CS [/Lab ${WHITE}]`, "rgb"),
    row(`/CS [/Separation /Spot /DeviceCMYK ${TINT}]`, "gray"),
    row(`/CS [/DeviceN [/Cyan] /DeviceCMYK ${TINT}]`, "gray"),
    row("/ColorSpace /Cs1", "index"),
    ...bothOrders(`/CS ${INDEXED}`, "/ColorSpace /DeviceRGB").map((dict) =>
      row(dict, "index"),
    ),
    // Measured in the build: of a repeated `/CS`, the last one counts.
    row(`/CS /RGB /CS ${INDEXED}`, "index"),
  ])(
    "writes %s as /CS/, keeping no colour space entry, and draws none of it",
    (_title, dict, data, bpc) => {
      const bytes = pinPage(dict, data, bpc);
      expect(cellsOf(bytes)).not.toEqual(BLANK);

      const output = writtenByMuPdf(bytes);

      expect(pictureWritten(output)).toBe("/CS/");
      expect(colourSpaceEntries(output)).toEqual([]);
      expect(cellsOf(output)).toEqual(BLANK);
      expect(textOf(output)).toContain(BELOW);
    },
  );

  it.each([
    row("/CS [/I /Cs3 1 <FF000000FF00>]", "pair"),
    row("/CS/", "gray"),
    row("/ColorSpace 3", "gray"),
    row("/CS /RGB /Filter /JPXDecode", "rgb"),
    row("/CS /RGB /Filter [/JPXDecode]", "rgb"),
    row("/IM true /Filter /JPXDecode", "mask"),
    row("/IM true /Filter [/JPXDecode]", "mask"),
    // Measured in the build: a `/CS` name with no resource entry, the rule's
    // one under refusal (INV-4), and the empty name beside a device
    // `/ColorSpace`, whose RGB data would draw if a release read the long key.
    row("/CS /Cs9", "index"),
    ...bothOrders("/CS/", "/ColorSpace /DeviceRGB").map((dict) => row(dict, "rgb")),
  ])("leaves no BI for %s, and keeps the line after it", (_title, dict, data, bpc) => {
    const output = writtenByMuPdf(pinPage(dict, data, bpc));

    expect(pictureWritten(output)).toBeNull();
    expect(cellsOf(output)).toEqual(BLANK);
    expect(textOf(output)).toContain(BELOW);
  });

  /**
   * Task 8 wrote this picture with two data bytes at 8 bits, half what a 2 by
   * 2 picture holds, so MuPDF reads past `EI` and loses the rest of the
   * stream. With data that fills it, the write throws instead (below). Lost
   * either way (`rationale.md`, *Task 8's measurements, on the corrected
   * rule*).
   */
  it.each(bothOrders("/ImageMask true", "/IM false").map((dict) => row(dict, "mask", 8)))(
    "leaves no BI for %s with two data bytes at 8 bits, and drops the line after it",
    (_title, dict, data, bpc) => {
      const output = writtenByMuPdf(pinPage(dict, data, bpc));

      expect(pictureWritten(output)).toBeNull();
      expect(textOf(output)).not.toContain(BELOW);
    },
  );

  it.each([
    row("", "gray"),
    ...bothOrders("/ImageMask true", "/IM false").map((dict) => row(dict, "gray")),
    row("/CS /RGB /F /JPXDecode", "rgb"),
    row("/CS /RGB /F [/AHx /JPXDecode]", "rgb"),
  ])("throws while writing %s", (_title, dict, data, bpc) => {
    const bytes = pinPage(dict, data, bpc);
    expect(() => writtenByMuPdf(bytes)).toThrow();
  });

  it.each([
    kept("/CS /RGB", "rgb", "/CS/RGB"),
    kept("/CS /G", "gray", "/CS/G"),
    kept("/CS /DeviceCMYK", "cmyk", "/CS/CMYK"),
    kept("/CS [/DeviceRGB]", "rgb", "/CS/RGB"),
    kept("/CS [/RGB]", "rgb", "/CS/RGB"),
    kept("/CS [/DeviceRGB 7]", "rgb", "/CS/RGB"),
    kept("/ColorSpace /DeviceRGB", "rgb", "/CS/RGB"),
    kept("/ColorSpace [/RGB]", "rgb", "/CS/RGB"),
    kept("/CS [/CalCMYK << >>]", "cmyk", "/CS/CMYK"),
    kept("/CS /Cs1", "index", "/CS/Cs1"),
    ...bothOrders("/CS /Cs1", "/ColorSpace /Cs1").map((dict) =>
      kept(dict, "index", "/CS/Cs1"),
    ),
    ...bothOrders("/CS /Cs1", "/ColorSpace /Cs2").map((dict) =>
      kept(dict, "index", "/CS/Cs1"),
    ),
    ...bothOrders("/CS /Cs2", `/ColorSpace ${INDEXED}`).map((dict) =>
      kept(dict, "index", "/CS/Cs2"),
    ),
    ...bothOrders("/CS /RGB", `/ColorSpace ${INDEXED}`).map((dict) =>
      kept(dict, "rgb", "/CS/RGB"),
    ),
    ...bothOrders("/CS /G", "/ColorSpace /Cs1").map((dict) =>
      kept(dict, "gray", "/CS/G"),
    ),
    kept("/IM true", "mask", "/IM true"),
    ...bothOrders("/IM true", `/CS ${INDEXED}`).map((dict) =>
      kept(dict, "mask", "/IM true"),
    ),
    ...bothOrders("/IM true", "/ImageMask false").map((dict) =>
      kept(dict, "mask", "/IM true"),
    ),
    // The rule refuses it, since it looks no resource up (AC-1's rare cases),
    // so the pin shows that over refusal too.
    kept("/ColorSpace /Pattern", "gray", "/CS/G"),
    // Measured in the build: of a repeated `/CS`, the last one counts.
    kept(`/CS ${INDEXED} /CS /RGB`, "rgb", "/CS/RGB"),
  ])(
    "keeps %s, written under the space MuPDF loads and drawn as the source draws it",
    (_title, dict, data, bpc, written) => {
      const bytes = pinPage(dict, data, bpc);
      expect(cellsOf(bytes)).not.toEqual(BLANK);

      const output = writtenByMuPdf(bytes);

      expect(pictureWritten(output)).toBe(written);
      const entry = /^\/CS\/(Cs\d)$/.exec(written);
      expect(colourSpaceEntries(output)).toEqual(entry === null ? [] : [entry[1]]);
      expect(cellsOf(output)).toEqual(cellsOf(bytes));
      expect(textOf(output)).toContain(BELOW);
    },
  );
});

/**
 * AC-6: the three spellings the corrected rule keeps, each in both orders, run
 * on a page with a target. A tick puts two filter passes on the page (the
 * redaction pass, then the write), and the second reads only what the first
 * wrote (`/CS/Cs1`, `/CS/RGB`, `/IM true`), so two passes must carry each
 * picture as one does. The default pipeline runs, so the rule keeps them too.
 */
describe("the spellings the corrected rule keeps, run with a line ticked (AC-6)", () => {
  it.each([
    ...bothOrders("/CS /Cs1", "/ColorSpace /Cs2").map((dict) => row(dict, "index")),
    ...bothOrders("/CS /RGB", `/ColorSpace ${INDEXED}`).map((dict) => row(dict, "rgb")),
    ...bothOrders("/IM true", "/ImageMask false").map((dict) => row(dict, "mask")),
  ])(
    "makes a file from %s with the line above ticked, drawing the picture as the source does",
    async (_title, dict, data, bpc) => {
      const bytes = pinPage(dict, data, bpc);
      expect(cellsOf(bytes)).not.toEqual(BLANK);

      const { output } = await redactDocumentWith(mupdf, bytes, [
        findTarget(bytes, 0, ABOVE),
      ]);

      expect(cellsOf(output)).toEqual(cellsOf(bytes));
      expect(textOf(output)).not.toContain(ABOVE);
      expect(textOf(output)).toContain(BELOW);
    },
  );
});
