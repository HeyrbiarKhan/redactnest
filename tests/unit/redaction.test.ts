import type { PDFDocument } from "mupdf";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  CARRIER_KEYS,
  CATALOG_KEYS,
  EngineFailure,
  openDocumentWith,
  PAGE_KEYS,
  PIPELINE,
  prepareDocument,
  redactDocumentWith,
  silenceEngineLog,
  type RedactionTarget,
} from "@/engine";
import { SANITIZED_KINDS } from "@/worker/protocol";

import { bytesOf, fixture, onePixelPng } from "../support/bytes";
import {
  decompressedBytes,
  documentText,
  everyKey,
  everyTypeName,
  inspect,
  keysOf,
  LIMITS,
  mupdf,
  numbers,
  pageText,
  rawBytes,
} from "../support/mupdf";

/**
 * The redaction engine, driven with the real MuPDF in Node. Spec 0004.
 *
 * The engine takes the loaded MuPDF module as a parameter (`openDocumentWith`,
 * `redactDocumentWith`), and this file hands it the one from `node_modules`.
 * Everything else is the real walled module, run over hand written fixtures
 * from `scripts/make-fixture.mjs`, and every output is read back with MuPDF
 * through helpers that share no code with the engine.
 */

beforeAll(() => {
  // What MuPDF says while it repairs a fixture is noise in a test run, exactly
  // as it would be a leak in a browser. `tests/unit/engine-log.test.ts` proves
  // this silence works; here it only keeps the output readable.
  silenceEngineLog(mupdf);
});

/** Run a redaction and fail the test, rather than the assertion, if it throws. */
function redact(
  name: string,
  targets: readonly RedactionTarget[] = [],
  hooks: Parameters<typeof redactDocumentWith>[3] = {},
) {
  return redactDocumentWith(mupdf, fixture(name), targets, hooks);
}

/** Everything AC-7 lists, as strings a reader could recover from the file. */
const METADATA_SECRETS = [
  // document info, in both revisions
  "Secret title",
  "Updated secret title",
  "Jane Secret",
  // XMP on the catalog, the page and the image
  "xmpmeta",
  "image xmp secret",
  "page xmp secret",
  // annotations
  "secret-link",
  "Private reviewer comment",
  "Reviewer Name",
  "Attached file",
  // the hidden annotation, which must never be painted in
  "Hidden annotation text",
  // the form field's name
  "account_name",
  // the attachment
  "attached secret contents",
  "secret.txt",
  // the bookmark
  "Chapter with a secret title",
  // JavaScript
  "document script",
  "open action",
  // private application data
  "catalog private data",
  "page private data",
  "RedactNestFixture",
  // the structure tree
  "Structure alt text",
  // the first revision's wording
  "Draft wording that was replaced",
];

/** Spec 0004, AC-1 and AC-2, with the real engine behind the door. */
describe("opening, with the engine", () => {
  it("opens a PDF whose marker starts at byte 1019", () => {
    const doc = openDocumentWith(mupdf, fixture("header-at-1019.pdf"), LIMITS);

    expect(doc.summary.pageCount).toBe(1);
    doc.close();
  });

  it.each([
    ["a marker starting at byte 1020", fixture("header-at-1020.pdf")],
    ["a PNG", onePixelPng()],
  ])("refuses %s as not-pdf even with the engine in hand", (_label, bytes) => {
    expect(() => openDocumentWith(mupdf, bytes, LIMITS)).toThrow(
      expect.objectContaining({ errorKind: "not-pdf" }),
    );
  });

  /**
   * AC-2. A PNG carrying `%PDF-` in a text chunk passes the door, and MuPDF
   * still opens it as an image, because it sniffs content. Redaction needs a PDF
   * document object, so this is `corrupt`.
   */
  it("refuses a file that passes the header check but opens as something else", () => {
    const disguised = onePixelPng("%PDF-1.7 in a PNG comment");

    expect(() => openDocumentWith(mupdf, disguised, LIMITS)).toThrow(
      expect.objectContaining({ errorKind: "corrupt" }),
    );
  });

  it("refuses a file with a PDF header and nothing MuPDF can read after it", () => {
    expect(() =>
      openDocumentWith(mupdf, bytesOf("%PDF-1.7\nnothing to see here\n"), LIMITS),
    ).toThrow(expect.objectContaining({ errorKind: "corrupt" }));
  });

  it("reports opening and inspecting, in that order", () => {
    const onPhase = vi.fn();

    openDocumentWith(mupdf, fixture("two-pages.pdf"), LIMITS, onPhase).close();

    expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual(["opening", "inspecting"]);
  });
});

/** Spec 0004, AC-3. Refused at open, before a review exists. */
describe("a document with layers", () => {
  it.each(["layers-all-on.pdf", "layers-one-off.pdf"])(
    "refuses %s as hidden-layers, whatever its layers' states",
    (name) => {
      const onPhase = vi.fn();

      expect(() => openDocumentWith(mupdf, fixture(name), LIMITS, onPhase)).toThrow(
        expect.objectContaining({ errorKind: "hidden-layers" }),
      );
      // Before anything is inspected, so no review of it can exist.
      expect(onPhase).not.toHaveBeenCalledWith("inspecting");
    },
  );
});

