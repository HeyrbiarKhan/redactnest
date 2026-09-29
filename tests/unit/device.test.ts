import type { PDFPage } from "mupdf";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import {
  inspectPages,
  prepareDocument,
  silenceEngineLog,
  walkDrawing,
  type MuPdf,
} from "@/engine";

import { fixture } from "../support/bytes";

/**
 * The drawing reader's hold on MuPDF's memory. Spec 0006, AC-9 and INV-10.
 *
 * Garbage collection never reclaims MuPDF's native memory in time (spec
 * 0004), so every object a device callback receives with a reference it owns
 * must be let go before the callback returns, and nothing a callback receives
 * may be held past it. Two things are measured, both exactly:
 *
 *  - Which wrappers MuPDF.js registers for collection during a walk, and
 *    which of those are released. Every wrapper MuPDF.js makes registers
 *    itself, and `destroy()` unregisters it, so a wrapper still registered
 *    once the walk is over is one the reader held on to.
 *  - The reference counts MuPDF keeps on the images and shadings it caches,
 *    read straight from its heap. A count that grows walk after walk is a
 *    reference taken and never given back; one that falls frees what MuPDF
 *    still uses.
 *
 * This file loads a MuPDF of its own, with its heap exposed, rather than the
 * shared one in `tests/support/mupdf.ts`: the module object MuPDF.js is
 * created from has to be in place before it loads.
 */

const heap = {} as { HEAP32?: Int32Array; HEAPU8?: Uint8Array };
(globalThis as { $libmupdf_wasm_Module?: unknown }).$libmupdf_wasm_Module = heap;
const mupdf: MuPdf = await import("mupdf");

/**
 * The reference count MuPDF keeps on a stored object. Images and shadings are
 * `fz_storable`, and a font is an `fz_font`: each starts with its `int refs`.
 */
function refs(pointer: number): number {
  if (!heap.HEAP32) throw new Error("MuPDF's heap is not exposed");
  return heap.HEAP32[pointer >> 2];
}

beforeAll(() => {
  silenceEngineLog(mupdf);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A fixture page with an image, a shading, a filled path, text and a clip. */
function shadedPage(): Uint8Array {
  const pdf = new mupdf.PDFDocument();
  try {
    const shading = pdf.addObject(pdf.newDictionary());
    shading.put("ShadingType", 2);
    shading.put("ColorSpace", pdf.newName("DeviceRGB"));
    const coords = pdf.newArray();
    for (const value of [0, 0, 200, 0]) coords.push(value);
    shading.put("Coords", coords);
    const fn = pdf.newDictionary();
    fn.put("FunctionType", 2);
    const domain = pdf.newArray();
    domain.push(0);
    domain.push(1);
    fn.put("Domain", domain);
    const c0 = pdf.newArray();
    for (const value of [1, 0, 0]) c0.push(value);
    const c1 = pdf.newArray();
    for (const value of [0, 0, 1]) c1.push(value);
    fn.put("C0", c0);
    fn.put("C1", c1);
    fn.put("N", 1);
    shading.put("Function", fn);

    const image = pdf.addImage(
      new mupdf.Image(new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, 4, 4], false)),
    );
    const font = pdf.addSimpleFont(new mupdf.Font("Helvetica"));

    const resources = pdf.newDictionary();
    const shadings = pdf.newDictionary();
    shadings.put("Sh0", shading);
    resources.put("Shading", shadings);
    const images = pdf.newDictionary();
    images.put("Im0", image);
    resources.put("XObject", images);
    const fonts = pdf.newDictionary();
    fonts.put("F1", font);
    resources.put("Font", fonts);

    const page = pdf.addPage(
      [0, 0, 612, 792],
      0,
      resources,
      "q 0 0 100 100 re W n /Sh0 sh Q\n" +
        "q 50 0 0 50 300 300 cm /Im0 Do Q\n" +
        "0 0 1 rg 400 400 100 50 re f\n" +
        "BT /F1 12 Tf 72 700 Td (Words) Tj ET\n",
    );
    pdf.insertPage(-1, page);
    const buffer = pdf.saveToBuffer("");
    try {
      return buffer.asUint8Array().slice();
    } finally {
      buffer.destroy();
    }
  } finally {
    pdf.destroy();
  }
}

/** Every wrapper registered for collection while `work` runs, and every release. */
function watchWrappers(work: () => void): { held: readonly string[] } {
  const watch = startWatching();
  try {
    work();
  } finally {
    vi.restoreAllMocks();
  }
  return watch.result();
}

/** The same, for work that yields, as an inspection does after every page. */
async function watchWrappersWhile(
  work: () => Promise<unknown>,
): Promise<readonly string[]> {
  const watch = startWatching();
  try {
    await work();
  } finally {
    vi.restoreAllMocks();
  }
  return watch.result().held;
}

function startWatching(): { result(): { held: readonly string[] } } {
  const registered = new Set<object>();
  const register = FinalizationRegistry.prototype.register;
  const unregister = FinalizationRegistry.prototype.unregister;
  vi.spyOn(FinalizationRegistry.prototype, "register").mockImplementation(function (
    this: FinalizationRegistry<unknown>,
    target: WeakKey,
    held: unknown,
    token?: WeakKey,
  ) {
    // Only MuPDF.js's wrappers, which all carry a `pointer`. Vitest registers
    // its own spies too.
    if (typeof target === "object" && "pointer" in target) registered.add(target);
    return register.call(this, target, held, token);
  });
  vi.spyOn(FinalizationRegistry.prototype, "unregister").mockImplementation(function (
    this: FinalizationRegistry<unknown>,
    token: WeakKey,
  ) {
    registered.delete(token as object);
    return unregister.call(this, token);
  });

  return {
    result: () => ({
      held: [...registered].map(
        (object) => (object.constructor as { name: string }).name,
      ),
    }),
  };
}

