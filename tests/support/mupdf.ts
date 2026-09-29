import { createHash } from "node:crypto";

import * as mupdf from "mupdf";
import type { PDFDocument, PDFObject } from "mupdf";

/**
 * The real MuPDF, in Node, for looking at what the engine produced.
 *
 * Everything here is written independently of `src/engine` on purpose. An
 * output checked with the engine's own walker would only prove the engine
 * agrees with itself.
 */

export { mupdf };

export const LIMITS = Object.freeze({ maxBytes: 26_214_400, maxPages: 50 });

/** Open `bytes` for a look, and destroy the document after, whatever happens. */
export function inspect<T>(bytes: ArrayBuffer, read: (doc: PDFDocument) => T): T {
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pdf = doc.asPDF();
    if (!pdf) throw new Error("expected a PDF document");
    return read(pdf);
  } finally {
    doc.destroy();
  }
}

/** The page's extracted text. */
export function pageText(doc: PDFDocument, index: number, options = ""): string {
  const page = doc.loadPage(index);
  try {
    const stext = page.toStructuredText(options);
    try {
      return stext.asText();
    } finally {
      stext.destroy();
    }
  } finally {
    page.destroy();
  }
}

/** Every page's text, joined. */
export function documentText(bytes: ArrayBuffer): string {
  return inspect(bytes, (doc) =>
    Array.from({ length: doc.countPages() }, (_, index) => pageText(doc, index)).join(
      "\n",
    ),
  );
}

/**
 * The whole file with every stream decompressed, read one byte per character,
 * so a string can be searched for anywhere in it: in a content stream, in an
 * object, in an earlier revision.
 */
export function decompressedBytes(bytes: ArrayBuffer): string {
  return inspect(bytes, (doc) => {
    const buffer = doc.saveToBuffer("decompress");
    try {
      return Buffer.from(buffer.asUint8Array()).toString("latin1");
    } finally {
      buffer.destroy();
    }
  });
}

/**
 * One page's drawing instructions, decompressed, one byte per character: every
 * content stream the page lists, joined. For a byte search that must not see
 * what other pages still say.
 */
export function pageContent(bytes: ArrayBuffer, index: number): string {
  return inspect(bytes, (doc) => {
    const contents = doc.findPage(index).get("Contents");
    const streams: PDFObject[] = [];
    if (contents.isArray()) contents.forEach((part) => streams.push(part));
    else streams.push(contents);

    return streams
      .map((part) => {
        const buffer = part.readStream();
        try {
          return Buffer.from(buffer.asUint8Array()).toString("latin1");
        } finally {
          buffer.destroy();
        }
      })
      .join("\n");
  });
}

/** The raw file, one byte per character, without MuPDF touching it. */
export function rawBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("latin1");
}

/**
 * Does `needle` appear in `haystack` in either PDF string encoding (spec 0004,
 * AC-4)? PDFDocEncoding and UTF-16BE, each as raw bytes or as a hex string, in
 * either case.
 */
export function containsInAnyEncoding(haystack: string, needle: string): boolean {
  const single = Buffer.from(needle, "latin1");
  const utf16 = Buffer.from(needle, "utf16le").swap16();
  const lower = haystack.toLowerCase();

  return (
    haystack.includes(single.toString("latin1")) ||
    haystack.includes(utf16.toString("latin1")) ||
    lower.includes(single.toString("hex")) ||
    lower.includes(utf16.toString("hex"))
  );
}

/** A dictionary's keys. */
export function keysOf(dict: PDFObject): string[] {
  const keys: string[] = [];
  dict.forEach((_value, key) => {
    if (typeof key === "string") keys.push(key);
  });
  return keys;
}

/**
 * Every dictionary in the file: each numbered object, and every dictionary
 * written directly inside one.
 */
export function everyDictionary(doc: PDFDocument): PDFObject[] {
  const found: PDFObject[] = [];
  const walk = (obj: PDFObject): void => {
    if (obj.isIndirect()) return;
    if (obj.isDictionary()) {
      found.push(obj);
      obj.forEach(walk);
    } else if (obj.isArray()) {
      obj.forEach(walk);
    }
  };

  for (let num = 1; num < doc.countObjects(); num += 1) {
    walk(doc.newIndirect(num).resolve());
  }
  return found;
}

/** Every key used anywhere in the file. */
export function everyKey(doc: PDFDocument): Set<string> {
  return new Set(everyDictionary(doc).flatMap(keysOf));
}

/** Every `/Type` and `/Subtype` name used anywhere in the file. */
export function everyTypeName(doc: PDFDocument): Set<string> {
  const names = new Set<string>();
  for (const dict of everyDictionary(doc)) {
    for (const key of ["Type", "Subtype"]) {
      const value = dict.get(key);
      if (value.isName()) names.add(value.asName());
    }
  }
  return names;
}

