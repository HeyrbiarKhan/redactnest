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

import * as homePage from "@/app/page";
import HomePage from "@/app/page";
import { planLines } from "@/app/pricing-cards";
import { NAV_TEXT } from "@/app/site-nav";
import { config } from "@/config";
import {
  capLine,
  findsItems,
  HOME_TEXT,
  NETWORK_ROWS,
  strippedItems,
} from "@/lib/home-text";
import { DETECTOR_LABELS } from "@/lib/detectors";
import { FOUND_ITEMS_TITLE, LOCK_LINE, redactLabel } from "@/lib/flow-text";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PLAN_BADGE, PRO_PLAN } from "@/lib/plans";
import { SUBSCRIBE_PATH, TOOL_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

const mocks = vi.hoisted(() => ({
  billingEnabled: true,
  caps: null as { readonly free: number; readonly paid: number } | null,
}));

// Every other value is the real config; whether billing is on is the test's,
// and so are the caps when a test sets them.
vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return {
    ...actual,
    config: {
      ...actual.config,
      get billingEnabled() {
        return mocks.billingEnabled;
      },
      get freePageCap() {
        return mocks.caps?.free ?? actual.config.freePageCap;
      },
      get maxPages() {
        return mocks.caps?.paid ?? actual.config.maxPages;
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
  mocks.caps = null;
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
    expect(headline).toHaveTextContent(HOME_TEXT.headline);
    // The mockup's 60 pixel headline from `lg` (`Main.dc.html`).
    expect(headline).toHaveClass("text-hero");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(
      eyebrow.compareDocumentPosition(headline) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(main().getByText(HOME_TEXT.lead)).toHaveClass("text-intro", "text-ink-muted");
  });

  /**
   * Spec 0026, AC-8: the hero's way into the tool and its way to How it
   * works, both plain links; the closing band repeats the hero's own button.
   */
  it("offers the tool as a real page load, and How it works beside it", () => {
    render(<HomePage />);

    const primaries = main().getAllByRole("link", { name: "Remove text from a PDF" });
    expect(primaries).toHaveLength(2);
    for (const primary of primaries) {
      expect(primary).toHaveAttribute("href", TOOL_PATH);
      expect(primary.tagName).toBe("A");
    }
    // The header's button names it another way, so the page says it once
    // (AC-30), apart from the Free card's own (spec 0026, AC-10).
    const tryFree = main().getAllByRole("link", { name: "Try it free" });
    expect(tryFree).toHaveLength(1);
    expect(screen.getByTestId("pricing-cards")).toContainElement(tryFree[0] ?? null);
    const how = main().getByRole("link", { name: "See how it works" });
    expect(how).toHaveAttribute("href", "#how-it-works");
    expect(screen.getByTestId("home-steps")).toHaveAttribute("id", "how-it-works");
    expect(main().queryByRole("link", { name: "See pricing" })).not.toBeInTheDocument();
    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      capLine(true, config.freePageCap, config.maxPages),
    );
  });

  it("names one cap with billing off", () => {
    mocks.billingEnabled = false;
    render(<HomePage />);

    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      `Up to ${config.freePageCap} pages a document.`,
    );
    expect(screen.getByTestId("home-caps")).not.toHaveTextContent(/Free|Pro/);
  });

  /** AC-13 and spec 0003's rule: the caps are read from `config`, never written here. */
  it("takes both caps from config, so the line follows the build's values", () => {
    mocks.caps = { free: 7, paid: 90 };
    render(<HomePage />);

    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      "Free up to 7 pages a document. Pro goes up to 90.",
    );
  });

  it("takes the one cap from config with billing off", () => {
    mocks.billingEnabled = false;
    mocks.caps = { free: 7, paid: 90 };
    render(<HomePage />);

    expect(screen.getByTestId("home-caps")).toHaveTextContent(
      "Up to 7 pages a document.",
    );
  });
});

/**
 * The hero's product window, drawn in HTML in place of the screenshot (the
 * owner's port of `Main.dc.html`, 2026-11-25): one picture to assistive
 * technology, named by `shotAlt`, drawn in the tool's own words.
 */