function withPage<T>(
  bytes: Uint8Array,
  read: (page: ReturnType<typeof loadFirst>) => T,
): T {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const page = loadFirst(doc);
    try {
      return read(page);
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

function loadFirst(doc: ReturnType<typeof mupdf.Document.openDocument>): PDFPage {
  const pdf = doc.asPDF();
  if (!pdf) throw new Error("expected a PDF document");
  return pdf.loadPage(0) as PDFPage;
}

/**
 * Pins on MuPDF.js 1.28.1, so an upgrade that changes how a callback's
 * objects arrive fails here, and `device.ts` is changed on purpose rather than
 * left freeing what it does not own, or keeping what it does.
 */
describe("how MuPDF.js hands a device callback its objects (pins)", () => {
  it("wraps a shading with no reference of its own, yet registers it for collection", () => {
    const counts: number[] = [];
    const kept: object[] = [];
    withPage(shadedPage(), (page) => {
      for (let run = 0; run < 3; run += 1) {
        const device = new mupdf.Device({
          fillShade(shade) {
            counts.push(refs(shade.pointer));
            kept.push(shade);
          },
        });
        page.run(device, mupdf.Matrix.identity);
        device.close();
        device.destroy();
      }
    });

    // Three wrappers alive and none released, and the count never moved: the
    // wrapper took no reference.
    expect(counts).toHaveLength(3);
    expect(new Set(counts).size).toBe(1);
    // Yet each is registered, so collecting it would drop a reference it
    // never took. Taking them out here keeps this test from doing exactly that.
    const registry = (
      mupdf.Shade as unknown as { _finalizer: FinalizationRegistry<unknown> }
    )._finalizer;
    expect(kept.map((shade) => registry.unregister(shade))).toEqual([true, true, true]);
  });

  it("wraps an image with a reference of its own", () => {
    const counts: number[] = [];
    const kept: { destroy(): void; pointer: number }[] = [];
    withPage(shadedPage(), (page) => {
      for (let run = 0; run < 3; run += 1) {
        const device = new mupdf.Device({
          fillImage(image) {
            counts.push(refs(image.pointer));
            kept.push(image);
          },
        });
        page.run(device, mupdf.Matrix.identity);
        device.close();
        device.destroy();
      }
      // Each wrapper still held adds one: it took a reference.
      expect(counts[1] - counts[0]).toBe(1);
      expect(counts[2] - counts[1]).toBe(1);
      for (const image of kept) image.destroy();
    });
  });
});

/** INV-10: nothing the reader receives outlives its callback. */
describe("the drawing reader", () => {
  it("releases every wrapper a callback receives, text walker fonts aside", () => {
    const { held } = withPage(shadedPage(), (page) =>
      watchWrappers(() => walkDrawing(mupdf, page, () => {})),
    );

    // `Font` wrappers belong to MuPDF.js's text walker, which keeps and reuses
    // the last one itself; everything else is released before it returns.
    expect(held.filter((name) => name !== "Font")).toEqual([]);
  });

  it("leaves the image and the shading it met exactly as referenced as it found them", () => {
    withPage(shadedPage(), (page) => {
      const seen: { image: number[]; shade: number[] } = { image: [], shade: [] };
      const probe = new mupdf.Device({
        fillImage(image) {
          seen.image.push(image.pointer);
          image.destroy();
        },
        fillShade(shade) {
          seen.shade.push(shade.pointer);
          (
            mupdf.Shade as unknown as { _finalizer: FinalizationRegistry<unknown> }
          )._finalizer.unregister(shade);
        },
      });
      page.run(probe, mupdf.Matrix.identity);
      probe.close();
      probe.destroy();

      const before = [refs(seen.image[0]), refs(seen.shade[0])];
      for (let run = 0; run < 10; run += 1) walkDrawing(mupdf, page, () => {});
      expect([refs(seen.image[0]), refs(seen.shade[0])]).toEqual(before);
    });
  });

  it("releases what it holds even when a visitor throws, and throws once the page is drawn", () => {
    const { held } = withPage(shadedPage(), (page) =>
      watchWrappers(() => {
        expect(() =>
          walkDrawing(mupdf, page, () => {
            throw new Error("visitor failed");
          }),
        ).toThrow("visitor failed");
      }),
    );
    expect(held.filter((name) => name !== "Font")).toEqual([]);
  });

  /**
   * AC-9's heap rule, over a whole inspection: ten inspections of one document
   * leave every cached image's count where the first left it, release every
   * wrapper, and grow MuPDF's heap no further.
   */
  it("leaves the heap flat over ten inspections of one document", async () => {
    const doc = mupdf.Document.openDocument(fixture("read-pages.pdf"), "application/pdf");
    try {
      const pdf = doc.asPDF();
      if (!pdf) throw new Error("expected a PDF document");
      prepareDocument(mupdf, pdf);
      await inspectPages(mupdf, pdf);

      const size = heap.HEAPU8?.length;
      const held: string[] = [];
      for (let run = 0; run < 10; run += 1) {
        held.push(...(await watchWrappersWhile(() => inspectPages(mupdf, pdf))));
      }
      expect(heap.HEAPU8?.length).toBe(size);
      expect(held.filter((name) => name !== "Font")).toEqual([]);
    } finally {
      doc.destroy();
    }
  });
});
