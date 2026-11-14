/**
 * The security page, as rendered. Spec 0018 (assumed), AC-1 and AC-3 to AC-9.
 *
 * A plain server component, so it renders here as it does at build. The
 * browser suite (`tests/e2e/legal-pages.spec.ts`) walks it with the legal
 * pages: the shell as served, On this page, axe with styles, the keyboard, 320
 * pixels and 200% text.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SecurityPage, { metadata } from "@/app/security/page";
import { HOME_BAND_ID } from "@/lib/home-text";
import { LEGAL } from "@/lib/legal";
import { formatPolicyDate, lastUpdated, SECURITY_CHANGES } from "@/lib/policy-changes";
import {
  PRIVACY_SECTIONS,
  SECURITY_SECTIONS,
  sectionId,
  TERMS_SECTIONS,
} from "@/lib/policy-sections";
import { TOOL_PATH } from "@/lib/routes";

import { expectNoAxeViolations } from "../../setup/component";

/** The text of `main`, where every claim lives. */
function mainText(): string {
  return (screen.getByRole("main").textContent ?? "").replace(/\s+/g, " ");
}

/** The text of the section under one h2. */
function sectionText(heading: string): string {
  return (
    screen.getByRole("heading", { level: 2, name: heading }).closest("section")
      ?.textContent ?? ""
  ).replace(/\s+/g, " ");
}

/** Every link in `main`'s text, past the On this page list. */
function textLinks(): HTMLAnchorElement[] {
  const nav = screen.getByRole("navigation", { name: "On this page" });
  return within(screen.getByRole("main"))
    .getAllByRole<HTMLAnchorElement>("link")
    .filter((link) => !nav.contains(link));
}

