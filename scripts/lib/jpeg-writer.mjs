/**
 * A baseline JPEG encoder for the fixture script. Spec 0025, AC-13.
 *
 * No fixture may hold a real photo, and none may be made by MuPDF (INV-8), so
 * every JPEG a fixture carries is written here, from code: colour conversion,
 * a forward DCT, quantisation and the standard Huffman tables of the JPEG
 * standard's Annex K. It writes a small patterned picture in grey or in
 * colour, colour as one interleaved scan or as three scans of one component
 * each, and hands back its segments apart, so a fixture can place a detail
 * segment anywhere, between scans included.
 *
 * Every step is integer arithmetic or a rounding of an exact ratio, so the
 * script writes the same bytes on every run and every machine (the fixture
 * test compares them byte for byte). The cosine table is rounded once to
 * integers, far from any half way point.
 */

/** Bytes joined in order, a string written one byte per character. */
export function bytes(...parts) {
  const list = parts.map((part) =>
    typeof part === "string"
      ? Uint8Array.from(part, (c) => c.charCodeAt(0) & 0xff)
      : part,
  );
  const out = new Uint8Array(list.reduce((total, part) => total + part.length, 0));
  let at = 0;
  for (const part of list) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

/** A marker with no length: `FF code`. */
export function marker(code) {
  return Uint8Array.of(0xff, code);
}

/** A marker segment: `FF code`, a two byte length counting itself, then `payload`. */
export function segment(code, payload) {
  const body = bytes(payload);
  const length = body.length + 2;
  if (length > 0xffff) throw new Error("a JPEG segment holds at most 65,533 bytes");
  return bytes(Uint8Array.of(0xff, code, length >> 8, length & 0xff), body);
}

export const SOI = marker(0xd8);
export const EOI = marker(0xd9);

/**
 * A JFIF `APP0`: version 1.02, no units, a pixel density of 1 by 1. With a
 * `thumbnail` (`{ width, height, pixels }`, three bytes a pixel), the header
 * carries it after its 14 bytes; `extra` is written after that, as a producer
 * that pads the segment does.
 *
 * @param {{ thumbnail?: { width: number, height: number, pixels: Uint8Array } | null,
 *   extra?: string }} [options]
 */
export function jfif({ thumbnail = null, extra = "" } = {}) {
  const width = thumbnail?.width ?? 0;
  const height = thumbnail?.height ?? 0;
  return segment(
    0xe0,
    bytes(
      "JFIF\0",
      Uint8Array.of(1, 2, 0, 0, 1, 0, 1, width, height),
      thumbnail?.pixels ?? new Uint8Array(0),
      extra,
    ),
  );
}

/**
 * An Adobe `APP14`: version 100, no flags, and the colour transform (1 says
 * the three components are YCbCr). Twelve payload bytes, as libjpeg reads.
 */
export function adobe(transform = 1) {
  return segment(0xee, bytes("Adobe", Uint8Array.of(0, 100, 0, 0, 0, 0, transform)));
}

/** A comment segment (`FE`). */
export function comment(text) {
  return segment(0xfe, text);
}

/** The order the 64 coefficients are sent in: diagonal by diagonal, from the top left. */
const ZIGZAG = (() => {
  const order = [];
  for (let sum = 0; sum < 15; sum += 1) {
    const rows = [];
    for (let row = Math.max(0, sum - 7); row <= Math.min(sum, 7); row += 1)
      rows.push(row);
    // An even diagonal runs up (row falling), an odd one down.
    if (sum % 2 === 0) rows.reverse();
    for (const row of rows) order.push(row * 8 + (sum - row));
  }
  return Object.freeze(order);
})();

/** Annex K.1's luminance quantisation table, in row order. Used for every component. */
const QUANT = Object.freeze([
  16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57,
  69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55,
  64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103,
  99,
]);

/** Annex K.3's luminance DC table: how many codes of each length, then the symbols. */
const DC_BITS = Object.freeze([0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0]);
const DC_VALUES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

/** Annex K.3's luminance AC table. Used for every component. */
const AC_BITS = Object.freeze([0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d]);
const AC_VALUES = Object.freeze([
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51,
  0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1,
  0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18,
  0x19, 0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57,
  0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75,
  0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92,
  0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8,
  0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2,
  0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa,
]);

/**
 * Each symbol's code and length (Annex C): codes counted up within a length,
 * then shifted left into the next. The tables are written into the file as
 * they stand, so a decoder reads the same codes this encoder sends.
 */
function huffmanCodes(bits, values) {
  if (bits.reduce((total, count) => total + count, 0) !== values.length) {
    throw new Error("a Huffman table's counts must match its symbols");
  }
  if (new Set(values).size !== values.length) throw new Error("a symbol appears twice");

  const codes = new Map();
  let code = 0;
  let at = 0;
  for (let length = 1; length <= 16; length += 1) {
    for (let count = 0; count < bits[length - 1]; count += 1) {
      codes.set(values[at], { code, length });
      at += 1;
      code += 1;
    }
    // A code of all ones is reserved, so the last code of a length never reaches it.
    if (code > 1 << length) throw new Error("a Huffman table holds too many codes");
    code <<= 1;
  }
  return codes;
}

const DC_CODES = huffmanCodes(DC_BITS, DC_VALUES);
const AC_CODES = huffmanCodes(AC_BITS, AC_VALUES);

/**
 * `2048 * C(u) * cos((2x + 1) * u * pi / 16)`, rounded once, where `C(0)` is
 * one over the square root of two. The forward DCT is then integer sums.
 */
const COSINE = (() => {
  const table = [];
  for (let u = 0; u < 8; u += 1) {
    const scale = u === 0 ? Math.SQRT1_2 : 1;
    for (let x = 0; x < 8; x += 1) {
      table.push(Math.round(2048 * scale * Math.cos(((2 * x + 1) * u * Math.PI) / 16)));
    }
  }
  return Object.freeze(table);
})();

/** One 8 by 8 block of samples (0 to 255, row order), transformed and quantised, in zigzag order. */
function quantisedBlock(samples) {
  const out = new Array(64);
  for (let v = 0; v < 8; v += 1) {
    for (let u = 0; u < 8; u += 1) {
      let sum = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          sum += COSINE[u * 8 + x] * COSINE[v * 8 + y] * (samples[y * 8 + x] - 128);
        }
      }
      // F(u, v) is a quarter of the sum over 2048 squared; quantised, rounded once.
      out[v * 8 + u] = Math.round(sum / (4 * 2048 * 2048 * QUANT[v * 8 + u]));
    }
  }
  return ZIGZAG.map((index) => out[index]);
}

