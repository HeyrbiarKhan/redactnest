import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
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
 * The security page ships no script of its own either. Spec 0018, AC-11: it
 * shares the legal pages' frame, and its drawing is a server primitive.
 */
const SECURITY_FILES = [
  ...filesUnder("src/app/security"),
  "src/app/legal-page.tsx",
  "src/app/site-nav.tsx",
  "src/lib/home-text.ts",
  "src/ui/cover-figure.tsx",
  "src/ui/prose.tsx",
  "src/ui/link-group.tsx",
];

describe("the security page", () => {
  it("is built from files that exist", () => {
    expect(SECURITY_FILES.map((file) => file.replaceAll("\\", "/"))).toContain(
      "src/app/security/page.tsx",
    );
  });

  /** covers: spec 0018, AC-11 */
  it.each(SECURITY_FILES)("%s is not a client component", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(USE_CLIENT);
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
  "src/ui/icon-circle.tsx",
  "src/ui/cover-figure.tsx",
  "src/ui/card.tsx",
  "src/app/pricing-cards.tsx",
  "src/ui/page-container.tsx",
  "src/ui/button.tsx",
];

describe("the home page", () => {
  /** covers: spec 0013, AC-13 */
  it.each(HOME_FILES)("%s is not a client component", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(USE_CLIENT);
  });
});

/**
 * The search pages ship no script of their own either. Spec 0024, AC-1 and
 * INV-3: each page and everything it renders from are server components, so
 * the standard policy and the page budget stay as they are.
 */
const SEARCH_FILES = [
  "src/app/search-page.tsx",
  "src/app/redact-pdf/page.tsx",
  "src/app/remove-text-from-pdf/page.tsx",
  "src/app/black-box-redaction/page.tsx",
  "src/ui/cover-figure.tsx",
  "src/lib/search-pages.ts",
  "src/app/site-nav.tsx",
  "src/app/footer-link.ts",
  "src/ui/icon-circle.tsx",
  "src/ui/link-group.tsx",
  "src/ui/callout.tsx",
  "src/ui/prose.tsx",
  "src/ui/page-container.tsx",
  "src/ui/button.tsx",
];

describe("the search pages", () => {
  /** covers: spec 0024, AC-1, INV-3 */
  it.each(SEARCH_FILES)("%s is not a client component", (file) => {
    expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(USE_CLIENT);
  });

  /** covers: spec 0024, AC-1. No script element, `/`'s JSON-LD block being the one. */
  it.each(SEARCH_FILES.filter((file) => file.startsWith("src/app/")))(
    "%s writes no script element",
    (file) => {
      expect(readFileSync(join(ROOT, file), "utf8")).not.toMatch(
        /<script\b|next\/script/,
      );
    },
  );
});

/**
 * The header's one island. Spec 0026, child 0001, AC-25, narrowing spec 0011
 * INV-7, spec 0012 AC-13, spec 0013 AC-13, spec 0018 AC-11 and spec 0024
 * INV-5: the shared header carries the account slot onto these pages on a
 * billing on build, and nothing else client side.
 *
 * The lists above read each listed file's own directive. This walks every
 * page's static imports through `src`, the way the bundler does, and stops at
 * each client module it reaches, so a client component pulled in anywhere
 * below a page fails here by name. `account-slot.tsx` is the one allowed, and
 * the walk does not enter it (its menu loads with `import()`, for a signed in
 * visitor alone). The pages' own files are still held to no directive above.
 */
const STATIC_PAGES = [
  "src/app/page.tsx",
  "src/app/pricing/page.tsx",
  "src/app/privacy/page.tsx",
  "src/app/terms/page.tsx",
  "src/app/security/page.tsx",
  "src/app/redact-pdf/page.tsx",
  "src/app/remove-text-from-pdf/page.tsx",
  "src/app/black-box-redaction/page.tsx",
  "src/app/not-found.tsx",
];

const ACCOUNT_SLOT = "src/app/account-slot.tsx";

/**
 * `import ... from "x"` and `export ... from "x"`, never `import("x")`, and
 * never `import type`, which the compiler erases.
 */
const STATIC_IMPORT = /^\s*(?:import|export)\s(?!type\s)[^;]*?from\s+["']([^"']+)["']/gm;
const SIDE_EFFECT_IMPORT = /^\s*import\s+["']([^"']+)["']/gm;

/** A specifier inside `src` as a file path, or null for a package. */
function resolveSource(from: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? join("src", specifier.slice(2))
    : specifier.startsWith(".")
      ? join(from, "..", specifier)
      : null;
  if (base === null) return null;
  for (const candidate of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ]) {
    const path = join(ROOT, candidate);
    if (existsSync(path) && statSync(path).isFile())
      return candidate.replaceAll("\\", "/");
  }
  throw new Error(`${from} imports ${specifier}, which resolves to no file`);
}

/** Every client module a page reaches by static import, without entering one. */
function clientModulesFrom(entry: string): string[] {
  const seen = new Set<string>();
  const clients = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(join(ROOT, file), "utf8");
    if (file !== entry && USE_CLIENT.test(source)) {
      clients.add(file);
      continue;
    }
    for (const pattern of [STATIC_IMPORT, SIDE_EFFECT_IMPORT]) {
      for (const [, specifier] of source.matchAll(pattern)) {
        const next = resolveSource(file, specifier as string);
        if (next !== null && /\.tsx?$/.test(next)) queue.push(next);
      }
    }
  }
  return [...clients].sort();
}

describe("the header's one island (spec 0026, child 0001, AC-25)", () => {
  /** covers: child 0001, AC-25 */
  it.each(STATIC_PAGES)("%s reaches no client module but the account slot", (page) => {
    expect(clientModulesFrom(page)).toEqual([ACCOUNT_SLOT]);
  });

  it("finds the island through the header, so the walk is reading imports", () => {
    expect(clientModulesFrom("src/app/site-nav.tsx")).toEqual([ACCOUNT_SLOT]);
    expect(readFileSync(join(ROOT, ACCOUNT_SLOT), "utf8")).toMatch(USE_CLIENT);
  });

  it("loads the menu with import(), so no page reaches it statically", () => {
    const slot = readFileSync(join(ROOT, ACCOUNT_SLOT), "utf8");
    expect(slot).toMatch(/import\(\s*["']\.\/account-menu["']\s*\)/);
    expect([...slot.matchAll(STATIC_IMPORT)].map(([, from]) => from)).not.toContain(
      "./account-menu",
    );
  });
});
