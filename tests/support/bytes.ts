import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

/**
 * Bytes for the engine tests, with no engine involved.
 *
 * Kept apart from `tests/support/mupdf.ts` on purpose: a test of what happens
 * before the engine loads must not load it by importing a helper.
 */

/** A committed fixture from `tests/fixtures`, as the worker would receive it. */
export function fixture(name: string): ArrayBuffer {
  const file = readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
}

export function bytesOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

/** `%PDF-` at `offset`, spaces everywhere else. */
export function markerAt(offset: number, length = offset + 64): ArrayBuffer {
  const bytes = new Uint8Array(length).fill(0x20);
  bytes.set(new TextEncoder().encode("%PDF-"), offset);
  return bytes.buffer;
}

/**
 * A real one pixel PNG. MuPDF opens this as a one page image document even when
 * told it is a PDF, which is exactly why the door reads bytes.
 *
 * `comment` goes into a text chunk right after the header, so a PNG can be made
 * to carry `%PDF-` inside its first 1024 bytes and still be a PNG.
 */
export function onePixelPng(comment?: string): ArrayBuffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // RGB

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    ...(comment === undefined
      ? []
      : [pngChunk("tEXt", Buffer.from(`Comment\u0000${comment}`, "latin1"))]),
    pngChunk("IDAT", deflateSync(Buffer.from([0, 255, 0, 0]))),
    pngChunk("IEND", new Uint8Array(0)),
  ]);
  return png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
}

function pngChunk(type: string, data: Uint8Array): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