/** Bits written high first; a whole `FF` byte is followed by a stuffed `00`. */
function bitSink() {
  const out = [];
  let current = 0;
  let filled = 0;

  const put = (value, length) => {
    for (let bit = length - 1; bit >= 0; bit -= 1) {
      current = (current << 1) | ((value >> bit) & 1);
      filled += 1;
      if (filled === 8) {
        out.push(current);
        if (current === 0xff) out.push(0);
        current = 0;
        filled = 0;
      }
    }
  };

  return {
    put,
    /** Pad the last byte with one bits, as the standard asks, and hand the bytes back. */
    finish() {
      if (filled > 0) put((1 << (8 - filled)) - 1, 8 - filled);
      return Uint8Array.from(out);
    },
  };
}

/** A coefficient's size category, and its extra bits (Annex F.1.2.1). */
function category(value) {
  const size = value === 0 ? 0 : Math.floor(Math.log2(Math.abs(value))) + 1;
  const extra = value < 0 ? value + (1 << size) - 1 : value;
  return { size, extra };
}

function encodeBlock(sink, block, previousDc) {
  const dc = category(block[0] - previousDc);
  const dcCode = DC_CODES.get(dc.size);
  sink.put(dcCode.code, dcCode.length);
  if (dc.size > 0) sink.put(dc.extra, dc.size);

  let run = 0;
  for (let index = 1; index < 64; index += 1) {
    const value = block[index];
    if (value === 0) {
      run += 1;
      continue;
    }
    while (run > 15) {
      const zrl = AC_CODES.get(0xf0);
      sink.put(zrl.code, zrl.length);
      run -= 16;
    }
    const ac = category(value);
    const acCode = AC_CODES.get((run << 4) | ac.size);
    sink.put(acCode.code, acCode.length);
    sink.put(ac.extra, ac.size);
    run = 0;
  }
  if (run > 0) {
    const eob = AC_CODES.get(0x00);
    sink.put(eob.code, eob.length);
  }
  return block[0];
}