/**
 * Spec 0004, AC-22 and INV-9. The one prepare step, as both copies get it.
 *
 * Asserted on a document MuPDF opened directly, because the review copy's
 * handle deliberately hides its MuPDF document (the engine wall at the value
 * level). `openDocumentWith` and `redactDocumentWith` both call this function.
 */
describe("the shared prepare step", () => {
  function prepared(read: (doc: ReturnType<typeof openPdf>) => void): void {
    const doc = openPdf("metadata.pdf");
    try {
      prepareDocument(mupdf, doc);
      read(doc);
    } finally {
      doc.destroy();
    }
  }

  function openPdf(name: string): PDFDocument {
    const pdf = mupdf.Document.openDocument(fixture(name), "application/pdf").asPDF();
    if (!pdf) throw new Error("expected a PDF");
    return pdf;
  }

  it("never paints in an annotation a viewer does not show", () => {
    prepared((doc) => {
      expect(pageText(doc, 0)).not.toContain("Hidden annotation text");
    });
  });

  it("drops a Redact mark already in the source, so it removes nothing", () => {
    prepared((doc) => {
      const page = doc.loadPage(0);
      const types = page.getAnnotations().map((annotation) => annotation.getType());
      page.destroy();

      expect(types).not.toContain("Redact");
      expect(pageText(doc, 0)).toContain("Keep this sentence exactly as it is");
    });
  });

  it("turns a form value and a visible typed note into page text", () => {
    prepared((doc) => {
      const page = doc.loadPage(0);
      const widgets = page.getWidgets().length;
      page.destroy();

      expect(widgets).toBe(0);
      expect(pageText(doc, 0)).toContain("Form field value");
      expect(pageText(doc, 0)).toContain("Visible typed note");
    });
  });
});

/**
 * Spec 0004, AC-7, AC-8, AC-9, AC-12 and AC-15. A run with nothing ticked,
 * over the fixture that carries everything.
 */
