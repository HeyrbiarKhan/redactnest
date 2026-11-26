import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Spec 0013's rules that only the source can show, read from it as text: red
 * means the account is about to be destroyed (AC-35, INV-12), the product
 * shot carries the one larger shadow (AC-12), and one rule sets every cursor
 * (AC-33, INV-10).
 *
 * `/check verify` ran the red buttons as a `git grep` and read the cursor rule
 * by eye; here they hold on every run, so a third red button, a second large
 * shadow or a cursor set in another place needs your read first.
 */

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Every `.ts` and `.tsx` file under `src`, as a forward slash path. */
function sourceFiles(): string[] {
  return readdirSync(join(ROOT, "src"), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) =>
      relative(ROOT, join(entry.parentPath, entry.name)).replaceAll("\\", "/"),
    );
}

const source = (file: string) => readFileSync(join(ROOT, file), "utf8");

const FILES = sourceFiles();

const DELETE_ACCOUNT = "src/app/(account)/delete-account.tsx";
const BUTTON = "src/ui/button.tsx";
const HOME_PAGE = "src/app/page.tsx";

it("reads the source it checks", () => {
  expect(FILES).toEqual(expect.arrayContaining([DELETE_ACCOUNT, BUTTON, HOME_PAGE]));
});

/** `variant="danger"` or `variant="danger-secondary"`, braced or not, any quote. */
const DANGER_VARIANT = /variant=\{?\s*["'`](danger(?:-secondary)?)["'`]/g;

/** A filled red: the two fills only the danger buttons may paint. */
const RED_FILL = /(^|[\s:!"'`])bg-danger-(ink|strong)\b/;

describe("the red buttons (AC-35, INV-12)", () => {
  it("are the two delete buttons in delete-account.tsx, and nothing else", () => {
    const uses = FILES.flatMap((file) =>
      [...source(file).matchAll(DANGER_VARIANT)].map(([, variant]) => [file, variant]),
    );

    expect(uses).toEqual([
      [DELETE_ACCOUNT, "danger-secondary"],
      [DELETE_ACCOUNT, "danger"],
    ]);
  });

  it("are the only place a red fill is drawn: Button's two danger variants", () => {
    expect(FILES.filter((file) => RED_FILL.test(source(file)))).toEqual([BUTTON]);
  });

  /** The checks themselves, so each spelling is caught. */
  it.each([
    ['<Button variant="danger">'],
    ["<Button variant='danger-secondary'>"],
    ['<Button variant={"danger"}>'],
    ["<Button variant={`danger-secondary`}>"],
  ])("would catch %s", (code) => {
    expect([...code.matchAll(DANGER_VARIANT)]).toHaveLength(1);
  });

  it.each([['"bg-danger-ink"'], ['"hover:bg-danger-strong"'], ['"px-4 !bg-danger-ink"']])(
    "would catch the red fill in %s",
    (code) => {
      expect(code).toMatch(RED_FILL);
    },
  );

  it("leaves the light red tint of a callout alone", () => {
    expect('"border-danger-border bg-danger-bg"').not.toMatch(RED_FILL);
  });
});

/**
 * A shadow above a card's quiet `shadow-card`: the home page's drawn window,
 * the card hanging off it and the account menu's popover (spec 0026, AC-2, as
 * the owner's port of `Main.dc.html` amends it, 2026-11-25).
 */
const LARGE_SHADOW = /(^|[\s:!"'`])shadow-(popover|window|plan)\b/g;

const DROPDOWN_MENU = "src/ui/dropdown-menu.tsx";
const HOME_WINDOW = "src/app/home-window.tsx";
const PRICING_CARDS = "src/app/pricing-cards.tsx";

describe("the larger shadows (spec 0013, AC-12, as spec 0026 amends it)", () => {
  it("frame the home page's window, its card and its Pro card, and the account menu, and nothing else", () => {
    const uses = FILES.flatMap((file) =>
      [...source(file).matchAll(LARGE_SHADOW)].map(([match]) => [file, match.trim()]),
    );

    expect(uses).toEqual(
      expect.arrayContaining([
        [HOME_WINDOW, "shadow-window"],
        [HOME_PAGE, "shadow-popover"],
        [PRICING_CARDS, "shadow-plan"],
        [DROPDOWN_MENU, "shadow-popover"],
      ]),
    );
    expect(uses).toHaveLength(4);
  });

  it.each([['"shadow-popover"'], ['"hover:shadow-window"'], ['"p-4 shadow-window"']])(
    "would catch %s",
    (code) => {
      expect(code).toMatch(LARGE_SHADOW);
    },
  );

  it("leaves a card's quiet shadow alone", () => {
    expect('"rounded-card shadow-card"').not.toMatch(LARGE_SHADOW);
  });
});

/** The site's CSS without its comments, which mention `!important` on purpose. */
const CSS = source("src/app/globals.css").replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Each rule in the CSS that holds `needle`: its selector and the at rules it
 * sits inside, outermost first, walked by brace depth.
 */
function rulesHolding(needle: string) {
  const found: { selector: string; within: string[] }[] = [];
  const open: string[] = [];
  let prelude = "";
  let body = "";
  for (const char of CSS) {
    if (char === "{") {
      open.push(prelude.trim());
      prelude = "";
      body = "";
    } else if (char === "}") {
      const selector = open.pop() ?? "";
      if (body.includes(needle)) found.push({ selector, within: [...open] });
      prelude = "";
      body = "";
    } else if (char === ";") {
      body += prelude + char;
      prelude = "";
    } else {
      prelude += char;
    }
  }
  return found;
}

/** A selector list split at its own commas, never at one inside `:is()` or `:has()`. */
function selectorList(selector: string): string[] {
  const parts = [""];
  let depth = 0;
  for (const char of selector) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) parts.push("");
    else parts[parts.length - 1] += char;
  }
  return parts.map((part) =>
    part.replace(/\s+/g, " ").replace(/\( /g, "(").replace(/ \)/g, ")").trim(),
  );
}

describe("the one cursor rule in globals.css (AC-33, INV-10)", () => {
  const rules = rulesHolding("!important");
  const pointer = rules.find(({ selector }) => selector.includes("a[href]"));
  const notAllowed = rules.find(({ selector }) => selector.startsWith(":disabled"));

  it("is the only !important in the site's CSS: two declarations, each a cursor", () => {
    const declarations = CSS.match(/[a-z-]+\s*:[^;{}]*!important/g) ?? [];

    expect(declarations.map((each) => each.replace(/\s+/g, " "))).toEqual([
      "cursor: pointer !important",
      "cursor: not-allowed !important",
    ]);
    expect(rules).toHaveLength(2);
  });

  it("sits outside every layer and every at rule, so it beats Clerk's unlayered style", () => {
    for (const { within } of rules) expect(within).toEqual([]);
  });

  it("gives the pointer to every kind of control the spec names", () => {
    const selectors = selectorList(pointer?.selector ?? "");

    for (const kind of [
      "a[href]",
      "button:enabled",
      "summary",
      "select:enabled",
      'input:is([type="checkbox"], [type="radio"]):enabled',
      '[role="button"]:not(:disabled)',
      'label:has(input:is([type="checkbox"], [type="radio"]):enabled)',
    ]) {
      expect(selectors.some((selector) => selector.startsWith(kind))).toBe(true);
    }
  });

  it("gives not-allowed to whatever is disabled, busy or a blocked row", () => {
    expect(selectorList(notAllowed?.selector ?? "")).toEqual([
      ":disabled",
      '[aria-disabled="true"]',
      'label:has(input:is([type="checkbox"], [type="radio"]):disabled)',
    ]);
  });

  /** So the two never overlap, and their order in the file does not matter. */
  it("leaves out of every pointer selector what not-allowed matches", () => {
    for (const selector of selectorList(pointer?.selector ?? "")) {
      expect(selector).toContain(':not([aria-disabled="true"])');
      if (selector.startsWith("label")) {
        expect(selector).toContain(
          ':not(:has(input:is([type="checkbox"], [type="radio"]):disabled))',
        );
      }
    }
  });
});

/**
 * The home page's sticky header never covers what has focus (WCAG 2.4.11,
 * technique C43; spec 0003, AC-14, as the port of `Main.dc.html` amends it).
 * `SiteHeader`'s `sticky` holds from `lg` (64rem) and marks the bar
 * `data-sticky`; from the same width the page keeps the bar's height, 4rem
 * and its edge plus room for a focus ring, clear at its top.
 */
describe("the sticky header's scroll padding", () => {
  it("keeps the bar's height clear from lg whenever a sticky header is on the page", () => {
    const rules = rulesHolding("scroll-padding-top");

    expect(rules).toEqual([
      {
        selector: ":root:has(header[data-sticky])",
        within: ["@layer base", "@media (width >= 64rem)"],
      },
    ]);
    expect(CSS).toMatch(/scroll-padding-top:\s*calc\(4\.5rem \+ 1px\);/);
  });

  it("is keyed to the same width the header sticks from", () => {
    const header = source("src/ui/site-header.tsx");

    // The rendered class list holds `lg:sticky` and no other position
    // (`tests/component/ui/layout.test.tsx`); here, the same breakpoint.
    expect(header).toContain('"border-muted lg:sticky lg:top-0');
  });
});

describe("the one reduced motion rule in globals.css (spec 0026, AC-2)", () => {
  const rules = rulesHolding("animation: none");

  it("is one rule, under prefers-reduced-motion and outside every layer", () => {
    expect(rules).toHaveLength(1);
    expect(rules[0]?.within).toEqual(["@media (prefers-reduced-motion: reduce)"]);
  });

  it("stops every transition and animation on every element and pseudo element", () => {
    expect(selectorList(rules[0]?.selector ?? "")).toEqual(["*", "::before", "::after"]);
    expect(rulesHolding("transition: none")).toEqual(rules);
  });

  it("leaves no component opting out on its own", () => {
    expect(FILES.filter((file) => /motion-(reduce|safe):/.test(source(file)))).toEqual(
      [],
    );
  });
});
