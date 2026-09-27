import { beforeAll, describe, expect, it } from "vitest";

import { redactDocumentWith, silenceEngineLog } from "@/engine";
import type { SanitizedKind } from "@/worker/protocol";

import { appendRevision, stream, writePdf } from "../../scripts/lib/pdf-writer.mjs";
import { mupdf } from "../support/mupdf";

/**
 * The inventory, one row of spec 0004's inventory table at a time. AC-15 and
 * the *Everything else stripped* scenario: `sanitized` matches the table case
 * by case.
 *
 * The cleaning run in `redaction.test.ts` reads the fixture that carries every
 * kind at once, which cannot tell one rule from another that reports the same
 * kind: attachments are found three ways, form fields and scripts two ways
 * each. So here each document carries one thing, and a cleaning run must name
 * exactly its kind. A document that only looks as if it carries something (an
 * empty `/Info`, a form with no fields) must name nothing, because the outcome
 * line tells the visitor what was stripped, and a kind the file never had is a
 * claim the product cannot make.
 *
 * Each document is written by hand with the fixture script's serialiser, so
 * none of them is authored by the engine it tests.
 */

beforeAll(() => {
  silenceEngineLog(mupdf);
});

/** What one document adds to the plain one page file. */
interface Carrying {
  readonly catalog?: string;
  readonly page?: string;
  readonly trailer?: string;
  /** Objects 6 onwards, numbered in order. */
  readonly objects?: readonly (string | ReturnType<typeof stream>)[];
}

/** A one page file with a line of text, plus whatever `carrying` adds. */
function onePage({ catalog = "", page = "", trailer = "", objects = [] }: Carrying) {
  return writePdf({
    objects: [
      `<< /Type /Catalog /Pages 2 0 R ${catalog} >>`,
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] " +
        `/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R ${page} >>`,
      stream("", "BT /F1 12 Tf 20 100 Td (A plain page) Tj ET"),
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
      ...objects,
    ],
    trailer: `/Root 1 0 R ${trailer}`,
  });
}

/** A file spec at `num` whose embedded file is the object after it. */
function attachment(num: number) {
  return [
    `<< /Type /Filespec /F (notes.txt) /EF << /F ${num + 1} 0 R >> >>`,
    stream("/Type /EmbeddedFile", "attached contents"),
  ];
}

/** What a cleaning run over `written` says it stripped. */
async function sanitizedFrom(written: {
  bytes: Uint8Array;
}): Promise<readonly SanitizedKind[]> {
  const bytes = written.bytes.slice().buffer;
  const { sanitized } = await redactDocumentWith(mupdf, bytes, []);
  return sanitized;
}

