/**
 * The search pages, as rendered. Spec 0024, AC-1 to AC-8.
 *
 * Each page is a plain server component over its record in
 * `src/lib/search-pages.ts`, so it renders here as it does at build. This
 * holds the frame and its order, the headings, the links, the claims (the
 * shared banned phrases over each page's content, title and description), the
 * idea counts, and the cap line with billing on and off (`config` mocked,
 * because the Playwright build runs with billing on). `next/link` throws here
 * if a page ever reaches for it. The browser suites hold the head as served,
 * axe with styles, 320 pixels, 200% text and forced colours.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as blackBox from "@/app/black-box-redaction/page";
import * as redactPdf from "@/app/redact-pdf/page";
import * as removeText from "@/app/remove-text-from-pdf/page";
import { SearchPage, searchPageMetadata } from "@/app/search-page";
import { config } from "@/config";
import { lookedFor } from "@/lib/detectors";
import { capLine } from "@/lib/home-text";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { TOOL_PATH } from "@/lib/routes";
import {
  CLOSING_LINE,
  CLOSING_TITLE,
  LOOK_OVER_LINE,
  LOOK_OVER_LINK_TEXT,
  MORE_GUIDES_TITLE,
  otherSearchPages,
  removeTextTermsLine,
  SEARCH_PAGE_TEXT,
  SEARCH_PAGES,
  type SearchPageKind,
} from "@/lib/search-pages";

import { expectNoAxeViolations } from "../../setup/component";
import {
  CLAIM_BANNED_PHRASES,
  MARKETING_BANNED_PHRASES,
  phrasePattern,
} from "../../support/claim-phrases";

const mocks = vi.hoisted(() => ({ billingEnabled: true }));

// Every other value is the real config; whether billing is on is the test's.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get billingEnabled() {
        return mocks.billingEnabled;
      },
    },
  };
});

vi.mock("next/link", () => ({
  default: () => {
    throw new Error("next/link prefetches. A search page's links must be plain.");
  },
}));

afterEach(() => {
  mocks.billingEnabled = true;
});

/** Each page's route module, so a page added to `SEARCH_PAGES` without one fails typecheck. */
const ROUTES: Readonly<Record<SearchPageKind, typeof redactPdf>> = Object.freeze({
  "redact-pdf": redactPdf,
  "remove-text": removeText,
  "black-box": blackBox,
});

/** The answer's parts as rendered: a paragraph's words, or a list's items. */
function renderedParts(kind: SearchPageKind, billingEnabled: boolean): string[][] {
  return SEARCH_PAGE_TEXT[kind].answer.flatMap((part) => {
    switch (part.kind) {
      case "paragraph":
        return [[part.text]];
      case "checks":
        return [[...part.items]];
      case "terms":
        return billingEnabled ? [[removeTextTermsLine(PRO_PLAN.name)]] : [];
    }
  });
}

/** Whether a page's answer holds the terms line's place (AC-8). */
const hasTermsLine = (kind: SearchPageKind) =>
  SEARCH_PAGE_TEXT[kind].answer.some((part) => part.kind === "terms");

/** The page's content, where every claim and every counted idea lives (AC-3). */
function content() {
  return screen.getByTestId("search-page");
}

/**
 * The content's words, each text node apart, since `textContent` runs a
 * heading into the paragraph after it ("uploadYour"), which hides a whole word
 * from the counts and the banned phrases.
 */
function contentText(): string {
  const walker = document.createTreeWalker(content(), NodeFilter.SHOW_TEXT);
  const words: string[] = [];
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    words.push(node.textContent ?? "");
  }
  return words.join(" ").replace(/\s+/g, " ");
}

/** How often a pattern occurs in the page's content. */
function countIn(text: string, pattern: RegExp): number {
  return [...text.matchAll(new RegExp(pattern.source, "gi"))].length;
}

/**
 * The three ideas AC-6 counts, as their words can be written: upload in any
 * form, "in your browser", and removed then marked (in the register's two
 * allowed wordings, row M2).
 */
