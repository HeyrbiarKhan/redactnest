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

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as redactPdf from "@/app/redact-pdf/page";
import { SearchPage, searchPageMetadata } from "@/app/search-page";
import { config } from "@/config";
import { IDLE_STEPS } from "@/lib/flow-text";
import { capLine } from "@/lib/home-text";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PRO_PLAN } from "@/lib/plans";
import { TOOL_PATH } from "@/lib/routes";
import {
  HOW_IT_WORKS_TITLE,
  LOOK_OVER_LINE,
  LOOK_OVER_LINK_TEXT,
  MORE_GUIDES_TITLE,
  otherSearchPages,
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
});

/** The page's content, where every claim and every counted idea lives (AC-3). */
function content() {
  return screen.getByTestId("search-page");
}

function contentText(): string {
  return (content().textContent ?? "").replace(/\s+/g, " ");
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

  /** covers: AC-3. Trio, How it works, the answer, then More guides, with no skipped level. */
  it("walks its h2s in the frame's order", () => {
    render(<Page />);

    const others = otherSearchPages(kind);
    expect(
      within(content())
        .getAllByRole("heading", { level: 2 })
        .map((heading) => heading.textContent),
    ).toEqual([
      ...text.features.map((feature) => feature.title),
      HOW_IT_WORKS_TITLE,
      text.answerTitle,
      ...(others.length > 0 ? [MORE_GUIDES_TITLE] : []),
    ]);
    expect(screen.queryAllByRole("heading", { level: 4 })).toHaveLength(0);
    // The header and footer hold no heading, so the page's levels are its own.
    expect(within(content()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  /** covers: AC-3. The tool's own steps, from `IDLE_STEPS`. */
  it("lists the tool's own steps under How it works", () => {
    render(<Page />);

    const section = screen
      .getByRole("heading", { level: 2, name: HOW_IT_WORKS_TITLE })
      .closest("section");
    if (section === null) throw new Error("How it works sits in no section");
    expect(
      within(section)
        .getAllByRole("listitem")
        // The drawn number is hidden from assistive technology; the words follow it.
        .map((item) => item.lastElementChild?.textContent),
    ).toEqual([...IDLE_STEPS]);
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
    const links = within(section).getAllByRole("link");
    expect(links.map((link) => link.textContent)).toEqual(
      others.map((other) => SEARCH_PAGE_TEXT[other].navLabel),
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
    const paragraphs = section.querySelectorAll("p");
    const last = paragraphs[paragraphs.length - 1];
    expect(last.textContent).toBe(`${LOOK_OVER_LINE} ${LOOK_OVER_LINK_TEXT}.`);
    const link = within(last).getByRole("link", { name: LOOK_OVER_LINK_TEXT });
    expect(link).toHaveAttribute("href", "/security#what-it-can-miss");
    expect(link).not.toHaveAttribute("target");
    // Every answer part, in order, before it.
    expect(
      [...paragraphs].slice(0, -1).map((paragraph) => paragraph.textContent),
    ).toEqual(text.answer.map((part) => part.text));
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

  /** covers: AC-8. With billing on, no sentence but the cap line names a plan. */
  it("names a plan nowhere but the cap line with billing on", () => {
    render(<Page />);

    const caps = screen.getByTestId("search-caps").textContent ?? "";
    const rest = contentText().replace(caps, "");
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

describe("the records", () => {
  /** covers: AC-16. The card's alt text is the eyebrow and the headline. */
  it.each(SEARCH_PAGES)(
    "%s: socialAlt reads RedactNest, the eyebrow, the headline",
    (kind) => {
      const { eyebrow, headline, socialAlt } = SEARCH_PAGE_TEXT[kind];

      expect(socialAlt).toBe(`RedactNest. ${eyebrow}. ${headline}.`);
    },
  );

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