/** A page box or other number array, as plain numbers. */
export function numbers(obj: PDFObject): number[] {
  const values: number[] = [];
  obj.forEach((value) => values.push(value.asNumber()));
  return values;
}

/** Eight numbers, upper left, upper right, lower left, lower right. */
export type Corners = readonly number[];

/**
 * Is `(x, y)` inside a convex quad, edges included? Written here rather than
 * borrowed from the engine, for the reason at the top of this file.
 */
export function inside(quad: Corners, x: number, y: number): boolean {
  const ring = [0, 2, 6, 4].map((at) => [quad[at], quad[at + 1]]);
  let sign = 0;
  for (let index = 0; index < 4; index += 1) {
    const [ax, ay] = ring[index];
    const [bx, by] = ring[(index + 1) % 4];
    const side = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (side === 0) continue;
    if (sign === 0) sign = Math.sign(side);
    else if (Math.sign(side) !== sign) return false;
  }
  return true;
}

/** A page rendered in RGB, and where each pixel's centre sits on the page. */
export interface Render {
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** Pixel centres as page points, in the same space `page.search()` uses. */
  point(column: number, row: number): readonly [number, number];
  /** The column and row whose pixel holds a page point, unclamped. */
  pixelAt(x: number, y: number): readonly [number, number];
  /** Is this pixel ink: any channel below 128 (spec 0004, *How the pixel and ink tests measure*)? */
  isInk(column: number, row: number): boolean;
  /** Is this pixel black: every channel below 64? */
  isBlack(column: number, row: number): boolean;
}

