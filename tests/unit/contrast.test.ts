import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The contrast contract, as a test failure rather than a review comment.
 * Spec 0003, AC-1, AC-2 and AC-4.
 *
 * The values are read from `src/app/globals.css` every run and never copied in
 * here, so changing a token until a pairing fails makes this file fail. The
 * pairings are copied in, from the spec's Contrast contract, because they are
 * the decision: which foreground may sit on which background, and how clear it
 * has to be. A component that introduces a new pairing adds it to the spec and
 * to `CONTRACT` in the same change (INV-2).
 */

const CSS = readFileSync(
  fileURLToPath(new URL("../../src/app/globals.css", import.meta.url)),
  "utf8",
);

/** Every role in the spec's Token table, and nothing else (INV-1). */
const TOKENS = Object.freeze([
  "canvas",
  "surface",
  "subtle",
  "muted",
  "border",
  "border-strong",
  "ink",
  "ink-muted",
  "ink-subtle",
  "accent",
  "accent-strong",
  "accent-soft",
  "accent-faint",
  "on-accent",
  "focus",
  "warning-bg",
  "warning-border",
  "warning-icon",
  "warning-ink",
  "info-bg",
  "info-border",
  "info-icon",
  "danger-bg",
  "danger-border",
  "danger-icon",
  "danger-ink",
  "danger-strong",
  "night",
  "night-ink",
  "night-muted",
  "night-accent",
  "night-border",
  "glow",
  "glow-edge",
  "ink-soft",
  "accent-bright",
  "border-soft",
  "border-mid",
  "accent-edge",
  "night-raised",
  "night-faint",
]);

/** 4.5:1 for text, 3:1 for icons, control edges and the focus ring (WCAG 1.4.3, 1.4.11). */
const TEXT = 4.5;
const GRAPHIC = 3;

interface Pairing {
  readonly foreground: string;
  readonly background: string;
  readonly minimum: number;
}

/** One row per foreground and background, expanded from the spec's grouped table. */
function pairings(
  foregrounds: readonly string[],
  backgrounds: readonly string[],
  minimum: number,
): Pairing[] {
  return foregrounds.flatMap((foreground) =>
    backgrounds.map((background) => ({ foreground, background, minimum })),
  );
}