describe("the security page", () => {
  /** covers: AC-1, AC-4 */
  it("has the header, one h1, and its h2 sections word for word, in order", () => {
    render(<SecurityPage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Security");
    expect(
      screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent),
    ).toEqual(Object.values(SECURITY_SECTIONS));
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Try it free" }),
    ).toHaveAttribute("href", TOOL_PATH);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  /** covers: AC-1. Its own title and a one sentence description, indexable. */
  it("sets its own title and description, and no noindex", () => {
    expect(metadata.title).toBe("Security");
    expect(metadata.description).toMatch(/^[^.]+\.$/);
    expect(metadata.robots).toBeUndefined();
  });

  /** covers: AC-3. The legal pages' frame: the date, the list and the changes. */
  it("shows Last updated and ends with its dated change list", () => {
    render(<SecurityPage />);

    const newest = lastUpdated(SECURITY_CHANGES);
    expect(screen.getByTestId("last-updated")).toHaveTextContent(
      `Last updated ${formatPolicyDate(newest)}`,
    );
    const entries = within(screen.getByTestId("changes")).getAllByRole("listitem");
    expect(entries.map((entry) => entry.textContent)).toEqual(
      SECURITY_CHANGES.map(
        (change) => `${formatPolicyDate(change.date)}: ${change.summary}`,
      ),
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-smooth-scroll");
    const links = within(
      screen.getByRole("navigation", { name: "On this page" }),
    ).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      Object.keys(SECURITY_SECTIONS).map((key) => `#${sectionId(key)}`),
    );
  });

  /**
   * covers: AC-6. It links the pages that already say a thing, and every link
   * to another page's section lands on a heading that page has.
   */
  it("links the privacy policy, the terms and the home page, each to a heading that exists", () => {
    render(<SecurityPage />);

    const privacyIds = Object.keys(PRIVACY_SECTIONS).map(sectionId);
    const termsIds = Object.keys(TERMS_SECTIONS).map(sectionId);
    const hrefs = textLinks().map((link) => link.getAttribute("href") ?? "");

    for (const href of hrefs) {
      if (href.startsWith("mailto:")) continue;
      const [path, fragment] = href.split("#");
      if (path === "/privacy") expect(privacyIds, href).toContain(fragment);
      else if (path === "/terms") expect(termsIds, href).toContain(fragment);
      else expect(href).toBe(`/#${HOME_BAND_ID}`);
    }

    // C1 to C5, C10, C14 to C16, the review duty and the finds and strips list.
    expect(new Set(hrefs)).toEqual(
      new Set([
        `/privacy#${sectionId("yourDocuments")}`,
        `/privacy#${sectionId("whatWeReceive")}`,
        `/privacy#${sectionId("countsAndReports")}`,
        `/terms#${sectionId("checkingTheResult")}`,
        `/#${HOME_BAND_ID}`,
        `mailto:${LEGAL.contactEmail}`,
      ]),
    );
  });

  /** covers: AC-8. The drawing sits in Removed, not just covered. */
  it("shows the drawing under Removed, not just covered", () => {
    render(<SecurityPage />);

    const figure = screen.getByRole("figure");
    expect(
      screen
        .getByRole("heading", { level: 2, name: SECURITY_SECTIONS.removedNotCovered })
        .closest("section"),
    ).toContainElement(figure);
    expect(within(figure).getByText("A box drawn over the text")).toBeVisible();
    expect(within(figure).getByText("Removed, then marked")).toBeVisible();
  });

  /**
   * covers: AC-7. The honest limits each spec asks this page to name, pinned
   * by a phrase each, so an edit that drops one fails here.
   */
  it.each([
    // Spec 0002: the two endings, the file handle and what no website controls.
    ["inYourBrowser", "only released for reuse, not wiped"],
    ["inYourBrowser", "keeps a handle to the file you chose"],
    ["inYourBrowser", "swap or page files"],
    // Spec 0004: removed, then marked; the check; the stripped extras.
    ["removedNotCovered", "removed, then marked"],
    ["removedNotCovered", "a change in the engine’s defaults cannot quietly change"],
    ["theCheck", "from the exact bytes you will download"],
    ["hiddenData", "automatic actions that are not scripts"],
    ["hiddenData", "keeps that icon as a mark on the page"],
    ["hiddenData", "the cleaned copy carries no restriction"],
    ["hiddenData", "never which words they made or in what order"],
    // Specs 0005, 0014, 0015 and 0017: the recorded misses.
    ["whatItFinds", "Names and addresses are not among them"],
    ["whatItFinds", "Arabic, Hebrew or Devanagari, written with different vowel marks"],
    [
      "whatItCanMiss",
      "The first three lists are for the details RedactNest finds by itself",
    ],
    ["whatItCanMiss", "so those limits are not its own"],
    ["whatItCanMiss", "split across two blocks of text"],
    ["whatItCanMiss", "in UK or US national format"],
    ["whatItCanMiss", "with month names in English"],
    ["whatItCanMiss", "Smith is not found in SMITHDate"],
    // Specs 0006, 0008 and 0010: pages it cannot read.
    ["pagesItCannotRead", "lean toward saying too much"],
    ["pagesItCannotRead", "three or more letters or digits over that picture alone"],
    ["pagesItCannotRead", "a scan stored as several pieces"],
    ["pagesItCannotRead", "keeps its hidden part"],
    ["pagesItCannotRead", "Text a clip hides completely stays in the file"],
    // Spec 0004: refusals; specs 0001, 0012 and 0017: the honesty based cap.
    ["whenItStops", "your ticks are kept"],
    ["plans", "The page limit relies on honesty"],
    ["plans", "Pro gives you longer documents and custom terms, not a lock"],
    // Spec 0002, *Security model*, as the counts allow; spec 0004, AC-24; C8.
    ["logsAndCounts", "nothing records your documents or the words anyone redacted"],
    ["logsAndCounts", "Our own code writes no log"],
  ] as const)("names in %s: %s", (section, phrase) => {
    render(<SecurityPage />);

    expect(sectionText(SECURITY_SECTIONS[section])).toContain(phrase);
  });

  /**
   * covers: AC-5. Words that once claimed more than the code or Pricing
   * supports: Pro promises no support, the counts do record removals by kind,
   * and spelling out the engine's settings guards only against changed
   * defaults.
   */
  it("claims no support, no unrecorded redactions and no upgrade proofing", () => {
    render(<SecurityPage />);
    const text = mainText();

    expect(text).not.toMatch(/support/i);
    expect(text).not.toContain("what anyone redacted");
    expect(text).not.toContain("engine upgrade");
  });

  /** covers: AC-9. No cap, size or price as a number, and no repository. */
  it("states no cap as a number and never mentions the repository", () => {
    render(<SecurityPage />);
    const text = mainText();

    expect(text).not.toMatch(/repositor|github|commit/i);
    expect(text).not.toMatch(/\d[\d,.]*\s*(pages?|MB|megabytes?)\b/i);
    expect(text).not.toMatch(/\b(pages?|MB)\s*\d/i);
    expect(text).not.toMatch(/[$£€]\s*\d/);
  });

  /** covers: AC-10. Headings run h1, h2, h3 with no level skipped. */
  it("never skips a heading level", () => {
    const { container } = render(<SecurityPage />);

    const levels = [...container.querySelectorAll("h1, h2, h3, h4, h5, h6")].map(
      (heading) => Number(heading.tagName.slice(1)),
    );
    expect(levels[0]).toBe(1);
    for (const [index, level] of levels.entries()) {
      if (index > 0) expect(level).toBeLessThanOrEqual((levels[index - 1] ?? 1) + 1);
    }
  });

  /** covers: AC-10 */
  it("passes axe", async () => {
    const { container } = render(<SecurityPage />);

    await expectNoAxeViolations(container);
  });
});