const UPLOAD = /\bupload(?:s|ed|ing)?\b/;
const IN_YOUR_BROWSER = /\bin\s+your\s+browser\b/;
const REMOVED_THEN_MARKED =
  /\b(?:removed|taken\s+out\s+of\s+the\s+page),\s+then\s+marked\b/;

describe.each(SEARCH_PAGES)("%s", (kind) => {
  const text = SEARCH_PAGE_TEXT[kind];
  const Page = ROUTES[kind].default;

  /** covers: AC-1 */
  it("is prerendered static", () => {
    expect(ROUTES[kind].dynamic).toBe("force-static");
  });

  /** covers: AC-1, AC-3, AC-4 */
  it("renders inside the shell: the header's Try it free, then main", () => {
    render(<Page />);

    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Try it free" }),
    ).toHaveAttribute("href", TOOL_PATH);
    const main = screen.getByRole("main");
    expect(main).toHaveAttribute("id", "main");
    expect(main).toContainElement(content());
  });

  /** covers: AC-3 */
  it("sets the hero in order: eyebrow, the one h1, lead, the button, the cap line", () => {
    render(<Page />);

    const eyebrow = screen.getByTestId("search-eyebrow");
    const headline = screen.getByRole("heading", { level: 1 });
    const lead = within(content()).getByText(text.lead);
    const [button] = within(content()).getAllByRole("link", { name: text.primary });
    const caps = screen.getByTestId("search-caps");

    expect(eyebrow).toHaveTextContent(text.eyebrow);
    expect(headline).toHaveTextContent(text.headline);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    const order = [eyebrow, headline, lead, button, caps];
    for (let index = 1; index < order.length; index += 1) {
      expect(
        order[index - 1].compareDocumentPosition(order[index]) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
  });

  /**
   * covers: AC-3, as the owner's port of `Guide.dc.html` amends it
   * (2026-11-25): the trio, the answer, More guides, then the closing band,
   * with no skipped level. The cards stand in for the tool's steps.
   */
  it("walks its h2s in the frame's order", () => {
    render(<Page />);

    const others = otherSearchPages(kind);
    expect(
      within(content())
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      ...text.features.map((feature) => feature.title),
      text.answerTitle,
      ...(others.length > 0 ? [MORE_GUIDES_TITLE] : []),
      CLOSING_TITLE,
    ]);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
    // The header and footer hold no heading, so the page's levels are its own.
    expect(within(content()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  /**
   * covers: AC-3, AC-4, as the owner's port of `Guide.dc.html` amends them
   * (2026-11-25). The closing band: its heading and line from the record, and
   * the page's button again, last in the band.
   */
  it("closes on the band: its heading, its line, then the page's button", () => {
    render(<Page />);

    const band = screen
      .getByRole("heading", { level: 2, name: CLOSING_TITLE })
      .closest("section");
    if (band === null) throw new Error("The closing band sits in no section");
    expect(band).toHaveAttribute("data-band", "accent");
    expect(within(band as HTMLElement).getByText(CLOSING_LINE)).toBeInTheDocument();
    const links = within(band as HTMLElement).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual([text.primary]);
    expect(links[0]).toHaveAttribute("href", TOOL_PATH);
  });

  /** covers: AC-4. Both ways into the tool are plain links, the page's own words. */
  it("offers the tool twice as a real page load, named by its primary words", () => {
    render(<Page />);

    const buttons = within(content()).getAllByRole("link", { name: text.primary });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.tagName).toBe("A");
      expect(button).toHaveAttribute("href", TOOL_PATH);
      expect(button).not.toHaveAttribute("target");
    }
  });

  /** covers: AC-3, AC-4. The close links the other search pages, plain, in order. */
  it("links the other search pages under More guides, or holds none while it is alone", () => {
    render(<Page />);

    const others = otherSearchPages(kind);
    if (others.length === 0) {
      expect(screen.queryByRole("heading", { name: MORE_GUIDES_TITLE })).toBeNull();
      return;
    }
    const section = screen
      .getByRole("heading", { level: 2, name: MORE_GUIDES_TITLE })
      .closest("section");
    if (section === null) throw new Error("More guides sits in no section");
    // Each card's name, then its line, a space apart in the link's name.
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(
      others.map(
        (other) =>
          `${SEARCH_PAGE_TEXT[other].navLabel} ${SEARCH_PAGE_TEXT[other].moreLine}`,
      ),
    );
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      others.map((other) => SEARCH_PAGE_TEXT[other].path),
    );
  });

  /** covers: AC-7. The answer ends on the look over sentence, its link to What it can miss. */
  it("ends the answer on the look over line, its link landing on What it can miss", () => {
    render(<Page />);

    const section = screen
      .getByRole("heading", { level: 2, name: text.answerTitle })
      .closest("section");
    if (section === null) throw new Error("The answer sits in no section");
    // The answer's own column: its parts and the figure where there is one;
    // then, after it, the look over line in its warning callout (spec 0026,
    // AC-11).
    const column = section.querySelector("section");
    if (column === null) throw new Error("The answer has no column");
    const children = [...column.children];
    const callout = within(section as HTMLElement).getByTestId("look-over");
    expect(
      column.compareDocumentPosition(callout) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const last = callout.querySelector("p");
    if (last === null) throw new Error("The callout holds no line");
    expect(last.textContent).toBe(`${LOOK_OVER_LINE} ${LOOK_OVER_LINK_TEXT}.`);
    const link = within(last as HTMLElement).getByRole("link", {
      name: LOOK_OVER_LINK_TEXT,
    });
    expect(link).toHaveAttribute("href", "/security#what-it-can-miss");
    expect(link).not.toHaveAttribute("target");
    // Every answer part, in order, before it, then the figure on its page alone.
    const parts = children.filter((child) => child.tagName !== "FIGURE");
    expect(
      parts.map((part) =>
        part.tagName === "OL"
          ? [...part.querySelectorAll("li")].map((item) => item.textContent)
          : [part.textContent],
      ),
    ).toEqual(renderedParts(kind, true));
    const figures = children.filter((child) => child.tagName === "FIGURE");
    expect(figures).toHaveLength(text.figure === null ? 0 : 1);
    if (text.figure !== null) {
      expect(children.indexOf(figures[0])).toBe(children.length - 1);
    }
  });

  /** covers: AC-3, AC-5, AC-13. The figure's words reach assistive technology, its drawings do not. */
  it("draws the figure only where the frame names it, its words in the record", () => {
    render(<Page />);

    const figure = within(content()).queryByRole("figure");
    if (text.figure === null) {
      expect(figure).toBeNull();
      return;
    }
    if (figure === null) throw new Error("The figure is missing");
    expect(figure.querySelector("figcaption")).toHaveTextContent(text.figure.caption);
    for (const panel of text.figure.panels) {
      expect(within(figure).getByText(panel.title)).toBeInTheDocument();
    }
    for (const drawing of within(figure).getAllByTestId("cover-drawing")) {
      expect(drawing).toHaveAttribute("aria-hidden", "true");
    }
  });

  /** covers: AC-8. The terms line names Pro with billing on, on the page whose frame holds it. */
  it("shows the custom terms line with billing on only, where the frame holds it", () => {
    render(<Page />);

    const line = removeTextTermsLine(PRO_PLAN.name);
    expect(contentText().includes(line)).toBe(hasTermsLine(kind));
  });

  it("drops the custom terms line with billing off", () => {
    mocks.billingEnabled = false;
    render(<Page />);

    expect(contentText()).not.toContain(removeTextTermsLine(PRO_PLAN.name));
  });

  /** covers: AC-3. The trio's words are the record's. */
  it("says the trio's words", () => {
    render(<Page />);

    for (const feature of text.features) {
      expect(within(content()).getByText(feature.body)).toBeInTheDocument();
    }
  });

  /** covers: AC-5. No banned phrase in the content, the title or the description. */
  it.each([...CLAIM_BANNED_PHRASES, ...MARKETING_BANNED_PHRASES])(
    "never says %s",
    (phrase) => {
      render(<Page />);

      for (const words of [contentText(), text.title, text.description]) {
        expect(words).not.toMatch(phrasePattern(phrase));
      }
    },
  );

  /** covers: AC-6. Each idea once, in the element the frame names for it. */
  it("says upload once, in your browser at most once, and removed then marked once", () => {
    render(<Page />);

    const words = contentText();
    expect(countIn(words, UPLOAD)).toBe(1);
    expect(countIn(words, IN_YOUR_BROWSER)).toBeLessThanOrEqual(1);
    expect(countIn(words, REMOVED_THEN_MARKED)).toBe(1);
    // The lead carries none of the three (*Page frames*).
    for (const idea of [UPLOAD, IN_YOUR_BROWSER, REMOVED_THEN_MARKED]) {
      expect(countIn(text.lead, idea)).toBe(0);
    }
  });

  /** covers: AC-8. The cap line from config, both plans with billing on. */
  it("shows the cap line from config, naming both plans with billing on", () => {
    render(<Page />);

    expect(screen.getByTestId("search-caps")).toHaveTextContent(
      capLine(true, config.freePageCap, config.maxPages),
    );
  });

  /** covers: AC-8. With billing off, the one cap and no plan anywhere. */
  it("names one cap and no plan with billing off", () => {
    mocks.billingEnabled = false;
    render(<Page />);

    expect(screen.getByTestId("search-caps")).toHaveTextContent(
      capLine(false, config.freePageCap, config.maxPages),
    );
    for (const plan of [FREE_PLAN.name, PRO_PLAN.name]) {
      expect(contentText()).not.toMatch(new RegExp(`\\b${plan}\\b`));
    }
  });

  /** covers: AC-8. With billing on, no sentence but the cap line and the terms line names a plan. */
  it("names a plan nowhere but the cap line and the terms line with billing on", () => {
    render(<Page />);

    const caps = screen.getByTestId("search-caps").textContent ?? "";
    const rest = contentText()
      .replace(caps, "")
      .replace(removeTextTermsLine(PRO_PLAN.name), "");
    for (const plan of [FREE_PLAN.name, PRO_PLAN.name]) {
      expect(rest).not.toMatch(new RegExp(`\\b${plan}\\b`));
    }
  });

  /** covers: AC-2. The head's words, each from the record. */
  it("exports its head: title, description, canonical, Open Graph and the large card", () => {
    expect(ROUTES[kind].metadata).toEqual(searchPageMetadata(kind));
    expect(searchPageMetadata(kind)).toEqual({
      title: text.title,
      description: text.description,
      alternates: { canonical: text.path },
      openGraph: {
        title: text.title,
        description: text.description,
        url: text.path,
        type: "website",
        siteName: LEGAL.tradingName,
      },
      twitter: {
        card: "summary_large_image",
        title: text.title,
        description: text.description,
      },
    });
  });

  /** covers: AC-13, in jsdom: no colour and no layout, so those rules are the browser's. */
  it("has no axe violations", async () => {
    const { container } = render(<Page />);

    await expectNoAxeViolations(container);
  });
});

/**
 * covers: AC-6. `/black-box-redaction` says each G1 risk once, as a risk: the
 * trio's titles carry them, and the checks and the lead name neither again.
 */
describe("black-box's risks", () => {
  const COPY_RISK = /\bcopy\s+and\s+paste\s+can\b/;
  const SEARCH_RISK = /\bsearch\s+can\b/;
  // The other pages' way of saying both risks at once.
  const BOTH_RISKS = /\bcan\s+still\s+be\s+copied\s+or\s+found\b/;

  it("says copy and paste can reveal it once, and search can find it once", () => {
    render(<blackBox.default />);

    const words = contentText();
    expect(countIn(words, COPY_RISK)).toBe(1);
    expect(countIn(words, SEARCH_RISK)).toBe(1);
    expect(countIn(words, BOTH_RISKS)).toBe(0);
  });

  it("keeps both risks out of the lead", () => {
    const { lead } = SEARCH_PAGE_TEXT["black-box"];

    for (const risk of [COPY_RISK, SEARCH_RISK, BOTH_RISKS]) {
      expect(countIn(lead, risk)).toBe(0);
    }
  });
});

describe("otherSearchPages", () => {
  /** covers: AC-3. The close links every other page, in footer order, never itself. */
  it.each(SEARCH_PAGES)("%s: lists every other page in SEARCH_PAGES order", (kind) => {
    expect(otherSearchPages(kind)).toEqual(
      SEARCH_PAGES.filter((other) => other !== kind),
    );
  });

  it("returns a frozen list", () => {
    expect(Object.isFrozen(otherSearchPages("redact-pdf"))).toBe(true);
  });
});

describe("the records", () => {
  /**
   * covers: AC-3, row M4 (verify step 21). A lead that says what RedactNest
   * looks for names exactly the detectors that exist, as the tool's coverage
   * note does, so a detector added or dropped changes the page with it.
   */
  it("name the detectors through lookedFor wherever a lead says what RedactNest looks for", () => {
    const naming = SEARCH_PAGES.filter((kind) =>
      SEARCH_PAGE_TEXT[kind].lead.includes("looks for"),
    );

    expect(naming).toEqual(["redact-pdf", "remove-text"]);
    for (const kind of naming) {
      expect(SEARCH_PAGE_TEXT[kind].lead).toContain(
        `looks for ${lookedFor("conjunction")} in your PDF`,
      );
    }
  });

  /** covers: AC-1. Each record's path is the route folder that serves it. */
  it.each(SEARCH_PAGES)("%s: its path has a page under src/app", (kind) => {
    const { path } = SEARCH_PAGE_TEXT[kind];

    expect(path).toMatch(/^\/[a-z-]+$/);
    expect(existsSync(join(process.cwd(), "src/app", path, "page.tsx"))).toBe(true);
  });

  /** covers: AC-3, AC-9. No two pages share a path, title, nav label, eyebrow or headline. */
  it("give each page its own path, title, nav label, eyebrow and headline", () => {
    for (const field of ["path", "title", "navLabel", "eyebrow", "headline"] as const) {
      const values = SEARCH_PAGES.map((kind) => SEARCH_PAGE_TEXT[kind][field]);
      expect(new Set(values).size).toBe(SEARCH_PAGES.length);
    }
  });

  /** covers: AC-16. The card's alt text is the eyebrow and the headline. */
  it.each(SEARCH_PAGES)(
    "%s: socialAlt reads RedactNest, the eyebrow, the headline",
    (kind) => {
      const { eyebrow, headline, socialAlt } = SEARCH_PAGE_TEXT[kind];

      expect(socialAlt).toBe(`RedactNest. ${eyebrow}. ${headline}.`);
    },
  );

  /** covers: AC-3, AC-8. The frame puts the terms line and the figure on one page each. */
  it("hold the terms line on remove-text alone and the figure on black-box alone", () => {
    expect(SEARCH_PAGES.filter(hasTermsLine)).toEqual(["remove-text"]);
    expect(SEARCH_PAGES.filter((kind) => SEARCH_PAGE_TEXT[kind].figure !== null)).toEqual(
      ["black-box"],
    );
  });

  it("are frozen", () => {
    expect(Object.isFrozen(SEARCH_PAGES)).toBe(true);
    expect(Object.isFrozen(SEARCH_PAGE_TEXT)).toBe(true);
    for (const kind of SEARCH_PAGES) {
      expect(Object.isFrozen(SEARCH_PAGE_TEXT[kind])).toBe(true);
    }
  });

  it("render through one template", () => {
    for (const kind of SEARCH_PAGES) {
      const { unmount } = render(<SearchPage kind={kind} />);
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        SEARCH_PAGE_TEXT[kind].headline,
      );
      unmount();
    }
  });
});