describe("the product window (AC-12, as the port amends it)", () => {
  it("is one picture named by its alt text, with no image file behind it", () => {
    render(<HomePage />);

    const shot = screen.getByRole("img", { name: HOME_TEXT.shotAlt });
    expect(shot).toBe(screen.getByTestId("home-window"));
    expect(shot.tagName).toBe("DIV");
    expect(screen.getByRole("main").querySelector("img")).toBeNull();
  });

  it("draws the tool's own words, from the records the tool reads", () => {
    render(<HomePage />);

    const shot = screen.getByTestId("home-window");
    const ticked = HOME_TEXT.window.groups
      .filter(({ ticked: on }) => on)
      .reduce((sum, { count }) => sum + count, 0);
    expect(shot).toHaveTextContent(FOUND_ITEMS_TITLE);
    expect(shot).toHaveTextContent(redactLabel(ticked));
    expect(shot).toHaveTextContent(LOCK_LINE);
    for (const { kind } of HOME_TEXT.window.groups) {
      expect(shot).toHaveTextContent(DETECTOR_LABELS[kind].label);
    }
  });

  it("hangs the card titled Checked before you download off its corner", () => {
    render(<HomePage />);

    const card = screen.getByTestId("home-shot-card");
    expect(card).toHaveTextContent(
      `${HOME_TEXT.shotCard.title}${HOME_TEXT.shotCard.line}`,
    );
    expect(card).toHaveClass("lg:absolute", "shadow-popover");
  });
});

