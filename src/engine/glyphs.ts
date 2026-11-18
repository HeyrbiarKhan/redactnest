import type { PDFDocument, PDFObject } from "mupdf";

import { walkRoles, type RoleWalk } from "./allowlist";
import { readDrawing, type ResourceCategory } from "./marked";
import { hasKey, keysOf } from "./objects";

/**
 * Type 3 glyphs stay inside their font. Spec 0020.
 *
 * A Type 3 font draws each of its characters with a small drawing of its own
 * (a glyph procedure), and nothing in RedactNest can see inside one: MuPDF
 * hands every reader the character as a single letter. So when a glyph names
 * the same figure or picture a page draws, the passes make a clean copy for
 * the page while the font keeps the original, ticked value and all, and the
 * rest of the check passes. A glyph can also write the ticked words as text
 * of its own, which no reader, pass or check sees. Both were measured, with
 * the glyph drawn by text and without (INV-1).
 *
 * So a file breaks the rule (AC-3) when anything a Type 3 font's glyphs draw
 * shows text (`"text"`), or names a form, picture or tiling pattern, or is a
 * glyph procedure, that something outside every Type 3 font also reaches
 * (`"shared"`). The open and the run refuse such a file with
 * `unreadable-structure` before anything is removed, and the check fails text
 * below a glyph on the written bytes (AC-5 to AC-7). One function decides for
 * all three, so they never disagree (INV-3).
 *
 * The rule refuses and nothing else: it never deletes, edits or rewrites a
 * glyph, a resource or a content stream (INV-2). Sharing is by object
 * identity, on drawings only, never by content: a picture byte for byte the
 * same as one a page draws is not an original copy (INV-4). A graphics state,
 * shading, colour space, font or property list both sides reach never counts.
 * Doubt leans toward refusing (INV-5): a glyph side drawing the scan cannot
 * read is judged as the worst it could do (AC-4).
 */

/** What the glyph rule found: nothing, text below a glyph, or a drawing both sides reach. */
export type GlyphVerdict = "clean" | "text" | "shared";

/** One drawing on the glyph side still to read, and the dictionary it draws with. */
interface GlyphDrawing {
  readonly streams: readonly PDFObject[];
  readonly joined: boolean;
  readonly resources: PDFObject | null;
  /** The dictionary's key: `R` and its number, or where it is written in place. */
  readonly dict: string;
}

/** The categories whose entries can add to the glyph side (AC-1); the rest add nothing. */
const ADDING: readonly ResourceCategory[] = Object.freeze([
  "XObject",
  "Pattern",
  "ExtGState",
]);

/** Every category a drawing that cannot be read is taken to name (AC-4). */
const EVERY_CATEGORY: readonly ResourceCategory[] = Object.freeze([
  "Font",
  "XObject",
  "ExtGState",
  "ColorSpace",
  "Pattern",
  "Shading",
  "Properties",
]);

/**
 * Judge the glyph side of a walk. Spec 0020, AC-1, AC-3 and AC-4.
 *
 * Starts from `walk.glyphs`, each Type 3 font's procedures with the
 * dictionary they draw with, and reads each drawing through `readDrawing`.
 * Every name it uses is looked up in its dictionary, through `hasKey` first,
 * since a missing key is MuPDF's one shared Null, whose `get` throws: a form
 * or tiling pattern joins the glyph side as a drawing of its own, read with
 * its own `/Resources` or, holding none, the dictionary of the drawing that
 * named it; a picture joins with its `/SMask` and `/Mask` chain; a graphics
 * state, or a pattern that is not tiling, adds its soft mask's group form.
 * A drawing is read once per stream and dictionary, so a cycle ends and a
 * form with no resources named from two dictionaries is read in each.
 *
 * `"text"` outranks `"shared"`, so the check and the refusals name the same
 * cause first. Nothing here caches a read by `PDFObject`, since MuPDF.js hands
 * out a new wrapper on every `get`. A throw is the caller's to turn into a
 * refusal.
 */