/** RGB to YCbCr as JFIF defines it, each an exact ratio rounded once. */
function toYCbCr([red, green, blue]) {
  const clamp = (value) => Math.min(255, Math.max(0, value));
  return [
    clamp(Math.round((299 * red + 587 * green + 114 * blue) / 1000)),
    clamp(Math.round((-168736 * red - 331264 * green + 500000 * blue) / 1e6) + 128),
    clamp(Math.round((500000 * red - 418688 * green - 81312 * blue) / 1e6) + 128),
  ];
}

/**
 * Encode a picture. `pixel(x, y)` gives a grey level (0 to 255) when `colour`
 * is false, or `[red, green, blue]` when it is true. `width` and `height` are
 * multiples of 8. Colour is written at full resolution in every component, as
 * one interleaved scan, or with `separate` as three scans of one component
 * each.
 *
 * Returns `tables` (the quantisation table, the frame header and the Huffman
 * tables, in that order) and `scans` (each a scan header with its compressed
 * data), so a fixture lays out `SOI`, its own segments, the tables, the scans
 * and `EOI` in whatever order it needs.
 */
export function encodeJpeg({ width, height, colour = false, separate = false, pixel }) {
  if (width % 8 !== 0 || height % 8 !== 0) throw new Error("8 pixel multiples only");
  const components = colour ? 3 : 1;

  const planes = Array.from({ length: components }, () => new Uint8Array(width * height));
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixel(x, y);
      const samples = colour ? toYCbCr(value) : [value];
      samples.forEach((sample, index) => {
        planes[index][y * width + x] = sample;
      });
    }
  }

  const blocksAcross = width / 8;
  const blocksDown = height / 8;
  const blockOf = (plane, column, row) => {
    const samples = new Array(64);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        samples[y * 8 + x] = plane[(row * 8 + y) * width + column * 8 + x];
      }
    }
    return quantisedBlock(samples);
  };

  const quant = segment(
    0xdb,
    bytes(Uint8Array.of(0), Uint8Array.from(ZIGZAG.map((i) => QUANT[i]))),
  );
  const frame = segment(
    0xc0,
    bytes(
      Uint8Array.of(8, height >> 8, height & 0xff, width >> 8, width & 0xff, components),
      ...Array.from({ length: components }, (_, index) =>
        Uint8Array.of(index + 1, 0x11, 0),
      ),
    ),
  );
  const huffman = segment(
    0xc4,
    bytes(
      Uint8Array.of(0x00),
      Uint8Array.from(DC_BITS),
      Uint8Array.from(DC_VALUES),
      Uint8Array.of(0x10),
      Uint8Array.from(AC_BITS),
      Uint8Array.from(AC_VALUES),
    ),
  );

  const scanHeader = (ids) =>
    segment(
      0xda,
      bytes(
        Uint8Array.of(ids.length),
        ...ids.map((id) => Uint8Array.of(id, 0x00)),
        Uint8Array.of(0, 63, 0),
      ),
    );

  /** One scan over `indexes`, every block of each component in raster order of its MCUs. */
  const scan = (indexes) => {
    const sink = bitSink();
    const previous = indexes.map(() => 0);
    for (let row = 0; row < blocksDown; row += 1) {
      for (let column = 0; column < blocksAcross; column += 1) {
        indexes.forEach((index, at) => {
          previous[at] = encodeBlock(
            sink,
            blockOf(planes[index], column, row),
            previous[at],
          );
        });
      }
    }
    return bytes(scanHeader(indexes.map((index) => index + 1)), sink.finish());
  };

  const all = Array.from({ length: components }, (_, index) => index);
  const scans = separate ? all.map((index) => scan([index])) : [scan(all)];

  return { tables: [quant, frame, huffman], scans };
}