describe("the sections and the band (spec 0026, AC-8; spec 0013, AC-11)", () => {
  it("heads each section in AC-8's order, and lists How it works as three steps", () => {
    render(<HomePage />);

    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual([
      HOME_TEXT.steps.title,
      HOME_TEXT.blackBox.title,
      HOME_TEXT.band.title,
      HOME_TEXT.network.title,
      HOME_TEXT.pricing.title,
      HOME_TEXT.closing,
    ]);
    const steps = within(screen.getByTestId("home-steps")).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    for (const [index, step] of HOME_TEXT.steps.items.entries()) {
      expect(
        within(steps[index] as HTMLElement).getByRole("heading", { level: 3 }),
      ).toHaveTextContent(step.title);
      expect(main().getByText(step.body)).toBeInTheDocument();
    }
  });

  /** Spec 0026, AC-10: the same cards as `/pricing`, only with billing on. */
  it("shows the two plans with billing on, Subscribe a plain link, and none with billing off", () => {
    const { unmount } = render(<HomePage />);

    const pricing = within(screen.getByTestId("home-pricing"));
    expect(
      pricing.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([FREE_PLAN.name, PRO_PLAN.name]);
    expect(pricing.getByText(PLAN_BADGE)).toBeInTheDocument();
    expect(pricing.getByText(PRO_PLAN.priceLine)).toBeInTheDocument();
    const subscribe = pricing.getByRole("link", { name: "Subscribe" });
    expect(subscribe).toHaveAttribute("href", SUBSCRIBE_PATH);
    expect(subscribe.tagName).toBe("A");
    unmount();

    mocks.billingEnabled = false;
    render(<HomePage />);
    expect(screen.queryByTestId("home-pricing")).not.toBeInTheDocument();
  });

  /**
   * Spec 0026, AC-9: the network band lists every row with the paths it
   * stands for, the last row the visitor's file with none, and links to the
   * security page's way to check. `network-list.spec.ts` holds the paths.
   */
  it("lists what the tool page fetches on the night band, each row with its paths", () => {
    render(<HomePage />);

    const band = screen.getByTestId("home-network");
    expect(band).toHaveAttribute("data-band", "night");
    expect(band).toHaveClass("bg-night");
    const rows = within(band).getAllByTestId("network-row");
    expect(rows.map((row) => row.getAttribute("data-paths"))).toEqual(
      NETWORK_ROWS.map(({ paths }) => paths.join(" ")),
    );
    expect(rows.at(-1)).toHaveAttribute("data-paths", "");
    expect(rows.at(-1)).toHaveTextContent("Your PDF");
    expect(
      within(band).getByRole("link", { name: HOME_TEXT.network.link }),
    ).toHaveAttribute("href", "/security#check-it");
  });

  it("compares a drawn box with RedactNest's removal, and links to how the check works", () => {
    render(<HomePage />);

    const section = within(screen.getByTestId("home-black-box"));
    expect(section.getByText(HOME_TEXT.blackBox.eyebrow)).toBeInTheDocument();
    expect(section.getByText("Contact: jane.doe@example.com")).toBeInTheDocument();
    expect(section.getByRole("link", { name: HOME_TEXT.blackBox.link })).toHaveAttribute(
      "href",
      "/security#the-check",
    );
  });

  /**
   * Spec 0019, AC-12: the band is labelled by its heading, so its accessible
   * name is "What RedactNest looks for and strips", and its first card is
   * titled "Looks for", since "finds" as a heading claims every value is found.
   */
  it("says what RedactNest looks for and strips, as two cards with their headings", () => {
    render(<HomePage />);

    const band = screen.getByRole("region", {
      name: "What RedactNest looks for and strips",
    });
    expect(band).toBe(screen.getByRole("region", { name: HOME_TEXT.band.title }));
    expect(
      within(band)
        .getAllByRole("heading", { level: 3 })
        .map((heading) => heading.textContent),
    ).toEqual(["Looks for", "Strips"]);
    // Looks for comes first in the page, so it comes first when the cards stack.
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
      expect(tile).toHaveClass(
        "size-16",
        "rounded-control",
        "bg-accent-soft",
        "text-accent",
      );

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
      expect(item).toHaveClass("border-border", "bg-surface", "rounded-card", "text-ink");
      expect(item).not.toHaveClass("bg-subtle");
      const tile = item.firstElementChild;
      expect(tile).toHaveAttribute("aria-hidden", "true");
      expect(tile).toHaveClass("size-12", "rounded-control", "bg-accent-soft");
      // One icon, the detector's own, and no chevron after the words.
      expect(item.querySelectorAll("svg")).toHaveLength(1);
    }
  });

  /**
   * Spec 0014, AC-12, the pin spec 0013's AC-11 owed: the Finds rows fold into
   * two columns by the card's own width, as Strips does, 12 pixels apart with
   * no rule, and no row splits across the two. jsdom lays nothing out, so the
   * browser test reads the computed columns and this holds the classes.
   */
  it("sets the Finds rows in unruled columns by the card's own width", () => {
    render(<HomePage />);

    const finds = screen.getByTestId("home-finds");
    expect(finds).toHaveClass("@container");
    const list = within(finds).getByRole("list");
    expect(list).toHaveClass("@min-[26rem]:columns-2", "@min-[26rem]:gap-x-3");
    expect(list.className).not.toMatch(/column-rule/u);
    for (const item of within(list).getAllByRole("listitem")) {
      expect(item).toHaveClass("break-inside-avoid");
    }
  });

  /**
   * Feature 26: each claimed kind on the Looks for card's own row, its check
   * on the same square tile, and the list in the same unruled columns, so the
   * two cards read as one pair.
   */
  it("ticks every claimed kind in one Strips list, each on the Looks for card's row", () => {
    render(<HomePage />);

    const strips = screen.getByTestId("home-strips");
    // One list, so a screen reader hears them together.
    const list = within(strips).getByRole("list");
    expect(list).toHaveAttribute("role", "list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([...strippedItems()]);
    // Two columns once the card has room, decided by the card's own width.
    expect(strips).toHaveClass("@container");
    const findsList = within(screen.getByTestId("home-finds")).getByRole("list");
    const findsRow = within(findsList).getAllByRole("listitem")[0];
    expect(list.className).toBe(findsList.className);
    expect(list.className).not.toMatch(/column-rule/u);
    for (const item of items) {
      expect(item.className).toBe(findsRow?.className);
      expect(item.firstElementChild?.className).toBe(
        findsRow?.firstElementChild?.className,
      );
      expect(item.querySelectorAll("svg")).toHaveLength(1);
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
      expect(card).toHaveClass("bg-surface", "border", "border-border", "rounded-card");
    }
  });

  /**
   * The header icons spec 0013 names, and each Finds row's tile holding its
   * detector's own icon, the checklist's, so a detector added by feature 12
   * brings its icon with it.
   */
  it("heads Finds with ScanSearch and Strips with FileMinus", () => {
    render(<HomePage />);

    for (const [id, icon] of [
      ["home-finds", "lucide-scan-search"],
      ["home-strips", "lucide-file-minus"],
    ] as const) {
      const heading = within(screen.getByTestId(id)).getByRole("heading", { level: 3 });
      const tile = heading.parentElement?.previousElementSibling;
      expect(tile?.querySelector("svg")).toHaveClass(icon);
    }
  });

  it("draws each detector's own icon in its Finds row", () => {
    render(<HomePage />);
    const rows = within(within(screen.getByTestId("home-finds")).getByRole("list"))
      .getAllByRole("listitem")
      .map((row) => row.querySelector("svg"));

    findsItems().forEach(({ icon: Icon }, index) => {
      const { container, unmount } = render(<Icon />);
      const own = [...(container.querySelector("svg")?.classList ?? [])].filter((name) =>
        name.startsWith("lucide-"),
      );
      unmount();

      expect(own).not.toEqual([]);
      expect(rows[index]).toHaveClass(...own);
    });
  });

  it("passes axe", async () => {
    const { container } = render(<HomePage />);

    await expectNoAxeViolations(container);
  });
});

/**
 * AC-13: every word in the main content lives in `src/lib/home-text.ts`. The
 * tests above find each word the page should say; this one proves it says
 * nothing else, so a sentence typed into the page, which no test of
 * `home-text.ts` would ever read, fails here.
 */
describe("the main content's words (AC-13)", () => {
  /** Every word `home-text.ts` gives the page, for the build's billing state. */
  function homeWords(billingEnabled: boolean): string[] {
    const { steps, blackBox, band } = HOME_TEXT;
    return [
      HOME_TEXT.eyebrow,
      HOME_TEXT.headline,
      HOME_TEXT.lead,
      HOME_TEXT.primary,
      HOME_TEXT.howItWorks,
      capLine(billingEnabled, config.freePageCap, config.maxPages),
      HOME_TEXT.shotCard.title,
      HOME_TEXT.shotCard.line,
      ...HOME_TEXT.trust.map(({ text }) => text),
      // The drawn window: its made up values, then the tool's own words.
      HOME_TEXT.window.file,
      HOME_TEXT.window.title,
      ...Object.values(HOME_TEXT.window.lines),
      HOME_TEXT.window.found,
      FOUND_ITEMS_TITLE,
      LOCK_LINE,
      redactLabel(
        HOME_TEXT.window.groups.reduce(
          (sum, { count, ticked }) => sum + (ticked ? count : 0),
          0,
        ),
      ),
      ...HOME_TEXT.window.groups.flatMap(({ kind, count }) => [
        DETECTOR_LABELS[kind].label,
        String(count),
      ]),
      String(HOME_TEXT.window.groups.reduce((sum, { count }) => sum + count, 0)),
      steps.eyebrow,
      steps.title,
      ...steps.drawing.rows.map(({ value }) => value),
      steps.drawing.file,
      ...steps.items.flatMap(({ title, body }, index) => [
        String(index + 1).padStart(2, "0"),
        title,
        body,
      ]),
      blackBox.eyebrow,
      blackBox.title,
      blackBox.body,
      blackBox.link,
      blackBox.caption,
      ...blackBox.panels.flatMap(({ title, lines, readsLabel, reads }) => [
        title,
        ...lines.map(({ text }) => text),
        readsLabel,
        reads,
      ]),
      HOME_TEXT.closing,
      HOME_TEXT.network.eyebrow,
      HOME_TEXT.network.title,
      HOME_TEXT.network.body,
      HOME_TEXT.network.link,
      HOME_TEXT.network.listLabel,
      ...NETWORK_ROWS.flatMap(({ label, what, paths }) => [
        label,
        what,
        paths.join(", "),
      ]),
      ...(billingEnabled
        ? [
            HOME_TEXT.pricing.eyebrow,
            HOME_TEXT.pricing.title,
            FREE_PLAN.name,
            PRO_PLAN.name,
            PLAN_BADGE,
            PRO_PLAN.priceLine,
            ...planLines().free,
            ...planLines().pro,
            NAV_TEXT.tryFree,
            "Subscribe",
            LEGAL.merchantLine,
            LEGAL.taxLine,
            LEGAL.subscribeNotice.beforeTerms,
            LEGAL.termsLabel,
            LEGAL.subscribeNotice.afterTerms,
          ]
        : []),
      band.title,
      band.finds.title,
      band.finds.subtitle,
      band.finds.line,
      ...findsItems().map(({ label }) => label),
      band.strips.title,
      band.strips.subtitle,
      ...strippedItems(),
      band.strips.note,
    ];
  }

  /** What is left of the main content once every word from home-text.ts is taken out. */
  function leftOver(billingEnabled: boolean): string {
    const words = homeWords(billingEnabled).toSorted((a, b) => b.length - a.length);
    return words.reduce(
      (text, word) => text.replaceAll(word, " "),
      screen.getByRole("main").textContent ?? "",
    );
  }

  it.each([true, false])(
    "says nothing home-text.ts does not hold, billing on: %s",
    (on) => {
      mocks.billingEnabled = on;
      render(<HomePage />);

      expect(leftOver(on).trim()).toBe("");
    },
  );
});

/**
 * AC-13, as spec 0024's AC-11 amends it: the page keeps the layout's title,
 * and exports the site line as its description and a canonical to the root.
 */
describe("the home page's metadata (AC-13; spec 0024, AC-11)", () => {
  it("exports the site line and a canonical to the root, and no title", () => {
    expect(Object.keys(homePage).sort()).toEqual(["default", "metadata"]);
    expect(homePage.metadata).toEqual({
      description: HOME_TEXT.siteLine,
      alternates: { canonical: "/" },
    });
  });

  /** Spec 0024, AC-11: one data block, the trading name and the site's address. */
  it("carries one WebSite block the browser never runs", () => {
    const { container } = render(<HomePage />);

    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toHaveAttribute("type", "application/ld+json");
    expect(JSON.parse(scripts[0].textContent ?? "")).toEqual({
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "RedactNest",
      url: config.siteUrl,
    });
    expect(scripts[0].textContent).not.toContain("<");
  });
});
