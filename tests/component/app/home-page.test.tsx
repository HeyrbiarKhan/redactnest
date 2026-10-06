/**
 * The home page. Spec 0013, AC-10 to AC-13 and AC-30.
 *
 * Every word in its main content comes from `src/lib/home-text.ts`, the caps
 * and the billing state from `config`; `tests/unit/home-text.test.ts` holds the
 * words themselves. This checks what the page draws from them, and that every
 * way into the tool is a plain link: `next/link` throws here if the page ever
 * reaches for it.
 */

import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import HomePage from "@/app/page";
import { config } from "@/config";
import { capLine, findsItems, HOME_TEXT, strippedItems } from "@/lib/home-text";
import { PRICING_PATH, TOOL_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

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
    throw new Error("next/link prefetches. The home page's links must be plain.");
  },
}));

afterEach(() => {
  mocks.billingEnabled = true;
});

function main() {
  return within(screen.getByRole("main"));
}

describe("the hero (AC-10)", () => {
  it("says the eyebrow, the one headline and the lead, in that order", () => {
    render(<HomePage />);

    const eyebrow = screen.getByTestId("home-eyebrow");
    const headline = screen.getByRole("heading", { level: 1 });
    expect(eyebrow).toHaveTextContent(HOME_TEXT.eyebrow);
    expect(eyebrow).toHaveClass("eyebrow");
    expect(headline).toHaveTextContent(HOME_TEXT.headline);
    expect(headline).toHaveClass("text-display");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      eyebrow.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(main().getByText(HOME_TEXT.lead)).toHaveClass("text-lead", "text-ink-muted");
  });

  it("offers the tool as a real page load, and pricing beside it with billing on", () => {
    render(<HomePage />);

    const primary = main().getByRole("link", { name: "Remove text from a PDF" });
    expect(primary).toHaveAttribute("href", TOOL_PATH);
    expect(primary.tagName).toBe("A");
    // The header's button names it another way, so the page says it once (AC-30).
    expect(main().queryByRole("link", { name: "Try it free" })).not.toBeInTheDocument();
    const pricing = main().getByRole("link", { name: "See pricing" });
    expect(pricing).toHaveAttribute("href", PRICING_PATH);
    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      capLine(true, config.freePageCap, config.maxPages),
    );
  });

  it("drops See pricing and names one cap with billing off", () => {
    mocks.billingEnabled = false;
    render(<HomePage />);

    expect(main().queryByRole("link", { name: "See pricing" })).not.toBeInTheDocument();
    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      `Up to ${config.freePageCap} pages a document.`,
    );
    expect(screen.getByTestId("home-caps")).not.toHaveTextContent(/Free|Pro/);
  });
});

