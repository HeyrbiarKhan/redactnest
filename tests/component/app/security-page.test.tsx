/**
 * The security page, as rendered. Spec 0018, AC-1 and AC-3 to AC-10.
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

    // AC-6's list: C1 to C5, C7 to C9, C10, C14 to C16, the review duty, and
    // the finds and strips band with its note.
    expect(new Set(hrefs)).toEqual(
      new Set([
        `/privacy#${sectionId("yourDocuments")}`,
        `/privacy#${sectionId("whatWeDoNotDo")}`,
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
   * covers: AC-7. Every limit and fact AC-7 names, one phrase each, grouped by
   * its AC-7 line and found in that line's section, so an edit that drops or
   * moves one fails here. The phrases are the page's own words at a buyer's
   * level (AC-5's breadth), never a detector's exact case.
   */
  it.each([
    // Your document stays in your browser (specs 0001 and 0002).
    ["inYourBrowser", "no server of ours takes part in reading your document"],
    ["inYourBrowser", "MuPDF built for the browser, runs inside that worker"],
    ["inYourBrowser", "Leaving the page, closing the tab or pressing Start over stops"],
    ["inYourBrowser", "nothing in the page can reach the first document"],
    ["inYourBrowser", "its memory is only released for reuse"],
    ["inYourBrowser", "The cleaned copy waits in the page only until you download it"],
    ["inYourBrowser", "keeps a handle to the file you chose"],
    ["inYourBrowser", "swap or page files"],
    // Removed, not just covered, and The check on every file (spec 0004).
    ["removedNotCovered", "removed, then marked"],
    ["removedNotCovered", "a little past the item’s edges"],
    ["removedNotCovered", "further out than that can stay visible"],
    ["removedNotCovered", "a change in the engine’s defaults cannot quietly change"],
    ["removedNotCovered", "a ticked item MuPDF cannot remove stops the run"],
    ["theCheck", "from the exact bytes you will download"],
    ["theCheck", "every character wholly inside it that you did not tick"],
    ["theCheck", "a character crossing the page’s edge can go with what lies outside it"],
    ["theCheck", "can escape both the blanking and this check"],
    ["theCheck", "If any part fails, you get no file"],
    ["theCheck", "a file the check could not vouch for"],
    // Hidden data (spec 0004).
    ["hiddenData", "hidden data RedactNest strips whenever a file carries it"],
    ["hiddenData", "automatic actions that are not scripts"],
    ["hiddenData", "its links and its accessibility tags"],
    ["hiddenData", "can keep that icon as a mark on the page"],
    ["hiddenData", "the cleaned copy carries no restriction"],
    ["hiddenData", "which characters the document used"],
    // What it finds (specs 0005 and 0017).
    ["whatItFinds", "kinds of detail the home page lists"],
    ["whatItFinds", "does not look for names or postal addresses"],
    ["whatItFinds", "you can add those as custom terms"],
    ["whatItFinds", "A row’s starting tick is a suggestion"],
    ["whatItFinds", "any row except one RedactNest can tell, while reading, that it"],
    ["whatItFinds", "never a pattern or a wildcard"],
    ["whatItFinds", "line breaks, but not all"],
    // What it can miss (specs 0005, 0014, 0015 and 0017).
    ["whatItCanMiss", "broken up across lines, columns, table cells or pages"],
    ["whatItCanMiss", "joined to other letters, digits or words"],
    ["whatItCanMiss", "a format, language or script RedactNest does not read"],
    ["whatItCanMiss", "Something that is not sensitive can be listed"],
    ["whatItCanMiss", "or a term broken up across pages"],
    ["whatItCanMiss", "two card numbers side by side can share one row"],
    ["whatItCanMiss", "look over the whole document"],
    // Pages it can't fully read (specs 0004, 0006, 0008 and 0010).
    ["pagesItCannotRead", "does not read words that exist only as a picture"],
    ["pagesItCannotRead", "can miss a page, and can warn about one that is fine"],
    ["pagesItCannotRead", "missed or misread can stay in the picture"],
    [
      "pagesItCannotRead",
      "a picture it cannot read although recognised text lies over it",
    ],
    ["pagesItCannotRead", "beyond the page’s visible edge can stay in the file"],
    ["pagesItCannotRead", "Text a clip hides completely can stay in the file"],
    ["pagesItCannotRead", "Drawings outside the visible area can stay in the file"],
    ["pagesItCannotRead", "This search can miss hidden text"],
    // When it stops instead (specs 0004, 0005, 0006 and 0007).
    ["whenItStops", "one too damaged to open"],
    ["whenItStops", "one that needs a password"],
    ["whenItStops", "one with layers"],
    ["whenItStops", "a file in which it finds no page it can read"],
    ["whenItStops", "the row says the item will stay in the file"],
    ["whenItStops", "your ticks are kept"],
    ["whenItStops", "a row you could tick can still stop the run"],
    ["whenItStops", "some files stop every run"],
    // Plans and the page limit (specs 0001, 0012 and 0017).
    ["plans", "how the tool page learns which plan applies to you"],
    ["plans", "Pro gives you longer documents and custom terms, not a lock"],
    ["plans", "The page limit relies on honesty"],
    ["plans", "custom terms rely on honesty in the same way"],
    // Logs, counts and error reports (specs 0002, 0004 and 0016).
    ["logsAndCounts", "there is no record of your document or its words"],
    ["logsAndCounts", "thrown away inside the worker"],
    // Check it yourself (specs 0002, 0009 and 0011).
    ["checkIt", "links to the source code for the version you are using"],
    ["checkIt", "Open its developer tools, then load the tool page and redact a file"],
    ["checkIt", "the network panel lists every request the page sends"],
    ["checkIt", "please write to"],
  ] as const)("names in %s: %s", (section, phrase) => {
    render(<SecurityPage />);

    expect(sectionText(SECURITY_SECTIONS[section]).toLowerCase()).toContain(
      phrase.toLowerCase(),
    );
  });

  /**
   * covers: AC-5, held by a test. An outcome phrase that claims RedactNest
   * finds, reads, ticks or carries on in every case, matched as whole words in
   * any case. A limit is a "can" line instead. An honest sentence this catches
   * is reworded, never let through (spec 0018, *Consequences*).
   */
  it.each([
    "is found",
    "are found",
    "found whole",
    "is read",
    "are read",
    "starts ticked",
    "start ticked",
    "never stops",
  ])("never says %s", (phrase) => {
    render(<SecurityPage />);

    const words = phrase.split(" ").join("\\s+");
    expect(mainText()).not.toMatch(new RegExp(`\\b${words}\\b`, "i"));
  });

  /**
   * covers: AC-7. A replaced document's memory is released for reuse, never
   * erased, so no word says memory is wiped or erased at any point.
   */
  it("never says memory is wiped or erased", () => {
    render(<SecurityPage />);

    expect(mainText()).not.toMatch(/\b(wipe[sd]?|wiping|erase[sd]?|erasing)\b/i);
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

  /**
   * covers: AC-5. Words the first verify found claiming more than their
   * source (2026-11-14): every picture blanked and checked (spec 0004,
   * INV-15), every footnote mark refusing (spec 0014), every drawing outside
   * removed (spec 0006, AC-14), warnings that never miss (INV-9), Polar asked
   * for everyone, every wrapped email, a drawn line as the example, every box
   * changeable, every damaged file refused, every unticked character kept,
   * and a partly redacted name even on a run that removed nothing (spec 0007,
   * AC-12).
   */
  it("claims no more than its sources for pictures, markers, the trim and the plan", () => {
    render(<SecurityPage />);
    const text = mainText();

    expect(text).not.toContain("blanks any picture");
    expect(text).not.toContain("or a smaller footnote mark straight after one");
    expect(text).not.toContain("Text and drawings outside");
    expect(text).not.toContain("the tool says so for that page");
    expect(text).not.toContain("and our server asks Polar");
    expect(text).not.toContain("email address wrapped at a dot is found only");
    expect(text).not.toContain("a very thin line");
    expect(text).not.toContain("you can change every one");
    expect(text).not.toContain("a damaged one");
    expect(text).not.toContain("Text: every character you did not tick");
    // Spec 0007, AC-12: a run that removed nothing is named cleaned.
    expect(text).not.toContain("the cleaned file’s name ends in partly redacted");
    expect(text).not.toContain("Both are warned about and named partly redacted");
  });

  /**
   * covers: AC-5. Words the second verify found claiming more than the code
   * does (2026-11-14): an email wrapped after the @ found whole (spec 0005,
   * AC-4), a file name promised from what a run removed (spec 0007, AC-12, a
   * run that only trims is named cleaned), pictures never cleared (the
   * blanking clears some under a removed item), and memory said not wiped,
   * which reads as though it might be.
   */
  it("claims no more than its sources for wraps, file names, pictures and memory", () => {
    render(<SecurityPage />);
    const text = mainText();

    expect(text).not.toMatch(/is found whole/i);
    expect(text).not.toContain("If a run then removes something");
    expect(text).not.toContain("does not clear pictures");
    expect(text).not.toContain("not wiped");
  });

  /**
   * covers: AC-5. Words the third verify found claiming more than the code or
   * their sources (2026-11-14): every unticked character inside the visible
   * area kept (spec 0006, AC-16 lets one crossing the edge go), a font that
   * never shows order (an app can number a subset font's characters by first
   * use), three things checked on every page (the structure is the file's),
   * "whenever" reading as though it held for finds, a note's text gone by the
   * structure check (the rebuild drops it), missed OCR words with no warning
   * (the page's note says so), developer tools opened after the page loads
   * (they miss the requests made at load), and the page limit playing no part
   * in privacy (no source says so).
   */
  it("claims no more than its sources for the edge, fonts, the check and the network panel", () => {
    render(<SecurityPage />);
    const text = mainText();

    expect(text).not.toContain("inside each page’s visible area, every character you");
    expect(text).not.toContain("in what order");
    expect(text).not.toContain("three things on every page");
    expect(text).not.toContain("finds and strips whenever");
    expect(text).not.toContain("as the structure check holds");
    expect(text).not.toContain("stay in the picture with no warning");
    expect(text).not.toContain("developer tools on the tool page");
    expect(text).not.toContain("plays no part in keeping your document private");
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