/** Render a page at `scale` times its size, 4 by default, as the spec measures. */
export function render(bytes: ArrayBuffer, index: number, scale = 4): Render {
  return inspect(bytes, (doc) => {
    const page = doc.loadPage(index);
    try {
      const pixmap = page.toPixmap(
        [scale, 0, 0, scale, 0, 0],
        mupdf.ColorSpace.DeviceRGB,
        false,
        true,
      );
      try {
        const pixels = pixmap.getPixels().slice();
        const [x, y, stride, n] = [
          pixmap.getX(),
          pixmap.getY(),
          pixmap.getStride(),
          pixmap.getNumberOfComponents(),
        ];
        const channel = (column: number, row: number, c: number) =>
          pixels[row * stride + column * n + c];
        const anyChannel = (
          column: number,
          row: number,
          test: (value: number) => boolean,
        ) => [0, 1, 2].some((c) => test(channel(column, row, c)));
        return {
          pixels,
          width: pixmap.getWidth(),
          height: pixmap.getHeight(),
          point: (column, row) => [(x + column + 0.5) / scale, (y + row + 0.5) / scale],
          pixelAt: (px, py) => [Math.floor(px * scale - x), Math.floor(py * scale - y)],
          isInk: (column, row) => anyChannel(column, row, (value) => value < 128),
          isBlack: (column, row) => !anyChannel(column, row, (value) => value >= 64),
        };
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  });
}

/**
 * Every pixel of a render whose centre lies inside `quad`. Only the pixels
 * under the quad's bounds are tested, so a 4 times page stays quick.
 */
export function pixelsInside(
  image: Render,
  quad: Corners,
): { column: number; row: number }[] {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  const [fromColumn, fromRow] = image.pixelAt(Math.min(...xs), Math.min(...ys));
  const [toColumn, toRow] = image.pixelAt(Math.max(...xs), Math.max(...ys));

  const found: { column: number; row: number }[] = [];
  for (
    let row = Math.max(0, fromRow);
    row <= Math.min(image.height - 1, toRow);
    row += 1
  ) {
    for (
      let column = Math.max(0, fromColumn);
      column <= Math.min(image.width - 1, toColumn);
      column += 1
    ) {
      const [x, y] = image.point(column, row);
      if (inside(quad, x, y)) found.push({ column, row });
    }
  }
  return found;
}

/**
 * Visit every pixel of every image drawn on a page, with its centre on the page
 * and its colour in RGB (an image mask reports black where it paints and white
 * where it does not). Decoded straight from the images, not rendered, so a box
 * drawn over an image cannot hide what the image itself still holds.
 */
export function forEachImagePixel(
  bytes: ArrayBuffer,
  index: number,
  visit: (x: number, y: number, rgb: readonly [number, number, number]) => void,
): void {
  inspect(bytes, (doc) => {
    const page = doc.loadPage(index);
    const stext = page.toStructuredText("preserve-images");
    try {
      stext.walk({
        onImageBlock(_bbox, [a, b, c, d, e, f], image) {
          const decoded = image.toPixmap();
          const mask = image.getImageMask();
          const pixmap = mask
            ? decoded
            : decoded.convertToColorSpace(mupdf.ColorSpace.DeviceRGB, false);
          const [width, height, stride, n] = [
            pixmap.getWidth(),
            pixmap.getHeight(),
            pixmap.getStride(),
            pixmap.getNumberOfComponents(),
          ];
          const pixels = pixmap.getPixels();
          for (let row = 0; row < height; row += 1) {
            for (let column = 0; column < width; column += 1) {
              const u = (column + 0.5) / width;
              const v = (row + 0.5) / height;
              const at = row * stride + column * n;
              const rgb: [number, number, number] = mask
                ? pixels[at] === 0
                  ? [255, 255, 255]
                  : [0, 0, 0]
                : [pixels[at], pixels[at + 1], pixels[at + 2]];
              visit(a * u + c * v + e, b * u + d * v + f, rgb);
            }
          }
          if (pixmap !== decoded) pixmap.destroy();
          decoded.destroy();
          image.destroy();
        },
      });
    } finally {
      stext.destroy();
      page.destroy();
    }
  });
}

/** A filled vector path: its colour and its bounds on the page. */
export interface FilledPath {
  readonly color: readonly number[];
  readonly bounds: readonly [number, number, number, number];
}

/** Every filled vector path a page draws, found by running it through a device. */
export function filledPaths(bytes: ArrayBuffer, index: number): FilledPath[] {
  const found: FilledPath[] = [];
  inspect(bytes, (doc) => {
    const page = doc.loadPage(index);
    const device = new mupdf.Device({
      fillPath(path, _evenOdd, [a, b, c, d, e, f], _colorspace, color) {
        const xs: number[] = [];
        const ys: number[] = [];
        const add = (x: number, y: number) => {
          xs.push(a * x + c * y + e);
          ys.push(b * x + d * y + f);
        };
        path.walk({
          moveTo: add,
          lineTo: add,
          curveTo: (_1, _2, _3, _4, x, y) => add(x, y),
        });
        found.push({
          color: [...color],
          bounds: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        });
      },
    });
    try {
      page.run(device, [1, 0, 0, 1, 0, 0]);
    } finally {
      device.close();
      device.destroy();
      page.destroy();
    }
  });
  return found;
}

/** An image stream as the file stores it: its filters, and a digest of its raw bytes. */
export interface StoredImage {
  readonly filter: string;
  readonly digest: string;
}

/**
 * Every image XObject a page's resources name, read raw with
 * `readRawStream()`, never decoded, in digest order. Two files whose pages
 * give equal lists hold the same images byte for byte (spec 0006, AC-15 and
 * AC-29). Names are left out: MuPDF's content filter renames the resources of
 * a page it rewrites (`/Photo` becomes `/Im1`) and keeps the stream as it was.
 */
export function pageImages(bytes: ArrayBuffer, index: number): readonly StoredImage[] {
  return inspect(bytes, (doc) => imagesOn(doc, index));
}

/** `pageImages` for every page of a file, opened once. */
export function documentImages(bytes: ArrayBuffer): readonly (readonly StoredImage[])[] {
  return inspect(bytes, (doc) =>
    Array.from({ length: doc.countPages() }, (_, index) => imagesOn(doc, index)),
  );
}

function imagesOn(doc: PDFDocument, index: number): readonly StoredImage[] {
  const found: StoredImage[] = [];
  const xobjects = doc.findPage(index).get("Resources").get("XObject");
  if (!xobjects.isDictionary()) return found;
  // Through the reference itself: MuPDF knows a stream only by its
  // indirect reference, so a resolved one reads as a plain dictionary.
  xobjects.forEach((image) => {
    if (!image.isStream()) return;
    const subtype = image.get("Subtype");
    if (!subtype.isName() || subtype.asName() !== "Image") return;

    const filter = image.get("Filter");
    const filters: string[] = [];
    if (filter.isName()) filters.push(filter.asName());
    else if (filter.isArray()) filter.forEach((part) => filters.push(part.asName()));

    const raw = image.readRawStream();
    try {
      found.push({
        filter: filters.join(" "),
        digest: createHash("sha256").update(raw.asUint8Array()).digest("hex"),
      });
    } finally {
      raw.destroy();
    }
  });
  return found.sort((a, b) => a.digest.localeCompare(b.digest));
}

/**
 * Every character of a page that is not whitespace, with its origin, in the
 * given extraction mode.
 */
export function pageCharacters(
  bytes: ArrayBuffer,
  index: number,
  options = "",
): { char: string; x: number; y: number }[] {
  return inspect(bytes, (doc) => {
    const page = doc.loadPage(index);
    const stext = page.toStructuredText(options);
    const found: { char: string; x: number; y: number }[] = [];
    try {
      stext.walk({
        onChar(char, [x, y]) {
          if (!/\s/u.test(char)) found.push({ char, x, y });
        },
      });
    } finally {
      stext.destroy();
      page.destroy();
    }
    return found;
  });
}
