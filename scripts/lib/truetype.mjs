/**
 * Just enough of a TrueType reader to embed a font in a fixture by hand.
 *
 * The fixture script embeds Carlito (spec 0004, *Fixture fonts*) as a simple
 * TrueType font, which needs the advance width of every character it uses. They
 * are read here from the font's own tables rather than asked of MuPDF, so no
 * fixture is authored with help from the engine it tests.
 *
 * Reads `head` (units per em, bounding box), `hhea` (ascender, descender, the
 * number of long metrics), `hmtx` (advances) and a format 4 `cmap` subtable
 * for Windows Unicode (platform 3, encoding 1). Nothing else is needed.
 */

export function readTrueType(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map();

  const numTables = view.getUint16(4);
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(...bytes.subarray(record, record + 4));
    tables.set(tag, view.getUint32(record + 8));
  }

  const table = (tag) => {
    const offset = tables.get(tag);
    if (offset === undefined) throw new Error(`font has no ${tag} table`);
    return offset;
  };

  const head = table("head");
  const unitsPerEm = view.getUint16(head + 18);
  const bbox = [36, 38, 40, 42].map((at) => view.getInt16(head + at));

  const hhea = table("hhea");
  const ascender = view.getInt16(hhea + 4);
  const descender = view.getInt16(hhea + 6);
  const longMetrics = view.getUint16(hhea + 34);

  const hmtx = table("hmtx");
  const advanceOf = (glyph) =>
    view.getUint16(hmtx + 4 * Math.min(glyph, longMetrics - 1));

  const glyphOf = unicodeCmap(view, table("cmap"));

  /** In thousandths of an em, as a PDF `/Widths` array wants them. */
  const scale = (value) => Math.round((value * 1000) / unitsPerEm);

  return {
    bbox: bbox.map(scale),
    ascent: scale(ascender),
    descent: scale(descender),
    widthOf: (character) => scale(advanceOf(glyphOf(character.codePointAt(0)))),
  };
}

/** The glyph lookup of the (3, 1) format 4 subtable. */
function unicodeCmap(view, cmap) {
  const count = view.getUint16(cmap + 2);
  let subtable = -1;

  for (let index = 0; index < count; index += 1) {
    const record = cmap + 4 + index * 8;
    if (view.getUint16(record) === 3 && view.getUint16(record + 2) === 1) {
      subtable = cmap + view.getUint32(record + 4);
    }
  }
  if (subtable < 0 || view.getUint16(subtable) !== 4) {
    throw new Error("font has no Windows Unicode format 4 cmap");
  }

  const segments = view.getUint16(subtable + 6) / 2;
  const ends = subtable + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const ranges = deltas + segments * 2;

  return (code) => {
    for (let segment = 0; segment < segments; segment += 1) {
      if (code > view.getUint16(ends + segment * 2)) continue;

      const start = view.getUint16(starts + segment * 2);
      if (code < start) return 0;

      const delta = view.getInt16(deltas + segment * 2);
      const rangeAt = ranges + segment * 2;
      const range = view.getUint16(rangeAt);
      if (range === 0) return (code + delta) & 0xffff;

      const glyph = view.getUint16(rangeAt + range + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };
}
