import type { Font, Image, PDFPage, StructuredText } from "mupdf";
import { describe, expect, it } from "vitest";

import {
  EngineFailure,
  EXTRACTION_OPTIONS,
  walkCharacters,
  type Character,
} from "@/engine";

/**
 * The one character reader and its code point repair. Spec 0005, AC-26,
 * INV-10 and INV-12.
 *
 * `detection.test.ts` proves the repair on a real page (`detect-unicode.pdf`).
 * No fixture can make MuPDF's JSON disagree with its own walker, so the fail
 * closed half is proved here, over a stand in page. Its walker cuts every code
 * point to its low 16 bits with `String.fromCharCode`, exactly as MuPDF.js
 * 1.28.1's does, and its `asText()` and `asJSON()` return whole code points,
 * as the real ones do. Each refusal case then changes one of those answers.
 */

type Walker = Parameters<StructuredText["walk"]>[0];

/** A text block, as its lines' whole text, or an image block. */
type Block = readonly string[] | "image";

interface StandIn {
  readonly page: PDFPage;
  readonly calls: { asJSON: number; destroyed: number };
}

// The reader never looks at a font or an image, so these stand in for both.
const NO_FONT = null as unknown as Font;
const NO_IMAGE = null as unknown as Image;
const BOX: [number, number, number, number] = [0, 0, 100, 20];

/** What MuPDF.js 1.28.1's walker hands over for one line: each code point's low 16 bits. */
function cut(line: string): readonly string[] {
  return Array.from(line, (point) =>
    String.fromCharCode((point.codePointAt(0) ?? 0) & 0xffff),
  );
}

/** The JSON MuPDF prints for the blocks, trimmed to what the reader reads. */
function jsonOf(blocks: readonly Block[]): string {
  return JSON.stringify({
    blocks: blocks.map((block) =>
      block === "image"
        ? { type: "image" }
        : { type: "text", lines: block.map((text) => ({ text })) },
    ),
  });
}

/**
 * A page holding `blocks`. `walked` replaces what the walker hands over, one
 * list of characters per text line, and `json` replaces what `asJSON()`
 * prints, so a case can make the two disagree.
 */
function standIn(
  blocks: readonly Block[],
  changes: { walked?: readonly (readonly string[])[]; json?: string } = {},
): StandIn {
  const calls = { asJSON: 0, destroyed: 0 };
  const lines = blocks.flatMap((block) => (block === "image" ? [] : block));
  const walked = changes.walked ?? lines.map(cut);

  const stext = {
    asText: () => lines.join("\n"),
    asJSON: () => {
      calls.asJSON += 1;
      return changes.json ?? jsonOf(blocks);
    },
    walk: (walker: Walker) => {
      let line = 0;
      for (const block of blocks) {
        if (block === "image") {
          walker.onImageBlock?.(BOX, [1, 0, 0, 1, 0, 0], NO_IMAGE);
          continue;
        }
        walker.beginTextBlock?.(BOX);
        for (let count = 0; count < block.length; count += 1) {
          walker.beginLine?.(BOX, 0, [1, 0]);
          walked[line]?.forEach((character, at) => {
            const x = at * 10;
            walker.onChar?.(
              character,
              [x, 15],
              NO_FONT,
              10,
              [x, 5, x + 10, 5, x, 17, x + 10, 17],
              [0],
              0,
            );
          });
          walker.endLine?.();
          line += 1;
        }
        walker.endTextBlock?.();
      }
    },
    destroy: () => {
      calls.destroyed += 1;
    },
  };

  return { page: { toStructuredText: () => stext } as unknown as PDFPage, calls };
}

function read(page: PDFPage): readonly Character[] {
  const characters: Character[] = [];
  walkCharacters(page, EXTRACTION_OPTIONS[0], (character) => characters.push(character));
  return characters;
}

/** The kind a read refused with, or `undefined` when it did not refuse. */
function refusalOf(page: PDFPage): string | undefined {
  try {
    read(page);
  } catch (error) {
    if (error instanceof EngineFailure) return error.errorKind;
    throw error;
  }
  return undefined;
}

describe("reading whole code points (AC-26, INV-12)", () => {
  it("reads a page with no letter above U+FFFF from the walker alone, never from JSON", () => {
    const { page, calls } = standIn([["jane@example.com"]]);

    expect(String.fromCodePoint(...read(page).map(({ code }) => code))).toBe(
      "jane@example.com",
    );
    expect(calls.asJSON).toBe(0);
  });

  it("puts each line's whole code points in place of the ones the walker cut", () => {
    const { page, calls } = standIn([["\u{20BB7}\u{2D800}@example.jp", "\u{1D400}b"]]);

    expect(read(page).map(({ code }) => code)).toEqual([
      0x20bb7,
      0x2d800,
      ...Array.from("@example.jp", (point) => point.codePointAt(0)),
      0x1d400,
      0x62,
    ]);
    expect(calls.asJSON).toBe(1);
  });

  it("counts blocks and lines across the page, passing over an image block", () => {
    const { page } = standIn([["\u{1D400}", "a"], "image", ["b"]]);

    expect(read(page).map(({ code, block, line }) => ({ code, block, line }))).toEqual([
      { code: 0x1d400, block: 0, line: 0 },
      { code: 0x61, block: 0, line: 1 },
      { code: 0x62, block: 1, line: 2 },
    ]);
  });
});

/**
 * INV-10: a repair that cannot line up refuses rather than guess. Detection
 * and validation report `unsupported`; the self check turns the same throw
 * into `redaction-incomplete`.
 */
describe("a repair that cannot line up", () => {
  it("refuses a walked character that is not its code point's low 16 bits", () => {
    const { page } = standIn([["\u{1D400}"]], { walked: [["퐁"]] });

    expect(refusalOf(page)).toBe("unsupported");
  });

  it("refuses a line whose JSON holds more code points than the walker gave", () => {
    const { page } = standIn([["\u{1D400}ab"]], { walked: [["퐀", "a"]] });

    expect(refusalOf(page)).toBe("unsupported");
  });

  it("refuses a line whose JSON holds fewer code points than the walker gave", () => {
    const { page } = standIn([["\u{1D400}"]], { walked: [["퐀", "a"]] });

    expect(refusalOf(page)).toBe("unsupported");
  });

  it("refuses JSON holding a line the walker never reached", () => {
    const { page } = standIn([["\u{1D400}"]], {
      json: jsonOf([["\u{1D400}", "a"]]),
    });

    expect(refusalOf(page)).toBe("unsupported");
  });

  it.each([
    ["JSON that does not parse", "{"],
    ["no blocks at all", "null"],
    ["blocks that are not a list", '{"blocks":{}}'],
    ["a text block with no lines", '{"blocks":[{"type":"text"}]}'],
    ["a line with no text", '{"blocks":[{"type":"text","lines":[{}]}]}'],
    [
      "a line whose text is not a string",
      '{"blocks":[{"type":"text","lines":[{"text":7}]}]}',
    ],
  ])("refuses %s", (_what, json) => {
    const { page } = standIn([["\u{1D400}"]], { json });

    expect(refusalOf(page)).toBe("unsupported");
  });

  it("destroys the structured text whether the read passes or is refused", () => {
    const passes = standIn([["\u{1D400}"]]);
    const refused = standIn([["\u{1D400}"]], { walked: [["퐁"]] });

    read(passes.page);
    refusalOf(refused.page);

    expect(passes.calls.destroyed).toBe(1);
    expect(refused.calls.destroyed).toBe(1);
  });
});