export function judgeGlyphs(walk: RoleWalk): GlyphVerdict {
  const labelled = (value: PDFObject, label: string): boolean =>
    value.isIndirect() && (walk.reached.get(value.asIndirect())?.has(label) ?? false);

  // What counts for sharing: each glyph procedure, and every form, picture and
  // tiling pattern added below (AC-3 b).
  const below = new Set<number>();
  const visited = new Set<string>();
  const pictures = new Set<number>();

  const pending: GlyphDrawing[] = walk.glyphs.map((unit, index) => {
    for (const stream of unit.streams) {
      if (stream.isIndirect()) below.add(stream.asIndirect());
    }
    return {
      streams: unit.streams,
      joined: unit.joined,
      resources: unit.resources,
      dict: dictKey(unit.resources, `G${index}`),
    };
  });

  /** A form or tiling pattern below a glyph: on the glyph side, and a drawing in turn. */
  const addDrawing = (stream: PDFObject, from: GlyphDrawing): void => {
    const num = stream.asIndirect();
    below.add(num);
    let resources = from.resources;
    let dict = from.dict;
    if (hasKey(stream, "Resources")) {
      const own = stream.get("Resources");
      if (own.isDictionary()) {
        resources = own;
        dict = dictKey(own, `F${num}`);
      }
    }
    const key = `${num} ${dict}`;
    if (visited.has(key)) return;
    visited.add(key);
    pending.push({ streams: [stream], joined: true, resources, dict });
  };

  /** A picture below a glyph, and its `/SMask` and `/Mask` when each is a picture, in turn. */
  const addPicture = (picture: PDFObject): void => {
    const chain = [picture];
    while (chain.length > 0) {
      const next = chain.pop() as PDFObject;
      if (!labelled(next, "image")) continue;
      const num = next.asIndirect();
      if (pictures.has(num)) continue;
      pictures.add(num);
      below.add(num);
      for (const key of ["SMask", "Mask"]) {
        if (hasKey(next, key)) chain.push(next.get(key));
      }
    }
  };

  /** A graphics state's soft mask group, when the walk reached it as a form. */
  const softMaskGroup = (state: PDFObject): PDFObject | null => {
    if (!state.isDictionary() || !hasKey(state, "SMask")) return null;
    const mask = state.get("SMask");
    if (!mask.isDictionary() || !hasKey(mask, "G")) return null;
    const group = mask.get("G");
    return labelled(group, "form") ? group : null;
  };

  /** What one named entry adds to the glyph side (AC-1). */
  const take = (
    category: ResourceCategory,
    entry: PDFObject,
    from: GlyphDrawing,
  ): void => {
    if (category === "XObject") {
      if (labelled(entry, "form")) addDrawing(entry, from);
      else if (labelled(entry, "image")) addPicture(entry);
      return;
    }
    if (category === "Pattern") {
      // Only the walk's label says a pattern is tiling; any other pattern adds
      // its graphics state's soft mask group and is classified no other way.
      if (labelled(entry, "tiling-pattern")) return addDrawing(entry, from);
      if (entry.isDictionary() && hasKey(entry, "ExtGState")) {
        const group = softMaskGroup(entry.get("ExtGState"));
        if (group) addDrawing(group, from);
      }
      return;
    }
    if (category === "ExtGState") {
      const group = softMaskGroup(entry);
      if (group) addDrawing(group, from);
    }
  };

  while (pending.length > 0) {
    const drawing = pending.pop() as GlyphDrawing;
    const read = readDrawing(drawing.streams, null, drawing.joined);
    const { names, showsText } = read === "unsure" ? worstOf(drawing.resources) : read;
    if (showsText) return "text";

    const { resources } = drawing;
    if (resources === null || !resources.isDictionary()) continue;
    for (const category of ADDING) {
      const used = names.get(category);
      if (!used || used.size === 0 || !hasKey(resources, category)) continue;
      const entries = resources.get(category);
      if (!entries.isDictionary()) continue;
      for (const name of used) {
        if (hasKey(entries, name)) take(category, entries.get(name), drawing);
      }
    }
  }

  for (const num of below) {
    if (walk.outside.has(num)) return "shared";
  }
  return "clean";
}

/**
 * The glyph rule on a prepared copy, as the run's `Pipeline` seam asks it
 * (spec 0020, AC-6): one read only walk from the pages, `"problem"` at once
 * when that walk names one (its units are then empty, so nothing could be
 * judged), else `judgeGlyphs`.
 */
export function glyphRuleOf(doc: PDFDocument): GlyphVerdict | "problem" {
  const walk = walkRoles(doc, "read", "pages");
  if (walk.problem !== null) return "problem";
  return judgeGlyphs(walk);
}

/**
 * A drawing the scan cannot read, judged as the worst it could do (AC-4): it
 * names every entry of the dictionary it draws with, and shows text when that
 * dictionary holds `/Font`, or a graphics state holding `/Font`.
 */
function worstOf(resources: PDFObject | null): {
  readonly names: ReadonlyMap<ResourceCategory, ReadonlySet<string>>;
  readonly showsText: boolean;
} {
  const names = new Map<ResourceCategory, ReadonlySet<string>>();
  if (resources === null || !resources.isDictionary()) return { names, showsText: false };

  for (const category of EVERY_CATEGORY) {
    if (!hasKey(resources, category)) continue;
    const entries = resources.get(category);
    if (entries.isDictionary()) names.set(category, new Set(keysOf(entries)));
  }

  let showsText = hasKey(resources, "Font");
  const states = names.get("ExtGState");
  if (!showsText && states) {
    const entries = resources.get("ExtGState");
    for (const name of states) {
      const state = entries.get(name);
      if (state.isDictionary() && hasKey(state, "Font")) showsText = true;
    }
  }
  return { names, showsText };
}

/** A dictionary's key for "read once per stream and dictionary": its number, else `fallback`. */
function dictKey(resources: PDFObject | null, fallback: string): string {
  return resources?.isIndirect() ? `R${resources.asIndirect()}` : fallback;
}
