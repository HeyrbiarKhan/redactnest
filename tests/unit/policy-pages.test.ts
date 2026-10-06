import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The legal pages ship no script of their own. Spec 0011, AC-19 and INV-7.
 *
 * Both pages and everything they are built from are server components: no
 * form, no state, nothing that runs in the visitor's browser and so nothing
 * that could collect. A `"use client"` anywhere in them would quietly make one
 * of them a client component, so the directive is looked for in the files
 * themselves.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Every file under a folder, at any depth. */
function filesUnder(folder: string): string[] {
  return readdirSync(join(ROOT, folder), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(ROOT, join(entry.parentPath, entry.name)));
}

/** The two pages' folders, and the pieces they render from outside them. */
const PAGE_FILES = [
  ...filesUnder("src/app/privacy"),
  ...filesUnder("src/app/terms"),
  "src/app/legal-page.tsx",
  "src/ui/prose.tsx",
  "src/ui/link-group.tsx",
];

/** A directive is the first statement, after any comments. */
const USE_CLIENT = /^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*["']use client["']/;

describe("the legal pages", () => {
  it("are built from files that exist", () => {
    expect(PAGE_FILES.map((file) => file.replaceAll("\\", "/"))).toEqual(
      expect.arrayContaining(["src/app/privacy/page.tsx", "src/app/terms/page.tsx"]),
    );
  });

  /** covers: AC-19, INV-7 */
  it.each(PAGE_FILES)("%s is not a client component", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(USE_CLIENT);
  });

  /** The check itself, so a directive written any of these ways is caught. */
  it.each([
    ['"use client";\n'],
    ["'use client'\n"],
    ['// a note\n"use client";\n'],
    ['/** a note */\n\n"use client";\n'],
  ])("would catch %j", (source) => {
    expect(source).toMatch(USE_CLIENT);
  });
});

/**
 * Pricing ships no script of its own either. Spec 0012, AC-13: a static page
 * with no client component, so nothing on it runs before the visitor chooses
 * Subscribe.
 */
const PRICING_FILES = [
  ...filesUnder("src/app/pricing"),
  "src/app/site-nav.tsx",
  "src/ui/site-header.tsx",
  "src/ui/brand-mark.tsx",
  "src/ui/link-group.tsx",
  "src/ui/page-container.tsx",
  "src/ui/card.tsx",
  "src/ui/button.tsx",
];

describe("Pricing", () => {
  it("is built from files that exist", () => {
    expect(PRICING_FILES.map((file) => file.replaceAll("\\", "/"))).toContain(
      "src/app/pricing/page.tsx",
    );
  });

  /** covers: AC-13 */
  it.each(PRICING_FILES)("%s is not a client component", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(USE_CLIENT);
  });
});

/**
 * The home page ships no script of its own either. Spec 0013, AC-13: a static
 * server component with no client component, so its words and its picture
 * arrive as HTML and nothing on it runs.
 */
const HOME_FILES = [
  "src/app/page.tsx",
  "src/lib/home-text.ts",
  "src/app/site-nav.tsx",
  "src/ui/site-header.tsx",
  "src/ui/brand-mark.tsx",
  "src/ui/link-group.tsx",
  "src/ui/feature-list.tsx",
  "src/ui/icon-circle.tsx",
  "src/ui/page-container.tsx",
  "src/ui/button.tsx",
];

describe("the home page", () => {
  /** covers: spec 0013, AC-13 */
  it.each(HOME_FILES)("%s is not a client component", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(USE_CLIENT);
  });
});