describe("a cleaning run", () => {
  let output: ArrayBuffer;
  let result: Awaited<ReturnType<typeof redact>>;

  beforeAll(async () => {
    result = await redact("metadata.pdf");
    output = result.output;
  });

  describe("strips everything AC-7 lists", () => {
    it("leaves the catalog holding only its type, its pages and its language", () => {
      inspect(output, (doc) => {
        const catalog = doc.getTrailer().get("Root");

        expect(keysOf(catalog).sort()).toEqual([...CATALOG_KEYS].sort());
        expect(catalog.get("Lang").asString()).toBe("en-GB");
      });
    });

    it("leaves every page holding only allowlisted keys", () => {
      inspect(output, (doc) => {
        for (let index = 0; index < doc.countPages(); index += 1) {
          for (const key of keysOf(doc.findPage(index))) {
            expect(PAGE_KEYS).toContain(key);
          }
        }
      });
    });

    it("carries no document info, no encryption and not the source's identifier", () => {
      inspect(output, (doc) => {
        const trailer = keysOf(doc.getTrailer());

        expect(trailer).not.toContain("Info");
        expect(trailer).not.toContain("Encrypt");
      });
      // The source's /ID bytes, written as a hex string in the fixture.
      expect(rawBytes(output).toLowerCase()).not.toContain(
        "52656461637446697874757265494430",
      );
    });

    it("carries no carrier key, script, annotation, form, outline or structure anywhere", () => {
      inspect(output, (doc) => {
        const keys = everyKey(doc);

        for (const key of [
          ...CARRIER_KEYS,
          "JS",
          "OpenAction",
          "Annots",
          "AcroForm",
          "Outlines",
          "Names",
          "EmbeddedFiles",
          "OCProperties",
          "OC",
          "StructTreeRoot",
          "StructParents",
          "PageLabels",
          "ViewerPreferences",
          "MarkInfo",
          "Info",
        ]) {
          expect(keys, `/${key} survived`).not.toContain(key);
        }
      });
    });

    it("carries no annotation, attachment, metadata stream or structure element object", () => {
      inspect(output, (doc) => {
        const types = everyTypeName(doc);

        for (const type of [
          "Annot",
          "Link",
          "Widget",
          "Popup",
          "FileAttachment",
          "Filespec",
          "EmbeddedFile",
          "Metadata",
          "XML",
          "Outlines",
          "StructTreeRoot",
          "StructElem",
          "OCG",
        ]) {
          expect(types, `a /${type} object survived`).not.toContain(type);
        }
      });
    });

    it("leaves no trace of any of it in the bytes, earlier revision included", () => {
      const bytes = decompressedBytes(output);

      for (const secret of METADATA_SECRETS) {
        expect(bytes, `"${secret}" survived`).not.toContain(secret);
      }
    });

    it("is a single revision", () => {
      inspect(output, (doc) => {
        expect(doc.countVersions()).toBe(1);
      });
    });
  });

  /** AC-8. What was visible stays visible, as ordinary page text. */
  it("keeps an unticked form value and an unticked typed note as page text", () => {
    const text = documentText(output);

    expect(text).toContain("Form field value");
    expect(text).toContain("Visible typed note");
    expect(text).toContain("Quarterly report");
    expect(text).toContain("Final wording");
  });

  /** AC-22. The Redact mark the source carried removed nothing. */
  it("keeps the sentence under the source's own Redact mark", () => {
    expect(documentText(output)).toContain("Keep this sentence exactly as it is");
  });

  /** AC-9. Same pages, same boxes, same rotation, same transparency group. */
  it("keeps the source's page count, boxes, rotation and transparency group", () => {
    const source = inspect(fixture("metadata.pdf"), (doc) => describePages(doc));
    const cleaned = inspect(output, (doc) => describePages(doc));

    expect(cleaned).toEqual(source);
    expect(cleaned).toHaveLength(2);
    expect(cleaned[1].Rotate).toEqual([90]);
    expect(cleaned[0].Group).toEqual({ S: "Transparency", CS: "DeviceRGB", I: true });
  });

  /** AC-12 and AC-15. Nothing ticked still cleans, and says what it stripped. */
  it("reports nothing removed and exactly the kinds the source carried", () => {
    expect(result.removedByType).toEqual({});
    expect(result.sanitized).toEqual([
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
    ]);
  });

  it("lists the stripped kinds in the protocol's order", () => {
    const order = result.sanitized.map((kind) => SANITIZED_KINDS.indexOf(kind));

    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  /** AC-15. A plain file had nothing to strip, and `sanitized` says so. */
  it("reports nothing stripped from a file that carried nothing", async () => {
    const plain = await redact("two-pages.pdf");

    expect(plain.sanitized).toEqual([]);
    expect(documentText(plain.output)).toContain("RedactNest fixture page one");
  });
});

/** Everything AC-9 compares between a source page and its output page. */
function describePages(doc: PDFDocument): Record<string, unknown>[] {
  return Array.from({ length: doc.countPages() }, (_, index) => {
    const page = doc.findPage(index);
    const boxes = Object.fromEntries(
      ["MediaBox", "CropBox", "BleedBox", "TrimBox", "ArtBox", "Rotate"].map((key) => {
        const value = page.getInheritable(key);
        return [
          key,
          value.isNull() ? null : value.isArray() ? numbers(value) : [value.asNumber()],
        ];
      }),
    );
    const group = page.get("Group");
    return {
      ...boxes,
      Group: group.isNull()
        ? null
        : Object.fromEntries(
            keysOf(group).map((key) => {
              const value = group.get(key);
              return [key, value.isName() ? value.asName() : value.asJS()];
            }),
          ),
    };
  });
}

/** AC-16. What a run reports as it goes. */
describe("the phases of a run", () => {
  it("reports redacting, then writing, then verifying", async () => {
    const onPhase = vi.fn();

    await redact("two-pages.pdf", [], { onPhase });

    expect(onPhase.mock.calls.map(([phase]) => phase)).toEqual([
      "redacting",
      "writing",
      "verifying",
    ]);
  });
});

/** AC-11 and INV-1. A run reads the original and never changes it. */
describe("the original a run starts from", () => {
  it("is byte for byte the same after a run", async () => {
    const bytes = fixture("metadata.pdf");
    const before = new Uint8Array(bytes).slice();

    await redactDocumentWith(mupdf, bytes, []);

    expect(new Uint8Array(bytes)).toEqual(before);
  });

  it("gets back an output that is a separate buffer", async () => {
    const bytes = fixture("two-pages.pdf");

    const { output } = await redactDocumentWith(mupdf, bytes, []);

    expect(output).not.toBe(bytes);
    expect(output.byteLength).toBeGreaterThan(0);
  });
});

/**
 * Spec 0004, AC-13 and AC-14. The structural half of the self check, proved to
 * fire: with the carrier sweep skipped, the image's XMP packet survives the
 * rebuild, and the run must refuse to hand anything back.
 */
describe("the structural self check", () => {
  it("fails the run with redaction-incomplete when a carrier survives", async () => {
    const run = redactDocumentWith(
      mupdf,
      fixture("metadata.pdf"),
      [],
      {},
      {
        ...PIPELINE,
        sweepCarriers: () => {},
      },
    );

    await expect(run).rejects.toBeInstanceOf(EngineFailure);
    await expect(run).rejects.toMatchObject({ errorKind: "redaction-incomplete" });
  });

  it("passes the same file when the sweep runs", async () => {
    await expect(redact("metadata.pdf")).resolves.toMatchObject({
      removedByType: {},
    });
  });
});

/**
 * Slice 1 of spec 0004 cleans but removes nothing, so a run asked to remove
 * something refuses rather than hand back a file that still holds it.
 */
describe("a run asked to remove something, before removal exists", () => {
  it("refuses with unsupported", async () => {
    const target: RedactionTarget = {
      page: 0,
      quads: [[72, 80, 200, 80, 72, 95, 200, 95]],
      start: 0,
      end: 5,
      kind: "email",
    };

    await expect(redact("two-pages.pdf", [target])).rejects.toMatchObject({
      errorKind: "unsupported",
    });
  });
});
