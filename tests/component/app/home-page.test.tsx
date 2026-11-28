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
  closingLine,
  findsItems,
  HOME_TEXT,
  NETWORK_ROWS,
  strippedItems,
} from "@/lib/home-text";
import { DETECTOR_LABELS } from "@/lib/detectors";
import { DROP_TEXT, FOUND_ITEMS_TITLE, LOCK_LINE, redactLabel } from "@/lib/flow-text";
import { LEGAL } from "@/lib/legal";
import { FREE_PLAN, PLAN_BADGE, PRO_PLAN } from "@/lib/plans";
import { PRICING_PATH, TOOL_PATH } from "@/lib/routes";

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
      // The marketing brief of 2026-11-28, item 4: Who it's for, after the trust strip.
      HOME_TEXT.whoFor.title,
      HOME_TEXT.steps.title,
      HOME_TEXT.blackBox.title,
      // Item 5: the network band straight after the black box section.
      HOME_TEXT.network.title,
      HOME_TEXT.band.title,
      HOME_TEXT.pricing.title,
      HOME_TEXT.questions.title,
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

  /**
   * The marketing brief of 2026-11-28, item 4: Who it's for, straight after
   * the trust strip, its four cards in How it works' card style, each
   * `withPro` sentence only with billing on, and the line under them linking
   * to the security page's What it can miss.
   */
  it("shows Who it's for after the trust strip, its Pro sentences only with billing on", () => {
    const { unmount } = render(<HomePage />);

    const section = screen.getByTestId("home-who-for");
    expect(section).toBe(screen.getByRole("region", { name: HOME_TEXT.whoFor.title }));
    expect(
      screen.getByTestId("home-trust").compareDocumentPosition(section) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      section.compareDocumentPosition(screen.getByTestId("home-steps")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(section).getByText(HOME_TEXT.whoFor.eyebrow)).toBeInTheDocument();
    const cards = within(section).getAllByRole("listitem");
    expect(cards).toHaveLength(4);
    for (const [index, { title, body, withPro }] of HOME_TEXT.whoFor.items.entries()) {
      const card = cards[index] as HTMLElement;
      expect(card).toHaveClass(
        "rounded-panel",
        "border-border",
        "bg-surface",
        "shadow-card",
      );
      expect(within(card).getByRole("heading", { level: 3 })).toHaveTextContent(title);
      expect(card).toHaveTextContent(withPro === undefined ? body : `${body} ${withPro}`);
    }
    const limits = screen.getByTestId("home-who-for-limits");
    expect(limits).toHaveTextContent(
      `${HOME_TEXT.whoFor.limits.before}${HOME_TEXT.whoFor.limits.link}${HOME_TEXT.whoFor.limits.after}`,
    );
    const link = within(limits).getByRole("link", { name: HOME_TEXT.whoFor.limits.link });
    expect(link).toHaveAttribute("href", "/security#what-it-can-miss");
    expect(link).toHaveClass("underline");
    unmount();

    mocks.billingEnabled = false;
    render(<HomePage />);
    const off = screen.getByTestId("home-who-for");
    expect(off).not.toHaveTextContent(/\bPro\b/);
    for (const { body } of HOME_TEXT.whoFor.items) {
      expect(within(off).getByText(body)).toBeInTheDocument();
    }
  });

  /**
   * The marketing brief of 2026-11-28, item 5: the trust strip keeps its four
   * items, and the open source one is a link to the security page's Check it
   * yourself, underlined and at least 24 pixels tall (WCAG 2.5.8).
   */
  it("keeps four trust items and links the open source one to the security page", () => {
    render(<HomePage />);

    const strip = within(screen.getByTestId("home-trust"));
    expect(strip.getAllByRole("listitem")).toHaveLength(4);
    const links = strip.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName("Open source (AGPL), so you can check it");
    expect(links[0]).toHaveAttribute("href", "/security#check-it");
    expect(links[0]).toHaveClass("underline", "min-h-6");
  });

  /**
   * Spec 0026, AC-10, as the owner's port of `Main.dc.html` amends it: the
   * summary cards, each its price large, Pro's "Get Pro" a plain link to
   * Pricing, where the seller, tax and terms lines stay. None with billing off.
   */
  it("shows the two plans with billing on, Get Pro a plain link to Pricing, and none with billing off", () => {
    const { unmount } = render(<HomePage />);

    const pricing = within(screen.getByTestId("home-pricing"));
    expect(
      pricing.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent),
    ).toEqual([FREE_PLAN.name, PRO_PLAN.name]);
    expect(pricing.getByText(PLAN_BADGE)).toBeInTheDocument();
    expect(pricing.getByText(FREE_PLAN.price)).toBeInTheDocument();
    expect(pricing.getByText(PRO_PLAN.price, { exact: false })).toHaveTextContent(
      `${PRO_PLAN.price} ${PRO_PLAN.per}`,
    );
    expect(pricing.getByText(planLines().proSummary)).toBeInTheDocument();
    const getPro = pricing.getByRole("link", { name: HOME_TEXT.pricing.getPro });
    expect(getPro).toHaveAttribute("href", PRICING_PATH);
    expect(getPro.tagName).toBe("A");
    expect(pricing.queryByRole("link", { name: "Subscribe" })).not.toBeInTheDocument();
    expect(pricing.queryByText(LEGAL.merchantLine)).not.toBeInTheDocument();
    expect(pricing.queryByText(LEGAL.taxLine)).not.toBeInTheDocument();
    unmount();

    mocks.billingEnabled = false;
    render(<HomePage />);
    expect(screen.queryByTestId("home-pricing")).not.toBeInTheDocument();
  });

  /**
   * Spec 0026, AC-9, as the port amends it: the network band's table lists
   * every row with the paths it stands for, in the monospace stack the owner
   * allowed there, the last row the visitor's file with none, and links to the
   * security page's way to check. `network-list.spec.ts` holds the paths.
   */
  it("lists what the tool page fetches on the night band, each row with its paths", () => {
    render(<HomePage />);

    const band = screen.getByTestId("home-network");
    expect(band).toHaveAttribute("data-band", "night");
    expect(band).toHaveClass("bg-night");
    const list = within(band).getByRole("list", { name: HOME_TEXT.network.listLabel });
    expect(list.closest("[data-mono]")).toHaveClass("font-mono", "bg-night-raised");
    const rows = within(band).getAllByTestId("network-row");
    expect(rows.map((row) => row.getAttribute("data-paths"))).toEqual(
      NETWORK_ROWS.map(({ paths }) => paths.join(" ")),
    );
    for (const [index, row] of rows.entries()) {
      const { label, paths } = NETWORK_ROWS[index] ?? { label: "", paths: [] };
      expect(row).toHaveTextContent(label);
      // Each path whole, joined by commas; it breaks only after a slash.
      if (paths.length > 0) expect(row).toHaveTextContent(paths.join(", "));
    }
    expect(rows.at(-1)).toHaveAttribute("data-paths", "");
    expect(rows.at(-1)).toHaveTextContent("Your PDF");
    expect(rows.at(-1)).toHaveClass("text-night-accent");
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
   * The owner's port of `Main.dc.html` (2026-11-25): each card its title and
   * subtitle, its items as chips (which replace the tiles), then its note, in
   * that order in the page.
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
    "opens %s on its title and subtitle, lists its chips, and closes on its note",
    (id, title, subtitle, line) => {
      render(<HomePage />);

      const card = screen.getByTestId(id);
      expect(card).toHaveClass("rounded-panel", "p-7", "bg-surface", "border-border");
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
      expect(sub).toHaveClass("text-small", "text-ink-subtle");
      expect(close).toHaveClass("text-small", "text-ink-subtle");
    },
  );

  it("lists every detector in the Finds card as a chip, then Pro's own terms with billing on", () => {
    const { unmount } = render(<HomePage />);

    const list = within(screen.getByTestId("home-finds")).getByRole("list");
    expect(list).toHaveAttribute("role", "list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      ...findsItems().map(({ label }) => label),
      HOME_TEXT.band.finds.termsChip,
    ]);
    for (const item of items.slice(0, -1)) {
      expect(item).toHaveClass("rounded-full", "bg-muted", "text-ink");
    }
    expect(items.at(-1)).toHaveClass("bg-accent-faint", "text-accent-strong");
    unmount();

    mocks.billingEnabled = false;
    render(<HomePage />);
    const off = within(within(screen.getByTestId("home-finds")).getByRole("list"))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(off).toEqual(findsItems().map(({ label }) => label));
  });

  it("lists every claimed kind in the Strips card as a chip, as the Finds card's are", () => {
    render(<HomePage />);

    const list = within(screen.getByTestId("home-strips")).getByRole("list");
    const items = within(list).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([...strippedItems()]);
    const findsRow = within(
      within(screen.getByTestId("home-finds")).getByRole("list"),
    ).getAllByRole("listitem")[0];
    for (const item of items) expect(item.className).toBe(findsRow?.className);
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

  /**
   * The questions (the owner's port, 2026-11-25): the browser's own
   * disclosures, the first open, Pro's line only with billing on.
   */
  it("asks its questions as disclosures, the first open, Pro's line only with billing on", () => {
    const { unmount } = render(<HomePage />);

    const section = screen.getByTestId("home-questions");
    const details = [...section.querySelectorAll("details")];
    expect(details.map((item) => item.querySelector("summary")?.textContent)).toEqual(
      HOME_TEXT.questions.items.map(({ question }) => question),
    );
    expect(details.map((item) => item.open)).toEqual([true, false, false, false]);
    const names = HOME_TEXT.questions.items[1];
    expect(details[1]).toHaveTextContent(`${names?.answer} ${names?.withPro}`);
    unmount();

    mocks.billingEnabled = false;
    render(<HomePage />);
    const off = screen.getByTestId("home-questions").querySelectorAll("details")[1];
    expect(off?.querySelector("p")?.textContent).toBe(names?.answer);
  });

  /** The closing card: its line with the free cap, the hero's own button, white. */
  it("closes on the accent card, its caps line and the hero's way into the tool", () => {
    render(<HomePage />);

    const card = screen.getByTestId("home-closing");
    expect(card).toHaveAttribute("data-band", "accent");
    expect(card).toHaveClass("bg-accent", "rounded-band");
    expect(card).toHaveTextContent(closingLine(true, config.freePageCap));
    const button = within(card).getByRole("link", { name: HOME_TEXT.primary });
    expect(button).toHaveAttribute("href", TOOL_PATH);
    expect(button).toHaveClass("bg-surface", "text-accent");
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
      // Who it's for (the marketing brief of 2026-11-28, item 4). The line
      // under the cards is one run of text around its link.
      HOME_TEXT.whoFor.eyebrow,
      HOME_TEXT.whoFor.title,
      ...HOME_TEXT.whoFor.items.flatMap(({ title, body, withPro }) => [
        title,
        body,
        ...(withPro !== undefined && billingEnabled ? [withPro] : []),
      ]),
      `${HOME_TEXT.whoFor.limits.before}${HOME_TEXT.whoFor.limits.link}${HOME_TEXT.whoFor.limits.after}`,
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
      steps.lead,
      ...steps.drawing.rows.flatMap(({ value, page }) => [value, page]),
      DROP_TEXT.title,
      steps.drawing.badge,
      steps.drawing.file,
      steps.drawing.fileNote,
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
      closingLine(billingEnabled, config.freePageCap),
      HOME_TEXT.questions.title,
      ...HOME_TEXT.questions.items.flatMap(({ question, answer, withPro }) => [
        question,
        answer,
        ...(withPro !== undefined && billingEnabled ? [withPro] : []),
      ]),
      HOME_TEXT.network.eyebrow,
      HOME_TEXT.network.title,
      HOME_TEXT.network.body,
      HOME_TEXT.network.link,
      HOME_TEXT.network.columns.name,
      HOME_TEXT.network.columns.path,
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
            FREE_PLAN.price,
            PRO_PLAN.price,
            PRO_PLAN.per,
            ...planLines().free,
            planLines().proSummary,
            NAV_TEXT.tryFree,
            HOME_TEXT.pricing.getPro,
            band.finds.termsChip,
          ]
        : []),
      band.eyebrow,
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
 * AC-13, as spec 0024's AC-11 amends it: the page exports the site line as
 * its description and a canonical to the root. Its own title is absolute (the
 * marketing brief of 2026-11-28, item 1), so the layout's default stays.
 */
describe("the home page's metadata (AC-13; spec 0024, AC-11)", () => {
  it("exports its own absolute title, the site line and a canonical to the root", () => {
    expect(Object.keys(homePage).sort()).toEqual(["default", "metadata"]);
    expect(homePage.metadata).toEqual({
      title: { absolute: "PDF redaction that removes the text · RedactNest" },
      description: HOME_TEXT.siteLine,
      alternates: { canonical: "/" },
    });
  });

  /**
   * Spec 0024, AC-11, as the marketing brief of 2026-11-28 (item 3) widens
   * it: one data block, a `@graph` of the `WebSite` and the
   * `SoftwareApplication`, every cap from `config` and Pro's price from
   * `PRO_PLAN`'s amount and currency.
   */
  it("carries one @graph block the browser never runs, with both offers", () => {
    const { container } = render(<HomePage />);

    const scripts = container.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toHaveAttribute("type", "application/ld+json");
    const home = `${config.siteUrl}/`;
    expect(JSON.parse(scripts[0].textContent ?? "")).toEqual({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebSite", "@id": `${home}#website`, name: "RedactNest", url: home },
        {
          "@type": "SoftwareApplication",
          "@id": `${home}#app`,
          name: "RedactNest",
          url: home,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web browser",
          description: HOME_TEXT.siteLine,
          license: "https://www.gnu.org/licenses/agpl-3.0.html",
          offers: [
            {
              "@type": "Offer",
              name: "Free",
              price: "0",
              priceCurrency: "USD",
              description: `Up to ${config.freePageCap} pages per document`,
              url: `${config.siteUrl}/tool`,
            },
            {
              "@type": "Offer",
              name: "Pro",
              price: "19",
              priceCurrency: "USD",
              description: `Up to ${config.maxPages} pages per document, plus up to ${config.maxCustomTerms} custom terms`,
              url: `${config.siteUrl}/pricing`,
              priceSpecification: {
                "@type": "UnitPriceSpecification",
                price: "19",
                priceCurrency: "USD",
                billingDuration: "P1M",
                unitCode: "MON",
              },
            },
          ],
        },
      ],
    });
    expect(scripts[0].textContent).not.toContain("<");
  });

  it("takes each offer's caps from config", () => {
    mocks.caps = { free: 7, paid: 90 };
    const { container } = render(<HomePage />);

    const text = container.querySelector("script")?.textContent ?? "";
    expect(text).toContain('"description":"Up to 7 pages per document"');
    expect(text).toContain('"description":"Up to 90 pages per document, plus up to');
  });

  /** Spec 0012, AC-23: with billing off there is no Pro to offer. */
  it("offers Free alone with billing off", () => {
    mocks.billingEnabled = false;
    const { container } = render(<HomePage />);

    const data = JSON.parse(container.querySelector("script")?.textContent ?? "") as {
      "@graph": [unknown, { offers: { name: string }[] }];
    };
    expect(data["@graph"][1].offers.map(({ name }) => name)).toEqual(["Free"]);
    expect(container.querySelector("script")?.textContent).not.toContain("Pro");
  });

  /** Spec 0013, INV-1: nothing implies a user base. */
  it("carries no rating, review or count", () => {
    const { container } = render(<HomePage />);

    // Schema.org's own keys, so "operatingSystem" is not read as a rating.
    expect(container.querySelector("script")?.textContent).not.toMatch(
      /aggregateRating|ratingValue|ratingCount|"review"|reviewCount|interactionStatistic|userInteractionCount/,
    );
  });
});