describe("a document carrying one thing", () => {
  it.each([
    [
      "document info with an entry",
      onePage({ trailer: "/Info 6 0 R", objects: ["<< /Title (A private title) >>"] }),
      ["document-info"],
    ],
    [
      "an XMP packet on a page",
      onePage({
        page: "/Metadata 6 0 R",
        objects: [
          stream(
            "/Type /Metadata /Subtype /XML",
            "<x:xmpmeta xmlns:x='adobe:ns:meta/'/>",
          ),
        ],
      }),
      ["xmp-metadata"],
    ],
    [
      "a typed note",
      onePage({
        page: "/Annots [6 0 R]",
        objects: [
          "<< /Type /Annot /Subtype /Text /Rect [10 10 30 30] /Contents (A note) >>",
        ],
      }),
      ["annotations"],
    ],
    [
      "a link",
      onePage({
        page: "/Annots [6 0 R]",
        objects: [
          "<< /Type /Annot /Subtype /Link /Rect [10 10 90 30] /Border [0 0 0] " +
            "/A << /S /URI /URI (https://example.com/) >> >>",
        ],
      }),
      ["annotations"],
    ],
    [
      "a filled field, which is a form field and never an annotation",
      onePage({
        catalog: "/AcroForm << /Fields [6 0 R] >>",
        page: "/Annots [6 0 R]",
        objects: [
          "<< /Type /Annot /Subtype /Widget /FT /Tx /T (account_name) /V (Jane) " +
            "/DA (/Helv 12 Tf 0 g) /Rect [10 150 190 170] /F 4 >>",
        ],
      }),
      ["form-fields"],
    ],
    [
      "an XFA form with no AcroForm fields",
      onePage({
        catalog: "/AcroForm << /Fields [] /XFA 6 0 R >>",
        objects: [stream("", "<xdp:xdp xmlns:xdp='http://ns.adobe.com/xdp/'/>")],
      }),
      ["form-fields"],
    ],
    [
      "an attachment in the name tree",
      onePage({
        catalog: "/Names << /EmbeddedFiles << /Names [(notes.txt) 6 0 R] >> >>",
        objects: attachment(6),
      }),
      ["attachments"],
    ],
    [
      "an attachment one level down the name tree",
      onePage({
        catalog: "/Names << /EmbeddedFiles << /Kids [6 0 R] >> >>",
        objects: [
          "<< /Limits [(notes.txt) (notes.txt)] /Names [(notes.txt) 7 0 R] >>",
          ...attachment(7),
        ],
      }),
      ["attachments"],
    ],
    [
      "a file attachment annotation",
      onePage({
        page: "/Annots [6 0 R]",
        objects: [
          "<< /Type /Annot /Subtype /FileAttachment /Rect [10 10 30 30] /FS 7 0 R >>",
          ...attachment(7),
        ],
      }),
      ["annotations", "attachments"],
    ],
    [
      "an associated file",
      onePage({ catalog: "/AF [6 0 R]", objects: attachment(6) }),
      ["attachments"],
    ],
    [
      "a bookmark",
      onePage({
        catalog: "/Outlines 6 0 R",
        objects: [
          "<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>",
          "<< /Title (Chapter one) /Parent 6 0 R /Dest [3 0 R /Fit] >>",
        ],
      }),
      ["bookmarks"],
    ],
    [
      "a document level script",
      onePage({
        catalog: "/Names << /JavaScript << /Names [(init) 6 0 R] >> >>",
        objects: ["<< /S /JavaScript /JS (app.alert(1)) >>"],
      }),
      ["javascript"],
    ],
    [
      "a script run on open, outside any name tree",
      onePage({ catalog: "/OpenAction << /S /JavaScript /JS (app.alert(1)) >>" }),
      ["javascript"],
    ],
    [
      "a page thumbnail",
      onePage({
        page: "/Thumb 6 0 R",
        objects: [
          stream(
            "/Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8",
            "\x80",
          ),
        ],
      }),
      ["page-thumbnails"],
    ],
    [
      "a structure tree",
      onePage({
        catalog: "/StructTreeRoot 6 0 R",
        objects: ["<< /Type /StructTreeRoot >>"],
      }),
      ["accessibility-tags"],
    ],
    [
      "an earlier revision",
      appendRevision(onePage({}), {
        objects: new Map([
          [4, stream("", "BT /F1 12 Tf 20 100 Td (A revised page) Tj ET")],
        ]),
        trailer: "/Root 1 0 R",
      }),
      ["incremental-versions"],
    ],
  ])("names exactly what it carried: %s", async (_label, written, kinds) => {
    await expect(sanitizedFrom(written)).resolves.toEqual(kinds);
  });
});

describe("a document that carries nothing the table reports", () => {
  it.each([
    ["the plain page itself", onePage({})],
    [
      "document info with no entries",
      onePage({ trailer: "/Info 6 0 R", objects: ["<< >>"] }),
    ],
    ["a form with no fields", onePage({ catalog: "/AcroForm << /Fields [] >>" })],
    [
      "an attachment tree with no entries",
      onePage({ catalog: "/Names << /EmbeddedFiles << /Names [] >> >>" }),
    ],
    [
      "an outline with no entries",
      onePage({ catalog: "/Outlines << /Type /Outlines /Count 0 >>" }),
    ],
    /**
     * Stripped with everything else and never reported, because they would
     * only confuse a summary (spec 0004, below the inventory table).
     */
    [
      "only page labels, viewer preferences, private data, an action that is not a script and a file identifier",
      onePage({
        catalog:
          "/PageLabels << /Nums [0 << /S /r >>] >> " +
          "/ViewerPreferences << /HideToolbar true >> " +
          "/PieceInfo << /RedactNestTest << /Private (private data) >> >> " +
          "/OpenAction << /S /URI /URI (https://example.com/) >>",
        trailer:
          "/ID [<0123456789abcdef0123456789abcdef> <0123456789abcdef0123456789abcdef>]",
      }),
    ],
  ])("names nothing: %s", async (_label, written) => {
    await expect(sanitizedFrom(written)).resolves.toEqual([]);
  });
});
