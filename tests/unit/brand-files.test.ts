/**
 * The brand's files. Spec 0013, AC-1, AC-3, AC-5, AC-27, AC-28 and INV-7,
 * INV-8.
 *
 * `scripts/make-brand.mjs` writes the raster files and nobody edits them, so
 * this checks what a rerun must keep true: each file exists at its exact pixel
 * size, read from its own header; the master mark carries exactly the two
 * token colours and the same paths the page draws; and the social card's alt
 * text is the home page's own words.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HOME_TEXT } from "@/lib/home-text";
import { MARK_PATHS } from "@/ui/brand-mark";

const ROOT = join(__dirname, "..", "..");
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts));

const PNG_SIGNATURE = "89504e470d0a1a0a";

/** A PNG's width and height, from its IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
  expect(bytes.subarray(12, 16).toString("latin1")).toBe("IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** Each image in an ICO directory: its stated size and its own bytes. */
function icoImages(bytes: Buffer) {
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1);
  return Array.from({ length: bytes.readUInt16LE(4) }, (_, index) => {
    const entry = 6 + 16 * index;
    const length = bytes.readUInt32LE(entry + 8);
    const offset = bytes.readUInt32LE(entry + 12);
    return {
      width: bytes[entry] || 256,
      height: bytes[entry + 1] || 256,
      image: bytes.subarray(offset, offset + length),
    };
  });
}

/** The colour tokens, parsed as `tests/unit/contrast.test.ts` parses them. */
function tokens(): Record<string, string> {
  const css = read("src", "app", "globals.css").toString("utf8");
  return Object.fromEntries(
    [...css.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/g)].map(([, role, hex]) => [
      role,
      hex.toLowerCase(),
    ]),
  );
}

const ICON_SVG = read("src", "app", "icon.svg").toString("utf8");

describe("the master mark, src/app/icon.svg (AC-1, AC-27)", () => {
  it("draws the same paths as the mark on the page", () => {
    const paths = [...ICON_SVG.matchAll(/<path d="([^"]+)"/g)].map(([, d]) => d);

    expect(paths).toEqual(MARK_PATHS);
  });

  it("carries exactly the accent and accent-soft token values, and no other colour", () => {
    const colours = new Set(
      [...ICON_SVG.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map(([hex]) => hex.toLowerCase()),
    );
    const { accent, "accent-soft": accentSoft } = tokens();

    expect([...colours].sort()).toEqual([accent, accentSoft].sort());
    expect(ICON_SVG).not.toMatch(/\b(rgb|hsl|oklch|currentColor)\b/);
  });

  it("fills with accent, and with accent-soft only under a dark colour scheme", () => {
    const { accent, "accent-soft": accentSoft } = tokens();
    const style = /<style>([\s\S]*?)<\/style>/.exec(ICON_SVG)?.[1] ?? "";
    const [light, dark] = style.split("@media (prefers-color-scheme: dark)");

    expect(light).toContain(`fill: ${accent}`);
    expect(dark).toContain(`fill: ${accentSoft}`);
  });

  it("sits on the 64 unit grid", () => {
    expect(ICON_SVG).toContain('viewBox="0 0 64 64"');
  });
});

describe("the raster files (AC-3, AC-5, AC-6, AC-28)", () => {
  it("packs the favicon with a 16 and a 32 pixel PNG", () => {
    const images = icoImages(read("src", "app", "favicon.ico"));

    expect(images.map(({ width, height }) => [width, height])).toEqual([
      [16, 16],
      [32, 32],
    ]);
    for (const { width, height, image } of images) {
      expect(pngSize(image)).toEqual({ width, height });
    }
  });

  it("makes the Apple icon 180 by 180", () => {
    expect(pngSize(read("src", "app", "apple-icon.png"))).toEqual({
      width: 180,
      height: 180,
    });
  });

  it("makes the social card 1200 by 630 and under 1 MB", () => {
    const card = read("src", "app", "opengraph-image.png");

    expect(pngSize(card)).toEqual({ width: 1200, height: 630 });
    expect(card.length).toBeLessThan(1024 * 1024);
  });

  it("captures the product shot at 1280 by 800 at device scale 2 (AC-12)", () => {
    expect(pngSize(read("src", "app", "product-review.png"))).toEqual({
      width: 2560,
      height: 1600,
    });
  });

  it("makes the Polar product image 1200 by 630, the social card's composition", () => {
    expect(pngSize(read("docs", "design", "brand", "polar-product.png"))).toEqual({
      width: 1200,
      height: 630,
    });
  });
});

describe("the social card's alt text (AC-5)", () => {
  it("is HOME_TEXT.socialAlt, word for word", () => {
    expect(read("src", "app", "opengraph-image.alt.txt").toString("utf8")).toBe(
      HOME_TEXT.socialAlt,
    );
  });
});

/**
 * AC-27 and AC-28: the script draws only with the site's own tokens and adds
 * no package. Read as text, as the script reads what it draws from, so a
 * colour typed into it or a TypeScript import fails here rather than in a
 * rerun nobody makes until the look changes.
 */
describe("scripts/make-brand.mjs, read as text (AC-27, AC-28)", () => {
  const SCRIPT = read("scripts", "make-brand.mjs").toString("utf8");
  const code = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("writes no colour of its own: every colour comes from globals.css", () => {
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(code).not.toMatch(/\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/);
    expect(code).toContain('readFile(at("src", "app", "globals.css")');
  });

  it("imports only Node's own modules and @playwright/test, never a TypeScript module", () => {
    const sources = [...code.matchAll(/^import\b[^;]*?from\s+"([^"]+)"/gm)].map(
      ([, source]) => source,
    );

    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source).toMatch(/^(node:[a-z_/]+|@playwright\/test)$/);
    }
    // No dynamic import and no require: `createRequire` only resolves Next's
    // own binary to start the build, which loads nothing into the script.
    expect(code).not.toMatch(/\bimport\(/);
    expect(code).not.toMatch(/\brequire\(/);
  });
});