const CONTRACT: readonly Pairing[] = Object.freeze([
  ...pairings(["ink", "ink-muted"], ["canvas", "surface", "subtle"], TEXT),
  ...pairings(["on-accent"], ["accent", "accent-strong"], TEXT),
  ...pairings(["accent-strong"], ["canvas", "surface", "subtle", "accent-soft"], TEXT),
  // `ink-muted` on `accent-soft`: the drop zone's helper and the file bar's
  // page count while a file is dragged over them (spec 0007, INV-6).
  ...pairings(["ink", "ink-muted"], ["accent-soft"], TEXT),
  ...pairings(["ink", "ink-muted"], ["warning-bg", "info-bg", "danger-bg"], TEXT),
  ...pairings(["danger-ink"], ["canvas", "surface", "danger-bg"], TEXT),
  ...pairings(["accent"], ["canvas", "surface", "accent-soft"], GRAPHIC),
  ...pairings(["border-strong"], ["canvas", "surface"], GRAPHIC),
  ...pairings(["focus"], ["canvas", "surface", "accent-soft"], GRAPHIC),
  // The plan card on `/tool`: its links and Try again, and the ring around
  // them, on the card's `info-bg` fill (spec 0013, AC-18 and AC-27).
  { foreground: "accent-strong", background: "info-bg", minimum: TEXT },
  { foreground: "focus", background: "info-bg", minimum: GRAPHIC },
  // The danger buttons on `/account` (spec 0013, AC-35): the `danger` button's
  // words and busy spinner on its fill, at rest and under the pointer, and the
  // ring around either danger button, which its offset puts on the card's
  // `surface`, held at 4.5 there rather than 3 by your call.
  ...pairings(["on-accent"], ["danger-ink", "danger-strong"], TEXT),
  { foreground: "focus", background: "surface", minimum: TEXT },
  { foreground: "warning-icon", background: "warning-bg", minimum: GRAPHIC },
  { foreground: "info-icon", background: "info-bg", minimum: GRAPHIC },
  { foreground: "danger-icon", background: "danger-bg", minimum: GRAPHIC },
  // The redesign's pairings (spec 0026, AC-1). Chips, count badges and hover
  // fills sit on `muted`; a ticked row on `accent-faint`; captions take
  // `ink-subtle`, never on `muted`; links take `accent` as text; the tool page
  // sits on `subtle`, so the ring and the checkbox edge are held there too.
  ...pairings(["ink", "ink-muted"], ["muted", "accent-faint"], TEXT),
  ...pairings(["ink-subtle"], ["canvas", "surface", "subtle"], TEXT),
  ...pairings(["accent"], ["canvas", "surface", "subtle", "accent-faint"], TEXT),
  ...pairings(["accent"], ["muted"], GRAPHIC),
  ...pairings(["accent-strong"], ["accent-faint"], TEXT),
  ...pairings(["border-strong"], ["subtle", "accent-faint"], GRAPHIC),
  ...pairings(["focus"], ["subtle", "muted", "accent-faint"], GRAPHIC),
  { foreground: "warning-ink", background: "warning-bg", minimum: TEXT },
  // The network band on `night` (AC-9): its words, its link and the ring
  // around that link, which takes `night-accent` there because `focus` fails.
  ...pairings(["night-ink", "night-muted", "night-accent"], ["night"], TEXT),
  // The home page's port of `Main.dc.html` (2026-11-25). The hero's words,
  // caps line and buttons' ring over the `glow` wash; `ink-soft` for chips,
  // the trust strip and drawn page text on the light fills; a count in
  // `ink-subtle` on the drawn window's ticked `accent-faint` row. `glow-edge`,
  // `accent-bright` and `border-soft` are edges in drawings and join none.
  ...pairings(["ink", "ink-muted", "ink-subtle"], ["glow"], TEXT),
  { foreground: "focus", background: "glow", minimum: GRAPHIC },
  ...pairings(["ink-soft"], ["canvas", "surface", "subtle", "glow"], TEXT),
  { foreground: "ink-subtle", background: "accent-faint", minimum: TEXT },
  // The black box section's tinted look: the box laid over text in red, its
  // chip and its copy (`CoverFigure`'s `tinted`).
  { foreground: "danger-strong", background: "danger-bg", minimum: TEXT },
  // The network band's table on its raised fill: its rows, the visitor's
  // file in the accent, and the column heads in `night-faint`.
  ...pairings(["night-muted", "night-accent", "night-faint"], ["night-raised"], TEXT),
  // The closing card on `accent`: its line in `accent-soft`, its heading in
  // `on-accent` (held above), its button's words in `accent` on `surface`
  // (held above), and the ring around that button in `ink`, on `accent` and
  // on the `accent-bright` wash behind it.
  { foreground: "accent-soft", background: "accent", minimum: TEXT },
  ...pairings(["ink"], ["accent", "accent-bright"], GRAPHIC),
  // The page preview's rail (spec 0026 child 0002, AC-41): a warning page's
  // mark, an exclamation in `on-accent` on a `warning-icon` disc, held as a
  // graphic, since it is decorative and the button's name says it.
  { foreground: "on-accent", background: "warning-icon", minimum: GRAPHIC },
]);

/**
 * `--color-<role>: #rrggbb;`, the one notation the spec allows. A token written
 * any other way is simply not found, and the tests below say which one.
 */