describe("the product shot (AC-12)", () => {
  it("shows the real capture with its alt text, its size known and loaded first", () => {
    render(<HomePage />);

    const shot = screen.getByRole("img", { name: HOME_TEXT.shotAlt });
    expect(shot).toHaveAttribute("width", "2560");
    expect(shot).toHaveAttribute("height", "1600");
    expect(shot).toHaveAttribute("sizes", "(min-width: 64rem) 40rem, calc(100vw - 2rem)");
    expect(shot).toHaveAttribute("loading", "eager");
    expect(shot).toHaveAttribute("fetchpriority", "high");
    // From our own origin: a path, never another host.
    expect(shot.getAttribute("src")).toMatch(/^\//);
  });
});

describe("the trio and the band (AC-10, AC-11)", () => {
  it("lists the three features, each a heading and its line", () => {
    render(<HomePage />);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      ...HOME_TEXT.features.map((feature) => feature.title),
      HOME_TEXT.band.title,
    ]);
    for (const feature of HOME_TEXT.features) {
      expect(main().getByText(feature.body)).toBeInTheDocument();
    }
  });

  it("says what RedactNest finds and strips, as two cards with their headings", () => {
    render(<HomePage />);

    const band = screen.getByRole("region", { name: HOME_TEXT.band.title });
    expect(
      within(band)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Finds", "Strips"]);
    // Finds comes first in the page, so it comes first when the cards stack.
    const finds = within(band).getByTestId("home-finds");
    const strips = within(band).getByTestId("home-strips");
    expect(
      finds.compareDocumentPosition(strips) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  /**
   * After task 32, each card in your mockup's three parts: the header (its
   * square tile, the `h3` and the subtitle), the list, then the close (a rule,
   * the info icon and the closing line), in that order in the page.
   */
  it.each([
    [
      "home-finds",
      HOME_TEXT.band.finds.title,
      HOME_TEXT.band.finds.subtitle,
      HOME_TEXT.band.finds.line,
    ],
    [
      "home-strips",
      HOME_TEXT.band.strips.title,
      HOME_TEXT.band.strips.subtitle,
      HOME_TEXT.band.strips.note,
    ],
  ] as const)(
    "opens %s on its tile, title and subtitle, and closes it on a rule and its line",
    (id, title, subtitle, line) => {
      render(<HomePage />);

      const card = screen.getByTestId(id);
      expect(card).toHaveClass("p-7", "gap-6");
      const heading = within(card).getByRole("heading", { level: 3, name: title });
      const sub = within(card).getByText(subtitle);
      const list = within(card).getByRole("list");
      const close = within(card).getByText(line);
      for (const [before, after] of [
        [heading, sub],
        [sub, list],
        [list, close],
      ] as const) {
        expect(
          before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
      }
      expect(sub).toHaveClass("text-small", "text-ink-muted");

      // The header's tile: the large square, beside the heading's column.
      const tile = heading.parentElement?.previousElementSibling;
      expect(tile).toHaveAttribute("aria-hidden", "true");
      expect(tile).toHaveClass("size-16", "rounded-xl", "bg-accent-soft", "text-accent");

      // The close: a `border` rule above the info icon and the line.
      expect(close).toHaveClass("text-small", "text-ink-muted");
      const row = close.parentElement;
      expect(row).toHaveClass("border-t", "border-border");
      expect(row?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(row?.querySelector("svg")).toHaveClass("lucide-info", "text-accent");
    },
  );

  it("lists every detector in the Finds card, each a soft row with its icon tile", () => {
    render(<HomePage />);

    const finds = screen.getByTestId("home-finds");
    const list = within(finds).getByRole("list");
    expect(list).toHaveAttribute("role", "list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(
      findsItems().map(({ label }) => label),
    );
    for (const item of items) {
      // `canvas`, not `subtle`, the checklist's hover tint.
      expect(item).toHaveClass("bg-canvas", "rounded-xl", "text-ink");
      expect(item).not.toHaveClass("bg-subtle");
      const tile = item.firstElementChild;
      expect(tile).toHaveAttribute("aria-hidden", "true");
      expect(tile).toHaveClass("size-12", "rounded-xl", "bg-accent-soft");
      // One icon, the detector's own, and no chevron after the words.
      expect(item.querySelectorAll("svg")).toHaveLength(1);
    }
  });

  it("ticks every claimed kind in one Strips list, set in ruled columns", () => {
    render(<HomePage />);

    const strips = screen.getByTestId("home-strips");
    // One list of seven, so a screen reader hears them together.
    const list = within(strips).getByRole("list");
    expect(list).toHaveAttribute("role", "list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([...strippedItems()]);
    // Two columns once the card has room, decided by the card's own width.
    expect(strips).toHaveClass("@container");
    expect(list).toHaveClass("@min-[26rem]:columns-2");
    for (const item of items) {
      expect(item).toHaveClass("break-inside-avoid");
      expect(item.firstElementChild).toHaveClass(
        "size-8",
        "rounded-full",
        "bg-accent-soft",
      );
      expect(item.querySelector("svg")).toHaveClass("lucide-check");
    }
  });

  /** Nothing in the band acts: no chevron, link, button or tab stop. */
  it("puts nothing that acts in the band", () => {
    render(<HomePage />);

    const band = screen.getByTestId("home-band");
    expect(within(band).queryAllByRole("link")).toEqual([]);
    expect(within(band).queryAllByRole("button")).toEqual([]);
    expect(band.querySelectorAll("[tabindex]")).toHaveLength(0);
    expect(band.querySelector(".lucide-chevron-right")).toBeNull();
  });

  it("sets the band on the page's canvas, not a full width white strip", () => {
    render(<HomePage />);

    const band = screen.getByTestId("home-band");
    expect(band).not.toHaveClass("bg-surface");
    // The two cards are the white, each with the quiet edge.
    for (const card of [
      screen.getByTestId("home-finds"),
      screen.getByTestId("home-strips"),
    ]) {
      expect(card).toHaveClass("bg-surface", "border", "border-border", "rounded-xl");
    }
  });

  it("passes axe", async () => {
    const { container } = render(<HomePage />);

    await expectNoAxeViolations(container);
  });
});