function readTokens(css: string): ReadonlyMap<string, string> {
  const tokens = new Map<string, string>();
  for (const match of css.matchAll(/--color-([a-z][a-z-]*):\s*#([0-9a-f]{6})\s*;/gi)) {
    const [, role, hex] = match;
    if (role && hex) tokens.set(role, hex.toLowerCase());
  }
  return tokens;
}

/** WCAG relative luminance of an sRGB colour written as six hex digits. */
function luminance(hex: string): number {
  const channel = (offset: number) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
}

const tokens = readTokens(CSS);

function valueOf(role: string): string {
  const value = tokens.get(role);
  if (!value) throw new Error(`--color-${role} is not defined as #rrggbb in globals.css`);
  return value;
}

describe("the ratio function", () => {
  it("agrees with WCAG on the extremes", () => {
    expect(contrast("000000", "ffffff")).toBeCloseTo(21, 5);
    expect(contrast("ffffff", "ffffff")).toBeCloseTo(1, 5);
  });

  /**
   * The control. Without a pair known to fail, a ratio function that returned a
   * large number for everything would pass the whole contract below.
   */
  it("fails a pair the spec knows fails: the focus ring against the accent", () => {
    const ratio = contrast(valueOf("focus"), valueOf("accent"));

    expect(ratio).toBeLessThan(GRAPHIC);
    expect(ratio).toBeCloseTo(1.39, 1);
  });
});

describe("the token set (AC-1)", () => {
  it("defines every role in the Token table, and no colour outside it", () => {
    expect([...tokens.keys()].sort()).toEqual([...TOKENS].sort());
  });

  it("defines each role exactly once", () => {
    for (const role of TOKENS) {
      const definitions = CSS.match(new RegExp(`--color-${role}:`, "g")) ?? [];
      expect(definitions, `--color-${role}`).toHaveLength(1);
    }
  });

  /**
   * That the wipe really stops the default palette generating is Tailwind's
   * documented behaviour, not something this test compiles to prove. The lint
   * patterns in AC-3 carry the arbitrary values that would get round it.
   */
  it("wipes Tailwind's default palette", () => {
    expect(CSS).toMatch(/--color-\*:\s*initial;/);
  });

  it("declares a light colour scheme and no dark one", () => {
    expect(CSS).toMatch(/color-scheme:\s*light;/);
    expect(CSS).not.toMatch(/prefers-color-scheme/);
  });
});

describe("the type floor (AC-4)", () => {
  it("removes the one size below 14px", () => {
    expect(CSS).toMatch(/--text-xs:\s*initial;/);
  });

  /**
   * Built now and first placed by feature 15, so nothing on a page proves it
   * yet. It sits at the 14px floor, in the muted ink the contract checks, and
   * never takes its colour from opacity (INV-3).
   */
  it("builds the eyebrow at 14px, in the muted ink", () => {
    const eyebrow = CSS.match(/@utility eyebrow\s*\{([^}]*)\}/)?.[1] ?? "";

    expect(eyebrow).toMatch(/font-size:\s*var\(--text-small\);/);
    expect(eyebrow).toMatch(/color:\s*var\(--color-ink-muted\);/);
    expect(eyebrow).not.toMatch(/opacity/);
  });
});

describe("the contrast contract (AC-2)", () => {
  it.each(
    CONTRACT.map((pair) => [pair.foreground, pair.background, pair.minimum] as const),
  )("%s on %s clears %s:1", (foreground, background, minimum) => {
    expect(contrast(valueOf(foreground), valueOf(background))).toBeGreaterThanOrEqual(
      minimum,
    );
  });
});

/**
 * Two pairings the spec keeps out of the contract because they fail, so a
 * component that reaches for one is caught here rather than by eye
 * (spec 0026, AC-1).
 */
describe("the pairings that stay out of the contract", () => {
  it.each([
    ["ink-subtle", "muted", TEXT],
    ["focus", "night", GRAPHIC],
  ] as const)(
    "%s on %s falls short of %s:1, and is not in the contract",
    (fg, bg, min) => {
      expect(contrast(valueOf(fg), valueOf(bg))).toBeLessThan(min);
      expect(
        CONTRACT.some((pair) => pair.foreground === fg && pair.background === bg),
      ).toBe(false);
    },
  );
});
